# 🎬 AutoTest Recorder & Player

[![Русский](https://img.shields.io/badge/README-Русский-blue)](README.md) | [![English](https://img.shields.io/badge/README-English-lightgrey)](README_EN.md)

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v1.9.4-blue?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![GitHub Stars](https://img.shields.io/github/stars/yurgus25/autotest_recorder?style=social)](https://github.com/yurgus25/autotest_recorder/stargazers)

**A powerful browser extension for web application test automation without writing code.**

Record user actions, edit test cases in a visual editor, and replay them automatically. Perfect for QA engineers, developers, and anyone who wants to save time on routine testing.


---

## 💝 Support the Project

If this project helps you in your work, consider supporting the development:

| Method | Details |
|--------|---------|
| 💳 **T-Bank Card** | `4377 7237 7039 5626` |
| 💬 **Telegram** | [@autotest_recorder](https://t.me/autotest_recorder) |
| 👤 **Contact** | Yuri (Iurii) |

**Sponsors receive:**
- 🎖️ Badge in README
- 🚀 Early access to new features
- 📧 Priority support
- 💬 Voice in roadmap

---

## ✨ Features

### 🎥 Action Recording
- **Automatic recording** of clicks, text input, navigation
- **Smart selectors** — multiple element finding strategies (CSS, XPath, attributes)
- **Self-healing** — automatic recovery of broken selectors
- **Complex element support** — dropdown, multiselect, autocomplete

### 📝 Visual Editor
- **Quick Steps** — 16 groups, 88 ready-to-use operations
- **Drag & Drop** — step reordering
- **Variables** — `{var:name}` for dynamic values
- **Conditions and loops** — if/else, while-loops
- **API steps** — HTTP requests with variable substitution

### ▶️ Playback
- **Smart waiting** — automatic element waiting
- **Speed optimization** — skip unnecessary waits
- **Screenshots** — screen capture at each step
- **Detailed logs** — debugging with verbose messages

### 📊 Analytics
- **Run history** — success rate statistics
- **Charts** — success and duration trends
- **Export** — CSV for reports

---

## 🚀 Quick Start

### Installation

#### Chrome Web Store (recommended)
1. Find **"AutoTest Recorder & Player"** in Chrome Web Store
2. Click "Install"

#### From Source
```bash
# Clone the repository
git clone https://github.com/yurgus25/autotest_recorder.git
cd autotest-recorder

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked extension"
# 4. Select the project folder
```

### First Recording

1. **Open popup** — click the extension icon
2. **Start recording** — click "🔴 Record"
3. **Perform actions** — click, type, navigate
4. **Stop recording** — click "⏹ Stop"
5. **Save test** — enter name and click "Save"

### Playback

1. **Select test** — from the saved tests list
2. **Click "▶ Play"**
3. **Watch execution** — real-time logs
4. **Analyze result** — screenshots, errors, recommendations

---

## 📋 Supported Actions

| Category | Actions |
|----------|---------|
| 🖱️ **Clicks** | click, dblclick, right-click, hover |
| ⌨️ **Input** | type, clear, keyboard shortcuts |
| 📝 **Forms** | select, checkbox, radio, file upload |
| 🧭 **Navigation** | goto, back, forward, refresh, new tab, close tab |
| ✅ **Assertions** | assert value, assert visible, assert count |
| ⏳ **Waiting** | wait element, wait text, wait timeout |
| 📸 **Screenshots** | element screenshot, full page |
| 🔄 **Variables** | set, extract, calculate, from URL |
| 🌐 **API** | GET, POST, PUT, DELETE with variables |
| 💻 **JavaScript** | execute arbitrary code |
| 🍪 **Cookies** | set, get, delete |

---

## 🎯 Test Case Example

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

## 🏗️ Architecture

```
autotest-recorder/
├── background/          # Service Worker (Manifest V3)
│   ├── background.js    # Main background logic
│   └── message-handlers.js  # Message handlers
├── content/             # Content Scripts
│   ├── recorder.js      # Action recording
│   ├── player.js        # Playback
│   └── selector-engine.js   # Element finding
├── editor/              # Visual Editor
│   ├── editor.html      # Editor UI
│   └── editor.js        # Editor logic
├── popup/               # Extension popup
├── shared/              # Shared modules
│   ├── action-types.js  # Single source of types
│   └── utils.js         # Utilities
└── i18n/                # Localization (EN/RU)
```

---

## 🔧 Technologies

- **Manifest V3** — modern Chrome Extensions standard
- **Content Scripts** — injection into web pages
- **Chrome APIs** — storage, tabs, scripting, downloads
- **Self-healing selectors** — multiple search strategies
- **CSP bypass** — JS execution on strict sites

---

## 🗺️ Roadmap

### v1.9.5 (Current Development)
- [x] Recording fixes (dblclick, select)
- [x] UI improvements

### v2.0.0 (Planned)
- [ ] 🤖 **AI Features** — smart selectors, stability analysis
- [ ] 📱 **Mobile Gestures** — swipe, pinch, rotate
- [ ] 👁️ **Visual Testing** — screenshot comparison

### v2.1.0 (Future)
- [ ] ☁️ **Cloud Sync** — test synchronization
- [ ] 👥 **Team Collaboration** — test sharing
- [ ] 📊 **Advanced Analytics** — metrics dashboard

---

## 💎 Premium (Planned)

| Feature | Free | Premium |
|---------|------|---------|
| Test Recording | ✅ | ✅ |
| Playback | ✅ | ✅ |
| Quick Steps | ✅ 88 operations | ✅ 88+ operations |
| AI Selectors | ❌ | ✅ |
| Visual Testing | ❌ | ✅ |
| Cloud Sync | ❌ | ✅ |
| Team Collaboration | ❌ | ✅ |
| Priority Support | ❌ | ✅ |

---

## 📚 Documentation

- **[User Guide](docs/ИНСТРУКЦИЯ.md)** — complete user manual (Russian)
- **[Test Case Format](docs/TEST_CASE_FORMAT.md)** — JSON structure

---

## 📜 Legal Documents

- **[MIT License](LICENSE)** — code usage license

---

## 🤝 Contributing

We welcome contributions to the project!

1. Fork the repository
2. Create a branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 🌟 Sponsors

<!-- Sponsors will be added here -->

*Become the first sponsor! [Support the project](#-support-the-project)*

---

## 📝 License

MIT License — use freely in commercial and non-commercial projects.

See [LICENSE](LICENSE) file for full information.

---

## 💬 Support

| Type | Channel |
|------|---------|
| 🐛 Bugs | [GitHub Issues](https://github.com/yurgus25/autotest_recorder/issues) |
| 💡 Ideas | [GitHub Discussions](https://github.com/yurgus25/autotest_recorder/discussions) |
| 💬 Telegram | [@autotest_recorder](https://t.me/autotest_recorder) |
| 👤 Contact | Yuri (Iurii) |

---

<p align="center">
  <b>AutoTest Recorder & Player</b><br>
  <i>Codeless Test Automation</i>
  <br><br>
  <a href="#-support-the-project">💝 Support the Project</a>
</p>

