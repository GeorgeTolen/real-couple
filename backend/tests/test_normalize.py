from app.audio import add_audio_time, extract_source_url, tempo_without_silence, transcript_metrics
from app.asr import align_words_to_turns
from app.normalize import extract_operator_name, mark_duplicates, normalize_transcript, render_for_prompt
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


def test_all_sample_timestamps_parse(sample_records):
    for record in sample_records:
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
    assert extract_operator_name(_operator_says("Здравствуйте! Меня зовут Алина. Откройте меню.")) == "Алина"
    assert extract_operator_name(_operator_says("Добрый день! Я Лера из поддержки.")) == "Лера"
    assert extract_operator_name(_operator_says("Сәлеметсіз бе, менің атым Аружан.")) == "Аружан"
    assert extract_operator_name(_operator_says("Я посмотрел ваш счёт.")) is None


def test_hidden_name_counts_as_introduction():
    signals = compute_signals(_operator_says("Здравствуйте, меня зовут [Имя скрыто], чем могу помочь?"))
    assert signals["first_reply_has_name"] is True
    assert signals["first_reply_formal_greeting"] is True
    assert extract_operator_name(_operator_says("Меня зовут [Имя скрыто].")) == "Имя скрыто"


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


def test_audio_time_counts_from_recording_start():
    turns = normalize_transcript(
        [
            {"timestamp": "00:00", "speaker": "system", "text": "Агент присоединился."},
            {"timestamp": "00:30", "speaker": "system", "text": "Запись и транскрибирование запущены."},
            {"timestamp": "01:00", "speaker": "operator", "text": "Да"},
        ]
    )
    assert add_audio_time(turns)[2]["t_audio"] == 30


def test_tempo_excludes_silence_from_recording():
    turns = normalize_transcript(
        [
            {"timestamp": "00:00", "speaker": "operator", "text": "один два три четыре"},
            {"timestamp": "00:04", "speaker": "client", "text": "да"},
        ]
    )
    assert tempo_without_silence(turns, [{"start": 2.0, "duration": 2.0}]) == 120


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


def _call(*rows):
    return mark_duplicates(
        add_audio_time(
            normalize_transcript(
                [{"timestamp": ts, "speaker": who, "text": text} for ts, who, text in rows]
            )
        )
    )


def test_duplicates_are_marked_without_renumbering():
    turns = _call(
        ("00:10", "client", "Я хотела спросить."),
        ("00:10", "client", "Я хотела спросить."),
        ("00:30", "client", "Я хотела спросить."),
        ("00:31", "operator", "Я хотела спросить."),
    )
    assert [t["n"] for t in turns] == [1, 2, 3, 4]
    assert [t["duplicate_of"] for t in turns] == [None, 1, None, None]
    prompt = render_for_prompt("x", "voice call", "RU", turns)
    assert "[#2] 00:10 client: (дубль #1)" in prompt
    assert "[#3] 00:30 client: Я хотела спросить." in prompt


def test_duplicates_do_not_inflate_speech_metrics():
    base = [("00:00", "operator", "один два"), ("00:02", "client", "да да да")]
    clean = transcript_metrics(_call(*base))
    doubled = transcript_metrics(_call(base[0], base[1], ("00:02", "client", "да да да")))
    assert doubled["operator_share_pct"] == clean["operator_share_pct"]


def test_whisper_words_follow_organizer_turns():
    turns = _call(
        ("00:00", "operator", "Здравствуйте меня зовут [Имя скрыто] чем помочь"),
        ("00:05", "client", "Хочу вывести деньги"),
        ("00:05", "client", "Хочу вывести деньги"),
        ("00:09", "operator", "Откройте раздел вывод"),
    )
    spoken = "Здравствуйте, меня зовут Мирас, чем помочь? Хочу вывести деньги. Откройте раздел вывод."
    words = [{"word": w, "start": i * 0.9, "end": i * 0.9 + 0.5} for i, w in enumerate(spoken.split())]
    text, ratio = align_words_to_turns(turns, words)
    assert "Мирас" not in text[1]
    assert "[Имя скрыто]" in text[1] and text[1].startswith("Здравствуйте")
    assert text[2] == "Хочу вывести деньги."
    assert 3 not in text
    assert text[4].startswith("Откройте")
    assert ratio > 0.8


def test_whisper_empty_input_is_safe():
    turns = _call(("00:00", "operator", "Да"))
    assert align_words_to_turns(turns, []) == ({}, 0.0)


def test_whisper_distorted_short_turn_is_placed_by_time():
    turns = _call(
        ("00:00", "client", "Как вас зовут"),
        ("00:04", "operator", "Пирас"),
        ("00:08", "client", "Я не услышала"),
    )
    words = [
        {"word": w, "start": start, "end": start + 0.4}
        for w, start in [("Как", 0.1), ("вас", 0.5), ("зовут", 0.9), ("Мирас", 4.1), ("Я", 8.1), ("не", 8.4), ("услышала", 8.7)]
    ]
    text, _ = align_words_to_turns(turns, words)
    assert text[1] == "Как вас зовут"
    assert text[2] == "[Скрыто]"
    assert text[3] == "Я не услышала"


def test_whisper_hides_everything_under_full_mask():
    turns = _call(
        ("00:00", "client", "Добрый день"),
        ("00:03", "client", "[Персональные данные скрыты]"),
        ("00:08", "client", "Хочу узнать про счёт"),
    )
    spoken = "Добрый день меня зовут татьяна иванова номер 123456 Хочу узнать про счёт"
    words = [{"word": w, "start": i * 1.0, "end": i + 0.5} for i, w in enumerate(spoken.split())]
    text, _ = align_words_to_turns(turns, words)
    joined = " ".join(text.values())
    assert "татьяна" not in joined and "123456" not in joined
    assert text[2] == "[Персональные данные скрыты]"


def test_whisper_hides_digits_and_names_outside_masks():
    turns = _call(("00:00", "operator", "Откройте раздел вывод пожалуйста"))
    spoken = "Откройте раздел Айгуль вывод 8707 пожалуйста Freedom"
    words = [{"word": w, "start": i * 1.0, "end": i + 0.5} for i, w in enumerate(spoken.split())]
    text, _ = align_words_to_turns(turns, words)
    assert "Айгуль" not in text[1] and "8707" not in text[1]
    assert "Freedom" in text[1] and "[Скрыто]" in text[1]
