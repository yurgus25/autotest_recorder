# Chrome Web Store — материалы для карточки

Папка **`CWS/`** содержит тексты, ссылки и файлы для заполнения [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/): описание, URL, обоснования прав, иконку и требования к скриншотам и промо-изображениям.

| Файл | Назначение |
|------|------------|
| [**README.md**](README.md) | Этот файл — оглавление |
| [**CHECKLIST.md**](CHECKLIST.md) | Пошаговый чеклист по полям формы |
| [**listing-all-in-one.md**](listing-all-in-one.md) | Все ключевые поля одним блоком для копирования |
| [**01-description-ru.txt**](01-description-ru.txt) | Длинное описание (RU) → поле «Описание» |
| [**01-description-en.txt**](01-description-en.txt) | Длинное описание (EN) — для англоязычного листинга |
| [**02-package-fields.txt**](02-package-fields.txt) | Название и краткое резюме из `manifest.json` |
| [**03-metadata.json**](03-metadata.json) | Категория, языки, URL, лимиты символов |
| [**04-urls.txt**](04-urls.txt) | Главная страница, поддержка, политика конфиденциальности |
| [**05-permission-notes-ru.txt**](05-permission-notes-ru.txt) | Короткие формулировки по разрешениям (для ответов модерации) |
| [**store-privacy-tab-copypaste.md**](store-privacy-tab-copypaste.md) | **Тексты для вкладки «Меры по обеспечению конфиденциальности»** (копирование по полям) |
| [**assets/README.md**](assets/README.md) | Значок магазина 128×128 |
| [**screenshots/README.md**](screenshots/README.md) | Требования к скриншотам (5 шт.) |
| [**promo/README.md**](promo/README.md) | Малое и большое рекламные изображения |

После публикации репозитория на GitHub проверьте, что URL в `03-metadata.json` и `04-urls.txt` открываются и ведут на актуальные файлы (`PRIVACY_EN.md` / `PRIVACY.md`).

Папка **`CWS/`** не входит в zip расширения (`scripts/build-release.*` исключают её): материалы только для консоли разработчика, не для пользователей из магазина.
