# AutoTest Recorder & Player

Расширение для **Google Chrome** (Manifest V3): запись действий на странице, визуальный редактор сценариев и воспроизведение с умными ожиданиями, логами и скриншотами.

**Репозиторий:** [github.com/yurgus25/autotest_recorder](https://github.com/yurgus25/autotest_recorder/)

## Текущая версия в этом каталоге

**0.9.7.1** — см. [CHANGELOG.md](CHANGELOG.md) (что нового относительно последней сборки в [Chrome Web Store](https://chrome.google.com/webstore) — в начале файла).

Кратко на английском: [CHANGELOG_EN.md](CHANGELOG_EN.md).

## Установка из исходников

1. Клонировать репозиторий или распаковать релизный zip из [Releases](https://github.com/yurgus25/autotest_recorder/releases).
2. Открыть `chrome://extensions/`, включить «Режим разработчика».
3. «Загрузить распакованное расширение» → корневая папка проекта (или распакованный архив).

## Сборка zip для релиза (Windows)

Только в полном клоне репозитория (в архив релиза папка `scripts` не входит — там только расширение для загрузки в Chrome).

```powershell
.\scripts\build-release.ps1
```

Файл: `dist/autotest-recorder-<версия>.zip`.

## Лицензия

См. [LICENSE](LICENSE).
