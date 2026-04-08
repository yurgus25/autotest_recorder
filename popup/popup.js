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
      tier: 'free',
      capabilities: {},
      currentStep: 0,
      totalSteps: 0,
      stepType: null,
      completedSteps: [], // Массив завершенных шагов
      favoriteTestIds: new Set(), // id тестов, помеченных избранным (двойной клик по названию)
      favoriteGroupIds: new Set(), // id групп, помеченных избранным (двойной клик по названию группы)
      filterFavorites: false,    // показывать только избранные
      sortOrder: 'newFirst',     // 'newFirst' | 'oldFirst'
      compactTests: false       // компактный вид списка тестов (2–3 строки на тест)
    };
    // Флаг для новой компактной плашки одиночного теста (по умолчанию используем проверенный старый вариант)
    this.USE_NEW_STANDALONE_CARD_LAYOUT = false;
    // Палитра цветов для групп тестов (мягкие, различимые оттенки)
    this.GROUP_COLORS = [
      '#F28B82', // red
      '#FBBC04', // orange
      '#FFF475', // yellow
      '#CCFF90', // light green
      '#A7FFEB', // teal
      '#CBF0F8', // cyan
      '#AECBFA', // blue
      '#D7AEFB', // purple
      '#FDCFE8', // pink
      '#E6C9A8', // brown
      '#B5E4CA', // mint
      '#FFD6A5', // peach
      '#C3F0FF', // soft blue
      '#E0BBE4', // lavender
      '#FFCDD2', // soft red
      '#E8EAED'  // gray
    ];
    /** URL страницы тарифов / оплаты (заменить при включении Freemium). */
    this.UPGRADE_URL = '#';
    this.idleWarningTimer = null;
    this.idleWarningShown = false;
    this.lastStepActivity = null;
    this.currentEditingGroupId = null;
    this._creatingGroupContext = null; // { testIds: string[] } when creating a new group via modal
    this._lastRandomGroupColor = null;
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
   * Initialize language switcher buttons
   */
  initLangSwitcher() {
    if (!window.i18n) return;

    const currentLang = window.i18n.getLang();
    const langs = window.i18n.getSupportedLanguages();

    // Update active state on buttons
    for (const lang of langs) {
      const btn = document.getElementById(`lang-${lang}`);
      if (btn) {
        btn.classList.toggle('active', lang === currentLang);
        btn.addEventListener('click', () => {
          window.i18n.setLang(lang);
        });
      }
    }
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
          // Update lang switcher buttons
          this.initLangSwitcher();
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
      // Список из storage сразу — не ждём конца init и привязки сотен обработчиков
      try {
        await this.paintTestsFromStorage();
      } catch (e) {
        console.warn('[Popup] early paintTestsFromStorage', e);
      }
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

    const filterFavoritesBtn = document.getElementById('filterFavorites');
    if (filterFavoritesBtn) {
      filterFavoritesBtn.addEventListener('click', () => {
        this.state.filterFavorites = !this.state.filterFavorites;
        filterFavoritesBtn.classList.toggle('active', this.state.filterFavorites);
        filterFavoritesBtn.title = this.state.filterFavorites ? (this.t('popup.filterFavoritesActive') || this.t('popup.filterFavorites')) : this.t('popup.filterFavorites');
        chrome.storage.local.set({ filterFavorites: this.state.filterFavorites }).catch(() => {});
        this.renderTests();
      });
    }

    const sortTestsBtn = document.getElementById('sortTests');
    if (sortTestsBtn) {
      sortTestsBtn.addEventListener('click', () => {
        this.state.sortOrder = this.state.sortOrder === 'newFirst' ? 'oldFirst' : 'newFirst';
        const title = this.state.sortOrder === 'newFirst' ? this.t('popup.sortNewFirst') : this.t('popup.sortOldFirst');
        sortTestsBtn.title = title;
        sortTestsBtn.setAttribute('data-i18n-title', this.state.sortOrder === 'newFirst' ? 'popup.sortNewFirst' : 'popup.sortOldFirst');
        if (window.i18n) sortTestsBtn.setAttribute('title', title);
        chrome.storage.local.set({ sortOrder: this.state.sortOrder }).catch(() => {});
        this.renderTests();
      });
    }

    const compactTestsBtn = document.getElementById('compactTests');
    if (compactTestsBtn) {
      compactTestsBtn.addEventListener('click', () => {
        this.state.compactTests = !this.state.compactTests;
        compactTestsBtn.classList.toggle('active', this.state.compactTests);
        compactTestsBtn.title = this.state.compactTests ? (this.t('popup.compactTestsOn') || this.t('popup.compactTests')) : (this.t('popup.compactTestsOff') || this.t('popup.compactTests'));
        const iconSpan = compactTestsBtn.querySelector('.btn-fs-icon');
        const textSpan = compactTestsBtn.querySelector('.btn-fs-text');
        if (iconSpan) {
          iconSpan.textContent = this.state.compactTests ? '◀️▶️' : '▶️◀️';
        } else {
          compactTestsBtn.innerHTML = this.state.compactTests ? '◀️▶️' : '▶️◀️';
        }
        if (textSpan && document.body.classList.contains('fullscreen-mode')) {
          textSpan.textContent = this.state.compactTests ? (this.t('fullscreenPopup.btnExpand') || 'Expand') : (this.t('fullscreenPopup.btnCollapse') || 'Collapse');
        }
        chrome.storage.local.set({ compactTests: this.state.compactTests }).catch(() => {});
        this.renderTests();
      });
    }
    
    const createGroupBtn = document.getElementById('createGroup');
    if (createGroupBtn) {
      createGroupBtn.addEventListener('click', () => this.createNewGroup());
      const storageToggle = document.getElementById('storageToggle');
      if (storageToggle) {
        storageToggle.classList.add('storage-header-btn--compact');
      }
    }
    const createTestBtn = document.getElementById('createTest');
    if (createTestBtn) {
      createTestBtn.addEventListener('click', () => this.createNewTest());
    }

    const groupEditorModal = document.getElementById('groupEditorModal');
    const saveGroupEditorBtn = document.getElementById('saveGroupEditor');
    const cancelGroupEditorBtn = document.getElementById('cancelGroupEditor');
    const closeGroupEditorBtn = document.getElementById('closeGroupEditorModal');
    if (saveGroupEditorBtn) {
      saveGroupEditorBtn.addEventListener('click', () => this.handleSaveGroupEditor());
    }
    if (cancelGroupEditorBtn) {
      cancelGroupEditorBtn.addEventListener('click', () => this.closeGroupEditorModal());
    }
    if (closeGroupEditorBtn) {
      closeGroupEditorBtn.addEventListener('click', () => this.closeGroupEditorModal());
    }
    if (groupEditorModal) {
      groupEditorModal.addEventListener('click', (e) => {
        if (e.target === groupEditorModal) {
          this.closeGroupEditorModal();
        }
      });
    }

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

      if (action === 'play-group' || action === 'export-group' || action === 'edit-group' || action === 'delete-group' || action === 'screenshots-group') {
        const groupId = button.getAttribute('data-group-id');
        if (!groupId) return;
        if (action === 'screenshots-group') {
          this.showFirstGroupScreenshots(groupId);
          return;
        }
        switch (action) {
          case 'play-group':
            this.playTestGroup(groupId);
            break;
          case 'export-group':
            this.exportTestGroup(groupId);
            break;
          case 'edit-group':
            this.editTestGroup(groupId);
            break;
          case 'delete-group':
            this.deleteTestGroup(groupId);
            break;
        }
        return;
      }

      if (action === 'remove-from-group') {
        const groupId = button.getAttribute('data-group-id');
        const testId = button.getAttribute('data-test-id');
        if (groupId && testId) this.removeTestFromGroup(groupId, testId);
        return;
      }

      const testId = button.getAttribute('data-test-id');
      if (!testId) return;

      if (action === 'add-to-group') {
        this.showAddToGroupDropdown(testId, button);
        return;
      }

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

    // Двойной клик по названию теста/группы или по звёздочке — пометить/снять избранное
    testsList.addEventListener('dblclick', (e) => {
      const testNameOrStar =
        e.target.closest('.test-name') ||
        e.target.closest('.test-favorite-star') ||
        e.target.closest('.test-group-item-name');
      const groupNameOrStar =
        e.target.closest('.test-group-name') ||
        e.target.closest('.group-favorite-star');

      if (testNameOrStar) {
        const testItem = e.target.closest('.test-group-item') || e.target.closest('.test-item');
        const testId = testItem?.dataset?.testId;
        if (!testId) return;
        this.toggleTestFavorite(String(testId));
        return;
      }

      if (groupNameOrStar) {
        const groupEl = e.target.closest('.test-group');
        const groupId = groupEl?.getAttribute('data-group-id');
        if (!groupId) return;
        this.toggleGroupFavorite(String(groupId));
      }
    });

    // Drag-and-drop: из группы (по тексту/пустой области), из одиночных (заголовок или пустая область)
    testsList.addEventListener('dragstart', (e) => {
      const groupItemDragArea = e.target.closest('.test-group-item');
      const standaloneDragArea = e.target.closest('.standalone-drag-area');
      let payload = {};
      if (groupItemDragArea) {
        // Не начинаем drag с кнопок действий внутри элемента группы
        if (e.target.closest('.test-group-item-actions') || e.target.closest('button')) return;
        const item = groupItemDragArea.closest('.test-group-item');
        if (!item) return;
        payload = { groupId: item.getAttribute('data-group-id'), testId: item.getAttribute('data-test-id') };
      } else if (standaloneDragArea) {
        const item = standaloneDragArea.closest('.test-item');
        if (!item || !item.closest('.standalone-tests-wrap')) return;
        payload = { testId: item.getAttribute('data-test-id') };
      } else return;
      e.dataTransfer.effectAllowed = 'move';
      const str = JSON.stringify(payload);
      e.dataTransfer.setData('text/plain', str);
      e.dataTransfer.setData('application/json', str);
    });

    testsList.addEventListener('dragover', (e) => {
      const standaloneWrap = e.target.closest('.standalone-tests-wrap');
      const groupBody = e.target.closest('.test-group-body');
      const groupItem = e.target.closest('.test-group-item');
      if (!standaloneWrap && !groupBody && !groupItem) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      testsList.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      if (standaloneWrap) standaloneWrap.classList.add('drag-over');
      else if (groupItem) groupItem.classList.add('drag-over');
      else if (groupBody) groupBody.classList.add('drag-over');
    });

    testsList.addEventListener('dragleave', (e) => {
      const el = e.target.closest('.standalone-tests-wrap, .test-group-body, .test-group-item');
      if (!el) return;
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });

    testsList.addEventListener('dragend', () => {
      testsList.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });

    testsList.addEventListener('drop', async (e) => {
      const standaloneWrap = e.target.closest('.standalone-tests-wrap');
      const groupItem = e.target.closest('.test-group-item');
      const groupBody = e.target.closest('.test-group-body');
      const groupBlock = e.target.closest('.test-group');
      if (!standaloneWrap && !groupItem && !groupBody) return;
      e.preventDefault();
      e.stopPropagation();
      testsList.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      let payload;
      try {
        const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json') || '{}';
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const fromGroupId = payload.groupId ? String(payload.groupId) : null;
      const fromTestId = String(payload.testId || '');
      if (!fromTestId) return;

      if (standaloneWrap) {
        if (fromGroupId) await this.removeTestFromGroup(fromGroupId, fromTestId);
        return;
      }

      const toGroupId = (groupBlock && groupBlock.getAttribute('data-group-id')) ? String(groupBlock.getAttribute('data-group-id')) : null;
      if (!toGroupId) return;

      if (fromGroupId && fromGroupId === toGroupId) {
        const toTestId = groupItem ? String(groupItem.getAttribute('data-test-id') || '') : null;
        if (toTestId && toTestId !== fromTestId) await this.reorderTestInGroup(fromGroupId, fromTestId, toTestId);
        return;
      }

      if (fromGroupId && fromGroupId !== toGroupId) {
        await this.removeTestFromGroup(fromGroupId, fromTestId);
        await this._addTestToGroup(toGroupId, fromTestId);
        return;
      }

      if (!fromGroupId) await this._addTestToGroup(toGroupId, fromTestId);
    });

    // Слушаем обновления шагов теста и завершения теста.
    // Важно: не возвращать true для неизвестных type — иначе Chrome ждёт sendResponse от этого слушателя,
    // а ответы на sendMessage из popup (DELETE_TEST, GET_TESTS и т.д.) не доходят до вызывающего кода.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'STEP_PROGRESS_UPDATE') {
        this.state.currentStep = message.step;
        this.state.totalSteps = message.total;
        this.state.stepType = message.stepType;
        this.markPlaybackActivity();
        this.updateUI();
        sendResponse({ success: true });
        return false;
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
        return false;
      } else if (message.type === 'TEST_COMPLETED') {
        // Тест завершен. Если идёт прогон группы — не сбрасываем состояние (оно сбросится по GROUP_COMPLETED).
        if (!this.state.playingGroupId) {
          this.state.isPlaying = false;
          this.state.isPaused = false;
          this.state.currentTestId = null;
          this.state.currentStep = 0;
          this.state.totalSteps = 0;
          this.state.stepType = null;
          this.stopIdleWarningTimer();
          this.updateUI();
        }
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
        return false;
      } else if (message.type === 'GROUP_COMPLETED') {
        // Группа завершена — сбрасываем состояние воспроизведения и оформление
        this.state.isPlaying = false;
        this.state.isPaused = false;
        this.state.currentTestId = null;
        this.state.playingGroupId = null;
        this.state.currentStep = 0;
        this.state.totalSteps = 0;
        this.state.stepType = null;
        this.stopIdleWarningTimer();
        this.updateUI();
        this.renderTests();
        setTimeout(async () => {
          try {
            await this.loadTests();
          } catch (_) {}
        }, 500);
        sendResponse({ success: true });
        return false;
      }
      return false;
    });

    // Состояние записи/воспроизведения, список тестов и видимость по тарифу — параллельно
    // (список сначала рисуется из chrome.storage.local внутри loadTests, без ожидания service worker).
    await Promise.all([
      this.applyTierVisibility(),
      this.loadState(),
      this.loadTests()
    ]);

    window.popupControllerInstance = this;
    if (window.AutoTestOnboarding && typeof window.AutoTestOnboarding.maybeShow === 'function') {
      setTimeout(function() {
        window.AutoTestOnboarding.maybeShow();
      }, 400);
    }

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

        // Если background сообщает о текущей группе — окрашиваем прогресс цветом группы;
        // иначе сбрасываем, чтобы не показывать цвет предыдущей группы при одиночном запуске.
        if (response.state?.currentGroupId) {
          this.state.playingGroupId = String(response.state.currentGroupId);
        } else {
          this.state.playingGroupId = null;
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

  static get TESTS_STORAGE_KEYS() {
    return [
      'tests', 'testGroups',
      'favoriteTestIds', 'favoriteGroupIds', 'compactTests', 'filterFavorites', 'sortOrder'
    ];
  }

  /** Наполняет state.tests / группы / избранное из результата chrome.storage.local.get */
  applyTestsPayloadFromStored(stored) {
    const testsObj = stored.tests && typeof stored.tests === 'object' ? stored.tests : {};
    const tests = Object.values(testsObj).filter((t) => t && typeof t === 'object' && t.id != null);
    const groupsObj = stored.testGroups && typeof stored.testGroups === 'object' ? stored.testGroups : {};
    const groups = Object.values(groupsObj).filter((g) => g && typeof g === 'object' && g.id != null);

    this.state.tests = tests;
    this.state.testGroups = groups;

    this.state.favoriteTestIds = new Set(Array.isArray(stored.favoriteTestIds) ? stored.favoriteTestIds : []);
    this.state.favoriteGroupIds = new Set(Array.isArray(stored.favoriteGroupIds) ? stored.favoriteGroupIds : []);
    if (stored.compactTests === true) this.state.compactTests = true;
    if (typeof stored.filterFavorites === 'boolean') this.state.filterFavorites = stored.filterFavorites;
    if (stored.sortOrder === 'newFirst' || stored.sortOrder === 'oldFirst') this.state.sortOrder = stored.sortOrder;
  }

  /**
   * Мгновенно показать список из chrome.storage.local (без ожидания service worker).
   */
  async paintTestsFromStorage() {
    const stored = await chrome.storage.local.get(PopupController.TESTS_STORAGE_KEYS);
    this.applyTestsPayloadFromStored(stored);
    this.state.testsLoadState = 'success';
    this.state.testsLoadError = null;
    this.renderTests();
    this.updateUI();
  }

  /**
   * Если service worker ещё не ответил на GET_TESTS, поднимаем список из chrome.storage.local
   * (тот же источник, что и у фона после save) — без лишнего экрана «Не удалось загрузить».
   */
  async loadTestsFromStorageFallback() {
    try {
      const stored = await chrome.storage.local.get(PopupController.TESTS_STORAGE_KEYS);
      this.applyTestsPayloadFromStored(stored);

      this.state.testsLoadState = 'success';
      this.state.testsLoadError = null;

      console.log(`✅ [Popup] Список из storage: ${this.state.tests.length} тестов (фон не ответил вовремя или недоступен)`);
      await this.applyTierVisibility();
      this.renderTests();
      this.updateUI();
      return true;
    } catch (e) {
      console.warn('[Popup] loadTestsFromStorageFallback', e);
      return false;
    }
  }

  async loadTests(maxRetries = 5, retryDelay = 100) {
    const fatalErrors = new Set(['FREE_TIER_LIMIT', 'TIER_REQUIRED']);

    try {
      await this.paintTestsFromStorage();
    } catch (e) {
      console.warn('[Popup] paintTestsFromStorage failed', e);
      this.state.testsLoadState = 'loading';
      this.state.testsLoadError = null;
      this.renderTests();
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!chrome.runtime?.id) {
          if (attempt < maxRetries - 1) {
            console.log(`⏳ Extension context недействителен, повтор ${attempt + 1}/${maxRetries}…`);
            await this.delay(retryDelay + attempt * 60);
            continue;
          }
          break;
        }

        if (attempt > 0) {
          console.log(`📋 Запрос списка тестов… (попытка ${attempt + 1}/${maxRetries})`);
        }
        const response = await chrome.runtime.sendMessage({ type: 'GET_TESTS' });

        if (response && response.success) {
          this.state.testsLoadState = 'success';
          this.state.testsLoadError = null;
          this.state.tests = response.tests || [];
          this.state.testGroups = response.groups || [];
          if (response.freeTierLimit !== undefined) this.state.freeTierLimit = response.freeTierLimit;
          if (response.limitsEnabled !== undefined) this.state.limitsEnabled = response.limitsEnabled;
          if (response.tier) this.state.tier = response.tier;
          if (response.capabilities) this.state.capabilities = response.capabilities;
          try {
            const stored = await chrome.storage.local.get(['favoriteTestIds', 'favoriteGroupIds', 'compactTests', 'filterFavorites', 'sortOrder']);
            this.state.favoriteTestIds = new Set(Array.isArray(stored.favoriteTestIds) ? stored.favoriteTestIds : []);
            this.state.favoriteGroupIds = new Set(Array.isArray(stored.favoriteGroupIds) ? stored.favoriteGroupIds : []);
            if (stored.compactTests === true) this.state.compactTests = true;
            if (typeof stored.filterFavorites === 'boolean') this.state.filterFavorites = stored.filterFavorites;
            if (stored.sortOrder === 'newFirst' || stored.sortOrder === 'oldFirst') this.state.sortOrder = stored.sortOrder;
          } catch (_) {
            this.state.favoriteTestIds = new Set();
            this.state.favoriteGroupIds = new Set();
          }
          console.log(`✅ Загружено ${this.state.tests.length} тестов`);
          await this.applyTierVisibility();
          this.renderTests();
          this.updateUI();
          return;
        }

        const errCode = response && response.error ? String(response.error) : '';
        if (fatalErrors.has(errCode)) {
          this.state.testsLoadState = 'error';
          this.state.testsLoadError = response.error || this.t('popup.loadTestsFailed');
          this.state.tests = [];
          this.renderTests();
          return;
        }

        if (attempt < maxRetries - 1) {
          console.warn(`⚠️ GET_TESTS без успеха (попытка ${attempt + 1}/${maxRetries}), повтор…`, response);
          await this.delay(retryDelay + attempt * 60);
          continue;
        }
        break;
      } catch (error) {
        const msg = error && error.message ? String(error.message) : '';
        if (attempt < maxRetries - 1) {
          if (msg.includes('Receiving end does not exist')) {
            console.warn(`⚠️ Фон не готов (попытка ${attempt + 1}/${maxRetries})`);
          } else {
            console.warn(`⚠️ Ошибка GET_TESTS (попытка ${attempt + 1}/${maxRetries}):`, msg || error);
          }
          await this.delay(retryDelay + attempt * 60);
          continue;
        }
        break;
      }
    }

    if (this.state.testsLoadState === 'success' && Array.isArray(this.state.tests)) {
      console.log(`✅ [Popup] Оставляем список из storage (${this.state.tests.length} тестов), фон не ответил`);
      await this.applyTierVisibility();
      this.renderTests();
      this.updateUI();
      return;
    }

    if (await this.loadTestsFromStorageFallback()) {
      return;
    }

    this.state.testsLoadState = 'error';
    this.state.testsLoadError = !chrome.runtime?.id
      ? this.t('popup.extensionRestarting')
      : this.t('popup.backgroundNotResponding');
    this.state.tests = [];
    this.renderTests();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Переключить тест в избранное (двойной клик по названию). Сохраняем в storage. */
  async toggleTestFavorite(testId) {
    if (!testId) return;
    if (this.state.favoriteTestIds.has(testId)) {
      this.state.favoriteTestIds.delete(testId);
    } else {
      this.state.favoriteTestIds.add(testId);
    }
    try {
      await chrome.storage.local.set({
        favoriteTestIds: Array.from(this.state.favoriteTestIds),
        favoriteGroupIds: Array.from(this.state.favoriteGroupIds || [])
      });
    } catch (e) {
      console.warn('Failed to save favoriteTestIds:', e);
    }
    this.renderTests();
  }

  /** Переключить группу в избранное. */
  async toggleGroupFavorite(groupId) {
    if (!groupId) return;
    const id = String(groupId);
    if (!this.state.favoriteGroupIds) {
      this.state.favoriteGroupIds = new Set();
    }
    if (this.state.favoriteGroupIds.has(id)) {
      this.state.favoriteGroupIds.delete(id);
    } else {
      this.state.favoriteGroupIds.add(id);
    }
    try {
      await chrome.storage.local.set({
        favoriteTestIds: Array.from(this.state.favoriteTestIds || []),
        favoriteGroupIds: Array.from(this.state.favoriteGroupIds)
      });
    } catch (e) {
      console.warn('Failed to save favoriteGroupIds:', e);
    }
    this.renderTests();
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
        alert(this.t('popup.alertStopRecordingError', { msg: response.error || this.t('common.unknownError') }));
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      alert(this.t('popup.alertStopRecording'));
    }
  }

  async playTest(testId) {
    // Очищаем завершенные шаги при начале нового теста
    this.state.completedSteps = [];
    // Одиночный тест — полоса стандартная, не цвет группы
    this.state.playingGroupId = null;

    if (this.state.isPlaying && !this.state.isPaused) {
      alert(this.t('popup.alertAlreadyPlaying'));
      return;
    }

    const test = (this.state.tests || []).find((t) => String(t.id) === String(testId));
    if (test) {
      const runMode = test.optimization?.optimizedAvailable === true ? 'optimized' : 'full';
      const actionsForRun = (test.actions || []).filter((a) => (runMode === 'full' ? true : !a.hidden));
      if (actionsForRun.length === 0) {
        this.showToast(this.t('popup.noStepsToPlay'), 'warning');
        return;
      }
    }

    this.showToast(this.t('popup.refreshPageWarning'), 'warning');

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
        if (response.error === 'NO_STEPS_TO_PLAY') {
          this.showToast(this.t('popup.noStepsToPlay'), 'warning');
        } else {
          const hint = window.i18n && typeof window.i18n.playbackUserMessage === 'function'
            ? window.i18n.playbackUserMessage(response.error)
            : this.t('popup.playbackHintGeneric');
          alert(hint);
        }
      }
    } catch (error) {
      console.error('Error playing test:', error);
      const hint = window.i18n && typeof window.i18n.playbackUserMessage === 'function'
        ? window.i18n.playbackUserMessage(error && error.message)
        : this.t('popup.alertPlaybackFailed');
      alert(hint);
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

  async showFirstGroupScreenshots(groupId) {
    const group = (this.state.testGroups || []).find(g => String(g.id) === String(groupId));
    const testIds = group?.testIds || [];
    for (const tid of testIds) {
      const has = await this.checkTestHasScreenshots(tid);
      if (has) {
        this.showScreenshots(tid);
        return;
      }
    }
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
            const shotHint = this.escapeHtml(this.t('popup.stepScreenshotHint'));
            const shotBadge = this.stepHistoryHasScreenshot(step)
              ? `<span class="step-screenshot-indicator" title="${shotHint}">📷</span>`
              : '';
            
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
                  ${shotBadge}
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
      'loop': '🔁',
      'analysis': '🔍'
    };
    return icons[type] || '📌';
  }

  getMissingActionIcon(type) {
    return this.getActionTypeIcon(type);
  }

  /** Есть ли у шага в истории сохранённый скриншот (данные или путь на диске). */
  stepHistoryHasScreenshot(step) {
    if (!step || typeof step !== 'object') return false;
    if (step.screenshot || step.beforeScreenshot || step.afterScreenshot) return true;
    if (step.screenshotPath || step.beforeScreenshotPath || step.afterScreenshotPath || step.errorScreenshotPath) return true;
    const sc = step.screenshotComparison;
    if (sc && (sc.diffImage || sc.diffImagePath)) return true;
    if (step.screenshotComparisonView || step.screenshotComparisonViewPath) return true;
    return false;
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
      'loop': this.t('editor.actionTypes.loop'),
      'analysis': this.t('editor.actionTypes.analysis') || this.t('editorUI.actionTypeAnalysis') || 'Analysis'
    };
    return labels[type] || (typeof type === 'string' ? type : '—');
  }

  async deleteTest(testId) {
    if (!confirm(this.t('popup.confirmDeleteTest'))) {
      return;
    }

    const id = String(testId);
    const maxRetries = 6;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!chrome.runtime?.id) {
          if (attempt < maxRetries - 1) {
            await this.delay(250 + attempt * 120);
            continue;
          }
          break;
        }
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_TEST',
          testId: id
        });

        if (response && response.success) {
          await this.loadTests();
          return;
        }
        if (response && !response.success && attempt === maxRetries - 1) {
          alert(response.error || this.t('common.error'));
          return;
        }
      } catch (error) {
        console.warn(`DELETE_TEST attempt ${attempt + 1}/${maxRetries}:`, error);
        if (attempt < maxRetries - 1) {
          await this.delay(250 + attempt * 120);
          continue;
        }
      }
    }

    if (await this.deleteTestStorageFallback(id)) {
      await this.loadTestsFromStorageFallback();
      this.showToast(this.t('popup.testDeletedOffline'), 'warning');
      return;
    }

    alert(this.t('common.error'));
  }

  /**
   * Если service worker не ответил, удаляем тест из chrome.storage.local (как делает фон после DELETE_TEST).
   */
  async deleteTestStorageFallback(testId) {
    const id = String(testId);
    try {
      const stored = await chrome.storage.local.get(['tests', 'testGroups', 'testHistory']);
      const testsObj =
        stored.tests && typeof stored.tests === 'object' ? { ...stored.tests } : {};
      let removed = false;
      if (testsObj[id] != null) {
        delete testsObj[id];
        removed = true;
      } else if (/^\d+$/.test(id)) {
        const n = Number(id);
        if (testsObj[n] != null) {
          delete testsObj[n];
          removed = true;
        }
      }
      if (!removed) {
        for (const k of Object.keys(testsObj)) {
          const t = testsObj[k];
          if (t && (String(t.id) === id || String(k) === id)) {
            delete testsObj[k];
            removed = true;
            break;
          }
        }
      }
      if (!removed) return false;

      await chrome.storage.local.set({ tests: testsObj });

      const groupsObj =
        stored.testGroups && typeof stored.testGroups === 'object'
          ? { ...stored.testGroups }
          : {};
      let groupsChanged = false;
      for (const [gid, g] of Object.entries(groupsObj)) {
        if (g && Array.isArray(g.testIds)) {
          const filtered = g.testIds.filter((tid) => String(tid) !== id);
          if (filtered.length !== g.testIds.length) {
            groupsObj[gid] = {
              ...g,
              testIds: filtered,
              updatedAt: new Date().toISOString()
            };
            groupsChanged = true;
          }
        }
      }
      if (groupsChanged) {
        await chrome.storage.local.set({ testGroups: groupsObj });
      }

      const hist =
        stored.testHistory && typeof stored.testHistory === 'object'
          ? { ...stored.testHistory }
          : {};
      let histChanged = false;
      if (hist[id] != null) {
        delete hist[id];
        histChanged = true;
      }
      if (/^\d+$/.test(id)) {
        const n = Number(id);
        if (hist[n] != null) {
          delete hist[n];
          histChanged = true;
        }
      }
      if (histChanged) {
        await chrome.storage.local.set({ testHistory: hist });
      }

      return true;
    } catch (e) {
      console.warn('[Popup] deleteTestStorageFallback', e);
      return false;
    }
  }

  async forceStop() {
    try {
      // Останавливаем запись или воспроизведение
      if (this.state.isRecording) {
        // Для записи по маркеру — просим background отменить записанные шаги (без сохранения)
        try {
          await chrome.runtime.sendMessage({ type: 'STOP_RECORDING', cancelMarkerRecording: true });
        } catch (e) {
          console.warn('⚠️ Не удалось корректно остановить запись при принудительном стопе', e);
        }
        this.state.isRecording = false;
        this.state.currentTestId = null;
        this.updateUI();
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
        // Оформление области прогресса: для запуска группы — стиль как у группы, иначе стандартый
        const colorGroupId = this.state.playingGroupId || null;
        if (colorGroupId && Array.isArray(this.state.testGroups)) {
          const gid = String(colorGroupId);
          const group = this.state.testGroups.find(g => String(g.id) === gid);
          const color = group?.meta?.color || null;
          if (color) {
            stepProgress.style.borderLeft = `4px solid ${color}`;
            stepProgress.style.background = `${color}22`;
          } else {
            stepProgress.style.borderLeft = '';
            stepProgress.style.background = '';
          }
        } else {
          stepProgress.style.borderLeft = '';
          stepProgress.style.background = '';
        }
        
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
    if (!testsList) return;
    testsList.classList.remove('skeleton');
    testsList.classList.toggle('tests-list-compact', !!this.state.compactTests);
    this.updateTestsHeaderButtons();
    const testsCountEl = document.getElementById('testsCount');
    if (testsCountEl) testsCountEl.textContent = String(this.state.tests.length);

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

    // Сортируем тесты по дате: newFirst — свежие вверху, oldFirst — старые вверху
    const sortedTests = [...this.state.tests].sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return this.state.sortOrder === 'newFirst' ? dateB - dateA : dateA - dateB;
    });

    if (sortedTests.length === 0) {
      testsList.innerHTML = '<div class="empty-state">' + (this.state.filterFavorites ? this.t('popup.noFavoriteTests') : this.t('popup.noTests')) + '</div>';
      this.updateUpgradeBanner(false);
      return;
    }

    // Строим карту тестов и групп
    const testById = new Map(this.state.tests.map(t => [String(t.id), t]));
    const groups = Array.isArray(this.state.testGroups) ? this.state.testGroups : [];
    const usedTestIds = new Set();
    const testIdToGroupIds = new Map();

    const groupInfos = groups.map((group) => {
      const groupId = String(group.id || '');
      const groupTests = (group.testIds || []).map(id => testById.get(String(id))).filter(Boolean);
      groupTests.forEach(t => {
        const tid = String(t.id);
        usedTestIds.add(tid);
        const arr = testIdToGroupIds.get(tid) || [];
        arr.push(groupId);
        testIdToGroupIds.set(tid, arr);
      });
      const sortTime = groupTests.reduce((max, t) => {
        const ts = new Date(t?.updatedAt || t?.createdAt || 0).getTime();
        return Math.max(max, ts);
      }, 0);

      return { group, groupId, tests: groupTests, sortTime };
    });

    // Негрупповые тесты
    const standaloneTestsAll = this.state.tests.filter(t => !usedTestIds.has(String(t.id)));

    // Собираем контейнеры (группы + одиночные тесты) для сортировки
    let containers = [];
    containers.push(
      ...groupInfos.map(info => ({ type: 'group', info, sortTime: info.sortTime }))
    );
    containers.push(
      ...standaloneTestsAll.map(test => ({
        type: 'test',
        test,
        sortTime: new Date(test.updatedAt || test.createdAt || 0).getTime()
      }))
    );

    // Фильтр по избранному (учитываем избранные тесты и группы)
    if (this.state.filterFavorites &&
        (this.state.favoriteTestIds.size > 0 || (this.state.favoriteGroupIds && this.state.favoriteGroupIds.size > 0))) {
      containers = containers.filter(c => {
        if (c.type === 'test') {
          return this.state.favoriteTestIds.has(c.test.id);
        }
        const g = c.info.group;
        const gid = String(g.id || '');
        const groupFav = this.state.favoriteGroupIds && this.state.favoriteGroupIds.has(gid);
        if (groupFav) return true;
        const ids = g.testIds || [];
        return ids.some(id => this.state.favoriteTestIds.has(String(id)));
      });
    }

    // Сортировка контейнеров: по последнему сохранению
    containers.sort((a, b) => {
      const tA = a.sortTime || 0;
      const tB = b.sortTime || 0;
      return this.state.sortOrder === 'newFirst' ? tB - tA : tA - tB;
    });

    if (containers.length === 0) {
      testsList.innerHTML = '<div class="empty-state">' + (this.state.filterFavorites ? this.t('popup.noFavoriteTests') : this.t('popup.noTests')) + '</div>';
      this.updateUpgradeBanner(false);
      return;
    }

    // Карты HTML по id, чтобы вывести элементы в порядке containers (по дате сохранения)
    const groupHtmlMap = new Map();
    for (const c of containers) {
      if (c.type !== 'group') continue;
      const { info } = c;
      const { group, groupId, tests: groupTests } = info;

      const totalSteps = groupTests.reduce(
        (sum, t) => sum + ((t.actions || []).filter(a => !a.hidden).length || 0),
        0
      );
      const countLabel = this.t
        ? this.t('popup.groupTestsAndSteps', { count: groupTests.length, steps: totalSteps })
        : `${groupTests.length} тест(ов), ${totalSteps} шагов`;

      const totalMarkersCount = groupTests.reduce((sum, t) => {
        const actions = t.actions || [];
        return sum + actions.filter(a => a.recordMarker === true).length;
      }, 0);
      const groupDisplayMarkersCount = Math.min(totalMarkersCount, 3);
      const groupRecordMarkersIndicator = totalMarkersCount > 0 ? `
        <span class="test-record-markers before-play" title="${
          totalMarkersCount > 1
            ? this.t('popup.recordMarkersPlural', { count: totalMarkersCount })
            : this.t('popup.recordMarkers')
        }">
          ${'<span class="record-marker-dot"></span>'.repeat(groupDisplayMarkersCount)}
        </span>
      ` : '';

      const itemsHtml = groupTests
        .map((test) => {
          const isFavorite = this.state.favoriteTestIds.has(test.id);
          if (this.state.filterFavorites && !isFavorite) return '';
          const recordMarkers = test.actions?.filter(a => a.recordMarker === true) || [];
          const markersCount = recordMarkers.length;
          const displayMarkersCount = Math.min(markersCount, 3);
          const recordMarkersIndicator = markersCount > 0 ? `
            <span class="test-record-markers before-play" title="${markersCount > 1 ? this.t('popup.recordMarkersPlural', {count: markersCount}) : this.t('popup.recordMarkers')}">
              ${'<span class="record-marker-dot"></span>'.repeat(displayMarkersCount)}
            </span>
          ` : '';
          return `
          <div class="test-group-item" data-test-id="${this.escapeHtml(test.id)}" data-group-id="${this.escapeHtml(groupId)}" draggable="true">
            <span class="test-favorite-star" aria-hidden="true">${isFavorite ? '⭐' : ''}</span>
            <div class="test-group-item-name" title="${this.escapeHtml(test.name)}">${this.escapeHtml(test.name)}</div>
            <div class="test-group-item-actions">
              <button type="button" class="btn-icon test-group-item-screenshots hidden" data-action="screenshots" data-test-id="${this.escapeHtml(test.id)}" title="${this.t ? this.t('popup.screenshotsBtn') : 'View screenshots'}" aria-label="Screenshots">📸</button>
              <button class="btn-icon" data-action="play" data-test-id="${this.escapeHtml(test.id)}" title="${this.t ? this.t('popup.playTest') : 'Play'}">${recordMarkersIndicator}▶️</button>
              <button class="btn-icon" data-action="edit" data-test-id="${this.escapeHtml(test.id)}" title="${this.t ? this.t('popup.editTest') : 'Edit'}">✏️</button>
              <button class="btn-icon" data-action="remove-from-group" data-test-id="${this.escapeHtml(test.id)}" data-group-id="${this.escapeHtml(groupId)}" title="${this.t ? this.t('popup.removeFromGroup') : 'Remove from group'}">✕</button>
            </div>
          </div>
        `;
        })
        .filter(Boolean)
        .join('');
      const isGroupFavorite = this.state.favoriteGroupIds && this.state.favoriteGroupIds.has(groupId);
      const groupBodyEmptyMessage = (() => {
        if (itemsHtml) return itemsHtml;
        const showHiddenByFavorites = this.state.filterFavorites && groupTests.length > 0 && isGroupFavorite;
        const emptyKey = showHiddenByFavorites ? 'popup.groupTestsHiddenNotFavorites' : 'popup.groupEmpty';
        const emptyText = this.t ? this.t(emptyKey) : (emptyKey.includes('Favorites') ? 'Tests are not displayed (not marked as favorites)' : 'No tests in group');
        return `<div class="empty-state" style="padding: 8px 4px; font-size: 12px;">${this.escapeHtml(emptyText)}</div>`;
      })();
      const color = group.meta?.color || '';
      const groupStyle = color
        ? ` style="--group-shadow:${color}55;border-left: 4px solid ${color};background: linear-gradient(90deg, ${color}22, transparent);"`
        : '';
      const html = `
        <div class="test-group" data-group-id="${this.escapeHtml(groupId)}"${groupStyle}>
          <div class="test-group-header">
            <div class="test-group-title-row">
              <span class="test-group-icon">🧩</span>
              <div class="test-group-name" title="${this.escapeHtml(group.name || '')}">${this.escapeHtml(group.name || this.t?.('popup.unnamedGroup') || 'Group')}</div>
              <span class="group-favorite-star" aria-hidden="true">${isGroupFavorite ? '⭐' : ''}</span>
              <span class="test-group-count">${this.escapeHtml(countLabel)}</span>
            </div>
            <div class="test-group-actions" data-group-id="${this.escapeHtml(groupId)}">
              <button type="button" class="btn-icon group-screenshots-indicator hidden" data-action="screenshots-group" data-group-id="${this.escapeHtml(groupId)}" title="${this.t ? this.t('popup.screenshotsBtn') : 'View screenshots'}" aria-label="Screenshots">📸</button>
              <button class="btn-icon" data-action="play-group" data-group-id="${this.escapeHtml(groupId)}" title="${this.t ? this.t('popup.playGroup') : 'Play group'}">${groupRecordMarkersIndicator}▶️</button>
              <button class="btn-icon" data-action="export-group" data-group-id="${this.escapeHtml(groupId)}" title="${this.t ? this.t('popup.exportGroup') : 'Export group'}">💾</button>
              <button class="btn-icon" data-action="edit-group" data-group-id="${this.escapeHtml(groupId)}" title="${this.t ? this.t('popup.editGroup') : 'Edit group'}">✏️</button>
              <button class="btn-icon" data-action="delete-group" data-group-id="${this.escapeHtml(groupId)}" title="${this.t ? this.t('popup.deleteGroup') : 'Delete group'}">🗑️</button>
            </div>
          </div>
          <div class="test-group-body" data-group-id="${this.escapeHtml(groupId)}">
            ${groupBodyEmptyMessage}
          </div>
        </div>
      `;
      groupHtmlMap.set(groupId, html);
    }

    const standaloneHtmlMap = new Map();
    for (const c of containers) {
      if (c.type !== 'test') continue;
      const test = c.test;
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
        <span class="test-record-markers before-play" title="${markersCount > 1 ? this.t('popup.recordMarkersPlural', {count: markersCount}) : this.t('popup.recordMarkers')}">
          ${'<span class="record-marker-dot"></span>'.repeat(displayMarkersCount)}
        </span>
      ` : '';

      const isFavorite = this.state.favoriteTestIds.has(test.id);
      const favoriteStarTitle = this.t('popup.favoriteStarTitle');

      const isCurrentPlaying = this.state.isPlaying && this.state.currentTestId === test.id;
      const isCurrentPaused = isCurrentPlaying && this.state.isPaused;

      let cardHtml;
      // ЛЕГАСИ-плашка: старый макет, если нужно быстро откатиться
      if (!this.USE_NEW_STANDALONE_CARD_LAYOUT) {
        // Кнопки действий: отдельные разметки для обычного и компактного вида
        const legacyActionsHtml = this.state.compactTests ? `
            <div class="test-actions">
              <button type="button" class="btn-icon test-screenshots-indicator hidden" data-action="screenshots" data-test-id="${this.escapeHtml(test.id)}" title="${this.t ? this.t('popup.screenshotsBtn') : 'View screenshots'}" aria-label="Screenshots">📸</button>
              ${isCurrentPlaying && !isCurrentPaused ? `
                <button class="btn-icon" data-action="pause" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.pause')}">
                  ⏸️
                </button>
              ` : isCurrentPaused ? `
                <button class="btn-icon" data-action="resume" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.resume')}">
                  ${recordMarkersIndicator}▶️
                </button>
              ` : `
                <button class="btn-icon" data-action="play" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.playTest')}">
                  ${recordMarkersIndicator}▶️
                </button>
              `}
              <button class="btn-icon btn-add-to-group" data-action="add-to-group" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.addToGroupTitle')}">
                🧩
              </button>
              <button class="btn-icon" data-action="edit" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.editTest')}">
                ✏️
              </button>
              <button class="btn-icon" data-action="delete" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.deleteTest')}">
                🗑️
              </button>
            </div>
        ` : `
            <div class="test-actions test-actions-inline">
              ${isCurrentPlaying && !isCurrentPaused ? `
                <button class="btn-icon btn-test-action btn-test-play" data-action="pause" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.pause')}">
                  ⏸️
                </button>
              ` : isCurrentPaused ? `
                <button class="btn-icon btn-test-action btn-test-play" data-action="resume" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.resume')}">
                  ${recordMarkersIndicator}▶️
                </button>
              ` : `
                <button class="btn-icon btn-test-action btn-test-play" data-action="play" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.playTest')}">
                  ${recordMarkersIndicator}▶️
                </button>
              `}
              <button class="btn-icon btn-test-action btn-test-add-group" data-action="add-to-group" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.addToGroupTitle')}">
                🧩
              </button>
              <button class="btn-icon btn-test-action btn-test-edit" data-action="edit" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.editTest')}">
                ✏️
              </button>
              <button class="btn-icon btn-test-action btn-test-delete" data-action="delete" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.deleteTest')}">
                🗑️
              </button>
            </div>
        `;

        cardHtml = `
          <div class="test-item${this.state.compactTests ? ' test-item-compact' : ''}" data-test-id="${this.escapeHtml(test.id)}">
            <div class="test-header standalone-drag-area" draggable="true" title="${this.t ? this.t('popup.dragToGroup') : 'Drag to group'}">
              <div class="test-name-row">
                <span class="test-favorite-star" aria-hidden="true" title="${this.escapeHtml(favoriteStarTitle)}">${isFavorite ? '⭐' : ''}</span>
                <div class="test-name" data-test-id="${this.escapeHtml(test.id)}" title="${this.escapeHtml(favoriteStarTitle)}">${this.escapeHtml(test.name)}</div>
                <span class="test-compact-count">${actionsCount !== visibleActionsCount ? `${visibleActionsCount} ( ${actionsCount} )` : String(visibleActionsCount)}</span>
              </div>
              <div class="test-badges">
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
            ${legacyActionsHtml}
          </div>
        `;
      } else {
      // НОВАЯ плашка: компактный макет одиночного теста

      const actionsSummary = (actionsCount !== visibleActionsCount)
        ? this.t('popup.actionsCountFull', { visible: visibleActionsCount, total: actionsCount })
        : this.t('popup.actionsCount', { visible: visibleActionsCount });
      const metaLine = `${actionsSummary} | ${this.t('popup.created')}: ${createdDate} | ${this.t('popup.updated')}: ${updatedDate}`;

      // Ряд компактных иконок-действий
      const playPauseResumeHtml = isCurrentPlaying && !isCurrentPaused ? `
          <button class="btn-icon" data-action="pause" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.pause')}">
            ⏸️
          </button>
        ` : isCurrentPaused ? `
          <button class="btn-icon" data-action="resume" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.resume')}">
            ${recordMarkersIndicator}▶️
          </button>
        ` : `
          <button class="btn-icon" data-action="play" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.playTest')}">
            ${recordMarkersIndicator}▶️
          </button>
        `;

      cardHtml = `
        <div class="test-item${this.state.compactTests ? ' test-item-compact' : ''}" data-test-id="${this.escapeHtml(test.id)}">
          <div class="test-header standalone-drag-area" draggable="true" title="${this.t ? this.t('popup.dragToGroup') : 'Drag to group'}">
            <div class="test-name-row">
              <span class="test-favorite-star" aria-hidden="true" title="${this.escapeHtml(favoriteStarTitle)}">${isFavorite ? '⭐' : ''}</span>
              <div class="test-name" data-test-id="${this.escapeHtml(test.id)}" title="${this.escapeHtml(favoriteStarTitle)}">${this.escapeHtml(test.name)}</div>
            </div>
            <div class="test-badges">
              ${optimizationBadge}
            </div>
          </div>
          <div class="test-meta-row-compact">
            ${this.escapeHtml(metaLine)}
          </div>
          <div class="test-actions-row">
            ${playPauseResumeHtml}
            <button class="btn-icon btn-add-to-group" data-action="add-to-group" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.addToGroupTitle')}">
              🧩
            </button>
            <button class="btn-icon history-btn" data-action="history" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.historyBtn')}">
              📊
            </button>
            <button class="btn-icon" data-action="edit" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.editTest')}">
              ✏️
            </button>
            <button class="btn-icon" data-action="delete" data-test-id="${this.escapeHtml(test.id)}" title="${this.t('popup.deleteTest')}">
              🗑️
            </button>
          </div>
        </div>
      `;
      }
      standaloneHtmlMap.set(test.id, cardHtml);
    }

    // Рендерим в порядке containers: по дате сохранения (отдельный тест выше группы, если изменён позже)
    const orderedParts = containers.map(c => {
      if (c.type === 'group') return groupHtmlMap.get(c.info.groupId) ?? '';
      return `<div class="standalone-tests-wrap" data-drop-zone="standalone">${standaloneHtmlMap.get(c.test.id) ?? ''}</div>`;
    });
    const isFullscreen = document.body.classList.contains('fullscreen-mode');
    if (isFullscreen) {
      const groupsHtml = containers.filter(c => c.type === 'group').map(c => groupHtmlMap.get(c.info.groupId) ?? '').join('');
      const testsHtml = containers.filter(c => c.type === 'test').map(c => `<div class="standalone-tests-wrap" data-drop-zone="standalone">${standaloneHtmlMap.get(c.test.id) ?? ''}</div>`).join('');
      testsList.innerHTML = `<div class="fullscreen-layout"><div class="fullscreen-col fullscreen-col-groups">${groupsHtml || '<div class="empty-state" style="padding:12px;font-size:13px;">' + (this.t ? this.t('popup.noTests') : 'No tests') + '</div>'}</div><div class="fullscreen-col fullscreen-col-tests">${testsHtml || '<div class="empty-state" style="padding:12px;font-size:13px;">' + (this.t ? this.t('popup.noTests') : 'No tests') + '</div>'}</div></div>`;
    } else {
      testsList.innerHTML = orderedParts.join('');
    }

    this.updateUpgradeBanner(this.state.limitsEnabled && this.state.tests.length >= (this.state.freeTierLimit || 10));
    
    // Асинхронно проверяем наличие скриншотов в истории прогонов и показываем индикаторы/кнопки.
    // Используем Promise.all для параллельной проверки всех тестов.
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

          // Показ индикатора скриншотов в заголовке одиночного теста
          const headerIndicator = document.querySelector(`.test-screenshots-indicator[data-test-id="${test.id}"]`);
          if (headerIndicator) {
            if (hasScreenshots) {
              headerIndicator.classList.remove('hidden');
              headerIndicator.style.display = 'inline-block';
            } else {
              headerIndicator.classList.add('hidden');
              headerIndicator.style.display = 'none';
            }
          }

          // Показ индикатора для тестов внутри групп
          document.querySelectorAll(`.test-group-item[data-test-id="${test.id}"] .test-group-item-screenshots`).forEach((el) => {
            if (hasScreenshots) {
              el.classList.remove('hidden');
              el.style.display = 'inline-block';
            } else {
              el.classList.add('hidden');
              el.style.display = 'none';
            }
          });

          // Показ индикатора для групп, в которых есть хотя бы один тест со скриншотами
          const groupIds = testIdToGroupIds.get(String(test.id)) || [];
          groupIds.forEach((gid) => {
            const groupIndicator = document.querySelector(`.group-screenshots-indicator[data-group-id="${gid}"]`);
            if (groupIndicator && hasScreenshots) {
              groupIndicator.classList.remove('hidden');
              groupIndicator.style.display = 'inline-block';
            }
          });
        } catch (error) {
          console.error(`Ошибка при проверке скриншотов для теста ${test.id}:`, error);
        }
      })
    ).catch(error => {
      console.error('Ошибка при проверке скриншотов:', error);
    });
    
    // Обработчики уже привязаны в init() через делегирование событий
  }

  updateTestsHeaderButtons() {
    const filterFavoritesBtn = document.getElementById('filterFavorites');
    const sortTestsBtn = document.getElementById('sortTests');
    const compactTestsBtn = document.getElementById('compactTests');
    if (filterFavoritesBtn) {
      filterFavoritesBtn.classList.toggle('active', !!this.state.filterFavorites);
      filterFavoritesBtn.title = this.state.filterFavorites ? (this.t('popup.filterFavoritesActive') || this.t('popup.filterFavorites')) : this.t('popup.filterFavorites');
    }
    if (sortTestsBtn) {
      const title = this.state.sortOrder === 'newFirst' ? this.t('popup.sortNewFirst') : this.t('popup.sortOldFirst');
      sortTestsBtn.title = title;
    }
    if (compactTestsBtn) {
      compactTestsBtn.classList.toggle('active', !!this.state.compactTests);
      compactTestsBtn.title = this.state.compactTests ? (this.t('popup.compactTestsOn') || this.t('popup.compactTests')) : (this.t('popup.compactTestsOff') || this.t('popup.compactTests'));
      const iconSpan = compactTestsBtn.querySelector('.btn-fs-icon');
      const textSpan = compactTestsBtn.querySelector('.btn-fs-text');
      if (iconSpan) {
        iconSpan.textContent = this.state.compactTests ? '◀️▶️' : '▶️◀️';
      } else {
        compactTestsBtn.innerHTML = this.state.compactTests ? '◀️▶️' : '▶️◀️';
      }
      if (textSpan && document.body.classList.contains('fullscreen-mode')) {
        textSpan.textContent = this.state.compactTests ? (this.t('fullscreenPopup.btnExpand') || 'Expand') : (this.t('fullscreenPopup.btnCollapse') || 'Collapse');
      }
    }
    if (document.body.classList.contains('fullscreen-mode')) {
      const summaryEl = document.getElementById('testsSummary');
      if (summaryEl) {
        const totalTests = this.state.tests.length;
        const groups = Array.isArray(this.state.testGroups) ? this.state.testGroups : [];
        const groupsCount = groups.length;
        const inGroupSet = new Set();
        groups.forEach(g => (g.testIds || []).forEach(id => inGroupSet.add(String(id))));
        const inGroupsCount = inGroupSet.size;
        summaryEl.textContent = this.t('fullscreenPopup.testsSummary', { tests: totalTests, groups: groupsCount, inGroups: inGroupsCount }) || `tests: ${totalTests}, groups: ${groupsCount}, tests in groups: ${inGroupsCount}`;
      }
    }
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
      const lowerName = file.name.toLowerCase();

      // Читаем содержимое файла сразу — по нему определяем тип при нестандартном расширении
      const fileContent = await file.text();
      const trimmed = (fileContent || '').trim();
      const looksLikeXml = lowerName.endsWith('.xml') || trimmed.startsWith('<');

      // Confirm только если расширение не .json/.xml и содержимое не похоже на XML
      if (!lowerName.endsWith('.json') && !lowerName.endsWith('.xml') && !trimmed.startsWith('<')) {
        const proceed = confirm(
          this.t('popup.fileNotJson')
        );
        if (!proceed) {
          return;
        }
      }

      // Если это XML (Katalon Recorder и т.п.), конвертируем в формат плагина
      if (looksLikeXml) {
        const testFromXml = this.parseKatalonXmlTestCase(trimmed, file.name);

        // Гарантируем метаданные
        if (!testFromXml.id) {
          testFromXml.id = 'imported-' + Date.now();
        }
        if (!testFromXml.createdAt) {
          testFromXml.createdAt = new Date().toISOString();
        }
        testFromXml.updatedAt = new Date().toISOString();

        await this.importTest(testFromXml);
        console.log('✅ Тест (Katalon XML) успешно импортирован из файла:', file.name);
        return;
      }

      // Иначе пробуем разобрать как JSON
      const data = JSON.parse(fileContent);

      if (data.type === 'group' && data.group && Array.isArray(data.tests)) {
        await this.importGroup(data);
        console.log('✅ Группа тестов успешно импортирована из файла:', file.name);
        return;
      }

      const testData = data;
      if (!testData.name || !testData.actions) {
        throw new Error('Неверный формат теста. Нужны поля: name, actions');
      }

      if (!testData.id) {
        testData.id = 'imported-' + Date.now();
      }
      if (!testData.createdAt) {
        testData.createdAt = new Date().toISOString();
      }
      testData.updatedAt = new Date().toISOString();

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

  /**
   * Упрощает XPath из Katalon/Selenium и по возможности конвертирует в CSS для плагина.
   * @param {string} xpathStr - строка XPath (без префикса xpath=)
   * @returns {{ type: 'css'|'xpath', value: string }}
   */
  simplifyKatalonSelector(xpathStr) {
    if (!xpathStr || typeof xpathStr !== 'string') {
      return { type: 'css', value: '' };
    }
    const trimmed = xpathStr.trim();

    // Простые конвертации XPath -> CSS (регулярки для типичных паттернов Katalon)
    // //*[@id='value'] или //tag[@id='value']
    const idMatch = trimmed.match(/^\/\/\*?\[@id\s*=\s*['"]([^'"]*)['"]\s*\]$/);
    if (idMatch) {
      const id = idMatch[1];
      const escaped = id.replace(/([ #.;,:\[\]<>+~'"\\^$|])/g, '\\$1');
      return { type: 'css', value: `#${escaped}` };
    }
    // //tag[@id='x'] без закрывающих скобок в конце (вложенности)
    const tagIdMatch = trimmed.match(/^\/\/([a-zA-Z][a-zA-Z0-9]*)\[@id\s*=\s*['"]([^'"]*)['"]\]$/);
    if (tagIdMatch) {
      const tag = tagIdMatch[1];
      const id = tagIdMatch[2];
      const escaped = id.replace(/([ #.;,:\[\]<>+~'"\\^$|])/g, '\\$1');
      return { type: 'css', value: `${tag}#${escaped}` };
    }
    // //*[contains(@class,'value')] или //*[contains(concat(' ', normalize-space(@class), ' '), ' value ')]
    const classMatch = trimmed.match(/^\/\/\*?\[contains\s*\(\s*(?:concat\s*\(\s*'\s*'\s*,\s*normalize-space\s*\(\s*@class\s*\)\s*,\s*'\s*'\s*\)\s*|\s*@class\s*)\s*,\s*['"]([^'"]*)['"]\s*\)\]$/);
    if (classMatch) {
      const cls = classMatch[1];
      const escaped = cls.replace(/([.#;,:\[\]'"\\])/g, '\\$1');
      return { type: 'css', value: `.${escaped}` };
    }
    // //tag[contains(@class,'x')]
    const tagClassMatch = trimmed.match(/^\/\/([a-zA-Z][a-zA-Z0-9]*)\[contains\s*\(\s*@class\s*,\s*['"]([^'"]*)['"]\s*\)\]$/);
    if (tagClassMatch) {
      const tag = tagClassMatch[1];
      const cls = tagClassMatch[2];
      const escaped = cls.replace(/([.#;,:\[\]'"\\])/g, '\\$1');
      return { type: 'css', value: `${tag}.${escaped}` };
    }
    // Простой тег //div, //span
    const tagOnlyMatch = trimmed.match(/^\/\/([a-zA-Z][a-zA-Z0-9]*)$/);
    if (tagOnlyMatch) {
      return { type: 'css', value: tagOnlyMatch[1] };
    }

    // Упрощение сложного XPath для стабильной работы в браузере
    let simplified = trimmed
      // Типичный Katalon: normalize-space(text()) and normalize-space(.)='X' -> contains(.,'X')
      .replace(/\bnormalize-space\s*\(\s*text\s*\(\s*\)\s*\)\s*and\s*normalize-space\s*\(\s*\.\s*\)\s*=\s*['"]([^'"]*)['"]/g, "contains(.,'$1')")
      .replace(/\bnormalize-space\s*\(\s*\.\s*\)\s*=\s*['"]([^'"]*)['"]/g, "contains(.,'$1')")
      .replace(/\bnormalize-space\s*\(\s*text\s*\(\s*\)\s*\)\s*=\s*['"]([^'"]*)['"]/g, "contains(text(),'$1')")
      .replace(/\bnormalize-space\s*\(\s*@([a-zA-Z-]+)\s*\)\s*=\s*['"]([^'"]*)['"]/g, "@$1='$2'");

    return { type: 'xpath', value: simplified };
  }

  /**
   * Конвертирует XML кейс (формат Katalon Recorder / Selenium IDE) в формат теста плагина.
   * Поддерживаются базовые команды: open, click.
   * @param {string} xmlText - содержимое XML
   * @param {string} fileName - имя файла (для дефолтного имени теста)
   * @returns {{name: string, actions: Array}} Тест в формате плагина
   */
  parseKatalonXmlTestCase(xmlText, fileName) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const parseError = doc.getElementsByTagName('parsererror')[0];
      if (parseError) {
        throw new Error(parseError.textContent || 'XML parse error');
      }

      const root = doc.documentElement;
      if (!root || (root.tagName || '').toUpperCase() !== 'TESTCASE') {
        throw new Error('Ожидался XML с корневым элементом <TestCase>');
      }

      // Имя теста - атрибут name или имя файла
      let name =
        root.getAttribute('name') ||
        (fileName ? fileName.replace(/\.[^.]+$/, '') : '') ||
        'Imported Katalon Test';

      const seleneseNodes = Array.from(root.getElementsByTagName('selenese') || []);
      const actions = [];
      const baseTime = Date.now();

      for (let i = 0; i < seleneseNodes.length; i++) {
        const node = seleneseNodes[i];
        const getText = (tag) => {
          const el = node.getElementsByTagName(tag)[0];
          return el && el.textContent != null ? el.textContent.trim() : '';
        };

        const command = getText('command');
        let target = getText('target');
        const value = getText('value');
        const ts = baseTime + i;
        const tsIso = new Date(ts).toISOString();

        if (!command) continue;

        if (command === 'open') {
          if (!target) continue;
          actions.push({
            type: 'navigation',
            subtype: 'nav-url',
            url: target,
            selector: null,
            timestamp: ts,
            userEdited: true,
            userEditedAt: tsIso,
            userSelectors: []
          });
          continue;
        }

        const buildSelectorFromTarget = (t) => {
          let type = 'css';
          let sel = t;
          if (t.startsWith('xpath=')) {
            const simplified = this.simplifyKatalonSelector(t.slice('xpath='.length));
            type = simplified.type;
            sel = simplified.value;
          } else if (t.startsWith('css=')) {
            sel = t.slice('css='.length);
          } else if (t.startsWith('id=')) {
            const idVal = t.slice(3).trim();
            type = 'id';
            sel = idVal ? '#' + idVal.replace(/([ #.;,:\[\]<>+~'"\\^$|])/g, '\\$1') : '';
          }
          return { type, value: sel };
        };

        if (command === 'click') {
          if (!target) continue;
          const { type: selectorType, value: selectorValue } = buildSelectorFromTarget(target);

          actions.push({
            type: 'click',
            selector: {
              priority: 10,
              selector: selectorValue,
              type: selectorType,
              value: selectorValue
            },
            timestamp: ts,
            url: '',
            userEdited: true,
            userEditedAt: tsIso,
            userSelectors: [],
            value: value || ''
          });
          continue;
        }

        if (command === 'type') {
          if (!target) continue;
          const { type: selectorType, value: selectorValue } = buildSelectorFromTarget(target);

          actions.push({
            type: 'input',
            selector: {
              priority: 10,
              selector: selectorValue,
              type: selectorType,
              value: selectorValue
            },
            timestamp: ts,
            url: '',
            userEdited: true,
            userEditedAt: tsIso,
            userSelectors: [],
            value: value || ''
          });
          continue;
        }

        // Другие команды пока пропускаем
      }

      if (!actions.length) {
        throw new Error('XML не содержит поддерживаемых шагов (open/click/type).');
      }

      return {
        name,
        actions,
        variables: {},
        lastEditedBy: 'user'
      };
    } catch (e) {
      console.error('Ошибка парсинга Katalon XML:', e);
      throw new Error('Не удалось импортировать XML из Katalon: ' + (e && e.message ? e.message : e));
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

  /**
   * Импорт группы тестов из JSON (type: 'group', group, tests).
   */
  async importGroup(data) {
    try {
      const groupMeta = data.group || {};
      const tests = Array.isArray(data.tests) ? data.tests : [];
      const baseId = 'imported-' + Date.now();
      const newTestIds = [];
      const idMap = new Map();
      for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        const originalId = t && t.id != null ? String(t.id) : null;
        const newId = originalId ? `${baseId}-${i}-${originalId.slice(-8)}` : `${baseId}-${i}`;
        const testPayload = {
          ...t,
          id: newId,
          name: t.name || `Test ${i + 1}`,
          actions: t.actions || [],
          variables: t.variables || {},
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const res = await chrome.runtime.sendMessage({ type: 'UPDATE_TEST', test: testPayload });
        if (res?.success) {
          newTestIds.push(newId);
          if (originalId) {
            idMap.set(originalId, newId);
          }
        }
      }

      // Восстанавливаем порядок тестов в группе согласно исходному group.testIds (если он присутствует в файле)
      let orderedNewTestIds = [];
      const originalOrder = Array.isArray(groupMeta.testIds) ? groupMeta.testIds.map(String) : null;
      if (originalOrder && originalOrder.length > 0 && idMap.size > 0) {
        for (const oldId of originalOrder) {
          const mapped = idMap.get(String(oldId));
          if (mapped) {
            orderedNewTestIds.push(mapped);
          }
        }
        // Добавляем любые новые тесты, которые не попали в порядок по testIds (на случай расхождений в файле)
        for (const nid of newTestIds) {
          if (!orderedNewTestIds.includes(nid)) {
            orderedNewTestIds.push(nid);
          }
        }
      } else {
        orderedNewTestIds = newTestIds;
      }

      const groupId = groupMeta.id ? `${baseId}-group-${String(groupMeta.id).slice(-8)}` : `${baseId}-group`;
      const groupPayload = {
        id: groupId,
        name: groupMeta.name || 'Imported group',
        description: groupMeta.description || '',
        // Порядок в новой группе совпадает с исходным group.testIds (если он указан),
        // иначе используем порядок tests из файла
        testIds: orderedNewTestIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await chrome.runtime.sendMessage({ type: 'UPDATE_TEST_GROUP', group: groupPayload });
      alert(this.t('popup.alertImportGroupSuccess', { name: groupPayload.name, count: orderedNewTestIds.length }));
      await this.loadTests();
    } catch (error) {
      console.error('Error importing group:', error);
      alert(this.t('popup.alertImportFailed') + ': ' + error.message);
    }
  }

  /**
   * Запуск группы тестов по groupId (общий запуск группы — тесты идут по очереди).
   */
  async playTestGroup(groupId) {
    try {
      this.state.isPlaying = true;
      this.state.playingGroupId = String(groupId);
      this.updateUI();
      const res = await chrome.runtime.sendMessage({
        type: 'PLAY_TEST_GROUP',
        groupId: String(groupId),
        mode: 'optimized',
        debugMode: false
      });
      if (!res?.success) {
        this.state.isPlaying = false;
        this.state.playingGroupId = null;
        this.updateUI();
        alert(this.t ? this.t('popup.playGroupError', { msg: res.error || 'Unknown error' }) : ('Error: ' + (res.error || 'Unknown')));
      }
    } catch (error) {
      this.state.isPlaying = false;
      this.state.playingGroupId = null;
      this.updateUI();
      console.error('Error playing test group:', error);
      alert(this.t ? this.t('popup.playGroupError', { msg: error?.message || String(error) }) : ('Error playing group: ' + error?.message));
    }
  }

  /**
   * Экспорт группы тестов в JSON файл.
   */
  async exportTestGroup(groupId) {
    try {
      const id = String(groupId);
      const group = (this.state.testGroups || []).find(g => String(g.id) === id);
      if (!group) {
        alert(this.t ? this.t('popup.groupNotFound') : 'Group not found');
        return;
      }
      const testIdOrder = (group.testIds || []).map(String);
      const testsById = new Map((this.state.tests || []).map(t => [String(t.id), t]));
      const tests = testIdOrder
        .map(testId => testsById.get(testId))
        .filter(Boolean);
      const payload = {
        type: 'group',
        version: '1',
        group: group,
        tests: tests
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (group.name || 'group').replace(/[^a-zA-Z0-9а-яА-Я_\-]+/g, '_');
      a.href = url;
      a.download = `autotest-group-${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting group:', error);
      alert(this.t ? this.t('popup.exportGroupError', {msg: error.message}) : ('Error exporting group: ' + error.message));
    }
  }

  /**
   * Открыть редактор для группы (фокус на одному из тестов группы).
   */
  openGroupInEditor(groupId) {
    const id = String(groupId);
    const group = (this.state.testGroups || []).find(g => String(g.id) === id);
    if (!group || !Array.isArray(group.testIds) || group.testIds.length === 0) {
      alert(this.t ? this.t('popup.groupEmpty') : 'Group is empty');
      return;
    }
    const firstTestId = String(group.testIds[0]);
    this.editTest(firstTestId);
  }

  /**
   * Переименовать группу и выбрать цвет из палитры (через модальное окно).
   */
  async editTestGroup(groupId) {
    const id = String(groupId);
    const groups = this.state.testGroups || [];
    const group = groups.find(g => String(g.id) === id);
    if (!group) {
      alert(this.t ? this.t('popup.groupNotFound') : 'Group not found');
      return;
    }

    this.currentEditingGroupId = id;

    const nameInput = document.getElementById('groupEditorName');
    const paletteEl = document.getElementById('groupEditorPalette');
    const modalEl = document.getElementById('groupEditorModal');
    if (!nameInput || !paletteEl || !modalEl) return;

    const currentName = group.name || this.t?.('popup.unnamedGroup') || 'Group';
    nameInput.value = currentName;

    const colors = this.GROUP_COLORS || [];
    const currentColor = group.meta?.color || (colors[0] || '');
    paletteEl.innerHTML = '';
    colors.forEach((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'group-color-swatch';
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      if (color === currentColor) {
        swatch.classList.add('selected');
      }
      swatch.addEventListener('click', () => {
        paletteEl.querySelectorAll('.group-color-swatch.selected').forEach(el => el.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      paletteEl.appendChild(swatch);
    });

    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
  }

  closeGroupEditorModal() {
    const modalEl = document.getElementById('groupEditorModal');
    if (modalEl) {
      modalEl.classList.add('hidden');
      modalEl.setAttribute('aria-hidden', 'true');
    }
    this.currentEditingGroupId = null;
    this._creatingGroupContext = null;
  }

  _pickRandomGroupColor() {
    const colors = Array.isArray(this.GROUP_COLORS) ? this.GROUP_COLORS.filter(Boolean) : [];
    if (colors.length === 0) return '';
    if (colors.length === 1) return colors[0];
    let picked = colors[Math.floor(Math.random() * colors.length)];
    if (this._lastRandomGroupColor && colors.length > 1) {
      let guard = 0;
      while (picked === this._lastRandomGroupColor && guard < 10) {
        picked = colors[Math.floor(Math.random() * colors.length)];
        guard++;
      }
    }
    this._lastRandomGroupColor = picked;
    return picked;
  }

  _openGroupEditorModalForCreate({ testIds = [] } = {}) {
    const nameInput = document.getElementById('groupEditorName');
    const paletteEl = document.getElementById('groupEditorPalette');
    const modalEl = document.getElementById('groupEditorModal');
    if (!nameInput || !paletteEl || !modalEl) return;

    this.currentEditingGroupId = '__new__';
    this._creatingGroupContext = { testIds: Array.isArray(testIds) ? testIds.map(String) : [] };

    nameInput.value = this.t?.('popup.newGroupNameDefault') || 'Новая группа';
    nameInput.focus();
    try {
      nameInput.setSelectionRange(0, nameInput.value.length);
    } catch (_) {}

    const colors = this.GROUP_COLORS || [];
    const defaultColor = this._pickRandomGroupColor() || (colors[0] || '');
    paletteEl.innerHTML = '';
    colors.forEach((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'group-color-swatch';
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      if (color === defaultColor) {
        swatch.classList.add('selected');
      }
      swatch.addEventListener('click', () => {
        paletteEl.querySelectorAll('.group-color-swatch.selected').forEach(el => el.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      paletteEl.appendChild(swatch);
    });

    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
  }

  async handleSaveGroupEditor() {
    if (!this.currentEditingGroupId) {
      this.closeGroupEditorModal();
      return;
    }
    const isCreate = String(this.currentEditingGroupId) === '__new__';
    const id = String(this.currentEditingGroupId);
    const groups = this.state.testGroups || [];
    const group = isCreate ? null : groups.find(g => String(g.id) === id);
    if (!isCreate && !group) {
      this.closeGroupEditorModal();
      return;
    }

    const nameInput = document.getElementById('groupEditorName');
    const paletteEl = document.getElementById('groupEditorPalette');
    if (!nameInput || !paletteEl) {
      this.closeGroupEditorModal();
      return;
    }

    const fallbackName = isCreate
      ? (this.t?.('popup.newGroupNameDefault') || 'Новая группа')
      : (group.name || this.t?.('popup.unnamedGroup') || 'Group');
    const newName = (nameInput.value || '').trim() || fallbackName;
    const selectedSwatch = paletteEl.querySelector('.group-color-swatch.selected');
    const chosenColor = selectedSwatch?.dataset?.color || (!isCreate ? (group.meta?.color) : null) || (this.GROUP_COLORS[0] || '');

    try {
      if (isCreate) {
        const nowIso = new Date().toISOString();
        const newGroup = {
          name: newName,
          description: '',
          testIds: (this._creatingGroupContext?.testIds || []).map(String),
          createdAt: nowIso,
          updatedAt: nowIso,
          meta: { color: chosenColor }
        };
        await chrome.runtime.sendMessage({ type: 'UPDATE_TEST_GROUP', group: newGroup });
        await this.loadTests();
      } else {
        const updatedGroup = {
          ...group,
          name: newName,
          meta: {
            ...(group.meta || {}),
            color: chosenColor
          }
        };
        await chrome.runtime.sendMessage({ type: 'UPDATE_TEST_GROUP', group: updatedGroup });
        await this.loadTests();
      }
    } catch (error) {
      console.error('Error updating group:', error);
      alert(this.t ? this.t('popup.createGroupError', { msg: error?.message }) : ('Error: ' + (error?.message || error)));
    } finally {
      this.closeGroupEditorModal();
    }
  }

  /**
   * Удалить группу целиком.
   * Если в группе есть тесты, пользователь выбирает сценарий удаления.
   */
  async deleteTestGroup(groupId) {
    const id = String(groupId);
    const group = (this.state.testGroups || []).find(g => String(g.id) === id);
    if (!group) {
      alert(this.t ? this.t('popup.groupNotFound') : 'Group not found');
      return;
    }
    const name = group.name || this.t?.('popup.unnamedGroup') || 'Group';
    const groupTestIds = Array.isArray(group.testIds) ? group.testIds.map(String) : [];

    // Если в группе нет тестов, оставляем прежнее простое подтверждение
    if (groupTestIds.length === 0) {
      const ok = confirm(
        this.t
          ? this.t('popup.confirmDeleteEmptyGroup', { name })
          : `Удалить пустую группу «${name}»?`
      );
      if (!ok) return;
      try {
        await chrome.runtime.sendMessage({ type: 'DELETE_TEST_GROUP', groupId: id });
        await this.loadTests();
      } catch (error) {
        console.error('Error deleting group:', error);
        alert(this.t ? this.t('popup.deleteGroupError', { msg: error?.message }) : ('Error: ' + error?.message));
      }
      return;
    }

    try {
      // Группа содержит тесты — сначала спрашиваем, удалить ли всё вместе с тестами
      const deleteAllMsg = this.t
        ? this.t('popup.confirmDeleteGroupAndTests', { name, count: groupTestIds.length })
        : `Группа «${name}» содержит ${groupTestIds.length} тест(ов).\nУдалить группу вместе со всеми её тестами?`;

      const deleteAll = window.confirm(deleteAllMsg);

      if (deleteAll) {
        // Удаляем все тесты группы и затем саму группу
        for (const testId of groupTestIds) {
          try {
            await chrome.runtime.sendMessage({ type: 'DELETE_TEST', testId: String(testId) });
          } catch (e) {
            console.error('Error deleting test from group during group delete:', e);
          }
        }
        await chrome.runtime.sendMessage({ type: 'DELETE_TEST_GROUP', groupId: id });
      } else {
        // Пользователь отказался удалять тесты — спрашиваем, удалить ли только группу
        const deleteGroupOnlyMsg = this.t
          ? this.t('popup.confirmDeleteGroupOnly', { name, count: groupTestIds.length })
          : `Удалить только группу «${name}», а тесты оставить в списке?`;

        const deleteGroupOnly = window.confirm(deleteGroupOnlyMsg);
        if (!deleteGroupOnly) {
          // Отмена
          return;
        }
        await chrome.runtime.sendMessage({ type: 'DELETE_TEST_GROUP', groupId: id });
      }
      await this.loadTests();
    } catch (error) {
      console.error('Error deleting group:', error);
      alert(this.t ? this.t('popup.deleteGroupError', { msg: error?.message }) : ('Error: ' + error?.message));
    }
  }

  /**
   * Убрать тест из группы (тест остаётся в списке как одиночный).
   */
  async removeTestFromGroup(groupId, testId) {
    const gid = String(groupId);
    const tid = String(testId);
    const groups = this.state.testGroups || [];
    const group = groups.find(g => String(g.id) === gid);
    if (!group || !Array.isArray(group.testIds)) return;
    const newIds = group.testIds.filter(id => String(id) !== tid);
    if (newIds.length === group.testIds.length) return;
    try {
      const updated = { ...group, testIds: newIds };
      await chrome.runtime.sendMessage({ type: 'UPDATE_TEST_GROUP', group: updated });
      await this.loadTests();
    } catch (error) {
      console.error('Error removing test from group:', error);
      alert(this.t ? this.t('popup.removeFromGroupError', { msg: error?.message }) : ('Error: ' + error?.message));
    }
  }

  /**
   * Перестановка теста внутри группы: fromTestId становится перед/на место toTestId.
   */
  async reorderTestInGroup(groupId, fromTestId, toTestId) {
    try {
      const id = String(groupId);
      const fromId = String(fromTestId);
      const toId = String(toTestId);
      const groups = this.state.testGroups || [];
      const group = groups.find(g => String(g.id) === id);
      if (!group || !Array.isArray(group.testIds)) return;
      const current = group.testIds.map(String);
      const fromIndex = current.indexOf(fromId);
      const toIndex = current.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      current.splice(fromIndex, 1);
      const insertIndex = current.indexOf(toId);
      current.splice(insertIndex, 0, fromId);
      const updatedGroup = { ...group, testIds: current };
      await chrome.runtime.sendMessage({
        type: 'UPDATE_TEST_GROUP',
        group: updatedGroup
      });
      // Локально обновляем state и перерисовываем список
      this.state.testGroups = groups.map(g => String(g.id) === id ? updatedGroup : g);
      await this.renderTests();
    } catch (error) {
      console.error('Error reordering test in group:', error);
    }
  }

  /**
   * Создать новую пустую группу (имя + цвет выбираются в модальном окне).
   */
  async createNewGroup() {
    this._openGroupEditorModalForCreate({ testIds: [] });
  }

  /**
   * Создать новый пустой тест и открыть редактор (для полноэкранного режима).
   */
  async createNewTest() {
    try {
      const newId = 't' + Date.now();
      const nowIso = new Date().toISOString();
      const defaultName = (this.t && this.t('popup.newTestNameDefault')) || 'New test';
      const testData = {
        id: newId,
        name: defaultName,
        actions: [],
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const response = await chrome.runtime.sendMessage({ type: 'UPDATE_TEST', test: testData });
      if (response && response.success) {
        await this.loadTests();
        const editorUrl = chrome.runtime.getURL('editor/editor.html') + '?testId=' + newId;
        chrome.tabs.create({ url: editorUrl });
      } else {
        if (response?.error === 'FREE_TIER_LIMIT') {
          this.showUpgradeModal(response.limit);
          return;
        }
        alert(this.t ? this.t('popup.createGroupError', { msg: response?.error }) : 'Error: ' + (response?.error || 'Unknown'));
      }
    } catch (err) {
      console.error('createNewTest error:', err);
      alert(this.t ? this.t('popup.createGroupError', { msg: err?.message }) : 'Error: ' + (err?.message || err));
    }
  }

  /**
   * Показать окно выбора группы для добавления теста (или создать новую группу).
   */
  showAddToGroupDropdown(testId, anchorButton) {
    this._closeAddToGroupDropdown();
    const groups = Array.isArray(this.state.testGroups) ? this.state.testGroups : [];
    const testIdSafe = this.escapeHtml(testId);

    let itemsHtml = `
      <button type="button" class="add-to-group-item add-to-group-new" data-action="new">
        ${this.t('popup.createNewGroupOption') || '➕ Новая группа…'}
      </button>
    `;

    if (groups.length > 0) {
      itemsHtml += groups.map((g) => {
        const name = g.name || (this.t && this.t('popup.unnamedGroup')) || 'Group';
        const count = (g.testIds || []).length;
        return `
          <button type="button" class="add-to-group-item" data-group-id="${this.escapeHtml(g.id)}">
            ${this.escapeHtml(name)} (${count})
          </button>
        `;
      }).join('');
    } else {
      itemsHtml += `
        <div class="empty-state" style="padding: 8px 12px; text-align: left; font-size: 13px;">
          ${this.t('popup.groupEmpty') || 'Нет групп. Создайте новую.'}
        </div>
      `;
    }

    const modalHtml = `
      <div class="modal-overlay" id="addToGroupModal">
        <div class="modal-content" style="max-width: 420px;">
          <div class="modal-header">
            <h3>${this.t('popup.addToGroupTitle') || 'Добавить в группу'}</h3>
            <button class="modal-close" id="closeAddToGroupModal">×</button>
          </div>
          <div class="modal-body" style="padding: 6px 0;">
            <div class="add-to-group-dropdown" data-test-id="${testIdSafe}">
              ${itemsHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    // Удаляем старое окно, если осталось
    const existing = document.getElementById('addToGroupModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('addToGroupModal');
    if (!modal) return;

    this._addToGroupDropdownEl = modal;

    const close = () => this._closeAddToGroupDropdown();

    // Обработчики закрытия
    modal.querySelector('#closeAddToGroupModal')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    const container = modal.querySelector('.add-to-group-dropdown');
    if (!container) return;

    // Новая группа
    const newBtn = container.querySelector('.add-to-group-item.add-to-group-new');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        this._addTestToNewGroup(testId);
        close();
      });
    }

    // Существующие группы
    container.querySelectorAll('.add-to-group-item[data-group-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const groupId = btn.getAttribute('data-group-id');
        if (groupId) {
          this._addTestToGroup(groupId, testId);
        }
        close();
      });
    });
  }

  _closeAddToGroupDropdown() {
    if (this._addToGroupDropdownEl) {
      try {
        if (this._addToGroupDropdownEl.parentNode) {
          this._addToGroupDropdownEl.parentNode.removeChild(this._addToGroupDropdownEl);
        }
      } catch (e) {
        // ignore
      }
      this._addToGroupDropdownEl = null;
    }
  }

  async _addTestToGroup(groupId, testId) {
    const groups = this.state.testGroups || [];
    const group = groups.find(g => String(g.id) === String(groupId));
    if (!group) return;
    const ids = (group.testIds || []).map(String);
    if (ids.includes(String(testId))) return;
    const updated = { ...group, testIds: [...ids, String(testId)] };
    await chrome.runtime.sendMessage({ type: 'UPDATE_TEST_GROUP', group: updated });
    await this.loadTests();
  }

  async _addTestToNewGroup(testId) {
    this._openGroupEditorModalForCreate({ testIds: [String(testId)] });
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
  async updateAnalyticsDashboardButton() {
    const btn = document.getElementById('analyticsDashboardButton');
    if (!btn) return;
    const enabled = this.pluginSettings?.analytics?.enabled === true;
    const access = await this.requestAccessDecision('analytics.view');
    const url = chrome.runtime.getURL('analytics/analytics-dashboard.html');
    btn.href = url;
    if (enabled && access.allowed !== false) {
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
    try {
      // Если content scripts уже загружены — не инжектим повторно (избегаем "already declared")
      let pingOk = false;
      for (let i = 0; i < 3; i++) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'PING_CONTENT_SCRIPT' });
          pingOk = true;
          console.log('📦 [Popup] Content scripts уже загружены, пропускаю инъекцию');
          break;
        } catch (_) {
          if (i < 2) await new Promise(r => setTimeout(r, 80));
        }
      }
      if (!pingOk) {
        console.log('📦 [Popup] Вставляю скрипты инспектора для вкладки:', tabId);
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
      }
      
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
      if (namespace === 'local' && (changes.license || changes.tierAccessRolloutEnabled)) {
        this.applyTierVisibility();
      }
    });
  }

  async requestAccessDecision(action) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_ACCESS',
        action,
        context: { source: 'popup' }
      });
      if (!response?.success) return { allowed: true };
      return response;
    } catch (_) {
      return { allowed: true };
    }
  }

  async applyTierVisibility() {
    try {
      const nodes = document.querySelectorAll('[data-access-action]');
      await Promise.all(
        Array.from(nodes).map(async (node) => {
          const action = node.getAttribute('data-access-action');
          if (!action) return;
          const decision = await this.requestAccessDecision(action);
          const shouldShow = decision.allowed !== false;
          node.classList.toggle('hidden', !shouldShow);
          node.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        })
      );
    } catch (error) {
      console.warn('[Popup] applyTierVisibility failed:', error);
    }
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