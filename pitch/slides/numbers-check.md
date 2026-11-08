# Сверка чисел

Каждое число на слайдах и в заметках → файл и поле. Пути от `docs/pitch/data/`. Числа в коде не набраны вручную: `src/slides.ts` импортирует JSON и подставляет значения при сборке. Исключения отмечены «текст»: число взято из текстового поля того же файла.

## 2. Каждый диалог, а не 3%

| На слайде | Значение | Файл и поле |
|---|---|---|
| 3% в заголовке, «2–3%», 3 подсвеченные точки из 100 | 2–3 | `research.json` → `items[id=coverage].gist_ru` (текст: «лишь 2 до 3% звонков») |
| 100% | 100 | `research.json` → `items[id=coverage].applied` (текст: «Автооценка 100% диалогов») |
| $0,021 в подписи | 0.021 | `research.json` → `items[id=coverage].applied`; совпадает с `facts.json` → `headline.usd_per_dialog` |
| 8 критериев | 8 | `model_benchmark.json` → `criteria_difficulty` (8 записей, c1…c8) |
| Октагон p1-ru-009, итог 46,00 | снимок | `docs/screens/2x/c02-octagon-ru-009.png` |

## 3. На чём мы стоим

Каждая карточка: вырезка (`items[].clip`: сайт или arXiv, название, автор, место в тексте) и цитата (`items[].quote`). Все четыре цитаты сверены с оригиналами 08.11.2026.

| На слайде | Файл и поле | Где в оригинале |
|---|---|---|
| “Explicit step-by-step analysis required before the model emits the verdict field.” | `research.json` → `items[id=cot].quote` (11 слов) | arxiv.org/html/2604.23178, раздел 3.3, стратегия S5 |
| arXiv:2604.23178v2, Judging the Judges…, Sadman Kabir Soumik | `items[id=cot].clip` | шапка статьи, v2 от 24.06.2026 |
| “cross-validate with a second model from a different provider” | `items[id=panel].quote` (9 слов) | openlayer.com, раздел о смещениях |
| openlayer.com, 30.03.2026 | `items[id=panel].clip` | дата публикации |
| “consistent and wrong” | `items[id=consistent_wrong].quote` (3 слова) | kili-technology.com, «the judge is consistent and wrong» |
| kili-technology.com, 16.10.2026, «541,000» в названии | `items[id=consistent_wrong].clip` | заголовок статьи |
| “scoring reliability degrades in factual and knowledge-intensive settings” | `items[id=facts].quote` (8 слов) | alphaxiv.org/abs/2602.08672, аннотация |
| arXiv:2602.08672, Learning to Judge…, Siro, Aliannejadi, Aliannejadi | `items[id=facts].clip` | шапка статьи |

Исправление 08.11.2026: прежняя цитата первой карточки «Ask for the reasoning first, then the verdict» взята из блога Grepture, в самой статье её нет. Теперь в карточке формулировка статьи. Там же поправлен `gist_ru`: в статье прирост +11,5 п.п. (Claude, S8), а +11,2 было из пересказа Grepture. Пояснение лежит в `items[id=cot].note`.

Решения под цитатами пересказывают `items[].applied` своими словами, чисел в них нет. `npm run check` сверяет каждую цитату на собранной странице с `quote` побуквенно.

## 4. Модель выбрали турниром

| На слайде | Значение | Файл и поле |
|---|---|---|
| 16 точек, «16 моделей» | 16 | `model_benchmark.json` → `models` (длина) |
| Ось Y, положение точек | accuracy | `models[].accuracy` |
| Ось X, положение точек | $ за диалог | `models[].usd_per_dialog` |
| Граница Парето (лестница с заливкой) | расчёт | по `accuracy` и `usd_per_dialog`: модели, у которых нет более дешёвой и не менее точной; между ними точность держится до следующей модели |
| Судья B GPT-6.1 Sol 97,7 | 97.7 | `models[model=openai/gpt-6.1-sol].accuracy`, роль `chosen=judge_B` |
| Судья A Gemini 3.8 Flash 96,2 | 96.2 | `models[model=google/gemini-3.8-flash].accuracy`, `chosen=judge_A` |
| Арбитр Gemini 4 Argon 95,4 | 95.4 | `models[model=google/gemini-4-argon].accuracy`, `chosen=arbiter` |
| Локально Gemma 4 26B-A4B 83,9 | 83.9 | `models[model=google/gemma-4-26b-a4b-it].accuracy`, `chosen=local_mode` |
| «Дороже всех» Claude Opus 5.5, $0,03361, 94,0 | 94.0, 0.03361 | `models[model=anthropic/claude-opus-5.5].accuracy`, `.usd_per_dialog` (максимум цены среди 16) |
| Топ-5: Всего | 97,7 / 96,2 / 95,4 / 95,4 / 94,0 | `models[].accuracy`, сортировка по убыванию |
| Топ-5: KZ | 95 / 100 / 100 / 95 / 100 | `models[].kz` |
| 12 DEV-чатов: 6 RU, 3 KZ, 3 EN | 12, 6, 3, 3 | `model_benchmark.json` → `_about` (текст) |
| Подписи оси X: $0,0002, $0,001, $0,005, $0,02 | деления шкалы | не данные, отметки логарифмической оси |

## 5. Два судьи и арбитр

| На слайде | Файл и поле |
|---|---|
| 12 узлов, подписи и подзаголовки | `facts.json` → `architecture.nodes[].label`, `.sub` |
| Стрелки | `facts.json` → `architecture.edges` |
| «SLA 3 мин» | `architecture.nodes[id=signals].sub` (текст) |
| Модели судей и арбитра | `architecture.nodes[id=judgeA|judgeB|arbiter].sub` |
| Зоны «Готовит код», «Оценивают модели», «Итог считает код» | группировка узлов: LLM только в `judgeA`, `judgeB`, `arbiter` |
| Токен `ru-020` и плашка «p1-ru-020 92,31» на «Баллы кодом» | `facts.json` → `na_example.dialog`, `na_example.total` |

## 6. Где решается точность

| На слайде | Значение | Файл и поле |
|---|---|---|
| Бары c1…c8 в порядке кодов, затем по убыванию | 88,2 / 72,6 / 99,4 / 72,4 / 83,0 / 77,4 / 71,2 / 95,2 | `model_benchmark.json` → `criteria_difficulty[].id`, `.name`, `.accuracy_all_models` |
| «трудно» у трёх самых низких | c7 71,2, c4 72,4, c2 72,6 | три минимума `criteria_difficulty[].accuracy_all_models` |
| c7: «только прощание = Нет», трактовка Freedom | текст | `journey.json` → `steps[title=Официальные трактовки].what` (фраза проверяется при сборке) |
| c2: «клиент сразу всё сказал = N/A», трактовка Freedom | текст | там же |
| c4: «Хуже всего модели оценивают фактическую правильность», GER-Eval | текст | `research.json` → `items[id=facts].gist_ru` |
| «все 16 моделей» | 16 | `models` (длина) |

Пример N/A переехал на слайд 9.

## 7. Что мы подкрутили

| На слайде | Значение | Файл и поле |
|---|---|---|
| Шкала 00:00–01:40, точки по реальному времени | | `journey.json` → `steps[].t` (08.11) |
| 00:09, 85,00 → 80,50, p1-en-006 | 85.0, 80.5 | `journey.json` → `steps[title=Пилот нашёл нестабильность].t`, `.metric.before`, `.metric.after`, `.what` |
| 00:30, правило и кеш | | `steps[title=Исправление стабильности].t`, `.what` |
| 00:50, версия 4: 5,07 | 5.07 | `steps[title=Калибровка подсказок].metric.v4_mae` |
| 00:50, версия 5: 98,85%, ошибка итога 3,78 | 98.85, 3.78 | `steps[title=Калибровка подсказок].metric.v5_accuracy`, `.v5_mae` |
| «три правила для Консультации» | 3 | `steps[title=Калибровка подсказок].what` (текст) |
| 01:30, 28 → 1 | 28, 1 | `steps[title=Тише флаги, чище данные].metric.review_before`, `.review_after` |
| «Из 65 диалогов DEV» | 65 | `facts.json` → `headline.dialogs_dev` |

## 8. Демо

| На слайде | Источник |
|---|---|
| Порядок 1–5, `p1-ru-009` | `docs/pitch/PROMPT_slides.md`, раздел 4 |
| Экраны в окне | `docs/screens/2x/06-gross.png`, `02-chat-ru-009-identification.png` (шаги 2 и 3), `08-checklists.png`, `11-map-operators.png` |

## 9. Результат на новых данных

| На слайде | Значение | Файл и поле |
|---|---|---|
| 97,2%, «точность на 10 новых чатах» | 97.2 | `facts.json` → `headline.holdout_accuracy_pct`; 10 из `headline.holdout_note` |
| 71 квадрат, 69 зелёных, «69 из 71 ответов, эталон до прогона» | 69, 71 | `headline.holdout_note` (числа извлекаются при сборке) |
| 4,30, «ошибка итога на них же», отметка на шкале 0–10 | 4.30 | `headline.holdout_mae_points` (шкала 0–10 это деления, не данные) |
| 99%, полоса | 99.0 | `headline.stability_pct` |
| $0,021 и Claude Opus 5.5 $0,03361, длина полос пропорциональна | 0.021, 0.03361 | `headline.usd_per_dialog`; `model_benchmark.json` → `models[model=anthropic/claude-opus-5.5].usd_per_dialog` |
| Роза весов p1-ru-020: секторы 10, 15, 20, 20, 15, 15, 5 | веса | `facts.json` → `na_example.dialog`, `.weights` |
| Заливка сектора: «Да» и «20 из 20», «10 из 10» полностью, «Нет» пусто, N/A серый | ответы | `na_example.answers` |
| Итог 60 → 92,31 (одометр) | 60.0, 92.31 | `na_example.if_na_were_zero`, `na_example.total` |
| «Вес «Потребность» и «Идентификация» делят остальные» | названия | `na_example.answers` со значением N/A |
| 65 диалогов DEV, RU KZ EN, 96 из 96 тестов | 65, 96 | `headline.dialogs_dev`, `.languages`, `.tests_backend` |

## 10. Что сделали сами

Подписи сжимают пункты `facts.json` → `ours`: [0] бенчмарк, [1] судьи и арбитр, [2] критерий без кода, [3] правило, [5] эталон до прогона, [7] звонки. Число «16» из [0], совпадает с длиной `models`.

## 11. Что дальше

| На слайде | Источник |
|---|---|
| Три направления | `docs/pitch/PROMPT_slides.md`, раздел 4 |
| QR и адрес | `https://github.com/GeorgeTolen/real-couple` (`src/data.ts` → `REPO_URL`, `scripts/qr.mjs`) |

## Резерв

| Слайд | На слайде | Файл и поле |
|---|---|---|
| R1 | Снимок звонка p4-ru-001 | `docs/screens/2x/05-call-p4-ru-001.png` |
| R1 | Подписи (дорожки по транскрипту, метрики речи, маски, Whisper) | `facts.json` → `ours[7]`; надписи на снимке |
| R2 | Столбцы 83,9 / 70,1 / 66,7 / 62,1 / 61,6 | `model_benchmark.json` → `models[fits_8gb_laptop=true].accuracy` |
| R2 | «облачный лидер 97,7» | максимум `models[].accuracy` |
| R2 | «8 ГБ видеопамяти» | `models[].fits_8gb_laptop`; `journey.json` → `steps[title=Локальный режим].what` |
| R2 | «Тот же код, судья Gemma 4 26B-A4B через Ollama» | `facts.json` → `architecture.local_mode` |
| R2 | 83,9%, «найдено 11 из 12», $0,00036 | `models[model=google/gemma-4-26b-a4b-it].accuracy`, `.gross_found`, `.usd_per_dialog` |
| R3 | Вся таблица | `models[]`: `accuracy`, `ru`, `kz`, `en`, `gross_found`, `mae_total`, `usd_per_dialog`, `sec_per_dialog`, `open_weights`, `chosen` |
| R4 | 98,9% на 12 диалогах | `facts.json` → `headline.calibration_accuracy_pct`; 12 из `model_benchmark.json` → `_about` |
| R4 | Ограничения (чаты писал автор, Docker, локальная модель, Linux) | `docs/status-report.md`, разделы 4 и 6 |

## Числа в заметках докладчика

| Заметка | Число | Файл и поле |
|---|---|---|
| 2 | два-три процента, восемь критериев | `research.json` → `items[id=coverage].gist_ru`; `criteria_difficulty` |
| 4 | двенадцать диалогов, три языка, шестнадцать моделей | `model_benchmark.json` → `_about`, `models` |
| 6 | около семидесяти процентов | `criteria_difficulty[id=c7|c4|c2].accuracy_all_models` (71,2, 72,4 и 72,6) |
| 7 | 85 и 80,5; 98,85; 1 вместо 28 | `journey.json` → шаги выше |
| 9 | 97,2; десять чатов; 99; два цента; 92,31 и 60 | `facts.json` → `headline.holdout_accuracy_pct`, `.holdout_note`, `.stability_pct`, `.usd_per_dialog` (0,021), `na_example.total`, `.if_na_were_zero` |
| R2 | 8 ГБ; 83,9 и 97,7 | см. R2 выше |
| R4 | 98,9 | `headline.calibration_accuracy_pct` |
