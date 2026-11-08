# Сверка чисел (версия 4, под текст выступления)

Каждое число на слайдах и в заметках ведущего → файл и поле. Пути от `docs/pitch/data/`, кроме `bench/…` и `docs/screens/…`. Числа в коде не набраны вручную: `src/slides.ts` импортирует JSON через `src/data.ts` и подставляет значения при сборке. «Текст» означает, что число взято из текстового поля того же файла. Заметки ведущего это дословный текст сценария из `docs/pitch/PROMPT_slides_v4_script.md`; числа в нём сверены с теми же полями.

`npm run check` дополнительно пересчитывает блок `facts.json` → `trust` из `bench/holdout/holdout_report.json` и `bench/results_ensemble.json` (каппа 0,962, 71 и 9, 78 из 80, 95 из 96, c4 7 из 7, KZ 21 из 21) и падает при расхождении. Там же проверка ширины скриншотов 08 и 09 и запрещённых формулировок («сотни прогонов», «без предвзятости», «два арбитра», «3%»).

## 01. CQA (без изменений)

| На слайде | Файл и поле |
|---|---|
| Бегущая строка c1…c8 | `model_benchmark.json` → `criteria_difficulty[].id`, `.name` |

## 02. LLM-судья предвзят. Это измерено

| На слайде | Значение | Файл и поле |
|---|---|---|
| Позиционный: строка карточки | | `research.json` → `items[id=position].bias.line` |
| Чипы Wang, arXiv 2305.17926; EMNLP 2026 | | `items[id=wang].source`, `items[id=position].source` |
| На длину: строка карточки | | `items[id=zheng].bias.line` |
| Чипы MT-Bench, arXiv 2306.05685 | | `items[id=zheng].source` |
| Нестабильность, «стабильно, но неверно», Kili 2026 | | `items[id=consistent_wrong]` (`quote`, `source`) |
| Потолок людей: «κ ≈ 0,80» в карточке | 0,80 | `items[id=ceiling].bias.line` (текст) |
| Герой κ 0,80, «эксперты между собой» | 0.8 | `facts.json` → `trust.human_ceiling_kappa`; источник `items[id=ceiling].source` (NVIDIA, arXiv 2510.09738) |

## 03. Стабильно. Честно.

| На слайде | Значение | Файл и поле |
|---|---|---|
| 8 критериев | 8 | `model_benchmark.json` → `criteria_difficulty.length` |
| Веса 10 · 15 · 20 · 20 · 15 · 15 · 5 | | `facts.json` → `na_example.weights`; совпадает с `checklists/freedom_default.json` → `criteria[].weight` |
| c8 «флаг» | | у `Грубые` нет веса в `na_example.weights`; в `checklists/freedom_default.json` у c8 вес 0, это контрольный флаг |
| Коды c1…c8 и подписи | | `criteria_difficulty[].id`, `.name` |
| Ширина плашки | 8 px за 1 балл веса | `RUB_PX` в `src/slides.ts`, флаг 96 px |

## 04. 85,00 → 80,50 на одном и том же чате

| На слайде | Значение | Файл и поле |
|---|---|---|
| p1-en-006, «Ведение диалога», шкала 10 / 7 / 4 / 0 | | `facts.json` → `instability.dialog`, `.criterion`, `.scale` |
| Судья A 10 и 10, Судья B 7 и 7 | | `instability.runs[0..1].judge_a`, `.judge_b` |
| Арбитр 10 и 7 | | `instability.runs[0..1].arbiter` |
| Итог 85,00 и 80,50 | 85.0, 80.5 | `instability.runs[0..1].total`; также `journey.json` шаг 08.11 00:09 |
| Разброс 4,5 балла (заметки) | 85,00 − 80,50 | те же поля |
| Три пункта слоя «Проверка согласованности» | | `instability.fixes[0..2]` |
| 95 из 96 | | `trust.stability` = `bench/results_ensemble.json` → `stability.same`, `.total` |
| κ 0,96 на 10 новых чатах | 0.962 → 0,96 | `trust.kappa_holdout`, `trust.holdout_dialogs`; пересчёт в `npm run check` |
| Метка 0,80 «люди между собой» | 0.8 | `trust.human_ceiling_kappa` |

## 05. RTX 5070 Ti, 8 ГБ, бесплатно

Пять моделей: `model_benchmark.json` → `models[fits_8gb_laptop=true]`, по убыванию `accuracy`.

| Модель | Точность | RU / KZ / EN | Поле |
|---|---|---|---|
| Gemma 4 26B-A4B | 83,9 | 88 / 81 / 78 | `accuracy`, `ru`, `kz`, `en`; `chosen = local_mode` |
| gpt-oss-20b | 70,1 | 70 / 71 / 70 | то же |
| Granite 4.2 8B | 66,7 | 63 / 62 / 78 | то же |
| Ministral 8B | 62,1 | 67 / 52 / 61 | то же |
| Qwen 3.5 9B | 61,6 | 50 / 76 / 69 | то же |
| «84% для режима без интернета» | 83,9 → 84 | `models[chosen=local_mode].accuracy`, округление half-up (`fmt`) |

RTX 5070 Ti и 8 ГБ: `journey.json` шаг 07.11 15:50 (текст).

## 06. Облако: цена и точность

| На слайде | Значение | Файл и поле |
|---|---|---|
| 16 моделей, 12 размеченных чатов | 16, 12 | `models.length`; `model_benchmark.json` → `_about` (текст) |
| 11 облачных на графике | 11 | `models[fits_8gb_laptop=false]` |
| Точки: цена × точность | | `models[].usd_per_dialog`, `.accuracy` |
| Граница Парето | GLM-5.3 Flash, GPT-6 Luna, DeepSeek V4.1 Flash, GPT-6.1 Terra, GPT-6.1 Sol | вычисляется из тех же полей (`paretoFront`) |
| Судья B GPT-6.1 Sol 97,7 | | `models[chosen=judge_B].accuracy` |
| Судья A Gemini 3.8 Flash 96,2 | | `models[chosen=judge_A].accuracy` |
| Арбитр Gemini 4 Argon 95,4 | | `models[chosen=arbiter].accuracy` |
| Claude Opus 5.5 94,0, «×4 по цене» | 0,03361 / 0,00828 = 4,06 → 4 | `models[model=anthropic/claude-opus-5.5]`, деление на цену Sol |
| GPT-6.1 Terra 95,4, «та же семья, что Sol» | | `models[model=openai/gpt-6.1-terra]`; причина: `PITCH_analysis.md`, раздел 4.2 |
| $0,021 за диалог | 0.021 | `facts.json` → `headline.usd_per_dialog` (`bench/results_ensemble.json` → `cost_per_dialog` 0,0207) |
| 83 с на 10 чатов, лучший прогон | 83 | `headline.seconds_10_chats` = «83 до 360»: на слайде нижняя граница с пометкой «лучший прогон» |

## 07. Не «скормили LLM»: конвейер

| На слайде | Значение | Файл и поле |
|---|---|---|
| Узлы и подписи | 12 | `facts.json` → `architecture.nodes[].label`, `.sub` |
| Стрелки | 14 | `architecture.edges` |
| Токен `ru-014` | | `word_example.left.dialog` без префикса `p1-` |
| Флаг «пауза > 180 с» | 3 мин × 60 | `architecture.nodes[id=signals].sub` («SLA 3 мин»); `checklists/freedom_default.json` → `general_rules` («Порог первой реакции 3 минуты») |
| Остальные флаги | | `PITCH_analysis.md`, раздел 5.1 (что считает `backend/app/signals.py`) |
| Балл в «Баллы кодом»: p1-ru-014 38,13 | 38.13 | `word_example.left.total` |

## 08. Пример ru-014

Скриншот `docs/screens/2x/14-chat-ru-014-words.png` (1810×912) целиком, на холсте 1600 px. Выноски поверх, сам файл не изменён. Координаты фраз и строк критериев измерены по пикселям скриншота и записаны в `SHOT014` в `src/slides.ts`.

| Выноска | Реплики | Критерий на скриншоте | Источник вердикта |
|---|---|---|---|
| Контакт: Нет, флаг неформального приветствия | #10 | «Установление контакта: Нет» | `word_example.left.verdicts[0]`; флаг `informal_greeting`: `PITCH_analysis.md`, раздел 5.3 |
| Потребность: Нет, Ведение: 7 | #5 → #10 | «Выявление потребности: Нет», «Ведение диалога: 7» | `verdicts[1]` (Ведение 7); Потребность Нет: `PITCH_analysis.md`, раздел 5.3, и сам скриншот |
| Эмпатия: Нет | #11 → #12 | «Эмпатия: Нет» | `verdicts[2]` |
| Завершение: Нет | #14 | «Завершение: Нет» | `PITCH_analysis.md`, раздел 5.3, и скриншот |
| Герой 38,13 | | заголовок скриншота | `word_example.left.total` |

## 09. Пример ru-015

Скриншот `docs/screens/2x/15-chat-ru-015-words.png` (1905×990) целиком, на холсте 1600 px. Координаты в `SHOT015`.

| Выноска | Реплики | Критерий на скриншоте | Источник вердикта |
|---|---|---|---|
| Контакт: Да | #10 | «Установление контакта: Да» | `word_example.right.verdicts[0]` |
| Завершение: Да | #12 | «Завершение: Да» | `PITCH_analysis.md`, раздел 5.3, и скриншот |
| Консультация: 15 из 20 (цвет `--mid`) | #11 → #12 | «Консультация: 15 / 20» | `word_example.right.verdicts[1]` |
| Герой 92,31 | | заголовок скриншота | `word_example.right.total` |
| 38,13 рядом на последнем шаге | | | `word_example.left.total` |
| «разница 54 балла» | 92,31 − 38,13 = 54,18 → 54 | | те же поля, `Math.round` |

## 10. Два судьи и арбитр

| На слайде | Значение | Файл и поле |
|---|---|---|
| Судья A Gemini 3.8 Flash, KZ 100% | 100 | `models[chosen=judge_A].kz` |
| Судья B GPT-6.1 Sol, EN 100%, грубые 12/12 | 100, 12/12 | `models[chosen=judge_B].en`, `.gross_found` |
| Арбитр Gemini 4 Argon, на контроле 2 из 80 | 2, 80 | `trust.arbitrated`; 80 из `trust.judge_agreement` («78 из 80») |
| «баллы считает код: N/A перераспределяет вес, округление half-up» | | `architecture.nodes[id=score].sub`; half-up: `PITCH_analysis.md`, раздел 5.2 |
| 97,2% (69 из 71) | 97.2 | `headline.holdout_accuracy_pct`; 69 и 71 из `headline.holdout_note` (`bench/holdout/holdout_report.json` → `report.hit`, `.total`) |
| Ошибка 4,30 | 4.3 | `headline.holdout_mae_points` (`report.mae` 4,298) |
| Стабильность 99% (95 из 96) | 99.0 | `headline.stability_pct`, `trust.stability` |
| $0,021 | 0.021 | `headline.usd_per_dialog` |
| Кнопка «Живое демо» | `http://localhost:8000/#/` | `DEMO_URL` в `src/data.ts` |
| QR | | `REPO_URL` в `src/data.ts`, матрица `src/assets/qr.json` (`scripts/qr.mjs`) |

## Резерв

| Слайд | На слайде | Файл и поле |
|---|---|---|
| R1 Все 16 моделей | все столбцы таблицы | `model_benchmark.json` → `models[]` |
| R2 Звонок и Whisper | дубли ASR, маски, локальный Whisper | `facts.json` → `ours[7]`; скриншот `docs/screens/2x/05-call-p4-ru-001.png` |
| R3 N/A на ru-020 | 60 → 92,31; 65 и 60; ответы и веса | `na_example.if_na_were_zero`, `.total`, `.applicable_weight`, `.earned`, `.answers`, `.weights`; скриншот `docs/screens/2x/c03-octagon-ru-020.png` |
| R4 Ограничения | 10 чатов, 71 и 9 | `trust.holdout_dialogs`, `.confident_items`, `.disputed_items` |
| | c2 75%, 6 из 8 | `trust.c2_holdout_pct`, `.c2_holdout` |
| | Freedom «на ваше усмотрение», читаем буквально, 44 из 65 | `limits.closure_freedom_answer`, `.closure_our_reading`, `.closure_rule_dependent` (перенесено из `PITCH_analysis.md`, раздел 6) |
| R5 Апелляции и чек-лист | подписи | `architecture.nodes[id=appeal].sub`, `facts.ours[2]`; скриншоты `07-appeals.png`, `08-checklists.png` |

## Числа в заметках ведущего

| В тексте | Где на слайде | Источник |
|---|---|---|
| каппа около 0,80 (02, 04) | 02, 04 | `trust.human_ceiling_kappa` |
| 8 критериев (03) | 03 | `criteria_difficulty.length` |
| 85,00, 80,50, 4,5 балла, 10 и 7 (04) | 04 | `instability.runs` |
| 95 из 96, каппа 0,96, 10 новых чатов (04) | 04 | `trust.stability`, `trust.kappa_holdout`, `trust.holdout_dialogs` |
| 8 ГБ, топ-5: 83,9 · 70,1 · 66,7 · 62,1 · 61,6 (05) | 05 | `models[fits_8gb_laptop=true].accuracy` |
| 16 моделей, 12 чатов; 97,7 · 96,2 · 95,4; Opus 94, в 4 раза дороже (06) | 06 | `models[]` |
| $0,021, 10 чатов за 83 секунды (06) | 06 | `headline.usd_per_dialog`, `headline.seconds_10_chats` (нижняя граница) |
| паузы больше 180 секунд (07) | 07 | `architecture.nodes[id=signals].sub` |
| 38,13 (08), 92,31 (09) | 08, 09 | `word_example.left.total`, `word_example.right.total` |
