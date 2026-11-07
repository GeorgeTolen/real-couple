from app.audio import add_audio_time, extract_source_url, transcript_metrics
from app.normalize import extract_operator_name, normalize_transcript, render_for_prompt
from app.signals import compute_signals


def test_chat_time_and_numbering():
    turns = normalize_transcript(
        [
            {"timestamp": "00:02", "speaker": "client", "text": "Вопрос"},
            {"timestamp": "01:51", "speaker": "operator", "text": "Ответ"},
        ]
    )
    assert [t["n"] for t in turns] == [1, 2]
    assert turns[1]["t_sec"] == 111
    assert turns[1]["timestamp"] == "01:51"


def test_call_time_is_relative_and_source_is_preserved():
    source = "2026-11-03T15:49:13.1900670+00:00"
    turns = normalize_transcript(
        [
            {"timestamp": source, "speaker": "system", "text": "Старт"},
            {"timestamp": "2026-11-03T15:50:13.1900670+00:00", "speaker": "operator", "text": "Да"},
        ]
    )
    assert turns[0]["t_sec"] == 0
    assert turns[1]["t_sec"] == 60
    assert turns[0]["timestamp"] == source


def test_all_dev_timestamps_parse(dev_records):
    for record in dev_records:
        turns = normalize_transcript(record["transcript"])
        assert all(t["t_sec"] is not None for t in turns), record["conversation_id"]
        assert turns[-1]["n"] == len(record["transcript"])


def test_prompt_uses_one_based_numbers():
    turns = normalize_transcript([{"timestamp": "00:05", "speaker": "client", "text": "Привет"}])
    assert "[#1] 00:05 client: Привет" in render_for_prompt("x", "agent chat", "RU", turns)


def _operator_says(text):
    return normalize_transcript([{"timestamp": "00:01", "speaker": "operator", "text": text}])


def test_operator_name_in_three_languages():
    assert extract_operator_name(_operator_says("Здравствуйте, я Руслан. Чем помочь?")) == "Руслан"
    assert extract_operator_name(_operator_says("Сәлеметсіз бе, мен Айданамын.")) == "Айдана"
    assert extract_operator_name(_operator_says("Hi, I'm Anna. How can I help?")) == "Anna"
    assert extract_operator_name(_operator_says("Open settings then log in.")) is None


def test_hidden_name_counts_as_introduction():
    signals = compute_signals(_operator_says("Здравствуйте, меня зовут [Имя скрыто], чем могу помочь?"))
    assert signals["first_reply_has_name"] is True
    assert signals["first_reply_formal_greeting"] is True


def test_kazakh_formal_greeting_is_not_informal():
    signals = compute_signals(_operator_says("Сәлеметсіз бе, мен Айданамын."))
    assert signals["first_reply_formal_greeting"] is True
    assert signals["first_reply_informal_greeting"] is False
    assert compute_signals(_operator_says("Сәлем. Қай сайт?"))["first_reply_informal_greeting"] is True


def test_signals_on_real_structure():
    turns = normalize_transcript(
        [
            {"timestamp": "00:00", "speaker": "client", "text": "Вопрос"},
            {"timestamp": "00:02", "speaker": "bot", "text": "Ожидайте"},
            {"timestamp": "00:10", "speaker": "system", "text": "Эскалация на оператора."},
            {"timestamp": "01:10", "speaker": "operator", "text": "Здравствуйте, я Егор."},
            {"timestamp": "01:20", "speaker": "client", "text": "Ещё вопрос"},
            {"timestamp": "05:00", "speaker": "operator", "text": "Отвечаю"},
            {"timestamp": "05:10", "speaker": "system", "text": "Личность клиента подтверждена."},
            {"timestamp": "05:20", "speaker": "system", "text": "Оператор закрыл чат."},
        ]
    )
    signals = compute_signals(turns)
    assert signals["first_operator_n"] == 4
    assert signals["bot_before_operator"] is True
    assert signals["escalation_to_operator_sec"] == 60
    assert signals["operator_pauses_over_180s"] == [{"n": 6, "sec": 220}]
    assert signals["identity_confirmed_n"] == [7]
    assert signals["closure_events"][0]["n"] == 8


def test_audio_time_skips_recording_pause():
    turns = normalize_transcript(
        [
            {"timestamp": "00:10", "speaker": "system", "text": "Запись и транскрибирование приостановлены."},
            {"timestamp": "00:30", "speaker": "system", "text": "Запись и транскрибирование возобновлены."},
            {"timestamp": "00:40", "speaker": "operator", "text": "Да"},
        ]
    )
    assert add_audio_time(turns)[2]["t_audio"] == 20


def test_source_url_is_unescaped():
    page = '<audio><source src="https://x.example/a.mp3?sp=r&amp;sig=abc" type="audio/mpeg"></audio>'
    assert extract_source_url(page) == "https://x.example/a.mp3?sp=r&sig=abc"


def test_transcript_metrics_share_and_tempo():
    turns = normalize_transcript(
        [
            {"timestamp": "00:00", "speaker": "operator", "text": "один два три четыре"},
            {"timestamp": "00:02", "speaker": "client", "text": "ага понятно"},
            {"timestamp": "00:04", "speaker": "operator", "text": "хорошо"},
        ]
    )
    metrics = transcript_metrics(turns)
    assert metrics["operator_share_pct"] == 71
    assert metrics["tempo_wpm"] == 120
