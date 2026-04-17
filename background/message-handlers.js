/**
 * Обработчики сообщений background script.
 *
 * Контракты сообщений (JSDoc для рефакторинга):
 *
 * @typedef {Object} MessageBase
 * @property {string} type - Тип сообщения (GET_TESTS, PLAY_TEST, SAVE_TEST_RUN_HISTORY и т.д.)
 *
 * @typedef {MessageBase & { testId: string }} MessageWithTestId
 *
 * @typedef {MessageBase & { testId: string, runHistory: RunHistory }} SaveRunHistoryMessage
 *
 * @typedef {Object} RunHistory
 * @property {string} testId
 * @property {number} startTime
 * @property {boolean} [success]
 * @property {string} [error]
 * @property {RunHistoryStep[]} [steps]
 *
 * @typedef {Object} RunHistoryStep
 * @property {number|string} stepNumber
 * @property {string} actionType
 * @property {boolean} success
 * @property {string|null} [error]
 *
 * @typedef {Object} StandardResponse
 * @property {boolean} success
 * @property {string} [error]
 *
 * @typedef {StandardResponse & { tests: Test[] }} GetTestsResponse
 * @typedef {StandardResponse & { test?: Test }} GetTestResponse
 * @typedef {StandardResponse & { history: RunHistory[] }} GetTestHistoryResponse
 *
 * @typedef {Object} Test
 * @property {string} id
 * @property {string} name
 * @property {TestAction[]} actions
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 *
 * @typedef {Object} TestAction
 * @property {string} type - click | input | navigate | wait | ...
 * @property {string|Object} [selector]
 * @property {*} [value]
 */

/** Лимит тестов для бесплатного тарифа (Freemium). При включении лимитов — проверка при создании/импорте. */
const FREE_TIER_TEST_LIMIT = 10;
/** Включить проверку лимитов бесплатного тарифа. false = Фаза 1 (без лимитов). */
const ENABLE_FREEMIUM_LIMITS = false;

async function requireAccess(action, sendResponse) {
  if (!self.AccessPolicy || !self.AccessPolicy.can) return true;
  const decision = await self.AccessPolicy.can(action);
  if (decision.allowed) return true;
  sendResponse({
    success: false,
    error: 'TIER_REQUIRED',
    requiredTier: decision.requiredTier,
    tier: decision.tier,
    action: decision.action
  });
  return false;
}

/** Поиск теста по id (Map может хранить ключ как строку или число после load/save). */
function getTestById(manager, testId) {
  if (testId == null) return undefined;
  return manager.tests.get(testId)
    || manager.tests.get(String(testId))
    || (typeof testId === 'string' && /^\d+$/.test(testId) ? manager.tests.get(Number(testId)) : undefined);
}

function formatAppliedWhen(appliedWhen) {
  if (!appliedWhen) return '';
  const map = {
    during_playback: 'во время воспроизведения теста',
    after_playback: 'после выполнения теста',
    during_recording: 'во время записи теста'
  };
  return map[appliedWhen] || appliedWhen;
}

function getActionSelectorKey(action) {
  const selector = action?.selector;
  if (!selector) return '';
  if (typeof selector === 'string') return selector;
  return selector.selector || selector.value || '';
}

function getActionTargetKey(action) {
  if (!action) return '';
  if (action.elementKey) return `element:${action.elementKey}`;
  const selectorKey = getActionSelectorKey(action);
  return selectorKey ? `selector:${selectorKey}` : '';
}

function isSingleTargetSelector(action) {
  const selector = action?.selector;
  if (!selector || typeof selector !== 'object') return false;
  return selector.isUnique === true || selector.unique === true || selector.matchCount === 1 || selector.matchesCount === 1;
}

function isActionSingleTarget(action) {
  return !!(action?.elementKey || isSingleTargetSelector(action));
}

function isValueAction(action) {
  return !!(action && (action.type === 'input' || action.type === 'change') && action.value !== undefined && action.value !== null);
}

function shouldReplacePreviousValueAction(prevAction, nextAction) {
  if (!isValueAction(prevAction) || !isValueAction(nextAction)) return false;
  if (!isActionSingleTarget(nextAction)) return false;
  const prevTarget = getActionTargetKey(prevAction);
  const nextTarget = getActionTargetKey(nextAction);
  if (!prevTarget || prevTarget !== nextTarget) return false;
  if (prevAction.type !== nextAction.type) return false;

  const prevTs = Number(prevAction.timestamp) || 0;
  const nextTs = Number(nextAction.timestamp) || 0;
  // Защита от замены старых исторических шагов при дозаписи.
  if (!prevTs || !nextTs || (nextTs - prevTs) > 5000) return false;

  return true;
}

function findPreviousValueActionIndex(actions, nextAction, fromIndex, toIndex) {
  if (!Array.isArray(actions) || actions.length === 0) return -1;
  if (!isValueAction(nextAction) || !isActionSingleTarget(nextAction)) return -1;
  const nextTarget = getActionTargetKey(nextAction);
  if (!nextTarget) return -1;
  const nextTs = Number(nextAction.timestamp) || 0;

  const start = Math.max(0, Number(fromIndex) || 0);
  const end = Math.min(actions.length - 1, Number.isFinite(toIndex) ? Number(toIndex) : (actions.length - 1));
  for (let i = end; i >= start; i--) {
    const candidate = actions[i];
    if (!isValueAction(candidate)) continue;
    if (candidate.type !== nextAction.type) continue;
    if (getActionTargetKey(candidate) !== nextTarget) continue;
    if (!isActionSingleTarget(candidate) && !isActionSingleTarget(nextAction)) continue;
    const candidateTs = Number(candidate.timestamp) || 0;
    if (nextTs && candidateTs && Math.abs(nextTs - candidateTs) > 5000) continue;
    return i;
  }
  return -1;
}

function removeInternalRecordMeta(action) {
  if (!action || typeof action !== 'object') return action;
  if (Object.prototype.hasOwnProperty.call(action, '__recordArrivalOrder')) {
    delete action.__recordArrivalOrder;
  }
  return action;
}

function normalizeActionTypeForIngress(type) {
  if (self.ActionTypes && typeof self.ActionTypes.normalizeActionType === 'function') {
    return self.ActionTypes.normalizeActionType(type);
  }
  if (type === 'assertion') return 'assert';
  if (type === 'navigate') return 'navigation';
  return type;
}

function getSelectorValueFromAction(action) {
  const selector = action?.selector;
  if (!selector) return '';
  if (typeof selector === 'string') return selector.trim();
  return String(selector.selector || selector.value || '').trim();
}

function isSelectorRequiredTypeForIngress(type) {
  const required = new Set([
    'click', 'dblclick', 'input', 'change', 'hover', 'focus', 'blur', 'clear', 'upload', 'drag',
    'table', 'datepicker', 'assert', 'wait'
  ]);
  return required.has(type);
}

function validateIncomingRecordedAction(action) {
  if (!action || typeof action !== 'object') {
    return { ok: false, error: 'INVALID_ACTION_PAYLOAD', details: 'action must be an object' };
  }

  const normalizedType = normalizeActionTypeForIngress(action.type);
  if (!normalizedType) {
    return { ok: false, error: 'INVALID_ACTION_PAYLOAD', details: 'missing action.type' };
  }

  if (self.ActionTypes && typeof self.ActionTypes.isActionTypeSupported === 'function') {
    if (!self.ActionTypes.isActionTypeSupported(normalizedType)) {
      return { ok: false, error: 'UNSUPPORTED_ACTION_TYPE', details: normalizedType };
    }
  }

  const subtype = typeof action.subtype === 'string' ? action.subtype.trim() : action.subtype;
  if (subtype && self.ActionTypes && typeof self.ActionTypes.isSubtypeSupported === 'function') {
    if (!self.ActionTypes.isSubtypeSupported(normalizedType, subtype)) {
      return { ok: false, error: 'UNSUPPORTED_ACTION_SUBTYPE', details: `${normalizedType}:${subtype}` };
    }
  }

  if (isSelectorRequiredTypeForIngress(normalizedType)) {
    const selectorValue = getSelectorValueFromAction(action);
    if (!selectorValue) {
      return { ok: false, error: 'INVALID_ACTION_SELECTOR', details: `selector is required for ${normalizedType}` };
    }
  }

  return { ok: true, normalizedType };
}

function isDuplicateClientRecordedAction(manager, action) {
  const clientActionId = String(action?._clientActionId || '').trim();
  if (!clientActionId) return false;

  if (!manager._recordedClientActionIds) {
    manager._recordedClientActionIds = new Set();
    manager._recordedClientActionOrder = [];
  }

  if (manager._recordedClientActionIds.has(clientActionId)) {
    return true;
  }

  manager._recordedClientActionIds.add(clientActionId);
  manager._recordedClientActionOrder.push(clientActionId);

  if (manager._recordedClientActionOrder.length > 1200) {
    const staleId = manager._recordedClientActionOrder.shift();
    if (staleId) {
      manager._recordedClientActionIds.delete(staleId);
    }
  }

  return false;
}









/**
 * Обновить поле appliedToTestCase, appliedWhen и контекст прогона в записи лога по id.
 * appliedWhen: 'during_playback' | 'after_playback' | 'during_recording' | null
 * @param {string} logId
 * @param {boolean} applied
 * @param {string} [appliedWhen] - когда применён: во время воспроизведения теста, после выполнения, во время записи
 * @param {number} [stepNumber] - номер шага (при воспроизведении)
 * @param {string} [testId] - ID теста
 * @param {number} [runId] - ID прогона (runHistory.runId или startTime)
 */


/**
 * Обновить результат шага в записи лога по id.
 * @param {string} logId
 * @param {boolean} stepPassed
 */


/**
 * Обновить результат теста для всех записей лога с заданными testId и runId.
 * @param {string} testId
 * @param {number} runId
 * @param {boolean} testPassed
 */


function registerBackgroundMessageHandlers(manager, registry) {
  if (!registry) {
    return;
  }

  // ========================================
  // PERFORMANCE ANALYTICS HANDLERS
  // ========================================

  /**
   * Start performance monitoring
   * Sends command to content script to initialize collector
   */
  registry.register('PERFORMANCE_START_MONITORING', ({ message, sender, sendResponse }) => {
    const safeSend = (res) => { try { sendResponse(res); } catch (e) {} };
    if (!sender.tab?.id) {
      safeSend({ success: false, error: 'No tab ID in sender' });
      return;
    }
    console.log('🚀 [Performance] Starting monitoring for test:', message.testId);
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'START_PERFORMANCE_MONITORING',
      testId: message.testId,
      config: message.config || {
        webVitals: true,
        resourceTiming: true,
        navigationTiming: true
      }
    }).then(() => safeSend({ success: true })).catch((err) => {
      console.warn('⚠️ [Performance] Start monitoring failed (content script may not be ready):', err.message);
      safeSend({ success: true }); // best-effort: don't block test; analysis may still get data
    });
    return true; // async response
  });

  /**
   * Mark performance step
   * Notifies collector about step boundary.
   * Fire-and-forget: respond immediately to avoid "message channel closed" when tab navigates.
   */
  registry.register('PERFORMANCE_MARK_STEP', ({ message, sender, sendResponse }) => {
    const safeSend = (res) => { try { sendResponse(res); } catch (e) {} };
    if (!sender.tab?.id) {
      safeSend({ success: false, error: 'No tab ID in sender' });
      return;
    }
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'MARK_PERFORMANCE_STEP',
      stepIndex: message.stepIndex,
      stepType: message.stepType,
      metadata: message.metadata || {}
    }).then(() => safeSend({ success: true })).catch((err) => {
      console.warn('⚠️ [Performance] Mark step failed (content script may have unloaded):', err?.message);
      safeSend({ success: true }); // best-effort: don't block test
    });
    return true; // async response
  });

  /**
   * Save partial performance data before navigation (for merge on test completion)
   */
  registry.register('PERFORMANCE_SAVE_PARTIAL', async ({ message, sender, sendResponse }) => {
    try {
      if (!message.testId || !sender.tab?.id) {
        sendResponse({ success: false });
        return;
      }
      const response = await chrome.tabs.sendMessage(sender.tab.id, { type: 'COLLECT_PERFORMANCE_DATA' });
      if (response?.success && response?.data?.steps?.length > 0) {
        const partialKey = `performanceData_partial_${message.testId}`;
        await chrome.storage.local.set({
          [partialKey]: {
            testId: message.testId,
            timestamp: Date.now(),
            data: response.data
          }
        });
        console.log('📊 [Performance] Partial data saved before nav:', response.data.steps.length, 'steps');
      }
      sendResponse({ success: true });
    } catch (e) {
      console.warn('⚠️ [Performance] Save partial failed:', e?.message);
      sendResponse({ success: false });
    }
  });

  /**
   * Collect performance data
   * Retrieves all collected metrics from content script and saves to storage
   */
  registry.register('PERFORMANCE_COLLECT_DATA', async ({ message, sender, sendResponse }) => {
    try {
      console.log('📊 [Performance] Collecting data for test:', message.testId);
      
      let performanceData = null;

      // Use data from message if provided (e.g. from analysis response after navigation)
      if (message.data && typeof message.data === 'object') {
        performanceData = message.data;
        console.log('📊 [Performance] Using data from message (analysis response)');
      }

      // Otherwise get from content script
      if (!performanceData && sender.tab?.id) {
        try {
          const response = await chrome.tabs.sendMessage(sender.tab.id, {
            type: 'COLLECT_PERFORMANCE_DATA'
          });
          if (response?.success && response?.data) {
            performanceData = response.data;
            console.log('📊 [Performance] Using data from content script');
          }
        } catch (e) {
          console.warn('⚠️ [Performance] Content script collect failed:', e.message);
        }
      }

      // Merge with partial data from before navigation (if any)
      if (performanceData?.steps?.length >= 0) {
        const partialKey = `performanceData_partial_${message.testId}`;
        const stored = await chrome.storage.local.get(partialKey);
        const partial = stored[partialKey];
        if (partial?.data?.steps?.length > 0) {
          const partialSteps = partial.data.steps;
          const currentSteps = performanceData.steps || [];
          const maxPartialIndex = Math.max(...partialSteps.map(s => s.stepIndex ?? -1), -1);
          const mergedSteps = [...partialSteps];
          for (const s of currentSteps) {
            const idx = s.stepIndex ?? mergedSteps.length;
            if (idx > maxPartialIndex) {
              mergedSteps.push(s);
            }
          }
          mergedSteps.sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
          performanceData = { ...performanceData, steps: mergedSteps };
          await chrome.storage.local.remove(partialKey);
          console.log('📊 [Performance] Merged partial + current:', partialSteps.length, '+', currentSteps.length, '->', mergedSteps.length, 'steps');
        }
      }

      if (!performanceData) {
        sendResponse({ success: false, error: 'No performance data available. Ensure performance monitoring was started before the analysis step (e.g. no navigation before analysis-performance).' });
        return;
      }

      // Save to storage
      const storageKey = `performanceData_${message.testId}`;
      await chrome.storage.local.set({
        [storageKey]: {
          testId: message.testId,
          timestamp: Date.now(),
          data: performanceData
        }
      });

      // Also save to latest for easy access
      await chrome.storage.local.set({
        'performanceData_latest': {
          testId: message.testId,
          timestamp: Date.now(),
          data: performanceData
        }
      });

      console.log('✅ [Performance] Data saved to storage:', storageKey);
      sendResponse({ success: true, data: performanceData });
    } catch (error) {
      console.error('❌ [Performance] Error collecting data:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /**
   * Stop performance monitoring
   * Fire-and-forget: send command and respond immediately to avoid "message channel closed"
   * when tab navigates and content script unloads before we can respond.
   */
  registry.register('PERFORMANCE_STOP_MONITORING', ({ message, sender, sendResponse }) => {
    if (!sender.tab?.id) {
      sendResponse({ success: false, error: 'No tab ID in sender' });
      return;
    }
    console.log('🛑 [Performance] Stopping monitoring');
    chrome.tabs.sendMessage(sender.tab.id, { type: 'STOP_PERFORMANCE_MONITORING' }).catch(() => {});
    sendResponse({ success: true }); // respond immediately, don't wait for content script
  });

  /**
   * Save performance baseline
   * Stores current performance data as baseline for future comparisons
   */
  registry.register('PERFORMANCE_SAVE_BASELINE', async ({ message, sendResponse }) => {
    const safeSend = (res) => { try { sendResponse(res); } catch (e) { console.warn('sendResponse failed:', e); } };
    try {
      const testId = message.testId || message.data?.testId || 'latest';
      console.log('💾 [Performance] Saving baseline for test:', testId);

      if (!message.data) {
        safeSend({ success: false, error: 'No data provided for baseline' });
        return;
      }

      // Get existing baselines
      const storage = await chrome.storage.local.get('performanceBaselines');
      const baselines = storage.performanceBaselines || {};

      // Initialize array for this test if needed
      if (!baselines[testId]) {
        baselines[testId] = [];
      }

      // Add new baseline
      baselines[testId].push({
        timestamp: Date.now(),
        data: message.data,
        label: message.label || `Baseline ${new Date().toLocaleString()}`
      });

      // Keep only last 10 baselines per test
      if (baselines[testId].length > 10) {
        baselines[testId] = baselines[testId].slice(-10);
      }

      // Save
      await chrome.storage.local.set({ performanceBaselines: baselines });

      console.log('✅ [Performance] Baseline saved');
      safeSend({ success: true, count: baselines[testId].length });
    } catch (error) {
      console.error('❌ [Performance] Error saving baseline:', error);
      safeSend({ success: false, error: error?.message || String(error) });
    }
  });

  /**
   * Load performance baselines
   * Retrieves all baselines for a test
   */
  registry.register('PERFORMANCE_LOAD_BASELINES', async ({ message, sendResponse }) => {
    try {
      console.log('📂 [Performance] Loading baselines for test:', message.testId);

      const storage = await chrome.storage.local.get('performanceBaselines');
      const baselines = storage.performanceBaselines || {};

      const testBaselines = baselines[message.testId] || [];

      console.log(`✅ [Performance] Found ${testBaselines.length} baselines`);
      sendResponse({ success: true, baselines: testBaselines });
    } catch (error) {
      console.error('❌ [Performance] Error loading baselines:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /**
   * Delete performance baseline
   */
  registry.register('PERFORMANCE_DELETE_BASELINE', async ({ message, sendResponse }) => {
    try {
      console.log('🗑️ [Performance] Deleting baseline:', message.testId, message.timestamp);

      const storage = await chrome.storage.local.get('performanceBaselines');
      const baselines = storage.performanceBaselines || {};

      if (baselines[message.testId]) {
        baselines[message.testId] = baselines[message.testId].filter(
          b => b.timestamp !== message.timestamp
        );

        await chrome.storage.local.set({ performanceBaselines: baselines });
        console.log('✅ [Performance] Baseline deleted');
      }

      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ [Performance] Error deleting baseline:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /**
   * Get performance data
   * Retrieves performance data for a specific test or latest
   */
  registry.register('PERFORMANCE_GET_DATA', async ({ message, sendResponse }) => {
    try {
      const testId = message.testId || 'latest';
      const storageKey = `performanceData_${testId}`;
      
      console.log('📊 [Performance] Getting data:', storageKey);

      let storage = await chrome.storage.local.get(storageKey);
      let data = storage[storageKey];

      // Fallback to latest if testId-specific data not found
      let usedFallback = false;
      if (!data && testId !== 'latest') {
        console.log('⚠️ [Performance] No data for testId, trying latest...');
        storage = await chrome.storage.local.get('performanceData_latest');
        data = storage.performanceData_latest;
        if (data) {
          usedFallback = true;
          console.log('📊 [Performance] Using latest data (testId may differ)');
        }
      }

      if (!data) {
        console.log('⚠️ [Performance] No data found for:', storageKey);
        sendResponse({ success: false, error: 'No performance data found' });
        return;
      }

      console.log('✅ [Performance] Data retrieved');
      sendResponse({ success: true, data: data, usedFallback });
    } catch (error) {
      console.error('❌ [Performance] Error getting data:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // ========================================
  // EXISTING HANDLERS
  // ========================================

  registry.register('GET_TEST_HISTORY', async ({ message, sendResponse }) => {
    try {
      const history = manager.getTestHistory(message.testId);
      sendResponse({ success: true, history });
    } catch (error) {
      console.error('❌ Ошибка при получении истории:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('GET_TESTS', async ({ sendResponse }) => {
    try {
      const testsArray = Array.from(manager.tests.values());
      const groupsArray = Array.from(manager.testGroups?.values?.() || []);
      const license = self.AccessPolicy && self.AccessPolicy.getLicense
        ? await self.AccessPolicy.getLicense()
        : { tier: 'free', valid: false };
      const capabilities = self.AccessPolicy && self.AccessPolicy.getCapabilities
        ? self.AccessPolicy.getCapabilities(license)
        : { tier: 'free' };
      console.log(`📋 Запрос списка тестов: найдено ${testsArray.length} тестов, ${groupsArray.length} групп`);
      sendResponse({
        success: true,
        tests: testsArray,
        groups: groupsArray,
        tier: capabilities.tier || 'free',
        capabilities,
        freeTierLimit: FREE_TIER_TEST_LIMIT,
        limitsEnabled: ENABLE_FREEMIUM_LIMITS
      });
    } catch (error) {
      console.error('❌ Ошибка при получении списка тестов:', error);
      sendResponse({ success: false, error: error.message, tests: [], groups: [] });
    }
  });

  /**
   * Возвращает все группы тестов.
   */
  registry.register('GET_TEST_GROUPS', async ({ sendResponse }) => {
    try {
      const groupsArray = Array.from(manager.testGroups?.values?.() || []);
      sendResponse({ success: true, groups: groupsArray });
    } catch (error) {
      console.error('❌ Ошибка при получении групп тестов:', error);
      sendResponse({ success: false, error: error.message, groups: [] });
    }
  });

  /**
   * Создаёт или обновляет группу тестов.
   * message: { group: { id?, name, description?, testIds: string[], meta? } }
   */
  registry.register('UPDATE_TEST_GROUP', async ({ message, sendResponse }) => {
    try {
      const incoming = message.group || {};
      const now = new Date().toISOString();
      let id = incoming.id;
      if (!id) {
        id = String(Date.now());
      }
      const existing = manager.testGroups.get(id);
      const baseCreatedAt = existing?.createdAt || incoming.createdAt || now;
      const group = {
        id,
        name: incoming.name || existing?.name || `Group ${id}`,
        description: incoming.description ?? existing?.description ?? '',
        testIds: Array.isArray(incoming.testIds) ? incoming.testIds.map(String) : (existing?.testIds || []),
        createdAt: baseCreatedAt,
        updatedAt: now,
        meta: incoming.meta ?? existing?.meta ?? {}
      };

      manager.testGroups.set(id, group);
      await manager.saveTestGroups();
      console.log('✅ Группа тестов сохранена:', { id: group.id, name: group.name, tests: group.testIds.length });
      sendResponse({ success: true, group });
    } catch (error) {
      console.error('❌ Ошибка при сохранении группы тестов:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /**
   * Удаляет группу тестов.
   * message: { groupId: string }
   */
  registry.register('DELETE_TEST_GROUP', async ({ message, sendResponse }) => {
    try {
      const groupId = String(message.groupId);
      if (!groupId) {
        sendResponse({ success: false, error: 'groupId is required' });
        return;
      }
      const existed = manager.testGroups.delete(groupId);
      if (existed) {
        await manager.saveTestGroups();
        console.log('🗑️ Группа тестов удалена:', groupId);
      }
      sendResponse({ success: true, removed: existed });
    } catch (error) {
      console.error('❌ Ошибка при удалении группы тестов:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /** Порядок шагов (actions) не должен меняться ни при каких условиях, кроме явного перетаскивания в редакторе. */
  registry.register('GET_TEST', async ({ message, sendResponse }) => {
    const test = getTestById(manager, message.testId);
    if (!test) {
      sendResponse({ success: false, test: undefined });
      return;
    }
    const actionsCopy = Array.isArray(test.actions) ? [...test.actions] : [];
    sendResponse({ success: true, test: { ...test, actions: actionsCopy } });
  });

  registry.register('GET_ALL_TESTS', async ({ sendResponse }) => {
    const tests = Array.from(manager.tests.values());
    sendResponse({ success: true, tests });
  });

  registry.register('DELETE_TEST', async ({ message, sendResponse }) => {
    try {
      const testId = String(message.testId);
      manager.tests.delete(testId);
      if (/^\d+$/.test(testId)) {
        manager.tests.delete(Number(testId));
      }
      manager.testHistory.delete(testId);
      if (/^\d+$/.test(testId)) {
        manager.testHistory.delete(Number(testId));
      }

      // Удаляем тест из всех групп, где он присутствует
      let groupsChanged = false;
      if (manager.testGroups && manager.testGroups.size > 0) {
        for (const [groupId, group] of manager.testGroups.entries()) {
          const beforeLen = Array.isArray(group.testIds) ? group.testIds.length : 0;
          const filtered = (group.testIds || []).filter(id => String(id) !== testId);
          if (filtered.length !== beforeLen) {
            manager.testGroups.set(groupId, { ...group, testIds: filtered, updatedAt: new Date().toISOString() });
            groupsChanged = true;
          }
        }
      }

      await manager.saveTests();
      await manager.saveTestHistory();
      if (groupsChanged) {
        await manager.saveTestGroups();
      }

      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ Ошибка при удалении теста:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('SAVE_TEST_RUN_HISTORY', async ({ message, sendResponse }) => {
    try {
      console.log('💾 [Background] SAVE_TEST_RUN_HISTORY получен:', {
        testId: message.runHistory?.testId,
        hasSteps: !!message.runHistory?.steps,
        stepsCount: message.runHistory?.steps?.length || 0,
        hasStartTime: !!message.runHistory?.startTime,
        success: message.runHistory?.success
      });
      if (!message.runHistory || !message.runHistory.testId) {
        console.error('❌ [Background] Невалидная история прогона:', message.runHistory);
        sendResponse({
          success: false,
          error: 'Невалидная история прогона: отсутствует testId'
        });
        return;
      }

      manager.addTestRunHistory(message.runHistory.testId, message.runHistory);
      console.log('✅ [Background] История добавлена в память');

      try {
        await manager.saveTestHistory();
        console.log('✅ [Background] История сохранена в storage');
      } catch (storageError) {
        const errorMessage = storageError?.message || storageError?.toString() || 'Неизвестная ошибка';
        if (
          errorMessage.includes('quota') ||
          errorMessage.includes('QUOTA') ||
          errorMessage.includes('QuotaExceededError') ||
          errorMessage.includes('kQuotaBytes') ||
          errorMessage.includes('Resource::kQuotaBytes')
        ) {
          console.warn('⚠️ Превышена квота хранилища при сохранении истории прогона');
          console.warn('   История сохранена в памяти, но не в storage из-за квоты');
          sendResponse({
            success: true,
            warning: 'История сохранена в памяти, но не в storage из-за квоты'
          });
          return;
        }
        throw storageError;
      }

      const test = manager.tests.get(message.runHistory.testId);
      if (test) {
        manager.triggerExcelExport(message.runHistory.testId, 'history', message.runHistory).catch(error => {
          console.error('❌ Ошибка при экспорте истории в Excel:', error);
        });
      }

      // Видео останавливаем только при TEST_COMPLETED, не при каждом промежуточном SAVE_TEST_RUN_HISTORY

      sendResponse({ success: true });
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Неизвестная ошибка';
      console.error('❌ Ошибка при сохранении истории прогона:', errorMessage);
      console.error('❌ Детали ошибки:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        runHistory: message.runHistory
      });
      sendResponse({
        success: true,
        warning: 'История сохранена в памяти, но произошла ошибка при сохранении в storage',
        error: errorMessage
      });
    }
  });

  registry.register('GET_STATE', async ({ sendResponse }) => {
    sendResponse({
      success: true,
      state: {
        isRecording: manager.isRecording,
        isPlaying: manager.isPlaying,
        currentTestId: manager.currentTest?.id,
        testsCount: manager.tests.size,
        currentStep: manager.currentStep || 0,
        totalSteps: manager.totalSteps || 0,
        stepType: manager.stepType || null,
        currentGroupId: manager.currentGroupId || null
      }
    });
  });

  registry.register('PAUSE_PLAYBACK', async ({ sendResponse }) => {
    if (manager.isPlaying) {
      await manager.broadcast({ type: 'PAUSE_PLAYBACK' });
      console.log('⏸️ [Background] Отправлена команда паузы воспроизведения');
    } else {
      sendResponse({ success: false, error: 'Воспроизведение не активно' });
      return;
    }
    sendResponse({ success: true });
  });

  registry.register('RESUME_PLAYBACK_FROM_PAUSE', async ({ sendResponse }) => {
    await manager.broadcast({ type: 'RESUME_PLAYBACK_FROM_PAUSE' });
    console.log('▶️ [Background] Отправлена команда возобновления воспроизведения');
    sendResponse({ success: true });
  });

  registry.register('STOP_PLAYING', async ({ sendResponse }) => {
    if (manager.currentVideoRecording) {
      await manager.stopVideoRecordingIfActive(manager.currentVideoRecording.testId);
    }
    if (manager.isRecording) {
      manager.isRecording = false;
      if (manager.currentTest) {
        manager.tests.set(manager.currentTest.id, manager.currentTest);
        await manager.saveTests();
        const testId = manager.currentTest.id;
        manager.currentTest = null;
        await manager.broadcast({ type: 'RECORDING_STOPPED', testId });
      } else {
        await manager.broadcast({ type: 'FORCE_STOP' });
      }
    }
    if (manager.isPlaying) {
      manager.isPlaying = false;
      manager.currentStep = 0;
      manager.totalSteps = 0;
      manager.stepType = null;
      manager.playbackState = null;
      manager.playbackTabId = null;
      try {
        await chrome.storage.local.remove('playbackState');
        console.log('✅ Состояние воспроизведения очищено из storage');
      } catch (error) {
        console.error('❌ Ошибка при очистке состояния из storage:', error);
      }
      await manager.broadcast({ type: 'STOP_PLAYING' });
    }
    sendResponse({ success: true });
  });

  registry.register('FORCE_STOP', async ({ sendResponse }) => {
    if (manager.currentVideoRecording) {
      await manager.stopVideoRecordingIfActive(manager.currentVideoRecording.testId);
    }
    if (manager.isRecording) {
      manager.isRecording = false;
      if (manager.currentTest) {
        manager.tests.set(manager.currentTest.id, manager.currentTest);
        await manager.saveTests();
        const testId = manager.currentTest.id;
        manager.currentTest = null;
        await manager.broadcast({ type: 'RECORDING_STOPPED', testId });
      } else {
        await manager.broadcast({ type: 'FORCE_STOP' });
      }
    }
    if (manager.isPlaying) {
      manager.isPlaying = false;
      manager.currentStep = 0;
      manager.totalSteps = 0;
      manager.stepType = null;
      manager.playbackState = null;
      manager.playbackTabId = null;
      try {
        await chrome.storage.local.remove('playbackState');
        console.log('✅ Состояние воспроизведения очищено из storage');
      } catch (error) {
        console.error('❌ Ошибка при очистке состояния из storage:', error);
      }
      await manager.broadcast({ type: 'STOP_PLAYING' });
    }
    sendResponse({ success: true });
  });

  registry.register('PLAY_TEST', async ({ message, sendResponse }) => {
    // Одиночный запуск теста — сбрасываем группу, чтобы GET_STATE и полоса прогресса были стандартными
    manager.currentGroupId = null;
    await manager.handlePlayTest(message, sendResponse);
  });

  /**
   * Запуск группы тестов по groupId.
   * Оркестрация последовательного запуска будет реализована в TestManager.
   */
  registry.register('PLAY_TEST_GROUP', async ({ message, sendResponse }) => {
    try {
      if (!message.groupId) {
        sendResponse({ success: false, error: 'groupId is required' });
        return;
      }
      if (typeof manager.playTestGroup === 'function') {
        await manager.playTestGroup(String(message.groupId), message.mode || 'optimized', !!message.debugMode);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'playTestGroup is not implemented' });
      }
    } catch (error) {
      console.error('❌ Ошибка при запуске группы тестов:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('PATCH_TEST_ACTION', async ({ message, sendResponse }) => {
    try {
      const { testId, actionIndex, patch } = message;
      if (!testId || patch == null || typeof patch !== 'object') {
        sendResponse({ success: false, error: 'testId and patch required' });
        return;
      }
      const test = manager.tests.get(testId);
      if (!test || !Array.isArray(test.actions)) {
        sendResponse({ success: false, error: 'Test not found' });
        return;
      }
      const idx = parseInt(actionIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= test.actions.length) {
        sendResponse({ success: false, error: 'Invalid actionIndex' });
        return;
      }
      const action = test.actions[idx];
      if (patch.selector != null) {
        action.selector = patch.selector;
      }
      if (patch.source != null) {
        action.source = patch.source;
      }
      if (patch.urlResult != null) {
        action.urlResult = patch.urlResult;
      }
      await manager.saveTests();
      manager.broadcast({ type: 'TEST_UPDATED', testId, actionIndex: idx, patch });
      chrome.runtime.sendMessage({ type: 'TEST_UPDATED', testId }).catch(() => {});
      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ [Background] PATCH_TEST_ACTION error:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('PLAY_TEST_PARALLEL', async ({ message, sendResponse }) => {
    const testToPlay = manager.tests.get(message.testId);
    if (!testToPlay) {
      sendResponse({ success: false, error: 'Test not found' });
      return;
    }

    const tabCount = message.tabCount || 3;
    const runMode = message.mode || 'optimized';

    try {
      const actionsToCheck = (testToPlay.actions || []).filter(action => {
        return runMode === 'full' ? true : !action.hidden;
      });

      const visualActionTypes = ['click', 'input', 'change', 'scroll', 'navigation', 'waitForElement', 'screenshot'];
      const hasVisualActions = actionsToCheck.some(action => {
        if (visualActionTypes.includes(action.type)) {
          return true;
        }

        const checkNestedActions = (nestedActions) => {
          const filteredNested = nestedActions.filter(a => runMode === 'full' ? true : !a.hidden);
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

      if (!hasVisualActions) {
        console.log(`✅ [Parallel] Тест не содержит визуальных действий, выполняю ${tabCount} параллельных прогонов из background script`);

        const runPromises = [];
        for (let i = 0; i < tabCount; i++) {
          const runPromise = (async () => {
            try {
              await new Promise(resolve => setTimeout(resolve, i * 10));
              console.log(`🚀 [Parallel] Запуск прогона ${i + 1}/${tabCount} из background script`);
              await manager.executeTestFromBackground(testToPlay, runMode, false);
              console.log(`✅ [Parallel] Прогон ${i + 1}/${tabCount} завершен успешно`);
              return { runIndex: i + 1, success: true };
            } catch (error) {
              console.error(`❌ [Parallel] Ошибка в прогоне ${i + 1}/${tabCount}:`, error);
              return { runIndex: i + 1, success: false, error: error.message };
            }
          })();
          runPromises.push(runPromise);
        }

        const allResults = await Promise.all(runPromises);
        const successCount = allResults.filter(r => r.success).length;

        sendResponse({
          success: true,
          totalRuns: tabCount,
          successRuns: successCount,
          results: allResults,
          executionMode: 'background'
        });
        return;
      }

      console.log(`🌐 [Parallel] Тест содержит визуальные действия, создаю ${tabCount} вкладок`);
      const tabPromises = [];

      for (let i = 0; i < tabCount; i++) {
        const tabPromise = (async () => {
          try {
            const firstAction = testToPlay.actions?.find(a => a.url);
            const startUrl = firstAction?.url || 'about:blank';

            const tab = await chrome.tabs.create({ url: startUrl });

            await new Promise(resolve => {
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              });
            });

            await chrome.tabs.sendMessage(tab.id, {
              type: 'PLAY_TEST',
              test: testToPlay,
              mode: runMode,
              parallelRun: true,
              runIndex: i + 1,
              totalRuns: tabCount
            });

            return { tabId: tab.id, runIndex: i + 1, success: true };
          } catch (error) {
            console.error(`Ошибка при запуске теста во вкладке ${i + 1}:`, error);
            return { tabId: null, runIndex: i + 1, success: false, error: error.message };
          }
        })();

        tabPromises.push(tabPromise);
      }

      const allResults = await Promise.all(tabPromises);
      const successCount = allResults.filter(r => r.success).length;

      sendResponse({
        success: true,
        totalTabs: tabCount,
        successTabs: successCount,
        results: allResults,
        executionMode: 'tabs'
      });
    } catch (error) {
      console.error('Ошибка при параллельном запуске:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('SAVE_PLAYBACK_STATE', async ({ message, sender, sendResponse }) => {
    if (sender?.tab?.id != null) {
      manager.playbackTabId = sender.tab.id;
    }
    console.log('💾 Сохранение состояния воспроизведения:', {
      testId: message.test?.id,
      testName: message.test?.name,
      actionIndex: message.actionIndex,
      nextUrl: message.nextUrl,
      hasTest: !!message.test,
      testActionsCount: message.test?.actions?.length
    });

    if (message.test) {
      const test = message.test;
      console.log('🔍 Проверка структуры теста перед сохранением:', {
        hasId: !!test.id,
        hasName: !!test.name,
        hasActions: !!test.actions,
        actionsIsArray: Array.isArray(test.actions),
        actionsCount: test.actions?.length,
        hasCreatedAt: !!test.createdAt,
        hasUpdatedAt: !!test.updatedAt
      });

      if (!Array.isArray(test.actions)) {
        console.error('❌ ОШИБКА: test.actions не является массивом!', typeof test.actions, test.actions);
      }

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
      console.error('❌ ОШИБКА: message.test отсутствует!');
    }

    const testToSave = message.test ? {
      id: message.test.id,
      name: message.test.name,
      actions: message.test.actions ? [...message.test.actions] : [],
      createdAt: message.test.createdAt,
      updatedAt: message.test.updatedAt
    } : null;

    const runMode = message.runMode || manager.playbackState?.runMode || 'optimized';
    const prevSteps = manager.playbackState?.runHistory && Array.isArray(manager.playbackState.runHistory.steps)
      ? manager.playbackState.runHistory.steps.length
      : 0;
    const incomingSteps = message.runHistory && Array.isArray(message.runHistory.steps)
      ? message.runHistory.steps.length
      : 0;
    let effectiveRunHistory = message.runHistory || null;

    // Если уже есть runHistory с шагами, а новое сохранение (__AUTO_NAV__) приходит пустым,
    // не затираем существующую историю.
    if (message.nextUrl === '__AUTO_NAV__' && prevSteps > 0 && incomingSteps === 0) {
      effectiveRunHistory = manager.playbackState.runHistory || null;
    }

    const prevState = manager.playbackState;
    const incomingIdx = Number(message.actionIndex);
    const incomingIdxSafe = Number.isFinite(incomingIdx) ? incomingIdx : 0;
    const prevIdx = Number(prevState?.actionIndex);
    const prevIdxSafe = Number.isFinite(prevIdx) ? prevIdx : 0;
    const sameTest = !!(testToSave && prevState?.test &&
      String(testToSave.id) === String(prevState.test?.id || prevState.testRefId || ''));
    let mergedActionIndex = incomingIdxSafe;
    let mergedPlaybackSessionId = message.playbackSessionId || prevState?.playbackSessionId || null;
    if (sameTest) {
      mergedActionIndex = Math.max(incomingIdxSafe, prevIdxSafe);
      if (mergedActionIndex > incomingIdxSafe) {
        mergedPlaybackSessionId = prevState.playbackSessionId || mergedPlaybackSessionId;
        console.log('🛡️ [SAVE_PLAYBACK_STATE] Не уменьшаю actionIndex (устаревшее сохранение отклонено):', {
          incoming: incomingIdxSafe,
          previous: prevIdxSafe,
          merged: mergedActionIndex
        });
      }
    }

    manager.playbackState = {
      test: testToSave,
      actionIndex: mergedActionIndex,
      nextUrl: message.nextUrl,
      runMode,
      runHistory: effectiveRunHistory,
      isGroupRun: message.isGroupRun || false,
      groupRunCurrentIndex: message.groupRunCurrentIndex,
      groupRunTotal: message.groupRunTotal,
      playbackSessionId: mergedPlaybackSessionId
    };
    const playbackStateForStorage = {
      ...manager.playbackState,
      testRefId: testToSave?.id || null,
      // Храним в storage только метаданные теста, чтобы не выбивать квоту.
      test: testToSave ? {
        id: testToSave.id,
        name: testToSave.name,
        createdAt: testToSave.createdAt,
        updatedAt: testToSave.updatedAt
      } : null
    };

    if (!manager.isPlaying) {
      console.log('⚠️ isPlaying был false, устанавливаю в true');
      manager.isPlaying = true;
    }

    const isQuotaError = (e) => {
      const msg = (e?.message || e?.toString() || '').toLowerCase();
      return msg.includes('quota') || msg.includes('kquotabytes') || msg.includes('resource::');
    };

    try {
      await chrome.storage.local.set({ playbackState: playbackStateForStorage });
      console.log('✅ Состояние воспроизведения сохранено в storage');

      const verify = await chrome.storage.local.get('playbackState');
      if (verify.playbackState) {
        console.log('✅ Проверка сохранения: состояние успешно сохранено и может быть восстановлено');
        console.log('   Сохранено:', {
          testId: verify.playbackState.test?.id,
          actionIndex: verify.playbackState.actionIndex,
          nextUrl: verify.playbackState.nextUrl
        });
      } else {
        console.error('❌ ОШИБКА: Состояние не найдено после сохранения!');
      }
    } catch (error) {
      console.error('❌ Ошибка при сохранении состояния в storage:', error);
      console.error('   Детали ошибки:', error.message, error.stack);
      if (isQuotaError(error)) {
        try {
          const trimmed = { ...playbackStateForStorage };
          if (trimmed.runHistory?.steps?.length) {
            trimmed.runHistory = {
              ...trimmed.runHistory,
              steps: trimmed.runHistory.steps.map(s => ({
                ...s,
                screenshot: undefined,
                beforeScreenshot: undefined,
                afterScreenshot: undefined
              }))
            };
          }
          await chrome.storage.local.set({ playbackState: trimmed });
          console.warn('⚠️ Состояние сохранено без скриншотов из-за квоты хранилища');
        } catch (e2) {
          console.warn('⚠️ Не удалось сохранить даже облегчённое состояние:', e2?.message);
        }
      }
    }

    console.log('✅ Состояние воспроизведения сохранено');
    sendResponse({ success: true });
  });

  registry.register('GET_PLAYBACK_STATE', async ({ sendResponse }) => {
    // Fallback: при пробуждении service worker (MV3) manager.playbackState может быть null —
    // загружаем из storage для восстановления после nav-refresh
    let state = manager.playbackState;
    if (!state) {
      try {
        const data = await chrome.storage.local.get('playbackState');
        if (data.playbackState) {
          state = data.playbackState;
          manager.playbackState = state;
          manager.isPlaying = true;
          console.log('📥 Восстановлено playbackState из storage (service worker перезапущен)');
        }
      } catch (e) {
        console.warn('⚠️ Ошибка загрузки playbackState из storage:', e?.message);
      }
    }

    console.log('📥 Запрос состояния воспроизведения:', {
      hasPlaybackState: !!state,
      isPlaying: manager.isPlaying,
      actionIndex: state?.actionIndex,
      nextUrl: state?.nextUrl
    });

    const stateHasActions = !!(state?.test && Array.isArray(state.test.actions));
    if (state && !stateHasActions) {
      const refId = state?.testRefId || state?.test?.id;
      const fullTest = refId ? getTestById(manager, refId) : null;
      if (fullTest) {
        state = {
          ...state,
          test: {
            ...fullTest,
            actions: Array.isArray(fullTest.actions) ? [...fullTest.actions] : []
          }
        };
        manager.playbackState = state;
      }
    }

    if (state && (manager.isPlaying || state.test)) {
      console.log('✅ Возвращаю активное состояние воспроизведения');
      const inGroupRun = !!manager.currentGroupId;
      sendResponse({
        success: true,
        isPlaying: true,
        test: state.test,
        actionIndex: state.actionIndex,
        nextUrl: state.nextUrl,
        runMode: state.runMode || 'optimized',
        runHistory: state.runHistory || null,
        isGroupRun: state.isGroupRun || inGroupRun,
        groupRunCurrentIndex: state.groupRunCurrentIndex,
        groupRunTotal: state.groupRunTotal,
        playbackSessionId: state.playbackSessionId || null
      });
    } else {
      console.log('ℹ️ Воспроизведение не активно');
      sendResponse({ success: true, isPlaying: false });
    }
  });

  registry.register('CLEAR_PLAYBACK_STATE', async ({ sendResponse }) => {
    try {
      manager.playbackState = null;
      manager.isPlaying = false;
      await chrome.storage.local.remove('playbackState');
      console.log('✅ [CLEAR_PLAYBACK_STATE] Состояние воспроизведения очищено');
      sendResponse({ success: true });
    } catch (e) {
      console.warn('⚠️ [CLEAR_PLAYBACK_STATE]', e?.message);
      sendResponse({ success: false, error: e?.message });
    }
  });

  registry.register('CLEAR_ALL_SCREENSHOTS', async ({ sendResponse }) => {
    try {
      console.log('🧹 [Background] Очистка всех скриншотов из истории прогонов...');

      await manager.deleteScreenshotFiles();

      let clearedCount = 0;

      for (const [, history] of manager.testHistory.entries()) {
        for (const run of history) {
          if (run.steps) {
            for (const step of run.steps) {
              if (step.screenshot) {
                delete step.screenshot;
              }
              if (step.beforeScreenshot) {
                delete step.beforeScreenshot;
              }
              if (step.afterScreenshot) {
                delete step.afterScreenshot;
              }
              if (step.screenshotComparison) {
                delete step.screenshotComparison;
              }
              if (step.screenshotComparisonView) {
                delete step.screenshotComparisonView;
              }
              delete step.screenshotPath;
              delete step.beforeScreenshotPath;
              delete step.afterScreenshotPath;
              delete step.errorScreenshotPath;
              if (step.screenshotComparison) {
                delete step.screenshotComparison.diffImagePath;
              }
              delete step.screenshotComparisonViewPath;
              clearedCount++;
            }
          }
          if (run.screenshots) {
            delete run.screenshots;
          }
        }
      }

      await manager.saveTestHistory();

      console.log(`✅ [Background] Очищено скриншотов из ${clearedCount} шагов, файлы удалены с диска`);
      sendResponse({
        success: true,
        clearedCount: clearedCount
      });
    } catch (error) {
      console.error('❌ [Background] Ошибка при очистке скриншотов:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  });

  registry.register('ANALYZE_TEST_HISTORY', async ({ message, sendResponse }) => {
    try {
      const analysis = manager.analyzeTestHistory(message.testId);
      sendResponse(analysis);
    } catch (error) {
      console.error('❌ Ошибка при анализе истории:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  });

  registry.register('OPTIMIZE_SELECTORS_FROM_HISTORY', async ({ message, sendResponse }) => {
    try {
      const optimizationResult = await manager.optimizeSelectorsFromHistory(message.testId, message.runHistory);
      sendResponse(optimizationResult);
    } catch (error) {
      console.error('❌ Ошибка при оптимизации селекторов:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  });





  registry.register('GET_CURRENT_TAB', async ({ sendResponse }) => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        sendResponse({ success: true, id: tabs[0].id });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('START_RECORDING', async ({ message, sendResponse }) => {
    console.log('🎬 Обработка START_RECORDING...');
    if (!await requireAccess(self.ActionCatalog ? self.ActionCatalog.START_RECORDING : 'recording.start', sendResponse)) {
      return;
    }
    if (manager.isRecording) {
      sendResponse({ success: false, error: 'Запись уже идет' });
      return;
    }
    if (ENABLE_FREEMIUM_LIMITS && manager.tests.size >= FREE_TIER_TEST_LIMIT) {
      sendResponse({
        success: false,
        error: 'FREE_TIER_LIMIT',
        limit: FREE_TIER_TEST_LIMIT
      });
      return;
    }

    manager.isRecording = true;
    manager.resumePlaybackAfterRecordingStop = false;
    manager._recordedClientActionIds = new Set();
    manager._recordedClientActionOrder = [];
    manager.currentTest = {
      id: Date.now().toString(),
      name: message.testName || `Test ${new Date().toLocaleString()}`,
      actions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      optimization: {
        optimizedAvailable: false
      }
    };

    console.log(`🎬 Начало записи теста: ${manager.currentTest.name} (ID: ${manager.currentTest.id})`);

    try {
      await manager.broadcast({ type: 'RECORDING_STARTED', testId: manager.currentTest.id });
      console.log('✅ Broadcast отправлен, отправляю ответ...');
      sendResponse({ success: true, testId: manager.currentTest.id });
      console.log('✅ Ответ отправлен успешно');
    } catch (error) {
      console.error('❌ Ошибка при запуске записи:', error);
      manager.isRecording = false;
      manager.currentTest = null;
      manager.resumePlaybackAfterRecordingStop = false;
      sendResponse({
        success: false,
        error: (error && error.message) ? error.message : String(error || 'START_RECORDING_FAILED')
      });
    }
  });

  /**
   * Получает URL действия по индексу
   * @param {Object} test - Тест
   * @param {number} actionIndex - Индекс действия
   * @returns {string|null} URL действия или null
   */
  function getActionUrl(test, actionIndex) {
    if (!test || !test.actions || actionIndex < 0 || actionIndex >= test.actions.length) {
      return null;
    }
    return test.actions[actionIndex].url || null;
  }

  registry.register('START_RECORDING_INTO_TEST', async ({ message, sendResponse }) => {
    console.log('🎬 Обработка START_RECORDING_INТО_TEST...');
    if (manager.isRecording) {
      sendResponse({ success: false, error: 'Запись уже идет' });
      return;
    }

    const existingTest = getTestById(manager, message.testId);
    if (!existingTest) {
      sendResponse({ success: false, error: 'Тест не найден' });
      return;
    }

    manager.isRecording = true;
    manager._recordedClientActionIds = new Set();
    manager._recordedClientActionOrder = [];
    manager.currentTest = existingTest;
    manager.recordInsertIndex = message.insertAfterIndex !== undefined ? message.insertAfterIndex + 1 : existingTest.actions.length;
    manager.recordedActionsCount = 0;
    manager.recordMarkerActionIndex = message.insertAfterIndex;
    manager.resumePlaybackAfterRecordingStop = false;

    console.log(`🎬 Начало записи в существующий тест: ${existingTest.name} (ID: ${existingTest.id}), вставка после индекса ${message.insertAfterIndex}`);

    // Определяем целевой URL
    let targetUrl = null;
    if (message.insertAfterIndex !== undefined && message.insertAfterIndex !== null) {
      // Если есть маркер, берем URL из действия с маркером
      targetUrl = getActionUrl(existingTest, message.insertAfterIndex);
    }

    // Если URL не найден, берем первый URL из теста
    if (!targetUrl) {
      const firstAction = existingTest.actions?.find(a => a.url);
      if (firstAction) {
        targetUrl = firstAction.url;
      }
    }

    // Если все еще нет URL, открываем about:blank
    if (!targetUrl) {
      targetUrl = 'about:blank';
    }

    console.log(`🎯 Целевой URL для записи: ${targetUrl}`);

    try {
      // Если указан tabId (вкладка воспроизведения) — запускаем запись именно там.
      const targetTabId = message?.tabId ? Number(message.tabId) : null;
      if (targetTabId) {
        let tab = null;
        try {
          tab = await chrome.tabs.get(targetTabId);
        } catch (e) {
          tab = null;
        }
        if (!tab) {
          throw new Error('Target tab not found for recording');
        }
        // Внедряем content scripts при необходимости
        try {
          await manager.injectContentScriptsIfNeeded(targetTabId, tab.url);
        } catch (_) {}
        await chrome.tabs.sendMessage(targetTabId, {
          type: 'RECORDING_STARTED',
          testId: manager.currentTest.id,
          insertAfterIndex: message.insertAfterIndex,
          fromMarker: true
        });
        console.log(`✅ RECORDING_STARTED отправлен в целевую вкладку ${targetTabId}`);
      } else {
        // Fallback (старое поведение): открываем вкладку с целевым URL и шлём broadcast
        const tab = await chrome.tabs.create({ url: targetUrl, active: true });
        console.log(`✅ Открыта вкладка: ${tab.id} (${targetUrl})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.action.openPopup();
        console.log('✅ Popup открыт для начала записи');
        await manager.broadcast({
          type: 'RECORDING_STARTED',
          testId: manager.currentTest.id,
          insertAfterIndex: message.insertAfterIndex,
          fromMarker: true
        });
      }
      manager.resumePlaybackAfterRecordingStop = !!(
        message.tabId != null &&
        String(message.tabId).trim() !== '' &&
        Number.isFinite(Number(message.tabId)) &&
        Number(message.tabId) > 0
      );
      console.log('✅ Broadcast отправлен, отправляю ответ...');
      sendResponse({ success: true, testId: manager.currentTest.id });
      console.log('✅ Ответ отправлен успешно');
    } catch (error) {
      console.error('❌ Ошибка при запуске записи:', error);
      manager.isRecording = false;
      manager.currentTest = null;
      manager.recordInsertIndex = null;
      manager.recordMarkerActionIndex = null;
      manager.resumePlaybackAfterRecordingStop = false;
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('STOP_RECORDING', async ({ message, sendResponse }) => {
    try {
      if (!manager.isRecording) {
        sendResponse({ success: false, error: 'Запись не активна' });
        return;
      }

      const cancelMarkerRecording = !!message?.cancelMarkerRecording;

      manager.isRecording = false;
      if (manager.currentTest) {
        const actionsCountBefore = manager.currentTest.actions.length;
        const wasRecordingIntoExisting = manager.recordInsertIndex !== undefined && manager.recordInsertIndex !== null;
        const recordedCount = manager.recordedActionsCount || 0;

        const sortStart = wasRecordingIntoExisting ? manager.recordInsertIndex : 0;
        const sortEndExclusive = wasRecordingIntoExisting
          ? Math.min(manager.currentTest.actions.length, sortStart + recordedCount)
          : manager.currentTest.actions.length;
        if (sortStart >= 0 && sortEndExclusive > sortStart) {
          const before = manager.currentTest.actions.slice(0, sortStart);
          const middle = manager.currentTest.actions.slice(sortStart, sortEndExclusive);
          const after = manager.currentTest.actions.slice(sortEndExclusive);
          middle.sort((a, b) => {
            const ta = Number(a?.timestamp) || 0;
            const tb = Number(b?.timestamp) || 0;
            if (ta !== tb) return ta - tb;
            const oa = Number(a?.__recordArrivalOrder) || 0;
            const ob = Number(b?.__recordArrivalOrder) || 0;
            return oa - ob;
          });
          manager.currentTest.actions = before.concat(middle, after).map(removeInternalRecordMeta);
        }

        const removedCount = manager.cleanDuplicateActions(manager.currentTest);
        if (removedCount > 0) {
          console.log(`🧹 Автоматически удалено ${removedCount} дублирующихся действий из записанного теста`);
        }

        if (wasRecordingIntoExisting && cancelMarkerRecording && recordedCount > 0 && manager.recordInsertIndex !== undefined && manager.recordInsertIndex !== null) {
          manager.currentTest.actions.splice(manager.recordInsertIndex, recordedCount);
          console.log(`⏹️ Запись по маркеру отменена пользователем, удалено ${recordedCount} записанных действий, тест не изменён относительно исходного состояния.`);
        }

        const actionsCountAfter = manager.currentTest.actions.length;
        manager.tests.set(manager.currentTest.id, manager.currentTest);
        await manager.saveTests();

        if (wasRecordingIntoExisting && manager.recordMarkerActionIndex !== null && manager.recordMarkerActionIndex !== undefined && !cancelMarkerRecording) {
          const markerActionIndexClear = manager.recordMarkerActionIndex;
          if (markerActionIndexClear >= 0 && markerActionIndexClear < manager.currentTest.actions.length) {
            const markerAction = manager.currentTest.actions[markerActionIndexClear];
            if (markerAction && markerAction.recordMarker === true) {
              markerAction.recordMarker = false;
              console.log(`🔴 Маркер записи снят с действия ${markerActionIndexClear + 1}`);
            }
          }
        }

        if (wasRecordingIntoExisting) {
          if (cancelMarkerRecording) {
            console.log(`⏹️ Запись по маркеру отменена пользователем. В тест "${manager.currentTest.name}" не добавлено ни одного нового действия (всего действий: ${actionsCountAfter})`);
          } else {
            console.log(`⏹️ Запись остановлена. В тест "${manager.currentTest.name}" добавлено ${recordedCount} действий (всего действий: ${actionsCountAfter})`);
          }
        } else {
          console.log(`⏹️ Запись остановлена. Сохранен тест "${manager.currentTest.name}" с ${actionsCountAfter} действиями (было ${actionsCountBefore})`);
        }

        const testId = manager.currentTest.id;
        const markerActionIndex = manager.recordMarkerActionIndex;
        const shouldResumePlayback =
          wasRecordingIntoExisting && !cancelMarkerRecording && !!manager.resumePlaybackAfterRecordingStop;
        manager.resumePlaybackAfterRecordingStop = false;
        manager.currentTest = null;
        manager.recordInsertIndex = null;
        manager.recordedActionsCount = 0;
        manager.recordMarkerActionIndex = null;
        await manager.broadcast({
          type: 'RECORDING_STOPPED',
          testId,
          recordedCount: cancelMarkerRecording ? 0 : recordedCount,
          markerActionIndex,
          shouldResumePlayback
        });
        sendResponse({ success: true, testId, recordedCount: cancelMarkerRecording ? 0 : recordedCount, canceledMarkerRecording: cancelMarkerRecording });
      } else {
        console.warn('⚠️ Попытка остановить запись, но активного теста нет');
        manager.resumePlaybackAfterRecordingStop = false;
        sendResponse({ success: false, error: 'No active test' });
      }
    } catch (error) {
      console.error('❌ STOP_RECORDING:', error);
      try {
        manager.isRecording = false;
        manager.resumePlaybackAfterRecordingStop = false;
      } catch (_) {}
      const msg = (error && error.message) ? error.message : String(error || 'STOP_RECORDING_FAILED');
      sendResponse({ success: false, error: msg });
    }
  });

  registry.register('ADD_ACTION', async ({ message, sendResponse }) => {
    if (manager.isRecording && manager.currentTest) {
      const incomingTs = Number(message?.action?.timestamp);
      const newAction = {
        ...message.action,
        // ВАЖНО: сохраняем исходный timestamp события из content script, если он передан.
        // Иначе порядок шагов может "плавать" из-за задержек доставки сообщений.
        timestamp: Number.isFinite(incomingTs) && incomingTs > 0 ? incomingTs : Date.now()
      };
      manager._recordArrivalCounter = (manager._recordArrivalCounter || 0) + 1;
      newAction.__recordArrivalOrder = manager._recordArrivalCounter;

      if (isDuplicateClientRecordedAction(manager, newAction)) {
        sendResponse({ success: true, duplicateClientAction: true });
        return;
      }

      const validation = validateIncomingRecordedAction(newAction);
      if (!validation.ok) {
        console.warn(`⚠️ [Background] ADD_ACTION rejected: ${validation.error}`, validation.details || '');
        sendResponse({ success: false, error: validation.error, details: validation.details || null });
        return;
      }
      newAction.type = validation.normalizedType || newAction.type;

      // Если ввод идёт сразу за кликом — пауза 200 мс и поиск в раскрывшемся поле при воспроизведении
      if (newAction.type === 'input') {
        const actions = manager.currentTest.actions || [];
        const last = actions.length > 0 ? actions[actions.length - 1] : null;
        if (last && (last.type === 'click' || last.type === 'dblclick')) {
          newAction.delayBefore = 200;
          newAction.inputAfterClick = true;
        }
      }

      const actions = manager.currentTest.actions || [];
      const hasInsertMode = manager.recordInsertIndex !== undefined && manager.recordInsertIndex !== null;
      const lastRecordedIndex = hasInsertMode
        ? (manager.recordedActionsCount > 0 ? (manager.recordInsertIndex + manager.recordedActionsCount - 1) : -1)
        : (actions.length - 1);
      if (lastRecordedIndex >= 0 && shouldReplacePreviousValueAction(actions[lastRecordedIndex], newAction)) {
        // Сохраняем хронологический порядок: новое действие должно оставаться "последним",
        // а не перезаписывать более ранний шаг по индексу.
        actions.splice(lastRecordedIndex, 1);
        if (hasInsertMode) {
          manager.recordedActionsCount = Math.max(0, manager.recordedActionsCount - 1);
          actions.splice(manager.recordInsertIndex + manager.recordedActionsCount, 0, newAction);
          manager.recordedActionsCount++;
        } else {
          actions.push(newAction);
        }
        manager.currentTest.updatedAt = new Date().toISOString();
        if (hasInsertMode) {
          manager.tests.set(manager.currentTest.id, manager.currentTest);
          await manager.saveTests();
        }
        sendResponse({ success: true, replacedPreviousValue: true });
        return;
      }

      // Не заменяем "старые" value-шаги через дальний поиск по диапазону.
      // Это сохраняет фактическую последовательность пользовательских действий.

      if (hasInsertMode) {
        manager.currentTest.actions.splice(manager.recordInsertIndex + manager.recordedActionsCount, 0, newAction);
        manager.recordedActionsCount++;
        console.log(`📝 Добавлено действие в позицию ${manager.recordInsertIndex + manager.recordedActionsCount - 1} (всего записано: ${manager.recordedActionsCount})`);
      } else {
        manager.currentTest.actions.push(newAction);
      }

      manager.currentTest.updatedAt = new Date().toISOString();
      if (manager.recordInsertIndex !== undefined && manager.recordInsertIndex !== null) {
        manager.tests.set(manager.currentTest.id, manager.currentTest);
        await manager.saveTests();
      }
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Not recording' });
    }
  });

  registry.register('SET_TEST_VARIABLE', async ({ message, sendResponse }) => {
    try {
      const { testId, variableName, variableValue, source } = message;

      let test = null;
      if (testId) {
        test = manager.tests.get(testId);
      } else if (manager.currentTest) {
        test = manager.currentTest;
      }

      if (!test) {
        sendResponse({ success: false, error: 'Тест не найден' });
        return;
      }

      if (!test.variables) {
        test.variables = {};
      }

      test.variables[variableName] = {
        value: variableValue,
        source: source || 'selection',
        updatedAt: new Date().toISOString()
      };

      manager.tests.set(test.id, test);
      await manager.saveTests();

      console.log(`📦 [Background] Переменная "${variableName}" сохранена в тесте ${test.id}`);
      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ [Background] Ошибка при сохранении переменной:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('DOWNLOAD_FILE', async ({ message, sendResponse }) => {
    try {
      console.log('📥 [Background] Получен запрос на скачивание файла:', message.fileName);

      const mimeType = message.mimeType || 'text/csv;charset=utf-8';
      const dataUrl = `data:${mimeType};base64,${message.data}`;

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: message.fileName,
        saveAs: message.saveAs === true
      });

      console.log('✅ [Background] Файл отправлен на скачивание, ID:', downloadId);
      console.log('📁 [Background] Будет открыт диалог выбора места сохранения файла');

      sendResponse({ success: true, downloadId: downloadId });
    } catch (error) {
      console.error('❌ [Background] Ошибка при скачивании файла:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /** Порядок шагов (actions) сохраняется строго как передан — без сортировки и переупорядочивания. */
  registry.register('UPDATE_TEST', async ({ message, sendResponse }) => {
    if (!await requireAccess(self.ActionCatalog ? self.ActionCatalog.UPDATE_TEST : 'test.update', sendResponse)) {
      return;
    }
    const updatedTest = message.test;
    const isNewTest = !manager.tests.has(updatedTest.id);
    if (ENABLE_FREEMIUM_LIMITS && isNewTest && manager.tests.size >= FREE_TIER_TEST_LIMIT) {
      sendResponse({
        success: false,
        error: 'FREE_TIER_LIMIT',
        limit: FREE_TIER_TEST_LIMIT
      });
      return;
    }
    const actionsOrdered = Array.isArray(updatedTest.actions) ? [...updatedTest.actions] : [];
    const prevTest = manager.tests.get(String(updatedTest.id));
    let mergedExt = updatedTest.extensionAssets;
    if (prevTest?.extensionAssets && typeof prevTest.extensionAssets === 'object') {
      const inc = mergedExt && typeof mergedExt === 'object' ? mergedExt : {};
      mergedExt = { ...prevTest.extensionAssets, ...inc };
      mergedExt.visualRegressionBaselines = {
        ...(prevTest.extensionAssets.visualRegressionBaselines || {}),
        ...((inc.visualRegressionBaselines || {}))
      };
    }
    manager.tests.set(updatedTest.id, {
      ...updatedTest,
      actions: actionsOrdered,
      extensionAssets: mergedExt,
      updatedAt: new Date().toISOString()
    });
    await manager.saveTests();

    await manager.triggerExcelExport(updatedTest.id, 'save');

    sendResponse({ success: true });
  });

  registry.register('MERGE_TEST_EXTENSION_ASSETS', async ({ message, sendResponse }) => {
    if (!await requireAccess(self.ActionCatalog ? self.ActionCatalog.UPDATE_TEST : 'test.update', sendResponse)) {
      return;
    }
    const testId = String(message.testId || '');
    const assets = message.assets;
    if (!testId || !assets || typeof assets !== 'object') {
      sendResponse({ success: false, error: 'Invalid testId or assets' });
      return;
    }
    const test = manager.tests.get(testId);
    if (!test) {
      sendResponse({ success: false, error: 'Test not found' });
      return;
    }
    test.extensionAssets = { ...(test.extensionAssets || {}) };
    const incoming = assets;
    if (incoming.visualRegressionBaselines && typeof incoming.visualRegressionBaselines === 'object') {
      test.extensionAssets.visualRegressionBaselines = {
        ...(test.extensionAssets.visualRegressionBaselines || {}),
        ...incoming.visualRegressionBaselines
      };
    }
    for (const key of Object.keys(incoming)) {
      if (key !== 'visualRegressionBaselines') {
        test.extensionAssets[key] = incoming[key];
      }
    }
    test.updatedAt = new Date().toISOString();
    await manager.saveTests();
    sendResponse({ success: true });
  });

  registry.register('SELECTOR_FOUND_DURING_PLAYBACK', async ({ message, sendResponse }) => {
    try {
      const testId = String(message.testId);
      const selector = message.selector;

      if (!testId || !selector) {
        sendResponse({ success: false, error: 'Не указаны testId или selector' });
        return;
      }

      const test = manager.tests.get(testId);
      if (!test) {
        console.warn(`⚠️ Тест ${testId} не найден`);
        sendResponse({ success: false, error: 'Тест не найден' });
        return;
      }

      const formatSelector = (sel) => {
        if (!sel) return 'N/A';
        if (typeof sel === 'string') return sel;
        if (sel.selector) return sel.selector;
        if (sel.value) return sel.value;
        return JSON.stringify(sel);
      };

      let found = false;
      for (let i = 0; i < test.actions.length; i++) {
        const action = test.actions[i];
        const actionSelector = action.selector;
        const formattedActionSelector = formatSelector(actionSelector);

        const normalizedActionSelector = formattedActionSelector.trim();
        const normalizedReceivedSelector = selector.trim();

        if (normalizedActionSelector === normalizedReceivedSelector ||
          normalizedActionSelector.includes(normalizedReceivedSelector) ||
          normalizedReceivedSelector.includes(normalizedActionSelector)) {
          if (action.selectorQuality) {
            const originalIssuesCount = action.selectorQuality.issues?.length || 0;
            action.selectorQuality.issues = (action.selectorQuality.issues || []).filter(
              issue => !issue.includes('не найден') && !issue.includes('Элемент не найден')
            );

            if (action.selectorQuality.issues.length < originalIssuesCount) {
              action.selectorQuality.score = Math.max(action.selectorQuality.score || 0, 70);
              action.selectorQuality.stability = Math.max(action.selectorQuality.stability || 0, 60);
              action.selectorQuality.lastFoundDuringPlayback = true;
              action.selectorQuality.lastFoundAt = new Date().toISOString();
              console.log(`✅ Метка проблемного селектора снята для action #${i + 1} в тесте ${testId}`);
              found = true;
            } else if (originalIssuesCount === 0) {
              action.selectorQuality.lastFoundDuringPlayback = true;
              action.selectorQuality.lastFoundAt = new Date().toISOString();
              found = true;
            }
          } else {
            action.selectorQuality = {
              score: 70,
              stability: 60,
              issues: [],
              lastFoundDuringPlayback: true,
              lastFoundAt: new Date().toISOString()
            };
            console.log(`✅ Создана запись selectorQuality для action #${i + 1} в тесте ${testId}`);
            found = true;
          }

          if (found) break;
        }
      }

      if (found) {
        test.updatedAt = new Date().toISOString();
        manager.tests.set(testId, test);
        await manager.saveTests();

        chrome.runtime.sendMessage({
          type: 'TEST_UPDATED',
          testId: testId
        }).catch(() => {});
      }

      sendResponse({ success: true, found });
    } catch (error) {
      console.error('❌ Ошибка при обработке SELECTOR_FOUND_DURING_PLAYBACK:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('GET_LOCAL_STORAGE_FROM_TAB', async ({ message, sendResponse }) => {
    try {
      const tabId = message.tabId;
      const keys = message.keys || [];

      if (!tabId) {
        sendResponse({ success: false, error: 'Tab ID не указан' });
        return;
      }

      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (e) {
        sendResponse({ success: false, error: `Вкладка ${tabId} не найдена` });
        return;
      }

      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        sendResponse({ success: false, error: `Вкладка ${tabId} недоступна для получения localStorage` });
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_LOCAL_STORAGE' });
        if (response && response.success && response.data) {
          const data = keys.length > 0
            ? Object.fromEntries(keys.filter(k => k in response.data).map(k => [k, response.data[k]]))
            : response.data;
          sendResponse({ success: true, data });
        } else {
          sendResponse({ success: false, error: response?.error || 'Не удалось получить localStorage' });
        }
      } catch (scriptError) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (keys) => {
              const items = {};
              if (keys.length === 0) {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  items[key] = localStorage.getItem(key);
                }
              } else {
                for (const key of keys) {
                  items[key] = localStorage.getItem(key);
                }
              }
              return items;
            },
            args: [keys]
          });

          if (results && results[0] && results[0].result) {
            sendResponse({ success: true, data: results[0].result });
          } else {
            sendResponse({ success: false, error: 'Не удалось получить localStorage через executeScript' });
          }
        } catch (executeError) {
          sendResponse({ success: false, error: `Не удалось получить localStorage: ${executeError.message}` });
        }
      }
    } catch (error) {
      console.error('❌ Ошибка при получении localStorage с вкладки:', error);
      sendResponse({ success: false, error: error.message });
    }
  });



  registry.register('API_REQUEST', async ({ message, sendResponse }) => {
    try {
      console.log('🌐 [Background] Получен запрос на выполнение API запроса');
      const { method, url, headers, body } = message;

      const fetchOptions = {
        method: method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await (typeof withRetry === 'function'
        ? withRetry(() => fetch(url, fetchOptions), {
            maxAttempts: 3,
            delayMs: 1000,
            shouldRetry: (err) => err?.name === 'TypeError' || (err?.message && /network|failed|fetch/i.test(err.message))
          })
        : fetch(url, fetchOptions));
      const responseData = await response.text();

      let parsedData;
      try {
        parsedData = JSON.parse(responseData);
      } catch (e) {
        parsedData = responseData;
      }

      if (!response.ok) {
        sendResponse({
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          data: parsedData
        });
        return;
      }

      sendResponse({
        success: true,
        data: parsedData,
        status: response.status,
        statusText: response.statusText
      });
    } catch (error) {
      console.error('❌ [Background] Ошибка при выполнении API запроса:', error);
      sendResponse({
        success: false,
        error: error.message || 'Ошибка при выполнении API запроса'
      });
    }
  });

  registry.register('TEST_STEP_PROGRESS', async ({ message, sender, sendResponse }) => {
    if (sender?.tab?.id != null) {
      manager.playbackTabId = sender.tab.id;
    }
    manager.currentStep = message.step;
    manager.totalSteps = message.total;
    manager.stepType = message.stepType;
    manager.broadcast({
      type: 'STEP_PROGRESS_UPDATE',
      step: message.step,
      total: message.total,
      stepType: message.stepType,
      testId: message.testId
    }).catch(() => {});
    sendResponse({ success: true });
  });

  registry.register('TEST_STEP_COMPLETED', async ({ message, sender, sendResponse }) => {
    if (sender?.tab?.id != null) {
      manager.playbackTabId = sender.tab.id;
    }
    if (!manager.completedSteps) {
      manager.completedSteps = new Map();
    }
    const testId = message.testId;
    if (!manager.completedSteps.has(testId)) {
      manager.completedSteps.set(testId, []);
    }
    const completedSteps = manager.completedSteps.get(testId);
    const existingStepIndex = completedSteps.findIndex(s => s.step === message.step);
    const stepInfo = {
      step: message.step,
      total: message.total,
      success: message.success,
      error: message.error || null,
      timestamp: Date.now()
    };
    if (existingStepIndex >= 0) {
      completedSteps[existingStepIndex] = stepInfo;
    } else {
      completedSteps.push(stepInfo);
    }
    completedSteps.sort((a, b) => a.step - b.step);
    // Двигаем текущий шаг вперёд, чтобы GET_STATE не откатывал popup назад.
    const nextStep = Number(message.step) + 1;
    if (!Number.isNaN(nextStep)) {
      manager.currentStep = Math.max(manager.currentStep || 0, nextStep);
      manager.totalSteps = Math.max(manager.totalSteps || 0, Number(message.total) || 0);
    }
    manager.broadcast({
      type: 'STEP_COMPLETED_UPDATE',
      testId: testId,
      step: message.step,
      total: message.total,
      success: message.success,
      error: message.error || null,
      completedSteps: completedSteps
    }).catch(() => {});
    sendResponse({ success: true });
  });


  registry.register('TEST_COMPLETED', async ({ message, sender, sendResponse }) => {
    await manager.stopVideoRecordingIfActive(message.testId);
    const runMode = message.runMode || 'optimized';
    const optimizationSummary = message.optimizationSummary || {};
    let suppressCompletionPopup = false;

    if (manager.dataDrivenState && String(manager.dataDrivenState.testId) === String(message.testId)) {
      const st = manager.dataDrivenState;
      const durationMs = typeof message.durationMs === 'number' ? message.durationMs : 0;
      const stepsCompleted = typeof message.stepsCompleted === 'number' ? message.stepsCompleted : 0;
      const stepsTotal = typeof message.stepsTotal === 'number' ? message.stepsTotal : 0;
      st.results.push({
        rowIndex: st.index,
        row: st.rows[st.index],
        success: message.success,
        error: message.error || null,
        stepsCompleted,
        stepsTotal,
        durationMs
      });
      st.index++;
      if (st.index < st.rows.length) {
        suppressCompletionPopup = true;
        manager.isPlaying = true;
        manager.handlePlayTest({
          testId: st.testId,
          test: st.test,
          mode: st.mode,
          debugMode: st.debugMode,
          groupContext: { ...st.rows[st.index] },
          _fromDataDrivenQueue: true
        }, () => {});
        sendResponse({ success: true, suppressCompletionPopup: true });
        return;
      }
      const summary = {
        testId: st.testId,
        testName: manager.tests.get(String(st.testId))?.name || '',
        totalRows: st.rows.length,
        results: st.results.slice(),
        allPassed: st.results.every(r => r.success)
      };
      manager.dataDrivenState = null;
      manager.broadcast({
        type: 'DATA_DRIVEN_RUN_COMPLETED',
        summary
      }).catch(() => {});
    }

    if (manager.currentGroupId) {
      suppressCompletionPopup = true;
      const group = manager.testGroups.get(manager.currentGroupId);
      if (group && Array.isArray(group.testIds) && message.testId === group.testIds[manager.groupRunIndex]) {
        const testName = message.testName || manager.tests.get(message.testId)?.name || String(message.testId);
        const durationMs = typeof message.durationMs === 'number' ? message.durationMs : 0;
        const stepsCompleted = typeof message.stepsCompleted === 'number' ? message.stepsCompleted : 0;
        const stepsTotal = typeof message.stepsTotal === 'number' ? message.stepsTotal : 0;
        (manager.groupRunResults = manager.groupRunResults || []).push({
          testId: message.testId,
          testName,
          success: message.success,
          error: message.error || null,
          stepsCompleted,
          stepsTotal,
          durationMs
        });
        if (message.updatedVariables && typeof message.updatedVariables === 'object') {
          for (const [k, v] of Object.entries(message.updatedVariables)) {
            manager.groupContext[k] = v;
          }
        }
        manager.groupRunIndex++;
        if (manager.groupRunIndex < group.testIds.length) {
          const nextTestId = group.testIds[manager.groupRunIndex];
          manager.isPlaying = true;
          manager.handlePlayTest({
            testId: nextTestId,
            mode: manager.groupRunMode,
            debugMode: manager.groupDebugMode,
            groupContext: { ...manager.groupContext },
            isGroupRun: true,
            groupRunCurrentIndex: manager.groupRunIndex,
            groupRunTotal: group.testIds.length
          }, () => {});
          sendResponse({ success: true, suppressCompletionPopup: true });
          return;
        }
      }
      // Группа завершена — формируем сводный отчёт и показываем его во вкладке
      const finishedGroupId = manager.currentGroupId;
      const results = manager.groupRunResults || [];
      const totalDurationMs = results.reduce((sum, r) => sum + (r.durationMs || 0), 0);
      const errors = results.filter(r => !r.success && (r.error || r.error === 0)).map(r => ({ testName: r.testName || r.testId, error: r.error }));
      const groupSuccess = results.every(r => r.success);
      const groupError = errors.length > 0 ? errors.map(e => `${e.testName}: ${e.error}`).join('; ') : null;
      manager.groupRunIndex = 0;
      manager.groupRunResults = [];
      manager.groupContext = {};
      manager.currentGroupId = null;
      manager.broadcast({
        type: 'GROUP_COMPLETED',
        groupId: finishedGroupId,
        success: groupSuccess,
        error: groupError,
        summary: { results, totalDurationMs, errors }
      }).catch(() => {});
      const tabId = sender?.tab?.id;
      if (tabId && results.length > 0) {
        const summaryPayload = { results, totalDurationMs, errors, success: groupSuccess, error: groupError };
        // Откладываем показ отчёта, чтобы последнее действие (например logout и навигация) успело завершиться — иначе новая страница перекроет отчёт
        const GROUP_SUMMARY_DELAY_MS = 2200;
        const RETRY_DELAY_MS = 1500;
        const MAX_RETRIES = 3;
        let attempt = 0;
        const sendSummary = () => {
          attempt += 1;
          chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_GROUP_SUMMARY',
            summary: summaryPayload
          }).catch((e) => {
            if (attempt < MAX_RETRIES) {
              console.warn(`SHOW_GROUP_SUMMARY попытка ${attempt} не удалась, повтор через ${RETRY_DELAY_MS}ms:`, e?.message);
              setTimeout(sendSummary, RETRY_DELAY_MS);
            } else {
              console.warn('SHOW_GROUP_SUMMARY не удалось отправить во вкладку после повторов:', e?.message);
            }
          });
        };
        setTimeout(sendSummary, GROUP_SUMMARY_DELAY_MS);
      }
      // ответ отправим в конце обработчика с suppressCompletionPopup: true
    }

    manager.isPlaying = false;
    manager.currentStep = 0;
    manager.totalSteps = 0;
    manager.stepType = null;
    manager.playbackState = null;
    manager.playbackTabId = null;
    try {
      await chrome.storage.local.remove('playbackState');
      console.log('✅ Состояние воспроизведения очищено из storage после завершения теста');
    } catch (error) {
      console.error('❌ Ошибка при очистке состояния из storage:', error);
    }
    manager.broadcast({
      type: 'TEST_COMPLETED',
      testId: message.testId,
      success: message.success,
      error: message.error,
      adaptiveRunResults: message.adaptiveRunResults || null,
      actionUrlUpdates: message.actionUrlUpdates || null
    }).catch(() => {});
    manager.broadcast({
      type: 'STEP_PROGRESS_UPDATE',
      step: 0,
      total: 0,
      stepType: null,
      testId: message.testId
    }).catch(() => {});

    const completedTest = manager.tests.get(message.testId);
    if (completedTest && message.adaptiveRunResults && Array.isArray(message.adaptiveRunResults) && completedTest.actions) {
      message.adaptiveRunResults.forEach((result, idx) => {
        if (result && completedTest.actions[idx]?.type === 'adaptive') {
          completedTest.actions[idx]._runHistory = result._runHistory || [];
          if (result._statistics) completedTest.actions[idx]._statistics = result._statistics;
        }
      });
    }
    if (completedTest?.actions && message.actionUrlUpdates?.length) {
      message.actionUrlUpdates.forEach(({ index, url }) => {
        if (completedTest.actions[index]?.type === 'analysis' && url) {
          completedTest.actions[index].url = url;
        }
      });
    }
    if (completedTest) {
      const now = new Date().toISOString();
      completedTest.optimization = completedTest.optimization || {};
      if (runMode === 'full') {
        completedTest.optimization.lastFullRunAt = now;
        completedTest.optimization.lastFullRunStatus = message.success ? 'success' : 'failed';
      } else if (runMode === 'optimized') {
        completedTest.optimization.lastOptimizedRunAt = now;
      }
      if (optimizationSummary.removedCount > 0) {
        completedTest.optimization.optimizedAvailable = true;
        completedTest.optimization.lastOptimizationAt = now;
        completedTest.optimization.lastRemovedCount = optimizationSummary.removedCount;
        completedTest.optimization.lastRemovedIndices = optimizationSummary.removedIndices || optimizationSummary.removedActions || [];
      } else if (!completedTest.optimization.optimizedAvailable) {
        completedTest.optimization.optimizedAvailable = completedTest.actions?.some(action => action.hidden) || false;
      }

      manager.tests.set(completedTest.id, completedTest);
      await manager.saveTests();
      manager.broadcast({
        type: 'TEST_OPTIMIZATION_UPDATED',
        testId: completedTest.id,
        optimization: completedTest.optimization
      }).catch(() => {});
    }

    sendResponse({ success: true, suppressCompletionPopup: suppressCompletionPopup });
  });

  registry.register('REMOVE_INEFFECTIVE_ACTIONS', async ({ message, sendResponse }) => {
    const testToUpdate = manager.tests.get(message.testId);
    if (!testToUpdate) {
      sendResponse({ success: false, error: 'Test not found' });
      return;
    }

    if (testToUpdate.optimization?.optimizedApplied) {
      console.log(`⚠️ Оптимизация для теста ${testToUpdate.name} уже была применена ранее, пропускаю`);
      sendResponse({
        success: true,
        removed: 0,
        skipped: true,
        reason: 'Оптимизация уже была применена ранее'
      });
      return;
    }

    const actionIndices = message.actionIndices || [];
    if (actionIndices.length === 0) {
      sendResponse({ success: true, removed: 0 });
      return;
    }

    const runMode = message.runMode || 'optimized';
    const actionDetails = message.actionDetails || [];
    const detailMap = new Map(actionDetails.map(detail => [detail.index, detail]));
    const now = new Date().toISOString();
    const actions = testToUpdate.actions;
    const getActionText = (action) => String(
      action?.fieldLabel ||
      action?.description ||
      action?.name ||
      action?.label ||
      action?.value ||
      ''
    ).toLowerCase();
    const hasExplicitSelector = (action) => {
      const selectorText = String(action?.selector?.selector || action?.selector?.value || action?.selector || '').trim();
      if (!selectorText) return false;
      return (
        selectorText.startsWith('#') ||
        /\[[^\]]+\]/.test(selectorText) ||
        /elementid|ng-reflect-element-id|aria-label|name=|id=/.test(selectorText)
      );
    };
    const hasNearbyAnalog = (index, action) => {
      for (let j = Math.max(0, index - 2); j <= Math.min(actions.length - 1, index + 2); j++) {
        if (j === index) continue;
        const neighbor = actions[j];
        if (!neighbor || neighbor.hidden) continue;
        if (neighbor.type !== action.type) continue;
        if (!neighbor.selector || !action.selector) continue;
        if (manager.areSelectorsEqual(neighbor.selector, action.selector)) {
          return true;
        }
      }
      return false;
    };
    const shouldProtectFromAutoHide = (index, action) => {
      if (!action) return false;
      const type = String(action.type || '').toLowerCase();
      if (!['click', 'dblclick', 'input', 'change', 'navigate', 'navigation'].includes(type)) return false;
      if (!hasExplicitSelector(action)) return false;
      const text = getActionText(action);
      const isSignificant = /(save|submit|send|create|delete|publish|apply|сохран|отправ|созда|удал|примен|опубли)/i.test(text);
      if (!isSignificant) return false;
      return !hasNearbyAnalog(index, action);
    };

    const sortedIndices = [...actionIndices].sort((a, b) => b - a);
    let removedCount = 0;
    let skippedCount = 0;

    for (const index of sortedIndices) {
      if (index >= 0 && index < testToUpdate.actions.length) {
        const action = testToUpdate.actions[index];

        if (action.userEdited) {
          console.log(`⏭️ Пропускаю шаг ${index + 1}: был отредактирован пользователем`);
          skippedCount++;
          continue;
        }

        if (!action.hidden) {
          if (shouldProtectFromAutoHide(index, action)) {
            console.log(`🛡️ Пропускаю auto-hidden для значимого шага ${index + 1} (явный селектор, нет соседних аналогов)`);
            skippedCount++;
            continue;
          }
          action.hidden = true;
          removedCount++;
          action.hiddenAt = now;
          action.hiddenReason = 'ineffective';
          action.hiddenBy = 'auto';
          action.hiddenRunMode = runMode;
          action.hiddenDetails = detailMap.get(index) || {};
          console.log(`🧹 Скрыт неэффективный шаг ${index + 1}: ${action.type}`);
        } else {
          skippedCount++;
        }
      }
    }

    if (removedCount > 0) {
      testToUpdate.optimization = testToUpdate.optimization || {};
      testToUpdate.optimization.optimizedAvailable = true;
      testToUpdate.optimization.optimizedApplied = true;
      testToUpdate.optimization.lastOptimizationAt = now;
      testToUpdate.optimization.lastRemovedCount = removedCount;
      testToUpdate.optimization.lastRemovedIndices = sortedIndices;
      manager.tests.set(testToUpdate.id, testToUpdate);
      await manager.saveTests();
      console.log(`✅ Автоматически удалено ${removedCount} неэффективных шагов из теста ${testToUpdate.name}`);
      if (skippedCount > 0) {
        console.log(`   ⏭️ Пропущено ${skippedCount} шагов, отредактированных пользователем`);
      }
      manager.broadcast({
        type: 'TEST_OPTIMIZATION_UPDATED',
        testId: testToUpdate.id,
        optimization: testToUpdate.optimization
      }).catch(() => {});
    } else if (skippedCount > 0) {
      console.log('ℹ️ Все неэффективные шаги были отредактированы пользователем, оптимизация не применена');
    }

    sendResponse({
      success: true,
      removed: removedCount,
      removedIndices: sortedIndices,
      skipped: skippedCount
    });
  });

  registry.register('OPEN_POPUP', async ({ sendResponse }) => {
    try {
      try {
        await chrome.action.openPopup();
        sendResponse({ success: true });
      } catch (openError) {
        const popupUrl = chrome.runtime.getURL('popup/popup-fullscreen.html');
        await chrome.windows.create({
          url: popupUrl,
          type: 'popup',
          width: 500,
          height: 700,
          focused: true
        });
        sendResponse({ success: true });
      }
    } catch (error) {
      console.error('❌ Ошибка при открытии popup:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('CLOSE_POPUP_IF_OPEN', async ({ sendResponse }) => {
    try {
      const windows = await chrome.windows.getAll({ windowTypes: ['popup'] });
      for (const win of windows) {
        try {
          const tab = await chrome.tabs.query({ windowId: win.id });
          if (tab && tab.length > 0 && tab[0].url && tab[0].url.includes(chrome.runtime.id)) {
            await chrome.windows.remove(win.id);
            console.log('✅ Popup окно закрыто:', win.id);
          }
        } catch (err) {
          console.warn('⚠️ Ошибка при закрытии popup окна:', err);
        }
      }
      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ Ошибка при закрытии popup:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // Тот же механизм, что DevTools: Ctrl+Shift+P → "Capture full size screenshot" (EN) / "Сделать полноразмерный скриншот" (RU)
  registry.register('CAPTURE_FULL_PAGE_SCREENSHOT', async ({ message, sender, sendResponse }) => {
    const safeSend = (res) => { try { sendResponse(res); } catch (e) { console.warn('CAPTURE_FULL_PAGE_SCREENSHOT sendResponse failed:', e?.message); } };
    const tabId = message?.tabId || sender?.tab?.id;
    if (!tabId) {
      safeSend({ success: false, error: 'tabId не указан' });
      return;
    }
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (e) {
      if (e?.message?.includes('Another debugger')) {
        safeSend({ success: false, error: 'DevTools уже открыты. Закройте DevTools (Ctrl+Shift+I) и повторите. Команда «Сделать полноразмерный скриншот» / «Capture full size screenshot» недоступна при открытых DevTools.' });
        return;
      }
      safeSend({ success: false, error: e?.message || 'Не удалось подключить debugger' });
      return;
    }
    const detach = () => {
      try { chrome.debugger.detach({ tabId }); } catch (_) {}
    };
    const sendCmd = (method, params = {}) => new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
    try {
      await sendCmd('Page.enable');
      const metrics = await sendCmd('Page.getLayoutMetrics');
      const rect = metrics.cssContentSize || metrics.contentSize || metrics.layoutMetrics?.contentSize;
      const rawHeight = rect?.height ?? 1080;
      const rawWidth = rect?.width ?? 1920;
      if (rawHeight > 16384 || rawWidth > 16384) {
        detach();
        safeSend({ success: false, error: 'Страница превышает лимит Chrome (16384px). Используется склейка.' });
        return;
      }
      const width = Math.ceil(Math.min(Math.max(rawWidth, 800), 16384));
      const height = Math.ceil(Math.min(Math.max(rawHeight, 600), 16384));
      await sendCmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 1500));
      const shot = await sendCmd('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true
      });
      await sendCmd('Emulation.clearDeviceMetricsOverride');
      detach();
      safeSend({ success: true, screenshot: 'data:image/png;base64,' + shot.data });
    } catch (e) {
      detach();
      const errMsg = e?.message || e?.toString?.() || 'Ошибка захвата';
      console.warn('CAPTURE_FULL_PAGE_SCREENSHOT error:', errMsg);
      safeSend({ success: false, error: errMsg });
    }
  });

  registry.register('TAKE_SCREENSHOT', async ({ sender, sendResponse }) => {
    const safeSend = (res) => { try { sendResponse(res); } catch (e) { console.warn('TAKE_SCREENSHOT sendResponse failed:', e?.message); } };
    let activeTab;
    try {
      if (sender?.tab?.id) {
        activeTab = sender.tab;
      }
      if (!activeTab) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tab;
      }
      if (!activeTab || !activeTab.id) {
        safeSend({ success: false, error: 'Активная вкладка не найдена' });
        return;
      }

      const { pluginSettings } = await chrome.storage.local.get('pluginSettings');
      const screenshotSettings = pluginSettings?.screenshots || {};
      const format = (screenshotSettings.format === 'png' || screenshotSettings.format === 'jpeg') ? screenshotSettings.format : 'jpeg';
      const quality = Math.min(100, Math.max(0, Number(screenshotSettings.quality) || 85));

      const captureOptions = { format, quality };

      const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, captureOptions);

      safeSend({ success: true, screenshot: dataUrl });
    } catch (error) {
      console.error('Ошибка при создании скриншота:', error);
      if (error.message && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        console.warn('⚠️ Превышена квота captureVisibleTab, ожидаю 1.5 сек перед повтором...');
        try {
          await new Promise(r => setTimeout(r, 1500));
          const retryTab = activeTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
          if (!retryTab || !retryTab.id) {
            safeSend({ success: false, error: 'Активная вкладка не найдена' });
            return;
          }
          const { pluginSettings } = await chrome.storage.local.get('pluginSettings');
          const screenshotSettings = pluginSettings?.screenshots || {};
          const format = (screenshotSettings.format === 'png' || screenshotSettings.format === 'jpeg') ? screenshotSettings.format : 'jpeg';
          const quality = Math.min(100, Math.max(0, Number(screenshotSettings.quality) || 85));
          const retryDataUrl = await chrome.tabs.captureVisibleTab(retryTab.windowId, { format, quality });
          safeSend({ success: true, screenshot: retryDataUrl, retriedAfterQuota: true });
          return;
        } catch (retryError) {
          console.error('❌ Ошибка при повторной попытке создания скриншота:', retryError);
        }
      } else if (error.message && error.message.includes('Tabs cannot be edited right now')) {
        console.warn('⚠️ Вкладка временно недоступна для изменений (Tabs cannot be edited right now), жду 1 сек перед повтором...');
        try {
          await new Promise(r => setTimeout(r, 1000));
          const retryTab = activeTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
          if (!retryTab || !retryTab.id) {
            safeSend({ success: false, error: 'Активная вкладка не найдена' });
            return;
          }
          const { pluginSettings } = await chrome.storage.local.get('pluginSettings');
          const screenshotSettings = pluginSettings?.screenshots || {};
          const format = (screenshotSettings.format === 'png' || screenshotSettings.format === 'jpeg') ? screenshotSettings.format : 'jpeg';
          const quality = Math.min(100, Math.max(0, Number(screenshotSettings.quality) || 85));
          const retryDataUrl = await chrome.tabs.captureVisibleTab(retryTab.windowId, { format, quality });
          safeSend({ success: true, screenshot: retryDataUrl, retriedAfterTabEditBusy: true });
          return;
        } catch (retryError) {
          console.error('❌ Ошибка при повторной попытке создания скриншота после Tabs cannot be edited:', retryError);
        }
      }
      safeSend({ success: false, error: error.message });
    }
  });

  registry.register('SAVE_SCREENSHOT_TO_FILE', async ({ message, sendResponse }) => {
    try {
      const { screenshot, testId, runId, stepNumber, screenshotType, savePath } = message;
      if (!screenshot || !testId || stepNumber === undefined) {
        sendResponse({ success: false, error: 'Не указаны обязательные параметры' });
        return;
      }

      const settings = await chrome.storage.local.get('pluginSettings');
      const screenshotSettings = settings.pluginSettings?.screenshots || {};
      let screenshotMode = 'none';
      if (screenshotSettings.saveToDisk === true) {
        screenshotMode = 'download';
      } else if (screenshotSettings.saveToDisk === false) {
        screenshotMode = 'none';
      } else if (
        screenshotSettings.mode === 'download' ||
        screenshotSettings.mode === 'extension' ||
        screenshotSettings.mode === 'none'
      ) {
        screenshotMode = screenshotSettings.mode;
      }

      if (screenshotMode === 'none') {
        sendResponse({ success: true, skipped: true, reason: 'mode:none' });
        return;
      }
      if (screenshotMode === 'extension') {
        sendResponse({ success: true, skipped: true, reason: 'mode:extension' });
        return;
      }

      const timestamp = runId || Date.now();
      const typeSuffix = screenshotType || 'screenshot';
      const stepNumberForFile = String(stepNumber).replace(/\./g, '_');
      const fileLabel = typeSuffix === 'screenshot' ? `screenshot_step_${stepNumberForFile}` : `step${stepNumberForFile}_${typeSuffix}`;
      const mediaBase = (settings.pluginSettings?.mediaSavePath || screenshotSettings.saveFolder || (screenshotSettings.savePath || '').replace(/\/screenshots\/?$/i, '') || 'AutoTestRecorder').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
      const baseDir = (mediaBase || 'AutoTestRecorder') + '/screenshots';
      const format = (screenshotSettings.format === 'png' || screenshotSettings.format === 'jpeg') ? screenshotSettings.format : 'jpeg';
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const fileName = `${baseDir}/${testId}/${timestamp}/${fileLabel}.${ext}`;

      const dataUrl = screenshot.startsWith('data:') ? screenshot : `data:${mime};base64,${screenshot}`;
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: fileName,
        saveAs: false
      });

      sendResponse({
        success: true,
        filePath: fileName,
        downloadId: downloadId
      });
    } catch (error) {
      console.error('Ошибка при сохранении скриншота в файл:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('SAVE_VIDEO_FILE', async ({ message, sendResponse }) => {
    try {
      const { filename, base64Data, mimeType } = message;
      if (!filename || !base64Data) {
        sendResponse({ success: false, error: 'Missing filename or base64Data' });
        return;
      }
      const dataUrl = `data:${mimeType || 'video/webm'};base64,${base64Data}`;
      await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: false
      });
      sendResponse({ success: true, filename });
    } catch (error) {
      console.error('Ошибка при сохранении видео:', error);
      sendResponse({ success: false, error: error?.message || String(error) });
    } finally {
      // Всегда освобождаем offscreen после сохранения/ошибки — минимизируем память бота
      if (chrome.offscreen && typeof chrome.offscreen.closeDocument === 'function') {
        chrome.offscreen.closeDocument().catch(() => {});
      }
    }
  });

  registry.register('CLOSE_DIALOG_MAIN', async ({ message, sender, sendResponse }) => {
    try {
      const tabId = message?.tabId || sender?.tab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (!tabId) { sendResponse({ closed: false, error: 'no tab' }); return; }
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        func: () => {
          const tryClose = (root) => {
            const sel = '.cdk-overlay-pane,[role="dialog"],.mat-dialog-container,.mat-mdc-dialog-container,[class*="dialog-container"],[class*="modal"],[class*="overlay-pane"]';
            const all = root.querySelectorAll(sel);
            for (let j = 0; j < all.length; j++) {
              const d = all[j];
              if (d.id === 'autotest-completion-popup' || d.closest('#autotest-completion-popup')) continue;
              if (!d.offsetParent || d.offsetWidth < 80) continue;
              const txt = (d.textContent || '').toLowerCase();
              if (txt.indexOf('обязательные поля') < 0 && txt.indexOf('не заполнен') < 0) continue;
              const closeEl = d.querySelector('[aria-label*="close"],[aria-label*="Close"],[aria-label*="закрыть"],[class*="close-icon"],[class*="close"]');
              if (closeEl) { closeEl.click(); return true; }
              const btns = d.querySelectorAll('button,[role="button"],[class*="button"]');
              for (let i = 0; i < btns.length; i++) {
                const t = (btns[i].textContent || '').trim().toLowerCase();
                if (t === 'ok' || t === 'ок') { btns[i].click(); return true; }
              }
              if (btns.length > 0) { btns[btns.length - 1].click(); return true; }
            }
            return false;
          };
          if (tryClose(document)) return true;
          const walk = (el) => {
            if (el.shadowRoot) {
              if (tryClose(el.shadowRoot)) return true;
              for (const c of el.shadowRoot.querySelectorAll('*')) { if (walk(c)) return true; }
            }
            for (const c of el.children || []) { if (walk(c)) return true; }
            return false;
          };
          if (walk(document.body)) return true;
          const iter = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
          let n;
          while ((n = iter.nextNode())) {
            if (n.id === 'autotest-completion-popup' || n.closest('#autotest-completion-popup')) continue;
            const txt = (n.textContent || '').toLowerCase();
            if (txt.indexOf('обязательные поля') < 0) continue;
            let d = n;
            for (let up = 0; up < 20 && d; up++) {
              d = d.parentElement;
              if (!d || !d.offsetParent) continue;
              if (d.id === 'autotest-completion-popup' || d.closest('#autotest-completion-popup')) break;
              const btns = d.querySelectorAll('button,[role="button"]');
              if (btns.length === 0) continue;
              for (let i = 0; i < btns.length; i++) {
                const t = (btns[i].textContent || '').trim().toLowerCase();
                if (t === 'ok' || t === 'ок') { btns[i].click(); return true; }
              }
              btns[btns.length - 1].click();
              return true;
            }
          }
          return false;
        }
      });
      const closed = results?.some(r => r?.result === true);
      sendResponse({ closed });
    } catch (e) {
      sendResponse({ closed: false, error: e?.message });
    }
  });

  // ИСПРАВЛЕНИЕ #14: Выполнение JS через chrome.scripting для обхода CSP
  registry.register('EXECUTE_JS', async ({ message, sendResponse }) => {
    try {
      const { script, tabId } = message;
      
      if (!script || typeof script !== 'string') {
        sendResponse({ success: false, error: 'Скрипт не указан или имеет неверный формат' });
        return;
      }
      
      const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      
      if (!targetTabId) {
        sendResponse({ success: false, error: 'Не удалось определить tabId для выполнения скрипта' });
        return;
      }
      
      console.log(`📜 [Background] Выполнение JS через chrome.scripting во вкладке ${targetTabId}`);
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (scriptCode) => {
          try {
            const result = eval(scriptCode);
            return { success: true, result };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
        args: [script]
      });
      
      if (results && results[0] && results[0].result) {
        const { success, result, error } = results[0].result;
        if (success) {
          console.log(`✅ [Background] JS выполнен успешно`);
          sendResponse({ success: true, result });
        } else {
          console.error(`❌ [Background] Ошибка выполнения JS: ${error}`);
          sendResponse({ success: false, error });
        }
      } else {
        sendResponse({ success: false, error: 'Не удалось выполнить скрипт' });
      }
    } catch (error) {
      console.error('❌ [Background] Ошибка при выполнении JS через chrome.scripting:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // v0.9.6.1: Переключение на другую вкладку (по индексу, URL или заголовку)
  registry.register('SWITCH_TAB', async ({ message, sender, sendResponse }) => {
    try {
      const { switchTab } = message;
      const mode = switchTab?.mode || 'index';
      let currentWindowId = sender?.tab?.windowId;
      if (!currentWindowId) {
        const win = await chrome.windows.getCurrent();
        currentWindowId = win?.id;
      }

      const tabs = await chrome.tabs.query({
        windowId: currentWindowId,
        windowType: 'normal'
      });

      const filteredTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://') && !t.url.startsWith('edge://'));
      const sortedTabs = filteredTabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      let targetTab = null;
      if (mode === 'index') {
        const idx = Math.max(0, parseInt(switchTab?.tabIndex, 10) || 0);
        targetTab = sortedTabs[idx] || null;
      } else if (mode === 'url' && switchTab?.urlPattern) {
        const pattern = switchTab.urlPattern.trim();
        const isRegex = pattern.length >= 2 && pattern.startsWith('/') && pattern.endsWith('/');
        let re = null;
        if (isRegex) {
          try {
            re = new RegExp(pattern.slice(1, -1));
          } catch (e) {
            console.warn('⚠️ [Background] Некорректный regex для switch-tab url:', e.message);
          }
        }
        targetTab = sortedTabs.find(t => {
          if (re) return re.test(t.url || '');
          return (t.url || '').toLowerCase().includes(pattern.toLowerCase());
        }) || null;
      } else if (mode === 'title' && switchTab?.titlePattern) {
        const pattern = switchTab.titlePattern.trim();
        const isRegex = pattern.length >= 2 && pattern.startsWith('/') && pattern.endsWith('/');
        let re = null;
        if (isRegex) {
          try {
            re = new RegExp(pattern.slice(1, -1));
          } catch (e) {
            console.warn('⚠️ [Background] Некорректный regex для switch-tab title:', e.message);
          }
        }
        targetTab = sortedTabs.find(t => {
          const title = t.title || '';
          if (re) return re.test(title);
          return title.toLowerCase().includes(pattern.toLowerCase());
        }) || null;
      }

      if (!targetTab || !targetTab.id) {
        sendResponse({ success: false, error: 'Вкладка не найдена' });
        return;
      }

      await chrome.tabs.update(targetTab.id, { active: true });
      sendResponse({ success: true, tabId: targetTab.id });
    } catch (error) {
      console.error('❌ [Background] Ошибка при переключении вкладки:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // Обновление текущей вкладки, на которой выполняется тест (шаг «Обновить»)
  registry.register('REFRESH_TAB', async ({ message, sender, sendResponse }) => {
    try {
      const tabId = message.tabId ?? sender?.tab?.id;
      if (!tabId) {
        sendResponse({ success: false, error: 'Не удалось определить вкладку для обновления' });
        return;
      }
      const tab = await chrome.tabs.get(tabId);
      const url = tab?.url || message.url || '';
      console.log(`🔄 [Background] Обновление вкладки ${tabId}, URL: ${url}`);
      await chrome.tabs.reload(tabId);
      sendResponse({ success: true, url });
    } catch (error) {
      console.error('❌ [Background] Ошибка при обновлении вкладки:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // ИСПРАВЛЕНИЕ #16: Закрытие вкладки через chrome.tabs.remove
  registry.register('CLOSE_TAB', async ({ message, sendResponse }) => {
    try {
      const { tabId } = message;
      
      const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      
      if (!targetTabId) {
        sendResponse({ success: false, error: 'Не удалось определить tabId для закрытия' });
        return;
      }
      
      console.log(`🗑️ [Background] Закрытие вкладки ${targetTabId}`);
      await chrome.tabs.remove(targetTabId);
      sendResponse({ success: true });
    } catch (error) {
      console.error('❌ [Background] Ошибка при закрытии вкладки:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // ИСПРАВЛЕНИЕ #17: Открытие новой вкладки с передачей управления тестом
  registry.register('NEW_TAB_WITH_TEST', async ({ message, sendResponse }) => {
    try {
      const { url, testState } = message;
      
      if (!url) {
        sendResponse({ success: false, error: 'URL не указан' });
        return;
      }
      
      console.log(`🔗 [Background] Открытие новой вкладки: ${url}`);
      const newTab = await chrome.tabs.create({ url, active: true });
      
      // Сохраняем состояние теста для восстановления в новой вкладке
      if (testState) {
        // Ждём загрузки вкладки
        await new Promise((resolve) => {
          const listener = (tabId, info) => {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          // Таймаут на случай если страница не загрузится
          setTimeout(resolve, 10000);
        });
        
        // Внедряем content scripts и передаём состояние
        try {
          await chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            files: TestManager.CONTENT_SCRIPT_FILES || ['content/content.js', 'content/player-core.js']
          });
          
          // Отправляем состояние теста в новую вкладку
          await chrome.tabs.sendMessage(newTab.id, {
            type: 'RESUME_TEST',
            testState
          });
          
          console.log(`✅ [Background] Тест передан в новую вкладку ${newTab.id}`);
        } catch (injectError) {
          console.warn(`⚠️ [Background] Не удалось передать тест в новую вкладку: ${injectError.message}`);
        }
      }
      
      sendResponse({ success: true, tabId: newTab.id });
    } catch (error) {
      console.error('❌ [Background] Ошибка при открытии новой вкладки:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // NETWORK MONITORING HANDLERS
  // ============================================================================

  /**
   * Начать мониторинг сетевых запросов
   */
  registry.register('NETWORK_START_MONITORING', async ({ sendResponse }) => {
    try {
      if (typeof isNetworkMonitoring !== 'undefined') {
        isNetworkMonitoring = true;
        console.log('[Network] Мониторинг запущен');
        sendResponse({ success: true });
      } else {
        throw new Error('Network monitoring не инициализирован в background.js');
      }
    } catch (error) {
      console.error('❌ [Network] Ошибка при запуске мониторинга:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /**
   * Остановить мониторинг сетевых запросов
   */
  registry.register('NETWORK_STOP_MONITORING', async ({ sendResponse }) => {
    try {
      if (typeof isNetworkMonitoring !== 'undefined') {
        isNetworkMonitoring = false;
        console.log('[Network] Мониторинг остановлен');
        sendResponse({ success: true });
      } else {
        throw new Error('Network monitoring не инициализирован');
      }
    } catch (error) {
      console.error('❌ [Network] Ошибка при остановке мониторинга:', error);
      sendResponse({ success: false, error: error.message });
    }
  });

  /**
   * Получить список сетевых запросов для вкладки
   */
  registry.register('NETWORK_GET_REQUESTS', async ({ message, sendResponse }) => {
    try {
      const tabId = message.tabId;
      if (!tabId) {
        throw new Error('tabId не указан');
      }

      if (typeof networkRequests !== 'undefined') {
        const requests = networkRequests.get(tabId) || [];
        sendResponse({ success: true, requests });
      } else {
        throw new Error('networkRequests не инициализирован');
      }
    } catch (error) {
      console.error('❌ [Network] Ошибка при получении запросов:', error);
      sendResponse({ success: false, error: error.message, requests: [] });
    }
  });

  /**
   * Очистить историю запросов для вкладки
   */
  registry.register('NETWORK_CLEAR_HISTORY', async ({ message, sendResponse }) => {
    try {
      const tabId = message.tabId;
      if (!tabId) {
        throw new Error('tabId не указан');
      }

      if (typeof networkRequests !== 'undefined') {
        networkRequests.delete(tabId);
        console.log(`[Network] История запросов для вкладки ${tabId} очищена`);
        sendResponse({ success: true });
      } else {
        throw new Error('networkRequests не инициализирован');
      }
    } catch (error) {
      console.error('❌ [Network] Ошибка при очистке истории:', error);
      sendResponse({ success: false, error: error.message });
    }
  });
}

self.registerBackgroundMessageHandlers = registerBackgroundMessageHandlers;
