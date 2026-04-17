# Журнал изменений (changes)

## 2026-04-17 (v0.9.7.6) 🔁 Воспроизведение: сессия прогона и устойчивый resume

- **Проблема:** после навигации / перезагрузки контента / смены origin прогресс воспроизведения мог откатываться (низкий `actionIndex` при уже пройденных шагах), в логах — `STEP_PROGRESS_UPDATE` с `resuming` и рассинхрон с фактическим шагом.
- **`playbackSessionId`:**
  - Генерируется/прокидывается при запуске теста и передаётся в **`PLAY_TEST`**, сохранении состояния (**`SAVE_PLAYBACK_STATE`**, в т.ч. `pagehide`) и в цепочке **resume** (`checkResumePlayback` → `resumePlayback`, **`RESUME_TEST`**).
  - В **`content/player-core.js`**: `playTest(test, mode, playbackSessionId)` сохраняет сессию на старте прогона; при resume передаётся сохранённый идентификатор.
- **Background (`background/background.js`, `background/background-sw.js`, `background/message-handlers.js`, `background/message-handlers-sw.js`):**
  - Слияние **`SAVE_PLAYBACK_STATE`**: не перезаписывать прогресс устаревшим или частичным сообщением — для одного теста учитывается **`Math.max`** по **`actionIndex`** (и согласованность с **`playbackSessionId`** там, где применимо).
  - **`PLAY_TEST`** и связанные сценарии (группа / data-driven при наличии) выравнены по передаче **`playbackSessionId`**.
- **Content:**
  - **`content/player-handlers-form.js`**: `PLAY_TEST` → `playTest(..., message.playbackSessionId)`; **`RESUME_TEST`** подхватывает **`runMode`**, **`runHistory`**, **`playbackSessionId`** из `testState`, а не захардкоженный только `optimized`.
  - **`content/player-handlers-extended.js`**: выравнивание **`savePlaybackState`** / **`resumePlayback`** с полем сессии в payload.

- **Версия:** `manifest.json` **0.9.7.6**; обновлены `changes.md`, `versions.txt`.

## 2026-04-15 (v0.9.7.5) 🔧 Стабилизация recording/replay на разных стендах

- **Recording: устойчивая доставка шагов при перезапуске service worker**
  - В `content/recorder.js` добавлена очередь отложенных действий `pendingActionQueue` для `ADD_ACTION`.
  - Реализованы многократные retry с backoff (`sendAddActionWithRetries`) и автоматический flush очереди.
  - Перед остановкой записи выполняется принудительный flush очереди, чтобы минимизировать потерю шагов.
  - Для действий добавлен `_clientActionId`, чтобы безопасно переотправлять шаги.

- **Background: защита от дублей переотправленных шагов**
  - В `background/message-handlers.js` и `background/message-handlers-sw.js` добавлена дедупликация по `_clientActionId`.
  - При повторном получении того же шага возвращается `success: true` без повторного добавления в тест.
  - Кеш id действий очищается по FIFO (ограничение размера), чтобы не разрастался в долгих сессиях.

- **Replay: исправление ложных падений `Replay target validation failed`**
  - В `content/player-core.js` fallback-ветка `tryAlternativeSelectors` теперь фиксирует `replay evidence` (`setReplayFindEvidence`) при успешном fallback-поиске.
  - Добавлен мягкий режим для отсутствующего evidence: `strictReplayTargetRequireEvidence = false` (шаг не падает, если сам успешно выполнен).
  - Сохранены строгие проверки `target-mismatch` и `target-weak-match` при наличии evidence.

- **Fallback для хрупких селекторов на другой системе**
  - В `content/player-handlers-extended.js` добавлен универсальный fallback для простых class-only селекторов (например `.big-button`):
    - выбор единственного видимого кандидата;
    - при нескольких — выбор по совпадению `action.element.text`.

## 2026-04-14 (v0.9.7.5) ✅ Строгая автоматизация записи + strict replay validation

- **Запись без ручного участия:**
  - В `content/recorder.js` добавлен строгий pre-save gate:
    - `sanitizeActionForRecording(...)`
    - `validateActionForRecording(...)`
    - `prepareActionForRecording(...)`
  - Невалидные/шумные шаги автоматически **не сохраняются** (тип/подтип/селекторный контракт, hard-errors валидации селектора, быстрые дубли и throttle-клики).
  - Принудительно включен авто-режим записи (`forceAutoRecordingMode`), режим выбора селектора (picker) отключается для минимизации ручных действий.

- **Оповещения во время записи (live):**
  - Добавлены runtime-уведомления в `content/recorder.js`:
    - предупреждение при пропуске шага,
    - ошибка при сбое сохранения шага,
    - throttling уведомлений, чтобы не спамить пользователя.
  - Добавлена runtime-статистика записи: `saved/skipped/failed`.

- **Защитная валидация на входе background:**
  - В `background/message-handlers.js` добавлен defensive ingress-gate для `ADD_ACTION`:
    - `normalizeActionTypeForIngress(...)`
    - `validateIncomingRecordedAction(...)`
    - отклонение некорректного payload с явными `error/details`.
  - Аналогичная логика синхронизирована в `background/message-handlers-sw.js`.
  - Дополнительно усилена `cleanDuplicateActions` в `background/background.js` и `background/background-sw.js`:
    - удаление лишнего первичного `click` по dropdown, если сразу после него идет `input/change` с `isDropdownSelection/dropdownAutoFilled`,
    - сравнение не только по `targetKey`, но и по совпадающему селектору (фикс кейса `#SELECTED_ACCOUNT`).

- **Strict replay target validation:**
  - В `content/player-core.js` добавлены:
    - `strictReplayTargetValidation`,
    - `setReplayFindEvidence(...)`,
    - `getReplayTargetValidation(...)` и проверки совпадения цели (`tag/id/class/text`) для selector-dependent шагов.
  - Шаг replay теперь не считается успешным без target proof; результат проверки пишется в `runHistory.steps[].validation.replayTarget`.
  - В `content/player-handlers-extended.js` `findElementWithRetry(...)` возвращает/передает расширенный proof (`source`, `attempt`, `selectorType`, `usedSelector`), включая fallback-пути.

- **Задачи и процесс:**
  - Обновлены `tasks/todo.md` (чеклист + review по записи и replay).
  - Обновлены `tasks/lessons.md` (правила после пользовательских корректировок).

- **Проверки:**
  - Пройдены `node --check` для:
    - `content/recorder.js`
    - `background/message-handlers.js`
    - `background/message-handlers-sw.js`
    - `content/player-core.js`
    - `content/player-handlers-extended.js`
  - По `ReadLints` для измененных файлов — ошибок нет.

- **Проверка JSON-сценариев из `Controller/json`:**
  - Контрактная валидация шагов (тип/селектор) — без ошибок.
  - Полный E2E replay всех шагов ограничен внешними факторами:
    - часть шагов ведет на `chrome-extension://...` (требуется активный контекст расширения),
    - часть URL требует авторизации (CAS/login).

## 2026-04-13 (v0.9.7.5) 🛑 Запись: без автозаполнения полей

- **Версия:** `manifest.json` **0.9.7.5**; обновлены `changes.md`, `versions.txt`.
- **Исправление режима записи:** убрано программное заполнение dropdown/combobox при детекте значения в `recorder`.
- **Ожидаемое поведение:** в режиме записи фиксируются только действия и ввод пользователя; визуальных автозаполнений/автовводов как при воспроизведении больше нет.
- **Файл:** `content/recorder.js`.

## 2026-04-02 (v0.9.7.4) 🎬 Воспроизведение: закрытие вкладки и шаг NAVIGATE

- **Версия:** `manifest.json` **0.9.7.4**; обновлены `changes.md`, `versions.txt`.
- **Закрытие вкладки во время прогона:** в фоне ведётся `playbackTabId`; при `tabs.onRemoved` для этой вкладки — сброс состояния воспроизведения, очистка `playbackState`, рассылка `TEST_COMPLETED` (ошибка «Вкладка воспроизведения закрыта») и сброс прогресса в popup.
- **Шаг навигации:** перед `location.replace` ожидается ответ на `TEST_STEP_COMPLETED`, чтобы сообщение успело дойти до выгрузки страницы.
- **Файлы:** `background/background-sw.js`, `background/background.js`, `background/message-handlers-sw.js`, `background/message-handlers.js`, `content/player-handlers-extended.js`.
- **Артефакт:** `.\scripts\build-release.ps1` → `dist/autotest-recorder-0.9.7.4.zip`.

## 2026-04-01 (v0.9.7.3) ⚡ Popup: быстрый список тестов

- **Версия:** `manifest.json` **0.9.7.3**; обновлены `changes.md`, `versions.txt`.
- **Список тестов в popup:** отрисовка из `chrome.storage.local` до ответа service worker (`paintTestsFromStorage`, общий разбор с fallback); затем синхронизация через `GET_TESTS` с более короткими ретраями; если список уже показан из storage и фон не ответил — оставляем данные из storage без экрана ошибки.
- **Init popup:** ранний показ списка сразу после настроек/проверки автотестов (до длинной привязки обработчиков); в конце — `Promise.all` для `applyTierVisibility`, `loadState`, `loadTests`; проверки тарифа по `[data-access-action]` — параллельные `CHECK_ACCESS`.
- **Рефакторинг:** `TESTS_STORAGE_KEYS`, `applyTestsPayloadFromStored`, переиспользование в fallback.
- **Артефакт:** `.\scripts\build-release.ps1` → `dist/autotest-recorder-0.9.7.3.zip`.

## 2026-04-01 (v0.9.7.2) 📦 Data-driven, визуальная регрессия (lite), онбординг

- **Версия:** `manifest.json` **0.9.7.2**; журналы и README обновлены.
- **Data-driven (CSV/таблицы):** прогон теста по строкам CSV с подстановкой в контекст переменных группы (лимит строк для превью); фоновая очередь и событие завершения с сводкой по строкам; в редакторе — модалка, кнопка запуска, тост по итогу.
- **Экспорт отчёта data-driven:** кнопки выгрузки CSV (pass/fail по строкам, UTF‑8 BOM); отчёт привязан к текущему тесту; позже может быть ограничен Premium.
- **Visual regression lite:** эталоны в **`test.extensionAssets.visualRegressionBaselines`** (перенос с JSON теста); плеер читает сначала из теста, затем legacy `chrome.storage`; сообщение **`MERGE_TEST_EXTENSION_ASSETS`**; при **`UPDATE_TEST`** из редактора **`extensionAssets` сливается** с уже сохранённым тестом, чтобы не затирать эталоны после прогона; экспорт/импорт JSON через `editor-metadata` (импорт в будущем сможет опционально отбрасывать assets).
- **Онбординг:** мастер первого запуска в popup + шаблоны; в **настройках** — **«Показать снова»** (сброс `onboardingWizardV1CompletedAt` в `chrome.storage.local`).
- **Feature flags:** заготовки **`DATA_DRIVEN_BULK`**, **`VISUAL_REGRESSION_LITE`** (`fallbackEnabled: true` для превью до paywall).
- **Файлы (ключевые):** `background/background*.js`, `background/message-handlers*.js`, `content/player-handlers-form.js`, `editor/editor-data-driven.js`, `editor/editor-core.js`, `editor/editor-metadata.js`, `editor/editor.html`, `editor/editor_ru.html`, `popup/popup-onboarding.js` (и связанные popup), `settings/settings*.html`, `settings/settings.js`, `i18n/en.json`, `i18n/ru.json`.
- **Артефакт:** `.\scripts\build-release.ps1` → `dist/autotest-recorder-0.9.7.2.zip`.

## 2026-03-30 (v0.9.7.1) 📦 Сборка GitHub после аудита исходников

- **Версия:** `manifest.json` **0.9.7.1**; журналы и README обновлены.
- **Содержание:** нейтральные формулировки в changelog; плеер — `getAppSelectNestedOpenTarget` вместо глобального селектора; поиск FormControl по предкам; `.gitignore`, исключение `temp_kr2` в `build-release.ps1`, удалены временные/лог-файлы с чувствительными данными.
- **Артефакт:** `.\scripts\build-release.ps1` → `dist/autotest-recorder-0.9.7.1.zip`.

## 2026-03-29 (v0.9.7.0) 📦 Релиз GitHub: описание для версии сверх Chrome Web Store

- **Назначение:** единая номерная сборка для [репозитория](https://github.com/yurgus25/autotest_recorder/) и GitHub Releases; в **CHANGELOG.md** / **CHANGELOG_EN.md** — краткое описание нового относительно опубликованной в CWS версии.
- **Содержание релиза (обобщение):** запись и воспроизведение кастомных dropdown (Angular `app-select`, CDK overlay, разделение Wicket-меню и combobox), стабильные селекторы `elementid`, расширенный плеер (`player-handlers-extended.js`), XPath→CSS fallback, квота storage, исправление списков инжекта SW, анализатор селекторов — выбор вкладки, удаление отладочных fetch из плеера.
- **Сборка zip:** `.\scripts\build-release.ps1` → `dist/autotest-recorder-0.9.7.0.zip`.

## 2026-03-27 (v0.9.6.18) 🎯 Angular `app-select`: шаг «ввод» в список с селектором `.form-input app-select`

- **Сценарий:** выбор значения в списке записан с селектором **`.form-input app-select`** (легко цепляет не тот `app-select` на странице), хотя в атрибутах есть **`elementid="…"`** (стабильный признак).
- **Исправление:** в **`generateAllSelectors`** до UniqueSelectorLite добавлены **`app-select[elementid="…"]`** (и вариант с **`label`**, приоритет выше 0.4). Повторный блок `angular-component` для app-select понижен с 2.5 до **0.09**, атрибуты через **`escapeSelector`**.

## 2026-03-27 (v0.9.6.17) 🎯 Регрессия: нет шага выбора в `app-select` (форма с несколькими шагами)

- **Сценарий:** только клики по `.select-box` / стрелке, без `input`+`dropdownAutoFilled` после выбора опции.
- **Причина:** для `<li>` вне `.ant-select-dropdown` сразу считали пунктом меню Wicket; опции **Angular app-select** в **CDK overlay** / **content-list** попадали под это.
- **Исправление:** если `li` в панели списка (`.cdk-overlay-pane`, `[class*="content-list"]`, ng-dropdown и т.д.) и **не** внутри `[role="menu"]` — это **не** application menu item.

## 2026-03-27 (v0.9.6.16) 🎯 Тот же «ввод», если клик по **span** внутри `<li>` (не по самому `li`)

- В экспорте по-прежнему `optionElement.tag: "li"`, но **event.target** при записи был **не** `LI`, а дочерний элемент — эвристика `tag === 'li'` не срабатывала. Исправлено: **`element.closest('li')`** и та же проверка Ant Select.

## 2026-03-27 (v0.9.6.15) 🎯 Шаг «ввод» на `#rc_select_0` при клике по `<li>` меню групповых операций (не Ant Select)

- **Факт из JSON:** шаг 3 — `input` на селекторе `#rc_select_0` (`ant-select-selection-search-input`), `value` «Очистить список выбранных», `optionElement.tag` = `li` без классов — это **меню Wicket** после кнопки с `data-toggle="dropdown"`, а не поле Ant Select.
- **Исправление:** `isApplicationMenuItem` — для `<li>` вне `.ant-select-dropdown` / `.rc-select-dropdown` считать пунктом прикладного меню; внутри панели Ant — только при признаках опции (`role="option"`, `.ant-select-item*`).

## 2026-03-27 (v0.9.6.14) 🎯 Ложный input из `resolveDropdownFill` (handleInput + pendingDropdownFill)

- Событие **input** на поле после клика по combobox вызывало **`resolveDropdownFill`** → шаг **input** с `dropdownAutoFilled`. Добавлена **`shouldRejectDropdownValueForFieldMismatch`** в начале `resolveDropdownFill`.

## 2026-03-27 (v0.9.6.13) 🎯 «Ввод» из-за polling и класса `.item` (не только эвристика опции)

- **Причина:** (1) `isDropdownElement` считал узел dropdown, если внутри был `.item` — как у пунктов меню GWT. (2) После клика по combobox запускался **polling**; при клике по пункту меню он подхватывал **текст подсвеченного пункта** как «новое значение поля» и вызывал `recordDropdownOptionSelection` → шаг **input**.
- **Исправление:** узкий селектор опций (без общего `.item`); отмена `pendingDropdownFill` при клике по `isApplicationMenuItem`; проверка `shouldRejectDropdownValueForFieldMismatch` перед записью; пункт меню в `recordDropdownOptionSelection` → `recordClickAction`.

## 2026-03-27 (v0.9.6.12) 🎯 Шаг «ввод» при клике по пункту меню (span внутри `<a>`, без role=menu)

- **Причина:** `event.target` часто был `span` внутри `<a href="#">`; эвристика срабатывала только для самого `<a>`. Плюс часть приложений не задаёт `role="menu"`, но задаёт классы Popup/gwt.
- **Исправление:** `isApplicationMenuItem()` — `closest('a[href]')`, `closest('[role="menuitem"]')`, исключение панелей mat-select/ng-select, ссылки в `[class*="gwt-"]` / Popup.

## 2026-03-27 (v0.9.6.11) 🎯 Запись клика по пункту меню (GWT-стиль), не «ввод» в чужой dropdown

- **Проблема:** Любой элемент в панели с `[class*="menu"]` ошибочно считался опцией combobox; `findParentDropdownForOption` находил ближайший `mat-select`/`ng-select` на странице и записывал шаг **input** с текстом пункта («Очистить список выбранных») — при воспроизведении значение не выбиралось.
- **Исправление:** `content/recorder.js` — `isApplicationMenuItem()` (ARIA `role="menu"`/`menuitem`, классы gwt-Menu/gwt-MenuItem, ссылки в меню) исключаются из `isDropdownOption` и из поиска родительского combobox.
- **Очистка:** удалены отладочные `fetch` на localhost из `content/player-handlers-form.js`.

## 2026-03-13 (v0.9.6.8) 🔧 Селекторы, XPath, воспроизведение, квота

### XPath → CSS: расширенная поддержка
- ✅ **Любой тег с @id:** Поддержка не только `//div[@id='X']/path`, но и `//section[@id='about']/path`, `//*[@id='...']/path`
- ✅ **Длинные пути с кастомными элементами:** Конвертация путей вида `app-main-form/div/div[2]/app-select/div/div/div/i` в CSS с `>` и `:nth-of-type(n)`
- ✅ **Метод _xpathIdPathToCssFallback** в `content/selector-engine.js`: один общий fallback для всех XPath вида `//tag[@id='value']/path`; перебор вариантов: `#id > path`, `#id path`, `[id="id"] path`, `[id^="id"] path`
- ✅ **findElementSync:** При неудаче XPath вызывается _xpathIdPathToCssFallback (в `case 'xpath'` и в `default`)
- ✅ **Альтернативные fallback в плеере:** В `content/player-handlers-extended.js` (_tryAlternativeSelectorsFallbacks) вызов `selectorEngine._xpathIdPathToCssFallback(selectorStr)` для любого селектора вида `//tag[@id='...']/path`

### Увеличение числа попыток поиска элемента
- ✅ **2 → 5 попыток** в местах, где использовалось `findElementWithRetry(..., 2, ...)`:
  - `content/player-handlers-extended.js` — предпроверка следующих шагов при resume
  - `content/player-handlers-form.js` — проверка условий (evaluateCondition, handleCondition), ожидаемое значение
  - `content/player-core.js` — поиск по донорскому селектору при подмене селектора

### Хранение: квота (quota exceeded)
- ✅ **SAVE_TEST_RUN_HISTORY:** При ошибке `Resource::kQuotaBytes` / `kQuotaBytes` — ответ `success: true` с предупреждением, чтобы тест не падал
- ✅ **SAVE_PLAYBACK_STATE:** При ошибке квоты — повторная попытка сохранения с обрезанным состоянием (удаление `screenshot`, `beforeScreenshot`, `afterScreenshot` из `runHistory.steps`)
- **Файлы:** `background/message-handlers.js`

### Импорт Katalon XML (popup)
- ✅ **importFromFile:** Чтение файла; трактовка как XML при начале контента с `<` (в т.ч. файлы `.undefined`)
- ✅ **parseKatalonXmlTestCase:** Поддержка `type` и `id=` в target; `buildSelectorFromTarget()` для `xpath=`, `css=`, `id=`; команды open, click, type (→ input)
- ✅ **simplifyKatalonSelector:** Упрощение XPath в CSS (напр. `//*[@id='x']` → `#x`), нормализация `normalize-space` → `contains(.,'...')`; экранирование скобок в regex
- **Файлы:** `popup/popup.js`

### Ввод и «Illegal invocation»
- ✅ **setNativeInputValue:** try/catch вокруг `descriptor.set.call(input, value)`; при "Illegal invocation" / TypeError — fallback `input.value = value`
- ✅ Ветка input/textarea в плеере использует setNativeInputValue и при ошибке — прямое присвоение `element.value`; события с `view: element.ownerDocument.defaultView`
- **Файлы:** `content/player-handlers-extended.js`, `content/player-handlers-form.js` (_performInput)

### Файлы
- `content/selector-engine.js` — _xpathIdPathToCssFallback, использование в findElementSync
- `content/player-handlers-extended.js` — fallback через selectorEngine, retries 5, setNativeInputValue
- `content/player-handlers-form.js` — retries 5, _performInput
- `content/player-core.js` — retries 5
- `background/message-handlers.js` — SAVE_TEST_RUN_HISTORY, SAVE_PLAYBACK_STATE (quota)
- `popup/popup.js` — импорт Katalon XML

---

## 2026-03-10 (v0.9.6.8) 📁 ГРУППЫ ТЕСТОВ (PREMIUM FEATURE)

### ГРУППЫ ТЕСТОВ: Организация и последовательное выполнение
- ✅ **Создание групп:** Объединение нескольких тестов в группу для последовательного выполнения
- ✅ **Наследование переменных:** Передача переменных между тестами в группе (inheritVariables)
- ✅ **Условное выполнение:** Запуск тестов на основе результатов предыдущих (conditionalExecution)
- ✅ **Управление ошибками:** Настройка stopOnError (остановить всю группу или продолжить)
- ✅ **Начальные переменные:** Определение initialVariables для всей группы
- ✅ **Экспорт переменных:** Каждый тест может экспортировать переменные (exportVariables)
- ✅ **Статистика:** Отслеживание lastRun, totalRuns, successRate для групп

**Файлы:**
- `shared/group-manager.js` — GroupManager для CRUD операций
- `content/group-executor.js` — GroupExecutor для выполнения групп

### FEATURE FLAGS: Контроль доступа к премиум-функциям
- ✅ **TEST_GROUPS флаг:** Добавлен в `background/feature-flags.js`
- ✅ **Проверка лицензии:** requiresLicense: true для групп
- ✅ **Локальный override:** enableTestGroups для разработки
- ✅ **fallbackEnabled: true:** Для тестирования без лицензии

**Файлы:**
- `background/feature-flags.js` — Определение TEST_GROUPS флага

### MESSAGE HANDLERS: API для работы с группами
- ✅ **GET_GROUPS** — Получить все группы
- ✅ **GET_GROUP** — Получить группу по ID
- ✅ **CREATE_GROUP** — Создать новую группу (с проверкой premium)
- ✅ **UPDATE_GROUP** — Обновить существующую группу
- ✅ **DELETE_GROUP** — Удалить группу (тесты сохраняются)
- ✅ **ADD_TEST_TO_GROUP** — Добавить тест в группу
- ✅ **REMOVE_TEST_FROM_GROUP** — Удалить тест из группы
- ✅ **REORDER_GROUP_TESTS** — Изменить порядок тестов
- ✅ **UPDATE_GROUP_STATS** — Обновить статистику после выполнения
- ✅ **CHECK_GROUPS_ACCESS** — Проверить доступ к функции

**Файлы:**
- `background/message-handlers.js` — 10 новых handlers для групп

### UI В POPUP: Визуальный дизайн и управление группами
- ✅ **Градиентный дизайн:** Фиолетовый градиент (#667eea → #764ba2) с иконкой 📁
- ✅ **Premium badge:** Золотой бейдж "PRO" на кнопке создания группы
- ✅ **Expand/collapse:** Развернуть/свернуть список тестов в группе
- ✅ **Group actions:** Run Group, Edit, Add Test, Delete
- ✅ **Single test run:** Запуск отдельного теста из группы
- ✅ **Conditional indicators:** Индикация условий выполнения (⚠️)
- ✅ **Premium lock overlay:** Блокировка для бесплатных пользователей
- ✅ **Progress bar:** Индикация прогресса выполнения группы
- ✅ **Drag handles:** Визуальные ≡ handles для перестановки

**Файлы:**
- `popup/popup-groups.js` — PopupGroupsUI класс для UI групп
- `popup/popup.css` — 400+ строк стилей для групп
- `popup/popup.html` — Кнопка "Create Group" с PRO badge

### ЛОКАЛИЗАЦИЯ: Полная поддержка EN/RU
- ✅ **45 новых ключей** в разделе "groups"
- ✅ **Настройки групп:** stopOnError, inheritVariables, initialVariables, conditionalExecution
- ✅ **Сообщения выполнения:** starting, testRunning, testCompleted, groupCompleted
- ✅ **Premium тексты:** title, description, upgradeButton, upgradeMessage
- ✅ **Ошибки:** emptyGroup, duplicateTest, invalidCondition, circularDependency

**Файлы:**
- `i18n/en.json` — Английские ключи
- `i18n/ru.json` — Русские переводы

### СТРУКТУРА ДАННЫХ
**Group Object:**
```javascript
{
  id: "group_1234567890",
  type: "group",
  name: "User Registration Flow",
  tests: ["test_001", "test_002"],
  execution: {
    stopOnError: true,
    inheritVariables: true,
    initialVariables: {},
    conditionalExecution: {}
  },
  stats: { lastRun, totalRuns, successRate }
}
```

**Test Object (расширен):**
```javascript
{
  ...existingFields,
  groupId: "group_1234567890",  // null если не в группе
  groupPosition: 0,              // позиция в группе
  exportVariables: ["USER_ID"]  // переменные для экспорта
}
```

### СТИЛИ И АНИМАЦИИ
- ✅ **Group card:** Градиент, rounded corners, shadow
- ✅ **Nested tests:** Backdrop blur, semi-transparent background
- ✅ **Status colors:** running (green), success (light green), failed (red)
- ✅ **Expand animation:** max-height transition 300ms
- ✅ **Hover effects:** Transform translateY(-1px), shadow lift
- ✅ **Premium lock:** Blur overlay, gold upgrade button
- ✅ **Responsive:** Адаптация для узких экранов

**Файлы:**
- `popup/popup.css` — Секция TEST GROUPS (400+ строк)

### MANIFEST UPDATES
- ✅ **Версия:** 0.9.6.8
- ✅ **Description:** Упоминание Test Groups (premium)
- ✅ **content_scripts:** Добавлен group-executor.js
- ✅ **web_accessible_resources:** Добавлен shared/group-manager.js

**Файлы:**
- `manifest.json`
- `version.txt`
- `versions.txt`
- `changes.md`

### АРХИТЕКТУРА
**Модули:**
1. **GroupManager** (shared/group-manager.js)
   - CRUD операции для групп
   - Валидация структуры
   - Экспорт/импорт групп
   - Проверка циклических зависимостей

2. **GroupExecutor** (content/group-executor.js)
   - Последовательное выполнение тестов
   - Наследование переменных
   - Оценка условий
   - Обновление статистики

3. **PopupGroupsUI** (popup/popup-groups.js)
   - Рендеринг групп в popup
   - Обработка действий пользователя
   - Premium access checks
   - Drag & drop (placeholder)

**Хранение:**
- chrome.storage.local: `testGroups` — массив групп
- Тесты: расширены полями `groupId`, `groupPosition`, `exportVariables`

### KNOWN LIMITATIONS
- ⚠️ **Editor UI:** Управление группами из editor — coming soon (v0.9.6.9+)
- ⚠️ **Вложенные группы:** Не поддерживаются (by design)

### ALL CORE FEATURES COMPLETED ✅
**Version 0.9.6.8 is production-ready with all planned features implemented!**

### COMPLETED FEATURES ✅
- ✅ **RUN_GROUP integration:** Полная интеграция с player.js
- ✅ **Variable inheritance:** Переменные наследуются между тестами в группе
- ✅ **Group execution:** GroupExecutor запускает тесты последовательно
- ✅ **UI rendering:** Группы корректно отображаются в popup
- ✅ **Premium access:** Проверка лицензии работает (fallbackEnabled: true для разработки)
- ✅ **Message handlers:** Все 10 handlers реализованы
- ✅ **Drag & Drop:** Перестановка тестов в группе drag-and-drop
- ✅ **Add test dialog:** Модальное окно с поиском и выбором позиции
- ✅ **Export/Import:** Экспорт групп с вложенными тестами, импорт с проверкой premium
- ✅ **Smart import:** Импорт тестов по одиночке для non-premium пользователей

### TESTING CHECKLIST
- [ ] Создание группы через popup
- [ ] Добавление тестов в группу
- [ ] Удаление тестов из группы
- [ ] Удаление группы
- [ ] Проверка premium access
- [ ] Expand/collapse группы
- [ ] Локализация RU/EN
- [ ] Premium lock overlay для free users
- [ ] Стили на разных разрешениях

---

## 2026-03-09 (v0.9.6.7) 📸 СКРИНШОТЫ И ХРАНИЛИЩЕ

### ИСПРАВЛЕНИЕ: Resource::kQuotaBytes quota exceeded
- **Проблема:** При сохранении истории после прогонов с полностраничными скриншотами (Pikabu и т.п.) возникала ошибка «quota exceeded» — chrome.storage.local ~5 MB, а один скриншот может быть 2–5 MB.
- **Решение:** Перед сохранением в `saveTestHistory()` удаляются base64-скриншоты длиннее 200 KB:
  - В шагах: `screenshot`, `beforeScreenshot`, `afterScreenshot`, `errorScreenshot`, `screenshotComparison.diffImage`, `screenshotComparisonView`
  - В `run.screenshots` — удаление поля `screenshot` из элементов при превышении лимита
- **Сохранены:** Пути к файлам (`screenshotPath`, `beforeScreenshotPath` и т.д.) — скриншоты на диске остаются доступны.
- **Файлы:** background/background.js

### ПРОСМОТР СКРИНШОТОВ: зум и прокрутка
- **Зум колёсиком мыши:** Приближение (вверх) / отдаление (вниз), диапазон 0.5×–4×
- **Перетаскивание мышью:** Зажать ЛКМ и тянуть для прокрутки при приближении (вверх/вниз, влево/вправо)
- **Прокрутка при увеличении:** Исправлена блокировка прокрутки вверх — убрано flex-центрирование, добавлен внутренний контейнер `fullscreenImageInner` с явными размерами
- **Курсор:** grab в покое, grabbing при перетаскивании
- **Файлы:** screenshots/screenshots.js, screenshots/screenshots.css, screenshots/screenshots.html, screenshots/screenshots_ru.html

---

## 2026-03-08 (v0.9.6.6) 🎨 UX/UI УЛУЧШЕНИЯ

### ВЫПАДАЮЩИЕ МЕНЮ ПОДТИПОВ ДЛЯ WAIT/ASSERTION
- ✅ **waitSubtypeGroup:** Выпадающее меню для выбора типа ожидания (9 подтипов)
- ✅ **assertSubtypeGroup:** Выпадающее меню для выбора типа проверки (9 подтипов)
- ✅ **Правильный порядок полей:** Тип ожидания/проверки → Селектор → Значение
- ✅ **Автоматическое скрытие селектора:** Для простой задержки (wait без подтипа) селектор скрывается
- ✅ **Обработчики изменений:** При смене подтипа форма автоматически обновляется
- ✅ **Полная локализация:** RU/EN для всех ключей (22 новых ключа)

**Подтипы Wait (9):**
- Задержка (без селектора)
- 🔍 Видим (wait-visible)
- 👻 Скрыт (wait-hidden)
- 📍 Существует (wait-exists)
- 🚫 Не существует (wait-not-exists)
- ✅ Доступность (wait-enabled)
- 💬 Значение (wait-value)
- ⏳ Опцию (wait-option)
- 🔢 Количество (wait-options-count)
- ⚡ Условие (wait-until)

**Подтипы Assertion (9):**
- 💬 Значение (assert-value, по умолчанию)
- 🔍 Видим (assert-visible)
- 👻 Скрыт (assert-hidden)
- 📍 Существует (assert-exists)
- 🚫 Не существует (assert-not-exists)
- 🔤 Содержит (assert-contains)
- 🔢 Количество (assert-count)
- 🔘 Состояние (assert-disabled)
- ☑️ Multiselect (assert-multiselect)

### TRY-CATCH ВИЗУАЛЬНЫЙ РЕДАКТОР
- ✅ **Метод renderTryCatchBlock:** Полноценный визуальный блок с 3 цветными секциями
- ✅ **3 блока:** Try (синий), Catch (красный), Finally (фиолетовый)
- ✅ **Drag & Drop:** Перетаскивание действий между блоками
- ✅ **Inline редактор:** Кнопки "+ Add" для каждого блока
- ✅ **Счётчики действий:** Отображение количества в каждом блоке
- ✅ **Обработка вложенных действий:** Полная поддержка редактирования/удаления
- ✅ **Метод showAddActionToTryCatchModal:** Добавление действий в try/catch/finally
- ✅ **Обновлён saveAction:** Поддержка сохранения в tryActions/catchActions/finallyActions
- ✅ **Обновлён getNestedAction:** Поддержка try/catch/finally веток
- ✅ **CSS стили:** Цветовое кодирование, dark theme
- ✅ **Локализация:** 8 новых ключей для Try-Catch (RU/EN)

### ИКОНКИ ДЛЯ ВСЕХ QUICK STEPS
- ✅ **116 иконок добавлено:** 58 RU + 58 EN
- ✅ **116 title подсказок:** Описание при наведении для каждого элемента
- ✅ **Покрытие 100%:** Все активные и disabled секции

**Добавлены иконки для секций:**
- Dropdown (11): ☑️ 🗑️ 🔍 📋 📌 ↕️
- Keyboard (3): ⬆️ 🔤 ⎋
- Визуальное (6): 📷 ⚖️ 🎯 📊 ▶️ ⏹️
- Навигация (8): 🌐 🔄 ⬅️ ➡️ 🔗 🎯 ⬆️ ⬇️
- Взаимодействие (6): 👆 👆👆 🖱️ 👉 🎯 💨
- Ввод (4): 📝 🗑️ ⌨️ 📁
- Переменные (5): 💾 🎯 🔗 💿 📦
- AI (6): 🎯 📊 💡 🔧 ⚕️ 📚
- Облако (4): 📤 ▶️ 📊 📅
- Тесты (5): 📤 📥 ✅ 💾 📂

### ИСПРАВЛЕНИЯ ТИПОВ ДЕЙСТВИЙ
- ✅ **nav-refresh:** 'refresh' → 'navigation'
- ✅ **nav-back:** 'navigate' → 'navigation'
- ✅ **nav-forward:** 'navigate' → 'navigation'
- ✅ **keyboard-navigate:** 'keypress' → 'keyboard'
- ✅ **keyboard-escape:** 'keypress' → 'keyboard'
- **Результат:** Исправлена ошибка "Cannot read properties of undefined (reading 'url')"

### ПЕРЕИМЕНОВАНИЯ
- ✅ **"Задержка" → "Ожидание"** в actionTypeWait (ru.json)

### ТЕХНИЧЕСКИЕ УЛУЧШЕНИЯ
- ✅ **Порядок полей оптимизирован:** Подтип → Селектор → Значение (логичный flow)
- ✅ **Удалён старый showAddTryCatchModal:** Использует новый addTryCatchStep
- ✅ **Обновлён парсинг индексов:** Поддержка try|catch|finally в регулярных выражениях
- ✅ **specialGroups расширен:** Добавлены waitSubtypeGroup и assertSubtypeGroup для автоскрытия

---

## 2026-03-07 (v0.9.6.6) 🔥 КРИТИЧНЫЕ ИСПРАВЛЕНИЯ

### КРИТИЧНЫЕ ИСПРАВЛЕНИЯ ЛОГИКИ

**Проблема #1: Адаптивные шаги привязаны к странице**
- ✅ **Автоматический поиск по тексту:** Если селекторы не собраны, `adaptive-*` шаги теперь автоматически ищут элементы по `selectorHint` через XPath (поиск по тексту, aria-label, title, placeholder)
- ✅ **Улучшение `_getCollectedCandidatesForAction`:** При отсутствии собранных селекторов метод пытается найти элементы по тексту из подсказки
- ✅ **Поддержка нескольких вариантов:** Поиск по разделителям `|`, `,`, пробелам (например: "Сохранить|Submit|Save")
- ✅ **Регистронезависимый поиск:** Автоматическое приведение к нижнему регистру для EN и RU языков
- **Результат:** Адаптивные шаги теперь работают БЕЗ предварительного `analysis-selectors` если указан `selectorHint`

**Проблема #2: Отсутствие универсального ожидания элемента**
- ✅ **wait-visible:** Ожидание появления видимого элемента (проверка размера, visibility, display, opacity)
- ✅ **wait-hidden:** Ожидание скрытия элемента
- ✅ **wait-exists:** Ожидание появления элемента в DOM (может быть невидимым)
- ✅ **wait-not-exists:** Ожидание исчезновения элемента из DOM
- **Реализация:** Добавлены в `SUPPORTED_SUBTYPES.wait` в `action-types.js` и обработка в `handleWait` в `player.js`

**Проблема #3: Отсутствие базовых проверок элемента**
- ✅ **assert-visible:** Проверка видимости элемента
- ✅ **assert-hidden:** Проверка что элемент скрыт
- ✅ **assert-exists:** Проверка существования элемента в DOM
- ✅ **assert-not-exists:** Проверка отсутствия элемента в DOM
- **Реализация:** Добавлены в `SUPPORTED_SUBTYPES.assert` и `SUPPORTED_SUBTYPES.assertion`, обработка в `handleAssert` с правильной логикой (для `assert-not-exists` элемент НЕ должен существовать)

**Проблема #4: Нет стандартизированной обработки ошибок**
- ✅ **Новый тип действия `try-catch`:** Полноценная обработка ошибок в тестах
- ✅ **Структура:**
  - `tryActions` — блок try (основные действия)
  - `catchActions` — блок catch (выполняется при ошибке)
  - `finallyActions` — блок finally (выполняется всегда)
  - `errorVariable` — имя переменной для сохранения текста ошибки
  - `continueOnError` — продолжать выполнение после ошибки (default: true)
- ✅ **Обработка:** Новый метод `handleTryCatch` в `player.js`, полная изоляция ошибок в catch/finally блоках
- **Пример использования:**
```json
{
  "type": "try-catch",
  "tryActions": [
    {"type": "click", "selector": {"type": "id", "selector": "#submit"}}
  ],
  "catchActions": [
    {"type": "javascript", "value": "console.log('Ошибка перехвачена')"}
  ],
  "finallyActions": [
    {"type": "screenshot", "subtype": "page-screenshot"}
  ],
  "errorVariable": "lastError",
  "continueOnError": true
}
```

### Итог
- **8 новых подтипов:** 4 для wait, 4 для assert
- **1 новый тип действия:** try-catch
- **Улучшена универсальность:** Адаптивные шаги больше НЕ требуют жёсткой привязки к странице
- **Улучшена надёжность:** Стандартная обработка ошибок через try-catch

**Файлы:** shared/action-types.js, content/player.js, manifest.json

---

## 2026-03-05 (v0.9.6.5)

### Навигация «Получить URL» (nav-get-url)

**Сделано:**
- **Новый подтип навигации** `nav-get-url` — получение ссылки текущей страницы и сохранение в переменную
- **Выбор части URL:** full, href, origin, pathname, path, hostname, host, protocol, search, hash
- **Player (content/player.js):** обработка в `handleNavigation` — парсинг `window.location.href` через URL API, запись в `userVariables[varName]`
- **Редактор:** форма с полями «Переменная» и «Часть URL», сохранение в `action.variableName` и `action.urlPart`
- **Быстрое действие** «Получить URL» / «Get URL» в группе Навигация (editor.html, editor_ru.html)
- **Отображение в списке шагов:** «Получить URL → ${varName} (часть)»
- **Локализация:** navGetUrl, navGetUrlVariableLabel, navGetUrlPartLabel, navGetUrlFull, navGetUrlHref, navGetUrlOrigin, navGetUrlPathname, navGetUrlPath, navGetUrlHostname, navGetUrlHost, navGetUrlProtocol, navGetUrlSearch, navGetUrlHash, navGetUrlHint (RU/EN)

**Файлы:** manifest.json, content/player.js, editor/editor.js, editor/editor.html, editor/editor_ru.html, i18n/ru.json, i18n/en.json

## 2026-03-04 (v0.9.7.0)

### Adaptive-Flow — пользовательские сценарии (Фаза 3: Power User) ⭐⭐⭐⭐

**Реализовано:**

#### Backend (Player)
- **handleAdaptiveFlow()** — основной метод выполнения сценария:
  - Пошаговое выполнение с полным контролем
  - Обработка ошибок для обязательных и необязательных шагов
  - Поддержка snapshots для восстановления состояния
  - Детальное логирование всех операций
- **_executeFlowAction()** — выполнение действий:
  - `fill-fields` — заполнение полей (required/all/empty)
  - `click` — поиск и клик по кнопке с подсказкой
  - `wait` — задержка в миллисекундах
  - `screenshot` — создание скриншота
- **_executeFlowVariations()** — вариации на шагах:
  - Перебор dropdown опций (до N вариантов)
  - Переключение checkbox (checked/unchecked)
  - Ограничение по maxVariationsPerStep
- **_captureSnapshot()** — захват состояния:
  - URL текущей страницы
  - Позиция скролла (x, y)
  - Временная метка
- **_restoreSnapshot()** — восстановление:
  - Переход на сохранённый URL
  - Восстановление позиции скролла
  - Использование при ошибках (если allowBacktrack)

#### Frontend (Editor)
- **UI построитель сценариев:**
  - Список шагов с визуальным отображением
  - Нумерация, название, иконки действий
  - Бейджи для вариаций
  - Индикатор обязательных шагов
- **Модальное окно создания шага:**
  - Поле названия
  - Выбор типа действия (fill-fields/click/wait/screenshot)
  - Параметры для каждого типа
  - Включение вариаций (dropdown×N, checkbox×2)
  - Чекбокс "Обязательный шаг"
- **Глобальные настройки:**
  - Макс. вариаций на шаг (1-20)
  - Разрешить возврат к предыдущим шагам
  - Остановить при ошибке
  - Сохранять snapshots
- **Управление шагами:**
  - Кнопка "+ Добавить шаг"
  - Кнопки редактирования (TODO)
  - Кнопки удаления с подтверждением
- **Методы:**
  - `_renderFlowSteps()` — отрисовка списка
  - `showAddFlowStepModal()` — модальное окно
  - `getCurrentFlowSteps()` — получение шагов
  - `addFlowStep()` — добавление
  - `deleteFlowStep()` — удаление
  - `updateFlowStepsList()` — обновление UI

#### Структура данных
```javascript
{
  type: 'adaptive',
  subtype: 'adaptive-flow',
  flow: [
    {
      step: 1,
      name: 'Заполнить форму',
      actions: [{ type: 'fill-fields', fillTarget: 'required' }],
      variations: {
        enabled: true,
        tryDropdownOptions: 3,
        tryCheckboxStates: true
      },
      required: false
    }
  ],
  flowOptions: {
    maxVariationsPerStep: 5,
    allowBacktrack: true,
    stopOnError: false,
    saveSnapshots: true
  },
  _flowStatistics: {
    stepsCompleted: 0,
    totalVariations: 0,
    actionsInvoked: 0,
    errors: []
  }
}
```

#### Логирование
```
🎯 [AdaptiveFlow] Запуск сценария: 5 шагов
📍 [AdaptiveFlow] Шаг 1/5: "Заполнить форму"
   💾 Snapshot сохранён
   🔄 Обновление селекторов...
   ✅ Селекторы обновлены
   📝 Заполнение полей (режим: required)
   🔄 Выполнение вариаций...
   ✅ Вариаций выполнено: 5
✅ [AdaptiveFlow] Шаг 1 завершён успешно
...
✅ [AdaptiveFlow] Сценарий завершён: 5/5 шагов
```

#### Обработка ошибок
- **Обязательный шаг (required: true):**
  - Ошибка → останавливаем выполнение
  - Бросаем исключение с описанием
- **Необязательный шаг:**
  - Ошибка → записываем в _runHistory
  - Попытка восстановления через snapshot (если allowBacktrack)
  - Продолжаем со следующего шага
- **Настройка stopOnError:**
  - true → останавливаем при любой ошибке
  - false → продолжаем даже при ошибках на необязательных шагах

#### Локализация
Добавлены ключи в ru.json и en.json:
- `adaptiveFlow`, `adaptiveFlowTitle`, `adaptiveFlowDescription`
- `flowSteps`, `flowGlobalOptions`
- `addStep`, `addFlowStep`, `stepName`, `stepNamePlaceholder`
- `enableVariations`, `tryDropdownOptions`, `tryCheckboxStates`
- `requiredStep`, `noStepsYet`, `confirmDeleteStep`
- `fillFields`, `fillRequired`, `fillAll`, `fillEmpty`
- `delayMs`, `pleaseEnterStepName`, `editingNotImplemented`

**Файлы:**
- content/player.js — handleAdaptiveFlow, _executeFlowAction, _executeFlowVariations, _captureSnapshot, _restoreSnapshot
- editor/editor.js — UI builder, _renderFlowSteps, showAddFlowStepModal, flow management methods
- i18n/ru.json, i18n/en.json — новые ключи локализации
- shared/action-types.js — adaptive-flow в SUPPORTED_SUBTYPES

**Применение:**
- ✅ Многошаговые wizard с полным контролем
- ✅ Регистрация с вариациями (попробовать разные города/возраста)
- ✅ Тестирование с обязательными и опциональными шагами
- ✅ Восстановление состояния при ошибках
- ✅ Детальная статистика по каждому шагу

### Возможные дальнейшие шаги (v0.9.7.0+)

- **Редактирование шагов** — UI для изменения существующих шагов
- **Drag-and-drop** — изменение порядка шагов перетаскиванием
- **Копирование шагов** — дублирование с изменением
- **Условные переходы** — if-then-else между шагами
- **Импорт/экспорт сценариев** — сохранение в JSON файл
- **Библиотека шаблонов** — готовые сценарии (регистрация, checkout, онбординг)
- **Визуализация выполнения** — progress bar для каждого шага
- **Расширенные snapshots** — сохранение полного HTML

## 2026-03-04 (v0.9.6.3)

### Adaptive-auto режим — автоматическое исследование приложения

**Сделано:**
- **Новый режим adaptive-auto** — автопилот для многошаговых форм, wizard, регистраций, checkout flows
- **Настройки:**
  - `maxIterations` (1-999) — количество циклов заполнения и сохранения
  - `excludeButtons` — список опасных кнопок через запятую (Отмена, Удалить, Закрыть...)
  - `fillMode` — режим заполнения полей (required/all/empty)
  - `ignoreValidationErrors` — продолжать при ошибках валидации
  - `exploreDropdowns` — попробовать 3-5 опций в каждом dropdown
  - `toggleCheckboxes` — переключить checkbox в обоих состояниях (checked/unchecked)
  - `enableBacktracking` — возвращаться к развилкам для полного покрытия
- **Умное заполнение:** проверка состояния форм перед заполнением (_getFormState) — не заполняет если все поля уже заполнены
- **Перебор dropdown опций:** _tryDropdownOptions — выбор 3-5 разных опций в каждом select для исследования вариантов
- **Toggle checkboxes:** _tryCheckboxToggle — проверка поведения для checked и unchecked состояний
- **Детекция wizard:** _detectWizard — распознавание многошаговых форм по индикаторам "Шаг X из Y", progressbar, step-элементам
- **Детекция модальных форм:** _detectModalForm — автоматическое обнаружение модальных окон 15+ UI фреймворков (Bootstrap, Material-UI, Angular Material, Ant Design, jQuery UI...)
- **Обработка модальных форм:** _handleModalForm — умная логика:
  - Если есть пустые обязательные поля → заполнить и нажать "Сохранить"
  - Если нет обязательных полей → нажать "Отмена" (закрыть без сохранения)
  - После закрытия → обновить селекторы
- **Backtracking граф:** AdaptiveNavigationGraph — отслеживание посещённых URL, нажатых кнопок, возможность вернуться к развилкам
- **Overlay с прогрессом:** визуальный индикатор выполнения с кнопкой "📊 Посмотреть отчёт"
- **Статистика:** iterations, actionsInvoked, fieldsFilled, dropdownsExplored, checkboxesToggles, backtrackCount, wizardSteps, modalFormsHandled
- **История выполнения:** _runHistory с записью каждого действия: fill-fields, click, dialog, dropdown-exploration, checkbox-toggle, modal-form, wizard-detected, backtrack

**Логирование:**
```
📋 [AdaptiveAuto] Новая страница: https://...
🔄 [AdaptiveAuto] Обновление селекторов для новой страницы...
✅ [AdaptiveAuto] Селекторы обновлены
🪟 [AdaptiveAuto] Обнаружена модальная форма: 5 полей, 3 пустых, 2 обязательных
📝 [ModalForm] Заполнение полей (режим: required)
💾 [ModalForm] Нажатие кнопки сохранения: "Сохранить"
```

**Adaptive-single улучшения:**
```
📋 [Adaptive-single] URL изменился: ... → ...
🔄 [Adaptive-single] Обновление селекторов для новой страницы...
✅ [Adaptive-single] Селекторы обновлены для новой страницы
📋 [Adaptive] Пропускаю автозаполнение — это dropdown-действие
```

**UI улучшения:**
- **Визуальное отображение adaptive шагов в списке:**
  - Режим: 🤖 Автоматический / 🎯 Одно действие (градиентные бейджи)
  - Настройки adaptive-auto: макс. итераций, исключённые кнопки, режим заполнения
  - Бейджи опций: ✓ Dropdown, ✓ Checkbox, ✓ Backtrack, ! Игнорировать ошибки
  - Внутреннее действие adaptive-single: тип, подсказка, количество повторений
- **Кнопка "📊 Посмотреть отчёт" в списке шагов** — доступна для обоих режимов (auto/single) если есть _runHistory
- **Hover эффекты:** масштабирование 1.02x + тень на кнопке отчёта
- **Адаптивная статистика:**
  - adaptive-auto: "Итераций: X | Выполнено: Y | Ошибок: Z"
  - adaptive-single: "Попыток: X | Выполнено: Y | Ошибок: Z"

**Excel экспорт:**
- **Автодетекция типа adaptive шага:** по структуре _runHistory (iteration/action для auto, attempt/actionType для single)
- **Динамические заголовки:** разные колонки для auto и single режимов
- **CSV и XLSX:** полная поддержка обоих режимов с правильными headers

**Локализация:**
- Добавлены ключи: adaptiveMode, adaptiveAutoSettings, viewReport, iterations, executed, errors, attempts, notConfigured
- Полная поддержка RU/EN для всех новых элементов UI

**Файлы:** 
- content/player.js — handleAdaptiveAuto, _getFormState, _detectWizard, _detectModalForm, _handleModalForm, _tryDropdownOptions, _tryCheckboxToggle, _createAdaptiveOverlay, _updateAdaptiveOverlay, AdaptiveNavigationGraph
- editor/editor.js — adaptive UI rendering, adaptive-view-report handler, adaptive mode badges
- excel-export/excel-export.js — prepareAdaptiveDetails (автодетекция типа)
- i18n/ru.json, i18n/en.json — новые ключи локализации
- shared/action-types.js — adaptive-auto в SUPPORTED_SUBTYPES

### Возможные дальнейшие шаги (v0.9.6.3+)

- **Пользовательские сценарии (adaptive-flow)** — пошаговые сценарии с вариациями: "Шаг 1: заполнить форму + попробовать 3 dropdown опции, Шаг 2: нажать Далее..."
- **ML-based priority** — использовать машинное обучение для предсказания приоритета кнопок
- **Genetic Algorithm** — эволюционный алгоритм для оптимизации последовательности действий
- **Snapshots** — сохранение состояния на каждом шаге для возможности восстановления
- **Расширенная детекция типов диалогов** — exit, success, error, warning
- **Улучшенная детекция бизнес-путей** — _detectBusinessPath для приоритизации действий по бизнес-логике

## 2026-03-02 (v0.9.6.2)

### Адаптивный шаг (Adaptive step)

**Сделано:**
- **Новый тип действия** `adaptive` с подтипом `adaptive-single` — универсальное действие, выполняющее любое одно действие из перечня (клик, ввод, изменение, прокрутка, клавиатура, ожидание, проверки, hover, focus, blur, clear, upload, screenshot, cookie, variable, api, javascript)
- **stepSpan:** при добавлении в тест можно указать, сколько номеров занимает шаг (1–99). Следующий шаг начинается с номера = текущий + stepSpan
- **excludePreviousValues:** при повторном прогоне не применять значения из предыдущего прогона — позволяет собирать цепочки вариантов при одних начальных условиях
- **maxRepeatCount:** повторение действия N раз (1–100), например 5 раз выбрать «Приказ» из выпадающего списка
- **История и статистика:** `_runHistory` — запись каждого выполнения (actionType, selector, enteredValue, selectedOption, url, timestamp, success); `_statistics` — stepsInvoked, actionsInvoked, errors
- **Селекторы:** `_ensureSelectorsForAdaptive` — вызов analysis-selectors в начале и при переходе на новую страницу (после клика по ссылке/кнопке). Навигация только через клик, без nav-url/nav-back/new-tab
- **Экспорт:** секция «Детали адаптивных шагов» в CSV и XLSX с колонками: Шаг, Попытка, Тип действия, Подтип, Селектор, Введённое значение, Выбранная опция, URL, Время, Успех, Ошибка
- **Редактор:** форма с выбором типа внутреннего действия, подтипа, селектора и значения; выбор селектора из «Собранные с страницы»; нумерация с учётом stepSpan (диапазон «5–14»)
- **Player:** `getEffectiveStepCount`, `getStepNumberForIndex` — учёт stepSpan при подсчёте totalSteps и realStepNumber

**Файлы:** shared/action-types.js, content/player.js, editor/editor.js, excel-export/excel-export.js, i18n/ru.json, i18n/en.json

### Возможные дальнейшие шаги (v0.9.6.2+)

- **Предпросмотр доступных элементов** — показывать список элементов из collectedSelectors при редактировании адаптивного шага
- **Шаблоны действий** — сохранять часто используемые комбинации (тип + subtype) как шаблоны
- **Условное выполнение** — опция «выполнить только если элемент видим» перед действием
- **Retry при ошибке** — автоматический повтор с альтернативным селектором (как в executeActionWithFallback)
- **Визуальный выбор элемента** — при добавлении шага клик по странице для выбора элемента (как в записи)
- **Цепочка действий** — возможность задать несколько действий внутри одного адаптивного шага (с ограничением)
- **Интеграция с переменными** — подстановка `${var}` в value при excludePreviousValues
- **Экспорт по прогонам** — отдельный файл/лист на каждый прогон для сравнения вариантов

## 2026-03-01 (v0.9.6.1)

### PageDown, PageUp, Home, End — явная прокрутка страницы

**Проблема:** Программные KeyboardEvent имеют `isTrusted: false`, браузер не выполняет стандартное действие (прокрутку) для PageDown и др. На шаге 11 страница не прокручивалась.

**Причина:** Переменная `scrollKeys` не была объявлена — ReferenceError, блок прокрутки не выполнялся.

**Сделано:** Объявлена `scrollKeys`. Пробуем несколько целей: scrollable div, document.scrollingElement, window. Пока одна из них не изменит позицию.

**Файлы:** content/player.js

### Ошибка скриншота: «activeTab permission is not in effect because extension has not been invoked»

**Проблема:** При создании скриншота во время воспроизведения теста возникала ошибка: `The 'activeTab' permission is not in effect because this extension has not been in invoked`.

**Причина:** TAKE_SCREENSHOT использовал `chrome.tabs.query({ active: true, currentWindow: true })` — активная вкладка могла быть редактором или другой, а не вкладкой с тестом. Chrome применял activeTab к неверному контексту.

**Сделано:** Приоритетно использовать `sender.tab` (вкладка, из которой content script отправил запрос — вкладка теста). Fallback на active tab при отсутствии sender.

**Файлы:** background/message-handlers.js

### nav-refresh / nav-back / nav-forward — бесконечный цикл и предупреждение «Не могу сохранить состояние»

**Проблема:** Шаг «Обновить страницу» повторялся бесконечно; предупреждение «Не могу сохранить состояние: isPlaying = false, hasTest = false».

**Причина 1:** `savePlaybackState()` вызывался без аргументов — сохранялись `actionIndex: undefined` и `nextUrl: undefined`. При resume выполнялся шаг 0 снова (refresh), что давало бесконечный цикл. В MV3 service worker может перезапускаться — `manager.playbackState` в памяти обнуляется, нужен fallback на storage.

**Причина 2:** В resumePlayback «умный» поиск по URL перезаписывал сохранённый startActionIndex на более ранний шаг (например, с 3 на 1), т.к. текущий URL совпадал с nav-url шага 1. В результате снова выполнялся шаг 1 (навигация) и refresh — бесконечный цикл.

**Сделано:**
- **nav-refresh:** передаётся `nextUrl = window.location.href` (та же страница после reload) и `nextActionIndex = currentActionIndex + 1`
- **nav-back / nav-forward:** передаётся `nextUrl = '__AUTO_NAV__'` и `nextActionIndex` для безусловного resume
- **checkResumePlayback:** fallback для старых сохранений — при `nextUrl === undefined` используется `__AUTO_NAV__`, при `actionIndex` вне диапазона — 0; задержка 300 мс и повтор запроса при пустом ответе (гонка с service worker)
- **GET_PLAYBACK_STATE:** fallback — при `manager.playbackState === null` загрузка из `chrome.storage.local` (service worker мог перезапуститься после nav-refresh)
- **resumePlayback URL matching:** не перезаписывать startActionIndex на более ранний шаг (`bestMatchIndex >= startActionIndex`) — иначе цикл: resume с шага 3 → override на шаг 1 → nav/refresh → снова resume

**Файлы:** content/player.js, background/message-handlers.js

### Switch tab — переключение на другую вкладку

**Сделано:**
- **Player (content/player.js):** обработка `switch-tab` в `handleNavigation` — отправка `SWITCH_TAB` в background
- **Background (message-handlers.js):** обработчик `SWITCH_TAB` — поиск вкладки по индексу, URL или заголовку, активация через `chrome.tabs.update`
- **shared/action-types.js:** `switch-tab` добавлен в SUPPORTED_SUBTYPES.navigation, удалён из UNSUPPORTED_QUICK_TEMPLATES
- **Editor:** форма для switch-tab с режимами: по индексу (0, 1, 2...), по URL (подстрока или /regex/), по заголовку (подстрока или /regex/)
- **Quick Steps:** «Переключить» / «Switch Tab» разблокирован в группе Расширенные
- **i18n:** добавлены строки switchTab*, switchTabHint

**Файлы:** content/player.js, background/message-handlers.js, shared/action-types.js, editor/editor.js, editor/editor.html, editor/editor_ru.html, i18n/en.json, i18n/ru.json

### Навигация — визуальное различие new-tab, close-tab, switch-tab

**Проблема:** Шаг «Новая вкладка» отображался как «НАВИГАЦИЯ» — неочевидно, что открытие произойдёт в новой вкладке.

**Сделано:**
- **Бейдж:** для navigation с subtype показывается конкретный тип: «Новая вкладка», «Закрыть вкладку», «Переключить вкладку», «Обновить», «Назад», «Вперёд»
- **Иконки:** 🆕 для new-tab, ❌ для close-tab, ↔️ для switch-tab
- **Значение:** для new-tab — «Открыть в новой вкладке: [URL]» вместо просто URL

**Файлы:** editor/editor.js, i18n/en.json, i18n/ru.json

### Селектор типа навигации при редактировании шага

**Сделано:**
- При редактировании шага навигации отображается выпадающий список «Тип навигации» с опциями: Переход (nav-url), Новая вкладка, Переключить вкладку, Закрыть вкладку, Обновить, Назад, Вперёд
- По умолчанию — «Переход» (nav-url), совместим с существующими шагами без subtype
- Сохранение subtype из формы в `action.subtype` при сохранении
- Отображение бейджа и иконки для nav-url (🌐 Переход)
- i18n: navUrl, navSubtypeLabel

**Файлы:** editor/editor.js, i18n/en.json, i18n/ru.json

### Grab from page (Со страницы) — полная реализация

**Сделано:**
- **Кнопка включена:** убран `disabled` с grabFromPage в editor.html и editor_ru.html
- **Режимы:** переключатель «Один элемент» (клик по странице) / «Все данные» (анализ страницы)
- **Режим «Все данные»:** вызов analysis-selectors, таблица извлечённых элементов с фильтром по типу и тексту, чекбоксы «Сохранять», поля «Имя переменной», кнопки «Выбрать все», «Снять выбор», «Применить к переменным»
- **Применение к переменным:** создание записей в test.variables с source: 'page', selector, extractType, exportToRow; при urlMatch — добавление variable actions с extract-element
- **Шаг collect-data:** новая операция variable — собирает значения из userVariables в строку, добавляет в runHistory.collectedRows
- **Экспорт:** секция «Собранные данные» в CSV/XLSX с колонками по именам переменных
- **Настройка «Дописывать собранные данные»:** накопление collectedRows между прогонами в chrome.storage (collectedDataByTest[testId]); при экспорте — merge и сохранение

**Файлы:** editor/editor.js, editor/editor.html, editor/editor_ru.html, editor/editor.css, content/player.js, excel-export/excel-export.js, settings/settings.js, settings/settings.html, settings/settings_ru.html, background/background.js, i18n/en.json, i18n/ru.json

## 2025-03-01

### Dropdown Operations — поддержка в Player

**Сделано:**
- **Player (content/player.js):**
  - Добавлен `handleDropdownAction(action, element)` — обработка 9 click-based dropdown операций:
    - `dropdown-select` — выбор одной опции (native select + кастомные app-select, mat-select и т.д.)
    - `dropdown-multiselect` — множественный выбор (optionValues/expectedValues)
    - `dropdown-deselect` — снятие выбора опции
    - `dropdown-select-all` — выбрать все (multiple select)
    - `dropdown-clear-all` — очистить все
    - `dropdown-toggle-all` — инвертировать выбор (native multiple)
    - `dropdown-copy` — копирование выбранных значений в буфер (Clipboard API)
    - `dropdown-paste` — вставка из буфера в multiselect
    - `dropdown-reorder` — изменение порядка опций (fromIndex, toIndex для native select)
  - Добавлен `handleDropdownDatalistCombobox(inputElement, searchText, subtype)` — для input-based:
    - `dropdown-datalist` — HTML5 datalist: ввод текста, выбор из `<datalist>`
    - `dropdown-combobox` — ввод текста, клик по опции в role="listbox"
  - В `handleClick`: маршрутизация по `action.subtype` в `handleDropdownAction` до generic dropdown-логики
  - В `handleInput`: маршрутизация `dropdown-datalist`/`dropdown-combobox` в `handleDropdownDatalistCombobox`
- **shared/action-types.js:** удалены 11 dropdown subtypes из `UNSUPPORTED_QUICK_TEMPLATES`
- **editor:** группа Dropdown в Quick Steps разблокирована (editor.html, editor_ru.html), fallback в editor.js обновлён

**Файлы:** content/player.js, shared/action-types.js, editor/editor.js, editor/editor.html, editor/editor_ru.html

### dropdown-multiselect — исправление для native multiple select

**Проблема:** При выборе нескольких опций в native `<select multiple>` каждая следующая опция сбрасывала предыдущие — `selectElement.value = valueToSet` очищал остальные выбранные.

**Сделано:** В `selectNativeOption` для `select.multiple` не присваиваем `.value` — только `option.selected = true` для добавления к выбору.

**Файлы:** content/player.js

### dropdown-select — сохранение и отображение

**Проблема:** Быстрый шаг dropdown-select не сохранялся — редактор показывал «Быстрый шаг "dropdown-select" пока не поддерживается при воспроизведении» и отклонял сохранение.

**Сделано:**
- **SUPPORTED_SUBTYPES:** добавлены все dropdown subtypes в `click` и `input` (shared/action-types.js)
- **populateSubtypeFieldsFromAction:** при редактировании заполняются optionText, expectedValues, searchText из action
- **saveDropdownSubtypeFields:** для dropdown-select/deselect сохраняем optionText и value
- **getActionValue:** для dropdown subtypes показываем опцию/значение в списке шагов

**Файлы:** shared/action-types.js, editor/editor.js

### Клавиатурная навигация (3 операции)

**Сделано:**
- **Player (content/player.js):**
  - `keyboard-navigate` — ArrowUp/Down/Left/Right: фокус на элемент (или activeElement), keydown/keyup
  - `keyboard-escape` — Escape: закрытие модальных окон (опционально с селектором)
  - `keyboard-typeahead` — тип input, ввод текста для быстрого поиска в списках/dropdown (через handleInput)
- **shared/action-types.js:** добавлены keyboard subtypes в SUPPORTED_SUBTYPES, удалены из UNSUPPORTED_QUICK_TEMPLATES
- **editor:** группа Keyboard разблокирована, applyKeyboardSubtype — предвыбор ArrowDown для navigate, Escape для escape
- **getActionValue:** отображение клавиши для keyboard subtypes

**Файлы:** content/player.js, shared/action-types.js, editor/editor.js, editor/editor.html, editor/editor_ru.html

### PerformanceCollector — убрано предупреждение «Cannot mark step»

**Проблема:** При прогоне теста без шага analysis-performance в консоль выводилось предупреждение «⚠️ [PerformanceCollector] Cannot mark step - not monitoring» на каждый шаг.

**Сделано:**
- **Player:** `PERFORMANCE_MARK_STEP` отправляется только при наличии в тесте шага analysis-performance (`this.performanceMonitoringEnabled`)
- **PerformanceCollector:** при вызове `markStep` без активного мониторинга — тихий return без предупреждения
- **PerformanceCollector:** в обработчике `MARK_PERFORMANCE_STEP` — вызов `markStep` только при `isMonitoring`, иначе тихо игнорируем

**Файлы:** content/player.js, content/performance-collector.js

## 2025-02-27

### Отчёты «Валидация» и «Анализ форм»

**Проблема:** analysis-validate и analysis-forms возвращали issues и forms, но они не передавались в analysisResult — в редакторе видна только строка summary.

**Сделано:**
- **analysis-validate** — расширена WCAG-ориентированная проверка:
  - Ссылки без href или href="#" без aria-label
  - Кнопки без текста и без aria-label/title
  - Поля форм без label, aria-label, aria-labelledby или placeholder
  - Изображения без alt
  - Элементы с role без доступного имени
  - tabindex на неинтерактивных элементах
  - Дублирующиеся id
  - Пустые button/a
  - Расширенная структура issue: selector, tagName, problems, severity, wcagCriterion, suggestion
- **analysis-forms** — расширен анализ:
  - Нативные form, role="form", form-like контейнеры (Angular formGroup)
  - Добавлены app-select и app-group-item-select в список полей
  - Расширенная структура: fields с elementTag, optionsCount, placeholder
- **Передача данных:** issues и forms добавлены в analysisResult в player.js и editor.js (add-step flow)
- **Отображение в редакторе:** кнопки «Ошибки и предупреждения: N» и «Формы: N», раскрываемые списки, Debug с полным JSON
- **Стили:** .analysis-validate-issues-list, .analysis-forms-list
- **i18n:** validationIssuesCount, formsCount, formFields, validationProblem_* (linkWithoutHref, buttonWithoutLabel и т.д.)
- **isInSelectableArea:** добавлены .analysis-validate-issues-list и .analysis-forms-list для выделения текста
- **Выделение и копирование отчётов:** добавлен `user-select: text` для .analysis-validate-issues-list, .analysis-forms-list, .analysis-broken-links-list, .analysis-validation-errors-list — позволяет выделять мышью и копировать отчёт с ошибками (включая правую кнопку и контекстное меню «Копировать»)
- **Разделение ошибок в отчёте валидации:** ошибки доступности (WCAG) и ошибки кода (duplicateId) отображаются отдельно — секции «Доступность» и «Ошибки кода» в раскрываемом списке; в summary — «(доступность: N, код: M)»

**Файлы:** analysis/analysis-module.js, content/player.js, editor/editor.js, editor/editor.css, i18n/ru.json, i18n/en.json

### Настройка Context7 MCP
- Добавлена конфигурация MCP-сервера Context7 для Cursor.
- Создан глобальный конфиг: `C:\Users\User\.cursor\mcp.json`.
- Создан проектный конфиг: `.cursor/mcp.json` (command: npx, args: -y, @upstash/context7-mcp).
- Context7 подставляет актуальную документацию библиотек в контекст ассистента.

### Шаг «Заполнить поля» — универсальная поддержка dropdown

**Проблема:** Поле «Вид проекта правового акта» (app-group-item-select) не заполнялось — компонент не поддерживался.

**Сделано:**
- Добавлена поддержка `app-group-item-select` (наравне с `app-select`):
  - `analysis-selectors`: querySelectorAll, generateSelector (elementid, label, formControlName, placeholder)
  - Фильтр inputSelectors, fill loop (isAppSelectLike)
- Универсальные supplements: `addSelectLike(el, tag)` для form и document — добавляет `app-select` и `app-group-item-select`, пропущенные analysis-selectors
- Удалена привязка к конкретным полям страницы (устаревшие supplements)
- Создан `docs/FILL_FIELDS_DROPDOWNS.md` — описание компонентов, supplements, способа расширения

**Файлы:** `analysis/analysis-module.js`, `docs/FILL_FIELDS_DROPDOWNS.md`

### Правило ведения журнала
- После каждого действия в рамках проекта дописывать сделанные изменения в этот файл (`changes.md`).
- При изменениях в версии дописывать информацию в `versions.txt`.

### versions.txt
- Добавлена запись Версия 0.9.4.4 (2025-02-27) с изменениями по шагу «Заполнить поля».

### Шаг «Заполнить поля» — обязательные поля и значение по умолчанию

**Сделано:**
- **Только обязательные поля** — `isFieldRequired`: `required`, `aria-required`, `ng-reflect-required`, label с `*` или классом `required-label` (звёздочка через ::after)
- **required-label** — звёздочка через CSS ::after: добавлена проверка класса `required-label` у label
- **По умолчанию при добавлении** — fillTarget = «Все поля» (в диалоге и в модальном окне)
- В карточке шага отображается выбранный режим: «Все поля», «Только пустые», «Только обязательные»

**Файлы:** `analysis/analysis-module.js`, `editor/editor.js`

### TODO: Ложное срабатывание isFieldRequired для необязательных полей

**Проблема:** «Краткое наименование» и «Ближайший контрольный срок» заполняются при «Только обязательные поля», хотя не обязательны.

**Причина:** `.wizard_form-g` охватывает весь блок, `group.querySelector('label')` возвращает первый label («Вид проекта» с required-label) для всех полей.

**Решение:** искать label, относящийся к текущему полю (например, `previousElementSibling` или убрать `.wizard_form-g` из селектора group).

### Шаг «Проверить ссылки» — отчёт после прогона

**Проблема:** При прогоне теста результат анализа ссылок не сохранялся в карточку шага — отчёт не отображался.

**Сделано:**
- Player: `handleAnalysis` возвращает результат; `executeActions` при успешном шаге analysis отправляет `UPDATE_ANALYSIS_RESULT` в background
- Background: обработчик `UPDATE_ANALYSIS_RESULT` — обновляет `action.analysisResult`, сохраняет тест, шлёт `TEST_UPDATED` в редактор
- Редактор: при `TEST_UPDATED` перезагружает тест — отчёт (summary, brokenLinks) отображается в карточке шага

**Файлы:** `content/player.js`, `background/background.js`

### Шаг «Проверить ссылки» — количество и Debug

**Сделано:**
- **Количество** — отдельный блок с total/live/broken/checked
- **Битых ссылок** — всегда отображается (в т.ч. при 0)
- **Debug** — для analysis-links: список ссылок (href, text, status, isLive); для analysis-fill-fields: debugLog всегда виден
- В analysisResult добавлено поле `links` для analysis-links

**Файлы:** `editor/editor.js`, `content/player.js`, `i18n/ru.json`, `i18n/en.json`

### Анализ — компактный единый блок

**Сделано:**
- Единый компактный блок `.analysis-result-compact` для всех типов анализа
- Одна строка: селекторы | битые ссылки (только если > 0) | ошибки валидации (только если > 0) | Debug
- «Битых ссылок» не показывается при 0
- Раскрываемые списки и Debug под строкой, одинаковый стиль

**Файлы:** `editor/editor.js`, `editor/editor.css`

### DRAG & DROP: Перестановка тестов в группе
- ✅ **Drag handle (≡):** Визуальный индикатор для перетаскивания
- ✅ **Visual feedback:** Класс .dragging во время перетаскивания
- ✅ **Drop zones:** Индикация допустимых зон вставки
- ✅ **Backend sync:** Автоматическое обновление порядка через REORDER_GROUP_TESTS
- ✅ **Smooth animations:** Плавные переходы при перестановке

### ADD TEST DIALOG: Модальное окно добавления
- ✅ **Search functionality:** Поиск тестов по названию в реальном времени
- ✅ **Multiple selection:** Выбор нескольких тестов через checkbox
- ✅ **Position control:** Выбор позиции вставки (начало/конец/после теста N)
- ✅ **Batch add:** Добавление нескольких тестов за раз
- ✅ **Responsive design:** Адаптивная модалка с прокруткой

### EXPORT/IMPORT GROUPS: Обмен группами
- ✅ **Export with tests:** Экспорт группы со всеми вложенными тестами в JSON
- ✅ **Preserve structure:** Сохранение порядка, условий, переменных
- ✅ **Import for premium:** Полный импорт группы с тестами
- ✅ **Import for free:** Импорт только тестов по одиночке (без группировки)
- ✅ **Smart ID mapping:** Автоматическая замена ID тестов при импорте
- ✅ **Condition rewriting:** Обновление условий с новыми ID тестов
- ✅ **Upgrade prompt:** Показ upgrade сообщения для non-premium

**Файлы:**
- `popup/popup-groups.js` — +300 строк (drag-drop, dialog, export/import)
- `popup/popup.css` — +150 строк (модалка, кнопки)
- `popup/popup.html` — кнопка Import Group
- `i18n/en.json`, `i18n/ru.json` — +10 ключей


### LICENSE FILE: Автоматическая активация премиум
- ✅ **LICENSE файл в корне:** Автоматическая активация при наличии
- ✅ **Проверка при старте:** feature-flags.js проверяет LICENSE перед storage
- ✅ **Срок действия:** До 2099-12-31
- ✅ **Премиум функции:** testGroups, analysisStep, excelExport, aiSelectors
- ✅ **Developer-friendly:** Просто оставьте LICENSE в корне

### UI IMPROVEMENTS: Улучшенная компоновка
- ✅ **Двухуровневый header:** Заголовок + память сверху, кнопки снизу
- ✅ **Компактный storage:** Убрана надпись "Storage:", показывается только значение
- ✅ **Нет перекрытия:** Память больше не перекрывает кнопки
- ✅ **Responsive:** На узких экранах прячется иконка 💾
- ✅ **Улучшенная читаемость:** Всё на своих местах

**Файлы:**
- `LICENSE` — файл лицензии (JSON)
- `LICENSE_README.md` — документация
- `background/feature-flags.js` — +30 строк (checkLicenseFile)
- `manifest.json` — LICENSE в web_accessible_resources
- `popup/popup.html` — новая структура header
- `popup/popup.css` — +80 строк (улучшенный layout)

