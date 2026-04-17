# Lessons Learned

Use this file to capture repeated mistakes and prevention rules after user corrections.

## Template

### YYYY-MM-DD - Short title
- Correction: what user corrected
- Root cause: why it happened
- Rule: concrete self-rule to prevent recurrence
- Verification: how to validate the rule next time

## Current Session

### 2026-04-14 - Язык и формат коммуникации
- Correction: пользователь указал, что все тексты и вопросы должны быть на русском.
- Root cause: я продолжил рабочий поток с англоязычным планом/формулировками по инерции.
- Rule: начиная с первой явной языковой установки пользователя, весь вывод (включая вопросы, план и статусы) делаю только на выбранном языке.
- Verification: перед каждым ответом проверяю последнее явное языковое требование пользователя и соответствие формулировок.

### 2026-04-14 - Уточнение объема реализации
- Correction: пользователь сузил приоритет на запись без участия пользователя и live-оповещения при пропуске/сбое.
- Root cause: изначальный план включал более широкий охват record/replay.
- Rule: после уточнения приоритета немедленно фокусирую реализацию на указанном направлении и фиксирую это в `tasks/todo.md`.
- Verification: в review-секции `tasks/todo.md` явно отражаю только фактически реализованный и согласованный scope.
