# Автоматизация записи и replay: строгая валидация + live-оповещения

## Checklist

- [x] Проанализировать текущий путь записи (`saveAction` -> `ADD_ACTION`)
- [x] Внедрить авто-подготовку шага (sanitize + validate) в `content/recorder.js`
- [x] Сделать автоматический пропуск невалидных/дублирующихся шагов без участия пользователя
- [x] Добавить live-уведомления пользователю во время записи о пропуске шага и сбое сохранения
- [x] Добавить защитную валидацию входящего шага в `background/message-handlers.js`
- [x] Синхронизировать те же проверки в `background/message-handlers-sw.js`
- [x] Добавить strict replay target validation в `content/player-core.js`
- [x] Добавить evidence для replay-поиска элемента в `content/player-handlers-extended.js`
- [x] Проверить синтаксис изменённых файлов

## Progress Notes

- Реализован режим «максимально автоматической записи»: валидные шаги сохраняются без ручных действий.
- Если шаг отклонен или не сохранился, пользователь получает уведомление прямо во время записи.
- Добавлен второй барьер в background: невалидный `ADD_ACTION` отклоняется с явным кодом ошибки.
- В replay добавлена строгая проверка целевого элемента: шаг с селектором теперь не считается успешным без target proof.

## Review

- `content/recorder.js`: добавлены `prepareActionForRecording`, strict-проверки (`type/subtype/selector`), авто-пропуск шумных шагов, runtime-уведомления и счётчики `saved/skipped/failed`.
- `background/message-handlers.js`: добавлена defensive ingress-валидация `validateIncomingRecordedAction(...)` для `ADD_ACTION`.
- `background/message-handlers-sw.js`: добавлена аналогичная defensive-валидация для runtime SW-версии.
- `content/player-core.js`: добавлены `strictReplayTargetValidation`, `getReplayTargetValidation(...)`, запись replay-validation evidence в `runHistory`.
- `content/player-handlers-extended.js`: `findElementWithRetry(...)` теперь возвращает и сохраняет расширенный proof (`source`, `attempt`, `selectorType`, `usedSelector`).
- Техническая проверка: `node --check` для `content/recorder.js`, `background/message-handlers.js`, `background/message-handlers-sw.js`, `content/player-core.js`, `content/player-handlers-extended.js` — pass.
- Остаточный риск: ручной E2E-прогон в браузере не выполнялся в этой итерации; нужен smoke-тест записи + replay на реальной странице.
