// Background Service Worker — importScripts (без type: module).
var _url = function(p) { return chrome.runtime.getURL(p); };
importScripts(
  _url('background/message-registry.js'),
  _url('background/feature-flags.js'),
  _url('analysis/selector-cache-sw.js'),
  _url('background/message-handlers-sw.js')
);
var _selectorCache = self.SelectorCache;
var _analysisModule = null;
var analysisModulesReady = null;
try {
  importScripts(_url('analysis/analysis-module-sw.js'));
  _analysisModule = self.AnalysisModule;
} catch (e) {
  console.warn('[Background] analysis-module-sw.js:', e && e.message);
}
analysisModulesReady = _selectorCache && _selectorCache.init
  ? _selectorCache.init().then(function() {
      console.log('[Background] Analysis modules loaded');
      return null;
    })
  : Promise.resolve();
if (!_selectorCache || !_selectorCache.init) {
  console.log('[Background] Analysis modules loaded');
}

function _ensureAnalysisModule() {
  return analysisModulesReady.then(function() { return _analysisModule; });
}

function withRetry(fn, options) {
  options = options || {};
  var maxAttempts = options.maxAttempts || 3;
  var delayMs = options.delayMs || 500;
  var shouldRetry = options.shouldRetry || function() { return true; };
  var lastError;
  function attempt(n) {
    return Promise.resolve().then(fn).catch(function(err) {
      lastError = err;
      if (n >= maxAttempts || !shouldRetry(err)) throw err;
      console.warn('[Background] Retry ' + n + '/' + maxAttempts + ':', err && err.message);
      return new Promise(function(r) { setTimeout(r, delayMs * n); }).then(function() { return attempt(n + 1); });
    });
  }
  return attempt(1);
}

/**
 * Безопасное вычисление арифметического выражения (без eval/Function).
 * Поддерживаются: числа, переменные (loopVariables, userVariables), операторы + - * / и скобки ().
 * @param {string} expr
 * @param {Object} loopVariables
 * @param {Object} userVariables
 * @returns {number|undefined}
 */
function safeEvaluateArithmetic(expr, loopVariables = {}, userVariables = {}) {
  const s = String(expr).trim();
  if (!s) return 0;
  let i = 0;
  const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const isDigit = (c) => /[0-9.]/.test(c);
  const resolveVariable = (name) => {
    if (loopVariables[name] !== undefined) return loopVariables[name];
    if (userVariables[name] !== undefined) return userVariables[name];
    return undefined;
  };
  const parseNumber = () => {
    const start = i;
    if (s[i] === '-') i++;
    while (i < s.length && isDigit(s[i])) i++;
    const num = parseFloat(s.slice(start, i));
    return (typeof num === 'number' && !isNaN(num)) ? num : undefined;
  };
  const parseIdentifier = () => {
    const start = i;
    if (/[a-zA-Z_$]/.test(s[i])) { i++; while (i < s.length && /[a-zA-Z0-9_$]/.test(s[i])) i++; }
    return s.slice(start, i);
  };
  const parseFactor = () => {
    skipSpace();
    if (i >= s.length) return undefined;
    if (s[i] === '(') {
      i++;
      const val = parseExpr();
      skipSpace();
      if (s[i] === ')') { i++; return val; }
      return undefined;
    }
    if (s[i] === '-') {
      i++;
      const val = parseFactor();
      return val !== undefined ? -val : undefined;
    }
    if (isDigit(s[i]) || (s[i] === '-' && i + 1 < s.length && isDigit(s[i + 1]))) {
      return parseNumber();
    }
    const id = parseIdentifier();
    if (id) {
      const v = resolveVariable(id);
      if (v !== undefined) return (typeof v === 'number' ? v : Number(v));
      return undefined;
    }
    return undefined;
  };
  const parseTerm = () => {
    let left = parseFactor();
    if (left === undefined) return undefined;
    for (;;) {
      skipSpace();
      if (i >= s.length) return left;
      if (s[i] === '*') { i++; const right = parseFactor(); if (right === undefined) return undefined; left = left * right; }
      else if (s[i] === '/') { i++; const right = parseFactor(); if (right === undefined) return undefined; left = right !== 0 ? left / right : 0; }
      else return left;
    }
  };
  const parseExpr = () => {
    let left = parseTerm();
    if (left === undefined) return undefined;
    for (;;) {
      skipSpace();
      if (i >= s.length) return left;
      if (s[i] === '+') { i++; const right = parseTerm(); if (right === undefined) return undefined; left = left + right; }
      else if (s[i] === '-') { i++; const right = parseTerm(); if (right === undefined) return undefined; left = left - right; }
      else return left;
    }
  };
  const result = parseExpr();
  skipSpace();
  return (i === s.length && result !== undefined) ? result : undefined;
}

class TestManager {
  constructor() {
    this.tests = new Map();
    // Группы тестов: groupId -> Group
    // Group: { id, name, description?, testIds: string[], createdAt, updatedAt, meta? }
    this.testGroups = new Map();
    this.currentTest = null;
    this.isRecording = false;
    this.isPlaying = false;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.stepType = null;
    this.playbackState = null; // Состояние воспроизведения для восстановления
    this.playbackTabId = null; // Вкладка, где идёт воспроизведение (для сброса при закрытии)
    this.recordInsertIndex = null; // Индекс для вставки записанных действий в существующий тест
    this.recordedActionsCount = 0; // Счетчик записанных действий
    this.recordMarkerActionIndex = null; // Индекс действия с маркером записи
    this.testHistory = new Map(); // История прогонов тестов: testId -> Array<RunHistory>
    this.currentVideoRecording = null; // { testId, testName, tabId } при активной записи видео
    this.currentGroupId = null;       // при запуске группы: id группы
    this.groupRunIndex = 0;           // индекс текущего теста в группе
    this.groupRunResults = [];        // результаты тестов группы для сводного отчёта
    this.groupContext = {};           // переменные, передаваемые между тестами группы
    this.groupRunMode = 'optimized';
    this.groupDebugMode = false;
    this.dataDrivenState = null;
    this.messageRegistry = new MessageRegistry(this);
    this.init();
  }


  async init() {
    try {
      console.log('🚀 [Background] Инициализация TestManager...');      
      // Загружаем сохраненные тесты и группы из storage
      const data = await chrome.storage.local.get(['tests', 'testGroups', 'playbackState', 'testHistory']);
      if (data.tests && typeof data.tests === 'object') {
        this.tests = new Map(Object.entries(data.tests));
        console.log(`✅ Загружено ${this.tests.size} тестов из storage`);
      } else {
        console.log('ℹ️ Тесты не найдены в storage, начинаем с пустого списка');
        this.tests = new Map();
      }

      // Загружаем группы тестов
      if (data.testGroups && typeof data.testGroups === 'object') {
        this.testGroups = new Map(Object.entries(data.testGroups));
        console.log(`✅ Загружено ${this.testGroups.size} групп тестов из storage`);
      } else {
        console.log('ℹ️ Группы тестов не найдены в storage, начинаем с пустого списка');
        this.testGroups = new Map();
      }
      
      // Загружаем историю прогонов
      if (data.testHistory && typeof data.testHistory === 'object') {
        this.testHistory = new Map();
        // Приводим все ключи к строкам для консистентности
        for (const [testId, history] of Object.entries(data.testHistory)) {
          const normalizedTestId = String(testId);
          this.testHistory.set(normalizedTestId, Array.isArray(history) ? history : []);
        }
        console.log(`✅ Загружена история для ${this.testHistory.size} тестов`);
        // Логируем детали загруженной истории
        for (const [testId, history] of this.testHistory.entries()) {
          console.log(`   📊 Тест ${testId}: ${history.length} прогонов`);
        }
      } else {
        console.log('ℹ️ История прогонов не найдена в storage, начинаем с пустого списка');
        this.testHistory = new Map();
      }
      
      // Восстанавливаем состояние воспроизведения из storage
      if (data.playbackState) {
        console.log('📥 Найдено состояние воспроизведения в storage:', {
          testId: data.playbackState.test?.id,
          testName: data.playbackState.test?.name,
          actionIndex: data.playbackState.actionIndex,
          nextUrl: data.playbackState.nextUrl,
          hasTest: !!data.playbackState.test,
          testActionsCount: data.playbackState.test?.actions?.length
        });
        
        // Проверяем структуру теста
        if (data.playbackState.test) {
          const test = data.playbackState.test;
          console.log('🔍 Проверка структуры теста:', {
            hasId: !!test.id,
            hasName: !!test.name,
            hasActions: !!test.actions,
            actionsIsArray: Array.isArray(test.actions),
            actionsCount: test.actions?.length,
            hasCreatedAt: !!test.createdAt,
            hasUpdatedAt: !!test.updatedAt
          });
          
          // Проверяем структуру первого действия для примера
          if (test.actions && test.actions.length > 0) {
            const firstAction = test.actions[0];
            console.log('🔍 Проверка структуры первого действия:', {
              hasType: !!firstAction.type,
              hasSelector: !!firstAction.selector,
              hasTimestamp: !!firstAction.timestamp,
              type: firstAction.type,
              selectorType: typeof firstAction.selector
            });
          }
        } else {
          console.error('❌ Тест отсутствует в playbackState!');
        }
        
        this.playbackState = {
          ...data.playbackState,
          runMode: data.playbackState.runMode || 'optimized'
        };
        this.isPlaying = true;
        
        console.log('✅ Восстановлено состояние воспроизведения из storage:', {
          testId: this.playbackState.test?.id,
          testName: this.playbackState.test?.name,
          actionIndex: this.playbackState.actionIndex,
          nextUrl: this.playbackState.nextUrl,
          isPlaying: this.isPlaying,
          hasTest: !!this.playbackState.test
        });
      } else {
        console.log('ℹ️ Состояние воспроизведения не найдено в storage');
      }
    } catch (error) {
      console.error('❌ Ошибка при загрузке данных из storage:', error);
      this.tests = new Map();
    }
    
    // Инициализируем настройки плагина, если их ещё нет в storage
    try {
      const settingsData = await chrome.storage.local.get('pluginSettings');
      if (!settingsData.pluginSettings) {
        const defaultSettings = {
          selectorEngine: { finder: { enabled: true, version: 'lite' }, optimalSelect: { enabled: true, version: 'lite' }, uniqueSelector: { enabled: true, version: 'lite' } },
          performance: { cacheSelectors: true, maxSelectorLength: 200, selectorTimeout: 5000 },
          advanced: { verboseLogging: false, excludeHiddenElements: true, smartWaits: true },
          autotests: { enabled: true },
          analytics: { enabled: false },
          videoRecording: { enabled: false, makeSeekable: false },
          files: { uploaded: [] },
          excelExport: { enabled: true, autoExportEnabled: false, exportOnRecord: true, exportOnPlay: true, exportOnOptimize: true, format: 'xls', delimiter: ';', exportPath: '', recordConsoleErrors: false, appendCollectedData: false },
          mediaSavePath: 'AutoTestRecorder',
          screenshots: { saveToDisk: false, onlyOnError: false, storeInMemory: true, format: 'jpeg', quality: 85 },
          recordingMode: 'auto',
          selectorStrategy: 'stability',
          pickerSettings: { timeout: 5, showScores: true, highlightBest: true, maxVisible: 4 },
          playback: { stepTimeoutSeconds: 5, showRunNotifications: true }
        };
        await chrome.storage.local.set({ pluginSettings: defaultSettings });
        console.log('✅ [Background] Дефолтные настройки плагина записаны в storage');
      }
    } catch (settingsError) {
      console.warn('⚠️ [Background] Не удалось инициализировать настройки:', settingsError);
    }

    // Слушаем сообщения от content scripts и popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const t = message?.type;
      if (t !== 'GET_TEST_HISTORY' && t !== 'GET_STATE') {
        console.log('📬 Новое сообщение получено:', t);
      }
      
      // Обрабатываем асинхронно
      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('❌ Ошибка при обработке сообщения:', error);
        sendResponse({ success: false, error: error.message });
      });
      
      return true; // Асинхронный ответ
    });

    registerBackgroundMessageHandlers(this, this.messageRegistry);
    
    console.log('✅ Background script инициализирован, слушатель сообщений установлен');
  }

  onPlaybackTabRemoved(tabId) {
    if (!this.isPlaying || this.playbackTabId == null || this.playbackTabId !== tabId) {
      return;
    }
    const testId = this.playbackState?.test?.id;
    const testName = this.playbackState?.test?.name;
    this.playbackTabId = null;
    (async () => {
      try {
        if (testId) await this.stopVideoRecordingIfActive(testId);
      } catch (e) { /* ignore */ }
      this.isPlaying = false;
      this.currentStep = 0;
      this.totalSteps = 0;
      this.stepType = null;
      this.playbackState = null;
      try {
        await chrome.storage.local.remove('playbackState');
      } catch (e) { /* ignore */ }
      try {
        await this.broadcast({
          type: 'TEST_COMPLETED',
          testId: testId || '',
          testName,
          success: false,
          error: 'Вкладка воспроизведения закрыта'
        });
      } catch (e) { /* ignore */ }
      try {
        await this.broadcast({
          type: 'STEP_PROGRESS_UPDATE',
          step: 0,
          total: 0,
          stepType: null,
          testId
        });
      } catch (e) { /* ignore */ }
    })();
  }

  async handleMessage(message, sender, sendResponse) {
    const messageType = String(message?.type || message?.action || message?.command || '').trim();
    if (messageType !== 'GET_TEST_HISTORY' && messageType !== 'GET_STATE') {
      console.log('📨 Получено сообщение:', messageType, message);
    }
    
    // Флаг для отслеживания, был ли отправлен ответ
    let responseSent = false;
    const safeSendResponse = (response) => {
      if (!responseSent) {
        responseSent = true;
        try {
          sendResponse(response);
        } catch (error) {
          console.error('❌ Ошибка при отправке ответа:', error);
        }
      }
    };
    
    try {
      if (this.messageRegistry) {
        const handled = await this.messageRegistry.handle(messageType, message, sender, safeSendResponse);
        if (handled) {
          return;
        }
      }
      switch (messageType) {
        case 'START_RECORDING':
          break;

        case 'START_RECORDING_INTO_TEST':
          break;

        case 'STOP_RECORDING':
          break;

        case 'ADD_ACTION':
          break;

        case 'SET_TEST_VARIABLE': {
          break;
        }

        case 'DOWNLOAD_FILE': {
          break;
        }

        case 'UPDATE_TEST': {
          break;
        }

        case 'SELECTOR_FOUND_DURING_PLAYBACK': {
          break;
        }

        case 'UPDATE_ANALYSIS_ACTION_URL': {
          try {
            const { testId, actionIndex, url } = message;
            const test = testId ? this.tests.get(String(testId)) : null;
            if (test && typeof actionIndex === 'number' && actionIndex >= 0 && actionIndex < (test.actions?.length || 0) && url) {
              const a = test.actions[actionIndex];
              if (a?.type === 'analysis' && !a.urlLocked) {
                a.url = url;
                await this.saveTests();
              }
            }
            safeSendResponse({ success: true });
          } catch (e) {
            safeSendResponse({ success: false, error: e?.message });
          }
          return;
        }

        case 'UPDATE_ANALYSIS_RESULT': {
          try {
            const { testId, actionIndex, analysisResult } = message;
            const test = testId ? this.tests.get(String(testId)) : null;
            if (test && typeof actionIndex === 'number' && actionIndex >= 0 && actionIndex < (test.actions?.length || 0) && analysisResult) {
              const a = test.actions[actionIndex];
              if (a?.type === 'analysis') {
                a.analysisResult = analysisResult;
                await this.saveTests();
                chrome.runtime.sendMessage({ type: 'TEST_UPDATED', testId }).catch(() => {});
              }
            }
            safeSendResponse({ success: true });
          } catch (e) {
            safeSendResponse({ success: false, error: e?.message });
          }
          return;
        }

        case 'MARK_SELECTOR_SUSPICIOUS': {
          // Помечаем селектор как сомнительный в тесте
          try {
            const testId = message.testId;
            const actionIdx = message.actionIndex;
            const test = this.tests.get(String(testId));
            if (test && actionIdx >= 0 && actionIdx < test.actions.length) {
              const action = test.actions[actionIdx];
              if (!action._suspiciousSelectors) {
                action._suspiciousSelectors = [];
              }
              action._suspiciousSelectors.push({
                selector: message.originalSelector,
                reason: message.reason || 'Элемент не найден при воспроизведении',
                donorStep: message.donorStepIndex,
                replacedAt: new Date().toISOString()
              });
              // Обновляем селектор
              if (message.newSelector) {
                action.selector = message.newSelector;
              }
              // Сохраняем тест
              await this.saveTests();
              console.log(`🔄 [Background] Селектор шага ${actionIdx + 1} помечен как сомнительный в тесте "${test.name}"`);
            }
            safeSendResponse({ success: true });
          } catch (e) {
            console.warn('⚠️ Ошибка при пометке селектора:', e);
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }

        case 'GET_SETTINGS': {
          try {
            const { pluginSettings } = await chrome.storage.local.get('pluginSettings');
            safeSendResponse({
              success: true,
              settings: pluginSettings || {},
              isGroupRun: !!this.currentGroupId
            });
          } catch (e) {
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }

        case 'GET_LOCAL_STORAGE_FROM_TAB':
          break;

        case 'CLEAR_ALL_SCREENSHOTS':
          break;

        case 'ANALYZE_TEST_HISTORY':
          break;

        case 'OPTIMIZE_SELECTORS_FROM_HISTORY':
          break;

        case 'PLAY_TEST': {
          await this.handlePlayTest(message, safeSendResponse);
          return;
        }
        case 'PAUSE_PLAYBACK':
          break;

        case 'RESUME_PLAYBACK_FROM_PAUSE':
          break;

        case 'STOP_PLAYING':
        case 'FORCE_STOP':
          break;

        case 'API_REQUEST':
          break;

        case 'GENERATE_TEST_DATA':
          break;

        case 'ANALYZE_SELECTOR':
          break;

        // Analysis Feature - Page Analysis
        case 'RUN_ANALYSIS': {
          try {
            if (typeof chrome === 'undefined' || !chrome.scripting) {
              safeSendResponse({ success: false, error: 'chrome.scripting not available' });
              return;
            }
            const analysisModule = await _ensureAnalysisModule();
            let { tabId, analysisType, url, fillOptions, containerSelector, targetValue } = message;
            
            const actionName = self.ActionCatalog ? self.ActionCatalog.RUN_ANALYSIS : 'analysis.run';
            const accessDecision = self.AccessPolicy && self.AccessPolicy.can
              ? await self.AccessPolicy.can(actionName, { analysisType })
              : { allowed: true };
            const isEnabled = await FeatureFlags.isEnabled('ANALYSIS_STEP');
            if (!accessDecision.allowed || !isEnabled) {
              safeSendResponse({
                success: false,
                error: accessDecision.allowed
                  ? 'Analysis feature is not enabled. Please upgrade to Pro.'
                  : 'TIER_REQUIRED',
                requiredTier: accessDecision.requiredTier || 'premium',
                tier: accessDecision.tier || 'free',
                action: actionName
              });
              return;
            }
            
            // Если tabId не передан, сначала используем вкладку-источник сообщения.
            // Это важно при нескольких вкладках с одинаковым URL: анализ должен идти в текущей вкладке плеера.
            if (!tabId && sender?.tab?.id) {
              tabId = sender.tab.id;
            }

            // Если tabId не передан, но передан URL - ищем вкладку по URL
            if (!tabId && url) {
              try {
                const tabs = await chrome.tabs.query({});
                const matchingTab = tabs.find(t => {
                  if (!t.url) return false;
                  try {
                    const tabUrlObj = new URL(t.url);
                    const targetUrlObj = new URL(url);
                    return tabUrlObj.origin + tabUrlObj.pathname === targetUrlObj.origin + targetUrlObj.pathname;
                  } catch {
                    return t.url === url;
                  }
                });
                if (matchingTab) {
                  tabId = matchingTab.id;
                  console.log(`🔍 [RUN_ANALYSIS] Found tab ${tabId} for URL: ${url}`);
                }
              } catch (e) {
                console.warn('⚠️ [RUN_ANALYSIS] Could not find tab by URL:', e);
              }
            }
            
            if (!tabId) {
              safeSendResponse({ success: false, error: 'No tab found for analysis. Please open the target page first.' });
              return;
            }
            
            // Run analysis using AnalysisModule
            if (analysisModule) {
              const runOptions = { fillOptions };
              if (analysisType === 'fill-single-dropdown') {
                runOptions.containerSelector = containerSelector;
                runOptions.targetValue = targetValue;
              }
              const result = await analysisModule.runAnalysis(tabId, analysisType, runOptions);
              
              // Save selectors to cache (if SelectorCache is available)
              if (result.success && _selectorCache) {
                const tab = await chrome.tabs.get(tabId);
                
                if (result.data?.selectors && result.data.selectors.length > 0) {
                  // Для analysis-selectors - сохраняем напрямую
                  await _selectorCache.saveSelectors(tabId, tab.url, result.data.selectors, result.data.summary);
                  
                  // НОВОЕ: Также сохраняем в collectedSelectors для совместимости с Settings UI
                  try {
                    const collected = await chrome.storage.local.get(['collectedSelectors']);
                    const collectedSelectors = collected.collectedSelectors || {};
                    collectedSelectors[tab.url] = result.data.selectors.map(s => ({
                      selector: s.selector,
                      label: s.text || s.attributes?.placeholder || s.attributes?.name || '',
                      type: s.element
                    }));
                    await chrome.storage.local.set({ collectedSelectors });
                    console.log(`✅ [RUN_ANALYSIS] Saved ${result.data.selectors.length} selectors to collectedSelectors`);
                  } catch (e) {
                    console.warn('⚠️ [RUN_ANALYSIS] Could not save to collectedSelectors:', e);
                  }
                } else {
                  // Для других типов анализа - дополнительно запускаем analysis-selectors
                  // чтобы кэш был доступен для следующих шагов (Клик, Ввод и т.д.)
                  try {
                    const selectorsResult = await analysisModule.runAnalysis(tabId, 'analysis-selectors');
                    if (selectorsResult.success && selectorsResult.data?.selectors) {
                      await _selectorCache.saveSelectors(tabId, tab.url, selectorsResult.data.selectors, selectorsResult.data.summary);
                      console.log(`✅ [RUN_ANALYSIS] Also saved ${selectorsResult.data.selectors.length} selectors for ${analysisType}`);
                      
                      // НОВОЕ: Также сохраняем в collectedSelectors
                      try {
                        const collected = await chrome.storage.local.get(['collectedSelectors']);
                        const collectedSelectors = collected.collectedSelectors || {};
                        collectedSelectors[tab.url] = selectorsResult.data.selectors.map(s => ({
                          selector: s.selector,
                          label: s.text || s.attributes?.placeholder || s.attributes?.name || '',
                          type: s.element
                        }));
                        await chrome.storage.local.set({ collectedSelectors });
                      } catch (e) {
                        console.warn('⚠️ [RUN_ANALYSIS] Could not save to collectedSelectors:', e);
                      }
                    }
                  } catch (e) {
                    console.warn('⚠️ [RUN_ANALYSIS] Could not save selectors cache:', e);
                  }
                }
              }
              
              // Сохраняем performance data сразу в background (надёжнее, чем через player)
              if (analysisType === 'analysis-performance' && result.success && result.data?.hasDetailedReport && result.data?.performanceData) {
                const perfTestId = message.testId || result.data?.performanceData?.testId || 'latest';
                try {
                  const storageKey = `performanceData_${perfTestId}`;
                  await chrome.storage.local.set({
                    [storageKey]: {
                      testId: perfTestId,
                      timestamp: Date.now(),
                      data: result.data.performanceData
                    },
                    'performanceData_latest': {
                      testId: perfTestId,
                      timestamp: Date.now(),
                      data: result.data.performanceData
                    }
                  });
                  console.log('✅ [RUN_ANALYSIS] Performance data saved directly:', storageKey);
                } catch (perfErr) {
                  console.warn('⚠️ [RUN_ANALYSIS] Failed to save performance data:', perfErr);
                }
              }
              
              safeSendResponse(result);
            } else {
              safeSendResponse({ success: false, error: 'AnalysisModule not loaded' });
            }
          } catch (e) {
            console.error('❌ RUN_ANALYSIS error:', e);
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }
        
        case 'GET_CACHED_SELECTORS': {
          try {
            await _ensureAnalysisModule();
            const { tabId, currentUrl, url } = message;
            console.log(`📥 [Background] Получено сообщение GET_CACHED_SELECTORS`);
            console.log(`   Tab ID: ${tabId}`);
            console.log(`   URL: ${url || currentUrl}`);
            
            let selectors = [];
            
            if (!_selectorCache) {
              console.error('❌ [Background] SelectorCache не загружен');
              safeSendResponse({ success: true, selectors: [] });
              return;
            }
            
            // Если передан только URL (без tabId) - ищем кэш по URL
            if (!tabId && (url || currentUrl)) {
              const targetUrl = url || currentUrl;
              console.log(`   Поиск кэша по URL: ${targetUrl}`);
              selectors = await _selectorCache.getSelectorsByUrl(targetUrl);
            } else if (tabId) {
              console.log(`   Поиск кэша по tabId: ${tabId}`);
              selectors = await _selectorCache.getSelectorsList(tabId, currentUrl);
            }
            
            console.log(`   Найдено селекторов: ${selectors.length}`);
            safeSendResponse({ success: true, selectors });
          } catch (e) {
            console.error('❌ [Background] Ошибка при получении кэшированных селекторов:', e);
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }
        
        case 'SAVE_CACHED_SELECTORS': {
          try {
            await _ensureAnalysisModule();
            const { tabId, url, selectors, metadata } = message;
            console.log(`📥 [Background] Получено сообщение SAVE_CACHED_SELECTORS`);
            console.log(`   Tab ID: ${tabId}`);
            console.log(`   URL: ${url}`);
            console.log(`   Количество селекторов: ${selectors?.length || 0}`);
            console.log(`   Metadata:`, metadata);
            
            if (!_selectorCache) {
              console.error('❌ [Background] SelectorCache не загружен');
              safeSendResponse({ success: false, error: 'SelectorCache not loaded' });
              return;
            }
            
            console.log(`   Сохранение селекторов в кэш...`);
            await _selectorCache.saveSelectors(tabId, url, selectors, metadata);
            console.log(`✅ [Background] Сохранено ${selectors.length} селекторов для ${url}`);
            safeSendResponse({ success: true });
          } catch (e) {
            console.error('❌ [Background] Ошибка при сохранении селекторов:', e);
            console.error(`   Stack trace:`, e.stack);
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }
        
        case 'CLEAR_SELECTOR_CACHE': {
          try {
            await _ensureAnalysisModule();
            const { tabId } = message;
            if (!_selectorCache) {
              safeSendResponse({ success: false, error: 'SelectorCache not loaded' });
              return;
            }
            if (tabId) {
              await _selectorCache.clearForTab(tabId);
            } else {
              await _selectorCache.clearAll();
            }
            safeSendResponse({ success: true });
          } catch (e) {
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }
        
        case 'GET_SELECTOR_CACHE_STATS': {
          try {
            await _ensureAnalysisModule();
            if (!_selectorCache) {
              safeSendResponse({ success: true, stats: {} });
              return;
            }
            const stats = _selectorCache.getStats();
            safeSendResponse({ success: true, stats });
          } catch (e) {
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }
        
        case 'CHECK_FEATURE_FLAG': {
          try {
            const { flagName } = message;
            const isEnabled = await FeatureFlags.isEnabled(flagName);
            safeSendResponse({ success: true, enabled: isEnabled });
          } catch (e) {
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }
        case 'CHECK_ACCESS': {
          try {
            const action = message?.action || '';
            const context = message?.context || null;
            if (!self.AccessPolicy || !self.AccessPolicy.can) {
              safeSendResponse({ success: true, allowed: true, action });
              return;
            }
            const decision = await self.AccessPolicy.can(action, context);
            safeSendResponse({ success: true, ...decision });
          } catch (e) {
            safeSendResponse({ success: false, error: e.message });
          }
          return;
        }

        case 'TEST_STEP_PROGRESS':
          break;

        case 'TEST_STEP_COMPLETED':
          break;

        case 'SAVE_PLAYBACK_STATE':
          break;

        case 'GET_PLAYBACK_STATE':
          break;

        case 'GET_CURRENT_TAB':
          break;

        case 'ANALYZE_TEST_ERROR':
          break;

        case 'TEST_COMPLETED': {
          break;
        }

        case 'REMOVE_INEFFECTIVE_ACTIONS': {
          break;
        }
        case 'OPEN_POPUP':
          break;

        case 'CLOSE_POPUP_IF_OPEN':
          break;

        default:
          safeSendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handlePlayTest(message, sendResponse) {
    let responseSent = false;
    const safeSendResponse = (response) => {
      if (!responseSent) {
        responseSent = true;
        try {
          sendResponse(response);
        } catch (error) {
          console.error('❌ Ошибка при отправке ответа:', error);
        }
      }
    };

    // Определяем режим: если не указан, используем оптимизированный если доступен, иначе полный
    let runMode = message.mode;
    if (!runMode) {
      const testToCheck = this.tests.get(message.testId);
      const hasOptimization = testToCheck?.optimization?.optimizedAvailable === true;
      runMode = hasOptimization ? 'optimized' : 'full';
    }

    // При запуске из редактора передаётся текущий тест (message.test) — используем его,
    // чтобы учитывать снятие скрытия шагов без обязательного сохранения.
    let testToPlay = message.test && message.test.id === message.testId
      ? message.test
      : this.tests.get(message.testId);
    if (!testToPlay) {
      safeSendResponse({ success: false, error: 'Test not found' });
      return;
    }

    const actionsForRun = (testToPlay.actions || []).filter(action => {
      return runMode === 'full' ? true : !action.hidden;
    });
    if (actionsForRun.length === 0) {
      safeSendResponse({ success: false, error: 'NO_STEPS_TO_PLAY' });
      return;
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.stepType = null;
    this.playbackState = null; // Сбрасываем предыдущее состояние

    if (!message.dataDrivenStart && !message._fromDataDrivenQueue && this.dataDrivenState) {
      this.dataDrivenState = null;
    }
    if (message.dataDrivenStart && Array.isArray(message.dataDrivenRows) && message.dataDrivenRows.length > 0) {
      const MAX_DATA_DRIVEN_ROWS = 50;
      const rows = message.dataDrivenRows.slice(0, MAX_DATA_DRIVEN_ROWS);
      this.dataDrivenState = {
        testId: message.testId,
        rows,
        index: 0,
        mode: runMode,
        debugMode: !!message.debugMode,
        test: message.test && message.test.id === message.testId ? message.test : testToPlay,
        results: []
      };
      message.groupContext = { ...(message.groupContext || {}), ...rows[0] };
    }

    let testToSend = testToPlay;
    if (message.groupContext && typeof message.groupContext === 'object' && Object.keys(message.groupContext).length > 0) {
      const baseVars = testToPlay.variables || {};
      const merged = { ...baseVars };
      for (const [k, v] of Object.entries(message.groupContext)) {
        merged[k] = (v && typeof v === 'object' && 'value' in v) ? v : { value: v, source: 'group', updatedAt: new Date().toISOString() };
      }
      testToSend = { ...testToPlay, variables: merged };
    }

    const playPayloadBase = { type: 'PLAY_TEST', test: testToSend, mode: runMode, debugMode: message.debugMode || false };
    if (this.dataDrivenState && String(this.dataDrivenState.testId) === String(message.testId)) {
      playPayloadBase.dataDrivenRowIndex = this.dataDrivenState.index;
      playPayloadBase.dataDrivenRowTotal = this.dataDrivenState.rows.length;
    }
    if (message.isGroupRun) {
      playPayloadBase.isGroupRun = true;
      playPayloadBase.groupRunCurrentIndex = message.groupRunCurrentIndex;
      playPayloadBase.groupRunTotal = message.groupRunTotal;
    }

    this.totalSteps = actionsForRun.length;
    // Сохраняем начальное состояние воспроизведения
    this.playbackState = {
      test: testToPlay,
      actionIndex: 0,
      nextUrl: null,
      runMode
    };

    // Проверяем, есть ли в тесте действия, требующие визуального интерфейса
    const actionsToCheck = actionsForRun;

    const visualActionTypes = ['click', 'dblclick', 'input', 'change', 'scroll', 'navigation', 'keyboard', 'javascript', 'screenshot', 'adaptive', 'analysis'];
    const hasVisualActions = actionsToCheck.some(action => {
      if (visualActionTypes.includes(action.type)) {
        return true;
      }
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

    // URL для выбора вкладки берём только из шагов навигации (переход, новая вкладка).
    // Шаги анализа (получить селекторы, заполнить поля) не переходят по URL — они выполняются на текущей странице.
    const firstActionWithUrl = testToPlay.actions?.find(action => {
      const rawUrl = action.url != null && action.url !== '' ? action.url : action.value;
      if (rawUrl == null || rawUrl === '') return false;
      const url = String(rawUrl).trim();
      if (!url) return false;
      if (url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('edge://')) return false;
      if (url.includes('/editor/editor.html') || url.includes('editor_ru.html')) return false;
      // Только навигация: явный переход или открытие вкладки
      if (action.type === 'navigation' && (action.subtype === 'nav-url' || action.subtype === 'new-tab')) return true;
      if (action.type === 'navigate') return true;
      return false;
    });
    const urlForTab = firstActionWithUrl?.url || firstActionWithUrl?.value;
    const normalizeUrl = (raw) => {
      if (raw == null || raw === '') return null;
      const s = String(raw).trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) return s;
      if (s.startsWith('//')) return 'https:' + s;
      // "ya.ru" / "www.example.com" -> assume https
      return 'https://' + s.replace(/^\//, '');
    };
    const targetUrl = urlForTab;
    const normalizedTargetUrl = normalizeUrl(targetUrl);

    // Если первый шаг — new-tab, открываем ОДНУ вкладку и сразу передаём RESUME_TEST (шаг 2+)
    // Иначе background открывает вкладку + PLAY_TEST, а player потом ещё раз открывает вкладку через new-tab = 2 вкладки
    const firstVisibleAction = actionsToCheck[0];
    const isFirstActionNewTab = firstVisibleAction?.type === 'navigation' && firstVisibleAction?.subtype === 'new-tab';
    if (hasVisualActions && isFirstActionNewTab) {
      const newTabRaw = firstVisibleAction.url != null && firstVisibleAction.url !== '' ? firstVisibleAction.url : firstVisibleAction.value;
      const newTabUrl = normalizeUrl(newTabRaw) || 'about:blank';
      try {
        console.log(`🔗 [Background] Первый шаг new-tab — открываю одну вкладку ${newTabUrl} и передаю RESUME_TEST`);
        const newTab = await chrome.tabs.create({ url: newTabUrl, active: true });
        await new Promise((resolve) => {
          const listener = (tabId, info) => {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(resolve, 10000);
        });
        const userVars = {};
        if (testToSend.variables) {
          for (const [k, v] of Object.entries(testToSend.variables)) {
            userVars[k] = (v && typeof v === 'object' && v.value !== undefined) ? v.value : v;
          }
        }
        const testState = {
          testId: testToPlay.id,
          testName: testToPlay.name,
          actions: testToPlay.actions,
          currentActionIndex: 1,
          userVariables: userVars,
          isPlaying: true,
          ...(message.isGroupRun && { isGroupRun: true, groupRunCurrentIndex: message.groupRunCurrentIndex, groupRunTotal: message.groupRunTotal })
        };
        const contentFiles = TestManager.CONTENT_SCRIPT_FILES || ['content/content.js', 'content/player-core.js'];
        await chrome.scripting.executeScript({ target: { tabId: newTab.id }, files: contentFiles });
        await chrome.tabs.sendMessage(newTab.id, { type: 'RESUME_TEST', testState });
        this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, newTab.id).catch(() => {});
        console.log(`✅ [Background] Тест передан в вкладку ${newTab.id} (с шага 2)`);
        safeSendResponse({ success: true });
        return;
      } catch (e) {
        console.warn(`⚠️ [Background] Ошибка при запуске через new-tab, fallback на обычный поток: ${e?.message || e}`);
      }
    }

    if (!hasVisualActions) {
      console.log('✅ Тест не содержит действий с визуальным интерфейсом (только переменные/API/wait), разрешаю запуск из редактора');
      console.log(`   Режим: ${runMode}, проверено действий: ${actionsToCheck.length}, всего действий в тесте: ${testToPlay.actions?.length || 0}`);
    } else {
      console.log('⚠️ Тест содержит действия с визуальным интерфейсом, требуется обычная вкладка');
      console.log(`   Режим: ${runMode}, проверено действий: ${actionsToCheck.length}, всего действий в тесте: ${testToPlay.actions?.length || 0}`);
    }

    // Пытаемся использовать текущую вкладку пользователя
    let targetTabId = null;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isExtensionPage = activeTab?.url?.startsWith('chrome-extension://') ||
        activeTab?.url?.startsWith('chrome://') ||
        activeTab?.url?.startsWith('edge://');

      if (activeTab && activeTab.id) {
        if (!hasVisualActions && isExtensionPage) {
          console.log('✅ Тест без действий с визуальным интерфейсом, разрешаю запуск на extension странице (редактор)');
          console.log('   Выполняю тест напрямую из background script (без content scripts)');

          // Для тестов без визуальных действий выполняем их напрямую из background script
          this.executeTestFromBackground(testToPlay, runMode, message.debugMode || false).catch(error => {
            console.error('❌ Ошибка при выполнении теста из background:', error);
          });

          safeSendResponse({ success: true });
          return;
        } else if (!isExtensionPage) {
          if (normalizedTargetUrl) {
            try {
              const currentUrl = new URL(activeTab.url);
              const targetUrlObj = new URL(normalizedTargetUrl);
              const urlsMatch = currentUrl.origin === targetUrlObj.origin;
              if (urlsMatch) {
                console.log(`✅ Использую текущую вкладку пользователя: ${activeTab.url}`);
                targetTabId = activeTab.id;
              } else {
                console.log('⚠️ URL текущей вкладки не совпадает с целевым URL');
                console.log(`   Текущая: ${activeTab.url}`);
                console.log(`   Целевая: ${normalizedTargetUrl}`);
              }
            } catch (e) {
              console.warn('⚠️ Не удалось сравнить origin активной вкладки с targetUrl:', e?.message || e);
            }
          } else {
            console.log('✅ Использую текущую вкладку пользователя (нет целевого URL в тесте)');
            targetTabId = activeTab.id;
          }
        } else if (isExtensionPage && hasVisualActions) {
          console.log('⚠️ Текущая вкладка - это extension страница, но тест содержит действия с визуальным интерфейсом, пропускаю её');
        }
      }

      if (!targetTabId && normalizedTargetUrl) {
        const allTabs = await chrome.tabs.query({});
        const matchingTab = allTabs.find(tab => {
          if (!tab.url) return false;
          if (tab.url.startsWith('chrome-extension://') ||
            tab.url.startsWith('chrome://') ||
            tab.url.startsWith('edge://')) {
            return false;
          }
          try {
            const tabUrl = new URL(tab.url);
            const targetUrlObj = new URL(normalizedTargetUrl);
            return tabUrl.origin === targetUrlObj.origin;
          } catch (e) {
            return false;
          }
        });

        if (matchingTab) {
          console.log(`✅ Найдена подходящая вкладка: ${matchingTab.url}`);
          targetTabId = matchingTab.id;
          await chrome.tabs.update(matchingTab.id, { active: true });
        }
      }

      // Если активна вкладка редактора и нет вкладки с целевым URL — использовать любую открытую обычную страницу (тест на любой странице)
      if (!targetTabId && isExtensionPage && hasVisualActions) {
        const allTabs = await chrome.tabs.query({});
        const anyWebTab = allTabs.find(tab => {
          if (!tab.url || !tab.id) return false;
          return (tab.url.startsWith('http://') || tab.url.startsWith('https://')) &&
            !tab.url.includes('/editor/') &&
            !tab.url.includes('editor_ru.html') &&
            !tab.url.includes('editor.html');
        });
        if (anyWebTab) {
          console.log(`✅ Запуск теста на открытой странице (без перехода по URL теста): ${anyWebTab.url}`);
          targetTabId = anyWebTab.id;
          await chrome.tabs.update(anyWebTab.id, { active: true });
        }
      }

      // Не открываем новую вкладку автоматически: в тесте нет шага навигации/открытия вкладки.
      // Если нет подходящей вкладки — просим пользователя открыть страницу и запустить снова.
      if (!targetTabId && (normalizedTargetUrl || targetUrl)) {
        console.log('⚠️ Нет подходящей вкладки для запуска теста. Не открываю новую вкладку (в тесте нет шага навигации).');
        safeSendResponse({
          success: false,
          error: 'Нет вкладки для запуска. Откройте вкладку с нужной страницей (или откройте любую страницу, на которой нужно выполнить тест), затем нажмите «Запуск» снова.'
        });
        return;
      }

      if (!targetTabId && !targetUrl) {
        if (!hasVisualActions) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab && activeTab.id) {
            console.log(`✅ Тест без действий с визуальным интерфейсом, использую текущую вкладку (редактор): ${activeTab.url}`);
            targetTabId = activeTab.id;
          } else {
            console.error('❌ Не удалось найти активную вкладку');
            safeSendResponse({ success: false, error: 'No active tab found' });
            return;
          }
        } else {
          // Есть визуальные действия, но нет targetUrl: не открываем вкладку по URL из шагов.
          // Ищем любую открытую вкладку с веб-страницей или просим пользователя открыть страницу.
          const allTabs = await chrome.tabs.query({});
          const webTab = allTabs.find(tab => {
            if (!tab.url || !tab.id) return false;
            return (tab.url.startsWith('http://') || tab.url.startsWith('https://')) &&
              !tab.url.includes('/editor/editor.html');
          });
          if (webTab) {
            console.log(`✅ Использую открытую вкладку для визуальных действий: ${webTab.url}`);
            targetTabId = webTab.id;
            await chrome.tabs.update(webTab.id, { active: true });
          } else {
            console.log('⚠️ Нет подходящей вкладки. Не открываю новую вкладку (в тесте нет шага навигации).');
            safeSendResponse({
              success: false,
              error: 'Нет вкладки для запуска. Откройте вкладку с нужной страницей (или откройте любую страницу, на которой нужно выполнить тест), затем нажмите «Запуск» снова.'
            });
            return;
          }
        }
      }
    } catch (error) {
      console.error('❌ Ошибка при поиске/создании вкладки:', error);
    }

    if (targetTabId) {
      try {
        const targetTab = await chrome.tabs.get(targetTabId);
        const isExtensionPage = targetTab?.url?.startsWith('chrome-extension://') ||
          targetTab?.url?.startsWith('chrome://') ||
          targetTab?.url?.startsWith('edge://');

        if (isExtensionPage && !hasVisualActions) {
          console.log('📦 Тест уже выполняется из background script, пропускаю отправку сообщения');
        } else {
          this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, targetTabId).catch(() => {});
          await chrome.tabs.sendMessage(targetTabId, { ...playPayloadBase, tabId: targetTabId });
          console.log(`✅ PLAY_TEST отправлен в вкладку ${targetTabId}`);
        }
      } catch (error) {
        console.warn('⚠️ Не удалось отправить сообщение в целевую вкладку:', error);
        const targetTab = await chrome.tabs.get(targetTabId).catch(() => null);
        const isExtensionPage = targetTab?.url?.startsWith('chrome-extension://') ||
          targetTab?.url?.startsWith('chrome://') ||
          targetTab?.url?.startsWith('edge://');

        if (isExtensionPage && !hasVisualActions) {
          console.log('📦 Тест уже выполняется из background script, игнорирую ошибку отправки сообщения');
        } else {
          // Пробуем внедрить content scripts (вкладка могла открыться до установки расширения).
          // Запись видео уже запущена в try (один вызов), повторно не вызываем — иначе «Cannot capture a tab with an active stream».
          const injected = await this.injectContentScriptsIfNeeded(targetTabId, targetTab?.url);
          if (injected) {
            await new Promise(r => setTimeout(r, 300));
            try {
              await chrome.tabs.sendMessage(targetTabId, { ...playPayloadBase, tabId: targetTabId });
              console.log(`✅ PLAY_TEST отправлен в вкладку ${targetTabId} после внедрения скриптов`);
            } catch (retryErr) {
              console.warn('⚠️ Повторная отправка после внедрения не удалась:', retryErr);
              await this.broadcast({ ...playPayloadBase, targetTabId });
            }
          } else {
            await this.broadcast({ ...playPayloadBase, targetTabId });
          }
        }
      }
    } else {
      if (!hasVisualActions) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          console.log(`✅ Тест без действий с визуальным интерфейсом, использую текущую вкладку (редактор): ${activeTab.url}`);
          const isExtensionPage = activeTab.url?.startsWith('chrome-extension://') ||
            activeTab.url?.startsWith('chrome://') ||
            activeTab.url?.startsWith('edge://');
          if (isExtensionPage && !hasVisualActions) {
            console.log('✅ Тест уже выполняется из background script для extension страницы');
          } else {
            this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, activeTab.id).catch(() => {});
            try {
            await chrome.tabs.sendMessage(activeTab.id, { ...playPayloadBase, tabId: activeTab.id });
              console.log(`✅ PLAY_TEST отправлен в текущую вкладку ${activeTab.id}`);
            } catch (error) {
              console.error('❌ Ошибка при отправке сообщения:', error);
              safeSendResponse({ success: false, error: 'Failed to send message to tab' });
              return;
            }
          }
        } else {
          console.error('❌ Не удалось найти активную вкладку');
          safeSendResponse({ success: false, error: 'No active tab found' });
          return;
        }
      } else {
        const firstValidUrl = testToPlay.actions?.find(action => {
          const u = action.url == null ? '' : String(action.url).trim();
          if (!u) return false;
          return !u.startsWith('chrome-extension://') &&
            !u.startsWith('chrome://') &&
            !u.startsWith('edge://') &&
            !u.includes('/editor/editor.html');
        })?.url;

        const tabUrlFromFirst = normalizeUrl(firstValidUrl != null ? String(firstValidUrl) : '');
        if (tabUrlFromFirst) {
          console.log(`📂 Открываю новую вкладку с первым найденным URL: ${tabUrlFromFirst}`);
          try {
            const newTab = await chrome.tabs.create({ url: tabUrlFromFirst });
            await new Promise(resolve => setTimeout(resolve, 1500));
            this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, newTab.id).catch(() => {});
            try {
              await chrome.tabs.sendMessage(newTab.id, { ...playPayloadBase, tabId: newTab.id });
              console.log(`✅ PLAY_TEST отправлен в новую вкладку ${newTab.id}`);
            } catch (sendError) {
              console.error('❌ Ошибка при отправке сообщения в новую вкладку:', sendError);
              await this.broadcast({ ...playPayloadBase, targetTabId: newTab.id });
            }
          } catch (error) {
            console.error('❌ Ошибка при открытии вкладки для запуска теста:', error);
            safeSendResponse({ success: false, error: 'Failed to open tab for test' });
            return;
          }
        } else {
          const hasJavaScriptOnly = actionsToCheck.some(a => a.type === 'javascript') &&
            !actionsToCheck.some(a => ['click', 'dblclick', 'input', 'change', 'scroll', 'navigation', 'keyboard'].includes(a.type));
          if (hasJavaScriptOnly) {
            console.log('📂 Тест содержит только JavaScript, открываю пустую страницу для выполнения');
            try {
              const newTab = await chrome.tabs.create({ url: 'data:text/html,<html><head><title>AutoTest</title></head><body></body></html>' });
              await new Promise(resolve => setTimeout(resolve, 800));
              this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, newTab.id).catch(() => {});
              try {
                await chrome.tabs.sendMessage(newTab.id, { ...playPayloadBase, tabId: newTab.id });
                console.log(`✅ PLAY_TEST отправлен в about:blank вкладку ${newTab.id}`);
              } catch (sendError) {
                const injected = await this.injectContentScriptsIfNeeded(newTab.id, 'about:blank');
                if (injected) {
                  await new Promise(r => setTimeout(r, 500));
                  await chrome.tabs.sendMessage(newTab.id, { ...playPayloadBase, tabId: newTab.id });
                }
              }
              safeSendResponse({ success: true });
            } catch (error) {
              console.error('❌ Ошибка при открытии about:blank:', error);
              safeSendResponse({ success: false, error: 'Failed to open tab' });
              return;
            }
          } else {
            console.error('❌ Не найдено подходящих URL в тесте для запуска');
            safeSendResponse({ success: false, error: 'No valid URL found in test' });
            return;
          }
        }
      }
    }

    safeSendResponse({ success: true });
  }

  /**
   * Запускает запись видео вкладки, если включено в настройках. Не блокирует воспроизведение.
   */
  async startVideoRecordingIfEnabled(testId, testName, tabId) {
    if (!tabId) return;
    try {
      const { pluginSettings } = await chrome.storage.local.get('pluginSettings');
      if (pluginSettings?.videoRecording?.enabled !== true) {
        console.log('🎬 [Video] Запись видео выключена в настройках');
        return;
      }
      const offscreenUrl = chrome.runtime.getURL('video-recorder/offscreen.html');
      if (typeof chrome !== 'undefined' && !chrome.offscreen) {
        console.warn('⚠️ [Video] Запись видео недоступна: нужен Chrome 109+ (API chrome.offscreen). Обновите браузер или используйте Chrome.');
        return;
      }
      try {
        const hasDoc = await chrome.offscreen.hasDocument?.();
        if (!hasDoc) {
          await chrome.offscreen.createDocument({
            url: offscreenUrl,
            reasons: ['USER_MEDIA'],
            justification: 'Record test playback to video file'
          });
        }
      } catch (e) {
        if (!String(e?.message || '').includes('single offscreen') && !String(e?.message || '').includes('already exists')) {
          throw e;
        }
      }
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      if (!streamId) {
        console.warn('⚠️ [Video] getMediaStreamId не вернул streamId');
        return;
      }
      this.currentVideoRecording = { testId: String(testId), testName: testName || '', tabId };
      chrome.runtime.sendMessage({ type: 'START_RECORDING', streamId }).catch(() => {});
      console.log('🎬 [Video] Запись видео запущена для теста', testId);
    } catch (err) {
      console.warn('⚠️ [Video] Не удалось запустить запись:', err?.message || err);
    }
  }

  /**
   * Останавливает запись видео для теста testId и сохраняет файл в Загрузки.
   * Учитывает настройку videoRecording.makeSeekable (постобработка для перемотки).
   */
  async stopVideoRecordingIfActive(testId) {
    const rec = this.currentVideoRecording;
    if (!rec || String(rec.testId) !== String(testId)) return;
    const testName = (this.tests.get(String(testId))?.name) || rec.testName || '';
    this.currentVideoRecording = null;
    try {
      const { pluginSettings } = await chrome.storage.local.get('pluginSettings');
      const makeSeekable = pluginSettings?.videoRecording?.makeSeekable === true;
      const mediaBase = (pluginSettings?.mediaSavePath || 'AutoTestRecorder').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
      const videosPath = (mediaBase || 'AutoTestRecorder') + '/videos';
      chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
        testId: String(testId),
        testName,
        makeSeekable,
        savePath: videosPath
      }).catch(() => {});
      console.log('🎬 [Video] Запись видео остановлена, файл сохраняется' + (makeSeekable ? ' (с постобработкой для перемотки)' : ''));
    } catch (err) {
      console.warn('⚠️ [Video] Ошибка при остановке записи:', err?.message || err);
    }
  }

  async saveTests() {
    try {
      const testsObj = Object.fromEntries(this.tests);
      await withRetry(() => chrome.storage.local.set({ tests: testsObj }), {
        maxAttempts: 3,
        delayMs: 300,
        shouldRetry: (err) => !String(err?.message || '').includes('QUOTA')
      });
      console.log(`💾 Сохранено ${this.tests.size} тестов в storage`);
    } catch (error) {
      console.error('❌ Ошибка при сохранении тестов:', error);
      throw error;
    }
  }

  /**
   * Сохраняет группы тестов в chrome.storage.local.
   * Формат: { [groupId]: Group }
   */
  async saveTestGroups() {
    try {
      const groupsObj = Object.fromEntries(this.testGroups);
      await withRetry(() => chrome.storage.local.set({ testGroups: groupsObj }), {
        maxAttempts: 3,
        delayMs: 300,
        shouldRetry: (err) => !String(err?.message || '').includes('QUOTA')
      });
      console.log(`💾 Сохранено ${this.testGroups.size} групп тестов в storage`);
    } catch (error) {
      console.error('❌ Ошибка при сохранении групп тестов:', error);
      throw error;
    }
  }

  /**
   * Запускает группу тестов: задаёт контекст группы и запускает первый тест.
   * Следующие тесты запускаются из обработчика TEST_COMPLETED с передачей переменных (groupContext).
   * @param {string} groupId
   * @param {'optimized'|'full'} runMode
   * @param {boolean} debugMode
   */
  async playTestGroup(groupId, runMode = 'optimized', debugMode = false) {
    const gid = String(groupId);
    const group = this.testGroups.get(gid);
    if (!group || !Array.isArray(group.testIds) || group.testIds.length === 0) {
      console.warn('[Background] Группа тестов не найдена или пуста:', groupId);
      throw new Error('Группа не найдена или пуста');
    }
    const firstTestId = String(group.testIds[0]);
    const test = this.tests.get(firstTestId) || this.tests.get(Number(firstTestId));
    if (!test) {
      console.warn('[Background] Первый тест группы не найден:', firstTestId);
      throw new Error('Первый тест группы не найден');
    }
    this.currentGroupId = gid;
    this.groupRunIndex = 0;
    this.groupRunResults = [];
    this.groupContext = {};
    this.groupRunMode = runMode;
    this.groupDebugMode = !!debugMode;
    console.log(`▶️ [Background] Запуск группы тестов ${gid}: ${group.testIds.length} тест(ов)`);
    return new Promise((resolve, reject) => {
      this.handlePlayTest(
        { testId: firstTestId, mode: runMode, debugMode: !!debugMode, groupContext: this.groupContext, isGroupRun: true, groupRunCurrentIndex: 0, groupRunTotal: group.testIds.length },
        (res) => {
          if (!res?.success) {
            console.warn('[Background] Ошибка при запуске первого теста группы:', firstTestId, res?.error);
          }
          resolve();
        }
      );
    });
  }

  async saveTestHistory() {
    try {
      // Сохраняем только последние 20 прогонов для каждого теста, чтобы не перегружать storage
      const historyObj = {};
      for (const [testId, history] of this.testHistory.entries()) {
        // Приводим testId к строке для консистентности
        const normalizedTestId = String(testId);
        
        // Оставляем только последние 10 прогонов для экономии квоты storage
        const limitedHistory = history.slice(-10);
        
        // Удаляем большие поля из каждого прогона перед сохранением
        // ВАЖНО: Оставляем скриншоты в последнем прогоне для просмотра
        const cleanedHistory = limitedHistory.map((run, runIndex) => {
          const cleanedRun = { ...run };
          // Убеждаемся, что testId правильный
          cleanedRun.testId = normalizedTestId;
          // Последний прогон (самый новый) - оставляем скриншоты для просмотра
          const isLastRun = runIndex === limitedHistory.length - 1;
          
          if (cleanedRun.steps) {
            cleanedRun.steps = cleanedRun.steps.map(step => {
              const cleanedStep = { ...step };
              // Удаляем большие поля, которые занимают много места
              // Но сохраняем пути к файлам скриншотов
              if (cleanedStep.screenshotComparison) {
                // Для последнего прогона оставляем diffImage, для остальных - только путь
                if (!isLastRun && cleanedStep.screenshotComparison.diffImage) {
                  delete cleanedStep.screenshotComparison.diffImage;
                }
                if (cleanedStep.screenshotComparison.diffImagePath) {
                  cleanedStep.screenshotComparison.diffImagePath = cleanedStep.screenshotComparison.diffImagePath;
                }
              }
              if (cleanedStep.screenshotComparisonView) {
                // Для последнего прогона оставляем, для остальных удаляем
                if (!isLastRun) {
                  delete cleanedStep.screenshotComparisonView;
                }
              }
              // Сохраняем пути к скриншотам, если они есть
              cleanedStep.beforeScreenshotPath = cleanedStep.beforeScreenshotPath || null;
              cleanedStep.afterScreenshotPath = cleanedStep.afterScreenshotPath || null;
              cleanedStep.errorScreenshotPath = cleanedStep.errorScreenshotPath || null;
              cleanedStep.screenshotPath = cleanedStep.screenshotPath || null;
              // Лимит: скриншоты >1MB не сохраняем в storage (quota ~5MB). 1MB чтобы viewport-скриншоты ~950KB сохранялись.
              const MAX_SCREENSHOT_BYTES = 1000000;
              const stripIfTooLarge = (s) => (s && typeof s === 'string' && s.length > MAX_SCREENSHOT_BYTES);
              if (stripIfTooLarge(cleanedStep.screenshot)) delete cleanedStep.screenshot;
              if (stripIfTooLarge(cleanedStep.beforeScreenshot)) delete cleanedStep.beforeScreenshot;
              if (stripIfTooLarge(cleanedStep.afterScreenshot)) delete cleanedStep.afterScreenshot;
              if (stripIfTooLarge(cleanedStep.errorScreenshot)) delete cleanedStep.errorScreenshot;
              if (cleanedStep.screenshotComparison?.diffImage && stripIfTooLarge(cleanedStep.screenshotComparison.diffImage)) {
                delete cleanedStep.screenshotComparison.diffImage;
              }
              if (stripIfTooLarge(cleanedStep.screenshotComparisonView)) delete cleanedStep.screenshotComparisonView;
              // Удаляем скриншоты для старых прогонов (не последний)
              if (!isLastRun) {
                if (cleanedStep.screenshot) delete cleanedStep.screenshot;
                if (cleanedStep.beforeScreenshot) delete cleanedStep.beforeScreenshot;
                if (cleanedStep.afterScreenshot) delete cleanedStep.afterScreenshot;
                if (cleanedStep.errorScreenshot) delete cleanedStep.errorScreenshot;
              }
              return cleanedStep;
            });
          }
          // Удаляем скриншоты из самого прогона только для старых прогонов
          if (!isLastRun && cleanedRun.screenshots) {
            delete cleanedRun.screenshots;
          } else if (isLastRun && Array.isArray(cleanedRun.screenshots)) {
            // Для последнего прогона удаляем большие base64 из run.screenshots
            const MAX_B = 1000000;
            cleanedRun.screenshots = cleanedRun.screenshots.map(s => {
              if (s?.screenshot && typeof s.screenshot === 'string' && s.screenshot.length > MAX_B) {
                const { screenshot, ...rest } = s;
                return rest;
              }
              return s;
            });
          }
          return cleanedRun;
        });
        
        historyObj[normalizedTestId] = cleanedHistory;
      }
      await withRetry(() => chrome.storage.local.set({ testHistory: historyObj }), {
        maxAttempts: 3,
        delayMs: 300,
        shouldRetry: (err) => !String(err?.message || '').includes('QUOTA')
      });
      console.log(`💾 Сохранена история для ${Object.keys(historyObj).length} тестов`);
      // Логируем детали сохраненной истории
      for (const [testId, history] of Object.entries(historyObj)) {
        const totalSteps = history.reduce((sum, run) => sum + (run.steps?.length || 0), 0);
        console.log(`   📊 Тест ${testId}: ${history.length} прогонов, всего ${totalSteps} шагов`);
      }
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Неизвестная ошибка';
      console.error('❌ Ошибка при сохранении истории:', errorMessage);
      
      // Обработка превышения квоты хранилища
      if (errorMessage.includes('quota') || errorMessage.includes('QUOTA') || errorMessage.includes('QuotaExceededError') || errorMessage.includes('QuotaBytes')) {
        console.warn('⚠️ Превышена квота хранилища, очищаю старые данные...');
        try {
          // ШАГ 1: Удаляем старую историю из storage, чтобы освободить место
          await chrome.storage.local.remove('testHistory');
          console.log('🧹 Удалена старая история из storage');

          // ШАГ 2: Строим минимальную копию без скриншотов (только метаданные и текстовые поля)
          const buildMinimalHistory = (history) => {
            const sorted = [...history].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
            const lastRuns = sorted.slice(0, 3); // только последние 3 прогона
            return lastRuns.map(run => {
              const minimalRun = {
                testId: run.testId,
                runId: run.runId,
                startTime: run.startTime,
                success: run.success,
                totalDuration: run.totalDuration
              };
              if (run.steps && run.steps.length) {
                minimalRun.steps = run.steps.map(step => ({
                  stepNumber: step.stepNumber,
                  success: step.success,
                  duration: step.duration,
                  error: step.error ? String(step.error).slice(0, 500) : undefined,
                  actionType: step.actionType || step.type,
                  type: step.type || step.actionType,
                  subtype: step.subtype,
                  actionIndex: step.actionIndex
                }));
              } else {
                minimalRun.steps = [];
              }
              return minimalRun;
            });
          };

          const historyObj = {};
          for (const [testId, history] of this.testHistory.entries()) {
            historyObj[String(testId)] = buildMinimalHistory(history);
          }

          // ШАГ 3: Сохраняем только минимальную историю
          await chrome.storage.local.set({ testHistory: historyObj });
          console.log('✅ История сохранена после агрессивной очистки (без скриншотов, макс. 3 прогона на тест)');

          // Обновляем in-memory: оставляем только последние 3 прогона и сбрасываем тяжёлые поля
          for (const [testId, history] of this.testHistory.entries()) {
            const sorted = [...history].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
            const kept = sorted.slice(0, 3);
            for (const run of kept) {
              if (run.steps) {
                for (const step of run.steps) {
                  delete step.screenshotComparison;
                  delete step.screenshotComparisonView;
                  delete step.screenshot;
                  delete step.beforeScreenshot;
                  delete step.afterScreenshot;
                  delete step.errorScreenshot;
                }
              }
              delete run.screenshots;
            }
            this.testHistory.set(testId, kept);
          }
        } catch (retryError) {
          console.error('❌ Не удалось сохранить историю даже после очистки:', retryError?.message || retryError);
          try {
            console.warn('⚠️ Критическая ситуация: удаляю всю историю прогонов для освобождения места');
            this.testHistory.clear();
            await chrome.storage.local.remove('testHistory');
            console.log('✅ Вся история прогонов удалена для освобождения места в storage');
          } catch (criticalError) {
            console.error('❌ Критическая ошибка: не удалось очистить storage:', criticalError);
          }
        }
      }
      // Не бросаем ошибку, чтобы не прерывать выполнение теста
    }
  }

  addTestRunHistory(testId, runHistory) {
    // Приводим testId к строке для консистентности
    testId = String(testId);
    
    // Проверяем, что история содержит хотя бы минимальную информацию
    if (!runHistory || !runHistory.testId || !runHistory.startTime) {
      console.warn('⚠️ Попытка сохранить невалидную историю прогона:', runHistory);
      return;
    }
    
    // Сохраняем историю даже если шагов нет, но тест был запущен
    if (!runHistory.steps) {
      runHistory.steps = [];
    }
    
    // Убеждаемся, что testId совпадает (приводим к строке)
    const runHistoryTestId = String(runHistory.testId);
    if (runHistoryTestId !== testId) {
      console.warn(`⚠️ testId в runHistory (${runHistoryTestId}) не совпадает с переданным (${testId}), исправляю...`);
      runHistory.testId = testId;
    }
    
    if (!this.testHistory.has(testId)) {
      this.testHistory.set(testId, []);
    }
    const history = this.testHistory.get(testId);
    
    // Добавляем runId, если его нет
    if (!runHistory.runId) {
      runHistory.runId = runHistory.startTime || Date.now();
    }
    
    // Проверяем, есть ли уже прогон с таким же runId (для обновления промежуточной истории)
    const existingRunIndex = history.findIndex(run => 
      run.runId === runHistory.runId || 
      (run.startTime === runHistory.startTime && !run.success)
    );
    
    if (existingRunIndex >= 0) {
      // Обновляем существующий прогон (для промежуточного сохранения истории)
      console.log(`🔄 [Background] Обновляю существующий прогон с runId ${runHistory.runId} (промежуточное сохранение)`);
      history[existingRunIndex] = runHistory;
    } else {
      // Добавляем новый прогон
      history.push(runHistory);
    }
    
    // Подсчитываем количество скриншотов в прогоне
    const screenshotsCount = runHistory.steps?.reduce((count, step) => {
      if (step.beforeScreenshot || step.beforeScreenshotPath) count++;
      if (step.afterScreenshot || step.afterScreenshotPath) count++;
      if (step.errorScreenshot || step.errorScreenshotPath) count++;
      if (step.screenshot || step.screenshotPath) count++;
      return count;
    }, 0) || 0;
    
    console.log(`💾 История прогона добавлена для теста ${testId}:`, {
      runId: runHistory.runId,
      stepsCount: runHistory.steps.length,
      screenshotsCount: screenshotsCount,
      success: runHistory.success,
      duration: runHistory.totalDuration,
      startTime: runHistory.startTime,
      totalRuns: history.length
    });
    
    // Сохраняем асинхронно, не блокируя выполнение
    this.saveTestHistory().catch(err => {
      console.error('❌ Ошибка при сохранении истории прогона:', err);
      // История все равно в памяти, это не критично
      console.log('ℹ️ История сохранена в памяти, но не в storage из-за ошибки');
    });
  }

  getTestHistory(testId) {
    // Приводим testId к строке для консистентности
    testId = String(testId);
    const history = this.testHistory.get(testId) || [];
    if (history.length > 0) {
      console.log(`📊 [Background] getTestHistory для теста ${testId}: найдено ${history.length} прогонов`);
    }
    return history;
  }

  analyzeTestHistory(testId) {
    const history = this.getTestHistory(testId);
    if (history.length === 0) {
      return {
        success: false,
        errorCode: 'historyEmpty'
      };
    }

    // Анализируем успешные прогоны
    const successfulRuns = history.filter(run => run.success === true);
    if (successfulRuns.length === 0) {
      return {
        success: false,
        errorCode: 'noSuccessfulRuns'
      };
    }

    // Собираем статистику по шагам
    const stepStats = new Map(); // stepNumber -> { durations: [], errors: [], actionTypes: [], selectors: [] }
    
    successfulRuns.forEach(run => {
      if (run.steps && run.steps.length > 0) {
        run.steps.forEach(step => {
          const stepNum = step.stepNumber;
          if (!stepStats.has(stepNum)) {
            stepStats.set(stepNum, {
              stepNumber: stepNum,
              durations: [],
              errors: [],
              actionTypes: [],
              selectors: [],
              values: [],
              successCount: 0,
              totalCount: 0
            });
          }
          
          const stats = stepStats.get(stepNum);
          stats.totalCount++;
          
          if (step.success) {
            stats.successCount++;
            if (step.duration) {
              stats.durations.push(step.duration);
            }
          } else {
            stats.errors.push(step.error || 'Неизвестная ошибка');
          }
          
          if (step.actionType) {
            stats.actionTypes.push(step.actionType);
          }
          if (step.expectedSelector) {
            stats.selectors.push(step.expectedSelector);
          }
          if (step.expectedValue) {
            stats.values.push(step.expectedValue);
          }
        });
      }
    });

    // Вычисляем средние значения и находим проблемы
    const analysis = {
      totalRuns: history.length,
      successfulRuns: successfulRuns.length,
      failedRuns: history.length - successfulRuns.length,
      averageDuration: 0,
      stepAnalysis: [],
      recommendations: [],
      missingActions: []
    };

    // Вычисляем среднюю длительность успешных прогонов
    const totalDuration = successfulRuns.reduce((sum, run) => sum + (run.totalDuration || 0), 0);
    analysis.averageDuration = successfulRuns.length > 0 ? totalDuration / successfulRuns.length : 0;

    // Анализируем каждый шаг
    stepStats.forEach((stats, stepNum) => {
      const avgDuration = stats.durations.length > 0 
        ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length 
        : 0;
      const maxDuration = stats.durations.length > 0 ? Math.max(...stats.durations) : 0;
      const minDuration = stats.durations.length > 0 ? Math.min(...stats.durations) : 0;
      const successRate = stats.totalCount > 0 ? (stats.successCount / stats.totalCount) * 100 : 0;
      
      // Определяем наиболее частый тип действия и селектор
      const actionTypeCounts = {};
      stats.actionTypes.forEach(type => {
        actionTypeCounts[type] = (actionTypeCounts[type] || 0) + 1;
      });
      const mostCommonActionType = Object.keys(actionTypeCounts).reduce((a, b) => 
        actionTypeCounts[a] > actionTypeCounts[b] ? a : b, stats.actionTypes[0] || 'unknown'
      );

      const selectorCounts = {};
      stats.selectors.forEach(sel => {
        selectorCounts[sel] = (selectorCounts[sel] || 0) + 1;
      });
      const mostCommonSelector = Object.keys(selectorCounts).reduce((a, b) => 
        selectorCounts[a] > selectorCounts[b] ? a : b, stats.selectors[0] || 'N/A'
      );

      analysis.stepAnalysis.push({
        stepNumber: stepNum,
        averageDuration: avgDuration,
        maxDuration: maxDuration,
        minDuration: minDuration,
        successRate: successRate,
        errorCount: stats.errors.length,
        mostCommonErrors: this.getMostCommon(stats.errors, 3),
        actionType: mostCommonActionType,
        selector: mostCommonSelector,
        executionCount: stats.totalCount
      });
    });

    // Сортируем шаги по номеру
    analysis.stepAnalysis.sort((a, b) => a.stepNumber - b.stepNumber);

    // Генерируем рекомендации
    analysis.stepAnalysis.forEach(step => {
      // Рекомендации по медленным шагам
      if (step.averageDuration > 3000) { // Больше 3 секунд
        analysis.recommendations.push({
          type: 'performance',
          priority: 'high',
          stepNumber: step.stepNumber,
          message: `Шаг ${step.stepNumber} выполняется медленно (среднее время: ${this.formatDuration(step.averageDuration)}). Рекомендуется:`,
          suggestions: [
            step.actionType === 'click' ? 'Добавить ожидание перед кликом, если элемент появляется с задержкой' : null,
            step.actionType === 'input' ? 'Проверить, не требуется ли очистка поля перед вводом' : null,
            step.actionType === 'change' ? 'Убедиться, что dropdown полностью загружен перед выбором' : null,
            'Проверить селектор - возможно, он не оптимален',
            'Добавить явное ожидание загрузки элемента перед действием'
          ].filter(s => s !== null)
        });
      }

      // Рекомендации по нестабильным шагам
      if (step.successRate < 100 && step.successRate >= 70) {
        analysis.recommendations.push({
          type: 'stability',
          priority: 'medium',
          stepNumber: step.stepNumber,
          message: `Шаг ${step.stepNumber} иногда завершается с ошибкой (успешность: ${step.successRate.toFixed(1)}%). Частые ошибки:`,
          suggestions: [
            ...step.mostCommonErrors.map(err => `Ошибка: ${err}`),
            'Добавить повторные попытки для этого шага',
            'Проверить селектор - возможно, он не всегда находит элемент',
            'Добавить ожидание перед выполнением действия'
          ]
        });
      }

      // Рекомендации по часто падающим шагам
      if (step.successRate < 70) {
        analysis.recommendations.push({
          type: 'critical',
          priority: 'high',
          stepNumber: step.stepNumber,
          message: `Шаг ${step.stepNumber} часто завершается с ошибкой (успешность: ${step.successRate.toFixed(1)}%). Требуется срочное исправление!`,
          suggestions: [
            ...step.mostCommonErrors.map(err => `Ошибка: ${err}`),
            'Проверить правильность селектора',
            'Добавить альтернативные селекторы',
            'Убедиться, что элемент существует на странице',
            'Проверить, не требуется ли навигация перед этим шагом'
          ]
        });
      }

      // Рекомендации по большим вариациям времени выполнения
      if (step.maxDuration > 0 && (step.maxDuration - step.minDuration) > step.averageDuration * 0.5) {
        analysis.recommendations.push({
          type: 'variability',
          priority: 'low',
          stepNumber: step.stepNumber,
          message: `Шаг ${step.stepNumber} имеет большую вариацию времени выполнения (от ${this.formatDuration(step.minDuration)} до ${this.formatDuration(step.maxDuration)}).`,
          suggestions: [
            'Время выполнения сильно варьируется - возможно, требуется ожидание загрузки',
            'Проверить, не зависит ли время от состояния страницы',
            'Рассмотреть добавление явного ожидания для стабилизации'
          ]
        });
      }
    });

    // Анализируем отсутствующие действия
    const actionTypes = new Set();
    analysis.stepAnalysis.forEach(step => {
      actionTypes.add(step.actionType);
    });

    // Проверяем, есть ли навигация после первого шага
    const hasNavigation = Array.from(actionTypes).includes('navigation');
    const firstStep = analysis.stepAnalysis[0];
    if (firstStep && firstStep.actionType !== 'navigation' && !hasNavigation) {
      analysis.missingActions.push({
        type: 'navigation',
        message: 'Рекомендуется добавить шаг навигации в начале теста для явного перехода на нужную страницу',
        priority: 'medium'
      });
    }

    // Проверяем наличие ожиданий после навигации
    analysis.stepAnalysis.forEach((step, index) => {
      if (step.actionType === 'navigation' && index < analysis.stepAnalysis.length - 1) {
        const nextStep = analysis.stepAnalysis[index + 1];
        if (nextStep && nextStep.averageDuration < 1000) {
          analysis.missingActions.push({
            type: 'wait',
            stepNumber: step.stepNumber + 1,
            message: `После навигации (шаг ${step.stepNumber}) рекомендуется добавить ожидание загрузки страницы перед следующим действием (шаг ${nextStep.stepNumber})`,
            priority: 'high'
          });
        }
      }
    });

    // Проверяем наличие ожиданий после кликов на dropdown
    analysis.stepAnalysis.forEach((step, index) => {
      if (step.actionType === 'click' && index < analysis.stepAnalysis.length - 1) {
        const nextStep = analysis.stepAnalysis[index + 1];
        if (nextStep && nextStep.actionType === 'change' && nextStep.averageDuration < 500) {
          analysis.missingActions.push({
            type: 'wait',
            stepNumber: step.stepNumber + 1,
            message: `После клика на dropdown (шаг ${step.stepNumber}) рекомендуется добавить небольшую задержку перед выбором значения (шаг ${nextStep.stepNumber})`,
            priority: 'medium'
          });
        }
      }
    });

    // Специальный анализ для dropdown: выявляем случаи, когда клик и выбор разделены
    analysis.stepAnalysis.forEach((step, index) => {
      // Проверяем, является ли шаг кликом по dropdown
      const isDropdownClick = step.actionType === 'click' && 
                             (step.selector?.includes('status-project') || 
                              step.selector?.includes('select-box') ||
                              step.selector?.includes('placeholder') ||
                              step.selector?.includes('app-select'));
      
      if (isDropdownClick && index < analysis.stepAnalysis.length - 1) {
        const nextStep = analysis.stepAnalysis[index + 1];
        
        // Если следующий шаг - это input или change с тем же селектором dropdown
        const isDropdownInput = (nextStep.actionType === 'input' || nextStep.actionType === 'change') &&
                               (nextStep.selector?.includes('status-project') || 
                                nextStep.selector?.includes('select-box') ||
                                nextStep.selector?.includes('app-select'));
        
        if (isDropdownInput) {
          // Если выбор опции занимает много времени (>10 секунд)
          if (nextStep.averageDuration > 10000) {
            analysis.recommendations.push({
              type: 'performance',
              priority: 'high',
              stepNumber: nextStep.stepNumber,
              message: `Шаг ${nextStep.stepNumber} (выбор опции в dropdown) выполняется очень медленно (среднее время: ${this.formatDuration(nextStep.averageDuration)}). Обнаружено много лишних попыток выбора.`,
              suggestions: [
                'Оптимизировать логику выбора опции в dropdown - сократить количество попыток',
                'Улучшить селектор для поиска опций в dropdown',
                'Добавить более точное ожидание появления панели с опциями',
                'Рассмотреть объединение шага 3 (клик) и шага 5 (выбор) в одно действие для ускорения',
                'Уменьшить таймауты ожидания панели dropdown'
              ]
            });
          }
          
          // Рекомендация объединить клик и выбор
          analysis.recommendations.push({
            type: 'optimization',
            priority: 'medium',
            stepNumber: step.stepNumber,
            message: `Шаги ${step.stepNumber} (клик по dropdown) и ${nextStep.stepNumber} (выбор опции) можно объединить для ускорения выполнения.`,
            suggestions: [
              `Объединить клик по dropdown и выбор опции "${nextStep.selector?.includes('status-project') ? 'в статусе' : 'в dropdown'}" в одно действие`,
              'Это сократит время выполнения и уменьшит количество шагов',
              'При объединении dropdown будет открываться и сразу выбираться нужная опция'
            ]
          });
        }
      }
      
      // Специальная проверка для медленных input в dropdown (>8 секунд)
      if (step.actionType === 'input' && step.averageDuration > 8000) {
        const isDropdownInput = step.selector?.includes('status-project') || 
                               step.selector?.includes('select-box') ||
                               step.selector?.includes('app-select');
        
        if (isDropdownInput) {
          analysis.recommendations.push({
            type: 'performance',
            priority: 'high',
            stepNumber: step.stepNumber,
            message: `Шаг ${step.stepNumber} (выбор опции в dropdown) выполняется медленно (среднее время: ${this.formatDuration(step.averageDuration)}). В консоли видно много лишних попыток выбора.`,
            suggestions: [
              'Оптимизировать логику выбора опции - сократить количество попыток перебора селекторов',
              'Улучшить поиск панели с опциями - использовать более точные селекторы',
              'Добавить кэширование найденных панелей для повторного использования',
              'Уменьшить количество попыток клика по элементам dropdown перед открытием панели',
              'Оптимизировать MutationObserver - сократить время ожидания появления панели'
            ]
          });
        }
      }
    });

    // Анализ последовательности шагов для выявления дублирующихся действий
    analysis.stepAnalysis.forEach((step, index) => {
      if (index < analysis.stepAnalysis.length - 1) {
        const nextStep = analysis.stepAnalysis[index + 1];
        
        // Выявляем дублирующиеся input/change с одинаковым значением
        if ((step.actionType === 'input' && nextStep.actionType === 'change') ||
            (step.actionType === 'change' && nextStep.actionType === 'input')) {
          if (step.selector === nextStep.selector) {
            analysis.recommendations.push({
              type: 'optimization',
              priority: 'low',
              stepNumber: step.stepNumber,
              message: `Шаги ${step.stepNumber} (${step.actionType}) и ${nextStep.stepNumber} (${nextStep.actionType}) выполняют одно и то же действие с одинаковым селектором.`,
              suggestions: [
                'Оставить только один из этих шагов (рекомендуется оставить CHANGE для dropdown)',
                'Система автоматически удаляет такие дубликаты, но можно удалить вручную для ясности'
              ]
            });
          }
        }
      }
    });

    return {
      success: true,
      analysis: analysis
    };
  }

  getMostCommon(items, count = 5) {
    const counts = {};
    items.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([item]) => item);
  }

  formatDuration(ms) {
    if (!ms) return '0мс';
    if (ms < 1000) return `${Math.round(ms)}мс`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}с`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}м ${remainingSeconds}с`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}ч ${remainingMinutes}м`;
  }

  async optimizeSelectorsFromHistory(testId, runHistory) {
    const test = this.tests.get(testId);
    if (!test) {
      return { success: false, error: 'Тест не найден' };
    }

    if (!runHistory || !runHistory.steps || runHistory.steps.length === 0) {
      return { success: false, error: 'Нет данных о шагах для оптимизации' };
    }

    // Проверяем, что все шаги успешны
    const allSuccessful = runHistory.steps.every(step => step.success);
    if (!allSuccessful) {
      return { success: false, error: 'Не все шаги выполнены успешно, оптимизация не применяется' };
    }

    let optimizedCount = 0;
    const optimizations = [];

    // Анализируем каждый шаг
    runHistory.steps.forEach(step => {
      const stepIndex = step.stepNumber - 1; // Индекс в массиве (0-based)
      const action = test.actions[stepIndex];
      
      if (!action) {
        console.warn(`⚠️ Действие для шага ${step.stepNumber} не найдено`);
        return;
      }

      // Пропускаем шаги, отредактированные пользователем
      if (action.userEdited) {
        console.log(`⏭️ Шаг ${step.stepNumber} отредактирован пользователем, пропускаю оптимизацию`);
        return;
      }

      const expectedSelector = step.expectedSelector || '';
      const actualSelector = step.actualSelector || expectedSelector;

      // Если фактический селектор отличается от ожидаемого и лучше
      if (actualSelector && actualSelector !== expectedSelector && actualSelector !== 'N/A') {
        // Используем среднее время из истории, если доступно, иначе используем duration из шага
        const stepDuration = step.averageDuration || (runHistory.steps.find(s => s.stepNumber === step.stepNumber)?.duration || 0);
        // Проверяем, что фактический селектор короче или проще
        const isBetter = this.isSelectorBetter(actualSelector, expectedSelector, stepDuration);
        
        if (isBetter) {
          // Сохраняем текущие альтернативы, чтобы не потерять их при замене
          const previousAlternatives = Array.isArray(action.selector?.alternatives)
            ? JSON.parse(JSON.stringify(action.selector.alternatives))
            : [];

          // Обновляем селектор в действии
          const newSelector = this.parseSelectorString(actualSelector);
          if (newSelector) {
            const oldSelector = JSON.stringify(action.selector);
            const demotedSelector = JSON.parse(oldSelector);
            demotedSelector.demotedByOptimization = true;
            demotedSelector.demotedAt = new Date().toISOString();
            demotedSelector.demotedReason = 'optimize-from-history';

            const normalizedDemoted = (demotedSelector.selector || demotedSelector.value || '')
              .toString()
              .trim()
              .toLowerCase();
            const normalizedSet = new Set();
            if (normalizedDemoted) {
              normalizedSet.add(normalizedDemoted);
            }

            const mergedAlternatives = [];
            if (normalizedDemoted) {
              mergedAlternatives.push(JSON.parse(JSON.stringify(demotedSelector)));
            }
            previousAlternatives.forEach(alt => {
              const value = alt?.selector || alt?.value;
              const normalized = (value || '').toString().trim().toLowerCase();
              if (!normalized || normalizedSet.has(normalized)) {
                return;
              }
              normalizedSet.add(normalized);
              mergedAlternatives.push(alt);
            });

            if (mergedAlternatives.length > 0) {
              newSelector.alternatives = mergedAlternatives;
            }

            action.selector = newSelector;
            action.selectorOptimized = true;
            action.selectorOptimizedAt = new Date().toISOString();
            action.selectorOptimizedSource = 'run-history';
            action.originalSelector = demotedSelector; // Сохраняем оригинальный для отображения
            
            optimizations.push({
              stepNumber: step.stepNumber,
              oldSelector: expectedSelector,
              newSelector: actualSelector,
              timeSaved: step.averageDuration > 2000 ? Math.round(step.averageDuration - 2000) : 0
            });
            
            optimizedCount++;
            console.log(`✅ Оптимизирован селектор для шага ${step.stepNumber}: ${expectedSelector} → ${actualSelector}`);
          }
        }
      }
    });

    if (optimizedCount > 0) {
      test.updatedAt = new Date().toISOString();
      test.lastEditor = 'Optimization';
      this.tests.set(testId, test);
      await this.saveTests();
      
      console.log(`✅ Оптимизировано ${optimizedCount} селекторов в тесте ${test.name}`);
    }

    return {
      success: true,
      optimizedCount: optimizedCount,
      optimizations: optimizations
    };
  }

  isSelectorBetter(newSelector, oldSelector, stepDuration) {
    // Селектор лучше, если:
    // 1. Он короче (меньше символов)
    // 2. Или шаг выполняется долго (>2 секунд) и новый селектор проще
    
    const newLength = newSelector.length;
    const oldLength = oldSelector.length;
    
    // Если новый селектор значительно короче
    if (newLength < oldLength * 0.8) {
      return true;
    }
    
    // Если шаг выполняется долго и новый селектор проще
    if (stepDuration > 2000 && newLength < oldLength) {
      return true;
    }
    
    // Если новый селектор использует более простые селекторы (id, class вместо сложных путей)
    const newHasId = newSelector.includes('#') && !newSelector.includes(' > ');
    const oldHasComplexPath = oldSelector.includes(' > ') && oldSelector.split(' > ').length > 3;
    
    if (newHasId && oldHasComplexPath) {
      return true;
    }
    
    return false;
  }

  parseSelectorString(selectorString) {
    // Парсим строку селектора в объект
    if (!selectorString || selectorString === 'N/A') {
      return null;
    }

    // Определяем тип селектора
    let type = 'css';
    if (selectorString.startsWith('#')) {
      type = 'id';
    } else if (selectorString.startsWith('.')) {
      type = 'class';
    } else if (selectorString.startsWith('[')) {
      type = 'attribute';
    }

    return {
      type: type,
      selector: selectorString,
      value: selectorString,
      priority: type === 'id' ? 10 : type === 'class' ? 8 : 5
    };
  }

  /** Порядок файлов content_scripts как в manifest (для внедрения при отсутствии в вкладке). */
  static get CONTENT_SCRIPT_FILES() {
    return [
      'libs/finder-lite.js', 'libs/finder.js', 'libs/unique-selector-lite.js', 'libs/unique-selector.js',
      'libs/optimal-select-lite.js', 'libs/optimal-select.js', 'content/selector-engine.js', 'content/selector-optimizer.js',
      'content/selenium-utils.js', 'content/player-optimizer.js', 'content/smart-waiter.js', 'excel-export/excel-export.js',
      'content/screenshot-comparer.js', 'content/content.js', 'content/inline-selector-picker.js', 'content/recorder.js',
      'content/player-core.js', 'content/player-handlers-basic.js', 'content/player-handlers-data.js',
      'content/player-handlers-table-drag.js', 'content/player-handlers-ui.js', 'content/player-handlers-analysis.js',
      'content/player-handlers-adaptive.js', 'content/player-handlers-form.js', 'content/player-handlers-dropdown.js',
      'content/player-handlers-extended.js', 'content/player-handlers-api.js', 'content/player-init.js',
      'content/selector-inspector.js'
    ];
  }

  /**
   * Внедряет content scripts во вкладку, если это обычная веб-страница (не extension).
   * Используется, когда sendMessage падает из-за отсутствия скрипта (вкладка открыта до установки расширения).
   * @param {number} tabId
   * @param {string} [tabUrl]
   * @returns {Promise<boolean>} true если внедрение выполнено (или не требуется), false при ошибке
   */
  async injectContentScriptsIfNeeded(tabId, tabUrl) {
    if (!tabId) return false;
    if (tabUrl && (tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://'))) {
      return false;
    }
    try {
      // Проверяем, загружены ли уже content scripts (избегаем дублирования и "already declared")
      for (let pingAttempt = 0; pingAttempt < 3; pingAttempt++) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'PING_CONTENT_SCRIPT' });
          return false; // Скрипты уже загружены
        } catch (_) {
          if (pingAttempt < 2) await new Promise(r => setTimeout(r, 100));
        }
      }
      const files = TestManager.CONTENT_SCRIPT_FILES;
      await chrome.scripting.executeScript({ target: { tabId }, files });
      console.log(`✅ Content scripts внедрены во вкладку ${tabId}`);
      return true;
    } catch (err) {
      console.warn('⚠️ Не удалось внедрить content scripts во вкладку:', err?.message);
      return false;
    }
  }

  async broadcast(message) {
    // Для PLAY_TEST: отправляем только в ОДНУ вкладку (targetTabId или первую подходящую), чтобы избежать двойного запуска
    if (message.type === 'PLAY_TEST' && message.targetTabId) {
      try {
        const payload = { type: 'PLAY_TEST', test: message.test, mode: message.mode, debugMode: message.debugMode || false, tabId: message.targetTabId };
        if (message.isGroupRun) {
          payload.isGroupRun = true;
          payload.groupRunCurrentIndex = message.groupRunCurrentIndex;
          payload.groupRunTotal = message.groupRunTotal;
        }
        await chrome.tabs.sendMessage(message.targetTabId, payload);
        console.log(`📡 PLAY_TEST отправлен только в целевую вкладку ${message.targetTabId} (без broadcast)`);
        return;
      } catch (e) {
        console.warn(`⚠️ Не удалось отправить PLAY_TEST в вкладку ${message.targetTabId}, пробую первую подходящую:`, e?.message);
      }
    }
    const tabs = await chrome.tabs.query({});
    let targets = tabs.filter(tab => tab.url && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://'));
    // Для PLAY_TEST: отправляем только в ОДНУ вкладку (targetTabId или первую подходящую по URL)
    if (message.type === 'PLAY_TEST') {
      const tid = message.targetTabId;
      const byId = tid ? targets.find(t => t.id === tid) : null;
      const targetUrl = message.test?.actions?.find(a => a?.url)?.url;
      const byUrl = targetUrl ? targets.filter(t => {
        try {
          const tu = new URL(targetUrl);
          const tabUrl = new URL(t.url);
          return tu.origin === tabUrl.origin;
        } catch { return false; }
      }) : targets;
      const single = byId || (byUrl.length > 0 ? byUrl[0] : null) || targets[0];
      targets = single ? [single] : [];
    }
    let sentCount = 0;
    await Promise.all(targets.map(async (tab) => {
      try {
        const msg = message.type === 'PLAY_TEST' ? { type: 'PLAY_TEST', test: message.test, mode: message.mode, debugMode: message.debugMode || false, tabId: tab.id, ...(message.isGroupRun && { isGroupRun: true, groupRunCurrentIndex: message.groupRunCurrentIndex, groupRunTotal: message.groupRunTotal }) } : message;
        await chrome.tabs.sendMessage(tab.id, msg);
        sentCount++;
        console.log(`📡 Broadcast отправлен в вкладку ${tab.id} (${tab.url})`);
      } catch {
        // Игнорируем ошибки для вкладок без content script
      }
    }));
    console.log(`📡 Broadcast отправлен на ${sentCount} вкладок (всего вкладок: ${tabs.length})`);
  }

  /**
   * Триггерит экспорт в Excel через content script
   */
  async triggerExcelExport(testId, trigger, runHistory = null) {
    try {
      const test = this.tests.get(testId);
      if (!test) {
        console.warn(`⚠️ [ExcelExport] Тест ${testId} не найден для экспорта`);
        return;
      }

      // Отправляем сообщение в content script для экспорта
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'EXPORT_TEST_TO_EXCEL',
            testId: testId,
            test: test,
            trigger: trigger,
            runHistory: runHistory
          });
          console.log(`✅ [ExcelExport] Сообщение об экспорте отправлено в вкладку ${tab.id}`);
          break; // Отправляем только в первую активную вкладку
        } catch (error) {
          // Игнорируем ошибки для вкладок без content script
        }
      }
    } catch (error) {
      console.error('❌ [ExcelExport] Ошибка при триггере экспорта:', error);
    }
  }

  /**
   * Очищает дублирующиеся действия из теста
   * @param {Object} test - Тест для очистки
   * @returns {number} - Количество удаленных действий
   */
  cleanDuplicateActions(test) {
    if (!test || !test.actions || test.actions.length === 0) {
      return 0;
    }

    let removedCount = 0;
    const actionsToRemove = [];
    const actions = test.actions;

    // Проходим по всем действиям и ищем дубликаты
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      // Пропускаем уже скрытые действия
      if (action.hidden) {
        continue;
      }

      // Проверяем INPUT после CHANGE с тем же значением
      // Удаляем первую запись (CHANGE), так как INPUT - это то, что пользователь действительно хотел
      if (action.type === 'input' && i > 0) {
        const prevAction = actions[i - 1];
        if (prevAction && !prevAction.hidden && 
            prevAction.type === 'change' && 
            prevAction.selector && action.selector &&
            this.areSelectorsEqual(prevAction.selector, action.selector) &&
            prevAction.value === action.value) {
          console.log(`🔄 Найден дубликат: INPUT после CHANGE с тем же значением "${action.value}"`);
          console.log(`   📝 Удаляю первую запись (CHANGE, индекс ${i - 1}), оставляю INPUT (индекс ${i})`);
          // Удаляем первую запись (CHANGE)
          if (!actionsToRemove.includes(i - 1)) {
            actionsToRemove.push(i - 1);
          }
          continue;
        }
      }

      // Проверяем CHANGE после INPUT с тем же значением
      // Удаляем первую запись (INPUT), так как CHANGE - это то, что пользователь действительно хотел
      if (action.type === 'change' && i > 0) {
        const prevAction = actions[i - 1];
        if (prevAction && !prevAction.hidden && 
            prevAction.type === 'input' && 
            prevAction.selector && action.selector &&
            this.areSelectorsEqual(prevAction.selector, action.selector) &&
            prevAction.value === action.value) {
          console.log(`🔄 Найден дубликат: CHANGE после INPUT с тем же значением "${action.value}"`);
          console.log(`   📝 Удаляю первую запись (INPUT, индекс ${i - 1}), оставляю CHANGE (индекс ${i})`);
          // Удаляем первую запись (INPUT)
          if (!actionsToRemove.includes(i - 1)) {
            actionsToRemove.push(i - 1);
          }
          continue;
        }
      }

      // Проверяем дублирующиеся клики по одному и тому же элементу подряд
      // Удаляем первую запись (первый клик), оставляем последний
      if (action.type === 'click' && i > 0) {
        const prevAction = actions[i - 1];
        if (prevAction && !prevAction.hidden && 
            prevAction.type === 'click' && 
            prevAction.selector && action.selector &&
            this.areSelectorsEqual(prevAction.selector, action.selector)) {
          // Если между кликами прошло меньше 500мс, это скорее всего дубликат
          const timeDiff = (action.timestamp || 0) - (prevAction.timestamp || 0);
          if (timeDiff < 500) {
            console.log(`🔄 Найден дубликат: повторный клик по тому же элементу (разница ${timeDiff}мс)`);
            console.log(`   📝 Удаляю первую запись (клик, индекс ${i - 1}), оставляю последний клик (индекс ${i})`);
            // Удаляем первую запись (первый клик)
            if (!actionsToRemove.includes(i - 1)) {
              actionsToRemove.push(i - 1);
            }
            continue;
          }
        }
      }
    }

    // Удаляем найденные дубликаты (в обратном порядке, чтобы индексы не сдвигались)
    actionsToRemove.sort((a, b) => b - a);
    for (const index of actionsToRemove) {
      if (index >= 0 && index < actions.length) {
        actions[index].hidden = true;
        actions[index].hiddenReason = 'Автоматически удален как дублирующееся действие';
        actions[index].hiddenAt = new Date().toISOString();
        removedCount++;
      }
    }

    return removedCount;
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
   * Строит промпт для генерации тестовых данных
   */
  buildTestDataPrompt(dataType, elementInfo) {
    let prompt = `Сгенерируй реалистичные тестовые данные для поля формы.\n\n`;
    
    prompt += `**Тип данных:** ${dataType}\n`;
    
    if (elementInfo) {
      if (elementInfo.placeholder) {
        prompt += `- Placeholder: ${elementInfo.placeholder}\n`;
      }
      if (elementInfo.label) {
        prompt += `- Label: ${elementInfo.label}\n`;
      }
      if (elementInfo.type) {
        prompt += `- HTML type: ${elementInfo.type}\n`;
      }
      if (elementInfo.name) {
        prompt += `- Name: ${elementInfo.name}\n`;
      }
    }
    
    prompt += `\n**Требования:**\n`;
    switch (dataType) {
      case 'name':
      case 'fullname':
        prompt += `- Реалистичное ФИО на русском языке\n`;
        prompt += `- Формат: Фамилия Имя Отчество\n`;
        break;
      case 'phone':
        prompt += `- Номер телефона в формате +7 (XXX) XXX-XX-XX\n`;
        prompt += `- Или 8 (XXX) XXX-XX-XX\n`;
        break;
      case 'email':
        prompt += `- Email адрес в формате example@domain.com\n`;
        break;
      case 'address':
        prompt += `- Полный адрес: город, улица, дом\n`;
        break;
      case 'inn':
        prompt += `- ИНН (10 или 12 цифр)\n`;
        break;
      case 'snils':
        prompt += `- СНИЛС в формате XXX-XXX-XXX XX\n`;
        break;
      default:
        prompt += `- Реалистичные данные для типа "${dataType}"\n`;
    }
    
    prompt += `\nВерни только данные, без дополнительных пояснений.`;
    
    return prompt;
  }

  /**
   * Строит промпт для анализа ошибки
   */
  buildErrorAnalysisPrompt(errorInfo, testContext) {
    let prompt = `Проанализируй ошибку при выполнении автотеста и предложи решение.\n\n`;
    
    prompt += `**Ошибка:**\n`;
    prompt += `- Сообщение: ${errorInfo.error || 'Неизвестная ошибка'}\n`;
    prompt += `- Тип: ${errorInfo.type || 'неизвестно'}\n`;
    if (errorInfo.selector) {
      prompt += `- Селектор: ${errorInfo.selector}\n`;
    }
    if (errorInfo.stepNumber) {
      prompt += `- Шаг: ${errorInfo.stepNumber}\n`;
    }
    
    if (testContext) {
      prompt += `\n**Контекст теста:**\n`;
      if (testContext.testName) {
        prompt += `- Название теста: ${testContext.testName}\n`;
      }
      if (testContext.url) {
        prompt += `- URL: ${testContext.url}\n`;
      }
      if (testContext.actionType) {
        prompt += `- Тип действия: ${testContext.actionType}\n`;
      }
    }
    
    prompt += `\n**Задача:**\n`;
    prompt += `Определи причину ошибки и предложи конкретное решение:\n`;
    prompt += `1. Причина ошибки\n`;
    prompt += `2. Альтернативный селектор (если проблема в селекторе)\n`;
    prompt += `3. Рекомендации по исправлению\n`;
    
    return prompt;
  }

  /**
   * Очищает все скриншоты из истории прогонов (для использования внутри класса)
   */
  async clearAllScreenshotsFromStorage() {
    console.log('🧹 [Background] Очищаю все скриншоты из storage...');
    try {
      // Сначала удаляем файлы скриншотов с диска
      await this.deleteScreenshotFiles();
      
      // Проходим по всей истории и удаляем поля со скриншотами
      for (const [testId, history] of this.testHistory.entries()) {
        for (const run of history) {
          if (run.screenshots) {
            delete run.screenshots;
          }
          if (run.steps) {
            for (const step of run.steps) {
              delete step.screenshot;
              delete step.beforeScreenshot;
              delete step.afterScreenshot;
              delete step.screenshotComparison;
              delete step.screenshotComparisonView;
              // Также удаляем пути к файлам, так как файлы уже удалены
              delete step.screenshotPath;
              delete step.beforeScreenshotPath;
              delete step.afterScreenshotPath;
              delete step.errorScreenshotPath;
              if (step.screenshotComparison) {
                delete step.screenshotComparison.diffImagePath;
              }
              delete step.screenshotComparisonViewPath;
            }
          }
        }
      }
      // Сохраняем обновленную историю (без скриншотов) в storage
      await this.saveTestHistory();
      console.log('✅ [Background] Все скриншоты успешно удалены из storage и файлы удалены с диска.');
    } catch (error) {
      console.error('❌ [Background] Ошибка при очистке скриншотов из storage:', error);
      throw error; // Пробрасываем ошибку дальше
    }
  }

  /**
   * Удаляет все файлы скриншотов с диска
   */
  async deleteScreenshotFiles() {
    try {
      console.log('🗑️ [Background] Удаляю файлы скриншотов с диска...');
      
      // Получаем все загруженные файлы
      const allDownloads = await chrome.downloads.search({});
      
      if (!allDownloads || allDownloads.length === 0) {
        console.log('ℹ️ [Background] Загруженные файлы не найдены');
        return;
      }
      
      // Фильтруем только файлы скриншотов (подпапка screenshots в папке сохранения)
      const screenshotDownloads = allDownloads.filter(download => {
        const filename = download.filename || download.filenameCurrent || '';
        return filename.includes('screenshots') && filename.endsWith('.png');
      });
      
      if (screenshotDownloads.length === 0) {
        console.log('ℹ️ [Background] Файлы скриншотов не найдены');
        return;
      }
      
      console.log(`📁 [Background] Найдено ${screenshotDownloads.length} файлов скриншотов для удаления`);
      
      let deletedCount = 0;
      let errorCount = 0;
      
      // Удаляем каждый файл
      for (const download of screenshotDownloads) {
        try {
          const filename = download.filename || download.filenameCurrent || 'unknown';
          
          // Удаляем файл с диска
          try {
            await chrome.downloads.removeFile(download.id);
            console.log(`🗑️ [Background] Файл удален: ${filename}`);
            deletedCount++;
          } catch (removeError) {
            // Если файл уже удален или недоступен, просто удаляем запись
            console.warn(`⚠️ [Background] Не удалось удалить файл ${filename}, удаляю запись:`, removeError.message);
          }
          
          // Удаляем запись о загрузке из истории браузера
          try {
            await chrome.downloads.erase({ id: download.id });
          } catch (eraseError) {
            // Игнорируем ошибки удаления записи
            console.warn(`⚠️ [Background] Не удалось удалить запись о файле ${filename}:`, eraseError.message);
          }
        } catch (error) {
          console.warn(`⚠️ [Background] Ошибка при обработке файла ${download.filename}:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ [Background] Удалено файлов скриншотов: ${deletedCount}, ошибок: ${errorCount}`);
    } catch (error) {
      console.error('❌ [Background] Ошибка при удалении файлов скриншотов:', error);
      // Не пробрасываем ошибку, так как удаление из storage все равно должно произойти
    }
  }

  /**
   * Парсит ответ от AI об анализе ошибки
   */
  parseErrorAnalysis(responseText) {
    try {
      // Пытаемся найти JSON в ответе
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Если JSON не найден, извлекаем структурированную информацию
      const analysis = {
        cause: null,
        alternativeSelector: null,
        recommendations: []
      };
      
      // Ищем причину
      const causeMatch = responseText.match(/(?:причина|причина ошибки)[\s:]+([^\n]+)/i);
      if (causeMatch) {
        analysis.cause = causeMatch[1].trim();
      }
      
      // Ищем альтернативный селектор
      const selectorMatch = responseText.match(/(?:селектор|selector)[\s:]+['"]?([^'"]+)['"]?/i);
      if (selectorMatch) {
        analysis.alternativeSelector = selectorMatch[1];
      }
      
      // Извлекаем рекомендации
      const recommendationLines = responseText.match(/\d+\.\s*[^\n]+/g);
      if (recommendationLines) {
        analysis.recommendations = recommendationLines.map(line => line.replace(/^\d+\.\s*/, ''));
      }
      
      return analysis;
    } catch (error) {
      console.warn('⚠️ [Background] Не удалось распарсить ответ, возвращаю текст как есть:', error);
      return {
        rawText: responseText,
        recommendations: [responseText]
      };
    }
  }

  /**
   * Выполняет тест напрямую из background script (для API тестов без визуальных действий)
   */
  async executeTestFromBackground(test, mode, debugMode) {
    console.log(`🚀 [Background] Выполняю тест "${test.name}" напрямую из background script`);
    
    // Обновляем переменные из localStorage перед инициализацией
    if (test.variables) {
      console.log(`🔄 [Background] Начинаю обновление переменных из localStorage...`);
      await this.updateLocalStorageVariables(test.variables);
      console.log(`✅ [Background] Обновление переменных из localStorage завершено`);
    }
    
    // Инициализируем переменные из теста (после обновления из localStorage)
    const userVariables = {};
    if (test.variables) {
      for (const [varName, varData] of Object.entries(test.variables)) {
        if (varData && typeof varData === 'object' && varData.value !== undefined && varData.value !== null) {
          userVariables[varName] = varData.value;
          console.log(`📦 [Background] Инициализирована переменная "${varName}" = "${String(varData.value).substring(0, 50)}${String(varData.value).length > 50 ? '...' : ''}"`);
        } else if (varData !== undefined && varData !== null && typeof varData !== 'object') {
          userVariables[varName] = varData;
          console.log(`📦 [Background] Инициализирована переменная "${varName}" (старый формат) = "${String(varData).substring(0, 50)}${String(varData).length > 50 ? '...' : ''}"`);
        } else if (varData && typeof varData === 'object' && varData.value === null) {
          // Переменная с null значением (например, из localStorage)
          userVariables[varName] = null;
          console.log(`📦 [Background] Инициализирована переменная "${varName}" = null`);
        }
      }
      console.log(`📦 [Background] Загружено ${Object.keys(userVariables).length} переменных`);
    }

    // Инициализируем переменные цикла
    const loopVariables = {};

    // Обрабатываем переменные в строке
    const processVariables = async (value) => {
      if (!value || typeof value !== 'string') {
        return value;
      }

      let processedValue = value;

      // Обработка даты и времени
      const now = new Date();
      const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const datetimeStr = `${dateStr} ${timeStr}`;
      const timestamp = Math.floor(now.getTime() / 1000);

      processedValue = processedValue.replace(/{date}/g, dateStr);
      processedValue = processedValue.replace(/{time}/g, timeStr);
      processedValue = processedValue.replace(/{datetime}/g, datetimeStr);
      processedValue = processedValue.replace(/{timestamp}/g, timestamp.toString());

      // Обработка счётчиков
      const counterRegex = /\{counter:([^}:]+)(?::(\d+))?\}/g;
      const counterMatches = [...processedValue.matchAll(counterRegex)];
      
      for (const match of counterMatches) {
        const counterName = match[1];
        const initialValue = match[2] ? parseInt(match[2], 10) : null;
        const fullMatch = match[0];
        
        try {
          const storageKey = `testCounter_${counterName}`;
          const result = await chrome.storage.local.get(storageKey);
          let counterValue = result[storageKey];
          
          if (counterValue === undefined || counterValue === null) {
            counterValue = initialValue !== null ? initialValue : 1;
          } else {
            counterValue++;
          }
          
          await chrome.storage.local.set({ [storageKey]: counterValue });
          processedValue = processedValue.replace(fullMatch, counterValue.toString());
        } catch (error) {
          const fallbackValue = initialValue !== null ? initialValue : 1;
          processedValue = processedValue.replace(fullMatch, fallbackValue.toString());
        }
      }

      // Обработка пользовательских переменных {var:имя}
      // Внутри циклов приоритет у loopVariables, затем userVariables
      const varRegex = /\{var:([^}]+)\}/g;
      const varMatches = [...processedValue.matchAll(varRegex)];
      
      for (const match of varMatches) {
        const varName = match[1].trim();
        const fullMatch = match[0];
        
        // Внутри циклов приоритет у loopVariables (переменные цикла имеют локальную область видимости)
        // Сначала проверяем loopVariables, затем userVariables
        let varValue = loopVariables[varName];
        if (varValue === undefined || varValue === null) {
          varValue = userVariables[varName];
        }
        
        if (varValue !== undefined && varValue !== null) {
          processedValue = processedValue.replace(fullMatch, String(varValue));
        } else {
          const availableUserVars = Object.keys(userVariables).join(', ') || 'нет';
          const availableLoopVars = Object.keys(loopVariables).join(', ') || 'нет';
          throw new Error(`Переменная {var:${varName}} не найдена. Доступные переменные (userVariables): ${availableUserVars}. Доступные переменные (loopVariables): ${availableLoopVars}`);
        }
      }

      return processedValue;
    };

    // Фильтруем действия по режиму
    const actionsToExecute = (test.actions || []).filter(action => {
      return mode === 'full' ? true : !action.hidden;
    });

    console.log(`📊 [Background] Выполняю ${actionsToExecute.length} действий (режим: ${mode})`);

    // Инициализируем историю прогона
    const startTime = Date.now();
    const normalizedTestId = String(test.id);
    // Генерируем уникальный runId: timestamp + случайное число для параллельных запусков
    const runId = startTime + Math.floor(Math.random() * 1000);
    const runHistory = {
      testId: normalizedTestId,
      testName: test.name,
      startTime: new Date(startTime).toISOString(),
      runId: runId,
      mode: mode,
      steps: [],
      success: false,
      error: null,
      totalDuration: 0
    };

    // Отправляем сообщение о начале теста для обновления индикатора прогресса
    try {
      chrome.runtime.sendMessage({
        type: 'STEP_PROGRESS_UPDATE',
        testId: normalizedTestId,
        step: 0,
        total: actionsToExecute.length,
        stepType: null
      }).catch(() => {}); // Игнорируем ошибки, если нет слушателей
    } catch (e) {
      // Игнорируем ошибки отправки сообщений
    }

    try {
      // Выполняем каждое действие
      for (let i = 0; i < actionsToExecute.length; i++) {
        const action = actionsToExecute[i];
        const stepNumber = i + 1;
        const stepStartTime = Date.now();

        console.log(`\n📋 [Background] Шаг ${stepNumber}/${actionsToExecute.length}: ${action.type.toUpperCase()}`);

        try {
          if (action.type === 'api') {
            // Выполняем API запрос (оптимизированная версия)
            const api = action.api || {};
            const method = api.method || 'GET';
            
            // Обрабатываем переменные только если они есть в URL
            let url = api.url || '';
            if (!url) {
              throw new Error('URL не указан для API запроса');
            }
            
            if (url.includes('{var:') || url.includes('{date}') || url.includes('{time}') || url.includes('{counter:')) {
              url = await processVariables(url);
            }
            
            // Валидация URL
            try {
              new URL(url);
            } catch (urlError) {
              throw new Error(`Некорректный URL: ${url}. Ошибка: ${urlError.message}`);
            }
            
            console.log(`🌐 [API] Выполняю ${method} запрос: ${url}`);
            
            // Обрабатываем headers только если они есть
            let headers = api.headers || {};
            const processedHeaders = {};
            if (Object.keys(headers).length > 0) {
              for (const [key, value] of Object.entries(headers)) {
                const headerValue = String(value);
                if (headerValue.includes('{var:') || headerValue.includes('{date}') || headerValue.includes('{time}') || headerValue.includes('{counter:')) {
                  processedHeaders[key] = await processVariables(headerValue);
                } else {
                  processedHeaders[key] = headerValue;
                }
              }
            }

            // Обрабатываем body только если он есть и содержит переменные
            let body = api.body || null;
            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
              if (typeof body === 'string') {
                if (body.includes('{var:') || body.includes('{date}') || body.includes('{time}') || body.includes('{counter:')) {
                  body = await processVariables(body);
                  // Пробуем распарсить как JSON только если это похоже на JSON
                  if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                    try {
                      body = JSON.parse(body);
                    } catch (e) {
                      // Если не JSON, оставляем как строку
                    }
                  }
                }
              } else if (typeof body === 'object') {
                // Для объектов проверяем наличие переменных рекурсивно
                const hasVariables = JSON.stringify(body).includes('{var:') || 
                                     JSON.stringify(body).includes('{date}') || 
                                     JSON.stringify(body).includes('{time}') || 
                                     JSON.stringify(body).includes('{counter:');
                if (hasVariables) {
                  const processObject = async (obj) => {
                    if (typeof obj === 'string') {
                      if (obj.includes('{var:') || obj.includes('{date}') || obj.includes('{time}') || obj.includes('{counter:')) {
                        return await processVariables(obj);
                      }
                      return obj;
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
            }
            
            const fetchOptions = {
              method: method,
              headers: {
                'Content-Type': 'application/json',
                ...processedHeaders
              }
            };

            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
              fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            }

            // Выполняем запрос с обработкой ошибок
            let response;
            try {
              response = await fetch(url, fetchOptions);
            } catch (fetchError) {
              const errorMessage = fetchError.message || 'Failed to fetch';
              console.error(`❌ [API] Ошибка сети при выполнении запроса: ${errorMessage}`);
              console.error(`   URL: ${url}`);
              console.error(`   Method: ${method}`);
              
              // Проверяем, не является ли это CORS ошибкой
              if (errorMessage.includes('Failed to fetch') || errorMessage.includes('CORS') || errorMessage.includes('NetworkError')) {
                throw new Error(`CORS или сетевая ошибка: ${errorMessage}. Проверьте URL и настройки CORS на сервере. URL: ${url}`);
              }
              
              throw new Error(`Ошибка сети: ${errorMessage}`);
            }
            
            // Читаем ответ только если нужно сохранить в переменную или проверить статус
            let parsedData = null;
            if (api.responseVariable || !response.ok) {
              try {
                const responseData = await response.text();
                try {
                  parsedData = JSON.parse(responseData);
                } catch (e) {
                  parsedData = responseData;
                }
              } catch (readError) {
                console.warn(`⚠️ [API] Ошибка при чтении ответа: ${readError.message}`);
                parsedData = null;
              }
            }

            if (!response.ok) {
              const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
              console.error(`❌ [API] Ошибка запроса: ${errorMessage}`);
              console.error(`   URL: ${url}`);
              console.error(`   Response:`, parsedData);
              
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

            // Валидация ответа по схеме, если указана
            if (api.responseValidation && parsedData !== null) {
              const validationResult = this.validateResponse(parsedData, api.responseValidation.schema);
              if (!validationResult.valid) {
                console.warn(`⚠️ [API] Ответ не соответствует схеме: ${validationResult.errors.join(', ')}`);
                // Не прерываем выполнение, только предупреждаем
              }
            }

            // Сохраняем ответ в переменную, если указано
            if (api.responseVariable && parsedData !== null) {
              userVariables[api.responseVariable] = parsedData;
            }

            const stepEndTime = Date.now();
            runHistory.steps.push({
              stepNumber: stepNumber,
              actionType: action.type,
              success: true,
              duration: stepEndTime - stepStartTime,
              timestamp: new Date().toISOString()
            });

            // Отправляем сообщение о завершении шага для обновления индикатора прогресса
            try {
              chrome.runtime.sendMessage({
                type: 'STEP_COMPLETED_UPDATE',
                testId: normalizedTestId,
                step: stepNumber,
                total: actionsToExecute.length,
                success: true,
                error: null,
                stepType: action.type
              }).catch(() => {}); // Игнорируем ошибки, если нет слушателей
              
              // Также отправляем обновление прогресса для следующего шага
              if (stepNumber < actionsToExecute.length) {
                chrome.runtime.sendMessage({
                  type: 'STEP_PROGRESS_UPDATE',
                  testId: normalizedTestId,
                  step: stepNumber + 1,
                  total: actionsToExecute.length,
                  stepType: null
                }).catch(() => {});
              }
            } catch (e) {
              // Игнорируем ошибки отправки сообщений
            }

          } else if (action.type === 'variable') {
            // Обрабатываем переменные
            const variable = action.variable || {};
            const name = variable.name;
            let value = variable.value || '';

            if (variable.sourceType === 'static') {
              value = await processVariables(value);
            } else if (variable.sourceType === 'expression') {
              const expression = variable.expression || '';
              let calcExpression = await processVariables(expression);
              
              // Заменяем переменные в выражении
              const varRegex = /\{var:([^}]+)\}/g;
              const varMatches = [...calcExpression.matchAll(varRegex)];
              for (const match of varMatches) {
                const varName = match[1].trim();
                const varValue = userVariables[varName];
                if (varValue !== undefined) {
                  calcExpression = calcExpression.replace(match[0], String(varValue));
                }
              }

              const safeVal = safeEvaluateArithmetic(calcExpression, {}, userVariables);
              if (safeVal === undefined) {
                throw new Error(`Ошибка вычисления выражения "${expression}"`);
              }
              value = safeVal;
            }

            if (value !== undefined && value !== null && value !== '') {
              userVariables[name] = value;
              console.log(`✅ [Background] Переменная "${name}" = "${value}"`);
            }

            const stepEndTime = Date.now();
            runHistory.steps.push({
              stepNumber: stepNumber,
              actionType: action.type,
              success: true,
              duration: stepEndTime - stepStartTime,
              timestamp: new Date().toISOString()
            });

            // Отправляем сообщение о завершении шага для обновления индикатора прогресса
            try {
              chrome.runtime.sendMessage({
                type: 'STEP_COMPLETED_UPDATE',
                testId: normalizedTestId,
                step: stepNumber,
                total: actionsToExecute.length,
                success: true,
                error: null,
                stepType: action.type
              }).catch(() => {}); // Игнорируем ошибки, если нет слушателей
              
              // Также отправляем обновление прогресса для следующего шага
              if (stepNumber < actionsToExecute.length) {
                chrome.runtime.sendMessage({
                  type: 'STEP_PROGRESS_UPDATE',
                  testId: normalizedTestId,
                  step: stepNumber + 1,
                  total: actionsToExecute.length,
                  stepType: null
                }).catch(() => {});
              }
            } catch (e) {
              // Игнорируем ошибки отправки сообщений
            }

          } else if (action.type === 'wait') {
            // Обрабатываем задержку
            const delay = action.delay || action.value || 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            const stepEndTime = Date.now();
            runHistory.steps.push({
              stepNumber: stepNumber,
              actionType: action.type,
              success: true,
              duration: stepEndTime - stepStartTime,
              timestamp: new Date().toISOString()
            });

            // Отправляем сообщение о завершении шага для обновления индикатора прогресса
            try {
              chrome.runtime.sendMessage({
                type: 'STEP_COMPLETED_UPDATE',
                testId: normalizedTestId,
                step: stepNumber,
                total: actionsToExecute.length,
                success: true,
                error: null,
                stepType: action.type
              }).catch(() => {}); // Игнорируем ошибки, если нет слушателей
              
              // Также отправляем обновление прогресса для следующего шага
              if (stepNumber < actionsToExecute.length) {
                chrome.runtime.sendMessage({
                  type: 'STEP_PROGRESS_UPDATE',
                  testId: normalizedTestId,
                  step: stepNumber + 1,
                  total: actionsToExecute.length,
                  stepType: null
                }).catch(() => {});
              }
            } catch (e) {
              // Игнорируем ошибки отправки сообщений
            }
          } else if (action.type === 'loop') {
            // Выполняем цикл
            const loop = action.loop || {};
            const loopType = loop.type || 'for';
            const loopActions = action.actions || [];
            const variable = loop.variable || 'i';
            
            console.log(`🔁 [Background] Выполняю цикл типа "${loopType}" с переменной "${variable}"`);
            
            // СОХРАНЯЕМ переменные, которые будут изменяться внутри цикла
            // Собираем список всех переменных, которые устанавливаются внутри цикла
            const variablesToSave = new Set();
            for (const loopAction of loopActions) {
              if (loopAction.type === 'variable' && loopAction.variable && loopAction.variable.name) {
                variablesToSave.add(loopAction.variable.name);
              }
            }
            
            // Сохраняем текущие значения переменных из сценария
            const savedVariables = {};
            for (const varName of variablesToSave) {
              if (userVariables.hasOwnProperty(varName)) {
                savedVariables[varName] = userVariables[varName];
                console.log(`💾 [Background Loop] Сохраняю переменную "${varName}" = "${savedVariables[varName]}" перед входом в цикл`);
              }
            }
            
            // Определяем начальное значение переменной цикла для всех типов циклов
            // Если переменная уже существует в userVariables, используем её значение как начальное
            let initialValue = 0;
            if (userVariables.hasOwnProperty(variable) && userVariables[variable] !== undefined && userVariables[variable] !== null) {
              const existingValue = userVariables[variable];
              const numValue = Number(existingValue);
              if (!isNaN(numValue)) {
                initialValue = numValue;
                console.log(`📊 [Background Loop] Использую существующее значение переменной "${variable}" = ${initialValue} как начальное`);
              }
            }
            
            // Инициализируем переменную цикла начальным значением
            loopVariables[variable] = initialValue;
            
            if (loopType === 'for') {
              const count = loop.count || 5;
              console.log(`  📊 [Background] Цикл for: ${count} итераций`);
              
              // Выполняем цикл от 0 до count-1, но после каждой итерации увеличиваем на 1
              for (let i = 0; i < count; i++) {
                // Увеличиваем переменную на 1 перед выполнением действий
                loopVariables[variable] = initialValue + i + 1;
                console.log(`  🔄 [Background] Итерация ${i + 1}/${count} (${variable} = ${initialValue + i + 1})`);
                
                // Рекурсивно выполняем действия внутри цикла
                for (const loopAction of loopActions) {
                  // Фильтруем действия по режиму
                  if (mode === 'full' || !loopAction.hidden) {
                    // Выполняем действие (только API, variable, wait)
                    if (loopAction.type === 'api') {
                      // Выполняем API запрос
                      const api = loopAction.api || {};
                      const method = api.method || 'GET';
                      
                      let url = api.url || '';
                      if (url.includes('{var:') || url.includes('{date}') || url.includes('{time}') || url.includes('{counter:')) {
                        url = await processVariables(url);
                      }
                      
                      let headers = api.headers || {};
                      const processedHeaders = {};
                      if (Object.keys(headers).length > 0) {
                        for (const [key, value] of Object.entries(headers)) {
                          const headerValue = String(value);
                          if (headerValue.includes('{var:') || headerValue.includes('{date}') || headerValue.includes('{time}') || headerValue.includes('{counter:')) {
                            processedHeaders[key] = await processVariables(headerValue);
                          } else {
                            processedHeaders[key] = headerValue;
                          }
                        }
                      }
                      
                      let body = api.body || null;
                      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                        if (typeof body === 'string') {
                          if (body.includes('{var:') || body.includes('{date}') || body.includes('{time}') || body.includes('{counter:')) {
                            body = await processVariables(body);
                            if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                              try { body = JSON.parse(body); } catch (e) {}
                            }
                          }
                        } else if (typeof body === 'object') {
                          const bodyStr = JSON.stringify(body);
                          if (bodyStr.includes('{var:') || bodyStr.includes('{date}') || bodyStr.includes('{time}') || bodyStr.includes('{counter:')) {
                            body = JSON.parse(await processVariables(bodyStr));
                          }
                        }
                      }
                      
                      const fetchOptions = {
                        method: method,
                        headers: {
                          'Content-Type': 'application/json',
                          ...processedHeaders
                        }
                      };
                      
                      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
                      }
                      
                      const response = await fetch(url, fetchOptions);
                      
                      let parsedData = null;
                      if (api.responseVariable || !response.ok) {
                        const responseData = await response.text();
                        try {
                          parsedData = JSON.parse(responseData);
                        } catch (e) {
                          parsedData = responseData;
                        }
                      }
                      
                      if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                      }
                      
                      if (api.responseVariable && parsedData !== null) {
                        userVariables[api.responseVariable] = parsedData;
                      }
                    } else if (loopAction.type === 'variable') {
                      // Выполняем действие с переменной
                      const varAction = loopAction.variable || {};
                      const name = varAction.name;
                      let value = varAction.value || '';
                      
                      if (varAction.sourceType === 'static') {
                        value = await processVariables(value);
                      } else if (varAction.sourceType === 'expression') {
                        const expression = varAction.expression || '';
                        let calcExpression = expression;
                        
                        const varRegex = /\{var:([^}]+)\}/g;
                        const varMatches = [...calcExpression.matchAll(varRegex)];
                        for (const match of varMatches) {
                          const varName = match[1].trim();
                          const varValue = userVariables[varName] !== undefined ? userVariables[varName] : loopVariables[varName];
                          if (varValue !== undefined) {
                            calcExpression = calcExpression.replace(match[0], String(varValue));
                          }
                        }
                        
                        const safeValLoop = safeEvaluateArithmetic(calcExpression, loopVariables, userVariables);
                        if (safeValLoop === undefined) {
                          throw new Error(`Ошибка вычисления выражения "${expression}"`);
                        }
                        value = safeValLoop;
                      }
                      
                      if (value !== undefined && value !== null && value !== '') {
                        userVariables[name] = value;
                        console.log(`✅ [Background] Переменная "${name}" = "${value}"`);
                      }
                    } else if (loopAction.type === 'wait') {
                      const delay = loopAction.delay || loopAction.value || 1000;
                      await new Promise(resolve => setTimeout(resolve, delay));
                    } else if (loopAction.type === 'loop') {
                      // Рекурсивно выполняем вложенный цикл
                      console.log(`  🔁 [Background] Вложенный цикл внутри цикла`);
                      // Можно добавить рекурсивный вызов, но для простоты пропускаем
                      console.warn(`⚠️ [Background] Вложенные циклы пока не поддерживаются в background script`);
                    }
                  }
                }
              }
              
              // После завершения цикла переменная равна начальному значению + count
              loopVariables[variable] = initialValue + count;
              console.log(`  ✅ [Background] Цикл for завершен (${variable} = ${initialValue + count})`);
            } else if (loopType === 'while') {
              const condition = loop.condition || '';
              let iteration = 0;
              let maxIterations = 1000;
              
              // Функция для оценки условия цикла
              const evaluateCondition = (conditionStr, varName) => {
                if (!conditionStr) return false;
                
                // Подставляем значение переменной
                // Сначала проверяем loopVariables (приоритет для переменных цикла), затем userVariables
                let varValue = loopVariables[varName];
                if (varValue === undefined || varValue === null) {
                  varValue = userVariables[varName];
                }
                if (varValue === undefined || varValue === null) {
                  varValue = 0;
                }
                
                // Преобразуем в число, если возможно
                const numValue = Number(varValue);
                if (!isNaN(numValue) && isFinite(numValue)) {
                  varValue = numValue;
                }
                
                let conditionWithVar = conditionStr;
                try {
                  const escapedVarName = String(varName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  conditionWithVar = conditionStr.replace(new RegExp(`\\b${escapedVarName}\\b`, 'g'), String(varValue));
                } catch (e) {
                  console.warn('⚠️ [Background] Ошибка подстановки переменной в условии:', e.message);
                }
                console.log(`🔍 [Background Condition] Проверяю условие "${conditionStr}" с ${varName}=${varValue} -> "${conditionWithVar}"`);
                
                try {
                  // Безопасное вычисление условия
                  // Поддерживаем простые сравнения: i < 5, i <= 10, i > 0, i >= 1, i === 5, i !== 0
                  // ВАЖНО: проверяем операторы в порядке от длинных к коротким, чтобы <= не разбивался на < и =
                  const operators = ['<=', '>=', '===', '!==', '==', '!=', '<', '>'];
                  for (const op of operators) {
                    if (conditionWithVar.includes(op)) {
                      const parts = conditionWithVar.split(op).map(p => p.trim());
                      if (parts.length === 2) {
                        const evaluateExpression = (expr) => {
                          const num = parseFloat(String(expr).trim());
                          if (!isNaN(num) && isFinite(num) && String(expr).trim() === String(num)) return num;
                          const safeVal = safeEvaluateArithmetic(expr, loopVariables, userVariables);
                          return safeVal !== undefined ? safeVal : 0;
                        };

                        const left = evaluateExpression(parts[0]);
                        const right = evaluateExpression(parts[1]);
                        
                        let result = false;
                        switch (op) {
                          case '<': result = left < right; break;
                          case '<=': result = left <= right; break;
                          case '>': result = left > right; break;
                          case '>=': result = left >= right; break;
                          case '===': result = left === right; break;
                          case '!==': result = left !== right; break;
                          case '==': result = left == right; break;
                          case '!=': result = left != right; break;
                        }
                        console.log(`🔍 [Background Condition] Результат: ${left} ${op} ${right} = ${result}`);
                        return result;
                      }
                    }
                  }
                  
                  // Если не найдено операторов сравнения, возвращаем false
                  return false;
                } catch (e) {
                  console.warn(`⚠️ [Background Condition] Ошибка при вычислении условия "${conditionStr}":`, e);
                  return false;
                }
              };
              
              // initialValue уже определен выше для всех типов циклов
              
              while (iteration < maxIterations) {
                // Проверяем условие с текущим значением переменной
                const conditionResult = evaluateCondition(condition, variable);
                if (!conditionResult) {
                  console.log(`  ✅ [Background] Условие "${condition}" стало ложным (${variable} = ${loopVariables[variable]}), выходим из цикла`);
                  break;
                }
                
                // Выполняем действия с текущим значением переменной
                console.log(`  🔄 [Background] Итерация ${iteration + 1} (${variable} = ${loopVariables[variable]})`);
                
                // Выполняем действия внутри цикла (аналогично for)
                for (const loopAction of loopActions) {
                  // Фильтруем действия по режиму
                  if (mode === 'full' || !loopAction.hidden) {
                    // Выполняем действие (только API, variable, wait)
                    if (loopAction.type === 'api') {
                      // Выполняем API запрос
                      const api = loopAction.api || {};
                      const method = api.method || 'GET';
                      
                      let url = api.url || '';
                      if (url.includes('{var:') || url.includes('{date}') || url.includes('{time}') || url.includes('{counter:')) {
                        url = await processVariables(url);
                      }
                      
                      let headers = api.headers || {};
                      const processedHeaders = {};
                      if (Object.keys(headers).length > 0) {
                        for (const [key, value] of Object.entries(headers)) {
                          const headerValue = String(value);
                          if (headerValue.includes('{var:') || headerValue.includes('{date}') || headerValue.includes('{time}') || headerValue.includes('{counter:')) {
                            processedHeaders[key] = await processVariables(headerValue);
                          } else {
                            processedHeaders[key] = headerValue;
                          }
                        }
                      }
                      
                      let body = api.body || null;
                      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                        if (typeof body === 'string') {
                          if (body.includes('{var:') || body.includes('{date}') || body.includes('{time}') || body.includes('{counter:')) {
                            body = await processVariables(body);
                            if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                              try { body = JSON.parse(body); } catch (e) {}
                            }
                          }
                        } else if (typeof body === 'object') {
                          const bodyStr = JSON.stringify(body);
                          if (bodyStr.includes('{var:') || bodyStr.includes('{date}') || bodyStr.includes('{time}') || bodyStr.includes('{counter:')) {
                            body = JSON.parse(await processVariables(bodyStr));
                          }
                        }
                      }
                      
                      const fetchOptions = {
                        method: method,
                        headers: {
                          'Content-Type': 'application/json',
                          ...processedHeaders
                        }
                      };
                      
                      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
                      }
                      
                      const response = await fetch(url, fetchOptions);
                      
                      let parsedData = null;
                      if (api.responseVariable || !response.ok) {
                        const responseData = await response.text();
                        try {
                          parsedData = JSON.parse(responseData);
                        } catch (e) {
                          parsedData = responseData;
                        }
                      }
                      
                      if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                      }
                      
                      if (api.responseVariable && parsedData !== null) {
                        userVariables[api.responseVariable] = parsedData;
                      }
                    } else if (loopAction.type === 'variable') {
                      // Выполняем действие с переменной
                      const varAction = loopAction.variable || {};
                      const name = varAction.name;
                      let value = varAction.value || '';
                      
                      if (varAction.sourceType === 'static') {
                        value = await processVariables(value);
                      } else if (varAction.sourceType === 'expression') {
                        const expression = varAction.expression || '';
                        let calcExpression = expression;
                        
                        const varRegex = /\{var:([^}]+)\}/g;
                        const varMatches = [...calcExpression.matchAll(varRegex)];
                        for (const match of varMatches) {
                          const varName = match[1].trim();
                          const varValue = userVariables[varName] !== undefined ? userVariables[varName] : loopVariables[varName];
                          if (varValue !== undefined) {
                            calcExpression = calcExpression.replace(match[0], String(varValue));
                          }
                        }
                        
                        const safeValWhile = safeEvaluateArithmetic(calcExpression, loopVariables, userVariables);
                        if (safeValWhile === undefined) {
                          throw new Error(`Ошибка вычисления выражения "${expression}"`);
                        }
                        value = safeValWhile;
                      }
                      
                      if (value !== undefined && value !== null && value !== '') {
                        userVariables[name] = value;
                        console.log(`✅ [Background] Переменная "${name}" = "${value}"`);
                      }
                    } else if (loopAction.type === 'wait') {
                      const delay = loopAction.delay || loopAction.value || 1000;
                      await new Promise(resolve => setTimeout(resolve, delay));
                    } else if (loopAction.type === 'loop') {
                      // Рекурсивно выполняем вложенный цикл
                      console.log(`  🔁 [Background] Вложенный цикл внутри цикла`);
                      console.warn(`⚠️ [Background] Вложенные циклы пока не поддерживаются в background script`);
                    }
                  }
                }
                
                // Увеличиваем переменную ПОСЛЕ выполнения действий
                iteration++;
                loopVariables[variable] = initialValue + iteration;
              }
              
              if (iteration >= maxIterations) {
                console.warn(`⚠️ [Background] Достигнуто максимальное количество итераций (${maxIterations}), выходим из цикла`);
              }
              
              console.log(`  ✅ [Background] Цикл while завершен (${variable} = ${initialValue + iteration})`);
            }
            
            // ВОССТАНАВЛИВАЕМ переменные из сценария после выхода из цикла
            for (const varName of variablesToSave) {
              if (savedVariables.hasOwnProperty(varName)) {
                userVariables[varName] = savedVariables[varName];
                console.log(`🔄 [Background Loop] Восстанавливаю переменную "${varName}" = "${savedVariables[varName]}" после выхода из цикла`);
              } else {
                // Если переменная не была сохранена (не существовала до цикла), удаляем её
                delete userVariables[varName];
                console.log(`🗑️ [Background Loop] Удаляю переменную "${varName}", так как она не существовала до цикла`);
              }
            }
            
            const stepEndTime = Date.now();
            runHistory.steps.push({
              stepNumber: stepNumber,
              actionType: action.type,
              success: true,
              duration: stepEndTime - stepStartTime,
              timestamp: new Date().toISOString()
            });

            // Отправляем сообщение о завершении шага
            try {
              chrome.runtime.sendMessage({
                type: 'STEP_COMPLETED_UPDATE',
                testId: normalizedTestId,
                step: stepNumber,
                total: actionsToExecute.length,
                success: true,
                error: null,
                stepType: action.type
              }).catch(() => {});
              
              if (stepNumber < actionsToExecute.length) {
                chrome.runtime.sendMessage({
                  type: 'STEP_PROGRESS_UPDATE',
                  testId: normalizedTestId,
                  step: stepNumber + 1,
                  total: actionsToExecute.length,
                  stepType: null
                }).catch(() => {});
              }
            } catch (e) {
              // Игнорируем ошибки отправки сообщений
            }
          } else if (action.type === 'condition') {
            // Выполняем условие
            const condition = action.condition || {};
            const expression = condition.expression || '';
            const operator = condition.operator || 'exists';
            const value = condition.value || '';
            const thenActions = action.thenActions || [];
            const elseActions = action.elseActions || [];
            
            console.log(`🔀 [Background] Проверяю условие: ${expression} ${operator} ${value || ''}`);
            
            // Упрощенная проверка условия для background script
            // В background script нет доступа к DOM, поэтому проверяем только переменные
            let conditionResult = false;
            
            // Обрабатываем переменные в expression
            let processedExpression = expression;
            const varRegex = /\{var:([^}]+)\}/g;
            const varMatches = [...expression.matchAll(varRegex)];
            for (const match of varMatches) {
              const varName = match[1].trim();
              const varValue = userVariables[varName] !== undefined ? userVariables[varName] : loopVariables[varName];
              if (varValue !== undefined && varValue !== null) {
                processedExpression = processedExpression.replace(match[0], String(varValue));
              }
            }
            
            // Обрабатываем переменные в value
            let processedValue = value;
            if (value && typeof value === 'string') {
              const valueVarMatches = [...value.matchAll(varRegex)];
              for (const match of valueVarMatches) {
                const varName = match[1].trim();
                const varValue = userVariables[varName] !== undefined ? userVariables[varName] : loopVariables[varName];
                if (varValue !== undefined && varValue !== null) {
                  processedValue = processedValue.replace(match[0], String(varValue));
                }
              }
            }
            
            if (operator === 'exists') {
              // Проверяем, существует ли переменная или она не пустая
              // Если expression содержит переменную, проверяем её значение
              if (varMatches.length > 0) {
                const varName = varMatches[0][1].trim();
                const varValue = userVariables[varName] !== undefined ? userVariables[varName] : loopVariables[varName];
                conditionResult = varValue !== undefined && varValue !== null && varValue !== '';
              } else {
                // Для селекторов и других выражений (без доступа к DOM) считаем, что условие выполнено
                // В реальности это должно проверяться в content script
                conditionResult = true;
              }
            } else if (operator === 'equals') {
              // Проверяем равенство
              conditionResult = String(processedExpression) === String(processedValue);
            } else if (operator === 'contains') {
              // Проверяем, содержит ли выражение значение
              conditionResult = String(processedExpression).includes(String(processedValue));
            } else if (operator === 'not_equals' || operator === 'notEquals') {
              // Проверяем неравенство
              conditionResult = String(processedExpression) !== String(processedValue);
            } else if (operator === 'greater' || operator === '>') {
              // Проверяем больше
              const left = parseFloat(processedExpression) || 0;
              const right = parseFloat(processedValue) || 0;
              conditionResult = left > right;
            } else if (operator === 'less' || operator === '<') {
              // Проверяем меньше
              const left = parseFloat(processedExpression) || 0;
              const right = parseFloat(processedValue) || 0;
              conditionResult = left < right;
            } else {
              // Для других операторов считаем условие выполненным
              conditionResult = true;
            }
            
            // Вспомогательная функция для выполнения действий внутри условия
            const executeNestedActions = async (nestedActions) => {
              for (const nestedAction of nestedActions) {
                if (mode === 'full' || !nestedAction.hidden) {
                  if (nestedAction.type === 'api') {
                    // Выполняем API запрос
                    const api = nestedAction.api || {};
                    const method = api.method || 'GET';
                    
                    let url = api.url || '';
                    if (url.includes('{var:') || url.includes('{date}') || url.includes('{time}') || url.includes('{counter:')) {
                      url = await processVariables(url);
                    }
                    
                    let headers = api.headers || {};
                    const processedHeaders = {};
                    if (Object.keys(headers).length > 0) {
                      for (const [key, headerValue] of Object.entries(headers)) {
                        const headerValueStr = String(headerValue);
                        if (headerValueStr.includes('{var:') || headerValueStr.includes('{date}') || headerValueStr.includes('{time}') || headerValueStr.includes('{counter:')) {
                          processedHeaders[key] = await processVariables(headerValueStr);
                        } else {
                          processedHeaders[key] = headerValueStr;
                        }
                      }
                    }
                    
                    let body = api.body || null;
                    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                      if (typeof body === 'string') {
                        if (body.includes('{var:') || body.includes('{date}') || body.includes('{time}') || body.includes('{counter:')) {
                          body = await processVariables(body);
                          if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                            try { body = JSON.parse(body); } catch (e) {}
                          }
                        }
                      } else if (typeof body === 'object') {
                        const bodyStr = JSON.stringify(body);
                        if (bodyStr.includes('{var:') || bodyStr.includes('{date}') || bodyStr.includes('{time}') || bodyStr.includes('{counter:')) {
                          body = JSON.parse(await processVariables(bodyStr));
                        }
                      }
                    }
                    
                    const fetchOptions = {
                      method: method,
                      headers: {
                        'Content-Type': 'application/json',
                        ...processedHeaders
                      }
                    };
                    
                    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
                    }
                    
                    const response = await fetch(url, fetchOptions);
                    
                    let parsedData = null;
                    if (api.responseVariable || !response.ok) {
                      const responseData = await response.text();
                      try {
                        parsedData = JSON.parse(responseData);
                      } catch (e) {
                        parsedData = responseData;
                      }
                    }
                    
                    if (!response.ok) {
                      const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                      console.error(`❌ [API] Ошибка запроса: ${errorMessage}`);
                      
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
                    
                    if (api.responseVariable && parsedData !== null) {
                      userVariables[api.responseVariable] = parsedData;
                    }
                  } else if (nestedAction.type === 'variable') {
                    // Выполняем действие с переменной
                    const varAction = nestedAction.variable || {};
                    const name = varAction.name;
                    let varValue = varAction.value || '';
                    
                    if (varAction.sourceType === 'static') {
                      varValue = await processVariables(varValue);
                    } else if (varAction.sourceType === 'expression') {
                      const expr = varAction.expression || '';
                      let calcExpression = expr;
                      
                      const varRegex = /\{var:([^}]+)\}/g;
                      const varMatches = [...calcExpression.matchAll(varRegex)];
                      for (const match of varMatches) {
                        const varName = match[1].trim();
                        const varVal = userVariables[varName] !== undefined ? userVariables[varName] : loopVariables[varName];
                        if (varVal !== undefined) {
                          calcExpression = calcExpression.replace(match[0], String(varVal));
                        }
                      }
                      
                      const safeValNested = safeEvaluateArithmetic(calcExpression, loopVariables, userVariables);
                      if (safeValNested === undefined) {
                        throw new Error(`Ошибка вычисления выражения "${expr}"`);
                      }
                      varValue = safeValNested;
                    }
                    
                    if (varValue !== undefined && varValue !== null && varValue !== '') {
                      userVariables[name] = varValue;
                      console.log(`✅ [Background] Переменная "${name}" = "${varValue}"`);
                    }
                  } else if (nestedAction.type === 'wait') {
                    const delay = nestedAction.delay || nestedAction.value || 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                  } else if (nestedAction.type === 'loop') {
                    console.warn(`⚠️ [Background] Вложенные циклы внутри условий пока не поддерживаются в background script`);
                  } else if (nestedAction.type === 'condition') {
                    console.warn(`⚠️ [Background] Вложенные условия пока не поддерживаются в background script`);
                  }
                }
              }
            };
            
            if (conditionResult) {
              console.log(`  ✅ [Background] Условие выполнено, выполняю действия из ветки "Тогда"`);
              await executeNestedActions(thenActions);
            } else {
              console.log(`  ❌ [Background] Условие не выполнено, выполняю действия из ветки "Иначе"`);
              if (elseActions.length > 0) {
                await executeNestedActions(elseActions);
              }
            }
            
            const stepEndTime = Date.now();
            runHistory.steps.push({
              stepNumber: stepNumber,
              actionType: action.type,
              success: true,
              duration: stepEndTime - stepStartTime,
              timestamp: new Date().toISOString()
            });

            // Отправляем сообщение о завершении шага
            try {
              chrome.runtime.sendMessage({
                type: 'STEP_COMPLETED_UPDATE',
                testId: normalizedTestId,
                step: stepNumber,
                total: actionsToExecute.length,
                success: true,
                error: null,
                stepType: action.type
              }).catch(() => {});
              
              if (stepNumber < actionsToExecute.length) {
                chrome.runtime.sendMessage({
                  type: 'STEP_PROGRESS_UPDATE',
                  testId: normalizedTestId,
                  step: stepNumber + 1,
                  total: actionsToExecute.length,
                  stepType: null
                }).catch(() => {});
              }
            } catch (e) {
              // Игнорируем ошибки отправки сообщений
            }
          } else {
            console.warn(`⚠️ [Background] Пропускаю действие типа "${action.type}" (требует визуального интерфейса)`);
          }

        } catch (error) {
          const errorMessage = error?.message || String(error) || 'Неизвестная ошибка';
          console.error(`❌ [Background] Ошибка на шаге ${stepNumber}:`, errorMessage);
          
          // Если это ошибка API, отправляем toast уведомление
          if (action.type === 'api') {
            try {
              chrome.runtime.sendMessage({
                type: 'SHOW_TOAST',
                message: `❌ API ошибка: ${errorMessage}`,
                toastType: 'error'
              }).catch(() => {});
            } catch (e) {}
          }
          
          const stepEndTime = Date.now();
          runHistory.steps.push({
            stepNumber: stepNumber,
            actionType: action.type,
            success: false,
            error: errorMessage,
            duration: stepEndTime - stepStartTime,
            timestamp: new Date().toISOString()
          });

          // Отправляем сообщение о неудачном завершении шага
          try {
            chrome.runtime.sendMessage({
              type: 'STEP_COMPLETED_UPDATE',
              testId: normalizedTestId,
              step: stepNumber,
              total: actionsToExecute.length,
              success: false,
              error: error.message
            }).catch(() => {}); // Игнорируем ошибки, если нет слушателей
          } catch (e) {
            // Игнорируем ошибки отправки сообщений
          }

          throw error;
        }
      }

      // Тест выполнен успешно
      const endTime = Date.now();
      runHistory.success = true;
      runHistory.totalDuration = endTime - startTime;
      console.log(`✅ [Background] Тест выполнен успешно за ${runHistory.totalDuration}ms`);

    } catch (error) {
      const endTime = Date.now();
      runHistory.success = false;
      runHistory.error = error.message;
      runHistory.totalDuration = endTime - startTime;
      console.error(`❌ [Background] Тест завершен с ошибкой:`, error);
    } finally {
      // Сохраняем историю прогона
      this.addTestRunHistory(normalizedTestId, runHistory);
      try {
        await this.saveTestHistory();
        console.log(`✅ [Background] История прогона сохранена`);
      } catch (error) {
        console.error('❌ [Background] Ошибка при сохранении истории:', error);
      }

      // Отправляем сообщение о завершении теста ПОСЛЕ сохранения истории.
      // ВАЖНО: при запуске группы не отправляем TEST_COMPLETED отсюда, чтобы popup не сбрасывал групповое оформление на каждом тесте.
      try {
        if (!this.currentGroupId) {
          chrome.runtime.sendMessage({
            type: 'TEST_COMPLETED',
            testId: normalizedTestId,
            success: runHistory.success,
            error: runHistory.error || null,
            totalSteps: actionsToExecute.length,
            duration: runHistory.totalDuration
          }).catch(() => {}); // Игнорируем ошибки, если нет слушателей
          console.log(`✅ [Background] Отправлено сообщение TEST_COMPLETED (success: ${runHistory.success})`);
        }
      } catch (e) {
        console.error('❌ [Background] Ошибка при отправке TEST_COMPLETED:', e);
      }
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
    
    console.log(`🔄 [Background] Обновляю ${localStorageVars.length} переменных из localStorage`);
    
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
        
        // Проверяем, что вкладка существует
        let tab;
        try {
          tab = await chrome.tabs.get(tabIdNum);
        } catch (e) {
          console.warn(`⚠️ [Background] Вкладка ${tabIdNum} не найдена, пропускаю обновление переменных`);
          continue;
        }
        
        // Проверяем, что вкладка доступна
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
          console.warn(`⚠️ [Background] Вкладка ${tabIdNum} недоступна для получения localStorage`);
          continue;
        }
        
        // Получаем localStorage через content script или executeScript
        let localStorageData = null;
        
        // Сначала пробуем через content script
        try {
          const response = await chrome.tabs.sendMessage(tabIdNum, { type: 'GET_LOCAL_STORAGE' });
          if (response && response.success && response.data) {
            localStorageData = response.data;
            console.log(`✅ [Background] Получен localStorage с вкладки ${tabIdNum} через content script`);
          }
        } catch (sendMessageError) {
          // Если не получилось через sendMessage, пробуем через executeScript
          console.log(`ℹ️ [Background] Не удалось получить localStorage через sendMessage, пробую executeScript: ${sendMessageError.message}`);
        }
        
        // Если не получилось через sendMessage, пробуем через executeScript
        if (!localStorageData) {
          try {
            // Получаем все ключи из localStorage
            const keysResult = await chrome.scripting.executeScript({
              target: { tabId: tabIdNum },
              func: () => {
                try {
                  const keys = [];
                  for (let i = 0; i < localStorage.length; i++) {
                    keys.push(localStorage.key(i));
                  }
                  return keys;
                } catch (e) {
                  return [];
                }
              }
            });
            
            if (keysResult && keysResult[0] && keysResult[0].result) {
              const keys = keysResult[0].result;
              localStorageData = {};
              
              // Получаем значения для всех нужных ключей
              for (const key of keys) {
                try {
                  const valueResult = await chrome.scripting.executeScript({
                    target: { tabId: tabIdNum },
                    func: (k) => {
                      try {
                        return localStorage.getItem(k);
                      } catch (e) {
                        return null;
                      }
                    },
                    args: [key]
                  });
                  
                  if (valueResult && valueResult[0] && valueResult[0].result !== null) {
                    localStorageData[key] = valueResult[0].result;
                  }
                } catch (e) {
                  console.warn(`⚠️ [Background] Не удалось получить значение для ключа "${key}": ${e.message}`);
                }
              }
              
              if (Object.keys(localStorageData).length > 0) {
                console.log(`✅ [Background] Получен localStorage с вкладки ${tabIdNum} через executeScript`);
              }
            }
          } catch (executeError) {
            console.warn(`⚠️ [Background] Не удалось получить localStorage с вкладки ${tabIdNum} через executeScript: ${executeError.message}`);
          }
        }
        
        // Обновляем переменные, если получили данные
        if (localStorageData) {
          for (const varInfo of vars) {
            const value = localStorageData[varInfo.key];
            if (value !== undefined) {
              // Обновляем значение, даже если оно null (это валидное значение)
              variables[varInfo.name].value = value;
              console.log(`✅ [Background] Обновлена переменная "${varInfo.name}" из localStorage (ключ: ${varInfo.key}, значение: ${value === null ? 'null' : (String(value).substring(0, 50) + (String(value).length > 50 ? '...' : ''))})`);
            } else {
              console.warn(`⚠️ [Background] Ключ "${varInfo.key}" не найден в localStorage вкладки ${tabIdNum}`);
            }
          }
        } else {
          console.warn(`⚠️ [Background] Не удалось получить localStorage с вкладки ${tabIdNum}`);
        }
      } catch (error) {
        console.error(`❌ [Background] Ошибка при обновлении переменных из localStorage для вкладки ${tabId}:`, error);
      }
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

// Инициализируем менеджер тестов
const testManager = new TestManager();

// ============================================================================
// NETWORK MONITORING (webRequest API)
// ============================================================================

/**
 * Хранилище сетевых запросов для мониторинга
 * Map: tabId → Array<{id, url, method, type, timestamp, status, statusCode, duration}>
 */
const networkRequests = new Map();
let isNetworkMonitoring = false;

/**
 * Обработчик начала запроса
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isNetworkMonitoring) return;
    
    const tabId = details.tabId;
    if (tabId < 0) return; // Пропускаем background/extension запросы
    
    if (!networkRequests.has(tabId)) {
      networkRequests.set(tabId, []);
    }
    
    const requests = networkRequests.get(tabId);
    
    // Ограничиваем историю (последние 100 запросов на вкладку)
    if (requests.length >= 100) {
      requests.shift();
    }
    
    requests.push({
      id: details.requestId,
      url: details.url,
      method: details.method,
      type: details.type,
      timestamp: Date.now(),
      status: 'pending'
    });
    
    // console.log(`[Network] Request started: ${details.method} ${details.url}`);
  },
  { urls: ["<all_urls>"] }
);

/**
 * Обработчик успешного завершения запроса
 */
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!isNetworkMonitoring) return;
    
    const tabId = details.tabId;
    if (tabId < 0) return;
    
    const requests = networkRequests.get(tabId);
    if (!requests) return;
    
    const request = requests.find(r => r.id === details.requestId);
    if (request) {
      request.status = 'completed';
      request.statusCode = details.statusCode;
      request.completedAt = Date.now();
      request.duration = request.completedAt - request.timestamp;
      
      // console.log(`[Network] Request completed: ${request.url} (${request.statusCode}, ${request.duration}ms)`);
    }
  },
  { urls: ["<all_urls>"] }
);

/**
 * Обработчик ошибки запроса
 */
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!isNetworkMonitoring) return;
    
    const tabId = details.tabId;
    if (tabId < 0) return;
    
    const requests = networkRequests.get(tabId);
    if (!requests) return;
    
    const request = requests.find(r => r.id === details.requestId);
    if (request) {
      request.status = 'error';
      request.error = details.error;
      request.completedAt = Date.now();
      request.duration = request.completedAt - request.timestamp;
      
      // console.log(`[Network] Request error: ${request.url} (${details.error})`);
    }
  },
  { urls: ["<all_urls>"] }
);

/**
 * Очистка данных при закрытии вкладки
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  networkRequests.delete(tabId);
  testManager.onPlaybackTabRemoved(tabId);
});

console.log('[Background] Network monitoring initialized');

