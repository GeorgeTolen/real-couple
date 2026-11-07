"""Командная строка: python -m app.cli import|evaluate|bench|export|validate|prod."""
import argparse
import asyncio
import json
import statistics
import subprocess
import sys
import time
from collections import defaultdict
from typing import Any

from . import asr, audio, export, ingest, jobs, judge, repo
from .config import BENCH_DIR, DATA_DIR, ROOT
from .db import connect, init_db, use_database
from .scoring import compute_totals

BENCH_MIN_ACCURACY = 95.0
BENCH_MAX_MAE = 5.0
HOLDOUT_DIR = BENCH_DIR / "holdout"
HOLDOUT_GROUP = "HOLDOUT"
BENCH_MIN_STABILITY = 98.0
DEFAULT_CHECKLIST = "freedom-default"
PROD_EXPECTED = 10


def _log(message: str, started: float | None = None) -> None:
    stamp = time.strftime("%H:%M:%S")
    suffix = f" [{time.monotonic() - started:.1f} с]" if started else ""
    print(f"{stamp} {message}{suffix}", flush=True)


def _print_result(result: dict[str, Any]) -> None:
    if result["status"] == "ok":
        flags = ("G" if result["gross"] else "-") + ("R" if result["needs_review"] else "-")
        print(
            f"  {result['conversation_id']:12s} {result['score']!s:>7} {flags} "
            f"${result['spent_usd']:.4f} {result['latency_ms'] / 1000:.1f} с",
            flush=True,
        )
    else:
        print(f"  {result['conversation_id']:12s} ОШИБКА {result.get('error')}", flush=True)


async def _evaluate(ids: list[str], checklist_id: str, version: int | None, mode: str,
                    only_missing: bool, force: bool = False) -> dict[str, Any]:
    checklist = repo.get_checklist(checklist_id, version)
    ids = jobs.select_ids(ids, checklist.id, checklist.version, only_missing)
    _log(f"К оценке диалогов: {len(ids)}, чек-лист {checklist.id} v{checklist.version}, режим {mode}")
    job_id = jobs.create_job(
        {"checklist_id": checklist.id, "version": checklist.version, "mode": mode, "source": "cli"}, len(ids)
    )
    return await jobs.run_job(
        job_id, ids, checklist.id, checklist.version, mode,
        force=force, on_result=_print_result,
    )


def cmd_import(args) -> int:
    count = asyncio.run(ingest.import_group(args.group))
    _log(f"Импортировано записей: {count}, набор {args.group}")
    return 0


def cmd_evaluate(args) -> int:
    if args.ids:
        ids = args.ids.split(",")
    elif args.group:
        ids = repo.group_conversation_ids(args.group)
    else:
        ids = repo.all_conversation_ids()
    if not ids:
        _log("Нет диалогов для оценки. Сначала выполните import.")
        return 1
    job = asyncio.run(
        _evaluate(ids, args.checklist, args.version, args.mode, args.only_missing, args.force)
    )
    _log(f"Готово: {job['done']}, ошибок: {job['errors']}, потрачено ${job['cost_usd']:.4f}")
    return 1 if job["errors"] else 0


def _bench_report(gt: dict[str, dict[str, Any]], checklist_id: str, version: int) -> dict[str, Any]:
    checklist = repo.get_checklist(checklist_id, version)
    hit = total = 0
    per_criterion: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    per_language: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    errors, maes, costs, latencies, misses = [], [], [], [], []
    for conversation_id, expected in gt.items():
        evaluation_id = repo.latest_evaluation_id(conversation_id, checklist_id, version, only_ok=True)
        if evaluation_id is None:
            errors.append(conversation_id)
            continue
        view = repo.build_view(evaluation_id)
        answers = {c["criterion_id"]: c["answer"] for c in view["original"]["criteria"]}
        language = conversation_id.split("-")[1]
        costs.append(view["cost_usd"])
        latencies.append(view["latency_ms"] / 1000)
        for criterion_id, value in expected.items():
            text = str(value)
            if text.endswith("?"):
                continue
            matched = text == answers[criterion_id]
            hit += matched
            total += 1
            per_criterion[criterion_id][0] += matched
            per_criterion[criterion_id][1] += 1
            per_language[language][0] += matched
            per_language[language][1] += 1
            if not matched:
                misses.append(f"{conversation_id}/{criterion_id}: эталон {text}, модель {answers[criterion_id]}")
        channel = repo.get_conversation(conversation_id)["channel"]
        clean = {c: str(v).rstrip("?") for c, v in expected.items()}
        reference = compute_totals(checklist, clean, channel)["total"]
        if reference is not None and view["original"]["total"] is not None:
            maes.append(abs(reference - view["original"]["total"]))
    return {
        "accuracy": 100 * hit / total if total else 0.0, "hit": hit, "total": total,
        "mae": statistics.mean(maes) if maes else None,
        "per_criterion": {k: f"{100 * a / b:.0f}% ({a}/{b})" for k, (a, b) in sorted(per_criterion.items())},
        "per_language": {k: f"{100 * a / b:.0f}% ({a}/{b})" for k, (a, b) in sorted(per_language.items())},
        "cost_per_dialog": statistics.mean(costs) if costs else None,
        "latency_per_dialog": statistics.mean(latencies) if latencies else None,
        "errors": errors, "misses": misses,
    }


def _answers_snapshot(ids: list[str], checklist_id: str, version: int) -> dict[str, dict[str, str]]:
    snapshot = {}
    for conversation_id in ids:
        evaluation_id = repo.latest_evaluation_id(conversation_id, checklist_id, version, only_ok=True)
        if evaluation_id:
            view = repo.build_view(evaluation_id)
            snapshot[conversation_id] = {c["criterion_id"]: c["answer"] for c in view["original"]["criteria"]}
    return snapshot


def _stability(snapshots: list[dict[str, dict[str, str]]]) -> dict[str, Any]:
    """Доля ответов, совпавших между соседними прогонами, и список расхождений."""
    same = total = 0
    per_criterion: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    changes = []
    for previous, current in zip(snapshots, snapshots[1:]):
        for conversation_id, answers in current.items():
            for criterion_id, answer in answers.items():
                before = previous.get(conversation_id, {}).get(criterion_id)
                matched = before == answer
                same += matched
                total += 1
                per_criterion[criterion_id][0] += matched
                per_criterion[criterion_id][1] += 1
                if not matched:
                    changes.append(f"{conversation_id}/{criterion_id}: {before} и {answer}")
    return {
        "share": 100 * same / total if total else 0.0, "same": same, "total": total,
        "per_criterion": {k: f"{100 * a / b:.0f}% ({a}/{b})" for k, (a, b) in sorted(per_criterion.items())},
        "changes": changes,
    }


def cmd_whisper(args) -> int:
    """Распознаёт записи звонков локально. Результат лежит в data/whisper и не попадает в git."""
    ids = args.ids.split(",") if args.ids else [
        cid for cid in repo.all_conversation_ids() if repo.get_conversation(cid)["audio_url"]
    ]
    failed = 0
    for conversation_id in ids:
        started = time.monotonic()
        conversation = repo.get_conversation(conversation_id)
        try:
            result = asyncio.run(asr.run_for_conversation(conversation))
            _log(
                f"{conversation_id}: {result['device']}, запись {result['duration_sec']:.0f} с, "
                f"совпало слов {result['match_ratio']:.0%}",
                started,
            )
        except (asr.AsrError, audio.AudioError) as exc:
            failed += 1
            _log(f"{conversation_id}: ОШИБКА {exc}")
    return 1 if failed else 0


def cmd_recheck_review(_args) -> int:
    """Пересчитывает флаг «На проверку» у готовых оценок по текущему правилу. Модели не вызываются."""
    changed = total = flagged = 0
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, needs_review, signals_json FROM evaluations WHERE status='ok'"
        ).fetchall()
        for row in rows:
            items = conn.execute(
                "SELECT answer, agreement, judge_answers_json FROM criterion_results WHERE evaluation_id=?",
                (row["id"],),
            ).fetchall()
            notes = json.loads(row["signals_json"] or "{}").get("notes", [])
            needs = any(any(m in note for m in judge.NOTE_MARKERS) for note in notes) or any(
                judge.item_needs_review(
                    {
                        "answer": item["answer"], "agreement": item["agreement"],
                        "judge_answers": json.loads(item["judge_answers_json"] or "{}"),
                    }
                )
                for item in items
            )
            total += 1
            flagged += int(needs)
            if needs != bool(row["needs_review"]):
                changed += 1
                conn.execute("UPDATE evaluations SET needs_review=? WHERE id=?", (int(needs), row["id"]))
    _log(f"Оценок {total}, на проверке {flagged}, изменено {changed}")
    return 0


def cmd_holdout(args) -> int:
    """Контрольный набор вне калибровки. Работает в отдельной базе data/holdout.sqlite."""
    records = json.loads((HOLDOUT_DIR / "holdout_chats.json").read_text(encoding="utf-8"))
    gt = json.loads((HOLDOUT_DIR / "gt_holdout.json").read_text(encoding="utf-8"))
    gt = {k: v for k, v in gt.items() if not k.startswith("_")}
    count = ingest.store_records(ingest.parse_records(records), HOLDOUT_GROUP)
    _log(f"Загружено диалогов: {count}")
    checklist = repo.get_checklist(args.checklist, args.version)
    job = asyncio.run(_evaluate(list(gt), checklist.id, checklist.version, args.mode, False))
    report = _bench_report(gt, checklist.id, checklist.version)
    report.update(
        spent_usd=job["cost_usd"], mode=args.mode, checklist_version=checklist.version,
        dialogs=len(gt), measured_at=time.strftime("%Y-%m-%d"),
    )
    doc = export.build_results(HOLDOUT_GROUP, checklist.id, checklist.version)
    problems = export.validate_results(doc, len(gt)) + export.check_against_data(doc, checklist)
    report["format_problems"] = problems
    answers = []
    for conversation_id in gt:
        view = repo.build_view(repo.latest_evaluation_id(conversation_id, checklist.id, checklist.version, only_ok=True))
        answers.append(
            {
                "conversation_id": conversation_id, "total": view["original"]["total"],
                "gross": view["gross_reasons"], "needs_review": view["needs_review"],
                "criteria": {
                    c["criterion_id"]: {
                        "answer": c["answer"], "expected": gt[conversation_id][c["criterion_id"]],
                        "agreement": c["agreement"], "reasoning": c["reasoning"],
                    }
                    for c in view["original"]["criteria"]
                },
            }
        )
    text = json.dumps({"report": report, "answers": answers}, ensure_ascii=False, indent=2)
    (HOLDOUT_DIR / "holdout_report.json").write_text(text, encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    _log(f"Точность {report['accuracy']:.1f}%, MAE {report['mae']}, нарушений формата {len(problems)}")
    return 0


def cmd_bench(args) -> int:
    raw = (ROOT / args.gt).read_text(encoding="utf-8")
    gt = {k: v for k, v in json.loads(raw).items() if not k.startswith("_")}
    checklist = repo.get_checklist(args.checklist, args.version)
    if not repo.all_conversation_ids():
        _log("База пуста, сначала выполните import.")
        return 1
    runs = max(1, args.repeat)
    # Повтор сравнивает настоящие ответы моделей, поэтому кеш при --repeat отключён.
    force = args.force or runs > 1
    spent = 0.0
    snapshots: list[dict[str, dict[str, str]]] = []
    for _ in range(runs):
        job = asyncio.run(_evaluate(list(gt), checklist.id, checklist.version, args.mode, False, force))
        spent += job["cost_usd"]
        snapshots.append(_answers_snapshot(list(gt), checklist.id, checklist.version))
    report = _bench_report(gt, checklist.id, checklist.version)
    report["spent_usd"] = spent
    report["mode"] = args.mode
    report["checklist_version"] = checklist.version
    report["dialogs"] = len(gt)
    report["measured_at"] = time.strftime("%Y-%m-%d")
    if runs > 1:
        report["stability"] = _stability(snapshots)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    (BENCH_DIR / f"results_{args.mode}.json").write_text(text, encoding="utf-8")
    passed = (
        report["accuracy"] >= BENCH_MIN_ACCURACY
        and report["mae"] is not None
        and report["mae"] <= BENCH_MAX_MAE
        and not report["errors"]
    )
    _log(
        f"Точность {report['accuracy']:.1f}% (порог {BENCH_MIN_ACCURACY}), "
        f"MAE {report['mae']} (порог {BENCH_MAX_MAE}): {'ПРОЙДЕНО' if passed else 'НЕ ПРОЙДЕНО'}"
    )
    if not passed:
        return 2
    if runs > 1:
        share = report["stability"]["share"]
        _log(f"Совпадение между прогонами {share:.1f}% (цель {BENCH_MIN_STABILITY})")
        if share < BENCH_MIN_STABILITY:
            return 3
    return 0


def _export(args, set_name: str, group: str) -> dict[str, Any]:
    doc = export.build_results(
        group, args.checklist, args.version, allow_partial=getattr(args, "allow_partial", False),
        limit=getattr(args, "limit", None), with_decisions=getattr(args, "with_decisions", False),
    )
    return doc


def _report_validation(problems: list[str]) -> bool:
    if problems:
        _log(f"Файл НЕ прошёл проверку, нарушений: {len(problems)}")
        for problem in problems[:30]:
            print(f"  - {problem}")
        return False
    _log("Файл прошёл проверку")
    return True


def cmd_export(args) -> int:
    group = args.group or ("DEV" if args.set == "dev" else None)
    if not group:
        _log("Для набора prod укажите --group")
        return 1
    try:
        doc = _export(args, args.set, group)
    except export.ExportError as exc:
        _log(f"Экспорт отклонён: {exc}")
        return 1
    expected = None if args.allow_partial else len(repo.group_conversation_ids(group))
    version = args.version or export.latest_exportable_version(args.checklist)
    problems = export.validate_results(doc, expected)
    if not problems:
        problems = export.check_against_data(doc, repo.get_checklist(args.checklist, version))
    if not _report_validation(problems):
        return 1
    path = export.write_results(doc, export.results_path(args.set))
    errors = sum(1 for r in doc["results"] if r["status"] == "error")
    _log(f"Записано {path}: записей {len(doc['results'])}, с ошибкой {errors}")
    return 0


def cmd_validate(args) -> int:
    path = export.results_path(args.set)
    if not path.exists():
        _log(f"Файла {path} нет")
        return 1
    doc = json.loads(path.read_text(encoding="utf-8"))
    problems = export.validate_results(doc, args.expect)
    if not problems:
        version = args.version or export.latest_exportable_version(args.checklist)
        problems = export.check_against_data(doc, repo.get_checklist(args.checklist, version))
    return 0 if _report_validation(problems) else 1


def _git(*command: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *command], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")


def cmd_prod(args) -> int:
    """Час контроля: импорт, оценка, экспорт, проверка, коммит и пуш."""
    started = time.monotonic()
    count = asyncio.run(ingest.import_group(args.group))
    _log(f"1/5 Импортировано записей: {count}", started)
    version = args.version or export.latest_exportable_version(args.checklist)
    ids = repo.group_conversation_ids(args.group)
    if args.limit:
        ids = ids[: args.limit]
    expected = args.expect if args.expect is not None else (len(ids) if args.dry_run else PROD_EXPECTED)

    job = asyncio.run(_evaluate(ids, args.checklist, version, args.mode, only_missing=True))
    if job["errors"]:
        _log(f"Ошибок: {job['errors']}, повторяю только неудавшиеся диалоги")
        job = asyncio.run(_evaluate(ids, args.checklist, version, args.mode, only_missing=True))
    _log(f"2/5 Оценка завершена, ошибок {job['errors']}, потрачено ${job['cost_usd']:.4f}", started)

    try:
        doc = export.build_results(args.group, args.checklist, version, limit=args.limit)
    except export.ExportError as exc:
        _log(f"Экспорт отклонён: {exc}")
        return 1
    _log("3/5 Результаты собраны", started)

    problems = export.validate_results(doc, expected)
    if not problems:
        problems = export.check_against_data(doc, repo.get_checklist(args.checklist, version))
    if not _report_validation(problems):
        return 1
    errors = [r["conversation_id"] for r in doc["results"] if r["status"] == "error"]
    if errors:
        _log(f"ВНИМАНИЕ: со status=error: {', '.join(errors)}")
    _log("4/5 Проверка пройдена", started)

    if args.dry_run:
        path = export.write_results(doc, DATA_DIR / "rehearsal" / "results.json")
        _log(f"5/5 Репетиция: файл {path}, коммита и пуша нет", started)
        return 0

    path = export.write_results(doc, export.results_path("prod"))
    added = _git("add", "results/prod/results.json")
    if added.returncode != 0:
        _log(f"git add не удался: {added.stderr or added.stdout}")
        return 1
    # Повторный запуск с теми же результатами не должен падать: коммитить просто нечего.
    steps = [("push", "origin", "main")]
    if _git("diff", "--cached", "--quiet", "--", "results/prod/results.json").returncode != 0:
        steps.insert(
            0,
            ("commit", "-m", f"results: control set {args.group}",
             "--", "results/prod/results.json"),
        )
    for step in steps:
        done = _git(*step)
        if done.returncode != 0:
            _log(f"git {step[0]} не удался: {done.stderr or done.stdout}")
            return 1
    head = _git("rev-parse", "--short", "HEAD").stdout.strip()
    _log(f"5/5 Запушено в main, коммит {head}, файл {path}", started)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("import")
    p.add_argument("--group", default="DEV")
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("evaluate")
    p.add_argument("--all", action="store_true")
    p.add_argument("--group")
    p.add_argument("--ids")
    p.add_argument("--mode", default="ensemble", choices=["single", "ensemble", "local"])
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--only-missing", action="store_true")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_evaluate)

    p = sub.add_parser("bench")
    p.add_argument("--gt", default="bench/gt_manual.json")
    p.add_argument("--mode", default="ensemble", choices=["single", "ensemble", "local"])
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--force", action="store_true")
    p.add_argument("--repeat", type=int, default=1)
    p.set_defaults(func=cmd_bench)

    p = sub.add_parser("recheck-review")
    p.set_defaults(func=cmd_recheck_review)

    p = sub.add_parser("holdout")
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--mode", default="ensemble", choices=["single", "ensemble", "local"])
    p.set_defaults(func=cmd_holdout)

    p = sub.add_parser("whisper")
    p.add_argument("--ids")
    p.set_defaults(func=cmd_whisper)

    p = sub.add_parser("export")
    p.add_argument("--set", required=True, choices=export.ALLOWED_SETS)
    p.add_argument("--group")
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--allow-partial", action="store_true")
    p.add_argument("--with-decisions", action="store_true")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("validate")
    p.add_argument("--set", required=True, choices=export.ALLOWED_SETS)
    p.add_argument("--expect", type=int)
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("prod")
    p.add_argument("--group", required=True)
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--mode", default="ensemble", choices=["single", "ensemble", "local"])
    p.add_argument("--limit", type=int)
    p.add_argument("--expect", type=int)
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_prod)

    args = parser.parse_args(argv)
    if args.command == "holdout":
        use_database(DATA_DIR / "holdout.sqlite")
    init_db()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
