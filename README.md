# AutoTest Recorder & Player

Расширение для **Google Chrome** (Manifest V3): запись действий на странице, визуальный редактор сценариев и воспроизведение с умными ожиданиями, логами и скриншотами.

**Репозиторий:** [github.com/yurgus25/autotest_recorder](https://github.com/yurgus25/autotest_recorder/)

## Текущая версия в этом каталоге

**0.9.7.1** — см. [CHANGELOG.md](CHANGELOG.md) (что нового относительно последней сборки в [Chrome Web Store](https://chrome.google.com/webstore) — в начале файла).

Кратко на английском: [CHANGELOG_EN.md](CHANGELOG_EN.md).

## Установка из исходников

1. **Вариант A — релиз с GitHub (рекомендуется):** на странице [Releases](https://github.com/yurgus25/autotest_recorder/releases) скачайте архив **`autotest-recorder-<версия>.zip`** у последнего релиза (внутри — готовая папка расширения с `manifest.json` в корне). Распакуйте в любую папку.
2. **Вариант B — клон репозитория:** `git clone` и используйте корень проекта (не архив из `dist/`, если собираете сами — см. ниже).
3. Откройте `chrome://extensions/`, включите «Режим разработчика».
4. «Загрузить распакованное расширение» → укажите **папку**, в которой лежит `manifest.json` (распакованный zip или корень клона).

Архив для Releases собирается workflow [Release extension zip](https://github.com/yurgus25/autotest_recorder/actions) (после пуша тега `v*` или вручную: *Run workflow* → тег `v0.9.7.1`).

## Сборка zip для релиза (Windows)

Только в полном клоне репозитория (в архив релиза папка `scripts` не входит — там только расширение для загрузки в Chrome).

```powershell
.\scripts\build-release.ps1
```

Файл: `dist/autotest-recorder-<версия>.zip`.

## Лицензия

См. [LICENSE](LICENSE).
