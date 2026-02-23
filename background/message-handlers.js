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
      console.log(`📋 Запрос списка тестов: найдено ${testsArray.length} тестов`);
      sendResponse({
        success: true,
        tests: testsArray,
        freeTierLimit: FREE_TIER_TEST_LIMIT,
        limitsEnabled: ENABLE_FREEMIUM_LIMITS
      });
    } catch (error) {
      console.error('❌ Ошибка при получении списка тестов:', error);
      sendResponse({ success: false, error: error.message, tests: [] });
    }
  });

  registry.register('GET_TEST', async ({ message, sendResponse }) => {
    const test = getTestById(manager, message.testId);
    sendResponse({ success: !!test, test });
  });

  registry.register('GET_ALL_TESTS', async ({ sendResponse }) => {
    const tests = Array.from(manager.tests.values());
    sendResponse({ success: true, tests });
  });

  registry.register('DELETE_TEST', async ({ message, sendResponse }) => {
    try {
      manager.tests.delete(message.testId);
      manager.testHistory.delete(message.testId);
      await manager.saveTests();
      await manager.saveTestHistory();
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
          errorMessage.includes('QuotaExceededError')
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
        stepType: manager.stepType || null
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
    await manager.handlePlayTest(message, sendResponse);
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
      await manager.saveTests();
      manager.broadcast({ type: 'TEST_UPDATED', testId, actionIndex: idx, patch });
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

  registry.register('SAVE_PLAYBACK_STATE', async ({ message, sendResponse }) => {
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
    manager.playbackState = {
      test: testToSave,
      actionIndex: message.actionIndex,
      nextUrl: message.nextUrl,
      runMode
    };

    if (!manager.isPlaying) {
      console.log('⚠️ isPlaying был false, устанавливаю в true');
      manager.isPlaying = true;
    }

    try {
      await chrome.storage.local.set({ playbackState: manager.playbackState });
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
    }

    console.log('✅ Состояние воспроизведения сохранено');
    sendResponse({ success: true });
  });

  registry.register('GET_PLAYBACK_STATE', async ({ sendResponse }) => {
    console.log('📥 Запрос состояния воспроизведения:', {
      hasPlaybackState: !!manager.playbackState,
      isPlaying: manager.isPlaying,
      actionIndex: manager.playbackState?.actionIndex,
      nextUrl: manager.playbackState?.nextUrl
    });

    if (manager.playbackState && manager.isPlaying) {
      console.log('✅ Возвращаю активное состояние воспроизведения');
      sendResponse({
        success: true,
        isPlaying: true,
        test: manager.playbackState.test,
        actionIndex: manager.playbackState.actionIndex,
        nextUrl: manager.playbackState.nextUrl,
        runMode: manager.playbackState.runMode || 'optimized'
      });
    } else {
      console.log('ℹ️ Воспроизведение не активно');
      sendResponse({ success: true, isPlaying: false });
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
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('START_RECORDING_INTO_TEST', async ({ message, sendResponse }) => {
    console.log('🎬 Обработка START_RECORDING_INTO_TEST...');
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
    manager.currentTest = existingTest;
    manager.recordInsertIndex = message.insertAfterIndex !== undefined ? message.insertAfterIndex + 1 : existingTest.actions.length;
    manager.recordedActionsCount = 0;
    manager.recordMarkerActionIndex = message.insertAfterIndex;

    console.log(`🎬 Начало записи в существующий тест: ${existingTest.name} (ID: ${existingTest.id}), вставка после индекса ${message.insertAfterIndex}`);

    try {
      await manager.broadcast({
        type: 'RECORDING_STARTED',
        testId: manager.currentTest.id,
        insertAfterIndex: message.insertAfterIndex
      });
      console.log('✅ Broadcast отправлен, отправляю ответ...');
      sendResponse({ success: true, testId: manager.currentTest.id });
      console.log('✅ Ответ отправлен успешно');
    } catch (error) {
      console.error('❌ Ошибка при запуске записи:', error);
      manager.isRecording = false;
      manager.currentTest = null;
      manager.recordInsertIndex = null;
      manager.recordMarkerActionIndex = null;
      sendResponse({ success: false, error: error.message });
    }
  });

  registry.register('STOP_RECORDING', async ({ sendResponse }) => {
    if (!manager.isRecording) {
      sendResponse({ success: false, error: 'Запись не активна' });
      return;
    }

    manager.isRecording = false;
    if (manager.currentTest) {
      const actionsCountBefore = manager.currentTest.actions.length;
      const wasRecordingIntoExisting = manager.recordInsertIndex !== undefined && manager.recordInsertIndex !== null;
      const recordedCount = manager.recordedActionsCount || 0;

      const removedCount = manager.cleanDuplicateActions(manager.currentTest);
      if (removedCount > 0) {
        console.log(`🧹 Автоматически удалено ${removedCount} дублирующихся действий из записанного теста`);
      }

      const actionsCountAfter = manager.currentTest.actions.length;
      manager.tests.set(manager.currentTest.id, manager.currentTest);
      await manager.saveTests();

      if (wasRecordingIntoExisting && manager.recordMarkerActionIndex !== null && manager.recordMarkerActionIndex !== undefined) {
        const markerActionIndex = manager.recordMarkerActionIndex;
        if (markerActionIndex >= 0 && markerActionIndex < manager.currentTest.actions.length) {
          const markerAction = manager.currentTest.actions[markerActionIndex];
          if (markerAction && markerAction.recordMarker === true) {
            markerAction.recordMarker = false;
            console.log(`🔴 Маркер записи снят с действия ${markerActionIndex + 1}`);
          }
        }
      }

      if (wasRecordingIntoExisting) {
        console.log(`⏹️ Запись остановлена. В тест "${manager.currentTest.name}" добавлено ${recordedCount} действий (всего действий: ${actionsCountAfter})`);
      } else {
        console.log(`⏹️ Запись остановлена. Сохранен тест "${manager.currentTest.name}" с ${actionsCountAfter} действиями (было ${actionsCountBefore})`);
      }

      const testId = manager.currentTest.id;
      const markerActionIndex = manager.recordMarkerActionIndex;
      manager.currentTest = null;
      manager.recordInsertIndex = null;
      manager.recordedActionsCount = 0;
      manager.recordMarkerActionIndex = null;
      await manager.broadcast({
        type: 'RECORDING_STOPPED',
        testId,
        recordedCount,
        markerActionIndex,
        shouldResumePlayback: wasRecordingIntoExisting
      });
      sendResponse({ success: true, testId, recordedCount });
    } else {
      console.warn('⚠️ Попытка остановить запись, но активного теста нет');
      sendResponse({ success: false, error: 'No active test' });
    }
  });

  registry.register('ADD_ACTION', async ({ message, sendResponse }) => {
    if (manager.isRecording && manager.currentTest) {
      const newAction = {
        ...message.action,
        timestamp: Date.now()
      };

      if (manager.recordInsertIndex !== undefined && manager.recordInsertIndex !== null) {
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

  registry.register('UPDATE_TEST', async ({ message, sendResponse }) => {
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
    manager.tests.set(updatedTest.id, {
      ...updatedTest,
      updatedAt: new Date().toISOString()
    });
    await manager.saveTests();

    await manager.triggerExcelExport(updatedTest.id, 'save');

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

  registry.register('TEST_STEP_PROGRESS', async ({ message, sendResponse }) => {
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

  registry.register('TEST_STEP_COMPLETED', async ({ message, sendResponse }) => {
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


  registry.register('TEST_COMPLETED', async ({ message, sendResponse }) => {
    await manager.stopVideoRecordingIfActive(message.testId);
    const runMode = message.runMode || 'optimized';
    const optimizationSummary = message.optimizationSummary || {};
    manager.isPlaying = false;
    manager.currentStep = 0;
    manager.totalSteps = 0;
    manager.stepType = null;
    manager.playbackState = null;
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
      error: message.error
    }).catch(() => {});
    manager.broadcast({
      type: 'STEP_PROGRESS_UPDATE',
      step: 0,
      total: 0,
      stepType: null,
      testId: message.testId
    }).catch(() => {});

    const completedTest = manager.tests.get(message.testId);
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

    sendResponse({ success: true });
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

  registry.register('TAKE_SCREENSHOT', async ({ sendResponse }) => {
    let activeTab;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab;
      if (!activeTab || !activeTab.id) {
        sendResponse({ success: false, error: 'Активная вкладка не найдена' });
        return;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
        format: 'png',
        quality: 100
      });

      sendResponse({ success: true, screenshot: dataUrl });
    } catch (error) {
      console.error('Ошибка при создании скриншота:', error);
      if (error.message && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        console.warn('⚠️ Превышена квота captureVisibleTab, ожидаю 1.5 сек перед повтором...');
        try {
          await new Promise(r => setTimeout(r, 1500));
          const retryTab = activeTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
          if (!retryTab || !retryTab.id) {
            sendResponse({ success: false, error: 'Активная вкладка не найдена' });
            return;
          }
          const retryDataUrl = await chrome.tabs.captureVisibleTab(retryTab.windowId, {
            format: 'png',
            quality: 100
          });
          sendResponse({ success: true, screenshot: retryDataUrl, retriedAfterQuota: true });
          return;
        } catch (retryError) {
          console.error('❌ Ошибка при повторной попытке создания скриншота:', retryError);
        }
      }
      sendResponse({ success: false, error: error.message });
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
      const mediaBase = (settings.pluginSettings?.mediaSavePath || screenshotSettings.saveFolder || (screenshotSettings.savePath || '').replace(/\/screenshots\/?$/i, '') || 'AutoTestRecorder').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
      const baseDir = (mediaBase || 'AutoTestRecorder') + '/screenshots';
      const fileName = `${baseDir}/${testId}/${timestamp}/step${stepNumberForFile}_${typeSuffix}.png`;

      const dataUrl = screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`;
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
            files: TestManager.CONTENT_SCRIPT_FILES || ['content/content.js', 'content/player.js']
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
}

self.registerBackgroundMessageHandlers = registerBackgroundMessageHandlers;
