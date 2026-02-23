// Модуль воспроизведения тестов

// Загрузка общего модуля с типами действий
// Используется singleton из window.ActionTypes (загружается через manifest.json)

class TestPlayer {
  constructor() {
    this.isPlaying = false;
    this.isPaused = false; // Флаг паузы воспроизведения
    this.pausedState = null; // Состояние при паузе: {test, actionIndex, mode, visibleActions, allActions, startStepNumber}
    this.currentTest = null;
    this.currentActionIndex = 0;
    this.selectorEngine = window.selectorEngine;
    this.playMode = 'optimized';
    this.recordingNotification = null; // Ссылка на уведомление о записи
    this.currentSelectorCallback = null; // Callback для фиксации фактически использованного селектора
    this.pendingTestSave = null; // Таймер отложенного сохранения теста
    
    // Загружаем настройки AI
    this.loadAISettings();
    this.debugMode = false; // Режим отладки
    this.debugPaused = false; // Пауза в режиме отладки
    this.parallelRun = false; // Параллельный прогон
    this.runIndex = null; // Индекс запуска в параллельном прогоне
    this.totalRuns = null; // Всего запусков в параллельном прогоне
    this.screenshots = []; // Скриншоты для сравнения
    
    // Инициализация SelectorOptimizer
    this.optimizer = null;
    this._initOptimizer();
    
    // Инициализация SeleniumUtils (логика из автотеста)
    if (window.SeleniumUtils) {
      this.seleniumUtils = new window.SeleniumUtils();
      console.log('✅ [Player] SeleniumUtils инициализирован (логика из автотеста)');
    } else {
      this.seleniumUtils = null;
      console.warn('⚠️ [Player] SeleniumUtils недоступен! Проверьте загрузку selenium-utils.js');
    }
    
    // Инициализация SmartWaiter (система умных ожиданий)
    if (window.SmartWaiter) {
      this.smartWaiter = new window.SmartWaiter();
      console.log('✅ [Player] SmartWaiter инициализирован (умные ожидания вместо фиксированных задержек)');
    } else {
      this.smartWaiter = null;
      console.warn('⚠️ [Player] SmartWaiter недоступен! Проверьте загрузку smart-waiter.js');
    }
    
    this.skipNextInput = false; // Флаг для пропуска следующего ввода
    this.skipNextInputValue = null; // Значение, которое уже установлено
    this.ineffectiveActions = []; // Индексы неэффективных шагов для автоматического удаления
    this.pendingResumeAfterRecording = null; // Состояние для продолжения воспроизведения после остановки записи
    this.lastKnownUrl = null; // Последний известный URL для отслеживания редиректов
    this.navigationInitiatedByPlayer = false; // Навигация, инициированная явным шагом navigation
    this.urlChangeListener = null; // Слушатель изменений URL
    this.urlCheckFunction = null; // Функция проверки URL для удаления слушателя
    this.runHistoryCleanupTimer = null;
    
    // Система пользовательских переменных
    this.userVariables = {}; // Хранилище пользовательских переменных {имя: значение}
    this.previousUrl = null; // Предыдущий URL для извлечения переменных
    
    // Система перехвата ошибок консоли
    this.consoleErrors = []; // Массив ошибок консоли для текущего шага
    this.consoleErrorHandlers = {
      originalError: null,
      originalWarn: null,
      originalLog: null,
      onError: null
    };
    this.recordConsoleErrors = false; // Флаг записи ошибок консоли
    this.screenshotSettings = { saveToDisk: false, onlyOnError: false, storeInMemory: true, savePath: '' };
    this.screenshotSettingsLoaded = false;

    // Контракт поддерживаемых действий (загружается из shared/action-types.js)
    // ИСПРАВЛЕНИЕ #30: Используем единый источник истины
    if (window.ActionTypes) {
      this.supportedActionTypes = window.ActionTypes.SUPPORTED_ACTION_TYPES;
      this.supportedSubtypes = window.ActionTypes.SUPPORTED_SUBTYPES;
    } else {
      console.error('❌ [Player] shared/action-types.js не загружен!');
      // Fallback на старые значения для обратной совместимости
      this.supportedActionTypes = new Set([
        'click', 'dblclick', 'input', 'change', 'navigate', 'navigation',
        'scroll', 'keyboard', 'keydown', 'keyup', 'keypress', 'wait',
        'api', 'variable', 'setVariable', 'assert', 'loop', 'condition',
        'javascript', 'screenshot', 'hover', 'focus', 'blur', 'clear',
        'upload', 'cookie'
      ]);
      this.supportedSubtypes = {
        wait: new Set(['wait-value', 'wait-option', 'wait-options-count', 'wait-enabled', 'wait-until']),
        assert: new Set(['assert-value', 'assert-contains', 'assert-count', 'assert-disabled', 'assert-multiselect']),
        scroll: new Set(['scroll-element', 'scroll-top', 'scroll-bottom']),
        navigation: new Set(['nav-refresh', 'nav-back', 'nav-forward', 'new-tab', 'close-tab']),
        click: new Set(['click', 'right-click', 'double-click']),
        cookie: new Set(['set-cookie', 'get-cookies'])
      };
    }
    
    this.init();
  }

  /**
   * Инициализация оптимизатора
   */
  _initOptimizer() {
    setTimeout(() => {
      if (window.selectorOptimizer) {
        this.optimizer = window.selectorOptimizer;
        console.log('✅ [Player] SelectorOptimizer подключен');
      }
    }, 150);
  }

  // ========================================================================
  // ОСНОВНЫЕ МЕТОДЫ ВОСПРОИЗВЕДЕНИЯ
  // ========================================================================

  /**
   * Загружает настройки AI (заглушка если AI отключен)
   */
  async loadAISettings() {
    this.aiSettings = { enabled: false };
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response && response.success && response.settings) {
        this.aiSettings = response.settings.ai || { enabled: false };
      }
    } catch (e) {
      // Игнорируем
    }
  }

  /**
   * Загружает настройки скриншотов
   */
  async loadScreenshotSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response && response.success && response.settings) {
        this.screenshotSettings = response.settings.screenshots || { saveToDisk: false, onlyOnError: false, storeInMemory: true, savePath: '' };
      }
    } catch (e) {
      this.screenshotSettings = { saveToDisk: false, onlyOnError: false, storeInMemory: true, savePath: '' };
    }
    this.screenshotSettingsLoaded = true;
  }

  /**
   * Проверяет, нужно ли возобновить воспроизведение после перезагрузки
   */
  async checkResumePlayback() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PLAYBACK_STATE' });
      // Поддерживаем оба формата ответа:
      // 1) { success, state: {...} }
      // 2) { success, isPlaying, test, actionIndex, nextUrl, runMode }
      const state = (response && response.success)
        ? (response.state || (response.isPlaying ? {
            test: response.test,
            actionIndex: response.actionIndex,
            nextUrl: response.nextUrl,
            runMode: response.runMode
          } : null))
        : null;
      if (state) {
        console.log('🔄 Найдено сохраненное состояние воспроизведения:', state);

        if (state.nextUrl === '__AUTO_NAV__') {
          await chrome.runtime.sendMessage({ type: 'CLEAR_PLAYBACK_STATE' });
          this.resumePlayback(state.test, state.actionIndex, state.runMode || 'optimized');
          return;
        }

        // Проверяем URL
        const currentUrl = window.location.href;
        if (state.nextUrl) {
          const normalizeUrl = (url) => {
            try { return new URL(url).pathname; } catch (e) { return url; }
          };
          if (normalizeUrl(currentUrl) === normalizeUrl(state.nextUrl) || currentUrl === state.nextUrl) {
            console.log('✅ URL совпадает, восстанавливаю воспроизведение');
            // Очищаем состояние
            await chrome.runtime.sendMessage({ type: 'CLEAR_PLAYBACK_STATE' });
            // Запускаем восстановление
            this.resumePlayback(state.test, state.actionIndex, state.runMode || 'optimized');
          } else {
            console.log(`⚠️ URL не совпадает: текущий=${currentUrl}, ожидаемый=${state.nextUrl}`);
          }
        }
      }
    } catch (error) {
      // Нет сохраненного состояния
    }
  }

  /**
   * Форматирует селектор для логирования
   */
  formatSelector(selectorData) {
    if (!selectorData) return 'N/A';
    if (typeof selectorData === 'string') return selectorData;
    return selectorData.selector || selectorData.value || JSON.stringify(selectorData);
  }

  normalizeUrlForNavigation(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const s = raw.trim();
    if (!s) return s;
    // already absolute or special protocol
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    // absolute path on current origin
    if (s.startsWith('/')) {
      try { return new URL(s, window.location.origin).href; } catch (e) { return s; }
    }
    // heuristics: "ya.ru", "example.com/path" -> https://...
    if (/^[^\s/]+\.[^\s/]+/.test(s)) {
      return 'https://' + s;
    }
    // fallback: treat as relative
    try { return new URL(s, window.location.href).href; } catch (e) { return s; }
  }

  normalizeActionType(type) {
    // ИСПРАВЛЕНИЕ #29: Используем полный маппинг из shared/action-types.js
    if (window.ActionTypes) {
      return window.ActionTypes.normalizeActionType(type);
    }
    // Fallback для обратной совместимости
    if (type === 'assertion') return 'assert';
    if (type === 'navigate') return 'navigation';
    return type;
  }

  validateActionSupport(action) {
    const normalizedType = this.normalizeActionType(action?.type);
    if (!normalizedType || !this.supportedActionTypes.has(normalizedType)) {
      throw new Error(`Неподдерживаемый тип действия: ${action?.type || 'undefined'}`);
    }

    const subtype = action?.subtype;
    if (subtype) {
      const allowed = this.supportedSubtypes[normalizedType];
      if (allowed && !allowed.has(subtype)) {
        throw new Error(`Неподдерживаемый subtype "${subtype}" для действия "${normalizedType}"`);
      }
    }

    return normalizedType;
  }

  extractSelectorString(selectorData) {
    if (!selectorData) return '';
    if (typeof selectorData === 'string') return selectorData;
    return selectorData.selector || selectorData.value || '';
  }

  countMatchingElements(selectorData) {
    const selector = this.extractSelectorString(selectorData);
    if (!selector) return 0;

    // XPath поддерживаем отдельно
    if (selector.startsWith('/') || selector.startsWith('(')) {
      try {
        const snapshot = document.evaluate(
          selector,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        return snapshot.snapshotLength || 0;
      } catch (e) {
        return 0;
      }
    }

    try {
      return document.querySelectorAll(selector).length;
    } catch (e) {
      return 0;
    }
  }

  async waitForCondition(predicate, timeoutMs = 5000, intervalMs = 200, description = 'condition') {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!this.isPlaying) {
        throw new Error('Воспроизведение остановлено во время ожидания');
      }
      try {
        const ok = await predicate();
        if (ok) return true;
      } catch (e) {
        // Игнорируем ошибку текущей итерации и продолжаем polling
      }
      await this.delay(intervalMs);
    }
    throw new Error(`Таймаут ожидания: ${description} (${timeoutMs} мс)`);
  }

  /**
   * Проверяет, видимо ли действие (не hidden)
   */
  isActionVisible(action) {
    if (!action) return false;
    // hidden-действия не показываются в оптимизированном режиме
    if (action.hidden && this.playMode !== 'full') return false;
    return true;
  }

  /**
   * Возвращает массив действий для текущего режима запуска
   */
  getRuntimeActions(actions) {
    if (!actions) return [];
    if (this.playMode === 'full') return actions;
    return actions.filter(a => !a.hidden);
  }

  /**
   * Подставляет переменные в строку
   */
  substituteVariables(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const trimmed = varName.trim();
      if (this.userVariables && this.userVariables[trimmed] !== undefined) {
        return this.userVariables[trimmed];
      }
      // Проверяем testVariables
      if (this.testVariables && this.testVariables[trimmed]?.value !== undefined) {
        return this.testVariables[trimmed].value;
      }
      return match; // Оставляем как есть
    });
  }

  /**
   * Обрабатывает переменные в значении
   */
  async processVariables(value) {
    if (!value || typeof value !== 'string') return value;
    return this.substituteVariables(value);
  }

  /**
   * Проверяет видимость элемента
   */
  isElementVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  /**
   * Получает пользовательские селекторы для действия
   */
  getUserSelectors(action) {
    if (!action) return [];
    const selectors = [];
    if (action.userSelectors && Array.isArray(action.userSelectors)) {
      selectors.push(...action.userSelectors);
    }
    if (action.selector?.alternatives && Array.isArray(action.selector.alternatives)) {
      selectors.push(...action.selector.alternatives);
    }
    return selectors;
  }

  /**
   * Пробует найти элемент через альтернативные селекторы (как в старом плагине: userSelectors → основной → alternatives → fallbacks).
   */
  async tryAlternativeSelectors(action) {
    if (!action) return null;
    console.log('🔍 Пробую альтернативные способы поиска элемента...');

    const selectorData = action.selector || action;

    // 1) Пользовательские селекторы (сортировка по isUserSelected)
    const userSelectors = action.userSelectors && Array.isArray(action.userSelectors)
      ? [...action.userSelectors].sort((a, b) => (b?.isUserSelected ? 1 : 0) - (a?.isUserSelected ? 1 : 0))
      : [];
    for (const userSelector of userSelectors) {
      const sel = typeof userSelector === 'string' ? { type: 'css', selector: userSelector, value: userSelector } : userSelector;
      const selectorValue = sel?.selector || sel?.value;
      if (!selectorValue || (action.selector && selectorValue === action.selector.selector)) continue;
      try {
        const el = this.selectorEngine?.findElementSync?.(sel);
        if (el && el instanceof Element) {
          console.log('✅ Элемент найден через пользовательский резервный селектор');
          return el;
        }
      } catch (e) {
        // следующий
      }
    }

    // 2) Повторная попытка по основному селектору из действия
    if (action.selector && action.selector.selector) {
      try {
        const el = this.selectorEngine?.findElementSync?.(action.selector);
        if (el && el instanceof Element) {
          console.log('✅ Элемент найден по оригинальному селектору из действия');
          return el;
        }
      } catch (e) {
        // следующий
      }
    }

    // 3) Альтернативные селекторы из action.selector.alternatives (в т.ч. isParent)
    if (selectorData.alternatives && Array.isArray(selectorData.alternatives)) {
      for (const alt of selectorData.alternatives) {
        try {
          const sel = typeof alt === 'string' ? { type: 'css', selector: alt, value: alt } : alt;
          if (!sel.selector) continue;
          if (sel.isParent) {
            const parentSelector = (sel.selector || '').replace(/\s*>\s*\*\s*$/, '');
            const parent = parentSelector ? document.querySelector(parentSelector) : null;
            if (parent) {
              const el = this.selectorEngine?.findElementSync?.(sel);
              if (el && el instanceof Element) {
                console.log('✅ Элемент найден через альтернативный родительский селектор');
                return el;
              }
            }
          } else {
            const el = this.selectorEngine?.findElementSync?.(sel);
            if (el && el instanceof Element) {
              console.log(`✅ Элемент найден через альтернативный селектор: ${sel.selector}`);
              return el;
            }
          }
        } catch (e) {
          // следующий
        }
      }
    }

    // 4) Fallbacks: dropdown-триггеры, поле статуса, поиск по тексту/href/value/name, частичный ID, кнопки по тексту, aria-label
    return this._tryAlternativeSelectorsFallbacks(action);
  }

  /**
   * Включает перехват ошибок консоли
   */
  startConsoleErrorCapture() {
    if (this.recordConsoleErrors) return;
    this.recordConsoleErrors = true;
    this.consoleErrors = [];

    const originalError = console.error;
    const originalWarn = console.warn;
    this.consoleErrorHandlers.originalError = originalError;
    this.consoleErrorHandlers.originalWarn = originalWarn;

    const self = this;
    console.error = function (...args) {
      if (self.recordConsoleErrors) {
        self.consoleErrors.push({ level: 'error', message: args.map(a => String(a)).join(' '), timestamp: Date.now() });
      }
      originalError.apply(console, args);
    };
    console.warn = function (...args) {
      if (self.recordConsoleErrors) {
        self.consoleErrors.push({ level: 'warn', message: args.map(a => String(a)).join(' '), timestamp: Date.now() });
      }
      originalWarn.apply(console, args);
    };

    // Перехват window.onerror
    this.consoleErrorHandlers.onError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      if (self.recordConsoleErrors) {
        self.consoleErrors.push({ level: 'error', message: `${message} (${source}:${lineno}:${colno})`, timestamp: Date.now() });
      }
      if (self.consoleErrorHandlers.onError) {
        return self.consoleErrorHandlers.onError(message, source, lineno, colno, error);
      }
    };
  }

  /**
   * Выключает перехват ошибок консоли
   */
  stopConsoleErrorCapture() {
    this.recordConsoleErrors = false;
    if (this.consoleErrorHandlers.originalError) {
      console.error = this.consoleErrorHandlers.originalError;
    }
    if (this.consoleErrorHandlers.originalWarn) {
      console.warn = this.consoleErrorHandlers.originalWarn;
    }
    if (this.consoleErrorHandlers.onError !== undefined) {
      window.onerror = this.consoleErrorHandlers.onError;
    }
    this.consoleErrorHandlers = { originalError: null, originalWarn: null, originalLog: null, onError: null };
  }

  // ========================================================================
  // ГЛАВНЫЙ МЕТОД ЗАПУСКА ТЕСТА
  // ========================================================================

  /**
   * Запускает воспроизведение теста
   * @param {Object} test - Объект теста
   * @param {string} mode - Режим воспроизведения: 'full' | 'optimized'
   */
  async playTest(test, mode = 'optimized') {
    if (this.isPlaying) {
      console.warn('⚠️ Тест уже воспроизводится');
      return;
    }

    this.isPlaying = true;
    this.currentTest = test;
    this.currentTestId = test.id;
    this.playMode = mode;
    this.lastKnownUrl = window.location.href;
    this.ineffectiveActions = [];
    this.consoleErrors = [];

    // Индикатор «ЗАПИСЬ» не должен отображаться при воспроизведении
    const recordingIndicator = document.getElementById('autotest-recording-indicator');
    if (recordingIndicator) recordingIndicator.remove();

    // Инициализируем переменные из теста
    this.userVariables = {};
    this.testVariables = {};
    if (test.variables) {
      for (const [varName, varData] of Object.entries(test.variables)) {
        if (varData && typeof varData === 'object' && varData.value !== undefined && varData.value !== null) {
          this.userVariables[varName] = varData.value;
        } else if (varData !== undefined && varData !== null && typeof varData !== 'object') {
          this.userVariables[varName] = varData;
        }
      }
      console.log(`📦 [Variables] Загружено ${Object.keys(this.userVariables).length} переменных`);
    }

    // Очищаем скриншоты
    this.screenshots = [];

    // Инициализируем историю прогона
    const startTime = Date.now();
    this.runHistory = {
      testId: String(test.id),
      testName: test.name,
      startTime: new Date(startTime).toISOString(),
      runId: startTime,
      mode: this.playMode,
      steps: [],
      success: false,
      error: null,
      totalDuration: 0,
      transcript: []
    };

    // Включаем перехват ошибок консоли
    this.startConsoleErrorCapture();

    this.addPlayingIndicator();

    console.log(`\n${'='.repeat(50)}`);
    console.log(`▶️ ВОСПРОИЗВЕДЕНИЕ ТЕСТА: ${test.name}`);
    console.log(`📊 Режим: ${mode}, Действий: ${test.actions?.length || 0}`);
    console.log(`🌐 Страница: ${window.location.href}`);
    console.log(`${'='.repeat(50)}\n`);

    try {
      // Ждем загрузки страницы
      await this.waitForPageLoad();

      // Получаем действия для текущего режима
      const allActions = test.actions || [];
      const runtimeActions = this.getRuntimeActions(allActions);
      this.currentActionIndex = 0;

      // Отслеживаем URL
      this.startUrlTracking();

      // Запускаем выполнение
      await this.executeActions(runtimeActions, allActions, 0);

      const hasStepErrors = this.runHistory?.steps?.some(step => step.success === false);
      if (this.runHistory) {
        this.runHistory.success = !hasStepErrors;
        if (hasStepErrors) {
          const firstFailed = this.runHistory.steps.find(step => step.success === false);
          this.runHistory.error = firstFailed?.error || 'Один или несколько шагов завершились с ошибкой';
        } else {
          this.runHistory.error = null;
        }
      }

      this.notifyCompletion(!hasStepErrors, hasStepErrors ? (this.runHistory?.error || 'Ошибки в шагах') : null);
    } catch (error) {
      console.error('❌ Ошибка при выполнении теста:', error);
      this.notifyCompletion(false, error.message);
    } finally {
      this.stopPlaying();
    }
  }

  // ========================================================================
  // ОСНОВНОЙ ЦИКЛ ВЫПОЛНЕНИЯ ДЕЙСТВИЙ
  // ========================================================================

  /**
   * Выполняет массив действий последовательно
   * @param {Array} actions - Массив действий для выполнения
   * @param {Array} allActions - Полный массив всех действий теста (для вычисления общего количества)
   * @param {number} startStepNumber - Начальный номер шага (для правильного отображения прогресса)
   */
  async executeActions(actions, allActions, startStepNumber = 0) {
    const totalSteps = this.getRuntimeActions(allActions).length;

    for (let i = 0; i < actions.length; i++) {
      if (!this.isPlaying) {
        console.log('⏹️ Воспроизведение остановлено');
        return;
      }

      // Проверяем паузу
      await this.checkAndSavePauseState(actions, allActions, startStepNumber, i);

      const action = actions[i];
      if (!action || typeof action !== 'object') {
        console.warn(`⚠️ Шаг ${i + 1}: пропуск — действие отсутствует или неверный формат`);
        continue;
      }
      if (!action.type) {
        console.warn(`⚠️ Шаг ${i + 1}: пропуск — у действия нет типа (type)`);
        continue;
      }
      // Если действие скрыто и режим не 'full', пропускаем
      if (action.hidden && this.playMode !== 'full') {
        continue;
      }

      const realStepNumber = startStepNumber + i + 1;
      this.currentActionIndex = startStepNumber + i;
      this.navigationInitiatedByPlayer = false;

      console.log(`\n${'—'.repeat(60)}`);
      console.log(`▶️ Шаг ${realStepNumber} / ${totalSteps}: ${action.type} ${action.fieldLabel ? '(' + action.fieldLabel + ')' : ''}`);
      if (action.selector) {
        console.log(`   Селектор: ${this.formatSelector(action.selector)}`);
      }
      console.log(`${'—'.repeat(60)}`);

      // Режим отладки
      if (this.debugMode) {
        await this.debugStep(action, realStepNumber, totalSteps);
      }

      // Отправляем прогресс
      this.notifyStepProgress({
        current: realStepNumber,
        total: totalSteps,
        type: action.type,
        action: action
      });

      // Сбрасываем ошибки консоли для нового шага
      this.consoleErrors = [];

      // Скриншот ДО действия
      let beforeScreenshot = null;
      try {
        beforeScreenshot = await this.takeScreenshot();
      } catch (e) { /* ignore */ }

      const stepStartTime = Date.now();
      let stepSuccess = true;
      let stepError = null;
      let usedSelectorStr = this.formatSelector(action?.selector);

      this.lastScreenshotResult = null;
      try {
        await this.executeActionWithFallback(action, actions, allActions, i, realStepNumber, totalSteps);
        console.log(`✅ Шаг ${realStepNumber} выполнен успешно`);
      } catch (error) {
        stepSuccess = false;
        stepError = error.message || String(error);
        console.error(`❌ Шаг ${realStepNumber} завершился с ошибкой: ${stepError}`);

        // Критическая ошибка поиска элемента: прекращаем прогон сразу,
        // чтобы не оставлять тест "висеть" на последующих шагах.
        const isElementNotFound = /Элемент не найден|Element not found|не найден/i.test(stepError);
        if (isElementNotFound) {
          this.notifyCompletion(false, stepError);
          this.stopPlaying();
          return;
        }
      }

      const stepDuration = Date.now() - stepStartTime;

      // Отправляем завершение шага как можно раньше:
      // для кликов, которые инициируют навигацию, страница может выгрузиться
      // до сохранения скриншотов/истории.
      try {
        chrome.runtime.sendMessage({
          type: 'TEST_STEP_COMPLETED',
          testId: this.currentTest?.id,
          step: realStepNumber,
          total: totalSteps,
          success: stepSuccess,
          error: stepError,
          duration: stepDuration
        }).catch(() => {});
      } catch (e) { /* ignore */ }

      // Скриншот ПОСЛЕ действия
      let afterScreenshot = null;
      try {
        afterScreenshot = await this.takeScreenshot();
      } catch (e) { /* ignore */ }

      // Сохраняем шаг в историю
      this.ensureRunHistoryInitialized();
      const stepRecord = {
        stepNumber: realStepNumber,
        type: action?.type ?? 'unknown',
        selector: usedSelectorStr,
        value: action?.value ?? null,
        success: stepSuccess,
        error: stepError,
        duration: stepDuration,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        beforeScreenshot: beforeScreenshot,
        afterScreenshot: afterScreenshot,
        consoleErrors: this.consoleErrors.length > 0 ? [...this.consoleErrors] : undefined,
        fieldLabel: action?.fieldLabel ?? null
      };

      // Для шага screenshot сохраняем результат действия
      if (action?.type === 'screenshot' && this.lastScreenshotResult) {
        stepRecord.screenshot = this.lastScreenshotResult;
        this.lastScreenshotResult = null;
      }

      // Сохраняем скриншоты на диск
      if (beforeScreenshot) {
        const path = await this.saveScreenshotToFile(beforeScreenshot, realStepNumber, 'before');
        if (path) stepRecord.beforeScreenshotPath = path;
      }
      if (afterScreenshot) {
        const type = stepSuccess ? 'after' : 'error';
        const path = await this.saveScreenshotToFile(afterScreenshot, realStepNumber, type);
        if (path) stepRecord.afterScreenshotPath = path;
      }
      if (stepRecord.screenshot) {
        const path = await this.saveScreenshotToFile(stepRecord.screenshot, realStepNumber, 'screenshot');
        if (path) stepRecord.screenshotPath = path;
      }

      this.runHistory.steps.push(stepRecord);

      // Транскрипт
      if (this.runHistory.transcript && action) {
        this.runHistory.transcript.push(this.getStepDescription(action, realStepNumber, totalSteps));
      }

      // Если шаг с навигацией — она перезагрузит страницу, прерываемся
      if (action?.type === 'navigate' || action?.type === 'navigation') {
        const urlBefore = this.lastKnownUrl;
        // navigateToUrl уже вызвана внутри executeAction
        // После навигации страница перезагрузится и resumePlayback подхватит
        if (window.location.href !== urlBefore) {
          console.log('🔄 Навигация выполнена, ожидаю перезагрузки...');
          return; // Выходим, resumePlayback подхватит
        }
      }

      // Задержка между шагами
      if (action?.type !== 'wait' && i < actions.length - 1) {
        const nextAction = actions[i + 1];
        if (nextAction && nextAction.type !== 'wait') {
          const optimizedDelay = await this.getOptimizedDelay(action?.type || 'default', 300);
          await this.delay(optimizedDelay);
        }
      }
    }
  }

  // ========================================================================
  // ВЫПОЛНЕНИЕ ДЕЙСТВИЯ С FALLBACK НА СЕЛЕКТОРЫ СОСЕДНИХ ШАГОВ
  // ========================================================================

  /**
   * Пытается выполнить действие. Если селектор не найден:
   *  1) Пробует резервные/альтернативные селекторы ВНУТРИ самого шага
   *  2) Пробует селекторы соседних шагов (до 5 вперёд, до 2 назад), включая скрытые (hidden)
   *  3) Для dropdown: если донорский шаг - часть цепочки (click→click option), выполняет 2-3 шага подряд
   * Если найден рабочий селектор из другого шага — заменяет его в текущем, помечая оригинальный как сомнительный.
   *
   * @param {Object} action - Текущее действие
   * @param {Array} actions - Массив действий текущего runtime (отфильтрованный по режиму)
   * @param {Array} allActions - Полный массив ВСЕХ действий теста (включая hidden)
   * @param {number} currentIndex - Индекс в массиве actions
   * @param {number} realStepNumber - Номер шага для лога
   * @param {number} totalSteps - Общее количество шагов
   */
  async executeActionWithFallback(action, actions, allActions, currentIndex, realStepNumber, totalSteps) {
    try {
      // === ЭТАП 0: Пробуем выполнить действие как есть ===
      await this.executeAction(action);
      return; // Успешно
    } catch (error) {
      // Проверяем: ошибка связана с ненайденным элементом?
      const errorMsg = error.message || '';
      const isNotFound = errorMsg.includes('не найден') ||
                         errorMsg.includes('not found') ||
                         errorMsg.includes('Элемент не найден') ||
                         errorMsg.includes('Element not found');

      if (!isNotFound) {
        throw error; // Ошибка не про селектор — пробрасываем
      }

      // Действия без селектора — fallback бессмысленен
      if (!action.selector) {
        throw error;
      }

      const originalSelector = JSON.parse(JSON.stringify(action.selector));
      const originalSelectorStr = this.formatSelector(originalSelector);

      console.log(`\n🔄 [SelectorFallback] Шаг ${realStepNumber}: селектор «${originalSelectorStr}» не найден. Запускаю поиск замены...`);

      // =================================================================
      // ЭТАП 1: Резервные/альтернативные селекторы ВНУТРИ шага
      // =================================================================
      // handleClick/handleInput уже вызывали tryAlternativeSelectors, но
      // там поиск идёт только findElementSync (однократно). Здесь пробуем
      // с retry + все варианты более тщательно.
      const internalAlternatives = this._collectInternalAlternatives(action);
      if (internalAlternatives.length > 0) {
        console.log(`   📋 [Этап 1] Пробую ${internalAlternatives.length} резервных селекторов ВНУТРИ шага...`);
        for (const altSelector of internalAlternatives) {
          const altStr = this.formatSelector(altSelector);
          try {
            const findResult = await this.findElementWithRetry(altSelector, 3, 300);
            if (findResult && findResult.element) {
              console.log(`   ✅ [Этап 1] Внутренний альтернативный селектор НАЙДЕН: ${altStr}`);
              // Подставляем и пробуем выполнить
              action.selector = JSON.parse(JSON.stringify(altSelector));
              try {
                await this.executeAction(action);
                console.log(`   ✅ Шаг ${realStepNumber} выполнен с внутренним альтернативным селектором: ${altStr}`);
                // Помечаем оригинальный как сомнительный
                this._applySwap(action, originalSelector, altStr, -1, 'Резервный селектор внутри шага');
                return;
              } catch (retryErr) {
                console.warn(`   ⚠️ Выполнение с внутренним селектором не удалось: ${retryErr.message}`);
                action.selector = JSON.parse(JSON.stringify(originalSelector));
              }
            }
          } catch (e) {
            // Продолжаем
          }
        }
        console.log(`   ❌ [Этап 1] Ни один внутренний альтернативный селектор не подошёл`);
      }

      // =================================================================
      // ЭТАП 2: Селекторы из соседних шагов (включая hidden!)
      //         Порядок: сначала следующие (до +5), потом предыдущие (до -2)
      // =================================================================
      // Используем allActions (полный массив с hidden), чтобы видеть все шаги
      const currentActionInAll = allActions.indexOf(action);
      const searchInAll = currentActionInAll >= 0;
      const sourceArray = searchInAll ? allActions : actions;
      const sourceIndex = searchInAll ? currentActionInAll : currentIndex;

      // Собираем кандидатов: [индекс_в_sourceArray, расстояние_от_текущего]
      const candidates = [];
      // Вперёд до 5
      for (let offset = 1; offset <= 5; offset++) {
        const idx = sourceIndex + offset;
        if (idx < sourceArray.length) {
          candidates.push({ idx, offset, direction: 'next' });
        }
      }
      // Назад до 2
      for (let offset = 1; offset <= 2; offset++) {
        const idx = sourceIndex - offset;
        if (idx >= 0) {
          candidates.push({ idx, offset, direction: 'prev' });
        }
      }

      console.log(`   📋 [Этап 2] Пробую селекторы из ${candidates.length} соседних шагов (вперёд до 5, назад до 2, вкл. скрытые)...`);

      for (const cand of candidates) {
        const donorAction = sourceArray[cand.idx];
        if (!donorAction || !donorAction.selector) continue;
        // Пропускаем wait, api, variable — у них нет осмысленных селекторов
        if (['wait', 'api', 'variable', 'setVariable'].includes(donorAction.type)) continue;
        // Не берём свой же селектор
        if (this.formatSelector(donorAction.selector) === originalSelectorStr) continue;

        const donorSelectorStr = this.formatSelector(donorAction.selector);
        const label = donorAction.hidden ? ' (скрытый)' : '';
        console.log(`   🔍 [${cand.direction} ${cand.offset}] Пробую селектор шага #${cand.idx + 1}${label}: ${donorSelectorStr}`);

        try {
          const findResult = await this.findElementWithRetry(donorAction.selector, 2, 300);
          if (findResult && findResult.element) {
            console.log(`   ✅ Селектор шага #${cand.idx + 1} НАЙДЕН!`);

            // Подменяем селектор и пробуем выполнить
            action.selector = JSON.parse(JSON.stringify(donorAction.selector));
            try {
              await this.executeAction(action);
              console.log(`   ✅ Шаг ${realStepNumber} выполнен с селектором от шага #${cand.idx + 1}${label}`);
              this._applySwap(action, originalSelector, donorSelectorStr, cand.idx, `Селектор из ${cand.direction === 'next' ? 'последующего' : 'предыдущего'} шага #${cand.idx + 1}${label}`);
              return;
            } catch (retryErr) {
              console.warn(`   ⚠️ Одиночное выполнение не удалось: ${retryErr.message}`);
              action.selector = JSON.parse(JSON.stringify(originalSelector));

              // =============================================================
              // ЭТАП 2b: Dropdown-цепочка — пробуем выполнить 2-3 шага подряд
              // Для выпадающих списков часто нужно: click(открыть) → click(option)
              // =============================================================
              if (this._looksLikeDropdownChain(donorAction, sourceArray, cand.idx)) {
                console.log(`   🔽 [Этап 2b] Похоже на dropdown-цепочку, пробую выполнить 2-3 шага подряд от шага #${cand.idx + 1}...`);
                const chainOk = await this._tryDropdownChain(sourceArray, cand.idx, action, originalSelector, realStepNumber);
                if (chainOk) return;
              }
            }
          }
        } catch (findErr) {
          console.log(`   ❌ Селектор шага #${cand.idx + 1} тоже не найден`);
        }
      }

      // Ничего не помогло
      console.error(`❌ [SelectorFallback] Все варианты исчерпаны для шага ${realStepNumber} (${originalSelectorStr})`);
      throw error;
    }
  }

  /**
   * Собирает все альтернативные селекторы ВНУТРИ одного шага.
   * Источники: action.userSelectors, action.selector.alternatives, action.selector.backup
   */
  _collectInternalAlternatives(action) {
    const alternatives = [];
    const seen = new Set();
    const primary = this.formatSelector(action.selector);
    seen.add(primary);

    const addIfNew = (sel) => {
      const normalized = typeof sel === 'string' ? { type: 'css', selector: sel, value: sel } : sel;
      if (!normalized?.selector) return;
      const key = normalized.selector;
      if (seen.has(key)) return;
      seen.add(key);
      alternatives.push(normalized);
    };

    // userSelectors
    if (Array.isArray(action.userSelectors)) {
      action.userSelectors.forEach(addIfNew);
    }
    // alternatives в selector
    if (Array.isArray(action.selector?.alternatives)) {
      action.selector.alternatives.forEach(addIfNew);
    }
    // backup в selector
    if (Array.isArray(action.selector?.backup)) {
      action.selector.backup.forEach(addIfNew);
    }
    // fallbackSelectors
    if (Array.isArray(action.fallbackSelectors)) {
      action.fallbackSelectors.forEach(addIfNew);
    }

    return alternatives;
  }

  /**
   * Применяет подмену селектора: ставит рабочий, помечает оригинальный как сомнительный
   */
  _applySwap(action, originalSelector, newSelectorStr, donorIndex, reason) {
    if (!action._suspiciousSelectors) {
      action._suspiciousSelectors = [];
    }
    action._suspiciousSelectors.push({
      selector: originalSelector,
      reason: reason || 'Элемент не найден при воспроизведении',
      replacedAt: new Date().toISOString(),
      replacedBy: newSelectorStr
    });
    action._selectorSwapped = true;
    action._selectorSwapFrom = donorIndex;

    // Сохраняем в тест через background
    this._markSelectorAsSuspicious(originalSelector, action, donorIndex, reason);
  }

  /**
   * Определяет, похож ли шаг на начало dropdown-цепочки
   * Паттерн: click(открытие) → click(выбор опции) или click → change
   */
  _looksLikeDropdownChain(donorAction, allActions, donorIndex) {
    if (donorAction.type !== 'click' && donorAction.type !== 'dblclick') return false;

    // Проверяем следующие 1-2 шага
    for (let k = 1; k <= 2; k++) {
      const next = allActions[donorIndex + k];
      if (!next) break;
      // Если следующий — click, change, input — это может быть выбор в dropdown
      if (['click', 'change', 'input'].includes(next.type)) {
        return true;
      }
      // Если wait — пропускаем, смотрим дальше
      if (next.type === 'wait') continue;
      break;
    }

    // Проверяем по метаданным элемента
    if (donorAction.element?.tag === 'select' ||
        donorAction.element?.tag === 'app-select' ||
        donorAction.fieldLabel?.toLowerCase().includes('выбер') ||
        donorAction.fieldLabel?.toLowerCase().includes('dropdown') ||
        donorAction.fieldLabel?.toLowerCase().includes('select')) {
      return true;
    }

    return false;
  }

  /**
   * Пробует выполнить цепочку из 2-3 шагов подряд (для dropdown)
   * Начинает с donorIndex в allActions. После цепочки пытается выполнить
   * оригинальное действие (action) — если dropdown уже открыт, action может сработать.
   * @returns {boolean} true если удалось
   */
  async _tryDropdownChain(allActions, donorIndex, action, originalSelector, realStepNumber) {
    // Выполняем до 3 шагов цепочки
    const chainLength = Math.min(3, allActions.length - donorIndex);
    const executedChain = [];

    for (let k = 0; k < chainLength; k++) {
      const chainAction = allActions[donorIndex + k];
      if (!chainAction) break;
      // Пропускаем шаги без селектора (кроме wait — его выполняем)
      if (!chainAction.selector && chainAction.type !== 'wait') break;

      const chainSelectorStr = this.formatSelector(chainAction.selector);
      console.log(`      🔗 Выполняю шаг цепочки [${k + 1}/${chainLength}]: ${chainAction.type} ${chainSelectorStr}`);

      try {
        await this.executeAction(chainAction);
        executedChain.push(chainAction);
        // Небольшая пауза между шагами цепочки (dropdown анимация)
        await this.delay(150);
      } catch (chainErr) {
        console.warn(`      ⚠️ Шаг цепочки [${k + 1}] не удался: ${chainErr.message}`);
        break;
      }
    }

    if (executedChain.length === 0) {
      console.log(`      ❌ Ни один шаг цепочки не выполнен`);
      return false;
    }

    console.log(`      ✅ Выполнено ${executedChain.length} шагов цепочки, пробую оригинальное действие...`);

    // После цепочки пробуем оригинальное действие (dropdown может быть уже открыт)
    action.selector = JSON.parse(JSON.stringify(originalSelector));
    try {
      await this.executeAction(action);
      console.log(`   ✅ Шаг ${realStepNumber} выполнен после dropdown-цепочки из ${executedChain.length} шагов`);
      this._applySwap(action, originalSelector, `chain:${donorIndex + 1}-${donorIndex + executedChain.length}`, donorIndex,
        `Выполнен после dropdown-цепочки из ${executedChain.length} шагов начиная с #${donorIndex + 1}`);
      return true;
    } catch (finalErr) {
      console.warn(`      ⚠️ Оригинальное действие после цепочки тоже не удалось: ${finalErr.message}`);
      // Пробуем с последним селектором цепочки
      const lastChain = executedChain[executedChain.length - 1];
      if (lastChain?.selector) {
        action.selector = JSON.parse(JSON.stringify(lastChain.selector));
        try {
          await this.executeAction(action);
          const lastStr = this.formatSelector(lastChain.selector);
          console.log(`   ✅ Шаг ${realStepNumber} выполнен с селектором последнего шага цепочки: ${lastStr}`);
          this._applySwap(action, originalSelector, lastStr, donorIndex + executedChain.length - 1,
            `Селектор из последнего шага dropdown-цепочки`);
          return true;
        } catch (e) {
          action.selector = JSON.parse(JSON.stringify(originalSelector));
        }
      }
      return false;
    }
  }

  /**
   * Помечает селектор как сомнительный и сохраняет в тест через background
   */
  _markSelectorAsSuspicious(originalSelector, action, donorIndex, reason) {
    try {
      chrome.runtime.sendMessage({
        type: 'MARK_SELECTOR_SUSPICIOUS',
        testId: this.currentTest?.id,
        actionIndex: this.currentTest?.actions?.indexOf(action),
        originalSelector: originalSelector,
        newSelector: action.selector,
        donorStepIndex: donorIndex,
        reason: reason || 'Элемент не найден при воспроизведении'
      }).catch(() => {});
    } catch (e) {
      // Не критично
    }
  }

  // ========================================================================
  // ДИСПАТЧЕР ТИПОВ ДЕЙСТВИЙ
  // ========================================================================

  /**
   * Выполняет одно действие в зависимости от его типа
   */
  async executeAction(action) {
    if (!action || !action.type) {
      console.warn('⚠️ Действие не содержит тип:', action);
      return;
    }

    const normalizedType = this.validateActionSupport(action);
    switch (normalizedType) {
      case 'click':
        await this.handleClick(action);
        break;

      case 'dblclick':
        await this.handleDblClick(action);
        break;

      case 'input':
        await this.handleInput(action);
        break;

      case 'change':
        await this.handleChange(action);
        break;

      case 'navigate':
      case 'navigation':
        await this.handleNavigation(action);
        break;

      case 'scroll':
        await this.handleScroll(action);
        break;

      case 'hover':
        await this.handleHover(action);
        break;

      case 'focus':
        await this.handleFocus(action);
        break;

      case 'blur':
        await this.handleBlur(action);
        break;

      case 'clear':
        await this.handleClear(action);
        break;

      case 'upload':
        await this.handleUpload(action);
        break;

      case 'keyboard':
      case 'keydown':
      case 'keyup':
      case 'keypress':
        await this.handleKeyboard(action);
        break;

      case 'wait':
        await this.handleWait(action);
        break;

      case 'api':
        await this.handleApiRequest(action);
        break;

      case 'variable':
        await this.handleVariable(action);
        break;

      case 'setVariable':
        await this.handleSetVariable(action);
        break;

      case 'assert':
        await this.handleAssert(action);
        break;

      case 'loop':
        await this.handleLoop(action);
        break;

      case 'condition':
        await this.handleCondition(action);
        break;

      case 'javascript':
        await this.handleJavaScript(action);
        break;

      case 'screenshot':
        this.lastScreenshotResult = await this.handleScreenshot(action);
        break;

      case 'cookie':
        await this.handleCookie(action);
        break;

      default:
        throw new Error(`Неподдерживаемый тип действия: ${action.type}`);
    }
  }

  // ========================================================================
  // ОБРАБОТЧИКИ ДЕЙСТВИЙ
  // ========================================================================

  /**
   * Обработчик клика
   */
  async handleClick(action) {
    const clickStartedAt = Date.now();
    const selectorInfo = this.formatSelector(action.selector);
    console.log(`🖱️ Клик по: ${selectorInfo}`);

    // Находим элемент
    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    let element = findResult?.element;
    const usedSelector = findResult?.usedSelector || selectorInfo;

    if (this.currentSelectorCallback) {
      this.currentSelectorCallback(usedSelector);
    }

    if (!element) {
      // Пробуем альтернативные селекторы
      element = await this.tryAlternativeSelectors(action);
      if (!element) {
        throw new Error(`Элемент не найден: ${selectorInfo}`);
      }
      console.log('✅ Элемент найден через альтернативный селектор');
    }

    // Прокручиваем к элементу
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (this.smartWaiter) {
        await this.smartWaiter.waitForElementReady(element, { visible: true, timeout: 1000 });
      } else {
        await this.delay(100);
      }
    } catch (e) {
      await this.delay(100);
    }

    // Подсветка
    this.highlightElement(element);

    // Проверяем, является ли это dropdown с необходимостью выбора значения
    if (action.value && this.isDropdownElement(element)) {
      console.log(`🔽 Обнаружен dropdown с целевым значением: "${action.value}"`);
      // Клик для открытия dropdown
      this._dispatchClick(element);
      await this.delay(200);

      // Пробуем выбрать значение
      const processedValue = await this.processVariables(action.value);
      try {
        const result = await this.autoSelectDropdownValue(element, processedValue);
        if (result && result.success) {
          console.log(`✅ Значение "${processedValue}" выбрано в dropdown`);
          return;
        }
      } catch (e) {
        console.warn('⚠️ autoSelectDropdownValue не удался:', e.message);
      }
    }

    // Обычный клик
    let clickPointTop = null;
    try {
      const rect = element.getBoundingClientRect();
      const cx = Math.floor(rect.left + rect.width / 2);
      const cy = Math.floor(rect.top + rect.height / 2);
      const topEl = document.elementFromPoint(cx, cy);
      clickPointTop = topEl ? `${topEl.tagName}${topEl.id ? '#' + topEl.id : ''}` : null;
    } catch (e) {
      // ignore geometry diagnostics failure
    }
    if (action.subtype === 'right-click') {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 2
      }));
    } else {
      this._dispatchClick(element);
    }

    const optimizedDelay = await this.getOptimizedDelay('click', 300);
    await this.delay(optimizedDelay);
    console.log(`✅ Клик выполнен по: ${usedSelector}`);
  }

  /**
   * Обработчик двойного клика
   */
  async handleDblClick(action) {
    const selectorInfo = this.formatSelector(action.selector);
    console.log(`🖱️🖱️ Двойной клик по: ${selectorInfo}`);

    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    let element = findResult?.element;

    if (!element) {
      element = await this.tryAlternativeSelectors(action);
      if (!element) {
        throw new Error(`Элемент не найден: ${selectorInfo}`);
      }
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(100);
    this.highlightElement(element);

    // Двойной клик
    element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
    await this.delay(300);
    console.log(`✅ Двойной клик выполнен`);
  }

  async handleHover(action) {
    const selectorInfo = this.formatSelector(action.selector);
    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(100);
    this.highlightElement(element);
    const opts = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent('mouseover', opts));
    element.dispatchEvent(new MouseEvent('mouseenter', opts));
    element.dispatchEvent(new MouseEvent('mousemove', opts));
    await this.delay(150);
  }

  async handleFocus(action) {
    const selectorInfo = this.formatSelector(action.selector);
    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(80);
    this.highlightElement(element);
    if (typeof element.focus === 'function') {
      element.focus();
    }
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    await this.delay(120);
  }

  async handleBlur(action) {
    const selectorInfo = this.formatSelector(action.selector);
    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
    if (typeof element.blur === 'function') {
      element.blur();
    }
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    await this.delay(100);
  }

  async handleClear(action) {
    const selectorInfo = this.formatSelector(action.selector);
    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(80);
    this.highlightElement(element);
    if (typeof element.focus === 'function') {
      element.focus();
    }
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof element.blur === 'function') {
      element.blur();
    }
    await this.delay(120);
  }

  async handleUpload(action) {
    // ИСПРАВЛЕНИЕ #12: Улучшенная загрузка файлов
    const selector = action.selector;
    const fileName = action.value || action.fileName || '';
    
    if (!selector) {
      throw new Error('Для upload требуется селектор file input');
    }
    
    const findResult = await this.findElementWithRetry(selector, 3, 300);
    const element = findResult?.element;
    
    if (!element) {
      throw new Error(`File input не найден: ${selector}`);
    }
    
    if (element.type !== 'file') {
      console.warn('⚠️ Элемент не является file input, пробуем обычный ввод');
      return this.handleInput(action);
    }
    
    // Проверяем, указано ли имя файла для установки
    if (fileName) {
      // Chrome extensions не могут программно установить файлы из соображений безопасности
      // Но мы можем попробовать через DataTransfer API для тестовых целей
      console.warn(`⚠️ Программная установка файлов ограничена браузером. Имя файла: ${fileName}`);
      console.log('💡 Рекомендация: используйте нативный диалог выбора файла или chrome.debugger API');
      
      // Эмитируем событие change для тестов, которые проверяют только факт вызова
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    
    // Если имя файла не указано, просто кликаем на input для открытия диалога
    console.log('📁 Клик по file input для открытия диалога выбора файла');
    element.click();
    await this.delay(100);
  }

  async handleCookie(action) {
    const subtype = action.subtype || '';
    if (subtype === 'get-cookies') {
      const cookies = document.cookie || '';
      console.log(`🍪 Cookies: ${cookies || '(пусто)'}`);
      
      // ИСПРАВЛЕНИЕ #13: Сохраняем cookies в переменную если указана
      if (action.variableName) {
        this.userVariables[action.variableName] = cookies;
        console.log(`✅ Cookies сохранены в переменную: ${action.variableName}`);
      }
      return;
    }

    const rawCookie = String(action.value || '').trim();
    if (!rawCookie) {
      throw new Error('Для cookie-шага не задано значение (ожидается "name=value")');
    }
    const hasPath = /;\s*path=/i.test(rawCookie);
    const cookieString = hasPath ? rawCookie : `${rawCookie}; path=/`;
    document.cookie = cookieString;
    await this.delay(50);
    console.log('✅ Cookie установлен');
  }

  /**
   * Обработчик ввода текста
   */
  async handleInput(action) {
    // Предотвращаем рекурсию из retryFillWithAlternativesOrThrow
    if (this._fillRetryInProgress) {
      return this._handleInputDirect(action);
    }

    const selectorInfo = this.formatSelector(action.selector);
    const processedValue = await this.processVariables(action.value);
    console.log(`📝 Ввод текста: "${processedValue}" в ${selectorInfo}`);

    const findResult = await this.findElementWithRetry(action.selector, 5, 300);
    let element = findResult?.element;
    const usedSelector = findResult?.usedSelector || selectorInfo;

    if (this.currentSelectorCallback) {
      this.currentSelectorCallback(usedSelector);
    }

    if (!element) {
      element = await this.tryAlternativeSelectors(action);
      if (!element) {
        throw new Error(`Элемент не найден: ${selectorInfo}`);
      }
    }

    if (this.isDropdownElement(element)) {
      const refinedElement = this.resolveDropdownElementByFieldLabel(action, element);
      if (refinedElement && refinedElement !== element) {
        element = refinedElement;
      }

      const preferredTrigger = this.resolvePreferredDropdownTrigger(action, element);
      if (preferredTrigger && preferredTrigger !== element) {
        element = preferredTrigger;
      }
    }

    // Проверяем, нужно ли пропустить (уже заполнено)
    if (this.skipNextInput && this.skipNextInputValue === processedValue) {
      this.skipNextInput = false;
      this.skipNextInputValue = null;
      console.log('⏭️ Ввод пропущен (значение уже установлено)');
      return;
    }

    // Прокручиваем
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(100);
    this.highlightElement(element);

    // Проверяем на файловый input
    if (element.type === 'file') {
      console.log('📁 Обнаружен файловый input');
      await this.setFileToInput(element, processedValue);
      return;
    }

    // Проверяем, является ли это dropdown
    if (this.isDropdownElement(element)) {
      console.log(`🔽 Обнаружен dropdown при вводе, пробую выбрать значение: "${processedValue}"`);
      this._dispatchClick(element);
      await this.delay(200);
      try {
        const result = await this.autoSelectDropdownValue(element, processedValue);
        if (result && result.success) {
          console.log(`✅ Значение "${processedValue}" выбрано в dropdown`);
          return;
        }
      } catch (e) {
        console.warn('⚠️ Fallback к обычному вводу');
      }
      // Для кастомного dropdown нельзя переходить к _performInput:
      // это приводит к записи текста в соседние поля формы.
      throw new Error(`Не удалось выбрать значение "${processedValue}" в dropdown`);
    }

    // Выполняем ввод текста
    await this._performInput(element, processedValue);

    // Верифицируем заполнение
    try {
      await this.retryFillWithAlternativesOrThrow(action, processedValue, 'input', element);
    } catch (e) {
      // Если верификация не прошла, но ввод был - логируем предупреждение
      console.warn(`⚠️ Верификация ввода не прошла: ${e.message}`);
    }

    const optimizedDelay = await this.getOptimizedDelay('input', 200);
    await this.delay(optimizedDelay);
    console.log(`✅ Ввод выполнен: "${processedValue}"`);
  }

  /**
   * Прямой ввод текста без верификации (для retry)
   */
  async _handleInputDirect(action) {
    const processedValue = await this.processVariables(action.value);
    const findResult = await this.findElementWithRetry(action.selector, 3, 300);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент не найден: ${this.formatSelector(action.selector)}`);
    }
    await this._performInput(element, processedValue);
  }

  /**
   * Непосредственный ввод текста в элемент
   */
  async _performInput(element, value) {
    // Фокус
    element.focus();
    await this.delay(50);

    // Очищаем поле
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));

    // Симулируем посимвольный ввод для Angular/React
    if (this.seleniumUtils) {
      try {
        this.seleniumUtils.setNativeValue(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      } catch (e) {
        // Fallback
      }
    }

    // Устанавливаем значение напрямую
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
                                   Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value;
    }

    // Отправляем события
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Для Angular NgModel
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Нормализует URL для сравнения «та же страница»: origin + pathname без хвостового слэша, без hash.
   */
  _normalizeUrlForSamePage(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url, window.location.origin);
      const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
      return u.origin + path;
    } catch (e) {
      return url;
    }
  }

  /**
   * Обработчик навигации: переход по ссылке или мгновенное завершение, если уже на целевой странице.
   */
  async handleNavigation(action) {
    const subtype = action.subtype || '';
    
    // ИСПРАВЛЕНИЕ #15: Сохраняем состояние перед операциями которые перезагружают страницу
    if (subtype === 'nav-refresh') {
      console.log('🌐 Навигация: обновление страницы');
      await this.savePlaybackState(); // Сохраняем перед reload
      window.location.reload();
      return;
    }
    if (subtype === 'nav-back') {
      console.log('🌐 Навигация: назад по истории');
      await this.savePlaybackState(); // Сохраняем перед history.back()
      window.history.back();
      return;
    }
    if (subtype === 'nav-forward') {
      console.log('🌐 Навигация: вперед по истории');
      await this.savePlaybackState(); // Сохраняем перед history.forward()
      window.history.forward();
      return;
    }
    if (subtype === 'new-tab') {
      const target = action.value || action.url || window.location.href;
      const targetUrl = await this.processVariables(target);
      
      // ИСПРАВЛЕНИЕ #17: Передаём управление тестом в новую вкладку
      if (action.continueTest && this.isPlaying) {
        try {
          const testState = {
            testId: this.currentTest?.id,
            testName: this.currentTest?.name,
            actions: this.currentTest?.actions,
            currentActionIndex: this.currentActionIndex + 1, // Следующее действие
            userVariables: this.userVariables,
            isPlaying: true
          };
          
          const response = await chrome.runtime.sendMessage({
            type: 'NEW_TAB_WITH_TEST',
            url: targetUrl,
            testState
          });
          
          if (response?.success) {
            console.log(`🌐 Навигация: открыта новая вкладка ${targetUrl} с передачей теста`);
            // Останавливаем воспроизведение в текущей вкладке
            this.isPlaying = false;
            return;
          }
        } catch (e) {
          console.warn(`⚠️ Не удалось передать тест в новую вкладку: ${e.message}`);
        }
      }
      
      // Fallback: просто открываем вкладку без передачи теста
      window.open(targetUrl, '_blank', 'noopener');
      console.log(`🌐 Навигация: открыта новая вкладка ${targetUrl}`);
      return;
    }
    if (subtype === 'close-tab') {
      // ИСПРАВЛЕНИЕ #16: Закрываем вкладку через background script
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'CLOSE_TAB'
        });
        if (response?.success) {
          console.log('🌐 Навигация: вкладка закрыта');
        } else {
          console.warn('⚠️ Не удалось закрыть вкладку через background, пробуем window.close()');
          window.close();
        }
      } catch (e) {
        console.warn(`⚠️ Ошибка закрытия вкладки: ${e.message}`);
        window.close();
      }
      return;
    }

    let url = action.value || action.url;
    if (!url) {
      throw new Error('URL для навигации не указан');
    }

    // Подставляем переменные в URL
    url = await this.processVariables(url);
    url = this.normalizeUrlForNavigation(url);
    console.log(`🌐 Навигация: ${url}`);

    const currentNorm = this._normalizeUrlForSamePage(window.location.href);
    const targetNorm = this._normalizeUrlForSamePage(url);
    if (currentNorm && targetNorm && currentNorm === targetNorm) {
      console.log('✅ Уже на целевой странице, переход не требуется');
      return;
    }

    const actionIndex = this.currentTest?.actions?.indexOf(action);
    await this.navigateToUrl(url, actionIndex !== -1 ? actionIndex : this.currentActionIndex);
  }

  /**
   * Обработчик assert (проверка утверждения)
   */
  async handleAssert(action) {
    const subtype = action.subtype || '';
    console.log(`✓ Проверка утверждения: ${subtype || action.assertion || action.value || 'N/A'}`);

    if (!action.selector) {
      throw new Error('Для assertion требуется селектор');
    }
    const findResult = await this.findElementWithRetry(action.selector, 3, 500);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент для проверки не найден: ${this.formatSelector(action.selector)}`);
    }

    if (subtype === 'assert-count') {
      const expectedCount = parseInt(action.expectedCount, 10);
      if (!Number.isFinite(expectedCount)) {
        throw new Error('Для assert-count не задан expectedCount');
      }
      const actualCount = this.countMatchingElements(action.selector);
      if (actualCount !== expectedCount) {
        throw new Error(`Проверка не прошла: ожидалось количество ${expectedCount}, получено ${actualCount}`);
      }
      console.log(`✅ Проверка прошла: count=${actualCount}`);
      return;
    }

    if (subtype === 'assert-disabled') {
      const expectedState = (action.expectedState || 'enabled').toLowerCase();
      const isDisabled = !!(element.disabled || element.getAttribute('aria-disabled') === 'true');
      const mustBeDisabled = expectedState === 'disabled';
      if (isDisabled !== mustBeDisabled) {
        throw new Error(`Проверка не прошла: ожидалось состояние "${expectedState}"`);
      }
      console.log(`✅ Проверка прошла: состояние "${expectedState}"`);
      return;
    }

    if (subtype === 'assert-contains') {
      const rawExpectedText = action.expectedText ?? action.optionText ?? action.value;
      const expectedText = await this.processVariables(String(rawExpectedText || '').trim());
      const actualText = String(element.value || element.textContent || '').trim();
      if (!expectedText) {
        throw new Error('Для assert-contains не задан expectedText');
      }
      if (!actualText.includes(expectedText)) {
        throw new Error(`Проверка не прошла: "${actualText}" не содержит "${expectedText}"`);
      }
      console.log(`✅ Проверка прошла: текст содержит "${expectedText}"`);
      return;
    }

    if (subtype === 'assert-multiselect') {
      const expectedValues = Array.isArray(action.expectedValues) ? action.expectedValues : [];
      if (expectedValues.length === 0) {
        throw new Error('Для assert-multiselect не задан expectedValues');
      }
      const actualText = String(element.value || element.textContent || '').toLowerCase();
      const missed = [];
      for (const rawExpected of expectedValues) {
        const expected = String(await this.processVariables(String(rawExpected))).trim().toLowerCase();
        if (expected && !actualText.includes(expected)) {
          missed.push(rawExpected);
        }
      }
      if (missed.length > 0) {
        throw new Error(`Проверка не прошла: не найдены значения ${missed.join(', ')}`);
      }
      console.log(`✅ Проверка прошла: найдены все значения (${expectedValues.length})`);
      return;
    }

    const rawExpectedValue = action.expectedValue ?? action.value;
    if (rawExpectedValue !== undefined) {
      const expectedValue = await this.processVariables(String(rawExpectedValue));
      const actualValue = String(element.value || element.textContent?.trim() || '');
      if (actualValue !== expectedValue) {
        throw new Error(`Проверка не прошла: ожидалось "${expectedValue}", получено "${actualValue}"`);
      }
      console.log(`✅ Проверка прошла: "${actualValue}" === "${expectedValue}"`);
    } else {
      console.log('✅ Элемент найден');
    }
  }

  /**
   * Обработчик циклов
    */
  async handleLoop(action) {
    const loopType = action.loop?.type || action.loopType || 'count';
    const loopActions = action.actions || [];
    
    // ИСПРАВЛЕНИЕ #10: Поддержка while-цикла
    if (loopType === 'while' || action.loop?.condition || action.condition) {
      const condition = action.loop?.condition || action.condition;
      const maxIterations = action.loop?.maxIterations || action.maxIterations || 100; // Защита от бесконечного цикла
      console.log(`🔄 While-цикл: условие "${condition}", максимум ${maxIterations} итераций`);
      
      let iter = 0;
      while (iter < maxIterations) {
        if (!this.isPlaying) return;
        
        // Проверяем условие
        const conditionMet = await this.evaluateCondition(condition, action);
        if (!conditionMet) {
          console.log(`   🔄 While-условие FALSE на итерации ${iter}, выход из цикла`);
          break;
        }
        
        console.log(`   🔄 While-итерация ${iter + 1}`);
        for (const subAction of loopActions) {
          if (!this.isPlaying) return;
          await this.executeAction(subAction);
        }
        iter++;
      }
      
      if (iter >= maxIterations) {
        console.warn(`⚠️ While-цикл достиг максимума итераций (${maxIterations})`);
      }
      console.log(`✅ While-цикл завершён после ${iter} итераций`);
      return;
    }
    
    // Обычный цикл по счётчику
    const iterations = action.iterations || action.count || 1;
    console.log(`🔄 Цикл: ${iterations} итераций, ${loopActions.length} действий`);

    for (let iter = 0; iter < iterations; iter++) {
      if (!this.isPlaying) return;
      console.log(`   🔄 Итерация ${iter + 1} / ${iterations}`);
      for (const subAction of loopActions) {
        if (!this.isPlaying) return;
        await this.executeAction(subAction);
      }
    }
    console.log(`✅ Цикл завершён`);
  }
  
  /**
   * Вычисляет условие (для while-циклов и condition-шагов)
   * ИСПРАВЛЕНИЕ #11: Поддержка JS-выражений
   */
  async evaluateCondition(condition, action = {}) {
    if (!condition) return false;
    
    // Если условие - это объект с полями
    if (typeof condition === 'object') {
      // Проверка наличия элемента
      if (condition.selector || action.selector) {
        const selector = condition.selector || action.selector;
        try {
          const findResult = await this.findElementWithRetry(selector, 2, 300);
          return !!(findResult?.element);
        } catch (e) {
          return false;
        }
      }
      return false;
    }
    
    // Если условие - строка
    if (typeof condition === 'string') {
      // Проверка наличия элемента по селектору
      if (condition.startsWith('selector:') || condition.startsWith('#') || condition.startsWith('.') || condition.startsWith('[')) {
        const selector = condition.replace(/^selector:\s*/, '');
        try {
          const findResult = await this.findElementWithRetry(selector, 2, 300);
          return !!(findResult?.element);
        } catch (e) {
          return false;
        }
      }
      
      // ИСПРАВЛЕНИЕ #11: Вычисление JS-выражения с переменными
      try {
        // Подставляем переменные в выражение
        let processedCondition = condition;
        
        // Заменяем {var:name} на значения переменных
        processedCondition = processedCondition.replace(/\{var:([^}]+)\}/g, (match, varName) => {
          const value = this.userVariables[varName];
          if (value === undefined) {
            console.warn(`⚠️ Переменная "${varName}" не найдена`);
            return 'undefined';
          }
          // Если значение - строка, добавляем кавычки
          if (typeof value === 'string') {
            return JSON.stringify(value);
          }
          return String(value);
        });
        
        // Безопасное вычисление выражения
        const result = new Function(`
          "use strict";
          return (${processedCondition});
        `)();
        
        console.log(`   📊 Выражение "${condition}" → "${processedCondition}" = ${result}`);
        return !!result;
      } catch (e) {
        console.warn(`⚠️ Ошибка вычисления условия "${condition}": ${e.message}`);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Обработчик условий
   * ИСПРАВЛЕНИЕ #11: Расширенная поддержка условий
   */
  async handleCondition(action) {
    console.log(`❓ Условие: ${action.condition || action.conditionExpression || 'N/A'}`);

    let conditionMet = false;
    
    // Способ 1: Проверка через evaluateCondition (JS-выражения + селекторы)
    if (action.condition || action.conditionExpression) {
      conditionMet = await this.evaluateCondition(action.condition || action.conditionExpression, action);
    }
    // Способ 2: Проверка наличия элемента по селектору (legacy)
    else if (action.selector) {
      try {
        const findResult = await this.findElementWithRetry(action.selector, 2, 300);
        conditionMet = !!(findResult?.element);
      } catch (e) {
        conditionMet = false;
      }
    }
    // Способ 3: Проверка значения элемента
    else if (action.expectedValue !== undefined && action.selector) {
      try {
        const findResult = await this.findElementWithRetry(action.selector, 2, 300);
        const element = findResult?.element;
        if (element) {
          const actualValue = element.value || element.textContent || '';
          conditionMet = actualValue.includes(action.expectedValue);
        }
      } catch (e) {
        conditionMet = false;
      }
    }

    const actionsToRun = conditionMet
      ? (action.thenActions || action.actions || [])
      : (action.elseActions || []);

    console.log(`   ${conditionMet ? '✅ Условие TRUE' : '❌ Условие FALSE'}, выполняю ${actionsToRun.length} действий`);

    for (const subAction of actionsToRun) {
      if (!this.isPlaying) return;
      await this.executeAction(subAction);
    }
  }

  /**
   * Обработчик выполнения JavaScript в контексте страницы.
   * Использует blob URL вместо inline script, чтобы обойти CSP (Content Security Policy).
   */
  async handleJavaScript(action) {
    const rawScript = action.value || action.script || '';
    if (!rawScript.trim()) {
      console.warn('⚠️ JavaScript: пустой скрипт');
      return;
    }
    const script = await this.processVariables(rawScript);
    const trimmed = String(script || '').trim();

    // Safe message-mode that works on strict CSP pages:
    // - "@alert <text>" shows a blocking alert dialog
    // - "@toast <text>" shows a non-blocking in-page banner (with close button)
    if (/^@alert\s+/i.test(trimmed)) {
      const msg = trimmed.replace(/^@alert\s+/i, '').trim();
      alert(msg || 'Шаг выполнен');
      return;
    }
    if (/^@toast\s+/i.test(trimmed)) {
      const msg = trimmed.replace(/^@toast\s+/i, '').trim() || 'Шаг выполнен';
      const existing = document.getElementById('autotest-js-toast');
      if (existing) existing.remove();
      const box = document.createElement('div');
      box.id = 'autotest-js-toast';
      box.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'max-width:420px',
        'background:rgba(20,20,20,0.92)',
        'color:#fff',
        'padding:12px 14px',
        'border-radius:10px',
        'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
        'font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
      ].join(';');
      const text = document.createElement('div');
      text.textContent = msg;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Закрыть';
      btn.style.cssText = [
        'margin-top:10px',
        'background:#fff',
        'color:#111',
        'border:0',
        'padding:6px 10px',
        'border-radius:8px',
        'cursor:pointer',
        'font:inherit'
      ].join(';');
      btn.addEventListener('click', () => box.remove());
      box.appendChild(text);
      box.appendChild(btn);
      document.documentElement.appendChild(box);
      return;
    }

    // Heuristics for common "message" scripts on strict CSP pages:
    // - alert('text')  -> show alert
    // - console.log('text') -> show toast
    // (Only supports simple single string literal argument.)
    const mAlert = trimmed.match(/^alert\s*\(\s*(['"`])([\s\S]*?)\1\s*\)\s*;?\s*$/i);
    if (mAlert) {
      const msg = (mAlert[2] || '').trim();
      alert(msg || 'Шаг выполнен');
      return;
    }
    const mLog = trimmed.match(/^console\.log\s*\(\s*(['"`])([\s\S]*?)\1\s*\)\s*;?\s*$/i);
    if (mLog) {
      const msg = (mLog[2] || '').trim() || 'Шаг выполнен';
      const existing = document.getElementById('autotest-js-toast');
      if (existing) existing.remove();
      const box = document.createElement('div');
      box.id = 'autotest-js-toast';
      box.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'max-width:420px',
        'background:rgba(20,20,20,0.92)',
        'color:#fff',
        'padding:12px 14px',
        'border-radius:10px',
        'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
        'font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
      ].join(';');
      const text = document.createElement('div');
      text.textContent = msg;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Закрыть';
      btn.style.cssText = [
        'margin-top:10px',
        'background:#fff',
        'color:#111',
        'border:0',
        'padding:6px 10px',
        'border-radius:8px',
        'cursor:pointer',
        'font:inherit'
      ].join(';');
      btn.addEventListener('click', () => box.remove());
      box.appendChild(text);
      box.appendChild(btn);
      document.documentElement.appendChild(box);
      return;
    }

    console.log(`📜 Выполнение JavaScript (${trimmed.length} символов)`);

    // ИСПРАВЛЕНИЕ #14: Пробуем выполнить через background script для обхода CSP
    const cspBypass = await this.tryExecuteJsViaBackground(trimmed);
    if (cspBypass.success) {
      console.log('✅ JavaScript выполнен через background script (CSP bypass)');
      return cspBypass.result;
    }
    
    // Fallback: выполняем через blob URL (может блокироваться CSP)
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([trimmed], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const el = document.createElement('script');
        el.src = url;
        el.onload = () => {
          URL.revokeObjectURL(url);
          el.remove();
          resolve();
        };
        el.onerror = (err) => {
          URL.revokeObjectURL(url);
          el.remove();
          console.error('❌ Ошибка загрузки JavaScript:', err);
          reject(new Error('Script load failed (CSP может блокировать JavaScript шаг; используйте "@alert ..." или "@toast ..." для сообщений)'));
        };
        document.documentElement.appendChild(el);
      } catch (err) {
        console.error('❌ Ошибка выполнения JavaScript:', err);
        reject(err);
      }
    });
  }
  
  /**
   * ИСПРАВЛЕНИЕ #14: Выполняет JS через background script для обхода CSP
   */
  async tryExecuteJsViaBackground(script) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_JS',
        script: script
      });
      
      if (response && response.success) {
        return { success: true, result: response.result };
      } else {
        console.warn(`⚠️ Выполнение через background не удалось: ${response?.error || 'неизвестная ошибка'}`);
        return { success: false, error: response?.error };
      }
    } catch (e) {
      console.warn(`⚠️ Не удалось выполнить JS через background: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * Выполняет скриншот: весь экран, область или элемент
   * @param {Object} action - action.screenshotCaptureType: 'full'|'region'|'element', action.screenshotRegion, action.selector
   * @returns {Promise<string|null>} Base64 data URL или null
   */
  async handleScreenshot(action) {
    // ИСПРАВЛЕНИЕ #9: Транслируем subtype в screenshotCaptureType
    let captureType = action.screenshotCaptureType;
    
    // Если screenshotCaptureType не указан, но есть subtype - маппим
    if (!captureType && action.subtype) {
      const subtypeToCaptureType = {
        'visual-screenshot': 'element',
        'page-screenshot': 'full'
      };
      captureType = subtypeToCaptureType[action.subtype] || 'element';
    }
    
    // Fallback на 'element' если ничего не указано
    captureType = captureType || 'element';
    
    console.log(`📷 Скриншот: ${captureType === 'full' ? 'весь экран' : captureType === 'region' ? 'область' : 'элемент'}`);

    let fullScreenshot = await this.takeScreenshot();
    if (!fullScreenshot) {
      console.warn('⚠️ Не удалось сделать скриншот');
      return null;
    }

    if (captureType === 'full') {
      return fullScreenshot;
    }

    if (captureType === 'region') {
      const r = action.screenshotRegion || { x: 0, y: 0, width: 400, height: 300 };
      return this.cropScreenshot(fullScreenshot, r.x, r.y, r.width, r.height);
    }

    if (captureType === 'element') {
      if (!action.selector) {
        console.warn('⚠️ Скриншот элемента: селектор не указан');
        return fullScreenshot;
      }
      const findResult = await this.findElementWithRetry(action.selector, 3, 200);
      const element = findResult?.element || await this.tryAlternativeSelectors(action);
      if (!element) {
        console.warn('⚠️ Элемент не найден, сохраняю полный скриншот');
        return fullScreenshot;
      }
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      await this.delay(50);
      const rect = element.getBoundingClientRect();
      const x = Math.max(0, Math.floor(rect.left));
      const y = Math.max(0, Math.floor(rect.top));
      const w = Math.min(Math.ceil(rect.width), window.innerWidth - x);
      const h = Math.min(Math.ceil(rect.height), window.innerHeight - y);
      if (w <= 0 || h <= 0) {
        return fullScreenshot;
      }
      return this.cropScreenshot(fullScreenshot, x, y, w, h);
    }

    return fullScreenshot;
  }

  /**
   * Обрезает скриншот по заданным координатам (пиксели от левого верхнего угла viewport)
   */
  async cropScreenshot(dataUrl, x, y, width, height) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /**
   * Диспатчит реалистичный клик (mousedown + mouseup + click)
   */
  _dispatchClick(element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0
    };

    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));
  }

  init() {
    if (!this._debugPagehideListenerAttached) {
      this._debugPagehideListenerAttached = true;
      window.addEventListener('pagehide', () => {
        if (!this.isPlaying) return;
        if (!this.navigationInitiatedByPlayer && this.currentTest) {
          const nextActionIndex = Number(this.currentActionIndex) + 1;
          try {
            chrome.runtime.sendMessage({
              type: 'SAVE_PLAYBACK_STATE',
              test: this.currentTest,
              actionIndex: Number.isNaN(nextActionIndex) ? this.currentActionIndex : nextActionIndex,
              nextUrl: '__AUTO_NAV__',
              runMode: this.playMode
            }).catch(() => {});
          } catch (e) { /* ignore */ }
        }
      }, { capture: true });
    }

    // Слушаем сообщения от background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PLAY_TEST') {
        // Проверяем, не запущен ли уже тест на этой вкладке
        if (this.isPlaying) {
          console.warn('⚠️ Тест уже запущен на этой вкладке, игнорирую повторный запуск');
          sendResponse({ success: false, error: 'Test already playing on this tab' });
          return true;
        }
        
        // Проверяем, есть ли в тесте действия, требующие визуального интерфейса
        // Действия, которые НЕ требуют визуального интерфейса: api, variable, wait
        // Действия, которые требуют визуального интерфейса: click, dblclick, input, change, scroll, navigation, keyboard
        // ВАЖНО: Проверяем только действия, которые будут выполняться в текущем режиме
        const runMode = message.mode || 'optimized';
        const actionsToCheck = (message.test?.actions || []).filter(action => {
          return runMode === 'full' ? true : !action.hidden;
        });
        
        const visualActionTypes = ['click', 'dblclick', 'input', 'change', 'scroll', 'navigation', 'keyboard'];
        const hasVisualActions = actionsToCheck.some(action => {
          // Проверяем тип действия
          if (visualActionTypes.includes(action.type)) {
            return true;
          }
          // Проверяем вложенные действия (циклы, условия) - тоже фильтруем по режиму
          const checkNestedActions = (nestedActions) => {
            if (!Array.isArray(nestedActions)) return false;
            const filteredNested = runMode === 'full' 
              ? nestedActions 
              : nestedActions.filter(a => !a.hidden);
            return filteredNested.some(subAction => visualActionTypes.includes(subAction.type));
          };
          
          if (action.actions && checkNestedActions(action.actions)) {
            return true;
          }
          if (action.thenActions && checkNestedActions(action.thenActions)) {
            return true;
          }
          if (action.elseActions && checkNestedActions(action.elseActions)) {
            return true;
          }
          return false;
        });
        
        // Если в тесте нет действий, требующих визуального интерфейса (только переменные/API/wait), разрешаем выполнение на extension странице
        const isExtensionPage = window.location.href.startsWith('chrome-extension://') || 
                               window.location.href.startsWith('chrome://') ||
                               window.location.href.startsWith('edge://');
        
        if (isExtensionPage && hasVisualActions) {
          console.log('⚠️ Игнорирую PLAY_TEST на extension странице (тест содержит действия с визуальным интерфейсом):', window.location.href);
          sendResponse({ success: false, error: 'Extension page, ignoring (test has visual actions)' });
          return true;
        } else if (isExtensionPage && !hasVisualActions) {
          console.log('✅ Разрешаю PLAY_TEST на extension странице (тест без действий с визуальным интерфейсом, только переменные/API/wait):', window.location.href);
          console.log(`📊 Режим запуска: ${message.mode || 'optimized'}, действий для проверки: ${actionsToCheck.length}`);
        }
        
        this.debugMode = message.debugMode || false;
        this.parallelRun = message.parallelRun || false;
        this.runIndex = message.runIndex || null;
        this.totalRuns = message.totalRuns || null;
        
        console.log(`▶️ Запускаю тест "${message.test?.name || 'без имени'}" в режиме ${message.mode || 'optimized'}`);
        this.playTest(message.test, message.mode || 'optimized');
        sendResponse({ success: true });
      } else if (message.type === 'STOP_PLAYING' || message.type === 'FORCE_STOP') {
        this.stopPlaying();
        sendResponse({ success: true });
      } else if (message.type === 'PAUSE_PLAYBACK') {
        // Ставим воспроизведение на паузу
        this.pausePlayback();
        sendResponse({ success: true, paused: true });
      } else if (message.type === 'RESUME_PLAYBACK_FROM_PAUSE') {
        // Возобновляем воспроизведение с места паузы
        this.resumePlaybackFromPause();
        sendResponse({ success: true, resumed: true });
      } else if (message.type === 'RESUME_PLAYBACK') {
        // Восстанавливаем воспроизведение после перезагрузки страницы
        this.resumePlayback(message.test, message.actionIndex, message.mode || 'optimized');
        sendResponse({ success: true });
      } else if (message.type === 'RECORDING_STOPPED') {
        // Удаляем уведомление о записи после её остановки
        this.hideRecordingNotification();
        
        // Если нужно продолжить воспроизведение после остановки записи
        if (message.shouldResumePlayback && this.currentTest) {
          console.log('▶️ Продолжаю воспроизведение после остановки записи...');
          // Продолжаем воспроизведение с действия после маркера
          this.resumePlaybackAfterRecording(message.markerActionIndex);
        }
        
        sendResponse({ success: true });
      } else if (message.type === 'DEBUG_CONTINUE') {
        this.debugPaused = false;
        sendResponse({ success: true });
      } else if (message.type === 'DEBUG_STEP') {
        // Выполнить один шаг в режиме отладки
        this.debugPaused = false;
        sendResponse({ success: true });
      }
      return true;
    });

    // Проверяем, нужно ли восстановить воспроизведение после перезагрузки
    this.checkResumePlayback();
  }

  /**
   * Режим отладки: пауза перед шагом с возможностью редактирования
   */
  async debugStep(action, stepNumber, totalSteps) {
    this.debugPaused = true;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🐛 РЕЖИМ ОТЛАДКИ: Шаг ${stepNumber} из ${totalSteps}`);
    console.log(`${'='.repeat(60)}`);
    console.log('Действие:', action);
    console.log('Селектор:', this.formatSelector(action.selector));
    
    // Показываем элемент на странице
    try {
      const selectorStr = this.formatSelector(action.selector);
      const element = document.querySelector(selectorStr);
      if (element) {
        this.highlightElement(element, '#FF9800', 5000); // Подсветка на 5 секунд
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('✅ Элемент найден и подсвечен');
      } else {
        console.warn('⚠️ Элемент не найден на странице');
      }
    } catch (error) {
      console.warn('⚠️ Ошибка при поиске элемента:', error);
    }
    
    // Отправляем сообщение в редактор для показа панели отладки
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_STEP_PAUSED',
        stepNumber,
        totalSteps,
        action,
        selector: this.formatSelector(action.selector)
      });
    } catch (error) {
      console.warn('⚠️ Не удалось отправить сообщение в редактор:', error);
    }
    
    // Ждем, пока пользователь не продолжит
    while (this.debugPaused && this.isPlaying) {
      await this.delay(100);
    }
    
    if (!this.isPlaying) {
      throw new Error('Воспроизведение остановлено в режиме отладки');
    }
  }

  /**
   * Делает скриншот страницы
   */
  async takeScreenshot() {
    try {
      if (!this.screenshotSettingsLoaded) {
        await this.loadScreenshotSettings();
      }
      const saveToDisk = this.screenshotSettings?.saveToDisk === true;
      // storeInMemory: по умолчанию true (если не задано явно false) — скриншоты попадают в runHistory
      const storeInMemory = this.screenshotSettings?.storeInMemory !== false;
      if (!saveToDisk && !storeInMemory) {
        return null;
      }

      // Ограничиваем частоту (Chrome: несколько вызовов captureVisibleTab в секунду)
      const now = Date.now();
      if (!this.lastScreenshotTime) {
        this.lastScreenshotTime = 0;
      }
      const timeSinceLastScreenshot = now - this.lastScreenshotTime;
      const minIntervalMs = 500; // Chrome: ~2 вызова/сек, чтобы не превысить MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
      if (timeSinceLastScreenshot < minIntervalMs) {
        await this.delay(minIntervalMs - timeSinceLastScreenshot);
      }
      
      // Используем chrome.tabs.captureVisibleTab для создания скриншота
      const response = await chrome.runtime.sendMessage({
        type: 'TAKE_SCREENSHOT'
      });
      
      this.lastScreenshotTime = Date.now();
      
      if (response && response.success && response.screenshot) {
        return response.screenshot; // Base64 строка
      }
      
      // Fallback: используем html2canvas если доступен
      if (window.html2canvas) {
        const canvas = await html2canvas(document.body);
        return canvas.toDataURL('image/png');
      }
      
      return null;
    } catch (error) {
      // Игнорируем ошибки превышения квоты
      if (error.message && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        console.warn('⚠️ Превышена квота создания скриншотов, пропускаю');
        return null;
      }
      console.error('Ошибка при создании скриншота:', error);
      return null;
    }
  }

  /**
   * Сохраняет скриншот в файл
   */
  async saveScreenshotToFile(screenshot, stepNumber, type = 'screenshot') {
    if (!screenshot || !this.runHistory) {
      return null;
    }

    try {
      if (!this.screenshotSettingsLoaded) {
        await this.loadScreenshotSettings();
      }
      if (!this.screenshotSettings?.saveToDisk) {
        return null;
      }
      if (this.screenshotSettings.onlyOnError && type !== 'error') {
        return null;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_SCREENSHOT_TO_FILE',
        action: 'SAVE_SCREENSHOT_TO_FILE',
        command: 'SAVE_SCREENSHOT_TO_FILE',
        screenshot: screenshot,
        testId: this.runHistory.testId,
        runId: this.runHistory.runId,
        stepNumber: stepNumber,
        screenshotType: type,
        savePath: this.screenshotSettings.savePath || ''
      });

      if (response && response.success) {
        console.log(`💾 Скриншот сохранен в файл: ${response.filePath}`);
        return response.filePath;
      } else {
        console.warn(`⚠️ Не удалось сохранить скриншот в файл: ${response?.error || 'Неизвестная ошибка'}`);
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Ошибка при сохранении скриншота в файл:', error);
      return null;
    }
  }

  /**
   * Проверяет наличие опций в dropdown
   */
  hasDropdownOptions(element) {
    if (!element) return false;
    
    // Для стандартного SELECT
    if (element.tagName === 'SELECT') {
      return element.options && element.options.length > 0;
    }
    
    // Для кастомных dropdown - проверяем наличие опций в overlay
    const optionSelectors = [
      'option',
      '[role="option"]',
      '.option',
      '.mat-option',
      '.ng-option',
      '.react-select__option',
      '.dropdown-item'
    ];
    
    for (const selector of optionSelectors) {
      try {
        const options = element.querySelectorAll(selector);
        if (options.length > 0) return true;
      } catch (e) {
        // Игнорируем ошибки
      }
    }
    
    // Проверяем overlay панели
    const overlayPanels = document.querySelectorAll(
      '.cdk-overlay-pane, .mat-select-panel, .ng-dropdown-panel, [role="listbox"]'
    );
    
    for (const panel of overlayPanels) {
      for (const selector of optionSelectors) {
        try {
          const options = panel.querySelectorAll(selector);
          if (options.length > 0) return true;
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    }
    
    return false;
  }

  /**
   * Проверяет, является ли элемент dropdown
   */
  isDropdownElement(element) {
    if (!element) return false;
    
    // 1. Проверка по тегу - текстовые поля НЕ являются dropdown
    const tagName = element.tagName?.toLowerCase() || '';
    if (tagName === 'input' || tagName === 'textarea') return false;
    if (tagName === 'select') return true;
    
    // 2. Проверка кастомных dropdown компонентов
    const customDropdownTags = [
      'app-select',
      'ng-select', 
      'mat-select',
      'p-dropdown',
      'v-select',
      'el-select'
    ];
    
    if (customDropdownTags.includes(tagName)) {
      return true;
    }
    
    // 3. Проверка по атрибутам роли
    const role = element.getAttribute?.('role') || '';
    const ariaHaspopup = element.getAttribute?.('aria-haspopup') || '';
    
    if (role === 'combobox' || role === 'listbox' || ariaHaspopup === 'listbox') {
      return true;
    }
    
    // 4. Проверка по классам
    const className = element.className || '';
    const classNameStr = typeof className === 'string' ? className : (className.toString?.() || '');
    const dropdownClasses = [
      'dropdown',
      'select-box',
      'select-container',
      'combobox',
      'autocomplete',
      'mat-select',
      'react-select',
      'vue-select',
      'ng-select'
    ];
    
    const classNameLower = classNameStr.toLowerCase();
    const hasDropdownClass = dropdownClasses.some(cls =>
      classNameLower.includes(cls.toLowerCase())
    );
    
    if (hasDropdownClass) {
      return true;
    }
    
    // 5. Проверка контекста - есть ли дочерние элементы option/item
    if (element.querySelector) {
      const hasOptions = element.querySelector('option, [role="option"], .option, .item');
      if (hasOptions) {
        return true;
      }
    }
    
    // 6. Проверка родительского контейнера
    if (element.closest) {
      const dropdownParent = element.closest('app-select, ng-select, mat-select, [role="combobox"], .select-container');
      if (dropdownParent) {
        return true;
      }
    }
    
    return false;
  }

  resolveDropdownElementByFieldLabel(action, currentElement) {
    const fieldLabel = String(action?.fieldLabel || '').trim();
    if (!fieldLabel) return currentElement;

    const targetLabel = this.normalizeTextValue(fieldLabel);
    if (!targetLabel) return currentElement;

    const appSelectCandidates = Array.from(document.querySelectorAll('app-select'));
    if (!appSelectCandidates.length) return currentElement;

    let best = null;
    let bestScore = 0;
    for (const appSelect of appSelectCandidates) {
      const container = appSelect.closest('.form-input, .form-group, .field, .form-row, .row') || appSelect.parentElement || appSelect;
      const ctxText = this.normalizeTextValue(container?.textContent || '');
      if (!ctxText) continue;

      let score = 0;
      if (ctxText.includes(targetLabel)) score += 100;
      if (ctxText.startsWith(targetLabel)) score += 20;
      if (targetLabel.includes('основание') && ctxText.includes('основание')) score += 10;
      if (targetLabel.includes('должность') && ctxText.includes('должность')) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = appSelect;
      }
    }

    if (!best || bestScore <= 0) return currentElement;
    return best.querySelector('.select-box, [class*="select-box"], .result, .options') || best;
  }

  resolvePreferredDropdownTrigger(action, currentElement) {
    const fieldLabel = this.normalizeTextValue(String(action?.fieldLabel || ''));
    if (!fieldLabel || !fieldLabel.includes('основание')) {
      return currentElement;
    }

    const preferredSelectors = [
      '#status-project__result > div',
      '#status-project__result .arrow.ng-star-inserted.up',
      '#status-project__result .arrow.ng-star-inserted',
      '#status-project__result .arrow',
      'div.arrow.ng-star-inserted.up'
    ];

    for (const selector of preferredSelectors) {
      const candidate = document.querySelector(selector);
      if (!candidate) continue;
      const style = window.getComputedStyle(candidate);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      return candidate;
    }

    return currentElement;
  }

  /**
   * Обрабатывает кастомные dropdown элементы (Angular Material, React Select и т.д.)
   */
  async handleCustomDropdown(element, value) {
    console.log('🎨 Пробую обработать кастомный dropdown');
    
    // Метод 1: Ищем скрытый input внутри dropdown
    const hiddenInput = element.querySelector('input[type="hidden"]');
    if (hiddenInput) {
      hiddenInput.value = value;
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Метод 2: Angular Material - ищем mat-select
    if (element.classList.contains('mat-select') || element.querySelector('mat-select')) {
      const matSelect = element.querySelector('mat-select') || element;
      // Открываем dropdown
      matSelect.click();
      await this.delay(100); // Уменьшено с 300 до 100
      
      // Ищем опцию по тексту или значению
      const options = Array.from(document.querySelectorAll('mat-option'));
      const option = options.find(opt => 
        opt.textContent?.trim() === value || 
        opt.getAttribute('value') === value ||
        opt.textContent?.toLowerCase().includes(value.toLowerCase())
      );
      
      if (option) {
        option.click();
        await this.delay(100); // Уменьшено с 300 до 100
        return true;
      }
    }

    // Метод 3: React Select - ищем .react-select
    if (element.classList.contains('react-select') || element.querySelector('.react-select')) {
      const reactSelect = element.querySelector('.react-select') || element;
      const input = reactSelect.querySelector('input');
      if (input) {
        // Открываем dropdown
        input.focus();
        input.click();
        await this.delay(100); // Уменьшено с 300 до 100
        
        // Ищем опцию
        const options = Array.from(document.querySelectorAll('.react-select__option, [class*="option"]'));
        const option = options.find(opt => 
          opt.textContent?.trim() === value || 
          opt.textContent?.toLowerCase().includes(value.toLowerCase())
        );
        
        if (option) {
          option.click();
          await this.delay(100); // Уменьшено с 300 до 100
          return true;
        }
      }
    }

    // Метод 4: PrimeNG - ищем p-dropdown
    if (element.tagName === 'P-DROPDOWN' || element.querySelector('p-dropdown')) {
      const trigger = element.querySelector('[role="combobox"], .p-dropdown-trigger, button');
      if (trigger) {
        trigger.click();
        await this.delay(300);
        
        const options = Array.from(document.querySelectorAll('.p-dropdown-item, [role="option"]'));
        const option = options.find(opt => 
          opt.textContent?.trim() === value || 
          opt.textContent?.toLowerCase().includes(value.toLowerCase())
        );
        
        if (option) {
          option.click();
          await this.delay(300);
          return true;
        }
      }
    }

    // Метод 5: Angular app-select компонент
    // ПРИОРИТЕТ: Используем SeleniumUtils для эмуляции логики из автотеста
    if (this.seleniumUtils) {
      console.log('🤖 [Player] ════════════════════════════════════════════════════');
      console.log('🤖 [Player] ИСПОЛЬЗУЮ SeleniumUtils (логика из автотеста npa-test.py)');
      console.log(`🤖 [Player] Выбор опции: "${value}"`);
      console.log('🤖 [Player] ════════════════════════════════════════════════════');
      try {
        const success = await this.seleniumUtils.selectDropdownOption(element, value);
        if (success) {
          console.log('✅ [Player] ✅✅✅ Опция успешно выбрана через SeleniumUtils ✅✅✅');
          return true;
        } else {
          console.warn('⚠️ [Player] SeleniumUtils не смог выбрать опцию, пробую обычную логику...');
        }
      } catch (e) {
        console.error(`❌ [Player] Ошибка при использовании SeleniumUtils: ${e.message}`);
        console.error('   Stack:', e.stack);
        // Продолжаем с обычной логикой
      }
    } else {
      console.warn('⚠️ [Player] SeleniumUtils недоступен, использую обычную логику');
    }
    
    // Сначала пытаемся найти app-select через closest или по ID из селектора
    let appSelect = element.tagName === 'APP-SELECT' ? element : element.closest('app-select');
    
    // Если не нашли через closest, пробуем найти по ID из селектора (например, #status-project__result)
    if (!appSelect) {
      const elementId = element.id || '';
      if (elementId) {
        // Извлекаем ID без суффикса (например, status-project из status-project__result)
        const baseId = elementId.replace(/__result.*$/, '').replace(/__value.*$/, '');
        if (baseId) {
          appSelect = document.querySelector(`app-select[elementid="${baseId}"], app-select[ng-reflect-element-id="${baseId}"]`);
        }
      }
    }
    
    // Если все еще не нашли, пробуем найти по тексту или другим признакам
    if (!appSelect) {
      // Ищем все app-select на странице и проверяем, содержит ли один из них наш элемент
      const allAppSelects = Array.from(document.querySelectorAll('app-select'));
      for (const select of allAppSelects) {
        if (select.contains(element)) {
          appSelect = select;
          break;
        }
      }
    }
    
    if (appSelect) {
      const elementId = appSelect.getAttribute('elementid') || appSelect.getAttribute('ng-reflect-element-id');
      const label = appSelect.getAttribute('label') || appSelect.getAttribute('ng-reflect-label');
      
      console.log(`🎯 Найден app-select: elementid="${elementId}", label="${label}"`);
      
      // Ищем кликабельный элемент (обычно .options, .result, .select-box или .arrow.isShowOptions)
      let clickableElement = appSelect.querySelector('.options, [class*="options"], .result, [class*="result"], .arrow.isShowOptions, .arrow[class*="isShowOptions"], .select-box, [class*="select-box"], [class*="select"]');
      
      // Если не нашли, пробуем найти через селектор
      if (!clickableElement) {
        if (elementId) {
          const idSelector = `app-select[elementid="${elementId}"] .options, app-select[ng-reflect-element-id="${elementId}"] .options, app-select[elementid="${elementId}"] [class*="options"], app-select[ng-reflect-element-id="${elementId}"] [class*="options"], app-select[elementid="${elementId}"] .result, app-select[ng-reflect-element-id="${elementId}"] .result, app-select[elementid="${elementId}"] .arrow.isShowOptions, app-select[ng-reflect-element-id="${elementId}"] .arrow.isShowOptions, app-select[elementid="${elementId}"] .select-box, app-select[ng-reflect-element-id="${elementId}"] .select-box`;
          clickableElement = document.querySelector(idSelector);
        }
        if (!clickableElement && label) {
          const labelSelector = `app-select[label="${label}"] .options, app-select[ng-reflect-label="${label}"] .options, app-select[label="${label}"] [class*="options"], app-select[ng-reflect-label="${label}"] [class*="options"], app-select[label="${label}"] .result, app-select[ng-reflect-label="${label}"] .result, app-select[label="${label}"] .arrow.isShowOptions, app-select[ng-reflect-label="${label}"] .arrow.isShowOptions, app-select[label="${label}"] .select-box, app-select[ng-reflect-label="${label}"] .select-box`;
          clickableElement = document.querySelector(labelSelector);
        }
      }
      
      if (clickableElement) {
        // ЛОГИРОВАНИЕ СОСТОЯНИЯ СТРАНИЦЫ ПЕРЕД КЛИКОМ
        console.log(`📊 СОСТОЯНИЕ СТРАНИЦЫ ПЕРЕД КЛИКОМ:`);
        console.log(`   - Кликабельный элемент: <${clickableElement.tagName.toLowerCase()}> id="${clickableElement.id || 'нет'}" class="${clickableElement.className || 'нет'}"`);
        const clickableRect = clickableElement.getBoundingClientRect();
        console.log(`   - Позиция: left=${Math.round(clickableRect.left)}, top=${Math.round(clickableRect.top)}`);
        
        // Логируем все видимые панели ДО клика
        const panelsBefore = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
        const visiblePanelsBefore = panelsBefore.filter(p => {
          const rect = p.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
        });
        console.log(`   - Видимых панелей ДО клика: ${visiblePanelsBefore.length}`);
        
        clickableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Умное ожидание завершения прокрутки
        if (this.smartWaiter) {
          await this.smartWaiter.waitForElementReady(clickableElement, {
            visible: true,
            timeout: 500
          });
        } else {
          await this.delay(100);
        }
        
        // Функция для ожидания появления панели с опциями
        const waitForPanel = async (maxWait = 2000) => {
          const startTime = Date.now();
          const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
          
          while (Date.now() - startTime < maxWait) {
            // Расширенный поиск панелей (как в автотесте npa-test.py)
            const panelSelectors = [
              '.dropdown-menu',
              '[role="listbox"]',
              '.select-options',
              '[class*="dropdown"]',
              '[class*="menu"]',
              '[class*="panel"]',
              '[class*="overlay"]',
              '[class*="status"]', // Специально для поля статуса
              '.cdk-overlay-pane',
              '.cdk-overlay-container',
              '[class*="cdk-overlay"]',
              'div[class*="select"]',
              'ul[class*="select"]'
            ];
            
            const panels = Array.from(document.querySelectorAll(panelSelectors.join(', ')));
            const visiblePanels = panels.filter(panel => {
              const rect = panel.getBoundingClientRect();
              // Проверяем, что панель видима
              if (rect.width > 0 && rect.height > 0 && panel.offsetParent !== null) {
                // Ищем опции в панели (как в автотесте: ['li', 'div', 'span', '[role="option"]', '.option'])
                const optionSelectors = ['li', 'div', 'span', '[role="option"]', '.option'];
                const allOptions = [];
                for (const optSel of optionSelectors) {
                  try {
                    allOptions.push(...Array.from(panel.querySelectorAll(optSel)));
                  } catch (e) {
                    // Игнорируем ошибки некорректных селекторов
                  }
                }
                const realOptions = allOptions.filter(opt => {
                  const optText = opt.textContent?.trim() || '';
                  const isPlaceholder = placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()));
                  const optRect = opt.getBoundingClientRect();
                  return optText && optText.length > 0 && !isPlaceholder && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
                });
                // Панель должна содержать хотя бы одну реальную опцию
                return realOptions.length > 0;
              }
              return false;
            });
            if (visiblePanels.length > 0) {
              console.log(`✅ Найдено ${visiblePanels.length} видимых панелей с опциями`);
              return visiblePanels;
            }
            await this.delay(100);
          }
          return [];
        };
        
        // Первый клик
        console.log(`🖱️ ВЫПОЛНЯЮ КЛИК ПО ЭЛЕМЕНТУ...`);
        console.log(`   - Элемент: <${clickableElement.tagName.toLowerCase()}> id="${clickableElement.id || 'нет'}" class="${clickableElement.className || 'нет'}"`);
        console.log(`   - Позиция: left=${Math.round(clickableRect.left)}, top=${Math.round(clickableRect.top)}`);
        
        // Пробуем разные способы клика для надежности
        try {
          // Способ 1: Фокус + клик
          clickableElement.focus();
          // Минимальная задержка для фокуса
          if (this.smartWaiter) {
            await this.smartWaiter.minimalDelay(30);
          } else {
            await this.delay(30);
          }
          clickableElement.click();
        } catch (e) {
          console.warn('⚠️ Ошибка при focus+click, пробую только click:', e);
          clickableElement.click();
        }
        
        // Умное ожидание появления панели dropdown
        if (this.smartWaiter) {
          await this.smartWaiter.waitForDropdownPanel(clickableElement, { timeout: 1000 });
        } else {
          await this.delay(150);
        }
        
        // ЛОГИРОВАНИЕ СОСТОЯНИЯ СТРАНИЦЫ ПОСЛЕ КЛИКА
        console.log(`📊 СОСТОЯНИЕ СТРАНИЦЫ ПОСЛЕ КЛИКА:`);
        const panelsAfter = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
        const visiblePanelsAfter = panelsAfter.filter(p => {
          const rect = p.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
        });
        console.log(`   - Видимых панелей ПОСЛЕ клика: ${visiblePanelsAfter.length}`);
        
        // Находим новые панели, которые появились после клика
        const newPanels = visiblePanelsAfter.filter(p => !visiblePanelsBefore.includes(p));
        if (newPanels.length > 0) {
          console.log(`   ✅ Появилось ${newPanels.length} новых панелей после клика:`);
          newPanels.forEach((panel, idx) => {
            const rect = panel.getBoundingClientRect();
            const tag = panel.tagName.toLowerCase();
            const classes = panel.className || 'нет классов';
            const id = panel.id || 'нет id';
            const allElements = Array.from(panel.querySelectorAll('*'));
            const visibleElements = allElements.filter(el => {
              const elRect = el.getBoundingClientRect();
              const elText = el.textContent?.trim();
              return elText && elText.length > 0 && elRect.width > 0 && elRect.height > 0 && el.offsetParent !== null;
            });
            console.log(`      ${idx + 1}. <${tag}> id="${id}" class="${classes}" size=${Math.round(rect.width)}x${Math.round(rect.height)} elements=${allElements.length} visible=${visibleElements.length}`);
            if (visibleElements.length > 0 && visibleElements.length <= 10) {
              console.log(`         Тексты:`, visibleElements.map(el => el.textContent?.trim()).filter(Boolean).slice(0, 5));
            }
          });
        }
        
        // Ждем появления панели
        let visiblePanels = await waitForPanel(3000);
        
        // Если панель не появилась, пробуем кликнуть еще раз с большей задержкой
        if (visiblePanels.length === 0) {
          console.log('⚠️ Панель не появилась после первого клика, пробую еще раз...');
          clickableElement.focus();
          await this.delay(100); // Уменьшено с 200 до 100
          clickableElement.click();
          await this.delay(300); // Уменьшено с 800 до 300
          visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
        }
        
        // Если все еще не появилась, пробуем кликнуть по app-select напрямую
        if (visiblePanels.length === 0) {
          console.log('⚠️ Панель не появилась, пробую кликнуть по app-select...');
          appSelect.focus();
          await this.delay(100); // Уменьшено с 200 до 100
          appSelect.click();
          await this.delay(300); // Уменьшено с 800 до 300
          visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
        }
        
        // Последняя попытка: пробуем кликнуть по .options, .result или .arrow.isShowOptions внутри app-select
        if (visiblePanels.length === 0) {
          console.log('⚠️ Панель не появилась, пробую кликнуть по .options, .result или .arrow.isShowOptions...');
          
          // ПРИОРИТЕТ 1: Пробуем .options
          const optionsElement = appSelect.querySelector('.options, [class*="options"]');
          if (optionsElement) {
            console.log('   Пробую кликнуть по .options...');
            optionsElement.focus();
            await this.delay(100); // Уменьшено с 200 до 100
            optionsElement.click();
            await this.delay(300); // Уменьшено с 1000 до 300
            visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
            if (visiblePanels.length > 0) {
              console.log('✅ Панель появилась после клика по .options!');
            }
          }
          
          // ПРИОРИТЕТ 2: Пробуем .arrow.isShowOptions
          if (visiblePanels.length === 0) {
            const arrowElement = appSelect.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]');
            if (arrowElement) {
              console.log('   Пробую кликнуть по .arrow.isShowOptions...');
              arrowElement.focus();
              await this.delay(100); // Уменьшено с 200 до 100
              arrowElement.click();
              await this.delay(300); // Уменьшено с 1000 до 300
              visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
              if (visiblePanels.length > 0) {
                console.log('✅ Панель появилась после клика по .arrow.isShowOptions!');
              }
            }
          }
          
          // ПРИОРИТЕТ 3: Пробуем .result
          if (visiblePanels.length === 0) {
          const resultElement = appSelect.querySelector('.result, [class*="result"]');
          if (resultElement) {
              console.log('   Пробую кликнуть по .result...');
            resultElement.focus();
            await this.delay(100); // Уменьшено с 200 до 100
            resultElement.click();
              await this.delay(300); // Уменьшено с 1000 до 300
            visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
            if (visiblePanels.length > 0) {
              console.log('✅ Панель появилась после клика по .result!');
              }
            }
          }
        }
        
        // Ищем overlay/panel, связанный с этим конкретным app-select
        // Сначала ищем панель рядом с app-select (по позиции)
        const appSelectRect = appSelect.getBoundingClientRect();
        console.log(`📍 Позиция app-select: left=${Math.round(appSelectRect.left)}, top=${Math.round(appSelectRect.top)}, width=${Math.round(appSelectRect.width)}, height=${Math.round(appSelectRect.height)}`);
        
        // Расширяем поиск панелей, включая Angular CDK overlay
        const panelSelectors = [
          '[class*="panel"]',
          '[class*="overlay"]',
          '[class*="dropdown"]',
          '[class*="menu"]',
          '[role="listbox"]',
          '.cdk-overlay-pane',
          '.cdk-overlay-container',
          '[class*="cdk-overlay"]'
        ];
        // Если панель появилась после клика по .result, используем её, иначе ищем все панели
        let allPanels = visiblePanels.length > 0 ? visiblePanels : Array.from(document.querySelectorAll(panelSelectors.join(', ')));
        
        // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВСЕХ ПАНЕЛЕЙ НА СТРАНИЦЕ
        console.log(`📊 ВСЕ ПАНЕЛИ НА СТРАНИЦЕ (${allPanels.length}):`);
        allPanels.forEach((panel, idx) => {
          const rect = panel.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && panel.offsetParent !== null;
          const tag = panel.tagName.toLowerCase();
          const classes = panel.className || 'нет классов';
          const id = panel.id || 'нет id';
          const allOptions = Array.from(panel.querySelectorAll('*'));
          const visibleOptions = allOptions.filter(opt => {
            const optRect = opt.getBoundingClientRect();
            const optText = opt.textContent?.trim();
            return optText && optText.length > 0 && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
          });
          console.log(`   ${idx + 1}. <${tag}> id="${id}" class="${classes}" visible=${isVisible} size=${Math.round(rect.width)}x${Math.round(rect.height)} pos=(${Math.round(rect.left)},${Math.round(rect.top)}) elements=${allOptions.length} visibleElements=${visibleOptions.length}`);
          if (visibleOptions.length > 0 && visibleOptions.length <= 10) {
            console.log(`      Тексты элементов:`, visibleOptions.map(opt => opt.textContent?.trim()).filter(Boolean).slice(0, 5));
          }
        });
        
        // Если панель все еще не найдена, пробуем найти её еще раз после небольшой задержки
        if (allPanels.length === 0 || !allPanels.some(p => {
          const rect = p.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
        })) {
          console.log('⚠️ Панель не найдена, жду еще немного и проверяю снова...');
          await this.delay(500);
          // Проверяем панель еще раз
          visiblePanels = await waitForPanel(2000);
          if (visiblePanels.length > 0) {
            allPanels = visiblePanels;
            console.log('✅ Панель найдена после дополнительного ожидания!');
          } else {
            allPanels = Array.from(document.querySelectorAll(panelSelectors.join(', ')));
            console.log(`📊 После повторного поиска найдено ${allPanels.length} панелей`);
          }
        }
        
        let targetPanel = null;
        let minDistance = Infinity;
        
        // Находим панель, которая ближе всего к app-select
        for (const panel of allPanels) {
          const panelRect = panel.getBoundingClientRect();
          // Проверяем, что панель видима и находится рядом с app-select
          if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
            const distanceX = Math.abs(panelRect.left - appSelectRect.left);
            const distanceY = Math.abs(panelRect.top - (appSelectRect.bottom + 5)); // Панель обычно ниже
            const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
            
            // Панель должна быть в пределах 500px от app-select
            if (distance < 500 && distance < minDistance) {
              minDistance = distance;
              targetPanel = panel;
              console.log(`✅ Найдена панель на расстоянии ${Math.round(distance)}px от app-select`);
            }
          }
        }
        
        // Если не нашли панель по позиции, пробуем найти через aria-owns или другие связи
        if (!targetPanel) {
          const ariaOwns = appSelect.getAttribute('aria-owns');
          if (ariaOwns) {
            targetPanel = document.getElementById(ariaOwns);
          }
        }
        
        // Если все еще не нашли, ищем панель с опциями, которая появилась недавно
        if (!targetPanel) {
          const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
          console.log(`🔍 Ищу панель с целевой опцией "${value}" среди ${allPanels.length} панелей...`);
          
          // Сначала ищем панель, связанную с этим dropdown через ID
          if (elementId) {
            // Ищем панель с ID, содержащим elementId
            const relatedPanel = Array.from(allPanels).find(panel => {
              const panelId = panel.id || '';
              return panelId.includes(elementId) || panelId.includes('status-project');
            });
            
            if (relatedPanel) {
              const panelRect = relatedPanel.getBoundingClientRect();
              if (panelRect.width > 0 && panelRect.height > 0 && relatedPanel.offsetParent !== null) {
                console.log(`   📋 Найдена панель, связанная с dropdown через ID: ${relatedPanel.id || 'нет id'}`);
                targetPanel = relatedPanel;
              }
            }
          }
          
          // Если не нашли по ID, ищем панель, которая содержит целевую опцию
          if (!targetPanel) {
            // Используем расширенный поиск опций во всех панелях
            for (const panel of allPanels) {
              const panelRect = panel.getBoundingClientRect();
              if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
                // Расширенный поиск опций - ищем все элементы с текстом
                const allPanelElements = Array.from(panel.querySelectorAll('*'));
                const realOptions = allPanelElements.filter(opt => {
                  const optText = opt.textContent?.trim() || '';
                  const isPlaceholder = placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()));
                  const optRect = opt.getBoundingClientRect();
                  return optText && optText.length > 0 && !isPlaceholder && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
                });
                
                if (realOptions.length > 0) {
                  console.log(`   📋 Панель ${panel.tagName.toLowerCase()} (${panel.className || 'нет классов'}): ${realOptions.length} опций`);
                  const optionTexts = realOptions.map(opt => opt.textContent?.trim()).filter(Boolean).slice(0, 10);
                  console.log(`      Тексты опций:`, optionTexts);
                  
                  // Проверяем, есть ли в панели опция с нужным текстом
                  const hasTargetOption = realOptions.some(opt => {
                    const optText = opt.textContent?.trim() || '';
                    const valueLower = value.toLowerCase();
                    const optTextLower = optText.toLowerCase();
                    return optText === value || 
                           optTextLower === valueLower ||
                           optTextLower.includes(valueLower) || 
                           valueLower.includes(optTextLower) ||
                           // Для частичных совпадений (например, "По поручению" может быть частью "Плановый По поручению Инициативный")
                           (optTextLower.includes(valueLower) && valueLower.length > 3);
                  });
                  
                  if (hasTargetOption) {
                    targetPanel = panel;
                    console.log(`✅ Найдена панель с целевой опцией "${value}" (${realOptions.length} реальных опций)`);
                    break;
                  }
                }
              }
            }
          }
          
          // Если не нашли панель с целевой опцией, ищем панель, которая ближе всего к app-select
          if (!targetPanel) {
            console.log(`⚠️ Панель с целевой опцией не найдена, ищу ближайшую панель к app-select...`);
            let minDistance = Infinity;
            for (const panel of allPanels) {
              const panelRect = panel.getBoundingClientRect();
              if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
                const allPanelElements = Array.from(panel.querySelectorAll('*'));
                const realOptions = allPanelElements.filter(opt => {
                  const optText = opt.textContent?.trim() || '';
                  const isPlaceholder = placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()));
                  const optRect = opt.getBoundingClientRect();
                  return optText && optText.length > 0 && !isPlaceholder && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
                });
                
                if (realOptions.length > 0) {
                  const distanceX = Math.abs(panelRect.left - appSelectRect.left);
                  const distanceY = Math.abs(panelRect.top - (appSelectRect.bottom + 5));
                  const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
                  
                  if (distance < minDistance) {
                    minDistance = distance;
                    targetPanel = panel;
                    console.log(`   📍 Найдена ближайшая панель на расстоянии ${Math.round(distance)}px (${realOptions.length} опций)`);
                  }
                }
              }
            }
            
            if (targetPanel) {
              console.log(`✅ Выбрана ближайшая панель к app-select`);
            }
          }
        }
        
        let options = [];
        
        if (targetPanel) {
          console.log(`🎯 Использую найденную панель для поиска опций`);
          console.log(`📋 ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О ПАНЕЛИ:`);
          console.log(`   - Тег: ${targetPanel.tagName}`);
          console.log(`   - Классы: ${targetPanel.className || 'нет'}`);
          console.log(`   - ID: ${targetPanel.id || 'нет'}`);
          console.log(`   - Размеры: ${targetPanel.getBoundingClientRect().width}x${targetPanel.getBoundingClientRect().height}`);
          
          // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВСЕХ ЭЛЕМЕНТОВ В ПАНЕЛИ
          const allPanelElements = Array.from(targetPanel.querySelectorAll('*'));
          console.log(`📊 Всего элементов в панели: ${allPanelElements.length}`);
          
          // Логируем все видимые элементы с текстом
          const visibleElements = allPanelElements.filter(el => {
            const rect = el.getBoundingClientRect();
            const text = el.textContent?.trim();
            return text && text.length > 0 && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
          });
          
          console.log(`📋 ВИДИМЫЕ ЭЛЕМЕНТЫ В ПАНЕЛИ (${visibleElements.length}):`);
          visibleElements.slice(0, 20).forEach((el, idx) => {
            const text = el.textContent?.trim();
            const tag = el.tagName.toLowerCase();
            const classes = el.className || 'нет классов';
            const id = el.id || 'нет id';
            console.log(`   ${idx + 1}. <${tag}> id="${id}" class="${classes}" text="${text.substring(0, 50)}"`);
          });
          
          // Ищем опции только в этой панели (как в автотесте: ['li', 'div', 'span', '[role="option"]', '.option'])
          const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
          const optionSelectors = [
            'li',
            'div',
            'span',
            '[role="option"]',
            '.option',
            '.option-item',
            'div[class*="option"]',
            '.mat-option',
            '.ant-select-item-option',
            'div[class*="item"]',
            'a[class*="item"]',
            'span[class*="item"]',
            'button[class*="item"]'
          ];
          
          // Пробуем каждый селектор и логируем результаты
          for (const selector of optionSelectors) {
            const found = Array.from(targetPanel.querySelectorAll(selector));
            console.log(`🔍 Селектор "${selector}": найдено ${found.length} элементов`);
            
            if (found.length > 0) {
              // Логируем первые 10 найденных элементов
              found.slice(0, 10).forEach((el, idx) => {
                const text = el.textContent?.trim();
                const tag = el.tagName.toLowerCase();
                const classes = el.className || 'нет классов';
                console.log(`   ${idx + 1}. <${tag}> class="${classes}" text="${text ? text.substring(0, 50) : 'нет текста'}"`);
              });
            }
            
            // Фильтруем плейсхолдеры
            const filtered = found.filter(el => {
              const text = el.textContent?.trim();
              const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
              const rect = el.getBoundingClientRect();
              const isVisible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
              return text && text.length > 0 && !isPlaceholder && isVisible;
            });
            
            if (filtered.length > 0) {
              console.log(`✅ Найдено ${filtered.length} опций через селектор "${selector}" (отфильтровано ${found.length - filtered.length} плейсхолдеров/невидимых)`);
              console.log(`📝 Тексты найденных опций:`, filtered.map(opt => opt.textContent?.trim()).filter(Boolean));
              
              // Проверяем, есть ли среди них целевая опция
              const hasTarget = filtered.some(opt => {
                const optText = opt.textContent?.trim() || '';
                return optText === value || 
                       optText.toLowerCase() === value.toLowerCase() ||
                       optText.toLowerCase().includes(value.toLowerCase()) ||
                       value.toLowerCase().includes(optText.toLowerCase());
              });
              
              if (hasTarget || options.length === 0) {
                options = filtered;
                if (hasTarget) {
                  console.log(`🎯 Целевая опция "${value}" найдена через селектор "${selector}"!`);
                }
                // Не прерываем цикл, продолжаем искать лучший селектор
              }
            }
          }
          
          // Если не нашли через селекторы, берем все кликабельные элементы в панели
          if (options.length === 0) {
            console.log(`⚠️ Не найдено опций через стандартные селекторы, пробую все элементы...`);
            const allElements = Array.from(targetPanel.querySelectorAll('*'));
            options = allElements.filter(el => {
              const text = el.textContent?.trim();
              const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
              const rect = el.getBoundingClientRect();
              const isVisible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
              return text && text.length > 0 && !isPlaceholder && isVisible;
            });
            console.log(`✅ Найдено ${options.length} опций в панели (все элементы, отфильтровано плейсхолдеры)`);
            console.log(`📝 Тексты всех найденных опций:`, options.map(opt => opt.textContent?.trim()).filter(Boolean));
          }
        } else {
          console.warn('⚠️ Не найдена панель dropdown, пробую альтернативные способы поиска опций');
          
          // Сначала ищем опции внутри app-select (как в автотесте: ['li', 'div', 'span', '[role="option"]', '.option'])
          const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
          const optionSelectorsInSelect = ['li', 'div', 'span', '[role="option"]', '.option'];
          const allOptionsInSelect = [];
          for (const optSel of optionSelectorsInSelect) {
            try {
              allOptionsInSelect.push(...Array.from(appSelect.querySelectorAll(optSel)));
            } catch (e) {
              // Игнорируем ошибки
            }
          }
          
          const optionsInSelect = allOptionsInSelect.filter(el => {
            const text = el.textContent?.trim();
            const rect = el.getBoundingClientRect();
            // Исключаем плейсхолдеры и элементы без текста
            const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
            return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
          });
          
          if (optionsInSelect.length > 0) {
            options = optionsInSelect;
            console.log(`✅ Найдено ${options.length} опций внутри app-select`);
          } else {
            // Fallback: ищем опции, которые появились после клика (как в автотесте)
            // Сначала ищем в overlay панелях
            const overlayPanels = Array.from(document.querySelectorAll('.cdk-overlay-pane, [class*="overlay"], [class*="panel"], [class*="dropdown"], [class*="menu"], [role="listbox"]'));
            const allOptionsFromOverlays = [];
            
            // Используем те же селекторы, что и в автотесте: ['li', 'div', 'span', '[role="option"]', '.option']
            const fallbackOptionSelectors = ['li', 'div', 'span', '[role="option"]', '.option'];
            
            for (const panel of overlayPanels) {
              const panelRect = panel.getBoundingClientRect();
              if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
                for (const optSel of fallbackOptionSelectors) {
                  try {
                    const panelOptions = Array.from(panel.querySelectorAll(optSel));
                    allOptionsFromOverlays.push(...panelOptions);
                  } catch (e) {
                    // Игнорируем ошибки
                  }
                }
              }
            }
            
            // Также ищем опции глобально (как в автотесте: browser.find_elements(By.CSS_SELECTOR, 'li, div, span'))
            const allOptions = [];
            for (const optSel of fallbackOptionSelectors) {
              try {
                allOptions.push(...Array.from(document.querySelectorAll(optSel)));
              } catch (e) {
                // Игнорируем ошибки
              }
            }
            const combinedOptions = [...allOptionsFromOverlays, ...allOptions];
            
            // Удаляем дубликаты
            const uniqueOptions = Array.from(new Set(combinedOptions));
            
            options = uniqueOptions.filter(opt => {
              const text = opt.textContent?.trim();
              const rect = opt.getBoundingClientRect();
              const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
              return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && opt.offsetParent !== null;
            });
            
            console.log(`✅ Найдено ${options.length} видимых опций на странице (без плейсхолдеров, включая overlay панели)`);
          }
        }
        
        // ДЕТАЛЬНЫЙ ПОИСК ОПЦИИ С ЛОГИРОВАНИЕМ
        console.log(`🔍 Ищу опцию "${value}" среди ${options.length} найденных опций...`);
        
        if (options.length > 0) {
          console.log(`📝 Все найденные опции:`);
          options.forEach((opt, idx) => {
            const optText = opt.textContent?.trim() || '';
            const optValue = opt.getAttribute('value') || opt.dataset.value || '';
            const tag = opt.tagName.toLowerCase();
            const classes = opt.className || 'нет классов';
            const id = opt.id || 'нет id';
            const rect = opt.getBoundingClientRect();
            console.log(`   ${idx + 1}. <${tag}> id="${id}" class="${classes}" text="${optText}" value="${optValue}" visible=${rect.width > 0 && rect.height > 0 && opt.offsetParent !== null}`);
            
            // Проверяем совпадение
            const valueLower = value.toLowerCase().trim();
            const optTextLower = optText.toLowerCase();
            const exactMatch = optText === value || optValue === value || optTextLower === valueLower;
            const caseInsensitiveMatch = optText.toLowerCase() === value.toLowerCase() || optValue.toLowerCase() === value.toLowerCase();
            const includesMatch = optText.toLowerCase().includes(value.toLowerCase()) || optValue.toLowerCase().includes(value.toLowerCase());
            const reverseIncludesMatch = value.toLowerCase().includes(optText.toLowerCase());
            
            if (exactMatch || caseInsensitiveMatch || includesMatch || reverseIncludesMatch) {
              console.log(`      ✅ СОВПАДЕНИЕ! exact=${exactMatch} caseInsensitive=${caseInsensitiveMatch} includes=${includesMatch} reverse=${reverseIncludesMatch}`);
            }
          });
        }
        
        // Ищем опцию с приоритетом: точное совпадение > частичное совпадение
        const valueLower = value.toLowerCase().trim();
        let bestOption = null;
        let bestScore = 0;
        
        for (const opt of options) {
          const optText = opt.textContent?.trim() || '';
          const optValue = opt.getAttribute('value') || opt.dataset.value || optText;
          const optTextLower = optText.toLowerCase();
          const optValueLower = optValue.toLowerCase();
          
          // Точное совпадение (без учета регистра) - высший приоритет
          if (optTextLower === valueLower || optValueLower === valueLower) {
            bestOption = opt;
            bestScore = 100;
            console.log(`✅ Найдена опция с точным совпадением: "${optText}"`);
            break;
          }
          
          // Точное совпадение (с учетом регистра)
          if (optText === value || optValue === value) {
            bestOption = opt;
            bestScore = 95;
            console.log(`✅ Найдена опция с точным совпадением (с учетом регистра): "${optText}"`);
            break;
          }
          
          // Частичное совпадение - опция содержит целевое значение
          if (optTextLower.includes(valueLower) && valueLower.length > 2) {
            const matchScore = (valueLower.length / optTextLower.length) * 80;
            if (matchScore > bestScore) {
              bestScore = matchScore;
              bestOption = opt;
              console.log(`   💡 Потенциальное совпадение: "${optText}" (оценка: ${Math.round(matchScore)}%)`);
            }
          }
          
          // Обратное совпадение - целевое значение содержит опцию
          if (valueLower.includes(optTextLower) && optTextLower.length > 2) {
            const matchScore = (optTextLower.length / valueLower.length) * 70;
            if (matchScore > bestScore) {
              bestScore = matchScore;
              bestOption = opt;
              console.log(`   💡 Потенциальное совпадение (обратное): "${optText}" (оценка: ${Math.round(matchScore)}%)`);
            }
          }
        }
        
        const option = bestOption && bestScore > 30 ? bestOption : null;
        
        if (option) {
          const optText = option.textContent?.trim() || '';
          console.log(`✅ Найдена опция "${optText}" для значения "${value}"`);
          option.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.delay(300);
          
          // Выполняем клик по опции с использованием MouseEvent для более надежного клика
          try {
            // Фокусируем опцию
            if (typeof option.focus === 'function') {
              option.focus();
              await this.delay(100);
            }
            
            // Создаем и диспатчим события мыши (как в автотесте)
            const mouseEvents = ['mousedown', 'mouseup', 'click'];
            for (const eventType of mouseEvents) {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
              });
              option.dispatchEvent(event);
              await this.delay(50);
            }
            
            // Также пробуем обычный клик
            if (typeof option.click === 'function') {
              option.click();
            }
            
            await this.delay(500);
            
            // Проверяем результат
            const selectedValue = this.getSelectedDropdownValue(appSelect);
            console.log(`🔍 Значение после клика: "${selectedValue}"`);
            
            if (selectedValue && (selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
              console.log(`✅ Опция "${value}" успешно выбрана!`);
              return true;
            }
          } catch (e) {
            console.warn(`⚠️ Ошибка при клике по опции: ${e.message}`);
            // Пробуем JavaScript клик (как в автотесте)
            try {
              await this.delay(100);
              option.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await this.delay(200);
              
              // Используем JavaScript клик (как в автотесте: browser.execute_script("arguments[0].click();", planned_option))
              if (option.click) {
                option.click();
              } else {
                const clickEvent = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  buttons: 1
                });
                option.dispatchEvent(clickEvent);
              }
              
              await this.delay(500);
              
              const selectedValue = this.getSelectedDropdownValue(appSelect);
              console.log(`🔍 Значение после JavaScript клика: "${selectedValue}"`);
              
              if (selectedValue && (selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
                console.log(`✅ Опция "${value}" успешно выбрана через JavaScript!`);
                return true;
              }
            } catch (e2) {
              console.error(`❌ Ошибка при JavaScript клике: ${e2.message}`);
            }
          }
          
          // Выполняем клик по опции с использованием MouseEvent для более надежного клика
          try {
            // Фокусируем опцию
            if (typeof option.focus === 'function') {
              option.focus();
              await this.delay(100);
            }
            
            // Создаем и диспатчим события мыши
            const mouseEvents = ['mousedown', 'mouseup', 'click'];
            for (const eventType of mouseEvents) {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
              });
              option.dispatchEvent(event);
              await this.delay(50);
            }
            
            // Также пробуем нативный click
            if (typeof option.click === 'function') {
              option.click();
            }
            
            await this.delay(500);
            
            // Проверяем, что значение действительно выбрано
            const selectedValue = this.getSelectedDropdownValue(appSelect);
            if (selectedValue && (selectedValue === value || selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
              console.log(`✅ Опция "${value}" выбрана успешно, текущее значение: "${selectedValue}"`);
              await this.delay(200);
              return true;
            } else {
              // Если значение не установилось, пробуем еще раз с большей задержкой
              console.log('⚠️ Значение не установилось после первого клика, пробую еще раз...');
              await this.delay(300);
              
              // Повторный клик
              for (const eventType of mouseEvents) {
                const event = new MouseEvent(eventType, {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  buttons: 1
                });
                option.dispatchEvent(event);
                await this.delay(50);
              }
              if (typeof option.click === 'function') {
                option.click();
              }
              
              await this.delay(800);
              const retryValue = this.getSelectedDropdownValue(appSelect);
              if (retryValue && (retryValue === value || retryValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(retryValue.toLowerCase()))) {
                console.log(`✅ Опция "${value}" выбрана успешно после повтора, текущее значение: "${retryValue}"`);
                return true;
              } else {
                console.warn(`⚠️ Значение не установилось после клика. Ожидалось: "${value}", получено: "${retryValue || 'пусто'}"`);
                // Пробуем найти значение в других местах
                const resultElement = appSelect.querySelector('.result, [class*="result"], .select-box, [class*="select-box"]');
                if (resultElement) {
                  const resultText = resultElement.textContent?.trim() || resultElement.innerText?.trim() || '';
                  console.log(`ℹ️ Текст в result элементе: "${resultText}"`);
                  if (resultText && (resultText === value || resultText.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(resultText.toLowerCase()))) {
                    console.log(`✅ Значение найдено в result элементе: "${resultText}"`);
                    return true;
                  }
                }
              }
            }
          } catch (error) {
            console.error('❌ Ошибка при клике по опции:', error);
          }
        } else {
          console.warn(`⚠️ Опция "${value}" не найдена в выбранной панели. Найдено опций: ${options.length}`);
          if (options.length > 0) {
            console.log('Доступные опции в выбранной панели:', options.slice(0, 10).map(opt => opt.textContent?.trim()).filter(Boolean));
          }
          
          // FALLBACK: Ищем опцию во ВСЕХ панелях на странице
          console.log(`🔍 FALLBACK: Ищу опцию "${value}" во всех панелях на странице...`);
          const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
          const allPanelsOnPage = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
          
          for (const panel of allPanelsOnPage) {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
              // Ищем все элементы с текстом в панели
              const allElements = Array.from(panel.querySelectorAll('*'));
              const realOptions = allElements.filter(el => {
                const text = el.textContent?.trim() || '';
                const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
                const rect = el.getBoundingClientRect();
                return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
              });
              
              if (realOptions.length > 0) {
                console.log(`   📋 Проверяю панель ${panel.tagName.toLowerCase()} (${panel.className || 'нет классов'}): ${realOptions.length} опций`);
                
                // Ищем целевую опцию
                const foundOption = realOptions.find(opt => {
                  const optText = opt.textContent?.trim() || '';
                  const optValue = opt.getAttribute('value') || opt.dataset.value || optText;
                  return optText === value || 
                         optValue === value ||
                         optText.toLowerCase() === value.toLowerCase() ||
                         optValue.toLowerCase() === value.toLowerCase() ||
                         optText.toLowerCase().includes(value.toLowerCase()) ||
                         optValue.toLowerCase().includes(value.toLowerCase()) ||
                         value.toLowerCase().includes(optText.toLowerCase());
                });
                
                if (foundOption) {
                  console.log(`✅ Найдена опция "${value}" в другой панели!`);
                  const optText = foundOption.textContent?.trim() || '';
                  console.log(`   Текст опции: "${optText}"`);
                  
                  // Прокручиваем к опции и кликаем
                  foundOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  await this.delay(300);
                  
                  try {
                    // Фокусируем опцию
                    if (typeof foundOption.focus === 'function') {
                      foundOption.focus();
                      await this.delay(100);
                    }
                    
                    // Создаем и диспатчим события мыши
                    const mouseEvents = ['mousedown', 'mouseup', 'click'];
                    for (const eventType of mouseEvents) {
                      const event = new MouseEvent(eventType, {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        buttons: 1
                      });
                      foundOption.dispatchEvent(event);
                      await this.delay(50);
                    }
                    
                    // Также пробуем нативный click
                    if (typeof foundOption.click === 'function') {
                      foundOption.click();
                    }
                    
                    await this.delay(500);
                    
                    // Проверяем, что значение действительно выбрано
                    const selectedValue = this.getSelectedDropdownValue(appSelect);
                    if (selectedValue && (selectedValue === value || selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
                      console.log(`✅ Опция "${value}" выбрана успешно через fallback, текущее значение: "${selectedValue}"`);
                      await this.delay(200);
                      return true;
                    } else {
                      console.warn(`⚠️ Значение не установилось после fallback клика. Ожидалось: "${value}", получено: "${selectedValue || 'пусто'}"`);
                    }
                  } catch (error) {
                    console.error('❌ Ошибка при fallback клике по опции:', error);
                  }
                }
              }
            }
          }
          
          // ПОСЛЕДНИЙ FALLBACK: Глобальный поиск по тексту (как в автотесте: browser.find_elements(By.CSS_SELECTOR, 'li, div, span'))
          console.log(`🔍 ПОСЛЕДНИЙ FALLBACK: Ищу опцию "${value}" глобально на странице (как в автотесте)...`);
          const globalOptionSelectors = ['li', 'div', 'span']; // Как в автотесте
          const allElementsOnPage = [];
          
          for (const selector of globalOptionSelectors) {
            try {
              allElementsOnPage.push(...Array.from(document.querySelectorAll(selector)));
            } catch (e) {
              // Игнорируем ошибки
            }
          }
          
          const visibleElementsWithText = allElementsOnPage.filter(el => {
            try {
              const text = el.textContent?.trim() || '';
              const rect = el.getBoundingClientRect();
              const isPlaceholder = ['выберите', 'select', 'choose', 'placeholder', 'статус'].some(ph => text.toLowerCase().includes(ph.toLowerCase()));
              return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            } catch (e) {
              return false;
            }
          });
          
          console.log(`   🔍 Найдено ${visibleElementsWithText.length} видимых элементов с текстом на странице`);
          
          // Ищем опцию по тексту (как в автотесте: if 'плановый' in option_text.lower())
          const valueLower = value.toLowerCase().trim();
          let globalOption = null;
          
          for (const el of visibleElementsWithText) {
            const elText = el.textContent?.trim() || '';
            const elTextLower = elText.toLowerCase();
            
            // Проверяем, содержит ли текст целевое значение (как в автотесте)
            if (elTextLower.includes(valueLower) && elTextLower !== 'выберите' && elTextLower !== 'статус') {
              // Проверяем, что элемент находится рядом с app-select (в пределах 1000px)
              const elRect = el.getBoundingClientRect();
              const appSelectRect = appSelect.getBoundingClientRect();
              const distance = Math.sqrt(
                Math.pow(elRect.left - appSelectRect.left, 2) + 
                Math.pow(elRect.top - appSelectRect.top, 2)
              );
              
              if (distance < 1000) {
                globalOption = el;
                console.log(`   ✅ Найдена потенциальная опция "${elText}" на расстоянии ${Math.round(distance)}px от dropdown`);
                break;
              }
            }
          }
          
          if (globalOption) {
            const optText = globalOption.textContent?.trim() || '';
            console.log(`✅ Найдена опция "${optText}" через глобальный поиск!`);
            
            // Прокручиваем к опции (как в автотесте: browser.execute_script("arguments[0].scrollIntoView(true);", planned_option))
            globalOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(500);
            
            try {
              // Кликаем по опции (как в автотесте: planned_option.click())
              globalOption.click();
              console.log(`✅ Кликнул по опции "${optText}" через глобальный поиск`);
              await this.delay(500); // Задержка для применения изменений
              
              // Проверяем результат (как в автотесте)
              const selectedValue = this.getSelectedDropdownValue(appSelect);
              console.log(`🔍 Значение после глобального поиска: "${selectedValue}"`);
              
              if (selectedValue && (selectedValue.toLowerCase().includes(valueLower) || valueLower.includes(selectedValue.toLowerCase()))) {
                console.log(`✅ Опция "${value}" успешно выбрана через глобальный поиск!`);
                return true;
              } else {
                // Пробуем JavaScript клик (как в автотесте: browser.execute_script("arguments[0].click();", planned_option))
                console.log(`🔄 Пробую JavaScript клик (как в автотесте)...`);
                await this.delay(100);
                globalOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(200);
                
                if (globalOption.click) {
                  globalOption.click();
                } else {
                  const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    buttons: 1
                  });
                  globalOption.dispatchEvent(clickEvent);
                }
                
                await this.delay(500);
                
                const selectedValue2 = this.getSelectedDropdownValue(appSelect);
                console.log(`🔍 Значение после JavaScript клика: "${selectedValue2}"`);
                
                if (selectedValue2 && (selectedValue2.toLowerCase().includes(valueLower) || valueLower.includes(selectedValue2.toLowerCase()))) {
                  console.log(`✅ Опция "${value}" успешно выбрана через JavaScript клик!`);
                  return true;
                }
              }
            } catch (e) {
              console.error(`❌ Ошибка при клике по опции через глобальный поиск: ${e.message}`);
            }
          } else {
            console.warn(`❌ Опция "${value}" не найдена ни в одной панели на странице и в глобальном поиске`);
          }
        }
      } else {
        console.warn('⚠️ Не найден кликабельный элемент в app-select');
      }
    }

    // Метод 6: Общий подход для элементов с role="combobox" или role="listbox"
    if (element.getAttribute('role') === 'combobox' || element.querySelector('[role="combobox"]')) {
      const combobox = element.querySelector('[role="combobox"]') || element;
      combobox.click();
      await this.delay(300);
      
      const options = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] [role="option"]'));
      const option = options.find(opt => 
        opt.textContent?.trim() === value || 
        opt.getAttribute('value') === value ||
        opt.textContent?.toLowerCase().includes(value.toLowerCase())
      );
      
      if (option) {
        option.click();
        await this.delay(300);
        return true;
      }
    }

    // Метод 7: Попытка найти по классу .input-project-status или .select-box
    if (element.classList.contains('input-project-status') || element.querySelector('.input-project-status')) {
      const container = element.querySelector('.input-project-status') || element;
      const selectBox = container.querySelector('.select-box, [class*="select"]');
      if (selectBox) {
        selectBox.click();
        await this.delay(500);
        
        const options = Array.from(document.querySelectorAll('[role="option"], .option-item, [class*="option"], li, div[class*="option"]'));
        const option = options.find(opt => {
          const optText = opt.textContent?.trim() || '';
          return optText === value || optText.toLowerCase().includes(value.toLowerCase());
        });
        
        if (option) {
          option.click();
          await this.delay(300);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Получает текущее выбранное значение из dropdown
   */
  getSelectedDropdownValue(appSelect) {
    if (!appSelect) return '';
    
    // Ищем скрытый input
    const hiddenInput = appSelect.querySelector('input[type="hidden"]');
    if (hiddenInput && hiddenInput.value) {
      return hiddenInput.value;
    }
    
    // Ищем элемент с классом .result или .select-box, который содержит выбранное значение
    const resultSelectors = [
      '.result',
      '[class*="result"]',
      '.select-box',
      '[class*="select-box"]',
      '[id*="result"]',
      '[id*="value"]'
    ];
    
    for (const selector of resultSelectors) {
      const resultElement = appSelect.querySelector(selector);
      if (resultElement) {
        // Пробуем разные способы получения текста
        let text = resultElement.textContent?.trim() || 
                   resultElement.innerText?.trim() || 
                   resultElement.getAttribute('aria-label') ||
                   resultElement.getAttribute('title') ||
                   '';
        
        // Исключаем плейсхолдеры
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
        const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
        if (text && !isPlaceholder && text.length > 0) {
          return text;
        }
      }
    }
    
    // Ищем элемент с атрибутом value
    const valueElement = appSelect.querySelector('[value]:not([value=""])');
    if (valueElement && valueElement.value) {
      return valueElement.value;
    }
    
    // Ищем через data-value
    const dataValueElement = appSelect.querySelector('[data-value]');
    if (dataValueElement && dataValueElement.dataset.value) {
      return dataValueElement.dataset.value;
    }
    
    // Ищем через ng-reflect-value (Angular)
    const ngValueElement = appSelect.querySelector('[ng-reflect-value]');
    if (ngValueElement && ngValueElement.getAttribute('ng-reflect-value')) {
      return ngValueElement.getAttribute('ng-reflect-value');
    }
    
    // Ищем в дочерних элементах с текстом
    const allChildren = Array.from(appSelect.querySelectorAll('*'));
    for (const child of allChildren) {
      const text = child.textContent?.trim() || child.innerText?.trim() || '';
      const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
      const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
      if (text && !isPlaceholder && text.length > 0 && text.length < 100) {
        // Проверяем, что это не плейсхолдер и текст не слишком длинный
        return text;
      }
    }
    
    return '';
  }

  /**
   * Возвращает текущее значение поля (input, select, кастомный dropdown) для проверки заполнения.
   * @param {Element} element - DOM-элемент
   * @param {{ isDropdown?: boolean }} [options]
   * @returns {string}
   */
  getFieldCurrentValue(element, options = {}) {
    if (!element) return '';
    const tagName = element.tagName?.toLowerCase() || '';
    if (tagName === 'select') {
      const opt = element.options[element.selectedIndex];
      return (opt && (opt.textContent?.trim() || opt.value)) || element.value || '';
    }
    if (tagName === 'input' || tagName === 'textarea') {
      return (element.value || '').trim();
    }
    if (options.isDropdown !== false && this.isDropdownElement(element)) {
      return this.getSelectedDropdownValue(element) || '';
    }
    if (element.value !== undefined && element.value != null) {
      return String(element.value).trim();
    }
    const text = element.textContent?.trim() || element.innerText?.trim() || '';
    return text;
  }

  /**
   * Проверяет, что поле заполнено ожидаемым значением после ввода/выбора.
   * @param {Element} element - DOM-элемент
   * @param {string} expectedValue - ожидаемое значение (уже обработанное переменными)
   * @param {{ actionType?: string, strict?: boolean }} [options] - strict: только точное совпадение
   * @returns {boolean}
   */
  verifyFieldFilled(element, expectedValue, options = {}) {
    if (!element) return false;
    const expected = (expectedValue != null ? String(expectedValue) : '').trim();
    if (expected === '') return true; // пустое значение считаем успехом
    const current = this.getFieldCurrentValue(element, { isDropdown: true });
    const cur = current.trim();
    const exp = expected.trim();
    if (options.strict) {
      return cur === exp;
    }
    return cur === exp ||
      cur.toLowerCase().includes(exp.toLowerCase()) ||
      exp.toLowerCase().includes(cur.toLowerCase());
  }

  /**
   * Собирает список альтернативных селекторов для повторной попытки заполнения (userSelectors + alternatives).
   * @param {Object} action - действие с selector
   * @returns {Array<Object>} массив объектов селекторов
   */
  getAlternativesForFillRetry(action) {
    const list = [];
    const primarySelector = action?.selector?.selector || action?.selector?.value;
    const userSelectors = this.getUserSelectors(action) || [];
    for (const u of userSelectors) {
      if (!u?.selector) continue;
      if (u.selector === primarySelector) continue;
      list.push(u);
    }
    const alts = action?.selector?.alternatives;
    if (Array.isArray(alts)) {
      for (const alt of alts) {
        if (alt?.selector === primarySelector) continue;
        list.push(alt);
      }
    }
    return list;
  }

  /**
   * Если поле не заполнилось — повторяет заполнение по альтернативным селекторам; при неудаче выбрасывает ошибку ().
   * @param {Object} action - действие (selector будет временно подменяться)
   * @param {string} processedValue - обработанное значение
   * @param {'input'|'change'} actionType
   * @param {Element} currentElement - элемент, по которому уже выполняли заполнение (для проверки)
   * @throws {Error} если ни основной, ни альтернативные селекторы не привели к заполнению
   */
  async retryFillWithAlternativesOrThrow(action, processedValue, actionType, currentElement) {
    const verify = (el) => el && this.verifyFieldFilled(el, processedValue, { actionType });
    if (verify(currentElement)) {
      return;
    }
    const alternatives = this.getAlternativesForFillRetry(action);
    if (alternatives.length === 0) {
      const msg = `Поле не заполнено ожидаемым значением "${processedValue}" (${actionType}), альтернативных селекторов нет`;
      console.warn('⚠️', msg);
      throw new Error(msg);
    }
    const originalSelector = action.selector;
    let filled = false;
    this._fillRetryInProgress = true;
    try {
      for (const alt of alternatives) {
        try {
          action.selector = alt;
          if (actionType === 'input') {
            await this.handleInput(action);
          } else {
            await this.handleChange(action);
          }
          const el = this.selectorEngine.findElementSync(alt);
          if (verify(el)) {
            console.log('✅ Поле заполнено после повтора по альтернативному селектору:', alt?.selector || alt);
            action.selector = alt; // сохраняем сработавший селектор как основной на будущее
            filled = true;
            return;
          }
        } catch (e) {
          console.warn('⚠️ Повтор по альтернативному селектору не удался:', alt?.selector, e.message);
        } finally {
          if (!filled) action.selector = originalSelector;
        }
      }
    } finally {
      this._fillRetryInProgress = false;
      if (!filled) action.selector = originalSelector;
    }
    const msg = `Поле не заполнено значением "${processedValue}" после всех попыток (основной + ${alternatives.length} альтернатив)`;
    console.error('❌', msg);
    throw new Error(msg);
  }

  async handleChange(action) {
    const selectorInfo = action.selector?.selector || action.selector?.value || JSON.stringify(action.selector);
    
    // Обрабатываем переменные в значении
    const processedValue = await this.processVariables(action.value);
    console.log('🔄 Выполняю изменение:', processedValue, 'в', selectorInfo);
    if (processedValue !== action.value) {
      console.log(`   📝 Исходное значение: "${action.value}" → Обработанное: "${processedValue}"`);
    }
    
    // Пробуем найти элемент с несколькими попытками
    const findResult = await this.findElementWithRetry(action.selector, 3);
    let element = findResult?.element; // Всегда извлекаем element из результата
    const usedSelector = findResult?.usedSelector || this.formatSelector(action.selector);
    
    if (this.currentSelectorCallback) {
      this.currentSelectorCallback(usedSelector);
    }
    
    if (!element) {
      // Пробуем альтернативные селекторы; ошибку логируем только если и они не сработали
      element = await this.tryAlternativeSelectors(action);
      if (!element) {
        const errorMsg = `Элемент не найден: ${selectorInfo}`;
        console.error('❌ Элемент не найден после всех попыток (включая запасные селекторы):', selectorInfo);
        throw new Error(errorMsg);
      }
      console.log('✅ Элемент найден по запасному селектору');
    } else {
      console.log('✅ Элемент найден');
    }

    // Умные ожидания по типу элемента
    try {
      if (typeof this.waitForElementReady === 'function') {
        await this.waitForElementReady(element, 'change');
      } else if (this.smartWaiter) {
        await this.smartWaiter.waitForElementReady(element, { visible: true, timeout: 2000 });
      } else {
        await this.delay(150);
      }
    } catch (waitError) {
      throw waitError;
    }
    
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(500);
    } else {
      console.warn('⚠️ Элемент не является DOM-элементом или scrollIntoView недоступен');
      await this.delay(300);
    }

    this.highlightElement(element, '#9C27B0');
    await this.delay(300);

    const tagName = element.tagName?.toLowerCase() || '';
    
    // Проверяем, является ли это стандартным SELECT элементом
    let branch = 'other';
    if (tagName === 'select') {
      branch = 'select';
      console.log(`📝 Устанавливаю значение в SELECT: "${processedValue}"`);
      
      // #22: Приоритет поиска опции:
      // 1. По тексту опции (selectedOptionText из recorder)
      // 2. По значению (value)
      // 3. По тексту (processedValue)
      let foundOption = null;
      
      // Сначала пробуем найти по selectedOptionText (если записано с текстом опции)
      if (action.selectedOptionText) {
        foundOption = Array.from(element.options).find(opt => 
          opt.textContent?.trim() === action.selectedOptionText ||
          opt.label?.trim() === action.selectedOptionText
        );
        if (foundOption) {
          console.log(`✅ Найдена опция по selectedOptionText: "${action.selectedOptionText}"`);
        }
      }
      
      // Если не нашли, пробуем по значению
      if (!foundOption) {
        foundOption = Array.from(element.options).find(opt => opt.value === processedValue);
        if (foundOption) {
          console.log(`✅ Найдена опция по value: "${processedValue}"`);
        }
      }
      
      // Если не нашли, пробуем по тексту
      if (!foundOption) {
        foundOption = Array.from(element.options).find(opt => 
          opt.textContent?.trim() === processedValue ||
          opt.textContent?.toLowerCase().includes(processedValue.toLowerCase()) ||
          opt.label?.trim() === processedValue
        );
        if (foundOption) {
          console.log(`✅ Найдена опция по тексту: "${processedValue}"`);
        }
      }
      
      if (foundOption) {
        element.value = foundOption.value;
      } else {
        console.warn(`⚠️ Опция "${processedValue}" не найдена в SELECT, устанавливаю значение напрямую`);
        element.value = processedValue;
      }
      
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (tagName === 'input' || tagName === 'textarea') {
      branch = 'input_or_textarea';
      // Проверяем, является ли это файловым input
      const inputType = element.type?.toLowerCase() || '';
      if (inputType === 'file') {
        // Пытаемся использовать сохраненный файл из настроек
        const fileSet = await this.setFileToInput(element, processedValue);
        if (fileSet) {
          console.log('✅ Файл успешно установлен в input');
          return;
        }
        
        // Если файл не найден, предупреждаем
        console.warn('⚠️ Файл не найден в настройках или невозможно установить программно');
        console.warn(`   📁 Ожидаемый файл: ${processedValue}`);
        console.warn('   💡 Загрузите файл в настройках плагина или выполните действие вручную');
        // Не выбрасываем ошибку, просто пропускаем это действие
        return;
      }
      
      // Обычное текстовое поле - просто устанавливаем значение
      console.log(`📝 Устанавливаю значение в текстовое поле (${tagName}): "${processedValue}"`);
      
      element.focus();
      element.value = '';
      element.value = processedValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Для Angular/React приложений
      if (element.dispatchEvent) {
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } else {
      branch = 'custom_or_generic';
      // Пробуем обработать как кастомный dropdown только если это не текстовое поле
      const valueForDropdown = processedValue == null || String(processedValue).trim() === '' || String(processedValue).trim().toLowerCase() === 'undefined'
        ? null
        : processedValue;
      if (valueForDropdown == null) {
        console.warn('⚠️ CHANGE для кастомного элемента без значения (undefined/пусто), пропускаю шаг');
        await this.delay(300);
        return;
      }
      console.log(`📝 Пробую установить значение в кастомный элемент (${tagName}): "${valueForDropdown}"`);
      
      // Проверяем, является ли это dropdown элементом
      const isDropdown = this.isDropdownElement(element);
      
      if (isDropdown) {
        const handled = await this.handleCustomDropdown(element, valueForDropdown);
        
        if (!handled) {
          // Fallback: пробуем стандартный способ
          if (element.value !== undefined) {
            element.value = valueForDropdown;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            console.warn('⚠️ Не удалось установить значение для кастомного элемента, пробую клик по опции');
            // Последняя попытка: ищем любой элемент с нужным текстом и кликаем
            const allElements = Array.from(document.querySelectorAll('*'));
            const valStr = String(valueForDropdown);
            const matchingElement = allElements.find(el => 
              el.textContent?.trim() === valStr ||
              el.textContent?.toLowerCase().includes(valStr.toLowerCase())
            );
            if (matchingElement) {
              matchingElement.click();
              await this.delay(300);
            }
          }
        }
      } else {
        // Не dropdown и не текстовое поле - пробуем установить значение напрямую
        console.log(`📝 Пробую установить значение напрямую в элемент ${tagName}`);
        if (element.value !== undefined) {
          element.value = valueForDropdown;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          console.warn(`⚠️ Не удалось установить значение для элемента ${tagName}`);
        }
      }
    }
    
    await this.delay(500);
    if (!this._fillRetryInProgress && !this.verifyFieldFilled(element, processedValue)) {
      await this.retryFillWithAlternativesOrThrow(action, processedValue, 'change', element);
    }
  }

  async setFileToInput(inputElement, fileNameOrId) {
    try {
      // Получаем настройки из chrome.storage
      const result = await chrome.storage.local.get('pluginSettings');
      const settings = result.pluginSettings;
      
      if (!settings || !settings.files || !settings.files.uploaded || settings.files.uploaded.length === 0) {
        console.warn('⚠️ Нет загруженных файлов в настройках');
        return false;
      }

      // Ищем файл по имени или ID
      // Сначала пробуем точное совпадение, затем частичное
      let fileData = settings.files.uploaded.find(f => 
        f.name === fileNameOrId || 
        f.id.toString() === fileNameOrId.toString()
      );
      
      // Если не нашли точное совпадение, ищем по частичному совпадению имени
      if (!fileData) {
        const fileNameLower = fileNameOrId.toLowerCase();
        fileData = settings.files.uploaded.find(f => 
          f.name.toLowerCase() === fileNameLower ||
          f.name.toLowerCase().includes(fileNameLower) ||
          fileNameLower.includes(f.name.toLowerCase())
        );
      }

      if (!fileData) {
        console.warn(`⚠️ Файл "${fileNameOrId}" не найден в настройках`);
        return false;
      }

      // Конвертируем base64 обратно в File
      const byteCharacters = atob(fileData.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], fileData.name, { type: fileData.type || 'application/octet-stream' });

      // Используем DataTransfer API для установки файла
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Устанавливаем files в input
      inputElement.files = dataTransfer.files;

      // Диспатчим события для уведомления приложения
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));

      console.log(`✅ Файл "${fileData.name}" успешно установлен в input`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка при установке файла:', error);
      return false;
    }
  }

  async handleScroll(action) {
    const subtype = action.subtype || '';
    if (subtype === 'scroll-top') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      await this.delay(500);
      return;
    }
    if (subtype === 'scroll-bottom') {
      window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior: 'smooth' });
      await this.delay(500);
      return;
    }
    if (subtype === 'scroll-element') {
      if (!action.selector) {
        throw new Error('Для scroll-element требуется селектор');
      }
      const findResult = await this.findElementWithRetry(action.selector, 3, 250);
      const element = findResult?.element;
      if (!element) {
        throw new Error(`Элемент не найден для scroll-element: ${this.formatSelector(action.selector)}`);
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(500);
      return;
    }

    // #24: Улучшенная логика прокрутки с fallback
    // Приоритет: selector > position (т.к. position может устареть при изменении размера окна)
    
    if (action.selector) {
      console.log(`📜 Прокрутка к элементу по селектору (приоритет)`);
      const findResult = await this.findElementWithRetry(action.selector, 3, 250);
      const element = findResult?.element;
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.delay(500);
        console.log('✅ Прокрутка выполнена к элементу');
        return;
      }
      console.warn(`⚠️ Элемент не найден по селектору, пробую fallback на position`);
    }
    
    if (action.position) {
      console.log(`📜 Прокрутка к позиции: X=${action.position.x}, Y=${action.position.y}`);
      
      // Проверяем, что позиция валидна (в пределах документа)
      const maxScrollY = document.body.scrollHeight - window.innerHeight;
      const maxScrollX = document.body.scrollWidth - window.innerWidth;
      
      const targetY = Math.min(action.position.y, maxScrollY);
      const targetX = Math.min(action.position.x, maxScrollX);
      
      if (action.position.y > maxScrollY + 100 || action.position.x > maxScrollX + 100) {
        console.warn(`⚠️ Позиция прокрутки может быть устаревшей: ` +
          `запрошено Y=${action.position.y}, макс.Y=${maxScrollY}`);
      }
      
      window.scrollTo({
        top: targetY,
        left: targetX,
        behavior: 'smooth'
      });
      await this.delay(800);
      
      // Проверяем, что прокрутка сработала
      const actualY = window.scrollY;
      if (Math.abs(actualY - targetY) > 50) {
        console.warn(`⚠️ Прокрутка могла не сработать: целевой Y=${targetY}, фактический Y=${actualY}`);
      } else {
        console.log('✅ Прокрутка выполнена');
      }
    } else if (!action.selector) {
      // Нет ни селектора, ни позиции
      console.warn('⚠️ Scroll действие без селектора и позиции, пропускаю');
    }
  }

  /**
   * Находит задержку перед указанным шагом
   */
  findDelayBeforeStep(actions, currentIndex) {
    if (currentIndex === 0) return null;
    const prevAction = actions[currentIndex - 1];
    if (prevAction && prevAction.type === 'wait') {
      return prevAction;
    }
    return null;
  }

  /**
   * Находит задержку после указанного шага
   */
  findDelayAfterStep(actions, currentIndex) {
    if (currentIndex >= actions.length - 1) return null;
    const nextAction = actions[currentIndex + 1];
    if (nextAction && nextAction.type === 'wait') {
      return nextAction;
    }
    return null;
  }

  async handleKeyboard(action) {
    const keyCombination = action.keyCombination || action.key || 'Unknown';
    const isGlobal = action.isGlobal !== false; // По умолчанию глобальное, если не указано
    
    console.log(`⌨️ Выполняю нажатие клавиши: ${keyCombination} (${isGlobal ? 'глобально' : 'на элементе'})`);
    
    let targetElement = null;
    
    // Если не глобальное действие, находим элемент
    if (!isGlobal && action.selector) {
      const findResult = await this.findElementWithRetry(action.selector, 3);
      targetElement = findResult?.element; // Всегда извлекаем element из результата
      
      if (!targetElement) {
        console.warn(`⚠️ Элемент не найден для нажатия клавиши, применяю глобально`);
        targetElement = document.body;
      } else {
        // Фокусируемся на элементе перед нажатием клавиши
        targetElement.focus();
        await this.delay(100);
      }
    } else {
      // Глобальное действие - применяем к document или body
      targetElement = document.activeElement || document.body;
    }
    
    // #23: Правильная последовательность событий для комбинаций клавиш
    // Реальный пользователь нажимает: Ctrl↓ → S↓ → S↑ → Ctrl↑
    // а не все события одновременно с модификаторами
    
    const modifiers = action.modifiers || {};
    const hasModifiers = modifiers.ctrl || modifiers.meta || modifiers.alt || modifiers.shift;
    
    // Вспомогательная функция для создания события клавиши
    const createKeyEvent = (eventType, key, code, keyCode, modifierState) => {
      return new KeyboardEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        key: key,
        code: code || key,
        keyCode: keyCode,
        which: keyCode,
        ctrlKey: modifierState.ctrl || false,
        metaKey: modifierState.meta || false,
        altKey: modifierState.alt || false,
        shiftKey: modifierState.shift || false
      });
    };
    
    // Маппинг названий клавиш-модификаторов
    const modifierKeys = {
      ctrl: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
      meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
      alt: { key: 'Alt', code: 'AltLeft', keyCode: 18 },
      shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }
    };
    
    try {
      if (hasModifiers) {
        // Последовательность для комбинации клавиш (например, Ctrl+S)
        const activeModifiers = { ctrl: false, meta: false, alt: false, shift: false };
        
        // 1. Нажимаем модификаторы
        if (modifiers.ctrl) {
          const modKey = modifierKeys.ctrl;
          targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          activeModifiers.ctrl = true;
          await this.delay(30);
        }
        if (modifiers.meta) {
          const modKey = modifierKeys.meta;
          targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          activeModifiers.meta = true;
          await this.delay(30);
        }
        if (modifiers.alt) {
          const modKey = modifierKeys.alt;
          targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          activeModifiers.alt = true;
          await this.delay(30);
        }
        if (modifiers.shift) {
          const modKey = modifierKeys.shift;
          targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          activeModifiers.shift = true;
          await this.delay(30);
        }
        
        // 2. Нажимаем основную клавишу
        const mainKeyCode = this.getKeyCode(action.key);
        targetElement.dispatchEvent(createKeyEvent('keydown', action.key, action.code || action.key, mainKeyCode, activeModifiers));
        
        // keypress для символьных клавиш
        if (action.key && action.key.length === 1) {
          targetElement.dispatchEvent(createKeyEvent('keypress', action.key, action.code || action.key, mainKeyCode, activeModifiers));
        }
        
        await this.delay(50);
        
        // 3. Отпускаем основную клавишу
        targetElement.dispatchEvent(createKeyEvent('keyup', action.key, action.code || action.key, mainKeyCode, activeModifiers));
        
        await this.delay(30);
        
        // 4. Отпускаем модификаторы в обратном порядке
        if (modifiers.shift) {
          activeModifiers.shift = false;
          const modKey = modifierKeys.shift;
          targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          await this.delay(30);
        }
        if (modifiers.alt) {
          activeModifiers.alt = false;
          const modKey = modifierKeys.alt;
          targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          await this.delay(30);
        }
        if (modifiers.meta) {
          activeModifiers.meta = false;
          const modKey = modifierKeys.meta;
          targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
          await this.delay(30);
        }
        if (modifiers.ctrl) {
          activeModifiers.ctrl = false;
          const modKey = modifierKeys.ctrl;
          targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        }
        
        console.log(`✅ Комбинация клавиш ${keyCombination} выполнена с правильной последовательностью событий`);
      } else {
        // Простое нажатие без модификаторов
        const eventOptions = {
          bubbles: true,
          cancelable: true,
          view: window,
          key: action.key,
          code: action.code || action.key,
          keyCode: this.getKeyCode(action.key),
          which: this.getKeyCode(action.key)
        };
        
        // Создаем и отправляем событие keydown
        const keydownEvent = new KeyboardEvent('keydown', eventOptions);
        targetElement.dispatchEvent(keydownEvent);
        
        // Также отправляем keypress для некоторых клавиш
        if (action.key && action.key.length === 1) {
          const keypressEvent = new KeyboardEvent('keypress', eventOptions);
          targetElement.dispatchEvent(keypressEvent);
        }
        
        // Отправляем keyup
        await this.delay(50);
        const keyupEvent = new KeyboardEvent('keyup', eventOptions);
        targetElement.dispatchEvent(keyupEvent);
        
        console.log(`✅ Нажатие клавиши ${keyCombination} выполнено`);
      }
      
      await this.delay(200);
    } catch (error) {
      console.error(`❌ Ошибка при нажатии клавиши: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получает keyCode для клавиши
   */
  getKeyCode(key) {
    const keyMap = {
      'Enter': 13,
      'Escape': 27,
      'Tab': 9,
      'Backspace': 8,
      'Delete': 46,
      'ArrowUp': 38,
      'ArrowDown': 40,
      'ArrowLeft': 37,
      'ArrowRight': 39,
      'Home': 36,
      'End': 35,
      'PageUp': 33,
      'PageDown': 34,
      'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115,
      'F5': 116, 'F6': 117, 'F7': 118, 'F8': 119,
      'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123
    };
    
    return keyMap[key] || (key && key.length === 1 ? key.charCodeAt(0) : 0);
  }

  async handleWait(action) {
    const subtype = action.subtype || '';
    const timeoutRaw = action.maxTimeout ?? action.delay ?? action.value ?? 1000;
    const timeoutMs = Math.max(100, parseInt(timeoutRaw, 10) || 1000);

    if (!subtype) {
      const delaySeconds = (timeoutMs / 1000).toFixed(1);
      console.log(`⏱️ Задержка: ${timeoutMs} мс (${delaySeconds} сек)`);
      await this.delay(timeoutMs);
      console.log(`✅ Задержка завершена (${delaySeconds} сек)`);
      return;
    }

    if (!action.selector && subtype !== 'wait-until') {
      throw new Error(`Для ${subtype} требуется селектор`);
    }

    switch (subtype) {
      case 'wait-enabled':
        await this.waitForCondition(async () => {
          const findResult = await this.findElementWithRetry(action.selector, 1, 50);
          const element = findResult?.element;
          if (!element) return false;
          return !(element.disabled || element.getAttribute('aria-disabled') === 'true');
        }, timeoutMs, 150, `enabled ${this.formatSelector(action.selector)}`);
        break;

      case 'wait-value': {
        const expectedValue = await this.processVariables(String(action.expectedValue || '').trim());
        if (!expectedValue) throw new Error('Для wait-value не задан expectedValue');
        await this.waitForCondition(async () => {
          const findResult = await this.findElementWithRetry(action.selector, 1, 50);
          const element = findResult?.element;
          if (!element) return false;
          const actual = String(element.value || element.textContent || '').trim();
          return actual === expectedValue;
        }, timeoutMs, 150, `value "${expectedValue}"`);
        break;
      }

      case 'wait-option': {
        const optionText = await this.processVariables(String(action.optionText || '').trim());
        if (!optionText) throw new Error('Для wait-option не задан optionText');
        await this.waitForCondition(async () => {
          const findResult = await this.findElementWithRetry(action.selector, 1, 50);
          const element = findResult?.element;
          if (!element) return false;
          return String(element.textContent || '').includes(optionText);
        }, timeoutMs, 150, `option "${optionText}"`);
        break;
      }

      case 'wait-options-count': {
        const expectedCount = parseInt(action.expectedCount, 10);
        if (!Number.isFinite(expectedCount) || expectedCount < 0) {
          throw new Error('Для wait-options-count не задан expectedCount');
        }
        await this.waitForCondition(async () => {
          const count = this.countMatchingElements(action.selector);
          return count >= expectedCount;
        }, timeoutMs, 150, `options count >= ${expectedCount}`);
        break;
      }

      case 'wait-until': {
        const expression = String(action.condition || '').trim();
        if (!expression) throw new Error('Для wait-until не задано условие');
        await this.waitForCondition(async () => {
          const processedExpression = await this.processVariables(expression);
          try {
            return Boolean(Function(`return (${processedExpression});`)());
          } catch (e) {
            return false;
          }
        }, timeoutMs, 200, `condition "${expression}"`);
        break;
      }

      default:
        throw new Error(`Неподдерживаемый wait subtype: ${subtype}`);
    }

    console.log(`✅ Ожидание ${subtype} выполнено (${timeoutMs} мс)`);
  }

  async navigateToUrl(url, actionIndexInOriginalArray) {
    const currentNorm = this._normalizeUrlForSamePage(window.location.href);
    const targetNorm = this._normalizeUrlForSamePage(url);
    if (!url || (currentNorm && targetNorm && currentNorm === targetNorm)) {
      return; // Уже на этой странице — ничего не делаем
    }

    console.log(`🌐 Навигация на страницу: ${url}`);
    console.log(`📊 Текущий индекс действия: ${actionIndexInOriginalArray}`);

    this.previousUrl = window.location.href;

    try {
      const beforeNavigationScreenshot = await this.takeScreenshot();
      if (beforeNavigationScreenshot) {
        const stepIndex = actionIndexInOriginalArray !== undefined ? actionIndexInOriginalArray : this.currentActionIndex;
        this.screenshots.push({
          stepIndex: stepIndex,
          actionIndex: stepIndex,
          type: 'before-navigation',
          screenshot: beforeNavigationScreenshot,
          timestamp: Date.now(),
          url: window.location.href
        });
        const realStepNumber = stepIndex + 1;
        await this.saveScreenshotToFile(beforeNavigationScreenshot, realStepNumber, 'before-navigation');
      }
    } catch (error) {
      console.warn('⚠️ Не удалось сделать скриншот ДО навигации:', error);
    }

    const nextActionIndex = actionIndexInOriginalArray !== undefined
      ? actionIndexInOriginalArray + 1
      : this.currentActionIndex + 1;

    // До location.replace страница выгружается, и финальный TEST_STEP_COMPLETED из executeActions может не успеть уйти.
    // Поэтому подтверждаем завершение шага навигации заранее.
    const navStep = (actionIndexInOriginalArray !== undefined ? actionIndexInOriginalArray : this.currentActionIndex) + 1;
    const navTotal = this.getRuntimeActions(this.currentTest?.actions || []).length;
    try {
      chrome.runtime.sendMessage({
        type: 'TEST_STEP_COMPLETED',
        testId: this.currentTest?.id,
        step: navStep,
        total: navTotal,
        success: true,
        error: null,
        duration: 0
      }).catch(() => {});
    } catch (e) { /* ignore */ }

    this.navigationInitiatedByPlayer = true;
    await this.savePlaybackState(url, nextActionIndex);

    try {
      window.location.replace(url);
    } catch (e) {
      console.warn('⚠️ window.location.replace не сработал, использую window.location.href:', e);
      window.location.href = url;
    }
  }

  async savePlaybackState(nextUrl, nextActionIndex) {
    if (this.isPlaying && this.currentTest) {
      console.log('💾 Сохраняю состояние воспроизведения:', {
        testId: this.currentTest.id,
        testName: this.currentTest.name,
        actionIndex: nextActionIndex,
        nextUrl: nextUrl,
        isPlaying: this.isPlaying,
        hasTest: !!this.currentTest
      });
      
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_PLAYBACK_STATE',
          test: this.currentTest,
          actionIndex: nextActionIndex,
            nextUrl: nextUrl,
            runMode: this.playMode
        });
        
        if (response && response.success) {
          console.log('✅ Состояние воспроизведения успешно сохранено в background script');
        } else {
          console.error('❌ Ошибка при сохранении состояния:', response?.error || 'Unknown error');
        }
      } catch (error) {
        console.error('❌ Ошибка при отправке сообщения для сохранения состояния:', error);
        // Пробуем еще раз через небольшую задержку
        try {
          await this.delay(100);
          const retryResponse = await chrome.runtime.sendMessage({
            type: 'SAVE_PLAYBACK_STATE',
            test: this.currentTest,
            actionIndex: nextActionIndex,
            nextUrl: nextUrl,
            runMode: this.playMode
          });
          if (retryResponse && retryResponse.success) {
            console.log('✅ Состояние воспроизведения успешно сохранено после повтора');
          }
        } catch (retryError) {
          console.error('❌ Ошибка при повторной попытке сохранения:', retryError);
        }
      }
    } else {
      console.warn('⚠️ Не могу сохранить состояние: isPlaying =', this.isPlaying, ', hasTest =', !!this.currentTest);
    }
  }

  async resumePlayback(test, startActionIndex, mode = 'optimized') {
    if (this.isPlaying) {
      console.warn('Тест уже воспроизводится');
      return;
    }

    this.isPlaying = true;
    this.currentTest = test;
    const recordingIndicator = document.getElementById('autotest-recording-indicator');
    if (recordingIndicator) recordingIndicator.remove();
    this.playMode = mode || 'optimized';
    this.lastKnownUrl = window.location.href;

    // Инициализируем переменные из теста
    this.userVariables = {};
    if (test.variables) {
      console.log(`📦 [Variables] Инициализация переменных из теста (resumePlayback). Всего переменных в test.variables: ${Object.keys(test.variables).length}`);
      for (const [varName, varData] of Object.entries(test.variables)) {
        if (varData && typeof varData === 'object' && varData.value !== undefined && varData.value !== null) {
          this.userVariables[varName] = varData.value;
          const displayValue = String(varData.value);
          const isSensitive = varData.sensitive;
          console.log(`📦 [Variables] Загружена переменная "${varName}" = "${isSensitive ? '••••••••' : displayValue.substring(0, 20) + (displayValue.length > 20 ? '...' : '')}"`);
        } else if (varData !== undefined && varData !== null && typeof varData !== 'object') {
          // Если переменная сохранена в старом формате (просто значение)
          this.userVariables[varName] = varData;
          console.log(`📦 [Variables] Загружена переменная "${varName}" (старый формат) = "${String(varData).substring(0, 20)}${String(varData).length > 20 ? '...' : ''}"`);
        } else {
          console.warn(`⚠️ [Variables] Переменная "${varName}" пропущена (нет значения):`, varData);
        }
      }
      console.log(`📦 [Variables] Загружено ${Object.keys(this.userVariables).length} переменных из теста`);
      console.log(`📦 [Variables] Список переменных: ${Object.keys(this.userVariables).join(', ')}`);
    } else {
      // Это нормальная ситуация - не все тесты имеют переменные
      console.log(`ℹ️ [Variables] test.variables отсутствует или пуст (это нормально, если тест не использует переменные)`);
    }

    // Очищаем старые скриншоты для экономии памяти
    this.screenshots = [];
    console.log('🧹 Очищены старые скриншоты перед восстановлением воспроизведения');

    // Инициализируем историю прогона, если её еще нет
    // При восстановлении пытаемся загрузить существующую историю из предыдущего прогона
    if (!this.runHistory) {
      const normalizedTestId = String(test.id);
      
      // Пытаемся загрузить последний незавершенный прогон из истории
      try {
        const historyResponse = await chrome.runtime.sendMessage({
          type: 'GET_TEST_HISTORY',
          testId: normalizedTestId
        });
        
        if (historyResponse && historyResponse.success && historyResponse.history && historyResponse.history.length > 0) {
          // Ищем последний незавершенный прогон (success === false или отсутствует)
          const incompleteRuns = historyResponse.history.filter(run => 
            run.testId === normalizedTestId && 
            (!run.success || run.success === false) &&
            run.startTime
          );
          
          if (incompleteRuns.length > 0) {
            // Берем последний незавершенный прогон
            const lastIncompleteRun = incompleteRuns[incompleteRuns.length - 1];
            this.runHistory = {
              ...lastIncompleteRun,
              // Обновляем время начала, если нужно
              startTime: lastIncompleteRun.startTime || new Date().toISOString(),
              runId: lastIncompleteRun.runId || new Date(lastIncompleteRun.startTime || Date.now()).getTime()
            };
            console.log(`💾 [History] Загружена существующая история из предыдущего прогона: ${this.runHistory.steps?.length || 0} шагов`);
            console.log(`   Начало прогона: ${this.runHistory.startTime}`);
            console.log(`   Шаги в истории: ${this.runHistory.steps?.map(s => s.stepNumber).join(', ') || 'нет'}`);
            
            // Восстанавливаем скриншоты из предыдущего прогона в массив this.screenshots
            if (this.runHistory.steps && this.runHistory.steps.length > 0) {
              let restoredScreenshotsCount = 0;
              this.runHistory.steps.forEach((step, stepIndex) => {
                if (step.beforeScreenshot) {
                  this.screenshots.push({
                    stepIndex: step.stepNumber - 1,
                    actionIndex: step.stepNumber - 1,
                    type: 'before',
                    screenshot: step.beforeScreenshot,
                    timestamp: Date.now()
                  });
                  restoredScreenshotsCount++;
                }
                if (step.afterScreenshot) {
                  this.screenshots.push({
                    stepIndex: step.stepNumber - 1,
                    actionIndex: step.stepNumber - 1,
                    type: 'after',
                    screenshot: step.afterScreenshot,
                    timestamp: Date.now()
                  });
                  restoredScreenshotsCount++;
                }
                if (step.screenshot) {
                  this.screenshots.push({
                    stepIndex: step.stepNumber - 1,
                    actionIndex: step.stepNumber - 1,
                    type: 'error',
                    screenshot: step.screenshot,
                    timestamp: Date.now()
                  });
                  restoredScreenshotsCount++;
                }
              });
              if (restoredScreenshotsCount > 0) {
                console.log(`📸 [History] Восстановлено ${restoredScreenshotsCount} скриншотов из предыдущего прогона`);
              }
            }
          } else {
            // Создаем новую историю
            const startTime = Date.now();
            this.runHistory = {
              testId: normalizedTestId,
              testName: test.name,
              startTime: new Date(startTime).toISOString(),
              runId: startTime,
              mode: this.playMode,
              steps: [],
              success: false,
              error: null,
              totalDuration: 0,
              transcript: []
            };
            console.log('💾 [History] runHistory создан при восстановлении воспроизведения (новый прогон)');
          }
        } else {
          // Создаем новую историю
          const startTime = Date.now();
          this.runHistory = {
            testId: normalizedTestId,
            testName: test.name,
            startTime: new Date(startTime).toISOString(),
            runId: startTime,
            mode: this.playMode,
            steps: [],
            success: false,
            error: null,
            totalDuration: 0,
            transcript: []
          };
          console.log('💾 [History] runHistory создан при восстановлении воспроизведения (история пуста)');
        }
      } catch (error) {
        console.warn('⚠️ [History] Ошибка при загрузке существующей истории, создаю новую:', error);
        // Создаем новую историю при ошибке
        const startTime = Date.now();
        this.runHistory = {
          testId: normalizedTestId,
          testName: test.name,
          startTime: new Date(startTime).toISOString(),
          runId: startTime,
          mode: this.playMode,
          steps: [],
          success: false,
          error: null,
          totalDuration: 0,
          transcript: []
        };
        console.log('💾 [History] runHistory создан при восстановлении воспроизведения (после ошибки)');
      }
    } else {
      console.log('💾 [History] runHistory уже существует, продолжаю использовать его');
    }

    this.addPlayingIndicator();
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`▶️ ВОССТАНОВЛЕНИЕ ВОСПРОИЗВЕДЕНИЯ ТЕСТА: ${test.name}`);
    console.log(`📊 Продолжаю с действия ${startActionIndex + 1} из ${test.actions?.length || 0}`);
    console.log(`🌐 Текущая страница: ${window.location.href}`);
    console.log(`${'='.repeat(50)}\n`);

    try {
      // Ждем полной загрузки страницы и инициализации фреймворков
      console.log('⏳ Ожидаю загрузки страницы и инициализации приложения...');
      await this.waitForPageLoad();
      console.log('✅ Страница загружена, ищу правильную точку начала...');
      
      // Делаем скриншот ПОСЛЕ навигации (после загрузки новой страницы)
      // Проверяем, была ли навигация (если есть скриншот "до навигации")
      const beforeNavScreenshot = this.screenshots.find(s => s.type === 'before-navigation');
      if (beforeNavScreenshot) {
        try {
          const afterNavigationScreenshot = await this.takeScreenshot();
          if (afterNavigationScreenshot) {
            const stepIndex = beforeNavScreenshot.stepIndex;
            this.screenshots.push({
              stepIndex: stepIndex,
              actionIndex: stepIndex,
              type: 'after-navigation',
              screenshot: afterNavigationScreenshot,
              timestamp: Date.now(),
              url: window.location.href
            });
            console.log(`📸 Скриншот ПОСЛЕ навигации сохранен (URL: ${window.location.href})`);
            
            // Сохраняем скриншот в файл
            const realStepNumber = stepIndex + 1;
            const filePath = await this.saveScreenshotToFile(afterNavigationScreenshot, realStepNumber, 'after-navigation');
            if (filePath) {
              console.log(`💾 Скриншот ПОСЛЕ навигации сохранен в файл: ${filePath}`);
            }
            
            // Обновляем историю шага навигации, если она существует
            if (this.runHistory && this.runHistory.steps) {
              const navigationStep = this.runHistory.steps.find(s => s.stepNumber === realStepNumber);
              if (navigationStep) {
                navigationStep.beforeScreenshot = beforeNavScreenshot.screenshot;
                navigationStep.afterScreenshot = afterNavigationScreenshot;
                navigationStep.beforeScreenshotPath = beforeNavScreenshot.path || null;
                navigationStep.afterScreenshotPath = filePath || null;
                console.log(`💾 [History] Скриншоты навигации добавлены в историю шага ${realStepNumber}`);
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ Не удалось сделать скриншот ПОСЛЕ навигации:', error);
        }
      }
      
      // Умный поиск начальной точки по URL (без чисел) и селекторам
      let actualStartIndex = startActionIndex;
      const currentUrl = window.location.href;
      
      // Нормализуем URL: убираем числа и параметры запроса для сравнения
      const normalizeUrlForMatching = (url) => {
        try {
          const urlObj = new URL(url);
          // Убираем числа из pathname
          const pathWithoutNumbers = urlObj.pathname.replace(/\d+/g, '');
          return urlObj.origin + pathWithoutNumbers;
        } catch (e) {
          // Убираем числа из URL строки
          return url.replace(/\d+/g, '');
        }
      };
      
      const normalizedCurrent = normalizeUrlForMatching(currentUrl);
      console.log(`🔍 Нормализованный текущий URL (без чисел): ${normalizedCurrent}`);
      
      // Ищем действие, которое лучше всего соответствует текущей странице
      let bestMatchIndex = startActionIndex;
      let bestMatchScore = 0;
      
      for (let i = 0; i < test.actions.length; i++) {
        const action = test.actions[i];
        if (!action.url) continue;
        
        const normalizedAction = normalizeUrlForMatching(action.url);
        let score = 0;
        
        // Сравниваем нормализованные URL
        if (normalizedCurrent === normalizedAction) {
          score += 10; // Полное совпадение URL
        } else if (normalizedCurrent.includes(normalizedAction) || normalizedAction.includes(normalizedCurrent)) {
          score += 5; // Частичное совпадение
        }
        
        // Проверяем только существующие следующие шаги (если шаг последний или дальше нет — не проверяем)
        const nextStepsCount = test.actions.length - 1 - i;
        if (score > 0 && nextStepsCount > 0) {
          let foundElementsCount = 0;
          const maxNextToCheck = Math.min(3, nextStepsCount);
          for (let j = 1; j <= maxNextToCheck; j++) {
            const nextIndex = i + j;
            if (nextIndex >= test.actions.length) break;
            const nextAction = test.actions[nextIndex];
            if (nextAction?.selector && nextAction.type !== 'wait' && !nextAction.hidden) {
              try {
                const findResult = await this.findElementWithRetry(nextAction.selector, 2, 200);
                if (findResult?.element) foundElementsCount++;
              } catch (e) { /* игнорируем */ }
            }
          }
          score += foundElementsCount * 2;
        }
        
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatchIndex = i;
        }
      }
      
      if (bestMatchScore > 0 && bestMatchIndex !== startActionIndex) {
        console.log(`✅ Найдена лучшая точка начала: действие ${bestMatchIndex + 1} (оценка: ${bestMatchScore})`);
        console.log(`   Оригинальная точка: действие ${startActionIndex + 1}`);
        actualStartIndex = bestMatchIndex;
      } else {
        console.log(`ℹ️ Использую указанную точку начала: действие ${startActionIndex + 1}`);
      }
      
      // Получаем оставшиеся действия, начиная с найденного индекса
      const remainingActions = test.actions.slice(actualStartIndex);
      // Вычисляем индекс для видимых действий
      const visibleActionsBeforeStart = test.actions
        .slice(0, actualStartIndex)
        .filter(a => this.isActionVisible(a)).length;
      
      this.currentActionIndex = visibleActionsBeforeStart;
      
      // Отслеживаем изменения URL для обработки редиректов
      this.startUrlTracking();
      
      // Отправляем информацию о прогрессе
      const visibleRemaining = remainingActions.filter(a => this.isActionVisible(a));
      if (visibleRemaining.length > 0) {
        this.notifyStepProgress({
          current: visibleActionsBeforeStart,
          total: this.getRuntimeActions(test.actions).length,
          type: 'resuming',
          action: null
        });
      }
      
      console.log('🚀 Продолжаю выполнение действий...');
      // Передаем оригинальный массив всех действий теста и начальный номер шага для правильного вычисления totalSteps и realStepNumber
      await this.executeActions(remainingActions, test.actions, visibleActionsBeforeStart);
      const hasStepErrors = this.runHistory?.steps?.some(step => step.success === false);
      if (hasStepErrors) {
        console.log('⚠️ Тест завершён с ошибками в шагах');
      } else {
        console.log('✅ Тест успешно выполнен');
      }

      // Устанавливаем success по наличию ошибок в шагах
      if (this.runHistory) {
        this.runHistory.success = !hasStepErrors;
        if (hasStepErrors) {
          const firstFailed = this.runHistory.steps.find(step => step.success === false);
          this.runHistory.error = firstFailed?.error || 'Один или несколько шагов завершились с ошибкой';
        } else {
          this.runHistory.error = null;
        }
      }

      this.notifyCompletion(!hasStepErrors, hasStepErrors ? (this.runHistory?.error || 'Ошибки в шагах') : null);
    } catch (error) {
      console.error('❌ Ошибка при выполнении теста:', error);
      this.notifyCompletion(false, error.message);
    } finally {
      this.stopPlaying();
    }
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 200);
        return;
      }

      window.addEventListener('load', () => {
        setTimeout(resolve, 200);
      }, { once: true });

      setTimeout(() => {
        console.log('⏳ Таймаут ожидания загрузки страницы, продолжаю...');
        resolve();
      }, 5000);
    });
  }

  highlightElement(element, color = '#4CAF50') {
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    const originalBoxShadow = element.style.boxShadow;
    const originalZIndex = element.style.zIndex;
    const originalPosition = element.style.position;
    
    // Более заметное выделение
    element.style.outline = `4px solid ${color}`;
    element.style.outlineOffset = '3px';
    element.style.boxShadow = `0 0 20px ${color}80`;
    element.style.zIndex = '999999';
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
    }
    
    // Убираем выделение через 2 секунды
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
      element.style.boxShadow = originalBoxShadow;
      element.style.zIndex = originalZIndex;
      element.style.position = originalPosition;
    }, 2000);
  }

  addPlayingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'autotest-playing-indicator';
    indicator.innerHTML = '▶️ ВОСПРОИЗВЕДЕНИЕ';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #2196F3;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: Arial, sans-serif;
      pointer-events: none;
      opacity: 0.7;
    `;
    document.body.appendChild(indicator);
  }

  removePlayingIndicator() {
    const indicator = document.getElementById('autotest-playing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  stopPlaying() {
    // Сохраняем историю перед остановкой, если тест был запущен
    if (this.runHistory && this.runHistory.startTime) {
      const endTime = Date.now();
      const startTime = new Date(this.runHistory.startTime).getTime();
      this.runHistory.totalDuration = endTime - startTime;
      
      // Если тест был остановлен пользователем, помечаем это
      // Устанавливаем success = false только если тест действительно был остановлен пользователем
      // Если success уже установлен в true (тест выполнен успешно), не перезаписываем его
      if (this.runHistory.success === undefined || this.runHistory.success === null) {
        // success не был установлен явно, значит тест был остановлен
        this.runHistory.success = false;
        this.runHistory.error = this.runHistory.error || 'Тест остановлен пользователем';
      } else if (this.runHistory.success === true && !this.runHistory.error) {
        // Тест выполнен успешно, убеждаемся что error = null
        this.runHistory.error = null;
      }
      
      // Убеждаемся, что история имеет минимальную информацию
      if (!this.runHistory.steps || this.runHistory.steps.length === 0) {
        this.runHistory.steps = [];
      }
      
      console.log('💾 Сохраняю историю прогона при остановке:', {
        testId: this.runHistory.testId,
        stepsCount: this.runHistory.steps.length,
        success: this.runHistory.success,
        duration: this.runHistory.totalDuration
      });
      
      // Отправляем историю в background для сохранения
      chrome.runtime.sendMessage({
        type: 'SAVE_TEST_RUN_HISTORY',
        runHistory: this.runHistory
      }).then(response => {
        if (response && response.success) {
          console.log('✅ История прогона успешно сохранена при остановке');
        } else {
          console.error('❌ Ошибка при сохранении истории:', response?.error);
        }
      }).catch(err => {
        console.error('❌ Ошибка при сохранении истории прогона при остановке:', err);
      });
    }
    
    // Выключаем перехват ошибок консоли
    this.stopConsoleErrorCapture();
    
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedState = null;
    this.currentTest = null;
    this.currentActionIndex = 0;
    if (this.runHistoryCleanupTimer) {
      clearTimeout(this.runHistoryCleanupTimer);
    }
    // Очищаем историю с небольшой задержкой, чтобы не потерять шаги в фоне
    this.runHistoryCleanupTimer = setTimeout(() => {
      this.runHistory = null;
      this.runHistoryCleanupTimer = null;
    }, 3000);
    this.stopUrlTracking(); // Останавливаем отслеживание URL
    this.removePlayingIndicator();
  }

  /**
   * Ставит воспроизведение на паузу
   */
  pausePlayback() {
    if (!this.isPlaying || this.isPaused) {
      console.warn('⚠️ [Player] Нельзя поставить на паузу: тест не воспроизводится или уже на паузе');
      return;
    }

    console.log('⏸️ [Player] Воспроизведение поставлено на паузу');
    this.isPaused = true;
    // НЕ меняем isPlaying, чтобы циклы могли проверить isPaused
    
    // Обновляем индикатор
    this.updatePlayingIndicator('⏸️ ПАУЗА');
    
    // Состояние будет сохранено в checkAndSavePauseState при следующей проверке
    console.log('💾 [Player] Состояние паузы будет сохранено при следующей проверке цикла');
  }

  /**
   * Возобновляет воспроизведение с места паузы
   */
  async resumePlaybackFromPause() {
    if (!this.isPaused) {
      console.warn('⚠️ [Player] Нельзя возобновить: воспроизведение не на паузе');
      return;
    }

    console.log('▶️ [Player] Возобновляю воспроизведение с места паузы...');
    
    // Просто снимаем флаг паузы - цикл продолжит выполнение автоматически
    // (checkAndSavePauseState ждет, пока isPaused станет false)
    this.isPaused = false;
    
    // Обновляем индикатор
    this.updatePlayingIndicator('▶️ ВОСПРОИЗВЕДЕНИЕ');
    
    console.log('✅ [Player] Флаг паузы снят, цикл продолжит выполнение');
  }

  /**
   * Обновляет индикатор воспроизведения
   */
  updatePlayingIndicator(text) {
    const indicator = document.getElementById('autotest-playing-indicator');
    if (indicator) {
      indicator.innerHTML = text;
      if (text.includes('ПАУЗА')) {
        indicator.style.background = '#FF9800'; // Оранжевый для паузы
      } else {
        indicator.style.background = '#2196F3'; // Синий для воспроизведения
      }
    }
  }

  /**
   * Проверяет, нужно ли поставить на паузу, и сохраняет состояние
   */
  async checkAndSavePauseState(visibleActions, allActions, startStepNumber, currentIndex) {
    if (this.isPaused) {
      // Сохраняем состояние для возобновления (только один раз)
      if (!this.pausedState) {
        this.pausedState = {
          test: this.currentTest,
          actionIndex: this.currentActionIndex,
          mode: this.playMode,
          visibleActions: visibleActions,
          allActions: allActions,
          startStepNumber: startStepNumber,
          currentIndex: currentIndex,
          runHistory: this.runHistory ? JSON.parse(JSON.stringify(this.runHistory)) : null
        };
        console.log(`💾 [Player] Состояние паузы сохранено на шаге ${currentIndex + 1}`);
      }
      
      // Ждем, пока пауза не будет снята
      while (this.isPaused && this.isPlaying) {
        await this.delay(100); // Проверяем каждые 100мс
      }
      
      // Если воспроизведение было остановлено во время паузы
      if (!this.isPlaying) {
        throw new Error('Воспроизведение остановлено во время паузы');
      }
    }
  }

  /**
   * Начинает отслеживание изменений URL для обработки редиректов
   */
  startUrlTracking() {
    if (this.urlChangeListener) {
      return; // Уже отслеживаем
    }
    
    this.lastKnownUrl = window.location.href;
    
    // Отслеживаем изменения через периодическую проверку
    const checkUrl = () => {
      if (!this.isPlaying) return;
      
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastKnownUrl) {
        console.log(`🔄 Обнаружено изменение URL: ${this.lastKnownUrl} → ${currentUrl}`);
        this.lastKnownUrl = currentUrl;
      }
    };
    
    // Сохраняем функцию для удаления слушателя
    this.urlCheckFunction = checkUrl;
    
    // Проверяем URL каждые 500мс
    this.urlChangeListener = setInterval(checkUrl, 500);
    
    // Также отслеживаем через popstate (для истории браузера)
    window.addEventListener('popstate', checkUrl);
    
    console.log('✅ Отслеживание изменений URL запущено');
  }

  /**
   * Останавливает отслеживание изменений URL
   */
  stopUrlTracking() {
    if (this.urlChangeListener) {
      clearInterval(this.urlChangeListener);
      this.urlChangeListener = null;
      if (this.urlCheckFunction && typeof window.removeEventListener === 'function') {
        window.removeEventListener('popstate', this.urlCheckFunction);
        this.urlCheckFunction = null;
      }
      console.log('✅ Отслеживание изменений URL остановлено');
    }
    this.lastKnownUrl = null;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получает оптимизированную задержку в зависимости от настроек
   */
  async getOptimizedDelay(actionType, defaultDelay) {
    try {
      let speedOptimization = true; // По умолчанию включено
      if (window.settingsManager) {
        const settings = await window.settingsManager.getSettings();
        speedOptimization = settings?.performance?.speedOptimization !== false;
      }
      
      if (!speedOptimization) {
        return defaultDelay;
      }
      
      // Оптимизированные задержки
      const optimizedDelays = {
        default: 100,
        click: 150,
        input: 100,
        dropdown: 200,
        navigation: 300,
        waitForElement: 50,
        screenshot: 100,
        scroll: 100
      };
      
      const optimized = optimizedDelays[actionType] || optimizedDelays.default;
      // Используем минимум из оптимизированной и 30% от исходной
      return Math.min(optimized, Math.max(defaultDelay * 0.3, 50));
    } catch (error) {
      // Если ошибка при получении настроек, используем оптимизированную задержку по умолчанию
      const optimizedDelays = {
        default: 100,
        click: 150,
        input: 100,
        dropdown: 200,
        navigation: 300,
        waitForElement: 50,
        screenshot: 100,
        scroll: 100
      };
      const optimized = optimizedDelays[actionType] || optimizedDelays.default;
      return Math.min(optimized, Math.max(defaultDelay * 0.3, 50));
    }
  }

  /**
   * Формирует текстовое описание шага для транскрипта
   */
  getStepDescription(action, stepNumber, totalSteps) {
    if (!action || !action.type) {
      return `Шаг ${stepNumber} из ${totalSteps}: —`;
    }
    const actionTypeNames = {
      'click': 'Клик',
      'dblclick': 'Двойной клик',
      'input': 'Ввод текста',
      'change': 'Изменение значения',
      'navigate': 'Переход на страницу',
      'wait': 'Задержка',
      'keydown': 'Нажатие клавиши',
      'keyup': 'Отпускание клавиши'
    };

    const actionTypeName = actionTypeNames[action.type] || (typeof action.type === 'string' ? action.type.toUpperCase() : '—');
    let description = `Шаг ${stepNumber} из ${totalSteps}: ${actionTypeName}`;

    // Добавляем информацию о селекторе
    if (action.selector) {
      const selectorText = this.formatSelector(action.selector);
      if (selectorText && selectorText !== 'N/A') {
        // Упрощаем селектор для читаемости
        const simplifiedSelector = selectorText.length > 60 
          ? selectorText.substring(0, 57) + '...' 
          : selectorText;
        description += ` по элементу "${simplifiedSelector}"`;
      }
    }

    // Добавляем информацию о значении
    if (action.value) {
      if (action.type === 'input' || action.type === 'change') {
        description += ` со значением "${action.value}"`;
      } else if (action.type === 'navigate') {
        description += ` на "${action.value}"`;
      } else if (action.type === 'wait') {
        const delay = action.delay || action.value;
        const seconds = Math.round(delay / 1000 * 10) / 10;
        description += ` на ${seconds} секунд`;
      }
    }

    // Добавляем информацию о тексте элемента (если есть)
    if (action.element && action.element.text) {
      const elementText = action.element.text.trim();
      if (elementText && elementText.length < 50) {
        description += ` (элемент: "${elementText}")`;
      }
    }

    return description;
  }

  /**
   * Находит элемент с повторными попытками
   * @returns {Promise<{element: Element, usedSelector: string}>} Объект с найденным элементом и фактически использованным селектором
   */
  async findElementWithRetry(selectorData, maxRetries = 5, delayMs = 200) {
    // Проверяем, что selectorData валиден
    if (!selectorData) {
      console.error('❌ Селектор не указан');
      return { element: null, usedSelector: 'N/A' };
    }

    // Если селектор - строка, преобразуем в объект
    if (typeof selectorData === 'string') {
      console.warn('⚠️ Селектор передан как строка, преобразую в объект');
      selectorData = {
        type: 'css',
        selector: selectorData,
        value: selectorData
      };
    }

    // Проверяем, что есть поле selector
    if (!selectorData.selector) {
      console.error('❌ Селектор не содержит поле "selector":', selectorData);
      return { element: null, usedSelector: this.formatSelector(selectorData) };
    }

    // === ИСПОЛЬЗОВАНИЕ ЭКСПОНЕНЦИАЛЬНОГО BACKOFF ИЗ ОПТИМИЗАТОРА ===
    if (this.optimizer?.settings?.exponentialBackoffRetry) {
      const result = await this.optimizer.findElementWithExponentialBackoff(selectorData, {
        maxRetries,
        initialDelay: Math.min(delayMs, 500),
        maxDelay: delayMs * 2,
        useMutationObserver: this.optimizer.settings.useMutationObserver
      });
      
      if (result.element) {
        if (result.attempts > 1) {
          console.log(`✅ [Optimizer] Элемент найден на попытке ${result.attempts} (экспоненциальный backoff)`);
        }
        
        // Если элемент найден во время воспроизведения, уведомляем background для снятия метки проблемного селектора
        if (this.isPlaying && this.currentTest) {
          try {
            chrome.runtime.sendMessage({
              type: 'SELECTOR_FOUND_DURING_PLAYBACK',
              testId: this.currentTest.id,
              selector: this.formatSelector(selectorData)
            });
          } catch (error) {
            console.warn('⚠️ Не удалось отправить сообщение о найденном селекторе:', error);
          }
        }
        
        return { element: result.element, usedSelector: this.formatSelector(selectorData) };
      }
      
      console.log(`⚠️ [Optimizer] Элемент не найден после ${result.attempts} попыток`);
    } else {
      // Оригинальная логика поиска
      const selectorInfo = selectorData.selector || JSON.stringify(selectorData);
      let currentSelector = selectorData;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const element = this.selectorEngine.findElementSync(currentSelector);
        
        if (element) {
          // Проверяем, что это действительно DOM элемент
          if (element instanceof Element || element instanceof HTMLElement) {
            if (attempt > 1) {
              console.log(`✅ Элемент найден на попытке ${attempt}: ${selectorInfo}`);
            }
            
            // Если элемент найден во время воспроизведения, уведомляем background для снятия метки проблемного селектора
            if (this.isPlaying && this.currentTest) {
              try {
                chrome.runtime.sendMessage({
                  type: 'SELECTOR_FOUND_DURING_PLAYBACK',
                  testId: this.currentTest.id,
                  selector: this.formatSelector(currentSelector)
                });
              } catch (error) {
                console.warn('⚠️ Не удалось отправить сообщение о найденном селекторе:', error);
              }
            }
            
            // Возвращаем элемент и фактически использованный селектор
            return { element, usedSelector: this.formatSelector(currentSelector) };
          } else {
            console.warn(`⚠️ Найденный объект не является DOM элементом:`, typeof element);
          }
        }
        
        // Если элемент не найден и это не последняя попытка, просто ждем
        if (attempt < maxRetries && !element) {
          console.log(`⏳ Попытка ${attempt}/${maxRetries}: элемент не найден (${selectorInfo}), жду и пробую снова...`);
          // Увеличиваем задержку с каждой попыткой (экспоненциальный backoff)
          const backoffDelay = Math.min(delayMs * Math.pow(1.5, attempt - 1), 1000);
          await this.delay(backoffDelay);
          
          // Пробуем альтернативные селекторы на средних попытках
          if (attempt >= 2 && attempt < maxRetries) {
            const altElement = await this.tryAlternativeSelectors({ selector: currentSelector });
            if (altElement) {
              console.log(`✅ Элемент найден через альтернативный селектор на попытке ${attempt}`);
              
              // Если элемент найден во время воспроизведения, уведомляем background для снятия метки проблемного селектора
              if (this.isPlaying && this.currentTest) {
                try {
                  chrome.runtime.sendMessage({
                    type: 'SELECTOR_FOUND_DURING_PLAYBACK',
                    testId: this.currentTest.id,
                    selector: this.formatSelector(currentSelector)
                  });
                } catch (error) {
                  console.warn('⚠️ Не удалось отправить сообщение о найденном селекторе:', error);
                }
              }
              
              return { element: altElement, usedSelector: this.formatSelector(currentSelector) };
            }
          }
        }
      }
    }
    
    const selectorInfo = selectorData.selector || JSON.stringify(selectorData);
    console.warn(`⚠️ Элемент не найден по основному селектору после ${maxRetries} попыток: ${selectorInfo}`);
    return { element: null, usedSelector: this.formatSelector(selectorData) };
  }

  _tryAlternativeSelectorsFallbacks(action) {
    if (!action) return null;
    // Fallback для хрупких селекторов dropdown: .input-select-background, .open > * (элемент виден только при открытом dropdown)
    const selectorStr = (action.selector?.selector || action.selector?.value || '').toString();
    const isFragileDropdownClick = /input-select-background|\.open\s*>\s*\*|select-background/i.test(selectorStr);
    if (isFragileDropdownClick) {
      console.log('🔍 Селектор похож на элемент открытого dropdown, ищу триггер для открытия...');
      const triggers = [
        '#type-project__result',
        '#status-project__result',
        '[id$="__result"]',
        'app-select .result',
        'app-select .select-box',
        'app-select .select-group',
        '.result.invalid',
        '.result.valid'
      ];
      for (const sel of triggers) {
        try {
          const el = document.querySelector(sel);
          if (el && this.isElementVisible && this.isElementVisible(el)) {
            console.log(`✅ Найден триггер dropdown для клика: ${sel}`);
            return el;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    // ТОЛЬКО ПОСЛЕ неудачи с оригинальным и альтернативными селекторами:
    // Специальная логика для поиска .select-box в app-select или .input-project-status
    // Это должно срабатывать в последнюю очередь, чтобы не найти неправильный элемент
    const isStatusField = action.element?.text?.includes('Статус') || 
                         action.element?.text?.includes('статус') ||
                         (action.element?.text?.includes('выберите') && 
                          (action.selector?.selector?.includes('status') || 
                           action.selector?.value?.includes('status'))) ||
                         action.selector?.selector?.includes('input-project-status') ||
                         action.selector?.selector?.includes('status-project') ||
                         action.selector?.value?.includes('status-project') ||
                         action.selector?.selector?.includes('select-box');
    
    if (isStatusField) {
      console.log('🔍 Специальный поиск для поля статуса...');
      
      // ПРИОРИТЕТ 1: Пробуем найти через app-select[elementid="status-project"]
      const appSelect = document.querySelector('app-select[elementid="status-project"], app-select[ng-reflect-element-id="status-project"]');
      if (appSelect) {
        // Ищем .select-box или кликабельный элемент внутри app-select
        const selectBox = appSelect.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
        if (selectBox) {
          console.log('✅ Найден .select-box через app-select[elementid="status-project"]');
          return selectBox;
        }
        // Если не нашли .select-box, ищем div с placeholder "выберите" внутри app-select
        const placeholderDiv = appSelect.querySelector('div[class*="placeholder"], div:has-text("выберите")');
        if (placeholderDiv) {
          console.log('✅ Найден placeholder div через app-select[elementid="status-project"]');
          return placeholderDiv;
        }
      }
      
      // ПРИОРИТЕТ 2: Пробуем найти через .input-project-status
      const statusContainer = document.querySelector('.input-project-status');
      if (statusContainer) {
        const optionsElement = statusContainer.querySelector('.options, [class*="options"]');
        if (optionsElement) {
          console.log('✅ Найден .options через .input-project-status');
          return optionsElement;
        }
        const resultElement = statusContainer.querySelector('.result, [class*="result"]');
        if (resultElement) {
          console.log('✅ Найден .result через .input-project-status');
          return resultElement;
        }
        const arrowElement = statusContainer.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]');
        if (arrowElement) {
          console.log('✅ Найден .arrow.isShowOptions через .input-project-status');
          return arrowElement;
        }
        const selectBox = statusContainer.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
        if (selectBox) {
          console.log('✅ Найден .select-box через .input-project-status');
          return selectBox;
        }
      }
      
      // ПРИОРИТЕТ 3: Пробуем найти через app-select[label="Статус"]
      const appSelectByLabel = document.querySelector('app-select[label="Статус"], app-select[ng-reflect-label="Статус"]');
      if (appSelectByLabel) {
        const optionsElement = appSelectByLabel.querySelector('.options, [class*="options"]');
        if (optionsElement) {
          console.log('✅ Найден .options через app-select[label="Статус"]');
          return optionsElement;
        }
        const resultElement = appSelectByLabel.querySelector('.result, [class*="result"]');
        if (resultElement) {
          console.log('✅ Найден .result через app-select[label="Статус"]');
          return resultElement;
        }
        const arrowElement = appSelectByLabel.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]');
        if (arrowElement) {
          console.log('✅ Найден .arrow.isShowOptions через app-select[label="Статус"]');
          return arrowElement;
        }
        const selectBox = appSelectByLabel.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
                if (selectBox) {
          console.log('✅ Найден .select-box через app-select[label="Статус"]');
                  return selectBox;
                }
      }
      
      // ПРИОРИТЕТ 4: Пробуем найти через #status-project__result или элемент с ID, содержащим status-project
      const statusResult = document.querySelector('#status-project__result, [id*="status-project__result"], [id*="status-project"]');
      if (statusResult) {
        // Ищем родительский app-select или кликабельный элемент
        const parentAppSelect = statusResult.closest('app-select');
        if (parentAppSelect) {
          const selectBox = parentAppSelect.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
                if (selectBox) {
            console.log('✅ Найден .select-box через #status-project__result -> app-select');
                  return selectBox;
                }
              }
        // Если не нашли через app-select, возвращаем сам элемент
        console.log('✅ Найден элемент через #status-project__result');
        return statusResult;
      }
      
      console.warn('⚠️ Не удалось найти элемент для поля статуса через специальные селекторы');
    }
    
    // Если есть информация об элементе, пробуем найти по тексту или другим атрибутам
    if (action.element) {
      // Пробуем найти по тексту
      if (action.element.text) {
        const text = action.element.text.trim();
        const textLower = text.toLowerCase();
        console.log(`🔍 Ищу элемент по тексту: "${text}"`);
        
        // НЕ ищем среди ссылок, если это поле статуса (чтобы не кликнуть на меню)
        const isStatusField = text.includes('Статус') || text.includes('статус') || 
                             text.includes('выберите') || text.includes('Плановый');
        
        if (!isStatusField) {
          // Сначала пробуем найти среди интерактивных элементов (кнопки, ссылки)
          const interactiveSelectors = ['button', 'a', 'input[type="button"]', 'input[type="submit"]', '[role="button"]', '[onclick]'];
          for (const selector of interactiveSelectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            const matching = elements.find(el => {
              const elText = this.selectorEngine.getElementText(el).trim();
              const elTextLower = elText.toLowerCase();
              return elText === text || 
                     elTextLower === textLower ||
                     elText.includes(text) || 
                     text.includes(elText) ||
                     // Для кнопок с текстом "ВОЙТИ" ищем также "войти", "Войти" и т.д.
                     (textLower.includes('войти') && elTextLower.includes('войти'));
            });
            
            if (matching && matching instanceof Element) {
              console.log(`✅ Найден интерактивный элемент по тексту "${text}" через селектор ${selector}`);
              return matching;
            }
          }
        } else {
          console.log('⚠️ Пропускаю поиск среди ссылок для поля статуса (чтобы не кликнуть на меню)');
        }
        
        // Если не нашли среди интерактивных, ищем среди всех элементов
        // Для поля статуса исключаем ссылки и элементы с текстом "пакет документа"
        const selector = isStatusField ? '*:not(a)' : '*';
        const allElements = Array.from(document.querySelectorAll(selector));
        
        // Исключаем тексты, которые НЕ относятся к полю статуса
        const excludedTexts = ['пакет документа', 'пакет', 'документ', 'тип проекта', 'тип'];
        
        const matchingElements = allElements.filter(el => {
          // Для поля статуса дополнительно проверяем, что это не ссылка
          if (isStatusField && (el.tagName === 'A' || el.closest('a'))) {
            return false;
          }
          
          const elText = this.selectorEngine.getElementText(el).trim();
          const elTextLower = elText.toLowerCase();
          
          // Для поля статуса исключаем элементы с текстом "пакет документа" и подобными
          if (isStatusField) {
            const isExcluded = excludedTexts.some(excluded => elTextLower.includes(excluded.toLowerCase()));
            if (isExcluded) {
              console.log(`⚠️ Исключаю элемент с текстом "${elText}" (не относится к полю статуса)`);
              return false;
            }
            
            // Для поля статуса ищем ТОЛЬКО в app-select[elementid="status-project"] или .input-project-status
            const isInStatusField = el.closest('app-select[elementid="status-project"]') ||
                                   el.closest('.input-project-status') ||
                                   el.closest('app-select[ng-reflect-element-id="status-project"]');
            if (!isInStatusField) {
              return false; // Не ищем элементы вне поля статуса
            }
          }
          
          return elText === text || 
                 elTextLower === textLower ||
                 elText.includes(text) || 
                 text.includes(elText);
        });
        
        if (matchingElements.length > 0) {
          // Для поля статуса приоритет отдаем .select-box
          if (isStatusField) {
            const selectBox = matchingElements.find(el => 
              el.classList.contains('select-box') || 
              el.className.includes('select-box') ||
              el.closest('.select-box') ||
              el.classList.contains('select-group') ||
              el.className.includes('select-group')
            );
            if (selectBox) {
              console.log(`✅ Найден .select-box по тексту "${text}"`);
              return selectBox;
            }
          }
          
          const found = matchingElements[0];
          if (found instanceof Element) {
            console.log(`✅ Найдено ${matchingElements.length} элементов по тексту, беру первый`);
            return found;
          }
        }
      }
      
      // Пробуем найти по href (для ссылок)
      if (action.element.href) {
        console.log(`🔍 Ищу ссылку по href: "${action.element.href}"`);
        const link = document.querySelector(`a[href="${action.element.href}"]`);
        if (link && link instanceof Element) {
          console.log('✅ Ссылка найдена по href');
          return link;
        }
      }
      
      // Пробуем найти по value (для input)
      if (action.element.value) {
        console.log(`🔍 Ищу input по value: "${action.element.value}"`);
        const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
        const matching = inputs.find(el => el.value === action.element.value);
        if (matching && matching instanceof Element) {
          console.log('✅ Input найден по value');
          return matching;
        }
      }
      
      // Пробуем найти по name
      if (action.element.name) {
        console.log(`🔍 Ищу элемент по name: "${action.element.name}"`);
        const element = document.querySelector(`[name="${action.element.name}"]`);
        if (element && element instanceof Element) {
          console.log('✅ Элемент найден по name');
          return element;
        }
      }
    }
    
    // Пробуем найти по части селектора (если это ID с динамической частью)
    if (action.selector && action.selector.type === 'id' && action.selector.value) {
      const idValue = action.selector.value;
      // Если ID содержит числа, пробуем найти по части
      const idParts = idValue.split('-');
      if (idParts.length > 1) {
        // Пробуем найти по началу ID (например, для "suggest-item-57677023-0" ищем "suggest-item-")
        const prefix = idParts.slice(0, -1).join('-');
        console.log(`🔍 Ищу элемент по части ID: "${prefix}"`);
        const elements = Array.from(document.querySelectorAll(`[id^="${prefix}"]`));
        if (elements.length > 0 && elements[0] instanceof Element) {
          console.log(`✅ Найдено ${elements.length} элементов по части ID, беру первый`);
          return elements[0];
        }
        
        // Пробуем найти по началу без последней части
        if (idParts.length > 2) {
          const prefix2 = idParts.slice(0, -2).join('-');
          console.log(`🔍 Ищу элемент по части ID (без последних 2 частей): "${prefix2}"`);
          const elements2 = Array.from(document.querySelectorAll(`[id^="${prefix2}"]`));
          if (elements2.length > 0 && elements2[0] instanceof Element) {
            console.log(`✅ Найдено ${elements2.length} элементов, беру первый`);
            return elements2[0];
          }
        }
      }
    }
    
    // Пробуем найти по тегу и тексту
    if (action.element && action.element.tag) {
      const tag = action.element.tag.toLowerCase();
      const text = action.element.text;
      if (text) {
        console.log(`🔍 Ищу ${tag} по тексту: "${text}"`);
        const elements = Array.from(document.querySelectorAll(tag));
        const matching = elements.find(el => {
          const elText = this.selectorEngine.getElementText(el).trim();
          const searchText = text.trim();
          // Более гибкое сравнение: учитываем регистр и частичное совпадение
          return elText === searchText || 
                 elText.toLowerCase() === searchText.toLowerCase() ||
                 elText.includes(searchText) || 
                 searchText.includes(elText);
        });
        if (matching && matching instanceof Element) {
          console.log('✅ Элемент найден по тегу и тексту');
          return matching;
        }
      }
    }
    
    // Специальная обработка для кнопок: ищем по тексту среди всех кнопок
    if (action.element && action.element.text) {
      const text = action.element.text.trim().toLowerCase();
      // Ищем среди button, input[type="button"], input[type="submit"], и элементов с role="button"
      const buttonSelectors = ['button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]'];
      
      for (const selector of buttonSelectors) {
        const buttons = Array.from(document.querySelectorAll(selector));
        const matching = buttons.find(btn => {
          const btnText = this.selectorEngine.getElementText(btn).trim().toLowerCase();
          return btnText === text || 
                 btnText.includes(text) || 
                 text.includes(btnText) ||
                 // Для кнопок с текстом "ВОЙТИ" ищем также "войти", "Войти" и т.д.
                 (text.includes('войти') && btnText.includes('войти'));
        });
        
        if (matching && matching instanceof Element) {
          console.log(`✅ Кнопка найдена по тексту "${action.element.text}" через селектор ${selector}`);
          return matching;
        }
      }
    }
    
    // Пробуем найти по aria-label (для кнопок и других элементов)
    if (action.element && action.element.text) {
      const text = action.element.text.trim();
      const elementsWithAriaLabel = Array.from(document.querySelectorAll('[aria-label]'));
      const matching = elementsWithAriaLabel.find(el => {
        const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
        return ariaLabel === text || 
               ariaLabel.toLowerCase() === text.toLowerCase() ||
               ariaLabel.includes(text) || 
               text.includes(ariaLabel);
      });
      
      if (matching && matching instanceof Element) {
        console.log(`✅ Элемент найден по aria-label: "${text}"`);
        return matching;
      }
    }
    
    console.log('❌ Альтернативные способы не помогли найти элемент');
    return null;
  }

  notifyStepProgress(stepInfo) {
    chrome.runtime.sendMessage({
      type: 'TEST_STEP_PROGRESS',
      testId: this.currentTest?.id,
      step: stepInfo.current,
      total: stepInfo.total,
      stepType: stepInfo.type,
      action: stepInfo.action
    }).catch(() => {});
  }

  ensureRunHistoryInitialized() {
    if (this.runHistory) {
      return;
    }
    const now = Date.now();
    const testId = this.currentTest?.id ? String(this.currentTest.id) : 'unknown';
    const testName = this.currentTest?.name || 'Без имени';
    this.runHistory = {
      testId: testId,
      testName: testName,
      startTime: new Date(now).toISOString(),
      runId: now,
      mode: this.playMode || 'optimized',
      steps: [],
      success: false,
      error: null,
      totalDuration: 0,
      transcript: []
    };
    console.warn('⚠️ [History] runHistory отсутствовал, создал новую запись для продолжения.');
  }

  showRecordingNotification() {
    // Удаляем предыдущее уведомление, если оно есть
    this.hideRecordingNotification();
    
    // Создаем уведомление о начале записи
    const notification = document.createElement('div');
    notification.id = 'recording-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideInRight 0.3s ease-out;
    `;
    notification.innerHTML = `
      <span style="font-size: 20px;">🔴</span>
      <span>Запись начата. Нажмите кнопку остановки записи, чтобы завершить.</span>
    `;
    document.body.appendChild(notification);
    
    // Сохраняем ссылку на уведомление
    this.recordingNotification = notification;
    
    // Добавляем стили для анимации, если их еще нет
    if (!document.getElementById('recording-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'recording-notification-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  hideRecordingNotification() {
    // Удаляем уведомление о записи, если оно существует
    if (this.recordingNotification && this.recordingNotification.parentNode) {
      this.recordingNotification.parentNode.removeChild(this.recordingNotification);
      this.recordingNotification = null;
    }
    
    // Также пробуем найти и удалить по ID (на случай, если ссылка потеряна)
    const notificationById = document.getElementById('recording-notification');
    if (notificationById && notificationById.parentNode) {
      notificationById.parentNode.removeChild(notificationById);
    }
  }

  async resumePlaybackAfterRecording(markerActionIndex) {
    if (!this.pendingResumeAfterRecording) {
      console.log('⚠️ Нет сохраненного состояния для продолжения воспроизведения');
      return;
    }

    const { test, currentActionIndex, visibleActions, playMode } = this.pendingResumeAfterRecording;
    this.pendingResumeAfterRecording = null;

    // Загружаем обновленный тест
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TEST',
        testId: test.id
      });

      if (response && response.success && response.test) {
        this.currentTest = response.test;
        console.log('✅ Тест обновлен после записи, продолжаю воспроизведение...');
      } else {
        console.warn('⚠️ Не удалось загрузить обновленный тест, использую сохраненный');
        this.currentTest = test;
      }
    } catch (error) {
      console.warn('⚠️ Ошибка при загрузке обновленного теста, использую сохраненный:', error);
      this.currentTest = test;
    }

    // Инициализируем переменные из теста
    this.userVariables = {};
    if (this.currentTest.variables) {
      console.log(`📦 [Variables] Инициализация переменных из теста (resumePlaybackAfterRecording). Всего переменных: ${Object.keys(this.currentTest.variables).length}`);
      for (const [varName, varData] of Object.entries(this.currentTest.variables)) {
        if (varData && typeof varData === 'object' && varData.value !== undefined && varData.value !== null) {
          this.userVariables[varName] = varData.value;
          const displayValue = String(varData.value);
          const isSensitive = varData.sensitive;
          console.log(`📦 [Variables] Загружена переменная "${varName}" = "${isSensitive ? '••••••••' : displayValue.substring(0, 20) + (displayValue.length > 20 ? '...' : '')}"`);
        } else if (varData !== undefined && varData !== null && typeof varData !== 'object') {
          // Если переменная сохранена в старом формате (просто значение)
          this.userVariables[varName] = varData;
          console.log(`📦 [Variables] Загружена переменная "${varName}" (старый формат) = "${String(varData).substring(0, 20)}${String(varData).length > 20 ? '...' : ''}"`);
        } else {
          console.warn(`⚠️ [Variables] Переменная "${varName}" пропущена (нет значения):`, varData);
        }
      }
      console.log(`📦 [Variables] Загружено ${Object.keys(this.userVariables).length} переменных из теста`);
      console.log(`📦 [Variables] Список переменных: ${Object.keys(this.userVariables).join(', ')}`);
    } else {
      // Это нормальная ситуация - не все тесты имеют переменные
      console.log(`ℹ️ [Variables] test.variables отсутствует или пуст (это нормально, если тест не использует переменные)`);
    }

    // Продолжаем воспроизведение с действия после маркера
    const updatedVisibleActions = this.getRuntimeActions(this.currentTest.actions);
    
    // Находим индекс следующего действия после маркера
    let nextActionIndex = currentActionIndex + 1;
    
    // Если есть следующее действие, продолжаем с него
    if (nextActionIndex < updatedVisibleActions.length) {
      console.log(`▶️ Продолжаю воспроизведение с действия ${nextActionIndex + 1} из ${updatedVisibleActions.length}`);
      
      // Проверяем, есть ли еще маркеры впереди
      const remainingActions = updatedVisibleActions.slice(nextActionIndex);
      const nextMarkerIndex = remainingActions.findIndex(a => a.recordMarker === true);
      
      if (nextMarkerIndex !== -1) {
        // Есть еще маркер, продолжаем до него
        const actionsToExecute = remainingActions.slice(0, nextMarkerIndex + 1);
        console.log(`📋 Продолжаю до следующего маркера (${actionsToExecute.length} действий)`);
        this.isPlaying = true;
        await this.executeActionsFromArray(actionsToExecute, nextActionIndex);
      } else {
        // Нет больше маркеров, продолжаем до конца
        const actionsToExecute = remainingActions;
        console.log(`📋 Продолжаю до конца теста (${actionsToExecute.length} действий)`);
        this.isPlaying = true;
        await this.executeActionsFromArray(actionsToExecute, nextActionIndex);
      }
    } else {
      console.log('✅ Все действия выполнены, тест завершен');
      this.notifyCompletion(true);
    }
  }

  /**
   * Получает данные авторизации (если есть)
   */
  getAuthData() {
    try {
      const authData = {};
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
    const preconditions = [];
    if (window.location.href) {
      preconditions.push(`Начальная страница: ${window.location.href}`);
    }
    return preconditions;
  }

  async executeActionsFromArray(actions, startIndex = 0) {
    // Выполняем действия из массива, начиная с указанного индекса
    for (let i = 0; i < actions.length; i++) {
      if (!this.isPlaying) {
        console.log('⏹️ Воспроизведение остановлено пользователем');
        return;
      }

      const action = actions[i];
      if (!action) {
        continue;
      }

      const globalIndex = startIndex + i;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`▶️ Шаг ${globalIndex + 1}: ${action.type}`);
      console.log(`${'='.repeat(60)}`);

      try {
        await this.executeAction(action);
        
        // Проверяем, есть ли маркер записи на этом действии
        const originalActionIndex = this.currentTest.actions.findIndex(a => a === action);
        if (action.recordMarker === true && originalActionIndex !== -1) {
          console.log(`🔴 Обнаружен следующий маркер записи на шаге ${originalActionIndex + 1}, запускаю запись...`);
          
          // Сохраняем состояние для продолжения
          const allVisibleActions = this.getRuntimeActions(this.currentTest.actions);
          this.pendingResumeAfterRecording = {
            test: this.currentTest,
            currentActionIndex: globalIndex,
            visibleActions: allVisibleActions,
            playMode: this.playMode
          };
          
          // Запускаем запись
          try {
            const response = await chrome.runtime.sendMessage({
              type: 'START_RECORDING_INTO_TEST',
              testId: this.currentTest.id,
              insertAfterIndex: originalActionIndex
            });
            
            if (response && response.success) {
              console.log('✅ Запись запущена успешно');
              this.isPlaying = false;
              this.showRecordingNotification();
            }
          } catch (error) {
            console.error('❌ Ошибка при запуске записи:', error);
            this.pendingResumeAfterRecording = null;
          }
          return; // Прерываем выполнение
        }
      } catch (error) {
        console.error(`❌ Ошибка при выполнении действия ${globalIndex + 1}:`, error);
        throw error;
      }
    }
    
    // Если дошли до конца без маркеров, завершаем тест
    console.log('✅ Все действия выполнены, тест завершен');
    this.notifyCompletion(true);
    this.stopPlaying();
  }

  notifyCompletion(success, error = null, optimizationSummary = null) {
    chrome.runtime.sendMessage({
      type: 'TEST_COMPLETED',
      testId: this.currentTest?.id,
      success,
      error,
      runMode: this.playMode,
      optimizationSummary
    }).catch(() => {});

    // Очищаем информацию о шаге
    chrome.runtime.sendMessage({
      type: 'TEST_STEP_PROGRESS',
      testId: this.currentTest?.id,
      step: 0,
      total: 0,
      stepType: null,
      action: null
    }).catch(() => {});
  }

  /**
   * Проверяет, было ли значение выбрано в dropdown
   */
  async checkIfValueSelected(selectBoxElement, expectedValue) {
    const expectedLower = this.normalizeTextValue(expectedValue);
    const placeholderValues = ['выберите', 'выберите или введите', 'select'];
    const isMeaningful = (val) => !!val && !placeholderValues.some(ph => val.includes(ph));
    const matchesExpected = (val) => !!val && (!!expectedLower ? (val === expectedLower || val.includes(expectedLower) || expectedLower.includes(val)) : !!val);
    
    const currentLower = this.normalizeTextValue(selectBoxElement.textContent);
    if (isMeaningful(currentLower) && matchesExpected(currentLower)) {
      return true;
    }
    
    const nativeSelect = this.findNativeSelectElement(selectBoxElement);
    if (nativeSelect) {
      const nativeText = this.normalizeTextValue(this.getNativeSelectDisplayValue(nativeSelect));
      const nativeValue = this.normalizeTextValue(nativeSelect.value);
      if (isMeaningful(nativeText) && matchesExpected(nativeText)) {
        return true;
      }
      if (isMeaningful(nativeValue) && matchesExpected(nativeValue)) {
        return true;
      }
    }
    
    const appSelect = selectBoxElement.closest('app-select');
    if (appSelect) {
      const selectBox = appSelect.querySelector('.select-box, [class*="select-box"]');
      if (selectBox) {
        const boxLower = this.normalizeTextValue(selectBox.textContent);
        if (isMeaningful(boxLower) && matchesExpected(boxLower)) {
          return true;
        }
      }
      
      const ngReflectValue = this.normalizeTextValue(
        appSelect.getAttribute('ng-reflect-model') ||
        appSelect.getAttribute('ng-reflect-value') ||
        appSelect.getAttribute('ng-reflect-selected-value')
      );
      if (matchesExpected(ngReflectValue)) {
        return true;
      }
    }
    
    const hiddenInput = selectBoxElement.closest('.input-project-status, app-select')?.querySelector('input[type="hidden"]');
    if (hiddenInput && hiddenInput.value) {
      const inputValueLower = this.normalizeTextValue(hiddenInput.value);
      if (matchesExpected(inputValueLower)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Автоматически находит и выбирает значение в dropdown, исследуя все варианты
   */
  async autoSelectDropdownValue(selectBoxElement, targetValue) {
    console.log(`🔍 Исследую dropdown для выбора значения: "${targetValue}"`);
    const selectedBeforeValue = this.getSelectedDropdownValue(selectBoxElement) || '';
    const strictSelectionCheck = () => {
      const selectedAfterValue = this.getSelectedDropdownValue(selectBoxElement) || '';
      const selectedAfterLower = this.normalizeTextValue(selectedAfterValue);
      const targetLowerStrict = this.normalizeTextValue(targetValue);
      const beforeLowerStrict = this.normalizeTextValue(selectedBeforeValue);
      const afterMatchesTarget = !!selectedAfterLower && !!targetLowerStrict &&
        (selectedAfterLower === targetLowerStrict || selectedAfterLower.includes(targetLowerStrict));
      const changedFromBefore = !beforeLowerStrict || !selectedAfterLower || beforeLowerStrict !== selectedAfterLower;
      return {
        ok: afterMatchesTarget && (changedFromBefore || beforeLowerStrict === targetLowerStrict),
        selectedAfterValue,
        afterMatchesTarget,
        changedFromBefore
      };
    };
    
    const appSelect = selectBoxElement.closest('app-select');
    const nativeSelect = this.findNativeSelectElement(selectBoxElement);

    if (!appSelect && !nativeSelect) {
      console.warn('⚠️ Не удалось определить контейнер dropdown (нет app-select и нативного <select>)');
    }

    if (nativeSelect) {
      const nativeResult = await this.selectNativeOption(nativeSelect, targetValue);
      if (nativeResult.success) {
        return { success: true, selectedValue: nativeResult.selectedValue };
      }
      console.warn(`⚠️ Нативный <select> найден, но не удалось выбрать значение "${targetValue}", пробую fallback через панель`);
    }

    // Сначала убеждаемся, что dropdown открыт
    if (!appSelect) {
      console.warn('⚠️ Не найден app-select');
      return { success: false, reason: 'app-select not found' };
    }
    
    // Получаем elementId для поиска связанной панели
    const elementId = appSelect.getAttribute('elementid') || appSelect.getAttribute('ng-reflect-element-id');
    const label = appSelect.getAttribute('label') || appSelect.getAttribute('ng-reflect-label');

    const labelLower = this.normalizeTextValue(label || '');
    const isOsnovanieStatusProject = elementId === 'status-project' || labelLower.includes('основание');
    if (isOsnovanieStatusProject) {
      try {
        const triggerCandidates = [
          '#status-project__result > div',
          '#status-project__result .arrow.ng-star-inserted.up',
          '#status-project__result .arrow.ng-star-inserted',
          '#status-project__result .arrow',
          '#status-project__result'
        ];
        let directTrigger = null;
        for (const selector of triggerCandidates) {
          const candidate = document.querySelector(selector);
          if (!candidate) continue;
          const style = window.getComputedStyle(candidate);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          directTrigger = candidate;
          break;
        }
        if (directTrigger) {
          this._dispatchClick(directTrigger);
          await this.delay(180);
        }

        const targetLowerDirect = this.normalizeTextValue(String(targetValue || ''));
        const rawOptions = Array.from(document.querySelectorAll(
          '#status-project .option, #status-project__result .option, app-select[elementid="status-project"] .option, app-select[ng-reflect-element-id="status-project"] .option, .cdk-overlay-container .option'
        ));
        const visibleOptions = rawOptions.filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        let matchedOption = null;
        for (const optionEl of visibleOptions) {
          const text = this.normalizeTextValue(optionEl.textContent || '');
          if (!text) continue;
          if (text === targetLowerDirect || text.includes(targetLowerDirect) || targetLowerDirect.includes(text)) {
            matchedOption = optionEl;
            break;
          }
        }
        if (matchedOption) {
          this._dispatchClick(matchedOption);
          await this.delay(220);
          const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
          if (confirmed) {
            return { success: true, selectedValue: targetValue, method: 'status-project-direct' };
          }
        }
      } catch (e) {
      }
    }
    
    let primaryClickTarget = selectBoxElement;
    const closeDropdownPanel = async () => {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true
        }));
        await this.delay(100);
      } catch (e) {
        console.warn('⚠️ Не удалось отправить Escape для закрытия dropdown:', e);
      }
      try {
        if (primaryClickTarget) {
          primaryClickTarget.blur?.();
        }
        selectBoxElement.blur?.();
      } catch (e) {
        console.warn('⚠️ Не удалось убрать фокус с dropdown:', e);
      }
    };
    const resolveClickTarget = () => {
      const resultElement = appSelect.querySelector('.result');
      if (resultElement) {
        return resultElement;
      }
      return selectBoxElement;
    };
    
    // Пробуем открыть dropdown, если он закрыт
    const controlName = this.getControlNameFromElement(appSelect, selectBoxElement);
    const angularSelectionResult = await this.trySelectViaAngularAPIs({
      appSelect,
      selectBoxElement,
      targetValue,
      controlName
    });
    if (angularSelectionResult?.success) {
      await this.delay(100);
      return angularSelectionResult;
    }

    const selectBoxRect = selectBoxElement.getBoundingClientRect();

    const findDropdownPanel = () => {
      // Ищем панель по ID результата (например, #status-project__result)
      if (elementId) {
        const resultId = `${elementId}__result`;
        // Пробуем точный ID
        let resultPanel = document.querySelector(`#${resultId}`);
        if (resultPanel) {
          // Внутри app-select обычно находится триггер/результат, а не всплывающий список опций.
          // Такой элемент не считаем панелью dropdown.
          if (appSelect.contains(resultPanel)) {
            resultPanel = null;
          }
        }
        if (resultPanel) {
          const style = window.getComputedStyle(resultPanel);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.log(`✅ Найдена панель по точному ID: #${resultId}`);
            return resultPanel;
          }
        }
        // Пробуем частичное совпадение ID (div[id*="status-project__result"])
        resultPanel = document.querySelector(`[id*="${resultId}"]`);
        if (resultPanel) {
          if (appSelect.contains(resultPanel)) {
            resultPanel = null;
          }
        }
        if (resultPanel) {
          const style = window.getComputedStyle(resultPanel);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.log(`✅ Найдена панель по частичному ID: [id*="${resultId}"]`);
            return resultPanel;
          }
        }
        // Пробуем найти div с ID, содержащим elementId и __result
        resultPanel = document.querySelector(`div[id*="${elementId}"][id*="__result"]`);
        if (resultPanel) {
          if (appSelect.contains(resultPanel)) {
            resultPanel = null;
          }
        }
        if (resultPanel) {
          const style = window.getComputedStyle(resultPanel);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.log(`✅ Найдена панель по комбинированному ID: div[id*="${elementId}"][id*="__result"]`);
            return resultPanel;
          }
        }
      }
      
      // Ищем панель рядом с app-select (может быть в overlay)
      const nearbyPanels = Array.from(document.querySelectorAll('[class*="dropdown"], [class*="panel"], [class*="select"], [role="listbox"], [id*="__result"]'));
      for (const panel of nearbyPanels) {
        if (appSelect.contains(panel)) continue;
        const panelRect = panel.getBoundingClientRect();
        const style = window.getComputedStyle(panel);
        
        // Исключаем скрытые панели и меню навигации
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (panel.className && (panel.className.includes('main') || panel.className.includes('navigation'))) continue;
        if (panel.closest('nav, header, .menu, .navigation')) continue;
        
        // Проверяем, что панель находится рядом с select-box (в пределах 500px)
        const distanceX = Math.abs(panelRect.left - selectBoxRect.left);
        const distanceY = Math.abs(panelRect.top - (selectBoxRect.bottom + 5));
        
        if (distanceX < 500 && distanceY < 500) {
          console.log(`✅ Найдена панель рядом с select-box (расстояние: X=${distanceX}, Y=${distanceY})`);
          return panel;
        }
      }
      
      return null;
    };
    
    let dropdownPanel = findDropdownPanel();
    
    const isPanelVisible = (panel) => {
      if (!panel) return false;
      const style = window.getComputedStyle(panel);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const panelSeemsEmpty = (panel) => {
      if (!panel) return true;
      const optionCandidate = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
      return !optionCandidate;
    };

    const uniqueTargets = [];
    const registerTarget = (el, label) => {
      if (el && el instanceof Element && !uniqueTargets.find(item => item.element === el)) {
        uniqueTargets.push({ element: el, label });
      }
    };

    const baseResult = resolveClickTarget();
    registerTarget(appSelect.querySelector('.options'), '.options');
    registerTarget(appSelect.querySelector('[class*="options"]'), '[class*="options"]');
    registerTarget(baseResult, '.result');
    registerTarget(appSelect.querySelector('.result__value'), '.result__value');
    registerTarget(appSelect.querySelector('.result__content'), '.result__content');
    registerTarget(appSelect.querySelector('.result__arrow'), '.result__arrow');
    registerTarget(appSelect.querySelector('.arrow.isShowOptions'), '.arrow.isShowOptions');
    registerTarget(appSelect.querySelector('.arrow[class*="isShowOptions"]'), '.arrow[class*="isShowOptions"]');
    registerTarget(appSelect.querySelector('.select-btn'), '.select-btn');
    registerTarget(appSelect.querySelector('.select-group'), '.select-group');
    registerTarget(appSelect.querySelector('.select'), '.select');
    registerTarget(selectBoxElement, '.select-box (original)');
    registerTarget(appSelect, 'app-select');

    const clickMethods = [
      {
        name: 'native click',
        run: async (target) => target.click()
      },
      {
        name: 'mousedown+mouseup+click',
        run: async (target) => {
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          await this.delay(80);
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          await this.delay(40);
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
        }
      },
      {
        name: 'focus + Enter',
        run: async (target) => {
          target.focus?.();
          await this.delay(60);
          target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
          await this.delay(40);
          target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
        }
      },
      {
        name: 'double click',
        run: async (target) => {
          target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        }
      }
    ];

    // Функция для проверки, что dropdown действительно открыт (есть опции)
    const isDropdownReallyOpen = async (panel) => {
      if (!panel || !isPanelVisible(panel)) return false;
      // Проверяем наличие опций в панели
      const hasOptions = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
      if (hasOptions) return true;
      // Ждем немного и проверяем снова (опции могут рендериться асинхронно)
      await this.delay(200);
      const hasOptionsAfterDelay = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
      return !!hasOptionsAfterDelay;
    };

    if (!dropdownPanel || !isPanelVisible(dropdownPanel) || panelSeemsEmpty(dropdownPanel)) {
      console.log('📂 Открываю dropdown (поиск рабочей точки клика)...');
      selectBoxElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(400);

      let opened = false;
      for (const targetInfo of uniqueTargets) {
        const target = targetInfo.element;
        for (const method of clickMethods) {
          try {
            console.log(`  → Пробую ${method.name} по ${targetInfo.label}`);
            await method.run(target);
            await this.delay(800); // Увеличиваем задержку для рендеринга опций
            
            // Перепроверяем панель после клика
            dropdownPanel = findDropdownPanel();
            if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
              console.log(`✅ Dropdown открыт и опции видны (${targetInfo.label}, ${method.name})`);
              opened = true;
              break;
            }
          } catch (error) {
            console.warn(`   ⚠️ ${method.name} на ${targetInfo.label} завершился ошибкой:`, error);
          }
        }
        if (opened) break;
      }
      
      // Если не открылся, пробуем более агрессивные методы
      if (!opened) {
        console.log('  → Пробую более агрессивные методы открытия dropdown...');
        
        // Метод 1: Клик по .select-box внутри app-select
        const selectBox = appSelect.querySelector('.select-box');
        if (selectBox) {
          try {
            console.log('  → Пробую клик по .select-box внутри app-select');
            selectBox.click();
            await this.delay(1000);
            dropdownPanel = findDropdownPanel();
            if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
              console.log('✅ Dropdown открыт через клик по .select-box');
              opened = true;
            }
          } catch (e) {
            console.warn('  ⚠️ Клик по .select-box не сработал:', e);
          }
        }
        
        // Метод 2: Клик по .result внутри app-select
        if (!opened) {
          const resultEl = appSelect.querySelector('.result');
          if (resultEl) {
            try {
              console.log('  → Пробую клик по .result внутри app-select');
              resultEl.click();
              await this.delay(1000);
              dropdownPanel = findDropdownPanel();
              if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                console.log('✅ Dropdown открыт через клик по .result');
                opened = true;
              }
            } catch (e) {
              console.warn('  ⚠️ Клик по .result не сработал:', e);
            }
          }
        }
        
        // Метод 3: Фокус + клик
        if (!opened) {
          try {
            console.log('  → Пробую focus + клик по selectBoxElement');
            selectBoxElement.focus();
            await this.delay(200);
            selectBoxElement.click();
            await this.delay(1000);
            dropdownPanel = findDropdownPanel();
            if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
              console.log('✅ Dropdown открыт через focus + клик');
              opened = true;
            }
          } catch (e) {
            console.warn('  ⚠️ focus + клик не сработал:', e);
          }
        }
      }

      if (!opened) {
        // Попытка открыть через Angular API компонента
        try {
          const ngComponent = this.getAngularComponent(appSelect);
          if (ngComponent) {
            const componentInstance = ngComponent.instance || ngComponent.componentInstance;
            if (componentInstance) {
              // Пробуем вызвать методы открытия dropdown
              const openMethods = ['open', 'toggle', 'show', 'openDropdown', 'toggleDropdown', 'onClick', 'handleClick'];
              for (const methodName of openMethods) {
                if (typeof componentInstance[methodName] === 'function') {
                  try {
                    console.log(`  → Пробую вызвать ${methodName}() через Angular API`);
                    componentInstance[methodName]();
                    await this.delay(800);
                    
                    dropdownPanel = findDropdownPanel();
                    if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                      console.log(`✅ Dropdown открыт через ${methodName}()`);
                      opened = true;
                      break;
                    }
                  } catch (e) {
                    console.warn(`   ⚠️ ${methodName}() завершился ошибкой:`, e);
                  }
                }
              }
              
              // Если методы не сработали, пробуем установить свойства открытия
              if (!opened) {
                const openProperties = ['isOpen', 'opened', 'open', 'visible', 'show', 'expanded'];
                for (const propName of openProperties) {
                  try {
                    if (componentInstance[propName] !== undefined) {
                      const oldValue = componentInstance[propName];
                      componentInstance[propName] = true;
                      console.log(`  → Установил ${propName} = true через Angular API`);
                      await this.delay(800);
                      
                      dropdownPanel = findDropdownPanel();
                      if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                        console.log(`✅ Dropdown открыт через установку ${propName}`);
                        opened = true;
                        break;
                      } else {
                        // Восстанавливаем старое значение, если не помогло
                        componentInstance[propName] = oldValue;
                      }
                    }
                  } catch (e) {
                    console.warn(`   ⚠️ Ошибка при установке ${propName}:`, e);
                  }
                }
              }
              
              // Пробуем вызвать Angular change detection
              if (!opened) {
                try {
                  const zoneToken = window.ng?.coreTokens?.NgZone;
                  const injector = ngComponent.injector || window.ng?.getInjector?.(appSelect);
                  const zone = zoneToken && injector?.get ? injector.get(zoneToken, null) : null;
                  
                  if (zone) {
                    zone.run(() => {
                      // Пробуем еще раз вызвать методы открытия внутри zone
                      for (const methodName of openMethods) {
                        if (typeof componentInstance[methodName] === 'function') {
                          try {
                            componentInstance[methodName]();
                          } catch (e) {
                            // Игнорируем ошибки
                          }
                        }
                      }
                    });
                    await this.delay(1000);
                    
                    dropdownPanel = findDropdownPanel();
                    if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                      console.log(`✅ Dropdown открыт через Angular zone`);
                      opened = true;
                    }
                  }
                } catch (e) {
                  console.warn('⚠️ Ошибка при работе с Angular zone:', e);
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Не удалось открыть через Angular API:', e);
        }
        
        if (!opened) {
          console.warn('⚠️ Не удалось открыть dropdown перечисленными способами, продолжаю с fallback-поиском опций...');
        }
      }
    }
    
    if (dropdownPanel) {
      const panelInfo = dropdownPanel.id || dropdownPanel.className || dropdownPanel.tagName || 'unknown';
      console.log('✅ Найдена панель dropdown:', panelInfo);
    } else {
      console.warn('⚠️ Панель dropdown не найдена, ищу опции во всем документе');
    }
    
    // Ждем появления опций в панели через MutationObserver (если панель пустая)
    if (dropdownPanel && panelSeemsEmpty(dropdownPanel)) {
      console.log('⏳ Панель найдена, но пустая. Жду появления опций через MutationObserver...');
      
      // Пробуем принудительно вызвать скролл для Angular CDK overlay
      try {
        const cdkOverlay = dropdownPanel.closest('.cdk-overlay-pane, .cdk-overlay-container');
        if (cdkOverlay) {
          console.log('  → Найден Angular CDK overlay, пробую принудительный скролл...');
          cdkOverlay.dispatchEvent(new Event('scroll', { bubbles: true }));
          dropdownPanel.dispatchEvent(new Event('scroll', { bubbles: true }));
          await this.delay(300);
        }
      } catch (e) {
        console.warn('  ⚠️ Ошибка при работе с CDK overlay:', e);
      }
      
      // Пробуем еще раз кликнуть по select-box, если панель все еще пустая
      if (panelSeemsEmpty(dropdownPanel)) {
        const selectBox = appSelect.querySelector('.select-box, .result');
        if (selectBox) {
          try {
            console.log('  → Панель все еще пустая, пробую еще один клик по select-box...');
            selectBox.click();
            await this.delay(1000);
          } catch (e) {
            console.warn('  ⚠️ Повторный клик не сработал:', e);
          }
        }
      }
      
      const optionsAppeared = await this.waitForOptionsInPanel(dropdownPanel, 5000); // Увеличиваем время ожидания до 5 секунд
      if (optionsAppeared) {
        console.log('✅ Опции появились в панели');
      } else {
        console.warn('⚠️ Опции не появились в панели за 5 секунд, продолжаю поиск...');
      }
    }
    
    // ---- Новый механизм поиска опций ----
    const targetLower = targetValue.trim().toLowerCase();
    const baseSelectors = [
      '[role="option"]',
      '.mat-option',
      '.react-select__option',
      '.p-dropdown-item',
      '.option-item',
      '.select-option',
      '.option', // Основной селектор для опций (например, #status-project__result .option)
      '.option.cutted-text', // Опции с классом cutted-text
      '.result__content',
      '.result__item',
      '.result__value',
      '.result__option',
      '[data-value]',
      '[ng-reflect-app-tooltip]',
      '[ng-reflect-value]',
      '[tooltip]',
      'div[class*="result"]',
      'span[class*="result"]',
      'li:not([class*="menu"]):not([class*="nav"])'
    ];
    
    const isElementVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      
      // Используем несколько методов для проверки размера (для элементов с CSS трансформациями)
      const rect = el.getBoundingClientRect();
      const hasBoundingSize = rect.width > 1 && rect.height > 1;
      
      // Проверяем offsetWidth/offsetHeight (более надежно для трансформированных элементов)
      const hasOffsetSize = el.offsetWidth > 1 && el.offsetHeight > 1;
      
      // Проверяем getClientRects (может найти видимые части даже при трансформациях)
      const clientRects = el.getClientRects();
      const hasClientRectSize = clientRects.length > 0 && 
        Array.from(clientRects).some(r => r.width > 1 && r.height > 1);
      
      return hasBoundingSize || hasOffsetSize || hasClientRectSize;
    };
    
    const extractTextFromElement = (el) => {
      if (!el) return '';
      
      // Сначала проверяем атрибуты с текстом (они часто более точные)
      const attrText = el.getAttribute('ng-reflect-app-tooltip') || 
                       el.getAttribute('tooltip') || 
                       el.getAttribute('title') ||
                       el.getAttribute('aria-label') ||
                       el.getAttribute('data-label') ||
                       el.getAttribute('data-text');
      if (attrText && attrText.trim().length >= 2) {
        return attrText.trim();
      }
      
      // Специальная обработка для .option элементов: ищем span внутри
      if (el.classList && el.classList.contains('option')) {
        const spanInside = el.querySelector('span');
        if (spanInside) {
          const spanText = spanInside.textContent?.trim() || spanInside.innerText?.trim() || '';
          if (spanText && spanText.length >= 2) {
            return spanText;
          }
        }
        // Также проверяем .result__content внутри .option
        const resultContent = el.querySelector('.result__content');
        if (resultContent) {
          const contentText = resultContent.textContent?.trim() || resultContent.innerText?.trim() || '';
          if (contentText && contentText.length >= 2) {
            return contentText;
          }
        }
      }
      
      // Специальная обработка для .result__content
      if (el.classList && el.classList.contains('result__content')) {
        const contentText = el.textContent?.trim() || el.innerText?.trim() || '';
        if (contentText && contentText.length >= 2) {
          return contentText;
        }
      }
      
      // Специальная обработка для span внутри .option
      if (el.tagName === 'SPAN' && el.closest('.option')) {
        const spanText = el.textContent?.trim() || el.innerText?.trim() || '';
        if (spanText && spanText.length >= 2) {
          return spanText;
        }
      }
      
      // Извлекаем текст из элемента
      let text = el.textContent?.trim() || el.innerText?.trim() || '';
      
      // Если текст короткий, пробуем собрать из дочерних элементов
      if (!text || text.length < 2) {
        const childTexts = Array.from(el.children)
          .map(child => {
            // Пропускаем скрытые элементы
            const style = window.getComputedStyle(child);
            if (style.display === 'none' || style.visibility === 'hidden') return '';
            return (child.textContent || child.innerText || '').trim();
          })
          .filter(t => t && t.length >= 2);
        if (childTexts.length > 0) {
          text = childTexts.join(' ').trim();
        }
      }
      
      // Если все еще нет текста, используем TreeWalker для глубокого поиска
      if (!text || text.length < 2) {
        const walker = document.createTreeWalker(
          el, 
          NodeFilter.SHOW_TEXT, 
          {
            acceptNode: (node) => {
              // Пропускаем скрытые элементы
              const parent = node.parentElement;
              if (parent) {
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden') {
                  return NodeFilter.FILTER_REJECT;
                }
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }, 
          false
        );
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
          const nodeText = node.textContent?.trim();
          if (nodeText && nodeText.length > 0) {
            textNodes.push(nodeText);
          }
        }
        if (textNodes.length > 0) {
          text = textNodes.join(' ').trim();
        }
      }
      
      return text;
    };
    
    const getOptionTexts = (el) => {
      const texts = new Set(); // Используем Set для уникальности
      
      // Извлекаем основной текст элемента
      const text = extractTextFromElement(el);
      if (text) {
        const normalized = this.normalizeTextValue(text);
        if (normalized) texts.add(normalized);
      }
      
      // Извлекаем текст из всех дочерних элементов с текстом
      const allTextNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        const nodeText = node.textContent?.trim();
        if (nodeText && nodeText.length > 0) {
          allTextNodes.push(nodeText);
        }
      }
      if (allTextNodes.length > 0) {
        const combinedText = allTextNodes.join(' ').trim();
        const normalized = this.normalizeTextValue(combinedText);
        if (normalized) texts.add(normalized);
      }
      
      // Атрибуты
      const attrValues = [
        el.getAttribute('value'),
        el.dataset?.value,
        el.getAttribute('data-value'),
        el.getAttribute('ng-reflect-app-tooltip'),
        el.getAttribute('ng-reflect-value'),
        el.getAttribute('tooltip'),
        el.getAttribute('title'),
        el.getAttribute('aria-label'),
        el.getAttribute('data-label'),
        el.getAttribute('data-text')
      ];
      attrValues.forEach(val => {
        if (val) {
          const normalized = this.normalizeTextValue(val);
          if (normalized) texts.add(normalized);
        }
      });
      
      // Ищем вложенные элементы с атрибутами
      const nestedTooltip = el.querySelector('[ng-reflect-app-tooltip]');
      if (nestedTooltip) {
        const nestedTooltipValue = nestedTooltip.getAttribute('ng-reflect-app-tooltip');
        if (nestedTooltipValue) {
          const normalized = this.normalizeTextValue(nestedTooltipValue);
          if (normalized) texts.add(normalized);
        }
      }
      
      // Ищем span с текстом внутри
      const spans = el.querySelectorAll('span');
      spans.forEach(span => {
        const spanText = span.textContent?.trim();
        if (spanText && spanText.length > 0) {
          const normalized = this.normalizeTextValue(spanText);
          if (normalized) texts.add(normalized);
        }
        const spanTooltip = span.getAttribute('ng-reflect-app-tooltip');
        if (spanTooltip) {
          const normalized = this.normalizeTextValue(spanTooltip);
          if (normalized) texts.add(normalized);
        }
      });
      
      return Array.from(texts).filter(Boolean);
    };
    
    const isPlaceholderText = (text) => {
      if (!text) return true;
      const normalized = text.toLowerCase();
      const placeholders = ['выберите', 'статус', 'select', 'placeholder', 'label'];
      return placeholders.some(ph => normalized === ph || (normalized.includes(ph) && normalized.length < 20));
    };
    
    const qualifiesAsOption = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (el === selectBoxElement) return false;
      
      const insideTriggerButOutsidePanel = selectBoxElement.contains(el) && 
        (!dropdownPanel || !dropdownPanel.contains(el)) &&
        !el.closest('[id*="__result"]');
      if (insideTriggerButOutsidePanel) return false;
      
      if (el.closest('nav, header, .menu, .navigation, .main')) return false;
      if (!isElementVisible(el)) return false;
      
      // Улучшенная проверка размера: используем несколько методов
      const rect = el.getBoundingClientRect();
      const offsetWidth = el.offsetWidth || 0;
      const offsetHeight = el.offsetHeight || 0;
      const clientRects = el.getClientRects();
      const hasAnySize = (rect.width > 0 && rect.height > 0) || 
                        (offsetWidth > 0 && offsetHeight > 0) ||
                        (clientRects.length > 0 && Array.from(clientRects).some(r => r.width > 0 && r.height > 0));
      
      if (!hasAnySize) return false;
      
      // Для элементов внутри dropdown панели - более мягкая проверка расстояния
      const isInsidePanel = dropdownPanel && dropdownPanel.contains(el);
      if (isInsidePanel) {
        // Если элемент внутри панели, принимаем его без проверки расстояния
        const text = extractTextFromElement(el);
        if (text.length < 2) return false;
        if (isPlaceholderText(text)) return false;
        return true;
      }
      
      // Для элементов вне панели - проверяем расстояние
      const distanceX = Math.abs(((rect.left + rect.right) / 2) - ((selectBoxRect.left + selectBoxRect.right) / 2));
      const distanceY = Math.abs(rect.top - selectBoxRect.bottom);
      if (distanceX > 800 || distanceY > 900) return false;
      
      const text = extractTextFromElement(el);
      if (text.length < 2) return false;
      if (isPlaceholderText(text)) return false;
      return true;
    };
    
    const collectOptionsFromContainer = (container, label) => {
      if (!container || !(container instanceof Element)) return [];
      const found = new Set();
      
      // Специальный поиск для .result__content внутри панели (Angular dropdown)
      if (dropdownPanel && container === dropdownPanel) {
        const resultContents = container.querySelectorAll('.result__content');
        resultContents.forEach(contentEl => {
          // Ищем родительский .result для клика
          const resultParent = contentEl.closest('.result');
          if (resultParent) {
            found.add(resultParent); // Добавляем родителя для клика
            found.add(contentEl); // Также добавляем сам content для текста
          } else {
            found.add(contentEl);
          }
        });
        
        // Специальный поиск для .option внутри панели (например, #status-project__result .option)
        const options = container.querySelectorAll('.option, .option.cutted-text');
        options.forEach(optionEl => {
          // Добавляем сам .option элемент
          found.add(optionEl);
          // Также добавляем span внутри .option (если есть)
          const spanInside = optionEl.querySelector('span');
          if (spanInside) {
            found.add(spanInside);
          }
          // Также добавляем div > span структуру (например, #status-project > div:nth-child(1) > span)
          const divInside = optionEl.querySelector('div');
          if (divInside) {
            const spanInDiv = divInside.querySelector('span');
            if (spanInDiv) {
              found.add(spanInDiv);
            }
          }
        });
        
        // Также ищем span напрямую внутри панели (на случай, если структура отличается)
        const spansInPanel = container.querySelectorAll('span');
        spansInPanel.forEach(spanEl => {
          // Проверяем, что span находится внутри .option или рядом с ним
          if (spanEl.closest('.option') || spanEl.parentElement?.classList?.contains('option')) {
            found.add(spanEl);
          }
        });
      }
      
      const selectors = [...baseSelectors, 'div', 'span', 'p', 'li', 'button'];
      selectors.forEach(selector => {
        try {
          container.querySelectorAll(selector).forEach(el => found.add(el));
        } catch (e) {
          // selector might be invalid, ignore
        }
      });
      
      const result = Array.from(found).filter(qualifiesAsOption);
      
      // Логируем информацию о найденных опциях для отладки
      if (result.length > 0 && result.length <= 10) {
        result.forEach((opt, idx) => {
          const rect = opt.getBoundingClientRect();
          const offsetW = opt.offsetWidth || 0;
          const offsetH = opt.offsetHeight || 0;
          const text = extractTextFromElement(opt).substring(0, 30);
          console.log(`    [${idx + 1}] "${text}" - rect: ${rect.width.toFixed(0)}×${rect.height.toFixed(0)}, offset: ${offsetW}×${offsetH}, pos: (${rect.left.toFixed(0)}, ${rect.top.toFixed(0)})`);
        });
      }
      
      console.log(`  Контейнер "${label}" дал ${result.length} подходящих элементов`);
      return result;
    };
    
    const findNearbyOverlays = () => {
      const overlays = [];
      const overlayCandidates = Array.from(document.body.querySelectorAll('[class*="cdk-overlay"], [class*="overlay"], [class*="portal"], [id*="__result"]'));
      const selectBoxRect = selectBoxElement.getBoundingClientRect();
      overlayCandidates.forEach(overlay => {
        const style = window.getComputedStyle(overlay);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const rect = overlay.getBoundingClientRect();
        const distanceX = Math.abs(rect.left - selectBoxRect.left);
        const distanceY = Math.abs(rect.top - (selectBoxRect.bottom + 5));
        if (distanceX < 500 && distanceY < 500) {
          overlays.push(overlay);
        }
      });
      return overlays;
    };
    
    const collectAllOptionsWithRetries = async () => {
      const maxAttempts = 6;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // На каждой попытке убеждаемся, что панель все еще открыта
        if (!dropdownPanel || window.getComputedStyle(dropdownPanel).display === 'none') {
          console.log('ℹ️ Панель dropdown скрыта, пробую открыть повторно');
          primaryClickTarget = resolveClickTarget();
          try {
            primaryClickTarget.click();
            await this.delay(600);
          } catch (e) {
            console.warn('⚠️ Не удалось повторно открыть dropdown:', e);
          }
          dropdownPanel = findDropdownPanel();
        }
        
        let candidates = [];
        
        // Попытка получить опции через Angular API компонента
        if (attempt === 1) {
          try {
            const ngComponent = this.getAngularComponent(appSelect);
            if (ngComponent) {
              const componentInstance = ngComponent.instance || ngComponent.componentInstance;
              if (componentInstance) {
                // Ищем массив опций в компоненте
                const possibleOptionsProps = ['options', 'items', 'values', 'data', 'source', 'list'];
                for (const prop of possibleOptionsProps) {
                  if (Array.isArray(componentInstance[prop]) && componentInstance[prop].length > 0) {
                    console.log(`  → Найдены опции через Angular API (${prop}): ${componentInstance[prop].length} элементов`);
                    const optionValues = componentInstance[prop];
                    
                    // Пробуем найти нужную опцию по тексту
                    const targetLower = targetValue.trim().toLowerCase();
                    const matchingOption = optionValues.find(option => {
                      const optionText = option?.name || option?.label || option?.text || option?.value || String(option);
                      const optionTextLower = this.normalizeTextValue(optionText);
                      return optionTextLower === targetLower || 
                             optionTextLower.includes(targetLower) ||
                             targetLower.includes(optionTextLower);
                    });
                    
                    if (matchingOption) {
                      console.log(`  → Найдена соответствующая опция в данных компонента`);
                      // Пробуем установить эту опцию как выбранную через Angular API
                      const selectMethods = ['select', 'selectValue', 'setSelected', 'choose', 'onSelect'];
                      for (const methodName of selectMethods) {
                        if (typeof componentInstance[methodName] === 'function') {
                          try {
                            componentInstance[methodName](matchingOption);
                            console.log(`  → Вызван метод ${methodName}() с найденной опцией`);
                            await this.delay(300);
                            const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
                            if (confirmed) {
                              console.log('✅ Значение установлено через выбор опции в Angular API');
                              return { success: true, selectedValue: targetValue, forced: true, method: 'angular-select' };
                            }
                          } catch (e) {
                            // Игнорируем ошибки
                          }
                        }
                      }
                    }
                    
                    // Пробуем найти соответствующие DOM элементы для этих опций
                    optionValues.forEach((option, idx) => {
                      const optionText = option?.name || option?.label || option?.text || option?.value || String(option);
                      if (optionText) {
                        // Ищем DOM элемент с этим текстом
                        const textLower = this.normalizeTextValue(optionText);
                        const matchingElements = Array.from(document.querySelectorAll('*')).filter(el => {
                          const elText = extractTextFromElement(el);
                          return this.normalizeTextValue(elText) === textLower || 
                                 elText.toLowerCase().includes(textLower) ||
                                 textLower.includes(elText.toLowerCase());
                        });
                        matchingElements.forEach(el => {
                          if (qualifiesAsOption(el)) {
                            candidates.push(el);
                          }
                        });
                      }
                    });
                  }
                }
              }
            }
          } catch (e) {
            // Игнорируем ошибки доступа к Angular API
          }
        }
        
        if (dropdownPanel) {
          console.log(`🔍 Попытка ${attempt}: исследую основную панель dropdown`);
          candidates = candidates.concat(collectOptionsFromContainer(dropdownPanel, 'dropdown-panel'));
        }
        
        console.log(`🔍 Попытка ${attempt}: исследую сам app-select`);
        candidates = candidates.concat(collectOptionsFromContainer(appSelect, 'app-select'));
        
        const overlays = findNearbyOverlays();
        overlays.forEach((overlay, idx) => {
          candidates = candidates.concat(collectOptionsFromContainer(overlay, `overlay-${idx + 1}`));
        });
        
        if (attempt >= 2) {
          console.log(`🔍 Попытка ${attempt}: fallback поиск по всему документу`);
          candidates = candidates.concat(collectOptionsFromContainer(document.body, 'document-body'));
        }
        
        const uniqueCandidates = Array.from(new Set(candidates));
        if (uniqueCandidates.length > 0) {
          if (attempt > 1) {
            console.log(`✅ Опции найдены на попытке ${attempt}`);
          }
          return uniqueCandidates;
        }
        
        if (attempt < maxAttempts) {
          const waitTime = 250 * attempt;
          console.warn(`⚠️ Опции не найдены (попытка ${attempt}/${maxAttempts}), жду ${waitTime} мс и пробую снова`);
          await this.delay(waitTime);
        }
      }
      return [];
    };
    
    const allOptions = await collectAllOptionsWithRetries();
    const optionTextSamples = (allOptions || []).slice(0, 8).map(opt => {
      try {
        return extractTextFromElement(opt).slice(0, 80);
      } catch (e) {
        return '';
      }
    }).filter(Boolean);
    
    if (!allOptions || allOptions.length === 0) {
      console.warn('⚠️ Не удалось найти опции после всех попыток');
      
      const forcedResult = await this.forceSetDropdownValueWithoutOptions({
        appSelect,
        selectBoxElement,
        targetValue,
        elementId,
        reason: 'options not found'
      });
      
      if (forcedResult.success) {
        await closeDropdownPanel();
        return forcedResult;
      }
      
      return { success: false, reason: 'options not found' };
    }
    
    console.log(`📊 Всего найдено ${allOptions.length} потенциальных опций`);
    
    // Приоритизируем опции: сначала внутри панели, потом остальные
    const optionsInsidePanel = allOptions.filter(opt => dropdownPanel && dropdownPanel.contains(opt));
    const optionsOutsidePanel = allOptions.filter(opt => !dropdownPanel || !dropdownPanel.contains(opt));
    
    console.log(`  📍 Опций внутри панели: ${optionsInsidePanel.length}, вне панели: ${optionsOutsidePanel.length}`);
    
    // Ищем опцию с нужным значением (сначала в панели, потом везде)
    let matchingOption = null;
    
    const findMatchingInArray = (optionsArray, exactMatch = true) => {
      if (exactMatch) {
        return optionsArray.find(opt => {
          const optTexts = getOptionTexts(opt);
          return optTexts.some(t => {
            // Точное совпадение
            if (t === targetLower) return true;
            // Совпадение без учета регистра и пробелов
            const tClean = t.replace(/\s+/g, '');
            const targetClean = targetLower.replace(/\s+/g, '');
            return tClean === targetClean;
          });
        });
      } else {
        return optionsArray.find(opt => {
          const optTexts = getOptionTexts(opt);
          return optTexts.some(t => {
            // Частичное совпадение
            if (t.includes(targetLower) || targetLower.includes(t)) return true;
            
            // Убираем пробелы и сравниваем
            const tClean = t.replace(/\s+/g, '');
            const targetClean = targetLower.replace(/\s+/g, '');
            if (tClean.includes(targetClean) || targetClean.includes(tClean)) return true;
            
            // Для "По поручению" ищем также "поручению", "поручен", "поруч"
            if (targetLower.includes('поручен')) {
              const keywords = ['поручен', 'поручению', 'поруч', 'поручен'];
              if (keywords.some(kw => t.includes(kw) || kw.includes(t))) return true;
            }
            
            // Для "Плановый" ищем также "план"
            if (targetLower.includes('план')) {
              const keywords = ['план', 'плановый', 'планов'];
              if (keywords.some(kw => t.includes(kw) || kw.includes(t))) return true;
            }
            
            // Для "Инициативный" ищем также "инициатив"
            if (targetLower.includes('инициатив')) {
              const keywords = ['инициатив', 'инициативный', 'инициативн'];
              if (keywords.some(kw => t.includes(kw) || kw.includes(t))) return true;
            }
            
            // Сравниваем по словам (если хотя бы 2 слова совпадают)
            const targetWords = targetLower.split(/\s+/).filter(w => w.length > 2);
            const tWords = t.split(/\s+/).filter(w => w.length > 2);
            if (targetWords.length > 0 && tWords.length > 0) {
              const matchingWords = targetWords.filter(tw => 
                tWords.some(tw2 => tw2.includes(tw) || tw.includes(tw2))
              );
              if (matchingWords.length >= Math.min(2, targetWords.length)) return true;
            }
            
            return false;
          });
        });
      }
    };
    
    // Сначала точное совпадение внутри панели
    matchingOption = findMatchingInArray(optionsInsidePanel, true);
    
    // Если не нашли, точное совпадение везде
    if (!matchingOption) {
      matchingOption = findMatchingInArray(allOptions, true);
    }
    
    // Если не нашли, частичное совпадение внутри панели
    if (!matchingOption) {
      matchingOption = findMatchingInArray(optionsInsidePanel, false);
    }
    
    // Если не нашли, частичное совпадение везде
    if (!matchingOption) {
      matchingOption = findMatchingInArray(allOptions, false);
    }
    
    // Если все еще не нашли, пробуем найти по первым словам (сначала в панели)
    if (!matchingOption && targetLower.length > 3) {
      const firstWords = targetLower.split(' ').slice(0, 2).join(' ');
      matchingOption = optionsInsidePanel.find(opt => {
        const optTexts = getOptionTexts(opt);
        return optTexts.some(t => t.includes(firstWords) || firstWords.includes(t));
      });
      if (!matchingOption) {
        matchingOption = allOptions.find(opt => {
          const optTexts = getOptionTexts(opt);
          return optTexts.some(t => t.includes(firstWords) || firstWords.includes(t));
        });
      }
    }

    const findGlobalMatchingOption = () => {
      const globalSelectors = [
        '.option', // Приоритет для .option
        '.option.cutted-text', // Приоритет для .option.cutted-text
        '.result__content',
        '.result__item',
        '.result__value',
        '[role="option"]',
        '[ng-reflect-app-tooltip]',
        '[data-value]',
        '[tooltip]'
      ];
      for (const selector of globalSelectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          if (!qualifiesAsOption(node)) continue;
          const texts = getOptionTexts(node);
          if (texts.some(t => t === targetLower) ||
              texts.some(t => t.includes(targetLower) || targetLower.includes(t))) {
            return node;
          }
        }
      }
      return null;
    };

    if (!matchingOption) {
      const fallbackMatch = findGlobalMatchingOption();
      if (fallbackMatch) {
        console.log('✅ Найдена подходящая опция через глобальный поиск');
        matchingOption = fallbackMatch;
      }
    }
    
    if (matchingOption) {
      const optionText = extractTextFromElement(matchingOption);
      console.log(`✅ Найдена опция: "${optionText.substring(0, 50)}"`);
      
      // Определяем целевой элемент для клика
      let clickTarget = matchingOption;
      
      // Если найден .result__content, ищем родительский .result для клика
      if (matchingOption.classList.contains('result__content')) {
        const resultParent = matchingOption.closest('.result');
        if (resultParent) {
          clickTarget = resultParent;
          console.log(`  → Найден родительский .result для клика`);
        }
      }
      
      // Если найден span внутри .option, ищем родительский .option для клика
      if (matchingOption.tagName === 'SPAN' && matchingOption.closest('.option')) {
        const optionParent = matchingOption.closest('.option');
        if (optionParent) {
          clickTarget = optionParent;
          console.log(`  → Найден родительский .option для клика`);
        }
      }
      
      // Если найден .option, используем его напрямую
      if (matchingOption.classList.contains('option')) {
        clickTarget = matchingOption;
        console.log(`  → Использую .option напрямую для клика`);
      }
      
      // Если элемент не имеет размера, ищем ближайший кликабельный родитель
      const rect = clickTarget.getBoundingClientRect();
      if ((rect.width === 0 || rect.height === 0) && clickTarget.offsetWidth === 0 && clickTarget.offsetHeight === 0) {
        const clickableParent = clickTarget.closest('.result, [role="option"], [onclick], button, a');
        if (clickableParent && clickableParent !== clickTarget) {
          const parentRect = clickableParent.getBoundingClientRect();
          if (parentRect.width > 0 && parentRect.height > 0) {
            clickTarget = clickableParent;
            console.log(`  → Найден кликабельный родитель с размером`);
          }
        }
      }
      
      // Прокручиваем к опции
      clickTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(200);
      
      // Логируем информацию о целевом элементе
      const targetRect = clickTarget.getBoundingClientRect();
      const targetOffsetW = clickTarget.offsetWidth || 0;
      const targetOffsetH = clickTarget.offsetHeight || 0;
      console.log(`  📍 Целевой элемент: ${clickTarget.tagName}.${clickTarget.className || ''} - rect: ${targetRect.width.toFixed(0)}×${targetRect.height.toFixed(0)}, offset: ${targetOffsetW}×${targetOffsetH}`);
      
      // Пробуем разные способы клика
      let clicked = false;
      
      // Способ 1: Обычный клик
      try {
        clickTarget.click();
        await this.delay(500);
        clicked = true;
        console.log('✅ Клик выполнен обычным способом');
      } catch (e) {
        console.warn('⚠️ Обычный клик не сработал, пробую другие способы...');
      }
      
      // Способ 2: MouseEvent (click)
      if (!clicked) {
        try {
          const mouseEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1
          });
          clickTarget.dispatchEvent(mouseEvent);
          await this.delay(500);
          clicked = true;
          console.log('✅ Клик выполнен через MouseEvent (click)');
        } catch (e) {
          console.warn('⚠️ MouseEvent (click) не сработал');
        }
      }
      
      // Способ 3: mousedown + mouseup + click
      if (!clicked) {
        try {
          clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }));
          await this.delay(50);
          clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, buttons: 1 }));
          await this.delay(50);
          clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, buttons: 1 }));
          await this.delay(500);
          clicked = true;
          console.log('✅ Клик выполнен через mousedown + mouseup + click');
        } catch (e) {
          console.warn('⚠️ mousedown/mouseup/click не сработал');
        }
      }
      
      // Способ 4: Клик по родительскому элементу, если опция не кликабельна
      if (!clicked) {
        try {
          const clickableParent = clickTarget.closest('.result, [role="option"], [onclick], button, a');
          if (clickableParent && clickableParent !== clickTarget) {
            clickableParent.click();
            await this.delay(500);
            clicked = true;
            console.log('✅ Клик выполнен по родительскому элементу');
          }
        } catch (e) {
          console.warn('⚠️ Клик по родительскому элементу не сработал');
        }
      }
      
      // Проверяем, было ли значение выбрано (с несколькими попытками, так как Angular может обновлять DOM асинхронно)
      let wasSelected = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await this.delay(300);
        wasSelected = await this.checkIfValueSelected(selectBoxElement, targetValue);
        if (wasSelected) {
          console.log(`✅ Значение выбрано на попытке ${attempt + 1}`);
          break;
        }
      }
      
      // Если значение не выбрано, пробуем еще раз кликнуть по опции
      if (!wasSelected && clicked) {
        console.warn('⚠️ Значение не было выбрано после первого клика, пробую еще раз...');
        try {
          // Пробуем еще раз кликнуть по опции
          clickTarget.click();
          await this.delay(500);
          
          // Проверяем еще раз
          for (let attempt = 0; attempt < 3; attempt++) {
            await this.delay(300);
            wasSelected = await this.checkIfValueSelected(selectBoxElement, targetValue);
            if (wasSelected) {
              console.log(`✅ Значение выбрано после повторного клика (попытка ${attempt + 1})`);
              break;
            }
          }
        } catch (e) {
          console.warn('⚠️ Повторный клик не сработал:', e);
        }
      }
      
      if (wasSelected) {
        const strictCheck = strictSelectionCheck();
        if (!strictCheck.ok) {
          return { success: false, reason: 'strict confirmation failed' };
        }
        await closeDropdownPanel();
        return { success: true, selectedValue: targetValue, method: 'click-on-option' };
      } else {
        console.warn('⚠️ Значение не было выбрано после всех попыток клика');
        return { success: false, reason: 'value not selected after click attempts' };
      }
    } else {
      console.warn(`⚠️ Опция "${targetValue}" не найдена среди ${allOptions.length} опций`);
      
      // Fallback: для searchable dropdown пробуем ввести значение в поле поиска внутри панели
      // и подтвердить Enter. Это покрывает кейс, когда в списке сначала видны не все опции.
      const trySearchInputFallback = async () => {
        const candidates = [];
        if (dropdownPanel) {
          candidates.push(...Array.from(dropdownPanel.querySelectorAll('input, textarea, [contenteditable="true"]')));
        }
        if (appSelect) {
          candidates.push(...Array.from(appSelect.querySelectorAll('input, textarea, [contenteditable="true"]')));
        }
        const searchTarget = candidates.find(el => {
          const tag = (el.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea') return true;
          return !!el.isContentEditable;
        });
        if (!searchTarget) {
          return null;
        }

        try {
          searchTarget.focus?.();
          await this.delay(80);
          if ('value' in searchTarget) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
              Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) {
              setter.call(searchTarget, '');
              setter.call(searchTarget, targetValue);
            } else {
              searchTarget.value = '';
              searchTarget.value = targetValue;
            }
          } else if (searchTarget.isContentEditable) {
            searchTarget.textContent = targetValue;
          }

          searchTarget.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          searchTarget.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          await this.delay(220);

          searchTarget.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
          await this.delay(80);
          searchTarget.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
          await this.delay(420);

          const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
          const strictCheck = strictSelectionCheck();
          if (confirmed && strictCheck.ok) {
            await closeDropdownPanel();
            return { success: true, selectedValue: targetValue, method: 'search-input-enter' };
          }
          return null;
        } catch (e) {
          return null;
        }
      };
      const searchFallbackResult = await trySearchInputFallback();
      if (searchFallbackResult?.success) {
        return searchFallbackResult;
      }

      // Дополнительный fallback: typeahead через клавиатуру на самом контроле.
      // Многие кастомные селекты фильтруют опции по введённому тексту без отдельного input.
      const tryTypeaheadFallback = async () => {
        const keyTarget = primaryClickTarget || selectBoxElement;
        if (!keyTarget) return null;
        try {
          keyTarget.focus?.();
          await this.delay(80);
          const chars = String(targetValue || '').slice(0, 40).split('');
          for (const ch of chars) {
            keyTarget.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch, code: ch.length === 1 ? `Key${ch.toUpperCase()}` : '' }));
            keyTarget.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: ch, code: ch.length === 1 ? `Key${ch.toUpperCase()}` : '' }));
            keyTarget.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: ch, code: ch.length === 1 ? `Key${ch.toUpperCase()}` : '' }));
            await this.delay(20);
          }
          await this.delay(180);
          keyTarget.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
          keyTarget.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
          await this.delay(350);

          const strictCheck = strictSelectionCheck();
          if (strictCheck.ok) {
            await closeDropdownPanel();
            return { success: true, selectedValue: targetValue, method: 'typeahead-enter' };
          }
          return null;
        } catch (e) {
          return null;
        }
      };
      const typeaheadFallbackResult = await tryTypeaheadFallback();
      if (typeaheadFallbackResult?.success) {
        return typeaheadFallbackResult;
      }
      
      // Выводим список всех доступных опций для отладки
      if (allOptions.length > 0) {
        console.log('📋 Доступные опции (первые 20):');
        allOptions.slice(0, 20).forEach((opt, idx) => {
          const texts = getOptionTexts(opt);
          const text = extractTextFromElement(opt);
          const ngTooltip = opt.getAttribute('ng-reflect-app-tooltip') || '';
          const tooltip = opt.getAttribute('tooltip') || '';
          const value = opt.getAttribute('value') || '';
          const allTexts = [...texts, text, ngTooltip, tooltip, value].filter(Boolean).join(' | ');
          console.log(`  ${idx + 1}. "${allTexts.substring(0, 150)}"`);
        });
        
        // Показываем, какие опции наиболее близки к искомому значению
        console.log(`🔍 Поиск похожих опций для "${targetValue}":`);
        const targetWords = targetLower.split(/\s+/).filter(w => w.length > 2);
        const similarOptions = allOptions.map(opt => {
          const optTexts = getOptionTexts(opt);
          let score = 0;
          optTexts.forEach(t => {
            targetWords.forEach(tw => {
              if (t.includes(tw) || tw.includes(t)) score += 1;
            });
          });
          return { opt, score, texts: optTexts };
        }).filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        
        if (similarOptions.length > 0) {
          console.log('  Наиболее похожие опции:');
          similarOptions.forEach((item, idx) => {
            const text = extractTextFromElement(item.opt);
            console.log(`    ${idx + 1}. "${text}" (score: ${item.score})`);
          });
        }
      }
      
      // НЕ используем forceSetDropdownValueWithoutOptions - это приводит к "жёсткой" установке значения
      // Вместо этого возвращаем false, чтобы вызвать waitForUserSelection
      console.warn('⚠️ Опция не найдена, НЕ использую fallback - требуется ручной выбор');
      await closeDropdownPanel();
      return { success: false, reason: 'option not found', availableOptions: allOptions.map(o => {
        const text = extractTextFromElement(o);
        const ngTooltip = o.getAttribute('ng-reflect-app-tooltip') || '';
        return ngTooltip || text;
      }) };
    }
  }

  setNativeInputValue(input, value) {
    if (!input) return;
    const proto = Object.getPrototypeOf(input);
    const descriptor = (proto && Object.getOwnPropertyDescriptor(proto, 'value')) ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  async forceSetDropdownValueWithoutOptions({ appSelect, selectBoxElement, targetValue, elementId, reason }) {
    if (!appSelect || !selectBoxElement || !targetValue) {
      return { success: false };
    }
    
    const statusContainer = selectBoxElement.closest('.input-project-status') || 
      (elementId && elementId.includes('status') ? appSelect : null);
    const container = statusContainer || appSelect;
    
    if (!container) {
      return { success: false };
    }

    const controlName = this.getControlNameFromElement(appSelect, selectBoxElement);

    const angularResult = await this.trySelectViaAngularAPIs({
      appSelect,
      selectBoxElement,
      targetValue,
      controlName,
      reason
    });
    if (angularResult?.success) {
      return angularResult;
    }

    console.warn(`🛠️ Опции не найдены (${reason}), пробую установить значение "${targetValue}" через Angular API...`);
    
    // Попытка 1: Использовать Angular API для обновления компонента
    try {
      const ngComponent = this.getAngularComponent(appSelect);
      if (ngComponent) {
        // Пробуем найти свойство модели в компоненте
        const componentInstance = ngComponent.instance || ngComponent.componentInstance;
        if (componentInstance) {
          // Ищем свойства, которые могут содержать значение
          const possibleProps = ['value', 'selectedValue', 'model', 'ngModel', 'formControl', 'control', 'selected', 'selectedItem'];
          
          // Также ищем через все свойства объекта (для кастомных компонентов)
          const allProps = Object.keys(componentInstance).filter(key => {
            const val = componentInstance[key];
            return val !== null && val !== undefined && 
                   (typeof val === 'string' || typeof val === 'object' || typeof val === 'number');
          });
          
          const propsToTry = [...possibleProps, ...allProps.slice(0, 20)]; // Ограничиваем до 20 для производительности
          
          for (const prop of propsToTry) {
            if (componentInstance[prop] !== undefined) {
              try {
                // Пробуем установить значение напрямую
                const oldValue = componentInstance[prop];
                
                // Если это объект с свойствами name/label/text, обновляем их
                if (typeof oldValue === 'object' && oldValue !== null) {
                  if ('name' in oldValue) oldValue.name = targetValue;
                  if ('label' in oldValue) oldValue.label = targetValue;
                  if ('text' in oldValue) oldValue.text = targetValue;
                  if ('value' in oldValue) oldValue.value = targetValue;
                } else {
                  componentInstance[prop] = targetValue;
                }
                
                // Вызываем Angular change detection
                const zoneToken = window.ng?.coreTokens?.NgZone;
                const debugInjector = ngComponent.injector || window.ng?.getInjector?.(appSelect);
                const zone = zoneToken && debugInjector?.get ? debugInjector.get(zoneToken, null) : null;
                if (zone) {
                  zone.run(() => {
                    // Обновляем значение внутри Angular zone
                    if (typeof componentInstance[prop] === 'object' && componentInstance[prop] !== null) {
                      if ('name' in componentInstance[prop]) componentInstance[prop].name = targetValue;
                      if ('label' in componentInstance[prop]) componentInstance[prop].label = targetValue;
                      if ('text' in componentInstance[prop]) componentInstance[prop].text = targetValue;
                      if ('value' in componentInstance[prop]) componentInstance[prop].value = targetValue;
                    } else {
                      componentInstance[prop] = targetValue;
                    }
                  });
                }
                
                // Вызываем методы обновления, если они есть
                const updateMethods = ['onChange', 'writeValue', 'updateValue', 'setValue', 'patchValue', 'selectValue', 'onSelect'];
                for (const methodName of updateMethods) {
                  if (typeof componentInstance[methodName] === 'function') {
                    try {
                      componentInstance[methodName](targetValue);
                      console.log(`  → Вызван метод ${methodName}(${targetValue})`);
                    } catch (e) {
                      // Игнорируем ошибки вызова методов
                    }
                  }
                }
                
                console.log(`  → Обновлено свойство ${prop} компонента через Angular API`);
                await this.delay(300);
                
                // Проверяем, применилось ли значение
                const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
                if (confirmed) {
                  console.log('✅ Значение установлено через Angular API');
                  return { success: true, selectedValue: targetValue, forced: true, method: 'angular-api' };
                }
              } catch (e) {
                // Игнорируем ошибки для несуществующих свойств
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Не удалось использовать Angular API:', e);
    }
    
    // Попытка 2: Обновить через DOM события с правильными типами для Angular
    const textInputs = [
      container.querySelector('input.result'),
      container.querySelector('input.select-input'),
      container.querySelector('input[type="text"]'),
      selectBoxElement.querySelector('input')
    ].filter(Boolean);
    
    const hiddenInput = container.querySelector('input[type="hidden"]');
    const controlElements = controlName
      ? Array.from(document.querySelectorAll(`[formcontrolname="${controlName}"], [ng-reflect-name="${controlName}"], [ng-reflect-form-control-name="${controlName}"], [name="${controlName}"]`))
      : [];
    const resultElement = container.querySelector('.result');
    const resultContent = container.querySelector('.result__content');

    let changed = false;
    
    // Обновляем текстовые инпуты с правильными событиями для Angular
    textInputs.forEach(input => {
      try {
        this.setNativeInputValue(input, targetValue);
        // Angular слушает эти события
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        // Также пробуем Angular-специфичные события
        input.dispatchEvent(new CustomEvent('ngModelChange', { bubbles: true, detail: targetValue }));
        changed = true;
      } catch (e) {
        console.warn('⚠️ Не удалось установить значение текстового input:', e);
      }
    });

    // Обновляем скрытое поле
    if (hiddenInput) {
      try {
        this.setNativeInputValue(hiddenInput, targetValue);
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        changed = true;
      } catch (e) {
        console.warn('⚠️ Не удалось обновить скрытое поле:', e);
      }
    }

    controlElements.forEach(input => {
      try {
        this.setNativeInputValue(input, targetValue);
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new CustomEvent('ngModelChange', { bubbles: true, detail: targetValue }));
        changed = true;
      } catch (e) {
        console.warn('⚠️ Не удалось обновить formControl элемент:', e);
      }
    });

    // Обновляем отображаемые элементы
    [resultElement, resultContent, selectBoxElement].filter(Boolean).forEach(node => {
      try {
        if (node instanceof HTMLElement) {
          // Обновляем текст
          const textNode = node.querySelector('.result__content') || node;
          if (textNode) {
            textNode.textContent = targetValue;
            textNode.innerText = targetValue;
          }
          
          // Обновляем ng-reflect атрибуты
          if (appSelect) {
            appSelect.setAttribute('ng-reflect-model', targetValue);
            appSelect.setAttribute('ng-reflect-value', targetValue);
          }
          
          // Вызываем события
          node.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          node.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          node.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
          changed = true;
        }
      } catch (e) {
        console.warn('⚠️ Не удалось обновить отображение значения:', e);
      }
    });

    // Вызываем Angular change detection вручную
    try {
      const zoneToken = window.ng?.coreTokens?.NgZone;
      const injector = window.ng?.getInjector?.(appSelect) || this.getAngularComponent(appSelect)?.injector;
      const zone = zoneToken && injector?.get ? injector.get(zoneToken, null) : null;
      zone?.run?.(() => {
        // Дополнительные обновления внутри zone
      });
    } catch (e) {
      // Игнорируем, если zone недоступен
    }

    if (changed) {
      await this.delay(300);
      const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
      if (confirmed) {
        console.log('✅ Значение установлено через DOM события');
        return { success: true, selectedValue: targetValue, forced: true, method: 'dom-events' };
      }
    }

    console.warn('⚠️ Не удалось установить значение, потребуется ручной выбор');
    return { success: false };
  }
  
  getAngularComponent(element) {
    if (!element) return null;
    
    try {
      if (window.ng?.getComponent) {
        const instance = window.ng.getComponent(element);
        if (instance) {
          const injector = window.ng.getInjector?.(element);
          return { instance, componentInstance: instance, injector };
        }
      }
      
      // Пробуем получить Angular компонент через ng.probe
      if (window.ng && window.ng.probe) {
        return window.ng.probe(element);
      }
      
      // Альтернативный способ через __ngContext__ (Angular 9+)
      if (element.__ngContext__) {
        const context = element.__ngContext__;
        // Ищем компонент в контексте
        for (let i = 0; i < context.length; i++) {
          if (context[i] && context[i].constructor && context[i].constructor.name) {
            return { instance: context[i], componentInstance: context[i] };
          }
        }
      }
      
      // Пробуем через ngComponentRef
      if (element.ngComponentRef) {
        return { instance: element.ngComponentRef.instance };
      }
    } catch (e) {
      // Игнорируем ошибки доступа к Angular API
    }
    
    return null;
  }
  
  looksLikeFormControl(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const fn = (prop) => typeof obj[prop] === 'function';
    return (fn('setValue') || fn('patchValue')) && (fn('markAsDirty') || fn('markAsTouched') || fn('updateValueAndValidity'));
  }
  
  getControlNameFromElement(...elements) {
    const attrCandidates = ['formcontrolname', 'ng-reflect-name', 'ng-reflect-form-control-name', 'name', 'data-control', 'data-control-name'];
    for (const element of elements) {
      if (!element || !(element instanceof Element)) continue;
      for (const attr of attrCandidates) {
        const value = element.getAttribute?.(attr);
        if (value && value.trim()) {
          return value.trim();
        }
      }
    }
    return null;
  }
  
  findAngularFormControl(rootInstance, controlName, maxDepth = 4) {
    if (!rootInstance || typeof rootInstance !== 'object') return null;
    const visited = new Set();
    const queue = [{ obj: rootInstance, depth: 0 }];
    
    const priorityKeys = (name) => {
      if (!name) return 2;
      const lower = name.toLowerCase();
      if (controlName && lower.includes(controlName.toLowerCase())) return 0;
      if (lower.includes('control') || lower.includes('form') || lower.includes('group')) return 1;
      return 2;
    };
    
    while (queue.length > 0 && visited.size < 200) {
      const { obj, depth } = queue.shift();
      if (!obj || typeof obj !== 'object') continue;
      if (visited.has(obj)) continue;
      visited.add(obj);
      
      if (controlName) {
        if (obj.controls && obj.controls[controlName]) {
          return obj.controls[controlName];
        }
        if (obj._controls && obj._controls[controlName]) {
          return obj._controls[controlName];
        }
        if ((obj.name || obj._name) && (obj.name === controlName || obj._name === controlName) && this.looksLikeFormControl(obj)) {
          return obj;
        }
      }
      
      if (this.looksLikeFormControl(obj) && !controlName) {
        return obj;
      }
      
      if (depth >= maxDepth) continue;
      const keys = Object.keys(obj).slice(0, 30);
      keys.sort((a, b) => priorityKeys(a) - priorityKeys(b));
      
      for (const key of keys) {
        const value = obj[key];
        if (value && typeof value === 'object') {
          queue.push({ obj: value, depth: depth + 1 });
        }
      }
    }
    return null;
  }
  
  collectAngularOptionArrays(componentInstance) {
    const arrays = [];
    if (!componentInstance || typeof componentInstance !== 'object') return arrays;
    
    const inspectObject = (obj, depth = 0, propName = '') => {
      if (!obj || typeof obj !== 'object' || depth > 1) return;
      Object.keys(obj).slice(0, 30).forEach(key => {
        const value = obj[key];
        if (Array.isArray(value) && value.length > 0 && value.length <= 1000) {
          const sample = value[0];
          if (['object', 'string', 'number'].includes(typeof sample)) {
            arrays.push({ prop: propName ? `${propName}.${key}` : key, list: value });
          }
        } else if (value && typeof value === 'object') {
          if (/options|items|values|list|data|source/i.test(key)) {
            inspectObject(value, depth + 1, propName ? `${propName}.${key}` : key);
          }
        }
      });
    };
    
    inspectObject(componentInstance, 0, '');
    return arrays;
  }
  
  findMatchingAngularOption(componentInstance, targetValue) {
    if (!componentInstance || !targetValue) return null;
    const optionArrays = this.collectAngularOptionArrays(componentInstance);
    if (!optionArrays.length) return null;
    
    const targetLower = this.normalizeTextValue(targetValue);
    for (const entry of optionArrays) {
      for (const option of entry.list) {
        const optionText = typeof option === 'object'
          ? (option?.name || option?.label || option?.text || option?.value || option?.title)
          : option;
        const optionLower = this.normalizeTextValue(optionText);
        if (!optionLower) continue;
        if (optionLower === targetLower || optionLower.includes(targetLower) || targetLower.includes(optionLower)) {
          return { option, sourceProperty: entry.prop };
        }
      }
    }
    return null;
  }
  
  async trySelectViaAngularAPIs({ appSelect, selectBoxElement, targetValue, controlName, reason }) {
    if (!appSelect || !targetValue) return { success: false };
    const resolvedControlName = controlName || this.getControlNameFromElement(appSelect, selectBoxElement);
    
    const ngComponent = this.getAngularComponent(appSelect);
    const componentInstance = ngComponent?.instance || ngComponent?.componentInstance;
    const injector = ngComponent?.injector || window.ng?.getInjector?.(appSelect) || null;
    
    if (!componentInstance) {
      return { success: false };
    }
    
    const matchingOption = this.findMatchingAngularOption(componentInstance, targetValue);
    
    const selectMethodNames = ['select', 'selectValue', 'selectOption', 'setSelected', 'choose', 'onSelect', 'handleSelect'];
    if (matchingOption) {
      for (const methodName of selectMethodNames) {
        const method = componentInstance[methodName];
        if (typeof method === 'function') {
          try {
            console.log(`  → Пробую вызвать ${methodName}() через Angular API`);
            await method.call(componentInstance, matchingOption.option, targetValue);
            await this.delay(150);
            const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
            if (confirmed) {
              console.log('✅ Значение установлено через Angular select API');
              return { success: true, selectedValue: targetValue, method: 'angular-select' };
            }
          } catch (e) {
            console.warn(`   ⚠️ ${methodName}() завершился ошибкой:`, e);
          }
        }
      }
    }
    
    let angularControl = this.findAngularFormControl(componentInstance, resolvedControlName);
    if (!angularControl && resolvedControlName) {
      const parentFormElements = [
        appSelect.closest('form'),
        appSelect.closest('app-document-main-form'),
        appSelect.closest('app-document-create')
      ].filter(Boolean);
      for (const formEl of parentFormElements) {
        const formComponent = this.getAngularComponent(formEl);
        const formInstance = formComponent?.instance || formComponent?.componentInstance;
        if (formInstance) {
          angularControl = this.findAngularFormControl(formInstance, resolvedControlName);
          if (angularControl) break;
        }
      }
    }
    
    if (angularControl) {
      const candidateValues = [];
      if (matchingOption?.option) {
        candidateValues.push(matchingOption.option);
        if (matchingOption.option?.value !== undefined) candidateValues.push(matchingOption.option.value);
        if (matchingOption.option?.id !== undefined) candidateValues.push(matchingOption.option.id);
        if (matchingOption.option?.code !== undefined) candidateValues.push(matchingOption.option.code);
        const optionText = matchingOption.option?.name || matchingOption.option?.label || matchingOption.option?.text;
        if (optionText) candidateValues.push(optionText);
      }
      candidateValues.push(targetValue);
      
      for (const candidate of candidateValues.filter(Boolean)) {
        try {
          if (typeof angularControl.setValue === 'function') {
            angularControl.setValue(candidate);
          } else if (typeof angularControl.patchValue === 'function') {
            angularControl.patchValue(candidate);
          } else {
            continue;
          }
          angularControl.markAsDirty?.();
          angularControl.markAsTouched?.();
          angularControl.updateValueAndValidity?.();
          await this.delay(120);
          const confirmed = await this.checkIfValueSelected(selectBoxElement, targetValue);
          if (confirmed) {
            console.log('✅ Значение установлено через FormControl');
            return { success: true, selectedValue: targetValue, method: 'angular-control' };
          }
        } catch (e) {
          // Пробуем следующий кандидат
        }
      }
    }
    
    if (injector && window.ng?.coreTokens?.NgZone && reason) {
      try {
        const zone = injector.get(window.ng.coreTokens.NgZone, null);
        zone?.run?.(() => {});
      } catch (e) {
        // ignore
      }
    }
    
    return { success: false };
  }
  
  findNativeSelectElement(element) {
    if (!element) return null;
    if (element.tagName === 'SELECT') {
      return element;
    }
    
    if (element.closest) {
      const closestSelect = element.closest('select');
      if (closestSelect) {
        return closestSelect;
      }
    }
    
    if (element.querySelector) {
      const nestedSelect = element.querySelector('select');
      if (nestedSelect) {
        return nestedSelect;
      }
    }
    
    const appSelect = element.closest?.('app-select');
    if (appSelect && appSelect.querySelector) {
      const selectInsideApp = appSelect.querySelector('select');
      if (selectInsideApp) {
        return selectInsideApp;
      }
    }
    
    return null;
  }
  
  getNativeSelectDisplayValue(selectElement) {
    if (!selectElement) return '';
    const selectedOption = selectElement.options && selectElement.options[selectElement.selectedIndex];
    if (selectedOption) {
      return selectedOption.textContent?.trim() || selectedOption.label || selectedOption.value || '';
    }
    return selectElement.value || '';
  }
  
  normalizeTextValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    let normalized = value.toString().trim().toLowerCase();
    // Убираем множественные пробелы
    normalized = normalized.replace(/\s+/g, ' ');
    // Убираем знаки препинания в начале и конце (но оставляем внутри)
    normalized = normalized.replace(/^[.,;:!?\-—–\s]+|[.,;:!?\-—–\s]+$/g, '');
    // Убираем невидимые символы
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return normalized;
  }
  
  getNativeOptionCandidates(optionElement) {
    if (!optionElement) return [];
    const candidates = [];
    
    const text = optionElement.textContent?.trim();
    if (text) candidates.push(text.toLowerCase());
    
    const label = optionElement.label?.trim();
    if (label) candidates.push(label.toLowerCase());
    
    const value = optionElement.value?.trim();
    if (value) candidates.push(value.toLowerCase());
    
    const dataValue = optionElement.getAttribute?.('data-value');
    if (dataValue) candidates.push(dataValue.trim().toLowerCase());
    
    const tooltip = optionElement.getAttribute?.('title');
    if (tooltip) candidates.push(tooltip.trim().toLowerCase());
    
    return candidates.filter(Boolean);
  }
  
  async selectNativeOption(selectElement, targetValue) {
    if (!selectElement) {
      return { success: false, reason: 'no select element' };
    }
    
    const options = Array.from(selectElement.options || []);
    if (options.length === 0) {
      return { success: false, reason: 'native select has no options' };
    }
    
    const targetLower = this.normalizeTextValue(targetValue);
    let matchingOption = options.find(option => this.getNativeOptionCandidates(option).some(val => val === targetLower));
    
    if (!matchingOption) {
      matchingOption = options.find(option => this.getNativeOptionCandidates(option).some(val => val.includes(targetLower) || targetLower.includes(val)));
    }
    
    if (!matchingOption) {
      return { success: false, reason: 'native option not found' };
    }
    
    const valueToSet = matchingOption.value ?? matchingOption.getAttribute('data-value') ?? matchingOption.textContent ?? targetValue;
    matchingOption.selected = true;
    selectElement.value = valueToSet;
    
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    selectElement.dispatchEvent(inputEvent);
    await this.delay(20);
    selectElement.dispatchEvent(changeEvent);
    await this.delay(50);
    
    const selectedValue = matchingOption.textContent?.trim() || matchingOption.label || valueToSet;
    console.log(`✅ Значение "${selectedValue}" установлено через нативный <select>`);
    return { success: true, selectedValue };
  }

  /**
   * Парсит длинный текст dropdown и извлекает только выбранную опцию (аналогично recorder.js)
   */
  parseSelectedOptionFromText(fullText, initialValue = '') {
    if (!fullText || typeof fullText !== 'string') return null;
    
    const text = fullText.trim();
    if (!text || text.length < 2) return null;
    
    // Игнорируем placeholder
    const placeholderValues = ['выберите', 'Выберите', 'статус', 'Статус', 'select', 'placeholder'];
    if (placeholderValues.some(ph => text.toLowerCase() === ph.toLowerCase())) return null;
    
    // Если текст короткий и не содержит множественных значений, возвращаем как есть
    if (text.length < 50 && !text.includes('Плановый') && !text.includes('По поручению') && !text.includes('Инициативный')) {
      return text;
    }
    
    // Парсим длинные строки с множественными опциями
    const knownOptions = ['Плановый', 'По поручению', 'Инициативный'];
    const foundOptions = [];
    
    for (const option of knownOptions) {
      if (text.includes(option)) {
        foundOptions.push(option);
      }
    }
    
    // Если нашли опции, берем последнюю (обычно она и есть выбранная)
    if (foundOptions.length > 0) {
      return foundOptions[foundOptions.length - 1];
    }
    
    // Если текст изменился от начального значения, но не содержит известных опций,
    // пробуем извлечь первое значимое слово (не placeholder)
    const words = text.split(/\s+/).filter(word => {
      const wordLower = word.toLowerCase();
      return word.length > 2 && !placeholderValues.some(ph => wordLower.includes(ph));
    });
    
    if (words.length > 0) {
      const candidate = words[0].substring(0, 30);
      if (candidate !== initialValue) {
        return candidate;
      }
    }
    
    // Если ничего не подошло, возвращаем весь текст (но обрезанный)
    return text.length > 50 ? text.substring(0, 50) : text;
  }

  /**
   * Ждет появления опций в панели dropdown через MutationObserver
   */
  async waitForOptionsInPanel(panel, maxWaitTime = 3000) {
    return new Promise((resolve) => {
      if (!panel || !(panel instanceof Element)) {
        resolve(false);
        return;
      }
      
      const startTime = Date.now();
      const checkInterval = 200;
      
      const checkForOptions = () => {
        const hasOptions = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
        if (hasOptions) {
          resolve(true);
          return;
        }
        
        if (Date.now() - startTime >= maxWaitTime) {
          resolve(false);
          return;
        }
        
        setTimeout(checkForOptions, checkInterval);
      };
      
      // Используем MutationObserver для мгновенной реакции
      const observer = new MutationObserver(() => {
        const hasOptions = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
        if (hasOptions) {
          observer.disconnect();
          resolve(true);
        }
      });
      
      observer.observe(panel, {
        childList: true,
        subtree: true,
        attributes: true
      });
      
      // Также запускаем периодическую проверку на случай, если MutationObserver пропустит
      checkForOptions();
      
      // Отключаем observer после таймаута
      setTimeout(() => {
        observer.disconnect();
        if (Date.now() - startTime >= maxWaitTime) {
          resolve(false);
        }
      }, maxWaitTime);
    });
  }

  /**
   * Ждет, пока пользователь выберет значение вручную
   */
  async waitForUserSelection(selectBoxElement, expectedValue) {
    console.log('⏳ Ожидаю ручного выбора значения пользователем...');
    
    const maxWaitTime = 60000; // 60 секунд
    const checkInterval = 500; // Проверяем каждые 500мс
    const startTime = Date.now();
    
    const appSelect = selectBoxElement.closest('app-select');
    const nativeSelect = this.findNativeSelectElement(selectBoxElement);
    
    const readCurrentValue = () => {
      if (nativeSelect) {
        return this.getNativeSelectDisplayValue(nativeSelect) || nativeSelect.value || '';
      }
      if (appSelect) {
        const selectBox = appSelect.querySelector('.select-box, [class*="select-box"]');
        if (selectBox) {
          return selectBox.textContent?.trim() || '';
        }
      }
      return selectBoxElement.textContent?.trim() || '';
    };
    
    let initialValue = readCurrentValue();
    
    console.log(`📝 Начальное значение dropdown: "${initialValue}"`);
    console.log(`🎯 Ожидаемое значение: "${expectedValue}"`);
    console.log(`💡 Принимаю любое изменение значения как выбор пользователя`);
    
    while (Date.now() - startTime < maxWaitTime) {
      await this.delay(checkInterval);
      
      const fullText = readCurrentValue();
      if (fullText && fullText !== initialValue && fullText.toLowerCase() !== 'выберите') {
        // Парсим текст и извлекаем только выбранную опцию
        const selectedOption = this.parseSelectedOptionFromText(fullText, initialValue);
        if (selectedOption && selectedOption !== initialValue) {
          console.log(`✅ Обнаружено изменение значения: "${initialValue}" → "${selectedOption}" (из полного текста: "${fullText.substring(0, 100)}...")`);
          return selectedOption;
        }
      }
      
      const wasExpectedSelected = await this.checkIfValueSelected(selectBoxElement, expectedValue);
      if (wasExpectedSelected) {
        const currentValue = readCurrentValue();
        const parsed = this.parseSelectedOptionFromText(currentValue, initialValue);
        return parsed || currentValue || expectedValue;
      }
    }
    
    console.warn('⚠️ Время ожидания истекло, значение не было выбрано');
    return null;
  }

  /**
   * Сохраняет обновленный тест
   */
  async saveUpdatedTest() {
    if (!this.currentTest) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_TEST',
        test: this.currentTest
      });
      
      if (response && response.success) {
        console.log('✅ Обновленный тест сохранен');
      } else {
        console.warn('⚠️ Не удалось сохранить обновленный тест');
      }
    } catch (e) {
      console.error('❌ Ошибка при сохранении обновленного теста:', e);
    }
  }

  scheduleTestSave(delay = 400) {
    if (this.pendingTestSave) {
      clearTimeout(this.pendingTestSave);
    }
    this.pendingTestSave = setTimeout(() => {
      this.pendingTestSave = null;
      this.saveUpdatedTest();
    }, delay);
  }

  /**
   * Сравнивает два селектора на равенство
   */
  areSelectorsEqual(selector1, selector2) {
    if (!selector1 || !selector2) return false;
    
    // Сравниваем по selector (CSS селектору)
    if (selector1.selector && selector2.selector) {
      return selector1.selector === selector2.selector;
    }
    
    // Сравниваем по value, если selector нет
    if (selector1.value && selector2.value) {
      const val1 = typeof selector1.value === 'string' ? selector1.value : JSON.stringify(selector1.value);
      const val2 = typeof selector2.value === 'string' ? selector2.value : JSON.stringify(selector2.value);
      return val1 === val2;
    }
    
    return false;
  }

  /**
   * Удаляет неэффективные шаги из теста
   */
  async removeIneffectiveActions(testId, actionIndices) {
    if (!testId || !actionIndices || actionIndices.length === 0) {
      return { success: false, removed: 0 };
    }

    try {
      console.log(`🧹 Отправляю запрос на удаление ${actionIndices.length} неэффективных шагов...`);
      const timestamp = new Date().toISOString();
      const actionDetails = actionIndices.map(index => ({
        index,
        reason: this.playMode === 'full'
          ? 'Исключено после полного прогона'
          : 'Исключено в оптимизированном режиме',
        source: 'player',
        timestamp
      }));
      
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_INEFFECTIVE_ACTIONS',
        testId: testId,
        actionIndices: actionIndices.sort((a, b) => b - a), // Сортируем по убыванию для правильного удаления
        actionDetails,
        runMode: this.playMode
      });

      if (response && response.success) {
        console.log(`✅ Успешно удалено ${actionIndices.length} неэффективных шагов из теста`);
        console.log(`   Обновленный тест сохранен`);
      } else {
        console.warn(`⚠️ Не удалось удалить неэффективные шаги:`, response?.error || 'Unknown error');
      }
      return response || { success: false, removed: 0 };
    } catch (error) {
      console.error('❌ Ошибка при удалении неэффективных шагов:', error);
      return { success: false, removed: 0, error: error?.message };
    }
  }

  /**
   */
  getCandidateElementsForAction(action, limit = 15) {
    try {
      const tag = (action.element && (action.element.tag || action.element.tagName)) || '';
      const selector = tag ? tag.toLowerCase() : 'button, input, a, [role="button"], [role="link"], [role="option"], select';
      const nodes = document.querySelectorAll(selector);
      const out = [];
      const seen = new Set();
      for (let i = 0; i < nodes.length && out.length < limit; i++) {
        const el = nodes[i];
        if (!el.id && !el.className && !el.textContent) continue;
        const key = (el.id || '') + '|' + (el.className || '').slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          tag: el.tagName ? el.tagName.toLowerCase() : '',
          id: el.id || undefined,
          className: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 100),
          textSlice: (el.textContent || '').trim().slice(0, 80)
        });
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  /**
   * Обрабатывает API запрос
   */
  async handleApiRequest(action) {
    const api = action.api || {};
    const method = api.method || 'GET';
    let url = api.url || '';
    let headers = api.headers || {};
    let body = api.body || null;

    try {
      // Обрабатываем переменные в URL, заголовках и теле
      url = await this.processVariables(url);
      
      // Обрабатываем переменные в заголовках
      const processedHeaders = {};
      for (const [key, value] of Object.entries(headers)) {
        const processedKey = await this.processVariables(key);
        const processedValue = await this.processVariables(String(value));
        processedHeaders[processedKey] = processedValue;
      }
      
      // Обрабатываем переменные в теле запроса
      if (body) {
        if (typeof body === 'string') {
          body = await this.processVariables(body);
          try {
            body = JSON.parse(body);
          } catch (e) {
            // Если не JSON, оставляем как строку
          }
        } else if (typeof body === 'object') {
          // Рекурсивно обрабатываем все строковые значения в объекте
          const processObject = async (obj) => {
            if (typeof obj === 'string') {
              return await this.processVariables(obj);
            } else if (Array.isArray(obj)) {
              return await Promise.all(obj.map(item => processObject(item)));
            } else if (obj && typeof obj === 'object') {
              const processed = {};
              for (const [key, value] of Object.entries(obj)) {
                processed[key] = await processObject(value);
              }
              return processed;
            }
            return obj;
          };
          body = await processObject(body);
        }
      }

      console.log(`🌐 [API] Выполняю ${method} запрос: ${url}`);

      // Выполняем запрос через background script (для обхода CORS)
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        method: method,
        url: url,
        headers: processedHeaders,
        body: body
      });

      if (response && response.success) {
        console.log(`✅ [API] Запрос выполнен успешно`);
        
        const responseData = response.data;
        
        // Валидация ответа по схеме, если указана
        if (api.responseValidation && responseData !== null) {
          const validationResult = this.validateResponse(responseData, api.responseValidation.schema);
          if (!validationResult.valid) {
            console.warn(`⚠️ [API] Ответ не соответствует схеме: ${validationResult.errors.join(', ')}`);
            // Не прерываем выполнение, только предупреждаем
          } else {
            console.log(`✅ [API] Ответ валидирован по схеме`);
          }
        }
        
        // Сохраняем ответ в переменную, если указано
        if (api.saveResponse && api.responseVariable) {
          this.userVariables[api.responseVariable] = responseData;
          console.log(`💾 [API] Ответ сохранен в переменную "${api.responseVariable}"`);
        }
      } else {
        const errorMessage = response?.error || 'Неизвестная ошибка';
        console.error(`❌ [API] Ошибка запроса:`, errorMessage);
        
        // Отправляем сообщение для показа toast
        try {
          chrome.runtime.sendMessage({
            type: 'SHOW_TOAST',
            message: `❌ API ошибка: ${errorMessage}`,
            toastType: 'error'
          }).catch(() => {});
        } catch (e) {}
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage = error?.message || String(error) || 'Неизвестная ошибка';
      console.error(`❌ [API] Ошибка при выполнении запроса:`, errorMessage);
      
      // Отправляем сообщение для показа toast
      try {
        chrome.runtime.sendMessage({
          type: 'SHOW_TOAST',
          message: `❌ API ошибка: ${errorMessage}`,
          toastType: 'error'
        }).catch(() => {});
      } catch (e) {}
      
      throw error;
    }
  }

  /**
   * Обрабатывает работу с переменными
   */
  async handleVariable(action) {
    const variable = action.variable || {};
    const name = variable.name;
    const operation = variable.operation;

    if (!name) {
      console.warn('⚠️ [Variable] Имя переменной не указано');
      return;
    }

    try {
      let value = null;

      if (operation === 'extract-url') {
        // Извлечение из URL
        const urlSource = variable.urlSource || 'current';
        let url = '';
        
        if (urlSource === 'current') {
          url = window.location.href;
        } else if (urlSource === 'previous') {
          url = this.previousUrl || window.location.href;
        } else if (urlSource === 'custom') {
          url = variable.url || '';
        }

        const patternType = variable.patternType || 'query';
        const pattern = variable.pattern || '';

        if (patternType === 'query') {
          // Извлечение параметра запроса
          try {
            const urlObj = new URL(url);
            value = urlObj.searchParams.get(pattern);
          } catch (e) {
            console.warn(`⚠️ [Variable] Ошибка парсинга URL:`, e);
          }
        } else if (patternType === 'path') {
          // Извлечение сегмента пути
          try {
            const urlObj = new URL(url);
            const segments = urlObj.pathname.split('/').filter(s => s);
            const index = parseInt(pattern) - 1;
            if (index >= 0 && index < segments.length) {
              value = segments[index];
            }
          } catch (e) {
            console.warn(`⚠️ [Variable] Ошибка парсинга пути:`, e);
          }
        } else if (patternType === 'regex') {
          // Извлечение через регулярное выражение
          const regex = new RegExp(pattern);
          const match = url.match(regex);
          if (match && match[1]) {
            value = match[1];
          }
        }

        console.log(`📝 [Variable] Извлечено из URL "${url}": ${name} = "${value}"`);

      } else if (operation === 'extract-element') {
        // Извлечение из элемента
        const selector = variable.selector || '';
        const extractType = variable.extractType || 'text';
        const textSelection = variable.textSelection; // Информация о выделенном тексте

        if (!selector) {
          console.warn('⚠️ [Variable] Селектор не указан');
          return;
        }

        // ИСПРАВЛЕНИЕ #18: Используем SelectorEngine для консистентности с остальными операциями
        const element = await this.findElementWithRetry(selector, variable);
        if (!element) {
          console.warn(`⚠️ [Variable] Элемент не найден: ${selector}`);
          return;
        }

        if (extractType === 'text') {
          value = element.textContent?.trim() || '';
          
          // Если указана выделенная часть текста, используем её
          // Получаем актуальный текст элемента (он может измениться от теста к тесту)
          if (textSelection && textSelection.startIndex !== undefined && textSelection.endIndex !== undefined) {
            const fullText = value; // Актуальный текст элемента
            const startIndex = textSelection.startIndex;
            const endIndex = textSelection.endIndex;
            
            // Проверяем границы с учетом того, что текст может быть короче
            if (startIndex >= 0 && endIndex > startIndex) {
              if (endIndex <= fullText.length) {
                // Индексы в пределах текста - извлекаем часть
                value = fullText.substring(startIndex, endIndex);
                console.log(`📝 [Variable] Извлечена выделенная часть текста: символы ${startIndex}-${endIndex} из "${fullText}" = "${value}"`);
              } else {
                // Индексы выходят за пределы текста - извлекаем до конца
                value = fullText.substring(startIndex);
                console.warn(`⚠️ [Variable] Индекс конца (${endIndex}) выходит за пределы текста (длина: ${fullText.length}), извлечено до конца: "${value}"`);
              }
            } else {
              console.warn(`⚠️ [Variable] Некорректные индексы выделения: ${startIndex}-${endIndex}, используется полный текст`);
            }
          }
        } else if (extractType === 'value') {
          value = element.value || '';
          
          // Если указана выделенная часть текста, используем её
          if (textSelection && textSelection.startIndex !== undefined && textSelection.endIndex !== undefined) {
            const fullText = value; // Актуальное значение элемента
            const startIndex = textSelection.startIndex;
            const endIndex = textSelection.endIndex;
            
            // Проверяем границы с учетом того, что текст может быть короче
            if (startIndex >= 0 && endIndex > startIndex) {
              if (endIndex <= fullText.length) {
                value = fullText.substring(startIndex, endIndex);
                console.log(`📝 [Variable] Извлечена выделенная часть значения: символы ${startIndex}-${endIndex} из "${fullText}" = "${value}"`);
              } else {
                value = fullText.substring(startIndex);
                console.warn(`⚠️ [Variable] Индекс конца (${endIndex}) выходит за пределы значения (длина: ${fullText.length}), извлечено до конца: "${value}"`);
              }
            }
          }
        } else if (extractType === 'attribute') {
          const attributeName = variable.attributeName || '';
          if (attributeName) {
            value = element.getAttribute(attributeName) || '';
            
            // Если указана выделенная часть текста, используем её
            if (textSelection && textSelection.startIndex !== undefined && textSelection.endIndex !== undefined) {
              const fullText = value; // Актуальное значение атрибута
              const startIndex = textSelection.startIndex;
              const endIndex = textSelection.endIndex;
              
              // Проверяем границы с учетом того, что текст может быть короче
              if (startIndex >= 0 && endIndex > startIndex) {
                if (endIndex <= fullText.length) {
                  value = fullText.substring(startIndex, endIndex);
                  console.log(`📝 [Variable] Извлечена выделенная часть атрибута: символы ${startIndex}-${endIndex} из "${fullText}" = "${value}"`);
                } else {
                  value = fullText.substring(startIndex);
                  console.warn(`⚠️ [Variable] Индекс конца (${endIndex}) выходит за пределы атрибута (длина: ${fullText.length}), извлечено до конца: "${value}"`);
                }
              }
            }
          }
        }

        console.log(`📝 [Variable] Извлечено из элемента "${selector}": ${name} = "${value}"`);

      } else if (operation === 'set') {
        // Установка значения
        const setValue = variable.value || '';
        value = await this.processVariables(setValue);
        console.log(`📝 [Variable] Установлено значение: ${name} = "${value}"`);

      } else if (operation === 'calculate') {
        // Вычисление выражения
        const expression = variable.expression || '';
        const processedExpression = await this.processVariables(expression);
        
        // Заменяем {var:имя} на значения переменных для вычисления
        let calcExpression = processedExpression;
        const varRegex = /\{var:([^}]+)\}/g;
        const varMatches = [...calcExpression.matchAll(varRegex)];
        
        for (const match of varMatches) {
          const varName = match[1];
          const varValue = this.userVariables[varName];
          if (varValue !== undefined) {
            calcExpression = calcExpression.replace(match[0], String(varValue));
          }
        }

        const safeVal = this._safeEvaluateArithmetic(calcExpression);
        if (safeVal === undefined) {
          console.error(`❌ [Variable] Ошибка вычисления выражения "${expression}"`);
          return;
        }
        value = safeVal;
        console.log(`📝 [Variable] Вычислено: ${name} = ${expression} = ${value}`);
      }

      // Сохраняем переменную
      if (value !== null && value !== undefined) {
        this.userVariables[name] = value;
        console.log(`✅ [Variable] Переменная "${name}" сохранена: "${value}"`);
      } else {
        console.warn(`⚠️ [Variable] Значение переменной "${name}" пустое`);
      }

    } catch (error) {
      console.error(`❌ [Variable] Ошибка при работе с переменной "${name}":`, error);
    }
  }

  /**
   * Обновляет переменные из localStorage перед запуском теста
   */
  async updateLocalStorageVariables(variables) {
    const localStorageVars = [];
    
    // Находим все переменные из localStorage
    for (const [varName, varData] of Object.entries(variables)) {
      if (varData && typeof varData === 'object' && varData.source === 'localStorage' && varData.localStorageKey && varData.tabId) {
        localStorageVars.push({
          name: varName,
          key: varData.localStorageKey,
          tabId: varData.tabId
        });
      }
    }
    
    if (localStorageVars.length === 0) {
      return; // Нет переменных из localStorage
    }
    
    console.log(`🔄 [Player] Обновляю ${localStorageVars.length} переменных из localStorage`);
    
    // Группируем по tabId для оптимизации
    const varsByTab = {};
    for (const varInfo of localStorageVars) {
      if (!varsByTab[varInfo.tabId]) {
        varsByTab[varInfo.tabId] = [];
      }
      varsByTab[varInfo.tabId].push(varInfo);
    }
    
    // Обновляем переменные для каждой вкладки
    for (const [tabId, vars] of Object.entries(varsByTab)) {
      try {
        const tabIdNum = parseInt(tabId, 10);
        const currentTab = await chrome.tabs.getCurrent();
        
        // Если переменная из текущей вкладки, получаем напрямую из localStorage
        if (currentTab && currentTab.id === tabIdNum) {
          for (const varInfo of vars) {
            try {
              const value = localStorage.getItem(varInfo.key);
              // Обновляем значение, даже если оно null (это валидное значение в localStorage)
              if (value !== null) {
                variables[varInfo.name].value = value;
                console.log(`✅ [Player] Обновлена переменная "${varInfo.name}" из localStorage текущей вкладки (ключ: ${varInfo.key}, значение: ${value.substring(0, 50) + (value.length > 50 ? '...' : '')})`);
              } else {
                // Если ключ существует, но значение null, все равно обновляем
                // localStorage.getItem возвращает null только если ключ не найден
                // Но мы можем проверить, существует ли ключ
                let keyExists = false;
                try {
                  for (let i = 0; i < localStorage.length; i++) {
                    if (localStorage.key(i) === varInfo.key) {
                      keyExists = true;
                      break;
                    }
                  }
                } catch (e) {
                  // Игнорируем ошибки проверки
                }
                
                if (keyExists) {
                  // Ключ существует, но значение null - это валидное значение
                  variables[varInfo.name].value = null;
                  console.log(`✅ [Player] Обновлена переменная "${varInfo.name}" из localStorage текущей вкладки (ключ: ${varInfo.key}, значение: null)`);
                } else {
                  console.warn(`⚠️ [Player] Ключ "${varInfo.key}" не найден в localStorage текущей вкладки`);
                }
              }
            } catch (e) {
              console.warn(`⚠️ [Player] Ошибка при получении "${varInfo.key}" из localStorage: ${e.message}`);
            }
          }
        } else {
          // Если переменная из другой вкладки, запрашиваем через background script
          try {
            const response = await chrome.runtime.sendMessage({
              type: 'GET_LOCAL_STORAGE_FROM_TAB',
              tabId: tabIdNum,
              keys: vars.map(v => v.key)
            });
            
            if (response && response.success && response.data) {
              for (const varInfo of vars) {
                const value = response.data[varInfo.key];
                // Обновляем значение, даже если оно null (это валидное значение)
                if (value !== undefined) {
                  variables[varInfo.name].value = value;
                  console.log(`✅ [Player] Обновлена переменная "${varInfo.name}" из localStorage вкладки ${tabIdNum} (ключ: ${varInfo.key}, значение: ${value === null ? 'null' : (String(value).substring(0, 50) + (String(value).length > 50 ? '...' : ''))})`);
                } else {
                  console.warn(`⚠️ [Player] Ключ "${varInfo.key}" не найден в localStorage вкладки ${tabIdNum}`);
                }
              }
            } else {
              console.warn(`⚠️ [Player] Не удалось получить localStorage с вкладки ${tabIdNum}: ${response?.error || 'Unknown error'}`);
            }
          } catch (messageError) {
            console.warn(`⚠️ [Player] Ошибка при запросе localStorage с вкладки ${tabIdNum}: ${messageError.message}`);
          }
        }
      } catch (error) {
        console.error(`❌ [Player] Ошибка при обновлении переменных из localStorage для вкладки ${tabId}:`, error);
      }
    }
  }

  /**
   * Обрабатывает действие setVariable - установка переменной из записи
   */
  async handleSetVariable(action) {
    const varName = action.variableName;
    const varValue = action.variableValue;

    if (!varName) {
      console.warn('⚠️ [SetVariable] Имя переменной не указано');
      return;
    }

    try {
      // Устанавливаем переменную в контексте теста
      if (!this.testVariables) {
        this.testVariables = {};
      }

      // Если значение содержит ссылки на другие переменные, подставляем их
      let finalValue = varValue;
      if (typeof varValue === 'string' && varValue.includes('${')) {
        finalValue = this.substituteVariables(varValue);
      }

      this.testVariables[varName] = {
        value: finalValue,
        source: action.source || 'manual',
        timestamp: Date.now()
      };

      // Также сохраняем в текущий тест если он есть
      if (this.currentTest && this.currentTest.variables) {
        this.currentTest.variables[varName] = {
          value: finalValue,
          source: action.source || 'manual'
        };
      }

      console.log(`📦 [SetVariable] Переменная установлена: ${varName} = "${String(finalValue).substring(0, 50)}${String(finalValue).length > 50 ? '...' : ''}"`);

      // Отправляем сообщение в background для сохранения переменной в тест
      try {
        await chrome.runtime.sendMessage({
          type: 'SET_TEST_VARIABLE',
          testId: this.currentTestId,
          variableName: varName,
          variableValue: finalValue,
          source: action.source || 'manual'
        });
      } catch (e) {
        // Игнорируем ошибки отправки
      }

    } catch (error) {
      console.error(`❌ [SetVariable] Ошибка при установке переменной "${varName}":`, error);
    }
  }

  /**
   * Валидирует ответ API по схеме JSON Schema
   * @param {any} data - Данные для валидации
   * @param {Object} schema - JSON Schema
   * @returns {Object} Результат валидации {valid: boolean, errors: string[]}
   */
  validateResponse(data, schema) {
    const errors = [];
    
    if (!schema) {
      return { valid: true, errors: [] };
    }

    // Обработка $ref
    if (schema.$ref) {
      // В реальной реализации нужно разрешать $ref
      // Для упрощения пропускаем
      return { valid: true, errors: [] };
    }

    // Валидация типа
    if (schema.type) {
      const dataType = Array.isArray(data) ? 'array' : typeof data;
      
      if (schema.type === 'object' && dataType !== 'object') {
        errors.push(`Ожидается объект, получен ${dataType}`);
      } else if (schema.type === 'array' && dataType !== 'array') {
        errors.push(`Ожидается массив, получен ${dataType}`);
      } else if (schema.type === 'string' && dataType !== 'string') {
        errors.push(`Ожидается строка, получен ${dataType}`);
      } else if (schema.type === 'number' && dataType !== 'number') {
        errors.push(`Ожидается число, получен ${dataType}`);
      } else if (schema.type === 'integer' && (dataType !== 'number' || !Number.isInteger(data))) {
        errors.push(`Ожидается целое число, получен ${dataType}`);
      } else if (schema.type === 'boolean' && dataType !== 'boolean') {
        errors.push(`Ожидается булево значение, получен ${dataType}`);
      }
    }

    // Валидация required полей для объектов
    if (schema.type === 'object' && schema.required && Array.isArray(data) === false) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Отсутствует обязательное поле: ${field}`);
        }
      }
    }

    // Валидация properties для объектов
    if (schema.type === 'object' && schema.properties && Array.isArray(data) === false) {
      for (const [key, value] of Object.entries(data)) {
        if (schema.properties[key]) {
          const propValidation = this.validateResponse(value, schema.properties[key]);
          if (!propValidation.valid) {
            errors.push(`Ошибка в поле "${key}": ${propValidation.errors.join(', ')}`);
          }
        }
      }
    }

    // Валидация items для массивов
    if (schema.type === 'array' && schema.items && Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const itemValidation = this.validateResponse(data[i], schema.items);
        if (!itemValidation.valid) {
          errors.push(`Ошибка в элементе массива [${i}]: ${itemValidation.errors.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

// Инициализируем плеер
const testPlayer = new TestPlayer();

