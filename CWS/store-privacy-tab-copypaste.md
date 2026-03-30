# Вкладка «Меры по обеспечению конфиденциальности» — тексты для копирования

Используйте блоки **«Текст для поля»** по очереди в [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Формулировки согласованы с `manifest.json` (v0.9.7.1) и фактическим поведением расширения.

Если поле в консоли **только на английском**, ниже каждого блока дан вариант **EN**.

---

## 1. Описание цели / Single purpose / «Необходимо описание цели»

**Текст для поля (RU):**

> Единственная цель продукта — помочь пользователю автоматизировать проверку веб-приложений в Google Chrome без написания отдельного кода тестов: запись действий на странице, редактирование сценария во встроенном редакторе, воспроизведение с проверками, логами, скриншотами и отчётами. Расширение не предназначено для сбора данных с сайтов в рекламных целях и не используется для обхода ограничений сайтов вне заявленного тестирования.

**EN (если требуется):**

> The product has a single purpose: to help users automate web application testing in Google Chrome without writing standalone test code—by recording page actions, editing scenarios in the built-in editor, and replaying them with assertions, logs, screenshots, and reports. It is not intended to harvest site data for advertising or to circumvent site policies outside of user-initiated testing.

---

## 2. Разрешение `activeTab`

**Текст для поля (RU):**

> Разрешение `activeTab` нужно, чтобы при явном действии пользователя (открытие попапа, запуск записи или воспроизведения) временно получать доступ к активной вкладке для внедрения сценариев записи/воспроизведения и связанных операций только на той вкладке, с которой пользователь работает в рамках теста. Доступ не используется в фоне без действия пользователя.

**EN:**

> `activeTab` is required so that, on explicit user action (e.g. opening the popup or starting record/replay), the extension can temporarily access the active tab to run recording/playback logic only for the tab the user is testing. It is not used for background access without user action.

---

## 3. Разрешение `clipboardRead`

**Текст для поля (RU):**

> `clipboardRead` используется только в контексте сценариев тестирования и интерфейса расширения: чтение буфера обмена по действию пользователя (например, вставка значения в шаг теста или в поле редактора), когда пользователь явно запускает операцию, предполагающую вставку из буфера. Данные не отправляются на серверы разработчика и не читаются без связи с заявленными функциями теста.

**EN:**

> `clipboardRead` is used only for test scenarios and the extension UI when the user explicitly performs a paste-related action (e.g. inserting a value into a test step or editor field). Clipboard data is not uploaded to the developer’s servers and is not read outside stated testing features.

---

## 4. Разрешение `clipboardWrite`

**Текст для поля (RU):**

> `clipboardWrite` используется, чтобы по команде пользователя копировать в буфер обмена служебную информацию для тестирования: селекторы, фрагменты отчёта, значения полей в рамках сценария. Запись выполняется только при действии пользователя в интерфейсе расширения или при выполнении шага сценария, инициированного пользователем.

**EN:**

> `clipboardWrite` is used when the user explicitly copies testing-related data to the clipboard (selectors, report snippets, field values) from the extension UI or during a user-initiated scenario step.

---

## 5. Разрешение `debugger`

**Текст для поля (RU):**

> `debugger` подключается к выбранной вкладке только для вызовов Chrome DevTools Protocol по запросу функций расширения (например, полноразмерный скриншот страницы для шага теста). Подключение временное: после выполнения команды отладчик отключается. Разрешение не используется для удалённого управления браузером третьими лицами и не применяется для постоянного контроля вкладки.

**EN:**

> `debugger` attaches to the user-selected tab only to run Chrome DevTools Protocol commands needed for extension features (e.g. full-page screenshot for a test step). Attachment is temporary and detached afterward. It is not used for third-party remote control or persistent monitoring.

---

## 6. Разрешение `downloads`

**Текст для поля (RU):**

> `downloads` нужен, чтобы сохранять в папку «Загрузки» файлы, которые пользователь экспортирует из расширения: отчёты, экспорт тестов, видео записи прогона, скриншоты и другие артефакты по явной команде «Сохранить» / «Экспорт». При необходимости расширение управляет только теми загрузками, которые создало само. Файлы не отправляются на сервер разработчика автоматически.

**EN:**

> `downloads` saves user-requested exports to the Downloads folder (reports, test exports, run videos, screenshots). The extension may manage only download entries it created. Files are not automatically uploaded to the developer’s servers.

---

## 7. Разрешение `offscreen`

**Текст для поля (RU):**

> `offscreen` используется для создания фонового документа Offscreen Document в соответствии с требованиями Manifest V3 при записи видео прогона теста с вкладки (обработка медиапотока в связке с `tabCapture`). Документ создаётся только для заявленной функции записи и не используется для скрытой обработки несвязанного контента.

**EN:**

> `offscreen` creates an MV3 offscreen document to process media when recording test-run video from a tab (together with `tabCapture`). It is only used for that stated recording feature.

---

## 8. Разрешение `scripting`

**Текст для поля (RU):**

> `scripting` требуется для программного внедрения в страницу заранее включённых в пакет расширения скриптов записи и воспроизведения (`chrome.scripting.executeScript` / зарегистрированные content scripts), когда пользователь запускает запись или прогон теста на выбранной вкладке. Используются только файлы из пакета расширения, а не произвольный код из сети.

**EN:**

> `scripting` injects bundled extension scripts for record/replay when the user runs a test on a tab. Only package files are injected, not arbitrary remote scripts.

---

## 9. Разрешение `storage`

**Текст для поля (RU):**

> `storage` (chrome.storage) используется для локального хранения в браузере пользователя: сохранённые тесты, настройки расширения, журналы прогонов и кэши, необходимые для работы редактора и воспроизведения. Данные не синхронизируются на сервер разработчика по умолчанию только из-за наличия этого разрешения.

**EN:**

> `storage` persists tests, settings, run logs, and caches locally in the user’s browser. It does not by itself upload data to the developer’s servers.

---

## 10. Разрешение `tabCapture`

**Текст для поля (RU):**

> `tabCapture` используется для получения идентификатора медиапотока выбранной вкладки и записи видео воспроизведения теста в файл по инициативе пользователя (отчёты, демонстрация дефектов). Запись не ведётся без действия пользователя, связанного с функцией записи прогона.

**EN:**

> `tabCapture` obtains a tab media stream ID to record test playback video to a file when the user enables that feature. Recording does not run without user-initiated run recording.

---

## 11. Разрешение `tabs`

**Текст для поля (RU):**

> `tabs` нужен для функций сценария: получение списка вкладок, переключение между вкладками в многошаговых тестах, определение активной вкладки при записи и воспроизведении, открытие URL из шага теста. Доступ используется только в контексте запускаемых пользователем сценариев тестирования и интерфейса расширения.

**EN:**

> `tabs` supports test flows: listing/switching tabs, resolving the active tab during record/replay, and opening URLs from test steps—only within user-driven testing and the extension UI.

---

## 12. Разрешение `webRequest`

**Текст для поля (RU):**

> `webRequest` используется для мониторинга HTTP-запросов вкладки, когда пользователь включает соответствующую функцию: сохраняются метаданные (URL, метод, код ответа, время, ошибки) для отчётов и анализа сети в рамках теста. Расширение не модифицирует трафик в рекламных целях и не собирает тела запросов/ответов для передачи третьим лицам вне заявленного функционала.

**EN:**

> `webRequest` monitors tab HTTP requests when the user enables network monitoring, storing metadata (URL, method, status, timing) for test reports. It does not alter traffic for ads or exfiltrate request/response bodies beyond stated features.

---

## 13. Доступ к хостам / Host permissions (`<all_urls>`)

**Текст для поля (RU):**

> Доступ ко всем URL (`<all_urls>`) необходим, потому что пользователь проверяет свои приложения на произвольных адресах: корпоративные стенды, localhost, облачные сервисы. Заранее перечислить домены невозможно. Контент-скрипты и API расширения работают в контексте страниц, где пользователь сам запускает запись или воспроизведение теста; расширение не предназначено для скрытого сбора данных с сайтов вне сценария тестирования.

**EN:**

> Host access to `<all_urls>` is required because users test apps on arbitrary URLs (staging, localhost, SaaS). Domains cannot be listed upfront. Content scripts run on pages where the user starts record/replay; the extension is not for covert data collection outside user-initiated testing.

---

## 14. Удалённый код / Remote code

**Текст для поля (RU):**

> Расширение не загружает и не выполняет исполняемый код с удалённых серверов. Весь код расширения поставляется внутри пакета, прошедшего проверку магазина. Произвольный JavaScript в шагах теста вводится самим пользователем в редакторе сценария и выполняется локально при воспроизведении; это не загрузка кода по URL из интернета. Используются стандартные API (`chrome.scripting`, зарегистрированные content scripts, `importScripts` только для файлов из пакета в service worker).

**EN:**

> The extension does not download or execute code from remote servers. All extension code is bundled in the package. Custom JavaScript in test steps is typed by the user in the editor and runs locally during replay—not fetched from the web. APIs used include bundled `chrome.scripting`/content scripts and `importScripts` only for packaged files in the service worker.

---

## Не текстовые пункты (чеклист, не вставлять в поля)

Сделайте вручную в консоли разработчика:

1. **Аккаунт → контактный e-mail** — укажите адрес и **подтвердите** его по ссылке из письма Google.
2. **Конфиденциальность** — заполните декларацию данных и укажите URL политики (например, `PRIVACY_EN.md` в репозитории), отметьте соответствие **Правилам программы для разработчиков** Chrome Web Store.
3. При смене разрешений обновите этот файл и поля в дашборде.

---

*Версия текста: согласовано с расширением AutoTest Recorder & Player, manifest v0.9.7.1.*
