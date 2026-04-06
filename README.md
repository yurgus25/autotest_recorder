# 🎬 AutoTest Recorder & Player

**Русский** | [English](README_EN.md)

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore/search/AutoTest%20Recorder%20%26%20Player) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)

**Мощное расширение для браузера** для автоматизации тестирования веб-приложений **без написания кода.** Записывайте действия пользователя, редактируйте тест-кейсы в визуальном редакторе и воспроизводите их автоматически. Подходит для QA, разработчиков и всех, кто хочет сократить рутину ручных проверок.

**Репозиторий:** [github.com/yurgus25/autotest_recorder](https://github.com/yurgus25/autotest_recorder/)

---

## Версия и журнал изменений

Текущая ветка **0.9.7.2** — подробности в [**CHANGELOG.md**](CHANGELOG.md) (в том числе отличия от последней сборки в [Chrome Web Store](https://chrome.google.com/webstore), если вы ставите расширение оттуда).

Кратко на английском: [**CHANGELOG_EN.md**](CHANGELOG_EN.md).

---

## Установка

### С GitHub Releases (рекомендуется для разработки и тестов без Store)

1. Откройте [**Releases**](https://github.com/yurgus25/autotest_recorder/releases).
2. Скачайте **`autotest-recorder-<версия>.zip`** у нужного релиза (в архиве — готовая папка расширения, в корне лежит `manifest.json`).
3. Распакуйте архив в любую папку.
4. В Chrome откройте `chrome://extensions/`, включите **«Режим разработчика»**.
5. Нажмите **«Загрузить распакованное расширение»** и укажите **папку**, в которой находится `manifest.json` (не файл zip).

Архив для релизов собирается workflow [**Release extension zip**](https://github.com/yurgus25/autotest_recorder/actions) (пуш тега `v*` или запуск вручную: *Run workflow* → тег, например `v0.9.7.2`).

### Клон репозитория

```bash
git clone https://github.com/yurgus25/autotest_recorder.git
cd autotest_recorder
```

Далее шаги 4–5 как выше, выбрав **корень клона** (где лежит `manifest.json`).

### Сборка zip локально (Windows)

В полном клоне (в готовый zip скрипты сборки не входят — только файлы расширения):

```powershell
.\scripts\build-release.ps1
```

Результат: `dist/autotest-recorder-<версия>.zip`.

---

## 💝 Поддержать проект

Если инструмент полезен в работе, вы можете поддержать развитие:

| Способ | Реквизиты |
|--------|-----------|
| 💬 **Telegram** | [@autotest_recorder](https://t.me/autotest_recorder) |
| 👤 **Автор** | Юрий (Iurii) |

---

## ✨ Возможности

### 🎥 Запись действий

- **Автоматическая запись** кликов, ввода, навигации
- **Умные селекторы** — CSS, XPath, атрибуты, self-healing
- **Сложные элементы:** dropdown, multiselect, autocomplete, Angular `app-select`, CDK Overlay

### 📝 Визуальный редактор

- **Quick Steps** — готовые операции по группам
- **Drag & Drop** шагов
- **Переменные** `{var:name}`
- **Условия и циклы**, **API-шаги**, аналитика и многое другое

### ▶️ Воспроизведение

- **Умные ожидания**, оптимизация скорости
- **Скриншоты** и подробные **логи**

### 📊 Аналитика

- История прогонов, графики, экспорт (в т.ч. CSV)

---

## 🚀 Быстрый старт

1. Установите расширение из [Chrome Web Store](https://chrome.google.com/webstore/search/AutoTest%20Recorder%20%26%20Player) **или** из [Releases](https://github.com/yurgus25/autotest_recorder/releases) (см. выше).
2. Откройте **попап** расширения по иконке.
3. Нажмите **«Записать»**, выполните сценарий на странице, остановите запись.
4. Сохраните тест, при необходимости отредактируйте в **редакторе**.
5. Запустите **воспроизведение** и смотрите логи / скриншоты.

---

## 📋 Поддерживаемые действия (кратко)

| Категория | Примеры |
|-----------|---------|
| 🖱️ Клики | click, dblclick, right-click, hover |
| ⌨️ Ввод | type, clear, сочетания клавиш |
| 📝 Формы | select, checkbox, radio, file upload |
| 🧭 Навигация | переход, назад/вперёд, обновление, вкладки |
| ✅ Проверки | assert (значение, видимость, количество и др.) |
| ⏳ Ожидание | wait element, wait text, задержки |
| 📸 Скриншоты | элемент, страница |
| 🔄 Переменные | set, extract, вычисления |
| 🌐 API | GET, POST, … с подстановкой переменных |
| 💻 JavaScript | произвольный код в шаге |

Полный перечень и подтипы — в редакторе и в коде [`shared/action-types.js`](shared/action-types.js).

---

## 🎯 Пример тест-кейса (фрагмент JSON)

```json
{
  "name": "Login Test",
  "actions": [
    { "type": "navigation", "url": "https://example.com/login" },
    { "type": "type", "selector": "#email", "value": "test@example.com" },
    { "type": "type", "selector": "#password", "value": "{var:password}" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "assert", "subtype": "assert-contains", "selector": ".welcome", "expectedValue": "Welcome" }
  ]
}
```

Подробный формат тест-кейсов см. во встроенной справке [`help/`](help/) и в коде редактора.

---

## 🏗️ Архитектура (упрощённо)

```
autotest-recorder/
├── background/              # Service Worker (Manifest V3)
│   ├── background-sw.js     # основная логика
│   └── message-handlers-sw.js
├── content/                 # Content scripts
│   ├── recorder.js          # запись
│   ├── player-core.js       # воспроизведение (ядро)
│   ├── player-handlers-*.js # обработчики действий
│   ├── selector-engine.js
│   └── …
├── editor/                  # Визуальный редактор
├── popup/                   # Попап расширения
├── selector-analyzer/       # Анализатор селекторов
├── shared/                  # Общие модули (типы, утилиты)
├── _locales/                # Имя и описание для Chrome (en / ru), см. chrome.i18n
├── browser-mcp/             # JSON-шаблоны для Cursor Browser MCP + см. README
├── i18n/                    # Локализация UI (en.json / ru.json, i18n.js)
├── analytics/, screenshots/, settings/, …
└── manifest.json
```

---

## 🔧 Технологии

- **Manifest V3**, **Chrome Extensions API** (storage, tabs, scripting, …)
- **Content scripts**, self-healing селекторы, работа со строгим CSP где применимо

---

## 🔐 Приватность и разрешения (Chrome Web Store)

Публикация в [Chrome Web Store](https://chrome.google.com/webstore/devconsole/) требует согласованного описания и политики конфиденциальности с реальным поведением расширения. Подробные формулировки для формы разработчика, обоснование «сильных» разрешений и готовые абзацы для модерации:

- [**PRIVACY.md**](PRIVACY.md) — политика и обоснование разрешений (RU)
- [**PRIVACY_EN.md**](PRIVACY_EN.md) — то же на английском (для англоязычной карточки и ответов ревью)

Там же расписано: **`debugger`** (полноразмерный скриншот через DevTools Protocol), **`tabCapture`** + **`offscreen`** (запись видео прогона), **`webRequest`** (метаданные сети при включённом мониторинге), **`<all_urls>`** (тесты на любых URL по выбору пользователя), **`clipboard`**, **`downloads`**, **`tabs`** / **`scripting`** / **`activeTab`**, а также выполнение **пользовательского JavaScript** в шагах теста (локально, не удалённый код).

Официальные требования: [программа Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/), [данные пользователей](https://developer.chrome.com/docs/webstore/user-data/).

---

## 🗺️ Roadmap (ориентиры)

- Дальнейшее улучшение записи и UI
- Развитие AI-возможностей, визуального тестирования, облачной синхронизации — см. обсуждения в репозитории

---

## 💎 Premium (планы)

Часть функций может выделяться в расширенную лицензию (группы тестов, расширенный анализ и т.д.) — актуальное поведение смотрите в [`background/feature-flags.js`](background/feature-flags.js) и в интерфейсе расширения. Варианты монетизации и перехода с полностью бесплатной модели: [**docs/COMMERCIAL_STRATEGY.md**](docs/COMMERCIAL_STRATEGY.md).

---

## 📚 Документация

- [**CHANGELOG.md**](CHANGELOG.md) — список изменений по версиям
- [**CWS/**](CWS/) — тексты, URL и графика для карточки [Chrome Web Store](https://chrome.google.com/webstore/devconsole/)
- [**USER_AGREEMENT.md**](USER_AGREEMENT.md) / [**USER_AGREEMENT_EN.md**](USER_AGREEMENT_EN.md) — пользовательское соглашение
- [**PRIVACY.md**](PRIVACY.md) / [**PRIVACY_EN.md**](PRIVACY_EN.md) — конфиденциальность и разрешения для Chrome Web Store
- [**help/**](help/) — встроенная справка (HTML)
- [**background/BUILD.md**](background/BUILD.md) — сборка service worker (esbuild)

---

## 🤝 Участие в разработке

1. Fork репозитория  
2. Ветка `feature/…`  
3. Pull Request в `main`

---

## 💬 Поддержка

| Тип | Ссылка |
|-----|--------|
| 🐛 Баги / идеи | [Issues](https://github.com/yurgus25/autotest_recorder/issues) |
| 💬 Telegram | [@autotest_recorder](https://t.me/autotest_recorder) |
| 🔐 Конфиденциальность | [guscshin@gmail.com](mailto:guscshin@gmail.com) — см. [PRIVACY.md](PRIVACY.md) §10 |

---

## 📝 Лицензия

**MIT** — см. файл [LICENSE](LICENSE).

---

**AutoTest Recorder & Player** — автоматизация тестирования без кода.
