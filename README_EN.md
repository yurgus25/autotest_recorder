# AutoTest Recorder & Player (English)

A **Google Chrome** extension (Manifest V3) for recording user actions, editing tests in a visual editor, and replaying them with smart waits, logs, and screenshots.

**Repository:** [github.com/yurgus25/autotest_recorder](https://github.com/yurgus25/autotest_recorder/)

## Version in this folder

**0.9.7.1** — see [CHANGELOG_EN.md](CHANGELOG_EN.md) for what is new compared to the latest **[Chrome Web Store](https://chrome.google.com/webstore)** build.

Full Russian changelog: [CHANGELOG.md](CHANGELOG.md).

## Install from source

1. **Option A (recommended):** On [Releases](https://github.com/yurgus25/autotest_recorder/releases), download **`autotest-recorder-<version>.zip`** from the latest release (the zip root contains `manifest.json`). Unzip anywhere.
2. **Option B:** `git clone` and use the repo root (or build your own zip with `scripts/build-release.ps1` → `dist/`).
3. Open `chrome://extensions/`, enable **Developer mode**.
4. **Load unpacked** → pick the folder that **directly** contains `manifest.json` (unzipped release or clone root).

The release zip is built by the [Release extension zip](https://github.com/yurgus25/autotest_recorder/actions) workflow (on `v*` tags or **Run workflow** with tag `v0.9.7.1`).

## Release zip (Windows)

Only in a full git clone (release zips contain the extension only, not the `scripts` folder).

```powershell
.\scripts\build-release.ps1
```

Output: `dist/autotest-recorder-<version>.zip`.

## License

See [LICENSE](LICENSE).
