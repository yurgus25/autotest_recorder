# Changelog (English) — AutoTest Recorder & Player

See [CHANGELOG.md](CHANGELOG.md) for the full Russian changelog.

---

## [0.9.7.1] — 2026-03-30

GitHub-oriented follow-up: source audit for public release.

- **Neutral wording** in changelogs (no customer- or domain-specific strings).
- **Player:** `app-select` open target is resolved **inside** the current `app-select` only (no global page-specific CSS path); `FormControl` lookup uses `form` and ancestor custom elements; container-like option text heuristic without project-specific phrases.
- **Repo hygiene:** root `.gitignore`; release script excludes `temp_kr2`; removed stray temp/debug files.

---

## [0.9.7.0] — 2026-03-29

GitHub release build — features and fixes **not yet** in the last **Chrome Web Store** published build (as of this release date).

### Recording & selectors

- **Angular `app-select` + CDK overlays:** better pairing of overlay panels with the correct control; CDK/content-list options are not misclassified as Wicket application menu items.
- **Application menus vs combobox:** GWT-style menu clicks record as **click**, not spurious **input** into unrelated Ant/rc-select fields.
- **Targeted dropdown recording:** single-field root resolution, safer polling, larger overlay distance threshold for long forms.
- **False inputs:** `shouldRejectDropdownValueForFieldMismatch` and related guards; narrower option heuristics.
- **`app-select[elementid]`:** more stable selectors; tuned duplicate `angular-component` weighting.

### Playback

- **Extended dropdown / fill-fields** behavior in `player-handlers-extended.js`: auto value selection, CDK panel handling, reopen strategies, `.select-box` / result container priority.
- **`retryFillWithAlternativesOrThrow`** when the field does not match the expected value.
- **XPath → CSS** fallback and increased element lookup retries.
- **Input:** “Illegal invocation” fixes for native value setters.

### Infrastructure & UX

- **MV3 injection lists** point to real player bundle files (fixes script fetch errors).
- **Selector analyzer:** pick **any open tab** from a dropdown.
- **Help / fullscreen popup** updates for selector inspector workflows.
- **Storage:** graceful handling when `chrome.storage` quota is exceeded.
- **Removed** debug-only localhost instrumentation from player code.

### More

- Test groups (premium), adaptive steps, Katalon XML import, screenshot/popup improvements — see `changes.md` and `versions.txt`.

### Build

```powershell
.\scripts\build-release.ps1
```

Output: `dist/autotest-recorder-<version>.zip` for [GitHub Releases](https://github.com/yurgus25/autotest_recorder/releases).
