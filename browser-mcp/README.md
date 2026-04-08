# Интеграция с Cursor Browser (MCP)

Цель: из **этого чата** задавать сценарии в виде **JSON-шаблонов** и проходить **тексты/шаги** через встроенный браузер Cursor (**cursor-ide-browser**), не смешивая это с установкой расширения в том же профиле.

## Важное ограничение

**Расширение AutoTest Recorder в окне Cursor Browser обычно не установлено** (отдельный профиль/автоматизация). Эта интеграция даёт:

- страницу **`test-pages/mcp-harness.html`** — поля под текст из чата и сбор JSON «как тест-кейс»;
- файл **`chat-commands.json`** — именованные шаблоны вызовов MCP (`browser_navigate`, `browser_snapshot`, `browser_fill`, `browser_click`).

Реальную запись/плейбек расширения по-прежнему проверяйте в **Chrome с загруженным unpacked / из Store**.

## Окружение

Если **Browser MCP** выполняется не на вашей машине, `http://127.0.0.1:9876` может быть **недоступен** (ошибка загрузки страницы). Тогда используйте тот же harness, открытый через **туннель** или **локальный Cursor**, где браузер и `python -m http.server` работают на одном хосте.

## Быстрый старт

1. В терминале из корня репозитория:

   ```powershell
   .\scripts\serve-test-pages.ps1
   ```

2. В чате попросите агента: *«Открой harness по инструкции browser-mcp, вставь текст …, нажми Собрать JSON»*.

3. Агент должен:
   - вызвать **`browser_navigate`** на `http://127.0.0.1:9876/mcp-harness.html`;
   - **`browser_snapshot`**;
   - подставить **`ref`** из снимка в **`browser_fill`** / **`browser_click`** (см. инструменты **cursor-ide-browser** в Cursor: снимок выдаёт стабильные `ref`);
   - при необходимости повторить snapshot после изменения DOM.

## Файлы

| Файл | Назначение |
|------|------------|
| [chat-commands.json](chat-commands.json) | Имена шаблонов и аргументы MCP (плейсхолдеры `REPLACE_WITH_REF_FROM_SNAPSHOT`) |
| [recipe-schema.json](recipe-schema.json) | Схема для расширения формата |
| [../test-pages/mcp-harness.html](../test-pages/mcp-harness.html) | UI для текста и JSON |

## Команды из чата → JSON

Пользователь может вставить в чат фрагмент текста; агент копирует его в аргумент `text` шаблона `fillChatText` (экранируя кавычки в JSON при необходимости) и выполняет цепочку из `exampleSequence`.

## Ссылки

- [Chrome for Developers — Extensions](https://developer.chrome.com/docs/extensions/) (общий контекст платформы; MCP Browser — инструмент среды Cursor).
