"""Детерминированные факты о диалоге. Это подсказки судье, а не вердикт."""
import re
from typing import Any

from .normalize import HIDDEN_NAME, extract_operator_name

GREETINGS = {
    "formal": [
        "здравствуйте", "добрый день", "добрый вечер", "доброе утро", "приветствую",
        "сәлеметсіз", "қайырлы күн", "қайырлы таң", "қайырлы кеш", "армысыз",
        "hello", "good morning", "good afternoon", "good evening", "greetings", "hi",
    ],
    "informal": ["привет", "сәлем", "hey"],
}
ESCALATION = ["эскалация", "операторға жіберілді", "transferred to an agent", "агент присоединился"]
CLOSURE = ["закрыл чат", "жапты", "closed the chat", "покинул чат", "шықты", "left the chat",
           "прервано", "үзілді", "disconnected", "завершил разговор", "ended the"]
IDENTITY = ["личность клиента подтверждена", "тұлғасы расталды", "identity confirmed", "identity verified"]
OPERATOR_PAUSE_SEC = 60
FIRST_REACTION_SEC = 180


def _contains(text: str, needles: list[str]) -> bool:
    low = text.lower()
    return any(n in low for n in needles)


def _greeting(text: str) -> tuple[bool, bool]:
    low = text.lower()

    def has_word(word: str) -> bool:
        return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", low) is not None

    formal = any(has_word(w) for w in GREETINGS["formal"])
    informal = any(has_word(w) for w in GREETINGS["informal"])
    return formal, informal


def compute_signals(turns: list[dict], audio: dict[str, Any] | None = None) -> dict[str, Any]:
    operator = [t for t in turns if t["speaker"] == "operator"]
    first = operator[0] if operator else None
    escalation = next(
        (t for t in turns if t["speaker"] == "system" and _contains(t["text"], ESCALATION)), None
    )

    pauses, previous = [], None
    for turn in turns:
        if turn["speaker"] == "operator" and previous is not None:
            gap = (turn["t_sec"] or 0) - (previous["t_sec"] or 0)
            if gap > OPERATOR_PAUSE_SEC and previous["speaker"] == "client":
                pauses.append({"n": turn["n"], "sec": round(gap)})
        if turn["speaker"] in ("operator", "client"):
            previous = turn

    formal, informal = _greeting(first["text"]) if first else (False, False)
    signals: dict[str, Any] = {
        "operator_present": bool(first),
        "first_operator_n": first["n"] if first else None,
        "bot_before_operator": any(
            t["speaker"] == "bot" and (not first or t["idx"] < first["idx"]) for t in turns
        ),
        "escalation_n": escalation["n"] if escalation else None,
        "escalation_to_operator_sec": (
            round((first["t_sec"] or 0) - (escalation["t_sec"] or 0))
            if first and escalation
            else None
        ),
        "operator_pauses_over_60s": pauses,
        "operator_pauses_over_180s": [p for p in pauses if p["sec"] > FIRST_REACTION_SEC],
        "last_turn_n": turns[-1]["n"] if turns else None,
        "last_turn_speaker": turns[-1]["speaker"] if turns else None,
        "last_operator_n": operator[-1]["n"] if operator else None,
        "closure_events": [
            {"n": t["n"], "text": t["text"]}
            for t in turns
            if t["speaker"] == "system" and _contains(t["text"], CLOSURE)
        ],
        "identity_confirmed_n": [
            t["n"] for t in turns if t["speaker"] == "system" and _contains(t["text"], IDENTITY)
        ],
        "first_reply_formal_greeting": formal,
        "first_reply_informal_greeting": informal,
        "first_reply_has_name": bool(first)
        and (HIDDEN_NAME in first["text"] or bool(extract_operator_name([first]))),
    }
    if audio:
        signals["speech_metrics"] = audio
    return signals


def _yes_no(value: bool) -> str:
    return "да" if value else "нет"


def signals_to_text(signals: dict[str, Any]) -> str:
    if not signals["operator_present"]:
        return "- Оператор в диалоге не писал."
    lines = [
        f"- Первая реплика оператора: #{signals['first_operator_n']}. "
        f"Формальное приветствие: {_yes_no(signals['first_reply_formal_greeting'])}. "
        f"Фамильярное приветствие: {_yes_no(signals['first_reply_informal_greeting'])}. "
        f"Похоже, что назвал имя: {_yes_no(signals['first_reply_has_name'])}.",
        f"- Бот отвечал до оператора: {_yes_no(signals['bot_before_operator'])}.",
    ]
    if signals["escalation_to_operator_sec"] is not None:
        lines.append(
            f"- От эскалации (#{signals['escalation_n']}) до первой реплики оператора: "
            f"{signals['escalation_to_operator_sec']} с."
        )
    pauses = signals["operator_pauses_over_60s"]
    if pauses:
        listed = ", ".join(f"перед #{p['n']}: {p['sec']} с" for p in pauses)
        lines.append(f"- Ответ оператора после реплики клиента дольше 60 с: {listed}.")
    else:
        lines.append("- Ответов оператора дольше 60 с после реплики клиента нет.")
    lines.append(
        f"- Последняя реплика диалога: #{signals['last_turn_n']}, автор {signals['last_turn_speaker']}. "
        f"Последняя реплика оператора: #{signals['last_operator_n']}."
    )
    for event in signals["closure_events"]:
        lines.append(f"- Системное событие завершения #{event['n']}: {event['text']}")
    if signals["identity_confirmed_n"]:
        listed = ", ".join(f"#{n}" for n in signals["identity_confirmed_n"])
        lines.append(f"- Системное подтверждение личности клиента: {listed}.")
    else:
        lines.append("- Системного подтверждения личности клиента в диалоге нет.")
    metrics = signals.get("speech_metrics")
    if metrics:
        lines.append(f"- Метрики речи оператора: {metrics.get('summary', '')}")
    return "\n".join(lines)
