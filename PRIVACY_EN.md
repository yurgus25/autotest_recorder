# Privacy policy and permission rationale (Chrome Web Store)

[Russian](PRIVACY.md) | **English**

This document is meant for the **Privacy** section in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/) and to keep the **short** and **detailed** store listings aligned with actual behavior. See also [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/) and [user data requirements](https://developer.chrome.com/docs/webstore/user-data/).

---

## Single purpose

**AutoTest Recorder & Player** is a browser tool to **record and replay web test scenarios**: capture user actions, edit tests in a visual editor, run them with assertions, logs, and reports. It is not intended to harvest site data for advertising or unrelated purposes.

---

## What data goes where

| Topic | Behavior |
|--------|----------|
| **Developer servers** | The extension does **not** upload your test contents, site passwords, or page content to a mandatory central server simply because it is installed. Network calls to third-party URLs occur only where **you** configure them (e.g. API steps, URLs opened in a scenario) or where an **optional** feature explicitly does so in the UI. |
| **Local storage** | Tests, settings, run history, and related data are stored **locally** in the browser via `chrome.storage` and exported to files (e.g. Downloads) **when you choose to export**. |
| **Third-party analytics** | There is no built-in transmission to ad/analytics networks by default; if such options are added later, they should be optional and reflected here and in the UI. |

Adjust the wording if your build adds cloud sync or telemetry—the rule is **no mismatch** with the shipped code.

---

## Access to all sites (`<all_urls>` / host permissions)

**Why:** Tests run on **URLs you choose**—internal staging, localhost, SaaS apps, etc. The full host list cannot be known in advance.

**How it is used:** Content scripts and related APIs operate in the context of tabs where **you start recording or playback** (and related features). The extension implements stated test-automation behavior; it is not for covert circumvention of site policies.

**Sample store text:**  
*“The &lt;all_urls&gt; host permission is required to record and replay tests on any URL the user opens to test their applications (including corporate and local addresses). Sites cannot be enumerated upfront.”*

---

## Permissions from `manifest.json` — concise rationale

Use the paragraphs below in **permission justification** fields and the **detailed description** where applicable.

### `debugger`

**Why:** Attach to the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) on the selected tab for features not available from plain DOM APIs—especially **full-page screenshots** (`Page.getLayoutMetrics` and related `Page.*` commands). Attachment is **temporary**: attach → commands → detach.

**User note:** Chrome does not allow this path while **built-in DevTools** are open on the same tab for that operation.

**Sample store text:**  
*“The `debugger` permission is used only to capture full-page screenshots via the DevTools Protocol when the user requests it (test step/command). It is not used for remote control by third parties.”*

---

### `tabCapture`

**Why:** Obtain a **tab media stream id** (`chrome.tabCapture.getMediaStreamId`) to **record test playback to a video file**, together with the `offscreen` document and user save settings. This is an optional “record tab video” feature for runs.

**Sample store text:**  
*“`tabCapture` is required to record video of test playback from the chosen tab to a file on user action (reports, bug demos).”*

---

### `webRequest`

**Why:** When **network monitoring** is enabled, the extension collects **request metadata** per tab: URL, method, type, timing, status code, errors—for dashboards, performance views, and network-related checks. The background implementation stores **event metadata**, not a generic full capture of request/response bodies for unrelated tracking.

**Sample store text:**  
*“`webRequest` is used to monitor HTTP requests in the tab (metadata: URL, status, timing) when network monitoring is enabled; not for ad-related traffic modification.”*

---

### `offscreen`

**Why:** Create an **offscreen document** with reason `USER_MEDIA` to process the media stream when **recording video** of a run (paired with `tabCapture`), as required by Manifest V3.

**Sample store text:**  
*“`offscreen` is used for video recording of test playback in a background document per Manifest V3 requirements.”*

---

### `storage`

**Why:** Local persistence for tests, extension settings, caches, and run logs.

---

### `activeTab`, `scripting`, `tabs`

**Why:** Access the **active tab** on user gesture; **inject** scripts for record/replay; **list and switch tabs** for multi-tab flows, navigation, and test-driven window management.

---

### `downloads`

**Why:** Save **exported artifacts** (reports, test exports, video, screenshots) to the user’s Downloads folder on user action; manage download entries created by the extension where needed.

---

### `windows`

**Why:** Open extension windows (editor, fullscreen UI, auxiliary windows), read the current window, close helper windows per UI logic.

---

### `clipboardRead` / `clipboardWrite`

**Why:** Scenario steps and UI that **copy/paste** values (e.g. field values, copying selectors to the clipboard), aligned with user-driven testing actions.

---

### User-authored JavaScript in test steps

Scenarios may execute **code typed by the user** in the editor (custom JS for checks and automation). Execution is **local to the extension** during replay; it is not arbitrary remote code fetched at runtime to bypass store policies.

**Sample store text:**  
*“Custom JavaScript in test steps runs only from user-authored scenarios, locally during playback; the extension does not pull executable code from remote URLs to circumvent Chrome Web Store policies.”*

---

## Store listing checklist

1. Short description: do not promise features you do not ship; state that this is a **QA / test automation** tool.
2. Detailed description: mention that broad site access is needed to run tests on **user-chosen** URLs, using the wording above.
3. Privacy policy URL: point to this document on **GitHub** (or an equivalent public page) after publishing.
4. If reviewers ask about `debugger`, `webRequest`, or `&lt;all_urls&gt;`, reply with a link to this file and the relevant paragraph.

---

## Document version

Aligned with the extension branch whose `manifest.json` version is **0.9.7.1**. Update this file and the Developer Dashboard when permissions change.
