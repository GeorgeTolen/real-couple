"""Мини-бенчмарк моделей OpenRouter на DEV-диалогах CQA.
Запуск: python3 -I bench/run_bench.py <out.jsonl> <model1,model2,...> <conv1,conv2,...> [effort]
"""
import json, os, sys, time, urllib.request, concurrent.futures as cf, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = dict(l.strip().split("=", 1) for l in open(ROOT / ".env") if "=" in l)["OPENROUTER_API_KEY"]
RECS = {r["conversation_id"]: r for r in json.load(open(ROOT / "data/dev.json"))["data"]["records"]}

CHECKLIST = """ЧЕК-ЛИСТ (оценивается ТОЛЬКО работа оператора; реплики bot и system — контекст).
c1 Установление контакта (ДА/НЕТ): ДА — оператор поздоровался на языке клиента И представился (назвал имя) в первом ответе.
c2 Выявление потребности (ДА/НЕТ/NA): ДА — оператор учёл известные из переписки детали (включая сказанное боту) и уточнил недостающее до ответа. НЕТ — переспросил уже известное или ответил, не уточнив необходимое. NA — данных для ответа хватало с самого начала, уточнять было нечего.
c3 Идентификация (ДА/НЕТ/NA): ДА — проверка личности подтверждена в чате до раскрытия данных счёта или защищённого действия. НЕТ — данные счёта раскрыты / защищённое действие выполнено без подтверждённой идентификации. NA — запрос не требовал идентификации (общий вопрос, данные не раскрывались).
c4 Корректная и полная консультация (20/15/10/5/0/NA): 20 — все существенные вопросы закрыты или дан корректный следующий шаг; 15 — основной вопрос решён, пропущена второстепенная деталь; 10 — часть запроса закрыта, существенный вопрос остался открытым; 5 — есть общая подсказка, но клиенту всё ещё непонятно, как действовать; 0 — ответа по существу нет или ключевая рекомендация ошибочна. NA — чат закончился до того, как клиент сформулировал запрос.
c5 Эмпатия и клиентоориентированность (ДА/НЕТ): ДА — оператор вежлив и, если клиент выразил недовольство или описал неудобство, отреагировал на конкретную проблему.
c6 Управление диалогом, скорость и грамотность (10/7/4/0): 10 — ответы ясные и связные, при явном ожидании оператор предупредил; 7 — один заметный сбой, но клиент может понять и продолжить; 4 — клиенту приходится переспрашивать из-за формулировок или порядка ответов; 0 — из-за бессвязных или противоречивых реплик ход диалога непонятен.
c7 Завершение (ДА/НЕТ/NA): ДА — оператор подвёл итог или предложил дальнейшую помощь и попрощался. NA — чат оборвался до возможности его завершить.
c8 Грубые ошибки (ДА/НЕТ): ДА — оскорбление клиента, предложение платной услуги в обход компании (перевести деньги лично, личный номер для платной консультации — достаточно самого предложения) или раскрытие конфиденциальной информации. НЕТ — ничего из этого.
"""

SYSTEM = ("Ты — эксперт отдела контроля качества (QA) Freedom Broker. Оцениваешь работу оператора поддержки строго по чек-листу. "
          "Диалоги бывают на русском, казахском и английском — правила одинаковы. Опирайся только на текст транскрипта, ссылайся на номера реплик [#N]. "
          "Для каждого критерия сначала укажи доказательства и рассуждение, затем вердикт. Отвечай JSON по схеме.\n\n" + CHECKLIST)

def crit_schema(values):
    return {"type": "object", "additionalProperties": False,
            "required": ["evidence_ids", "reasoning", "answer"],
            "properties": {"evidence_ids": {"type": "array", "items": {"type": "integer"}},
                           "reasoning": {"type": "string"},
                           "answer": {"type": "string", "enum": values}}}

SCHEMA = {"type": "object", "additionalProperties": False,
          "required": [f"c{i}" for i in range(1, 9)],
          "properties": {"c1": crit_schema(["Y", "N"]), "c2": crit_schema(["Y", "N", "NA"]),
                         "c3": crit_schema(["Y", "N", "NA"]), "c4": crit_schema(["20", "15", "10", "5", "0", "NA"]),
                         "c5": crit_schema(["Y", "N"]), "c6": crit_schema(["10", "7", "4", "0"]),
                         "c7": crit_schema(["Y", "N", "NA"]), "c8": crit_schema(["Y", "N"])}}

def render(rec):
    lines = [f"conversation_id: {rec['conversation_id']} | канал: {rec['channel']} | язык: {rec['language']}"]
    for i, t in enumerate(rec["transcript"]):
        lines.append(f"[#{i}] {t['timestamp']} {t['speaker']}: {t['text']}")
    return "\n".join(lines)

def call(model, cid, effort):
    body = {"model": model,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": "Оцени диалог:\n\n" + render(RECS[cid])}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "qa_eval", "strict": True, "schema": SCHEMA}},
            "temperature": 0, "max_tokens": 16000, "usage": {"include": True}}
    if effort:
        body["reasoning"] = {"effort": effort}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
                                          "X-Title": "CQA hackathon bench"})
    t0 = time.time(); out = {"model": model, "cid": cid, "effort": effort}
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.load(r)
            msg = resp["choices"][0]["message"]["content"]
            txt = msg.strip()
            if txt.startswith("```"):
                txt = txt.strip("`").split("\n", 1)[1].rsplit("```", 1)[0] if "\n" in txt else txt
            out.update(ok=True, result=json.loads(txt), usage=resp.get("usage", {}), latency=round(time.time() - t0, 1))
            return out
        except Exception as e:
            err = getattr(e, "read", lambda: b"")()
            out.update(ok=False, error=f"{type(e).__name__}: {e} {err[:300]!r}")
            time.sleep(3)
    out["latency"] = round(time.time() - t0, 1)
    return out

if __name__ == "__main__":
    outp, models, cids = sys.argv[1], sys.argv[2].split(","), sys.argv[3].split(",")
    effort = sys.argv[4] if len(sys.argv) > 4 else None
    jobs = [(m, c) for m in models for c in cids]
    with cf.ThreadPoolExecutor(16) as ex, open(outp, "a") as f:
        for res in ex.map(lambda mc: call(mc[0], mc[1], effort), jobs):
            f.write(json.dumps(res, ensure_ascii=False) + "\n"); f.flush()
            u = res.get("usage", {})
            print(res["model"], res["cid"], "OK" if res.get("ok") else res.get("error", "")[:200], res.get("latency"), u.get("cost"), flush=True)
