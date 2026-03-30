# AutoTest Recorder & Player (English)

A **Google Chrome** extension (Manifest V3) for recording user actions, editing tests in a visual editor, and replaying them with smart waits, logs, and screenshots.

**Repository:** [github.com/yurgus25/autotest_recorder](https://github.com/yurgus25/autotest_recorder/)

## Version in this folder

**0.9.7.1** — see [CHANGELOG_EN.md](CHANGELOG_EN.md) for what is new compared to the latest **[Chrome Web Store](https://chrome.google.com/webstore)** build.

Full Russian changelog: [CHANGELOG.md](CHANGELOG.md).

## Install from source

1. Clone the repo or unpack a release zip from [Releases](https://github.com/yurgus25/autotest_recorder/releases).
2. Open `chrome://extensions/`, enable **Developer mode**.
3. **Load unpacked** → the project root (or unpacked archive folder).

## Release zip (Windows)

Only in a full git clone (release zips contain the extension only, not the `scripts` folder).

```powershell
.\scripts\build-release.ps1
```

Output: `dist/autotest-recorder-<version>.zip`.

## License

See [LICENSE](LICENSE).
