# 🎬 AutoTest Recorder & Player

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v0.9.4-blue?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![GitHub Stars](https://img.shields.io/github/stars/yurgus25/autotest_recorder?style=social)](https://github.com/yurgus25/autotest_recorder/stargazers)

**Мощное расширение для браузера для автоматизации тестирования веб-приложений без написания кода.**

Записывайте действия пользователя, редактируйте тест-кейсы в визуальном редакторе и воспроизводите их автоматически. Идеально для QA-инженеров, разработчиков и всех, кто хочет сэкономить время на рутинном тестировании.

---

## 💝 Поддержать проект

Если проект помогает вам в работе, рассмотрите возможность поддержки разработки:

| Способ | Реквизиты |
|--------|-----------|
| 💳 **Т-Банк карта** | `4377 7237 7039 5626` |
| 💬 **Telegram** | [@autotest_recorder](https://t.me/autotest_recorder) |
| 👤 **Контакт** | Юрий (Iurii) |

**Спонсоры получают:**
- 🎖️ Значок в README
- 🚀 Ранний доступ к новым функциям
- 📧 Приоритетная поддержка
- 💬 Голос в roadmap

---

## ✨ Возможности

### 🎥 Запись действий
- **Автоматическая запись** кликов, ввода текста, навигации
- **Умные селекторы** — несколько стратегий поиска элементов (CSS, XPath, атрибуты)
- **Self-healing** — автоматическое восстановление сломанных селекторов
- **Поддержка сложных элементов** — dropdown, multiselect, autocomplete

### 📝 Визуальный редактор
- **Quick Steps** — 16 групп, 88 готовых операций
- **Drag & Drop** — перетаскивание шагов
- **Переменные** — `{var:name}` для динамических значений
- **Условия и циклы** — if/else, while-циклы
- **API шаги** — HTTP запросы с подстановкой переменных

### ▶️ Воспроизведение
- **Умное ожидание** — автоматическое ожидание элементов
- **Оптимизация скорости** — пропуск ненужных ожиданий
- **Скриншоты** — захват экрана на каждом шаге
- **Детальные логи** — отладка с подробными сообщениями

### 📊 Аналитика
- **История прогонов** — статистика успешности
- **Графики** — тренды успешности и длительности
- **Экспорт** — CSV для отчётов

---

## 🚀 Быстрый старт

### Установка

#### Chrome Web Store (рекомендуется)
1. Найдите **"AutoTest Recorder & Player"** в Chrome Web Store
2. Нажмите "Установить"

#### Из исходников
```bash
# Клонировать репозиторий
git clone https://github.com/yurgus25/autotest_recorder.git
cd autotest-recorder

# Загрузить в Chrome
# 1. Откройте chrome://extensions/
# 2. Включите "Режим разработчика"
# 3. Нажмите "Загрузить распакованное расширение"
# 4. Выберите папку проекта
```

### Первая запись

1. **Откройте попап** — кликните на иконку расширения
2. **Начните запись** — нажмите "🔴 Записать"
3. **Выполните действия** — кликайте, вводите текст, навигируйте
4. **Остановите запись** — нажмите "⏹ Стоп"
5. **Сохраните тест** — введите имя и нажмите "Сохранить"

### Воспроизведение

1. **Выберите тест** — в списке сохранённых тестов
2. **Нажмите "▶ Воспроизвести"**
3. **Наблюдайте за выполнением** — логи в реальном времени
4. **Анализируйте результат** — скриншоты, ошибки, рекомендации

---

## 📋 Поддерживаемые действия

| Категория | Действия |
|-----------|----------|
| 🖱️ **Клики** | click, dblclick, right-click, hover |
| ⌨️ **Ввод** | type, clear, keyboard shortcuts |
| 📝 **Формы** | select, checkbox, radio, file upload |
| 🧭 **Навигация** | goto, back, forward, refresh, new tab, close tab |
| ✅ **Проверки** | assert value, assert visible, assert count |
| ⏳ **Ожидание** | wait element, wait text, wait timeout |
| 📸 **Скриншоты** | element screenshot, full page |
| 🔄 **Переменные** | set, extract, calculate, from URL |
| 🌐 **API** | GET, POST, PUT, DELETE с переменными |
| 💻 **JavaScript** | выполнение произвольного кода |
| 🍪 **Cookies** | set, get, delete |

---

## 🎯 Пример тест-кейса

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

---

## 🏗️ Архитектура

```
autotest-recorder/
├── background/          # Service Worker (Manifest V3)
│   ├── background.js    # Главная логика background
│   └── message-handlers.js  # Обработчики сообщений
├── content/             # Content Scripts
│   ├── recorder.js      # Запись действий
│   ├── player.js        # Воспроизведение
│   └── selector-engine.js   # Поиск элементов
├── editor/              # Визуальный редактор
│   ├── editor.html      # UI редактора
│   └── editor.js        # Логика редактора
├── popup/               # Попап расширения
├── shared/              # Общие модули
│   ├── action-types.js  # Единый источник типов
│   └── utils.js         # Утилиты
└── i18n/                # Локализация (EN/RU)
```

---

## 🔧 Технологии

- **Manifest V3** — современный стандарт Chrome Extensions
- **Content Scripts** — инъекция в веб-страницы
- **Chrome APIs** — storage, tabs, scripting, downloads
- **Self-healing selectors** — несколько стратегий поиска
- **CSP bypass** — выполнение JS на строгих сайтах

---

## 🗺️ Roadmap

### v0.9.5 (Текущая разработка)
- [x] Исправления записи (dblclick, select)
- [x] Улучшения UI

### v1.0.0 (Планируется)
- [ ] 🤖 **AI-функции** — умные селекторы, анализ стабильности
- [ ] 📱 **Мобильные жесты** — swipe, pinch, rotate
- [ ] 👁️ **Visual Testing** — сравнение скриншотов

### v1.1.0 (Будущее)
- [ ] ☁️ **Облачная синхронизация** тестов
- [ ] 👥 **Командная работа** — шаринг тестов
- [ ] 📊 **Расширенная аналитика** — дашборд метрик

---

## 💎 Premium (Планируется)

| Функция | Free | Premium |
|---------|------|---------|
| Запись тестов | ✅ | ✅ |
| Воспроизведение | ✅ | ✅ |
| Quick Steps | ✅ 88 операций | ✅ 88+ операций |
| AI-селекторы | ❌ | ✅ |
| Visual Testing | ❌ | ✅ |
| Облачная синхронизация | ❌ | ✅ |
| Командная работа | ❌ | ✅ |
| Приоритетная поддержка | ❌ | ✅ |

---

## 📚 Документация

- **[Инструкция по работе](docs/ИНСТРУКЦИЯ.md)** — полное руководство пользователя
- **[Формат тест-кейсов](docs/TEST_CASE_FORMAT.md)** — структура JSON

---

## 📜 Лицензионные документы

- **[MIT License](LICENSE)** — лицензия на использование кода
- **[Политика конфиденциальности](docs/PRIVACY_POLICY.md)** — обработка данных

---

## 🤝 Участие в разработке

Мы приветствуем вклад в развитие проекта!

1. Fork репозитория
2. Создайте ветку: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Откройте Pull Request

---

## 🌟 Спонсоры

<!-- Спонсоры будут добавлены здесь -->

*Станьте первым спонсором! [Поддержать проект](#-поддержать-проект)*

---

## 📝 Лицензия

MIT License — используйте свободно в коммерческих и некоммерческих проектах.

См. файл [LICENSE](LICENSE) для полной информации.

---

## 💬 Поддержка

| Тип | Канал |
|-----|-------|
| 🐛 Баги | [GitHub Issues](https://github.com/yurgus25/autotest_recorder/issues) |
| 💡 Идеи | [GitHub Discussions](https://github.com/yurgus25/autotest_recorder/discussions) |
| 💬 Telegram | [@autotest_recorder](https://t.me/autotest_recorder) |
| 👤 Контакт | Юрий (Iurii) |

---

<p align="center">
  <b>AutoTest Recorder & Player</b><br>
  <i>Автоматизация тестирования без кода</i>
  <br><br>
  <a href="#-поддержать-проект">💝 Поддержать проект</a>
</p>
