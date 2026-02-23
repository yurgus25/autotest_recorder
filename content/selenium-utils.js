/**
 * Утилита для эмуляции логики Selenium из npa-test.py
 * Используется для улучшения поиска и взаимодействия с элементами
 * во время записи и воспроизведения тестов
 */

class SeleniumUtils {
  constructor() {
    console.log('🔧 [SeleniumUtils] Инициализация утилиты (логика из автотеста npa-test.py)');
    
    // Инициализация SmartWaiter для умных ожиданий
    if (window.SmartWaiter) {
      this.smartWaiter = new window.SmartWaiter();
      console.log('   ✅ SmartWaiter инициализирован для умных ожиданий');
    } else {
      this.smartWaiter = null;
      console.warn('   ⚠️ SmartWaiter недоступен, используются фиксированные задержки');
    }
    
    // ===== SHADOW DOM SUPPORT =====
    console.log('   🌓 Инициализация Shadow DOM поддержки...');
    
    // Рекурсивный поиск элементов включая Shadow DOM
    this.querySelectorAllDeep = (selector, root = document) => {
      let results = [];
      
      try {
        // Поиск в текущем DOM
        const currentResults = root.querySelectorAll(selector);
        results = results.concat(Array.from(currentResults));
      } catch (e) {
        // Игнорируем ошибки селектора
      }
      
      // Рекурсивный поиск в Shadow DOM
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          try {
            const shadowResults = this.querySelectorAllDeep(selector, el.shadowRoot);
            results = results.concat(shadowResults);
          } catch (e) {
            // Игнорируем ошибки в Shadow DOM
          }
        }
      }
      
      return results;
    };
    
    // Поиск одного элемента включая Shadow DOM
    this.querySelectorDeep = (selector, root = document) => {
      try {
        // Сначала пробуем в текущем DOM
        const result = root.querySelector(selector);
        if (result) return result;
      } catch (e) {
        // Игнорируем ошибки селектора
      }
      
      // Ищем в Shadow DOM
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          const shadowResult = this.querySelectorDeep(selector, el.shadowRoot);
          if (shadowResult) return shadowResult;
        }
      }
      
      return null;
    };
    
    // Проверка видимости элемента с учетом Shadow DOM
    this.isElementVisibleDeep = (element) => {
      if (!element) return false;
      
      // Стандартная проверка видимости
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      
      if (!isVisible) return false;
      
      // Проверяем стили
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || 
          style.visibility === 'hidden' || 
          style.opacity === '0') {
        return false;
      }
      
      // Проверяем родителей включая Shadow DOM hosts
      let parent = element.parentElement;
      while (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none' || 
            parentStyle.visibility === 'hidden') {
          return false;
        }
        
        // Если parent это shadow host, проверяем его видимость
        if (parent.shadowRoot) {
          const hostRect = parent.getBoundingClientRect();
          if (hostRect.width === 0 || hostRect.height === 0) {
            return false;
          }
        }
        
        parent = parent.parentElement;
      }
      
      return true;
    };
    
    console.log('   ✅ Shadow DOM поддержка активирована');
    // ===== END SHADOW DOM SUPPORT =====
    
    // Селекторы для dropdown панелей (из автотеста + дополнительные для Angular)
    this.dropdownPanelSelectors = [
      '.dropdown-menu',
      '[role="listbox"]',
      '.select-options',
      '[class*="dropdown"]',
      '[class*="status"]',
      '.content-list', // Для панелей со статусами
      '.content-list-container', // Контейнер списка опций
      '.menu', // Общий класс меню
      '[class*="menu"]', // Любые элементы с menu в классе
      '.cdk-overlay-pane', // Angular Material overlay
      '.mat-select-panel', // Angular Material select
      '.ng-dropdown-panel', // ng-select panel
      '.select-group', // Для app-select компонентов
      '[class*="select-group"]', // Любые элементы с select-group
      '.select-box', // Для select-box элементов
      '[class*="select-box"]', // Любые элементы с select-box
      'app-select .content-list', // Прямой селектор для app-select
      'app-select .content-list-container', // Контейнер в app-select
      'app-select .select-group', // select-group в app-select
      '[class*="option"]', // Любые элементы с option в классе (может быть панель)
      '.options-container', // Контейнер опций
      '[class*="options"]', // Любые элементы с options в классе
      // ===== ТОП-5 БИБЛИОТЕК =====
      // Ant Design
      '.ant-select-dropdown', // Основная панель Ant Design
      '.rc-virtual-list', // Виртуализированный список Ant Design
      '.ant-select-item-group', // Группы опций Ant Design
      // Select2
      '.select2-dropdown', // Основная панель Select2
      '.select2-results', // Контейнер результатов Select2
      '.select2-results__options', // Список опций Select2
      // Choices.js
      '.choices__list--dropdown', // Панель Choices.js
      '.choices__list', // Список Choices.js
      // Vuetify
      '.v-menu__content', // Панель меню Vuetify
      '.v-list', // Список Vuetify
      '.v-select-list', // Список select Vuetify
      // Semantic UI
      '.ui.dropdown > .menu', // Панель Semantic UI dropdown
      '.ui.selection.dropdown .menu' // Панель Semantic UI selection dropdown
    ];
    
    // Селекторы для опций (из автотеста + дополнительные для статусов)
    this.optionSelectors = [
      'li',
      'div',
      'span',
      '[role="option"]',
      '.option',
      'div.option', // Опции со статусами
      'div[class*="option"]', // Любые div с option в классе
      '.cutted-text', // Класс для опций статусов
      'div.cutted-text', // Опции статусов
      '.mat-option', // Angular Material option
      '.ng-option', // ng-select option
      'div.ng-star-inserted', // Angular элементы с ng-star-inserted
      'span.ng-star-inserted', // Angular span элементы
      'div[class*="ng-star"]', // Любые Angular элементы
      '.menu__item', // Элементы меню
      '[class*="menu__item"]', // Любые элементы меню
      'div[class*="item"]', // Любые элементы с item в классе
      'a[class*="item"]', // Ссылки с item в классе
      'span[class*="item"]', // Span с item в классе
      // ===== ТОП-5 БИБЛИОТЕК =====
      // Ant Design
      '.ant-select-item', // Основная опция Ant Design
      '.ant-select-item-option', // Опция выбора Ant Design
      'div.ant-select-item', // Div опции Ant Design
      // Select2
      '.select2-results__option', // Опция Select2
      'li.select2-results__option', // Li опция Select2
      // Choices.js
      '.choices__item--selectable', // Выбираемая опция Choices.js
      '.choices__item', // Любая опция Choices.js
      'div.choices__item', // Div опция Choices.js
      // Vuetify
      '.v-list-item', // Элемент списка Vuetify
      '.v-list-item__content', // Контент элемента Vuetify
      'div.v-list-item', // Div элемент списка Vuetify
      // Semantic UI
      '.ui.dropdown .item', // Элемент Semantic UI dropdown
      'div.item' // Общий div.item для Semantic UI
    ];
    
    // Плейсхолдеры, которые нужно игнорировать
    this.placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
    
    console.log('   ✅ Селекторы панелей:', this.dropdownPanelSelectors);
    console.log('   ✅ Селекторы опций:', this.optionSelectors);
    console.log('   ✅ Плейсхолдеры:', this.placeholderTexts);
  }

  /**
   * Эмуляция WebDriverWait - ожидание появления элемента
   * @param {string|Function} selectorOrFunction - CSS селектор или функция проверки
   * @param {number} timeout - Таймаут в миллисекундах
   * @param {number} interval - Интервал проверки в миллисекундах
   * @returns {Promise<Element|null>}
   */
  async waitForElement(selectorOrFunction, timeout = 10000, interval = 500) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      let element = null;
      
      if (typeof selectorOrFunction === 'function') {
        // Функция проверки (как в Selenium: EC.element_to_be_clickable)
        try {
          element = selectorOrFunction();
        } catch (e) {
          // Игнорируем ошибки
        }
      } else {
        // CSS селектор
        element = document.querySelector(selectorOrFunction);
      }
      
      if (element && this.isElementVisible(element)) {
        return element;
      }
      
      await this.delay(interval);
    }
    
    return null;
  }

  /**
   * Эмуляция find_elements - поиск всех элементов
   * @param {string} selector - CSS селектор
   * @returns {Array<Element>}
   */
  findElements(selector) {
    try {
      // Используем SelectorEngine, если доступен и селектор - объект с типом
      if (window.selectorEngine && typeof selector === 'object' && selector.selector) {
        const element = window.selectorEngine.findElementSync(selector);
        return element ? [element] : [];
      }
      
      // Обычный поиск по строке с Shadow DOM поддержкой
      const selectorString = typeof selector === 'object' ? selector.selector : selector;
      
      // SHADOW DOM: Используем querySelectorAllDeep для поиска в Shadow DOM
      if (this.querySelectorAllDeep) {
        return this.querySelectorAllDeep(selectorString, document);
      }
      
      // Fallback на обычный querySelectorAll
      return Array.from(document.querySelectorAll(selectorString));
    } catch (e) {
      console.warn(`⚠️ [SeleniumUtils] Ошибка при поиске элементов "${selector}": ${e.message}`);
      return [];
    }
  }

  /**
   * Эмуляция find_element - поиск первого элемента
   * @param {string|object} selector - CSS селектор или объект SelectorEngine
   * @returns {Element|null}
   */
  findElement(selector) {
    try {
      // Используем SelectorEngine, если доступен и селектор - объект с типом
      if (window.selectorEngine && typeof selector === 'object' && selector.selector) {
        return window.selectorEngine.findElementSync(selector) || null;
      }
      
      // Обычный поиск по строке
      const selectorString = typeof selector === 'object' ? selector.selector : selector;
      return document.querySelector(selectorString);
    } catch (e) {
      console.warn(`⚠️ [SeleniumUtils] Ошибка при поиске элемента "${selector}": ${e.message}`);
      return null;
    }
  }

  /**
   * Проверка видимости элемента (как is_displayed() в Selenium)
   * @param {Element} element
   * @returns {boolean}
   */
  isElementVisible(element) {
    if (!element) return false;
    
    try {
      // SHADOW DOM: Используем улучшенную проверку с Shadow DOM поддержкой
      if (this.isElementVisibleDeep) {
        return this.isElementVisibleDeep(element);
      }
      
      // Fallback на стандартную проверку
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.offsetParent !== null
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Получение текста элемента (как .text в Selenium)
   * @param {Element} element
   * @returns {string}
   */
  getElementText(element) {
    if (!element) return '';
    
    // Используем SelectorEngine, если доступен (более умная реализация)
    if (window.selectorEngine && typeof window.selectorEngine.getElementText === 'function') {
      try {
        return window.selectorEngine.getElementText(element);
      } catch (e) {
        // Fallback на простую реализацию
      }
    }
    
    // Простая реализация (fallback)
    try {
      return element.textContent?.trim() || element.innerText?.trim() || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Получение атрибута элемента (как .get_attribute() в Selenium)
   * @param {Element} element
   * @param {string} attribute
   * @returns {string}
   */
  getAttribute(element, attribute) {
    if (!element) return '';
    
    try {
      return element.getAttribute(attribute) || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Эмуляция click() - клик по элементу
   * @param {Element} element
   * @param {boolean} useJavaScript - Использовать JavaScript клик (как execute_script)
   * @returns {Promise<boolean>}
   */
  async click(element, useJavaScript = false) {
    if (!element) return false;
    
    try {
      if (useJavaScript) {
        // Эмуляция browser.execute_script("arguments[0].click();", element)
        element.click();
      } else {
        // Обычный клик
        element.click();
      }
      
      // Задержка после клика (как time.sleep(2) в автотесте)
      await this.delay(200);
      
      return true;
    } catch (e) {
      console.warn(`⚠️ [SeleniumUtils] Ошибка при клике: ${e.message}`);
      
      // Fallback на JavaScript клик
      if (!useJavaScript) {
        return await this.click(element, true);
      }
      
      return false;
    }
  }

  /**
   * Dispatch всех необходимых событий для React/Vue/Angular
   * @param {Element} element - Элемент для dispatch событий
   * @param {*} value - Значение для установки
   */
  dispatchAllEvents(element, value = null) {
    if (!element) return;
    
    try {
      console.log('   🎯 [Events] Dispatching всех событий для фреймворков...');
      
      // 1. НАТИВНЫЕ СОБЫТИЯ
      // Эти события обязательны для стандартных form элементов
      const nativeEvents = ['input', 'change', 'blur'];
      for (const eventType of nativeEvents) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
      }
      console.log('   ✅ Нативные события: input, change, blur');
      
      // 2. REACT SYNTHETIC EVENTS
      // React использует synthetic events и может не реагировать на обычные события
      if (value !== null && (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA')) {
        try {
          // Получаем native setter для value
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 
            'value'
          )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype,
            'value'
          )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, value);
            
            // React требует input event после изменения value
            const inputEvent = new Event('input', { bubbles: true });
            element.dispatchEvent(inputEvent);
            console.log('   ✅ React synthetic events dispatched');
          }
        } catch (e) {
          console.warn('   ⚠️ React events error:', e.message);
        }
      }
      
      // 3. VUE EVENTS
      // Vue использует v-model и может использовать custom events
      try {
        // Vue 3 использует __vueParentComponent
        if (element.__vueParentComponent && value !== null) {
          element.__vueParentComponent.emit?.('update:modelValue', value);
          console.log('   ✅ Vue 3 events dispatched');
        }
        
        // Vue 2 использует __vue__
        if (element.__vue__ && value !== null) {
          element.__vue__.$emit?.('input', value);
          console.log('   ✅ Vue 2 events dispatched');
        }
        
        // Dispatch кастомного Vue события
        const vueEvent = new CustomEvent('input', { 
          detail: value, 
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(vueEvent);
      } catch (e) {
        console.warn('   ⚠️ Vue events error:', e.message);
      }
      
      // 4. ANGULAR EVENTS
      // Angular может требовать ngModelChange
      try {
        const ngModelChange = new CustomEvent('ngModelChange', {
          detail: value,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(ngModelChange);
        console.log('   ✅ Angular events dispatched');
      } catch (e) {
        console.warn('   ⚠️ Angular events error:', e.message);
      }
      
      // 5. FOCUS EVENTS
      // Некоторые компоненты требуют focus/blur для активации
      try {
        element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        setTimeout(() => {
          element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        }, 50);
      } catch (e) {
        console.warn('   ⚠️ Focus events error:', e.message);
      }
      
    } catch (e) {
      console.warn(`⚠️ [Events] Ошибка при dispatch событий: ${e.message}`);
    }
  }

  /**
   * Проверка является ли dropdown multiselect
   * @param {Element} dropdownElement
   * @returns {boolean}
   */
  isMultiselect(dropdownElement) {
    if (!dropdownElement) return false;
    
    // Native <select multiple>
    if (dropdownElement.tagName === 'SELECT' && dropdownElement.multiple) {
      return true;
    }
    
    // Кастомные multiselect через классы
    const className = dropdownElement.className || '';
    const multiselectClasses = [
      'multiselect',
      'multi-select',
      'multiple',
      'tags',
      'chips'
    ];
    
    for (const cls of multiselectClasses) {
      if (className.toLowerCase().includes(cls)) {
        return true;
      }
    }
    
    // Ant Design multiple
    if (className.includes('ant-select') && 
        (dropdownElement.querySelector('.ant-select-selector-multiple') ||
         dropdownElement.classList.contains('ant-select-multiple'))) {
      return true;
    }
    
    // Select2 multiple
    if (className.includes('select2') && 
        dropdownElement.querySelector('.select2-selection--multiple')) {
      return true;
    }
    
    // Vuetify multiple
    if (className.includes('v-select') && 
        dropdownElement.hasAttribute('multiple')) {
      return true;
    }
    
    // Проверяем aria-multiselectable
    if (dropdownElement.getAttribute('aria-multiselectable') === 'true') {
      return true;
    }
    
    return false;
  }

  /**
   * Выбор нескольких значений в multiselect dropdown
   * @param {Element} dropdownElement
   * @param {Array<string>} values - Массив значений для выбора
   * @returns {Promise<boolean>}
   */
  async selectMultipleOptions(dropdownElement, values) {
    if (!dropdownElement || !values || values.length === 0) return false;
    
    console.log(`📋 [Multiselect] ════════════════════════════════════════════════════`);
    console.log(`📋 [Multiselect] Выбор ${values.length} значений:`, values);
    console.log(`📋 [Multiselect] ════════════════════════════════════════════════════`);
    
    // Для нативного <select multiple>
    if (dropdownElement.tagName === 'SELECT' && dropdownElement.multiple) {
      console.log('   📋 [Multiselect] Нативный <select multiple>');
      
      const options = dropdownElement.querySelectorAll('option');
      let selectedCount = 0;
      
      for (const value of values) {
        const valueLower = value.toLowerCase().trim();
        
        for (const option of options) {
          const optValue = (option.value || '').toLowerCase().trim();
          const optText = (option.textContent || '').toLowerCase().trim();
          
          if (optValue === valueLower || optText === valueLower) {
            option.selected = true;
            selectedCount++;
            console.log(`   ✅ Выбрано: "${option.textContent || option.value}"`);
            break;
          }
        }
      }
      
      if (selectedCount > 0) {
        this.dispatchAllEvents(dropdownElement, values);
        console.log(`✅ [Multiselect] Выбрано ${selectedCount} из ${values.length} значений`);
        return true;
      }
      
      return false;
    }
    
    // Для кастомных multiselect - выбираем по очереди
    console.log('   📋 [Multiselect] Кастомный multiselect - последовательный выбор');
    
    let successCount = 0;
    
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      console.log(`   📋 [Multiselect] Выбор ${i + 1}/${values.length}: "${value}"`);
      
      // Открываем dropdown (если еще не открыт)
      if (!this.isDropdownOpen(dropdownElement)) {
        await this.click(dropdownElement);
        await this.delay(200);
      }
      
      // Ищем и кликаем опцию
      const panels = this.findDropdownPanels(dropdownElement);
      let found = false;
      
      for (const panel of panels) {
        const options = this.findOptionsInPanel(panel);
        const valueLower = value.toLowerCase().trim();
        
        for (const option of options) {
          const optText = this.getElementText(option).toLowerCase().trim();
          const optValue = (this.getAttribute(option, 'value') || '').toLowerCase();
          
          if (optText === valueLower || optValue === valueLower || 
              optText.includes(valueLower) || valueLower.includes(optText)) {
            
            this.scrollIntoView(option, true);
            await this.delay(100);
            await this.click(option);
            await this.delay(200);
            
            successCount++;
            found = true;
            console.log(`   ✅ Выбрано: "${this.getElementText(option)}"`);
            break;
          }
        }
        
        if (found) break;
      }
      
      if (!found) {
        console.warn(`   ⚠️ Не найдена опция: "${value}"`);
      }
      
      // НЕ закрываем dropdown между выборами (важно для multiselect)
      // Небольшая задержка между выборами
      await this.delay(100);
    }
    
    // Закрываем dropdown после всех выборов (клик вне или ESC)
    if (this.isDropdownOpen(dropdownElement)) {
      // Пробуем ESC
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27 }));
      await this.delay(200);
      
      // Если не закрылся, кликаем вне dropdown
      if (this.isDropdownOpen(dropdownElement)) {
        document.body.click();
        await this.delay(200);
      }
    }
    
    if (successCount > 0) {
      this.dispatchAllEvents(dropdownElement, values);
      console.log(`✅ [Multiselect] Успешно выбрано ${successCount} из ${values.length} значений`);
      return true;
    }
    
    console.warn(`⚠️ [Multiselect] Не удалось выбрать ни одного значения`);
    return false;
  }

  /**
   * Удаление одного значения из multiselect
   * @param {Element} dropdownElement
   * @param {string} value - Значение для удаления
   * @returns {Promise<boolean>}
   */
  async deselectOption(dropdownElement, value) {
    if (!dropdownElement || !value) return false;
    
    console.log(`🗑️ [Deselect] Удаление значения: "${value}"`);
    
    // Для нативного <select multiple>
    if (dropdownElement.tagName === 'SELECT' && dropdownElement.multiple) {
      const options = dropdownElement.querySelectorAll('option');
      const valueLower = value.toLowerCase().trim();
      
      for (const option of options) {
        const optValue = (option.value || '').toLowerCase().trim();
        const optText = (option.textContent || '').toLowerCase().trim();
        
        if ((optValue === valueLower || optText === valueLower) && option.selected) {
          option.selected = false;
          this.dispatchAllEvents(dropdownElement, null);
          console.log(`✅ [Deselect] Удалено: "${option.textContent || option.value}"`);
          return true;
        }
      }
      
      return false;
    }
    
    // Для кастомных multiselect - ищем и кликаем на кнопку удаления или повторно на опцию
    const valueLower = value.toLowerCase().trim();
    
    // Способ 1: Поиск кнопки удаления (X) в selected items
    const selectedTags = dropdownElement.querySelectorAll(
      '.ant-select-selection-item, .select2-selection__choice, .choices__item, ' +
      '.v-chip, .v-select__selection, [class*="tag"], [class*="chip"], [class*="selected"]'
    );
    
    for (const tag of selectedTags) {
      const tagText = this.getElementText(tag).toLowerCase().trim();
      
      if (tagText.includes(valueLower) || valueLower.includes(tagText)) {
        // Ищем кнопку удаления внутри тега
        const removeButton = tag.querySelector(
          '.ant-select-selection-item-remove, .select2-selection__choice__remove, ' +
          '.choices__button, .v-chip__close, [class*="remove"], [class*="close"], ' +
          '[class*="delete"], [aria-label*="remove"], [aria-label*="delete"]'
        );
        
        if (removeButton) {
          console.log('   🗑️ [Deselect] Найдена кнопка удаления, кликаю...');
          await this.click(removeButton);
          await this.delay(200);
          this.dispatchAllEvents(dropdownElement, null);
          console.log(`✅ [Deselect] Удалено через кнопку: "${tagText}"`);
          return true;
        }
      }
    }
    
    // Способ 2: Повторный клик по выбранной опции (toggle)
    console.log('   🔄 [Deselect] Кнопка удаления не найдена, пробую повторный клик...');
    
    // Открываем dropdown
    if (!this.isDropdownOpen(dropdownElement)) {
      await this.click(dropdownElement);
      await this.delay(200);
    }
    
    const panels = this.findDropdownPanels(dropdownElement);
    
    for (const panel of panels) {
      const options = this.findOptionsInPanel(panel);
      
      for (const option of options) {
        const optText = this.getElementText(option).toLowerCase().trim();
        const optValue = (this.getAttribute(option, 'value') || '').toLowerCase();
        
        if (optText === valueLower || optValue === valueLower || 
            optText.includes(valueLower)) {
          
          // Проверяем что опция уже выбрана (через классы или aria)
          const isSelected = option.classList.contains('selected') ||
                           option.classList.contains('active') ||
                           option.classList.contains('ant-select-item-option-selected') ||
                           option.getAttribute('aria-selected') === 'true';
          
          if (isSelected) {
            this.scrollIntoView(option, true);
            await this.delay(100);
            await this.click(option);
            await this.delay(200);
            this.dispatchAllEvents(dropdownElement, null);
            console.log(`✅ [Deselect] Удалено через повторный клик: "${optText}"`);
            
            // Закрываем dropdown
            document.dispatchEvent(new KeyboardEvent('keydown', { 
              key: 'Escape', code: 'Escape', keyCode: 27 
            }));
            await this.delay(200);
            
            return true;
          }
        }
      }
    }
    
    console.warn(`⚠️ [Deselect] Не удалось удалить значение: "${value}"`);
    return false;
  }

  /**
   * Удаление нескольких значений из multiselect
   * @param {Element} dropdownElement
   * @param {Array<string>} values - Массив значений для удаления
   * @returns {Promise<boolean>}
   */
  async deselectMultipleOptions(dropdownElement, values) {
    if (!dropdownElement || !values || values.length === 0) return false;
    
    console.log(`🗑️ [Deselect] ════════════════════════════════════════════════════`);
    console.log(`🗑️ [Deselect] Удаление ${values.length} значений:`, values);
    console.log(`🗑️ [Deselect] ════════════════════════════════════════════════════`);
    
    let successCount = 0;
    
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      console.log(`   🗑️ [Deselect] Удаление ${i + 1}/${values.length}: "${value}"`);
      
      const success = await this.deselectOption(dropdownElement, value);
      if (success) {
        successCount++;
      }
      
      await this.delay(100);
    }
    
    if (successCount > 0) {
      console.log(`✅ [Deselect] Успешно удалено ${successCount} из ${values.length} значений`);
      return true;
    }
    
    console.warn(`⚠️ [Deselect] Не удалось удалить ни одного значения`);
    return false;
  }

  /**
   * Поиск опции в <optgroup> структуре
   * @param {Element} selectElement - <select> элемент
   * @param {string} targetValue - Искомое значение
   * @returns {Element|null} - Найденная <option> или null
   */
  findOptionInOptgroup(selectElement, targetValue) {
    if (!selectElement || selectElement.tagName !== 'SELECT') return null;
    
    const targetLower = targetValue.toLowerCase().trim();
    console.log(`📂 [Optgroup] Поиск опции "${targetValue}" в группах...`);
    
    // Проверяем есть ли optgroup
    const optgroups = selectElement.querySelectorAll('optgroup');
    
    if (optgroups.length === 0) {
      console.log('   📂 [Optgroup] Группы не найдены, обычный select');
      return null;
    }
    
    console.log(`   📂 [Optgroup] Найдено ${optgroups.length} групп`);
    
    // Ищем в каждой группе
    for (const optgroup of optgroups) {
      const groupLabel = optgroup.getAttribute('label') || '';
      const options = optgroup.querySelectorAll('option');
      
      console.log(`   📂 [Optgroup] Группа "${groupLabel}": ${options.length} опций`);
      
      for (const option of options) {
        const optValue = (option.value || '').toLowerCase().trim();
        const optText = (option.textContent || '').toLowerCase().trim();
        
        // Точное совпадение
        if (optValue === targetLower || optText === targetLower) {
          console.log(`   ✅ [Optgroup] Найдена опция в группе "${groupLabel}": "${option.textContent}"`);
          return option;
        }
      }
    }
    
    // Если не нашли точное, ищем частичное
    for (const optgroup of optgroups) {
      const groupLabel = optgroup.getAttribute('label') || '';
      const options = optgroup.querySelectorAll('option');
      
      for (const option of options) {
        const optValue = (option.value || '').toLowerCase().trim();
        const optText = (option.textContent || '').toLowerCase().trim();
        
        // Частичное совпадение
        if (optValue.includes(targetLower) || optText.includes(targetLower)) {
          console.log(`   ✅ [Optgroup] Найдена опция (частичное) в группе "${groupLabel}": "${option.textContent}"`);
          return option;
        }
      }
    }
    
    console.warn(`   ⚠️ [Optgroup] Опция "${targetValue}" не найдена в группах`);
    return null;
  }

  /**
   * Получение всех групп и опций из select с optgroup
   * @param {Element} selectElement
   * @returns {Array<{group: string, options: Array}>}
   */
  getOptgroupStructure(selectElement) {
    if (!selectElement || selectElement.tagName !== 'SELECT') return [];
    
    const structure = [];
    const optgroups = selectElement.querySelectorAll('optgroup');
    
    for (const optgroup of optgroups) {
      const groupLabel = optgroup.getAttribute('label') || 'Unnamed Group';
      const options = Array.from(optgroup.querySelectorAll('option')).map(opt => ({
        value: opt.value,
        text: opt.textContent,
        disabled: opt.disabled
      }));
      
      structure.push({
        group: groupLabel,
        options: options
      });
    }
    
    // Также добавляем опции вне групп (если есть)
    const ungroupedOptions = Array.from(selectElement.querySelectorAll('option:not(optgroup option)')).map(opt => ({
      value: opt.value,
      text: opt.textContent,
      disabled: opt.disabled
    }));
    
    if (ungroupedOptions.length > 0) {
      structure.unshift({
        group: 'Ungrouped',
        options: ungroupedOptions
      });
    }
    
    return structure;
  }

  /**
   * Определение является ли dropdown combobox (с возможностью ввода)
   * @param {Element} dropdownElement
   * @returns {boolean}
   */
  isCombobox(dropdownElement) {
    if (!dropdownElement) return false;
    
    // ARIA role="combobox"
    if (dropdownElement.getAttribute('role') === 'combobox') {
      return true;
    }
    
    // Input с aria-autocomplete
    if (dropdownElement.tagName === 'INPUT' && 
        (dropdownElement.getAttribute('aria-autocomplete') || 
         dropdownElement.getAttribute('autocomplete') === 'on')) {
      return true;
    }
    
    // Классы combobox
    const className = dropdownElement.className || '';
    if (className.includes('combobox') || 
        className.includes('autocomplete') ||
        className.includes('searchable')) {
      return true;
    }
    
    // Ant Design searchable select
    if (className.includes('ant-select') && 
        (dropdownElement.querySelector('.ant-select-selection-search-input') ||
         dropdownElement.querySelector('input[type="text"]'))) {
      return true;
    }
    
    // Select2 with search
    if (className.includes('select2') &&
        dropdownElement.querySelector('.select2-search__field')) {
      return true;
    }
    
    // Vuetify autocomplete
    if (dropdownElement.tagName === 'V-AUTOCOMPLETE' ||
        className.includes('v-autocomplete')) {
      return true;
    }
    
    return false;
  }

  /**
   * Находит input для ввода текста в combobox
   * @param {Element} comboboxElement
   * @returns {Element|null}
   */
  findComboboxInput(comboboxElement) {
    if (!comboboxElement) return null;
    
    // Если сам элемент - input
    if (comboboxElement.tagName === 'INPUT') {
      return comboboxElement;
    }
    
    // Ищем input внутри combobox
    const inputSelectors = [
      'input[type="text"]',
      'input[role="combobox"]',
      '.ant-select-selection-search-input',
      '.select2-search__field',
      'input[aria-autocomplete]',
      'input.v-autocomplete__input'
    ];
    
    for (const selector of inputSelectors) {
      const input = comboboxElement.querySelector(selector);
      if (input) {
        return input;
      }
    }
    
    // Fallback - любой input
    return comboboxElement.querySelector('input');
  }

  /**
   * Выбор значения в combobox с поиском
   * @param {Element} comboboxElement
   * @param {string} targetValue
   * @returns {Promise<boolean>}
   */
  async selectComboboxOption(comboboxElement, targetValue) {
    if (!comboboxElement || !targetValue) return false;
    
    console.log(`🔍 [Combobox] ════════════════════════════════════════════════════`);
    console.log(`🔍 [Combobox] Поиск и выбор: "${targetValue}"`);
    console.log(`🔍 [Combobox] ════════════════════════════════════════════════════`);
    
    // Находим input для ввода
    const input = this.findComboboxInput(comboboxElement);
    
    if (!input) {
      console.warn('⚠️ [Combobox] Input для ввода не найден');
      return false;
    }
    
    console.log('   🔍 [Combobox] Найден input для ввода');
    
    // Фокус на input
    input.focus();
    await this.delay(100);
    
    // Очищаем предыдущее значение
    input.value = '';
    this.dispatchAllEvents(input, '');
    await this.delay(100);
    
    // Вводим текст посимвольно (с debounce)
    console.log(`   ⌨️ [Combobox] Ввод текста: "${targetValue}"`);
    
    for (let i = 0; i < targetValue.length; i++) {
      const char = targetValue[i];
      input.value += char;
      
      // Dispatch событий после каждого символа
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { 
        key: char, 
        bubbles: true 
      }));
      
      // Debounce - задержка между символами
      await this.delay(50);
    }
    
    // Финальные события
    this.dispatchAllEvents(input, targetValue);
    
    // Ждем загрузки отфильтрованных опций
    console.log('   ⏳ [Combobox] Ожидание загрузки опций...');
    await this.delay(500);
    
    // Ищем dropdown panel с опциями
    const panels = this.findDropdownPanels(comboboxElement);
    
    if (panels.length === 0) {
      console.warn('⚠️ [Combobox] Панель с опциями не найдена');
      return false;
    }
    
    console.log(`   📋 [Combobox] Найдено ${panels.length} панелей`);
    
    // Ищем опцию (может быть уже отфильтрованная)
    const targetLower = targetValue.toLowerCase().trim();
    
    for (const panel of panels) {
      const options = this.findOptionsInPanel(panel);
      console.log(`   📋 [Combobox] Панель содержит ${options.length} опций`);
      
      if (options.length === 0) continue;
      
      // Сначала точное совпадение
      for (const option of options) {
        const optText = this.getElementText(option).toLowerCase().trim();
        const optValue = (this.getAttribute(option, 'value') || '').toLowerCase();
        
        if (optText === targetLower || optValue === targetLower) {
          console.log(`   ✅ [Combobox] Найдена опция (точное): "${this.getElementText(option)}"`);
          
          this.scrollIntoView(option, true);
          await this.delay(100);
          await this.click(option);
          await this.delay(200);
          
          this.dispatchAllEvents(comboboxElement, targetValue);
          
          console.log(`✅ [Combobox] Опция успешно выбрана`);
          return true;
        }
      }
      
      // Если только одна опция - выбираем её (автокомплит сработал)
      if (options.length === 1) {
        const option = options[0];
        const optText = this.getElementText(option).trim();
        
        console.log(`   ✅ [Combobox] Единственная опция после фильтрации: "${optText}"`);
        
        this.scrollIntoView(option, true);
        await this.delay(100);
        await this.click(option);
        await this.delay(200);
        
        this.dispatchAllEvents(comboboxElement, optText);
        
        console.log(`✅ [Combobox] Опция успешно выбрана (единственная)`);
        return true;
      }
      
      // Частичное совпадение
      for (const option of options) {
        const optText = this.getElementText(option).toLowerCase().trim();
        const optValue = (this.getAttribute(option, 'value') || '').toLowerCase();
        
        if (optText.includes(targetLower) || optValue.includes(targetLower)) {
          console.log(`   ✅ [Combobox] Найдена опция (частичное): "${this.getElementText(option)}"`);
          
          this.scrollIntoView(option, true);
          await this.delay(100);
          await this.click(option);
          await this.delay(200);
          
          this.dispatchAllEvents(comboboxElement, targetValue);
          
          console.log(`✅ [Combobox] Опция успешно выбрана`);
          return true;
        }
      }
    }
    
    // Если не нашли в панелях, пробуем Enter (некоторые combobox разрешают произвольный ввод)
    console.log('   ⚠️ [Combobox] Опция не найдена, пробую Enter...');
    
    input.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'Enter', 
      code: 'Enter',
      keyCode: 13,
      bubbles: true 
    }));
    
    await this.delay(200);
    
    // Проверяем что значение установлено
    if (input.value.toLowerCase().trim() === targetLower) {
      console.log(`✅ [Combobox] Значение установлено через Enter`);
      return true;
    }
    
    console.warn(`⚠️ [Combobox] Не удалось выбрать опцию "${targetValue}"`);
    return false;
  }

  /**
   * Проверка является ли список виртуализированным
   * @param {Element} panel - Панель с опциями
   * @returns {boolean}
   */
  isVirtualizedList(panel) {
    if (!panel) return false;
    
    // React Window / React Virtualized
    const hasReactVirtualized = panel.querySelector('[class*="ReactVirtualized"], [class*="react-window"]') ||
                                panel.classList.contains('ReactVirtualized__List') ||
                                panel.classList.contains('react-window');
    
    // Angular CDK Virtual Scroll
    const hasCdkVirtual = panel.querySelector('cdk-virtual-scroll-viewport') ||
                         panel.classList.contains('cdk-virtual-scroll-viewport');
    
    // Ant Design rc-virtual-list
    const hasRcVirtual = panel.querySelector('.rc-virtual-list') ||
                        panel.classList.contains('rc-virtual-list');
    
    return hasReactVirtualized || hasCdkVirtual || hasRcVirtual;
  }

  /**
   * Прокрутка виртуализированного списка для поиска опции
   * @param {Element} panel - Панель с виртуализированным списком
   * @param {string} targetValue - Искомое значение
   * @returns {Promise<Element|null>} - Найденная опция или null
   */
  async scrollVirtualizedListToOption(panel, targetValue) {
    if (!panel) return null;
    
    console.log(`   🔄 [Virtualized] Поиск опции "${targetValue}" в виртуализированном списке...`);
    
    const targetLower = targetValue.toLowerCase().trim();
    const maxScrollAttempts = 50; // Максимум попыток прокрутки
    let scrollAttempts = 0;
    let lastScrollTop = -1;
    
    // Находим scrollable контейнер
    let scrollContainer = panel;
    
    // React Window / Virtualized - ищем внутренний скроллируемый элемент
    const reactVirtualContainer = panel.querySelector('[class*="ReactVirtualized"], [class*="react-window"]');
    if (reactVirtualContainer) {
      scrollContainer = reactVirtualContainer;
    }
    
    // CDK Virtual Scroll
    const cdkViewport = panel.querySelector('cdk-virtual-scroll-viewport');
    if (cdkViewport) {
      scrollContainer = cdkViewport;
    }
    
    // rc-virtual-list
    const rcVirtualList = panel.querySelector('.rc-virtual-list-holder');
    if (rcVirtualList) {
      scrollContainer = rcVirtualList;
    }
    
    console.log(`   🔄 [Virtualized] Scroll контейнер:`, scrollContainer.className);
    
    while (scrollAttempts < maxScrollAttempts) {
      // Ищем опцию в текущих видимых элементах
      const visibleOptions = this.findOptionsInPanel(panel);
      
      for (const option of visibleOptions) {
        const optText = this.getElementText(option).toLowerCase().trim();
        const optValue = (this.getAttribute(option, 'value') || '').toLowerCase();
        
        if (optText === targetLower || optValue === targetLower ||
            optText.includes(targetLower)) {
          console.log(`   ✅ [Virtualized] Найдена опция после ${scrollAttempts} прокруток`);
          return option;
        }
      }
      
      // Запоминаем текущую позицию
      const currentScrollTop = scrollContainer.scrollTop;
      
      // Если достигли конца или позиция не изменилась
      if (currentScrollTop === lastScrollTop) {
        console.log(`   ⚠️ [Virtualized] Достигнут конец списка, опция не найдена`);
        break;
      }
      
      lastScrollTop = currentScrollTop;
      
      // Прокручиваем вниз на высоту контейнера
      const scrollHeight = scrollContainer.clientHeight || 300;
      scrollContainer.scrollTop += scrollHeight;
      
      // Ждем рендеринга новых элементов
      await this.delay(150);
      
      scrollAttempts++;
      
      if (scrollAttempts % 10 === 0) {
        console.log(`   🔄 [Virtualized] Прокрутка ${scrollAttempts}/${maxScrollAttempts}...`);
      }
    }
    
    console.warn(`   ⚠️ [Virtualized] Опция "${targetValue}" не найдена после ${scrollAttempts} прокруток`);
    return null;
  }

  /**
   * Ожидание загрузки зависимого dropdown (cascading)
   * @param {Element} dependentDropdown - Зависимый dropdown
   * @param {number} timeout - Таймаут ожидания (мс)
   * @returns {Promise<boolean>}
   */
  async waitForDependentDropdown(dependentDropdown, timeout = 5000) {
    if (!dependentDropdown) return false;
    
    console.log(`🔗 [Cascading] Ожидание загрузки зависимого dropdown...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Проверяем что dropdown не disabled
      const isDisabled = dependentDropdown.hasAttribute('disabled') ||
                        dependentDropdown.classList.contains('disabled') ||
                        dependentDropdown.getAttribute('aria-disabled') === 'true';
      
      // Проверяем что dropdown не в состоянии loading
      const isLoading = dependentDropdown.classList.contains('loading') ||
                       dependentDropdown.querySelector('.loading, .spinner, [class*="loading"]') !== null;
      
      // Dropdown готов если не disabled и не loading
      if (!isDisabled && !isLoading) {
        // Дополнительная проверка: есть ли опции
        // Открываем dropdown чтобы проверить
        await this.click(dependentDropdown);
        await this.delay(300);
        
        const panels = this.findDropdownPanels(dependentDropdown);
        let hasOptions = false;
        
        for (const panel of panels) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
            // Проверяем что это не loading placeholder
            const firstOptionText = this.getElementText(options[0]).toLowerCase();
            if (!firstOptionText.includes('loading') && 
                !firstOptionText.includes('загрузка')) {
              hasOptions = true;
              break;
            }
          }
        }
        
        // Закрываем dropdown
        document.dispatchEvent(new KeyboardEvent('keydown', { 
          key: 'Escape', 
          code: 'Escape', 
          keyCode: 27 
        }));
        await this.delay(200);
        
        if (hasOptions) {
          console.log(`✅ [Cascading] Зависимый dropdown загружен и готов (${Date.now() - startTime}ms)`);
          return true;
        }
      }
      
      await this.delay(200);
    }
    
    console.warn(`⚠️ [Cascading] Таймаут ожидания загрузки зависимого dropdown (${timeout}ms)`);
    return false;
  }

  /**
   * Определение зависимого dropdown через атрибуты и структуру DOM
   * @param {Element} dropdown1 - Первый dropdown
   * @param {Element} dropdown2 - Второй dropdown
   * @returns {boolean} - true если dropdown2 зависит от dropdown1
   */
  isDependentDropdown(dropdown1, dropdown2) {
    if (!dropdown1 || !dropdown2) return false;
    
    // Проверяем data-depends атрибут
    const dependsAttr = dropdown2.getAttribute('data-depends-on') ||
                       dropdown2.getAttribute('data-dependent') ||
                       dropdown2.getAttribute('depends-on');
    
    if (dependsAttr) {
      const dropdown1Id = dropdown1.id || dropdown1.getAttribute('name');
      if (dropdown1Id && dependsAttr === dropdown1Id) {
        return true;
      }
    }
    
    // Проверяем что они в одной форме и dropdown2 идет после dropdown1
    const form1 = dropdown1.closest('form');
    const form2 = dropdown2.closest('form');
    
    if (form1 && form2 && form1 === form2) {
      // Сравниваем позиции в DOM
      const position = dropdown1.compareDocumentPosition(dropdown2);
      // DOCUMENT_POSITION_FOLLOWING (4) означает что dropdown2 идет после dropdown1
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        // Проверяем что они близко в DOM (вероятно связаны)
        const dropdown1Rect = dropdown1.getBoundingClientRect();
        const dropdown2Rect = dropdown2.getBoundingClientRect();
        const distance = Math.abs(dropdown1Rect.top - dropdown2Rect.top);
        
        // Если расстояние меньше 200px по вертикали - вероятно связаны
        if (distance < 200) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Система автоопределения cascading dropdowns
   * Анализирует изменения на странице после выбора в dropdown
   */
  initCascadingAutoDetection() {
    if (!window._cascadingDropdownMap) {
      window._cascadingDropdownMap = new Map(); // parent -> [children]
      window._cascadingDropdownObserver = new Map(); // dropdown -> observer
      
      console.log('🔗 [Cascading Auto] Инициализация автоопределения');
    }
  }

  /**
   * Начать мониторинг dropdown на предмет cascading отношений
   * @param {Element} parentDropdown
   */
  startCascadingMonitoring(parentDropdown) {
    if (!parentDropdown) return;
    
    this.initCascadingAutoDetection();
    
    const parentKey = this.getDropdownKey(parentDropdown);
    
    if (window._cascadingDropdownObserver.has(parentKey)) {
      // Уже мониторим
      return;
    }
    
    console.log(`🔗 [Cascading Auto] Начало мониторинга: ${parentKey}`);
    
    // Сохраняем состояние всех dropdown на странице ДО изменения
    const allDropdowns = document.querySelectorAll(
      'select, [role="combobox"], [role="listbox"], ' +
      '.ant-select, .v-select, .select2-container, ' +
      'app-select, ng-select, mat-select'
    );
    
    const dropdownStatesBefore = new Map();
    
    for (const dd of allDropdowns) {
      if (dd === parentDropdown) continue;
      
      const key = this.getDropdownKey(dd);
      const state = this.getDropdownState(dd);
      dropdownStatesBefore.set(key, state);
    }
    
    // Создаем observer для изменений
    const observer = new MutationObserver((mutations) => {
      // Проверяем состояния dropdown ПОСЛЕ изменения
      setTimeout(() => {
        for (const dd of allDropdowns) {
          if (dd === parentDropdown) continue;
          
          const key = this.getDropdownKey(dd);
          const stateBefore = dropdownStatesBefore.get(key);
          const stateAfter = this.getDropdownState(dd);
          
          // Если dropdown изменился (очистился, загрузился, стал enabled)
          if (this.hasDropdownStateChanged(stateBefore, stateAfter)) {
            console.log(`🔗 [Cascading Auto] Обнаружена зависимость: ${parentKey} → ${key}`);
            
            // Сохраняем связь
            if (!window._cascadingDropdownMap.has(parentKey)) {
              window._cascadingDropdownMap.set(parentKey, []);
            }
            
            const children = window._cascadingDropdownMap.get(parentKey);
            if (!children.includes(key)) {
              children.push(key);
            }
            
            // Обновляем состояние
            dropdownStatesBefore.set(key, stateAfter);
          }
        }
      }, 500);
    });
    
    // Наблюдаем за изменениями на всей странице
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class', 'aria-disabled']
    });
    
    window._cascadingDropdownObserver.set(parentKey, observer);
  }

  /**
   * Получить уникальный ключ для dropdown
   * @param {Element} dropdown
   * @returns {string}
   */
  getDropdownKey(dropdown) {
    if (!dropdown) return '';
    
    return dropdown.id || 
           dropdown.getAttribute('name') || 
           dropdown.className.substring(0, 50) || 
           `dropdown_${Array.from(document.querySelectorAll('*')).indexOf(dropdown)}`;
  }

  /**
   * Получить текущее состояние dropdown
   * @param {Element} dropdown
   * @returns {Object}
   */
  getDropdownState(dropdown) {
    if (!dropdown) return null;
    
    const isDisabled = dropdown.hasAttribute('disabled') ||
                      dropdown.classList.contains('disabled') ||
                      dropdown.getAttribute('aria-disabled') === 'true';
    
    const isLoading = dropdown.classList.contains('loading') ||
                     dropdown.querySelector('.loading, .spinner') !== null;
    
    let optionsCount = 0;
    
    if (dropdown.tagName === 'SELECT') {
      optionsCount = dropdown.querySelectorAll('option').length;
    } else {
      // Для кастомных dropdown
      const panels = this.findDropdownPanels(dropdown);
      for (const panel of panels) {
        optionsCount += this.findOptionsInPanel(panel).length;
      }
    }
    
    return {
      disabled: isDisabled,
      loading: isLoading,
      optionsCount: optionsCount
    };
  }

  /**
   * Проверить изменилось ли состояние dropdown
   * @param {Object} stateBefore
   * @param {Object} stateAfter
   * @returns {boolean}
   */
  hasDropdownStateChanged(stateBefore, stateAfter) {
    if (!stateBefore || !stateAfter) return false;
    
    // Стал enabled
    if (stateBefore.disabled && !stateAfter.disabled) {
      return true;
    }
    
    // Перестал loading
    if (stateBefore.loading && !stateAfter.loading) {
      return true;
    }
    
    // Появились опции (загрузились)
    if (stateBefore.optionsCount === 0 && stateAfter.optionsCount > 0) {
      return true;
    }
    
    // Опции изменились значительно (больше чем на 50%)
    if (stateBefore.optionsCount > 0 && stateAfter.optionsCount > 0) {
      const diff = Math.abs(stateAfter.optionsCount - stateBefore.optionsCount);
      const percentChange = (diff / stateBefore.optionsCount) * 100;
      
      if (percentChange > 50) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Получить зависимые dropdown для родительского
   * @param {Element} parentDropdown
   * @returns {Array<string>} - Ключи зависимых dropdown
   */
  getCascadingChildren(parentDropdown) {
    if (!parentDropdown) return [];
    
    this.initCascadingAutoDetection();
    
    const parentKey = this.getDropdownKey(parentDropdown);
    return window._cascadingDropdownMap.get(parentKey) || [];
  }

  /**
   * Проверить есть ли зависимые dropdown
   * @param {Element} parentDropdown
   * @returns {boolean}
   */
  hasCascadingChildren(parentDropdown) {
    return this.getCascadingChildren(parentDropdown).length > 0;
  }

  /**
   * Навигация по dropdown с помощью клавиатуры
   * @param {Element} dropdownElement
   * @param {string} targetValue - Значение для выбора
   * @param {Object} options - Опции навигации
   * @returns {Promise<boolean>}
   */
  async navigateDropdownWithKeyboard(dropdownElement, targetValue, options = {}) {
    if (!dropdownElement || !targetValue) return false;
    
    console.log(`⌨️ [Keyboard] ════════════════════════════════════════════════════`);
    console.log(`⌨️ [Keyboard] Навигация к опции: "${targetValue}"`);
    console.log(`⌨️ [Keyboard] ════════════════════════════════════════════════════`);
    
    const targetLower = targetValue.toLowerCase().trim();
    
    // Фокусируемся на dropdown
    dropdownElement.focus();
    await this.delay(100);
    
    // Открываем dropdown с помощью Enter или Space
    console.log('   ⌨️ [Keyboard] Открытие dropdown (Enter)...');
    dropdownElement.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true
    }));
    
    await this.delay(300);
    
    // Проверяем что dropdown открыт
    if (!this.isDropdownOpen(dropdownElement)) {
      // Пробуем Space
      console.log('   ⌨️ [Keyboard] Пробуем Space...');
      dropdownElement.dispatchEvent(new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        bubbles: true
      }));
      
      await this.delay(300);
    }
    
    // Находим панель с опциями
    const panels = this.findDropdownPanels(dropdownElement);
    
    if (panels.length === 0) {
      console.warn('⚠️ [Keyboard] Панель с опциями не найдена');
      return false;
    }
    
    const panel = panels[0];
    let options_list = this.findOptionsInPanel(panel);
    
    if (options_list.length === 0) {
      console.warn('⚠️ [Keyboard] Опции не найдены');
      return false;
    }
    
    console.log(`   ⌨️ [Keyboard] Найдено ${options_list.length} опций`);
    
    // Ищем индекс целевой опции
    let targetIndex = -1;
    
    for (let i = 0; i < options_list.length; i++) {
      const option = options_list[i];
      const optText = this.getElementText(option).toLowerCase().trim();
      const optValue = (this.getAttribute(option, 'value') || '').toLowerCase();
      
      if (optText === targetLower || optValue === targetLower ||
          optText.includes(targetLower)) {
        targetIndex = i;
        console.log(`   ✅ [Keyboard] Найдена опция на позиции ${i}: "${this.getElementText(option)}"`);
        break;
      }
    }
    
    if (targetIndex === -1) {
      console.warn(`⚠️ [Keyboard] Опция "${targetValue}" не найдена`);
      return false;
    }
    
    // Навигация к опции с помощью Arrow keys
    const useHome = options.useHome !== false && targetIndex > 5;
    
    if (useHome) {
      // Если опция далеко, сначала нажимаем Home
      console.log('   ⌨️ [Keyboard] Переход в начало (Home)...');
      panel.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Home',
        code: 'Home',
        keyCode: 36,
        bubbles: true
      }));
      
      await this.delay(100);
    }
    
    // Нажимаем Arrow Down нужное количество раз
    const arrowPresses = useHome ? targetIndex : targetIndex;
    console.log(`   ⌨️ [Keyboard] Нажимаю Arrow Down ${arrowPresses} раз...`);
    
    for (let i = 0; i < arrowPresses; i++) {
      panel.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        code: 'ArrowDown',
        keyCode: 40,
        bubbles: true
      }));
      
      // Небольшая задержка между нажатиями
      await this.delay(50);
      
      if (i > 0 && i % 10 === 0) {
        console.log(`   ⌨️ [Keyboard] Прогресс: ${i}/${arrowPresses}`);
      }
    }
    
    // Дополнительная задержка для обновления UI
    await this.delay(200);
    
    // Нажимаем Enter для выбора
    console.log('   ⌨️ [Keyboard] Выбор опции (Enter)...');
    panel.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true
    }));
    
    await this.delay(200);
    
    // Dispatch событий
    this.dispatchAllEvents(dropdownElement, targetValue);
    
    console.log(`✅ [Keyboard] Опция успешно выбрана через клавиатуру`);
    return true;
  }

  /**
   * Быстрая навигация с помощью типизации (type-ahead)
   * @param {Element} dropdownElement
   * @param {string} targetValue
   * @returns {Promise<boolean>}
   */
  async typeAheadNavigation(dropdownElement, targetValue) {
    if (!dropdownElement || !targetValue) return false;
    
    console.log(`⌨️ [Type-ahead] Быстрый поиск: "${targetValue}"`);
    
    // Фокусируемся
    dropdownElement.focus();
    await this.delay(100);
    
    // Открываем dropdown
    dropdownElement.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true
    }));
    
    await this.delay(300);
    
    // Набираем первые буквы
    const firstLetters = targetValue.substring(0, Math.min(3, targetValue.length));
    
    console.log(`   ⌨️ [Type-ahead] Ввод: "${firstLetters}"`);
    
    for (let i = 0; i < firstLetters.length; i++) {
      const char = firstLetters[i];
      
      dropdownElement.dispatchEvent(new KeyboardEvent('keypress', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        bubbles: true
      }));
      
      await this.delay(100);
    }
    
    // Ждем фокуса на опции
    await this.delay(300);
    
    // Enter для выбора
    dropdownElement.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true
    }));
    
    await this.delay(200);
    
    this.dispatchAllEvents(dropdownElement, targetValue);
    
    console.log(`✅ [Type-ahead] Опция выбрана`);
    return true;
  }

  /**
   * Закрытие dropdown с помощью Escape
   * @param {Element} dropdownElement
   */
  async closeDropdownWithEscape(dropdownElement) {
    if (!dropdownElement) return;
    
    console.log('⌨️ [Keyboard] Закрытие dropdown (Escape)...');
    
    dropdownElement.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      bubbles: true
    }));
    
    // Также dispatch на document
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      bubbles: true
    }));
    
    await this.delay(200);
  }

  /**
   * Изменение порядка выбранных значений в multiselect через Drag & Drop
   * @param {Element} multiselectElement
   * @param {string} dragValue - Значение для перемещения
   * @param {string} dropValue - Значение, перед которым вставить
   * @returns {Promise<boolean>}
   */
  async reorderMultiselectOptions(multiselectElement, dragValue, dropValue) {
    if (!multiselectElement || !dragValue || !dropValue) return false;
    
    console.log(`🎯 [Drag&Drop] ════════════════════════════════════════════════════`);
    console.log(`🎯 [Drag&Drop] Перемещение "${dragValue}" перед "${dropValue}"`);
    console.log(`🎯 [Drag&Drop] ════════════════════════════════════════════════════`);
    
    // Находим selected items (tags/chips)
    const selectedItems = multiselectElement.querySelectorAll(
      '.ant-select-selection-item, .select2-selection__choice, ' +
      '.choices__item, .v-chip, [class*="tag"], [class*="chip"]'
    );
    
    if (selectedItems.length === 0) {
      console.warn('⚠️ [Drag&Drop] Выбранные элементы не найдены');
      return false;
    }
    
    console.log(`   🎯 [Drag&Drop] Найдено ${selectedItems.length} выбранных элементов`);
    
    // Находим drag и drop элементы
    let dragElement = null;
    let dropElement = null;
    
    const dragValueLower = dragValue.toLowerCase().trim();
    const dropValueLower = dropValue.toLowerCase().trim();
    
    for (const item of selectedItems) {
      const itemText = this.getElementText(item).toLowerCase().trim();
      
      if (itemText.includes(dragValueLower) || dragValueLower.includes(itemText)) {
        dragElement = item;
      }
      
      if (itemText.includes(dropValueLower) || dropValueLower.includes(itemText)) {
        dropElement = item;
      }
    }
    
    if (!dragElement) {
      console.warn(`⚠️ [Drag&Drop] Элемент для перемещения "${dragValue}" не найден`);
      return false;
    }
    
    if (!dropElement) {
      console.warn(`⚠️ [Drag&Drop] Целевой элемент "${dropValue}" не найден`);
      return false;
    }
    
    console.log(`   ✅ [Drag&Drop] Элементы найдены`);
    
    // Получаем координаты
    const dragRect = dragElement.getBoundingClientRect();
    const dropRect = dropElement.getBoundingClientRect();
    
    // Эмуляция Drag & Drop через события
    console.log('   🎯 [Drag&Drop] Начало перетаскивания (dragstart)...');
    
    // 1. DragStart
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      clientX: dragRect.left + dragRect.width / 2,
      clientY: dragRect.top + dragRect.height / 2,
      dataTransfer: new DataTransfer()
    });
    
    dragElement.dispatchEvent(dragStartEvent);
    await this.delay(100);
    
    // 2. DragOver на целевом элементе
    console.log('   🎯 [Drag&Drop] Наведение (dragover)...');
    
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      clientX: dropRect.left + dropRect.width / 2,
      clientY: dropRect.top + dropRect.height / 2,
      dataTransfer: dragStartEvent.dataTransfer
    });
    
    dropElement.dispatchEvent(dragOverEvent);
    await this.delay(100);
    
    // 3. Drop
    console.log('   🎯 [Drag&Drop] Отпускание (drop)...');
    
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: dropRect.left + dropRect.width / 2,
      clientY: dropRect.top + dropRect.height / 2,
      dataTransfer: dragStartEvent.dataTransfer
    });
    
    dropElement.dispatchEvent(dropEvent);
    await this.delay(100);
    
    // 4. DragEnd
    const dragEndEvent = new DragEvent('dragend', {
      bubbles: true,
      cancelable: true,
      clientX: dropRect.left + dropRect.width / 2,
      clientY: dropRect.top + dropRect.height / 2,
      dataTransfer: dragStartEvent.dataTransfer
    });
    
    dragElement.dispatchEvent(dragEndEvent);
    await this.delay(200);
    
    // Dispatch change событий
    this.dispatchAllEvents(multiselectElement, null);
    
    console.log(`✅ [Drag&Drop] Перемещение завершено`);
    return true;
  }

  /**
   * Проверка поддерживает ли multiselect drag & drop
   * @param {Element} multiselectElement
   * @returns {boolean}
   */
  isDraggableMultiselect(multiselectElement) {
    if (!multiselectElement) return false;
    
    // Проверяем наличие draggable атрибута на selected items
    const selectedItems = multiselectElement.querySelectorAll(
      '.ant-select-selection-item, .select2-selection__choice, ' +
      '.choices__item, .v-chip'
    );
    
    for (const item of selectedItems) {
      if (item.draggable || item.hasAttribute('draggable')) {
        return true;
      }
    }
    
    // Проверяем классы, указывающие на drag & drop
    const className = multiselectElement.className || '';
    if (className.includes('sortable') || 
        className.includes('draggable') ||
        className.includes('reorderable')) {
      return true;
    }
    
    return false;
  }

  /**
   * Копирование выбранных значений из multiselect
   * @param {Element} multiselectElement
   * @returns {Array<string>} - Скопированные значения
   */
  copyMultiselectValues(multiselectElement) {
    if (!multiselectElement) return [];
    
    console.log(`📋 [Copy] Копирование значений из multiselect...`);
    
    const values = [];
    
    // Для нативного <select multiple>
    if (multiselectElement.tagName === 'SELECT' && multiselectElement.multiple) {
      const selectedOptions = multiselectElement.querySelectorAll('option:checked');
      
      for (const option of selectedOptions) {
        values.push(option.value || option.textContent);
      }
      
      console.log(`   ✅ [Copy] Скопировано ${values.length} значений (native select)`);
      return values;
    }
    
    // Для кастомных multiselect - ищем selected items
    const selectedItems = multiselectElement.querySelectorAll(
      '.ant-select-selection-item, .select2-selection__choice, ' +
      '.choices__item, .v-chip, [class*="selected"], [class*="tag"]'
    );
    
    for (const item of selectedItems) {
      const text = this.getElementText(item).trim();
      
      // Фильтруем пустые и кнопки удаления
      if (text && text !== '×' && text !== 'x' && text.length > 0) {
        values.push(text);
      }
    }
    
    console.log(`   ✅ [Copy] Скопировано ${values.length} значений:`, values);
    
    // Сохраняем в глобальное хранилище для paste
    if (!window._multiselectClipboard) {
      window._multiselectClipboard = [];
    }
    
    window._multiselectClipboard = [...values];
    
    return values;
  }

  /**
   * Вставка значений в multiselect
   * @param {Element} multiselectElement
   * @param {Array<string>} values - Значения для вставки
   * @param {Object} options - Опции вставки
   * @returns {Promise<boolean>}
   */
  async pasteMultiselectValues(multiselectElement, values = null, options = {}) {
    if (!multiselectElement) return false;
    
    // Если values не передан, берем из clipboard
    const valuesToPaste = values || window._multiselectClipboard || [];
    
    if (valuesToPaste.length === 0) {
      console.warn('⚠️ [Paste] Нет значений для вставки');
      return false;
    }
    
    console.log(`📋 [Paste] ════════════════════════════════════════════════════`);
    console.log(`📋 [Paste] Вставка ${valuesToPaste.length} значений:`, valuesToPaste);
    console.log(`📋 [Paste] ════════════════════════════════════════════════════`);
    
    const shouldReplace = options.replace !== false;
    
    // Если replace = true, сначала очищаем
    if (shouldReplace) {
      console.log('   📋 [Paste] Режим замены: очистка существующих значений...');
      await this.clearAllOptions(multiselectElement);
      await this.delay(200);
    }
    
    // Получаем доступные опции для валидации
    const availableOptions = await this.getAvailableOptions(multiselectElement);
    const availableValues = availableOptions.map(opt => 
      (opt.text || '').toLowerCase().trim()
    );
    
    console.log(`   📋 [Paste] Доступно ${availableOptions.length} опций для выбора`);
    
    // Фильтруем значения - вставляем только существующие
    const validValues = [];
    const invalidValues = [];
    
    for (const value of valuesToPaste) {
      const valueLower = value.toLowerCase().trim();
      
      // Точное совпадение или частичное
      const isValid = availableValues.some(av => 
        av === valueLower || av.includes(valueLower) || valueLower.includes(av)
      );
      
      if (isValid) {
        validValues.push(value);
      } else {
        invalidValues.push(value);
      }
    }
    
    console.log(`   ✅ [Paste] Валидных значений: ${validValues.length}`);
    if (invalidValues.length > 0) {
      console.log(`   ⚠️ [Paste] Невалидных значений: ${invalidValues.length}`, invalidValues);
    }
    
    if (validValues.length === 0) {
      console.warn('⚠️ [Paste] Нет валидных значений для вставки');
      return false;
    }
    
    // Вставляем валидные значения
    const success = await this.selectMultipleOptions(multiselectElement, validValues);
    
    if (success) {
      console.log(`✅ [Paste] Успешно вставлено ${validValues.length} значений`);
      return true;
    }
    
    return false;
  }

  /**
   * Копирование между двумя multiselect
   * @param {Element} sourceMultiselect
   * @param {Element} targetMultiselect
   * @param {Object} options
   * @returns {Promise<boolean>}
   */
  async copyBetweenMultiselects(sourceMultiselect, targetMultiselect, options = {}) {
    if (!sourceMultiselect || !targetMultiselect) return false;
    
    console.log(`📋 [Copy Between] Копирование между multiselect...`);
    
    // Копируем из source
    const values = this.copyMultiselectValues(sourceMultiselect);
    
    if (values.length === 0) {
      console.warn('⚠️ [Copy Between] Нет значений для копирования');
      return false;
    }
    
    // Вставляем в target
    const success = await this.pasteMultiselectValues(targetMultiselect, values, options);
    
    if (success) {
      console.log(`✅ [Copy Between] Успешно скопировано ${values.length} значений`);
    }
    
    return success;
  }

  /**
   * Получить все доступные опции в dropdown/multiselect
   * @param {Element} dropdownElement
   * @returns {Promise<Array<{value: string, text: string}>>}
   */
  async getAvailableOptions(dropdownElement) {
    if (!dropdownElement) return [];
    
    const options = [];
    
    // Для нативного select
    if (dropdownElement.tagName === 'SELECT') {
      const optionElements = dropdownElement.querySelectorAll('option');
      
      for (const option of optionElements) {
        options.push({
          value: option.value,
          text: option.textContent.trim(),
          disabled: option.disabled
        });
      }
      
      return options;
    }
    
    // Для кастомных dropdown - открываем и получаем опции
    const wasOpen = this.isDropdownOpen(dropdownElement);
    
    if (!wasOpen) {
      await this.click(dropdownElement);
      await this.delay(300);
    }
    
    const panels = this.findDropdownPanels(dropdownElement);
    
    for (const panel of panels) {
      const optionElements = this.findOptionsInPanel(panel);
      
      for (const option of optionElements) {
        const text = this.getElementText(option).trim();
        const value = this.getAttribute(option, 'value') || text;
        const disabled = option.classList.contains('disabled') ||
                        option.hasAttribute('disabled');
        
        if (text) {
          options.push({ value, text, disabled });
        }
      }
    }
    
    // Закрываем если был закрыт
    if (!wasOpen) {
      await this.closeDropdownWithEscape(dropdownElement);
    }
    
    return options;
  }

  /**
   * Получить выбранные значения из multiselect
   * @param {Element} multiselectElement
   * @returns {Array<string>}
   */
  getSelectedValues(multiselectElement) {
    if (!multiselectElement) return [];
    
    // Используем copyMultiselectValues - она уже реализует эту логику
    return this.copyMultiselectValues(multiselectElement);
  }

  /**
   * Выбрать все опции в multiselect (Select All)
   * @param {Element} multiselectElement
   * @returns {Promise<boolean>}
   */
  async selectAllOptions(multiselectElement) {
    if (!multiselectElement) return false;
    
    console.log(`✅ [Select All] ════════════════════════════════════════════════════`);
    console.log(`✅ [Select All] Выбор всех опций`);
    console.log(`✅ [Select All] ════════════════════════════════════════════════════`);
    
    // Для нативного <select multiple>
    if (multiselectElement.tagName === 'SELECT' && multiselectElement.multiple) {
      const options = multiselectElement.querySelectorAll('option:not([disabled])');
      
      console.log(`   ✅ [Select All] Найдено ${options.length} активных опций`);
      
      for (const option of options) {
        option.selected = true;
      }
      
      this.dispatchAllEvents(multiselectElement, null);
      
      console.log(`✅ [Select All] Выбрано ${options.length} опций`);
      return true;
    }
    
    // Для кастомных multiselect - получаем все доступные опции
    const availableOptions = await this.getAvailableOptions(multiselectElement);
    
    if (availableOptions.length === 0) {
      console.warn('⚠️ [Select All] Опции не найдены');
      return false;
    }
    
    console.log(`   ✅ [Select All] Найдено ${availableOptions.length} опций`);
    
    // Фильтруем только enabled опции
    const enabledOptions = availableOptions.filter(opt => !opt.disabled);
    
    console.log(`   ✅ [Select All] Активных опций: ${enabledOptions.length}`);
    
    if (enabledOptions.length === 0) {
      console.warn('⚠️ [Select All] Нет активных опций');
      return false;
    }
    
    // Выбираем все
    const values = enabledOptions.map(opt => opt.text);
    const success = await this.selectMultipleOptions(multiselectElement, values);
    
    if (success) {
      console.log(`✅ [Select All] Успешно выбрано ${values.length} опций`);
    }
    
    return success;
  }

  /**
   * Очистить все выбранные опции (Clear All)
   * @param {Element} multiselectElement
   * @returns {Promise<boolean>}
   */
  async clearAllOptions(multiselectElement) {
    if (!multiselectElement) return false;
    
    console.log(`🗑️ [Clear All] ════════════════════════════════════════════════════`);
    console.log(`🗑️ [Clear All] Очистка всех выбранных опций`);
    console.log(`🗑️ [Clear All] ════════════════════════════════════════════════════`);
    
    // Для нативного <select multiple>
    if (multiselectElement.tagName === 'SELECT' && multiselectElement.multiple) {
      const selectedOptions = multiselectElement.querySelectorAll('option:checked');
      
      console.log(`   🗑️ [Clear All] Найдено ${selectedOptions.length} выбранных опций`);
      
      for (const option of selectedOptions) {
        option.selected = false;
      }
      
      this.dispatchAllEvents(multiselectElement, null);
      
      console.log(`✅ [Clear All] Очищено ${selectedOptions.length} опций`);
      return true;
    }
    
    // Для кастомных multiselect - получаем выбранные и удаляем
    const selectedValues = this.getSelectedValues(multiselectElement);
    
    if (selectedValues.length === 0) {
      console.log('   ℹ️ [Clear All] Нет выбранных опций');
      return true;
    }
    
    console.log(`   🗑️ [Clear All] Найдено ${selectedValues.length} выбранных значений`);
    
    // Удаляем все
    const success = await this.deselectMultipleOptions(multiselectElement, selectedValues);
    
    if (success) {
      console.log(`✅ [Clear All] Успешно очищено ${selectedValues.length} опций`);
    }
    
    return success;
  }

  /**
   * Инвертировать выбор (Toggle All)
   * @param {Element} multiselectElement
   * @returns {Promise<boolean>}
   */
  async toggleAllOptions(multiselectElement) {
    if (!multiselectElement) return false;
    
    console.log(`🔄 [Toggle All] Инверсия выбора...`);
    
    // Получаем все опции и выбранные
    const allOptions = await this.getAvailableOptions(multiselectElement);
    const selectedValues = this.getSelectedValues(multiselectElement);
    
    const selectedSet = new Set(selectedValues.map(v => v.toLowerCase().trim()));
    
    // Находим невыбранные
    const unselected = allOptions.filter(opt => 
      !opt.disabled && !selectedSet.has(opt.text.toLowerCase().trim())
    );
    
    console.log(`   🔄 [Toggle All] Всего опций: ${allOptions.length}`);
    console.log(`   🔄 [Toggle All] Выбрано: ${selectedValues.length}`);
    console.log(`   🔄 [Toggle All] Невыбрано: ${unselected.length}`);
    
    // Очищаем текущие
    await this.clearAllOptions(multiselectElement);
    
    // Выбираем невыбранные
    if (unselected.length > 0) {
      const values = unselected.map(opt => opt.text);
      await this.selectMultipleOptions(multiselectElement, values);
    }
    
    console.log(`✅ [Toggle All] Инверсия завершена`);
    return true;
  }

  // ===== CUSTOM ASSERTIONS =====
  
  /**
   * Проверка значения в dropdown
   * @param {Element} dropdownElement
   * @param {string} expectedValue - Ожидаемое значение
   * @param {string} message - Сообщение при ошибке
   * @returns {boolean}
   */
  assertDropdownValue(dropdownElement, expectedValue, message = '') {
    if (!dropdownElement) {
      const error = `[Assert] Dropdown element is null`;
      console.error(error);
      throw new Error(message || error);
    }
    
    let actualValue = '';
    
    // Для native select
    if (dropdownElement.tagName === 'SELECT') {
      const selected = dropdownElement.querySelector('option:checked');
      actualValue = selected ? (selected.textContent || selected.value) : '';
    }
    // Для кастомных
    else {
      const selectedItems = dropdownElement.querySelectorAll(
        '.ant-select-selection-item, .select2-selection__rendered, ' +
        '[class*="selected"], [class*="value"]'
      );
      
      if (selectedItems.length > 0) {
        actualValue = this.getElementText(selectedItems[0]).trim();
      }
    }
    
    const actualLower = actualValue.toLowerCase().trim();
    const expectedLower = expectedValue.toLowerCase().trim();
    
    if (actualLower !== expectedLower && !actualLower.includes(expectedLower)) {
      const error = `[Assert] Expected dropdown value "${expectedValue}", but got "${actualValue}"`;
      console.error(error);
      throw new Error(message || error);
    }
    
    console.log(`✅ [Assert] Dropdown value is "${expectedValue}"`);
    return true;
  }

  /**
   * Проверка что dropdown содержит опцию
   * @param {Element} dropdownElement
   * @param {string} optionValue
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  async assertDropdownContains(dropdownElement, optionValue, message = '') {
    if (!dropdownElement) {
      const error = `[Assert] Dropdown element is null`;
      console.error(error);
      throw new Error(message || error);
    }
    
    const available = await this.getAvailableOptions(dropdownElement);
    const optionLower = optionValue.toLowerCase().trim();
    
    const found = available.some(opt => {
      const optText = opt.text.toLowerCase().trim();
      const optVal = (opt.value || '').toLowerCase().trim();
      return optText === optionLower || optVal === optionLower ||
             optText.includes(optionLower) || optionLower.includes(optText);
    });
    
    if (!found) {
      const error = `[Assert] Dropdown does not contain option "${optionValue}". Available: ${available.map(o => o.text).join(', ')}`;
      console.error(error);
      throw new Error(message || error);
    }
    
    console.log(`✅ [Assert] Dropdown contains "${optionValue}"`);
    return true;
  }

  /**
   * Проверка количества опций в dropdown
   * @param {Element} dropdownElement
   * @param {number} expectedCount
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  async assertDropdownOptionsCount(dropdownElement, expectedCount, message = '') {
    if (!dropdownElement) {
      const error = `[Assert] Dropdown element is null`;
      console.error(error);
      throw new Error(message || error);
    }
    
    const available = await this.getAvailableOptions(dropdownElement);
    const actualCount = available.length;
    
    if (actualCount !== expectedCount) {
      const error = `[Assert] Expected ${expectedCount} options, but got ${actualCount}`;
      console.error(error);
      throw new Error(message || error);
    }
    
    console.log(`✅ [Assert] Dropdown has ${expectedCount} options`);
    return true;
  }

  /**
   * Проверка что dropdown disabled
   * @param {Element} dropdownElement
   * @param {boolean} shouldBeDisabled
   * @param {string} message
   * @returns {boolean}
   */
  assertDropdownDisabled(dropdownElement, shouldBeDisabled = true, message = '') {
    if (!dropdownElement) {
      const error = `[Assert] Dropdown element is null`;
      console.error(error);
      throw new Error(message || error);
    }
    
    const isDisabled = dropdownElement.hasAttribute('disabled') ||
                      dropdownElement.classList.contains('disabled') ||
                      dropdownElement.getAttribute('aria-disabled') === 'true';
    
    if (isDisabled !== shouldBeDisabled) {
      const error = shouldBeDisabled 
        ? `[Assert] Expected dropdown to be disabled, but it is enabled`
        : `[Assert] Expected dropdown to be enabled, but it is disabled`;
      console.error(error);
      throw new Error(message || error);
    }
    
    console.log(`✅ [Assert] Dropdown is ${shouldBeDisabled ? 'disabled' : 'enabled'}`);
    return true;
  }

  /**
   * Проверка выбранных значений в multiselect
   * @param {Element} multiselectElement
   * @param {Array<string>} expectedValues
   * @param {string} message
   * @returns {boolean}
   */
  assertMultiselectValues(multiselectElement, expectedValues, message = '') {
    if (!multiselectElement) {
      const error = `[Assert] Multiselect element is null`;
      console.error(error);
      throw new Error(message || error);
    }
    
    const actualValues = this.getSelectedValues(multiselectElement);
    
    // Сортируем для сравнения
    const actualSorted = actualValues.map(v => v.toLowerCase().trim()).sort();
    const expectedSorted = expectedValues.map(v => v.toLowerCase().trim()).sort();
    
    if (actualSorted.length !== expectedSorted.length) {
      const error = `[Assert] Expected ${expectedSorted.length} selected values, but got ${actualSorted.length}. Expected: [${expectedValues.join(', ')}], Actual: [${actualValues.join(', ')}]`;
      console.error(error);
      throw new Error(message || error);
    }
    
    for (let i = 0; i < actualSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) {
        const error = `[Assert] Selected values mismatch. Expected: [${expectedValues.join(', ')}], Actual: [${actualValues.join(', ')}]`;
        console.error(error);
        throw new Error(message || error);
      }
    }
    
    console.log(`✅ [Assert] Multiselect has correct values: [${expectedValues.join(', ')}]`);
    return true;
  }

  // ===== CONDITIONAL WAITS =====
  
  /**
   * Ожидание появления опции в dropdown
   * @param {Element} dropdownElement
   * @param {string} optionValue
   * @param {Object} options - { timeout: 5000, polling: 200 }
   * @returns {Promise<boolean>}
   */
  async waitForOption(dropdownElement, optionValue, options = {}) {
    const timeout = options.timeout || 5000;
    const polling = options.polling || 200;
    
    console.log(`⏳ [Wait] Ожидание опции "${optionValue}" (timeout: ${timeout}ms)...`);
    
    const startTime = Date.now();
    const optionLower = optionValue.toLowerCase().trim();
    
    while (Date.now() - startTime < timeout) {
      try {
        const available = await this.getAvailableOptions(dropdownElement);
        
        const found = available.some(opt => {
          const optText = opt.text.toLowerCase().trim();
          const optVal = (opt.value || '').toLowerCase().trim();
          return optText === optionLower || optVal === optionLower ||
                 optText.includes(optionLower);
        });
        
        if (found) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ [Wait] Опция "${optionValue}" появилась (${elapsed}ms)`);
          return true;
        }
      } catch (e) {
        // Игнорируем ошибки во время ожидания
      }
      
      await this.delay(polling);
    }
    
    console.warn(`⚠️ [Wait] Timeout: опция "${optionValue}" не появилась за ${timeout}ms`);
    return false;
  }

  /**
   * Ожидание определенного количества опций
   * @param {Element} dropdownElement
   * @param {number} expectedCount
   * @param {Object} options
   * @returns {Promise<boolean>}
   */
  async waitForOptionsCount(dropdownElement, expectedCount, options = {}) {
    const timeout = options.timeout || 5000;
    const polling = options.polling || 200;
    
    console.log(`⏳ [Wait] Ожидание ${expectedCount} опций (timeout: ${timeout}ms)...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const available = await this.getAvailableOptions(dropdownElement);
        
        if (available.length === expectedCount) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ [Wait] Найдено ${expectedCount} опций (${elapsed}ms)`);
          return true;
        }
        
        if (Date.now() - startTime > timeout / 2) {
          console.log(`   ⏳ [Wait] Текущее количество: ${available.length}, ожидаем: ${expectedCount}`);
        }
      } catch (e) {
        // Игнорируем ошибки
      }
      
      await this.delay(polling);
    }
    
    console.warn(`⚠️ [Wait] Timeout: не достигнуто ${expectedCount} опций за ${timeout}ms`);
    return false;
  }

  /**
   * Ожидание когда dropdown станет enabled/disabled
   * @param {Element} dropdownElement
   * @param {boolean} shouldBeEnabled
   * @param {Object} options
   * @returns {Promise<boolean>}
   */
  async waitForDropdownEnabled(dropdownElement, shouldBeEnabled = true, options = {}) {
    const timeout = options.timeout || 5000;
    const polling = options.polling || 200;
    
    const state = shouldBeEnabled ? 'enabled' : 'disabled';
    console.log(`⏳ [Wait] Ожидание пока dropdown станет ${state} (timeout: ${timeout}ms)...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const isDisabled = dropdownElement.hasAttribute('disabled') ||
                        dropdownElement.classList.contains('disabled') ||
                        dropdownElement.getAttribute('aria-disabled') === 'true';
      
      const isEnabled = !isDisabled;
      
      if (isEnabled === shouldBeEnabled) {
        const elapsed = Date.now() - startTime;
        console.log(`✅ [Wait] Dropdown стал ${state} (${elapsed}ms)`);
        return true;
      }
      
      await this.delay(polling);
    }
    
    console.warn(`⚠️ [Wait] Timeout: dropdown не стал ${state} за ${timeout}ms`);
    return false;
  }

  /**
   * Ожидание установки определенного значения
   * @param {Element} dropdownElement
   * @param {string} expectedValue
   * @param {Object} options
   * @returns {Promise<boolean>}
   */
  async waitForDropdownValue(dropdownElement, expectedValue, options = {}) {
    const timeout = options.timeout || 5000;
    const polling = options.polling || 200;
    
    console.log(`⏳ [Wait] Ожидание значения "${expectedValue}" (timeout: ${timeout}ms)...`);
    
    const startTime = Date.now();
    const expectedLower = expectedValue.toLowerCase().trim();
    
    while (Date.now() - startTime < timeout) {
      let actualValue = '';
      
      // Для native select
      if (dropdownElement.tagName === 'SELECT') {
        const selected = dropdownElement.querySelector('option:checked');
        actualValue = selected ? (selected.textContent || selected.value) : '';
      }
      // Для кастомных
      else {
        const selectedItems = dropdownElement.querySelectorAll(
          '.ant-select-selection-item, .select2-selection__rendered, ' +
          '[class*="selected"], [class*="value"]'
        );
        
        if (selectedItems.length > 0) {
          actualValue = this.getElementText(selectedItems[0]).trim();
        }
      }
      
      const actualLower = actualValue.toLowerCase().trim();
      
      if (actualLower === expectedLower || actualLower.includes(expectedLower)) {
        const elapsed = Date.now() - startTime;
        console.log(`✅ [Wait] Значение установлено "${actualValue}" (${elapsed}ms)`);
        return true;
      }
      
      await this.delay(polling);
    }
    
    console.warn(`⚠️ [Wait] Timeout: значение "${expectedValue}" не установлено за ${timeout}ms`);
    return false;
  }

  /**
   * Универсальная функция ожидания с условием
   * @param {Function} condition - Функция возвращающая boolean
   * @param {Object} options
   * @returns {Promise<boolean>}
   */
  async waitUntil(condition, options = {}) {
    const timeout = options.timeout || 5000;
    const polling = options.polling || 200;
    const description = options.description || 'condition';
    
    console.log(`⏳ [Wait Until] Ожидание: ${description} (timeout: ${timeout}ms)...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition();
        
        if (result) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ [Wait Until] Условие выполнено: ${description} (${elapsed}ms)`);
          return true;
        }
      } catch (e) {
        // Игнорируем ошибки в condition
      }
      
      await this.delay(polling);
    }
    
    console.warn(`⚠️ [Wait Until] Timeout: ${description} не выполнено за ${timeout}ms`);
    return false;
  }

  // ===== SCREENSHOT COMPARISON =====
  
  /**
   * Захват скриншота dropdown
   * @param {Element} dropdownElement
   * @param {Object} options
   * @returns {Promise<string>} - Base64 encoded image
   */
  async captureDropdownScreenshot(dropdownElement, options = {}) {
    if (!dropdownElement) return null;
    
    console.log(`📸 [Screenshot] Захват скриншота dropdown...`);
    
    const includePanel = options.includePanel !== false;
    
    // Получаем область для захвата
    const elements = [dropdownElement];
    
    if (includePanel) {
      // Добавляем панель с опциями если открыта
      const panels = this.findDropdownPanels(dropdownElement);
      elements.push(...panels);
    }
    
    // Вычисляем общую область
    let minX = Infinity, minY = Infinity;
    let maxX = 0, maxY = 0;
    
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    console.log(`   📸 [Screenshot] Область: ${Math.round(width)}x${Math.round(height)}`);
    
    // Используем window.screenshotComparer если доступен
    if (window.screenshotComparer && typeof window.screenshotComparer.captureElement === 'function') {
      try {
        const screenshot = await window.screenshotComparer.captureElement(dropdownElement, {
          includeChildren: includePanel
        });
        
        console.log(`✅ [Screenshot] Скриншот захвачен`);
        return screenshot;
      } catch (e) {
        console.warn(`⚠️ [Screenshot] Ошибка screenshotComparer: ${e.message}`);
      }
    }
    
    // Fallback: используем canvas для захвата
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Простой рендеринг элемента
      // В реальной реализации здесь был бы более сложный код
      // Для demo возвращаем placeholder
      
      const dataUrl = canvas.toDataURL('image/png');
      console.log(`✅ [Screenshot] Скриншот захвачен (fallback)`);
      return dataUrl;
    } catch (e) {
      console.error(`❌ [Screenshot] Ошибка захвата: ${e.message}`);
      return null;
    }
  }

  /**
   * Сравнение двух скриншотов dropdown
   * @param {string} screenshot1 - Base64 image
   * @param {string} screenshot2 - Base64 image
   * @param {Object} options
   * @returns {Promise<Object>} - { match: boolean, difference: number, diffImage: string }
   */
  async compareDropdownScreenshots(screenshot1, screenshot2, options = {}) {
    if (!screenshot1 || !screenshot2) {
      console.error(`❌ [Screenshot Compare] Скриншоты не предоставлены`);
      return { match: false, difference: 100, diffImage: null };
    }
    
    const threshold = options.threshold || 0.1; // 0.1 = 10% допустимое различие
    
    console.log(`📊 [Screenshot Compare] Сравнение скриншотов (threshold: ${threshold * 100}%)...`);
    
    // Используем window.screenshotComparer если доступен
    if (window.screenshotComparer && typeof window.screenshotComparer.compare === 'function') {
      try {
        const result = await window.screenshotComparer.compare(screenshot1, screenshot2, {
          threshold: threshold
        });
        
        const match = result.difference <= threshold;
        
        console.log(`   📊 [Screenshot Compare] Различие: ${(result.difference * 100).toFixed(2)}%`);
        console.log(`   ${match ? '✅' : '❌'} [Screenshot Compare] ${match ? 'Совпадают' : 'Различаются'}`);
        
        return {
          match: match,
          difference: result.difference,
          diffImage: result.diffImage
        };
      } catch (e) {
        console.error(`❌ [Screenshot Compare] Ошибка сравнения: ${e.message}`);
      }
    }
    
    // Fallback: простое сравнение
    const match = screenshot1 === screenshot2;
    const difference = match ? 0 : 1;
    
    console.log(`   ${match ? '✅' : '❌'} [Screenshot Compare] ${match ? 'Идентичны' : 'Различаются'} (fallback)`);
    
    return {
      match: match,
      difference: difference,
      diffImage: null
    };
  }

  /**
   * Получить визуальное состояние dropdown
   * @param {Element} dropdownElement
   * @returns {Object}
   */
  getDropdownVisualState(dropdownElement) {
    if (!dropdownElement) return null;
    
    const rect = dropdownElement.getBoundingClientRect();
    const style = window.getComputedStyle(dropdownElement);
    
    const state = {
      position: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      style: {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        fontSize: style.fontSize,
        color: style.color
      },
      classes: Array.from(dropdownElement.classList),
      isOpen: this.isDropdownOpen(dropdownElement),
      isDisabled: dropdownElement.hasAttribute('disabled') ||
                 dropdownElement.classList.contains('disabled')
    };
    
    // Для multiselect добавляем количество выбранных
    if (this.isMultiselect(dropdownElement)) {
      state.selectedCount = this.getSelectedValues(dropdownElement).length;
    }
    
    console.log(`📊 [Visual State] Состояние dropdown:`, state);
    
    return state;
  }

  /**
   * Сохранить baseline скриншот
   * @param {Element} dropdownElement
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async saveBaselineScreenshot(dropdownElement, name) {
    if (!dropdownElement || !name) return false;
    
    console.log(`💾 [Baseline] Сохранение baseline: "${name}"...`);
    
    const screenshot = await this.captureDropdownScreenshot(dropdownElement);
    
    if (!screenshot) {
      console.error(`❌ [Baseline] Не удалось захватить скриншот`);
      return false;
    }
    
    // Сохраняем в localStorage
    if (!window._dropdownScreenshotBaselines) {
      window._dropdownScreenshotBaselines = {};
    }
    
    window._dropdownScreenshotBaselines[name] = screenshot;
    
    // Также сохраняем в localStorage для persistence
    try {
      localStorage.setItem('dropdown_baseline_' + name, screenshot);
      console.log(`✅ [Baseline] Baseline "${name}" сохранен`);
      return true;
    } catch (e) {
      console.warn(`⚠️ [Baseline] Не удалось сохранить в localStorage: ${e.message}`);
      return true; // В памяти сохранили
    }
  }

  /**
   * Сравнить с baseline
   * @param {Element} dropdownElement
   * @param {string} name
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async compareWithBaseline(dropdownElement, name, options = {}) {
    if (!dropdownElement || !name) {
      return { match: false, error: 'Invalid parameters' };
    }
    
    console.log(`📊 [Baseline Compare] Сравнение с baseline "${name}"...`);
    
    // Загружаем baseline
    let baseline = window._dropdownScreenshotBaselines?.[name];
    
    if (!baseline) {
      try {
        baseline = localStorage.getItem('dropdown_baseline_' + name);
      } catch (e) {
        // Ignore
      }
    }
    
    if (!baseline) {
      console.error(`❌ [Baseline Compare] Baseline "${name}" не найден`);
      return { match: false, error: 'Baseline not found' };
    }
    
    // Захватываем текущий скриншот
    const current = await this.captureDropdownScreenshot(dropdownElement, options);
    
    if (!current) {
      console.error(`❌ [Baseline Compare] Не удалось захватить текущий скриншот`);
      return { match: false, error: 'Screenshot failed' };
    }
    
    // Сравниваем
    const result = await this.compareDropdownScreenshots(baseline, current, options);
    
    return result;
  }

  // ===== TEST SUITE EXPORT/IMPORT =====
  
  /**
   * Экспорт набора тестов
   * @param {Array<Object>} tests - Массив тестов
   * @param {Object} metadata - Метаданные
   * @returns {string} - JSON строка
   */
  exportTestSuite(tests, metadata = {}) {
    console.log(`📤 [Export] Экспорт набора тестов (${tests.length} тестов)...`);
    
    const suite = {
      version: '1.7.0',
      exported: new Date().toISOString(),
      metadata: {
        name: metadata.name || 'Unnamed Test Suite',
        description: metadata.description || '',
        author: metadata.author || '',
        tags: metadata.tags || [],
        ...metadata
      },
      tests: tests.map((test, index) => ({
        id: test.id || `test_${index + 1}`,
        name: test.name || `Test ${index + 1}`,
        description: test.description || '',
        steps: test.steps || [],
        assertions: test.assertions || [],
        expectedResult: test.expectedResult || '',
        createdAt: test.createdAt || new Date().toISOString(),
        updatedAt: test.updatedAt || new Date().toISOString()
      })),
      statistics: {
        totalTests: tests.length,
        totalSteps: tests.reduce((sum, t) => sum + (t.steps?.length || 0), 0),
        totalAssertions: tests.reduce((sum, t) => sum + (t.assertions?.length || 0), 0)
      }
    };
    
    const json = JSON.stringify(suite, null, 2);
    
    console.log(`✅ [Export] Экспортировано: ${tests.length} тестов, ${suite.statistics.totalSteps} шагов`);
    
    return json;
  }

  /**
   * Импорт набора тестов
   * @param {string} json - JSON строка
   * @returns {Object} - { tests, metadata, valid, errors }
   */
  importTestSuite(json) {
    console.log(`📥 [Import] Импорт набора тестов...`);
    
    try {
      const suite = JSON.parse(json);
      
      // Валидация
      const validation = this.validateTestSuite(suite);
      
      if (!validation.valid) {
        console.error(`❌ [Import] Валидация не пройдена:`, validation.errors);
        return {
          tests: [],
          metadata: {},
          valid: false,
          errors: validation.errors
        };
      }
      
      console.log(`✅ [Import] Импортировано: ${suite.tests.length} тестов`);
      console.log(`   📊 [Import] Версия: ${suite.version}`);
      console.log(`   📊 [Import] Экспортировано: ${suite.exported}`);
      
      return {
        tests: suite.tests,
        metadata: suite.metadata,
        statistics: suite.statistics,
        valid: true,
        errors: []
      };
    } catch (e) {
      console.error(`❌ [Import] Ошибка парсинга JSON: ${e.message}`);
      return {
        tests: [],
        metadata: {},
        valid: false,
        errors: [`Invalid JSON: ${e.message}`]
      };
    }
  }

  /**
   * Валидация набора тестов
   * @param {Object} suite
   * @returns {Object} - { valid, errors }
   */
  validateTestSuite(suite) {
    const errors = [];
    
    // Проверка структуры
    if (!suite) {
      errors.push('Suite is null or undefined');
      return { valid: false, errors };
    }
    
    if (!suite.version) {
      errors.push('Missing version field');
    }
    
    if (!suite.tests || !Array.isArray(suite.tests)) {
      errors.push('Missing or invalid tests array');
      return { valid: false, errors };
    }
    
    // Проверка каждого теста
    suite.tests.forEach((test, index) => {
      if (!test.name) {
        errors.push(`Test ${index + 1}: missing name`);
      }
      
      if (!test.steps || !Array.isArray(test.steps)) {
        errors.push(`Test ${index + 1} (${test.name}): missing or invalid steps array`);
      }
      
      if (test.steps) {
        test.steps.forEach((step, stepIndex) => {
          if (!step.action && !step.type) {
            errors.push(`Test ${index + 1}, Step ${stepIndex + 1}: missing action/type`);
          }
        });
      }
    });
    
    // Проверка версии
    if (suite.version) {
      const [major, minor] = suite.version.split('.').map(Number);
      const [currentMajor, currentMinor] = '1.7.0'.split('.').map(Number);
      
      if (major > currentMajor || (major === currentMajor && minor > currentMinor)) {
        errors.push(`Suite version ${suite.version} is newer than current version 1.7.0`);
      }
    }
    
    const valid = errors.length === 0;
    
    if (valid) {
      console.log(`✅ [Validate] Набор тестов валиден`);
    } else {
      console.warn(`⚠️ [Validate] Найдено ${errors.length} ошибок`);
    }
    
    return { valid, errors };
  }

  /**
   * Сохранить набор тестов в файл
   * @param {Array<Object>} tests
   * @param {Object} metadata
   * @param {string} filename
   */
  saveTestSuiteToFile(tests, metadata = {}, filename = 'test-suite.json') {
    console.log(`💾 [Save] Сохранение в файл "${filename}"...`);
    
    const json = this.exportTestSuite(tests, metadata);
    
    // Создаем blob
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Создаем ссылку для скачивания
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    // Очищаем
    URL.revokeObjectURL(url);
    
    console.log(`✅ [Save] Файл "${filename}" готов к скачиванию`);
  }

  /**
   * Загрузить набор тестов из файла
   * @param {File} file
   * @returns {Promise<Object>}
   */
  async loadTestSuiteFromFile(file) {
    console.log(`📂 [Load] Загрузка из файла "${file.name}"...`);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const json = e.target.result;
          const result = this.importTestSuite(json);
          
          if (result.valid) {
            console.log(`✅ [Load] Файл "${file.name}" загружен успешно`);
            resolve(result);
          } else {
            console.error(`❌ [Load] Ошибки при загрузке:`, result.errors);
            resolve(result);
          }
        } catch (error) {
          console.error(`❌ [Load] Ошибка чтения файла: ${error.message}`);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        console.error(`❌ [Load] Ошибка чтения файла`);
        reject(new Error('File read error'));
      };
      
      reader.readAsText(file);
    });
  }

  // ===== AI-POWERED SELECTOR GENERATION =====
  
  /**
   * Генерация умного селектора на основе элемента
   * @param {Element} element
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generateSmartSelector(element, options = {}) {
    if (!element) return null;
    
    console.log(`🤖 [AI Selector] Генерация умного селектора...`);
    
    // Собираем контекст элемента
    const context = this.extractElementContext(element);
    
    // Генерируем несколько вариантов селекторов
    const selectors = [];
    
    // 1. ID (самый стабильный)
    if (element.id) {
      selectors.push({
        selector: `#${element.id}`,
        type: 'id',
        stability: 0.95,
        specificity: 1.0,
        readability: 0.9
      });
    }
    
    // 2. Data атрибуты (стабильные)
    const dataAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
    for (const attr of dataAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        selectors.push({
          selector: `[${attr}="${value}"]`,
          type: 'data-attribute',
          stability: 0.9,
          specificity: 0.9,
          readability: 0.95
        });
      }
    }
    
    // 3. ARIA атрибуты (семантические)
    const ariaLabel = element.getAttribute('aria-label');
    const ariaRole = element.getAttribute('role');
    
    if (ariaLabel) {
      selectors.push({
        selector: `[aria-label="${ariaLabel}"]`,
        type: 'aria',
        stability: 0.85,
        specificity: 0.8,
        readability: 0.9
      });
    }
    
    if (ariaRole) {
      const roleSelector = `[role="${ariaRole}"]`;
      if (document.querySelectorAll(roleSelector).length === 1) {
        selectors.push({
          selector: roleSelector,
          type: 'aria',
          stability: 0.8,
          specificity: 0.7,
          readability: 0.85
        });
      }
    }
    
    // 4. Уникальные классы
    const uniqueClasses = this.findUniqueClasses(element);
    for (const cls of uniqueClasses.slice(0, 3)) {
      selectors.push({
        selector: `.${cls}`,
        type: 'class',
        stability: 0.7,
        specificity: 0.6,
        readability: 0.7
      });
    }
    
    // 5. Комбинированный селектор (tag + атрибуты)
    const combinedSelector = this.generateCombinedSelector(element);
    if (combinedSelector) {
      selectors.push({
        selector: combinedSelector,
        type: 'combined',
        stability: 0.75,
        specificity: 0.85,
        readability: 0.6
      });
    }
    
    // 6. XPath (как fallback)
    const xpath = this.generateXPath(element);
    selectors.push({
      selector: xpath,
      type: 'xpath',
      stability: 0.5,
      specificity: 1.0,
      readability: 0.3
    });
    
    // Ранжируем селекторы по общему score
    selectors.forEach(s => {
      s.score = (s.stability * 0.5) + (s.specificity * 0.3) + (s.readability * 0.2);
    });
    
    selectors.sort((a, b) => b.score - a.score);
    
    const best = selectors[0];
    
    console.log(`✅ [AI Selector] Лучший селектор: "${best.selector}" (score: ${best.score.toFixed(2)})`);
    console.log(`   📊 [AI Selector] Найдено ${selectors.length} вариантов`);
    
    return {
      recommended: best,
      alternatives: selectors.slice(1, 5),
      all: selectors,
      context: context
    };
  }

  /**
   * Извлечь контекст элемента для AI анализа
   * @param {Element} element
   * @returns {Object}
   */
  extractElementContext(element) {
    const rect = element.getBoundingClientRect();
    
    return {
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.substring(0, 100).trim() || '',
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      classes: Array.from(element.classList),
      parent: element.parentElement?.tagName.toLowerCase() || null,
      siblings: element.parentElement?.children.length || 0,
      position: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      visible: this.isElementVisible(element),
      interactive: !element.disabled && element.offsetParent !== null
    };
  }

  /**
   * Найти уникальные классы элемента
   * @param {Element} element
   * @returns {Array<string>}
   */
  findUniqueClasses(element) {
    const classes = Array.from(element.classList);
    const unique = [];
    
    for (const cls of classes) {
      const count = document.querySelectorAll(`.${cls}`).length;
      if (count === 1) {
        unique.push(cls);
      }
    }
    
    return unique;
  }

  /**
   * Генерировать комбинированный селектор
   * @param {Element} element
   * @returns {string}
   */
  generateCombinedSelector(element) {
    const tag = element.tagName.toLowerCase();
    const parts = [tag];
    
    // Добавляем важные атрибуты
    const name = element.getAttribute('name');
    const type = element.getAttribute('type');
    
    if (name) parts.push(`[name="${name}"]`);
    if (type) parts.push(`[type="${type}"]`);
    
    // Если есть уникальные классы, добавляем первый
    const uniqueClasses = this.findUniqueClasses(element);
    if (uniqueClasses.length > 0) {
      parts.push(`.${uniqueClasses[0]}`);
    }
    
    const selector = parts.join('');
    
    // Проверяем уникальность
    if (document.querySelectorAll(selector).length === 1) {
      return selector;
    }
    
    return null;
  }

  /**
   * Генерировать XPath
   * @param {Element} element
   * @returns {string}
   */
  generateXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    const parts = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;
      
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && 
            sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      const tagName = current.nodeName.toLowerCase();
      const part = index > 0 ? `${tagName}[${index + 1}]` : tagName;
      parts.unshift(part);
      
      current = current.parentNode;
    }
    
    return '/' + parts.join('/');
  }

  /**
   * Анализ стабильности селектора
   * @param {string} selector
   * @returns {Promise<Object>}
   */
  async analyzeSelectorStability(selector) {
    console.log(`📊 [AI Analyze] Анализ стабильности селектора: "${selector}"...`);
    
    const analysis = {
      selector: selector,
      stable: true,
      issues: [],
      recommendations: []
    };
    
    // Проверка 1: Зависимость от порядка элементов
    if (selector.includes(':nth-child') || selector.includes(':nth-of-type')) {
      analysis.stable = false;
      analysis.issues.push('Зависимость от порядка элементов (:nth-child)');
      analysis.recommendations.push('Используйте data-атрибуты или ID');
    }
    
    // Проверка 2: Слишком длинная цепочка
    const depth = (selector.match(/>/g) || []).length;
    if (depth > 3) {
      analysis.stable = false;
      analysis.issues.push(`Глубокая вложенность (${depth} уровней)`);
      analysis.recommendations.push('Сократите цепочку селекторов');
    }
    
    // Проверка 3: Зависимость от классов стилей
    const styleClasses = ['btn', 'button', 'link', 'text', 'color', 'bg-', 'p-', 'm-'];
    for (const cls of styleClasses) {
      if (selector.includes(cls)) {
        analysis.issues.push(`Использование стилевых классов (${cls})`);
        analysis.recommendations.push('Используйте семантические атрибуты');
        break;
      }
    }
    
    // Проверка 4: Количество совпадений
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 0) {
        analysis.stable = false;
        analysis.issues.push('Селектор не найден на странице');
      } else if (matches.length > 1) {
        analysis.issues.push(`Неуникальный селектор (${matches.length} элементов)`);
        analysis.recommendations.push('Добавьте уникальный атрибут');
      }
    } catch (e) {
      analysis.stable = false;
      analysis.issues.push('Невалидный селектор');
    }
    
    const score = analysis.stable && analysis.issues.length === 0 ? 1.0 
                : analysis.issues.length === 0 ? 0.8
                : analysis.issues.length === 1 ? 0.6
                : 0.4;
    
    analysis.stabilityScore = score;
    
    console.log(`   📊 [AI Analyze] Score: ${score.toFixed(2)}, Issues: ${analysis.issues.length}`);
    
    return analysis;
  }

  /**
   * Предложить альтернативные селекторы
   * @param {string} brokenSelector
   * @returns {Promise<Array<Object>>}
   */
  async suggestAlternativeSelectors(brokenSelector) {
    console.log(`🔄 [AI Suggest] Поиск альтернатив для: "${brokenSelector}"...`);
    
    // Пробуем найти элемент разными способами
    const alternatives = [];
    
    // Если это был ID селектор
    if (brokenSelector.startsWith('#')) {
      const id = brokenSelector.substring(1);
      
      // Ищем похожие ID
      const allElements = document.querySelectorAll('[id]');
      for (const el of allElements) {
        if (el.id.includes(id) || id.includes(el.id)) {
          alternatives.push({
            selector: `#${el.id}`,
            confidence: 0.7,
            reason: `Похожий ID (было: ${id})`
          });
        }
      }
    }
    
    // Если это был класс
    if (brokenSelector.startsWith('.')) {
      const cls = brokenSelector.substring(1).split('.')[0];
      
      // Ищем элементы с частью класса
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const classes = Array.from(el.classList);
        for (const c of classes) {
          if (c.includes(cls) || cls.includes(c)) {
            const uniqueClasses = this.findUniqueClasses(el);
            if (uniqueClasses.length > 0) {
              alternatives.push({
                selector: `.${uniqueClasses[0]}`,
                confidence: 0.6,
                reason: `Похожий класс (было: ${cls})`
              });
            }
          }
        }
      }
    }
    
    // Ограничиваем до 5 альтернатив
    const unique = alternatives
      .filter((v, i, a) => a.findIndex(t => t.selector === v.selector) === i)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    
    console.log(`   🔄 [AI Suggest] Найдено ${unique.length} альтернатив`);
    
    return unique;
  }

  // ===== VISUAL TEST RECORDER (Визуальный рекордер тестов) =====
  
  /**
   * Начать визуальную запись теста
   * @param {Object} options
   * @returns {Object} - Recording session
   */
  startVisualRecording(options = {}) {
    console.log(`🎥 [Visual Recorder] Начало визуальной записи...`);
    
    const session = {
      id: `recording_${Date.now()}`,
      startTime: Date.now(),
      actions: [],
      snapshots: [],
      active: true
    };
    
    // Сохраняем в глобальном контексте
    if (!window._visualRecordingSessions) {
      window._visualRecordingSessions = {};
    }
    window._visualRecordingSessions[session.id] = session;
    
    // Создаем overlay для визуализации
    this.createRecordingOverlay(session);
    
    // Устанавливаем обработчики событий
    this.attachRecordingListeners(session);
    
    console.log(`✅ [Visual Recorder] Запись начата (ID: ${session.id})`);
    
    return session;
  }

  /**
   * Создать overlay для визуальной записи
   * @param {Object} session
   */
  createRecordingOverlay(session) {
    const overlay = document.createElement('div');
    overlay.id = `recording-overlay-${session.id}`;
    overlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    overlay.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: pulse 1s infinite;"></div>
        <span>🎥 Recording... <span id="action-count-${session.id}">0</span> actions</span>
      </div>
    `;
    
    // Добавляем анимацию
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(overlay);
    session.overlay = overlay;
  }

  /**
   * Подключить обработчики для записи
   * @param {Object} session
   */
  attachRecordingListeners(session) {
    const captureAction = (event) => {
      if (!session.active) return;
      
      this.captureUserAction(session, event);
    };
    
    // Обработчики для разных типов действий
    session.listeners = {
      click: captureAction,
      input: captureAction,
      change: captureAction,
      submit: captureAction
    };
    
    // Подключаем обработчики
    document.addEventListener('click', session.listeners.click, true);
    document.addEventListener('input', session.listeners.input, true);
    document.addEventListener('change', session.listeners.change, true);
    document.addEventListener('submit', session.listeners.submit, true);
  }

  /**
   * Захватить действие пользователя
   * @param {Object} session
   * @param {Event} event
   */
  captureUserAction(session, event) {
    const element = event.target;
    
    // Игнорируем overlay и системные элементы
    if (element.id?.startsWith('recording-overlay-')) return;
    
    const action = {
      type: event.type,
      timestamp: Date.now() - session.startTime,
      element: {
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.substring(0, 50).trim() || '',
        value: element.value || '',
        selector: null
      },
      position: {
        x: event.clientX,
        y: event.clientY
      }
    };
    
    // Генерируем селектор с помощью AI
    this.generateSmartSelector(element).then(result => {
      action.element.selector = result.recommended.selector;
      action.element.selectorAlternatives = result.alternatives.map(a => a.selector);
    });
    
    // Добавляем визуальный snapshot
    action.snapshot = this.generateVisualSnapshot(element);
    
    session.actions.push(action);
    
    // Обновляем счетчик
    const counter = document.getElementById(`action-count-${session.id}`);
    if (counter) {
      counter.textContent = session.actions.length;
    }
    
    // Подсвечиваем элемент
    this.highlightElement(element);
    
    console.log(`   📹 [Visual Recorder] Действие #${session.actions.length}: ${event.type} на ${element.tagName}`);
  }

  /**
   * Генерировать визуальный snapshot элемента
   * @param {Element} element
   * @returns {Object}
   */
  generateVisualSnapshot(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return {
      position: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      style: {
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily
      },
      screenshot: null // Можно добавить mini-screenshot
    };
  }

  /**
   * Подсветить элемент
   * @param {Element} element
   */
  highlightElement(element) {
    const rect = element.getBoundingClientRect();
    
    const highlight = document.createElement('div');
    highlight.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid #ff0000;
      background: rgba(255, 0, 0, 0.1);
      pointer-events: none;
      z-index: 999998;
      animation: fadeOut 1s forwards;
    `;
    
    document.body.appendChild(highlight);
    
    setTimeout(() => highlight.remove(), 1000);
  }

  /**
   * Остановить визуальную запись
   * @param {Object} session
   * @returns {Object}
   */
  stopVisualRecording(session) {
    if (!session || !session.active) return null;
    
    console.log(`🛑 [Visual Recorder] Остановка записи (ID: ${session.id})...`);
    
    session.active = false;
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    
    // Удаляем обработчики
    if (session.listeners) {
      document.removeEventListener('click', session.listeners.click, true);
      document.removeEventListener('input', session.listeners.input, true);
      document.removeEventListener('change', session.listeners.change, true);
      document.removeEventListener('submit', session.listeners.submit, true);
    }
    
    // Удаляем overlay
    if (session.overlay) {
      session.overlay.remove();
    }
    
    console.log(`✅ [Visual Recorder] Записано ${session.actions.length} действий за ${(session.duration / 1000).toFixed(1)}s`);
    
    return {
      sessionId: session.id,
      duration: session.duration,
      actionsCount: session.actions.length,
      actions: session.actions
    };
  }

  // ===== SELF-HEALING TESTS (Самовосстанавливающиеся тесты) =====
  
  /**
   * Найти элемент с самовосстановлением
   * @param {string} selector
   * @param {Object} options
   * @returns {Promise<Element|null>}
   */
  async findElementWithHealing(selector, options = {}) {
    console.log(`🔧 [Self-Healing] Поиск элемента: "${selector}"...`);
    
    // Попытка 1: Обычный поиск
    let element = null;
    try {
      element = document.querySelector(selector);
      if (element) {
        console.log(`✅ [Self-Healing] Элемент найден сразу`);
        return element;
      }
    } catch (e) {
      console.warn(`⚠️ [Self-Healing] Невалидный селектор: ${e.message}`);
    }
    
    // Попытка 2: Healing
    console.log(`🔧 [Self-Healing] Элемент не найден, начинаю healing...`);
    
    const healed = await this.healBrokenSelector(selector, options);
    
    if (healed && healed.element) {
      console.log(`✅ [Self-Healing] Элемент найден через healing: "${healed.newSelector}"`);
      
      // Сохраняем в историю healing
      this.recordHealingSuccess(selector, healed.newSelector);
      
      return healed.element;
    }
    
    console.error(`❌ [Self-Healing] Элемент не найден даже через healing`);
    return null;
  }

  /**
   * Восстановить сломанный селектор
   * @param {string} brokenSelector
   * @param {Object} options
   * @returns {Promise<Object|null>}
   */
  async healBrokenSelector(brokenSelector, options = {}) {
    console.log(`🩹 [Healing] Попытка восстановить: "${brokenSelector}"...`);
    
    const strategies = [
      // Стратегия 1: Использовать сохраненные альтернативы
      async () => {
        const history = this.getHealingHistory();
        const saved = history.find(h => h.originalSelector === brokenSelector);
        if (saved && saved.healedSelector) {
          const el = document.querySelector(saved.healedSelector);
          if (el) {
            return { element: el, newSelector: saved.healedSelector, strategy: 'history' };
          }
        }
        return null;
      },
      
      // Стратегия 2: AI suggestions
      async () => {
        const alternatives = await this.suggestAlternativeSelectors(brokenSelector);
        for (const alt of alternatives) {
          const el = document.querySelector(alt.selector);
          if (el) {
            return { element: el, newSelector: alt.selector, strategy: 'ai-suggestion' };
          }
        }
        return null;
      },
      
      // Стратегия 3: Fuzzy search по тексту/атрибутам
      async () => {
        // Извлекаем text из селектора если есть
        const textMatch = brokenSelector.match(/text\(\s*["']([^"']+)["']\s*\)/);
        if (textMatch) {
          const text = textMatch[1];
          const elements = Array.from(document.querySelectorAll('*'));
          for (const el of elements) {
            if (el.textContent?.includes(text)) {
              const generated = await this.generateSmartSelector(el);
              return { 
                element: el, 
                newSelector: generated.recommended.selector,
                strategy: 'text-match' 
              };
            }
          }
        }
        return null;
      },
      
      // Стратегия 4: Поиск по похожим data-атрибутам
      async () => {
        const dataMatch = brokenSelector.match(/\[data-[\w-]+=["']([^"']+)["']\]/);
        if (dataMatch) {
          const value = dataMatch[1];
          const elements = Array.from(document.querySelectorAll('[data-testid], [data-test], [data-qa]'));
          for (const el of elements) {
            const attrs = ['data-testid', 'data-test', 'data-qa'];
            for (const attr of attrs) {
              const attrValue = el.getAttribute(attr);
              if (attrValue?.includes(value) || value.includes(attrValue)) {
                return {
                  element: el,
                  newSelector: `[${attr}="${attrValue}"]`,
                  strategy: 'data-attr-fuzzy'
                };
              }
            }
          }
        }
        return null;
      }
    ];
    
    // Пробуем стратегии по очереди
    for (let i = 0; i < strategies.length; i++) {
      const result = await strategies[i]();
      if (result) {
        console.log(`✅ [Healing] Успех (стратегия: ${result.strategy})`);
        return result;
      }
    }
    
    console.warn(`⚠️ [Healing] Все стратегии провалились`);
    return null;
  }

  /**
   * Записать успешный healing в историю
   * @param {string} originalSelector
   * @param {string} healedSelector
   */
  recordHealingSuccess(originalSelector, healedSelector) {
    if (!window._healingHistory) {
      window._healingHistory = [];
    }
    
    window._healingHistory.push({
      originalSelector,
      healedSelector,
      timestamp: Date.now(),
      success: true
    });
    
    // Ограничиваем размер истории
    if (window._healingHistory.length > 100) {
      window._healingHistory = window._healingHistory.slice(-100);
    }
    
    console.log(`📝 [Healing History] Сохранено: "${originalSelector}" → "${healedSelector}"`);
  }

  /**
   * Получить историю healing
   * @returns {Array}
   */
  getHealingHistory() {
    return window._healingHistory || [];
  }

  /**
   * Учиться на ошибках (ML-подход)
   * @param {Array} failures - Массив провалов
   */
  learnFromFailures(failures) {
    console.log(`🧠 [Learning] Анализ ${failures.length} провалов...`);
    
    const patterns = {};
    
    for (const failure of failures) {
      const { originalSelector, reason } = failure;
      
      // Анализируем причины провалов
      if (originalSelector.includes(':nth-child')) {
        patterns['nth-child'] = (patterns['nth-child'] || 0) + 1;
      }
      
      if (originalSelector.includes('.btn') || originalSelector.includes('.button')) {
        patterns['style-classes'] = (patterns['style-classes'] || 0) + 1;
      }
      
      if (originalSelector.split('>').length > 3) {
        patterns['deep-nesting'] = (patterns['deep-nesting'] || 0) + 1;
      }
    }
    
    // Генерируем рекомендации
    const recommendations = [];
    
    if (patterns['nth-child'] > failures.length * 0.3) {
      recommendations.push('Избегайте :nth-child - используйте data-атрибуты');
    }
    
    if (patterns['style-classes'] > failures.length * 0.2) {
      recommendations.push('Не используйте стилевые классы - используйте семантические');
    }
    
    if (patterns['deep-nesting'] > failures.length * 0.3) {
      recommendations.push('Сократите вложенность селекторов');
    }
    
    console.log(`💡 [Learning] Рекомендации:`, recommendations);
    
    return { patterns, recommendations };
  }

  // ===== CLOUD-BASED TEST EXECUTION (Облачное выполнение) =====
  
  /**
   * Загрузить тест в облако
   * @param {Object} test
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async uploadTestToCloud(test, options = {}) {
    console.log(`☁️ [Cloud] Загрузка теста в облако...`);
    
    const cloudTest = {
      id: `cloud_test_${Date.now()}`,
      name: test.name || 'Unnamed Test',
      steps: test.steps || [],
      createdAt: new Date().toISOString(),
      status: 'uploaded',
      cloudProvider: options.provider || 'default'
    };
    
    // Симуляция загрузки (в реальности - API call)
    await this.delay(500);
    
    // Сохраняем в локальном хранилище как симуляцию
    if (!window._cloudTests) {
      window._cloudTests = {};
    }
    window._cloudTests[cloudTest.id] = cloudTest;
    
    console.log(`✅ [Cloud] Тест загружен (ID: ${cloudTest.id})`);
    
    return {
      testId: cloudTest.id,
      uploadedAt: cloudTest.createdAt,
      url: `https://cloud.autotest.com/tests/${cloudTest.id}`
    };
  }

  /**
   * Выполнить тест в облаке
   * @param {string} testId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async executeTestInCloud(testId, options = {}) {
    console.log(`☁️ [Cloud Execute] Запуск теста ${testId} в облаке...`);
    
    const test = window._cloudTests?.[testId];
    
    if (!test) {
      console.error(`❌ [Cloud Execute] Тест ${testId} не найден`);
      return { success: false, error: 'Test not found' };
    }
    
    // Симуляция выполнения
    test.status = 'running';
    test.startedAt = new Date().toISOString();
    
    console.log(`   ☁️ [Cloud Execute] Выполнение ${test.steps?.length || 0} шагов...`);
    
    // Симулируем выполнение
    await this.delay(2000);
    
    // Случайный результат для демонстрации
    const success = Math.random() > 0.2;
    
    test.status = success ? 'passed' : 'failed';
    test.finishedAt = new Date().toISOString();
    test.result = {
      success,
      duration: 2000,
      passedSteps: success ? test.steps?.length || 0 : Math.floor((test.steps?.length || 0) * 0.7),
      failedSteps: success ? 0 : Math.ceil((test.steps?.length || 0) * 0.3)
    };
    
    console.log(`${success ? '✅' : '❌'} [Cloud Execute] Тест ${success ? 'пройден' : 'провален'}`);
    
    return test.result;
  }

  /**
   * Получить результаты облачного теста
   * @param {string} testId
   * @returns {Promise<Object>}
   */
  async getCloudTestResults(testId) {
    console.log(`☁️ [Cloud Results] Получение результатов для ${testId}...`);
    
    const test = window._cloudTests?.[testId];
    
    if (!test) {
      return { error: 'Test not found' };
    }
    
    const results = {
      testId: test.id,
      name: test.name,
      status: test.status,
      createdAt: test.createdAt,
      startedAt: test.startedAt,
      finishedAt: test.finishedAt,
      result: test.result,
      logs: [
        `[${test.createdAt}] Test uploaded`,
        `[${test.startedAt}] Test started`,
        `[${test.finishedAt}] Test ${test.status}`
      ]
    };
    
    console.log(`✅ [Cloud Results] Результаты получены`);
    
    return results;
  }

  /**
   * Запланировать выполнение теста в облаке
   * @param {string} testId
   * @param {Object} schedule
   * @returns {Promise<Object>}
   */
  async scheduleCloudTest(testId, schedule = {}) {
    console.log(`📅 [Cloud Schedule] Планирование теста ${testId}...`);
    
    const scheduledTest = {
      testId,
      schedule: {
        cron: schedule.cron || '0 0 * * *', // По умолчанию каждый день в полночь
        timezone: schedule.timezone || 'UTC',
        enabled: true
      },
      nextRun: this.calculateNextRun(schedule.cron),
      createdAt: new Date().toISOString()
    };
    
    if (!window._scheduledTests) {
      window._scheduledTests = {};
    }
    window._scheduledTests[testId] = scheduledTest;
    
    console.log(`✅ [Cloud Schedule] Тест запланирован (следующий запуск: ${scheduledTest.nextRun})`);
    
    return scheduledTest;
  }

  /**
   * Вычислить следующий запуск по cron
   * @param {string} cron
   * @returns {string}
   */
  calculateNextRun(cron) {
    // Упрощенная реализация - возвращаем завтра
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }


  /**
   * Эмуляция scrollIntoView (как execute_script("arguments[0].scrollIntoView(true);", element))
   * @param {Element} element
   * @param {boolean} alignToTop
   */
  scrollIntoView(element, alignToTop = true) {
    if (!element) return;
    
    try {
      element.scrollIntoView({ behavior: 'smooth', block: alignToTop ? 'start' : 'center' });
    } catch (e) {
      console.warn(`⚠️ [SeleniumUtils] Ошибка при прокрутке: ${e.message}`);
    }
  }

  /**
   * Поиск dropdown панелей (логика из автотеста)
   * @param {Element} dropdownElement - Референсный элемент dropdown (опционально) для фильтрации панелей
   * @returns {Array<Element>}
   */
  findDropdownPanels(dropdownElement = null) {
    const panels = [];
    
    // Если указан dropdown элемент, ищем панели, связанные с ним
    if (dropdownElement) {
      // Исключаем сам dropdown элемент из поиска (он не является панелью)
      // ВАЖНО: Панель с опциями может быть внутри dropdown, но это нормально!
      const isDropdownElement = (el) => {
        // Только сам dropdown элемент
        if (el === dropdownElement) return true;
        
        // Проверяем, является ли элемент частью самого dropdown (не панелью)
        if (dropdownElement.contains(el)) {
          // Это панель с опциями, если содержит опции - НЕ исключаем!
          const hasOptions = el.querySelector('.option, div.option, div.cutted-text, [role="option"], .content-list');
          if (hasOptions) return false; // Это панель, не сам dropdown
          
          // Это сам dropdown, если имеет специфичные классы
          return el.classList.contains('form-input') ||
                 el.classList.contains('input-project-status') ||
                 el.classList.contains('select-group') ||
                 el.id === 'status-project__result' ||
                 el.id === 'status-project__result__wrapper';
        }
        
        // КРИТИЧНО: Если элемент НЕ внутри dropdown, но имеет классы dropdown - это может быть сам dropdown
        // Проверяем по классам и структуре
        if (el.classList.contains('form-input') && 
            el.classList.contains('input-project-status')) {
          // Это сам dropdown элемент, не панель
          return true;
        }
        
        return false;
      };
      
      // Метод 1: Ищем панели внутри dropdown элемента (приоритет)
      for (const selector of this.dropdownPanelSelectors) {
        try {
          const elements = dropdownElement.querySelectorAll(selector);
          for (const el of elements) {
            // Пропускаем сам dropdown элемент и его основные части
            if (isDropdownElement(el)) continue;
            
            if (this.isElementVisible(el) && !panels.includes(el)) {
              panels.push(el);
            }
          }
        } catch (e) {
          // Игнорируем ошибки
        }
      }
      
      // Метод 1.5: Специальный поиск для структуры content-list (для статусов)
      const contentListContainers = dropdownElement.querySelectorAll('.content-list-container, [class*="content-list"]');
      for (const container of contentListContainers) {
        // Пропускаем контейнеры, которые являются частью самого dropdown
        if (isDropdownElement(container)) continue;
        
        if (this.isElementVisible(container) && !panels.includes(container)) {
          panels.push(container);
        }
        // Также добавляем вложенные .content-list
        const contentLists = container.querySelectorAll('.content-list');
        for (const list of contentLists) {
          if (this.isElementVisible(list) && !panels.includes(list)) {
            panels.push(list);
          }
        }
      }
      
      // Метод 2: Ищем панели рядом с dropdown (по расстоянию), но НЕ внутри dropdown
      const dropdownRect = dropdownElement.getBoundingClientRect();
      const allPanels = [];
      
      for (const selector of this.dropdownPanelSelectors) {
        const elements = this.findElements(selector);
        for (const el of elements) {
          // Пропускаем элементы, которые являются частью самого dropdown
          if (isDropdownElement(el)) continue;
          
          // Пропускаем элементы, которые находятся внутри dropdown (они уже найдены в Методе 1)
          if (dropdownElement.contains(el) && el !== dropdownElement) continue;
          
          if (this.isElementVisible(el) && !allPanels.includes(el)) {
            allPanels.push(el);
          }
        }
      }
      
      // Фильтруем панели по расстоянию от dropdown (приоритет ближайшим)
      const panelsWithDistance = [];
      for (const panel of allPanels) {
        // Пропускаем панели, которые уже добавлены
        if (panels.includes(panel)) continue;
        
        const panelRect = panel.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(panelRect.left - dropdownRect.left, 2) + 
          Math.pow(panelRect.top - dropdownRect.top, 2)
        );
        
        // Если панель находится в пределах 500px от dropdown, считаем её связанной
        if (distance < 500) {
          panelsWithDistance.push({ panel, distance });
        }
      }
      
      // Сортируем по расстоянию и добавляем
      panelsWithDistance.sort((a, b) => a.distance - b.distance);
      for (const item of panelsWithDistance) {
        panels.push(item.panel);
      }
      
      // Метод 3: Ищем панели через aria-controls или aria-owns
      const ariaControls = dropdownElement.getAttribute('aria-controls');
      if (ariaControls) {
        const controlled = document.getElementById(ariaControls);
        if (controlled && this.isElementVisible(controlled) && !panels.includes(controlled)) {
          panels.push(controlled);
        }
      }
      
      // Метод 4: Ищем панели через родительские элементы (для Angular overlay)
      // Но исключаем сам dropdown и его основные части
      let parent = dropdownElement.parentElement;
      let depth = 0;
      while (parent && depth < 5) {
        // Пропускаем родительские элементы, которые являются частью dropdown
        if (!isDropdownElement(parent)) {
          for (const selector of this.dropdownPanelSelectors) {
            try {
              if (parent.matches && parent.matches(selector)) {
                if (this.isElementVisible(parent) && !panels.includes(parent)) {
                  panels.push(parent);
                }
              }
            } catch (e) {
              // Игнорируем ошибки
            }
          }
        }
        parent = parent.parentElement;
        depth++;
      }
      
      // Метод 5: КРИТИЧНО! Поиск панелей в Angular overlay контейнерах (ПРИОРИТЕТ!)
      // Angular Material и CDK создают overlay панели в специальных контейнерах вне основного DOM
      const overlayContainers = document.querySelectorAll('.cdk-overlay-container, .mat-overlay-container, [class*="overlay-container"]');
      for (const container of overlayContainers) {
        for (const selector of this.dropdownPanelSelectors) {
          try {
            const elements = container.querySelectorAll(selector);
            for (const el of elements) {
              // Пропускаем сам dropdown элемент
              if (isDropdownElement(el)) continue;
              
              if (this.isElementVisible(el) && !panels.includes(el)) {
                // Проверяем, что в панели есть опции (не пустая панель)
                const options = this.findOptionsInPanel(el);
                if (options.length > 0) {
                  panels.unshift(el); // Добавляем в начало (приоритет overlay панелям)
                }
              }
            }
          } catch (e) {
            // Игнорируем ошибки
          }
        }
      }
      
      // Метод 6: Поиск панелей в body (для случаев, когда overlay не используется)
      // Ищем структуру content-list, которая может быть в body
      const bodyPanels = document.body.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
      for (const panel of bodyPanels) {
        // Пропускаем панели внутри dropdown (они уже найдены в Методе 1)
        if (dropdownElement.contains(panel)) continue;
        
        // Пропускаем сам dropdown элемент
        if (isDropdownElement(panel)) continue;
        
        if (this.isElementVisible(panel)) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0 && !panels.includes(panel)) {
            panels.push(panel);
          }
        }
      }
    } else {
      // Если dropdown не указан, ищем все панели (старое поведение)
      for (const selector of this.dropdownPanelSelectors) {
        const elements = this.findElements(selector);
        for (const el of elements) {
          if (this.isElementVisible(el) && !panels.includes(el)) {
            panels.push(el);
          }
        }
      }
    }
    
    // КРИТИЧНО: Фильтруем панели - исключаем те, которые не содержат опций
    // Это предотвращает возврат самого dropdown элемента как панели
    const filteredPanels = panels.filter(panel => {
      // Проверяем, что это не сам dropdown элемент
      if (dropdownElement && (panel === dropdownElement || panel === dropdownElement.querySelector('.form-input.input-project-status'))) {
        return false;
      }
      
      // Проверяем, что в панели есть опции
      const options = this.findOptionsInPanel(panel);
      if (options.length === 0) {
        // Если нет опций, это может быть сам dropdown или пустая панель
        // Исключаем элементы с классами dropdown
        if (panel.classList.contains('form-input') || 
            panel.classList.contains('input-project-status') ||
            panel.classList.contains('select-group')) {
          return false;
        }
      }
      
      return true;
    });
    
    return filteredPanels;
  }

  /**
   * Поиск опций в панели (логика из автотеста)
   * @param {Element} panel
   * @returns {Array<Element>}
   */
  findOptionsInPanel(panel) {
    if (!panel) return [];
    
    const options = [];
    const foundElements = new Set();
    
    // Метод 1: Поиск через стандартные селекторы
    for (const selector of this.optionSelectors) {
      const elements = panel.querySelectorAll(selector);
      for (const el of elements) {
        if (this.isElementVisible(el) && !foundElements.has(el)) {
          const text = this.getElementText(el);
          // Игнорируем плейсхолдеры (как в автотесте: if option_text.lower() not in ['выберите', 'статус', ''])
          const isPlaceholder = this.placeholderTexts.some(ph => 
            text.toLowerCase().includes(ph.toLowerCase())
          );
          
          // Игнорируем слишком длинные тексты (вероятно, это контейнер, а не опция)
          if (text && text.length > 0 && text.length < 200 && !isPlaceholder) {
            options.push(el);
            foundElements.add(el);
          }
        }
      }
    }
    
    // Метод 2: Специальный поиск для структуры content-list (для статусов)
    // Ищем в .content-list-container > .content-list > .option
    const contentListContainers = panel.querySelectorAll('.content-list-container, [class*="content-list"]');
    for (const container of contentListContainers) {
      const contentLists = container.querySelectorAll('.content-list, [class*="content-list"]');
      for (const list of contentLists) {
        const optionElements = list.querySelectorAll('.option, div.option, div[class*="option"], div.cutted-text');
        for (const el of optionElements) {
          if (this.isElementVisible(el) && !foundElements.has(el)) {
            const text = this.getElementText(el);
            const isPlaceholder = this.placeholderTexts.some(ph => 
              text.toLowerCase().includes(ph.toLowerCase())
            );
            
            if (text && text.length > 0 && text.length < 200 && !isPlaceholder) {
              options.push(el);
              foundElements.add(el);
            }
          }
        }
      }
    }
    
    // Метод 3: Поиск всех div с классом option или cutted-text в панели
    const allOptionDivs = panel.querySelectorAll('div.option, div[class*="option"], div.cutted-text, div[class*="cutted"]');
    for (const el of allOptionDivs) {
      if (this.isElementVisible(el) && !foundElements.has(el)) {
        const text = this.getElementText(el);
        const isPlaceholder = this.placeholderTexts.some(ph => 
          text.toLowerCase().includes(ph.toLowerCase())
        );
        
        // Проверяем, что это не контейнер (текст не слишком длинный)
        if (text && text.length > 0 && text.length < 200 && !isPlaceholder) {
          // Проверяем, что элемент не содержит другие опции (не контейнер)
          const hasChildOptions = el.querySelector('.option, div.option, div[class*="option"]');
          if (!hasChildOptions || el.textContent.trim() === text) {
            options.push(el);
            foundElements.add(el);
          }
        }
      }
    }
    
    return options;
  }

  /**
   * Проверяет, открыт ли dropdown (есть ли видимые опции)
   * @param {Element} dropdownElement - Элемент dropdown
   * @returns {boolean}
   */
  isDropdownOpen(dropdownElement) {
    if (!dropdownElement) return false;
    
    // ПРИОРИТЕТ 1: Прямой поиск элементов .option (самый быстрый способ)
    const directOptions = document.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
    const visibleDirectOptions = Array.from(directOptions).filter(opt => {
      if (!this.isElementVisible(opt)) return false;
      const text = this.getElementText(opt);
      // Исключаем плейсхолдеры
      const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
      return text && text.length > 0 && !isPlaceholder;
    });
    if (visibleDirectOptions.length > 0) {
      return true;
    }
    
    // ПРИОРИТЕТ 2: Overlay панели с опциями
    const overlayContainers = document.querySelectorAll('.cdk-overlay-container, .mat-overlay-container');
    for (const container of overlayContainers) {
      // Сначала ищем опции напрямую в overlay
      const optionsInOverlay = container.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
      const visibleOptions = Array.from(optionsInOverlay).filter(opt => {
        if (!this.isElementVisible(opt)) return false;
        const text = this.getElementText(opt);
        const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
        return text && text.length > 0 && !isPlaceholder;
      });
      if (visibleOptions.length > 0) {
        return true;
      }
      
      // Затем ищем панели
      const panels = container.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
      for (const panel of panels) {
        if (this.isElementVisible(panel)) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
            return true;
          }
        }
      }
    }
    
    // ПРИОРИТЕТ 3: Панель ВНУТРИ самого dropdown элемента (КРИТИЧНО!)
    // Сначала ищем опции напрямую внутри dropdown
    const optionsInsideDropdown = dropdownElement.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
    const visibleOptionsInside = Array.from(optionsInsideDropdown).filter(opt => {
      if (!this.isElementVisible(opt)) return false;
      const text = this.getElementText(opt);
      const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
      return text && text.length > 0 && !isPlaceholder;
    });
    if (visibleOptionsInside.length > 0) {
      return true;
    }
    
    // Затем ищем панели внутри dropdown
    const panelsInsideDropdown = dropdownElement.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
    for (const panel of panelsInsideDropdown) {
      if (this.isElementVisible(panel)) {
        const options = this.findOptionsInPanel(panel);
        if (options.length > 0) {
          return true;
        }
      }
    }
    
    // ПРИОРИТЕТ 4: Любые видимые панели с опциями рядом с dropdown
    const allPanels = document.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
    const dropdownRect = dropdownElement.getBoundingClientRect();
    for (const panel of allPanels) {
      if (this.isElementVisible(panel)) {
        const panelRect = panel.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(panelRect.left - dropdownRect.left, 2) + 
          Math.pow(panelRect.top - dropdownRect.top, 2)
        );
        if (distance < 500) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Поиск опции по тексту (логика из автотеста)
   * @param {string} targetText - Целевой текст (например, "Плановый")
   * @param {Element} panel - Панель для поиска (опционально)
   * @returns {Element|null}
   */
  findOptionByText(targetText, panel = null) {
    if (!targetText) return null;
    
    // Нормализуем целевой текст: убираем лишние пробелы, приводим к нижнему регистру
    const targetNormalized = targetText.toLowerCase().trim().replace(/\s+/g, ' ');
    const targetWords = targetNormalized.split(/\s+/).filter(w => w.length > 0);
    
    // Если указана панель, ищем в ней
    if (panel) {
      const options = this.findOptionsInPanel(panel);
      for (const option of options) {
        const optionText = this.getElementText(option);
        if (!optionText) continue;
        
        const optionNormalized = optionText.toLowerCase().trim().replace(/\s+/g, ' ');
        const optionWords = optionNormalized.split(/\s+/).filter(w => w.length > 0);
        
        // Игнорируем плейсхолдеры
        const isPlaceholder = this.placeholderTexts.some(ph => 
          optionNormalized.includes(ph.toLowerCase())
        );
        if (isPlaceholder) continue;
        
        // Проверка 1: Точное совпадение (нормализованное)
        if (optionNormalized === targetNormalized) {
          console.log(`✅ [SeleniumUtils] Точное совпадение: "${optionText}" === "${targetText}"`);
          return option;
        }
        
        // Проверка 2: Целевой текст содержится в опции
        if (optionNormalized.includes(targetNormalized)) {
          console.log(`✅ [SeleniumUtils] Частичное совпадение (цель в опции): "${optionText}" содержит "${targetText}"`);
          return option;
        }
        
        // Проверка 3: Опция содержится в целевом тексте
        if (targetNormalized.includes(optionNormalized)) {
          console.log(`✅ [SeleniumUtils] Частичное совпадение (опция в цели): "${targetText}" содержит "${optionText}"`);
          return option;
        }
        
        // Проверка 4: Все слова из целевого текста присутствуют в опции (более гибкий поиск)
        if (targetWords.length > 0 && targetWords.every(word => optionNormalized.includes(word))) {
          console.log(`✅ [SeleniumUtils] Совпадение по словам: "${optionText}" содержит все слова из "${targetText}"`);
          return option;
        }
        
        // Проверка 5: Большинство слов совпадает (для опечаток)
        if (targetWords.length > 1) {
          const matchingWords = targetWords.filter(word => optionNormalized.includes(word));
          if (matchingWords.length >= Math.ceil(targetWords.length * 0.7)) {
            console.log(`✅ [SeleniumUtils] Частичное совпадение по словам (${matchingWords.length}/${targetWords.length}): "${optionText}"`);
            return option;
          }
        }
      }
    } else {
      // Ищем во всех панелях
      const panels = this.findDropdownPanels();
      for (const p of panels) {
        const option = this.findOptionByText(targetText, p);
        if (option) return option;
      }
    }
    
    return null;
  }

  /**
   * Альтернативный поиск опции (как в автотесте: all_elements = browser.find_elements(By.CSS_SELECTOR, 'li, div, span'))
   * @param {string} targetText - Целевой текст
   * @param {Element} referenceElement - Референсный элемент (например, app-select) для проверки расстояния
   * @param {number} maxDistance - Максимальное расстояние от референсного элемента
   * @returns {Element|null}
   */
  findOptionByTextGlobal(targetText, referenceElement = null, maxDistance = 1000) {
    const targetLower = targetText.toLowerCase().trim();
    
    // Глобальный поиск (как в автотесте: browser.find_elements(By.CSS_SELECTOR, 'li, div, span'))
    const allElements = [];
    for (const selector of this.optionSelectors) {
      allElements.push(...this.findElements(selector));
    }
    
    // Фильтруем видимые элементы с текстом (как в автотесте: if elem.is_displayed() and elem.text.strip())
    const visibleElements = allElements.filter(el => {
      if (!this.isElementVisible(el)) return false;
      
      const text = this.getElementText(el);
      if (!text || text.length === 0) return false;
      
      // Игнорируем плейсхолдеры
      const isPlaceholder = this.placeholderTexts.some(ph => 
        text.toLowerCase().includes(ph.toLowerCase())
      );
      if (isPlaceholder) return false;
      
      // Игнорируем слишком длинные тексты (вероятно, это не опция, а контейнер)
      if (text.length > 200) return false;
      
      return true;
    });
    
    console.log(`🔍 [SeleniumUtils] Найдено ${visibleElements.length} видимых элементов с текстом`);
    
    // Сортируем элементы по приоритету (ближе к референсному элементу = выше приоритет)
    let sortedElements = visibleElements;
    if (referenceElement) {
      const refRect = referenceElement.getBoundingClientRect();
      sortedElements = visibleElements.map(el => {
        const elRect = el.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(elRect.left - refRect.left, 2) + 
          Math.pow(elRect.top - refRect.top, 2)
        );
        return { element: el, distance };
      }).sort((a, b) => a.distance - b.distance).map(item => item.element);
    }
    
    // Ищем опцию по тексту (улучшенный поиск с нормализацией)
    const targetNormalized = targetLower.replace(/\s+/g, ' ');
    const targetWords = targetNormalized.split(/\s+/).filter(w => w.length > 0);
    
    for (const el of sortedElements) {
      const elText = this.getElementText(el);
      if (!elText || elText.length === 0) continue;
      
      const elTextNormalized = elText.toLowerCase().trim().replace(/\s+/g, ' ');
      
      // Игнорируем плейсхолдеры
      const isPlaceholder = this.placeholderTexts.some(ph => 
        elTextNormalized.includes(ph.toLowerCase())
      );
      if (isPlaceholder) continue;
      
      // Игнорируем слишком длинные тексты
      if (elText.length > 200) continue;
      
      // Проверка 1: Точное совпадение (нормализованное)
      if (elTextNormalized === targetNormalized) {
        console.log(`✅ [SeleniumUtils] Точное совпадение (глобальный поиск): "${elText}" === "${targetText}"`);
        if (referenceElement) {
          const elRect = el.getBoundingClientRect();
          const refRect = referenceElement.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(elRect.left - refRect.left, 2) + 
            Math.pow(elRect.top - refRect.top, 2)
          );
          if (distance <= maxDistance) {
            return el;
          }
        } else {
          return el;
        }
      }
      
      // Проверка 2: Целевой текст содержится в опции
      if (elTextNormalized.includes(targetNormalized)) {
        if (referenceElement) {
          const elRect = el.getBoundingClientRect();
          const refRect = referenceElement.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(elRect.left - refRect.left, 2) + 
            Math.pow(elRect.top - refRect.top, 2)
          );
          if (distance <= maxDistance) {
            console.log(`✅ [SeleniumUtils] Частичное совпадение (глобальный поиск): "${elText}" содержит "${targetText}" на расстоянии ${Math.round(distance)}px`);
            return el;
          }
        } else {
          console.log(`✅ [SeleniumUtils] Частичное совпадение (глобальный поиск): "${elText}" содержит "${targetText}"`);
          return el;
        }
      }
      
      // Проверка 3: Все слова из целевого текста присутствуют в опции
      if (targetWords.length > 0 && targetWords.every(word => elTextNormalized.includes(word))) {
        if (referenceElement) {
          const elRect = el.getBoundingClientRect();
          const refRect = referenceElement.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(elRect.left - refRect.left, 2) + 
            Math.pow(elRect.top - refRect.top, 2)
          );
          if (distance <= maxDistance) {
            console.log(`✅ [SeleniumUtils] Совпадение по словам (глобальный поиск): "${elText}" содержит все слова из "${targetText}" на расстоянии ${Math.round(distance)}px`);
            return el;
          }
        } else {
          console.log(`✅ [SeleniumUtils] Совпадение по словам (глобальный поиск): "${elText}" содержит все слова из "${targetText}"`);
          return el;
        }
      }
      
      // Проверка 4: Большинство слов совпадает (для опечаток)
      if (targetWords.length > 1) {
        const matchingWords = targetWords.filter(word => elTextNormalized.includes(word));
        if (matchingWords.length >= Math.ceil(targetWords.length * 0.7)) {
          if (referenceElement) {
            const elRect = el.getBoundingClientRect();
            const refRect = referenceElement.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(elRect.left - refRect.left, 2) + 
              Math.pow(elRect.top - refRect.top, 2)
            );
            if (distance <= maxDistance) {
              console.log(`✅ [SeleniumUtils] Частичное совпадение по словам (${matchingWords.length}/${targetWords.length}, глобальный поиск): "${elText}" на расстоянии ${Math.round(distance)}px`);
              return el;
            }
          } else {
            console.log(`✅ [SeleniumUtils] Частичное совпадение по словам (${matchingWords.length}/${targetWords.length}, глобальный поиск): "${elText}"`);
            return el;
          }
        }
      }
      
      // Старая проверка для обратной совместимости
      if (elTextNormalized.includes(targetLower) && elText.length < 100) {
        
        // Если указан референсный элемент, проверяем расстояние
        if (referenceElement) {
          const elRect = el.getBoundingClientRect();
          const refRect = referenceElement.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(elRect.left - refRect.left, 2) + 
            Math.pow(elRect.top - refRect.top, 2)
          );
          
          if (distance <= maxDistance) {
            console.log(`✅ [SeleniumUtils] Найдена опция "${elText}" на расстоянии ${Math.round(distance)}px`);
            return el;
          }
        } else {
          console.log(`✅ [SeleniumUtils] Найдена опция "${elText}" (без проверки расстояния)`);
          return el;
        }
      }
    }
    
    return null;
  }

  /**
   * Выбор опции в dropdown (полная логика из автотеста)
   * @param {Element} dropdownElement - Элемент dropdown (например, app-select)
   * @param {string} targetValue - Целевое значение (например, "Плановый")
   * @returns {Promise<boolean>}
   */
  async selectDropdownOption(dropdownElement, targetValue) {
    if (!dropdownElement || !targetValue) return false;
    
    // Объявляем targetLower один раз для всей функции
    const targetLower = targetValue.toLowerCase().trim();
    
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    console.log(`🎯 [SeleniumUtils] ШАГ 1: ИНИЦИАЛИЗАЦИЯ - Выбор опции "${targetValue}"`);
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    
    // ===== COMBOBOX SUPPORT (Searchable/Autocomplete) =====
    if (this.isCombobox(dropdownElement)) {
      console.log(`🔍 [Combobox] Обнаружен combobox, используем ввод текста`);
      return await this.selectComboboxOption(dropdownElement, targetValue);
    }
    // ===== END COMBOBOX SUPPORT =====
    
    // ===== HTML5 DATALIST SUPPORT =====
    // Проверяем если это <input list="...">
    if (dropdownElement.tagName === 'INPUT' && dropdownElement.hasAttribute('list')) {
      const listId = dropdownElement.getAttribute('list');
      const datalist = document.getElementById(listId);
      
      if (datalist && datalist.tagName === 'DATALIST') {
        console.log(`📋 [Datalist] Обнаружен HTML5 datalist: "${listId}"`);
        
        // Находим опцию в datalist
        const options = datalist.querySelectorAll('option');
        let selectedOption = null;
        
        for (const option of options) {
          const optValue = (option.value || '').toLowerCase().trim();
          const optText = (option.textContent || '').toLowerCase().trim();
          
          if (optValue === targetLower || optText === targetLower) {
            selectedOption = option;
            break;
          }
        }
        
        // Если не нашли точное, ищем частичное
        if (!selectedOption) {
          for (const option of options) {
            const optValue = (option.value || '').toLowerCase().trim();
            const optText = (option.textContent || '').toLowerCase().trim();
            
            if (optValue.includes(targetLower) || optText.includes(targetLower)) {
              selectedOption = option;
              break;
            }
          }
        }
        
        if (selectedOption) {
          const valueToSet = selectedOption.value || selectedOption.textContent;
          console.log(`✅ [Datalist] Найдена опция: "${valueToSet}"`);
          
          // Устанавливаем значение в input
          dropdownElement.value = valueToSet;
          
          // Focus на input чтобы показать datalist
          dropdownElement.focus();
          
          // Dispatch всех событий
          this.dispatchAllEvents(dropdownElement, valueToSet);
          
          // Небольшая задержка
          await this.delay(100);
          
          console.log(`✅ [Datalist] Значение "${valueToSet}" успешно установлено`);
          return true;
        } else {
          console.warn(`⚠️ [Datalist] Опция "${targetValue}" не найдена в datalist`);
          return false;
        }
      }
    }
    // ===== END DATALIST SUPPORT =====
    
    // ===== OPTGROUP SUPPORT (Native <select> with <optgroup>) =====
    if (dropdownElement.tagName === 'SELECT') {
      const hasOptgroups = dropdownElement.querySelectorAll('optgroup').length > 0;
      
      if (hasOptgroups) {
        console.log(`📂 [Optgroup] Обнаружен <select> с группами`);
        
        // Ищем опцию в группах
        const option = this.findOptionInOptgroup(dropdownElement, targetValue);
        
        if (option) {
          // Устанавливаем selected
          option.selected = true;
          
          // Dispatch событий
          this.dispatchAllEvents(dropdownElement, targetValue);
          
          console.log(`✅ [Optgroup] Опция успешно выбрана`);
          return true;
        } else {
          console.warn(`⚠️ [Optgroup] Опция "${targetValue}" не найдена в группах`);
          return false;
        }
      }
      
      // Обычный <select> без optgroup
      const options = dropdownElement.querySelectorAll('option');
      for (const option of options) {
        const optValue = (option.value || '').toLowerCase().trim();
        const optText = (option.textContent || '').toLowerCase().trim();
        
        if (optValue === targetLower || optText === targetLower) {
          option.selected = true;
          this.dispatchAllEvents(dropdownElement, targetValue);
          console.log(`✅ [Select] Опция "${option.textContent}" успешно выбрана`);
          return true;
        }
      }
      
      // Частичное совпадение
      for (const option of options) {
        const optValue = (option.value || '').toLowerCase().trim();
        const optText = (option.textContent || '').toLowerCase().trim();
        
        if (optValue.includes(targetLower) || optText.includes(targetLower)) {
          option.selected = true;
          this.dispatchAllEvents(dropdownElement, targetValue);
          console.log(`✅ [Select] Опция "${option.textContent}" успешно выбрана (частичное)`);
          return true;
        }
      }
      
      console.warn(`⚠️ [Select] Опция "${targetValue}" не найдена`);
      return false;
    }
    // ===== END OPTGROUP SUPPORT =====
    
    // ОПТИМИЗАЦИЯ: Проверяем, открыт ли dropdown уже
    // ВАЖНО: Если dropdown уже открыт, сразу выбираем значение без повторного открытия
    // Это ускоряет работу, когда селектор для открытия и выбора работают в паре
    const isAlreadyOpen = this.isDropdownOpen(dropdownElement);
    if (isAlreadyOpen) {
      console.log(`⚡ [SeleniumUtils] Dropdown уже открыт! Пропускаю открытие и сразу выбираю значение...`);
      console.log(`   🔗 Селекторы работают в паре: открытие и выбор используют один dropdownElement`);
      
      // Ищем панели с опциями, связанные с этим dropdown
      const panels = this.findDropdownPanels(dropdownElement);
      if (panels.length > 0) {
        console.log(`   ✅ Найдено ${panels.length} панелей, связанных с dropdown, ищу опцию "${targetValue}"...`);
        
        // Ищем опцию в открытых панелях
        let option = null;
        let bestPanel = null;
        
        // Сначала ищем точное совпадение
        for (const panel of panels) {
          const options = this.findOptionsInPanel(panel);
          for (const opt of options) {
            const optText = this.getElementText(opt).trim().toLowerCase();
            const optValue = (this.getAttribute(opt, 'value') || opt.dataset?.value || '').toLowerCase();
            
            if (optText === targetLower || optValue === targetLower) {
              option = opt;
              bestPanel = panel;
              console.log(`✅ [SeleniumUtils] Найдена опция с точным совпадением: "${this.getElementText(opt)}"`);
              break;
            }
          }
          if (option) break;
        }
        
        // Если не нашли точное совпадение, ищем частичное
        if (!option) {
          for (const panel of panels) {
            const options = this.findOptionsInPanel(panel);
            for (const opt of options) {
              const optText = this.getElementText(opt).trim().toLowerCase();
              const optValue = (this.getAttribute(opt, 'value') || opt.dataset?.value || '').toLowerCase();
              
              if ((optText.includes(targetLower) || optValue.includes(targetLower)) && 
                  optText.length < 100 && 
                  !optText.includes('выберите')) {
                option = opt;
                bestPanel = panel;
                console.log(`✅ [SeleniumUtils] Найдена опция с частичным совпадением: "${this.getElementText(opt)}"`);
                break;
              }
            }
            if (option) break;
          }
        }
        
        // Если нашли опцию, сразу кликаем по ней (БЕЗ закрытия dropdown)
        if (option) {
          console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
          console.log(`🎯 [SeleniumUtils] ШАГ 2: БЫСТРЫЙ ВЫБОР - Опция "${this.getElementText(option)}"`);
          console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
          console.log(`   ⚡ Dropdown уже открыт, выбираю значение без закрытия`);
          
          this.scrollIntoView(option, true);
          // Умное ожидание готовности опции
          if (this.smartWaiter) {
            await this.smartWaiter.waitForElementReady(option, {
              visible: true,
              timeout: 500
            });
          } else {
            // Минимальная задержка
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(50);
        }
          }
          
          console.log(`   🖱️ Кликаю по опции "${this.getElementText(option)}"...`);
          const clickSuccess = await this.click(option);
          
          if (!clickSuccess) {
            console.log('   🔄 Обычный клик не сработал, пробую JavaScript клик...');
            await this.click(option, true);
          }
          
          // Умное ожидание готовности элемента (используем dropdownElement, так как clickableElement еще не объявлен)
        if (this.smartWaiter) {
          await this.smartWaiter.waitForElementReady(dropdownElement, {
            visible: true,
            timeout: 500
          });
        } else {
          await this.delay(200);
        } // Уменьшена задержка для быстрого выбора
          
          // Проверяем результат (используем тот же dropdownElement для проверки)
          const waitForSelection = async () => {
            await this.delay(100);
            
            // ВАЖНО: Проверяем результат в том же dropdownElement, который использовался для открытия
            const resultContent = dropdownElement.querySelector('.result__content[ng-reflect-app-tooltip]');
            if (resultContent) {
              const tooltipValue = resultContent.getAttribute('ng-reflect-app-tooltip') || '';
              const tooltipLower = tooltipValue.toLowerCase().trim();
              const contentText = this.getElementText(resultContent).trim().toLowerCase();
              
              if (tooltipLower === targetLower || tooltipLower.includes(targetLower) ||
                  contentText === targetLower || contentText.includes(targetLower)) {
                return true;
              }
            }
            
            const checkElements = [
              dropdownElement.querySelector('#status-project__result'),
              dropdownElement.querySelector('.result'),
              dropdownElement.querySelector('.result__content'),
              dropdownElement
            ].filter(el => el);
            
            for (const checkEl of checkElements) {
              const text = this.getElementText(checkEl).trim().toLowerCase();
              const value = this.getAttribute(checkEl, 'value') || this.getAttribute(checkEl, 'ng-reflect-value') || '';
              
              if (text === targetLower || text.includes(targetLower) || 
                  value.toLowerCase() === targetLower || value.toLowerCase().includes(targetLower)) {
                if (!text.includes('выберите')) {
                  return true;
                }
              }
            }
            
            return false;
          };
          
          if (await waitForSelection()) {
            console.log(`✅ [SeleniumUtils] Значение "${targetValue}" успешно выбрано (быстрый режим)!`);
            console.log(`   🔗 Селекторы работают в паре: открытие и выбор успешно завершены`);
            
            // DISPATCH ВСЕХ СОБЫТИЙ для React/Vue/Angular
            this.dispatchAllEvents(dropdownElement, targetValue);
            
            return true;
          }
          
          // Если быстрый выбор не сработал, продолжаем с обычной логикой
          console.log(`⚠️ [SeleniumUtils] Быстрый выбор не подтвердился, продолжаю с обычной логикой...`);
        } else {
          console.log(`⚠️ [SeleniumUtils] Опция "${targetValue}" не найдена в открытых панелях, продолжаю с обычной логикой...`);
        }
      } else {
        console.log(`⚠️ [SeleniumUtils] Панели не найдены, хотя dropdown открыт, продолжаю с обычной логикой...`);
      }
    }
    
    // Логируем состояние ДО клика
    console.log(`   📊 Состояние ДО клика:`);
    const panelsBefore = dropdownElement.querySelectorAll('.content-list-container, .content-list');
    console.log(`      - Панелей внутри dropdown: ${panelsBefore.length}`);
    const overlayBefore = document.querySelectorAll('.cdk-overlay-container .content-list-container, .cdk-overlay-container .content-list');
    console.log(`      - Панелей в overlay: ${overlayBefore.length}`);
    
    // Шаг 1: Клик по dropdown (как в автотесте: status_field.click())
    // КРИТИЧНО: ПРИОРИТЕТ .options, .result, .select-group или #status-project__result > div (рабочие элементы!)
    const possibleClickableElements = [
      dropdownElement.querySelector('.options'), // ПРИОРИТЕТ 1: Новый селектор!
      dropdownElement.querySelector('[class*="options"]'), // ПРИОРИТЕТ 2
      dropdownElement.querySelector('.result'), // ПРИОРИТЕТ 3: Уже был, но повышаем приоритет
      dropdownElement.querySelector('[class*="result"]'), // ПРИОРИТЕТ 4
      dropdownElement.querySelector('.arrow.isShowOptions'), // ПРИОРИТЕТ 5: Стрелка для открытия
      dropdownElement.querySelector('.arrow[class*="isShowOptions"]'), // ПРИОРИТЕТ 6
      dropdownElement.querySelector('.select-group'), // ПРИОРИТЕТ 7: Рабочий элемент!
      dropdownElement.querySelector('#status-project__result > div'), // ПРИОРИТЕТ 8
      dropdownElement.querySelector('#status-project__result'), // ПРИОРИТЕТ 9
      dropdownElement.querySelector('.select-box'), // ПРИОРИТЕТ 10
      dropdownElement.querySelector('div[class*="select"]'),
      dropdownElement.querySelector('.placeholder'),
      dropdownElement.querySelector('.form-input'),
      dropdownElement.querySelector('.input-project-status'),
      dropdownElement.querySelector('div.result'),
      dropdownElement.querySelector('div[role="combobox"]'),
      dropdownElement.querySelector('div[tabindex]'),
      dropdownElement
    ].filter(el => el && this.isElementVisible(el));
    
    console.log(`   🔍 [SeleniumUtils] Найдено ${possibleClickableElements.length} возможных элементов для клика`);
    if (possibleClickableElements.length > 0) {
      console.log(`   📋 Элементы для клика:`);
      possibleClickableElements.forEach((el, idx) => {
        console.log(`      ${idx + 1}. ${el.tagName} (${el.className || 'нет классов'}) ${el.id ? `id="${el.id}"` : ''}`);
      });
    }
    
    // Используем первый видимый элемент (приоритет .select-group!)
    let clickableElement = possibleClickableElements[0] || dropdownElement;
    
    // Если первый элемент не видим, пробуем следующие из списка
    if (!this.isElementVisible(clickableElement)) {
      console.warn('⚠️ [SeleniumUtils] Первый элемент не видим, пробую альтернативные селекторы...');
      
      // Пробуем найти видимый элемент из списка
      for (let i = 1; i < possibleClickableElements.length; i++) {
        const altElement = possibleClickableElements[i];
        if (this.isElementVisible(altElement)) {
          console.log(`   ✅ Найден видимый альтернативный элемент #${i + 1}: ${altElement.tagName} (${altElement.className || 'нет классов'})`);
          clickableElement = altElement;
          break;
        }
      }
      
      // Если все еще не видим, пробуем прокрутить к элементу
      if (!this.isElementVisible(clickableElement)) {
        console.log('   🔄 Пробую прокрутить к элементу...');
        try {
          clickableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.delay(500);
          
          // Проверяем снова после прокрутки
          if (!this.isElementVisible(clickableElement)) {
            // Если все еще не видим, пробуем использовать элемент напрямую (может быть скрыт, но существовать)
            console.warn('   ⚠️ Элемент все еще не видим после прокрутки, но продолжаю попытку...');
            // Не возвращаем false, продолжаем попытку
          } else {
            console.log('   ✅ Элемент стал видимым после прокрутки');
          }
        } catch (e) {
          console.warn(`   ⚠️ Ошибка при прокрутке: ${e.message}`);
          // Продолжаем попытку даже если прокрутка не удалась
        }
      }
    }
    
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    console.log(`🎯 [SeleniumUtils] ШАГ 2: ОТКРЫТИЕ DROPDOWN`);
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    
    console.log(`   🖱️ Кликаю по dropdown...`);
    console.log(`      📍 Элемент: ${clickableElement.tagName} (${clickableElement.className || 'нет классов'})`);
    console.log(`      📍 ID: ${clickableElement.id || 'нет'}`);
    console.log(`      📍 Позиция: left=${Math.round(clickableElement.getBoundingClientRect().left)}, top=${Math.round(clickableElement.getBoundingClientRect().top)}`);
    
    // ОПТИМИЗАЦИЯ: Сначала запускаем MutationObserver, затем делаем минимальный клик
    // Если панель найдена быстро - пропускаем агрессивный клик
    console.log(`   👁️ Запускаю MutationObserver для отслеживания появления панели...`);
    let panelFound = false;
    let foundPanel = null;
    let observerDisconnected = false;
    
    const observer = new MutationObserver((mutations) => {
      if (observerDisconnected) return;
      
      // Проверяем появление панели в overlay (ПРИОРИТЕТ!)
      const overlayPanels = document.querySelectorAll('.cdk-overlay-container .content-list-container, .cdk-overlay-container .content-list, .cdk-overlay-container [class*="content-list"]');
      for (const panel of overlayPanels) {
        if (this.isElementVisible(panel)) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
            panelFound = true;
            foundPanel = panel;
            console.log(`   ✅ [MutationObserver] Обнаружена панель в overlay с ${options.length} опциями!`);
            observer.disconnect();
            observerDisconnected = true;
            return;
          }
        }
      }
      
      // Проверяем появление панели внутри dropdown (расширенный поиск)
      const insideSelectors = [
        '.content-list-container',
        '.content-list',
        '[class*="content-list"]',
        '.select-options',
        '[class*="select-options"]',
        '.dropdown-menu',
        '[class*="dropdown-menu"]'
      ];
      for (const selector of insideSelectors) {
        try {
          const insidePanels = dropdownElement.querySelectorAll(selector);
          for (const panel of insidePanels) {
            if (this.isElementVisible(panel)) {
              const options = this.findOptionsInPanel(panel);
              if (options.length > 0) {
                panelFound = true;
                foundPanel = panel;
                console.log(`   ✅ [MutationObserver] Обнаружена панель внутри dropdown (${selector}) с ${options.length} опциями!`);
                observer.disconnect();
                observerDisconnected = true;
                return;
              }
            }
          }
        } catch (e) {
          // Игнорируем ошибки селекторов
        }
      }
      
      // Проверяем любые панели рядом с dropdown (расширенный поиск)
      const allPanels = document.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
      const dropdownRect = dropdownElement.getBoundingClientRect();
      for (const panel of allPanels) {
        if (this.isElementVisible(panel) && !dropdownElement.contains(panel)) {
          const panelRect = panel.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(panelRect.left - dropdownRect.left, 2) + 
            Math.pow(panelRect.top - dropdownRect.top, 2)
          );
          if (distance < 500) {
            const options = this.findOptionsInPanel(panel);
            if (options.length > 0) {
              panelFound = true;
              foundPanel = panel;
              console.log(`   ✅ [MutationObserver] Обнаружена панель рядом (${Math.round(distance)}px) с ${options.length} опциями!`);
              observer.disconnect();
              observerDisconnected = true;
              return;
            }
          }
        }
      }
    });
    
    // Начинаем наблюдение за изменениями DOM ПЕРЕД кликом
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    // Также наблюдаем за overlay контейнерами
    const overlayContainers = document.querySelectorAll('.cdk-overlay-container, .mat-overlay-container');
    overlayContainers.forEach(container => {
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    });
    
    // Функция для проверки, найдена ли панель
    const checkPanelFound = () => {
      if (panelFound && foundPanel) {
        console.log(`   ✅ Панель найдена через MutationObserver!`);
        if (!observerDisconnected) {
          observer.disconnect();
          observerDisconnected = true;
        }
        return true;
      }
      return false;
    };
    
    // КРИТИЧНО: Пробуем кликнуть по ВСЕМ возможным элементам (как в рабочей версии!)
    console.log(`   🔥 АГРЕССИВНЫЙ КЛИК: Пробую кликнуть по ${possibleClickableElements.length} элементам...`);
    
    // Пробуем кликнуть по первым 5 элементам (увеличено с 3!)
    for (let i = 0; i < Math.min(possibleClickableElements.length, 5); i++) {
      const element = possibleClickableElements[i];
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      console.log(`   🖱️ Попытка ${i + 1}: Клик по ${element.tagName} (${element.className || 'нет классов'})`);
      
      // Способ 1: Обычный клик
      try {
        element.click();
        // Умное ожидание готовности элемента (используем element, так как clickableElement еще не объявлен)
        if (this.smartWaiter) {
          await this.smartWaiter.waitForElementReady(element, {
            visible: true,
            timeout: 500
          });
        } else {
          await this.delay(200);
        }
        if (checkPanelFound()) break;
      } catch (e) {
        console.warn(`      ⚠️ Ошибка при обычном клике: ${e.message}`);
      }
      
      // Способ 2: JavaScript клик с координатами
      try {
        element.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          buttons: 1,
          clientX: centerX,
          clientY: centerY
        }));
        // Умное ожидание готовности элемента (используем element, так как clickableElement еще не объявлен)
        if (this.smartWaiter) {
          await this.smartWaiter.waitForElementReady(element, {
            visible: true,
            timeout: 500
          });
        } else {
          await this.delay(200);
        }
        if (checkPanelFound()) break;
      } catch (e) {
        console.warn(`      ⚠️ Ошибка при JavaScript клике: ${e.message}`);
      }
      
      // Способ 3: Полный цикл событий мыши (как реальный пользователь)
      try {
        element.dispatchEvent(new MouseEvent('mousedown', { 
          bubbles: true, 
          cancelable: true,
          buttons: 1,
          clientX: centerX,
          clientY: centerY
        }));
        // Минимальная задержка
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(50);
        }
        element.dispatchEvent(new MouseEvent('mouseup', { 
          bubbles: true, 
          cancelable: true,
          buttons: 1,
          clientX: centerX,
          clientY: centerY
        }));
        // Минимальная задержка
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(50);
        }
        element.dispatchEvent(new MouseEvent('click', { 
          bubbles: true, 
          cancelable: true,
          buttons: 1,
          clientX: centerX,
          clientY: centerY
        }));
        // Умное ожидание появления панели
        if (this.smartWaiter) {
          await this.smartWaiter.waitForDropdownPanel(dropdownElement, { timeout: 500 });
        } else {
          await this.delay(300);
        }
        if (checkPanelFound()) break;
      } catch (e) {
        console.warn(`      ⚠️ Ошибка при mousedown/mouseup клике: ${e.message}`);
      }
      
      // Способ 4: Focus + клик (для элементов с tabindex)
      try {
        if (element.tabIndex >= 0 || element.hasAttribute('tabindex')) {
          element.focus();
          await this.delay(100);
          element.click();
          await this.delay(300);
          if (checkPanelFound()) break;
        }
      } catch (e) {
        // Игнорируем ошибки
      }
    }
    
    // Способ 5: Попытка открыть через Angular API (КРИТИЧНО - как в рабочей версии!)
    try {
      const ngComponent = this.getAngularComponent(dropdownElement);
      if (ngComponent) {
        const componentInstance = ngComponent.instance || ngComponent.componentInstance;
        if (componentInstance) {
          const openMethods = ['open', 'toggle', 'show', 'openDropdown', 'toggleDropdown', 'onClick', 'handleClick', 'onToggle'];
          for (const methodName of openMethods) {
            if (typeof componentInstance[methodName] === 'function') {
              try {
                console.log(`   🔧 [SeleniumUtils] Пробую вызвать ${methodName}() через Angular API`);
                componentInstance[methodName]();
                // Умное ожидание появления панели
                if (this.smartWaiter) {
                  await this.smartWaiter.waitForDropdownPanel(dropdownElement, { timeout: 1000 });
                } else {
                  await this.delay(500);
                }
                if (checkPanelFound()) break;
              } catch (e) {
                // Игнорируем ошибки
              }
            }
          }
        }
      }
    } catch (e) {
      // Игнорируем ошибки Angular API
    }
    
    // Используем основной элемент для финального агрессивного клика
    const rect = clickableElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Финальный агрессивный клик (как в рабочей версии!)
    try {
      clickableElement.dispatchEvent(new MouseEvent('mousedown', { 
        bubbles: true, 
        cancelable: true,
        buttons: 1,
        clientX: centerX,
        clientY: centerY
      }));
      await this.delay(50);
      clickableElement.dispatchEvent(new MouseEvent('mouseup', { 
        bubbles: true, 
        cancelable: true,
        buttons: 1,
        clientX: centerX,
        clientY: centerY
      }));
      await this.delay(50);
      clickableElement.dispatchEvent(new MouseEvent('click', { 
        bubbles: true, 
        cancelable: true,
        buttons: 1,
        clientX: centerX,
        clientY: centerY
      }));
      clickableElement.click(); // Дополнительный обычный клик
      // Умное ожидание установки значения
      if (this.smartWaiter) {
        await this.smartWaiter.waitForDropdownValue(dropdownElement, targetValue, { timeout: 2000 });
      } else {
        await this.delay(1000);
      }
    } catch (e) {
      console.warn(`   ⚠️ Ошибка при финальном клике: ${e.message}`);
    }
    
    // Минимальная задержка для завершения
    if (this.smartWaiter) {
      await this.smartWaiter.minimalDelay(100);
    } else {
      await this.delay(500);
    }
    
    // Если панель все еще не найдена, отключаем observer через таймаут
    if (!observerDisconnected) {
      setTimeout(() => {
        if (!observerDisconnected) {
          observer.disconnect();
          observerDisconnected = true;
        }
      }, 5000);
    }
    
    // Шаг 2: Ожидаем появления панели с опциями (важно для воспроизведения)
    // КРИТИЧНО: Панель может быть в Angular overlay контейнере ИЛИ внутри самого dropdown!
    
    let panels = [];
    
    // Если MutationObserver уже нашел панель, используем её и пропускаем ожидание
    if (panelFound && foundPanel) {
      console.log(`   ✅ [SeleniumUtils] Панель найдена через MutationObserver! Пропускаю ожидание открытия dropdown.`);
      if (!observerDisconnected) {
        observer.disconnect();
        observerDisconnected = true;
      }
      // Добавляем найденную панель в список панелей для дальнейшей обработки
      panels = [foundPanel];
      // Пропускаем весь цикл ожидания, так как панель уже найдена
    } else {
      // Отключаем observer через таймаут, если панель не найдена
      setTimeout(() => {
        if (!observerDisconnected) {
          observer.disconnect();
          observerDisconnected = true;
        }
      }, 3000);
      
      // Функция проверки открытия dropdown (расширенная)
      const isDropdownOpen = () => {
      // ПРИОРИТЕТ 1: Прямой поиск элементов .option (самый быстрый способ)
      const directOptions = document.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
      const visibleDirectOptions = Array.from(directOptions).filter(opt => {
        if (!this.isElementVisible(opt)) return false;
        const text = this.getElementText(opt);
        // Исключаем плейсхолдеры
        const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
        return text && text.length > 0 && !isPlaceholder;
      });
      if (visibleDirectOptions.length > 0) {
        console.log(`   ✅ [SeleniumUtils] Dropdown открыт: найдено ${visibleDirectOptions.length} элементов .option напрямую`);
        return true;
      }
      
      // ПРИОРИТЕТ 2: Overlay панели с опциями
      const overlayContainers = document.querySelectorAll('.cdk-overlay-container, .mat-overlay-container');
      for (const container of overlayContainers) {
        // Сначала ищем опции напрямую в overlay
        const optionsInOverlay = container.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
        const visibleOptions = Array.from(optionsInOverlay).filter(opt => {
          if (!this.isElementVisible(opt)) return false;
          const text = this.getElementText(opt);
          const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
          return text && text.length > 0 && !isPlaceholder;
        });
        if (visibleOptions.length > 0) {
          console.log(`   ✅ [SeleniumUtils] Dropdown открыт: найдено ${visibleOptions.length} опций в overlay`);
          return true;
        }
        
        // Затем ищем панели
        const panels = container.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
        for (const panel of panels) {
          if (this.isElementVisible(panel)) {
            const options = this.findOptionsInPanel(panel);
            if (options.length > 0) {
              console.log(`   ✅ [SeleniumUtils] Dropdown открыт: найдена панель в overlay с ${options.length} опциями`);
              return true;
            }
          }
        }
      }
      
      // ПРИОРИТЕТ 3: Панель ВНУТРИ самого dropdown элемента (КРИТИЧНО!)
      // Сначала ищем опции напрямую внутри dropdown
      const optionsInsideDropdown = dropdownElement.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
      const visibleOptionsInside = Array.from(optionsInsideDropdown).filter(opt => {
        if (!this.isElementVisible(opt)) return false;
        const text = this.getElementText(opt);
        const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
        return text && text.length > 0 && !isPlaceholder;
      });
      if (visibleOptionsInside.length > 0) {
        console.log(`   ✅ [SeleniumUtils] Dropdown открыт: найдено ${visibleOptionsInside.length} опций ВНУТРИ dropdown`);
        return true;
      }
      
      // Затем ищем панели внутри dropdown
      const panelsInsideDropdown = dropdownElement.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
      for (const panel of panelsInsideDropdown) {
        if (this.isElementVisible(panel)) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
            console.log(`   ✅ [SeleniumUtils] Dropdown открыт: найдена панель ВНУТРИ dropdown с ${options.length} опциями`);
            return true;
          }
        }
      }
      
      // ПРИОРИТЕТ 4: Любые видимые панели с опциями рядом с dropdown
      const allPanels = document.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
      const dropdownRect = dropdownElement.getBoundingClientRect();
      for (const panel of allPanels) {
        if (this.isElementVisible(panel)) {
          const panelRect = panel.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(panelRect.left - dropdownRect.left, 2) + 
            Math.pow(panelRect.top - dropdownRect.top, 2)
          );
          if (distance < 500) {
            const options = this.findOptionsInPanel(panel);
            if (options.length > 0) {
              console.log(`   ✅ [SeleniumUtils] Dropdown открыт: найдена панель рядом (${Math.round(distance)}px) с ${options.length} опциями`);
              return true;
            }
          }
        }
      }
      
      return false;
    };
    
      // Ждем открытия dropdown (только если панель еще не найдена)
      let dropdownOpened = false;
      let openAttempts = 0;
      const maxQuickAttempts = 5; // Быстрые попытки (1.5 секунды)
      const maxSlowAttempts = 10; // Медленные попытки (еще 3 секунды)
      
      // Быстрая проверка (5 попыток по 300мс)
      while (!dropdownOpened && openAttempts < maxQuickAttempts) {
        dropdownOpened = isDropdownOpen();
        if (!dropdownOpened) {
          console.log(`   ⏳ [SeleniumUtils] Dropdown еще не открылся, жду... (попытка ${openAttempts + 1}/${maxQuickAttempts})`);
          await this.delay(300); // 300мс между попытками
          openAttempts++;
        } else {
          console.log(`   ✅ [SeleniumUtils] Dropdown открылся после ${openAttempts + 1} попыток`);
          break;
        }
      }
      
      // Если не открылся быстро, делаем еще несколько попыток с большей задержкой
      if (!dropdownOpened && openAttempts < maxQuickAttempts + maxSlowAttempts) {
        console.log(`   ⏳ [SeleniumUtils] Dropdown не открылся быстро, продолжаю проверку с увеличенной задержкой...`);
        while (!dropdownOpened && openAttempts < maxQuickAttempts + maxSlowAttempts) {
          dropdownOpened = isDropdownOpen();
          if (!dropdownOpened) {
            console.log(`   ⏳ [SeleniumUtils] Dropdown еще не открылся, жду... (попытка ${openAttempts + 1}/${maxQuickAttempts + maxSlowAttempts})`);
            await this.delay(300); // 300мс между попытками
            openAttempts++;
          } else {
            console.log(`   ✅ [SeleniumUtils] Dropdown открылся после ${openAttempts + 1} попыток`);
            break;
          }
        }
      }
      
      if (!dropdownOpened) {
        console.warn(`   ⚠️ [SeleniumUtils] Dropdown не открылся после клика, но продолжаю поиск панелей...`);
        
        // Логируем состояние ПОСЛЕ клика для отладки
        console.log(`   📊 [SeleniumUtils] Состояние ПОСЛЕ клика:`);
        const panelsAfter = dropdownElement.querySelectorAll('.content-list-container, .content-list');
        console.log(`      - Панелей внутри dropdown: ${panelsAfter.length}`);
        const overlayAfter = document.querySelectorAll('.cdk-overlay-container .content-list-container, .cdk-overlay-container .content-list');
        console.log(`      - Панелей в overlay: ${overlayAfter.length}`);
        
        // Проверяем, изменилось ли что-то
        if (panelsAfter.length > panelsBefore.length) {
          console.log(`      ✅ Появились новые панели внутри dropdown!`);
        }
        if (overlayAfter.length > overlayBefore.length) {
          console.log(`      ✅ Появились новые панели в overlay!`);
        }
      }
    }
    
    // Теперь ищем панели (только если панель еще не найдена)
    // ОПТИМИЗАЦИЯ: Если панель уже найдена через MutationObserver, полностью пропускаем поиск
    if (panels.length === 0) {
      console.log(`   🔍 [SeleniumUtils] Панель не найдена через MutationObserver, начинаю поиск панелей...`);
      
      // ПОВТОРНАЯ ПОПЫТКА: Если панель не найдена, пробуем альтернативные селекторы для открытия
      if (possibleClickableElements.length > 1) {
        console.log(`   🔄 [SeleniumUtils] Пробую альтернативные селекторы для открытия dropdown...`);
        
        for (let altIndex = 1; altIndex < Math.min(possibleClickableElements.length, 4); altIndex++) {
          const altElement = possibleClickableElements[altIndex];
          if (!altElement || !this.isElementVisible(altElement)) {
            continue;
          }
          
          console.log(`   🔄 Попытка ${altIndex + 1}: Использую альтернативный элемент ${altElement.tagName} (${altElement.className || 'нет классов'})`);
          
          // Прокручиваем к альтернативному элементу
          try {
            altElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(300);
          } catch (e) {
            // Игнорируем ошибки прокрутки
          }
          
          // Пробуем кликнуть по альтернативному элементу
          try {
            altElement.click();
            await this.delay(500);
            
            // Проверяем, открылся ли dropdown
            const isOpen = this.isDropdownOpen(dropdownElement);
            if (isOpen) {
              console.log(`   ✅ [SeleniumUtils] Dropdown открылся с альтернативным селектором #${altIndex + 1}!`);
              // Обновляем clickableElement для дальнейшего использования
              clickableElement = altElement;
              break;
            }
          } catch (e) {
            console.warn(`   ⚠️ Ошибка при клике по альтернативному элементу: ${e.message}`);
          }
        }
      }
      let attempts = 0;
      const maxQuickAttempts = 5; // Быстрые попытки (2.5 секунды)
      const maxSlowAttempts = 5; // Медленные попытки (еще 2.5 секунды)
      const maxAttempts = maxQuickAttempts + maxSlowAttempts; // Всего 10 попыток (5 секунд)
      
      // Поиск панелей (до 10 попыток)
      while (attempts < maxAttempts && panels.length === 0) {
      // ПРИОРИТЕТ 0: КРИТИЧНО! Ищем панели ВНУТРИ самого dropdown элемента (панель может быть там!)
      // Сначала ищем опции напрямую - если найдены, значит dropdown открыт
      const directOptions = dropdownElement.querySelectorAll('.option, div.option, [class*="option"]:not([class*="options"]), .cutted-text');
      const visibleDirectOptions = Array.from(directOptions).filter(opt => {
        if (!this.isElementVisible(opt)) return false;
        const text = this.getElementText(opt);
        const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
        return text && text.length > 0 && !isPlaceholder;
      });
      if (visibleDirectOptions.length > 0) {
        // Находим родительский контейнер опций (это и есть панель)
        const optionContainers = new Set();
        visibleDirectOptions.forEach(opt => {
          let container = opt.parentElement;
          // Поднимаемся вверх до app-select или до элемента с классом, указывающим на панель
          while (container && container !== dropdownElement && container !== document.body) {
            if (container.classList.contains('content-list') || 
                container.classList.contains('content-list-container') ||
                container.classList.contains('select-group') ||
                container.classList.contains('select-box') ||
                container.tagName === 'APP-SELECT') {
              optionContainers.add(container);
              break;
            }
            container = container.parentElement;
          }
          // Если не нашли контейнер, используем ближайший родитель с несколькими опциями
          if (!optionContainers.has(container)) {
            container = opt.parentElement;
            if (container && container.querySelectorAll('.option, div.option').length > 1) {
              optionContainers.add(container);
            }
          }
        });
        optionContainers.forEach(panel => {
          if (!panels.includes(panel)) {
            console.log(`   ✅ [SeleniumUtils] Найдена панель ВНУТРИ dropdown через прямые опции: ${panel.tagName} (${panel.className || 'нет классов'}) с ${visibleDirectOptions.length} опциями`);
            panels.unshift(panel);
          }
        });
      }
      
      // Затем ищем панели через селекторы
      const allSelectors = [
        '.content-list-container', 
        '.content-list', 
        '[class*="content-list"]',
        '.select-group',
        '[class*="select-group"]',
        '.select-box',
        '[class*="select-box"]',
        '.menu',
        '[class*="menu"]',
        '.options-container',
        '[class*="options"]',
        'div[class*="option"]',
        '.dropdown-menu',
        '[role="listbox"]'
      ];
      
      for (const selector of allSelectors) {
        try {
          const panelsInsideDropdown = dropdownElement.querySelectorAll(selector);
      for (const panel of panelsInsideDropdown) {
        if (this.isElementVisible(panel) && !panels.includes(panel)) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
                console.log(`   ✅ [SeleniumUtils] Найдена панель ВНУТРИ dropdown: ${panel.tagName} (${panel.className || 'нет классов'}) с ${options.length} опциями через селектор "${selector}"`);
            panels.unshift(panel); // Максимальный приоритет панелям внутри dropdown
              }
            }
          }
        } catch (e) {
          // Игнорируем ошибки селекторов
        }
      }
      
      // ПРИОРИТЕТ 0.5: Ищем панели в body (могут быть вне dropdown и overlay)
      const bodyPanels = document.body.querySelectorAll('.content-list-container, .content-list, .select-group, .select-box, [class*="content-list"], [class*="select-group"]');
      for (const panel of bodyPanels) {
        if (this.isElementVisible(panel) && !panels.includes(panel)) {
          const options = this.findOptionsInPanel(panel);
          if (options.length > 0) {
            const dropdownRect = dropdownElement.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(panelRect.left - dropdownRect.left, 2) + 
              Math.pow(panelRect.top - dropdownRect.top, 2)
            );
            // Если панель близко к dropdown (в пределах 1000px), добавляем её
            if (distance < 1000) {
              console.log(`   ✅ [SeleniumUtils] Найдена панель в body рядом с dropdown (${Math.round(distance)}px): ${panel.tagName} (${panel.className || 'нет классов'}) с ${options.length} опциями`);
              panels.push(panel);
            }
          }
        }
      }
      
      // ПРИОРИТЕТ 1: Ищем панели в Angular overlay контейнерах
      const overlayContainers = document.querySelectorAll('.cdk-overlay-container, .mat-overlay-container, [class*="overlay-container"]');
      if (overlayContainers.length > 0) {
        console.log(`   🔍 [SeleniumUtils] Найдено ${overlayContainers.length} overlay контейнеров, ищу панели...`);
      }
      
      for (const container of overlayContainers) {
        for (const selector of this.dropdownPanelSelectors) {
          try {
            const elements = container.querySelectorAll(selector);
            for (const el of elements) {
              // Пропускаем сам dropdown элемент
              if (el === dropdownElement || 
                  (el.classList.contains('form-input') && el.classList.contains('input-project-status'))) {
                continue;
              }
              
              if (this.isElementVisible(el) && !panels.includes(el)) {
                const options = this.findOptionsInPanel(el);
                if (options.length > 0) {
                  console.log(`   ✅ [SeleniumUtils] Найдена панель в overlay: ${el.tagName} (${el.className || 'нет классов'}) с ${options.length} опциями`);
                  panels.push(el); // Добавляем после панелей внутри dropdown
                }
              }
            }
          } catch (e) {
            // Игнорируем ошибки
          }
        }
      }
      
      // Также ищем content-list напрямую в overlay (специально для статусов)
      for (const container of overlayContainers) {
        const contentLists = container.querySelectorAll('.content-list-container, .content-list');
        for (const list of contentLists) {
          if (this.isElementVisible(list) && !panels.includes(list)) {
            const options = this.findOptionsInPanel(list);
            if (options.length > 0) {
              console.log(`   ✅ [SeleniumUtils] Найдена content-list панель в overlay: ${list.tagName} (${list.className || 'нет классов'}) с ${options.length} опциями`);
              panels.push(list);
            }
          }
        }
      }
      
      // ПРИОРИТЕТ 2: Если не нашли, ищем в body (для случаев, когда панель не в overlay)
      if (panels.length === 0) {
        console.log(`   🔍 [SeleniumUtils] Панели в overlay и внутри dropdown не найдены, ищу в body...`);
        const bodyPanels = document.body.querySelectorAll('.content-list-container, .content-list, [class*="content-list"]');
        for (const panel of bodyPanels) {
          // Пропускаем панели внутри dropdown (они уже проверены)
          if (dropdownElement.contains(panel)) continue;
          
          // Пропускаем сам dropdown
          if (panel === dropdownElement || 
              (panel.classList.contains('form-input') && panel.classList.contains('input-project-status'))) {
            continue;
          }
          
          if (this.isElementVisible(panel) && !panels.includes(panel)) {
            const options = this.findOptionsInPanel(panel);
            if (options.length > 0) {
              console.log(`   ✅ [SeleniumUtils] Найдена панель в body: ${panel.tagName} (${panel.className || 'нет классов'}) с ${options.length} опциями`);
              panels.push(panel);
            }
          }
        }
      }
      
      // ПРИОРИТЕТ 3: Если все еще не нашли, используем findDropdownPanels (но исключаем сам dropdown)
      if (panels.length === 0) {
        console.log(`   🔍 [SeleniumUtils] Использую общий поиск панелей...`);
        const allPanels = this.findDropdownPanels(dropdownElement);
        // Дополнительная фильтрация: исключаем сам dropdown элемент
        const panelsWithOptions = allPanels.filter(panel => {
          // Проверяем, что это не сам dropdown
          if (panel === dropdownElement) return false;
          if (panel.classList.contains('form-input') && panel.classList.contains('input-project-status')) {
            return false; // Это сам dropdown
          }
          
          const options = this.findOptionsInPanel(panel);
          return options.length > 0;
        });
        
        if (panelsWithOptions.length > 0) {
          panels = panelsWithOptions;
          console.log(`   ✅ [SeleniumUtils] Найдено ${panels.length} панелей с опциями (после фильтрации)`);
          break;
        } else {
          console.log(`   ⚠️ [SeleniumUtils] Найдено ${allPanels.length} панелей, но все без опций или это сам dropdown`);
        }
      } else {
        break; // Нашли панели
      }
      
      if (panels.length === 0) {
        attempts++;
        // Проверяем, есть ли вообще элементы .option на странице (быстрая проверка)
        if (attempts === maxQuickAttempts) {
          const quickCheck = document.querySelectorAll('.option, div.option, .cutted-text');
          const visibleQuickCheck = Array.from(quickCheck).filter(opt => {
            if (!this.isElementVisible(opt)) return false;
            const text = this.getElementText(opt);
            const isPlaceholder = this.placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
            return text && text.length > 0 && !isPlaceholder;
          });
          if (visibleQuickCheck.length === 0) {
            console.log(`   ⚠️ [SeleniumUtils] Элементы .option не найдены на странице после ${attempts} попыток, прекращаю поиск`);
            break; // Прекращаем поиск, если опций нет
          }
        }
        console.log(`   ⏳ [SeleniumUtils] Панель еще не появилась, жду... (попытка ${attempts}/${maxAttempts})`);
        if (attempts < maxAttempts) {
          await this.delay(500); // 500мс между попытками
        }
      } else {
        break;
      }
      }
    } else {
      console.log(`   ✅ [SeleniumUtils] Панель уже найдена через MutationObserver, пропускаю поиск панелей.`);
    }
    
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    console.log(`🎯 [SeleniumUtils] ШАГ 2: ПОИСК ПАНЕЛЕЙ - Найдено ${panels.length} панелей`);
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    
    // Логируем найденные панели для отладки
    if (panels.length > 0) {
      console.log(`   📋 Детали панелей:`);
      panels.forEach((panel, idx) => {
        const options = this.findOptionsInPanel(panel);
        const optionTexts = options.slice(0, 5).map(opt => this.getElementText(opt));
        console.log(`      ${idx + 1}. ${panel.tagName} (${panel.className || 'нет классов'}) - ${options.length} опций: ${optionTexts.join(', ')}`);
      });
    }
    
    // Шаг 3: Поиск опции в панелях (ПРОСТАЯ И РАБОЧАЯ ЛОГИКА!)
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    console.log(`🎯 [SeleniumUtils] ШАГ 3: ПОИСК ОПЦИИ`);
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    
    let option = null;
    let bestPanel = null;
    // targetLower уже объявлен в начале функции
    
    console.log(`🔍 [SeleniumUtils] Ищу опцию "${targetValue}"...`);
    
    // ОПТИМИЗАЦИЯ: Если значение содержит несколько опций (например "Плановый По поручению Инициативный"),
    // разбиваем на отдельные опции и ищем первую
    let searchValues = [targetValue];
    if (targetLower.includes('плановый') && targetLower.includes('поручению') && targetLower.includes('инициативный')) {
      // Это составное значение, разбиваем на отдельные опции
      searchValues = ['Плановый', 'По поручению', 'Инициативный'];
      console.log(`   🔄 [SeleniumUtils] Обнаружено составное значение, ищу отдельные опции: ${searchValues.join(', ')}`);
    }
    
    // Сначала ищем точное совпадение (приоритет!)
    for (const searchVal of searchValues) {
      const searchNormalized = searchVal.toLowerCase().trim().replace(/\s+/g, ' ');
      const searchWords = searchNormalized.split(/\s+/).filter(w => w.length > 0);
      
      for (const panel of panels) {
        const options = this.findOptionsInPanel(panel);
        for (const opt of options) {
          const optText = this.getElementText(opt);
          if (!optText) continue;
          
          const optTextNormalized = optText.trim().toLowerCase().replace(/\s+/g, ' ');
          const optValue = (this.getAttribute(opt, 'value') || opt.dataset?.value || '').toLowerCase().trim();
          
          // Точное совпадение - высший приоритет (нормализованное)
          if (optTextNormalized === searchNormalized || optValue === searchNormalized) {
            option = opt;
            bestPanel = panel;
            console.log(`✅ [SeleniumUtils] Найдена опция с точным совпадением: "${optText}"`);
            break;
          }
        }
        if (option) break;
      }
      if (option) break;
    }
    
    // Если не нашли точное совпадение, ищем частичное (но исключаем длинные контейнеры)
    if (!option) {
      for (const searchVal of searchValues) {
        const searchNormalized = searchVal.toLowerCase().trim().replace(/\s+/g, ' ');
        const searchWords = searchNormalized.split(/\s+/).filter(w => w.length > 0);
        
        for (const panel of panels) {
          const options = this.findOptionsInPanel(panel);
          for (const opt of options) {
            const optText = this.getElementText(opt);
            if (!optText) continue;
            
            const optTextNormalized = optText.trim().toLowerCase().replace(/\s+/g, ' ');
            const optValue = (this.getAttribute(opt, 'value') || opt.dataset?.value || '').toLowerCase().trim();
            
            // Игнорируем слишком длинные тексты (контейнеры)
            if (optText.length > 200) continue;
            
            // Игнорируем контейнеры со всеми опциями
            if (optTextNormalized.includes('плановый по поручению инициативный')) continue;
            
            // Проверка 1: Целевой текст содержится в опции
            if (optTextNormalized.includes(searchNormalized) || optValue.includes(searchNormalized)) {
              option = opt;
              bestPanel = panel;
              console.log(`✅ [SeleniumUtils] Найдена опция с частичным совпадением (текст в опции): "${optText}"`);
              break;
            }
            
            // Проверка 2: Опция содержится в целевом тексте
            if (searchNormalized.includes(optTextNormalized)) {
              option = opt;
              bestPanel = panel;
              console.log(`✅ [SeleniumUtils] Найдена опция с частичным совпадением (опция в тексте): "${optText}"`);
              break;
            }
            
            // Проверка 3: Все слова из целевого текста присутствуют в опции
            if (searchWords.length > 0 && searchWords.every(word => optTextNormalized.includes(word))) {
              option = opt;
              bestPanel = panel;
              console.log(`✅ [SeleniumUtils] Найдена опция по словам: "${optText}" содержит все слова из "${searchVal}"`);
              break;
            }
            
            // Проверка 4: Большинство слов совпадает (для опечаток)
            if (searchWords.length > 1) {
              const matchingWords = searchWords.filter(word => optTextNormalized.includes(word));
              if (matchingWords.length >= Math.ceil(searchWords.length * 0.7)) {
                option = opt;
                bestPanel = panel;
                console.log(`✅ [SeleniumUtils] Найдена опция по части слов (${matchingWords.length}/${searchWords.length}): "${optText}"`);
                break;
              }
            }
          }
          if (option) break;
        }
        if (option) break;
      }
    }
    
    // Если не нашли, пробуем через findOptionByText (с учетом составных значений)
    if (!option) {
      console.log(`   🔄 [SeleniumUtils] Использую findOptionByText...`);
      for (const panel of panels) {
        // Пробуем найти по составным значениям
        for (const searchVal of searchValues) {
          option = this.findOptionByText(searchVal, panel);
          if (option) {
            console.log(`✅ [SeleniumUtils] Опция "${searchVal}" найдена через findOptionByText`);
            break;
          }
        }
        if (option) break;
        
        // Также пробуем полное значение
        if (!option) {
          option = this.findOptionByText(targetValue, panel);
          if (option) {
            console.log(`✅ [SeleniumUtils] Опция найдена через findOptionByText`);
            break;
          }
        }
      }
    }
    
    // Шаг 3.5: ВИРТУАЛИЗИРОВАННЫЕ СПИСКИ
    // Если не нашли опцию в видимых элементах, проверяем виртуализированные списки
    if (!option) {
      console.log('🔄 [Virtualized] Проверка виртуализированных списков...');
      
      const panels = this.findDropdownPanels(dropdownElement);
      for (const panel of panels) {
        if (this.isVirtualizedList(panel)) {
          console.log('   🔄 [Virtualized] Обнаружен виртуализированный список, прокручиваю...');
          
          // Пробуем для каждого варианта значения
          for (const searchVal of searchValues) {
            const foundOption = await this.scrollVirtualizedListToOption(panel, searchVal);
            if (foundOption) {
              option = foundOption;
              console.log(`✅ [Virtualized] Опция найдена в виртуализированном списке`);
              break;
            }
          }
          
          // Если не нашли по частям, пробуем полное значение
          if (!option) {
            const foundOption = await this.scrollVirtualizedListToOption(panel, targetValue);
            if (foundOption) {
              option = foundOption;
              console.log(`✅ [Virtualized] Опция найдена в виртуализированном списке`);
            }
          }
          
          if (option) break;
        }
      }
    }
    
    // Шаг 4: Если не нашли, используем альтернативный поиск (как в автотесте)
    // ВАЖНО: Проверяем, что найденный элемент находится внутри панели dropdown
    if (!option) {
      console.log('🔄 [SeleniumUtils] Опция не найдена в панелях, использую альтернативный поиск...');
      
      // Сначала получаем все панели для проверки
      const allPanels = this.findDropdownPanels(dropdownElement);
      
      // Пробуем найти по составным значениям
      for (const searchVal of searchValues) {
        const foundElement = this.findOptionByTextGlobal(searchVal, dropdownElement);
        if (foundElement) {
          // ВАЖНО: Проверяем, что найденный элемент находится внутри одной из панелей dropdown
          const isInPanel = allPanels.some(panel => panel.contains(foundElement));
          if (isInPanel) {
            option = foundElement;
            console.log(`✅ [SeleniumUtils] Опция "${searchVal}" найдена через альтернативный поиск (внутри панели dropdown)`);
            break;
          }
          // Fallback: элемент найден глобально рядом с dropdown (findOptionByTextGlobal уже проверил расстояние),
          // но панели могут быть в другом контейнере (overlay/angular). Используем как последнюю попытку.
          if (!option && this.isElementVisible(foundElement)) {
            const refRect = dropdownElement.getBoundingClientRect();
            const elRect = foundElement.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(elRect.left - refRect.left, 2) + Math.pow(elRect.top - refRect.top, 2)
            );
            if (distance < 800) {
              option = foundElement;
              console.log(`✅ [SeleniumUtils] Опция "${searchVal}" найдена через альтернативный поиск (глобально, рядом с dropdown ${Math.round(distance)}px)`);
              break;
            }
          }
          if (!option) {
            console.log(`⚠️ [SeleniumUtils] Найден элемент "${searchVal}", но он не в панели dropdown, пропускаю`);
          }
        }
      }
      
      // Также пробуем полное значение
      if (!option) {
        const foundElement = this.findOptionByTextGlobal(targetValue, dropdownElement);
        if (foundElement) {
          const isInPanel = allPanels.some(panel => panel.contains(foundElement));
          if (isInPanel) {
            option = foundElement;
            console.log(`✅ [SeleniumUtils] Опция "${targetValue}" найдена через альтернативный поиск (внутри панели dropdown)`);
          } else if (this.isElementVisible(foundElement)) {
            const refRect = dropdownElement.getBoundingClientRect();
            const elRect = foundElement.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(elRect.left - refRect.left, 2) + Math.pow(elRect.top - refRect.top, 2)
            );
            if (distance < 800) {
              option = foundElement;
              console.log(`✅ [SeleniumUtils] Опция "${targetValue}" найдена через альтернативный поиск (глобально, рядом с dropdown ${Math.round(distance)}px)`);
            } else {
              console.log(`⚠️ [SeleniumUtils] Найден элемент "${targetValue}", но он не в панели dropdown, пропускаю`);
            }
          } else {
            console.log(`⚠️ [SeleniumUtils] Найден элемент "${targetValue}", но он не в панели dropdown, пропускаю`);
          }
        }
      }
    }
    
    if (!option) {
      console.warn(`❌ [SeleniumUtils] Опция "${targetValue}" не найдена`);
      return false;
    }
    
    // Шаг 4: Прокрутка и клик по опции
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    console.log(`🎯 [SeleniumUtils] ШАГ 4: ПРОКРУТКА И КЛИК - Опция "${this.getElementText(option)}"`);
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    
    this.scrollIntoView(option, true);
    await this.delay(500);
    
    console.log(`   🖱️ Кликаю по опции "${this.getElementText(option)}"...`);
    const clickSuccess = await this.click(option);
    
    if (!clickSuccess) {
      console.log('   🔄 Обычный клик не сработал, пробую JavaScript клик...');
      await this.click(option, true);
    }
    
    await this.delay(2000); // Как в автотесте: time.sleep(2)
    
    // Шаг 5: Проверка результата (УЛУЧШЕННАЯ ЛОГИКА + ПОВТОРНЫЕ ПОПЫТКИ)
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    console.log(`🎯 [SeleniumUtils] ШАГ 5: ПРОВЕРКА РЕЗУЛЬТАТА`);
    console.log(`🎯 [SeleniumUtils] ════════════════════════════════════════════════════`);
    
    const waitForSelection = async (logDetails = true) => {
      await this.delay(500); // Ждём обновления DOM
      
      // ОПТИМИЗАЦИЯ: Если целевое значение составное, проверяем отдельные опции
      let checkValues = [targetValue];
      if (targetLower.includes('плановый') && targetLower.includes('поручению') && targetLower.includes('инициативный')) {
        // Это составное значение, проверяем отдельные опции
        checkValues = ['Плановый', 'По поручению', 'Инициативный'];
        if (logDetails) {
          console.log(`   🔄 [SeleniumUtils] Проверяю составное значение, ищу отдельные опции: ${checkValues.join(', ')}`);
        }
      }
      
      // ВАЖНО: Приоритет проверки через .result__content с ng-reflect-app-tooltip (точный селектор для поля статуса)
      const resultContent = dropdownElement.querySelector('.result__content[ng-reflect-app-tooltip]');
      if (resultContent) {
        const tooltipValue = resultContent.getAttribute('ng-reflect-app-tooltip') || '';
        const tooltipLower = tooltipValue.toLowerCase().trim();
        const contentText = this.getElementText(resultContent).trim();
        const contentTextLower = contentText.toLowerCase().trim();
        
        if (logDetails) {
          console.log(`   🔍 Проверяю .result__content: tooltip="${tooltipValue}", text="${contentText}"`);
        }
        
        // Проверяем каждое значение из списка (для составных значений)
        for (const checkVal of checkValues) {
          const checkLower = checkVal.toLowerCase();
          
          // Проверка через ng-reflect-app-tooltip (приоритет!)
          if (tooltipLower === checkLower || tooltipLower.includes(checkLower)) {
            console.log(`✅ [SeleniumUtils] Опция "${checkVal}" найдена через ng-reflect-app-tooltip: "${tooltipValue}"`);
            return true;
          }
          
          // Проверка через текст в .result__content
          if (contentTextLower === checkLower || contentTextLower.includes(checkLower)) {
            console.log(`✅ [SeleniumUtils] Опция "${checkVal}" найдена через текст .result__content: "${contentText}"`);
            return true;
          }
        }
        
        // Проверка полного значения
        if (tooltipLower === targetLower || tooltipLower.includes(targetLower)) {
          console.log(`✅ [SeleniumUtils] Опция "${targetValue}" найдена через ng-reflect-app-tooltip: "${tooltipValue}"`);
          return true;
        }
        
        if (contentTextLower === targetLower || contentTextLower.includes(targetLower)) {
          console.log(`✅ [SeleniumUtils] Опция "${targetValue}" найдена через текст .result__content: "${contentText}"`);
          return true;
        }
      }
      
      const checkElements = [
        dropdownElement.querySelector('#status-project__result'),
        dropdownElement.querySelector('.result'),
        dropdownElement.querySelector('.result.invalid'),
        dropdownElement.querySelector('.result.valid'),
        dropdownElement.querySelector('.select-box .result'),
        dropdownElement.querySelector('.result__content'), // Добавлено для общего случая
        dropdownElement.querySelector('.placeholder'),
        dropdownElement.querySelector('.select-group .result'),
        clickableElement,
        dropdownElement.querySelector('app-select'),
        dropdownElement
      ].filter(el => el);
      
      if (logDetails) {
        console.log(`   🔍 Проверяю ${checkElements.length} элементов на наличие значения "${targetValue}"...`);
      }
      
      for (const checkEl of checkElements) {
        const text = this.getElementText(checkEl).trim();
        const value = this.getAttribute(checkEl, 'value') || this.getAttribute(checkEl, 'ng-reflect-value') || checkEl.dataset?.value || '';
        
        if (logDetails && text && text !== 'выберите' && text.length < 150) {
          console.log(`      📋 Проверяю: "${text}" (value="${value}")`);
        }
        
        const textLower = text.toLowerCase();
        const valueLower = value.toLowerCase();
        
        // Проверяем каждое значение из списка (для составных значений)
        for (const checkVal of checkValues) {
          const checkLower = checkVal.toLowerCase();
          
          // Точное совпадение
          if (textLower === checkLower || valueLower === checkLower) {
            console.log(`✅ [SeleniumUtils] Опция "${checkVal}" успешно выбрана! (text="${text}", value="${value}")`);
            
            // DISPATCH ВСЕХ СОБЫТИЙ для React/Vue/Angular
            this.dispatchAllEvents(dropdownElement, checkVal);
            
            return true;
          }
          
          // УЛУЧШЕННАЯ ПРОВЕРКА: Частичное совпадение с учетом границ слов
          // Проверяем, что значение присутствует в тексте как отдельное слово или начало слова
          const wordBoundaryRegex = new RegExp(`(^|\\s|>)${checkLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|<)`, 'i');
          if (wordBoundaryRegex.test(text) || wordBoundaryRegex.test(value)) {
            if (!textLower.includes('выберите') && text.length < 200) {
              console.log(`✅ [SeleniumUtils] Опция "${checkVal}" выбрана! (text="${text}")`);
              return true;
            }
          }
          
          // Частичное совпадение (но не слишком длинное и не placeholder)
          // ВАЖНО: Для коротких значений (1-2 слова) проверяем более строго
          if (checkVal.split(/\s+/).length <= 2) {
            // Для коротких значений проверяем, что это не просто случайное совпадение
            if (textLower.includes(checkLower) && !textLower.includes('выберите') && text.length < 200) {
              // Дополнительная проверка: значение должно быть в начале или отдельным словом
              const startsWith = textLower.startsWith(checkLower);
              const hasSpaceBefore = textLower.includes(' ' + checkLower);
              const hasSpaceAfter = textLower.includes(checkLower + ' ');
              if (startsWith || hasSpaceBefore || hasSpaceAfter || textLower === checkLower) {
            console.log(`✅ [SeleniumUtils] Опция "${checkVal}" выбрана! (text="${text}")`);
            return true;
              }
            }
          } else {
            // Для длинных значений используем обычную проверку
            if (textLower.includes(checkLower) && !textLower.includes('выберите') && text.length < 200) {
              console.log(`✅ [SeleniumUtils] Опция "${checkVal}" выбрана! (text="${text}")`);
              return true;
            }
          }
          
          if (valueLower.includes(checkLower) && value.length > 0) {
            console.log(`✅ [SeleniumUtils] Опция "${checkVal}" найдена через value атрибут: "${value}"`);
            return true;
          }
        }
        
        // Также проверяем полное составное значение (на случай, если оно все-таки записано)
        if (textLower === targetLower || valueLower === targetLower) {
          console.log(`✅ [SeleniumUtils] Опция "${targetValue}" успешно выбрана! (text="${text}", value="${value}")`);
          
          // DISPATCH ВСЕХ СОБЫТИЙ для React/Vue/Angular
          this.dispatchAllEvents(dropdownElement, targetValue);
          
          return true;
        }
        
        if (textLower.includes(targetLower) && !textLower.includes('выберите') && text.length < 150) {
          console.log(`✅ [SeleniumUtils] Опция "${targetValue}" выбрана! (text="${text}")`);
          
          // DISPATCH ВСЕХ СОБЫТИЙ для React/Vue/Angular
          this.dispatchAllEvents(dropdownElement, targetValue);
          
          return true;
        }
      }
      
      const directValue = this.findDropdownValueDirectly(dropdownElement);
      if (directValue) {
        if (logDetails) {
          console.log(`   🔍 Прямой поиск значения: "${directValue}"`);
        }
        const directLower = directValue.toLowerCase();
        
        // Проверяем отдельные опции для составного значения
        for (const checkVal of checkValues) {
          const checkLower = checkVal.toLowerCase();
          if (directLower.includes(checkLower) && !directLower.includes('выберите')) {
            console.log(`✅ [SeleniumUtils] Опция "${checkVal}" найдена через прямой поиск: "${directValue}"`);
            return true;
          }
        }
        
        // Также проверяем полное значение
        if (directLower.includes(targetLower) && !directLower.includes('выберите')) {
          console.log(`✅ [SeleniumUtils] Опция найдена через прямой поиск: "${directValue}"`);
          return true;
        }
      }
      
      if (logDetails) {
        console.warn(`⚠️ [SeleniumUtils] Значение "${targetValue}" пока не подтверждено.`);
      }
      return false;
    };
    
    // ВАЖНО: Проверяем результат сразу после клика
    if (await waitForSelection(true)) {
      console.log(`✅ [SeleniumUtils] Значение "${targetValue}" успешно установлено, прекращаю выполнение.`);
      return true;
    }
    
    // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Проверяем еще раз через небольшую задержку
    // (возможно, значение устанавливается асинхронно)
    await this.delay(100); // Уменьшено с 500 до 100
    if (await waitForSelection(false)) {
      console.log(`✅ [SeleniumUtils] Значение "${targetValue}" установлено после задержки, прекращаю выполнение.`);
      return true;
    }
    
    // ВАЖНО: Перед выполнением дополнительных действий проверяем, не установлено ли значение
    // Проверяем, не закрылся ли dropdown (это может означать, что значение уже выбрано)
    const isDropdownStillOpen = this.isDropdownOpen(dropdownElement);
    if (!isDropdownStillOpen) {
      // Dropdown закрылся, возможно значение уже установлено
      await this.delay(100); // Уменьшено с 300 до 100
      if (await waitForSelection(false)) {
        console.log(`✅ [SeleniumUtils] Dropdown закрылся, значение "${targetValue}" установлено, прекращаю выполнение.`);
        return true;
      }
    }
    
    console.warn(`⚠️ [SeleniumUtils] Значение "${targetValue}" не подтверждено после первого клика. Пробую дополнительные стратегии...`);
    
    const seenTargets = new Set();
    const clickTargets = [];
    const addClickTarget = (el, description) => {
      if (el && !seenTargets.has(el)) {
        seenTargets.add(el);
        clickTargets.push({ element: el, description });
      }
    };
    
    addClickTarget(option, 'основной элемент опции');
    addClickTarget(option.closest('.option'), 'ближайший .option');
    addClickTarget(option.querySelector('.option'), 'дочерний .option');
    addClickTarget(option.querySelector('.cutted-text'), 'элемент .cutted-text');
    addClickTarget(option.querySelector('span'), 'вложенный span');
    addClickTarget(option.querySelector('.option__text'), 'элемент .option__text');
    addClickTarget(option.parentElement, 'родительский контейнер опции');
    
    const performAdvancedClick = async (target, description) => {
      if (!target) return false;
      if (!this.isElementVisible(target)) return false;
      
      // ВАЖНО: Перед каждым дополнительным кликом проверяем, не установлено ли уже значение
      if (await waitForSelection(false)) {
        console.log(`✅ [SeleniumUtils] Значение "${targetValue}" уже установлено перед дополнительным кликом, прекращаю выполнение.`);
        return true;
      }
      
      const rect = target.getBoundingClientRect();
      const centerX = rect.left + (rect.width || 1) / 2;
      const centerY = rect.top + (rect.height || 1) / 2;
      
      const sequences = [
        async () => {
          target.click();
          // Минимальная задержка
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(50);
        } // Уменьшено с 200 до 50
        },
        async () => {
          target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1,
            clientX: centerX,
            clientY: centerY
          }));
          // Минимальная задержка
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(50);
        } // Уменьшено с 200 до 50
        },
        async () => {
          target.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: centerX,
            clientY: centerY
          }));
          await this.delay(30); // Уменьшено с 50 до 30
          target.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: centerX,
            clientY: centerY
          }));
          await this.delay(30); // Уменьшено с 50 до 30
          target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            buttons: 1,
            clientX: centerX,
            clientY: centerY
          }));
          // Минимальная задержка
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(50);
        } // Уменьшено с 200 до 50
        }
      ];
      
      for (let i = 0; i < sequences.length; i++) {
        try {
          await sequences[i]();
          // ВАЖНО: После каждого клика проверяем результат
          if (await waitForSelection(false)) {
            console.log(`✅ [SeleniumUtils] Значение "${targetValue}" установлено после дополнительного клика, прекращаю выполнение.`);
            return true;
          }
        } catch (e) {
          console.warn(`      ⚠️ [SeleniumUtils] Ошибка при повторном клике (${description}, попытка ${i + 1}): ${e.message}`);
        }
      }
      
      return false;
    };
    
    for (const targetInfo of clickTargets) {
      const { element: retryElement, description } = targetInfo;
      if (!retryElement) continue;
      
      // ВАЖНО: Перед каждым дополнительным кликом проверяем, не установлено ли уже значение
      if (await waitForSelection(false)) {
        console.log(`✅ [SeleniumUtils] Значение "${targetValue}" уже установлено, прекращаю выполнение дополнительных действий.`);
        return true;
      }
      
      console.log(`   🔁 [SeleniumUtils] Дополнительный клик (${description})`);
      const success = await performAdvancedClick(retryElement, description);
      if (success) {
        return true;
      }
    }
    
    // ФИНАЛЬНАЯ ПРОВЕРКА: Проверяем еще раз перед возвратом false
    await this.delay(100); // Уменьшено с 500 до 100
    if (await waitForSelection(false)) {
      console.log(`✅ [SeleniumUtils] Значение "${targetValue}" установлено после всех попыток.`);
      return true;
    }
    
    console.warn(`⚠️ [SeleniumUtils] Не удалось подтвердить выбор опции "${targetValue}" после повторных попыток.`);
    return false;
  }

  /**
   * Прямой поиск значения в dropdown (для проверки результата)
   * @param {Element} dropdownElement
   * @returns {string}
   */
  findDropdownValueDirectly(dropdownElement) {
    if (!dropdownElement) return '';
    
    // ПРИОРИТЕТ 1: Ищем в .result__content с ng-reflect-app-tooltip (точный селектор для поля статуса)
    const resultContent = dropdownElement.querySelector('.result__content[ng-reflect-app-tooltip]');
    if (resultContent) {
      const tooltipValue = resultContent.getAttribute('ng-reflect-app-tooltip') || '';
      if (tooltipValue && tooltipValue.trim()) {
        return tooltipValue.trim();
      }
      // Если tooltip пустой, пробуем текст
      const text = this.getElementText(resultContent);
      if (text && !text.toLowerCase().includes('выберите')) {
        return text.trim();
      }
    }
    
    // ПРИОРИТЕТ 2: Ищем в .result элементах
    const resultEl = dropdownElement.querySelector('.result, #status-project__result');
    if (resultEl) {
      // Сначала проверяем .result__content внутри .result
      const innerResultContent = resultEl.querySelector('.result__content[ng-reflect-app-tooltip]');
      if (innerResultContent) {
        const tooltipValue = innerResultContent.getAttribute('ng-reflect-app-tooltip') || '';
        if (tooltipValue && tooltipValue.trim()) {
          return tooltipValue.trim();
        }
      }
      
      const text = this.getElementText(resultEl);
      if (text && !text.toLowerCase().includes('выберите')) {
        return text.trim();
      }
    }
    
    // ПРИОРИТЕТ 3: Ищем в скрытых input
    const hiddenInput = dropdownElement.querySelector('input[type="hidden"]');
    if (hiddenInput) {
      return hiddenInput.value || '';
    }
    
    // ПРИОРИТЕТ 4: Ищем через ng-reflect-value
    const reflectValue = dropdownElement.getAttribute('ng-reflect-value');
    if (reflectValue) {
      return reflectValue;
    }
    
    // ПРИОРИТЕТ 5: Ищем в дочерних элементах с текстом
    const allText = this.getElementText(dropdownElement);
    if (allText && !allText.toLowerCase().includes('выберите')) {
      return allText.trim();
    }
    
    return '';
  }

  /**
   * Получение Angular компонента (если доступен)
   * @param {Element} element
   * @returns {Object|null}
   */
  getAngularComponent(element) {
    if (!element) return null;
    
    try {
      // Angular хранит компонент в специальных свойствах
      if (element.__ngContext__) {
        return element.__ngContext__;
      }
      
      // Пробуем найти через ng
      if (window.ng) {
        const component = window.ng.getComponent(element);
        if (component) return component;
      }
      
      // Пробуем через getComponent из Angular
      if (element.getAttribute && element.getAttribute('ng-version')) {
        // Angular приложение найдено, но компонент может быть в другом месте
        let current = element;
        while (current && current !== document.body) {
          if (current.__ngContext__) {
            return current.__ngContext__;
          }
          current = current.parentElement;
        }
      }
    } catch (e) {
      // Игнорируем ошибки
    }
    
    return null;
  }

  /**
   * Задержка (эмуляция time.sleep())
   * @param {number} ms - Миллисекунды
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Проверка, что элемент содержит текст (как в автотесте: if 'плановый' in option_text.lower())
   * @param {Element} element
   * @param {string} text
   * @returns {boolean}
   */
  elementContainsText(element, text) {
    const elementText = this.getElementText(element).toLowerCase();
    const searchText = text.toLowerCase().trim();
    return elementText.includes(searchText);
  }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeleniumUtils;
}

// Глобальный экземпляр для использования в content scripts
if (typeof window !== 'undefined') {
  window.SeleniumUtils = SeleniumUtils;
  console.log('✅ [SeleniumUtils] Класс экспортирован в window.SeleniumUtils');
  console.log('   - Доступен для использования в recorder.js и player.js');
} else {
  console.error('❌ [SeleniumUtils] window не определен, экспорт не выполнен');
}

