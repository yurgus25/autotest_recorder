# 🎬 AutoTest Recorder & Player

[Русский](README.md) | **English**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore/search/AutoTest%20Recorder%20%26%20Player) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)

A **Google Chrome** extension (**Manifest V3**) for **no-code** web test automation: record user actions, edit scenarios in a visual editor, and replay them with smart waits, self-healing selectors, rich logs, and screenshots.

**Repository:** [github.com/yurgus25/autotest_recorder](https://github.com/yurgus25/autotest_recorder/)

---

## Version & changelog

Current tree **0.9.7.2** — see [**CHANGELOG_EN.md**](CHANGELOG_EN.md) and [**CHANGELOG.md**](CHANGELOG.md) (including differences vs the latest [Chrome Web Store](https://chrome.google.com/webstore) build if you install from there).

---

## Installation

### From GitHub Releases (recommended for sideloading / testing)

1. Open [**Releases**](https://github.com/yurgus25/autotest_recorder/releases).
2. Download **`autotest-recorder-<version>.zip`** for the release you need (the zip contains the extension root with `manifest.json`).
3. Unzip to any folder.
4. Open `chrome://extensions/`, enable **Developer mode**.
5. Click **Load unpacked** and select the folder that **contains** `manifest.json` (not the `.zip` file itself).

The release zip is produced by the [**Release extension zip**](https://github.com/yurgus25/autotest_recorder/actions) workflow (push a `v*` tag or **Run workflow** with a tag such as `v0.9.7.2`).

### Clone the repository

```bash
git clone https://github.com/yurgus25/autotest_recorder.git
cd autotest_recorder
```

Then steps 4–5 above using the **repository root** as the folder.

### Build a zip locally (Windows)

In a full clone (release zips contain only extension files, not the `scripts` folder):

```powershell
.\scripts\build-release.ps1
```

Output: `dist/autotest-recorder-<version>.zip`.

---

## 💝 Support the project

| Channel | Link |
|---------|------|
| 💬 **Telegram** | [@autotest_recorder](https://t.me/autotest_recorder) |
| 👤 **Author** | Iurii (Юрий) |

---

## ✨ Features

### 🎥 Recording

- Automatic capture of clicks, typing, navigation
- Smart selectors (CSS, XPath, attributes), self-healing
- Complex widgets: dropdowns, multiselect, autocomplete, Angular `app-select`, CDK overlays

### 📝 Visual editor

- **Quick Steps** grouped actions
- Drag & drop reordering
- Variables `{var:name}`
- Conditions, loops, API steps, analytics, and more

### ▶️ Playback

- Smart waits, speed optimizations
- Screenshots and detailed logs

### 📊 Analytics

- Run history, charts, CSV export

---

## 🚀 Quick start

1. Install from the [Chrome Web Store](https://chrome.google.com/webstore/search/AutoTest%20Recorder%20%26%20Player) **or** from [Releases](https://github.com/yurgus25/autotest_recorder/releases).
2. Open the extension **popup**.
3. **Record** your flow, stop recording, **save** the test.
4. Edit in the **editor** if needed, then **run** playback and inspect logs/screenshots.

---

## 📋 Supported actions (overview)

| Category | Examples |
|----------|----------|
| 🖱️ Clicks | click, dblclick, right-click, hover |
| ⌨️ Input | type, clear, keyboard shortcuts |
| 📝 Forms | select, checkbox, radio, file upload |
| 🧭 Navigation | goto, back/forward, refresh, tabs |
| ✅ Assertions | value, visibility, count, … |
| ⏳ Waits | element, text, delays |
| 📸 Screenshots | element / full page |
| 🔄 Variables | set, extract, compute |
| 🌐 API | GET, POST, … with variables |
| 💻 JavaScript | custom step code |

See [`shared/action-types.js`](shared/action-types.js) and the editor UI for the full list.

---

## 🎯 Sample test case (JSON fragment)

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

## 🏗️ Architecture (simplified)

```
autotest-recorder/
├── background/              # Service Worker (MV3)
│   ├── background-sw.js
│   └── message-handlers-sw.js
├── content/
│   ├── recorder.js
│   ├── player-core.js
│   ├── player-handlers-*.js
│   ├── selector-engine.js
│   └── …
├── editor/
├── popup/
├── selector-analyzer/
├── shared/
├── _locales/                # Chrome manifest strings (en / ru); see chrome.i18n
├── browser-mcp/             # Cursor Browser MCP JSON templates (see README)
├── i18n/
└── manifest.json
```

---

## 🔧 Tech stack

- **Manifest V3**, **Chrome Extensions API**
- Content scripts, self-healing selectors, CSP-aware execution where applicable

---

## 🔐 Privacy & permissions (Chrome Web Store)

Publishing on the [Chrome Web Store](https://chrome.google.com/webstore/devconsole/) requires store copy and a privacy policy that match how the extension actually behaves. Full rationale for sensitive permissions, form-ready paragraphs, and reviewer-facing wording:

- [**PRIVACY_EN.md**](PRIVACY_EN.md) — privacy policy and permission rationale (EN)
- [**PRIVACY.md**](PRIVACY.md) — Russian version of the same document

Topics covered: **`debugger`** (full-page screenshot via DevTools Protocol), **`tabCapture`** + **`offscreen`** (optional video capture of a test run), **`webRequest`** (request metadata when network monitoring is on), **`<all_urls>`** (tests on user-chosen URLs), **`clipboard`**, **`downloads`**, **`tabs`** / **`scripting`** / **`activeTab`**, and **user-authored JavaScript** in test steps (local execution, not remote code loading).

Official references: [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/), [user data FAQ](https://developer.chrome.com/docs/webstore/user-data/).

---

## 🗺️ Roadmap

- Continuous improvements to recording, playback, and UI  
- Broader AI / visual testing / cloud sync — follow [Issues](https://github.com/yurgus25/autotest_recorder/issues) / [Discussions](https://github.com/yurgus25/autotest_recorder/discussions)

---

## 💎 Premium (planned)

Some features may be gated behind premium / license flags — see [`background/feature-flags.js`](background/feature-flags.js) and the in-app UI. Monetization options (Russian doc): [**docs/COMMERCIAL_STRATEGY.md**](docs/COMMERCIAL_STRATEGY.md).

---

## 📚 Documentation

- [**CHANGELOG_EN.md**](CHANGELOG_EN.md) / [**CHANGELOG.md**](CHANGELOG.md)
- [**CWS/**](CWS/) — listing copy, URLs, and asset specs for the [Chrome Web Store](https://chrome.google.com/webstore/devconsole/)
- [**USER_AGREEMENT_EN.md**](USER_AGREEMENT_EN.md) / [**USER_AGREEMENT.md**](USER_AGREEMENT.md) — terms of service / user agreement
- [**PRIVACY_EN.md**](PRIVACY_EN.md) / [**PRIVACY.md**](PRIVACY.md) — privacy & Chrome Web Store permission rationale
- [**help/**](help/) — built-in help pages
- [**background/BUILD.md**](background/BUILD.md) — service worker build notes

---

## 🤝 Contributing

1. Fork the repo  
2. Create a `feature/…` branch  
3. Open a Pull Request to `main`

---

## 💬 Support

| Type | Link |
|------|------|
| 🐛 Issues / ideas | [GitHub Issues](https://github.com/yurgus25/autotest_recorder/issues) |
| 💬 Telegram | [@autotest_recorder](https://t.me/autotest_recorder) |
| 🔐 Privacy | [guscshin@gmail.com](mailto:guscshin@gmail.com) — see [PRIVACY_EN.md](PRIVACY_EN.md) §10 |

---

## 📝 License

**MIT** — see [LICENSE](LICENSE).

---

**AutoTest Recorder & Player** — no-code web test automation.
