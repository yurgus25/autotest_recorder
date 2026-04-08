# Product Growth Roadmap Proposal

## Цель

Сформировать реалистичный план роста **AutoTest Recorder & Player** (Manifest V3):
- повысить ценность для QA/разработчиков,
- улучшить retention,
- подготовить управляемую монетизацию (Free + Premium).

---

## 1) Top-10 идей

| Название | Проблема пользователя | Ценность | Сложность | Риск | Free/Premium | Пример сценария |
|---|---|---|---|---|---|---|
| Smart Healing 2.0 (мульти-стратегия + confidence) | Тесты ломаются при изменении DOM | High | M | Тех: Med / Store: Low / Юр: Low | Free core, Premium advanced | После редизайна шаг автоматически находит элемент и показывает confidence 0.78 |
| Flaky Test Detector + рекомендации | Сложно понять, почему тест нестабилен | High | M | Тех: Med / Store: Low / Юр: Low | Premium | После 10 прогонов система помечает flaky-шаги и даёт fix hints |
| Data-driven runs (CSV/таблицы) | Один сценарий нужно гонять на многих данных | High | M | Тех: Med / Store: Low / Юр: Low | Free basic / Premium bulk | Login-тест прогоняется по 50 учеткам из CSV |
| API assertions pack (schema/status/time) | Нет удобных API-проверок рядом с UI-тестами | High | M | Тех: Med / Store: Low / Юр: Low | Premium | После UI-действия проверяется API: 201, schema ok, latency < 800ms |
| Scheduler + runner companion | Нет автопрогонов по расписанию | High | L | Тех: High / Store: Med / Юр: Low | Premium (B2B) | Nightly smoke в 02:00 с отчётом |
| Visual regression lite | UI-регрессии ускользают | High | M | Тех: Med / Store: Low / Юр: Low | Premium | Сравнение baseline vs current, fail при diff > threshold |
| Test Health Dashboard | Нет управленческих метрик качества | Med/High | M | Тех: Med / Store: Low / Юр: Low | Free limited / Premium full | TL видит pass rate, flaky index и топ-проблемные тесты |
| Collaboration (shared packs + review) | Тесты живут локально и сложно ревьюить изменения | High | L | Тех: High / Store: Low / Юр: Med | Premium | Изменение сценария проходит review before merge |
| Onboarding Wizard + templates | Новичкам сложно начать | Med | S/M | Тех: Low / Store: Low / Юр: Low | Free | Пользователь запускает первый тест за 5 минут |
| Export bridge (Playwright/Cypress) | Сложно переносить сценарии в CI-экосистемы | Med/High | M | Тех: Med / Store: Low / Юр: Low | Premium | Экспорт сценария в Playwright для git-репозитория |

---

## 2) Приоритизация

### Матрица Impact/Effort (кратко)

- **High impact / Low-Med effort:** Smart Healing 2.0, Onboarding Wizard, Data-driven basic
- **High impact / Med effort:** Flaky Detector, API assertions, Visual regression lite
- **High impact / High effort:** Scheduler/Runner, Collaboration cloud
- **Med impact / Med effort:** Export bridge, Health dashboard

### Первые 5 фич

1. **Smart Healing 2.0** — уменьшает «ломкость» тестов, усиливает ядро продукта.  
2. **Onboarding Wizard + templates** — ускоряет активацию (TTFV).  
3. **Flaky Detector** — повышает доверие к автотестам.  
4. **Data-driven basic** — быстро закрывает частый сценарий QA.  
5. **API assertions** — расширяет ценность до полноценного E2E контроля.

---

## 3) Roadmap на 3 этапа

### Этап 1 (1–2 месяца)

- Smart Healing 2.0 (базовый confidence)
- Onboarding Wizard v1
- Data-driven basic (CSV + лимиты)
- Product analytics events (activation/TTFV)

### Этап 2 (3–4 месяца)

- Flaky Detector + auto recommendations
- API assertions pack
- Visual regression lite
- Health Dashboard v1

### Этап 3 (5–6 месяцев)

- Premium billing + license backend hardening
- Scheduler + runner companion
- Collaboration/shared workspace
- Export bridge (сначала Playwright)

---

## 4) Монетизация

### Рекомендуемая модель

**Freemium + Subscription**, с отдельным B2B-пакетом.

### Free оставить

- Запись/воспроизведение core
- Базовый редактор
- Ограниченные шаблоны
- Data-driven с лимитом
- Базовые отчёты

### Premium сделать

- Flaky Detector
- API assertions advanced
- Visual regression
- Scheduler/runner
- Collaboration/cloud
- Расширенные экспорты и аналитика

---

## 5) KPI (10)

1. Activation Rate (установка → 1 успешный прогон за 24ч)
2. TTFV (time to first value)
3. D7 Retention
4. D30 Retention
5. Weekly Active Test Creators
6. Avg tests per active user
7. Pass Rate Trend
8. Flaky Index
9. Free → Paid Conversion
10. ARPU / MRR

---

## 6) Риски и анти-риски

1. **Store/policy risk** при сильных permissions  
   → прозрачные обоснования, актуальная privacy-документация, минимизация scope.

2. **Негатив от paywall**  
   → grandfathering + grace period + платными делать в первую очередь новые advanced-фичи.

3. **MIT-форки**  
   → монетизировать cloud/collab/support, а не только локальные флаги.

4. **Техдолг из-за роста**  
   → feature flags, staged rollout, telemetry-driven релизы.

5. **Нестабильность на сложных SPA**  
   → smart waits, network-idle эвристики, explainable healing.

---

## План на ближайшие 2 недели (10 шагов)

1. Зафиксировать free/premium границу в одном документе.
2. Добавить события: install, first-record, first-run, fail-reason.
3. Выпустить Onboarding Wizard v1.
4. Добавить confidence score в healing-логи.
5. Включить сбор flaky-метрик по шагам.
6. Реализовать Data-driven basic (CSV).
7. Подготовить pricing draft (Free/Pro/Team).
8. Сделать UX-макеты paywall/upgrade flows.
9. Провести 5 интервью с текущими пользователями.
10. Провести sprint review с решением go/no-go по этапу 2.
