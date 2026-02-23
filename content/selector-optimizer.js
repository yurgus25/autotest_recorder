/**
 * SelectorOptimizer - Модуль оптимизации селекторов
 * Реализует все улучшения из анализа:
 * - Фаза 1: Дедупликация, кэширование, асинхронная проверка
 * - Фаза 2: Умная оценка, улучшенный dropdown, экспоненциальный backoff
 * - Фаза 3: XPath, overlay поиск, валидация, debounce
 */

class SelectorOptimizer {
  constructor() {
    // Настройки по умолчанию
    this.settings = {
      // Фаза 1
      deduplicateSelectors: true,
      enableSelectorCache: true,
      selectorCacheTTL: 30000,
      asyncUniquenessCheck: true,
      
      // Фаза 2
      smartSelectorScoring: true,
      penalizeDynamicParts: true,
      improvedDropdownDetection: true,
      exponentialBackoffRetry: true,
      useMutationObserver: true,
      
      // Фаза 3
      generateXPath: false,
      improvedOverlaySearch: true,
      validateBeforeSave: true,
      eventDebounce: true,
      eventDebounceDelay: 100,
      clickThrottleMs: 200,
      
      // Метрики
      calculateMetrics: false,
      autoFixUnstable: false,
      minStabilityScore: 70
    };
    
    // Кэш селекторов (WeakMap для автоматической очистки)
    this.selectorCache = new WeakMap();
    this.selectorCacheTimestamps = new WeakMap();
    
    // Кэш dropdown элементов
    this.dropdownCache = new WeakMap();
    this.dropdownCacheObserver = null;
    
    // Event debouncing
    this.eventQueue = [];
    this.processEventsDebounced = null;
    this.lastClickTime = 0;
    
    // Загружаем настройки
    this.loadSettings();
    
    console.log('✅ [SelectorOptimizer] Модуль инициализирован');
  }

  /**
   * Загрузка настроек из storage
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('pluginSettings');
      if (result.pluginSettings?.selectorEngine?.optimization) {
        Object.assign(this.settings, result.pluginSettings.selectorEngine.optimization);
        console.log('✅ [SelectorOptimizer] Настройки загружены:', this.settings);
      }
    } catch (error) {
      console.warn('⚠️ [SelectorOptimizer] Ошибка загрузки настроек:', error);
    }
    
    // Инициализируем debounce после загрузки настроек
    this.initDebounce();
  }

  /**
   * Обновление настроек
   */
  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    this.initDebounce();
    console.log('✅ [SelectorOptimizer] Настройки обновлены:', this.settings);
  }

  // ==================== ФАЗА 1: КРИТИЧЕСКИЕ УЛУЧШЕНИЯ ====================

  /**
   * Дедупликация массива селекторов
   */
  deduplicateSelectors(selectors) {
    if (!this.settings.deduplicateSelectors) {
      return selectors;
    }
    
    const seen = new Set();
    const deduplicated = [];
    
    for (const selector of selectors) {
      if (!selector?.selector) continue;
      
      const key = selector.selector.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(selector);
      }
    }
    
    if (selectors.length !== deduplicated.length) {
      console.log(`🔄 [Optimizer] Дедупликация: ${selectors.length} → ${deduplicated.length}`);
    }
    
    return deduplicated;
  }

  /**
   * Получение кэшированных селекторов
   */
  getCachedSelectors(element) {
    if (!this.settings.enableSelectorCache || !element) {
      return null;
    }
    
    const cached = this.selectorCache.get(element);
    const timestamp = this.selectorCacheTimestamps.get(element);
    
    if (cached && timestamp && Date.now() - timestamp < this.settings.selectorCacheTTL) {
      console.log('📦 [Optimizer] Использую кэшированные селекторы');
      return cached;
    }
    
    return null;
  }

  /**
   * Сохранение селекторов в кэш
   */
  setCachedSelectors(element, selectors) {
    if (!this.settings.enableSelectorCache || !element) {
      return;
    }
    
    this.selectorCache.set(element, selectors);
    this.selectorCacheTimestamps.set(element, Date.now());
  }

  /**
   * Очистка кэша для элемента
   */
  clearCacheForElement(element) {
    if (element) {
      this.selectorCache.delete(element);
      this.selectorCacheTimestamps.delete(element);
    }
  }

  /**
   * Асинхронная проверка уникальности селекторов
   */
  async checkUniquenessAsync(selectors) {
    if (!this.settings.asyncUniquenessCheck) {
      // Синхронная проверка (старое поведение)
      return selectors.map(sel => ({
        ...sel,
        isUnique: this.checkUniquenessSyncSingle(sel.selector)
      }));
    }
    
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => {
          const results = selectors.map(sel => ({
            ...sel,
            isUnique: this.checkUniquenessSyncSingle(sel.selector)
          }));
          resolve(results);
        }, { timeout: 100 });
      } else {
        // Fallback для браузеров без requestIdleCallback
        setTimeout(() => {
          const results = selectors.map(sel => ({
            ...sel,
            isUnique: this.checkUniquenessSyncSingle(sel.selector)
          }));
          resolve(results);
        }, 0);
      }
    });
  }

  /**
   * Синхронная проверка уникальности одного селектора
   */
  checkUniquenessSyncSingle(selector) {
    if (!selector) return false;
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  // ==================== ФАЗА 2: ЗНАЧИТЕЛЬНЫЕ УЛУЧШЕНИЯ ====================

  /**
   * Расчёт оценки селектора
   */
  calculateSelectorScore(selector, element) {
    if (!this.settings.smartSelectorScoring) {
      // Старое поведение - только по приоритету
      return 100 - (selector.priority || 5) * 10;
    }
    
    let score = 100;
    const selectorStr = selector.selector || '';
    
    // Приоритет типа (чем ниже priority, тем лучше)
    score -= (selector.priority || 5) * 8;
    
    // Штраф за длину
    score -= Math.min(selectorStr.length / 10, 25);
    
    // Бонус за уникальность
    if (selector.isUnique) score += 30;
    
    // Штрафы за динамические части (если включено)
    if (this.settings.penalizeDynamicParts) {
      // Длинные числа (возможно timestamp)
      if (/\d{8,}/.test(selectorStr)) score -= 35;
      
      // UUID паттерны
      if (/[a-f0-9]{8}-[a-f0-9]{4}/i.test(selectorStr)) score -= 45;
      
      // Angular специфичные
      if (/_ngcontent|_nghost|ng-reflect/.test(selectorStr)) score -= 25;
      
      // CSS-in-JS хэши
      if (/\.css-[\da-z]{5,}/i.test(selectorStr)) score -= 30;
      
      // Высокие индексы nth-child/nth-of-type
      const nthMatch = selectorStr.match(/:nth-(?:child|of-type)\((\d+)\)/);
      if (nthMatch && parseInt(nthMatch[1]) > 10) score -= 20;
    }
    
    // Бонусы за стабильные атрибуты
    const stableAttrs = ['data-testid', 'data-cy', 'data-test', 'aria-label', 'data-qa'];
    if (stableAttrs.some(attr => selectorStr.includes(attr))) {
      score += 25;
    }
    
    // Бонус за простые селекторы
    const depth = (selectorStr.match(/\s+/g) || []).length;
    if (depth <= 2) score += 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Получение лучшего селектора из массива
   */
  getBestSelector(selectors, element) {
    if (!selectors || selectors.length === 0) return null;
    
    const scored = selectors.map(sel => ({
      ...sel,
      score: this.calculateSelectorScore(sel, element)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    console.log(`🏆 [Optimizer] Лучший селектор (${scored[0].score}): ${scored[0].selector}`);
    
    return scored[0];
  }

  /**
   * Улучшенное обнаружение dropdown элементов
   */
  isDropdownElement(element) {
    if (!element) return false;
    
    // Проверка кэша
    if (this.settings.improvedDropdownDetection) {
      const cached = this.dropdownCache.get(element);
      if (cached !== undefined) {
        return cached;
      }
    }
    
    const result = this._checkDropdownElementInternal(element);
    
    // Сохраняем в кэш
    if (this.settings.improvedDropdownDetection) {
      this.dropdownCache.set(element, result);
      this._setupDropdownCacheObserver();
    }
    
    return result;
  }

  /**
   * Внутренняя проверка dropdown
   */
  _checkDropdownElementInternal(element) {
    // 1. Прямая проверка тега
    const tag = element.tagName?.toLowerCase();
    if (['select', 'datalist'].includes(tag)) return true;
    
    // 2. Custom Elements / Web Components
    if (element.shadowRoot) {
      const shadowSelect = element.shadowRoot.querySelector('select, [role="listbox"]');
      if (shadowSelect) return true;
    }
    
    // 3. ARIA роли
    const role = element.getAttribute('role');
    const expandedAttr = element.getAttribute('aria-expanded');
    const haspopup = element.getAttribute('aria-haspopup');
    
    if (role === 'combobox' || role === 'listbox') return true;
    if (haspopup === 'listbox' || haspopup === 'menu') return true;
    if (expandedAttr !== null) return true;
    
    // 4. Популярные UI-библиотеки
    const librarySelectors = [
      'app-select', 'ng-select', 'mat-select', 'p-dropdown',
      'v-select', 'el-select', 'ant-select', 'react-select',
      '.MuiSelect-root', '.chakra-select', '[data-radix-select]',
      '.ant-select', '.el-select', '.vs__dropdown-toggle'
    ];
    
    for (const selector of librarySelectors) {
      try {
        if (element.matches?.(selector) || element.closest?.(selector)) return true;
      } catch (e) {
        // Игнорируем невалидные селекторы
      }
    }
    
    // 5. Проверка классов
    const className = element.className?.toString?.() || '';
    const dropdownClasses = ['dropdown', 'select-box', 'combobox', 'autocomplete'];
    if (dropdownClasses.some(cls => className.toLowerCase().includes(cls))) {
      return true;
    }
    
    return false;
  }

  /**
   * Настройка MutationObserver для очистки кэша dropdown
   */
  _setupDropdownCacheObserver() {
    if (this.dropdownCacheObserver) return;
    
    this.dropdownCacheObserver = new MutationObserver(() => {
      this.dropdownCache = new WeakMap();
    });
    
    this.dropdownCacheObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Поиск элемента с экспоненциальным backoff
   */
  async findElementWithExponentialBackoff(selectorData, options = {}) {
    const {
      maxRetries = 5,
      initialDelay = 100,
      maxDelay = 2000,
      useMutationObserver = this.settings.useMutationObserver
    } = options;
    
    if (!this.settings.exponentialBackoffRetry) {
      // Старое поведение - фиксированные задержки
      return this._findElementSimple(selectorData);
    }
    
    const findFn = () => this._findElementBySelector(selectorData);
    
    // Первая попытка
    let element = findFn();
    if (element) return { element, attempts: 1 };
    
    // Ожидание с экспоненциальным backoff
    let delay = initialDelay;
    for (let i = 0; i < maxRetries; i++) {
      if (useMutationObserver) {
        element = await this._waitForElementWithObserver(selectorData, delay);
      } else {
        await this._delay(delay);
        element = findFn();
      }
      
      if (element) return { element, attempts: i + 2 };
      
      delay = Math.min(delay * 2, maxDelay);
    }
    
    return { element: null, attempts: maxRetries + 1 };
  }

  /**
   * Ожидание элемента с MutationObserver
   */
  _waitForElementWithObserver(selectorData, timeout) {
    return new Promise((resolve) => {
      const findFn = () => this._findElementBySelector(selectorData);
      
      // Проверяем сразу
      const element = findFn();
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver(() => {
        const el = findFn();
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        resolve(findFn());
      }, timeout);
    });
  }

  /**
   * Простой поиск элемента
   */
  _findElementSimple(selectorData) {
    return this._findElementBySelector(selectorData);
  }

  /**
   * Поиск элемента по данным селектора
   */
  _findElementBySelector(selectorData) {
    if (!selectorData) return null;
    
    const selector = selectorData.selector || selectorData.value || selectorData;
    if (!selector || typeof selector !== 'string') return null;
    
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  // ==================== ФАЗА 3: ДОПОЛНИТЕЛЬНЫЕ УЛУЧШЕНИЯ ====================

  /**
   * Генерация XPath селектора
   */
  generateXPathSelector(element) {
    if (!this.settings.generateXPath || !element) return null;
    
    if (element === document.body) return '/html/body';
    
    const segments = [];
    let current = element;
    
    while (current && current !== document.body && current !== document.documentElement) {
      let segment = current.tagName.toLowerCase();
      
      // Приоритет: id > data-testid > позиция
      if (current.id) {
        segments.unshift(`//*[@id="${current.id}"]`);
        break;
      }
      
      const testId = current.getAttribute('data-testid');
      if (testId) {
        segments.unshift(`//*[@data-testid="${testId}"]`);
        break;
      }
      
      // Позиция среди siblings
      const siblings = Array.from(current.parentNode?.children || [])
        .filter(el => el.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment = `${segment}[${index}]`;
      }
      
      segments.unshift(segment);
      current = current.parentElement;
    }
    
    if (segments.length === 0) return null;
    
    // Если не начинается с //, добавляем
    const xpath = segments[0].startsWith('//') 
      ? segments.join('/') 
      : '/' + segments.join('/');
    
    return xpath;
  }

  /**
   * Улучшенный поиск overlay-панелей
   */
  findOverlayPanels(dropdownElement = null) {
    if (!this.settings.improvedOverlaySearch) {
      return [];
    }
    
    const panels = new Set();
    
    // 1. Поиск по aria-controls/aria-owns
    if (dropdownElement) {
      ['aria-controls', 'aria-owns', 'aria-describedby'].forEach(attr => {
        const targetId = dropdownElement.getAttribute(attr);
        if (targetId) {
          const panel = document.getElementById(targetId);
          if (panel && this._isElementVisible(panel)) panels.add(panel);
        }
      });
    }
    
    // 2. Поиск в overlay-контейнерах
    const overlayContainers = [
      '.cdk-overlay-container',
      '.MuiPopover-root',
      '.MuiPopper-root',
      '.ant-select-dropdown',
      '[data-radix-popper-content-wrapper]',
      '.chakra-popover__content',
      '[role="presentation"]',
      '.el-select-dropdown',
      '.vs__dropdown-menu'
    ];
    
    overlayContainers.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(container => {
          const listbox = container.querySelector('[role="listbox"], [role="menu"], .options, ul');
          if (listbox && this._isElementVisible(listbox)) {
            panels.add(listbox);
          } else if (this._isElementVisible(container)) {
            panels.add(container);
          }
        });
      } catch (e) {
        // Игнорируем невалидные селекторы
      }
    });
    
    // 3. Поиск по позиции (рядом с dropdown)
    if (dropdownElement) {
      const rect = dropdownElement.getBoundingClientRect();
      document.querySelectorAll('[role="listbox"], [role="menu"]').forEach(el => {
        if (panels.has(el)) return;
        const elRect = el.getBoundingClientRect();
        const distance = Math.abs(elRect.top - rect.bottom) + Math.abs(elRect.left - rect.left);
        if (distance < 300 && this._isElementVisible(el)) {
          panels.add(el);
        }
      });
    }
    
    return Array.from(panels);
  }

  /**
   * Валидация селектора
   */
  validateSelector(selector) {
    if (!this.settings.validateBeforeSave) {
      return { isValid: true, issues: [] };
    }
    
    const issues = [];
    const selectorStr = typeof selector === 'string' ? selector : selector?.selector;
    
    if (!selectorStr) {
      issues.push({ type: 'error', message: 'Пустой селектор' });
      return { isValid: false, issues };
    }
    
    // 1. Проверка валидности CSS
    try {
      document.querySelector(selectorStr);
    } catch (e) {
      issues.push({ type: 'error', message: 'Невалидный CSS селектор' });
    }
    
    // 2. Проверка на динамические части
    const dynamicPatterns = [
      { pattern: /\d{10,}/, message: 'Содержит длинное число (возможно timestamp)' },
      { pattern: /[a-f0-9]{8}-[a-f0-9]{4}/i, message: 'Содержит UUID' },
      { pattern: /_ngcontent-\w+/, message: 'Содержит Angular scoped стили' },
      { pattern: /\.css-[\da-z]+/i, message: 'Содержит CSS-in-JS хэш' },
      { pattern: /:nth-child\(\d{3,}\)/, message: 'Высокий индекс nth-child' }
    ];
    
    dynamicPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(selectorStr)) {
        issues.push({ type: 'warning', message });
      }
    });
    
    // 3. Проверка уникальности
    try {
      const count = document.querySelectorAll(selectorStr).length;
      if (count === 0) {
        issues.push({ type: 'warning', message: 'Элемент не найден на странице' });
      } else if (count > 1) {
        issues.push({ type: 'warning', message: `Найдено ${count} элементов (не уникален)` });
      }
    } catch (e) {
      // Уже проверили выше
    }
    
    return {
      isValid: !issues.some(i => i.type === 'error'),
      issues
    };
  }

  /**
   * Инициализация debounce
   */
  initDebounce() {
    if (this.settings.eventDebounce) {
      this.processEventsDebounced = this._debounce(
        this._processEventQueue.bind(this),
        this.settings.eventDebounceDelay
      );
    }
  }

  /**
   * Добавление события в очередь с debounce
   */
  queueEvent(type, event) {
    if (!this.settings.eventDebounce) {
      return false; // Обрабатывать сразу
    }
    
    // Throttle для кликов
    if (type === 'click') {
      const now = Date.now();
      if (now - this.lastClickTime < this.settings.clickThrottleMs) {
        console.log('⏭️ [Optimizer] Пропуск быстрого клика (throttle)');
        return true; // Пропустить
      }
      this.lastClickTime = now;
    }
    
    this.eventQueue.push({ type, event, timestamp: Date.now() });
    
    if (this.processEventsDebounced) {
      this.processEventsDebounced();
    }
    
    return true; // Событие добавлено в очередь
  }

  /**
   * Обработка очереди событий
   */
  _processEventQueue() {
    if (this.eventQueue.length === 0) return [];
    
    // Дедупликация событий
    const uniqueEvents = this._deduplicateEvents(this.eventQueue);
    this.eventQueue = [];
    
    return uniqueEvents;
  }

  /**
   * Дедупликация событий
   */
  _deduplicateEvents(events) {
    const seen = new Map();
    
    return events.filter(event => {
      const target = event.event?.target;
      const key = `${event.type}-${target?.id || ''}-${target?.className || ''}`;
      const existing = seen.get(key);
      
      if (existing && event.timestamp - existing.timestamp < 500) {
        return false; // Дубликат
      }
      
      seen.set(key, event);
      return true;
    });
  }

  // ==================== МЕТРИКИ И АВТОИСПРАВЛЕНИЕ ====================

  /**
   * Расчёт метрик качества селектора
   */
  calculateMetrics(selector, element) {
    if (!this.settings.calculateMetrics) {
      return null;
    }
    
    const selectorStr = selector?.selector || selector;
    if (!selectorStr) return null;
    
    return {
      length: selectorStr.length,
      depth: (selectorStr.match(/\s+/g) || []).length + 1,
      specificity: this._calculateSpecificity(selectorStr),
      stability: this._assessStability(selectorStr),
      readability: this._assessReadability(selectorStr)
    };
  }

  /**
   * Расчёт специфичности CSS
   */
  _calculateSpecificity(selector) {
    let ids = 0, classes = 0, elements = 0;
    
    // Подсчёт ID
    ids = (selector.match(/#[\w-]+/g) || []).length;
    
    // Подсчёт классов и атрибутов
    classes = (selector.match(/\.[\w-]+/g) || []).length;
    classes += (selector.match(/\[[\w-]+/g) || []).length;
    
    // Подсчёт элементов
    elements = (selector.match(/^[a-z]+|[\s>+~][a-z]+/gi) || []).length;
    
    return ids * 100 + classes * 10 + elements;
  }

  /**
   * Оценка стабильности селектора
   */
  _assessStability(selector) {
    let score = 100;
    
    // Штрафы за нестабильные части
    if (/\d{5,}/.test(selector)) score -= 30;
    if (/nth-child\(\d+\)/.test(selector)) score -= 20;
    if (/nth-of-type\(\d+\)/.test(selector)) score -= 15;
    if (/_ngcontent|_nghost/.test(selector)) score -= 25;
    if (/[a-f0-9]{8}-[a-f0-9]{4}/i.test(selector)) score -= 35;
    
    // Бонусы за стабильные части
    if (/data-testid/.test(selector)) score += 20;
    if (/data-cy/.test(selector)) score += 20;
    if (/aria-label/.test(selector)) score += 15;
    if (/^#[\w-]+$/.test(selector)) score += 10; // Простой ID
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Оценка читаемости селектора
   */
  _assessReadability(selector) {
    if (selector.length < 30) return 100;
    if (selector.length < 60) return 80;
    if (selector.length < 100) return 60;
    return 40;
  }

  /**
   * Автоисправление нестабильного селектора
   */
  async autoFixUnstableSelector(action, selectorEngine) {
    if (!this.settings.autoFixUnstable || !selectorEngine) {
      return action;
    }
    
    const selector = action.selector?.selector || action.selector?.value;
    if (!selector) return action;
    
    const stability = this._assessStability(selector);
    if (stability >= this.settings.minStabilityScore) {
      return action; // Достаточно стабильный
    }
    
    console.log(`⚠️ [Optimizer] Нестабильный селектор (${stability}%): ${selector}`);
    
    try {
      const element = document.querySelector(selector);
      if (!element) return action;
      
      // Генерируем новые селекторы
      const newSelectors = selectorEngine.generateAllSelectors(element);
      
      // Находим лучший стабильный селектор
      const bestSelector = newSelectors
        .map(sel => ({
          ...sel,
          stability: this._assessStability(sel.selector)
        }))
        .filter(sel => sel.isUnique && sel.stability > stability)
        .sort((a, b) => b.stability - a.stability)[0];
      
      if (bestSelector) {
        console.log(`✅ [Optimizer] Найден более стабильный селектор (${bestSelector.stability}%): ${bestSelector.selector}`);
        
        // Сохраняем оригинальный как альтернативный
        const alternatives = action.selector.alternatives || [];
        alternatives.push({
          ...action.selector,
          demotedReason: 'auto-stability-fix',
          originalStability: stability
        });
        
        return {
          ...action,
          selector: {
            ...bestSelector,
            alternatives
          },
          autoFixed: true,
          autoFixReason: 'stability-improvement',
          originalStability: stability,
          newStability: bestSelector.stability
        };
      }
    } catch (e) {
      console.warn('⚠️ [Optimizer] Ошибка автоисправления:', e);
    }
    
    return action;
  }

  // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

  /**
   * Проверка видимости элемента
   */
  _isElementVisible(element) {
    if (!element) return false;
    
    try {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Функция debounce
   */
  _debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Задержка
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Экспортируем глобально
window.SelectorOptimizer = SelectorOptimizer;
window.selectorOptimizer = new SelectorOptimizer();

console.log('✅ [SelectorOptimizer] Модуль загружен');
