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

from . import export, ingest, jobs, repo
from .config import BENCH_DIR, DATA_DIR, ROOT
from .db import init_db
from .scoring import compute_totals

BENCH_MIN_ACCURACY = 95.0
BENCH_MAX_MAE = 5.0
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
                    only_missing: bool, no_cache: bool = False) -> dict[str, Any]:
    checklist = repo.get_checklist(checklist_id, version)
    ids = jobs.select_ids(ids, checklist.id, checklist.version, only_missing)
    _log(f"К оценке диалогов: {len(ids)}, чек-лист {checklist.id} v{checklist.version}, режим {mode}")
    job_id = jobs.create_job(
        {"checklist_id": checklist.id, "version": checklist.version, "mode": mode, "source": "cli"}, len(ids)
    )
    return await jobs.run_job(
        job_id, ids, checklist.id, checklist.version, mode,
        use_cache=not no_cache, on_result=_print_result,
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
        _evaluate(ids, args.checklist, args.version, args.mode, args.only_missing, args.no_cache)
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


def cmd_bench(args) -> int:
    raw = (ROOT / args.gt).read_text(encoding="utf-8")
    gt = {k: v for k, v in json.loads(raw).items() if not k.startswith("_")}
    checklist = repo.get_checklist(args.checklist, args.version)
    if not repo.all_conversation_ids():
        _log("База пуста, сначала выполните import.")
        return 1
    job = asyncio.run(_evaluate(list(gt), checklist.id, checklist.version, args.mode, False, args.no_cache))
    report = _bench_report(gt, checklist.id, checklist.version)
    report["spent_usd"] = job["cost_usd"]
    report["mode"] = args.mode
    report["checklist_version"] = checklist.version
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
    return 0 if passed else 2


def _export(args, set_name: str, group: str) -> dict[str, Any]:
    doc = export.build_results(
        group, args.checklist, args.version, allow_partial=getattr(args, "allow_partial", False),
        limit=getattr(args, "limit", None),
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
    if not _report_validation(export.validate_results(doc, expected)):
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
    return 0 if _report_validation(export.validate_results(doc, args.expect)) else 1


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

    if not _report_validation(export.validate_results(doc, expected)):
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
    steps = [
        ("add", "results/prod/results.json"),
        ("commit", "-m", f"results: control set {args.group}"),
        ("push", "origin", "main"),
    ]
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
    p.add_argument("--no-cache", action="store_true")
    p.set_defaults(func=cmd_evaluate)

    p = sub.add_parser("bench")
    p.add_argument("--gt", default="bench/gt_manual.json")
    p.add_argument("--mode", default="ensemble", choices=["single", "ensemble", "local"])
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--no-cache", action="store_true")
    p.set_defaults(func=cmd_bench)

    p = sub.add_parser("export")
    p.add_argument("--set", required=True, choices=export.ALLOWED_SETS)
    p.add_argument("--group")
    p.add_argument("--checklist", default=DEFAULT_CHECKLIST)
    p.add_argument("--version", type=int)
    p.add_argument("--allow-partial", action="store_true")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("validate")
    p.add_argument("--set", required=True, choices=export.ALLOWED_SETS)
    p.add_argument("--expect", type=int)
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
    init_db()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
