# Privacy Policy — AutoTest Recorder & Player

**[Русская версия](PRIVACY.md)**

**Effective date:** 2026-04-05  
**Extension:** AutoTest Recorder & Player  
**Chrome Web Store ID:** lafiegkhipdflafdgogmmephankkceol  
**Publisher contact:** [gushchin@gmail.com](mailto:gushchin@gmail.com)

---

## Summary

| What | Details |
|------|---------|
| **Data collected** | Page content, URLs, selectors, form values, screenshots, network metadata — only on pages **you choose to test** |
| **Where stored** | **Locally on your device** (`chrome.storage.local`). No mandatory cloud upload. |
| **Shared with** | **Nobody by default.** Only the sites/APIs you configure in test steps, plus normal Chrome browser infrastructure. |
| **Sold or used for ads** | **Never.** |
| **Contact** | [gushchin@gmail.com](mailto:gushchin@gmail.com) |

---

## 1. Who We Are

**AutoTest Recorder & Player** is a browser extension for recording and replaying automated test scenarios on websites. The publisher is identified on the [Chrome Web Store listing](https://chrome.google.com/webstore/detail/lafiegkhipdflafdgogmmephankkceol) and reachable at [gushchin@gmail.com](mailto:gushchin@gmail.com).

---

## 2. What Personal or Sensitive Data Is Collected

This extension is a **QA / test-automation tool**. During recording and playback it processes data on the pages **you open and choose to test**. This may include data in sensitive categories as defined by Chrome Web Store policies:

| Category | What is processed | Where it stays |
|----------|-------------------|----------------|
| **Page content and interactions** | URLs, element selectors, typed text, clicks, navigation events, DOM fragments needed for test steps | Locally in the browser |
| **Form data** | Field values you record in scenarios or supply via variables / CSV rows | Locally in the browser |
| **Network metadata** | When network monitoring is turned on: request URL, method, type, timing, status code, errors. **Request and response bodies are not collected** for unrelated tracking. | Locally in the browser |
| **Screenshots and video** | Full-page screenshots and tab video recordings are created **on your request** (test step or command) and saved to your Downloads folder | Locally; moved to Downloads on your action |
| **Clipboard** | Values copied/pasted in the testing UI or scenario steps | Used in memory; not sent anywhere |
| **User-authored JavaScript** | Code you write in the editor is executed **locally** during test playback | Locally only |

The extension is **not** designed to collect data for advertising, reselling user profiles, or any tracking unrelated to test automation.

---

## 3. How Data Is Used

Data processed by this extension is used **only** for:

- Recording, editing, storing, and replaying your test scenarios.
- Displaying reports, logs, screenshots, network metrics, and performance data **inside the extension UI**.
- Executing scenario steps on the pages you select for testing.
- Optional features (video recording, network monitoring, data-driven CSV runs) strictly as described in the UI and this policy.

---

## 4. How Data Is Stored and for How Long

- **Storage location:** Locally in your browser via `chrome.storage.local`. This extension does **not** use `chrome.storage.sync`, so test data and settings are **never** sent to Chrome Sync or any cloud service via this API.
- **Retention:** Data is kept until you delete tests/settings through the extension UI, clear the extension's data in Chrome settings, or uninstall the extension.
- **No mandatory publisher cloud account** is created simply by installing the extension.

---

## 5. Who Data Is Shared With

| Recipient | Is data sent there? |
|-----------|---------------------|
| **Publisher's servers** | **No.** Test contents, site passwords, and page HTML are **never** uploaded to our servers as a condition of using the extension. |
| **Google / Chrome browser** | Extension APIs run inside Chrome under Google's own policies. We use `chrome.storage.local` only — **no Chrome Sync**. See [Google Privacy Policy](https://policies.google.com/privacy). |
| **Websites and APIs you configure** | **Yes, as you direct.** When you run a scenario that opens a URL, submits a form, or calls an API, normal browser requests are made to those addresses. Use HTTPS where required by those services. |
| **Ad or analytics networks** | **No** built-in data transmission to ad or analytics services by default. Any future opt-in analytics would be disclosed here and in the UI before activation. |
| **License server (optional)** | In the published build, `remoteCheckUrl` is `null` — no remote license check runs. If enabled in a future update, only the data actually sent by that request will be described here. |

We do **not** sell user data or share it for purposes unrelated to test automation.

---

## 6. Security

- Local data is protected by Chrome's extension security model and your operating system.
- Network requests initiated by your test scenarios use the browser's standard networking stack; Chrome's security policies apply (e.g. HTTPS requirements).
- Publisher staff do **not** access your test contents or page data on your device.

---

## 7. Your Rights and Controls

- **View and manage data:** Open the extension popup → Tests list, Settings.
- **Export data:** Use the built-in export feature to download your tests as JSON.
- **Delete data:** Remove individual tests in the popup, or use *Clear all data* in the popup. For a complete wipe, uninstall the extension and clear its storage in Chrome Settings → Privacy and security → Site settings → View permissions and data stored.
- **No account required:** Core functionality works without creating a publisher account.

---

## 8. Children

This product is **not directed at children under 13** (or the age required by applicable law in your jurisdiction). Parents should supervise extension installations on children's devices.

---

## 9. Changes to This Policy

Material changes will be reflected in this document with an updated effective date and, if needed, in the Chrome Web Store listing. The version linked in the Developer Dashboard is authoritative.

---

## 10. Contact

Privacy questions and data requests: **[gushchin@gmail.com](mailto:gushchin@gmail.com)**

---

## 11. Chrome Web Store — Limited Use Compliance

**Affirmative statement (as required by Google):**
> *The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.*

In the context of this extension, "information from Google APIs" includes data processed through Chrome extension platform APIs (tabs, storage, networking, debugger, scripting, etc.) in support of the stated features.

**Limited Use summary:**

- Data collected through Chrome APIs is used **only** to provide and improve the single, narrow purpose of this product: recording, editing, and replaying web test scenarios, as described in the store listing and extension UI.
- Browsing activity (URLs, network metadata) is used **only** as needed for those user-facing features — **not** for personalized advertising, **not** for sale to data brokers, **not** for creditworthiness or other prohibited uses.
- Any transfer to third parties occurs only where permitted by Google's User Data Policy (e.g. necessary for the stated feature, legal requirement, abuse protection) or as explicitly described in Section 5.

---

## 12. Extension Single Purpose

**AutoTest Recorder & Player** is a web test-automation tool: it records user interactions on sites of your choosing, lets you edit those tests in a visual editor, and replays them with assertions, logs, and reports. It is not intended to harvest data from sites for advertising or any purpose unrelated to testing.

---

## 13. Permission Rationale

| Permission | Why it is needed |
|------------|-----------------|
| `<all_urls>` | Tests run on URLs you choose — internal staging, localhost, SaaS, etc. The full host list cannot be known in advance. |
| `debugger` | Full-page screenshots via DevTools Protocol (attach → capture → detach). Not used for remote control by third parties. |
| `tabCapture` | Recording test-run video from the chosen tab to a file on user action. |
| `webRequest` | Collecting request metadata (URL, status, timing) per tab when network monitoring is enabled; not for ad-related traffic modification. |
| `offscreen` | Processing the tab media stream for video recording per Manifest V3 requirements. |
| `storage` | Local persistence of tests, settings, and run logs. |
| `activeTab`, `scripting`, `tabs` | Accessing the active tab on user gesture; injecting scripts for record/replay; listing and switching tabs for multi-tab test flows. |
| `downloads` | Saving exported files (reports, test JSON, screenshots, video) to Downloads on user action. |
| `windows` | Opening editor and fullscreen windows; reading and closing extension windows per UI logic. |
| `clipboardRead` / `clipboardWrite` | Scenario steps and UI that copy/paste values (e.g. field values, selectors). |

---

*Document version aligned with extension manifest version **0.9.7.4**. Update this file and the Developer Dashboard when permissions or data practices change.*
