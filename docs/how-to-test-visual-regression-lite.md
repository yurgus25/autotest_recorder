# Как проверить Visual regression lite

Черновик для внутренней документации и будущего сайта: сюда можно добавить аналогичные инструкции по остальным функциям и проверкам.

## Назначение

Шаг **assertion** с подтипом **`assert-visual-regression`**: делает снимок (**viewport** целиком или **элемент по селектору**), сравнивает с **эталоном** и считает шаг проваленным, если доля отличающихся пикселей выше заданного порога.

**Хранение эталона:** объект `test.extensionAssets.visualRegressionBaselines` в JSON теста; при отсутствии записи для ключа используется legacy-карта в `chrome.storage.local` под ключом `visualRegressionBaselines`.

**Код:** `content/player-handlers-form.js` — `handleVisualRegressionAssert`.

## Шаги проверки

1. **Редактор**  
   Откройте тест в `editor.html` / `editor_ru.html`.

2. **Добавление шага**  
   - Тип: **assertion**  
   - Подтип: **Visual regression (lite)** (`assert-visual-regression`)  
   В модалке: область (**viewport** / **element**), порог **max diff %**, **pixel threshold**, опция **«Обновить эталон в этом прогоне»**.  
   **UI:** `editor/editor-action-modal.js`.

3. **Первый прогон — создание эталона**  
   - Для режима **element** укажите селектор; для **viewport** селектор не нужен.  
   - Запустите воспроизведение на целевой странице.  
   - Если эталона ещё нет, плеер сохраняет текущий снимок как эталон (через `MERGE_TEST_EXTENSION_ASSETS`), шаг **проходит**. В консоли вкладки — сообщение вроде «сохранён эталон в JSON теста».

4. **Второй прогон — сравнение**  
   - Без изменений UI — шаг должен **пройти**.  
   - После заметного визуального изменения страницы — при превышении порога шаг должен **упасть** с ошибкой про процент отличия.

5. **Обновление эталона**  
   Включите **«Обновить эталон в этом прогоне»** и выполните прогон — эталон перезаписывается (тот же ключ: `visualRegressionKey` или `${testId}_${index}`).

6. **Отладка**  
   - Консоль страницы с плеером: логи `Visual regression: ...`.  
   - Для сравнения нужен модуль **`ScreenshotComparer`** (`content/screenshot-comparer.js` в цепочке content scripts). Иначе ошибка «модуль ScreenshotComparer не загружен».

## Feature flag

В `background/feature-flags.js` флаг **`VISUAL_REGRESSION_LITE`** с `fallbackEnabled: true` — задел под лицензирование. Сам assert в плеере отдельной проверкой этого флага не блокируется; при необходимости локальный оверрайд: ключ **`enableVisualRegressionLite`** в `chrome.storage.local`.

## Экспорт

Эталоны уезжают в экспорте теста в **`extensionAssets.visualRegressionBaselines`** — можно проверить наличие блока в JSON после прогона.
