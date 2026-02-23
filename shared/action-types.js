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
export const SUPPORTED_ACTION_TYPES = new Set([
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
  'javascript',    // Выполнение JS кода
  'screenshot',    // Скриншоты
  'hover',         // Наведение мыши
  'focus',         // Установка фокуса
  'blur',          // Снятие фокуса
  'clear',         // Очистка поля
  'upload',        // Загрузка файлов
  'cookie'         // Работа с cookies
]);

// ============================================================================
// ПОДДЕРЖИВАЕМЫЕ ПОДТИПЫ ДЛЯ КАЖДОГО ТИПА
// ============================================================================

/**
 * Подтипы для каждого типа действия
 * Используется для валидации в Editor и обработки в Player
 */
export const SUPPORTED_SUBTYPES = {
  // Wait - ожидания
  wait: new Set([
    'wait-value',          // Ожидание конкретного значения
    'wait-option',         // Ожидание опции в dropdown
    'wait-options-count',  // Ожидание количества опций
    'wait-enabled',        // Ожидание активации элемента
    'wait-until'           // Ожидание по условию
  ]),
  
  // Assert - проверки (используется для обоих: 'assert' и 'assertion')
  assert: new Set([
    'assert-value',        // Проверка значения
    'assert-contains',     // Проверка что содержит текст
    'assert-count',        // Проверка количества элементов
    'assert-disabled',     // Проверка что элемент неактивен
    'assert-multiselect'   // Проверка множественного выбора
  ]),
  assertion: new Set([    // Дублирование для Editor
    'assert-value',
    'assert-contains',
    'assert-count',
    'assert-disabled',
    'assert-multiselect'
  ]),
  
  // Scroll - прокрутка
  scroll: new Set([
    'scroll-element',      // Прокрутка к элементу
    'scroll-top',          // Прокрутка вверх
    'scroll-bottom'        // Прокрутка вниз
  ]),
  
  // Navigation - навигация
  navigation: new Set([
    'nav-refresh',         // Обновить страницу
    'nav-back',            // Назад
    'nav-forward',         // Вперед
    'new-tab',             // Новая вкладка
    'close-tab'            // Закрыть вкладку
  ]),
  
  // Click - клики
  click: new Set([
    'click',               // Обычный клик (ИСПРАВЛЕНИЕ #1)
    'right-click',         // Правый клик
    'double-click'         // Двойной клик
  ]),
  
  // Cookie - работа с cookies
  cookie: new Set([
    'set-cookie',          // Установить cookie
    'get-cookies'          // Получить cookies
  ]),
  
  // Screenshot - скриншоты
  screenshot: new Set([
    'visual-screenshot',   // Визуальный скриншот
    'page-screenshot'      // Скриншот всей страницы
  ])
};

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
export const UNSUPPORTED_QUICK_TEMPLATES = new Set([
  // Dropdown - расширенные операции (не полностью реализованы)
  'dropdown-select',         // ИСПРАВЛЕНИЕ #3: блокируем до реализации в Player
  'dropdown-multiselect',    // ИСПРАВЛЕНИЕ #3: блокируем до реализации в Player
  'dropdown-deselect',       // ИСПРАВЛЕНИЕ #3: блокируем до реализации в Player
  'dropdown-datalist',       // ИСПРАВЛЕНИЕ #4: блокируем до реализации в Player
  'dropdown-combobox',       // ИСПРАВЛЕНИЕ #4: блокируем до реализации в Player
  'dropdown-select-all',
  'dropdown-clear-all',
  'dropdown-toggle-all',
  'dropdown-copy',
  'dropdown-paste',
  'dropdown-reorder',
  
  // Keyboard - специальные операции (не реализованы)
  'keyboard-navigate',       // ИСПРАВЛЕНИЕ #5: блокируем до реализации в Player
  'keyboard-typeahead',      // ИСПРАВЛЕНИЕ #5: блокируем до реализации в Player
  'keyboard-escape',         // ИСПРАВЛЕНИЕ #5: блокируем до реализации в Player
  
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
  
  // Advanced - частично реализовано или проблемы с безопасностью
  'switch-tab',
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
export const ACTION_TYPE_ALIASES = {
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
export function normalizeActionType(type) {
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
export function isActionTypeSupported(type) {
  const normalizedType = normalizeActionType(type);
  return SUPPORTED_ACTION_TYPES.has(normalizedType);
}

/**
 * Проверяет поддержку подтипа для данного типа действия
 * @param {string} type - Тип действия
 * @param {string} subtype - Подтип
 * @returns {boolean}
 */
export function isSubtypeSupported(type, subtype) {
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
export function isQuickTemplateAllowed(template) {
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
export const REQUIRED_FIELDS_BY_SUBTYPE = {
  'assert-value': ['expectedValue'],
  'assert-contains': ['expectedValue'],
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
export function validateRequiredFields(action) {
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
