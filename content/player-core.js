// Модуль воспроизведения тестов

// Загрузка общего модуля с типами действий
// Используется singleton из window.ActionTypes (загружается через manifest.json)

(function() {
  if (window.__autotestTestPlayer || window.testPlayer) return;
  window.__autotestTestPlayer = true;

/**
 * Класс для управления графом навигации в adaptive-auto режиме
 * Отслеживает посещённые URL, нажатые кнопки и позволяет делать backtrack
 */
class AdaptiveNavigationGraph {
  constructor() {
    this.nodes = new Map(); // url -> { buttons: [], visited: Set(), timestamp: Date }
    this.edges = new Map(); // buttonKey -> { from: url, to: url, success: bool, timestamp: Date }
    this.backtrackHistory = []; // История backtrack действий
  }

  /**
   * Добавить узел (URL) в граф
   */
  addNode(url, buttons) {
    if (!this.nodes.has(url)) {
      this.nodes.set(url, {
        buttons: buttons.map(btn => ({
          text: btn.text,
          selector: btn.selector,
          type: btn.type
        })),
        visited: new Set(),
        timestamp: new Date()
      });
    }
  }

  /**
   * Отметить кнопку как нажатую
   */
  markButtonClicked(url, buttonKey, newUrl, success) {
    const node = this.nodes.get(url);
    if (node) {
      node.visited.add(buttonKey);
    }
    
    this.edges.set(`${url}|${buttonKey}`, {
      from: url,
      to: newUrl,
      success: success,
      timestamp: new Date()
    });
  }

  /**
   * Получить ненажатые кнопки для URL
   */
  getUntriedButtons(url, allButtons) {
    const node = this.nodes.get(url);
    if (!node) return allButtons;
    
    return allButtons.filter(btn => {
      const key = this._makeButtonKey(btn);
      return !node.visited.has(key);
    });
  }

  /**
   * Проверить, можно ли сделать backtrack
   * Возвращает URL родителя с непробованными кнопками или null
   */
  canBacktrack(currentUrl) {
    // Ищем все edges, которые ведут к currentUrl
    for (const [edgeKey, edge] of this.edges.entries()) {
      if (edge.to === currentUrl && edge.success) {
        const parentUrl = edge.from;
        const parentNode = this.nodes.get(parentUrl);
        
        if (parentNode) {
          // Проверяем, есть ли непробованные кнопки у родителя
          const totalButtons = parentNode.buttons.length;
          const visitedButtons = parentNode.visited.size;
          
          if (visitedButtons < totalButtons) {
            return {
              url: parentUrl,
              untriedCount: totalButtons - visitedButtons
            };
          }
        }
      }
    }
    
    // Ищем любой посещённый URL с непробованными кнопками
    for (const [url, node] of this.nodes.entries()) {
      if (url !== currentUrl && node.visited.size < node.buttons.length) {
        return {
          url: url,
          untriedCount: node.buttons.length - node.visited.size
        };
      }
    }
    
    return null;
  }

  /**
   * Записать backtrack действие
   */
  recordBacktrack(fromUrl, toUrl, reason) {
    this.backtrackHistory.push({
      from: fromUrl,
      to: toUrl,
      reason: reason,
      timestamp: new Date()
    });
  }

  /**
   * Получить статистику графа
   */
  getStats() {
    let totalButtons = 0;
    let visitedButtons = 0;
    
    for (const node of this.nodes.values()) {
      totalButtons += node.buttons.length;
      visitedButtons += node.visited.size;
    }
    
    return {
      urls: this.nodes.size,
      buttons: totalButtons,
      clicked: visitedButtons,
      coverage: totalButtons > 0 ? (visitedButtons / totalButtons * 100).toFixed(1) : 0,
      backtracks: this.backtrackHistory.length
    };
  }

  _makeButtonKey(btn) {
    return `${btn.selector}|${btn.text.toLowerCase()}`;
  }
}

/**
 * Стратегии восстановления при ошибках
 * Используются в adaptive-auto для обработки различных типов ошибок
 */
const RECOVERY_STRATEGIES = {
  BUTTON_NOT_CLICKABLE: async (btn, player) => {
    console.log(`🔧 [Recovery] Попытка восстановления клика по кнопке: ${btn.text}`);
    
    // Стратегия 1: Прокрутка к элементу
    try {
      btn.element.scrollIntoView({ block: 'center', behavior: 'instant' });
      await player.delay(300);
    } catch (e) {
      console.warn('[Recovery] Scroll failed:', e.message);
    }
    
    // Стратегия 2: Фокус + клик
    try {
      btn.element.focus();
      await player.delay(100);
      btn.element.click();
      return { success: true, strategy: 'focus-click' };
    } catch (e) {
      console.warn('[Recovery] Focus-click failed:', e.message);
    }
    
    // Стратегия 3: JavaScript click
    try {
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      btn.element.dispatchEvent(clickEvent);
      return { success: true, strategy: 'dispatch-click' };
    } catch (e) {
      console.warn('[Recovery] Dispatch click failed:', e.message);
    }
    
    return { success: false, strategy: 'none' };
  },

  FIELD_NOT_FILLABLE: async (field, value, player) => {
    console.log(`🔧 [Recovery] Попытка восстановления заполнения поля`);
    
    // Стратегия 1: Focus + blur + setValue
    try {
      field.focus();
      await player.delay(50);
      field.value = value;
      field.blur();
      await player.delay(50);
      
      // Trigger events
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      return { success: true, strategy: 'focus-blur-value' };
    } catch (e) {
      console.warn('[Recovery] Focus-blur failed:', e.message);
    }
    
    // Стратегия 2: Очистка + медленный ввод
    try {
      field.value = '';
      await player.delay(100);
      
      for (const char of value) {
        field.value += char;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await player.delay(10);
      }
      
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, strategy: 'slow-typing' };
    } catch (e) {
      console.warn('[Recovery] Slow typing failed:', e.message);
    }
    
    return { success: false, strategy: 'none' };
  },

  DIALOG_BLOCKING: async (player) => {
    console.log(`🔧 [Recovery] Попытка закрытия блокирующего диалога`);
    
    // Ищем кнопки закрытия
    const closeSelectors = [
      '[aria-label*="close" i]',
      '[aria-label*="закрыть" i]',
      '.close',
      '.modal-close',
      'button[class*="close" i]',
      '[data-dismiss="modal"]',
      '.dialog-close'
    ];
    
    for (const selector of closeSelectors) {
      const closeButtons = document.querySelectorAll(selector);
      for (const btn of closeButtons) {
        try {
          const style = window.getComputedStyle(btn);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            btn.click();
            await player.delay(300);
            console.log(`✅ [Recovery] Диалог закрыт через: ${selector}`);
            return { success: true, strategy: 'close-button' };
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // Пробуем ESC
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
      await player.delay(300);
      return { success: true, strategy: 'escape-key' };
    } catch (e) {
      console.warn('[Recovery] ESC failed:', e.message);
    }
    
    return { success: false, strategy: 'none' };
  },

  AJAX_TIMEOUT: async (player) => {
    console.log(`🔧 [Recovery] Ожидание завершения AJAX запроса`);
    
    // Ищем индикаторы загрузки
    const loadingSelectors = [
      '.spinner',
      '.loading',
      '[role="progressbar"]',
      '.loader',
      '[class*="loading" i]',
      '[aria-busy="true"]'
    ];
    
    let spinner = null;
    for (const selector of loadingSelectors) {
      spinner = document.querySelector(selector);
      if (spinner) {
        const style = window.getComputedStyle(spinner);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          break;
        }
        spinner = null;
      }
    }
    
    if (spinner) {
      console.log(`⏳ [Recovery] Обнаружен spinner, ожидаем...`);
      let waitCount = 0;
      const maxWait = 20; // 10 секунд
      
      while (waitCount < maxWait) {
        await player.delay(500);
        const style = window.getComputedStyle(spinner);
        if (style.display === 'none' || style.visibility === 'hidden') {
          console.log(`✅ [Recovery] Spinner исчез после ${waitCount * 500}ms`);
          return { success: true, strategy: 'wait-spinner', waitTime: waitCount * 500 };
        }
        waitCount++;
      }
      
      console.warn(`⚠️ [Recovery] Timeout ожидания spinner (${maxWait * 500}ms)`);
      return { success: false, strategy: 'spinner-timeout' };
    }
    
    // Просто ждём дольше
    console.log(`⏳ [Recovery] Spinner не найден, просто ждём 2s`);
    await player.delay(2000);
    return { success: true, strategy: 'fixed-wait', waitTime: 2000 };
  },

  PAGE_NOT_READY: async (player) => {
    console.log(`🔧 [Recovery] Ожидание готовности страницы`);
    
    // Проверяем document.readyState
    if (document.readyState !== 'complete') {
      console.log(`⏳ [Recovery] document.readyState = ${document.readyState}, ожидаем...`);
      
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
          setTimeout(resolve, 5000); // Timeout 5s
        }
      });
      
      console.log(`✅ [Recovery] document.readyState = complete`);
    }
    
    // Дополнительная пауза для React/Angular/Vue
    await player.delay(500);
    
    return { success: true, strategy: 'wait-ready' };
  }
};

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
    this._extensionContextInvalidatedWarned = false;
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
    this._debugRunId = `run-${Date.now()}`; // для группировки debug-логов
    
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
      // На части страниц content script может загрузиться до action-types — fallback в соответствии с shared/action-types.js
      this.supportedActionTypes = new Set([
        'click', 'dblclick', 'input', 'change', 'navigate', 'navigation',
        'scroll', 'keyboard', 'keydown', 'keyup', 'keypress', 'wait',
        'api', 'variable', 'setVariable', 'assert', 'loop', 'condition',
        'javascript', 'screenshot', 'hover', 'focus', 'blur', 'clear',
        'upload', 'cookie', 'table', 'drag', 'datepicker', 'media', 'device', 'chain',
        'analysis', 'adaptive'
      ]);
      this.supportedSubtypes = {
        wait: new Set(['wait-value', 'wait-option', 'wait-options-count', 'wait-enabled', 'wait-until', 'wait-visible', 'wait-hidden', 'wait-exists', 'wait-not-exists']),
        assert: new Set(['assert-value', 'assert-contains', 'assert-count', 'assert-disabled', 'assert-multiselect', 'assert-visible', 'assert-hidden', 'assert-exists', 'assert-not-exists']),
        scroll: new Set(['scroll-element', 'scroll-top', 'scroll-bottom']),
        navigation: new Set(['nav-url', 'nav-refresh', 'nav-back', 'nav-forward', 'new-tab', 'switch-tab', 'close-tab', 'nav-get-url']),
        click: new Set(['click', 'right-click', 'double-click', 'dropdown-select', 'dropdown-multiselect', 'dropdown-deselect', 'dropdown-select-all', 'dropdown-clear-all', 'dropdown-toggle-all', 'dropdown-copy', 'dropdown-paste', 'dropdown-reorder']),
        input: new Set(['input-text', 'dropdown-datalist', 'dropdown-combobox', 'keyboard-typeahead']),
        keyboard: new Set(['press-key', 'keyboard-navigate', 'keyboard-escape']),
        cookie: new Set(['set-cookie', 'get-cookies']),
        screenshot: new Set(['visual-screenshot', 'page-screenshot', 'page-screenshot-full']),
        datepicker: new Set(['datepicker-select-date', 'datepicker-select-range', 'datepicker-select-time', 'datepicker-select-datetime', 'datepicker-clear', 'datepicker-open', 'datepicker-close']),
        analysis: new Set(['analysis-selectors', 'analysis-fill-fields', 'analysis-validate', 'analysis-forms', 'analysis-links', 'analysis-performance']),
        adaptive: new Set(['adaptive-single', 'adaptive-auto', 'adaptive-flow'])
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
      if (window !== window.top) return;
      if (this._resumePlaybackChecked) return;
      this._resumePlaybackChecked = true;
      await this.delay(300);
      let response = await chrome.runtime.sendMessage({ type: 'GET_PLAYBACK_STATE' });
      // Повтор при гонке: service worker мог ещё не загрузить playbackState из storage
      if (response?.success && !response.isPlaying && !response.test) {
        await this.delay(500);
        response = await chrome.runtime.sendMessage({ type: 'GET_PLAYBACK_STATE' });
      }
      // Поддерживаем оба формата ответа:
      // 1) { success, state: {...} }
      // 2) { success, isPlaying, test, actionIndex, nextUrl, runMode }
      const state = (response && response.success)
        ? (response.state || (response.isPlaying ? {
            test: response.test,
            actionIndex: response.actionIndex,
            nextUrl: response.nextUrl,
            runMode: response.runMode,
            runHistory: response.runHistory
          } : null))
        : null;
      if (state) {
        console.log('🔄 Найдено сохраненное состояние воспроизведения:', state);

        // Обратная совместимость: если nextUrl не задан (старые сохранения), считаем __AUTO_NAV__
        const nextUrl = state.nextUrl ?? '__AUTO_NAV__';
        const actionIndex = (state.actionIndex != null && state.actionIndex >= 0) ? state.actionIndex : 0;

        if (nextUrl === '__AUTO_NAV__') {
          await chrome.runtime.sendMessage({ type: 'CLEAR_PLAYBACK_STATE' });
          this.isGroupRun = state.isGroupRun || false;
          this.groupRunCurrentIndex = state.groupRunCurrentIndex;
          this.groupRunTotal = state.groupRunTotal;
          this.resumePlayback(state.test, actionIndex, state.runMode || 'optimized', state.runHistory);
          return;
        }

        // Проверяем URL
        const currentUrl = window.location.href;
        if (nextUrl) {
          const normalizeUrl = (url) => {
            try { return new URL(url).pathname; } catch (e) { return url; }
          };
          if (normalizeUrl(currentUrl) === normalizeUrl(nextUrl) || currentUrl === nextUrl) {
            console.log('✅ URL совпадает, восстанавливаю воспроизведение');
            await chrome.runtime.sendMessage({ type: 'CLEAR_PLAYBACK_STATE' });
            this.isGroupRun = state.isGroupRun || false;
            this.groupRunCurrentIndex = state.groupRunCurrentIndex;
            this.groupRunTotal = state.groupRunTotal;
            this.resumePlayback(state.test, actionIndex, state.runMode || 'optimized', state.runHistory);
          } else {
            console.log(`⚠️ URL не совпадает: текущий=${currentUrl}, ожидаемый=${nextUrl}`);
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

    const subtype = typeof action?.subtype === 'string' ? action.subtype.trim() : action?.subtype;
    if (subtype) {
      const subtypeLower = subtype.toLowerCase();
      // adaptive-auto и adaptive-flow всегда разрешены (обратная совместимость при кэше/разных версиях)
      if (normalizedType === 'adaptive' && (subtypeLower === 'adaptive-auto' || subtypeLower === 'adaptive-flow')) {
        return normalizedType;
      }
      const allowed = this.supportedSubtypes[normalizedType];
      const allowedLower = allowed ? new Set([...allowed].map(s => String(s).toLowerCase())) : null;
      if (allowed && !allowed.has(subtype) && !(allowedLower && allowedLower.has(subtypeLower))) {
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
    // В optimized режиме скрытые шаги пропускаем, но маркеры записи должны оставаться,
    // иначе автозапись на маркере никогда не сработает, если маркер поставлен на hidden шаг.
    return actions.filter(a => !a.hidden || a.recordMarker === true);
  }

  /**
   * Возвращает эффективное количество шагов с учётом stepSpan у adaptive-шагов
   */
  getEffectiveStepCount(actions) {
    if (!actions) return 0;
    const runtime = this.getRuntimeActions(actions);
    return runtime.reduce((sum, a) => sum + (a.stepSpan > 0 ? a.stepSpan : 1), 0);
  }

  /**
   * Возвращает номер шага для действия с индексом i (с учётом stepSpan)
   * Адаптивный шаг с stepSpan=10 занимает 10 номеров; следующий шаг начинается с current + stepSpan
   */
  getStepNumberForIndex(actions, index, startStepNumber = 0) {
    if (!actions || index < 0) return startStepNumber + 1;
    const runtime = this.getRuntimeActions(actions);
    let num = startStepNumber + 1;
    for (let j = 0; j < index && j < runtime.length; j++) {
      num += (runtime[j].stepSpan > 0 ? runtime[j].stepSpan : 1);
    }
    return num;
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
    // При новом запуске теста сбрасываем флаг паузы по маркеру
    this.pausedOnRecordMarker = false;
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

    // НОВОЕ: Проверяем наличие analysis-performance в тесте
    this.performanceMonitoringEnabled = test.actions?.some(
      action => action.type === 'analysis' && action.subtype === 'analysis-performance'
    );
    
    if (this.performanceMonitoringEnabled) {
      console.log('⚡ [Performance] Test contains analysis-performance step - starting monitoring');
      try {
        await chrome.runtime.sendMessage({
          type: 'PERFORMANCE_START_MONITORING',
          testId: test.id,
          config: {
            webVitals: true,
            resourceTiming: true,
            navigationTiming: true
          }
        });
        console.log('✅ [Performance] Monitoring started');
      } catch (error) {
        console.warn('⚠️ [Performance] Failed to start monitoring:', error);
      }
    }

    // Инициализируем историю прогона
    const startTime = Date.now();
    this.collectedRows = [];
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
      transcript: [],
      collectedRows: []
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

      // Запускаем выполнение (передаём allActions для полной временной шкалы с номерами шагов)
      await this.executeActions(runtimeActions, allActions, 0);

      // Если выполнение было прервано маркером записи, не считаем тест завершённым здесь.
      if (this.pausedOnRecordMarker) {
        console.log('⏸ [Player] Тест поставлен на паузу из-за маркера записи, финализацию откладываю до resumePlaybackAfterRecording');
        return;
      }

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

      // Сохраняем performance data по завершении теста (все шаги выполнены, временная шкала полная)
      const hasPerformanceAnalysis = test.actions?.some(
        a => a.type === 'analysis' && a.subtype === 'analysis-performance'
      );
      if (hasPerformanceAnalysis && this.currentTest?.id) {
        try {
          await chrome.runtime.sendMessage({
            type: 'PERFORMANCE_COLLECT_DATA',
            testId: this.currentTest.id
          });
          console.log('📊 [Performance] Data saved at test completion');
        } catch (e) { /* ignore */ }
      }

      await this._handleOpenDialogIfAny(3);
      this.notifyCompletion(!hasStepErrors, hasStepErrors ? (this.runHistory?.error || 'Ошибки в шагах') : null);
    } catch (error) {
      console.error('❌ Ошибка при выполнении теста:', error);
      this.notifyCompletion(false, error.message);
    } finally {
      // При паузе по маркеру не завершаем тест и не шлём TEST_COMPLETED
      if (!this.pausedOnRecordMarker) {
        this.stopPlaying();
      } else {
        console.log('⏸ [Player] stopPlaying() пропущен, так как тест на паузе по маркеру записи');
      }
    }
  }

  // ========================================================================
  // ОСНОВНОЙ ЦИКЛ ВЫПОЛНЕНИЯ ДЕЙСТВИЙ
  // ========================================================================

  /**
   * Выполняет массив действий последовательно
   * @param {Array} actions - Массив действий для выполнения (runtimeActions или remainingActions)
   * @param {Array} allActions - Полный массив всех действий теста (для вычисления общего количества)
   * @param {number} startStepNumber - Начальный номер шага (для отображения прогресса)
   * @param {number} [startActionIndex=0] - Индекс первого действия в allActions (для stepIndex при resume)
   */
  async executeActions(actions, allActions, startStepNumber = 0, startActionIndex = 0) {
    const totalSteps = this.getEffectiveStepCount(allActions);
    this._lastFillFieldsUrl = null;
    let lastExecutedStepNumber = startStepNumber;
    for (let i = 0; i < actions.length; i++) {
      if (!this.isPlaying) {
        console.log('⏹️ Воспроизведение остановлено');
        return;
      }

      const action = actions[i];
      if (!action || typeof action !== 'object') {
        console.warn(`⚠️ Шаг ${i + 1}: пропуск — действие отсутствует или неверный формат`);
        continue;
      }
      if (!action.type) {
        console.warn(`⚠️ Шаг ${i + 1}: пропуск — у действия нет типа (type)`);
        continue;
      }

      // actions здесь — runtimeActions (могут быть отфильтрованы), поэтому "startActionIndex + i"
      // не гарантирует совпадения с индексом в полном массиве allActions.
      const originalActionIndex = Array.isArray(allActions) ? allActions.indexOf(action) : -1;
      const stepIndexInTest = originalActionIndex !== -1 ? originalActionIndex : (startActionIndex + i);
      const realStepNumber = this.getStepNumberForIndex(allActions, stepIndexInTest, startStepNumber);

      // Маркер записи: как только дошли до маркера — запускаем запись и НЕ выполняем сам шаг,
      // чтобы не падать на селекторах и дать пользователю "дозаписать" нужные действия.
      if (action.recordMarker === true && stepIndexInTest >= 0) {
        this.pausedOnRecordMarker = true;
        console.log(`🔴 Обнаружен маркер записи на шаге ${stepIndexInTest + 1}, запускаю запись (до выполнения шага)...`);
        const allVisibleActions = this.getRuntimeActions(this.currentTest?.actions || []);
        this.pendingResumeAfterRecording = {
          test: this.currentTest,
          currentActionIndex: stepIndexInTest,
          visibleActions: allVisibleActions,
          playMode: this.playMode
        };
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'START_RECORDING_INTO_TEST',
            testId: this.currentTest.id,
            insertAfterIndex: stepIndexInTest,
            tabId: this.tabId
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
        return;
      }

      // Если действие скрыто и режим не 'full' — обычно пропускаем выполнение.
      // Но если на hidden-шаге стоит маркер записи — нужно запустить запись.
      if (action.hidden && this.playMode !== 'full') {
        console.log(`⏭️ Пропуск шага ${realStepNumber} / ${totalSteps} (действие скрыто)`);
        if (this.performanceMonitoringEnabled) {
          try {
            await chrome.runtime.sendMessage({
              type: 'PERFORMANCE_MARK_STEP',
              stepIndex: stepIndexInTest,
              stepType: action.type,
              metadata: { executionTime: 0 }
            });
          } catch (e) { /* Ignore */ }
        }
        continue;
      }

      // Проверяем паузу (для runtime-индекса)
      await this.checkAndSavePauseState(actions, allActions, startStepNumber, i);
      this.currentActionIndex = stepIndexInTest;
      this.navigationInitiatedByPlayer = false;

      if (realStepNumber > lastExecutedStepNumber + 1) {
        console.log(`ℹ️ Шаги ${lastExecutedStepNumber + 1}–${realStepNumber - 1} скрыты (не отображаются в списке шагов), переходим к шагу ${realStepNumber}`);
      }
      lastExecutedStepNumber = realStepNumber;

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
      let analysisActionResult = null;

      // Записываем шаг в runHistory ДО выполнения: при любом действии, вызывающем выгрузку страницы (клик по ссылке, навигация), push после execute не выполнится — теряются шаг и скриншоты.
      this.ensureRunHistoryInitialized();
      const pendingStepRecord = {
        stepNumber: realStepNumber,
        actionIndex: this.currentActionIndex,
        type: action?.type ?? 'unknown',
        actionType: action?.type ?? 'unknown',
        subtype: action?.subtype ?? undefined,
        selector: usedSelectorStr,
        value: action?.value ?? null,
        success: true,
        error: null,
        duration: 0,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        beforeScreenshot: beforeScreenshot,
        afterScreenshot: null,
        consoleErrors: this.consoleErrors.length > 0 ? [...this.consoleErrors] : undefined,
        fieldLabel: action?.fieldLabel ?? null
      };
      this.runHistory.steps.push(pendingStepRecord);
      if (this.runHistory.transcript && action) {
        this.runHistory.transcript.push(this.getStepDescription(action, realStepNumber, totalSteps));
      }

      // Действие может вызвать выгрузку страницы (клик по ссылке, навигация); pagehide может не успеть доставить runHistory. Сохраняем состояние до выполнения и ждём подтверждения.
      const mayCauseUnload = action?.type === 'click' || action?.type === 'navigate' || action?.type === 'navigation';
      if (mayCauseUnload) {
        const nextActionIndex = stepIndexInTest + 1;
        await this.savePlaybackState('__AUTO_NAV__', nextActionIndex).catch(() => {});
      }

      try {
        const { handled: dialogHandled } = await this._handleOpenDialogIfAny(3);
        if (dialogHandled) await this.delay(200);
        this._currentStepContext = (action.type === 'adaptive') ? { realStepNumber, totalSteps, actionIndex: stepIndexInTest } : null;
        this._collectedAdaptiveSubSteps = (action.type === 'adaptive') ? [] : null;
        analysisActionResult = await this.executeActionWithFallback(action, actions, allActions, i, realStepNumber, totalSteps);
        for (let poll = 0; poll < 10; poll++) {
          await this.delay(poll === 0 ? 400 : 300);
          for (let r = 0; r < 3; r++) {
            try {
              const res = await chrome.runtime.sendMessage({ type: 'CLOSE_DIALOG_MAIN' });
              if (res?.closed) { await this.delay(300); break; }
            } catch (e) {}
            await this.delay(150);
          }
          const { handled: postDialog } = await this._handleOpenDialogIfAny(5);
          if (!postDialog) break;
        }
        console.log(`✅ Шаг ${realStepNumber} выполнен успешно`);
        
        // НОВОЕ: Отправка performance mark ПОСЛЕ выполнения с executionTime (только если включён analysis-performance)
        if (this.performanceMonitoringEnabled) {
          const stepEndTime = Date.now();
          const executionTime = stepEndTime - stepStartTime;
          try {
            await chrome.runtime.sendMessage({
              type: 'PERFORMANCE_MARK_STEP',
              stepIndex: stepIndexInTest,
              stepType: action.type,
              metadata: { executionTime }
            });
          } catch (e) { /* Ignore */ }
        }
        
        if (action?.type === 'analysis' && this.currentTest?.id) {
          const actionIndex = allActions.indexOf(action);
          if (actionIndex >= 0) {
            if (!action.urlLocked) {
              chrome.runtime.sendMessage({
                type: 'UPDATE_ANALYSIS_ACTION_URL',
                testId: this.currentTest.id,
                actionIndex,
                url: window.location.href
              }).catch(() => {});
            }
            if (analysisActionResult?.success && analysisActionResult?.data) {
              const subtype = action.subtype || 'analysis-selectors';
              const data = analysisActionResult.data;
              const brokenLinks = (subtype === 'analysis-links' && data?.links)
                ? data.links.filter(l => l.isLive === false)
                : [];
              const analysisResult = {
                success: true,
                summary: data?.summary,
                selectorsCount: data?.selectors?.length || 0,
                brokenLinks,
                validationErrors: data?.validationErrors,
                debugLog: data?.debugLog,
                links: subtype === 'analysis-links' ? (data?.links || []) : undefined,
                issues: subtype === 'analysis-validate' ? (data?.issues || []) : undefined,
                forms: subtype === 'analysis-forms' ? (data?.forms || []) : undefined
              };
              chrome.runtime.sendMessage({
                type: 'UPDATE_ANALYSIS_RESULT',
                testId: this.currentTest.id,
                actionIndex,
                analysisResult
              }).catch(() => {});
            }
          }
        }
      } catch (error) {
        stepSuccess = false;
        stepError = error.message || String(error);
        for (let poll = 0; poll < 5; poll++) {
          await this.delay(poll === 0 ? 300 : 200);
          const { handled: errDialog } = await this._handleOpenDialogIfAny(3);
          if (!errDialog) break;
        }
        console.error(`❌ Шаг ${realStepNumber} / ${totalSteps} завершился с ошибкой: ${stepError}`);

        // Критическая ошибка поиска элемента: прекращаем прогон сразу,
        // чтобы не оставлять тест "висеть" на последующих шагах.
        const isElementNotFound = /Элемент не найден|Element not found|не найден/i.test(stepError);
        if (isElementNotFound) {
          const last = this.runHistory?.steps?.[this.runHistory.steps.length - 1];
          if (last && last.stepNumber === realStepNumber) {
            last.success = false;
            last.error = stepError;
            last.duration = Date.now() - stepStartTime;
          }
          this._currentStepContext = null;
          this._collectedAdaptiveSubSteps = null;
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
        actionIndex: this.currentActionIndex,
        type: action?.type ?? 'unknown',
        actionType: action?.type ?? 'unknown',
        subtype: action?.subtype ?? undefined,
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

      // Для adaptive: прикрепляем подшаги (analysis-selectors, analysis-fill-fields)
      if (action?.type === 'adaptive' && Array.isArray(this._collectedAdaptiveSubSteps) && this._collectedAdaptiveSubSteps.length > 0) {
        stepRecord.subSteps = [...this._collectedAdaptiveSubSteps];
      }
      this._collectedAdaptiveSubSteps = null;

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

      // Шаг уже записан выше (pending) до execute; обновляем его полными данными
      const lastStep = this.runHistory.steps[this.runHistory.steps.length - 1];
      if (lastStep && lastStep.stepNumber === realStepNumber) {
        lastStep.duration = stepDuration;
        lastStep.afterScreenshot = afterScreenshot;
        lastStep.success = stepSuccess;
        lastStep.error = stepError;
        lastStep.screenshot = stepRecord.screenshot;
        lastStep.beforeScreenshotPath = stepRecord.beforeScreenshotPath;
        lastStep.afterScreenshotPath = stepRecord.afterScreenshotPath;
        lastStep.screenshotPath = stepRecord.screenshotPath;
        if (action?.type === 'adaptive' && Array.isArray(stepRecord.subSteps)) {
          lastStep.subSteps = stepRecord.subSteps;
        }
      } else {
        this.runHistory.steps.push(stepRecord);
      }
      this._currentStepContext = null;
      this._collectedAdaptiveSubSteps = null;

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
          // Сохраняем частичные данные до навигации для merge при завершении теста
          const hasPerf = this.currentTest?.actions?.some(
            a => a.type === 'analysis' && a.subtype === 'analysis-performance'
          );
          if (hasPerf && this.currentTest?.id) {
            try {
              await chrome.runtime.sendMessage({
                type: 'PERFORMANCE_SAVE_PARTIAL',
                testId: this.currentTest.id
              });
            } catch (e) { /* ignore */ }
          }
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
      // Ввод после клика: выводим inputAfterClick из предыдущего шага (для старых/отредактированных тестов и когда при записи флаг не проставился)
      if (action.type === 'input' && currentIndex > 0) {
        const prev = actions[currentIndex - 1];
        if (prev && (prev.type === 'click' || prev.type === 'dblclick')) {
          if (action.inputAfterClick !== true) {
            action.inputAfterClick = true;
            if (action.delayBefore == null) action.delayBefore = 200;
          }
        }
      }
      // Для шага scroll без селектора: подставляем селектор следующего действия (прокрутка «к полю» следующего шага)
      if (action.type === 'scroll' && !action.selector && currentIndex + 1 < actions.length) {
        const nextAction = actions[currentIndex + 1];
        if (nextAction && nextAction.selector && !['wait', 'api', 'variable', 'setVariable'].includes(nextAction.type)) {
          this._scrollNextActionSelector = nextAction.selector;
        }
      } else {
        this._scrollNextActionSelector = null;
      }
      // Пауза перед действием (например 200 мс перед вводом после клика)
      if (action.delayBefore && action.delayBefore > 0) {
        await this.delay(action.delayBefore);
      }
      // === ЭТАП 0: Пробуем выполнить действие как есть ===
      const result = await this.executeAction(action);
      return result; // Успешно (для analysis — возвращаем результат)
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
                const res = await this.executeAction(action);
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
          const findResult = await this.findElementWithRetry(donorAction.selector, 5, 300);
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

      case 'try-catch':
        await this.handleTryCatch(action);
        break;

      case 'javascript':
        await this.handleJavaScript(action);
        break;

      case 'screenshot':
        if (action.subtype === 'page-screenshot-full' || action.screenshotCaptureType === 'full-page') {
          this.lastScreenshotResult = await this.handleScreenshotExtended(action);
        } else {
          this.lastScreenshotResult = await this.handleScreenshot(action);
        }
        break;

      case 'cookie':
        await this.handleCookie(action);
        break;

      case 'clipboard':
        await this.handleClipboard(action);
        break;

      case 'network':
        await this.handleNetwork(action);
        break;

      case 'table':
        await this.handleTable(action);
        break;

      case 'drag':
        await this.handleDrag(action);
        break;

      case 'datepicker':
        await this.handleDatepicker(action);
        break;

      case 'media':
        await this.handleMedia(action);
        break;

      case 'device':
        await this.handleDevice(action);
        break;

      case 'chain':
        await this.handleChain(action);
        break;

      case 'analysis':
        return await this.handleAnalysis(action);

      case 'adaptive':
        return await this.handleAdaptive(action);

      default:
        throw new Error(`Неподдерживаемый тип действия: ${action.type}`);
    }
  }

  // ========================================================================
  // ОБРАБОТЧИКИ ДЕЙСТВИЙ — загружаются из отдельных модулей
  // ========================================================================

}

// Expose class for handler module registration
window._TestPlayerClass = TestPlayer;

})();
