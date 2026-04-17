// Улучшенный модуль записи действий
// Защита от повторной инъекции
(function() {
  if (window.__autotestImprovedActionRecorder || window.improvedActionRecorder) return;
  window.__autotestImprovedActionRecorder = true;

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
    this.lastDropdownTriggerAt = 0;
    this.dropdownObserver = null;
    
    // Контроль обязательного заполнения dropdown
    this.pendingDropdownFill = null;
    this.dropdownFillTimeout = null;
    this.dropdownPollingInterval = null; // Интервал для периодической проверки значения
    this.dropdownFillDelay = 2000; // мс ожидания подтверждения
    this.dropdownTriggerResolveWindowMs = 12000; // окно связывания «открытие dropdown -> выбор опции»
    
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
    this.pageHideFlushHandler = null;
    this.dblclickDetectionDelay = 350; // мс ожидания dblclick
    this.recentSavedAction = null; // Антидубль для быстрых повторов одного шага
    this.actionDedupWindowMs = 450;
    this.recentDropdownSelection = null; // { selector, value, timestamp }
    this.dropdownChangeDedupWindowMs = 1500;
    this.recordingAlertThrottleMs = 2500;
    this.recordingAlertTimestamps = new Map();
    this.recordingRuntimeStats = { saved: 0, skipped: 0, failed: 0 };
    this.forceAutoRecordingMode = true;
    this.pendingActionQueue = [];
    this.pendingActionFlushTimer = null;
    this.pendingActionFlushInProgress = false;
    this.maxPendingActionQueue = 150;
    this.recordActionSequence = 0;
    this._clickRouteDebugIntroShown = false;
    
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
    
    // ===== НОВОЕ: Настройки для расширенной записи =====
    this.settings = {
      recordDatepickers: true,
      recordTableClicks: true,
      recordDragDrop: true,
      mediaSeekDebounce: 500 // ms
    };
    
    // Drag & Drop state
    this.dragSource = null;
    this.dragStartPos = null;
    
    // Media debounce timers
    this.mediaSeekTimers = {};
    // ===================================================
    
    // Загружаем настройки режима записи
    this._loadRecordingModeSettings();
    
    // Загружаем сохраненные выборы селекторов
    this._loadSelectorChoices();
    
    this.init();
  }

  /**
   * Детальные логи маршрутизации клика (dropdown vs обычный click).
   * Включение: localStorage или sessionStorage, ключ autotestRecorderDebugClickRoute = "1", затем F5.
   */
  isRecorderClickRouteDebugEnabled() {
    try {
      return (
        localStorage.getItem('autotestRecorderDebugClickRoute') === '1' ||
        sessionStorage.getItem('autotestRecorderDebugClickRoute') === '1'
      );
    } catch (_) {
      return false;
    }
  }

  logRecorderClickRoute(message, details) {
    if (!this.isRecorderClickRouteDebugEnabled()) return;
    if (!this._clickRouteDebugIntroShown) {
      this._clickRouteDebugIntroShown = true;
      console.log(
        '[Recorder][click-route] Debug: localStorage/sessionStorage autotestRecorderDebugClickRoute="1", затем перезагрузка страницы'
      );
    }
    if (details !== undefined) console.log(`[Recorder][click-route] ${message}`, details);
    else console.log(`[Recorder][click-route] ${message}`);
  }

  _strongSelectPanelSelector() {
    return (
      '[role="listbox"], .cdk-overlay-pane, .mat-select-panel, .mat-mdc-select-panel, .ng-dropdown-panel, .ng-select-dropdown, ' +
      '.ant-select-dropdown, .rc-virtual-list, .select2-dropdown, .select2-results, .choices__list--dropdown, ' +
      '.v-menu__content, .v-list, .ui.dropdown .menu, [class*="select-panel"], [class*="dropdown-panel"]'
    );
  }

  /** Панель/контейнер настоящего select/listbox (не произвольное app-menu). */
  isStrongSelectLikePanelHost(el) {
    if (!el || typeof el.matches !== 'function') return false;
    try {
      return el.matches(this._strongSelectPanelSelector());
    } catch (_) {
      return false;
    }
  }

  closestStrongSelectLikePanelHost(element) {
    if (!element || typeof element.closest !== 'function') return null;
    try {
      return element.closest(this._strongSelectPanelSelector());
    } catch (_) {
      return null;
    }
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
      this.selectorPickerMode = this.forceAutoRecordingMode ? false : (recordingMode === 'picker');
      
      console.log('✅ [Recorder] Режим записи:', recordingMode, 'picker mode:', this.selectorPickerMode);
      if (this.forceAutoRecordingMode && recordingMode === 'picker') {
        this.showRecordingRuntimeNotification({
          level: 'info',
          title: 'Автоматическая запись',
          message: 'Режим выбора селектора отключен для записи без ручного участия',
          throttleKey: 'info:auto-mode-forced'
        });
      }
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
        // Если запись запущена плеером по маркеру, один раз игнорируем проверку "идёт воспроизведение"
        if (message.fromMarker) {
          this._forceStartDespitePlayback = true;
        }
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
        this.removeRecordingIndicator();
        Promise.resolve(this.stopRecording())
          .then(() => {
            this.removeRecordingIndicator();
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error('❌ Ошибка при остановке записи:', error);
            this.removeRecordingIndicator();
            sendResponse({ success: true });
          });
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
      // Не заявляем асинхронный ответ для чужих типов (PLAY_TEST и т.д.) — иначе Chrome ждёт sendResponse.
      return false;
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

    if (el && el.nodeType === 1 && typeof el.closest === 'function' && this.isApplicationMenuItem(el)) {
      return false;
    }
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

    // 4.1 Специальный случай: placeholder внутри combobox-триггера
    const placeholderLike = classNameLower.includes('placeholder');
    if (placeholderLike && el?.closest) {
      const triggerRoot = this.resolveToDropdownRoot(el) ||
        el.closest('[role="combobox"], [aria-haspopup="listbox"], [elementid], .select-container');
      if (this.isDropdownRootCandidate(triggerRoot, { allowElementId: true })) {
        console.log('✅ [Dropdown] Обнаружен dropdown по placeholder-триггеру');
        return true;
      }
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
    
    // 6. Проверка контекста — дочерние option / role=option / известные классы опций (без .item: у части меню GWT тоже .item)
    if (el?.querySelector || el?.querySelectorAll) {
      const hasOptions = el.querySelector(
        'option, [role="option"], .mat-option, .ng-option, .ant-select-item, .select2-results__option, .choices__item--selectable'
      );
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

    const preparedAction = this.prepareActionForRecording(action);
    if (!preparedAction.ok) {
      this.recordingRuntimeStats.skipped++;
      console.warn(`⏭️ [Recorder] Шаг пропущен: ${preparedAction.reasonCode} — ${preparedAction.message}`);
      this.showRecordingRuntimeNotification({
        level: 'warning',
        title: 'Шаг пропущен',
        message: preparedAction.message,
        throttleKey: `skip:${preparedAction.reasonCode}`
      });
      return;
    }
    const actionToSave = preparedAction.action;
    if (!actionToSave._clientActionId) {
      this.recordActionSequence = (this.recordActionSequence || 0) + 1;
      actionToSave._clientActionId = `${this.currentTestId || 'record'}:${Date.now()}:${this.recordActionSequence}`;
    }

    if (this.shouldSkipDuplicateAction(actionToSave)) {
      this.recordingRuntimeStats.skipped++;
      this.showRecordingRuntimeNotification({
        level: 'warning',
        title: 'Шаг пропущен',
        message: `Повторяющееся действие "${actionToSave.type}" автоматически исключено`,
        throttleKey: `skip:dedupe:${actionToSave.type || 'unknown'}`
      });
      return;
    }
    
    // ВАЖНО: Проверяем валидность extension context перед сохранением
    if (!chrome.runtime?.id) {
      console.warn('⚠️ [Recorder] saveAction: Extension context недействителен, действие не будет сохранено');
      // При временном перезапуске service worker не останавливаем запись:
      // просто даем фону восстановиться и продолжаем слушать события.
      setTimeout(() => {
        if (chrome.runtime?.id && this.isRecording) {
          console.log('✅ Extension context восстановлен, можно продолжать запись');
        } else if (this.isRecording) {
          console.warn('⚠️ Extension context пока не восстановлен, шаг пропущен');
        }
      }, 1000);
      return;
    }
    
    try {
      console.log('💾 Сохранение действия:', action.type);

      // === ВАЛИДАЦИЯ СЕЛЕКТОРА (через SelectorOptimizer) ===
      if (this.optimizer?.settings?.validateBeforeSave && actionToSave.selector) {
        const selectorStr = actionToSave.selector.selector || actionToSave.selector.value;
        if (selectorStr) {
          const validation = this.optimizer.validateSelector(selectorStr);
          if (validation.issues.length > 0) {
            console.log('⚠️ [Validator] Проблемы с селектором:');
            validation.issues.forEach(issue => {
              console.log(`   ${issue.type === 'error' ? '❌' : '⚠️'} ${issue.message}`);
            });

            const hasHardErrors = validation.issues.some(issue => String(issue?.type || '').toLowerCase() === 'error');
            if (hasHardErrors) {
              this.recordingRuntimeStats.skipped++;
              const reasonText = validation.issues
                .filter(issue => String(issue?.type || '').toLowerCase() === 'error')
                .map(issue => issue?.message)
                .filter(Boolean)
                .join('; ') || 'селектор не прошел строгую валидацию';
              this.showRecordingRuntimeNotification({
                level: 'warning',
                title: 'Шаг пропущен',
                message: `Некорректный селектор: ${reasonText}`,
                throttleKey: 'skip:selector-validation-error'
              });
              return;
            }

            // Добавляем информацию о валидации к действию
            actionToSave.validationIssues = validation.issues;
            actionToSave.selectorValidated = true;
          }
        }
      }

      if (this.pendingActionQueue.length > 0) {
        await this.flushPendingActionQueue({ maxBatch: 40, silent: true });
      }

      let response = null;
      if (this.pendingActionQueue.length === 0) {
        response = await this.sendAddActionWithRetries(actionToSave, { maxAttempts: 5, baseDelayMs: 120 });
      } else {
        response = { success: false, error: 'QUEUE_BACKPRESSURE' };
      }
      
      if (response && response.success) {
        this.recordingRuntimeStats.saved++;
        console.log('✅ Действие сохранено:', actionToSave.type);
      } else {
        const queued = this.enqueuePendingAction(actionToSave);
        if (queued) {
          const errorMessage = response?.error === 'BACKGROUND_NO_RESPONSE'
            ? 'Фоновая страница временно не ответила, шаг поставлен в очередь'
            : (response?.error || 'Background unavailable, queued for retry');
          console.warn('⚠️ [Recorder] ADD_ACTION отложен:', errorMessage);
          this.showRecordingRuntimeNotification({
            level: 'warning',
            title: 'Фон перезапускается',
            message: `Шаг "${actionToSave.type || 'unknown'}" временно отложен и будет дослан автоматически`,
            throttleKey: 'queue:add-action-deferred'
          });
          this.schedulePendingActionFlush(220);
        } else {
          this.recordingRuntimeStats.failed++;
          const errorMessage = response?.error === 'BACKGROUND_NO_RESPONSE'
            ? 'Фоновая страница не вернула ответ (возможен перезапуск service worker)'
            : (response?.error || 'Unknown error');
          console.warn('⚠️ Действие не было сохранено:', errorMessage);
          this.showRecordingRuntimeNotification({
            level: 'error',
            title: 'Сбой записи шага',
            message: `Шаг "${actionToSave.type || 'unknown'}" не сохранен: ${errorMessage}`,
            throttleKey: `fail:add-action:${actionToSave.type || 'unknown'}`
          });
        }
      }
    } catch (error) {
      this.recordingRuntimeStats.failed++;
      console.error('❌ Ошибка при сохранении действия:', error);
      this.showRecordingRuntimeNotification({
        level: 'error',
        title: 'Сбой записи шага',
        message: `Ошибка сохранения "${actionToSave?.type || action?.type || 'unknown'}": ${error?.message || String(error)}`,
        throttleKey: `fail:save:${actionToSave?.type || action?.type || 'unknown'}`
      });
      
      // Обрабатываем ошибку "Extension context invalidated"
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('⚠️ Extension context инвалидирован, пробуем переподключиться...');
        await this.handleContextInvalidated(actionToSave);
      }
    }
  }

  isRetryableMessageError(message) {
    const text = String(message || '').toLowerCase();
    return text.includes('background_no_response') ||
      text.includes('receiving end does not exist') ||
      text.includes('could not establish connection') ||
      text.includes('extension context invalidated') ||
      text.includes('message port closed') ||
      text.includes('queue_backpressure') ||
      text.includes('not recording') ||
      text.includes('background');
  }

  sendAddActionRequest(action) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: 'ADD_ACTION',
          action
        }, (response) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Runtime messaging error'));
            return;
          }
          if (!response || typeof response !== 'object') {
            resolve({
              success: false,
              error: 'BACKGROUND_NO_RESPONSE'
            });
            return;
          }
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async sendAddActionWithRetries(action, options = {}) {
    const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 5;
    const baseDelayMs = Number(options.baseDelayMs) > 0 ? Number(options.baseDelayMs) : 120;

    let lastResponse = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response = null;
      try {
        response = await this.sendAddActionRequest(action);
      } catch (error) {
        if (!this.isRetryableMessageError(error?.message)) {
          throw error;
        }
        response = {
          success: false,
          error: error?.message || 'BACKGROUND_NO_RESPONSE'
        };
      }

      if (response?.success) {
        return response;
      }

      lastResponse = response;
      const shouldRetry = attempt < maxAttempts && this.isRetryableMessageError(response?.error);
      if (!shouldRetry) {
        return response;
      }

      const retryDelay = Math.min(1000, Math.round(baseDelayMs * Math.pow(1.6, attempt - 1)));
      console.warn(`⚠️ [Recorder] ADD_ACTION retry ${attempt}/${maxAttempts} через ${retryDelay}ms...`);
      await this.delay(retryDelay);
    }

    return lastResponse || { success: false, error: 'BACKGROUND_NO_RESPONSE' };
  }

  enqueuePendingAction(action) {
    if (!action || typeof action !== 'object') {
      return false;
    }
    if (this.pendingActionQueue.length >= this.maxPendingActionQueue) {
      const dropped = this.pendingActionQueue.shift();
      console.warn('⚠️ [Recorder] Переполнение очереди отложенных шагов, удален самый старый:', dropped?.type);
    }
    this.pendingActionQueue.push({ ...action });
    return true;
  }

  schedulePendingActionFlush(delayMs = 250) {
    if (this.pendingActionFlushTimer || !this.isRecording) {
      return;
    }
    this.pendingActionFlushTimer = setTimeout(async () => {
      this.pendingActionFlushTimer = null;
      await this.flushPendingActionQueue({ maxBatch: 50, silent: false });
      if (this.pendingActionQueue.length > 0 && this.isRecording) {
        this.schedulePendingActionFlush(900);
      }
    }, Math.max(0, Number(delayMs) || 0));
  }

  async flushPendingActionQueue(options = {}) {
    if (this.pendingActionFlushInProgress || !this.isRecording || this.pendingActionQueue.length === 0) {
      return this.pendingActionQueue.length === 0;
    }
    if (!chrome.runtime?.id) {
      return false;
    }

    const maxBatch = Number(options.maxBatch) > 0 ? Number(options.maxBatch) : 50;
    const silent = !!options.silent;
    this.pendingActionFlushInProgress = true;
    try {
      let processed = 0;
      while (this.pendingActionQueue.length > 0 && processed < maxBatch && this.isRecording) {
        const nextAction = this.pendingActionQueue[0];
        const response = await this.sendAddActionWithRetries(nextAction, { maxAttempts: 4, baseDelayMs: 140 });
        if (response?.success) {
          this.pendingActionQueue.shift();
          this.recordingRuntimeStats.saved++;
          processed++;
        } else {
          if (!silent) {
            console.warn('⚠️ [Recorder] Отложенный шаг пока не удалось дослать:', response?.error || 'UNKNOWN');
          }
          break;
        }
      }

      if (!silent && processed > 0) {
        console.log(`✅ [Recorder] Досланы отложенные шаги: ${processed}, осталось: ${this.pendingActionQueue.length}`);
      }
      return this.pendingActionQueue.length === 0;
    } finally {
      this.pendingActionFlushInProgress = false;
    }
  }

  queueDropdownFillVerification(element, action) {
    try {
      if (!element || !action) return;
      // Приводим к корню одного dropdown, чтобы не заполнять другие поля
      const dropdownRoot = this.resolveToDropdownRoot(element) || element;
      
      const snapshot = this.captureDropdownSnapshot(dropdownRoot, action);
      const initialValue = this.sanitizeDropdownDetectedValue(
        this.getDropdownSnapshotValue(snapshot),
        dropdownRoot
      );
      
      this.cancelDropdownFillVerification();
      
      this.pendingDropdownFill = {
        actionMeta: action,
        dropdownRoot: dropdownRoot, // только этот dropdown трогаем при заполнении/проверке
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
      
      // Начинаем периодическую проверку значения (используем dropdownRoot)
      this.startDropdownValuePolling(dropdownRoot, action);
      
      console.log('⏳ [Dropdown] Ожидаю подтверждения заполнения dropdown...');
    } catch (error) {
      console.warn('⚠️ [Dropdown] Ошибка подготовки проверки заполнения:', error);
    }
  }

  resolveActionTimestamp(sourceTimestamp = null, anchorTimestamp = null) {
    const sourceTs = Number(sourceTimestamp);
    if (Number.isFinite(sourceTs) && sourceTs > 0) {
      return sourceTs;
    }
    const anchorTs = Number(anchorTimestamp);
    if (Number.isFinite(anchorTs) && anchorTs > 0) {
      // Асинхронно обнаруженный dropdown-value должен оставаться сразу после шага открытия.
      return anchorTs + 1;
    }
    return Date.now();
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
    
    // Работаем только с одним dropdown (корень), чтобы не трогать другие поля
    const parentDropdown = this.resolveToDropdownRoot(element) || element.closest('app-select, ng-select, mat-select') || element;
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
          const parentDropdown = this.resolveToDropdownRoot(element) || element.closest('app-select, ng-select, mat-select') || element;
          
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
      currentValue = this.sanitizeDropdownDetectedValue(currentValue, parentDropdown);
      
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
        const rootForCheck = this.pendingDropdownFill?.dropdownRoot || this.resolveToDropdownRoot(element) || element;
        if (this.shouldDeferImplicitDropdownSelection(rootForCheck, null)) {
          console.log(`⏳ [Dropdown] Polling: значение "${currentValue}" выглядит предварительным (панель открыта), продолжаю ожидание`);
          return;
        }
        if (this.shouldRejectDropdownValueForFieldMismatch(rootForCheck, currentValue)) {
          console.warn(`⚠️ [Dropdown] Polling: отклонено — «${currentValue}» не совпадает с полем combobox (часто клик по меню)`);
          clearInterval(this.dropdownPollingInterval);
          this.dropdownPollingInterval = null;
          this.cancelDropdownFillVerification();
          return;
        }

        console.log(`✅ [Dropdown] ════════════════════════════════════════════════════`);
        console.log(`✅ [Dropdown] Значение обнаружено через polling: "${currentValue}" (проверка ${checkCount})`);
        console.log(`✅ [Dropdown] Начальное значение было: "${initialValue}"`);
        console.log(`✅ [Dropdown] ════════════════════════════════════════════════════`);
        
        // Сохраняем целевой dropdown до отмены (чтобы заполнять только его, не другие поля)
        const targetDropdownRoot = this.pendingDropdownFill?.dropdownRoot || this.resolveToDropdownRoot(element) || element;
        // Отменяем проверку
        this.cancelDropdownFillVerification();
        
        // Используем только целевой dropdown — не findElementForAction по всему документу
        const dropdownElement = this.resolveToDropdownRoot(targetDropdownRoot) || targetDropdownRoot;
        
        if (dropdownElement) {
          // В режиме записи не меняем UI программно: фиксируем только фактический выбор пользователя.
          (async () => {
            try {
              await this.recordDropdownOptionSelection(
                dropdownElement,
                currentValue,
                null,
                this.resolveActionTimestamp(null, action?.timestamp)
              );
              console.log(`📝 [Dropdown] Выбор пользователя зафиксирован без автозаполнения: "${currentValue}"`);

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
            subtype: 'dropdown-combobox',
            selector: action.selector,
            element: action.element,
            value: currentValue,
            displayValue: currentValue,
            optionText: currentValue,
            dropdownAutoFilled: true,
            isDropdownSelection: true,
            timestamp: this.resolveActionTimestamp(null, action?.timestamp),
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

    // Тот же критерий, что и для polling: не записывать «ввод» в combobox, если текст не из поля (часто шум от меню/GWT)
    const dropdownRootForReject = this.pendingDropdownFill.dropdownRoot ||
      (actionMeta && this.findElementForAction(actionMeta));
    if (dropdownRootForReject && this.shouldRejectDropdownValueForFieldMismatch(dropdownRootForReject, value)) {
      console.warn('⚠️ [Dropdown] resolveDropdownFill: отклонено — значение не совпадает с полем combobox');
      return false;
    }
    
    if (!initialSnapshot) {
      if (value) {
        console.log('✅ [Dropdown] Заполнение зафиксировано событием (без снапшота):', value);
        this.cancelDropdownFillVerification();
        
        // Записываем действие
        const fillAction = {
          type: 'input',
          subtype: 'dropdown-combobox',
          selector: actionMeta.selector,
          element: actionMeta.element,
          value: value,
          displayValue: value,
          optionText: value,
          dropdownAutoFilled: true,
          isDropdownSelection: true,
          timestamp: this.resolveActionTimestamp(null, actionMeta?.timestamp),
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
        subtype: 'dropdown-combobox',
        selector: actionMeta.selector,
        element: actionMeta.element,
        value: value,
        displayValue: value,
        optionText: value,
        dropdownAutoFilled: true,
        isDropdownSelection: true,
        timestamp: this.resolveActionTimestamp(null, actionMeta?.timestamp),
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
          subtype: 'dropdown-combobox',
          selector: actionMeta.selector,
          element: actionMeta.element,
          value: value,
          displayValue: value,
          optionText: value,
          dropdownAutoFilled: true,
          isDropdownSelection: true,
          timestamp: this.resolveActionTimestamp(null, actionMeta?.timestamp),
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

  /** Сразу записать отложенный клик (ожидание dblclick), чтобы шаг «открыть список» шёл перед выбором опции в overlay. */
  async flushPendingClickIfAny() {
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }
    if (!this.pendingClickAction) return;
    const pending = this.pendingClickAction;
    this.pendingClickAction = null;
    try {
      await this.recordClickAction(pending.element, 'click', pending.isDropdown, pending.timestamp);
    } catch (e) {
      console.warn('⚠️ [Recorder] flushPendingClickIfAny:', e?.message || e);
    }
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
      subtype: 'dropdown-combobox',
      selector: actionMeta.selector,
      element: actionMeta.element,
      value: currentValue,
      displayValue: currentValue,
      optionText: currentValue,
      dropdownAutoFilled: true,
      isDropdownSelection: true,
      timestamp: this.resolveActionTimestamp(null, actionMeta?.timestamp),
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

  _normalizeDropdownTextValue(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  isCompositeDropdownValueText(value, dropdownElement) {
    const raw = String(value || '').trim();
    if (!raw || raw.length < 20) return false;
    const normalized = this._normalizeDropdownTextValue(raw);
    if (!normalized) return false;

    let optionTexts = [];
    try {
      if (this.seleniumUtils && dropdownElement) {
        const panels = this.seleniumUtils.findDropdownPanels(dropdownElement) || [];
        for (const panel of panels) {
          const options = this.seleniumUtils.findOptionsInPanel(panel) || [];
          for (const opt of options) {
            const txt = (this.seleniumUtils.getElementText(opt) || opt.textContent || '').trim();
            if (!txt || txt.length > 40) continue;
            optionTexts.push(txt);
          }
        }
      }
    } catch (_) {}

    optionTexts = Array.from(new Set(optionTexts.map(t => t.trim()).filter(Boolean)));
    const matches = optionTexts.filter(text => {
      const n = this._normalizeDropdownTextValue(text);
      return n && normalized.includes(n);
    });

    if (matches.length >= 2) return true;
    if (/плановый\s+по поручению\s+инициативный/i.test(raw)) return true;
    return false;
  }

  sanitizeDropdownDetectedValue(value, dropdownElement) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (this.isCompositeDropdownValueText(text, dropdownElement)) {
      // Составной текст списка не является выбранным значением поля.
      return '';
    }
    return text;
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
        } else if (response && response.success && !response.state.isRecording) {
          this.removeRecordingIndicator();
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
      const isPlaying = !!stateRes?.state?.isPlaying;

      if (isPlaying && !this._forceStartDespitePlayback) {
        console.log('ℹ️ [Recorder] Идёт воспроизведение — запись не запускаю, индикатор не показываю');
        this.removeRecordingIndicator();
        return;
      }
    } catch (e) { /* игнорируем */ } finally {
      // Сбрасываем флаг однократного принудительного запуска
      this._forceStartDespitePlayback = false;
    }

    console.log('🔴 [Recorder] ==========================================');
    console.log('🔴 [Recorder] НАЧАЛО ЗАПИСИ ТЕСТА');
    console.log('🔴 [Recorder] testId:', testId);
    console.log('🔴 [Recorder] URL страницы:', window.location.href);
    console.log('🔴 [Recorder] document.readyState:', document.readyState);
    console.log('🔴 [Recorder] document.body существует:', !!document.body);
    console.log('🔴 [Recorder] ==========================================');
    
    this.isRecording = true;
    this.currentTestId = testId;
    this.pendingActionQueue = [];
    this.pendingActionFlushInProgress = false;
    this.recordActionSequence = 0;
    this.recordingRuntimeStats = { saved: 0, skipped: 0, failed: 0 };
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
    this.removeRecordingIndicator();
    if (!this.isRecording) {
      return Promise.resolve();
    }

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
              if (this.shouldDeferImplicitDropdownSelection(dropdownElement, null)) {
                console.log(`ℹ️ [Dropdown] Пропуск фиксации "${currentValue}" при остановке: панель ещё открыта, выбор не подтверждён (остановка записи продолжается)`);
              } else {
                console.log(`✅ [Dropdown] Найдено выбранное значение "${currentValue}" перед остановкой, сохраняю...`);
                await this.recordDropdownOptionSelection(
                  dropdownElement,
                  currentValue.trim(),
                  null,
                  this.resolveActionTimestamp(null, actionMeta?.timestamp)
                );
              }
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
    // Отложенный клик (ожидание dblclick) иначе теряется при detach/stop — типично «Сохранить» / последний шаг
    await this.flushPendingClickIfAny();
    await this.flushPendingActionQueue({ maxBatch: 200, silent: false });
    
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
    if (this.pendingActionFlushTimer) {
      clearTimeout(this.pendingActionFlushTimer);
      this.pendingActionFlushTimer = null;
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
    
    // ===== НОВОЕ: Обработчики для расширенной записи =====
    // Drag & Drop
    this.dragStartHandler = (e) => {
      if (this.isRecording && this.settings.recordDragDrop) {
        this.handleDragStart(e);
      }
    };
    this.dropHandler = (e) => {
      if (this.isRecording && this.settings.recordDragDrop) {
        this.handleDrop(e);
      }
    };
    this.dragEndHandler = (e) => {
      if (this.isRecording && this.settings.recordDragDrop) {
        this.handleDragEnd(e);
      }
    };
    
    document.addEventListener('dragstart', this.dragStartHandler, true);
    document.addEventListener('drop', this.dropHandler, true);
    document.addEventListener('dragend', this.dragEndHandler, true);
    // ======================================================

    if (!this.pageHideFlushHandler) {
      this.pageHideFlushHandler = () => {
        if (this.isRecording) {
          void this.flushPendingClickIfAny();
        }
      };
    }
    window.addEventListener('pagehide', this.pageHideFlushHandler);
    
    console.log('✅ [Recorder] Обработчики событий прикреплены:', {
      click: !!this.clickHandler,
      dblclick: !!this.dblclickHandler,
      change: !!this.changeHandler,
      input: !!this.inputHandler,
      blur: !!this.blurHandler,
      submit: !!this.submitHandler,
      contextmenu: !!this.contextMenuHandler,
      mouseup: !!this.mouseUpHandler,
      dragstart: !!this.dragStartHandler,
      drop: !!this.dropHandler,
      dragend: !!this.dragEndHandler
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
    
    // ===== НОВОЕ: Удаление обработчиков drag =====
    if (this.dragStartHandler) {
      document.removeEventListener('dragstart', this.dragStartHandler, true);
    }
    if (this.dropHandler) {
      document.removeEventListener('drop', this.dropHandler, true);
    }
    if (this.dragEndHandler) {
      document.removeEventListener('dragend', this.dragEndHandler, true);
    }
    // ==============================================

    if (this.pageHideFlushHandler) {
      window.removeEventListener('pagehide', this.pageHideFlushHandler);
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
      // Не останавливаем запись автоматически: это часто временный рестарт SW.
      setTimeout(() => {
        if (chrome.runtime?.id && this.isRecording) {
          console.log('✅ Extension context восстановлен, запись продолжается');
        } else if (this.isRecording) {
          console.warn('⚠️ Extension context пока не восстановлен, клик пропущен');
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

    // ===== НОВОЕ: Проверка клика по таблице =====
    if (this.checkTableClick(clickedElement)) {
      // Table click обработан, прерываем дальнейшую обработку
      return;
    }
    // =============================================

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
      
      // Клик по ячейке календаря — записываем как обычный клик, не показываем пикер
      const pickerElCls = (element.className || '').toString().toLowerCase();
      if (pickerElCls.includes('calendar__table-cell') || pickerElCls.includes('calendar-table-cell') ||
          element.closest('[class*="calendar"], [class*="datepicker"], p-calendar, p-datepicker')) {
        console.log('📅 [Picker] Клик по календарю, записываю сразу');
        await this.recordClickAction(element, 'click', false);
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
          const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select');
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

    // Клик по опции в CDK/overlay сразу после открытия списка: иначе throttle (200мс) отбрасывает событие,
    // а отложенный клик по триггеру срабатывает уже после следующего клика по странице.
    const inOverlayPickContext = !!(clickedElement.closest && (
      clickedElement.closest('.cdk-overlay-pane, .cdk-overlay-container') ||
      clickedElement.closest('[class*="content-list"]') ||
      clickedElement.closest('[role="listbox"]')
    ));
    if (inOverlayPickContext && this.pendingClickAction) {
      await this.flushPendingClickIfAny();
    }

    // === THROTTLE КЛИКОВ (через SelectorOptimizer) ===
    const now = Date.now();
    const isFieldDoubleClickCandidate = (() => {
      if (!this.isFieldLikeElementForDoubleClick(clickedElement)) return false;
      if (event.detail >= 2) return true;
      if (!this.pendingClickAction?.element) return false;
      return this.getElementKey(this.pendingClickAction.element) === this.getElementKey(clickedElement);
    })();
    if (this.optimizer?.settings?.eventDebounce && !inOverlayPickContext) {
      if (now - this.lastClickTime < this.clickThrottleMs && !isFieldDoubleClickCandidate) {
        console.log('⏭️ [Recorder] Пропуск быстрого клика (throttle)');
        this.recordingRuntimeStats.skipped++;
        this.showRecordingRuntimeNotification({
          level: 'warning',
          title: 'Шаг пропущен',
          message: 'Быстрый повторный клик автоматически пропущен (антидубль)',
          throttleKey: 'skip:throttle-click'
        });
        return;
      }
    }
    this.lastClickTime = now;

    // Проверяем, что extension context валиден
    if (!chrome.runtime?.id) {
      console.warn('⚠️ Extension context недействителен при обработке клика');
      this.recordingRuntimeStats.failed++;
      this.showRecordingRuntimeNotification({
        level: 'error',
        title: 'Сбой записи шага',
        message: 'Контекст расширения недоступен, клик не записан',
        throttleKey: 'fail:context-invalid-click'
      });
      return;
    }

    const element = clickedElement;
    const clickTimestamp = Date.now();

    // Пункт меню приложения: отменяем ожидание выбора из combobox — иначе polling подставит текст пункта как «значение поля»
    if (this.isApplicationMenuItem(element)) {
      this.cancelDropdownFillVerification();
    }
    
    // РАННЯЯ ПРОВЕРКА: клик по ячейке календаря/datepicker — сразу записываем и выходим
    // Избегаем тяжёлых запросов (querySelectorAll по panel/overlay) и dropdown-логики
    const elClsEarly = (element.className || '').toString().toLowerCase();
    const isDatepickerClick = !!(
      element.closest('[class*="calendar"], [class*="datepicker"], [class*="date-picker"], p-calendar, p-datepicker') ||
      elClsEarly.includes('calendar__table-cell') || elClsEarly.includes('calendar-table-cell') ||
      elClsEarly.includes('date-cell') || elClsEarly.includes('day-cell')
    );
    if (isDatepickerClick) {
      const datepickerRecorded = await this.recordCalendarCellAction(element);
      if (datepickerRecorded) return;
      console.log('📅 [Calendar] Fallback: записываю клик по ячейке');
      try {
        await this.recordClickAction(element, 'click', false);
      } catch (err) {
        console.warn('📅 [Calendar] Ошибка при записи клика по ячейке (календарь мог закрыться):', err?.message || err);
      }
      return;
    }
    
    // ПРОВЕРКА: Является ли элемент частью плагина?
    if (this.isPluginElement(element)) {
      console.log('🔌 [Plugin] Клик по элементу плагина, не записываю в шаги');
      
      // Пытаемся закрыть элемент плагина (уведомление, плашка и т.д.)
      this.closePluginElement(element);
      
      return; // Не записываем клик по элементам плагина
    }
    
    const isDropdownOptionLikeClick = !!(
      (element.closest && (
        element.closest('.cdk-overlay-pane, .cdk-overlay-container') ||
        element.closest('[role="listbox"]') ||
        element.closest('[class*="select-group"]') ||
        element.closest('[class*="content-list"]')
      )) &&
      (this.pendingDropdownFill || (this.pendingClickAction && this.pendingClickAction.isDropdown))
    );

    // Сохраняем pending input перед кликом (если клик не на том же элементе).
    // Для второго клика по dropdown-опции откладываем savePendingInput:
    // иначе между "открыть dropdown" и "выбрать значение" может вклиниться input из другого поля.
    if (this.pendingInput && !isDropdownOptionLikeClick) {
      const clickedElementKey = this.getElementKey(element);
      const isInputField = element.tagName === 'INPUT' || 
                          element.tagName === 'TEXTAREA' ||
                          element.contentEditable === 'true';
      
      // Если клик не на том же поле ввода, сохраняем pending input
      if (this.pendingInput.elementKey !== clickedElementKey || !isInputField) {
        await this.savePendingInput();
      }
    } else if (this.pendingInput && isDropdownOptionLikeClick) {
      console.log('⏳ [Recorder] Откладываю savePendingInput: фиксирую соседние шаги dropdown подряд');
    }
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВСЕХ КЛИКОВ
    const elementText = element.textContent?.trim() || element.innerText?.trim() || '';
    const elementClasses = element.className || 'нет классов';
    console.log(`🖱️ [Click] Клик по элементу: <${element.tagName}> class="${elementClasses}" text="${elementText.substring(0, 50)}"`);

    // Раннее запоминание контекста открытого dropdown: на некоторых страницах isDropdownElement=false для arrow/select-box.
    const elementClassLower = (element.className || '').toString().toLowerCase();
    const looksLikeDropdownTrigger = (
      this.isDropdownElement(element, null) ||
      element.getAttribute?.('role') === 'combobox' ||
      elementClassLower.includes('arrow') ||
      elementClassLower.includes('select-box') ||
      elementClassLower.includes('placeholder') ||
      elementClassLower.includes('result')
    );
    if (looksLikeDropdownTrigger) {
      this.rememberDropdownTriggerFromElement(element, 'pre-option-detection');
    }
    
    // ПРОВЕРКА: Является ли элемент опцией в dropdown?
    // Сначала проверяем, находится ли элемент в панели dropdown
    const selectGroupForClick = element.closest('[class*="select-group"]');
    const isInOpenSelectGroupForClick = !!(
      selectGroupForClick &&
      /\bopen\b/i.test((selectGroupForClick.className || '').toString()) &&
      selectGroupForClick.querySelector('[class*="option"], [role="option"]')
    );
    const isInPanel = !!(
      element.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [class*="content-list"], [role="listbox"], .cdk-overlay-pane') ||
      isInOpenSelectGroupForClick
    );
    const hasText = elementText && elementText.length > 0 && 
                    !['выберите', 'select', 'choose', 'placeholder'].some(ph => elementText.toLowerCase().includes(ph.toLowerCase()));
    
    // Проверяем, есть ли открытые панели dropdown рядом (для динамически появляющихся опций)
    let nearbyOpenPanels = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [class*="content-list"], [role="listbox"], .cdk-overlay-pane, [class*="select-group"]'))
      .filter(p => {
        if ((p.className || '').toString().toLowerCase().includes('select-group')) {
          const cls = (p.className || '').toString().toLowerCase();
          const hasOptions = !!p.querySelector('[class*="option"], [role="option"]');
          if (!cls.includes('open') || !hasOptions) return false;
        }
        const pRect = p.getBoundingClientRect();
        const eRect = element.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(pRect.left - eRect.left, 2) + 
          Math.pow(pRect.top - eRect.top, 2)
        );
        return distance < 1000 && pRect.width > 0 && pRect.height > 0 && p.offsetParent !== null;
      });
    
    let hasNearbyPanel = nearbyOpenPanels.length > 0;
    
    console.log(`   - Находится в панели dropdown: ${isInPanel}`);
    console.log(`   - Есть открытые панели рядом: ${hasNearbyPanel} (${nearbyOpenPanels.length} панелей)`);
    console.log(`   - Имеет текст: ${hasText} (${elementText.substring(0, 30)})`);
    
    const isDropdownOption = this.isDropdownOption(element);
    console.log(`   - isDropdownOption: ${isDropdownOption}`);
    this.logRecorderClickRoute('handleClick flags', {
      tag: element.tagName,
      textPreview: elementText.substring(0, 60),
      classPreview: String(element.className || '').slice(0, 100),
      isApplicationMenuItem: this.isApplicationMenuItem(element),
      isInPanel,
      hasNearbyPanel,
      isDropdownOption
    });
    
    // Специальный случай: элементы календаря / datepicker
    // Не пытаемся обрабатывать их как dropdown-опции, даже если рядом есть панели
    const elCls = (element.className || '').toString().toLowerCase();
    const isDatepickerElement = !!(
      element.closest('[class*="calendar"], [class*="datepicker"], p-calendar, p-datepicker') ||
      elCls.includes('calendar__table-cell') || elCls.includes('calendar-table-cell')
    );
    if (isDatepickerElement) {
      console.log('   📅 Элемент относится к datepicker, пропускаю dropdown-логику');
      // Блокируем все ветки, которые пытаются искать родительский dropdown
      hasNearbyPanel = false;
      nearbyOpenPanels = [];
    }
    
    // ПРИОРИТЕТ: Если есть открытые панели, используем SeleniumUtils для поиска опций
    if (hasNearbyPanel && this.seleniumUtils) {
      let actualDropdown =
        this.resolveToDropdownRoot(element) ||
        element.closest('app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select');
      if (!actualDropdown) {
        actualDropdown = this.findParentDropdownForOption(element);
      }
      // Опции Angular CDK / overlay часто вне DOM-корня виджета — корень ищем шире, иначе ветка не выполняется.
      if (actualDropdown) {
        console.log(`   🔍 [SeleniumUtils] Есть открытые панели, проверяю через SeleniumUtils...`);
        let panels = this.seleniumUtils.findDropdownPanels(actualDropdown);
        if (panels.length > 50) {
          console.log(`   ⚠️ [SeleniumUtils] Слишком много панелей (${panels.length}), ограничиваю до 50`);
          panels = panels.slice(0, 50);
        }
        console.log(`   📋 [SeleniumUtils] Найдено ${panels.length} панелей для проверки`);
      
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
          if (!this.isNonOptionControlElement(element) && element.contains && element.contains(opt)) return true;
          // Проверка по тексту (если элемент содержит текст опции)
          const optText = this.seleniumUtils.getElementText(opt);
          const elText = elementText;
          if (optText && elText && panel.contains(element) && optText.toLowerCase().includes(elText.toLowerCase()) && 
              elText.length > 0 && elText.length < 100) {
            return true;
          }
          return false;
        });
        
        if (foundOption) {
          if (this.isNonOptionControlElement(foundOption)) {
            continue;
          }
          const optionText = this.seleniumUtils.getElementText(foundOption) || elementText;
          console.log(`   ✅ [SeleniumUtils] ════════════════════════════════════════════════════`);
          console.log(`   ✅ [SeleniumUtils] Элемент найден как опция "${optionText}" через SeleniumUtils!`);
          console.log(`   ✅ [SeleniumUtils] ════════════════════════════════════════════════════`);
          
          const panelHost =
            panel.closest(
              'app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select, [elementid], [role="combobox"], [aria-haspopup="listbox"]'
            );
          const panelRoot =
            panelHost && this.isDropdownRootCandidate(panelHost, { allowElementId: true }) ? panelHost : null;
          const parentDropdown = this.resolveRecentDropdownForOption(foundOption || element) ||
                                this.findParentDropdownForOption(element) ||
                                this.findParentDropdownForOption(foundOption) ||
                                panelRoot;
          
          if (parentDropdown) {
            await this.recordDropdownOptionSelection(parentDropdown, optionText, foundOption || element, clickTimestamp);
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
            console.warn(`   ⚠️ [SeleniumUtils] Родительский dropdown не найден для опции — fallback: обычный click`);
            try {
              await this.recordClickAction(foundOption || element, 'click', false, clickTimestamp);
            } catch (e) {
              console.warn('⚠️ [SeleniumUtils] Не удалось записать fallback click:', e?.message || e);
            }
            return;
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
    }
    
    // Дополнительная проверка: если элемент имеет текст опции и есть открытые панели рядом
    const isNonOptionControl = this.isNonOptionControlElement(element);
    if (isNonOptionControl) {
      // Кнопки/ссылки/меню никогда не считаем выбором dropdown-опции,
      // даже если рядом есть открытая панель со значениями.
      hasNearbyPanel = false;
      nearbyOpenPanels = [];
    }
    
    if (isDropdownOption) {
      console.log('🎯 [Dropdown] КЛИК ПО ОПЦИИ DROPDOWN');
      const optionText = element.textContent?.trim() || element.innerText?.trim() || '';
      console.log('   - Текст опции:', optionText);
      console.log('   - Элемент:', element.tagName, element.className || 'нет классов');
      console.log('   - Родители:', this.getParentChain(element));
      
      // Находим родительский dropdown
      const parentDropdown = this.resolveRecentDropdownForOption(element) || this.findParentDropdownForOption(element);
      if (parentDropdown) {
        console.log('   - Родительский dropdown найден:', parentDropdown.tagName, parentDropdown.id || 'нет id');
        
        // Записываем выбор значения
        await this.recordDropdownOptionSelection(parentDropdown, optionText, element, clickTimestamp);
        return; // Не обрабатываем как обычный клик
      } else {
        console.warn('   ⚠️ Родительский dropdown не найден для опции');
        // Пробуем найти через все dropdown на странице
        const allDropdowns = document.querySelectorAll('app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select');
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
        // Если выбор опции уже был зафиксирован только что, не добавляем fallback click.
        if (this.shouldSuppressFallbackOptionClick(element, optionText)) {
          console.log('⏭️ [Dropdown] Пропуск fallback click: выбор опции уже записан');
          return;
        }
        // Если клик похож на пункт навигационного меню приложения, сохраняем обычный click.
        const navHost = element.closest?.('a[href], [routerlink], [ng-reflect-router-link], [data-route], [data-router-link]');
        const navHref = (navHost?.getAttribute?.('href') || '').trim();
        const navClass = (navHost?.className || element.className || '').toString().toLowerCase();
        const inKnownSelectOverlay = !!element.closest?.(
          '[role="listbox"], .cdk-overlay-pane, .mat-select-panel, .mat-mdc-select-panel, .ng-dropdown-panel, .ng-select-dropdown, .ant-select-dropdown, .select2-dropdown, .choices__list--dropdown'
        );
        const recentTriggerMs = Date.now() - (this.lastDropdownTriggerAt || 0);
        const hasRecentDropdownTrigger =
          this.lastDropdownTrigger instanceof Element &&
          recentTriggerMs >= 0 &&
          recentTriggerMs <= (Number(this.dropdownTriggerResolveWindowMs) > 0 ? this.dropdownTriggerResolveWindowMs : 12000);
        const looksLikeNavigationMenu =
          this.isApplicationMenuItem(element) ||
          (!!navHost && (
            (!!navHref && navHref !== '#' && !navHref.startsWith('javascript:')) ||
            navHost.hasAttribute?.('routerlink') ||
            navHost.hasAttribute?.('ng-reflect-router-link') ||
            navHost.hasAttribute?.('data-route') ||
            navHost.hasAttribute?.('data-router-link')
          )) ||
          (!inKnownSelectOverlay && (
            navClass.includes('menu__subitem') ||
            navClass.includes('sidebar') ||
            navClass.includes('nav-item') ||
            navClass.includes('menu-item')
          ));
        if (looksLikeNavigationMenu) {
          console.log('✅ [Dropdown] Похоже на пункт меню навигации, записываю как click');
          await this.recordClickAction(element, 'click', false, clickTimestamp);
          return;
        }
        if (inKnownSelectOverlay || this.pendingDropdownFill || hasRecentDropdownTrigger) {
          console.log('✅ [Dropdown] Родительский combobox не найден, но контекст select/overlay — записываю как click (fallback)');
          await this.recordClickAction(element, 'click', false, clickTimestamp);
          return;
        }
        // Если parent dropdown не определён, клик по option-like элементу считаем неоднозначным и не сохраняем,
        // чтобы не добавлять "лишние" шаги в стиле "АИС СД ... @charset".
        this.recordingRuntimeStats.skipped++;
        this.logRecorderClickRoute('ambiguous dropdown-option click: шаг не записан (нет parent dropdown)', {
          optionText: String(optionText || '').slice(0, 120),
          tag: element.tagName,
          className: String(element.className || '').slice(0, 120),
          isApplicationMenuItem: this.isApplicationMenuItem(element)
        });
        this.showRecordingRuntimeNotification({
          level: 'warning',
          title: 'Шаг пропущен',
          message: 'Неоднозначный клик по option-панели без связанного dropdown не записан',
          throttleKey: 'skip:ambiguous-option-click'
        });
        console.warn('⚠️ [Dropdown] Пропуск fallback click: parent dropdown не определён');
        return;
      }
    }
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ПРИ КЛИКЕ НА DROPDOWN
    let isDropdown = this.isDropdownElement(element, null);
    if (this.isApplicationMenuItem(element)) isDropdown = false;
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
      const resolvedRoot = this.resolveToDropdownRoot(element) || parent;
      if (resolvedRoot) {
        this.lastDropdownTrigger = resolvedRoot;
        this.lastDropdownTriggerAt = Date.now();
        this.lastDropdownTriggerInfo = {
          elementId: resolvedRoot.getAttribute?.('elementid') || null,
          label: resolvedRoot.getAttribute?.('label') || null
        };
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
      controlHostTag: this.getNearestInteractiveHostTagName(element),
      attributes: this.getElementAttributes(element),
      // Добавляем информацию о dropdown
      isDropdown: isDropdown,
      dropdownType: isDropdown ? this.getDropdownType(element) : null,
      parentDropdown: isDropdown ? this.getParentDropdownInfo(element) : null
    };

    // Критические клики (сохранить / выход / навигация) — сразу, без ожидания dblclick,
    // иначе шаг теряется при быстром переходе или при остановке записи до срабатывания таймера.
    const criticalTarget = element.closest(
      'a, button, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [onclick], [ng-click], [data-action], [data-testid]'
    ) || element;
    if (this.isCriticalNavigationClick(criticalTarget)) {
      console.log('🚪 [Recorder] Обнаружен критический клик (сохранение/выход/навигация), записываю немедленно');
      try {
        await this.recordClickAction(element, 'click', isDropdown);
      } catch (err) {
        console.warn('⚠️ [Recorder] Ошибка при немедленной записи критического клика:', err?.message || err);
      }
      return;
    }

    // #21: Отложенная запись клика для обнаружения dblclick.
    // ВАЖНО: если до таймаута пришёл клик по ДРУГОМУ элементу, предыдущий клик не должен теряться.
    if (this.pendingClickAction) {
      const prevElement = this.pendingClickAction.element;
      const prevKey = this.getElementKey(prevElement);
      const currentKey = this.getElementKey(element);
      const isSameElement = !!prevKey && !!currentKey && prevKey === currentKey;

      if (!isSameElement) {
        console.log('📝 [Recorder] Фиксирую предыдущий pending click (новый клик по другому элементу)');
        try {
          await this.recordClickAction(
            this.pendingClickAction.element,
            'click',
            this.pendingClickAction.isDropdown,
            this.pendingClickAction.timestamp
          );
        } catch (e) {
          console.warn('⚠️ [Recorder] Не удалось зафиксировать предыдущий pending click:', e?.message || e);
        }
      }

      if (this.pendingClickTimeout) {
        clearTimeout(this.pendingClickTimeout);
        this.pendingClickTimeout = null;
      }
      this.pendingClickAction = null;
    }

    // Сохраняем данные нового клика и запускаем таймер
    this.pendingClickAction = { element, isDropdown, elementInfo, selector, timestamp: Date.now() };
    if (isDropdown) {
    }
    
    // Запускаем новый таймер
    this.pendingClickTimeout = setTimeout(async () => {
      if (this.pendingClickAction) {
        console.log('🖱️ [Recorder] Клик подтверждён (timeout), записываю...');
        await this.recordClickAction(
          this.pendingClickAction.element, 
          'click', 
          this.pendingClickAction.isDropdown,
          this.pendingClickAction.timestamp
        );
        this.pendingClickAction = null;
        this.pendingClickTimeout = null;
      }
    }, this.dblclickDetectionDelay);
    
    console.log(`🖱️ [Recorder] Клик отложен на ${this.dblclickDetectionDelay}мс для обнаружения dblclick`);
  }

  async recordClickAction(element, clickType = 'click', isDropdown = false, sourceTimestamp = null) {
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
      controlHostTag: this.getNearestInteractiveHostTagName(element),
      attributes: this.getElementAttributes(element),
      // Добавляем информацию о dropdown (только для обычного клика)
      isDropdown: clickType === 'click' ? isDropdown : false,
      dropdownType: (clickType === 'click' && isDropdown) ? this.getDropdownType(element) : null,
      parentDropdown: (clickType === 'click' && isDropdown) ? this.getParentDropdownInfo(element) : null
    };
    const dropdownTriggerMeta = (clickType === 'click' && isDropdown)
      ? this.buildDropdownTriggerMeta(element)
      : null;
    if (dropdownTriggerMeta?.selector) {
      const selectorAlternatives = Array.isArray(selector.alternatives) ? selector.alternatives : [];
      selector.alternatives = [...new Set([
        ...selectorAlternatives,
        dropdownTriggerMeta.selector,
        ...(dropdownTriggerMeta.alternatives || [])
      ])];
      if (elementInfo.parentDropdown) {
        elementInfo.parentDropdown.triggerSelector = dropdownTriggerMeta.selector;
        elementInfo.parentDropdown.triggerAlternatives = dropdownTriggerMeta.alternatives || [];
      }
    }

    // Ищем заголовок поля, если элемент является полем формы
    const fieldLabel = this.findFieldLabel(element);
    
    const action = {
      type: clickType,
      selector: selector,
      element: elementInfo,
      timestamp: (Number.isFinite(Number(sourceTimestamp)) && Number(sourceTimestamp) > 0)
        ? Number(sourceTimestamp)
        : Date.now(),
      url: window.location.href,
      isDropdownClick: (clickType === 'click' && isDropdown) || false,
      fieldLabel: fieldLabel || undefined,
      dropdownTrigger: dropdownTriggerMeta || undefined
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
                  if (this.shouldDeferImplicitDropdownSelection(parentDropdown, null)) {
                    return;
                  }
                  if (this.shouldRejectDropdownValueForFieldMismatch(parentDropdown, currentValue)) {
                    console.warn(`   ⚠️ [SeleniumUtils] Пропуск записи — «${currentValue}» не из поля combobox`);
                    clearInterval(checkInterval);
                    if (this.dropdownPollingInterval === checkInterval) this.dropdownPollingInterval = null;
                    return;
                  }
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
                  await this.recordDropdownOptionSelection(
                    parentDropdown,
                    currentValue,
                    null,
                    this.resolveActionTimestamp(null, actionMeta?.timestamp)
                  );
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
      
      // Генерируем все селекторы и лучший по мнению инспектора (SelectorEngine)
      const allSelectors = this.selectorEngine.generateAllSelectors(element);
      const engineBestSelector = this.selectorEngine.selectBestSelector(allSelectors);
      
      // Если селекторов мало, сразу записываем лучший
      if (allSelectors.length <= 1) {
        console.log('📝 [Picker] Мало селекторов, записываю лучший автоматически');
        const selector = engineBestSelector;
        // Сохраняем выбор
        await this._saveSelectorChoice(elementKey, selector);
        await this.recordClickWithSelectedSelector(element, selector);
        return;
      }
      
      // Создаём пикер; передаём лучший селектор по инспектору для автовыбора и кнопки «Использовать лучший»
      this.pendingPicker = new window.InlineSelectorPicker(element, allSelectors, {
        autoSelectTimeout: 5000,
        showScores: true,
        maxVisibleSelectors: 4,
        engineBestSelector: engineBestSelector
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
    const dropdownTriggerMeta = isDropdown ? this.buildDropdownTriggerMeta(element) : null;
    if (dropdownTriggerMeta?.selector) {
      const selectorAlternatives = Array.isArray(selector.alternatives) ? selector.alternatives : [];
      selector.alternatives = [...new Set([
        ...selectorAlternatives,
        dropdownTriggerMeta.selector,
        ...(dropdownTriggerMeta.alternatives || [])
      ])];
      if (elementInfo.parentDropdown) {
        elementInfo.parentDropdown.triggerSelector = dropdownTriggerMeta.selector;
        elementInfo.parentDropdown.triggerAlternatives = dropdownTriggerMeta.alternatives || [];
      }
    }
    
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
      dropdownTrigger: dropdownTriggerMeta || undefined,
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
   * Приводит элемент к корню dropdown (app-select и т.д.) для проверки/заполнения.
   * Важно: при записи заполняется только ОДИН целевой dropdown, не другие поля.
   * Если клик был по контейнеру (форма) — выбираем тот dropdown, у которого открыта панель.
   */
  resolveToDropdownRoot(element) {
    if (!element) return null;
    const rootSelectors = 'app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select';
    // Уже корень dropdown
    if (this.isDropdownRootCandidate(element)) return element;
    // Элемент внутри dropdown — поднимаемся до корня
    const inside = element.closest(rootSelectors);
    if (inside && this.isDropdownRootCandidate(inside)) return inside;
    // Кастомные dropdown (как type-project) могут иметь корень не app-select, а контейнер с elementid.
    const elementIdRoot = element.closest('[elementid]');
    if (elementIdRoot && this.isDropdownRootCandidate(elementIdRoot, { allowElementId: true })) {
      return elementIdRoot;
    }
    // Контейнер с несколькими dropdown: берём только тот, у которого открыта панель (чтобы не трогать другие поля)
    const children = element.querySelectorAll ? element.querySelectorAll(rootSelectors) : [];
    if (children.length === 0) return null;
    const validChildren = Array.from(children).filter(child => this.isDropdownRootCandidate(child));
    if (validChildren.length === 0) return null;
    if (validChildren.length === 1) return validChildren[0];
    if (this.seleniumUtils && typeof this.seleniumUtils.isDropdownOpen === 'function') {
      for (const dd of validChildren) {
        if (this.seleniumUtils.isDropdownOpen(dd)) return dd;
      }
    }
    return null;
  }

  isDropdownRootCandidate(element, options = {}) {
    if (!element || !(element instanceof Element)) return false;
    if (this.isApplicationMenuItem(element)) return false;
    const allowElementId = !!options.allowElementId;

    const tag = (element.tagName || '').toLowerCase();
    const role = String(element.getAttribute?.('role') || '').toLowerCase();
    const haspopup = String(element.getAttribute?.('aria-haspopup') || '').toLowerCase();
    const cls = (element.className || '').toString().toLowerCase();

    // Частый ложный кандидат: button-like контейнеры в header/menu.
    if (tag.includes('button') && role !== 'combobox' && role !== 'listbox' && haspopup !== 'listbox') {
      return false;
    }

    const dropdownTags = new Set([
      'app-select', 'ng-select', 'mat-select', 'p-dropdown', 'p-calendar', 'v-select', 'v-autocomplete', 'v-combobox'
    ]);
    if (dropdownTags.has(tag)) return true;
    if (role === 'combobox' || role === 'listbox' || haspopup === 'listbox') return true;

    const hasDropdownClass = /(select|dropdown|combobox|autocomplete|ng-select|mat-select|ant-select|select2|choices|v-select)/i.test(cls);
    if (hasDropdownClass) return true;

    if (allowElementId && element.hasAttribute('elementid')) {
      const hasInternalSignals = !!element.querySelector?.('.select-box, .result, .placeholder, .arrow, [role="combobox"], [role="listbox"], [class*="option"], [class*="select"]');
      return hasInternalSignals;
    }
    return false;
  }

  isElementVisibleForRecording(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) {
      return false;
    }
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    return !!(rect && rect.width > 0 && rect.height > 0);
  }

  pickPreferredSelector(selectors = []) {
    let best = '';
    let bestScore = -Infinity;
    for (const entry of selectors) {
      const selector = typeof entry === 'string' ? entry : (entry?.selector || '');
      if (!selector) continue;
      let score = 0;
      if (selector.includes(':nth-of-type(')) score += 40;
      if (selector.startsWith('.')) score += 25;
      if (selector.includes('app-select')) score += 20;
      if (selector.includes('[elementid')) score += 10;
      score += Math.min(20, Math.floor(selector.length / 12));
      if (score > bestScore) {
        bestScore = score;
        best = selector;
      }
    }
    return best;
  }

  buildDropdownTriggerMeta(element) {
    const dropdownRoot = this.resolveToDropdownRoot(element) || element?.closest?.('[elementid]') || element;
    if (!dropdownRoot) return null;

    const triggerSelectors = [
      '[role="combobox"]',
      '.select-box, [class*="select-box"]',
      '.result, [class*="result"]',
      '.options, [class*="options"]',
      '.arrow, [class*="arrow"]',
      'input[role="combobox"]'
    ];

    const candidates = [];
    const pushCandidate = (candidate) => {
      if (!candidate || !(candidate instanceof Element)) return;
      if (!this.isElementVisibleForRecording(candidate)) return;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    };

    pushCandidate(element);
    pushCandidate(dropdownRoot);
    for (const css of triggerSelectors) {
      pushCandidate(dropdownRoot.querySelector?.(css));
    }

    if (candidates.length === 0) return null;

    let triggerElement = candidates[0];
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const role = String(candidate.getAttribute?.('role') || '').toLowerCase();
      const cls = String(candidate.className || '').toLowerCase();
      let score = 0;
      if (candidate === element) score += 20;
      if (role === 'combobox') score += 30;
      if (cls.includes('select-box')) score += 25;
      if (cls.includes('result')) score += 20;
      if (cls.includes('arrow')) score += 15;
      if (cls.includes('option')) score -= 30;
      if (score > bestScore) {
        bestScore = score;
        triggerElement = candidate;
      }
    }

    const allSelectors = this.selectorEngine.generateAllSelectors(triggerElement) || [];
    const alternatives = this.selectorEngine.findAlternativeSelectors(triggerElement) || [];
    const mergedSelectors = [
      ...allSelectors.map(s => s?.selector).filter(Boolean),
      ...alternatives.map(s => typeof s === 'string' ? s : s?.selector).filter(Boolean)
    ];
    const unique = [...new Set(mergedSelectors)];
    const preferred = this.pickPreferredSelector(unique) || unique[0] || '';
    if (!preferred) return null;

    return {
      selector: preferred,
      alternatives: unique.filter(s => s && s !== preferred).slice(0, 12)
    };
  }

  resolveRecentDropdownForOption(optionElement) {
    if (!optionElement) return null;
    const panel = optionElement.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [class*="select-group"].open, [class*="content-list"], [role="listbox"], .cdk-overlay-pane');

    const candidates = [];
    if (this.pendingDropdownFill?.dropdownRoot instanceof Element) {
      candidates.push({ root: this.pendingDropdownFill.dropdownRoot, source: 'pending' });
    }
    if (this.lastDropdownTrigger instanceof Element) {
      candidates.push({ root: this.lastDropdownTrigger, source: 'recent' });
    }
    if (candidates.length === 0) return null;

    const maxRecentAge = Number(this.dropdownTriggerResolveWindowMs) > 0
      ? Number(this.dropdownTriggerResolveWindowMs)
      : 12000;

    try {
      for (const candidate of candidates) {
        const root = candidate.root;
        if (!root?.isConnected) continue;
        if (!this.isDropdownRootCandidate(root, { allowElementId: true })) continue;
        if (candidate.source === 'recent') {
          const ageMs = Date.now() - (this.lastDropdownTriggerAt || 0);
          if (ageMs > maxRecentAge) continue;
        }

        if (this.seleniumUtils && typeof this.seleniumUtils.findDropdownPanels === 'function') {
          const panels = this.seleniumUtils.findDropdownPanels(root) || [];
          if (panels.some(p => p && p.contains && p.contains(optionElement))) {
            return root;
          }
        }

        if (panel) {
          const rootElementId = root.getAttribute?.('elementid') || root.getAttribute?.('ng-reflect-element-id') || '';
          const panelId = panel.id || '';
          if (!rootElementId) continue;
          const expectedPanelId = `${rootElementId}__result`;
          if (
            panelId === expectedPanelId ||
            panelId.includes(rootElementId) ||
            (panel.getAttribute && String(panel.getAttribute('id') || '').includes(rootElementId))
          ) {
            return root;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  hasVisibleDropdownPanelsForElement(dropdownElement) {
    if (!dropdownElement) return false;
    try {
      if (this.seleniumUtils && typeof this.seleniumUtils.findDropdownPanels === 'function') {
        const panels = this.seleniumUtils.findDropdownPanels(dropdownElement) || [];
        return panels.some(panel => {
          if (!panel) return false;
          const rect = panel.getBoundingClientRect?.();
          return !!(
            rect &&
            rect.width > 0 &&
            rect.height > 0 &&
            panel.offsetParent !== null
          );
        });
      }
    } catch (_) {}

    const fallbackPanel = dropdownElement.querySelector?.(
      '[role="listbox"], .cdk-overlay-pane, .mat-select-panel, .ng-dropdown-panel, .ant-select-dropdown, .select2-dropdown'
    );
    if (!fallbackPanel) return false;
    const rect = fallbackPanel.getBoundingClientRect?.();
    return !!(rect && rect.width > 0 && rect.height > 0 && fallbackPanel.offsetParent !== null);
  }

  shouldDeferImplicitDropdownSelection(dropdownElement, optionElement = null) {
    if (optionElement) return false;
    if (!dropdownElement) return false;
    if (!this.hasVisibleDropdownPanelsForElement(dropdownElement)) return false;

    // При открытой панели без клика по конкретной опции значение часто "предпросмотр",
    // а не финальный выбор пользователя.
    return true;
  }

  rememberDropdownTriggerFromElement(element, reason = 'unknown') {
    if (!element) return;
    const root = this.resolveToDropdownRoot(element);
    if (!root) return;
    this.lastDropdownTrigger = root;
    this.lastDropdownTriggerAt = Date.now();
    this.lastDropdownTriggerInfo = {
      elementId: root.getAttribute?.('elementid') || null,
      label: root.getAttribute?.('label') || null
    };
  }

  isNonOptionControlElement(element) {
    if (!element) return false;
    const tag = (element.tagName || '').toLowerCase();
    const classLower = (element.className || '').toString().toLowerCase();
    const role = (element.getAttribute?.('role') || '').toLowerCase();
    const elementIdAttr = (element.getAttribute?.('elementid') || '').toLowerCase();
    if (
      tag === 'button' ||
      tag === 'a' ||
      tag === 'app-header-button' ||
      role === 'button' ||
      role === 'link' ||
      role === 'menuitem' ||
      /(^|[\s_-])(btn|button|big-button|header-button|menu__subitem)([\s_-]|$)/i.test(classLower) ||
      /save-button|submit|create|apply|delete/.test(elementIdAttr)
    ) {
      return true;
    }
    return (
      (classLower.includes('select-box') ||
        classLower.includes('placeholder') ||
        classLower.includes('arrow') ||
        classLower.includes('result')) &&
      role !== 'option' &&
      !classLower.includes('option')
    );
  }

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
   * Пункт меню приложения (тулбар GWT, ARIA role=menu/menuitem), а не опция listbox/combobox.
   * Иначе клик по «Очистить список выбранных» попадает в recordDropdownOptionSelection с чужим dropdown на странице.
   * Учитываем клик по дочернему span внутри <a href="#"> (event.target — не всегда сама ссылка).
   */
  isApplicationMenuItem(element) {
    if (!element || element.nodeType !== 1) return false; // ELEMENT_NODE
    if (typeof element.closest !== 'function') return false;
    if (element.closest('[role="listbox"]')) return false;

    // Любой узел внутри пункта меню <li>: клик часто на span/div, а не на сам li (JSON optionElement всё равно li)
    const liHost = element.closest('li');
    if (liHost) {
      const inAntSelectDropdown = liHost.closest('.ant-select-dropdown, .rc-select-dropdown');
      if (inAntSelectDropdown) {
        const role = (liHost.getAttribute('role') || '').toLowerCase();
        const isAntSelectOption =
          role === 'option' ||
          liHost.classList.contains('ant-select-item') ||
          liHost.classList.contains('ant-select-item-option') ||
          !!liHost.querySelector('.ant-select-item, .ant-select-item-option, [role="option"]');
        if (isAntSelectOption) return false;
        return true;
      }
      // app-select / Angular: опции часто <li> в CDK overlay/listbox.
      // Не считаем обычное меню приложения dropdown-панелью только по общим class вроде "content-list".
      const inSelectDropdownPanel = liHost.closest(
        '.cdk-overlay-pane, .mat-select-panel, .mat-mdc-select-panel, .ng-dropdown-panel, .ng-select-dropdown, ' +
        '.ant-select-dropdown, .select2-dropdown, .choices__list--dropdown, .rc-virtual-list-holder, ' +
        '[role="listbox"], [class*="select-panel"], [class*="dropdown-panel"], .content-list-container'
      );
      const inApplicationRoleMenu = liHost.closest('[role="menu"]');
      const hasOptionSignals = !!(
        inSelectDropdownPanel &&
        (
          inSelectDropdownPanel.matches?.('[role="listbox"], .cdk-overlay-pane, .mat-select-panel, .mat-mdc-select-panel, .ng-dropdown-panel, .ng-select-dropdown, .ant-select-dropdown, .select2-dropdown, .choices__list--dropdown') ||
          inSelectDropdownPanel.querySelector?.('[role="option"], .mat-option, .mat-mdc-option, .ng-option, .ant-select-item-option, .select2-results__option, .choices__item--selectable, [class*="option"]')
        )
      );
      if (hasOptionSignals && !inApplicationRoleMenu) {
        return false;
      }
      // ul.dropdown-menu Bootstrap/Wicket — под [role="menu"], не попадаем в ветку выше
      return true;
    }

    // Панели настоящего combobox — не путать с меню команд приложения (GWT и т.п.)
    const inSelectLikePanel = element.closest(
      '.mat-select-panel, .mat-mdc-select-panel, .ng-dropdown-panel, .ng-select-dropdown, ' +
      '.ant-select-dropdown, .rc-virtual-list-holder, .select2-results, .choices__list--dropdown'
    );
    const looksLikeListOption = !!element.closest(
      '.mat-option, .mat-mdc-option, .ng-option, .ant-select-item, .select2-results__option, [role="option"]'
    );
    if (inSelectLikePanel && looksLikeListOption) return false;

    const inComboboxWidget = element.closest(
      '[role="combobox"], app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select, [class*="gwt-SuggestBox"]'
    );

    const menuItemRole = element.closest('[role="menuitem"]');
    if (menuItemRole && !element.closest('[role="listbox"]')) return true;

    const link = element.closest('a[href]');
    if (link) {
      const href = (link.getAttribute('href') || '').trim();
      const isCommandHref = href === '#' || href === '' || href.startsWith('#') || /^javascript:/i.test(href);
      if (isCommandHref) {
        if (link.closest('[role="menu"]')) return true;
        const inGwtOrPopup = link.closest('[class*="gwt-"], [class*="Popup"], [class*="popup"]');
        if (inGwtOrPopup && !inSelectLikePanel) return true;
      }
    }

    const inAppMenu = element.closest('[role="menu"]');
    if (inAppMenu && !element.closest('[role="listbox"]')) {
      const tag = (element.tagName || '').toLowerCase();
      if (tag === 'a') {
        const href = (element.getAttribute('href') || '').trim();
        if (href === '#' || href === '' || href.startsWith('#') || /^javascript:/i.test(href)) return true;
      }
      // Клик по строке меню (div/span), а не по <a> — частый кейс «Выход» с class menu_item.
      const inSelectLikePanel = !!element.closest(
        '.mat-select-panel, .mat-mdc-select-panel, .ng-dropdown-panel, .ng-select-dropdown, ' +
        '.ant-select-dropdown, .rc-virtual-list-holder, .select2-results, .choices__list--dropdown, ' +
        '[role="listbox"]'
      );
      if (!inSelectLikePanel && (tag === 'div' || tag === 'span' || tag === 'button')) {
        const clsLower = (element.className || '').toString().toLowerCase();
        if (/(^|[\s_-])(menu[_-]?item|menuitem|menu[_-]?row)([\s_-]|$)/i.test(clsLower)) {
          return true;
        }
      }
    }

    const tag = (element.tagName || '').toLowerCase();
    if (tag === 'td' && element.closest('table[class*="menu"], table[class*="Menu"], [class*="gwt-Menu"]')) {
      return true;
    }

    const cls = (element.className || '').toString();
    if (/gwt-MenuItem|MenuItem\b/i.test(cls)) return true;

    if (element.closest('[class*="gwt-Menu"]')) {
      if (!inComboboxWidget || !inComboboxWidget.contains(element)) return true;
    }
    return false;
  }

  /**
   * Проверяет, является ли элемент опцией dropdown
   */
  isDropdownOption(element) {
    if (!element) return false;

    if (this.isNonOptionControlElement(element)) {
      this.logRecorderClickRoute('isDropdownOption → false: non-option control', {
        tag: element.tagName,
        className: String(element.className || '').slice(0, 120)
      });
      return false;
    }

    if (this.isApplicationMenuItem(element)) {
      this.logRecorderClickRoute('isDropdownOption → false: application menu item', {
        tag: element.tagName,
        className: String(element.className || '').slice(0, 120),
        text: (element.textContent || '').trim().slice(0, 80)
      });
      return false;
    }

    // Триггеры вида *__result / .result у app-select — это сам combobox, а не опция списка.
    const triggerLikeId = (element.id || '').toLowerCase();
    const triggerLikeClass = (element.className || '').toString().toLowerCase();
    const inDropdownRoot = !!element.closest('app-select, ng-select, mat-select, p-dropdown, v-select');
    const isDropdownTriggerLike = inDropdownRoot && (
      triggerLikeId.includes('__result') ||
      triggerLikeClass.includes('result')
    );
    if (isDropdownTriggerLike) {
      this.logRecorderClickRoute('isDropdownOption → false: trigger-like (result/__result)', {
        tag: element.tagName,
        id: element.id || ''
      });
      return false;
    }
    
    // Исключаем ячейки календаря/datepicker — это не опции dropdown
    const cls = (element.className || '').toString().toLowerCase();
    if (cls.includes('calendar__table-cell') || cls.includes('calendar-table-cell') ||
        cls.includes('datepicker') || cls.includes('date-picker') ||
        element.closest('[class*="calendar"], [class*="datepicker"], p-calendar, p-datepicker')) {
      this.logRecorderClickRoute('isDropdownOption → false: calendar/datepicker', {
        tag: element.tagName
      });
      return false;
    }
    
    // Проверяем по классам
    const className = element.className || '';
    const classLower = className.toString().toLowerCase();
    const role = element.getAttribute('role');
    if (
      (classLower.includes('select-box') || classLower.includes('placeholder') || classLower.includes('arrow') || classLower.includes('result')) &&
      role !== 'option' &&
      !classLower.includes('option')
    ) {
      this.logRecorderClickRoute('isDropdownOption → false: select-box/placeholder/arrow/result (not option)', {
        tag: element.tagName
      });
      return false;
    }
    const optionClasses = [
      'option',
      'mat-option',
      'ng-option',
      'dropdown-item',
      'select-option',
      'menu__item',
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
    const hasOptionRole = role === 'option';
    
    // Проверяем, находится ли в панели dropdown.
    // Важно: generic menu/panel (toolbar, app-menu) не должен автоматически считаться dropdown.
    const selectGroupAncestor = element.closest('[class*="select-group"]');
    const isInOpenSelectGroupPanel = !!(
      selectGroupAncestor &&
      /\bopen\b/i.test((selectGroupAncestor.className || '').toString()) &&
      selectGroupAncestor.querySelector('[class*="option"], [role="option"]')
    );
    const strongDropdownPanelHost = this.closestStrongSelectLikePanelHost(element);
    const weakDropdownPanelHost = element.closest(
      '[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [class*="content-list"], [class*="menu__item"], [class*="option"]'
    );
    const hasSemanticOptionContext = !!element.closest(
      'option, [role="option"], .mat-option, .mat-mdc-option, .ng-option, .ant-select-item-option, .select2-results__option, .choices__item--selectable, .v-list-item, [aria-selected="true"], [aria-selected="false"]'
    );
    const hasRecentDropdownContext = !!this.resolveRecentDropdownForOption(element);
    const weakPanelOptionSignals =
      hasOptionRole || hasOptionClass || hasSemanticOptionContext || hasRecentDropdownContext;
    const isInDropdownPanel = !!(
      strongDropdownPanelHost ||
      isInOpenSelectGroupPanel ||
      (weakDropdownPanelHost && weakPanelOptionSignals)
    );
    
    // Проверяем, есть ли текст (опции обычно имеют текст)
    const text = element.textContent?.trim() || element.innerText?.trim() || '';
    const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
    const hasText = text && 
                    text.length > 0 &&
                    !placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
    const isReasonableOptionLength = text.length > 0 && text.length < 120;
    
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
      hasSemanticOptionContext,
      hasRecentDropdownContext,
      hasText: !!hasText,
      text: text.substring(0, 30),
      isVisible,
      isClickable,
      isNotDropdownContainer,
      className: className.substring(0, 50)
    });
    
    // Если элемент находится в панели dropdown и имеет текст, это опция
    if (isInDropdownPanel && hasText && isVisible && isClickable && isReasonableOptionLength) {
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
      const nearbyPanels = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="menu"], [class*="content-list"], [role="listbox"], .cdk-overlay-pane, [class*="select-group"]'))
        .filter(p => {
          if ((p.className || '').toString().toLowerCase().includes('select-group')) {
            const cls = (p.className || '').toString().toLowerCase();
            const hasOptions = !!p.querySelector('[class*="option"], [role="option"]');
            if (!cls.includes('open') || !hasOptions) return false;
          }
          const pRect = p.getBoundingClientRect();
          const eRect = element.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(pRect.left - eRect.left, 2) + 
            Math.pow(pRect.top - eRect.top, 2)
          );
          return distance < 1500 && pRect.width > 0 && pRect.height > 0 && p.offsetParent !== null;
        });
      
      if (nearbyPanels.length > 0) {
        // Дополнительная проверка: элемент должен находиться внутри одной из панелей
        const isInsidePanel = nearbyPanels.some(panel => panel.contains(element));
        if (isInsidePanel) {
          const insideStrongPanel = nearbyPanels.some(
            panel => panel.contains(element) && this.isStrongSelectLikePanelHost(panel)
          );
          if (insideStrongPanel || weakPanelOptionSignals) {
            console.log('   ✅ Определено как опция: элемент внутри открытой панели dropdown');
            return true;
          }
          this.logRecorderClickRoute('isDropdownOption → false: inside generic panel only (no strong panel / option signals)', {
            tag: element.tagName,
            className: String(element.className || '').slice(0, 120),
            text: text.slice(0, 80),
            weakPanelOptionSignals
          });
          console.log('   🚫 Не считаю опцией: панель без признаков listbox/select');
          return false;
        }
        console.log('   🚫 Не считаю опцией: элемент лишь рядом с панелью, но не внутри неё');
        return false;
      }
    }
    
    // Еще одна проверка: если элемент находится внутри элемента с классом, указывающим на опцию
    const parentWithOptionClass = element.closest(
      '[role="option"], .mat-option, .mat-mdc-option, .ng-option, .ant-select-item-option, .ant-select-item, ' +
      '.select2-results__option, .choices__item--selectable, [class*="menu__item"]'
    );
    if (parentWithOptionClass && parentWithOptionClass !== element) {
      const parentText = parentWithOptionClass.textContent?.trim() || '';
      const isParentPlaceholder = placeholderTexts.some(ph => parentText.toLowerCase().includes(ph.toLowerCase()));
      const isParentReasonableLength = parentText.length > 0 && parentText.length < 100;
      
      if (!isParentPlaceholder && isParentReasonableLength && isVisible && isClickable) {
        const isParentInStrongPanel = !!this.closestStrongSelectLikePanelHost(parentWithOptionClass);
        if (isParentInStrongPanel) {
          console.log('   ✅ Определено как опция: элемент внутри родителя с классом опции в панели dropdown');
          return true;
        }
      }
    }
    
    if (weakDropdownPanelHost || strongDropdownPanelHost || isInOpenSelectGroupPanel) {
      this.logRecorderClickRoute('isDropdownOption → false: no rule matched (was in list-like context)', {
        tag: element.tagName,
        className: String(element.className || '').slice(0, 120),
        text: text.slice(0, 80),
        isInDropdownPanel,
        weakPanelOptionSignals
      });
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
    
    // Элементы datepicker/календаря — не опции dropdown, сразу выходим
    const cls = (optionElement.className || '').toString().toLowerCase();
    if (cls.includes('calendar__table-cell') || cls.includes('calendar-table-cell') ||
        cls.includes('datepicker') || cls.includes('date-picker') ||
        optionElement.closest('[class*="calendar"], [class*="datepicker"], p-calendar, p-datepicker')) {
      return null;
    }

    if (this.isApplicationMenuItem(optionElement)) {
      console.log('🔍 [Dropdown] Пункт прикладного меню — не ищем родительский combobox');
      return null;
    }

    // Быстрый путь: если недавно открывали dropdown, связываем опцию с ним.
    const recentDropdown = this.resolveRecentDropdownForOption(optionElement);
    if (recentDropdown) {
      return recentDropdown;
    }
    
    console.log('🔍 [Dropdown] Ищу родительский dropdown для опции...');
    
    // ПРИОРИТЕТ: Используем SeleniumUtils для поиска (логика из автотеста)
    if (this.seleniumUtils) {
      console.log('   🔍 [SeleniumUtils] Использую SeleniumUtils для поиска родительского dropdown');
      // Angular CDK overlays: панели рендерятся в .cdk-overlay-container вне DOM dropdown,
      // поэтому panel.closest('app-select') всегда null. Ищем dropdown по панелям: для каждого
      // dropdown получаем его панели и проверяем, содержит ли панель опцию.
      const dropdownSelectors = 'app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select, [role="combobox"], [aria-haspopup="listbox"], [elementid]';
      const allDropdowns = Array.from(document.querySelectorAll(dropdownSelectors))
        .filter(dd => this.isDropdownRootCandidate(dd, { allowElementId: true }));
      for (const dd of allDropdowns) {
        const panels = this.seleniumUtils.findDropdownPanels(dd);
        for (const panel of panels) {
          if (panel.contains(optionElement)) {
            console.log('   ✅ [SeleniumUtils] Найден через панели dropdown:', dd.tagName);
            return dd;
          }
        }
      }
      // Fallback: общий поиск панелей (если dropdown не в стандартном списке)
      const panels = this.seleniumUtils.findDropdownPanels();
      for (const panel of panels) {
        if (panel.contains(optionElement)) {
          const dropdown = panel.closest(dropdownSelectors);
          if (dropdown && this.isDropdownRootCandidate(dropdown, { allowElementId: true })) return dropdown;
          // Панель в overlay — ищем ближайший dropdown по расстоянию
          const panelRect = panel.getBoundingClientRect();
          let closest = null;
          let minDist = Infinity;
          for (const dd of allDropdowns) {
            const ddRect = dd.getBoundingClientRect();
            const d = Math.hypot(panelRect.left - ddRect.left, panelRect.top - ddRect.bottom);
            if (d < 1500 && d < minDist) { minDist = d; closest = dd; }
          }
          if (closest) return closest;
        }
      }
      console.log('   ℹ️ [SeleniumUtils] Опция не найдена в панелях, пробую обычный поиск...');
    } else {
      console.warn('   ⚠️ [SeleniumUtils] Утилита недоступна, использую обычный поиск');
    }
    
    // Ищем ближайший dropdown контейнер (включая PrimeNG p-dropdown, p-calendar, Vuetify v-select)
    const dropdown = optionElement.closest('app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select, [elementid], [role="combobox"], [aria-haspopup="listbox"], .select-container');
    if (dropdown && this.isDropdownRootCandidate(dropdown, { allowElementId: true })) {
      console.log('   ✅ Найден через closest:', dropdown.tagName);
      return dropdown;
    }
    
    // Ищем через панель
    const panel = optionElement.closest('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [class*="select-group"].open, [class*="content-list"], [role="listbox"], .cdk-overlay-pane');
    if (panel) {
      console.log('   📋 Найдена панель:', panel.tagName, panel.className || 'нет классов');
      const panelRect = panel.getBoundingClientRect();
      
      // Ищем app-select на странице, который может быть связан с этой панелью
      const allDropdowns = Array.from(document.querySelectorAll('app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select, [elementid], [role="combobox"], [aria-haspopup="listbox"]'))
        .filter(dd => this.isDropdownRootCandidate(dd, { allowElementId: true }));
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
        
        if (distance < 1500 && distance < minDistance) {
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
      const allDropdowns = Array.from(document.querySelectorAll('app-select, ng-select, mat-select, p-dropdown, p-calendar, v-select, [elementid], [role="combobox"], [aria-haspopup="listbox"]'))
        .filter(dd => this.isDropdownRootCandidate(dd, { allowElementId: true }));
      for (const dd of allDropdowns) {
        const resultElement = dd.querySelector('.result, [class*="result"], [id*="result"]');
        if (resultElement) {
          const resultText = resultElement.textContent?.trim() || resultElement.innerText?.trim() || '';
          // Если текст совпадает или dropdown открыт (есть видимые панели рядом)
          const nearbyPanels = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="menu"], [class*="select-group"].open, [class*="content-list"], [role="listbox"], .cdk-overlay-pane'))
            .filter(p => {
              const pRect = p.getBoundingClientRect();
              const ddRect = dd.getBoundingClientRect();
              const dist = Math.sqrt(
                Math.pow(pRect.left - ddRect.left, 2) + 
                Math.pow(pRect.top - ddRect.bottom, 2)
              );
              return dist < 1500 && pRect.width > 0 && pRect.height > 0 && p.offsetParent !== null;
            });
          
          if (nearbyPanels.length > 0 && nearbyPanels[0].contains(optionElement)) {
            console.log(`   ✅ Найден dropdown по панели, содержащей опцию`);
            return dd;
          }
        }
      }
    }
    
    const hasStrongDropdownSignals =
      optionElement.getAttribute('role') === 'option' ||
      !!optionElement.closest('[role="listbox"], .cdk-overlay-pane, .mat-select-panel, .ng-dropdown-panel, .ant-select-dropdown');
    if (hasStrongDropdownSignals) {
      console.warn('   ⚠️ Родительский dropdown не найден');
    }
    return null;
  }
  
  /**
   * Текст «опции» не совпадает с отображаемым значением combobox — типично для клика по пункту меню, когда polling ошибся.
   */
  shouldRejectDropdownValueForFieldMismatch(dropdownElement, optionText) {
    if (!dropdownElement || optionText == null) return false;
    const opt = String(optionText).trim();
    if (opt.length < 6) return false;
    let fieldVal = '';
    try {
      if (typeof this.findDropdownValueDirectly === 'function') {
        fieldVal = (this.findDropdownValueDirectly(dropdownElement) || '').trim();
      }
      if (!fieldVal) {
        const snap = this.captureDropdownSnapshot(dropdownElement, null);
        fieldVal = (this.getDropdownSnapshotValue(snap) || '').trim();
      }
    } catch (e) {
      return false;
    }
    if (!fieldVal) return false;
    if (fieldVal.includes(opt) || opt.includes(fieldVal)) return false;
    return true;
  }

  /**
   * Записывает выбор опции в dropdown (логика из автотеста).
   */
  async recordDropdownOptionSelection(dropdownElement, optionText, optionElement, sourceTimestamp = null) {
    try {
      optionText = this.sanitizeDropdownDetectedValue(optionText, dropdownElement);
      if (!optionText) {
        console.warn('⚠️ [Dropdown] Пропуск записи input: обнаружено составное/пустое значение');
        return;
      }
      if (optionElement && this.isNonOptionControlElement(optionElement)) {
        console.log(`📝 [Dropdown] Клик по button-like элементу — записываю как click, не dropdown-combobox`);
        await this.recordClickAction(optionElement, 'click', false, sourceTimestamp);
        return;
      }
      if (optionElement && this.isApplicationMenuItem(optionElement)) {
        console.log(`📝 [Dropdown] Пункт меню приложения — записываю клик, не ввод в combobox`);
        await this.recordClickAction(optionElement, 'click', false);
        return;
      }
      const isDirectOptionClick = !!(optionElement && this.isDropdownOption(optionElement));
      if (!isDirectOptionClick && this.shouldDeferImplicitDropdownSelection(dropdownElement, optionElement)) {
        console.warn(`⚠️ [Dropdown] Пропуск записи input: "${optionText}" выглядит предварительным значением (dropdown открыт)`);
        return;
      }
      if (!isDirectOptionClick && this.shouldRejectDropdownValueForFieldMismatch(dropdownElement, optionText)) {
        console.warn(`⚠️ [Dropdown] Пропуск записи input: значение «${optionText}» не совпадает с полем combobox`);
        if (optionElement) {
          if (this.shouldSuppressFallbackOptionClick(optionElement, optionText)) {
            console.log('⏭️ [Dropdown] Пропуск fallback click после mismatch: выбор уже записан');
            return;
          }
          await this.recordClickAction(optionElement, 'click', false);
        }
        return;
      }
      if (isDirectOptionClick) {
      }
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
      
      // Создаем действие input для выбора значения.
      // ВАЖНО: для type="input" subtype "dropdown-select" не поддерживается в ActionTypes
      // (он валиден для type="click"), поэтому используем dropdown-combobox.
      const action = {
        type: 'input',
        subtype: 'dropdown-combobox',
        selector: selector,
        element: elementInfo,
        elementKey: this.getElementKey(dropdownElement),
        value: optionText,
        displayValue: optionText,
        optionText: optionText,
        dropdownAutoFilled: true,
        timestamp: this.resolveActionTimestamp(sourceTimestamp, this.pendingDropdownFill?.actionMeta?.timestamp),
        url: window.location.href,
        isDropdownSelection: true,
        fieldLabel: fieldLabel || undefined,
        optionElement: {
          tag: optionElement?.tagName?.toLowerCase(),
          className: optionElement?.className,
          text: optionText
        }
      };
      
      // Сохраняем действие
      await this.saveAction(action);
      this.rememberDropdownSelection(selector, optionText, dropdownElement, fieldLabel);
      
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
    
    // ===== НОВОЕ: Проверка датапикера =====
    if (this.settings.recordDatepickers && this.isDatepickerInput(element)) {
      this.recordDatepickerAction(element);
      return; // Не обрабатываем как обычный change
    }
    // ======================================
    
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

    const isDropdownChange = this.isDropdownElement(element, null);
    const elementInfo = {
      tag: element.tagName?.toLowerCase(),
      id: element.id,
      className: element.className,
      text: this.selectorEngine.getElementText(element),
      attributes: this.getElementAttributes(element),
      isDropdown: isDropdownChange || false,
      dropdownType: isDropdownChange ? this.getDropdownType(element) : null
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
      elementKey: elementKey,
      value: selectedOptionValue,
      // #22: Добавляем текст выбранной опции для native select
      selectedOptionText: selectedOptionText,
      timestamp: Date.now(),
      url: window.location.href,
      fieldLabel: fieldLabel || undefined
    };
    
    if (isDropdownChange && this.shouldSkipDropdownChangeAfterSelection(selector, selectedOptionValue, element, fieldLabel)) {
      console.log('⏭️ [Recorder] Пропуск лишнего change после выбора dropdown-опции');
      return;
    }
    
    await this.saveAction(action);
    
    // Dropdown-fill запускаем только для реальных dropdown change.
    if (isDropdownChange) {
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

    // Если перед вводом висит отложенный click, фиксируем его сначала,
    // чтобы последовательность шагов не инвертировалась.
    if (this.pendingClickAction) {
      await this.flushPendingClickIfAny();
    }
    
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
    
    // Не автосохраняем input по таймеру, чтобы не писать промежуточные шаги
    // (например "текст " и затем "текст дальше"). Финальное значение сохраняется
    // в handleBlur/handleSubmit/при смене элемента/при остановке записи.
    if (this.pendingInputTimeout) {
      clearTimeout(this.pendingInputTimeout);
      this.pendingInputTimeout = null;
    }
    
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
    
    const { selector, elementInfo, value, timestamp, fieldLabel, element } = this.pendingInput;
    
    // Берем актуальное значение из DOM в момент финального сохранения.
    // Это покрывает случаи, когда UI меняет текст без input-события (автокомплит и т.п.).
    let finalValue = value;
    if (element && element.isConnected) {
      let liveValue = '';
      if (element.contentEditable === 'true') {
        liveValue = element.textContent || element.innerText || '';
      } else {
        liveValue = element.value || '';
      }
      if (typeof liveValue === 'string' && liveValue !== finalValue) {
        finalValue = liveValue;
      }
    }
    
    const action = {
      type: 'input',
      selector: selector,
      element: elementInfo,
      elementKey: this.pendingInput.elementKey,
      value: finalValue,
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

  getSelectorString(selector) {
    if (!selector) return '';
    if (typeof selector === 'string') return selector;
    return selector.selector || selector.value || '';
  }

  normalizeComparableValue(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  normalizeActionType(type) {
    if (window.ActionTypes?.normalizeActionType) {
      return window.ActionTypes.normalizeActionType(type);
    }
    if (type === 'assertion') return 'assert';
    if (type === 'navigate') return 'navigation';
    return type;
  }

  isSelectorRequiredType(type) {
    const selectorRequired = new Set([
      'click', 'dblclick', 'input', 'change', 'hover', 'focus', 'blur', 'clear', 'upload', 'drag',
      'table', 'datepicker', 'assert', 'wait'
    ]);
    return selectorRequired.has(type);
  }

  sanitizeActionForRecording(action) {
    if (!action || typeof action !== 'object') return action;
    const sanitized = { ...action };
    if (typeof sanitized.fieldLabel === 'string') {
      sanitized.fieldLabel = sanitized.fieldLabel.trim();
      if (!sanitized.fieldLabel) delete sanitized.fieldLabel;
    }
    if (sanitized.selector && typeof sanitized.selector === 'object') {
      sanitized.selector = { ...sanitized.selector };
      if (typeof sanitized.selector.selector === 'string') {
        sanitized.selector.selector = sanitized.selector.selector.trim();
      }
      if (typeof sanitized.selector.value === 'string') {
        sanitized.selector.value = sanitized.selector.value.trim();
      }
    }
    return sanitized;
  }

  validateActionForRecording(action) {
    if (!action || typeof action !== 'object') {
      return { ok: false, reasonCode: 'invalid-action', message: 'Получен пустой или некорректный шаг' };
    }

    const normalizedType = this.normalizeActionType(action.type);
    if (!normalizedType) {
      return { ok: false, reasonCode: 'missing-type', message: 'У шага отсутствует тип (type)' };
    }

    if (window.ActionTypes?.isActionTypeSupported && !window.ActionTypes.isActionTypeSupported(normalizedType)) {
      return { ok: false, reasonCode: 'unsupported-type', message: `Неподдерживаемый тип шага: ${normalizedType}` };
    }

    if (action.subtype && window.ActionTypes?.isSubtypeSupported && !window.ActionTypes.isSubtypeSupported(normalizedType, action.subtype)) {
      return { ok: false, reasonCode: 'unsupported-subtype', message: `Неподдерживаемый подтип "${action.subtype}" для "${normalizedType}"` };
    }

    if (this.isSelectorRequiredType(normalizedType)) {
      const selectorStr = this.getSelectorString(action.selector);
      if (!selectorStr) {
        return { ok: false, reasonCode: 'missing-selector', message: `Для шага "${normalizedType}" отсутствует валидный селектор` };
      }
    }

    if ((normalizedType === 'click' || normalizedType === 'dblclick') && this.isSuspiciousClickPayload(action)) {
      return {
        ok: false,
        reasonCode: 'suspicious-click',
        message: 'Подозрительный клик по служебному/декоративному блоку пропущен'
      };
    }

    return { ok: true, reasonCode: 'ok', message: '' };
  }

  /**
   * Ближайший «настоящий» контрол (button/a/role), если клик пришёл на span/div внутри кнопки.
   * Нужен для фильтра suspicious-click без доступа к live DOM при валидации.
   */
  getNearestInteractiveHostTagName(element) {
    if (!element || typeof element.closest !== 'function') return '';
    try {
      const host = element.closest(
        'button, a, input[type="submit"], input[type="button"], input[type="reset"], ' +
        '[role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="link"]'
      );
      return host ? String(host.tagName || '').toLowerCase() : '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Признаки явного UI-контрола по сериализованным полям шага (без live DOM).
   */
  isSerializedInteractiveClickSurface(action) {
    const tag = String(action?.element?.tag || '').toLowerCase();
    if (['button', 'a', 'summary', 'select', 'textarea', 'label'].includes(tag)) return true;
    if (tag === 'input') return true;
    const host = String(action?.element?.controlHostTag || '').toLowerCase();
    if (['button', 'a', 'input'].includes(host)) return true;
    const attrs = action?.element?.attributes || {};
    const role = String(attrs.role || '').toLowerCase();
    if (['button', 'link', 'menuitem', 'menuitemcheckbox', 'tab'].includes(role)) return true;
    const cls = this.normalizeClassName(action?.element?.className).toLowerCase();
    if (/(^|\s)(ant-btn|btn|button|mat-button|mdc-button|p-button)(\s|$)/.test(cls)) return true;
    if (cls.includes('app-header-button') || cls.includes('save-button')) return true;
    return false;
  }

  isSuspiciousClickPayload(action) {
    if (!action || typeof action !== 'object') return false;
    if (action.isDropdownClick || action.isDropdownSelection || action.dropdownAutoFilled) return false;
    const text = String(action?.element?.text || '').trim();
    const tag = String(action?.element?.tag || '').toLowerCase();
    const selectorStr = this.getSelectorString(action.selector).toLowerCase();
    if (['style', 'link', 'meta', 'script'].includes(tag)) return true;
    if (selectorStr === 'html' || selectorStr === 'body' || selectorStr.endsWith(' html') || selectorStr.endsWith(' body')) return true;
    if (!text) return false;
    const cssArtifact = /@charset|[a-z-]+\s*:\s*[^;]+;|[.#][a-z0-9_-]+\s*\{/i.test(text);
    if (cssArtifact) return true;
    // textContent у обёрток (toolbar, flex-контейнер) часто >180 символов — не отбрасываем клики по кнопкам внутри
    if (this.isSerializedInteractiveClickSurface(action)) return false;
    return text.length > 180;
  }

  prepareActionForRecording(action) {
    const sanitizedAction = this.sanitizeActionForRecording(action);
    const validation = this.validateActionForRecording(sanitizedAction);
    if (!validation.ok) {
      return {
        ok: false,
        reasonCode: validation.reasonCode,
        message: validation.message
      };
    }

    sanitizedAction.recordValidation = {
      status: 'accepted',
      reasonCode: 'ok',
      validatedAt: Date.now()
    };
    return {
      ok: true,
      action: sanitizedAction
    };
  }

  showRecordingRuntimeNotification({ level = 'warning', title = 'Запись', message = '', throttleKey = '' } = {}) {
    const key = throttleKey || `${level}:${title}:${message}`;
    const now = Date.now();
    const prev = this.recordingAlertTimestamps.get(key) || 0;
    if (now - prev < this.recordingAlertThrottleMs) return;
    this.recordingAlertTimestamps.set(key, now);

    let background = '#f57c00';
    if (level === 'error') background = '#d32f2f';
    if (level === 'info') background = '#1976d2';
    const icon = level === 'error' ? '❌' : (level === 'info' ? 'ℹ️' : '⚠️');

    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 56px;
      right: 12px;
      background: ${background};
      color: white;
      padding: 10px 12px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 9999999;
      font-family: Arial, sans-serif;
      font-size: 13px;
      max-width: 420px;
      line-height: 1.4;
    `;
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 3px;">${icon} ${this.escapeHtml(title)}</div>
      <div>${this.escapeHtml(message)}</div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), level === 'error' ? 5000 : 3600);
  }

  shouldSkipDuplicateAction(action) {
    const isDropdownRelated = !!(
      action?.isDropdownSelection ||
      action?.dropdownAutoFilled ||
      action?.isDropdownClick ||
      action?.element?.isDropdown ||
      action?.element?.dropdownType
    );
    if (!isDropdownRelated) return false;

    const selectorStr = this.getSelectorString(action?.selector);
    const valueStr = action?.value == null ? '' : String(action.value).trim();
    const key = [
      action?.type || '',
      selectorStr,
      valueStr,
      action?.isDropdownSelection ? '1' : '0',
      action?.isDropdownClick ? '1' : '0',
      action?.dropdownAutoFilled ? '1' : '0'
    ].join('|');

    const now = Date.now();
    if (this.recentSavedAction && this.recentSavedAction.key === key) {
      const delta = now - this.recentSavedAction.timestamp;
      if (delta >= 0 && delta <= this.actionDedupWindowMs) {
        console.log(`⏭️ [Recorder] Антидубль: пропускаю повтор шага (${action?.type})`);
        return true;
      }
    }
    this.recentSavedAction = { key, timestamp: now };
    return false;
  }

  rememberDropdownSelection(selector, value, element = null, fieldLabel = null) {
    this.recentDropdownSelection = {
      selector: this.getSelectorString(selector),
      value: value == null ? '' : String(value).trim(),
      elementKey: this.getElementKey(element),
      fieldLabel: fieldLabel == null ? '' : String(fieldLabel).trim(),
      timestamp: Date.now()
    };
  }

  shouldSkipDropdownChangeAfterSelection(selector, value, element = null, fieldLabel = null) {
    const recent = this.recentDropdownSelection;
    if (!recent) return false;
    if ((Date.now() - recent.timestamp) > this.dropdownChangeDedupWindowMs) return false;

    const selectorStr = this.getSelectorString(selector);
    const elementKey = this.getElementKey(element);
    const labelStr = fieldLabel == null ? '' : String(fieldLabel).trim();
    const sameSelector = !!(selectorStr && recent.selector && selectorStr === recent.selector);
    const sameElement = !!(elementKey && recent.elementKey && elementKey === recent.elementKey);
    const sameFieldLabel = !!(labelStr && recent.fieldLabel && this.normalizeComparableValue(labelStr) === this.normalizeComparableValue(recent.fieldLabel));
    // Для dropdown после успешного выбора опции любые мгновенные change по тому же селектору
    // считаем служебными и не записываем отдельным шагом (даже если текст немного расходится).
    return sameSelector || sameElement || sameFieldLabel;
  }

  shouldSuppressFallbackOptionClick(optionElement, optionText = '') {
    const recent = this.recentDropdownSelection;
    if (!recent) return false;
    if ((Date.now() - recent.timestamp) > this.dropdownChangeDedupWindowMs) return false;

    const currentText = String(
      optionText ||
      optionElement?.textContent ||
      optionElement?.innerText ||
      ''
    ).trim();
    if (!currentText || !recent.value) return false;
    return this.normalizeComparableValue(currentText) === this.normalizeComparableValue(recent.value);
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
    const byId = document.getElementById('autotest-recording-indicator');
    if (byId) {
      console.log('🗑️ [Recorder] Удаляю индикатор записи');
      byId.remove();
    }
    try {
      document.querySelectorAll('#autotest-recording-indicator').forEach((el) => el.remove());
    } catch (_) {}
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
   * Определяет «критический» клик, который почти наверняка ведёт к навигации/выходу (logout).
   * Для таких кликов запись выполняется немедленно, без ожидания dblclick.
   */
  isCriticalNavigationClick(element) {
    if (!element) return false;

    const clickable = element.closest?.(
      'a, button, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], ' +
      '[onclick], [ng-click], [data-action], [data-testid]'
    ) || element;
    const tag = (clickable.tagName || '').toString().toLowerCase();
    const getAttr = (name) => {
      try {
        return clickable.getAttribute ? (clickable.getAttribute(name) || '') : '';
      } catch {
        return '';
      }
    };

    const href = getAttr('href');
    const typeAttr = (getAttr('type') || '').toLowerCase();
    const className = (clickable.className || '').toString().toLowerCase();
    const text = (clickable.textContent || '').toString().toLowerCase();
    const ariaLabel = getAttr('aria-label').toLowerCase();
    const title = getAttr('title').toLowerCase();
    const dataAction = (getAttr('data-action') || getAttr('data-test') || getAttr('data-testid')).toLowerCase();

    const logoutKeywords = [
      'logout', 'log out', 'signout', 'sign-out', 'sign out',
      'выход', 'выйти', 'log off', 'logoff'
    ];

    const saveKeywords = [
      'save', 'submit', 'apply', 'commit', 'store', 'persist',
      'сохран', 'примен', 'запис', 'отправ', 'готово'
    ];

    const matchesAny = (keywords) => keywords.some((k) =>
      text.includes(k) ||
      className.includes(k) ||
      ariaLabel.includes(k) ||
      title.includes(k) ||
      dataAction.includes(k)
    );

    const hasLogoutWord = matchesAny(logoutKeywords);
    const hasSaveWord = matchesAny(saveKeywords);

    const role = (getAttr('role') || '').toLowerCase();
    const isConcreteControl =
      tag === 'button' ||
      tag === 'a' ||
      (tag === 'input' && ['submit', 'button', 'reset'].includes(typeAttr)) ||
      role === 'button' ||
      role === 'menuitem' ||
      role === 'menuitemcheckbox' ||
      className.includes('btn') ||
      className.includes('ant-btn') ||
      className.includes('mdc-button') ||
      className.includes('mat-button') ||
      className.includes('p-button') ||
      className.includes('app-header-button') ||
      className.includes('save-button');

    // Выход/логирование — как раньше, по ключевым словам (часто пункт меню не button).
    if (hasLogoutWord) return true;
    // «Сохранить» и т.п.: только на явном контроле, иначе ложные срабатывания по длинным текстам страницы
    return !!(hasSaveWord && isConcreteControl);
  }

  /**
   * Поля, где пользователь часто делает double-click (выделение/редактирование):
   * для них не блокируем второй быстрый клик throttle'ом.
   */
  isFieldLikeElementForDoubleClick(element) {
    if (!element || element.nodeType !== 1) return false;
    const el = element.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable], [role="textbox"], [role="searchbox"], [role="combobox"], .ql-editor, .ProseMirror');
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input') {
      const type = (el.getAttribute?.('type') || 'text').toLowerCase();
      // Исключаем не-текстовые control'ы.
      if (['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(type)) {
        return false;
      }
    }
    return true;
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

  // ============================================================================
  // ПРИОРИТЕТ 1: ДАТАПИКЕРЫ (Datepicker Recording)
  // ============================================================================

  /**
   * Проверка что элемент является датапикером
   */
  isDatepickerInput(element) {
    if (element.tagName !== 'INPUT') return false;
    
    // HTML5 date/time inputs
    if (element.type === 'date' || 
        element.type === 'datetime-local' || 
        element.type === 'time' ||
        element.type === 'month' ||
        element.type === 'week') {
      return true;
    }
    
    // Custom datepickers (по классам/атрибутам)
    const datepickerClasses = [
      'datepicker',
      'date-picker',
      'flatpickr',
      'hasDatepicker', // jQuery UI
      'react-datepicker',
      'picker__input',
      'duet-date__input'
    ];
    
    for (const cls of datepickerClasses) {
      if (element.classList.contains(cls)) return true;
    }
    
    // Data-атрибуты
    if (element.hasAttribute('data-datepicker') ||
        element.hasAttribute('data-date') ||
        (element.hasAttribute('data-provide') && element.getAttribute('data-provide') === 'datepicker')) {
      return true;
    }
    
    return false;
  }

  /**
   * Запись выбора даты при клике по ячейке календаря.
   * Извлекает дату из календаря, находит связанный input и записывает действие datepicker.
   * @returns {Promise<boolean>} true если записано как datepicker, false для fallback на click
   */
  async recordCalendarCellAction(cellElement) {
    const cell = cellElement.closest('[class*="calendar__table-cell"], [class*="day-cell"], [class*="date-cell"]') || cellElement;
    const dateValue = this.extractDateFromCalendarCell(cell);
    const dateInput = this.findDateInputForCalendar(cell);
    if (!dateValue || !dateInput) return false;

    const allSelectors = this.selectorEngine.generateAllSelectors(dateInput);
    const selector = this.selectorEngine.selectBestSelector(allSelectors);
    const alternatives = this.selectorEngine.findAlternativeSelectors(dateInput);
    if (alternatives.length > 0) selector.alternatives = alternatives;

    const action = {
      type: 'datepicker',
      subtype: 'datepicker-select-date',
      selector,
      date: dateValue,
      value: dateValue,
      description: `Select date: ${dateValue}`,
      timestamp: Date.now(),
      fieldLabel: this.findFieldLabel(dateInput) || undefined
    };
    console.log('📅 [Calendar] Записываю datepicker:', dateValue, 'селектор:', selector?.selector || selector?.value);
    await this.saveAction(action);
    return true;
  }

  /**
   * Извлекает дату (ДД.ММ.ГГГГ) из ячейки календаря и заголовка
   */
  extractDateFromCalendarCell(cellElement) {
    let day = NaN;
    const dataDate = cellElement.getAttribute?.('data-date') || cellElement.getAttribute?.('data-day') || cellElement.getAttribute?.('data-value');
    if (dataDate) {
      const parts = String(dataDate).split(/[-/.\s]/).filter(Boolean);
      if (parts.length >= 3) {
        const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d) && d >= 1 && d <= 31 && m >= 1 && m <= 12) {
          return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
        }
      }
      const isoMatch = String(dataDate).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (isoMatch) {
        return `${String(parseInt(isoMatch[3], 10)).padStart(2, '0')}.${String(parseInt(isoMatch[2], 10)).padStart(2, '0')}.${isoMatch[1]}`;
      }
    }
    let cellText = (cellElement.textContent || cellElement.innerText || '').trim();
    if (!cellText && cellElement.children && cellElement.children.length === 1) {
      cellText = (cellElement.children[0].textContent || '').trim();
    }
    const ariaOrTitle = (cellElement.getAttribute?.('aria-label') || cellElement.getAttribute?.('title') || '').trim();
    if (ariaOrTitle) {
      const dmy = ariaOrTitle.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
      const ymd = ariaOrTitle.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (dmy) {
        const d = parseInt(dmy[1], 10), m = parseInt(dmy[2], 10), y = parseInt(dmy[3], 10);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
      }
      if (ymd) {
        const d = parseInt(ymd[3], 10), m = parseInt(ymd[2], 10), y = parseInt(ymd[1], 10);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
      }
    }
    const dayMatch = cellText.match(/\b([1-9]|[12]\d|3[01])\b/);
    day = dayMatch ? parseInt(dayMatch[1], 10) : parseInt(cellText, 10);
    if (isNaN(day) || day < 1 || day > 31) return null;

    let calendar = cellElement.closest('[class*="calendar"], [class*="datepicker"], [class*="date-picker"], [class*="date-table"], p-calendar, p-datepicker');
    if (!calendar) calendar = cellElement.closest('.cdk-overlay-pane');
    let searchText = (calendar ? calendar.textContent : '') || '';
    if (!searchText || searchText.length < 10) {
      let p = cellElement.parentElement;
      for (let i = 0; i < 15 && p; i++) {
        if (p.textContent && p.textContent.length > 50) { searchText = p.textContent; break; }
        p = p.parentElement;
      }
    }
    if (!searchText || searchText.length < 10) searchText = document.body.textContent || '';

    const monthNames = {
      ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
      en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    };
    const monthShort = { ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };

    let month = -1, year = -1;
    const headerText = searchText.toLowerCase();
    for (let mi = 0; mi < 12; mi++) {
      if (monthNames.ru[mi] && headerText.includes(monthNames.ru[mi].toLowerCase())) { month = mi + 1; break; }
      if (monthNames.en[mi] && headerText.includes(monthNames.en[mi].toLowerCase())) { month = mi + 1; break; }
      if (monthShort.ru[mi] && headerText.includes(monthShort.ru[mi])) { month = mi + 1; break; }
      if (monthShort.en[mi] && headerText.includes(monthShort.en[mi])) { month = mi + 1; break; }
    }
    const yearMatch = searchText.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) year = parseInt(yearMatch[1], 10);

    if (month < 1 || year < 2000) {
      const now = new Date();
      month = now.getMonth() + 1;
      year = now.getFullYear();
    }

    const d = String(day).padStart(2, '0');
    const mo = String(month).padStart(2, '0');
    return `${d}.${mo}.${year}`;
  }

  /**
   * Находит input даты, связанный с открытым календарём
   */
  findDateInputForCalendar(cellElement) {
    const calendar = cellElement.closest('[class*="calendar"], [class*="datepicker"], [class*="date-picker"], p-calendar, p-datepicker');
    if (!calendar) return null;
    const calRect = calendar.getBoundingClientRect();
    const isInCalendar = (el) => calendar.contains && calendar.contains(el);

    // Приоритет 1: прямой id deadlineDate (типичный кейс для корпоративных форм)
    const byDeadlineId = document.getElementById('deadlineDate');
    if (byDeadlineId && byDeadlineId.tagName === 'INPUT' && !isInCalendar(byDeadlineId)) return byDeadlineId;

    // Приоритет 2: кнопка открытия календаря (deadlineDate_btn) — input рядом
    const triggerBtn = document.querySelector('#deadlineDate_btn, [id*="Date_btn"], [id*="date_btn"]');
    if (triggerBtn && triggerBtn.tagName !== 'INPUT') {
      const container = triggerBtn.closest('form, .form-group, .wizard__form-group, [class*="form"], .wizard');
      if (container) {
        const inputInContainer = container.querySelector('input[id*="date"], input[id*="Date"], input[placeholder*="ДД"], input[placeholder*="dd"], input[placeholder*="Дд"]');
        if (inputInContainer && !isInCalendar(inputInContainer)) return inputInContainer;
      }
      const triggerId = (triggerBtn.id || '').replace(/_btn$/, '');
      if (triggerId) {
        const byId = document.getElementById(triggerId);
        if (byId && byId.tagName === 'INPUT' && !isInCalendar(byId)) return byId;
      }
      const prev = triggerBtn.previousElementSibling;
      if (prev && prev.tagName === 'INPUT' && !isInCalendar(prev)) return prev;
      const parent = triggerBtn.parentElement;
      if (parent) {
        const inputInParent = parent.querySelector('input');
        if (inputInParent && !isInCalendar(inputInParent)) return inputInParent;
      }
    }

    // Приоритет 3: input с placeholder ДД.ММ.ГГГГ (типичный российский формат даты)
    const byPlaceholder = document.querySelector('input[placeholder*="ДД"], input[placeholder*="дд"], input[placeholder*="dd"]');
    if (byPlaceholder && !isInCalendar(byPlaceholder)) return byPlaceholder;

    // Приоритет 4: поиск по label "Ближайший контрольный срок" / "контрольный срок"
    const labels = Array.from(document.querySelectorAll('label, .label, [class*="label"]'));
    for (const lbl of labels) {
      const txt = (lbl.textContent || '').toLowerCase();
      if (/контрольн|ближайш|срок|deadline|дата/i.test(txt)) {
        const forId = lbl.getAttribute('for');
        if (forId) {
          const inp = document.getElementById(forId);
          if (inp && inp.tagName === 'INPUT' && !isInCalendar(inp)) return inp;
        }
        const wrapper = lbl.closest('.form-group, .wizard__form-group, [class*="form-group"], .field');
        if (wrapper) {
          const inp = wrapper.querySelector('input');
          if (inp && !isInCalendar(inp)) return inp;
        }
      }
    }

    const datePatterns = [/дд\.мм|dd\.mm|гггг|yyyy|date|дата|срок|deadline/i];
    const candidates = Array.from(document.querySelectorAll('input, [contenteditable="true"]'))
      .filter(el => {
        if (el.tagName !== 'INPUT' && !el.getAttribute('contenteditable')) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || !el.offsetParent) return false;
        const id = (el.id || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        const placeholder = (el.placeholder || '').toLowerCase();
        const label = (el.closest('label')?.textContent || '').toLowerCase();
        const isDateLike = /date|deadline|срок|дата|контрольн/i.test(id + name + placeholder + label) ||
          datePatterns.some(p => p.test(placeholder));
        if (!isDateLike) return false;
        if (calendar.contains(el)) return false;
        return true;
      });

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const sorted = candidates.slice().sort((a, b) => {
      const da = Math.abs(a.getBoundingClientRect().bottom - calRect.top);
      const db = Math.abs(b.getBoundingClientRect().bottom - calRect.top);
      return da - db;
    });
    return sorted[0];
  }

  /**
   * Запись действия с датапикером
   */
  recordDatepickerAction(element) {
    const value = element.value;
    if (!value) return; // Игнорируем пустые значения
    
    const action = {
      type: 'datepicker',
      subtype: this.getDatepickerSubtype(element),
      selector: this.getSelector(element),
      timestamp: Date.now()
    };
    
    // Определяем поле для значения в зависимости от подтипа
    switch (action.subtype) {
      case 'datepicker-select-date':
      case 'datepicker-select-datetime':
        action.date = value;
        action.value = value;
        action.description = `Select date: ${value}`;
        break;
        
      case 'datepicker-select-time':
        action.time = value;
        action.value = value;
        action.description = `Select time: ${value}`;
        break;
        
      case 'datepicker-select-range':
        // Если value содержит разделитель " - " или " to ", это range
        if (value.includes(' - ') || value.includes(' to ')) {
          const separator = value.includes(' - ') ? ' - ' : ' to ';
          const [start, end] = value.split(separator).map(s => s.trim());
          action.startDate = start;
          action.endDate = end;
          action.from = start;
          action.to = end;
          action.description = `Select date range: ${start} - ${end}`;
        } else {
          // Fallback к обычной дате
          action.subtype = 'datepicker-select-date';
          action.date = value;
          action.value = value;
          action.description = `Select date: ${value}`;
        }
        break;
    }
    
    console.log('📅 [Datepicker] Записываю действие:', action);
    this.recordAction(action);
  }

  /**
   * Определение подтипа датапикера
   */
  getDatepickerSubtype(element) {
    switch(element.type) {
      case 'date':
        return 'datepicker-select-date';
      case 'time':
        return 'datepicker-select-time';
      case 'datetime-local':
        return 'datepicker-select-datetime';
      case 'month':
      case 'week':
        return 'datepicker-select-date';
      default:
        // Для custom датапикеров пытаемся определить по значению
        if (element.value.includes(' - ') || element.value.includes(' to ')) {
          return 'datepicker-select-range';
        }
        return 'datepicker-select-date';
    }
  }

  // ============================================================================
  // ПРИОРИТЕТ 1: ТАБЛИЦЫ (Table Click Recording)
  // ============================================================================

  /**
   * Определение клика по таблице
   */
  detectTableClick(element) {
    // Ищем ближайшую ячейку таблицы
    const cell = element.closest('td, th');
    if (!cell) return null;
    
    const row = cell.closest('tr');
    if (!row) return null;
    
    const table = row.closest('table');
    if (!table) return null;
    
    // Вычисляем индексы
    const rows = Array.from(table.querySelectorAll('tr'));
    const rowIndex = rows.indexOf(row);
    
    const cells = Array.from(row.querySelectorAll('td, th'));
    const columnIndex = cells.indexOf(cell);
    
    if (rowIndex === -1 || columnIndex === -1) return null;
    
    // Получаем текст ячейки для описания
    const cellText = cell.textContent.trim().substring(0, 30);
    const tableName = this.getTableName(table);
    
    return {
      type: 'table',
      subtype: 'table-click-cell',
      selector: this.getSelector(table),
      rowIndex: rowIndex,
      columnIndex: columnIndex,
      description: `Click table cell [${rowIndex}][${columnIndex}]${tableName ? ' in ' + tableName : ''}${cellText ? ': "' + cellText + '"' : ''}`,
      timestamp: Date.now()
    };
  }

  /**
   * Получение имени таблицы для описания
   */
  getTableName(table) {
    // Пытаемся найти caption или aria-label
    const caption = table.querySelector('caption');
    if (caption) return caption.textContent.trim();
    
    const ariaLabel = table.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    const id = table.id;
    if (id) return id;
    
    const className = table.className.split(' ')[0];
    if (className) return className;
    
    return '';
  }

  // ============================================================================
  // ПРИОРИТЕТ 1: DRAG & DROP (Drag and Drop Recording)
  // ============================================================================

  /**
   * Обработка начала перетаскивания
   */
  handleDragStart(event) {
    this.dragSource = event.target;
    this.dragStartPos = {
      x: event.clientX,
      y: event.clientY
    };
    console.log('🔀 [Drag] Начало перетаскивания:', {
      element: this.dragSource.tagName,
      startPos: this.dragStartPos
    });
  }

  /**
   * Обработка drop события
   */
  handleDrop(event) {
    if (!this.dragSource) return;
    
    event.preventDefault();
    
    const action = this.createDragAction(event);
    if (action) {
      console.log('🔀 [Drag] Записываю действие:', action);
      this.recordAction(action);
    }
    
    // Сброс состояния
    this.dragSource = null;
    this.dragStartPos = null;
  }

  /**
   * Обработка dragend (сброс состояния)
   */
  handleDragEnd(event) {
    this.dragSource = null;
    this.dragStartPos = null;
  }

  /**
   * Создание действия drag
   */
  createDragAction(dropEvent) {
    const endPos = {
      x: dropEvent.clientX,
      y: dropEvent.clientY
    };
    
    // Вычисляем смещение
    const offsetX = Math.round(endPos.x - this.dragStartPos.x);
    const offsetY = Math.round(endPos.y - this.dragStartPos.y);
    
    // Находим целевой элемент
    const target = this.findDropTarget(dropEvent);
    
    // Определяем тип: drag-and-drop или drag-by-offset
    const distanceThreshold = 50; // pixels
    const isDragToElement = target && 
                            target !== this.dragSource && 
                            Math.abs(offsetX) < distanceThreshold * 3 && 
                            Math.abs(offsetY) < distanceThreshold * 3;
    
    if (isDragToElement) {
      // Drag-and-drop на элемент
      return {
        type: 'drag',
        subtype: 'drag-and-drop',
        selector: this.getSelector(this.dragSource),
        targetSelector: this.getSelector(target),
        description: `Drag element to target`,
        timestamp: Date.now()
      };
    } else if (Math.abs(offsetX) > 10 || Math.abs(offsetY) > 10) {
      // Drag-by-offset (если смещение > 10px)
      return {
        type: 'drag',
        subtype: 'drag-by-offset',
        selector: this.getSelector(this.dragSource),
        offsetX: offsetX,
        offsetY: offsetY,
        x: offsetX,
        y: offsetY,
        description: `Drag by offset (${offsetX}, ${offsetY})`,
        timestamp: Date.now()
      };
    }
    
    return null; // Игнорируем микро-перемещения
  }

  /**
   * Поиск целевого элемента drop
   */
  findDropTarget(dropEvent) {
    const target = dropEvent.target;
    
    // Ищем ближайший draggable или drop zone
    const droppable = target.closest('[data-droppable], [data-drop-zone], .drop-zone, .droppable');
    if (droppable) return droppable;
    
    // Ищем родительский контейнер с role или data-атрибутами
    const container = target.closest('[role="list"], [role="listbox"], [data-sortable], .sortable');
    if (container) return container;
    
    // Иначе возвращаем сам target
    return target;
  }

  // ============================================================================
  // ИНТЕГРАЦИЯ В handleChange (для датапикеров)
  // ============================================================================
  
  /**
   * Обёртка для оригинального handleChange - добавляем проверку датапикеров
   * ВАЖНО: Этот метод будет вызываться ДО существующей логики handleChange
   */
  handleChangeWithDatepicker(originalHandleChange, event) {
    // Проверяем datepicker ПЕРЕД обычной обработкой change
    if (this.settings.recordDatepickers) {
      const element = event.target;
      if (this.isDatepickerInput(element)) {
        this.recordDatepickerAction(element);
        event.stopPropagation(); // Не записываем как обычный change
        return; // Прерываем обработку
      }
    }
    
    // Если не датапикер - вызываем оригинальный обработчик
    return originalHandleChange.call(this, event);
  }

  // ============================================================================
  // ИНТЕГРАЦИЯ В handleClick (для таблиц)
  // ============================================================================
  
  /**
   * Проверка клика по таблице - вызывается в НАЧАЛЕ handleClick
   * Возвращает true если клик обработан (table click), false если нет
   */
  checkTableClick(element) {
    if (!this.settings.recordTableClicks) return false;
    
    const tableAction = this.detectTableClick(element);
    if (tableAction) {
      console.log('📊 [Table] Обнаружен клик по таблице, записываю');
      this.recordAction(tableAction);
      return true; // Клик обработан, не продолжать handleClick
    }
    
    return false; // Это не table click, продолжить обычную обработку
  }
}

// Инициализируем улучшенный рекордер
const improvedActionRecorder = new ImprovedActionRecorder();
window.improvedActionRecorder = improvedActionRecorder;

})();
