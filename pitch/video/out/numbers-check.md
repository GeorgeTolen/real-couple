# Числа на экране и их источники

Ролик v2 (`docs/pitch/PROMPT_video_v2_3d.md`) берёт цифры только из `docs/pitch/data/*.json`, `bench/results_ensemble.json` и `docs/pitch/PITCH_analysis.md`. JSON импортируются в `src/data.ts` при сборке: если поменять файл и перерендерить, ролик обновится. В `src/data.ts` есть проверки: если чип источника пропадёт из `research.json` или число пунктов слоя согласованности изменится, сборка упадёт.

Кадры указаны глобальные, 30 fps.

| Сцена, кадры | На экране | Файл и поле |
|---|---|---|
| 2, 75-195 | Позиционный, `arXiv 2305.17926` | `research.json` → `items[id=wang].source`; название из `items[id=position].bias.name` |
| 2 | На длину, `MT-Bench 2306.05685` | `research.json` → `items[id=zheng].source`, `.bias.name` |
| 2 | Нестабильность, `Kili 2026` | `research.json` → `items[id=consistent_wrong].bias.chips` |
| 2 | Чеки 85,00 и 80,50 из одной коробки | `facts.json` → `instability.runs[0].total`, `instability.runs[1].total` |
| 2 | κ 0,80, эксперты между собой, `NVIDIA 2510.09738` | `facts.json` → `trust.human_ceiling_kappa`; `research.json` → `items[id=ceiling].source`, `.gist_ru` |
| 3, 195-285 | Парное сравнение: A · B · ничья | `PITCH_analysis.md`, раздел 1, «Правка» |
| 3 | 8 брусков, веса 10 · 15 · 20 · 20 · 15 · 15 · 5 и флаг c8 | `facts.json` → `na_example.weights`; c8 «Грубые» без веса, `model_benchmark.json` → `criteria_difficulty[id=c8]` |
| 3 | Ступени c4: 0 / 5 / 10 / 15 / 20 | `PITCH_analysis.md`, раздел 1: «порядок ступеней шкалы (20 / 15 / 10 / 5 / 0)» |
| 3 | Ступени c6: 0 / 4 / 7 / 10 | `facts.json` → `instability.scale` |
| 4, 285-405 | `en-006`, ведение диалога | `facts.json` → `instability.dialog`, `.criterion` |
| 4 | Судья A 10 · 10, Судья B 7 · 7, Арбитр 10 · 7 | `facts.json` → `instability.runs[].judge_a`, `.judge_b`, `.arbiter` |
| 4 | Итог 85,00 и 80,50 | `facts.json` → `instability.runs[].total` |
| 4 | Три карточки: кеш, арбитр обязателен, «нет сбоя с номером реплики, нет снижения» | `facts.json` → `instability.fixes` (сокращены до заголовков) |
| 4 | 95 из 96 | `bench/results_ensemble.json` → `stability.same`, `stability.total`; то же в `facts.json` → `trust.stability` |
| 4 | κ 0,96, метка «люди 0,80» | `facts.json` → `trust.kappa_holdout` (0,962, округлено до 0,96), `trust.human_ceiling_kappa` |
| 5, 405-555 | RTX 5070 Ti · 8 ГБ, бесплатно | `PITCH_analysis.md`, раздел 4.1; `journey.json` → `steps[title=Локальный режим].what` |
| 5 | Бары 83,9 / 70,1 / 66,7 / 62,1 / 61,6 и имена | `model_benchmark.json` → `models[fits_8gb_laptop=true].accuracy`, `.model` |
| 5 | 11 облачных моделей, цена и точность каждой | `model_benchmark.json` → `models[fits_8gb_laptop=false].usd_per_dialog`, `.accuracy` |
| 5 | Граница Парето | вычислена в `src/data.ts → pareto` так же, как `paretoFront()` в слайдах |
| 5 | Sol 97,7 судья B, Flash 96,2 судья A, Argon 95,4 арбитр | `model_benchmark.json` → `models[].accuracy`, `.chosen` |
| 5 | Opus 94,0, ×4 по цене | `models[claude-opus-5.5].accuracy`; 0,03361 / 0,00828 = 4,06, округлено до 4 |
| 5 | $0,021 за диалог | `facts.json` → `headline.usd_per_dialog` |
| 5 | 83 с на 10 чатов | `facts.json` → `headline.seconds_10_chats` («83 до 360», нижняя граница); `PITCH_analysis.md` раздел 4.2 |
| 6, 555-660 | Узлы конвейера и подписи | `facts.json` → `architecture.nodes[].label`, `.sub`, связи `architecture.edges` |
| 6 | Пять фактов кодом: первая реплика, пауза > 180 с, приветствие, эскалация, личность | `PITCH_analysis.md`, раздел 5.1 «Факты кодом»; `facts.json` → `architecture.nodes[id=signals].sub` |
| 6 | Токен `ru-014`, в «Баллы кодом» падает 38,13 | `facts.json` → `word_example.left.dialog`, `.total` |
| 6, 660-735 | 38,13 `p1-ru-014`, «Привет», «Понял» | `facts.json` → `word_example.left`; скриншот `docs/screens/2x/14-chat-ru-014-words.png` |
| 6 | 92,31 `p1-ru-015`, «Здравствуйте, меня зовут Дина» | `facts.json` → `word_example.right`; скриншот `docs/screens/2x/15-chat-ru-015-words.png` |
| 7, 735-825 | Судья A Gemini 3.8 Flash, Судья B GPT-6.1 Sol, Арбитр Gemini 4 Argon | `facts.json` → `architecture.nodes[id=judgeA/judgeB/arbiter].sub` |
| 8, 825-900 | 97,2% на новых чатах | `facts.json` → `headline.holdout_accuracy_pct` |
| 8 | κ 0,96 согласие с эталоном | `facts.json` → `trust.kappa_holdout` |
| 8 | 99% стабильность | `facts.json` → `headline.stability_pct` |
| 8 | $0,021 за диалог | `facts.json` → `headline.usd_per_dialog` |

## Чего в ролике нет

Проверено поиском по `src/`: нет «3%», «сотни прогонов», «два арбитра». Сцена про 2 до 3% ручной проверки удалена.
