// Popup UI логика

class PopupController {
  constructor() {
    this.state = {
      isRecording: false,
      isPlaying: false,
      isPaused: false, // Флаг паузы воспроизведения
      currentTestId: null,
      tests: [],
      testsLoadState: 'loading', // 'loading' | 'success' | 'error'
      testsLoadError: null,
      freeTierLimit: 10,
      limitsEnabled: false,
      currentStep: 0,
      totalSteps: 0,
      stepType: null,
      completedSteps: [] // Массив завершенных шагов
    };
    /** URL страницы тарифов / оплаты (заменить при включении Freemium). */
    this.UPGRADE_URL = '#';
    this.idleWarningTimer = null;
    this.idleWarningShown = false;
    this.lastStepActivity = null;
    this.init();
    this.setupSettingsListener();
  }

  /**
   * Shorthand for i18n.t()
   */
  t(key, params) {
    return window.i18n ? window.i18n.t(key, params) : key;
  }

  /**
   * Initialize language switcher dropdown
   */
  initLangSwitcher() {
    const switcher = document.getElementById('langSwitcher');
    if (!switcher || !window.i18n) return;

    const langs = window.i18n.getSupportedLanguages();
    const names = window.i18n.getLanguageNames();
    switcher.innerHTML = '';
    for (const lang of langs) {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = names[lang] || lang;
      if (lang === window.i18n.getLang()) opt.selected = true;
      switcher.appendChild(opt);
    }
    switcher.addEventListener('change', () => {
      window.i18n.setLang(switcher.value);
    });
  }

  async init() {
    console.log('🚀 [Popup] Initializing PopupController...');

    // === i18n: Initialize language system ===
    try {
      if (window.i18n) {
        await window.i18n.init();
        window.i18n.applyToDOM();
        this.initLangSwitcher();
        window.i18n.onLangChange(() => {
          window.i18n.applyToDOM();
          // Re-render dynamic content
          this.renderTests();
        });
      }
    } catch (i18nError) {
      console.warn('[Popup] i18n init error:', i18nError);
    }

    try {
      if (window.ExcelExporter) {
        console.log('✅ [Popup] ExcelExporter loaded');
      }

      await this.loadPluginSettings();
      await this.checkAutotestsEnabled();
    } catch (initError) {
      console.error('❌ [Popup] Settings load error (continuing):', initError);
      // Не прерываем — popup остаётся работоспособным
    }
    
    // Проверяем наличие элементов перед привязкой обработчиков
    const startBtn = document.getElementById('startRecording');
    const stopBtn = document.getElementById('stopRecording');
    const forceStopBtn = document.getElementById('forceStop');
    const pauseBtn = document.getElementById('pausePlayback');
    const resumeBtn = document.getElementById('resumePlayback');
    const refreshBtn = document.getElementById('refreshTests');
    const importBtn = document.getElementById('importTest');
    const advancedSearchBtn = document.getElementById('advancedSelectorSearch');
    const settingsBtn = document.getElementById('settingsButton');
    const selectorInspectorBtn = document.getElementById('selectorInspectorButton');
    const expandBtn = document.getElementById('expandButton');
    console.log('🔍 Поиск элементов:', {
      startBtn: !!startBtn,
      stopBtn: !!stopBtn,
      forceStopBtn: !!forceStopBtn,
      refreshBtn: !!refreshBtn,
      importBtn: !!importBtn,
      advancedSearchBtn: !!advancedSearchBtn,
      settingsBtn: !!settingsBtn
    });

    if (!startBtn || !stopBtn || !forceStopBtn || !refreshBtn) {
      console.error('❌ Не все обязательные элементы интерфейса найдены');
      console.error('Найдены:', { startBtn, stopBtn, forceStopBtn, refreshBtn, importBtn });
      alert(this.t('popup.alertUiNotFound'));
      return;
    }
    
    // Проверяем кнопку импорта отдельно (она может отсутствовать, но это не критично)
    if (!importBtn) {
      console.warn('⚠️ Кнопка импорта не найдена');
    }

    // Привязываем обработчики с логированием
    startBtn.addEventListener('click', (e) => {
      console.log('🖱️ Клик по кнопке "Начать запись"');
      e.preventDefault();
      e.stopPropagation();
      this.startRecording().catch(err => {
        console.error('❌ Ошибка в startRecording:', err);
        alert(this.t('popup.alertRecordingError', {msg: err.message}));
      });
    });
    
    stopBtn.addEventListener('click', () => {
      console.log('🖱️ Клик по кнопке "Остановить запись"');
      this.stopRecording();
    });
    
    forceStopBtn.addEventListener('click', () => {
      console.log('🖱️ Клик по кнопке "Принудительная остановка"');
      this.forceStop();
    });
    
    // Обработчики для кнопок паузы и возобновления
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        console.log('🖱️ Клик по кнопке "Пауза"');
        this.pausePlayback();
      });
    }
    
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        console.log('🖱️ Клик по кнопке "Продолжить"');
        this.resumePlayback();
      });
    }
    
    refreshBtn.addEventListener('click', () => {
      console.log('🖱️ Клик по кнопке "Обновить"');
      this.loadTests();
    });
    
    if (importBtn) {
      importBtn.addEventListener('click', (e) => {
        console.log('🖱️ Клик по кнопке "Импортировать"');
        e.preventDefault();
        e.stopPropagation();
        try {
          this.showImportDialog();
        } catch (error) {
          console.error('❌ Ошибка при вызове showImportDialog:', error);
          alert(this.t('popup.alertImportDialogError', {msg: error.message}));
        }
      });
    } else {
      console.error('❌ Кнопка импорта не найдена, обработчик не привязан');
    }
    
    // Обработчик выбора файла для импорта
    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) {
      importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.importFromFile(file);
        }
        // Сбрасываем значение input, чтобы можно было выбрать тот же файл снова
        e.target.value = '';
      });
    } else {
      console.error('❌ Элемент importFileInput не найден в DOM');
    }
    
    if (advancedSearchBtn) {
      advancedSearchBtn.addEventListener('click', () => {
        console.log('🖱️ Клик по кнопке "Расширенный поиск селекторов"');
        this.showAdvancedSelectorSearch();
      });
    }
    
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        console.log('🖱️ Клик по кнопке "Настройки"');
        this.openSettings();
      });
    }
    
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        console.log('🖱️ Клик по кнопке "Развернуть на весь экран"');
        this.openFullscreen();
      });
    }
    const helpBtn = document.getElementById('helpButton');
    if (helpBtn) {
      helpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = chrome.runtime.getURL('help/help.html');
        chrome.tabs.create({ url });
      });
    }
    const analyticsDashboardBtn = document.getElementById('analyticsDashboardButton');
    if (analyticsDashboardBtn) {
      analyticsDashboardBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = chrome.runtime.getURL('analytics/analytics-dashboard.html');
        chrome.tabs.create({ url });
      });
    }
    
    // Обработчик кнопки очистки скриншотов
    
    if (selectorInspectorBtn) {
      selectorInspectorBtn.addEventListener('click', () => {
        console.log('🖱️ Клик по кнопке "Инспектор селекторов"');
        this.openSelectorInspector();
      });
    }
    
    // Обработчик закрытия полноэкранного режима
    const closeFullscreenBtn = document.getElementById('closeFullscreen');
    if (closeFullscreenBtn) {
      closeFullscreenBtn.addEventListener('click', async () => {
        console.log('🖱️ Клик по кнопке "Закрыть полноэкранный режим"');
        try {
          // Получаем текущее окно и закрываем его
          const currentWindow = await chrome.windows.getCurrent();
          if (currentWindow) {
            await chrome.windows.remove(currentWindow.id);
          } else {
            // Fallback: пытаемся закрыть через window.close()
            window.close();
          }
        } catch (error) {
          console.error('❌ Ошибка при закрытии полноэкранного режима:', error);
          // Fallback: пытаемся закрыть через window.close()
          window.close();
        }
      });
    }
    
    console.log('✅ Обработчики событий привязаны');

    // Привязываем делегированный обработчик для кнопок тестов (один раз)
    const testsList = document.getElementById('testsList');
    testsList.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      const action = button.getAttribute('data-action');
      if (action === 'retryTests') {
        this.loadTests();
        return;
      }

      const testId = button.getAttribute('data-test-id');
      if (!testId) return;

      switch (action) {
        case 'play':
          this.playTest(testId);
          break;
        case 'pause':
          this.pausePlayback(testId);
          break;
        case 'resume':
          this.resumePlayback(testId);
          break;
        case 'edit':
          this.editTest(testId);
          break;
        case 'delete':
          this.deleteTest(testId);
          break;
        case 'history':
          this.showTestHistory(testId);
          break;
        case 'screenshots':
          this.showScreenshots(testId);
          break;
      }
    });

    // Слушаем обновления шагов теста и завершения теста
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'STEP_PROGRESS_UPDATE') {
        this.state.currentStep = message.step;
        this.state.totalSteps = message.total;
        this.state.stepType = message.stepType;
        this.markPlaybackActivity();
        this.updateUI();
        sendResponse({ success: true });
      } else if (message.type === 'STEP_COMPLETED_UPDATE') {
        // Обновляем информацию о завершенных шагах
        if (!this.state.completedSteps) {
          this.state.completedSteps = [];
        }
        // Добавляем или обновляем информацию о шаге
        const existingStepIndex = this.state.completedSteps.findIndex(s => s.step === message.step);
        const stepInfo = {
          step: message.step,
          total: message.total,
          success: message.success,
          error: message.error || null,
          stepType: message.stepType || null,
          timestamp: Date.now()
        };
        if (existingStepIndex >= 0) {
          this.state.completedSteps[existingStepIndex] = stepInfo;
        } else {
          this.state.completedSteps.push(stepInfo);
        }
        // Сортируем по номеру шага
        this.state.completedSteps.sort((a, b) => a.step - b.step);
        // Обновляем текущий шаг, если он был завершен
        const nextStep = Number(message.step) + 1;
        if (!Number.isNaN(nextStep)) {
          this.state.currentStep = Math.max(this.state.currentStep || 0, nextStep);
        }
        // Обновляем тип шага, если указан
        if (message.stepType && message.step === this.state.currentStep - 1) {
          this.state.stepType = message.stepType;
        }
        this.markPlaybackActivity();
        this.updateUI();
        sendResponse({ success: true });
      } else if (message.type === 'TEST_COMPLETED') {
        // Тест завершен, обновляем состояние
        this.state.isPlaying = false;
        this.state.isPaused = false;
        this.state.currentTestId = null;
        this.state.currentStep = 0;
        this.state.totalSteps = 0;
        this.state.stepType = null;
        this.stopIdleWarningTimer();
        this.updateUI();
        this.renderTests(); // Обновляем список тестов
        
        // Показываем уведомление о завершении
        if (message.success) {
          console.log('✅ Тест успешно завершен');
        } else {
          console.error('❌ Тест завершен с ошибкой:', message.error);
        }
        
        // Обновляем список тестов с задержкой, чтобы история успела сохраниться
        setTimeout(async () => {
          try {
            // Сначала обновляем список тестов
            await this.loadTests();
            console.log('✅ Список тестов обновлен после завершения');
            
            // Затем принудительно обновляем историю для всех тестов
            // Это гарантирует, что новая история будет отображена
            const testCards = document.querySelectorAll('.test-card');
            for (const card of testCards) {
              const testId = card.dataset.testId;
              if (testId) {
                // Проверяем наличие истории для этого теста
                try {
                  const historyResponse = await chrome.runtime.sendMessage({
                    type: 'GET_TEST_HISTORY',
                    testId: testId
                  });
                  if (historyResponse && historyResponse.success && historyResponse.history && historyResponse.history.length > 0) {
                    console.log(`📊 [Popup] История для теста ${testId}: ${historyResponse.history.length} прогонов`);
                    // Обновляем кнопку истории, если она есть
                    const historyBtn = card.querySelector('.history-btn');
                    if (historyBtn) {
                      historyBtn.style.display = 'inline-block';
                    }
                  }
                } catch (err) {
                  console.warn(`⚠️ Ошибка при проверке истории для теста ${testId}:`, err);
                }
              }
            }
          } catch (err) {
            console.error('❌ Ошибка при обновлении списка тестов:', err);
          }
        }, 2000); // Увеличена задержка до 2 секунд для сохранения истории
        
        sendResponse({ success: true });
      }
      return true;
    });

    // Загружаем состояние и тесты
    await this.loadState();
    await this.loadTests();

    // Инициализируем индикатор памяти
    this.initStorageIndicator();

    // Обновляем состояние каждые 500ms для более плавного отображения шагов
    setInterval(() => this.loadState(), 500);

    // Модалка «Перейти на платный тариф»
    document.getElementById('closeUpgradeModal')?.addEventListener('click', () => this.hideUpgradeModal());
    document.getElementById('closeUpgradeModalBtn')?.addEventListener('click', () => this.hideUpgradeModal());
    document.getElementById('upgradeModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'upgradeModal') this.hideUpgradeModal();
    });
  }

  async loadState() {
    try {
      // Проверяем, что extension готов
      if (!chrome.runtime?.id) {
        console.warn('⚠️ Extension context недействителен, пропускаю загрузку состояния');
        return;
      }
      
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response && response.success) {
        // Сохраняем currentTestId и isPaused перед обновлением
        const savedTestId = this.state.currentTestId;
        const savedIsPaused = this.state.isPaused;
        
        const merged = { ...this.state, ...response.state };
        // Не даём периодическому GET_STATE откатывать шаг назад, если popup уже видел завершённые шаги.
        const completedMaxStep = (this.state.completedSteps || []).reduce((max, s) => {
          const stepNum = Number(s?.step) || 0;
          return stepNum > max ? stepNum : max;
        }, 0);
        const minAllowedStep = completedMaxStep > 0 ? completedMaxStep + 1 : 0;
        merged.currentStep = Math.max(Number(merged.currentStep) || 0, minAllowedStep);
        this.state = merged;
        
        // Восстанавливаем currentTestId и isPaused, если тест все еще воспроизводится
        if (this.state.isPlaying) {
          if (savedTestId) {
            this.state.currentTestId = savedTestId;
          }
          if (savedIsPaused !== undefined) {
            this.state.isPaused = savedIsPaused;
          }
        }
        
        this.updateUI();
      }
    } catch (error) {
      // Игнорируем ошибки соединения - это нормально, если background script перезапускается
      if (error.message && error.message.includes('Receiving end does not exist')) {
        // Это нормально, background script может быть не готов
        return;
      }
      console.error('Error loading state:', error);
    }
  }

  async loadTests(maxRetries = 3, retryDelay = 500) {
    this.state.testsLoadState = 'loading';
    this.state.testsLoadError = null;
    this.renderTests();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!chrome.runtime?.id) {
          if (attempt < maxRetries - 1) {
            console.log(`⏳ Extension context недействителен, повторная попытка ${attempt + 1}/${maxRetries}...`);
            await this.delay(retryDelay);
            continue;
          }
          this.state.testsLoadState = 'error';
          this.state.testsLoadError = this.t('popup.extensionRestarting');
          this.state.tests = [];
          this.renderTests();
          return;
        }

        console.log(`📋 Запрос списка тестов... (попытка ${attempt + 1}/${maxRetries})`);
        const response = await chrome.runtime.sendMessage({ type: 'GET_TESTS' });

        if (response && response.success) {
          this.state.testsLoadState = 'success';
          this.state.testsLoadError = null;
          this.state.tests = response.tests || [];
          if (response.freeTierLimit !== undefined) this.state.freeTierLimit = response.freeTierLimit;
          if (response.limitsEnabled !== undefined) this.state.limitsEnabled = response.limitsEnabled;
          console.log(`✅ Загружено ${this.state.tests.length} тестов`);
          this.renderTests();
          return;
        }

        this.state.testsLoadState = 'error';
        this.state.testsLoadError = response?.error || this.t('popup.loadTestsFailed');
        this.state.tests = [];
        this.renderTests();
        return;
      } catch (error) {
        if (error.message && error.message.includes('Receiving end does not exist')) {
          if (attempt < maxRetries - 1) {
            await this.delay(retryDelay);
            continue;
          }
          this.state.testsLoadState = 'error';
          this.state.testsLoadError = this.t('popup.backgroundNotResponding');
          this.state.tests = [];
          this.renderTests();
          return;
        }
        this.state.testsLoadState = 'error';
        this.state.testsLoadError = error.message || this.t('popup.loadTestsError');
        this.state.tests = [];
        this.renderTests();
        return;
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  markPlaybackActivity() {
    this.lastStepActivity = Date.now();
    this.idleWarningShown = false;
    this.startIdleWarningTimer();
  }

  startIdleWarningTimer() {
    this.stopIdleWarningTimer();
    if (!this.state.isPlaying || this.state.isPaused) {
      return;
    }
    this.idleWarningTimer = setTimeout(() => {
      if (!this.state.isPlaying || this.state.isPaused) {
        return;
      }
      const lastActivity = this.lastStepActivity || Date.now();
      if (this.state.currentStep === 0 && Date.now() - lastActivity >= 3000 && !this.idleWarningShown) {
        this.showToast(this.t('popup.idleWarning'), 'warning');
        this.idleWarningShown = true;
      }
      this.startIdleWarningTimer();
    }, 1100);
  }

  stopIdleWarningTimer() {
    if (this.idleWarningTimer) {
      clearTimeout(this.idleWarningTimer);
      this.idleWarningTimer = null;
    }
  }

  showToast(message, tone = 'warning', durationMs = 3500) {
    const toast = document.createElement('div');
    toast.className = `popup-toast ${tone}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }

  async startRecording() {
    console.log('🎬 Метод startRecording вызван');
    
    const testNameInput = document.getElementById('testName');
    if (!testNameInput) {
      console.error('❌ Элемент testName не найден');
      alert(this.t('popup.alertUiNotFound'));
      return;
    }

    const testName = testNameInput.value.trim() || 
                     `Test ${new Date().toLocaleString('ru-RU')}`;

    console.log('🎬 Попытка начать запись теста:', testName);
    console.log('📡 Проверка доступности chrome.runtime:', {
      runtime: !!chrome.runtime,
      id: chrome.runtime?.id,
      sendMessage: typeof chrome.runtime?.sendMessage
    });

    try {
      console.log('📤 Отправка сообщения START_RECORDING...');
      
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'START_RECORDING',
          testName: testName
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('❌ Ошибка chrome.runtime:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      console.log('📥 Ответ от background:', response);

      if (response && response.success) {
        this.state.isRecording = true;
        this.state.currentTestId = response.testId;
        this.updateUI();
        testNameInput.value = '';
        console.log('✅ Запись успешно начата, testId:', response.testId);
      } else {
        if (response?.error === 'FREE_TIER_LIMIT') {
          this.showUpgradeModal(response.limit);
          return;
        }
        const errorMsg = response?.error || this.t('common.unknownError');
        console.error('❌ Ошибка при запуске записи:', errorMsg);
        alert(this.t('popup.alertRecordingError', {msg: errorMsg}));
      }
    } catch (error) {
      console.error('❌ Исключение при запуске записи:', error);
      console.error('Стек ошибки:', error.stack);
      alert(this.t('popup.alertRecordingError', {msg: error.message}));
    }
  }

  async stopRecording() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

      if (response.success) {
        this.state.isRecording = false;
        this.state.currentTestId = null;
        this.updateUI();
        await this.loadTests(); // Обновляем список тестов
      } else {
        alert(this.t('popup.alertStopRecordingError', {msg: response.error || this.t('common.unknownError')}));
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      alert(this.t('popup.alertStopRecording'));
    }
  }

  async playTest(testId) {
    // Очищаем завершенные шаги при начале нового теста
    this.state.completedSteps = [];
    this.showToast(this.t('popup.refreshPageWarning'), 'warning');
    
    if (this.state.isPlaying && !this.state.isPaused) {
      alert(this.t('popup.alertAlreadyPlaying'));
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PLAY_TEST',
        testId: testId
      });

      if (response.success) {
        this.state.isPlaying = true;
        this.state.isPaused = false;
        this.state.currentTestId = testId;
        this.markPlaybackActivity();
        this.updateUI();
        this.renderTests(); // Обновляем список тестов для показа кнопки паузы
        
        // Через 5 секунд проверяем, завершился ли тест
        setTimeout(() => {
          this.loadState();
        }, 5000);
      } else {
        alert(this.t('popup.alertPlaybackError', {msg: response.error || this.t('common.unknownError')}));
      }
    } catch (error) {
      console.error('Error playing test:', error);
      alert(this.t('popup.alertPlaybackFailed'));
    }
  }

  async pausePlayback() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PAUSE_PLAYBACK'
      });

      if (response.success) {
        this.state.isPaused = true;
        this.stopIdleWarningTimer();
        this.updateUI();
        this.renderTests(); // Обновляем список тестов для показа кнопки возобновления
        console.log('⏸️ Воспроизведение поставлено на паузу');
      } else {
        alert(this.t('popup.alertPauseError', {msg: response.error || this.t('common.unknownError')}));
      }
    } catch (error) {
      console.error('Error pausing playback:', error);
      alert(this.t('popup.alertPauseFailed'));
    }
  }

  async resumePlayback() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RESUME_PLAYBACK_FROM_PAUSE'
      });

      if (response.success) {
        this.state.isPaused = false;
        this.markPlaybackActivity();
        this.updateUI();
        this.renderTests(); // Обновляем список тестов для показа кнопки паузы
        console.log('▶️ Воспроизведение возобновлено');
      } else {
        alert(this.t('popup.alertResumeError', {msg: response.error || this.t('common.unknownError')}));
      }
    } catch (error) {
      console.error('Error resuming playback:', error);
      alert(this.t('popup.alertResumeFailed'));
    }
  }

  async editTest(testId) {
    // Открываем редактор в новой вкладке
    const editorUrl = chrome.runtime.getURL('editor/editor.html') + '?testId=' + testId;
    chrome.tabs.create({ url: editorUrl });
  }

  async checkTestHasScreenshots(testId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TEST_HISTORY',
        testId: testId
      });

      if (response && response.success) {
        const history = response.history || [];
        console.log(`🔍 Проверка скриншотов для теста ${testId}: найдено ${history.length} прогонов`);
        
        // Проверяем наличие скриншотов в истории
        // Скриншоты могут быть как в полях (step.screenshot), так и в путях (step.screenshotPath)
        for (const run of history) {
          if (run.steps) {
            for (const step of run.steps) {
              // Проверяем наличие скриншотов в полях (если они еще не удалены)
              if (step.screenshot || step.beforeScreenshot || step.afterScreenshot || 
                  step.screenshotComparison || step.screenshotComparisonView) {
                console.log(`✅ Найдены скриншоты для теста ${testId} в шаге ${step.stepNumber} (в полях)`);
                return true;
              }
              // Проверяем наличие путей к скриншотам (после сохранения в storage скриншоты удаляются, остаются пути)
              if (step.screenshotPath || step.beforeScreenshotPath || step.afterScreenshotPath || 
                  step.errorScreenshotPath || step.screenshotComparison?.diffImagePath || 
                  step.screenshotComparisonViewPath) {
                console.log(`✅ Найдены пути к скриншотам для теста ${testId} в шаге ${step.stepNumber}`);
                return true;
              }
            }
          }
        }
        console.log(`❌ Скриншоты не найдены для теста ${testId}`);
      }
      return false;
    } catch (error) {
      console.error('Ошибка при проверке скриншотов:', error);
      return false;
    }
  }

  async showScreenshots(testId) {
    // Открываем отдельное окно для просмотра скриншотов
    const screenshotsUrl = chrome.runtime.getURL('screenshots/screenshots.html') + '?testId=' + testId;
    chrome.tabs.create({ url: screenshotsUrl });
  }

  async showTestHistory(testId) {
    testId = String(testId);
    const test = this.state.tests.find(t => t.id === testId);
    const testName = test?.name || this.t('common.test');

    const existingModal = document.getElementById('historyModal');
    if (existingModal) existingModal.remove();

    const loadingModalHTML = `
      <div class="modal-overlay" id="historyModal">
        <div class="modal-content history-modal-content" style="max-width: 800px;">
          <div class="modal-header">
            <h3>${this.t('popup.historyTitle', {name: this.escapeHtml(testName)})}</h3>
            <button class="modal-close" id="closeHistoryModal">×</button>
          </div>
          <div class="modal-body" id="historyModalBody" style="text-align: center; padding: 40px 20px;">
            <div class="spinner"></div>
            <p style="margin-top: 12px; color: #666;">${this.t('popup.historyLoading')}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="closeHistoryModalBtn">${this.t('common.close')}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', loadingModalHTML);

    const closeModal = () => document.getElementById('historyModal')?.remove();
    document.getElementById('closeHistoryModal')?.addEventListener('click', closeModal);
    document.getElementById('closeHistoryModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('historyModal')?.addEventListener('click', (e) => { if (e.target.id === 'historyModal') closeModal(); });

    const renderErrorInHistoryModal = (message) => {
      const body = document.getElementById('historyModalBody');
      if (!body) return;
      body.innerHTML = `
        <div class="error-block">
          <div class="error-icon">⚠️</div>
          <div class="error-text">${this.escapeHtml(message)}</div>
          <button type="button" class="btn-retry" id="historyModalRetry">${this.t('common.retry')}</button>
        </div>
      `;
      document.getElementById('historyModalRetry')?.addEventListener('click', () => this.showTestHistory(testId));
    };

    try {
      console.log(`📊 [Popup] Запрос истории для теста ${testId}`);
      const response = await chrome.runtime.sendMessage({ type: 'GET_TEST_HISTORY', testId });

      if (response && response.success) {
        const history = response.history || [];
        console.log(`📊 [Popup] Получена история: ${history.length} прогонов`);
        closeModal();
        this.renderTestHistoryModal(testId, history);
      } else {
        renderErrorInHistoryModal(response?.error || this.t('popup.loadTestsFailed'));
      }
    } catch (error) {
      console.error('❌ Ошибка при получении истории:', error);
      renderErrorInHistoryModal((error && (error.message || String(error))) || this.t('popup.loadTestsError'));
    }
  }

  renderTestHistoryModal(testId, history) {
    // Находим тест для получения его имени
    const test = this.state.tests.find(t => t.id === testId);
    const testName = test?.name || this.t('common.test');

    // Сортируем историю по дате (новые вверху)
    const sortedHistory = [...history].sort((a, b) => {
      const dateA = new Date(a.startTime).getTime();
      const dateB = new Date(b.startTime).getTime();
      return dateB - dateA;
    });

    let historyHTML = '';
    if (sortedHistory.length === 0) {
      historyHTML = `<div class="empty-state">${this.t('popup.historyEmpty')}</div>`;
    } else {
      historyHTML = sortedHistory.map((run, index) => {
        const startDate = new Date(run.startTime);
        const startDateStr = startDate.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const durationStr = this.formatDuration(run.totalDuration);
        const successIcon = run.success ? '✅' : '❌';
        const successClass = run.success ? 'success' : 'error';

        let stepsHTML = '';
        if (run.steps && run.steps.length > 0) {
          stepsHTML = run.steps.map((step, stepIndex) => {
            const stepDurationStr = this.formatDuration(step.duration);
            const stepSuccessIcon = step.success ? '✓' : '✗';
            const stepSuccessClass = step.success ? 'step-success' : 'step-error';
            
            const expectedSelector = step.expectedSelector || 'N/A';
            const actualSelector = step.actualSelector || step.expectedSelector || 'N/A';
            const selectorMatch = expectedSelector === actualSelector;
            
            // Формируем информацию о задержках
            let delaysHTML = '';
            if (step.delayBefore || step.delayAfter) {
              delaysHTML = '<div class="step-delays">';
              if (step.delayBefore) {
                const delayBeforeMs = step.delayBefore;
                const delayBeforeSec = (delayBeforeMs / 1000).toFixed(1);
                delaysHTML += `<div class="delay-item delay-before">${this.t('popup.delayBefore', {ms: delayBeforeMs, sec: delayBeforeSec})}</div>`;
              }
              if (step.delayAfter) {
                const delayAfterMs = step.delayAfter;
                const delayAfterSec = (delayAfterMs / 1000).toFixed(1);
                delaysHTML += `<div class="delay-item delay-after">${this.t('popup.delayAfter', {ms: delayAfterMs, sec: delayAfterSec})}</div>`;
              }
              delaysHTML += '</div>';
            }
            
            return `
              <div class="history-step ${stepSuccessClass}">
                <div class="step-header">
                  <span class="step-number">${this.t('popup.stepNumber', {n: step.stepNumber})}</span>
                  <span class="step-type">${this.getActionTypeLabel(step.actionType || step.type)}</span>
                  <span class="step-status ${stepSuccessClass}">${stepSuccessIcon}</span>
                  <span class="step-duration">${stepDurationStr}</span>
                </div>
                <div class="step-details">
                  ${delaysHTML}
                  <div class="step-selector">
                    <div class="selector-row">
                      <span class="selector-label">${this.t('popup.expectedSelector')}</span>
                      <code class="selector-value">${this.escapeHtml(expectedSelector)}</code>
                    </div>
                    <div class="selector-row">
                      <span class="selector-label">${this.t('popup.actualSelector')}</span>
                      <code class="selector-value ${selectorMatch ? 'match' : 'mismatch'}">${this.escapeHtml(actualSelector)}</code>
                      ${!selectorMatch ? '<span class="selector-warning">⚠️</span>' : ''}
                    </div>
                  </div>
                  ${step.expectedValue ? `
                    <div class="step-value">
                      <span class="value-label">${this.t('popup.value')}</span>
                      <code>${this.escapeHtml(step.expectedValue)}</code>
                    </div>
                  ` : ''}
                  ${step.skipped ? `
                    <div class="step-skip-message">
                      <strong>${this.t('popup.skipped')}</strong> ${this.escapeHtml(step.skipReason || this.t('popup.skipReasonDefault'))}
                    </div>
                  ` : ''}
                  ${step.error ? `
                    <div class="step-error-message">
                      <strong>${this.t('popup.errorInStep')}</strong> ${this.escapeHtml(step.error)}
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('');
        } else {
          // Если шагов нет, но тест был запущен, показываем информацию об этом
          stepsHTML = `
            <div class="empty-state" style="padding: 20px; text-align: center; color: #999;">
              <p>${this.t('popup.noStepsExecuted')}</p>
              ${run.error ? `<p style="color: #f44336; margin-top: 8px;"><strong>${this.t('popup.reason')}</strong> ${this.escapeHtml(run.error)}</p>` : ''}
            </div>
          `;
        }

        return `
          <div class="history-run ${successClass}">
            <div class="run-header">
              <div class="run-info">
                <span class="run-number">${this.t('popup.runNumber', {number: sortedHistory.length - index})}</span>
                <span class="run-date">${startDateStr}</span>
                <span class="run-status ${successClass}">${successIcon}</span>
              </div>
              <div class="run-meta">
                <span>${this.t('popup.duration', {value: durationStr})}</span>
                <span>${this.t('popup.mode', {value: ''})}${run.mode === 'full' ? this.t('popup.modeFull') : this.t('popup.modeOptimized')}</span>
                ${run.error ? `<span class="run-error">${this.t('popup.errorLabel', {msg: this.escapeHtml(run.error)})}</span>` : ''}
              </div>
            </div>
            <div class="run-steps">
              ${stepsHTML}
            </div>
          </div>
        `;
      }).join('');
    }

    const modalHTML = `
      <div class="modal-overlay" id="historyModal">
        <div class="modal-content history-modal-content" style="max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header">
            <h3>${this.t('popup.historyTitle', {name: this.escapeHtml(testName)})}</h3>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn btn-secondary" id="analyzeHistoryBtn" style="padding: 6px 12px; font-size: 12px;">
                ${this.t('popup.analysisAndOptimization')}
              </button>
              <button class="btn btn-secondary" id="exportHistoryReportBtn" style="padding: 6px 12px; font-size: 12px;">
                ${this.t('popup.exportReport')}
              </button>
              <button class="modal-close" id="closeHistoryModal">×</button>
            </div>
          </div>
          <div class="modal-body history-modal-body" style="flex: 1; overflow-y: auto; min-height: 0;">
            ${historyHTML}
          </div>
          <div class="modal-footer" style="flex-shrink: 0;">
            <button class="btn btn-secondary" id="closeHistoryModalBtn">${this.t('common.close')}</button>
          </div>
        </div>
      </div>
    `;

    // Удаляем предыдущее модальное окно, если есть
    const existingModal = document.getElementById('historyModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Добавляем новое модальное окно
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Обработчики закрытия
    const closeModal = () => {
      const modal = document.getElementById('historyModal');
      if (modal) modal.remove();
    };

    document.getElementById('closeHistoryModal')?.addEventListener('click', closeModal);
    document.getElementById('closeHistoryModalBtn')?.addEventListener('click', closeModal);
    
    // Обработчик кнопки анализа
    document.getElementById('analyzeHistoryBtn')?.addEventListener('click', () => {
      this.showHistoryAnalysis(testId);
    });
    
    // Обработчик кнопки экспорта отчёта
    const exportBtn = document.getElementById('exportHistoryReportBtn');
    if (exportBtn) {
      console.log('✅ [Popup] Кнопка экспорта отчёта найдена, добавляю обработчик');
      exportBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🖱️ [Popup] Клик по кнопке экспорта отчёта');
        try {
          await this.exportHistoryReport(testId, history);
        } catch (error) {
          console.error('❌ [Popup] Ошибка при экспорте отчёта:', error);
          alert(this.t('popup.alertExportError', {msg: error.message}));
        }
      });
    } else {
      console.error('❌ [Popup] Кнопка экспорта отчёта не найдена!');
    }
    
    // Закрытие по клику вне модального окна
    const modalOverlay = document.getElementById('historyModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          closeModal();
        }
      });
    }
  }

  async showHistoryAnalysis(testId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_TEST_HISTORY',
        testId: testId
      });

      if (response && response.success) {
        this.renderAnalysisModal(testId, response.analysis);
      } else {
        const err = response?.errorCode
          ? this.t('popup.' + response.errorCode)
          : (response?.error || this.t('common.unknownError'));
        alert(this.t('common.error') + ': ' + err);
      }
    } catch (error) {
      console.error('❌ Ошибка при анализе истории:', error);
      alert(this.t('popup.alertExportError', {msg: error.message}));
    }
  }

  renderAnalysisModal(testId, analysis) {
    const test = this.state.tests.find(t => t.id === testId);
    const testName = test?.name || this.t('common.test');

    // Группируем рекомендации по приоритету
    const recommendationsByPriority = {
      high: analysis.recommendations.filter(r => r.priority === 'high'),
      medium: analysis.recommendations.filter(r => r.priority === 'medium'),
      low: analysis.recommendations.filter(r => r.priority === 'low')
    };

    let recommendationsHTML = '';
    if (analysis.recommendations.length === 0) {
      recommendationsHTML = `<div class="empty-state">${this.t('popup.noRecommendations')}</div>`;
    } else {
      ['high', 'medium', 'low'].forEach(priority => {
        const recs = recommendationsByPriority[priority];
        if (recs.length > 0) {
          const priorityLabel = {
            high: this.t('popup.priorityHigh'),
            medium: this.t('popup.priorityMedium'),
            low: this.t('popup.priorityLow')
          }[priority];

          recommendationsHTML += `
            <div class="recommendations-group">
              <h4 style="margin-bottom: 12px; color: #333;">${priorityLabel}</h4>
              ${recs.map(rec => `
                <div class="recommendation-item recommendation-${rec.type}">
                  <div class="recommendation-header">
                    <span class="recommendation-type">${this.getRecommendationTypeIcon(rec.type)}</span>
                    <span class="recommendation-message"><strong>${this.t('popup.stepNumber', {n: rec.stepNumber})}:</strong> ${this.escapeHtml(rec.message)}</span>
                  </div>
                  <ul class="recommendation-suggestions">
                    ${rec.suggestions.map(sug => `<li>${this.escapeHtml(sug)}</li>`).join('')}
                  </ul>
                </div>
              `).join('')}
            </div>
          `;
        }
      });
    }

    let missingActionsHTML = '';
    if (analysis.missingActions.length === 0) {
      missingActionsHTML = `<div class="empty-state">${this.t('popup.noMissingActions')}</div>`;
    } else {
      missingActionsHTML = analysis.missingActions.map(action => `
        <div class="missing-action-item missing-action-${action.priority}">
          <div class="missing-action-header">
            <span class="missing-action-type">${this.getMissingActionIcon(action.type)}</span>
            <span class="missing-action-message">${this.escapeHtml(action.message)}</span>
          </div>
        </div>
      `).join('');
    }

    // Формируем статистику по шагам
    let stepStatsHTML = '';
    if (analysis.stepAnalysis.length > 0) {
      stepStatsHTML = `
        <div class="step-stats-table">
          <table>
            <thead>
              <tr>
                <th>${this.t('popup.stepCol')}</th>
                <th>${this.t('popup.actionCol')}</th>
                <th>${this.t('popup.avgTime')}</th>
                <th>${this.t('popup.minMax')}</th>
                <th>${this.t('popup.successRate')}</th>
                <th>${this.t('popup.errorCount')}</th>
              </tr>
            </thead>
            <tbody>
              ${analysis.stepAnalysis.map(step => `
                <tr class="step-stat-row ${step.successRate < 100 ? 'has-errors' : ''}">
                  <td><strong>${step.stepNumber}</strong></td>
                  <td>${this.getActionTypeLabel(step.actionType || step.type)}</td>
                  <td>${this.formatDuration(step.averageDuration)}</td>
                  <td>${this.formatDuration(step.minDuration)} / ${this.formatDuration(step.maxDuration)}</td>
                  <td>
                    <span class="success-rate ${step.successRate === 100 ? 'perfect' : step.successRate >= 70 ? 'good' : 'poor'}">
                      ${step.successRate.toFixed(1)}%
                    </span>
                  </td>
                  <td>${step.errorCount > 0 ? `<span class="error-count">${step.errorCount}</span>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const modalHTML = `
      <div class="modal-overlay" id="analysisModal">
        <div class="modal-content analysis-modal-content" style="max-width: 900px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header">
            <h3>${this.t('popup.analysisTitle', {name: this.escapeHtml(testName)})}</h3>
            <button class="modal-close" id="closeAnalysisModal">×</button>
          </div>
          <div class="modal-body analysis-modal-body" style="flex: 1; overflow-y: auto; min-height: 0;">
            <div class="analysis-summary">
              <div class="summary-item">
                <span class="summary-label">${this.t('popup.totalRuns')}</span>
                <span class="summary-value">${analysis.totalRuns}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">${this.t('popup.successfulRuns')}</span>
                <span class="summary-value success">${analysis.successfulRuns}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">${this.t('popup.failedRuns')}</span>
                <span class="summary-value error">${analysis.failedRuns}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">${this.t('popup.avgDuration')}</span>
                <span class="summary-value">${this.formatDuration(analysis.averageDuration)}</span>
              </div>
            </div>

            <div class="analysis-section">
              <h4 style="margin-top: 24px; margin-bottom: 12px; color: #333;">${this.t('popup.stepStats')}</h4>
              ${stepStatsHTML}
            </div>

            <div class="analysis-section">
              <h4 style="margin-top: 24px; margin-bottom: 12px; color: #333;">${this.t('popup.noRecommendations').split(' ')[0]} ${this.t('popup.noRecommendations').split(' ').slice(1).join(' ')}</h4>
              ${recommendationsHTML}
            </div>

            <div class="analysis-section">
              <h4 style="margin-top: 24px; margin-bottom: 12px; color: #333;">${this.t('popup.noMissingActions')}</h4>
              ${missingActionsHTML}
            </div>
          </div>
          <div class="modal-footer" style="flex-shrink: 0;">
            <button class="btn btn-secondary" id="closeAnalysisModalBtn">${this.t('common.close')}</button>
          </div>
        </div>
      </div>
    `;

    // Удаляем предыдущее модальное окно анализа, если есть
    const existingModal = document.getElementById('analysisModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Добавляем новое модальное окно
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Обработчики закрытия
    const closeModal = () => {
      const modal = document.getElementById('analysisModal');
      if (modal) modal.remove();
    };

    document.getElementById('closeAnalysisModal')?.addEventListener('click', closeModal);
    document.getElementById('closeAnalysisModalBtn')?.addEventListener('click', closeModal);
    
    // Закрытие по клику вне модального окна
    const modalOverlay = document.getElementById('analysisModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          closeModal();
        }
      });
    }
  }

  getRecommendationTypeIcon(type) {
    const icons = {
      'performance': '⚡',
      'stability': '🔄',
      'critical': '🚨',
      'variability': '📊'
    };
    return icons[type] || '💡';
  }

  getActionTypeIcon(type) {
    const icons = {
      'click': '🖱️',
      'dblclick': '🖱️',
      'input': '✏️',
      'change': '🔄',
      'scroll': '📜',
      'navigation': '🌐',
      'navigate': '🌐',
      'wait': '⏳',
      'keyboard': '⌨️',
      'api': '🌐',
      'variable': '📝',
      'setVariable': '📦',
      'assertion': '✅',
      'ai': '🤖',
      'cloud': '☁️',
      'suite': '📦',
      'javascript': '📜',
      'screenshot': '📸',
      'cookie': '🍪',
      'mobile': '📱',
      'hover': '👆',
      'focus': '🎯',
      'blur': '↩️',
      'clear': '🧹',
      'upload': '📤',
      'condition': '🔀',
      'loop': '🔁'
    };
    return icons[type] || '📌';
  }

  getMissingActionIcon(type) {
    return this.getActionTypeIcon(type);
  }

  formatDuration(ms) {
    if (!ms) return '0' + this.t('common.ms');
    if (ms < 1000) return `${ms}` + this.t('common.ms');
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}` + this.t('common.sec');
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  getActionTypeLabel(type) {
    if (type == null || type === '') return '—';
    const labels = {
      'click': this.t('editor.actionTypes.click'),
      'dblclick': this.t('editor.actionTypes.dblclick'),
      'input': this.t('editor.actionTypes.input'),
      'change': this.t('editor.actionTypes.change'),
      'scroll': this.t('editor.actionTypes.scroll'),
      'navigation': this.t('editor.actionTypes.navigate'),
      'navigate': this.t('editor.actionTypes.navigate'),
      'wait': this.t('editor.actionTypes.wait'),
      'keyboard': this.t('editor.actionTypes.keyboard'),
      'api': this.t('editor.actionTypes.api'),
      'variable': this.t('editor.actionTypes.variable'),
      'setVariable': this.t('editor.actionTypes.setVariable'),
      'assertion': this.t('editor.actionTypes.assertion') || this.t('editor.actionTypes.assert'),
      'ai': this.t('editor.actionTypes.ai'),
      'cloud': this.t('editor.actionTypes.cloud'),
      'suite': this.t('editor.actionTypes.suite'),
      'javascript': this.t('editor.actionTypes.javascript'),
      'screenshot': this.t('editor.actionTypes.screenshot'),
      'cookie': this.t('editor.actionTypes.cookie'),
      'mobile': this.t('editor.actionTypes.mobile'),
      'hover': this.t('editor.actionTypes.hover'),
      'focus': this.t('editor.actionTypes.focus'),
      'blur': this.t('editor.actionTypes.blur'),
      'clear': this.t('editor.actionTypes.clear'),
      'upload': this.t('editor.actionTypes.upload') || this.t('editor.actionTypes.fileUpload'),
      'condition': this.t('editor.actionTypes.condition'),
      'loop': this.t('editor.actionTypes.loop')
    };
    return labels[type] || (typeof type === 'string' ? type : '—');
  }

  async deleteTest(testId) {
    if (!confirm(this.t('editor.deleteConfirm'))) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_TEST',
        testId: testId
      });

      if (response.success) {
        await this.loadTests();
      } else {
        alert(this.t('common.error'));
      }
    } catch (error) {
      console.error('Error deleting test:', error);
      alert(this.t('common.error'));
    }
  }

  async forceStop() {
    try {
      // Останавливаем запись или воспроизведение
      if (this.state.isRecording) {
        await this.stopRecording();
      }
      
      if (this.state.isPlaying) {
        const response = await chrome.runtime.sendMessage({ type: 'STOP_PLAYING' });
        if (response.success) {
          this.state.isPlaying = false;
          this.state.isPaused = false;
          this.state.currentTestId = null;
          this.updateUI();
          this.renderTests(); // Обновляем список тестов
        }
      }
    } catch (error) {
      console.error('Error force stopping:', error);
      alert(this.t('common.error'));
    }
  }

  updateUI() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const startBtn = document.getElementById('startRecording');
    const stopBtn = document.getElementById('stopRecording');
    const forceStopBtn = document.getElementById('forceStop');
    const pauseBtn = document.getElementById('pausePlayback');
    const resumeBtn = document.getElementById('resumePlayback');
    const stepProgress = document.getElementById('stepProgress');
    const stepText = document.getElementById('stepText');
    const stepType = document.getElementById('stepType');
    const stepBarFill = document.getElementById('stepBarFill');

    if (this.state.isRecording) {
      statusIndicator.className = 'status-indicator recording';
      statusText.textContent = this.t('popup.recording');
      startBtn.disabled = true;
      stopBtn.disabled = false;
      stopBtn.style.display = 'inline-block'; // Показываем кнопку остановки записи
      forceStopBtn.disabled = false;
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (resumeBtn) resumeBtn.style.display = 'none';
      stepProgress.style.display = 'none';
    } else if (this.state.isPlaying) {
      statusIndicator.className = 'status-indicator playing';
      statusText.textContent = this.t('popup.playing');
      startBtn.disabled = true;
      stopBtn.disabled = true;
      stopBtn.style.display = 'none'; // Скрываем кнопку остановки записи во время воспроизведения
      forceStopBtn.disabled = false;
      
      // Показываем кнопку паузы или возобновления вместо кнопки остановки записи
      if (this.state.isPaused) {
        if (pauseBtn) {
          pauseBtn.style.display = 'none';
          pauseBtn.disabled = true;
        }
        if (resumeBtn) {
          resumeBtn.style.display = 'inline-block';
          resumeBtn.disabled = false;
        }
      } else {
        if (pauseBtn) {
          pauseBtn.style.display = 'inline-block';
          pauseBtn.disabled = false;
        }
        if (resumeBtn) {
          resumeBtn.style.display = 'none';
          resumeBtn.disabled = true;
        }
      }
      
      // Показываем прогресс шагов
      if (this.state.totalSteps > 0) {
        stepProgress.style.display = 'block';
        
        // Подсчитываем количество завершенных шагов
        const completedStepsCount = this.state.completedSteps 
          ? this.state.completedSteps.filter(s => s.success !== false).length 
          : 0;
        
        // Используем максимальное значение между текущим шагом и количеством завершенных
        const displayedStep = Math.max(this.state.currentStep, completedStepsCount);
        
        stepText.textContent = this.t('popup.stepProgress', {current: displayedStep, total: this.state.totalSteps});
        
        if (this.state.stepType) {
          const icon = this.getActionTypeIcon(this.state.stepType);
          const label = this.getActionTypeLabel(this.state.stepType);
          stepType.textContent = label !== '—' ? `${icon} ${label}` : this.state.stepType;
          stepType.style.display = 'inline-block';
        } else {
          stepType.style.display = 'none';
        }
        
        // Обновляем прогресс-бар на основе завершенных шагов
        const progress = this.state.totalSteps > 0 
          ? (displayedStep / this.state.totalSteps) * 100 
          : 0;
        stepBarFill.style.width = `${Math.min(progress, 100)}%`;
      } else {
        stepProgress.style.display = 'none';
      }
    } else {
      statusIndicator.className = 'status-indicator';
      statusText.textContent = this.t('popup.ready');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      stopBtn.style.display = 'inline-block'; // Показываем кнопку остановки записи в обычном состоянии
      forceStopBtn.disabled = true;
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (resumeBtn) resumeBtn.style.display = 'none';
      stepProgress.style.display = 'none';
      this.state.currentStep = 0;
      this.state.totalSteps = 0;
      this.state.stepType = null;
      this.state.completedSteps = []; // Очищаем завершенные шаги
    }
  }

  async renderTests() {
    const testsList = document.getElementById('testsList');
    testsList.classList.remove('skeleton');

    if (this.state.testsLoadState === 'loading') {
      testsList.innerHTML = `
        <div class="skeleton-card"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>
        <div class="skeleton-card"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>
        <div class="skeleton-card"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>
      `;
      testsList.classList.add('skeleton');
      this.updateUpgradeBanner(false);
      return;
    }

    if (this.state.testsLoadState === 'error') {
      const message = this.state.testsLoadError || this.t('popup.loadTestsFailed');
      testsList.innerHTML = `
        <div class="error-block">
          <div class="error-icon">⚠️</div>
          <div class="error-text">${this.escapeHtml(message)}</div>
          <button type="button" class="btn-retry" data-action="retryTests">${this.t('common.retry')}</button>
        </div>
      `;
      this.updateUpgradeBanner(false);
      return;
    }

    if (this.state.tests.length === 0) {
      testsList.innerHTML = '<div class="empty-state">' + this.t('popup.noTests') + '</div>';
      this.updateUpgradeBanner(false);
      return;
    }

    // Сортируем тесты по дате обновления (свежие вверху)
    const sortedTests = [...this.state.tests].sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA; // По убыванию (свежие вверху)
    });

    // Рендерим тесты без проверки скриншотов (проверка будет асинхронной)
    testsList.innerHTML = sortedTests.map((test) => {
      // Временно показываем кнопку, проверка будет выполнена асинхронно
      const testId = test.id;
      const actionsCount = test.actions?.length || 0;
      const visibleActionsCount = test.actions?.filter(a => !a.hidden).length || actionsCount;
      const dateLocale = window.i18n?.getLang() === 'ru' ? 'ru-RU' : 'en-US';
      const createdDate = new Date(test.createdAt).toLocaleString(dateLocale);
      const updatedDate = new Date(test.updatedAt).toLocaleString(dateLocale);
      
      // Проверяем наличие оптимизации
      const isOptimized = test.optimization?.optimizedAvailable === true;
      const optimizationBadge = isOptimized ? `
        <span class="test-optimization-badge" title="${this.t('popup.optimized')}">
          ${this.t('popup.optimized')}
        </span>
      ` : '';

      // Проверяем наличие маркеров записи
      const recordMarkers = test.actions?.filter(a => a.recordMarker === true) || [];
      const markersCount = recordMarkers.length;
      const displayMarkersCount = Math.min(markersCount, 3); // Максимум 3 точки
      const recordMarkersIndicator = markersCount > 0 ? `
        <span class="test-record-markers" title="${markersCount > 1 ? this.t('popup.recordMarkersPlural', {count: markersCount}) : this.t('popup.recordMarkers')}">
          ${'<span class="record-marker-dot"></span>'.repeat(displayMarkersCount)}
        </span>
      ` : '';

      return `
        <div class="test-item" data-test-id="${this.escapeHtml(test.id)}">
          <div class="test-header">
            <div class="test-name">${this.escapeHtml(test.name)}</div>
            <div class="test-badges">
              ${recordMarkersIndicator}
              ${optimizationBadge}
            </div>
          </div>
          <div class="test-meta">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                ${actionsCount !== visibleActionsCount ? this.t('popup.actionsCountFull', {visible: visibleActionsCount, total: actionsCount}) : this.t('popup.actionsCount', {visible: visibleActionsCount})} | ${this.t('popup.created')}: ${createdDate}<br>
                ${this.t('popup.updated')}: ${updatedDate}
              </div>
              <div class="test-meta-actions" data-test-id="${this.escapeHtml(test.id)}" style="display: flex; gap: 4px;">
                <button class="btn-icon screenshots-btn" data-action="screenshots" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.screenshotsBtn')}" style="display: none;">
                  📸
                </button>
                <button class="btn-icon history-btn" data-action="history" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.historyBtn')}">
                  📊
                </button>
              </div>
            </div>
          </div>
          <div class="test-actions">
            ${this.state.isPlaying && this.state.currentTestId === test.id && !this.state.isPaused ? `
              <button class="btn btn-warning" data-action="pause" data-test-id="${this.escapeHtml(test.id)}">
                <span class="test-btn-icon">⏸️</span><span class="test-btn-text">${this.t('popup.pause')}</span>
              </button>
            ` : this.state.isPlaying && this.state.currentTestId === test.id && this.state.isPaused ? `
              <button class="btn btn-success" data-action="resume" data-test-id="${this.escapeHtml(test.id)}">
                <span class="test-btn-icon">▶️</span><span class="test-btn-text">${this.t('popup.resume')}</span>
              </button>
            ` : `
              <button class="btn btn-secondary" data-action="play" data-test-id="${this.escapeHtml(test.id)}">
                <span class="test-btn-icon">▶️</span><span class="test-btn-text">${this.t('popup.playTest')}</span>
              </button>
            `}
            <button class="btn btn-warning" data-action="edit" data-test-id="${this.escapeHtml(test.id)}">
              <span class="test-btn-icon">✏️</span><span class="test-btn-text">${this.t('popup.editTest')}</span>
            </button>
            <button class="btn btn-danger" data-action="delete" data-test-id="${this.escapeHtml(test.id)}">
              <span class="test-btn-icon">🗑️</span><span class="test-btn-text">${this.t('popup.deleteTest')}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.updateUpgradeBanner(this.state.limitsEnabled && this.state.tests.length >= (this.state.freeTierLimit || 10));
    
    // Асинхронно проверяем наличие скриншотов и показываем кнопки
    // Используем Promise.all для параллельной проверки всех тестов
    Promise.all(
      sortedTests.map(async (test) => {
        try {
          const hasScreenshots = await this.checkTestHasScreenshots(test.id);
          const actionsContainer = document.querySelector(`.test-meta-actions[data-test-id="${test.id}"]`);
          if (actionsContainer) {
            const screenshotsBtn = actionsContainer.querySelector('.screenshots-btn');
            if (screenshotsBtn) {
              if (hasScreenshots) {
                screenshotsBtn.style.display = 'block';
                screenshotsBtn.classList.remove('hidden');
              } else {
                screenshotsBtn.style.display = 'none';
                screenshotsBtn.classList.add('hidden');
              }
            }
          }
        } catch (error) {
          console.error(`Ошибка при проверке скриншотов для теста ${test.id}:`, error);
        }
      })
    ).catch(error => {
      console.error('Ошибка при проверке скриншотов:', error);
    });
    
    // Обработчики уже привязаны в init() через делегирование событий
  }

  escapeHtml(text) {
    // Используем глобальную функцию из shared/utils.js если доступна
    if (window.Utils && typeof window.Utils.escapeHtml === 'function') {
      return window.Utils.escapeHtml(text);
    }
    // Fallback для обратной совместимости
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  updateUpgradeBanner(show) {
    const banner = document.getElementById('upgradeBanner');
    if (!banner) return;
    const limit = this.state.freeTierLimit || 10;
    if (show) {
      banner.innerHTML = `
        <div class="upgrade-banner-inner">
          <span class="upgrade-banner-icon">⚠️</span>
          <span class="upgrade-banner-text">${this.t('popup.upgradeBannerMsg', {limit: limit})}</span>
          <a href="${this.escapeHtml(this.UPGRADE_URL)}" target="_blank" rel="noopener" class="btn btn-small btn-primary" id="upgradeBannerBtn">${this.t('popup.upgradePlan')}</a>
        </div>
      `;
      banner.classList.remove('hidden');
      banner.setAttribute('aria-hidden', 'false');
    } else {
      banner.innerHTML = '';
      banner.classList.add('hidden');
      banner.setAttribute('aria-hidden', 'true');
    }
  }

  showUpgradeModal(limit) {
    const modal = document.getElementById('upgradeModal');
    const messageEl = document.getElementById('upgradeModalMessage');
    const linkEl = document.getElementById('upgradeModalBtn');
    if (!modal || !messageEl || !linkEl) return;
    const lim = limit || this.state.freeTierLimit || 10;
    messageEl.textContent = this.t('popup.freeTierLimitMsg', {limit: lim});
    linkEl.href = this.UPGRADE_URL;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  hideUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  showImportDialog() {
    // Сразу открываем диалог выбора файла
    const importFileInput = document.getElementById('importFileInput');
    if (!importFileInput) {
      console.error('❌ Элемент importFileInput не найден');
      alert(this.t('popup.alertFileInputNotFound'));
      this.showImportJsonDialog();
      return;
    }

    console.log('📂 Открываем диалог выбора файла...');
    try {
      // Открываем диалог выбора файла операционной системы
      importFileInput.click();
      console.log('✅ Диалог выбора файла открыт');
    } catch (error) {
      console.error('❌ Ошибка при открытии диалога выбора файла:', error);
      alert(this.t('popup.alertFileDialogFailed'));
      this.showImportJsonDialog();
    }
  }

  showImportJsonDialog() {
    const testJson = prompt(
      this.t('popup.pasteJsonPrompt'),
      ''
    );

    if (!testJson || testJson.trim() === '') {
      // Показываем диалог с готовым тестом
      this.showQuickTestDialog();
      return;
    }

    try {
      const testData = JSON.parse(testJson);
      
      // Проверяем структуру
      if (!testData.name || !testData.actions) {
        throw new Error(this.t('popup.alertInvalidTestFormat'));
      }

      // Устанавливаем ID если его нет
      if (!testData.id) {
        testData.id = 'imported-' + Date.now();
      }

      // Устанавливаем даты
      if (!testData.createdAt) {
        testData.createdAt = new Date().toISOString();
      }
      testData.updatedAt = new Date().toISOString();

      // Импортируем тест
      this.importTest(testData);
    } catch (error) {
      alert(this.t('popup.alertImportError', {msg: error.message}));
    }
  }

  async importFromFile(file) {
    try {
      // Проверяем тип файла
      if (!file.name.endsWith('.json')) {
        const proceed = confirm(
          this.t('popup.fileNotJson')
        );
        if (!proceed) {
          return;
        }
      }

      // Читаем содержимое файла
      const fileContent = await file.text();
      
      // Парсим JSON
      const testData = JSON.parse(fileContent);
      
      // Проверяем структуру
      if (!testData.name || !testData.actions) {
        throw new Error('Неверный формат теста. Нужны поля: name, actions');
      }

      // Устанавливаем ID если его нет
      if (!testData.id) {
        testData.id = 'imported-' + Date.now();
      }

      // Сохраняем оригинальные даты из файла, если они есть
      if (!testData.createdAt) {
        testData.createdAt = new Date().toISOString();
      }
      // Обновляем дату изменения при импорте
      testData.updatedAt = new Date().toISOString();

      // Импортируем тест
      await this.importTest(testData);
      
      console.log('✅ Тест успешно импортирован из файла:', file.name);
    } catch (error) {
      console.error('❌ Ошибка при импорте из файла:', error);
      
      // Предлагаем попробовать вставить JSON вручную
      const tryManual = confirm(
        this.t('popup.importFileError', {msg: error.message})
      );
      
      if (tryManual) {
        this.showImportJsonDialog();
      }
    }
  }

  showQuickTestDialog() {
    const createYaRuTest = confirm(
      this.t('popup.createDemoTest')
    );

    if (createYaRuTest) {
      this.createYaRuTest();
    }
  }

  async createYaRuTest() {
    const testData = {
      id: 'test-ya-ru-search-' + Date.now(),
      name: "Поиск 'Приколы городка' на ya.ru",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actions: [
        {
          type: 'navigation',
          url: 'https://ya.ru',
          timestamp: Date.now()
        },
        {
          type: 'input',
          selector: {
            type: 'id',
            value: 'text',
            selector: '#text',
            priority: 4
          },
          value: 'Приколы городка',
          element: {
            tag: 'input',
            type: 'text',
            name: 'text',
            placeholder: 'Найдётся всё'
          },
          timestamp: Date.now() + 1000,
          url: 'https://ya.ru'
        },
        {
          type: 'click',
          selector: {
            type: 'class',
            value: 'search3__button',
            selector: '.search3__button',
            priority: 8
          },
          element: {
            tag: 'button',
            text: 'Найти'
          },
          timestamp: Date.now() + 2000,
          url: 'https://ya.ru'
        },
        {
          type: 'click',
          selector: {
            type: 'tag-text',
            value: {
              tag: 'a',
              text: 'Приколы городка'
            },
            selector: 'a',
            text: 'Приколы городка',
            priority: 9
          },
          element: {
            tag: 'a',
            text: 'Приколы городка'
          },
          timestamp: Date.now() + 3000,
          url: 'https://yandex.ru/search/?text=Приколы+городка'
        }
      ]
    };

    await this.importTest(testData);
  }

  async importTest(testData) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_TEST',
        test: testData
      });

      if (response.success) {
        alert(this.t('popup.alertImportSuccess', {name: testData.name}));
        await this.loadTests(); // Обновляем список
      } else {
        if (response?.error === 'FREE_TIER_LIMIT') {
          this.showUpgradeModal(response.limit);
          return;
        }
        alert(this.t('popup.alertImportFailed'));
      }
    } catch (error) {
      console.error('Error importing test:', error);
      alert(this.t('popup.alertImportFailed') + ': ' + error.message);
    }
  }

  async showAdvancedSelectorSearch() {
    try {
      // Получаем активную вкладку
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        alert('Could not get active tab');
        return;
      }

      // Открываем страницу анализа селекторов
      const analyzerUrl = chrome.runtime.getURL('selector-analyzer/analyzer.html') + '?tabId=' + tab.id;
      chrome.tabs.create({ url: analyzerUrl });
    } catch (error) {
      console.error('Error opening selector analyzer:', error);
      alert(this.t('popup.selectorAnalyzerError', {msg: error.message}));
    }
  }

  openFullscreen() {
    try {
      const fullscreenUrl = chrome.runtime.getURL('popup/popup-fullscreen.html');
      chrome.windows.create({
        url: fullscreenUrl,
        type: 'normal',
        state: 'maximized', // Открываем в максимизированном режиме
        focused: true
      });
    } catch (error) {
      console.error('❌ Ошибка при открытии полноэкранного режима:', error);
      alert(this.t('popup.fullscreenError', {msg: error.message}));
    }
  }

  /**
   * Загрузка настроек плагина
   */
  async loadPluginSettings() {
    try {
      const result = await chrome.storage.local.get('pluginSettings');
      if (result.pluginSettings) {
        this.pluginSettings = result.pluginSettings;
        console.log('✅ Настройки загружены:', this.pluginSettings);
      }
      this.updateAnalyticsDashboardButton();
    } catch (error) {
      console.error('❌ Ошибка загрузки настроек:', error);
    }
  }

  /**
   * Показывает или скрывает кнопку перехода на дашборд аналитики в зависимости от настройки.
   */
  updateAnalyticsDashboardButton() {
    const btn = document.getElementById('analyticsDashboardButton');
    if (!btn) return;
    const enabled = this.pluginSettings?.analytics?.enabled === true;
    const url = chrome.runtime.getURL('analytics/analytics-dashboard.html');
    btn.href = url;
    if (enabled) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
  
  /**
   * Открытие страницы настроек
   * @param {string} anchor - Якорь для перехода к конкретной секции (например, '#ai-settings')
   */
  openSettings(anchor = '') {
    const url = chrome.runtime.getURL('settings/settings.html' + anchor);
    chrome.tabs.create({ url });
  }

  async injectSelectorInspectorScripts(tabId) {
    // Простая логика - всегда пытаемся вставить скрипты, без проверок и alert'ов
    try {
      console.log('📦 [Popup] Вставляю скрипты инспектора для вкладки:', tabId);
      
      // Пытаемся вставить скрипты
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'libs/finder-lite.js',
          'libs/finder.js',
          'libs/unique-selector-lite.js',
          'libs/unique-selector.js',
          'libs/optimal-select-lite.js',
          'libs/optimal-select.js',
          'content/selector-engine.js',
          'content/selector-inspector.js'
        ]
      });
      
      console.log('✅ [Popup] Скрипты вставлены');
      
      // Ждем инициализации
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Пытаемся активировать инспектор с несколькими попытками
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'TOGGLE_SELECTOR_INSPECTOR'
          });
          console.log('✅ [Popup] Инспектор активирован');
          return;
        } catch (err) {
          if (attempt < 5) {
            await new Promise(resolve => setTimeout(resolve, 300 * attempt));
          } else {
            // Последняя попытка не удалась - просто логируем
            console.warn('⚠️ [Popup] Не удалось активировать инспектор после всех попыток');
          }
        }
      }
    } catch (error) {
      // Игнорируем все ошибки - просто логируем
      console.warn('⚠️ [Popup] Ошибка при вставке скриптов:', error);
    }
  }

  async openSelectorInspector() {
    // Простая логика - всегда пытаемся открыть инспектор, без проверок и блокировок
    try {
      // Получаем активную вкладку
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        console.warn('⚠️ [Popup] Не удалось получить активную вкладку');
        return;
      }

      console.log('🔍 [Popup] Открываю инспектор для вкладки:', tab.id, tab.url);

      // Закрываем popup сразу, чтобы он не мешал
      try {
        await chrome.runtime.sendMessage({
          type: 'CLOSE_POPUP_IF_OPEN'
        });
      } catch (err) {
        // Игнорируем ошибки
      }
      
      // Всегда пытаемся активировать инспектор
      const activateInspector = async () => {
        // Сначала пытаемся отправить сообщение напрямую
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_SELECTOR_INSPECTOR'
          });
          console.log('✅ [Popup] Инспектор активирован');
          return;
        } catch (err) {
          // Если не получилось, пытаемся вставить скрипты
          console.log('⚠️ [Popup] Пытаюсь вставить скрипты...');
        }
        
        // Всегда пытаемся вставить скрипты, даже если первая попытка не удалась
        try {
          await this.injectSelectorInspectorScripts(tab.id);
        } catch (injectErr) {
          // Игнорируем ошибки - просто логируем
          console.warn('⚠️ [Popup] Не удалось вставить скрипты:', injectErr);
        }
      };
      
      // Сначала активируем инспектор, затем закрываем popup
      try {
        await activateInspector();
      } catch (err) {
        // Игнорируем все ошибки - просто логируем
        console.warn('⚠️ [Popup] Ошибка при активации:', err);
      }

      // Закрываем popup локально после активации
      const closePopup = () => {
        try {
          window.close();
        } catch (e) {
          // Игнорируем ошибки
        }
      };
      setTimeout(closePopup, 50);
    } catch (error) {
      // Игнорируем все ошибки - просто логируем
      console.warn('⚠️ [Popup] Ошибка при открытии инспектора:', error);
    }
  }
  
  /**
   * Слушатель изменений настроек
   */
  setupSettingsListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pluginSettings) {
        this.pluginSettings = changes.pluginSettings.newValue;
        this.updateAnalyticsDashboardButton();
        this.checkAutotestsEnabled();
        console.log('✅ Настройки обновлены:', this.pluginSettings);
      }
    });
  }

  /**
   * Проверяет, включены ли автотесты, и скрывает интерфейс, если отключены
   */
  async checkAutotestsEnabled() {
    try {
      const result = await chrome.storage.local.get('pluginSettings');
      const settings = result.pluginSettings;
      const autotestsEnabled = settings?.autotests?.enabled !== false; // По умолчанию true
      
      const controls = document.querySelector('.controls');
      const testsSection = document.querySelector('.tests-section');
      
      if (!autotestsEnabled) {
        // Скрываем интерфейс
        if (controls) controls.style.display = 'none';
        if (testsSection) testsSection.style.display = 'none';
        
        // Показываем сообщение
        const container = document.querySelector('.container');
        if (container && !document.getElementById('autotestsDisabledMessage')) {
          const message = document.createElement('div');
          message.id = 'autotestsDisabledMessage';
          message.style.cssText = `
            padding: 40px 20px;
            text-align: center;
            color: #666;
          `;
          message.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">🚫</div>
            <h2 style="font-size: 18px; margin-bottom: 8px; color: #333;">${this.t('popup.autotestsDisabledTitle')}</h2>
            <p style="font-size: 14px; margin-bottom: 16px;">${this.t('popup.autotestsDisabledMsg')}</p>
            <button id="openSettingsFromDisabled" class="btn btn-primary" style="margin-top: 12px;">
              ${this.t('popup.autotestsOpenSettings')}
            </button>
          `;
          container.insertBefore(message, container.firstChild.nextSibling);
          
          // Обработчик кнопки открытия настроек
          document.getElementById('openSettingsFromDisabled').addEventListener('click', () => {
            this.openSettings();
          });
        }
      } else {
        // Показываем интерфейс
        if (controls) controls.style.display = '';
        if (testsSection) testsSection.style.display = '';
        
        // Удаляем сообщение, если есть
        const message = document.getElementById('autotestsDisabledMessage');
        if (message) message.remove();
      }
    } catch (error) {
      console.error('❌ Ошибка при проверке настройки автотестов:', error);
    }
  }

  /**
   * Ожидает загрузки ExcelExporter (теперь не нужен, т.к. скрипт загружается синхронно)
   */
  async waitForExcelExporter(maxWait = 5000) {
    // ExcelExporter теперь загружается синхронно через script тег
    return !!window.ExcelExporter;
  }

  /**
   * Очищает все скриншоты из истории прогонов для освобождения места
   */
  async clearAllScreenshots() {
    try {
      console.log('🧹 Начинаю очистку всех скриншотов из истории прогонов...');
      
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_ALL_SCREENSHOTS'
      });
      
      if (response && response.success) {
        const clearedCount = response.clearedCount || 0;
        console.log(`✅ Очищено скриншотов из ${clearedCount} прогонов`);
        alert(this.t('popup.alertScreenshotsCleared', {count: clearedCount}));
        await this.updateStorageInfo();
      } else {
        console.error('❌ Ошибка при очистке скриншотов:', response?.error);
        alert(this.t('popup.alertScreenshotsClearError', {msg: response?.error || this.t('common.unknownError')}));
      }
    } catch (error) {
      console.error('❌ Ошибка при очистке скриншотов:', error);
      alert(this.t('popup.alertScreenshotsClearError', {msg: error.message}));
    }
  }

  /**
   * Инициализирует индикатор памяти
   */
  initStorageIndicator() {
    const toggle = document.getElementById('storageToggle');
    const clearHistoryBtn = document.getElementById('clearHistory');
    const clearScreenshotsBtn = document.getElementById('clearScreenshots');
    const clearFilesBtn = document.getElementById('clearFiles');
    const clearAllBtn = document.getElementById('clearAllData');

    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleStorageDetails();
      });
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearHistory();
      });
    }

    if (clearScreenshotsBtn) {
      clearScreenshotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllScreenshots();
      });
    }

    if (clearFilesBtn) {
      clearFilesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearFiles();
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllData();
      });
    }

    // Обновляем информацию о памяти при инициализации
    this.updateStorageInfo();
  }

  toggleStorageDetails() {
    const details = document.getElementById('storageDetails');
    const toggle = document.getElementById('storageToggle');
    
    if (details && toggle) {
      details.classList.toggle('show');
      toggle.classList.toggle('expanded');
    }
  }

  async updateStorageInfo() {
    try {
      // Получаем все данные из storage
      const data = await chrome.storage.local.get(null);
      
      // Считаем размеры
      const sizes = {
        tests: 0,
        history: 0,
        variables: 0,
        settings: 0,
        screenshots: 0,
        files: 0,
        other: 0
      };

      for (const [key, value] of Object.entries(data)) {
        const size = new Blob([JSON.stringify(value)]).size;
        
        if (key === 'tests' || key.startsWith('test_')) {
          sizes.tests += size;
        } else if (key === 'testHistory' || key.includes('history')) {
          sizes.history += size;
          // Подсчитываем скриншоты в истории
          if (value && Array.isArray(value)) {
            for (const run of value) {
              if (run.steps) {
                for (const step of run.steps) {
                  if (step.screenshot) sizes.screenshots += new Blob([step.screenshot]).size;
                  if (step.screenshotComparison) sizes.screenshots += new Blob([JSON.stringify(step.screenshotComparison)]).size;
                }
              }
            }
          }
        } else if (key === 'globalVariables' || key.includes('variable')) {
          sizes.variables += size;
        } else if (key.includes('settings') || key.includes('config') || key.includes('preferences')) {
          sizes.settings += size;
          // Подсчитываем файлы в настройках
          if (value && value.files && value.files.uploaded) {
            for (const file of value.files.uploaded) {
              if (file.data) sizes.files += new Blob([file.data]).size;
            }
          }
        } else {
          sizes.other += size;
        }
      }

      const totalSize = Object.values(sizes).reduce((a, b) => a + b, 0);
      
      // Chrome storage.local limit = 10MB для расширений без unlimitedStorage
      // С unlimitedStorage - фактически без ограничений, но показываем относительно 10MB
      const maxSize = 10 * 1024 * 1024; // 10MB
      const usagePercent = (totalSize / maxSize) * 100;

      // Обновляем UI
      this.renderStorageIndicator(totalSize, usagePercent, sizes);
    } catch (error) {
      console.error('Ошибка при получении информации о памяти:', error);
    }
  }

  renderStorageIndicator(totalSize, usagePercent, sizes) {
    const valueEl = document.getElementById('storageValue');
    const barFillEl = document.getElementById('storageBarFill');
    const testsSizeEl = document.getElementById('testsSize');
    const historySizeEl = document.getElementById('historySize');
    const variablesSizeEl = document.getElementById('variablesSize');
    const settingsSizeEl = document.getElementById('settingsSize');
    const screenshotsSizeEl = document.getElementById('screenshotsSize');
    const filesSizeEl = document.getElementById('filesSize');

    if (valueEl) {
      valueEl.textContent = this.formatBytes(totalSize);
      valueEl.className = 'storage-value';
      if (usagePercent > 80) {
        valueEl.classList.add('danger');
      } else if (usagePercent > 50) {
        valueEl.classList.add('warning');
      }
    }

    if (barFillEl) {
      barFillEl.style.width = Math.min(usagePercent, 100) + '%';
      barFillEl.className = 'storage-bar-fill';
      if (usagePercent > 80) {
        barFillEl.classList.add('high');
      } else if (usagePercent > 50) {
        barFillEl.classList.add('medium');
      } else {
        barFillEl.classList.add('low');
      }
    }

    if (testsSizeEl) testsSizeEl.textContent = this.formatBytes(sizes.tests);
    if (historySizeEl) historySizeEl.textContent = this.formatBytes(sizes.history);
    if (variablesSizeEl) variablesSizeEl.textContent = this.formatBytes(sizes.variables);
    if (settingsSizeEl) settingsSizeEl.textContent = this.formatBytes(sizes.settings + sizes.other);
    if (screenshotsSizeEl) screenshotsSizeEl.textContent = this.formatBytes(sizes.screenshots);
    if (filesSizeEl) filesSizeEl.textContent = this.formatBytes(sizes.files);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async clearHistory() {
    if (!confirm(this.t('popup.confirmClearHistory'))) {
      return;
    }

    try {
      await chrome.storage.local.remove('testHistory');
      
      // Также отправляем сообщение в background для очистки в памяти
      await chrome.runtime.sendMessage({ type: 'CLEAR_TEST_HISTORY' });
      
      await this.updateStorageInfo();
      alert(this.t('popup.alertHistoryCleared'));
    } catch (error) {
      console.error('Ошибка при очистке истории:', error);
      alert(this.t('common.error') + ': ' + error.message);
    }
  }

  async clearFiles() {
    if (!confirm(this.t('popup.confirmClearFiles'))) {
      return;
    }

    try {
      const result = await chrome.storage.local.get('pluginSettings');
      const settings = result.pluginSettings || {};
      
      if (settings.files && settings.files.uploaded) {
        settings.files.uploaded = [];
        await chrome.storage.local.set({ pluginSettings: settings });
      }
      
      await this.updateStorageInfo();
      alert(this.t('popup.alertFilesCleared'));
    } catch (error) {
      console.error('Ошибка при очистке файлов:', error);
      alert(this.t('common.error') + ': ' + error.message);
    }
  }

  async clearAllData() {
    if (!confirm(this.t('popup.confirmClearAll'))) {
      return;
    }

    // Двойное подтверждение для опасного действия
    if (!confirm(this.t('popup.confirmClearAllSecond'))) {
      return;
    }

    try {
      await chrome.storage.local.clear();
      
      // Перезагружаем UI
      this.state.tests = [];
      this.updateUI();
      await this.loadTests();
      await this.updateStorageInfo();
      
      alert(this.t('popup.alertAllDataCleared'));
    } catch (error) {
      console.error('Ошибка при очистке данных:', error);
      alert(this.t('common.error') + ': ' + error.message);
    }
  }

  /**
   * Экспортирует отчёт о тестировании в Excel на основе истории прогонов
   */
  async exportHistoryReport(testId, history) {
    try {
      console.log('📊 [ExcelExport] Начинаю экспорт отчёта о тестировании...');
      console.log('📊 [ExcelExport] testId:', testId);
      console.log('📊 [ExcelExport] history:', history);
      
      // Проверяем наличие ExcelExporter и ждем, если нужно
      if (!window.ExcelExporter) {
        console.log('⏳ [ExcelExport] ExcelExporter не найден, ожидаю загрузку...');
        const loaded = await this.waitForExcelExporter(3000);
        if (!loaded) {
          console.error('❌ [ExcelExport] window.ExcelExporter не найден после ожидания');
          console.error('❌ [ExcelExport] Проверьте, что файл excel-export/excel-export.js существует и доступен');
          alert(this.t('popup.alertExportModuleNotLoaded'));
          return;
        }
      }
      console.log('✅ [ExcelExport] ExcelExporter найден');
      
      // Получаем тест
      console.log('📊 [ExcelExport] Получаю данные теста из background...');
      const testResponse = await chrome.runtime.sendMessage({
        type: 'GET_TEST',
        testId: testId
      });
      
      console.log('📊 [ExcelExport] Ответ от background:', testResponse);
      
      if (!testResponse || !testResponse.success || !testResponse.test) {
        console.error('❌ [ExcelExport] Не удалось получить тест:', testResponse);
        alert(this.t('popup.alertNoTestData'));
        return;
      }
      
      const test = testResponse.test;
      console.log('✅ [ExcelExport] Тест получен:', test.name, 'действий:', test.actions?.length);
      
      const exporter = new window.ExcelExporter();
      await exporter.init();
      console.log('✅ [ExcelExporter] Инициализирован');
      
      // Используем последний прогон из истории для экспорта (самый свежий)
      if (history && history.length > 0) {
        // Сортируем по дате (новые вверху)
        const sortedHistory = [...history].sort((a, b) => {
          const dateA = new Date(a.startTime).getTime();
          const dateB = new Date(b.startTime).getTime();
          return dateB - dateA;
        });
        
        const latestRun = sortedHistory[0]; // Самый последний прогон
        console.log('📊 [ExcelExport] Использую последний прогон:', latestRun.startTime);
        await exporter.exportTestToExcel(test, 'play', {
          authData: {},
          preconditions: [],
          runHistory: latestRun
        }, {
          promptForLocation: true
        });
        console.log('✅ [ExcelExport] Отчёт о тестировании успешно экспортирован');
        // Получаем имя файла из экспортера
        const fileName = exporter.generateFileName(test, 'play');
        alert(this.t('popup.alertExportSuccess', {fileName: fileName}));
      } else {
        // Если истории нет, экспортируем просто тест
        console.log('⚠️ [ExcelExport] История прогонов отсутствует, экспортирую только тест');
        await exporter.exportTestToExcel(test, 'play', {
          authData: {},
          preconditions: []
        }, {
          promptForLocation: true
        });
        console.log('✅ [ExcelExport] Тест экспортирован (история прогонов отсутствует)');
        // Получаем имя файла из экспортера
        const fileName = exporter.generateFileName(test, 'play');
        alert(this.t('popup.alertExportNoHistory', {fileName: fileName}));
      }
    } catch (error) {
      console.error('❌ [ExcelExport] Ошибка при экспорте отчёта:', error);
      alert('Ошибка при экспорте отчёта: ' + error.message);
    }
  }
}

// Инициализация
const popupController = new PopupController();