// Улучшенный модуль записи действий

class ImprovedActionRecorder {
  constructor() {
    this.isRecording = false;
    this.currentTestId = null;
    this.selectorEngine = window.selectorEngine;
    
    // Инициализация SelectorOptimizer
    this.optimizer = null;
    this._initOptimizer();
    
    // Инициализация SeleniumUtils (логика из автотеста)
    if (window.SeleniumUtils) {
      this.seleniumUtils = new window.SeleniumUtils();
      console.log('✅ [Recorder] SeleniumUtils инициализирован (логика из автотеста)');
    } else {
      this.seleniumUtils = null;
      console.warn('⚠️ [Recorder] SeleniumUtils недоступен! Проверьте загрузку selenium-utils.js');
    }
    
    this.lastDropdownTrigger = null;
    this.lastDropdownTriggerInfo = null;
    this.dropdownObserver = null;
    
    // Контроль обязательного заполнения dropdown
    this.pendingDropdownFill = null;
    this.dropdownFillTimeout = null;
    this.dropdownPollingInterval = null; // Интервал для периодической проверки значения
    this.dropdownFillDelay = 2000; // мс ожидания подтверждения
    
    // Отслеживание промежуточных input событий (сохраняем только последнее значение)
    this.pendingInput = null; // { element, selector, elementInfo, value, timeout }
    this.pendingInputTimeout = null;
    this.inputDebounceDelay = 1000; // мс задержки перед автосохранением
    
    // Event throttling для кликов
    this.lastClickTime = 0;
    this.clickThrottleMs = 200;
    
    // #21: Подавление кликов при dblclick
    // Механизм: при клике запускаем таймер, если dblclick приходит - отменяем клик
    this.pendingClickTimeout = null;
    this.pendingClickAction = null;
    this.dblclickDetectionDelay = 350; // мс ожидания dblclick
    
    // Контекстное меню для переменных
    this.variableContextMenu = null;
    this.selectedTextForVariable = null;
    this.variableSlots = ['#1', '#2', '#3', '#4', '#5']; // Слоты переменных
    
    // Режим записи с выбором селектора (Inline Selector Picker)
    this.selectorPickerMode = false; // По умолчанию авто
    this.pendingPicker = null;
    this.pickerJustClosed = false; // Флаг для предотвращения повторного открытия сразу после закрытия
    
    // Система запоминания выбора селекторов для каждого элемента
    this.selectorChoices = new Map(); // Кэш выбранных селекторов
    this.selectorChoiceKey = null; // Текущий ключ для генерации
    
    // Загружаем настройки режима записи
    this._loadRecordingModeSettings();
    
    // Загружаем сохраненные выборы селекторов
    this._loadSelectorChoices();
    
    this.init();
  }

  /**
   * Загрузка настроек режима записи
   */
  async _loadRecordingModeSettings() {
    try {
      const result = await chrome.storage.local.get('pluginSettings');
      const settings = result.pluginSettings || {};
      
      // Режим записи: 'auto' | 'picker' | 'inspector'
      const recordingMode = settings.recordingMode || 'auto';
      this.selectorPickerMode = recordingMode === 'picker';
      
      console.log('✅ [Recorder] Режим записи:', recordingMode, 'picker mode:', this.selectorPickerMode);
    } catch (error) {
      console.warn('⚠️ [Recorder] Ошибка загрузки настроек режима записи:', error);
    }
  }

  /**
   * Генерирует уникальный ключ для элемента (для запоминания выбора селектора)
   */
  _generateElementSelectorKey(element) {
    // Для dropdown используем родительский dropdown элемент как ключ
    if (this.isDropdownElement(element)) {
      // Находим родительский dropdown элемент
      const parentDropdownElement = element.closest('app-select, ng-select, mat-select, [role="combobox"], select') || 
                                    element.closest('[class*="select"], [class*="dropdown"]');
      
      if (parentDropdownElement && parentDropdownElement !== element) {
        // Генерируем селектор для родительского dropdown элемента
        const parentSelectors = this.selectorEngine.generateAllSelectors(parentDropdownElement);
        if (parentSelectors.length > 0) {
          const parentBestSelector = this.selectorEngine.selectBestSelector(parentSelectors);
          return `dropdown:${parentBestSelector.selector}`;
        }
      }
    }
    
    // Для обычных элементов используем лучший селектор как ключ
    const allSelectors = this.selectorEngine.generateAllSelectors(element);
    if (allSelectors.length > 0) {
      const bestSelector = this.selectorEngine.selectBestSelector(allSelectors);
      return `element:${bestSelector.selector}`;
    }
    
    // Fallback: используем комбинацию тега, id и класса
    const tag = element.tagName?.toLowerCase() || '';
    const id = element.id || '';
    const className = element.className || '';
    return `fallback:${tag}:${id}:${className}`;
  }

  /**
   * Загружает сохраненные выборы селекторов
   */
  async _loadSelectorChoices() {
    try {
      const result = await chrome.storage.local.get('selectorChoices');
      if (result.selectorChoices) {
        this.selectorChoices = new Map(Object.entries(result.selectorChoices));
        console.log('✅ [Recorder] Загружено выборов селекторов:', this.selectorChoices.size);
      }
    } catch (error) {
      console.warn('⚠️ [Recorder] Ошибка загрузки выборов селекторов:', error);
    }
  }

  /**
   * Сохраняет выбор селектора для элемента
   */
  async _saveSelectorChoice(elementKey, selector) {
    try {
      this.selectorChoices.set(elementKey, {
        selector: selector.selector,
        score: selector.score,
        timestamp: Date.now()
      });
      
      // Сохраняем в storage
      const choicesObj = Object.fromEntries(this.selectorChoices);
      await chrome.storage.local.set({ selectorChoices: choicesObj });
      
      console.log('💾 [Recorder] Сохранен выбор селектора для:', elementKey);
    } catch (error) {
      console.warn('⚠️ [Recorder] Ошибка сохранения выбора селектора:', error);
    }
  }

  /**
   * Получает сохраненный выбор селектора для элемента
   */
  _getSavedSelectorChoice(elementKey) {
    return this.selectorChoices.get(elementKey);
  }

  /**
   * Инициализация оптимизатора
   */
  _initOptimizer() {
    setTimeout(() => {
      if (window.selectorOptimizer) {
        this.optimizer = window.selectorOptimizer;
        // Синхронизируем настройки throttle
        if (this.optimizer.settings) {
          this.clickThrottleMs = this.optimizer.settings.clickThrottleMs || 200;
        }
        console.log('✅ [Recorder] SelectorOptimizer подключен');
      }
    }, 150);
  }

  init() {
    console.log('🔧 [Recorder] Инициализация recorder...');
    
    // Слушаем сообщения от background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 [Recorder] Получено сообщение:', message.type, message);
      
      if (message.type === 'RECORDING_STARTED') {
        console.log('🎬 [Recorder] Получен сигнал RECORDING_STARTED, testId:', message.testId);
        this.startRecording(message.testId)
          .then(() => {
            console.log('✅ [Recorder] startRecording вызван успешно');
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error('❌ [Recorder] Ошибка в startRecording:', error);
            sendResponse({ success: false, error: error?.message || String(error) });
          });
        return true;
      } else if (message.type === 'RECORDING_STOPPED' || message.type === 'FORCE_STOP') {
        // ВАЖНО: Убеждаемся, что stopRecording() всегда возвращает Promise
        const stopPromise = this.stopRecording();
        if (stopPromise && typeof stopPromise.then === 'function') {
          stopPromise.then(() => {
          sendResponse({ success: true });
          }).catch((error) => {
            console.error('❌ Ошибка при остановке записи:', error);
          sendResponse({ success: true }); // Отправляем ответ даже при ошибке
        });
        } else {
          // Если stopRecording() не вернул Promise, отправляем ответ сразу
          console.warn('⚠️ stopRecording() не вернул Promise, отправляю ответ немедленно');
          sendResponse({ success: true });
        }
        return true; // Асинхронный ответ
      } else if (message.type === 'EXPORT_TEST_TO_EXCEL') {
        // Экспорт теста в Excel по запросу из background
        this.handleExcelExportRequest(message.test, message.trigger, message.runHistory).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('❌ [ExcelExport] Ошибка при экспорте:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // Асинхронный ответ
      }
      return true;
    });

    
    // Проверяем состояние при загрузке
    this.checkState();
  }

  /**
   * Улучшенная проверка dropdown элементов
   * Теперь более точно определяет кастомные dropdown
   */
  isDropdownElement(element, action) {
    if (!element && !action) return false;
    
    // Получаем элемент из разных источников
    const el = element || (action ? action.element : null);
    const selectorValue = action ? (action.selector?.selector || action.selector?.value) : '';
    const selector = typeof selectorValue === 'string' ? selectorValue : '';
    
    // 1. Проверка по тегу
    const tagSource = el?.tag || el?.tagName || '';
    const tagName = typeof tagSource === 'string' ? tagSource.toLowerCase() : '';
    if (tagName === 'select') return true;
    
    // 1.5. HTML5 DATALIST SUPPORT
    // Проверяем <input list="datalist-id">
    if (tagName === 'input') {
      const listAttr = el?.attributes?.list || el?.getAttribute?.('list');
      const listId = typeof listAttr === 'string' ? listAttr : (listAttr?.value || listAttr?.baseVal || '');
      
      if (listId) {
        // Проверяем что datalist существует
        const datalist = document.getElementById(listId);
        if (datalist && datalist.tagName.toLowerCase() === 'datalist') {
          console.log('✅ [Dropdown] Обнаружен HTML5 datalist:', listId);
          return true;
        }
      }
    }
    
    // 1.6. MULTISELECT DETECTION
    // Сохраняем информацию о multiselect для последующего использования
    if (tagName === 'select') {
      const isMultiple = el?.multiple || el?.attributes?.multiple || 
                        el?.getAttribute?.('multiple') !== null;
      if (isMultiple) {
        console.log('✅ [Dropdown] Обнаружен multiselect <select>');
        // Сохраняем флаг multiselect в элементе для использования в других функциях
        if (el && typeof el === 'object') {
          el._isMultiselect = true;
        }
      }
    }
    
    // 2. Проверка кастомных dropdown компонентов
    const customDropdownTags = [
      'app-select',
      'ng-select', 
      'mat-select',
      'p-dropdown',
      'v-select',
      'el-select',
      // Vuetify использует стандартные div с классами, но иногда может быть v-select тэг
      'v-autocomplete',
      'v-combobox'
    ];
    
    if (customDropdownTags.includes(tagName)) {
      console.log('✅ [Dropdown] Обнаружен кастомный dropdown по тегу:', tagName);
      return true;
    }
    
    // 3. Проверка по атрибутам роли
    const roleValue = el?.attributes?.role || el?.getAttribute?.('role');
    const role = typeof roleValue === 'string' ? roleValue : (roleValue?.value || roleValue?.baseVal || '');
    const ariaHaspopupValue = el?.attributes?.['aria-haspopup'] || el?.getAttribute?.('aria-haspopup');
    const ariaHaspopup = typeof ariaHaspopupValue === 'string'
      ? ariaHaspopupValue
      : (ariaHaspopupValue?.value || ariaHaspopupValue?.baseVal || '');
    
    if (role === 'combobox' || role === 'listbox' || ariaHaspopup === 'listbox') {
      console.log('✅ [Dropdown] Обнаружен dropdown по ARIA атрибутам');
      return true;
    }
    
    // 4. Проверка по классам
    const className = this.normalizeClassName(el?.attributes?.class || el?.className || '');
    const dropdownClasses = [
      'dropdown',
      'select-box',
      'select-container',
      'combobox',
      'autocomplete',
      'mat-select',
      'react-select',
      'vue-select',
      'ng-select',
      // ===== ТОП-5 БИБЛИОТЕК =====
      // Ant Design
      'ant-select',
      'ant-select-selector',
      // Select2
      'select2-container',
      'select2-selection',
      // Choices.js
      'choices',
      'choices__inner',
      // Vuetify
      'v-select',
      'v-input',
      'v-autocomplete',
      'v-combobox',
      // Semantic UI
      'ui dropdown',
      'ui selection dropdown'
    ];
    
    const classNameLower = className.toLowerCase();
    const hasDropdownClass = dropdownClasses.some(cls =>
      classNameLower.includes(cls.toLowerCase())
    );
    
    if (hasDropdownClass) {
      console.log('✅ [Dropdown] Обнаружен dropdown по классу:', className);
      return true;
    }
    
    // 5. Проверка по селектору
    if (selector) {
      const selectorLower = selector.toLowerCase();
      const dropdownSelectors = [
        'app-select',
        'select-box',
        '[role="combobox"]',
        '[role="listbox"]',
        '.mat-select',
        '.react-select',
        'ng-select',
        'p-dropdown',
        // ===== ТОП-5 БИБЛИОТЕК =====
        // Ant Design
        '.ant-select',
        'ant-select',
        // Select2
        '.select2-container',
        'select2-container',
        // Choices.js
        '.choices',
        // Vuetify
        '.v-select',
        'v-select',
        'v-autocomplete',
        'v-combobox',
        // Semantic UI
        '.ui.dropdown',
        'ui dropdown'
      ];
      
      const matchesDropdown = dropdownSelectors.some(ds => 
        selectorLower.includes(ds.toLowerCase())
      );
      
      if (matchesDropdown) {
        console.log('✅ [Dropdown] Обнаружен dropdown по селектору:', selector);
        return true;
      }
    }
    
    // 6. Проверка контекста - есть ли дочерние элементы option/item
    if (el?.querySelector || el?.querySelectorAll) {
      const hasOptions = el.querySelector('option, [role="option"], .option, .item');
      if (hasOptions) {
        console.log('✅ [Dropdown] Обнаружен dropdown по наличию опций');
        return true;
      }
    }
    
    // 7. Проверка родительского контейнера
    if (el?.closest) {
      const dropdownParent = el.closest('app-select, ng-select, mat-select, [role="combobox"], .select-container');
      if (dropdownParent) {
        console.log('✅ [Dropdown] Элемент находится внутри dropdown контейнера');
        return true;
      }
    }
    
    return false;
  }

  /**
   * Сохранение действия с интеллектуальным анализом
   */
  async saveAction(action) {
    console.log('💾 [Recorder] saveAction вызван:', {
      type: action.type,
      isRecording: this.isRecording,
      currentTestId: this.currentTestId,
      hasSelector: !!action.selector,
      hasValue: !!action.value
    });
    
    if (!this.isRecording) {
      console.warn('⚠️ [Recorder] saveAction: запись не активна, действие не будет сохранено');
      return;
    }
    
    // ВАЖНО: Проверяем валидность extension context перед сохранением
    if (!chrome.runtime?.id) {
      console.warn('⚠️ [Recorder] saveAction: Extension context недействителен, действие не будет сохранено');
      // Пытаемся восстановить через небольшую задержку
      setTimeout(() => {
        if (chrome.runtime?.id && this.isRecording) {
          console.log('✅ Extension context восстановлен, можно продолжать запись');
        } else if (this.isRecording) {
          console.error('❌ Extension context не восстановлен, останавливаю запись');
          this.stopRecording();
        }
      }, 1000);
      return;
    }
    
    try {
      console.log('💾 Сохранение действия:', action.type);

      // === ВАЛИДАЦИЯ СЕЛЕКТОРА (через SelectorOptimizer) ===
      if (this.optimizer?.settings?.validateBeforeSave && action.selector) {
        const selectorStr = action.selector.selector || action.selector.value;
        if (selectorStr) {
          const validation = this.optimizer.validateSelector(selectorStr);
          if (validation.issues.length > 0) {
            console.log('⚠️ [Validator] Проблемы с селектором:');
            validation.issues.forEach(issue => {
              console.log(`   ${issue.type === 'error' ? '❌' : '⚠️'} ${issue.message}`);
            });
            
            // Добавляем информацию о валидации к действию
            action.validationIssues = validation.issues;
            action.selectorValidated = true;
          }
        }
      }

      // Отправляем действие в background для сохранения
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_ACTION',
        action: action
      });
      
      if (response && response.success) {
        console.log('✅ Действие сохранено:', action.type);
      } else {
        console.warn('⚠️ Действие не было сохранено:', response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ Ошибка при сохранении действия:', error);
      
      // Обрабатываем ошибку "Extension context invalidated"
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('⚠️ Extension context инвалидирован, пробуем переподключиться...');
        await this.handleContextInvalidated(action);
      }
    }
  }

  queueDropdownFillVerification(element, action) {
    try {
      if (!element || !action) return;
      
      const snapshot = this.captureDropdownSnapshot(element, action);
      const initialValue = this.getDropdownSnapshotValue(snapshot);
      
      this.cancelDropdownFillVerification();
      
      this.pendingDropdownFill = {
        actionMeta: action,
        initialSnapshot: snapshot,
        initialValue: initialValue,
        createdAt: Date.now(),
        checkCount: 0,
        maxChecks: 20 // Максимум 20 проверок (10 секунд при интервале 500мс)
      };
      
      // Первая проверка через dropdownFillDelay
      this.dropdownFillTimeout = setTimeout(() => {
        this.verifyDropdownFillResult().catch(err => {
          console.error('❌ [Dropdown] Ошибка проверки заполнения:', err);
        });
      }, this.dropdownFillDelay);
      
      // Начинаем периодическую проверку значения
      this.startDropdownValuePolling(element, action);
      
      console.log('⏳ [Dropdown] Ожидаю подтверждения заполнения dropdown...');
    } catch (error) {
      console.warn('⚠️ [Dropdown] Ошибка подготовки проверки заполнения:', error);
    }
  }
  
  /**
   * Периодическая проверка значения dropdown (polling)
   * Использует SeleniumUtils для улучшенного поиска (логика из автотеста)
   */
  startDropdownValuePolling(element, action) {
    if (this.dropdownPollingInterval) {
      clearInterval(this.dropdownPollingInterval);
    }
    
    let checkCount = 0;
    const maxChecks = 40; // 40 проверок * 500мс = 20 секунд (увеличено для надежности)
    const checkInterval = 500; // Проверяем каждые 500мс
    
    const parentDropdown = element.closest('app-select, ng-select, mat-select') || element;
    const initialSnapshot = this.captureDropdownSnapshot(element, action);
    const initialValue = this.getDropdownSnapshotValue(initialSnapshot) || '';
    
    console.log(`🔄 [Dropdown] Запускаю polling для обнаружения выбранного значения (максимум ${maxChecks} проверок)`);
    console.log(`   📋 Начальное значение: "${initialValue}"`);
    
    // ПРИОРИТЕТ: Если есть SeleniumUtils, используем его для поиска опций в панелях
    if (this.seleniumUtils) {
      console.log(`   🤖 [SeleniumUtils] Использую SeleniumUtils для поиска изменений (логика из автотеста)`);
    }
    
    this.dropdownPollingInterval = setInterval(() => {
      if (!this.pendingDropdownFill) {
        clearInterval(this.dropdownPollingInterval);
        this.dropdownPollingInterval = null;
        return;
      }
      
      checkCount++;
      
      // ПРИОРИТЕТ: Используем SeleniumUtils для улучшенного поиска выбранного значения
      let currentValue = null;
      
      // Всегда используем SeleniumUtils для поиска значения (как в автотесте)
      if (this.seleniumUtils) {
        try {
          const parentDropdown = element.closest('app-select, ng-select, mat-select') || element;
          
          // Метод 1: Получаем значение через findDropdownValueDirectly
          const selectedValue = this.findDropdownValueDirectly(parentDropdown);
          if (selectedValue) {
            currentValue = selectedValue;
            if (checkCount % 5 === 0) {
              console.log(`   🔍 [SeleniumUtils] Polling проверка ${checkCount}: найдено значение="${currentValue}"`);
            }
          }
          
          // Метод 2: Если не нашли, ищем через панели - проверяем, какая опция выбрана
          if (!currentValue || currentValue.toLowerCase().includes('выберите')) {
            const panels = this.seleniumUtils.findDropdownPanels(parentDropdown);
            for (const panel of panels) {
              // Ищем опции, которые могут быть выбраны (имеют класс active или selected)
              const activeOptions = Array.from(panel.querySelectorAll('[class*="active"], [class*="selected"], [aria-selected="true"]'));
              for (const opt of activeOptions) {
                const optText = this.seleniumUtils.getElementText(opt);
                if (optText && !this.seleniumUtils.placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()))) {
                  currentValue = optText;
                  console.log(`   ✅ [SeleniumUtils] Найдена активная опция через панель: "${currentValue}"`);
                  break;
                }
              }
              if (currentValue) break;
            }
          }
        } catch (e) {
          console.warn(`   ⚠️ [SeleniumUtils] Ошибка при поиске значения: ${e.message}`);
        }
      }
      
      // Если SeleniumUtils не нашел, используем обычный метод
      if (!currentValue || currentValue.toLowerCase().includes('выберите')) {
        const currentSnapshot = this.captureDropdownSnapshot(element, action);
        if (currentSnapshot) {
          currentValue = this.getDropdownSnapshotValue(currentSnapshot);
        }
      }
      
      const initialValue = this.pendingDropdownFill.initialValue || '';
      
      // Логируем каждые 5 проверок или если значение изменилось
      if (checkCount % 5 === 0 || (currentValue && currentValue !== initialValue)) {
        console.log(`   🔍 Polling проверка ${checkCount}/${maxChecks}: текущее="${currentValue}", начальное="${initialValue}"`);
        
        // Если используется SeleniumUtils, показываем дополнительную информацию
        if (this.seleniumUtils && checkCount % 10 === 0) {
          const panels = this.seleniumUtils.findDropdownPanels(parentDropdown);
          console.log(`   📋 [SeleniumUtils] Найдено ${panels.length} панелей (связанных с dropdown), проверяю опции...`);
          for (const panel of panels) {
            const options = this.seleniumUtils.findOptionsInPanel(panel);
            if (options.length > 0) {
              const optionTexts = options.slice(0, 3).map(opt => this.seleniumUtils.getElementText(opt));
              console.log(`      - Панель: ${options.length} опций, первые: ${optionTexts.join(', ')}`);
            }
          }
        }
      }
      
      // Улучшенная проверка изменения значения
      const valueChanged = currentValue && 
          currentValue.trim().length > 0 && 
          currentValue !== initialValue && 
          currentValue.toLowerCase() !== 'выберите' &&
          currentValue.toLowerCase() !== 'select' &&
          currentValue.toLowerCase() !== 'choose' &&
          // Проверяем, что новое значение не является частью старого (и наоборот)
          !(initialValue && initialValue.toLowerCase().includes(currentValue.toLowerCase()) && initialValue.length > currentValue.length) &&
          !(currentValue.toLowerCase().includes(initialValue.toLowerCase()) && currentValue.length > initialValue.length && initialValue.length > 0);
      
      if (valueChanged) {
        console.log(`✅ [Dropdown] ════════════════════════════════════════════════════`);
        console.log(`✅ [Dropdown] Значение обнаружено через polling: "${currentValue}" (проверка ${checkCount})`);
        console.log(`✅ [Dropdown] Начальное значение было: "${initialValue}"`);
        console.log(`✅ [Dropdown] ════════════════════════════════════════════════════`);
        
        // Отменяем проверку
        this.cancelDropdownFillVerification();
        
        // Находим dropdown элемент для заполнения
        const dropdownElement = this.findElementForAction(action) || element;
        
        if (dropdownElement) {
          // ВАЖНО: Обертываем асинхронный код в отдельную функцию, так как setInterval callback не может быть async
          (async () => {
            try {
              // ВАЖНО: Сначала заполняем dropdown, затем записываем действие
              // Это гарантирует, что значение визуально отображается перед записью
              let filled = false;
              
              // Используем SeleniumUtils для правильного заполнения dropdown (логика из автотеста)
              if (this.seleniumUtils && this.seleniumUtils.selectDropdownOption) {
                console.log(`📝 [Dropdown] Использую SeleniumUtils для заполнения dropdown значением: "${currentValue}"`);
                try {
                  // Проверяем, открыт ли dropdown - если нет, открываем
                  const isOpen = this.seleniumUtils.isDropdownOpen ? 
                                this.seleniumUtils.isDropdownOpen(dropdownElement) : false;
                  
                  if (!isOpen) {
                    // Если dropdown закрыт, открываем его
                    const selectBox = dropdownElement.querySelector('.select-box, .result, input, [role="combobox"]');
                    if (selectBox) {
                      selectBox.click();
                      await new Promise(resolve => setTimeout(resolve, 200));
                    }
                  }
                  
                  filled = await this.seleniumUtils.selectDropdownOption(dropdownElement, currentValue);
                  if (filled) {
                    console.log(`✅ [Dropdown] Поле успешно заполнено через SeleniumUtils`);
                  } else {
                    console.log(`⚠️ [Dropdown] SeleniumUtils не смог заполнить поле, пробую альтернативный способ`);
                    // Пробуем альтернативный способ
                    filled = await this.fillDropdownFieldManually(dropdownElement, currentValue);
                  }
                } catch (error) {
                  console.warn(`⚠️ [Dropdown] Ошибка при заполнении через SeleniumUtils:`, error);
                  // Пробуем альтернативный способ
                  filled = await this.fillDropdownFieldManually(dropdownElement, currentValue);
                }
              } else {
                // Альтернативный способ заполнения
                filled = await this.fillDropdownFieldManually(dropdownElement, currentValue);
              }
              
              // После успешного заполнения записываем действие
              // Это важно сделать после заполнения, чтобы значение было визуально отображено
              if (filled) {
                console.log(`📝 [Dropdown] Записываю действие после успешного заполнения`);
                await this.recordDropdownOptionSelection(dropdownElement, currentValue, null);
              } else {
                console.warn(`⚠️ [Dropdown] Не удалось заполнить dropdown, но все равно записываю действие`);
                // Записываем действие даже если заполнение не удалось, чтобы не потерять выбор пользователя
                await this.recordDropdownOptionSelection(dropdownElement, currentValue, null);
              }
              
              // Дополнительная проверка: убеждаемся, что значение записалось
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // Проверяем значение в поле несколькими способами
              const snapshot = this.captureDropdownSnapshot(dropdownElement, null);
              const finalValue = this.getDropdownSnapshotValue(snapshot);
              
              // Также проверяем напрямую через поле ввода
              const inputField = dropdownElement.querySelector('input, .select-box, .result, [role="combobox"]') ||
                                dropdownElement.querySelector('[class*="value"], [class*="text"], [class*="selected"]');
              const directValue = inputField ? (inputField.value || inputField.textContent || inputField.innerText || '').trim() : '';
              
              const valueMatches = (finalValue && finalValue.trim() === currentValue.trim()) || 
                                  (directValue && directValue === currentValue.trim());
              
              if (valueMatches) {
                console.log(`✅ [Dropdown] Значение подтверждено в поле: "${finalValue || directValue}"`);
              } else {
                console.warn(`⚠️ [Dropdown] Значение не подтверждено. Ожидалось: "${currentValue}", получено: "${finalValue || directValue}"`);
                // Пробуем еще раз заполнить вручную с более агрессивным подходом
                console.log(`🔄 [Dropdown] Повторная попытка заполнения поля...`);
                await this.fillDropdownFieldManually(dropdownElement, currentValue);
                
                // Еще одна проверка после повторного заполнения
                await new Promise(resolve => setTimeout(resolve, 200));
                const retrySnapshot = this.captureDropdownSnapshot(dropdownElement, null);
                const retryValue = this.getDropdownSnapshotValue(retrySnapshot);
                if (retryValue && retryValue.trim() === currentValue.trim()) {
                  console.log(`✅ [Dropdown] Значение подтверждено после повторного заполнения: "${retryValue}"`);
                } else {
                  console.warn(`⚠️ [Dropdown] Значение все еще не подтверждено после повторного заполнения`);
                }
              }
              
              // Закрываем dropdown после обнаружения значения (с задержкой, чтобы значение успело записаться)
              // ВАЖНО: В режиме выбора селектора не закрываем dropdown автоматически, чтобы пользователь мог выбрать селектор
              if (!this.selectorPickerMode) {
                setTimeout(() => {
                  this.closeDropdownAfterSelection(element);
                }, 100);
              } else {
                console.log('ℹ️ [Dropdown] Режим выбора селектора активен, не закрываю dropdown автоматически');
              }
            } catch (error) {
              console.error(`❌ [Dropdown] Ошибка при обработке изменения значения:`, error);
            }
          })();
        } else {
          // Fallback: записываем действие напрямую, если не нашли dropdown элемент
          const fillAction = {
            type: 'input',
            selector: action.selector,
            element: action.element,
            value: currentValue,
            displayValue: currentValue,
            dropdownAutoFilled: true,
            timestamp: Date.now(),
            url: window.location.href
          };
          
          this.saveAction(fillAction).catch(err => {
            console.error('❌ [Dropdown] Ошибка сохранения действия:', err);
          });
        }
        
        // Закрываем dropdown после обнаружения значения (с небольшой задержкой, чтобы значение успело записаться)
        setTimeout(() => {
          this.closeDropdownAfterSelection(element);
        }, 100);
        
        return;
      }
      
      // Если превышен лимит проверок
      if (checkCount >= maxChecks) {
        console.warn(`⚠️ [Dropdown] Превышен лимит проверок (${maxChecks}), прекращаю polling`);
        clearInterval(this.dropdownPollingInterval);
        this.dropdownPollingInterval = null;
        // Но не отменяем pendingDropdownFill, чтобы verifyDropdownFillResult мог проверить еще раз
      }
    }, checkInterval);
  }

  /**
   * Заполняет поле dropdown вручную (альтернативный способ)
   */
  async fillDropdownFieldManually(dropdownElement, value) {
    try {
      console.log(`📝 [Dropdown] Заполняю поле вручную значением: "${value}"`);
      
      // Ищем поле ввода внутри dropdown
      const inputField = dropdownElement.querySelector('input, .select-box, .result, [role="combobox"]') ||
                        dropdownElement.querySelector('[class*="value"], [class*="text"], [class*="selected"]');
      
      if (!inputField) {
        console.warn(`⚠️ [Dropdown] Поле ввода не найдено внутри dropdown`);
        return false;
      }
      
      // Проверяем текущее значение поля
      const currentFieldValue = inputField.value || inputField.textContent || inputField.innerText || '';
      
      // Если поле уже заполнено правильным значением, не заполняем повторно
      if (currentFieldValue.trim() === value.trim()) {
        console.log(`✅ [Dropdown] Поле уже заполнено правильным значением`);
        return true;
      }
      
      console.log(`📝 [Dropdown] Текущее значение поля: "${currentFieldValue}", устанавливаю: "${value}"`);
      
      // Пробуем разные способы заполнения
      if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
        // Для input и textarea
        inputField.value = value;
        
        // Триггерим события для Angular/React
        inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        
        // Также триггерим через InputEvent для более точной эмуляции
        inputField.dispatchEvent(new InputEvent('input', { 
          bubbles: true, 
          cancelable: true,
          data: value,
          inputType: 'insertText'
        }));
      } else {
        // Для div и других элементов
        inputField.textContent = value;
        inputField.innerText = value;
        
        // Устанавливаем атрибут value, если есть
        if (inputField.hasAttribute('value')) {
          inputField.setAttribute('value', value);
        }
        
        // Также пробуем установить через dataset
        if (inputField.dataset) {
          inputField.dataset.value = value;
        }
        
        // Триггерим события
        inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }
      
      // Дополнительно: триггерим события на родительском dropdown элементе
      dropdownElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      
      // Также пробуем установить значение через Angular/React модели
      // Для Angular: ngModel, formControl
      if (inputField.ngModel) {
        inputField.ngModel.$setViewValue(value);
        inputField.ngModel.$render();
      }
      
      // Для React: если есть onChange handler
      if (inputField._valueTracker) {
        inputField._valueTracker.setValue(value);
      }
      
      // Проверяем, что значение установилось
      await new Promise(resolve => setTimeout(resolve, 100));
      const newValue = inputField.value || inputField.textContent || inputField.innerText || '';
      if (newValue.trim() === value.trim()) {
        console.log(`✅ [Dropdown] Поле успешно заполнено значением: "${value}"`);
        return true;
      } else {
        console.warn(`⚠️ [Dropdown] Значение не установилось. Ожидалось: "${value}", получено: "${newValue}"`);
        
        // Последняя попытка: пробуем установить через setProperty для Angular
        try {
          if (inputField.setProperty) {
            inputField.setProperty('value', value);
          }
          // Также пробуем через Object.defineProperty
          Object.defineProperty(inputField, 'value', {
            value: value,
            writable: true,
            configurable: true
          });
          
          // Триггерим события еще раз
          inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          inputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          
          await new Promise(resolve => setTimeout(resolve, 100));
          const finalValue = inputField.value || inputField.textContent || inputField.innerText || '';
          if (finalValue.trim() === value.trim()) {
            console.log(`✅ [Dropdown] Поле заполнено после последней попытки: "${value}"`);
            return true;
          }
        } catch (e) {
          console.warn(`⚠️ [Dropdown] Ошибка при последней попытке заполнения:`, e);
        }
        
        return false;
      }
    } catch (error) {
      console.error(`❌ [Dropdown] Ошибка при заполнении поля вручную:`, error);
      return false;
    }
  }

  /**
   * Закрывает dropdown после выбора значения
   */
  closeDropdownAfterSelection(element) {
    try {
      if (!element) return;
      
      console.log('🔒 [Dropdown] Закрываю dropdown после выбора значения');
      
      // Находим родительский dropdown элемент
      let dropdownElement = element.closest('app-select, ng-select, mat-select, [role="combobox"], .select-container') ||
                            element.closest('[class*="select"], [class*="dropdown"]');
      
      // Если не нашли через closest, ищем по селектору из action
      if (!dropdownElement && this.pendingDropdownFill && this.pendingDropdownFill.actionMeta) {
        const actionMeta = this.pendingDropdownFill.actionMeta;
        try {
          const selector = actionMeta.selector?.selector || actionMeta.selector;
          if (selector) {
            dropdownElement = document.querySelector(selector);
          }
        } catch (e) {
          console.warn('⚠️ [Dropdown] Ошибка поиска dropdown по селектору:', e);
        }
      }
      
      if (!dropdownElement) {
        console.log('⚠️ [Dropdown] Не найден родительский dropdown для закрытия, пробую глобальные методы');
      }
      
      // Способ 1: Кликнуть вне dropdown (на backdrop или на страницу)
      // Ищем backdrop или overlay
      const backdrop = document.querySelector('.cdk-overlay-backdrop, .overlay-backdrop, [class*="backdrop"], [class*="overlay"]');
      if (backdrop && backdrop.offsetParent !== null) {
        console.log('🔒 [Dropdown] Кликаю по backdrop для закрытия');
        backdrop.click();
        return;
      }
      
      // Способ 2: Отправить Escape событие на dropdown и document
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true
      });
      
      if (dropdownElement) {
        dropdownElement.dispatchEvent(escapeEvent);
      }
      
      // Также отправляем на document для глобального закрытия
      document.dispatchEvent(escapeEvent);
      
      // Способ 3: Кликнуть на сам dropdown элемент (для toggle dropdown)
      if (dropdownElement) {
        setTimeout(() => {
          const selectBox = dropdownElement.querySelector('.select-box, .result, input, [role="combobox"]');
          if (selectBox) {
            const isOpen = dropdownElement.classList.contains('open') || 
                          dropdownElement.getAttribute('aria-expanded') === 'true' ||
                          selectBox.classList.contains('open');
            if (isOpen) {
              console.log('🔒 [Dropdown] Кликаю по select-box для закрытия');
              selectBox.click();
            }
          }
        }, 150);
      }
      
      // Способ 4: Кликнуть вне dropdown на страницу (если dropdown все еще открыт)
      setTimeout(() => {
        // Проверяем, открыт ли еще dropdown
        const stillOpen = dropdownElement && (
          dropdownElement.classList.contains('open') || 
          dropdownElement.getAttribute('aria-expanded') === 'true' ||
          document.querySelector('.cdk-overlay-backdrop, .overlay-backdrop')
        );
        
        if (stillOpen) {
          console.log('🔒 [Dropdown] Кликаю по body для закрытия');
          // Кликаем в верхний левый угол страницы (обычно вне dropdown)
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: 10,
            clientY: 10
          });
          document.body.dispatchEvent(clickEvent);
        }
      }, 300);
      
    } catch (error) {
      console.warn('⚠️ [Dropdown] Ошибка при закрытии dropdown:', error);
    }
  }

  resolveDropdownFill(element, value) {
    if (!this.pendingDropdownFill) return false;
    
    // Проверяем, что значение валидное
    if (!value || value.trim().length === 0) {
      return false;
    }
    
    // Игнорируем плейсхолдеры
    const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
    if (placeholderTexts.some(ph => value.toLowerCase().includes(ph.toLowerCase()))) {
      return false;
    }
    
    const { initialSnapshot, actionMeta } = this.pendingDropdownFill;
    
    if (!initialSnapshot) {
      if (value) {
        console.log('✅ [Dropdown] Заполнение зафиксировано событием (без снапшота):', value);
        this.cancelDropdownFillVerification();
        
        // Записываем действие
        const fillAction = {
          type: 'input',
          selector: actionMeta.selector,
          element: actionMeta.element,
          value: value,
          displayValue: value,
          dropdownAutoFilled: true,
          timestamp: Date.now(),
          url: window.location.href
        };
        
        this.saveAction(fillAction).catch(err => {
          console.error('❌ [Dropdown] Ошибка сохранения действия:', err);
        });
        
        // Закрываем dropdown после обнаружения значения
        this.closeDropdownAfterSelection(element);
        
        return true;
      }
      return false;
    }
    
    if (this.isRelatedDropdownElement(element, initialSnapshot) && value) {
      console.log('✅ [Dropdown] Заполнение зафиксировано событием:', value);
      this.cancelDropdownFillVerification();
      
      // Записываем действие
      const fillAction = {
        type: 'input',
        selector: actionMeta.selector,
        element: actionMeta.element,
        value: value,
        displayValue: value,
        dropdownAutoFilled: true,
        timestamp: Date.now(),
        url: window.location.href
      };
      
      this.saveAction(fillAction).catch(err => {
        console.error('❌ [Dropdown] Ошибка сохранения действия:', err);
      });
      
      // Закрываем dropdown после обнаружения значения
      this.closeDropdownAfterSelection(element);
      
      return true;
    }
    
    if (actionMeta) {
      const referenceElement = this.findElementForAction(actionMeta);
      if (referenceElement && (referenceElement === element || referenceElement.contains(element) || element.contains(referenceElement))) {
        console.log('✅ [Dropdown] Заполнение зафиксировано событием (через сопоставление):', value);
        this.cancelDropdownFillVerification();
        
        // Записываем действие
        const fillAction = {
          type: 'input',
          selector: actionMeta.selector,
          element: actionMeta.element,
          value: value,
          displayValue: value,
          dropdownAutoFilled: true,
          timestamp: Date.now(),
          url: window.location.href
        };
        
        this.saveAction(fillAction).catch(err => {
          console.error('❌ [Dropdown] Ошибка сохранения действия:', err);
        });
        
        // Закрываем dropdown после обнаружения значения
        this.closeDropdownAfterSelection(element);
        
        return true;
      }
    }
    
    return false;
  }

  cancelDropdownFillVerification() {
    if (this.dropdownFillTimeout) {
      clearTimeout(this.dropdownFillTimeout);
      this.dropdownFillTimeout = null;
    }
    if (this.dropdownPollingInterval) {
      clearInterval(this.dropdownPollingInterval);
      this.dropdownPollingInterval = null;
    }
    this.pendingDropdownFill = null;
  }

  async verifyDropdownFillResult() {
    const pending = this.pendingDropdownFill;
    this.dropdownFillTimeout = null;
    
    if (!pending) return;
    
    const { actionMeta, initialSnapshot, initialValue } = pending;
    const currentSnapshot = this.captureDropdownSnapshot(
      initialSnapshot?.triggerElement,
      actionMeta
    );
    this.pendingDropdownFill = null;
    
    if (!currentSnapshot) {
      console.warn('⚠️ [Dropdown] Не удалось получить текущее состояние dropdown');
      return;
    }
    
    const initialSnapshotValue = initialValue !== undefined
      ? initialValue
      : this.getDropdownSnapshotValue(initialSnapshot);
    const currentValue = this.getDropdownSnapshotValue(currentSnapshot);
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ СОСТОЯНИЯ
    console.log('📊 [Dropdown] Проверка состояния dropdown:');
    console.log('   - Начальное значение:', initialSnapshotValue || 'пусто');
    console.log('   - Текущее значение:', currentValue || 'пусто');
    
    // Проверяем, открылся ли dropdown (появились ли панели)
    const panelsAfter = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
    const visiblePanelsAfter = panelsAfter.filter(p => {
      const rect = p.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
    });
    
    // Логируем новые панели
    if (visiblePanelsAfter.length > 0) {
      console.log('   - Видимых панелей ПОСЛЕ клика:', visiblePanelsAfter.length);
      visiblePanelsAfter.slice(0, 5).forEach((panel, idx) => {
        const rect = panel.getBoundingClientRect();
        const allElements = Array.from(panel.querySelectorAll('*'));
        const visibleElements = allElements.filter(el => {
          const elRect = el.getBoundingClientRect();
          const elText = el.textContent?.trim();
          return elText && elText.length > 0 && elRect.width > 0 && elRect.height > 0 && el.offsetParent !== null;
        });
        console.log(`      Панель ${idx + 1}: ${panel.tagName} (${panel.className || 'нет классов'}) - ${allElements.length} элементов, ${visibleElements.length} видимых`);
        if (visibleElements.length > 0 && visibleElements.length <= 10) {
          console.log(`         Опции:`, visibleElements.map(el => el.textContent?.trim()).filter(Boolean).slice(0, 5));
        }
      });
    }
    
    const changed = initialSnapshot
      ? this.hasDropdownSnapshotChanged(initialSnapshot, currentSnapshot)
      : (!!currentValue && currentValue.trim().length > 0 && currentValue !== initialSnapshotValue);
    
    // Если значение не изменилось, но dropdown открылся (появились панели), 
    // это означает, что пользователь открыл список, но еще не выбрал значение
    // В этом случае мы все равно записываем клик, так как это важное действие
    if (!changed && visiblePanelsAfter.length > 0) {
      console.log('ℹ️ [Dropdown] Значение не изменилось, но dropdown открылся (список виден)');
      console.log('   - Это означает, что пользователь открыл список, но еще не выбрал значение');
      console.log('   - Клик уже записан, ожидаем выбор значения...');
      // Не записываем дополнительное действие, так как клик уже записан
      return;
    }
    
    if (!changed) {
      console.warn('⚠️ [Dropdown] Значение dropdown не изменилось и список не открылся');
      console.warn('   - Возможно, dropdown требует дополнительных действий для открытия');
      return;
    }
    
    if (!currentValue) {
      console.warn('⚠️ [Dropdown] Изменение обнаружено, но получить новое значение не удалось');
      return;
    }
    
    console.log('✅ [Dropdown] Запись шага заполнения dropdown без явного события:', currentValue);
    
    const fillAction = {
      type: 'input',
      selector: actionMeta.selector,
      element: actionMeta.element,
      value: currentValue,
      displayValue: currentValue,
      dropdownAutoFilled: true,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    await this.saveAction(fillAction);
  }

  captureDropdownSnapshot(element, actionMeta) {
    let targetElement = element;
    
    if (!targetElement || !targetElement.isConnected) {
      targetElement = this.findElementForAction(actionMeta);
    }
    
    if (!targetElement) {
      console.warn('⚠️ [Dropdown] Элемент больше не доступен, снапшот не создан');
      return null;
    }
    
    const valueElement = this.findDropdownValueElement(targetElement);
    const triggerValue = this.extractElementValue(targetElement);
    const triggerText = this.extractElementText(targetElement);
    const valueElementValue = valueElement ? this.extractElementValue(valueElement) : null;
    const valueElementText = valueElement ? this.extractElementText(valueElement) : null;
    
    return {
      triggerElement: targetElement,
      valueElement,
      triggerValue,
      triggerText,
      valueElementValue,
      valueElementText,
      serialized: [
        triggerValue,
        triggerText,
        valueElementValue,
        valueElementText
      ].map(val => (val || '').trim()).join('||')
    };
  }

  hasDropdownSnapshotChanged(prev, next) {
    if (!prev || !next) return false;
    return prev.serialized !== next.serialized;
  }

  getDropdownSnapshotValue(snapshot) {
    if (!snapshot) return '';
    
    const candidates = [
      snapshot.valueElementValue,
      snapshot.valueElementText,
      snapshot.triggerValue,
      snapshot.triggerText
    ];
    
    // Фильтруем плейсхолдеры
    const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
    const validCandidates = candidates.filter(val => {
      if (!val || val.trim().length === 0) return false;
      const lowerVal = val.toLowerCase().trim();
      return !placeholderTexts.some(ph => lowerVal.includes(ph));
    });
    
    if (validCandidates.length > 0) {
      return validCandidates[0].trim();
    }
    
    // Если не нашли в снапшоте, пробуем найти в элементе напрямую
    if (snapshot.triggerElement) {
      const directValue = this.findDropdownValueDirectly(snapshot.triggerElement);
      if (directValue) {
        return directValue;
      }
    }
    
    return '';
  }
  
  /**
   * Находит значение dropdown напрямую в элементе
   */
  findDropdownValueDirectly(element) {
    if (!element) return '';
    
    // Ищем в app-select
    const appSelect = element.closest('app-select') || (element.tagName === 'APP-SELECT' ? element : null);
    if (appSelect) {
      // СНАЧАЛА: Пытаемся найти выбранную опцию в открытой панели (более точно)
      const panels = this.seleniumUtils?.findDropdownPanels(appSelect) || [];
      for (const panel of panels) {
        // Ищем опции с классами active/selected
        const activeOptions = Array.from(panel.querySelectorAll('[class*="active"]:not([class*="disable"]), [class*="selected"], [aria-selected="true"]'));
        for (const opt of activeOptions) {
          const optText = this.seleniumUtils?.getElementText(opt)?.trim() || opt.textContent?.trim() || '';
          const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
          if (optText && !placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase())) && optText.length < 50) {
            // Если текст короткий (не контейнер со всеми опциями), возвращаем его
            return optText;
          }
        }
      }
      
      // ЕСЛИ НЕ НАШЛИ: Ищем в .result элементе, но пытаемся извлечь только выбранную опцию
      const resultElement = appSelect.querySelector('.result, [class*="result"], [id*="result"]');
      if (resultElement) {
        const text = resultElement.textContent?.trim() || resultElement.innerText?.trim() || '';
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
        if (text && !placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()))) {
          // ОПТИМИЗАЦИЯ: Если текст содержит несколько опций (например "Плановый По поручению Инициативный"),
          // пытаемся найти первую выбранную опцию в панели
          if (text.length > 30 && (text.includes('Плановый') && text.includes('поручению') && text.includes('Инициативный'))) {
            // Это составное значение, ищем первую опцию в панели
            for (const panel of panels) {
              const options = this.seleniumUtils?.findOptionsInPanel(panel) || [];
              for (const opt of options) {
                const optText = this.seleniumUtils?.getElementText(opt)?.trim() || opt.textContent?.trim() || '';
                if (optText && optText.length < 30 && text.includes(optText)) {
                  // Нашли первую опцию, которая входит в составное значение
                  return optText;
                }
              }
            }
            // Если не нашли, возвращаем первую часть составного значения
            return text.split(/\s+/)[0] || text;
          }
          return text;
        }
      }
      
      // Ищем скрытый input
      const hiddenInput = appSelect.querySelector('input[type="hidden"]');
      if (hiddenInput && hiddenInput.value) {
        return hiddenInput.value;
      }
      
      // Ищем через ng-reflect-value
      const ngValueElement = appSelect.querySelector('[ng-reflect-value]');
      if (ngValueElement) {
        const value = ngValueElement.getAttribute('ng-reflect-value');
        if (value) return value;
      }
      
      // Ищем в дочерних элементах с текстом (исключая плейсхолдеры)
      const allChildren = Array.from(appSelect.querySelectorAll('*'));
      for (const child of allChildren) {
        const text = child.textContent?.trim() || child.innerText?.trim() || '';
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
        const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
        if (text && !isPlaceholder && text.length > 0 && text.length < 100) {
          // Проверяем, что это не весь контент dropdown (слишком длинный)
          const allText = appSelect.textContent?.trim() || '';
          if (text.length < allText.length * 0.8) {
            return text;
          }
        }
      }
    }
    
    return '';
  }

  isRelatedDropdownElement(element, snapshot) {
    if (!element || !snapshot) return false;
    const { triggerElement, valueElement } = snapshot;
    return element === triggerElement ||
           element === valueElement ||
           triggerElement?.contains?.(element) ||
           valueElement?.contains?.(element);
  }

  findDropdownValueElement(element) {
    if (!element) return null;
    
    if (this.isValueElement(element)) {
      return element;
    }
    
    // Для app-select ищем в родительском контейнере
    const appSelect = element.closest('app-select') || (element.tagName === 'APP-SELECT' ? element : null);
    const searchRoot = appSelect || element;
    
    const valueSelectors = [
      'input[type="hidden"]', // Скрытый input с значением
      '[id*="result"]', // Элемент с id содержащим "result"
      '[id*="value"]', // Элемент с id содержащим "value"
      '.result', // Класс result
      '[class*="result"]', // Класс содержащий "result"
      '.selected-value',
      '.selection',
      '.value',
      '[class*="value"]',
      '.ng-value',
      '.ant-select-selection-item',
      '.mat-select-value',
      '[data-value]',
      '[ng-reflect-value]', // Angular значение
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]'
    ];
    
    for (const selector of valueSelectors) {
      const candidate = searchRoot.querySelector(selector);
      if (candidate) {
        // Проверяем, что элемент содержит реальное значение (не плейсхолдер)
        const value = this.extractElementValue(candidate);
        const text = this.extractElementText(candidate);
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
        const hasRealValue = (value && !placeholderTexts.some(ph => value.toLowerCase().includes(ph.toLowerCase()))) ||
                             (text && !placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase())));
        
        if (hasRealValue || selector.includes('hidden') || selector.includes('ng-reflect')) {
          return candidate;
        }
      }
    }
    
    const ariaControls = element.getAttribute?.('aria-controls');
    if (ariaControls) {
      const controlled = document.getElementById(ariaControls);
      if (controlled && this.isValueElement(controlled)) {
        return controlled;
      }
    }
    
    const labelledBy = element.getAttribute?.('aria-labelledby');
    if (labelledBy) {
      const label = document.getElementById(labelledBy);
      if (label && this.isValueElement(label)) {
        return label;
      }
    }
    
    return null;
  }

  isValueElement(element) {
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    if (!tag) return false;
    return ['input', 'textarea', 'select'].includes(tag) || element.getAttribute?.('contenteditable') === 'true';
  }

  extractElementValue(element) {
    if (!element) return '';
    
    if (element.value !== undefined && element.value !== null && element.value !== '') {
      return element.value;
    }
    
    const dataValue = element.getAttribute?.('data-value');
    if (dataValue) return dataValue;
    
    const ariaValue = element.getAttribute?.('aria-valuetext') || element.getAttribute?.('aria-label');
    if (ariaValue) return ariaValue;
    
    return '';
  }

  extractElementText(element) {
    if (!element) return '';
    const text = element.innerText || element.textContent || '';
    return text.trim();
  }

  findElementForAction(actionMeta) {
    if (!actionMeta) return null;
    
    const selectorCandidates = [];
    
    const pushCandidate = (candidate) => {
      if (!candidate) return;
      selectorCandidates.push(candidate);
    };
    
    pushCandidate(actionMeta.selector);
    
    if (Array.isArray(actionMeta.selector?.alternatives)) {
      actionMeta.selector.alternatives.forEach(pushCandidate);
    }
    
    if (Array.isArray(actionMeta.alternatives)) {
      actionMeta.alternatives.forEach(pushCandidate);
    }
    
    const queryWithSelector = (selector) => {
      if (!selector) return null;
      try {
        return document.querySelector(selector);
      } catch (error) {
        return null;
      }
    };
    
    for (const candidate of selectorCandidates) {
      if (!candidate) continue;
      
      if (typeof candidate === 'string') {
        const found = queryWithSelector(candidate);
        if (found) return found;
        continue;
      }
      
      if (typeof this.selectorEngine?.findElementSync === 'function') {
        const viaEngine = this.selectorEngine.findElementSync(candidate);
        if (viaEngine) return viaEngine;
      }
      
      if (candidate.selector) {
        const fallback = queryWithSelector(candidate.selector);
        if (fallback) return fallback;
      }
    }
    
    const elementInfo = actionMeta.element || {};
    const attributes = elementInfo.attributes || {};
    
    if (elementInfo.id) {
      const byId = document.getElementById(elementInfo.id);
      if (byId) return byId;
    }
    
    const ariaControls = attributes['aria-controls'];
    if (ariaControls) {
      const controlled = document.getElementById(ariaControls);
      if (controlled) return controlled;
    }
    
    const classAttr = this.normalizeClassName(attributes.class || elementInfo.className);
    if (classAttr) {
      const classes = classAttr.split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        const escaped = (typeof CSS !== 'undefined' && CSS.escape)
          ? CSS.escape(cls)
          : cls.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
        const found = queryWithSelector(`.${escaped}`);
        if (found) return found;
      }
    }
    
    const role = attributes.role;
    const textValue = elementInfo.text;
    if (role && textValue) {
      const roleElements = Array.from(document.querySelectorAll(`[role="${role}"]`));
      const match = roleElements.find(el => this.selectorEngine.getElementText(el).trim() === textValue.trim());
      if (match) return match;
    }
    
    const tagName = elementInfo.tag || elementInfo.tagName;
    if (tagName && textValue) {
      const tagElements = Array.from(document.querySelectorAll(tagName));
      const match = tagElements.find(el => this.selectorEngine.getElementText(el).trim() === textValue.trim());
      if (match) return match;
    }
    
    return null;
  }

  // Остальные методы остаются без изменений...
  async checkState() {
    // Код метода checkState из оригинального recorder.js
    await this.delay(500);
    
    let attempts = 0;
    const maxAttempts = 10;
    
    const tryCheckState = async () => {
      try {
        attempts++;
        
        if (!chrome.runtime?.id) {
          if (attempts < maxAttempts) {
            console.log(`⏳ Extension не загружен, попытка ${attempts}/${maxAttempts}...`);
            await this.delay(1000);
            return tryCheckState();
          } else {
            console.error('❌ Extension не загружен после всех попыток');
            return;
          }
        }

        const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        if (response && response.success && response.state.isRecording && !response.state.isPlaying) {
          console.log('🔄 Восстанавливаю запись после навигации');

          await this.waitForPageLoad();

          await this.startRecording(response.state.currentTestId);

          // Затем сохраняем действие навигации (теперь isRecording = true)
          const navigationAction = {
            type: 'navigation',
            url: window.location.href,
            timestamp: Date.now()
          };
          await this.saveAction(navigationAction);
          
          console.log('✅ Запись продолжается на новой странице');
        }
      } catch (error) {
        if (error.message && error.message.includes('Receiving end does not exist')) {
          if (attempts < maxAttempts) {
            await this.delay(1000);
            return tryCheckState();
          }
        }
      }
    };
    
    await tryCheckState();
  }

  async startRecording(testId) {
    if (this.isRecording) {
      console.log('⚠️ [Recorder] Запись уже идет, пропускаю');
      return;
    }

    try {
      const stateRes = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (stateRes?.state?.isPlaying) {
        console.log('ℹ️ [Recorder] Идёт воспроизведение — запись не запускаю, индикатор не показываю');
        this.removeRecordingIndicator();
        return;
      }
    } catch (e) { /* игнорируем */ }

    console.log('🔴 [Recorder] ==========================================');
    console.log('🔴 [Recorder] НАЧАЛО ЗАПИСИ ТЕСТА');
    console.log('🔴 [Recorder] testId:', testId);
    console.log('🔴 [Recorder] URL страницы:', window.location.href);
    console.log('🔴 [Recorder] document.readyState:', document.readyState);
    console.log('🔴 [Recorder] document.body существует:', !!document.body);
    console.log('🔴 [Recorder] ==========================================');
    
    this.isRecording = true;
    this.currentTestId = testId;
    console.log('✅ [Recorder] isRecording установлен в:', this.isRecording);
    console.log('✅ [Recorder] currentTestId установлен в:', this.currentTestId);
    
    // Добавляем индикатор записи
    console.log('📌 [Recorder] Добавляю индикатор записи...');
    this.addRecordingIndicator();
    
    // Прикрепляем обработчики событий
    console.log('📌 [Recorder] Прикрепляю обработчики событий...');
    this.attachEventListeners();
    
    // Проверяем, что все настроено правильно
    setTimeout(() => {
      console.log('🔍 [Recorder] Проверка состояния после инициализации...');
      
      const indicator = document.getElementById('autotest-recording-indicator');
      if (!indicator) {
        console.error('❌ [Recorder] Индикатор записи не найден после создания!');
        // Пробуем создать еще раз
        this.addRecordingIndicator();
      } else {
        const rect = indicator.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        console.log('✅ [Recorder] Индикатор записи найден:', {
          exists: true,
          visible: isVisible,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right
        });
      }
      
      // Проверяем, что обработчики прикреплены
      if (!this.clickHandler) {
        console.error('❌ [Recorder] clickHandler не создан! Повторная попытка...');
        this.attachEventListeners();
      } else {
        console.log('✅ [Recorder] Обработчики событий подтверждены:', {
          click: !!this.clickHandler,
          change: !!this.changeHandler,
          input: !!this.inputHandler
        });
      }
      
      // Финальная проверка состояния
      console.log('📊 [Recorder] Финальное состояние:', {
        isRecording: this.isRecording,
        currentTestId: this.currentTestId,
        hasIndicator: !!document.getElementById('autotest-recording-indicator'),
        hasClickHandler: !!this.clickHandler
      });
    }, 200);
    
    console.log('🔴 [Recorder] Запись начата успешно!');
  }

  async stopRecording() {
    // ВАЖНО: Всегда возвращаем Promise
    if (!this.isRecording) {
      return Promise.resolve();
    }

    // Сразу убираем индикатор «ЗАПИСЬ», чтобы он не оставался на экране
    this.removeRecordingIndicator();

    try {
      // Закрываем пикер если он открыт
      if (this.pendingPicker) {
        console.log('🎯 [Picker] Закрываю пикер при остановке записи');
        this.pendingPicker.close();
        this.pendingPicker = null;
      }
      
      // ВАЖНО: Перед остановкой проверяем и сохраняем выбор опции из dropdown, если он был сделан
      if (this.pendingDropdownFill) {
        console.log('🔍 [Dropdown] Проверяю выбор опции перед остановкой записи...');
        
        try {
          const { actionMeta, initialValue } = this.pendingDropdownFill;
          const element = actionMeta?.element || actionMeta?.selector;
          
          // Пробуем найти dropdown элемент
          let dropdownElement = null;
          
          // Метод 1: Через селектор
          if (actionMeta?.selector) {
            try {
              dropdownElement = this.selectorEngine.findElementSync(actionMeta.selector);
              // Если нашли элемент, но это не app-select, ищем родительский
              if (dropdownElement && dropdownElement.tagName !== 'APP-SELECT') {
                const parentAppSelect = dropdownElement.closest('app-select, ng-select, mat-select');
                if (parentAppSelect) {
                  dropdownElement = parentAppSelect;
                }
              }
            } catch (e) {
              // Игнорируем ошибки поиска
            }
          }
          
          // Метод 2: Через элемент из actionMeta.element
          if (!dropdownElement && actionMeta?.element) {
            // Если element - это объект с информацией, пробуем найти через селектор
            if (typeof actionMeta.element === 'object' && actionMeta.element.selector) {
              try {
                dropdownElement = this.selectorEngine.findElementSync(actionMeta.element.selector);
              } catch (e) {
                // Игнорируем ошибки
              }
            }
          }
          
          // Метод 3: Ищем все app-select на странице и проверяем, какой из них связан с actionMeta
          if (!dropdownElement && actionMeta?.selector) {
            const allAppSelects = document.querySelectorAll('app-select');
            for (const appSelect of allAppSelects) {
              // Проверяем, содержит ли app-select элемент с селектором из actionMeta
              try {
                const selectorStr = typeof actionMeta.selector === 'string' 
                  ? actionMeta.selector 
                  : (actionMeta.selector?.selector || actionMeta.selector?.value || '');
                if (selectorStr && appSelect.querySelector(selectorStr)) {
                  dropdownElement = appSelect;
                  break;
                }
              } catch (e) {
                // Игнорируем ошибки
              }
            }
          }
          
          // Метод 4: Ищем через .input-project-status (для поля статуса)
          if (!dropdownElement) {
            const statusContainer = document.querySelector('.input-project-status');
            if (statusContainer) {
              dropdownElement = statusContainer.querySelector('app-select');
            }
          }
          
          if (dropdownElement) {
            // Используем SeleniumUtils для поиска выбранного значения
            let currentValue = null;
            if (this.seleniumUtils) {
              try {
                currentValue = this.findDropdownValueDirectly(dropdownElement);
                if (!currentValue || currentValue.toLowerCase().includes('выберите')) {
                  // Пробуем найти через .result__content с ng-reflect-app-tooltip
                  const resultContent = dropdownElement.querySelector('.result__content[ng-reflect-app-tooltip]');
                  if (resultContent) {
                    const tooltipValue = resultContent.getAttribute('ng-reflect-app-tooltip') || '';
                    if (tooltipValue && tooltipValue.trim()) {
                      currentValue = tooltipValue.trim();
                    }
                  }
                }
              } catch (e) {
                console.warn('⚠️ [Dropdown] Ошибка при поиске значения через SeleniumUtils:', e);
              }
            }
            
            // Если не нашли через SeleniumUtils, пробуем обычный метод
            if (!currentValue || currentValue.toLowerCase().includes('выберите')) {
              const snapshot = this.captureDropdownSnapshot(dropdownElement, actionMeta);
              if (snapshot) {
                currentValue = this.getDropdownSnapshotValue(snapshot);
              }
            }
            
            // Если значение найдено и отличается от начального, сохраняем его
            if (currentValue && 
                currentValue.trim() && 
                currentValue !== initialValue &&
                !currentValue.toLowerCase().includes('выберите') &&
                !currentValue.toLowerCase().includes('select') &&
                !currentValue.toLowerCase().includes('placeholder')) {
              console.log(`✅ [Dropdown] Найдено выбранное значение "${currentValue}" перед остановкой, сохраняю...`);
              
              // Записываем выбор опции
              await this.recordDropdownOptionSelection(dropdownElement, currentValue.trim(), null);
            } else {
              console.log(`ℹ️ [Dropdown] Значение не найдено или не изменилось (текущее: "${currentValue}", начальное: "${initialValue}")`);
            }
          }
        } catch (error) {
          console.warn('⚠️ [Dropdown] Ошибка при проверке выбора опции перед остановкой:', error);
        }
      }

    // Сохраняем pending input перед остановкой записи
    await this.savePendingInput();
    
    // Сохраняем testId перед сброса
    const testId = this.currentTestId;
    
    // ВАЖНО: Сначала отключаем обработчики событий, чтобы новые действия не записывались
    this.detachEventListeners();
    this.cancelDropdownFillVerification();
    
    // Принудительно отменяем все таймауты и интервалы
    if (this.dropdownFillTimeout) {
      clearTimeout(this.dropdownFillTimeout);
      this.dropdownFillTimeout = null;
    }
    if (this.dropdownPollingInterval) {
      clearInterval(this.dropdownPollingInterval);
      this.dropdownPollingInterval = null;
    }
    if (this.pendingInputTimeout) {
      clearTimeout(this.pendingInputTimeout);
      this.pendingInputTimeout = null;
    }
    
    this.isRecording = false;
    this.currentTestId = null;

    console.log('⏹️ Запись остановлена');
    
    // Экспорт в Excel выполняется асинхронно после полной остановки записи
    // Используем setTimeout для гарантии, что все операции остановки завершены
    if (testId && window.ExcelExporter) {
      setTimeout(async () => {
        try {
          console.log('📊 [ExcelExport] Начинаю экспорт теста в Excel после записи...');
          const exporter = new window.ExcelExporter();
          await exporter.init();
          if (exporter.shouldExportOnRecord()) {
            // Небольшая задержка для гарантии сохранения всех действий в background
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Получаем тест из background (с повторными попытками)
            let test = null;
            let attempts = 0;
            const maxAttempts = 5;
            
            while (attempts < maxAttempts && !test) {
              attempts++;
              try {
                const response = await chrome.runtime.sendMessage({
                  type: 'GET_TEST',
                  testId: testId
                });
                
                if (response && response.success && response.test) {
                  test = response.test;
                  // Проверяем, что тест содержит действия
                  if (test.actions && test.actions.length > 0) {
                    console.log(`✅ [ExcelExport] Тест получен, действий: ${test.actions.length}`);
                    break;
                  } else {
                    console.warn(`⚠️ [ExcelExport] Тест получен, но действий нет, жду еще... (попытка ${attempts}/${maxAttempts})`);
                    test = null; // Сбрасываем, чтобы повторить попытку
                    await new Promise(resolve => setTimeout(resolve, 500));
                  }
                } else {
                  console.warn(`⚠️ [ExcelExport] Попытка ${attempts}/${maxAttempts}: тест не получен, жду...`);
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              } catch (error) {
                console.warn(`⚠️ [ExcelExport] Ошибка при получении теста (попытка ${attempts}/${maxAttempts}):`, error);
                if (attempts < maxAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
            }
            
            if (test && test.actions && test.actions.length > 0) {
              await exporter.exportTestToExcel(test, 'record', {
                authData: this.getAuthData(),
                preconditions: this.getPreconditions()
              }, {
                promptForLocation: false
              });
              console.log('✅ [ExcelExport] Тест успешно экспортирован в Excel');
            } else {
              console.warn('⚠️ [ExcelExport] Не удалось получить тест или тест пуст, экспорт пропущен');
            }
          } else {
            console.log('ℹ️ [ExcelExport] Экспорт при записи отключен в настройках');
          }
        } catch (error) {
          console.error('❌ [ExcelExport] Ошибка при экспорте после записи:', error);
        }
      }, 100); // Небольшая задержка для гарантии завершения всех операций остановки
    }
    
    // Принудительно отменяем все таймауты и интервалы
    if (this.dropdownFillTimeout) {
      clearTimeout(this.dropdownFillTimeout);
      this.dropdownFillTimeout = null;
    }
    if (this.dropdownPollingInterval) {
      clearInterval(this.dropdownPollingInterval);
      this.dropdownPollingInterval = null;
      }
      
      // Явно возвращаем Promise.resolve() для гарантии
      return Promise.resolve();
    } catch (error) {
      console.error('❌ Ошибка при остановке записи:', error);
      // Всегда возвращаем Promise, даже при ошибке
      return Promise.resolve();
    }
  }

  attachEventListeners() {
    // Сначала отключаем старые обработчики, если они есть
    this.detachEventListeners();
    
    console.log('📌 [Recorder] Прикрепляю обработчики событий...');
    
    // Базовая логика прикрепления обработчиков
    this.clickHandler = (e) => {
      if (this.isRecording) {
        this.handleClick(e);
      } else {
        console.log('⏸️ [Recorder] clickHandler: запись не активна, isRecording:', this.isRecording);
      }
    };
    this.dblclickHandler = (e) => {
      if (this.isRecording) {
        this.handleDblClick(e);
      }
    };
    this.changeHandler = (e) => {
      if (this.isRecording) {
        this.handleChange(e);
      }
    };
    this.inputHandler = (e) => {
      if (this.isRecording) {
        this.handleInput(e);
      }
    };
    this.blurHandler = (e) => {
      if (this.isRecording) {
        this.handleBlur(e);
      }
    };
    this.submitHandler = (e) => {
      if (this.isRecording) {
        this.handleSubmit(e);
      }
    };
    this.contextMenuHandler = (e) => {
      if (this.isRecording) {
        this.handleContextMenu(e);
      }
    };
    this.mouseUpHandler = (e) => {
      if (this.isRecording) {
        this.handleMouseUp(e);
      }
    };
    
    // Прикрепляем обработчики с capture phase для перехвата всех событий
    document.addEventListener('click', this.clickHandler, true);
    document.addEventListener('dblclick', this.dblclickHandler, true);
    document.addEventListener('change', this.changeHandler, true);
    document.addEventListener('input', this.inputHandler, true);
    document.addEventListener('blur', this.blurHandler, true);
    document.addEventListener('submit', this.submitHandler, true);
    document.addEventListener('contextmenu', this.contextMenuHandler, true);
    document.addEventListener('mouseup', this.mouseUpHandler, true);
    
    console.log('✅ [Recorder] Обработчики событий прикреплены:', {
      click: !!this.clickHandler,
      dblclick: !!this.dblclickHandler,
      change: !!this.changeHandler,
      input: !!this.inputHandler,
      blur: !!this.blurHandler,
      submit: !!this.submitHandler,
      contextmenu: !!this.contextMenuHandler,
      mouseup: !!this.mouseUpHandler
    });
  }

  detachEventListeners() {
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
    }
    if (this.dblclickHandler) {
      document.removeEventListener('dblclick', this.dblclickHandler, true);
    }
    if (this.changeHandler) {
      document.removeEventListener('change', this.changeHandler, true);
    }
    if (this.inputHandler) {
      document.removeEventListener('input', this.inputHandler, true);
    }
    if (this.blurHandler) {
      document.removeEventListener('blur', this.blurHandler, true);
    }
    if (this.submitHandler) {
      document.removeEventListener('submit', this.submitHandler, true);
    }
    if (this.contextMenuHandler) {
      document.removeEventListener('contextmenu', this.contextMenuHandler, true);
    }
    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler, true);
    }
    
    // Удаляем контекстное меню переменных
    this.hideVariableContextMenu();
    
    // Очищаем pending input при остановке записи
    this.clearPendingInput();
    
    // #21: Очищаем отложенный клик
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }
    this.pendingClickAction = null;
  }

  async handleDblClick(event) {
    if (!this.isRecording) return;

    // Проверяем, что extension context валиден
    if (!chrome.runtime?.id) {
      console.warn('⚠️ Extension context недействителен при обработке двойного клика');
      return;
    }

    const element = event.target;
    
    // #21: Отменяем отложенный клик - это dblclick, а не два отдельных клика
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
      console.log('🖱️🖱️ [DoubleClick] Отменён отложенный клик (обнаружен dblclick)');
    }
    this.pendingClickAction = null;
    
    // Сохраняем pending input перед двойным кликом (если клик не на том же элементе)
    if (this.pendingInput) {
      const clickedElementKey = this.getElementKey(element);
      const isInputField = element.tagName === 'INPUT' || 
                          element.tagName === 'TEXTAREA' ||
                          element.contentEditable === 'true';
      
      // Если клик не на том же поле ввода, сохраняем pending input
      if (this.pendingInput.elementKey !== clickedElementKey || !isInputField) {
        await this.savePendingInput();
      }
    }
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДВОЙНОГО КЛИКА
    const elementText = element.textContent?.trim() || element.innerText?.trim() || '';
    const elementClasses = element.className || 'нет классов';
    console.log(`🖱️🖱️ [DoubleClick] Двойной клик по элементу: <${element.tagName}> class="${elementClasses}" text="${elementText.substring(0, 50)}"`);
    
    // Для двойного клика не обрабатываем dropdown опции, просто записываем клик
    await this.recordClickAction(element, 'dblclick', false);
  }

  async handleClick(event) {
    if (!this.isRecording) {
      console.log('⏸️ [Recorder] handleClick: запись не активна, пропускаю событие');
      return;
    }
    
    // ВАЖНО: Проверяем валидность extension context перед обработкой
    if (!chrome.runtime?.id) {
      console.warn('⚠️ Extension context недействителен при обработке клика');
      // Пытаемся восстановить запись через небольшую задержку
      setTimeout(() => {
        if (chrome.runtime?.id && this.isRecording) {
          console.log('✅ Extension context восстановлен, запись продолжается');
        } else if (this.isRecording) {
          console.error('❌ Extension context не восстановлен, останавливаю запись');
          this.stopRecording();
        }
      }, 1000);
      return;
    }
    
    console.log('🖱️ [Recorder] handleClick вызван, isRecording:', this.isRecording);
    
    // === ПРОВЕРКА НА ЭЛЕМЕНТЫ ПИКЕРА (в самом начале!) ===
    const clickedElement = event.target;
    
    // #22: Пропускаем клики по <option> внутри native <select>
    // Эти клики вызовут событие change на <select>, которое мы запишем
    if (clickedElement.tagName === 'OPTION') {
      const parentSelect = clickedElement.closest('select');
      if (parentSelect) {
        console.log('📝 [Select] Клик по <option> внутри native <select>, пропускаю - ждём change событие');
        return;
      }
    }
    
    // Также пропускаем клики по самому native <select> (выбор через dropdown)
    if (clickedElement.tagName === 'SELECT' && !clickedElement.multiple) {
      console.log('📝 [Select] Клик по native <select>, пропускаю - ждём change событие');
      return;
    }
    
    // Проверяем клик по InlineSelectorPicker - пропускаем БЕЗ обработки
    // Используем несколько способов проверки для надёжности
    const pickerPanel = document.getElementById('autotest-selector-picker');
    const pickerBackdrop = document.getElementById('autotest-selector-picker-backdrop');
    
    const isInsidePicker = pickerPanel && pickerPanel.contains(clickedElement);
    const isOnBackdrop = pickerBackdrop && (clickedElement === pickerBackdrop || pickerBackdrop.contains(clickedElement));
    const hasPickerAttr = clickedElement.closest('[data-autotest-picker]');
    
    if (isInsidePicker || isOnBackdrop || hasPickerAttr) {
      console.log('🎯 [Picker] Клик внутри пикера, recorder пропускает', {
        isInsidePicker,
        isOnBackdrop,
        hasPickerAttr: !!hasPickerAttr,
        target: clickedElement.tagName,
        className: clickedElement.className
      });
      // НЕ останавливаем propagation - событие должно дойти до кнопок пикера
      return;
    }

    // === РЕЖИМ С ВЫБОРОМ СЕЛЕКТОРА (InlineSelectorPicker) ===
    if (this.selectorPickerMode && window.InlineSelectorPicker) {
      const element = event.target;
      
      // Пропускаем элементы плагина
      if (this.isPluginElement(element)) {
        console.log('🔌 [Plugin] Клик по элементу плагина, пропускаю');
        this.closePluginElement(element);
        return;
      }
      
      // Пропускаем если уже показан пикер
      if (this.pendingPicker) {
        console.log('⏳ [Picker] Пикер уже показан, пропускаю');
        return;
      }
      
      // Пропускаем если пикер только что закрылся (защита от повторного открытия)
      if (this.pickerJustClosed) {
        console.log('⏳ [Picker] Пикер только что закрылся, пропускаю повторное открытие');
        return;
      }
      
      // ВАЖНО: Проверяем, является ли элемент опцией dropdown
      // Если да, показываем пикер для опции, а не для родительского dropdown
      const isDropdownOption = this.isDropdownOption(element);
      const isInDropdownPanel = !!element.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane, [class*="cdk-overlay"], [class*="mat-select-panel"], [class*="ng-dropdown-panel"]');
      
      console.log('🎯 [Picker] Проверка элемента:', {
        tag: element.tagName,
        isDropdownOption,
        isInDropdownPanel,
        hasSeleniumUtils: !!this.seleniumUtils
      });
      
      // Если элемент находится в панели dropdown, проверяем через SeleniumUtils
      let targetElement = element;
      if (isInDropdownPanel && this.seleniumUtils) {
        console.log('🎯 [Picker] Элемент в панели dropdown, проверяю через SeleniumUtils...');
        
        // Ищем родительский dropdown
        const parentDropdown = element.closest('app-select, ng-select, mat-select');
        if (parentDropdown) {
          const panels = this.seleniumUtils.findDropdownPanels(parentDropdown);
          console.log(`   📋 [Picker] Найдено ${panels.length} панелей для проверки`);
          
          for (const panel of panels) {
            if (panel.contains(element)) {
              console.log('   ✅ [Picker] Элемент находится в панели, ищу опции...');
              // Находим опцию, которая содержит кликнутый элемент
              const options = this.seleniumUtils.findOptionsInPanel(panel);
              console.log(`   📋 [Picker] Найдено ${options.length} опций в панели`);
              
              const foundOption = options.find(opt => {
                // Прямое совпадение
                if (opt === element) return true;
                // Элемент внутри опции
                if (opt.contains && opt.contains(element)) return true;
                // Опция внутри элемента
                if (element.contains && element.contains(opt)) return true;
                return false;
              });
              
              if (foundOption) {
                const optionText = this.seleniumUtils.getElementText(foundOption) || element.textContent?.trim() || '';
                console.log(`✅ [Picker] Найдена опция dropdown "${optionText}", показываю пикер для опции`);
                targetElement = foundOption;
                break;
              } else {
                console.log('   ⚠️ [Picker] Опция не найдена через SeleniumUtils, использую исходный элемент');
              }
            }
          }
        } else {
          // Если не нашли родительский dropdown через closest, ищем все dropdown на странице
          console.log('   🔍 [Picker] Родительский dropdown не найден через closest, ищу все dropdown...');
          const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select');
          for (const dd of allDropdowns) {
            const panels = this.seleniumUtils.findDropdownPanels(dd);
            for (const panel of panels) {
              if (panel.contains(element)) {
                const options = this.seleniumUtils.findOptionsInPanel(panel);
                const foundOption = options.find(opt => {
                  return opt === element || (opt.contains && opt.contains(element)) || (element.contains && element.contains(opt));
                });
                if (foundOption) {
                  const optionText = this.seleniumUtils.getElementText(foundOption) || element.textContent?.trim() || '';
                  console.log(`✅ [Picker] Найдена опция "${optionText}" в другом dropdown, показываю пикер для опции`);
                  targetElement = foundOption;
                  break;
                }
              }
            }
            if (targetElement !== element) break;
          }
        }
      } else if (isDropdownOption) {
        console.log('✅ [Picker] Элемент является опцией dropdown (определено через isDropdownOption), показываю пикер для опции');
        targetElement = element;
      }
      
      console.log('🎯 [Picker] Целевой элемент для пикера:', {
        tag: targetElement.tagName,
        className: targetElement.className,
        text: (targetElement.textContent || targetElement.innerText || '').substring(0, 50)
      });
      
      // Сохраняем pending input перед показом пикера
      if (this.pendingInput) {
        const clickedElementKey = this.getElementKey(targetElement);
        const isInputField = targetElement.tagName === 'INPUT' || 
                            targetElement.tagName === 'TEXTAREA' ||
                            targetElement.contentEditable === 'true';
        
        if (this.pendingInput.elementKey !== clickedElementKey || !isInputField) {
          await this.savePendingInput();
        }
      }
      
      // Показываем пикер для целевого элемента (опции или обычного элемента)
      event.preventDefault();
      event.stopPropagation();
      
      await this.showSelectorPickerForClick(targetElement);
      return;
    }
    // === КОНЕЦ РЕЖИМА С ПИКЕРОМ ===

    // === THROTTLE КЛИКОВ (через SelectorOptimizer) ===
    const now = Date.now();
    if (this.optimizer?.settings?.eventDebounce) {
      if (now - this.lastClickTime < this.clickThrottleMs) {
        console.log('⏭️ [Recorder] Пропуск быстрого клика (throttle)');
        return;
      }
    }
    this.lastClickTime = now;

    // Проверяем, что extension context валиден
    if (!chrome.runtime?.id) {
      console.warn('⚠️ Extension context недействителен при обработке клика');
      return;
    }

    const element = event.target;
    
    // ПРОВЕРКА: Является ли элемент частью плагина?
    if (this.isPluginElement(element)) {
      console.log('🔌 [Plugin] Клик по элементу плагина, не записываю в шаги');
      
      // Пытаемся закрыть элемент плагина (уведомление, плашка и т.д.)
      this.closePluginElement(element);
      
      return; // Не записываем клик по элементам плагина
    }
    
    // Сохраняем pending input перед кликом (если клик не на том же элементе)
    if (this.pendingInput) {
      const clickedElementKey = this.getElementKey(element);
      const isInputField = element.tagName === 'INPUT' || 
                          element.tagName === 'TEXTAREA' ||
                          element.contentEditable === 'true';
      
      // Если клик не на том же поле ввода, сохраняем pending input
      if (this.pendingInput.elementKey !== clickedElementKey || !isInputField) {
        await this.savePendingInput();
      }
    }
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВСЕХ КЛИКОВ
    const elementText = element.textContent?.trim() || element.innerText?.trim() || '';
    const elementClasses = element.className || 'нет классов';
    console.log(`🖱️ [Click] Клик по элементу: <${element.tagName}> class="${elementClasses}" text="${elementText.substring(0, 50)}"`);
    
    // ПРОВЕРКА: Является ли элемент опцией в dropdown?
    // Сначала проверяем, находится ли элемент в панели dropdown
    const isInPanel = !!element.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane');
    const hasText = elementText && elementText.length > 0 && 
                    !['выберите', 'select', 'choose', 'placeholder'].some(ph => elementText.toLowerCase().includes(ph.toLowerCase()));
    
    // Проверяем, есть ли открытые панели dropdown рядом (для динамически появляющихся опций)
    const nearbyOpenPanels = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"]'))
      .filter(p => {
        const pRect = p.getBoundingClientRect();
        const eRect = element.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(pRect.left - eRect.left, 2) + 
          Math.pow(pRect.top - eRect.top, 2)
        );
        return distance < 1000 && pRect.width > 0 && pRect.height > 0 && p.offsetParent !== null;
      });
    
    const hasNearbyPanel = nearbyOpenPanels.length > 0;
    
    console.log(`   - Находится в панели dropdown: ${isInPanel}`);
    console.log(`   - Есть открытые панели рядом: ${hasNearbyPanel} (${nearbyOpenPanels.length} панелей)`);
    console.log(`   - Имеет текст: ${hasText} (${elementText.substring(0, 30)})`);
    
    const isDropdownOption = this.isDropdownOption(element);
    console.log(`   - isDropdownOption: ${isDropdownOption}`);
    
    // ПРИОРИТЕТ: Если есть открытые панели, используем SeleniumUtils для поиска опций
    if (hasNearbyPanel && this.seleniumUtils) {
      console.log(`   🔍 [SeleniumUtils] Есть открытые панели, проверяю через SeleniumUtils...`);
      const parentDropdown = element.closest('app-select, ng-select, mat-select') || element;
      const panels = this.seleniumUtils.findDropdownPanels(parentDropdown);
      console.log(`   📋 [SeleniumUtils] Найдено ${panels.length} панелей для проверки (связанных с dropdown)`);
      
      for (const panel of panels) {
        const options = this.seleniumUtils.findOptionsInPanel(panel);
        console.log(`   📋 [SeleniumUtils] В панели найдено ${options.length} опций`);
        
        // Проверяем, является ли кликнутый элемент одной из опций
        const foundOption = options.find(opt => {
          // Прямое совпадение
          if (opt === element) return true;
          // Элемент внутри опции
          if (opt.contains && opt.contains(element)) return true;
          // Опция внутри элемента
          if (element.contains && element.contains(opt)) return true;
          // Проверка по тексту (если элемент содержит текст опции)
          const optText = this.seleniumUtils.getElementText(opt);
          const elText = elementText;
          if (optText && elText && optText.toLowerCase().includes(elText.toLowerCase()) && 
              elText.length > 0 && elText.length < 100) {
            return true;
          }
          return false;
        });
        
        if (foundOption) {
          const optionText = this.seleniumUtils.getElementText(foundOption) || elementText;
          console.log(`   ✅ [SeleniumUtils] ════════════════════════════════════════════════════`);
          console.log(`   ✅ [SeleniumUtils] Элемент найден как опция "${optionText}" через SeleniumUtils!`);
          console.log(`   ✅ [SeleniumUtils] ════════════════════════════════════════════════════`);
          
          const parentDropdown = this.findParentDropdownForOption(element) || 
                                this.findParentDropdownForOption(foundOption) ||
                                panel.closest('app-select, ng-select, mat-select');
          
          if (parentDropdown) {
            await this.recordDropdownOptionSelection(parentDropdown, optionText, foundOption || element);
            // Отменяем polling, так как опция уже записана
            if (this.pendingDropdownFill) {
              this.pendingDropdownFill = null;
            }
            if (this.dropdownPollingInterval) {
              clearInterval(this.dropdownPollingInterval);
              this.dropdownPollingInterval = null;
            }
            return; // Не обрабатываем как обычный клик
          } else {
            console.warn(`   ⚠️ [SeleniumUtils] Родительский dropdown не найден для опции`);
          }
        } else {
          // Логируем все опции для отладки (только если опций много)
          if (options.length > 0) {
            console.log(`   📋 [SeleniumUtils] Опции в панели (${options.length}):`);
            options.slice(0, 5).forEach((opt, idx) => {
              const optText = this.seleniumUtils.getElementText(opt);
              console.log(`      ${idx + 1}. "${optText}" (${opt.tagName}, ${opt.className || 'нет классов'})`);
            });
          }
        }
      }
    }
    
    // Дополнительная проверка: если элемент имеет текст опции и есть открытые панели рядом
    if (!isDropdownOption && hasText && hasNearbyPanel) {
      // Проверяем, не является ли это плейсхолдером
      const isPlaceholder = ['выберите', 'select', 'choose', 'placeholder', 'статус'].some(ph => 
        elementText.toLowerCase().includes(ph.toLowerCase())
      );
      
      // Проверяем, что текст не слишком длинный (не весь контент dropdown)
      const isReasonableLength = elementText.length > 0 && elementText.length < 100;
      
      if (!isPlaceholder && isReasonableLength) {
        console.log(`   💡 Элемент может быть опцией: есть текст и открытые панели рядом`);
        
        // Пробуем найти родительский dropdown
        const parentDropdown = this.findParentDropdownForOption(element);
        if (parentDropdown) {
          console.log(`   ✅ Найден родительский dropdown, обрабатываю как опцию`);
          const optionText = element.textContent?.trim() || element.innerText?.trim() || '';
          await this.recordDropdownOptionSelection(parentDropdown, optionText, element);
          return; // Не обрабатываем как обычный клик
        }
      }
    }
    
    // УЛУЧШЕННАЯ ПРОВЕРКА: Если есть открытые панели рядом, но элемент еще не определен как опция,
    // проверяем, находится ли элемент внутри одной из панелей
    if (!isDropdownOption && hasNearbyPanel && nearbyOpenPanels.length > 0) {
      console.log(`   🔍 Проверяю, находится ли элемент внутри открытых панелей...`);
      for (const panel of nearbyOpenPanels) {
        if (panel.contains(element)) {
          console.log(`   ✅ Элемент находится внутри панели dropdown, обрабатываю как опцию`);
          
          // Проверяем, что элемент имеет текст и не является плейсхолдером
          const text = elementText?.trim() || '';
          const isPlaceholder = ['выберите', 'select', 'choose', 'placeholder', 'статус'].some(ph => 
            text.toLowerCase().includes(ph.toLowerCase())
          );
          const isReasonableLength = text.length > 0 && text.length < 100;
          
          if (!isPlaceholder && isReasonableLength) {
            // Ищем родительский dropdown для панели
            const parentDropdown = panel.closest('app-select, ng-select, mat-select') || 
                                  this.findParentDropdownForOption(element);
            
            if (parentDropdown) {
              console.log(`   ✅ Найден родительский dropdown для панели, записываю выбор опции`);
              await this.recordDropdownOptionSelection(parentDropdown, text, element);
              return; // Не обрабатываем как обычный клик
            } else {
              // Если не нашли через closest, ищем ближайший dropdown к панели
              const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select');
              let closestDropdown = null;
              let minDistance = Infinity;
              
              const panelRect = panel.getBoundingClientRect();
              for (const dd of allDropdowns) {
                const ddRect = dd.getBoundingClientRect();
                const distance = Math.sqrt(
                  Math.pow(panelRect.left - ddRect.left, 2) + 
                  Math.pow(panelRect.top - ddRect.top, 2)
                );
                
                if (distance < 500 && distance < minDistance) {
                  minDistance = distance;
                  closestDropdown = dd;
                }
              }
              
              if (closestDropdown) {
                console.log(`   ✅ Найден ближайший dropdown к панели, записываю выбор опции`);
                await this.recordDropdownOptionSelection(closestDropdown, text, element);
                return; // Не обрабатываем как обычный клик
              }
            }
          }
        }
      }
    }
    
    if (isDropdownOption) {
      console.log('🎯 [Dropdown] КЛИК ПО ОПЦИИ DROPDOWN');
      const optionText = element.textContent?.trim() || element.innerText?.trim() || '';
      console.log('   - Текст опции:', optionText);
      console.log('   - Элемент:', element.tagName, element.className || 'нет классов');
      console.log('   - Родители:', this.getParentChain(element));
      
      // Находим родительский dropdown
      const parentDropdown = this.findParentDropdownForOption(element);
      if (parentDropdown) {
        console.log('   - Родительский dropdown найден:', parentDropdown.tagName, parentDropdown.id || 'нет id');
        
        // Записываем выбор значения
        await this.recordDropdownOptionSelection(parentDropdown, optionText, element);
        return; // Не обрабатываем как обычный клик
      } else {
        console.warn('   ⚠️ Родительский dropdown не найден для опции');
        // Пробуем найти через все dropdown на странице
        const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select');
        console.log(`   - Всего dropdown на странице: ${allDropdowns.length}`);
        for (const dd of allDropdowns) {
          const ddRect = dd.getBoundingClientRect();
          const elRect = element.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(elRect.left - ddRect.left, 2) + 
            Math.pow(elRect.top - ddRect.top, 2)
          );
          console.log(`      - ${dd.tagName} (${dd.id || 'нет id'}): расстояние ${Math.round(distance)}px`);
        }
      }
    }
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ПРИ КЛИКЕ НА DROPDOWN
    const isDropdown = this.isDropdownElement(element, null);
    if (isDropdown) {
      console.log('📋 [Dropdown] КЛИК ПО DROPDOWN ЭЛЕМЕНТУ');
      console.log('   - Элемент:', element.tagName, element.id || 'нет id', element.className || 'нет классов');
      console.log('   - Текст элемента:', this.selectorEngine.getElementText(element) || 'нет текста');
      console.log('   - Позиция:', element.getBoundingClientRect());
      
      // Логируем родительские элементы
      const parent = element.closest('app-select, ng-select, mat-select, [role="combobox"]');
      if (parent) {
        console.log('   - Родительский dropdown:', parent.tagName, parent.id || 'нет id', parent.className || 'нет классов');
      }
      
      // Логируем состояние ДО клика
      const beforeSnapshot = this.captureDropdownSnapshot(element, null);
      if (beforeSnapshot) {
        console.log('   - Состояние ДО клика:', {
          triggerValue: beforeSnapshot.triggerValue,
          triggerText: beforeSnapshot.triggerText,
          valueElementValue: beforeSnapshot.valueElementValue,
          valueElementText: beforeSnapshot.valueElementText
        });
      }
      
      // Логируем все видимые панели ДО клика
      const panelsBefore = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
      const visiblePanelsBefore = panelsBefore.filter(p => {
        const rect = p.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
      });
      console.log('   - Видимых панелей ДО клика:', visiblePanelsBefore.length);
      
      // Логируем все элементы в dropdown контейнере
      const dropdownContainer = element.closest('app-select, ng-select, mat-select, [role="combobox"], .select-container');
      if (dropdownContainer) {
        const allElements = Array.from(dropdownContainer.querySelectorAll('*'));
        const visibleElements = allElements.filter(el => {
          const rect = el.getBoundingClientRect();
          const text = el.textContent?.trim();
          return text && text.length > 0 && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
        });
        console.log('   - Элементов в контейнере:', allElements.length, 'видимых:', visibleElements.length);
        if (visibleElements.length > 0 && visibleElements.length <= 20) {
          console.log('   - Тексты элементов:', visibleElements.map(el => el.textContent?.trim()).filter(Boolean).slice(0, 10));
        }
      }
    }
    
    // Генерируем все возможные селекторы
    const allSelectors = this.selectorEngine.generateAllSelectors(element);
    const selector = this.selectorEngine.selectBestSelector(allSelectors);

    // Ищем альтернативные селекторы
    const alternatives = this.selectorEngine.findAlternativeSelectors(element);
    if (alternatives.length > 0) {
      selector.alternatives = alternatives;
    }

    // Собираем расширенную информацию об элементе
    const elementInfo = {
      tag: element.tagName?.toLowerCase(),
      id: element.id,
      className: element.className,
      text: this.selectorEngine.getElementText(element),
      attributes: this.getElementAttributes(element),
      // Добавляем информацию о dropdown
      isDropdown: isDropdown,
      dropdownType: isDropdown ? this.getDropdownType(element) : null,
      parentDropdown: isDropdown ? this.getParentDropdownInfo(element) : null
    };

    // #21: Отложенная запись клика для обнаружения dblclick
    // Сохраняем данные клика и запускаем таймер
    this.pendingClickAction = { element, isDropdown, elementInfo, selector, timestamp: Date.now() };
    
    // Отменяем предыдущий таймер если есть
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
    }
    
    // Запускаем новый таймер
    this.pendingClickTimeout = setTimeout(async () => {
      if (this.pendingClickAction) {
        console.log('🖱️ [Recorder] Клик подтверждён (timeout), записываю...');
        await this.recordClickAction(
          this.pendingClickAction.element, 
          'click', 
          this.pendingClickAction.isDropdown
        );
        this.pendingClickAction = null;
        this.pendingClickTimeout = null;
      }
    }, this.dblclickDetectionDelay);
    
    console.log(`🖱️ [Recorder] Клик отложен на ${this.dblclickDetectionDelay}мс для обнаружения dblclick`);
  }

  async recordClickAction(element, clickType = 'click', isDropdown = false) {
    // Генерируем все возможные селекторы
    const allSelectors = this.selectorEngine.generateAllSelectors(element);
    const selector = this.selectorEngine.selectBestSelector(allSelectors);

    // Ищем альтернативные селекторы
    const alternatives = this.selectorEngine.findAlternativeSelectors(element);
    if (alternatives.length > 0) {
      selector.alternatives = alternatives;
    }

    // Собираем расширенную информацию об элементе
    const elementInfo = {
      tag: element.tagName?.toLowerCase(),
      id: element.id,
      className: element.className,
      text: this.selectorEngine.getElementText(element),
      attributes: this.getElementAttributes(element),
      // Добавляем информацию о dropdown (только для обычного клика)
      isDropdown: clickType === 'click' ? isDropdown : false,
      dropdownType: (clickType === 'click' && isDropdown) ? this.getDropdownType(element) : null,
      parentDropdown: (clickType === 'click' && isDropdown) ? this.getParentDropdownInfo(element) : null
    };

    // Ищем заголовок поля, если элемент является полем формы
    const fieldLabel = this.findFieldLabel(element);
    
    const action = {
      type: clickType,
      selector: selector,
      element: elementInfo,
      timestamp: Date.now(),
      url: window.location.href,
      isDropdownClick: (clickType === 'click' && isDropdown) || false,
      fieldLabel: fieldLabel || undefined
    };
    
    await this.saveAction(action);
    
    if (!action.dropdownAutoFilled && isDropdown) {
      // Для dropdown всегда записываем клик с детальной информацией
      console.log('📝 [Dropdown] Записываю клик по dropdown с детальной информацией');
      
      // ПРИОРИТЕТ: Используем SeleniumUtils для автоматического поиска и записи выбранной опции
      if (this.seleniumUtils) {
        console.log('🤖 [Recorder] Использую SeleniumUtils для автоматического поиска выбранной опции...');
        
        // Сохраняем action для использования в setTimeout
        const actionMeta = action;
        const elementRef = element;
        
        // Запускаем асинхронный поиск опции через SeleniumUtils после открытия dropdown
        setTimeout(async () => {
          try {
            // Ждем открытия dropdown
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const parentDropdown = elementRef.closest('app-select, ng-select, mat-select') || elementRef;
            
            // Ищем все открытые панели (связанные с dropdown)
            const panels = this.seleniumUtils.findDropdownPanels(parentDropdown);
            console.log(`   📋 [SeleniumUtils] Найдено ${panels.length} панелей после клика (связанных с dropdown)`);
            
            // Если есть панели, ждем выбора опции
            if (panels.length > 0) {
              console.log('   ⏳ [SeleniumUtils] Ожидаю выбор опции пользователем...');
              
              // Сохраняем начальное значение
              const initialSnapshot = this.captureDropdownSnapshot(parentDropdown, actionMeta);
              const initialValue = initialSnapshot ? this.getDropdownSnapshotValue(initialSnapshot) : '';
              
              // Polling для обнаружения выбранной опции
              let attempts = 0;
              const maxAttempts = 40; // 20 секунд
              
              const checkInterval = setInterval(async () => {
                attempts++;
                
                // Проверяем, изменилось ли значение dropdown через SeleniumUtils
                let currentValue = this.findDropdownValueDirectly(parentDropdown);
                
                // ОПТИМИЗАЦИЯ: Если значение составное (содержит несколько опций), ищем конкретную выбранную опцию
                if (currentValue && currentValue.length > 30 && 
                    currentValue.includes('Плановый') && currentValue.includes('поручению') && currentValue.includes('Инициативный')) {
                  // Это составное значение, ищем конкретную выбранную опцию в панели
                  const panels = this.seleniumUtils.findDropdownPanels(parentDropdown);
                  for (const panel of panels) {
                    const options = this.seleniumUtils.findOptionsInPanel(panel);
                    for (const opt of options) {
                      const optText = this.seleniumUtils.getElementText(opt)?.trim() || opt.textContent?.trim() || '';
                      // Ищем опцию, которая выделена/активна
                      const isActive = opt.classList.contains('active') || 
                                      opt.classList.contains('selected') || 
                                      opt.getAttribute('aria-selected') === 'true' ||
                                      opt.style.backgroundColor !== '' ||
                                      opt.style.color !== '';
                      if (optText && optText.length < 30 && isActive) {
                        currentValue = optText;
                        console.log(`   🔄 [SeleniumUtils] Найдена конкретная выбранная опция: "${currentValue}"`);
                        break;
                      }
                    }
                    if (currentValue.length < 30) break;
                  }
                }
                
                if (currentValue && currentValue !== initialValue && 
                    !['выберите', 'select', 'choose', 'placeholder'].some(ph => 
                      currentValue.toLowerCase().includes(ph.toLowerCase()))) {
                  console.log(`   ✅ [SeleniumUtils] Обнаружено изменение значения: "${currentValue}" (попытка ${attempts})`);
                  clearInterval(checkInterval);
                  
                  // Отменяем обычный polling
                  if (this.dropdownPollingInterval) {
                    clearInterval(this.dropdownPollingInterval);
                    this.dropdownPollingInterval = null;
                  }
                  if (this.pendingDropdownFill) {
                    this.pendingDropdownFill = null;
                  }
                  
                  // Записываем выбор опции
                  await this.recordDropdownOptionSelection(parentDropdown, currentValue, null);
                } else if (attempts >= maxAttempts) {
                  console.log(`   ⏹️ [SeleniumUtils] Достигнут лимит попыток (${maxAttempts}), прекращаю поиск`);
                  clearInterval(checkInterval);
                }
              }, 500);
              
              // Очищаем интервал при остановке записи
              const originalInterval = this.dropdownPollingInterval;
              this.dropdownPollingInterval = checkInterval;
              
              // Очищаем при остановке записи
              const originalStopRecording = this.stopRecording.bind(this);
              this.stopRecording = () => {
                if (checkInterval) clearInterval(checkInterval);
                originalStopRecording();
              };
            }
          } catch (e) {
            console.error(`   ❌ [SeleniumUtils] Ошибка при автоматическом поиске опции: ${e.message}`);
          }
        }, 100);
      }
      
      this.queueDropdownFillVerification(element, action);
    }
  }
  
  // ==================== INLINE SELECTOR PICKER ====================
  
  /**
   * Показывает пикер селекторов для клика
   */
  async showSelectorPickerForClick(element) {
    try {
      console.log('🎯 [Picker] Показываю пикер для элемента:', element.tagName);
      
      // Генерируем ключ для элемента
      const elementKey = this._generateElementSelectorKey(element);
      
      // Проверяем, есть ли сохраненный выбор для этого элемента
      const savedChoice = this._getSavedSelectorChoice(elementKey);
      if (savedChoice) {
        console.log('💾 [Picker] Найден сохраненный выбор селектора для:', elementKey);
        
        // Генерируем все селекторы для проверки, что сохраненный селектор все еще валиден
        const allSelectors = this.selectorEngine.generateAllSelectors(element);
        
        // Ищем сохраненный селектор среди доступных
        const savedSelector = allSelectors.find(s => s.selector === savedChoice.selector);
        
        if (savedSelector) {
          console.log('✅ [Picker] Использую сохраненный селектор:', savedSelector.selector);
          // Используем сохраненный селектор без показа панели
          await this.recordClickWithSelectedSelector(element, savedSelector);
          return;
        } else {
          console.log('⚠️ [Picker] Сохраненный селектор больше не валиден, показываю панель выбора');
          // Сохраненный селектор больше не валиден, удаляем его
          this.selectorChoices.delete(elementKey);
        }
      }
      
      // Генерируем все селекторы
      const allSelectors = this.selectorEngine.generateAllSelectors(element);
      
      // Если селекторов мало, сразу записываем лучший
      if (allSelectors.length <= 1) {
        console.log('📝 [Picker] Мало селекторов, записываю лучший автоматически');
        const selector = this.selectorEngine.selectBestSelector(allSelectors);
        // Сохраняем выбор
        await this._saveSelectorChoice(elementKey, selector);
        await this.recordClickWithSelectedSelector(element, selector);
        return;
      }
      
      // Создаём пикер
      this.pendingPicker = new window.InlineSelectorPicker(element, allSelectors, {
        autoSelectTimeout: 5000,
        showScores: true,
        maxVisibleSelectors: 4
      });
      
      // Обработчик выбора
      this.pendingPicker.on('select', async (selectedSelector) => {
        console.log('✅ [Picker] Выбран селектор:', selectedSelector.selector);
        
        // ВАЖНО: Сохраняем ссылку на пикер перед установкой null, чтобы закрыть его
        const picker = this.pendingPicker;
        this.pendingPicker = null;
        
        // Сохраняем выбор для этого элемента
        await this._saveSelectorChoice(elementKey, selectedSelector);
        
        // Записываем действие с выбранным селектором
        await this.recordClickWithSelectedSelector(element, selectedSelector);
        
        // Убеждаемся, что пикер закрыт (на случай, если он еще не закрылся)
        if (picker && picker.panel && picker.panel.parentNode) {
          try {
            picker.close();
          } catch (e) {
            console.warn('⚠️ [Picker] Ошибка при закрытии пикера:', e);
          }
        }
        
        // Устанавливаем флаг, чтобы предотвратить повторное открытие сразу после закрытия
        this.pickerJustClosed = true;
        setTimeout(() => {
          this.pickerJustClosed = false;
        }, 500); // Сбрасываем флаг через 500мс
      });
      
      // Обработчик таймаута (автовыбор лучшего)
      this.pendingPicker.on('timeout', async (bestSelector) => {
        console.log('⏱️ [Picker] Таймаут, используем лучший:', bestSelector.selector);
        this.pendingPicker = null;
        
        // Сохраняем выбор (автовыбор лучшего)
        await this._saveSelectorChoice(elementKey, bestSelector);
        
        await this.recordClickWithSelectedSelector(element, bestSelector);
      });
      
      // Обработчик отмены
      this.pendingPicker.on('cancel', () => {
        console.log('❌ [Picker] Отменён пользователем');
        this.pendingPicker = null;
        // Устанавливаем флаг, чтобы предотвратить повторное открытие сразу после отмены
        this.pickerJustClosed = true;
        setTimeout(() => {
          this.pickerJustClosed = false;
        }, 500);
      });
      
      // Показываем пикер
      this.pendingPicker.show();
      
    } catch (error) {
      console.error('❌ [Picker] Ошибка:', error);
      this.pendingPicker = null;
      
      // Fallback: записываем с автоматическим выбором
      const selector = this.selectorEngine.selectBestSelector(
        this.selectorEngine.generateAllSelectors(element)
      );
      await this.recordClickWithSelectedSelector(element, selector);
    }
  }
  
  /**
   * Записывает клик с выбранным селектором
   */
  async recordClickWithSelectedSelector(element, selector) {
    // Проверяем, является ли это dropdown
    const isDropdown = this.isDropdownElement(element);
    
    // Ищем альтернативные селекторы
    const alternatives = this.selectorEngine.findAlternativeSelectors(element);
    if (alternatives.length > 0) {
      selector.alternatives = alternatives;
    }
    
    // Собираем информацию об элементе
    const elementInfo = {
      tag: element.tagName?.toLowerCase(),
      id: element.id,
      className: element.className,
      text: this.selectorEngine.getElementText(element),
      attributes: this.getElementAttributes(element),
      isDropdown: isDropdown,
      dropdownType: isDropdown ? this.getDropdownType(element) : null,
      parentDropdown: isDropdown ? this.getParentDropdownInfo(element) : null
    };
    
    // Ищем заголовок поля
    const fieldLabel = this.findFieldLabel(element);
    
    const action = {
      type: 'click',
      selector: selector,
      element: elementInfo,
      timestamp: Date.now(),
      url: window.location.href,
      isDropdownClick: isDropdown || false,
      fieldLabel: fieldLabel || undefined,
      // Помечаем, что селектор был выбран вручную через пикер
      selectorManuallySelected: true,
      selectorScore: selector.score || null
    };
    
    await this.saveAction(action);
    
    // Обработка dropdown
    if (!action.dropdownAutoFilled && isDropdown) {
      console.log('📝 [Dropdown] Записываю клик по dropdown с выбранным селектором');
      this.queueDropdownFillVerification(element, action);
    }
  }
  
  // ==================== КОНЕЦ INLINE SELECTOR PICKER ====================
  
  /**
   * Определяет тип dropdown
   */
  getDropdownType(element) {
    if (!element) return 'unknown';
    
    const tag = element.tagName?.toLowerCase();
    if (tag === 'select') return 'native';
    
    const parent = element.closest('app-select, ng-select, mat-select, p-dropdown, v-select');
    if (parent) {
      return parent.tagName.toLowerCase();
    }
    
    const role = element.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') {
      return role;
    }
    
    return 'custom';
  }
  
  /**
   * Получает информацию о родительском dropdown
   */
  getParentDropdownInfo(element) {
    if (!element) return null;
    
    const parent = element.closest('app-select, ng-select, mat-select, [role="combobox"]');
    if (!parent) return null;
    
    return {
      tag: parent.tagName?.toLowerCase(),
      id: parent.id,
      className: parent.className,
      elementId: parent.getAttribute('elementid') || parent.getAttribute('ng-reflect-element-id'),
      label: parent.getAttribute('label') || parent.getAttribute('ng-reflect-label')
    };
  }
  
  /**
   * Проверяет, является ли элемент опцией dropdown
   */
  isDropdownOption(element) {
    if (!element) return false;
    
    // Проверяем по классам
    const className = element.className || '';
    const optionClasses = [
      'option',
      'mat-option',
      'ng-option',
      'dropdown-item',
      'select-option',
      'menu__item',
      'item',
      'menu__item-active', // Для Angular меню
      'fade-in', // Анимация появления опции
      'ng-star-inserted', // Angular элемент
      // ===== ТОП-5 БИБЛИОТЕК =====
      // Ant Design
      'ant-select-item',
      'ant-select-item-option',
      // Select2
      'select2-results__option',
      // Choices.js
      'choices__item--selectable',
      'choices__item',
      // Vuetify
      'v-list-item',
      'v-list-item__content',
      // Semantic UI
      'ui dropdown item' // Может быть 'item' с родителем 'ui dropdown'
    ];
    
    const hasOptionClass = optionClasses.some(cls => 
      className.toLowerCase().includes(cls.toLowerCase())
    );
    
    // Проверяем по роли
    const role = element.getAttribute('role');
    const hasOptionRole = role === 'option';
    
    // Проверяем, находится ли в панели dropdown (расширенный поиск)
    const isInDropdownPanel = !!(
      element.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane') ||
      element.closest('[class*="menu__item"]') ||
      element.closest('[class*="option"]') ||
      // ===== ТОП-5 БИБЛИОТЕК =====
      // Ant Design
      element.closest('.ant-select-dropdown, .rc-virtual-list') ||
      // Select2
      element.closest('.select2-dropdown, .select2-results') ||
      // Choices.js
      element.closest('.choices__list--dropdown') ||
      // Vuetify
      element.closest('.v-menu__content, .v-list') ||
      // Semantic UI
      element.closest('.ui.dropdown .menu')
    );
    
    // Проверяем, есть ли текст (опции обычно имеют текст)
    const text = element.textContent?.trim() || element.innerText?.trim() || '';
    const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
    const hasText = text && 
                    text.length > 0 &&
                    !placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
    
    // Дополнительная проверка: элемент должен быть видимым и кликабельным
    const rect = element.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && element.offsetParent !== null;
    
    // Проверяем, что элемент кликабельный (не disabled, не скрыт)
    const isClickable = !element.hasAttribute('disabled') && 
                       !element.classList.contains('disabled') &&
                       getComputedStyle(element).pointerEvents !== 'none' &&
                       getComputedStyle(element).display !== 'none';
    
    // Проверяем, что это не сам dropdown контейнер
    const isNotDropdownContainer = !element.closest('app-select')?.contains(element) || 
                                   element.closest('app-select') !== element;
    
    // ЛОГИРОВАНИЕ ПРОВЕРКИ
    console.log(`   🔍 Проверка isDropdownOption:`, {
      hasOptionClass,
      hasOptionRole,
      isInDropdownPanel,
      hasText: !!hasText,
      text: text.substring(0, 30),
      isVisible,
      isClickable,
      isNotDropdownContainer,
      className: className.substring(0, 50)
    });
    
    // Если элемент находится в панели dropdown и имеет текст, это опция
    if (isInDropdownPanel && hasText && isVisible && isClickable) {
      console.log('   ✅ Определено как опция: находится в панели dropdown');
      return true;
    }
    
    // Если имеет класс опции и текст
    if ((hasOptionClass || hasOptionRole) && hasText && isVisible && isClickable) {
      console.log('   ✅ Определено как опция: имеет класс опции');
      return true;
    }
    
    // Дополнительная проверка: если элемент кликабельный и находится в меню
    if (isInDropdownPanel && isVisible && isClickable) {
      // Проверяем, не является ли это плейсхолдером или заголовком
      const isPlaceholderCheck = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
      const isHeader = (text.toLowerCase().includes('статус') && text.length < 20) ||
                       (text.toLowerCase().includes('тип') && text.length < 20);
      
      // Проверяем, что текст не слишком длинный (не весь контент dropdown)
      const isReasonableLengthCheck = text.length > 0 && text.length < 100;
      
      if (!isPlaceholderCheck && !isHeader && isReasonableLengthCheck && isNotDropdownContainer) {
        console.log('   ✅ Определено как опция: видимый кликабельный элемент в панели dropdown');
        return true;
      }
    }
    
    // Последняя проверка: если элемент кликается и имеет текст опции, но не находится в панели
    // (возможно, панель еще не открыта или находится в другом месте DOM)
    const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
    const isReasonableLength = text.length > 0 && text.length < 100;
    
    if (hasText && isVisible && isClickable && !isPlaceholder && isReasonableLength) {
      // Проверяем, есть ли рядом открытые панели dropdown
      const nearbyPanels = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="menu"], [class*="content-list"]'))
        .filter(p => {
          const pRect = p.getBoundingClientRect();
          const eRect = element.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(pRect.left - eRect.left, 2) + 
            Math.pow(pRect.top - eRect.top, 2)
          );
          return distance < 500 && pRect.width > 0 && pRect.height > 0 && p.offsetParent !== null;
        });
      
      if (nearbyPanels.length > 0) {
        // Дополнительная проверка: элемент должен находиться внутри одной из панелей
        const isInsidePanel = nearbyPanels.some(panel => panel.contains(element));
        if (isInsidePanel) {
          console.log('   ✅ Определено как опция: элемент внутри открытой панели dropdown');
          return true;
        }
        console.log('   ✅ Определено как опция: элемент рядом с открытой панелью dropdown');
        return true;
      }
    }
    
    // Еще одна проверка: если элемент находится внутри элемента с классом, указывающим на опцию
    const parentWithOptionClass = element.closest('[class*="option"], [class*="item"], [class*="menu__item"]');
    if (parentWithOptionClass && parentWithOptionClass !== element) {
      const parentText = parentWithOptionClass.textContent?.trim() || '';
      const isParentPlaceholder = placeholderTexts.some(ph => parentText.toLowerCase().includes(ph.toLowerCase()));
      const isParentReasonableLength = parentText.length > 0 && parentText.length < 100;
      
      if (!isParentPlaceholder && isParentReasonableLength && isVisible && isClickable) {
        // Проверяем, находится ли родитель в панели dropdown
        const isParentInPanel = !!parentWithOptionClass.closest('[class*="panel"], [class*="overlay"], [class*="menu"], [class*="content-list"]');
        if (isParentInPanel) {
          console.log('   ✅ Определено как опция: элемент внутри родителя с классом опции в панели dropdown');
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Получает цепочку родительских элементов для отладки
   */
  getParentChain(element) {
    const chain = [];
    let current = element;
    for (let i = 0; i < 5 && current; i++) {
      chain.push({
        tag: current.tagName,
        id: current.id || 'нет id',
        className: (current.className || '').substring(0, 50)
      });
      current = current.parentElement;
    }
    return chain;
  }
  
  /**
   * Находит родительский dropdown для опции
   * Использует SeleniumUtils для улучшенного поиска (логика из автотеста)
   */
  findParentDropdownForOption(optionElement) {
    if (!optionElement) return null;
    
    console.log('🔍 [Dropdown] Ищу родительский dropdown для опции...');
    
    // ПРИОРИТЕТ: Используем SeleniumUtils для поиска (логика из автотеста)
    if (this.seleniumUtils) {
      console.log('   🔍 [SeleniumUtils] Использую SeleniumUtils для поиска родительского dropdown');
      // Ищем через панели dropdown (как в автотесте)
      const panels = this.seleniumUtils.findDropdownPanels();
      console.log(`   📋 [SeleniumUtils] Найдено ${panels.length} панелей dropdown`);
      for (const panel of panels) {
        if (panel.contains(optionElement)) {
          // Находим ближайший dropdown к панели
          const dropdown = panel.closest('app-select, ng-select, mat-select');
          if (dropdown) {
            console.log('   ✅ [SeleniumUtils] Найден через панель:', dropdown.tagName);
            return dropdown;
          }
        }
      }
      console.log('   ℹ️ [SeleniumUtils] Опция не найдена в панелях, пробую обычный поиск...');
    } else {
      console.warn('   ⚠️ [SeleniumUtils] Утилита недоступна, использую обычный поиск');
    }
    
    // Ищем ближайший dropdown контейнер
    const dropdown = optionElement.closest('app-select, ng-select, mat-select, [role="combobox"], .select-container');
    if (dropdown) {
      console.log('   ✅ Найден через closest:', dropdown.tagName);
      return dropdown;
    }
    
    // Ищем через панель
    const panel = optionElement.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane');
    if (panel) {
      console.log('   📋 Найдена панель:', panel.tagName, panel.className || 'нет классов');
      const panelRect = panel.getBoundingClientRect();
      
      // Ищем app-select на странице, который может быть связан с этой панелью
      const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select, [role="combobox"]');
      console.log(`   🔍 Проверяю ${allDropdowns.length} dropdown на странице...`);
      
      let closestDropdown = null;
      let minDistance = Infinity;
      
      for (const dd of allDropdowns) {
        const ddRect = dd.getBoundingClientRect();
        
        // Проверяем, находится ли панель рядом с dropdown
        const distanceX = Math.abs(panelRect.left - ddRect.left);
        const distanceY = Math.abs(panelRect.top - (ddRect.bottom + 5));
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        
        console.log(`      - ${dd.tagName} (${dd.id || 'нет id'}): расстояние ${Math.round(distance)}px`);
        
        if (distance < 500 && distance < minDistance) {
          minDistance = distance;
          closestDropdown = dd;
        }
      }
      
      if (closestDropdown) {
        console.log(`   ✅ Найден ближайший dropdown: ${closestDropdown.tagName} (расстояние ${Math.round(minDistance)}px)`);
        return closestDropdown;
      }
    }
    
    // Последняя попытка: ищем по тексту опции в открытых dropdown
    // Если dropdown открыт, его значение может совпадать с текстом опции
    const optionText = optionElement.textContent?.trim() || '';
    if (optionText) {
      const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select');
      for (const dd of allDropdowns) {
        const resultElement = dd.querySelector('.result, [class*="result"], [id*="result"]');
        if (resultElement) {
          const resultText = resultElement.textContent?.trim() || resultElement.innerText?.trim() || '';
          // Если текст совпадает или dropdown открыт (есть видимые панели рядом)
          const nearbyPanels = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="menu"]'))
            .filter(p => {
              const pRect = p.getBoundingClientRect();
              const ddRect = dd.getBoundingClientRect();
              const dist = Math.sqrt(
                Math.pow(pRect.left - ddRect.left, 2) + 
                Math.pow(pRect.top - ddRect.bottom, 2)
              );
              return dist < 500 && pRect.width > 0 && pRect.height > 0 && p.offsetParent !== null;
            });
          
          if (nearbyPanels.length > 0 && nearbyPanels[0].contains(optionElement)) {
            console.log(`   ✅ Найден dropdown по панели, содержащей опцию`);
            return dd;
          }
        }
      }
    }
    
    console.warn('   ⚠️ Родительский dropdown не найден');
    return null;
  }
  
  /**
   * Записывает выбор опции в dropdown
   * Использует SeleniumUtils для улучшенного поиска (логика из автотеста)
   */
  async recordDropdownOptionSelection(dropdownElement, optionText, optionElement) {
    try {
      console.log(`📝 [Dropdown] Записываю выбор опции: "${optionText}"`);
      
      // ПРИОРИТЕТ: Используем SeleniumUtils для проверки и улучшения поиска опций
      if (this.seleniumUtils) {
        // Проверяем, что опция действительно найдена через SeleniumUtils (логика из автотеста)
        const foundOption = this.seleniumUtils.findOptionByText(optionText) || 
                           this.seleniumUtils.findOptionByTextGlobal(optionText, dropdownElement);
        
        if (foundOption && foundOption !== optionElement) {
          console.log(`   🔄 [SeleniumUtils] Найдена альтернативная опция через SeleniumUtils`);
          optionElement = foundOption;
        }
      }
      
      // Генерируем селекторы для dropdown
      const allSelectors = this.selectorEngine.generateAllSelectors(dropdownElement);
      const selector = this.selectorEngine.selectBestSelector(allSelectors);
      
      // Собираем информацию о dropdown
      const elementInfo = {
        tag: dropdownElement.tagName?.toLowerCase(),
        id: dropdownElement.id,
        className: dropdownElement.className,
        text: this.selectorEngine.getElementText(dropdownElement),
        attributes: this.getElementAttributes(dropdownElement),
        isDropdown: true,
        dropdownType: this.getDropdownType(dropdownElement),
        parentDropdown: this.getParentDropdownInfo(dropdownElement)
      };
      
      // Ищем заголовок поля для dropdown
      const fieldLabel = this.findFieldLabel(dropdownElement);
      
      // Создаем действие input для выбора значения
      const action = {
        type: 'input',
        selector: selector,
        element: elementInfo,
        value: optionText,
        displayValue: optionText,
        dropdownAutoFilled: true,
        timestamp: Date.now(),
        url: window.location.href,
        isDropdownSelection: true,
        fieldLabel: fieldLabel || undefined,
        optionElement: {
          tag: optionElement.tagName?.toLowerCase(),
          className: optionElement.className,
          text: optionText
        }
      };
      
      // Сохраняем действие
      await this.saveAction(action);
      
      // Отменяем ожидание заполнения, так как значение уже выбрано
      if (this.pendingDropdownFill) {
        console.log('✅ [Dropdown] Отменяю ожидание заполнения, значение уже выбрано');
        this.cancelDropdownFillVerification();
      }
      
      console.log(`✅ [Dropdown] Выбор опции "${optionText}" записан`);
    } catch (error) {
      console.error('❌ [Dropdown] Ошибка при записи выбора опции:', error);
    }
  }

  async handleChange(event) {
    if (!this.isRecording) return;

    const element = event.target;
    
    // Сохраняем pending input перед обработкой change (переход к другому полю)
    const elementKey = this.getElementKey(element);
    if (this.pendingInput && this.pendingInput.elementKey !== elementKey) {
      await this.savePendingInput();
    }
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ СОБЫТИЯ CHANGE
    console.log('📝 [Dropdown] Событие change:', {
      tag: element.tagName,
      id: element.id,
      className: element.className,
      value: event.target.value,
      text: element.textContent?.trim()
    });
    
    const allSelectors = this.selectorEngine.generateAllSelectors(element);
    const selector = this.selectorEngine.selectBestSelector(allSelectors);

    const alternatives = this.selectorEngine.findAlternativeSelectors(element);
    if (alternatives.length > 0) {
      selector.alternatives = alternatives;
    }

    const elementInfo = {
      tag: element.tagName?.toLowerCase(),
      id: element.id,
      className: element.className,
      text: this.selectorEngine.getElementText(element),
      attributes: this.getElementAttributes(element)
    };
    
    // Ищем заголовок поля
    const fieldLabel = this.findFieldLabel(element);
    
    // #22: Для native <select> добавляем текст выбранной опции
    let selectedOptionText = null;
    let selectedOptionValue = event.target.value;
    
    if (element.tagName === 'SELECT') {
      const selectedOption = element.options[element.selectedIndex];
      if (selectedOption) {
        selectedOptionText = selectedOption.text?.trim() || selectedOption.label?.trim();
        console.log(`📝 [Select] Native select изменён: value="${selectedOptionValue}", text="${selectedOptionText}"`);
      }
    }
    
    const action = {
      type: 'change',
      selector: selector,
      element: elementInfo,
      value: selectedOptionValue,
      // #22: Добавляем текст выбранной опции для native select
      selectedOptionText: selectedOptionText,
      timestamp: Date.now(),
      url: window.location.href,
      fieldLabel: fieldLabel || undefined
    };
    
    await this.saveAction(action);
    
    // Пробуем разрешить заполнение dropdown
    const resolved = this.resolveDropdownFill(element, action.value);
    
    // Если не разрешили через resolveDropdownFill, пробуем найти значение в родительском dropdown
    if (!resolved && this.isDropdownElement(element, action)) {
      console.log('🔍 [Dropdown] Пробую найти значение в родительском dropdown...');
      const parentDropdown = element.closest('app-select, ng-select, mat-select, [role="combobox"]');
      if (parentDropdown) {
        const dropdownValue = this.findDropdownValueInParent(parentDropdown);
        if (dropdownValue && dropdownValue.trim().length > 0) {
          console.log(`✅ [Dropdown] Найдено значение в родительском dropdown: "${dropdownValue}"`);
          this.resolveDropdownFill(parentDropdown, dropdownValue);
        }
      }
    }
  }
  
  /**
   * Получает данные авторизации (если есть)
   */
  getAuthData() {
    // Можно расширить для получения данных из localStorage, cookies и т.д.
    try {
      const authData = {};
      // Пример: получение данных из localStorage
      const storedAuth = localStorage.getItem('authData');
      if (storedAuth) {
        try {
          return JSON.parse(storedAuth);
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
      return authData;
    } catch (error) {
      return {};
    }
  }

  /**
   * Получает преднастройки (если есть)
   */
  getPreconditions() {
    // Можно расширить для получения преднастроек
    const preconditions = [];
    
    // Пример: получение URL текущей страницы как преднастройка
    if (window.location.href) {
      preconditions.push(`Начальная страница: ${window.location.href}`);
    }
    
    return preconditions;
  }

  /**
   * Обрабатывает запрос на экспорт теста в Excel из background
   */
  async handleExcelExportRequest(test, trigger, runHistory = null) {
    try {
      console.log(`📊 [ExcelExport] Получен запрос на экспорт теста ${test.id}, триггер: ${trigger}`);
      
      if (!window.ExcelExporter) {
        console.error('❌ [ExcelExport] ExcelExporter не загружен');
        return;
      }

      const exporter = new window.ExcelExporter();
      await exporter.init();

      // Проверяем настройки экспорта
      let shouldExport = false;
      if (trigger === 'save') {
        shouldExport = exporter.shouldExportOnRecord();
      } else if (trigger === 'history') {
        shouldExport = exporter.shouldExportOnPlay();
      }

      if (!shouldExport) {
        console.log(`ℹ️ [ExcelExport] Экспорт при ${trigger} отключен в настройках`);
        return;
      }

      // Экспортируем тест
      await exporter.exportTestToExcel(test, trigger === 'save' ? 'record' : 'play', {
        authData: this.getAuthData(),
        preconditions: this.getPreconditions(),
        runHistory: runHistory
      }, {
        promptForLocation: false
      });

      console.log(`✅ [ExcelExport] Тест успешно экспортирован (триггер: ${trigger})`);
    } catch (error) {
      console.error('❌ [ExcelExport] Ошибка при экспорте:', error);
      throw error;
    }
  }

  /**
   * Находит заголовок поля (label) рядом с элементом
   * Ищет label элементы, заголовки в родительских контейнерах и т.д.
   */
  findFieldLabel(element) {
    if (!element) return null;
    
    // 1. Ищем label элемент с атрибутом for, связанный с элементом
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        const labelText = label.textContent?.trim() || label.innerText?.trim();
        if (labelText && labelText.length > 0) {
          return labelText;
        }
      }
    }
    
    // 2. Ищем label элемент, который содержит наш элемент
    const parentLabel = element.closest('label');
    if (parentLabel) {
      const labelText = parentLabel.textContent?.trim() || parentLabel.innerText?.trim();
      if (labelText && labelText.length > 0) {
        // Убираем текст самого элемента из текста label
        const elementText = element.textContent?.trim() || element.value?.trim() || '';
        if (labelText !== elementText) {
          return labelText;
        }
      }
    }
    
    // 3. Ищем заголовок в родительских контейнерах (обычно это div с классом или span с текстом)
    let current = element.parentElement;
    let depth = 0;
    const maxDepth = 6;
    
    while (current && depth < maxDepth) {
      // Ищем label элементы в родителе
      const labels = current.querySelectorAll('label');
      for (const label of labels) {
        // Проверяем, что label находится перед нашим элементом или в том же контейнере
        const labelRect = label.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // Label должен быть выше или слева от элемента
        if (labelRect.bottom <= elementRect.top + 20 || 
            (labelRect.right <= elementRect.left && Math.abs(labelRect.top - elementRect.top) < 30)) {
          const labelText = label.textContent?.trim() || label.innerText?.trim();
          if (labelText && labelText.length > 0 && labelText.length < 100) {
            return labelText;
          }
        }
      }
      
      // Ищем текстовые элементы (span, div, p) с текстом, которые могут быть заголовками
      const textElements = current.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
      for (const textEl of textElements) {
        // Пропускаем скрытые элементы
        if (textEl.offsetParent === null) continue;
        
        const text = textEl.textContent?.trim() || textEl.innerText?.trim();
        if (text && text.length > 0 && text.length < 100) {
          // Проверяем, что элемент находится перед нашим элементом
          const textRect = textEl.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          
          // Элемент должен быть выше или слева от нашего элемента
          if ((textRect.bottom <= elementRect.top + 10 && textRect.right >= elementRect.left - 50) ||
              (textRect.right <= elementRect.left && Math.abs(textRect.top - elementRect.top) < 30)) {
            // Проверяем, что это не placeholder и не значение поля
            const lowerText = text.toLowerCase();
            if (!lowerText.includes('выберите') && 
                !lowerText.includes('select') && 
                !lowerText.includes('choose') &&
                !lowerText.includes('placeholder') &&
                textEl !== element) {
              return text;
            }
          }
        }
      }
      
      // Проверяем атрибут label у родительских элементов (для Angular компонентов)
      const labelAttr = current.getAttribute('label') || 
                       current.getAttribute('ng-reflect-label') ||
                       current.getAttribute('aria-label');
      if (labelAttr && labelAttr.trim().length > 0 && labelAttr.trim().length < 100) {
        return labelAttr.trim();
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return null;
  }

  /**
   * Находит значение в родительском dropdown контейнере
   */
  findDropdownValueInParent(parentElement) {
    if (!parentElement) return null;
    
    // Ищем значение в различных местах
    const valueSelectors = [
      '.result',
      '[class*="result"]',
      '.selected-value',
      '[class*="selected"]',
      '.value',
      '[class*="value"]',
      'input[type="hidden"]',
      '.ng-value',
      '.mat-select-value',
      '.ant-select-selection-item'
    ];
    
    for (const selector of valueSelectors) {
      const element = parentElement.querySelector(selector);
      if (element) {
        const value = element.value || 
                     element.textContent?.trim() || 
                     element.innerText?.trim() ||
                     element.getAttribute('value') ||
                     element.getAttribute('data-value');
        if (value && value.trim().length > 0) {
          return value.trim();
        }
      }
    }
    
    // Пробуем получить текст из самого контейнера
    const containerText = parentElement.textContent?.trim() || parentElement.innerText?.trim();
    if (containerText && containerText.length > 0 && 
        containerText.toLowerCase() !== 'выберите' &&
        containerText.toLowerCase() !== 'select' &&
        containerText.toLowerCase() !== 'choose') {
      return containerText;
    }
    
    return null;
  }

  async handleInput(event) {
    if (!this.isRecording) return;

    const element = event.target;
    
    // Пропускаем для dropdown элементов (они обрабатываются отдельно)
    if (this.isDropdownElement(element, { type: 'input' })) {
      return;
    }
    
    // Пропускаем для элементов, которые не являются полями ввода
    const isInputField = element.tagName === 'INPUT' || 
                        element.tagName === 'TEXTAREA' ||
                        element.contentEditable === 'true';
    if (!isInputField) {
      return;
    }
    
    // Генерируем селекторы только один раз для элемента
    let selector, elementInfo;
    const elementKey = this.getElementKey(element);
    
    // Получаем значение элемента (для contentEditable используем textContent)
    const getElementValue = (el) => {
      if (el.contentEditable === 'true') {
        return el.textContent || el.innerText || '';
      }
      return el.value || '';
    };
    
    const currentValue = getElementValue(element);
    
    // Если это тот же элемент, обновляем только значение
    if (this.pendingInput && this.pendingInput.elementKey === elementKey) {
      this.pendingInput.value = currentValue;
      this.pendingInput.timestamp = Date.now();
    } else {
      // Новый элемент - сохраняем предыдущий input (если был) и начинаем отслеживать новый
      await this.savePendingInput();
      
      const allSelectors = this.selectorEngine.generateAllSelectors(element);
      selector = this.selectorEngine.selectBestSelector(allSelectors);

      const alternatives = this.selectorEngine.findAlternativeSelectors(element);
      if (alternatives.length > 0) {
        selector.alternatives = alternatives;
      }

      elementInfo = {
        tag: element.tagName?.toLowerCase(),
        id: element.id,
        className: element.className,
        text: this.selectorEngine.getElementText(element),
        attributes: this.getElementAttributes(element)
      };
      
      // Ищем заголовок поля
      const fieldLabel = this.findFieldLabel(element);
      
      this.pendingInput = {
        elementKey,
        element,
        selector,
        elementInfo,
        value: currentValue,
        timestamp: Date.now(),
        fieldLabel: fieldLabel || undefined
      };
    }
    
    // Сбрасываем таймаут и устанавливаем новый
    if (this.pendingInputTimeout) {
      clearTimeout(this.pendingInputTimeout);
    }
    
    // Автосохранение через задержку после последнего ввода
    this.pendingInputTimeout = setTimeout(() => {
      this.savePendingInput();
    }, this.inputDebounceDelay);
    
    // Для dropdown элементов пробуем разрешить заполнение (используем уже полученное значение)
    this.resolveDropdownFill(element, currentValue);
  }
  
  /**
   * Генерирует уникальный ключ для элемента (для сравнения)
   */
  getElementKey(element) {
    if (!element) return null;
    const id = element.id ? `#${element.id}` : '';
    const name = element.name ? `[name="${element.name}"]` : '';
    const tag = element.tagName?.toLowerCase() || '';
    return `${tag}${id}${name}`;
  }
  
  /**
   * Сохраняет отложенное input действие
   */
  async savePendingInput() {
    if (!this.pendingInput) return;
    
    if (this.pendingInputTimeout) {
      clearTimeout(this.pendingInputTimeout);
      this.pendingInputTimeout = null;
    }
    
    const { selector, elementInfo, value, timestamp, fieldLabel } = this.pendingInput;
    
    const action = {
      type: 'input',
      selector: selector,
      element: elementInfo,
      value: value,
      timestamp: timestamp,
      url: window.location.href,
      fieldLabel: fieldLabel || undefined
    };
    
    await this.saveAction(action);
    
    // Очищаем pending input
    this.pendingInput = null;
  }
  
  /**
   * Очищает отложенное input действие без сохранения
   */
  clearPendingInput() {
    if (this.pendingInputTimeout) {
      clearTimeout(this.pendingInputTimeout);
      this.pendingInputTimeout = null;
    }
    this.pendingInput = null;
  }
  
  /**
   * Обработчик blur - сохраняет финальное значение input
   */
  async handleBlur(event) {
    if (!this.isRecording) return;
    
    const element = event.target;
    const elementKey = this.getElementKey(element);
    
    // Если это поле с pending input, сохраняем его
    if (this.pendingInput && this.pendingInput.elementKey === elementKey) {
      await this.savePendingInput();
    }
  }
  
  /**
   * Обработчик submit - сохраняет все pending input перед отправкой формы
   */
  async handleSubmit(event) {
    if (!this.isRecording) return;
    
    // Сохраняем все pending input перед отправкой формы
    await this.savePendingInput();
  }

  normalizeClassName(classValue) {
    if (!classValue) return '';
    if (typeof classValue === 'string') return classValue;
    if (typeof classValue?.baseVal === 'string') return classValue.baseVal;
    if (typeof classValue?.value === 'string') return classValue.value;
    if (typeof classValue === 'object' && typeof classValue.length === 'number' && typeof classValue.item === 'function') {
      // DOMTokenList или подобный объект
      return Array.from(classValue).join(' ');
    }
    if (Array.isArray(classValue)) {
      return classValue.join(' ');
    }
    if (typeof classValue?.toString === 'function') {
      const result = classValue.toString();
      return typeof result === 'string' ? result : '';
    }
    return '';
  }

  /**
   * Получает атрибуты элемента
   */
  getElementAttributes(element) {
    const attrs = {};
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  async handleContextInvalidated(action) {
    try {
      await this.delay(500);
      
      if (chrome.runtime?.id) {
        console.log('✅ Extension context восстановлен');
        const retryResponse = await chrome.runtime.sendMessage({
          type: 'ADD_ACTION',
          action: action
        });
        
        if (retryResponse && retryResponse.success) {
          console.log('✅ Действие сохранено после переподключения');
        }
      }
    } catch (error) {
      console.error('❌ Ошибка восстановления контекста:', error);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 1000);
        return;
      }
      
      window.addEventListener('load', () => {
        setTimeout(resolve, 1000);
      }, { once: true });
      
      setTimeout(resolve, 5000);
    });
  }

  // ==================== КОНТЕКСТНОЕ МЕНЮ ДЛЯ ПЕРЕМЕННЫХ ====================
  
  /**
   * Обработчик события mouseup - сохраняем выделенный текст
   */
  handleMouseUp(event) {
    if (!this.isRecording) return;
    
    // Пропускаем клики по элементам плагина
    if (this.isPluginElement(event.target)) return;
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      this.selectedTextForVariable = {
        text: selectedText,
        element: event.target,
        x: event.clientX,
        y: event.clientY
      };
      console.log('📝 [Variable] Текст выделен:', selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''));
    } else {
      this.selectedTextForVariable = null;
    }
  }
  
  /**
   * Обработчик контекстного меню - показываем меню переменных
   */
  handleContextMenu(event) {
    if (!this.isRecording) return;
    
    // Пропускаем клики по элементам плагина
    if (this.isPluginElement(event.target)) return;
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // Показываем меню переменных только если есть выделенный текст
    if (selectedText && selectedText.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      
      this.selectedTextForVariable = {
        text: selectedText,
        element: event.target,
        x: event.clientX,
        y: event.clientY
      };
      
      this.showVariableContextMenu(event.clientX, event.clientY, selectedText);
      return false;
    }
  }
  
  /**
   * Показывает контекстное меню для назначения переменных
   */
  showVariableContextMenu(x, y, selectedText) {
    // Удаляем предыдущее меню если есть
    this.hideVariableContextMenu();
    
    // Создаём контейнер меню
    const menu = document.createElement('div');
    menu.id = 'autotest-variable-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      z-index: 9999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      min-width: 250px;
      overflow: hidden;
    `;
    
    // Заголовок меню
    const header = document.createElement('div');
    header.style.cssText = `
      background: linear-gradient(135deg, #9c27b0, #673ab7);
      color: white;
      padding: 10px 14px;
      font-weight: bold;
      font-size: 13px;
    `;
    header.innerHTML = `📦 Сохранить в переменную`;
    menu.appendChild(header);
    
    // Превью выделенного текста
    const preview = document.createElement('div');
    preview.style.cssText = `
      padding: 8px 14px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      max-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    const previewText = selectedText.length > 80 ? selectedText.substring(0, 80) + '...' : selectedText;
    preview.innerHTML = `<strong>Текст:</strong> "${this.escapeHtml(previewText)}"`;
    menu.appendChild(preview);
    
    // Список слотов переменных
    const list = document.createElement('div');
    list.style.cssText = `padding: 8px 0;`;
    
    this.variableSlots.forEach((slot) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 10px 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.15s;
      `;
      item.innerHTML = `
        <span style="background: #9c27b0; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">var${slot}</span>
        <span>Назначить переменную ${slot}</span>
      `;
      
      item.addEventListener('mouseenter', () => {
        item.style.background = '#f0e6f6';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.assignTextToVariable(slot, selectedText);
        this.hideVariableContextMenu();
      });
      
      list.appendChild(item);
    });
    
    menu.appendChild(list);
    
    // Разделитель
    const divider = document.createElement('div');
    divider.style.cssText = `height: 1px; background: #e0e0e0; margin: 0;`;
    menu.appendChild(divider);
    
    // Кнопка "Ввести имя вручную"
    const customItem = document.createElement('div');
    customItem.style.cssText = `
      padding: 10px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #1976D2;
      transition: background 0.15s;
    `;
    customItem.innerHTML = `
      <span>✏️</span>
      <span>Ввести имя переменной...</span>
    `;
    customItem.addEventListener('mouseenter', () => {
      customItem.style.background = '#e3f2fd';
    });
    customItem.addEventListener('mouseleave', () => {
      customItem.style.background = 'transparent';
    });
    customItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showCustomVariableNamePrompt(selectedText);
      this.hideVariableContextMenu();
    });
    menu.appendChild(customItem);
    
    // Добавляем в DOM
    document.body.appendChild(menu);
    this.variableContextMenu = menu;
    
    // Корректируем позицию если меню выходит за границы экрана
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
    
    // Закрываем меню при клике вне его
    setTimeout(() => {
      document.addEventListener('click', this.closeContextMenuOnClick = (e) => {
        if (!menu.contains(e.target)) {
          this.hideVariableContextMenu();
        }
      }, true);
      
      document.addEventListener('keydown', this.closeContextMenuOnEscape = (e) => {
        if (e.key === 'Escape') {
          this.hideVariableContextMenu();
        }
      }, true);
    }, 100);
    
    console.log('📋 [Variable] Показано контекстное меню для переменных');
  }
  
  /**
   * Скрывает контекстное меню переменных
   */
  hideVariableContextMenu() {
    if (this.variableContextMenu) {
      this.variableContextMenu.remove();
      this.variableContextMenu = null;
    }
    
    if (this.closeContextMenuOnClick) {
      document.removeEventListener('click', this.closeContextMenuOnClick, true);
      this.closeContextMenuOnClick = null;
    }
    
    if (this.closeContextMenuOnEscape) {
      document.removeEventListener('keydown', this.closeContextMenuOnEscape, true);
      this.closeContextMenuOnEscape = null;
    }
  }
  
  /**
   * Показывает prompt для ввода произвольного имени переменной
   */
  showCustomVariableNamePrompt(selectedText) {
    // Создаём модальное окно
    const modal = document.createElement('div');
    modal.id = 'autotest-variable-name-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999999;
      font-family: Arial, sans-serif;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      width: 400px;
      max-width: 90%;
      overflow: hidden;
    `;
    
    dialog.innerHTML = `
      <div style="background: linear-gradient(135deg, #9c27b0, #673ab7); color: white; padding: 16px 20px; font-weight: bold;">
        📦 Новая переменная
      </div>
      <div style="padding: 20px;">
        <div style="margin-bottom: 12px; font-size: 13px; color: #666;">
          <strong>Значение:</strong> "${this.escapeHtml(selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText)}"
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #333;">Имя переменной:</label>
          <input type="text" id="autotest-variable-name-input" placeholder="myVariable" 
                 style="width: 100%; padding: 10px 12px; border: 2px solid #9c27b0; border-radius: 6px; font-size: 14px; box-sizing: border-box; outline: none;">
          <div style="font-size: 11px; color: #999; margin-top: 4px;">
            Латинские буквы, цифры и подчёркивание. Начинается с буквы.
          </div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="autotest-variable-cancel" style="padding: 10px 20px; border: 1px solid #ccc; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
            Отмена
          </button>
          <button id="autotest-variable-save" style="padding: 10px 20px; border: none; background: linear-gradient(135deg, #9c27b0, #673ab7); color: white; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">
            💾 Сохранить
          </button>
        </div>
      </div>
    `;
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    const input = dialog.querySelector('#autotest-variable-name-input');
    const saveBtn = dialog.querySelector('#autotest-variable-save');
    const cancelBtn = dialog.querySelector('#autotest-variable-cancel');
    
    // Фокус на поле ввода
    setTimeout(() => input.focus(), 100);
    
    // Обработчики
    const closeModal = () => {
      modal.remove();
    };
    
    const saveVariable = () => {
      const varName = input.value.trim();
      if (!varName) {
        input.style.borderColor = '#f44336';
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
        input.style.borderColor = '#f44336';
        alert('Имя переменной должно начинаться с буквы и содержать только латинские буквы, цифры и подчёркивание');
        return;
      }
      this.assignTextToVariable(varName, selectedText);
      closeModal();
    };
    
    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveVariable);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveVariable();
      if (e.key === 'Escape') closeModal();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
  
  /**
   * Назначает выделенный текст переменной и записывает действие
   */
  async assignTextToVariable(variableName, text) {
    // Нормализуем имя переменной (удаляем # если есть)
    const cleanName = variableName.replace(/^#/, 'var');
    
    console.log(`📦 [Variable] Назначение переменной: ${cleanName} = "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    try {
      // Создаём действие для записи переменной
      const action = {
        type: 'setVariable',
        variableName: cleanName,
        variableValue: text,
        source: 'selection', // Источник - выделение текста
        url: window.location.href,
        timestamp: Date.now(),
        description: `Переменная ${cleanName} из выделенного текста`
      };
      
      // Если есть информация о элементе, добавляем селектор
      if (this.selectedTextForVariable?.element) {
        try {
          const selector = this.selectorEngine.generate(this.selectedTextForVariable.element);
          action.sourceSelector = selector;
          action.sourceElement = {
            tagName: this.selectedTextForVariable.element.tagName,
            className: this.selectedTextForVariable.element.className || ''
          };
        } catch (e) {
          // Игнорируем ошибки генерации селектора
        }
      }
      
      // Отправляем действие в background script
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_ACTION',
        action: action
      });
      
      if (response?.success) {
        this.showVariableAssignedNotification(cleanName, text);
        console.log(`✅ [Variable] Переменная ${cleanName} записана в тест`);
      } else {
        console.error('❌ [Variable] Ошибка записи переменной:', response?.error);
        this.showErrorNotification('Ошибка записи переменной');
      }
    } catch (error) {
      console.error('❌ [Variable] Ошибка:', error);
      this.showErrorNotification('Ошибка: ' + error.message);
    }
    
    // Очищаем выделение
    window.getSelection().removeAllRanges();
    this.selectedTextForVariable = null;
  }
  
  /**
   * Показывает уведомление об успешном назначении переменной
   */
  showVariableAssignedNotification(varName, value) {
    const notification = document.createElement('div');
    notification.id = 'autotest-variable-notification';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4caf50, #2e7d32);
      color: white;
      padding: 14px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 9999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 350px;
      animation: slideIn 0.3s ease-out;
    `;
    
    const displayValue = value.length > 40 ? value.substring(0, 40) + '...' : value;
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px;">✅ Переменная сохранена</div>
      <div style="font-size: 12px; opacity: 0.9;">
        <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 3px; font-weight: bold;">\${${varName}}</span>
        = "${this.escapeHtml(displayValue)}"
      </div>
    `;
    
    // Добавляем анимацию
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 300);
    }, 3000);
  }
  
  /**
   * Показывает уведомление об ошибке
   */
  showErrorNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 14px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 9999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;
    notification.innerHTML = `❌ ${this.escapeHtml(message)}`;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
  
  /**
   * Экранирует HTML для безопасного отображения
   */
  escapeHtml(text) {
    // Используем глобальную функцию из shared/utils.js если доступна
    if (window.Utils && typeof window.Utils.escapeHtml === 'function') {
      return window.Utils.escapeHtml(text);
    }
    // Fallback для обратной совместимости
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== ИНДИКАТОР ЗАПИСИ ====================

  addRecordingIndicator() {
    this.removeRecordingIndicator();

    const addIndicator = () => {
      if (!document.body) {
        console.warn('⚠️ [Recorder] document.body не готов, жду...');
        setTimeout(addIndicator, 100);
        return;
      }
      
      try {
        const indicator = document.createElement('div');
        indicator.id = 'autotest-recording-indicator';
        indicator.innerHTML = `
          🔴 ЗАПИСЬ
        `;
        indicator.style.cssText = `
          position: fixed !important;
          top: 10px !important;
          right: 10px !important;
          background: #f44336 !important;
          color: white !important;
          padding: 8px 16px !important;
          border-radius: 4px !important;
          font-weight: bold !important;
          font-size: 14px !important;
          z-index: 9999999 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          font-family: Arial, sans-serif !important;
          line-height: 1.4 !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: none !important;
        `;
        
        document.body.appendChild(indicator);
        console.log('✅ [Recorder] Индикатор записи добавлен на страницу');

        // При воспроизведении индикатор не должен отображаться — снимаем при необходимости
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
            if (res?.state?.isPlaying && document.getElementById('autotest-recording-indicator')) {
              this.removeRecordingIndicator();
            }
          });
        }, 0);

        // Проверка через 100 мс: на некоторых страницах (SPA, Google и т.п.) DOM может перезаписываться и индикатор удаляется
        setTimeout(() => {
          const checkIndicator = document.getElementById('autotest-recording-indicator');
          if (checkIndicator) {
            const rect = checkIndicator.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 &&
                            checkIndicator.offsetParent !== null &&
                            window.getComputedStyle(checkIndicator).display !== 'none' &&
                            window.getComputedStyle(checkIndicator).visibility !== 'hidden';

            if (isVisible) {
              console.log('✅ [Recorder] Индикатор записи виден на странице');
            } else {
              checkIndicator.style.display = 'block';
              checkIndicator.style.visibility = 'visible';
              checkIndicator.style.opacity = '1';
              checkIndicator.style.position = 'fixed';
              checkIndicator.style.zIndex = '9999999';
            }
          } else if (indicator.parentNode === null) {
            // Индикатор был удалён из DOM (например, страница обновила body) — не ошибка, только инфо
            console.log('ℹ️ [Recorder] Индикатор записи был удалён со страницы (часто на SPA или при обновлении DOM)');
          }
        }, 100);
      } catch (error) {
        console.error('❌ [Recorder] Ошибка при создании индикатора записи:', error);
      }
    };
    
    addIndicator();
  }

  removeRecordingIndicator() {
    const indicator = document.getElementById('autotest-recording-indicator');
    if (indicator) {
      console.log('🗑️ [Recorder] Удаляю индикатор записи');
      indicator.remove();
    }
  }

  /**
   * Проверяет, является ли элемент частью плагина
   */
  isPluginElement(element) {
    if (!element) return false;

    // Проверяем по ID (элементы плагина обычно имеют ID начинающийся с "autotest-")
    if (element.id && element.id.startsWith('autotest-')) {
      return true;
    }

    // Проверяем по классам (элементы плагина могут иметь специальные классы)
    const className = element.className || '';
    if (typeof className === 'string' && className.includes('autotest-')) {
      return true;
    }

    // Проверяем, находится ли элемент внутри контейнера плагина
    const pluginContainer = element.closest('[id^="autotest-"], [class*="autotest-"]');
    if (pluginContainer) {
      return true;
    }

    // Проверяем по data-атрибутам плагина
    if (element.hasAttribute && (
      element.hasAttribute('data-autotest') ||
      element.hasAttribute('data-plugin-element')
    )) {
      return true;
    }

    return false;
  }

  /**
   * Закрывает элемент плагина (уведомление, плашка и т.д.)
   */
  closePluginElement(element) {
    if (!element) return;

    // Ищем кнопку закрытия внутри элемента или его родителя
    const pluginContainer = element.closest('[id^="autotest-"], [class*="autotest-"]') || element;
    
    // Ищем кнопку закрытия по различным селекторам
    const closeButtonSelectors = [
      'button[aria-label*="закрыть" i]',
      'button[aria-label*="close" i]',
      'button.close',
      '.close-button',
      '[class*="close"]',
      'button:has(svg[class*="close"])',
      'span[class*="close"]',
      '*[onclick*="close"]',
      '*[onclick*="remove"]'
    ];

    for (const selector of closeButtonSelectors) {
      try {
        const closeButton = pluginContainer.querySelector(selector);
        if (closeButton && closeButton.offsetParent !== null) {
          console.log('🔌 [Plugin] Найдена кнопка закрытия, кликаю по ней');
          closeButton.click();
          return;
        }
      } catch (e) {
        // Игнорируем ошибки селекторов
      }
    }

    // Если кнопка закрытия не найдена, просто удаляем элемент
    if (pluginContainer && pluginContainer.parentNode) {
      console.log('🔌 [Plugin] Кнопка закрытия не найдена, удаляю элемент');
      pluginContainer.remove();
    } else if (element && element.parentNode) {
      console.log('🔌 [Plugin] Удаляю элемент напрямую');
      element.remove();
    }
  }
}

// Инициализируем улучшенный рекордер
const improvedActionRecorder = new ImprovedActionRecorder();
