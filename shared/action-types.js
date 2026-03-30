/**
 * Единый источник истины для типов действий, подтипов и их маппинга
 * Используется в editor.js и player.js для синхронизации контрактов
 * 
 * @version 1.9.4
 * @date 2026-02-23
 */

// ============================================================================
// ПОДДЕРЖИВАЕМЫЕ ТИПЫ ДЕЙСТВИЙ
// ============================================================================

/**
 * Все поддерживаемые типы действий в Player
 * Примечание: 'navigate' и 'navigation' - синонимы
 * Примечание: 'assert' и 'assertion' - синонимы
 */
const SUPPORTED_ACTION_TYPES = new Set([
  'click',         // Клики (обычный, правый, двойной)
  'dblclick',      // Двойной клик (legacy, используется click с subtype)
  'input',         // Ввод текста
  'change',        // Изменение значения (select, checkbox, radio)
  'navigate',      // Навигация (синоним navigation)
  'navigation',    // Навигация (основной тип)
  'scroll',        // Прокрутка
  'keyboard',      // Клавиатурные события
  'keydown',       // Legacy keyboard event
  'keyup',         // Legacy keyboard event
  'keypress',      // Legacy keyboard event
  'wait',          // Ожидания
  'api',           // API запросы
  'variable',      // Работа с переменными
  'setVariable',   // Установка переменной (legacy)
  'assert',        // Проверки (основной тип в Player)
  'assertion',     // Проверки (синоним, используется в Editor)
  'loop',          // Циклы
  'condition',     // Условия
  'try-catch',     // Обработка ошибок
  'javascript',    // Выполнение JS кода
  'screenshot',    // Скриншоты
  'hover',         // Наведение мыши
  'focus',         // Установка фокуса
  'blur',          // Снятие фокуса
  'clear',         // Очистка поля
  'upload',        // Загрузка файлов
  'cookie',        // Работа с cookies
  'clipboard',     // Работа с буфером обмена
  'network',       // Работа с сетевыми запросами
  'table',         // Работа с таблицами
  'drag',          // Drag-and-drop операции
  'datepicker',    // Работа с датапикерами
  'media',         // Управление медиа (аудио/видео)
  'device',        // Эмуляция устройств (viewport, orientation)
  'chain',         // Цепочки действий
  'analysis',      // Анализ страницы (получение селекторов, проверка элементов)
  'adaptive'       // Адаптивный шаг (универсальное действие с селекторами)
]);

// ============================================================================
// ПОДДЕРЖИВАЕМЫЕ ПОДТИПЫ ДЛЯ КАЖДОГО ТИПА
// ============================================================================

/**
 * Подтипы для каждого типа действия
 * Используется для валидации в Editor и обработки в Player
 */
const SUPPORTED_SUBTYPES = {
  // Wait - ожидания
  wait: new Set([
    'wait-value',          // Ожидание конкретного значения
    'wait-option',         // Ожидание опции в dropdown
    'wait-options-count',  // Ожидание количества опций
    'wait-enabled',        // Ожидание активации элемента
    'wait-until',          // Ожидание по условию
    'wait-visible',        // Ожидание появления элемента (видимый)
    'wait-hidden',         // Ожидание скрытия элемента
    'wait-exists',         // Ожидание появления элемента в DOM
    'wait-not-exists'      // Ожидание исчезновения элемента из DOM
  ]),
  
  // Assert - проверки (используется для обоих: 'assert' и 'assertion')
  assert: new Set([
    'assert-value',        // Проверка значения
    'assert-contains',     // Проверка что содержит текст
    'assert-count',        // Проверка количества элементов
    'assert-disabled',     // Проверка что элемент неактивен
    'assert-multiselect',  // Проверка множественного выбора
    'assert-visible',      // Проверка видимости элемента
    'assert-hidden',       // Проверка что элемент скрыт
    'assert-exists',       // Проверка существования в DOM
    'assert-not-exists'    // Проверка отсутствия в DOM
  ]),
  assertion: new Set([    // Дублирование для Editor
    'assert-value',
    'assert-contains',
    'assert-count',
    'assert-disabled',
    'assert-multiselect',
    'assert-visible',
    'assert-hidden',
    'assert-exists',
    'assert-not-exists'
  ]),
  
  // Scroll - прокрутка
  scroll: new Set([
    'scroll-element',      // Прокрутка к элементу
    'scroll-top',          // Прокрутка вверх
    'scroll-bottom'        // Прокрутка вниз
  ]),
  
  // Navigation - навигация
  navigation: new Set([
    'nav-url',             // Переход по URL (по умолчанию)
    'nav-refresh',         // Обновить страницу
    'nav-back',            // Назад
    'nav-forward',         // Вперед
    'new-tab',             // Новая вкладка
    'switch-tab',          // Переключить на другую вкладку
    'close-tab',           // Закрыть вкладку
    'nav-get-url'          // Получить URL текущей страницы в переменную
  ]),
  
  // Click - клики
  click: new Set([
    'click',               // Обычный клик (ИСПРАВЛЕНИЕ #1)
    'right-click',         // Правый клик
    'double-click',        // Двойной клик
    // Dropdown операции (реализованы в Player)
    'dropdown-select',
    'dropdown-multiselect',
    'dropdown-deselect',
    'dropdown-select-all',
    'dropdown-clear-all',
    'dropdown-toggle-all',
    'dropdown-copy',
    'dropdown-paste',
    'dropdown-reorder'
  ]),
  
  // Input - ввод (dropdown-datalist, dropdown-combobox, keyboard-typeahead)
  input: new Set([
    'input-text',
    'dropdown-datalist',
    'dropdown-combobox',
    'keyboard-typeahead'
  ]),
  
  // Keyboard - клавиатурные операции
  keyboard: new Set([
    'press-key',
    'keyboard-navigate',   // Стрелки для навигации по форме
    'keyboard-escape'      // Escape для закрытия модальных окон
  ]),
  
  // Cookie - работа с cookies
  cookie: new Set([
    'set-cookie',          // Установить cookie
    'get-cookies'          // Получить cookies
  ]),
  
  // Clipboard - работа с буфером обмена
  clipboard: new Set([
    'clipboard-copy',      // Копировать текст из элемента
    'clipboard-paste',     // Вставить текст в элемент
    'clipboard-get',       // Получить текст из буфера в переменную
    'clipboard-set'        // Установить текст в буфер
  ]),
  
  // Network - работа с сетевыми запросами
  network: new Set([
    'network-wait-request',    // Ожидание конкретного запроса
    'network-wait-response',   // Ожидание ответа на запрос
    'network-wait-idle',       // Ожидание завершения всех запросов
    'network-assert-request',  // Проверка что запрос был выполнен
    'network-assert-status'    // Проверка статуса ответа
  ]),
  
  // Table - работа с таблицами
  table: new Set([
    'table-get-cell-value',    // Получить значение ячейки
    'table-get-cell-text',     // Получить текст ячейки (alias)
    'table-click-cell',        // Кликнуть на ячейку
    'table-get-row',           // Получить всю строку
    'table-get-column',        // Получить весь столбец
    'table-get-row-count',     // Получить количество строк
    'table-get-column-count',  // Получить количество столбцов
    'table-assert-cell-value', // Проверить значение ячейки
    'table-assert-row-count',  // Проверить количество строк
    'table-find-row'           // Найти строку по содержимому
  ]),
  
  // Drag - drag-and-drop операции
  drag: new Set([
    'drag-and-drop',           // Перетащить элемент на другой элемент
    'drag-by-offset',          // Перетащить на X, Y пикселей
    'drag-to-coordinates',     // Перетащить в координаты
    'drag-start',              // Начать перетаскивание
    'drag-over',               // Навести при перетаскивании
    'drop'                     // Отпустить элемент
  ]),
  
  // Datepicker - работа с датапикерами
  datepicker: new Set([
    'datepicker-select-date',      // Выбрать дату
    'datepicker-select-range',     // Выбрать диапазон дат
    'datepicker-select-time',      // Выбрать время
    'datepicker-select-datetime',  // Выбрать дату и время
    'datepicker-clear',            // Очистить датапикер
    'datepicker-open',             // Открыть датапикер
    'datepicker-close'             // Закрыть датапикер
  ]),
  
  // Media - управление медиа элементами
  media: new Set([
    'media-play',              // Воспроизвести
    'media-pause',             // Пауза
    'media-stop',              // Остановить
    'media-seek',              // Перемотать на позицию
    'media-set-volume',        // Установить громкость
    'media-mute',              // Выключить звук
    'media-unmute',            // Включить звук
    'media-set-playback-rate', // Установить скорость воспроизведения
    'media-fullscreen',        // Во весь экран
    'media-exit-fullscreen'    // Выйти из полного экрана
  ]),
  
  // Device - эмуляция устройств
  device: new Set([
    'device-set-viewport',     // Установить размер viewport
    'device-rotate',           // Повернуть устройство (portrait/landscape)
    'device-set-user-agent',   // Установить User-Agent
    'device-set-geolocation',  // Установить геолокацию
    'device-set-timezone',     // Установить часовой пояс
    'device-emulate-mobile',   // Эмулировать мобильное устройство
    'device-emulate-tablet',   // Эмулировать планшет
    'device-emulate-desktop'   // Эмулировать десктоп
  ]),
  
  // Chain - цепочки действий
  chain: new Set([
    'chain-sequential',        // Последовательное выполнение
    'chain-parallel',          // Параллельное выполнение
    'chain-conditional',       // Условное выполнение
    'chain-retry',             // Повтор при ошибке
    'chain-batch'              // Пакетное выполнение
  ]),
  
  // Screenshot - скриншоты (расширено)
  screenshot: new Set([
    'visual-screenshot',       // Визуальный скриншот элемента
    'page-screenshot',         // Скриншот всей страницы (viewport)
    'page-screenshot-full',    // Полный скриншот страницы (с прокруткой)
    'screenshot-compare',      // Сравнение скриншотов (visual regression)
    'screenshot-region',       // Скриншот региона
    'screenshot-element'       // Скриншот конкретного элемента
  ]),
  
  // Analysis - анализ страницы
  analysis: new Set([
    'analysis-selectors',     // Получение всех селекторов страницы
    'analysis-fill-fields',   // Анализ полей для заполнения
    'analysis-validate',      // Проверка доступности элементов
    'analysis-forms',         // Анализ форм
    'analysis-links',         // Поиск битых ссылок
    'analysis-performance'    // Анализ производительности
  ]),

  // Adaptive - адаптивный шаг (универсальное действие)
  adaptive: new Set([
    'adaptive-single',        // Одно действие из перечня
    'adaptive-auto',          // Автоматический: заполнить поля → найти кнопки → нажать → повторить
    'adaptive-flow'           // Пошаговый сценарий с вариациями
  ])
};

// ============================================================================
// НЕПОДДЕРЖИВАЕМЫЕ QUICK TEMPLATES
// ============================================================================

/**
 * Типы действий, отображаемые в выборе типа, но ещё не реализованные в Player
 * (скрыты или отключены в быстрых шагах). В списке «Тип действия» помечаются и недоступны для выбора.
 */
const UNSUPPORTED_ACTION_TYPES = new Set([
  'ai',      // AI Операция — планируется
  'cloud',   // Облачная операция — требует backend
  'suite',   // Набор тестов — не реализовано
  'mobile'   // Мобильный жест — требует эмуляцию
]);

// ============================================================================
// НЕПОДДЕРЖИВАЕМЫЕ QUICK TEMPLATES
// ============================================================================

/**
 * Quick Step шаблоны, которые НЕ должны быть доступны в UI Editor
 * Причины блокировки:
 * - Не реализованы в Player
 * - Требуют дополнительной инфраструктуры
 * - Находятся в стадии разработки
 */
const UNSUPPORTED_QUICK_TEMPLATES = new Set([
  // Dropdown - РАЗБЛОКИРОВАНЫ: реализованы в Player (handleDropdownAction, handleDropdownDatalistCombobox)

  // Visual Testing - требует дополнительной инфраструктуры
  'visual-compare',
  'visual-baseline',
  'visual-compare-baseline',
  'visual-record-start',
  'visual-record-stop',
  
  // AI - будущий функционал
  'ai-smart-selector',
  'ai-analyze-stability',
  'ai-suggest-alternatives',
  'ai-find-healing',
  'ai-heal-selector',
  'ai-learn-failures',
  
  // Cloud - требует backend
  'cloud-upload',
  'cloud-execute',
  'cloud-results',
  'cloud-schedule',
  
  // Suite Management - не реализовано
  'export-suite',
  'import-suite',
  'validate-suite',
  'save-file',
  'load-file',
  
  // Advanced - switch-tab РАЗБЛОКИРОВАН (v0.9.6.1)
  // NOTE: 'set-cookie' и 'get-cookies' РАЗБЛОКИРОВАНЫ (ИСПРАВЛЕНИЕ #6)
  
  // Mobile - требует эмуляцию
  'swipe-up',
  'swipe-down',
  'swipe-left',
  'swipe-right',
  'pinch-in',
  'pinch-out',
  
  // Iframe & Alerts - требует доработки
  'switch-iframe',
  'switch-parent',
  'accept-alert',
  'dismiss-alert',
  'get-alert-text'
]);

// ============================================================================
// МАППИНГ АЛЬТЕРНАТИВНЫХ ИМЕН ТИПОВ
// ============================================================================

/**
 * Нормализация типов действий для обратной совместимости
 * Используется в Player при импорте тестов из внешних источников
 * 
 * Исправления:
 * - #7: assertion → assert
 * - #8: navigate → navigation (для единообразия в Editor)
 */
const ACTION_TYPE_ALIASES = {
  // Assertions
  'assertion': 'assert',        // ИСПРАВЛЕНИЕ #7
  'assertions': 'assert',
  
  // Navigation
  'navigate': 'navigation',     // ИСПРАВЛЕНИЕ #8 (для Editor)
  'nav': 'navigation',
  'goto': 'navigation',
  
  // Variables
  'setVariable': 'variable',
  'getVariable': 'variable',
  'var': 'variable',
  
  // Clicks
  'dblclick': 'click',          // Обрабатывается через subtype
  'rightclick': 'click',        // Обрабатывается через subtype
  
  // Keyboard
  'keydown': 'keyboard',
  'keyup': 'keyboard',
  'keypress': 'keyboard',
  'key': 'keyboard',
  
  // JavaScript
  'js': 'javascript',
  'script': 'javascript',
  'exec': 'javascript'
};

/**
 * Нормализует тип действия, преобразуя альтернативные имена в канонические
 * @param {string} type - Исходный тип действия
 * @returns {string} - Нормализованный тип
 */
function normalizeActionType(type) {
  return ACTION_TYPE_ALIASES[type] || type;
}

// ============================================================================
// УТИЛИТЫ ДЛЯ ВАЛИДАЦИИ
// ============================================================================

/**
 * Проверяет поддержку типа действия
 * @param {string} type - Тип действия
 * @returns {boolean}
 */
function isActionTypeSupported(type) {
  const normalizedType = normalizeActionType(type);
  return SUPPORTED_ACTION_TYPES.has(normalizedType);
}

/**
 * Проверяет поддержку подтипа для данного типа действия
 * @param {string} type - Тип действия
 * @param {string} subtype - Подтип
 * @returns {boolean}
 */
function isSubtypeSupported(type, subtype) {
  const normalizedType = normalizeActionType(type);
  
  // Если нет списка подтипов для этого типа - любой подтип допустим
  if (!SUPPORTED_SUBTYPES[normalizedType]) {
    return true;
  }
  
  return SUPPORTED_SUBTYPES[normalizedType].has(subtype);
}

/**
 * Проверяет что Quick Template НЕ заблокирован
 * @param {string} template - Имя шаблона
 * @returns {boolean}
 */
function isQuickTemplateAllowed(template) {
  return !UNSUPPORTED_QUICK_TEMPLATES.has(template);
}

// ============================================================================
// ОБЯЗАТЕЛЬНЫЕ ПОЛЯ ДЛЯ РАЗЛИЧНЫХ ТИПОВ ДЕЙСТВИЙ
// ============================================================================

/**
 * Определяет обязательные поля для каждого подтипа
 * Используется для валидации в Editor при сохранении
 * ИСПРАВЛЕНИЕ #25, #26
 */
const REQUIRED_FIELDS_BY_SUBTYPE = {
  'assert-value': ['expectedValue'],
  // assert-contains: Editor/Player используют expectedText (или optionText/value). Обратная совместимость — любое из полей.
  'assert-count': ['expectedCount'],
  'wait-value': ['expectedValue'],
  'wait-option': ['optionText'],
  'wait-options-count': ['expectedCount']
};

/**
 * Проверяет наличие обязательных полей для действия
 * @param {Object} action - Объект действия
 * @returns {{valid: boolean, missing: string[]}}
 */
function validateRequiredFields(action) {
  // Специальная проверка для assert-contains: достаточно любого из expectedText, optionText, expectedValue, value
  if (action.subtype === 'assert-contains') {
    const hasValue = ['expectedText', 'optionText', 'expectedValue', 'value'].some(
      field => {
        const v = action[field];
        return v !== undefined && v !== null && String(v).trim() !== '';
      }
    );
    return { valid: hasValue, missing: hasValue ? [] : ['expectedText или optionText или value'] };
  }

  const requiredFields = REQUIRED_FIELDS_BY_SUBTYPE[action.subtype];

  if (!requiredFields) {
    return { valid: true, missing: [] };
  }

  const missing = requiredFields.filter(field => {
    const value = action[field];
    return value === undefined || value === null || value === '';
  });

  return {
    valid: missing.length === 0,
    missing
  };
}

// ============================================================================
// ЭКСПОРТ ДЛЯ BROWSER (без ES6 modules)
// ============================================================================

if (typeof window !== 'undefined') {
  window.ActionTypes = {
    SUPPORTED_ACTION_TYPES,
    UNSUPPORTED_ACTION_TYPES,
    SUPPORTED_SUBTYPES,
    UNSUPPORTED_QUICK_TEMPLATES,
    ACTION_TYPE_ALIASES,
    REQUIRED_FIELDS_BY_SUBTYPE,
    normalizeActionType,
    isActionTypeSupported,
    isSubtypeSupported,
    isQuickTemplateAllowed,
    validateRequiredFields
  };
}
