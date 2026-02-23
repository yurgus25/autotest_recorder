// Редактор тестов с возможностью редактирования селекторов, методов ввода and действий

// Загрузка общего модуля с типами действий
// Используется singleton из window.ActionTypes (загружается через <script> в editor.html)

class TestEditor {
  constructor() {
    this.test = null;
    this.currentEditingAction = null;
    this.currentEditingActionType = null; // Тип редактируемого действия: 'action', 'condition', 'loop'
    this.currentParentAction = null; // Индекс родительского действия (цикл/условие), если добавляем действие внутрь
    this.currentBranch = null; // Ветка условия ('then'/'else') или 'loop', если добавляем действие внутрь
    this.draggedElement = null;
    this.allCollapsed = false; // Состояние: все свернуты или нет
    this.showUrls = false; // Состояние: показывать URL или нет (по умолчанию скрыт)
    this.showFieldLabels = false; // Состояние: показывать наименования полей или нет (по умолчанию скрыт)
    this.isDarkTheme = false; // Состояние: темная тема включена или нет
    this.collapsedGroups = new Set(); // Свернутые группы страниц
    // Загружаем состояние группировки из localStorage, по умолчанию false (без группировки)
    const savedGroupByUrl = localStorage.getItem('groupByUrl');
    this.groupByUrl = savedGroupByUrl === 'true'; // По умолчанию false (без группировки)
    
    // Система переменных
    this.variables = {
      scenario: [], // Переменные сценария
      loop: [],     // Переменные циклов
      condition: [], // Переменные условий
      global: []    // Глобальные переменные
    };
    
    // Защита от случайного удаления циклов/условий
    this.protectedElements = new Set();
    this.dragDeleteWarningTimeout = null;

    // Контракт поддерживаемых действий (загружается из shared/action-types.js)
    // ИСПРАВЛЕНИЕ #30: Используем единый источник истины
    if (window.ActionTypes) {
      this.runtimeSupportedActionTypes = window.ActionTypes.SUPPORTED_ACTION_TYPES;
      this.runtimeSupportedSubtypes = window.ActionTypes.SUPPORTED_SUBTYPES;
      this.runtimeUnsupportedQuickTemplates = window.ActionTypes.UNSUPPORTED_QUICK_TEMPLATES;
    } else {
      console.error('❌ [Editor] shared/action-types.js не загружен!');
      // Fallback на старые значения для обратной совместимости
      this.runtimeSupportedActionTypes = new Set([
        'click', 'dblclick', 'input', 'change', 'navigation', 'scroll',
        'wait', 'keyboard', 'api', 'variable', 'setVariable', 'assertion',
        'loop', 'condition', 'javascript', 'screenshot', 'hover', 'focus',
        'blur', 'clear', 'upload', 'cookie'
      ]);
      this.runtimeSupportedSubtypes = {
        wait: new Set(['wait-value', 'wait-option', 'wait-options-count', 'wait-enabled', 'wait-until']),
        assertion: new Set(['assert-value', 'assert-contains', 'assert-count', 'assert-disabled', 'assert-multiselect']),
        scroll: new Set(['scroll-element', 'scroll-top', 'scroll-bottom']),
        navigation: new Set(['nav-refresh', 'nav-back', 'nav-forward', 'new-tab', 'close-tab']),
        click: new Set(['click', 'right-click', 'double-click']),
        cookie: new Set(['set-cookie', 'get-cookies']),
        screenshot: new Set(['visual-screenshot', 'page-screenshot'])
      };
      this.runtimeUnsupportedQuickTemplates = new Set([
        'dropdown-select', 'dropdown-multiselect', 'dropdown-deselect',
        'dropdown-datalist', 'dropdown-combobox',
        'keyboard-navigate', 'keyboard-typeahead', 'keyboard-escape',
        'dropdown-select-all', 'dropdown-clear-all', 'dropdown-toggle-all', 'dropdown-copy', 'dropdown-paste', 'dropdown-reorder',
        'visual-compare', 'visual-baseline', 'visual-compare-baseline', 'visual-record-start', 'visual-record-stop',
        'ai-smart-selector', 'ai-analyze-stability', 'ai-suggest-alternatives', 'ai-find-healing', 'ai-heal-selector', 'ai-learn-failures',
        'cloud-upload', 'cloud-execute', 'cloud-results', 'cloud-schedule',
        'export-suite', 'import-suite', 'validate-suite', 'save-file', 'load-file',
        'switch-tab', 'swipe-up', 'swipe-down', 'swipe-left', 'swipe-right', 'pinch-in', 'pinch-out',
        'switch-iframe', 'switch-parent', 'accept-alert', 'dismiss-alert', 'get-alert-text'
      ]);
    }
    
    
    this.init();
  }

  async init() {
    // Initialize i18n
    if (window.i18n) {
      try { await window.i18n.init(); window.i18n.applyToDOM(); } catch(e) {}
    }
    
    // Initialize button labels after i18n is loaded
    this.updateCollapseButton();
    this.updateShowUrlsButton();
    this.updateShowFieldLabelsButton();
    
    // Get testId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('testId');

    if (!testId) {
      alert(this.t('editorUI.testNotSpecified'));
      window.close();
      return;
    }

    // Загружаем тест
    await this.loadTest(testId);
    
    // Обновляем кнопку группировки после загрузки теста
    this.updateGroupingButton();

    this.fullRunBtn = document.getElementById('fullRun');
    this.optimizedRunBtn = document.getElementById('optimizedRun');
    this.debugRunBtn = document.getElementById('debugRun');
    this.optimizationStatusEl = document.getElementById('optimizationStatus');

    // Привязываем обработчики
    document.getElementById('saveTest').addEventListener('click', () => this.saveTest());
    const startRecordIntoTestBtn = document.getElementById('startRecordIntoTest');
    if (startRecordIntoTestBtn) {
      startRecordIntoTestBtn.addEventListener('click', () => this.startRecordingIntoTest());
    }
    document.getElementById('exportTest').addEventListener('click', () => this.exportTest());
    document.getElementById('importTest').addEventListener('click', () => this.importTest());
    document.getElementById('importApiTest').addEventListener('click', () => this.showImportApiModal());
    document.getElementById('closeImportApiModal').addEventListener('click', () => this.closeImportApiModal());
    document.getElementById('cancelImportApiBtn').addEventListener('click', () => this.closeImportApiModal());
    document.getElementById('apiSpecFile').addEventListener('change', (e) => this.handleApiSpecFileSelect(e));
    document.getElementById('importApiBtn').addEventListener('click', () => this.importSelectedApiEndpoints());
    document.getElementById('selectAllEndpoints').addEventListener('click', () => this.toggleSelectAllEndpoints());
    if (this.fullRunBtn) {
      this.fullRunBtn.addEventListener('click', () => this.playTest('full'));
    }
    if (this.optimizedRunBtn) {
      this.optimizedRunBtn.addEventListener('click', () => this.playTest('optimized'));
    }
    if (this.debugRunBtn) {
      this.debugRunBtn.addEventListener('click', () => this.playTest('debug'));
    }
    this.parallelRunBtn = document.getElementById('parallelRun');
    if (this.parallelRunBtn) {
      this.parallelRunBtn.addEventListener('click', () => this.playTestParallel());
    }

    // Инициализация быстрых шагов
    this.initQuickActions();
    
    // Инициализация модального окна извлечения переменной со страницы
    this.initPageGrabberModal();
    
    // Инициализация модального окна переменных из localStorage
    this.initLocalStorageVariablesModal();
    
    // Инициализация панели переменных
    this.initVariablesPanel();
    
    // Обработчики для основных действий теперь в initQuickActions()
    document.getElementById('toggleCollapseAll').addEventListener('click', () => this.toggleCollapseAll());
    document.getElementById('toggleShowUrls').addEventListener('click', () => this.toggleShowUrls());
    document.getElementById('toggleShowFieldLabels').addEventListener('click', () => this.toggleShowFieldLabels());
    document.getElementById('toggleTheme').addEventListener('click', () => this.toggleTheme());
    document.getElementById('toggleGrouping').addEventListener('click', () => this.toggleGrouping());
    
    // Загружаем сохраненную тему
    this.loadTheme();
    document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancelAction').addEventListener('click', () => this.closeModal());
    document.getElementById('saveAction').addEventListener('click', () => this.saveAction());
    
    // Обработчики для Telegram модального окна
    document.getElementById('closeTelegramModal').addEventListener('click', () => this.closeTelegramModal());
    document.getElementById('cancelTelegramAction').addEventListener('click', () => this.closeTelegramModal());
    document.getElementById('saveTelegramAction').addEventListener('click', () => this.saveTelegramAction());
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.handleDocumentClick);

    // Горячие клавиши: Ctrl+S — сохранить, Ctrl+Enter — запуск (оптимизированный)
    this.editorHotkeyHandler = (e) => {
      const target = e.target;
      const isEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (isEditable && !e.ctrlKey && !e.metaKey) return;
      
      // Ctrl+S - Save test
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveTest();
        return;
      }
      
      // Ctrl+Enter - Run optimized test
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (this.test && this.test.actions && this.test.actions.length) this.playTest('optimized');
        return;
      }
      
      // F10 - Run test (was F5, changed to avoid conflict with browser refresh)
      if (e.key === 'F10') {
        e.preventDefault();
        if (this.test && this.test.actions && this.test.actions.length) {
          this.playTest('full');
        }
        return;
      }
      
      // F9 - Debug mode
      if (e.key === 'F9') {
        e.preventDefault();
        if (this.test && this.test.actions && this.test.actions.length) {
          this.playTest('debug');
        }
        return;
      }
    };
    document.addEventListener('keydown', this.editorHotkeyHandler);

    // Инициализация модального окна переменных (старая система)
    this.initVariablesModal();
    
    // Загрузка переменных из теста
    this.loadVariables();
    
    // Инициализация переменных сценария (новая система)
    if (!this.test.variables) {
      this.test.variables = {};
    }
    this.renderVariablesPanel();

    // Закрытие модального окна по клику вне его
    document.getElementById('actionModal').addEventListener('click', (e) => {
      if (e.target.id === 'actionModal') {
        this.closeModal();
      }
    });

    // Привязываем делегированный обработчик для кнопок действий (один раз)
    const actionsList = document.getElementById('actionsList');
    actionsList.addEventListener('click', (e) => {
      // Проверяем клик на кнопку вставки
      const insertButton = e.target.closest('.action-insert-before, .action-insert-after');
      if (insertButton) {
        e.preventDefault();
        e.stopPropagation();
        const position = insertButton.getAttribute('data-insert-position');
        const targetIndexStr = insertButton.getAttribute('data-target-index');
        
        // Проверяем, что это не вложенное действие (не начинается с loop-, then-, else-)
        if (targetIndexStr && !targetIndexStr.match(/^(loop|then|else)-/)) {
          const targetIndex = parseInt(targetIndexStr);
          if (!isNaN(targetIndex)) {
            this.insertActionAtPosition(targetIndex, position === 'before' ? targetIndex : targetIndex + 1);
          }
        }
        return;
      }
      
      // Обработка клика на action-item для показа кнопок вставки
      // Проверяем, что это не вложенное действие (не внутри цикла/условия)
      const actionItem = e.target.closest('.action-item[data-index]:not([data-index^="loop-"]):not([data-index^="then-"]):not([data-index^="else-"]):not(.inside-nested)');
      if (actionItem && !e.target.closest('button') && !e.target.closest('.clickable-number') && !e.target.closest('.drag-handle') && !insertButton) {
        // Проверяем, что у элемента есть кнопки вставки (не внутри цикла/условия)
        const hasInsertButtons = actionItem.querySelector('.action-insert-before, .action-insert-after');
        if (hasInsertButtons) {
          // Скрываем кнопки вставки у всех элементов
          document.querySelectorAll('.action-item.show-insert-buttons').forEach(item => {
            item.classList.remove('show-insert-buttons');
          });
          // Показываем кнопки вставки у текущего элемента
          actionItem.classList.add('show-insert-buttons');
          return;
        }
      }
      
      // Если клик не на action-item and не на кнопку вставки, скрываем все кнопки вставки
      if (!actionItem && !insertButton) {
        document.querySelectorAll('.action-item.show-insert-buttons').forEach(item => {
          item.classList.remove('show-insert-buttons');
        });
      }
      
      // Обработка клика по заголовку группы
      const groupHeader = e.target.closest('[data-group-toggle]');
      if (groupHeader) {
        e.preventDefault();
        e.stopPropagation();
        const groupUrl = groupHeader.getAttribute('data-group-toggle');
        this.toggleGroup(groupUrl);
        return;
      }
      
      // Проверяем клик по URL для копирования в буфер обмена
      const urlElement = e.target.closest('.clickable-url');
      if (urlElement) {
        e.preventDefault();
        e.stopPropagation();
        const url = urlElement.getAttribute('data-url');
        if (url) {
          this.copyToClipboard(url);
          this.showToast(this.t('editorUI.urlCopied'), 'success');
        }
        return;
      }
      
      // Проверяем клик по номеру действия (для переключения видимости или редактирования номера)
      const numberElement = e.target.closest('.clickable-number');
      if (numberElement && !e.target.closest('.drag-handle')) {
        // Проверяем, что это не drag операция
        const indexStr = numberElement.getAttribute('data-action-index');
        const index = parseInt(indexStr);
        
        // Проверяем, активно ли редактирование номера шага (есть ли input внутри)
        const isEditing = numberElement.querySelector('input[type="number"]') !== null;
        
        // Если редактирование активно, не обрабатываем обычные клики (они не должны скрывать шаг)
        if (isEditing && e.detail === 1) {
          // Разрешаем клики только по самому input или его стрелкам
          if (e.target.tagName !== 'INPUT' && !e.target.closest('input')) {
            return; // Игнорируем клики вне input во время редактирования
          }
        }
        
        // Проверяем, является ли это вложенным действием
        let isNestedAction = false;
        let parentIndex = null;
        let branchIndex = null;
        let branch = null;
        
        if (isNaN(index) && typeof indexStr === 'string') {
          const match = indexStr.match(/(loop|then|else)-(\d+)-(\d+)/);
          if (match) {
            isNestedAction = true;
            branch = match[1];
            parentIndex = parseInt(match[2]);
            branchIndex = parseInt(match[3]);
          }
        }
        
        // Обработка двойного клика для редактирования номера (только для основных действий, не вложенных)
        if (e.detail === 2 && !isNestedAction && !isNaN(index)) {
          e.preventDefault();
          e.stopPropagation();
          this.editStepNumber(index, numberElement);
          return;
        }
        
        // Обычный клик для переключения видимости (только если редактирование не активно)
        if (!isEditing) {
          if (isNestedAction) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleNestedActionVisibility(parentIndex, branch, branchIndex);
            return;
          } else if (!isNaN(index)) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleActionVisibility(index);
            return;
          }
        }
      }
      
      // Обработка двойного клика по drag-handle (☰) для редактирования номера шага
      const dragHandle = e.target.closest('.drag-handle');
      if (dragHandle && e.detail === 2) {
        // Находим родительский action-item
        const actionItem = dragHandle.closest('.action-item[data-index]');
        if (actionItem) {
          const indexStr = actionItem.getAttribute('data-index');
          const index = parseInt(indexStr);
          
          // Проверяем, что это не вложенное действие (вложенные имеют формат "loop-X-Y", "then-X-Y", "else-X-Y")
          const isNestedAction = typeof indexStr === 'string' && /^(loop|then|else)-\d+-\d+$/.test(indexStr);
          
          if (!isNaN(index) && !isNestedAction) {
            // Находим элемент с номером шага
            const numberElement = actionItem.querySelector('.clickable-number');
            if (numberElement) {
              e.preventDefault();
              e.stopPropagation();
              this.editStepNumber(index, numberElement);
              return;
            }
          }
        }
      }
      
      // Обработка кнопок действий
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      const action = button.getAttribute('data-action');
      
      // Для кнопок add-action-to-branch and add-action-to-loop index обязателен
      if (action === 'add-action-to-branch' || action === 'add-action-to-loop') {
        const index = parseInt(button.getAttribute('data-action-index'));
        if (isNaN(index)) {
          console.warn('⚠️ Не указан индекс для кнопки добавления действия');
          return;
        }
        
        if (action === 'add-action-to-branch') {
          e.preventDefault();
          e.stopPropagation();
          const branch = button.getAttribute('data-branch');
          if (branch) {
            this.showAddActionToBranchModal(index, branch);
          }
          return;
        }
        
        if (action === 'add-action-to-loop') {
          e.preventDefault();
          e.stopPropagation();
          console.log(`🖱️ [Editor] Клик по кнопке "Добавить в цикл": index=${index}, type=${typeof index}, button=${button.outerHTML.substring(0, 200)}`);
          this.showAddActionToLoopModal(index);
          return;
        }
      }
      
      // Получаем индекс действия (может быть строкой вида "loop-X-Y" для действий внутри цикла)
      const indexStr = button.getAttribute('data-action-index');
      let index = parseInt(indexStr);
      let isNestedAction = false;
      let parentIndex = null;
      let branchIndex = null;
      let branch = null;
      
      // Проверяем, является ли это действием внутри цикла или условия
      if (isNaN(index) && typeof indexStr === 'string') {
        const match = indexStr.match(/(loop|then|else)-(\d+)-(\d+)/);
        if (match) {
          isNestedAction = true;
          branch = match[1];
          parentIndex = parseInt(match[2]);
          branchIndex = parseInt(match[3]);
          console.log(`🔍 [Editor] Обнаружено вложенное действие: branch=${branch}, parentIndex=${parentIndex}, branchIndex=${branchIndex}`);
        } else {
          console.warn(`⚠️ [Editor] Некорректный индекс действия: ${indexStr}`);
          return;
        }
      } else if (isNaN(index)) {
        console.warn(`⚠️ [Editor] Не удалось распарсить индекс: ${indexStr}`);
        return;
      }

      switch (action) {
        case 'edit':
          if (isNestedAction) {
            this.editNestedAction(parentIndex, branch, branchIndex);
          } else {
            this.editAction(index);
          }
          break;
        case 'duplicate':
          if (isNestedAction) {
            this.duplicateNestedAction(parentIndex, branch, branchIndex);
          } else {
            this.duplicateAction(index);
          }
          break;
        case 'toggle-visibility':
          if (isNestedAction) {
            this.toggleNestedActionVisibility(parentIndex, branch, branchIndex);
          } else {
            this.toggleActionVisibility(index);
          }
          break;
        case 'toggle-record-marker':
          if (isNestedAction) {
            this.toggleNestedActionRecordMarker(parentIndex, branch, branchIndex);
          } else {
            this.toggleRecordMarker(index);
          }
          break;
        case 'delete':
          if (isNestedAction) {
            this.deleteNestedAction(parentIndex, branch, branchIndex);
          } else {
            this.deleteAction(index);
          }
          break;
        case 'execute-api':
          if (isNestedAction) {
            // Для вложенных действий получаем действие из родителя
            const parentAction = this.test.actions[parentIndex];
            if (parentAction && parentAction[branch] && parentAction[branch][branchIndex]) {
              this.executeApiAction(parentAction[branch][branchIndex], `${parentIndex}-${branch}-${branchIndex}`);
            }
          } else {
            this.executeApiAction(this.test.actions[index], index);
          }
          break;
        case 'toggle-selector-list':
          e.preventDefault();
          e.stopPropagation();
          if (isNestedAction) {
            // Для вложенных действий используем строковый индекс
            this.toggleSelectorDropdown(indexStr, button);
          } else {
            this.toggleSelectorDropdown(index, button);
          }
          break;
        case 'remove-reserve-selector':
          e.preventDefault();
          e.stopPropagation();
          {
            const reserveIndex = parseInt(button.getAttribute('data-reserve-index'));
            if (!isNaN(reserveIndex)) {
              if (isNestedAction) {
                this.removeReserveSelectorForNestedAction(parentIndex, branch, branchIndex, reserveIndex);
              } else {
                this.removeReserveSelector(index, reserveIndex);
              }
            }
          }
          break;
        case 'selector-move-up':
        case 'selector-move-down':
        case 'selector-remove-entry':
          e.preventDefault();
          e.stopPropagation();
          {
            const source = button.getAttribute('data-selector-source') || 'user';
            const orderIndex = parseInt(button.getAttribute('data-selector-order-index'));
            const sourceIndex = parseInt(button.getAttribute('data-selector-index'));
            const selectorValue = button.getAttribute('data-selector-value') || '';
            if (!isNaN(orderIndex)) {
              if (isNestedAction) {
                if (action === 'selector-remove-entry') {
                  this.removeSelectorEntryForNestedAction(parentIndex, branch, branchIndex, source, orderIndex, sourceIndex, selectorValue, indexStr);
                } else {
                  const direction = action === 'selector-move-up' ? -1 : 1;
                  this.moveSelectorEntryForNestedAction(parentIndex, branch, branchIndex, source, orderIndex, sourceIndex, selectorValue, direction, indexStr);
                }
              } else {
                if (action === 'selector-remove-entry') {
                  this.removeSelectorEntry(index, source, orderIndex, sourceIndex, selectorValue, indexStr);
                } else {
                  const direction = action === 'selector-move-up' ? -1 : 1;
                  this.moveSelectorEntry(index, source, orderIndex, sourceIndex, selectorValue, direction, indexStr);
                }
              }
            }
          }
          break;
        case 'regenerate-selector':
          e.preventDefault();
          e.stopPropagation();
          if (isNestedAction) {
            this.regenerateSelectorForNestedAction(parentIndex, branch, branchIndex);
          } else {
            this.regenerateSelector(index);
          }
          break;
        case 'copy-selector':
          e.preventDefault();
          e.stopPropagation();
          if (isNestedAction) {
            this.copySelectorForNestedAction(parentIndex, branch, branchIndex);
          } else {
            this.copySelector(index);
          }
          break;
        case 'find-on-page':
          e.preventDefault();
          e.stopPropagation();
          if (isNestedAction) {
            this.findOnPageForNestedAction(parentIndex, branch, branchIndex);
          } else {
            this.findOnPage(index);
          }
          break;
      }
    });

    // Привязываем делегированный обработчик для inline редактирования полей
    actionsList.addEventListener('change', (e) => {
      const input = e.target;
      if (input.classList.contains('action-field-input')) {
        const field = input.getAttribute('data-field');
        const index = parseInt(input.getAttribute('data-index'));
        if (!isNaN(index) && field) {
          this.updateActionField(index, field, input.value);
        }
      }
    });
    
    // Обработчик для Enter в полях ввода (предотвращаем открытие редактирования)
    actionsList.addEventListener('keydown', (e) => {
      const input = e.target;
      if (input.classList.contains('action-field-input') && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const field = input.getAttribute('data-field');
        const index = parseInt(input.getAttribute('data-index'));
        
        if (!isNaN(index) && field) {
          // Если это поле селектора, добавляем резервный селектор
          if (field === 'selector') {
            this.addReserveSelector(index, input.value);
            // Снимаем фокус после добавления
            input.blur();
          } else {
            // Для других полей просто обновляем значение
            this.updateActionField(index, field, input.value);
            // Снимаем фокус
            input.blur();
          }
        }
      }
    }, true);

    chrome.runtime.onMessage.addListener(async (message) => {
      if (message.type === 'TEST_UPDATED' && this.test && message.testId === this.test.id) {
        // Тест был обновлен (например, снята метка проблемного селектора)
        console.log('📝 Тест обновлен, перезагружаю...');
        await this.loadTest(this.test.id, { silent: true });
        return;
      }
      

      
      if (message.type === 'TEST_OPTIMIZATION_UPDATED' && this.test && message.testId === this.test.id) {
        this.test.optimization = message.optimization;
        this.loadTest(this.test.id, { silent: true });
        
        // Экспорт в Excel после оптимизации, если включен
        if (window.ExcelExporter) {
          try {
            const exporter = new window.ExcelExporter();
            await exporter.init();
            if (exporter.shouldExportOnOptimize()) {
              await exporter.exportTestToExcel(this.test, 'optimize', {
                authData: this.getAuthData(),
                preconditions: this.getPreconditions()
              }, {
                promptForLocation: false
              });
            }
          } catch (error) {
            console.warn('⚠️ [ExcelExport] Ошибка при экспорте после оптимизации:', error);
          }
        }
      } else if (message.type === 'RECORDING_STOPPED' && this.test && message.testId === this.test.id) {
        // Запись остановлена, обновляем тест and снимаем маркер записи
        console.log(`✅ Запись остановлена, добавлено ${message.recordedCount || 0} действий`);
        // Загружаем обновленный тест
        await this.loadTest(this.test.id, { silent: true });
        // Снимаем маркер записи со всех действий после загрузки
        if (this.test && this.test.actions) {
          let hasMarker = false;
          this.test.actions.forEach(action => {
            if (action.recordMarker) {
              action.recordMarker = false;
              hasMarker = true;
            }
          });
          if (hasMarker) {
            // Сохраняем тест после снятия маркера
            this.test.updatedAt = new Date().toISOString();
            this.test.lastEditedBy = 'user';
            try {
              await chrome.runtime.sendMessage({
                type: 'UPDATE_TEST',
                test: this.test
              });
            } catch (error) {
              console.error('Ошибка при сохранении теста после снятия маркера:', error);
            }
            this.renderActions();
          }
        }
        // Показываем уведомление
        if (message.recordedCount > 0) {
          this.showToast(this.t('editorUI.recordingCompleteCount', { count: message.recordedCount }), 'success');
        } else {
          this.showToast(this.t('editorUI.recordingStopped'), 'success');
        }
      } else if (message.type === 'TEST_COMPLETED' && this.test && message.testId === this.test.id) {
        // Тест завершен, показываем уведомление
        if (message.success) {
          const duration = message.duration || 0;
          const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`;
          console.log(`✅ Тест "${this.test.name}" успешно завершен за ${durationStr}`);
          this.showToast(this.t('editorUI.testCompletedSuccess', { duration: durationStr }), 'success');
        } else {
          console.error(`❌ Тест "${this.test.name}" завершен с ошибкой:`, message.error);
          this.showToast(this.t('editorUI.testCompletedError', { error: message.error || this.t('common.unknownError') }), 'error');
        }
      } else if (message.type === 'SHOW_TOAST') {
        // Показываем toast уведомление
        this.showToast(message.message || this.t('editorUI.notification'), message.toastType || 'info');
      }
    });

    // Инициализируем drag and drop
    this.initDragAndDrop();
  }

  async loadTest(testId, options = {}) {
    const { silent = false } = options;
    try {
      // Проверяем, что extension готов
      if (!chrome.runtime || !chrome.runtime.id) {
        console.warn('⚠️ Extension не загружен при загрузке теста');
        if (!silent) {
          alert(this.t('editorUI.extensionNotReady'));
        }
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'GET_TEST',
        testId: testId
      });

      // Проверяем, что response не undefined
      if (!response) {
        throw new Error(this.t('editorUI.backgroundNoResponse'));
      }

      if (response.success && response.test) {
        this.test = response.test;
        document.getElementById('testName').value = this.test.name;
        
        
        // Инициализируем переменные, если их нет
        if (!this.test.variables) {
          this.test.variables = {};
        }
        
        // Извлекаем переменные из всех существующих действий
        if (this.test.actions && this.test.actions.length > 0) {
          this.extractVariablesFromActions(this.test.actions);
        }
        
        this.renderActions();
        this.renderMetadata();
        this.refreshOptimizationUI();
      } else {
        if (!silent) {
          const errorMsg = response?.error || this.t('editorUI.testNotFound');
          alert(errorMsg);
          window.close();
        } else {
          console.warn('Тест не найден:', response?.error || this.t('common.unknownError'));
        }
      }
    } catch (error) {
      const errorMessage = error?.message || String(error) || this.t('common.unknownError');
      const errorMsg = errorMessage === '[object Object]' ? this.t('common.unknownError') : errorMessage;
      
      console.error('❌ Ошибка при загрузке теста:', errorMsg);
      console.error('   Детали ошибки:', error);
      
      // Обрабатываем ошибки соединения
      if (errorMessage.includes('Receiving end does not exist') || 
          errorMessage.includes('Extension context invalidated') ||
          errorMessage.includes('Could not establish connection')) {
        if (!silent) {
          alert(this.t('editorUI.extensionNotReady'));
        } else {
          console.warn('⚠️ Background script не готов при загрузке теста');
        }
        return;
      }
      
      if (!silent) {
        // Проверяем, не связана ли ошибка с квотой хранилища
        if (errorMsg.includes('quota') || errorMsg.includes('QUOTA') || errorMsg.includes('QuotaExceededError')) {
          alert(this.t('editorUI.storageQuotaExceeded'));
        } else if (errorMsg.includes('undefined') || errorMsg === 'undefined') {
          console.warn('⚠️ Получена ошибка "undefined", возможно проблема с расширением. Попробуйте перезагрузить расширение.');
          alert(this.t('editorUI.testLoadError'));
        } else {
          alert(this.t('editorUI.testLoadErrorDetail', { error: errorMsg }));
        }
      }
    }
  }

  /**
   * Вычисляет видимый номер шага для действия с указанным индексом
   * (учитывает только не скрытые шаги)
   * Для скрытых шагов показывает номер, который они получат, если станут видимыми
   * Для действий внутри циклов and условий возвращает их локальный номер (1, 2, 3...)
   */
  getVisibleStepNumber(actionIndex, context = null) {
    // Если это действие внутри цикла или условия, пересчитываем номер с учётом скрытых шагов
    if (context && (context.parentIndex !== undefined || context.branch !== undefined)) {
      const parentIndex = context.parentIndex;
      const branch = context.branch;
      const branchIndex = context.branchIndex;
      
      // Получаем родительское действие (цикл или условие)
      const parentAction = this.test.actions[parentIndex];
      if (!parentAction) return actionIndex + 1;
      
      let actions = [];
      if (parentAction.type === 'loop') {
        actions = parentAction.actions || [];
      } else if (parentAction.type === 'condition') {
        if (branch === 'then') {
          actions = parentAction.thenActions || [];
        } else if (branch === 'else') {
          actions = parentAction.elseActions || [];
        }
      }
      
      // Подсчитываем количество видимых шагов до текущего индекса (не включая текущий)
      let visibleCount = 0;
      for (let i = 0; i < branchIndex; i++) {
        if (actions[i] && !actions[i].hidden) {
          visibleCount++;
        }
      }
      
      // Получаем текущее действие
      const currentAction = actions[branchIndex];
      const isHidden = currentAction && currentAction.hidden;
      
      // Если текущий шаг видимый, добавляем его к счетчику
      // Если скрытый, все равно добавляем 1, чтобы показать номер, который он получит при активации
      return visibleCount + 1;
    }
    
    if (!this.test.actions || actionIndex < 0 || actionIndex >= this.test.actions.length) {
      return actionIndex + 1;
    }
    
    const currentAction = this.test.actions[actionIndex];
    const isHidden = currentAction && currentAction.hidden;
    
    // Подсчитываем количество видимых шагов до текущего индекса (не включая текущий)
    // Учитываем, что циклы and условия - это один шаг, а действия внутри них не считаются
    let visibleCount = 0;
    for (let i = 0; i < actionIndex; i++) {
      const action = this.test.actions[i];
      if (!action.hidden) {
        visibleCount++;
        // Действия внутри циклов and условий не считаются в общей нумерации
        // Они уже учтены в самом цикле/условии
      }
    }
    
    // Если текущий шаг видимый, добавляем его к счетчику
    // Если скрытый, все равно добавляем 1, чтобы показать номер, который он получит при активации
    return visibleCount + 1;
  }

  renderActions() {
    const actionsList = document.getElementById('actionsList');
    this.closeAllSelectorDropdowns();

    if (!this.test.actions || this.test.actions.length === 0) {
      actionsList.innerHTML = '<div class="empty-state">' + this.t('editorUI.noActionsStart') + '</div>';
      return;
    }

    // Если группировка отключена, показываем все действия единым списком
    if (!this.groupByUrl) {
      actionsList.innerHTML = this.test.actions.map((action, index) => {
        const visibleStepNumber = this.getVisibleStepNumber(index);
        let html = this.renderActionItem(action, index, visibleStepNumber);
        
        // Добавляем зону после цикла или условия (вне блока)
        if (action.type === 'loop') {
          html += `<div class="after-loop-drop-zone" data-after-parent-index="${index}" data-drop-zone="after-loop"></div>`;
        } else if (action.type === 'condition') {
          html += `<div class="after-condition-drop-zone" data-after-parent-index="${index}" data-drop-zone="after-condition"></div>`;
        }
        
        return html;
      }).join('');
    } else {
      // Группируем действия по URL (страницам)
      const groupedActions = this.groupActionsByPage(this.test.actions);
      
      actionsList.innerHTML = groupedActions.map((group, groupIndex) => {
        return this.renderActionGroup(group, groupIndex);
      }).join('');
    }

    // Обработчики уже привязаны в init() через делегирование событий

    // Обновляем кнопку свернуть/развернуть все
    this.updateCollapseButton();
    // Обновляем кнопку показать/скрыть URL
    this.updateShowUrlsButton();
    // Обновляем кнопку показать/скрыть наименования полей
    this.updateShowFieldLabelsButton();
    // Обновляем кнопку группировки
    this.updateGroupingButton();

    // Обновляем drag and drop
    this.initDragAndDrop();
    this.refreshOptimizationUI();
  }

  /**
   * Группирует действия по страницам (URL)
   */
  groupActionsByPage(actions) {
    const groups = [];
    let currentGroup = null;
    
    actions.forEach((action, index) => {
      const url = action.url || window.location.href;
      const normalizedUrl = this.normalizeUrl(url);
      
      if (!currentGroup || currentGroup.url !== normalizedUrl) {
        // Новая группа
        currentGroup = {
          url: normalizedUrl,
          displayUrl: url,
          actions: [],
          startIndex: index
        };
        groups.push(currentGroup);
      }
      
      currentGroup.actions.push({ action, originalIndex: index });
    });
    
    return groups;
  }

  /**
   * Нормализует URL для группировки (убирает хэш and параметры запроса)
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) {
      return url.split('?')[0].split('#')[0];
    }
  }

  /**
   * Рендерит группу действий (страницу)
   */
  renderActionGroup(group, groupIndex) {
    const isCollapsed = this.collapsedGroups && this.collapsedGroups.has(group.url);
    const actionCount = group.actions.length;
    
    return `
      <div class="action-group" data-group-url="${this.escapeHtml(group.url)}">
        <div class="action-group-header" data-group-toggle="${group.url}">
          <span class="group-toggle-icon">${isCollapsed ? '▶' : '▼'}</span>
          <span class="group-url">${this.escapeHtml(group.displayUrl)}</span>
          <span class="group-action-count">${actionCount} ${this.pluralize(actionCount, this.t('editorUI.stepSingular'), this.t('editorUI.stepFew'), this.t('editorUI.stepMany'))}</span>
        </div>
        <div class="action-group-content ${isCollapsed ? 'collapsed' : ''}">
          ${group.actions.map(({ action, originalIndex }) => {
            const visibleStepNumber = this.getVisibleStepNumber(originalIndex);
            return this.renderActionItem(action, originalIndex, visibleStepNumber);
          }).join('')}
        </div>
      </div>
    `;
  }

  pluralize(count, one, few, many) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }

  renderActionItem(action, index, visibleStepNumber = null, parentContext = null) {
    // Если visibleStepNumber не передан, вычисляем его
    if (visibleStepNumber === null) {
      visibleStepNumber = this.getVisibleStepNumber(index);
    }
    
    // Для вложенных действий index может быть строкой вида "loop-X-Y"
    // Сохраняем его как есть для использования в data-атрибутах
    const actionIndex = typeof index === 'string' ? index : String(index);
    
    // Проверяем, является ли действие условием или циклом
    if (action.type === 'condition') {
      return this.renderConditionBlock(action, index, visibleStepNumber);
    }
    if (action.type === 'loop') {
      return this.renderLoopBlock(action, index, visibleStepNumber);
    }
    
    const isHidden = action.hidden || false;
    const isCollapsed = this.allCollapsed;
    // Проверяем, находится ли действие внутри цикла или условия
    const isInsideLoopOrCondition = parentContext !== null && (parentContext.branch === 'loop' || parentContext.branch === 'then' || parentContext.branch === 'else');
    // Для действий внутри циклов/условий в развёрнутом режиме используем компактный стиль кнопок
    // В свёрнутом режиме оставляем стандартный стиль
    const useCompactButtons = isInsideLoopOrCondition && !isCollapsed;
    const optimizationMeta = this.getOptimizationMeta(action);
    const isAutoOptimized = !!optimizationMeta;
    const hasRecordMarker = action.recordMarker === true; // Явная проверка на true для совместимости со старыми тестами
    const typeBadge = this.getActionTypeBadge(action.type);
    const primarySelector = this.getPrimarySelector(action);
    const selectorInfo = this.getSelectorInfo(primarySelector);
    const reserveStats = this.getSelectorReserveStats(action);
    const selectorDisplayValue = this.escapeHtml(selectorInfo);
    const actionValue = this.getActionValue(action);
    
    // Рассчитываем метрики качества селектора
    // Передаем сохраненное качество, чтобы не проверять селектор на текущей странице, если он был найден во время воспроизведения
    const selectorQuality = this.calculateSelectorQuality(primarySelector, action.selectorQuality);
    
    const qualityColor = this.getQualityIndicatorColor(selectorQuality);
    const qualityTooltip = this.getQualityTooltip(selectorQuality);
    
    // Проверяем наличие критических проблем (только реальные проблемы, не предупреждения)
    // Игнорируем предупреждения, если селектор работает and уникален
    // НЕ помечаем как проблемный, если селектор был успешно найден во время воспроизведения
    const hasProblematicPatterns = selectorQuality.issues && selectorQuality.issues.length > 0 && 
      (selectorQuality.issues.some(issue => 
        issue.includes('not found') || 
        issue.includes('not unique') || 
        issue.includes('Invalid') ||
        issue.includes('UUID') ||
        issue.includes('timestamp')
      ) || selectorQuality.score < 60 || selectorQuality.stability < 50);
    const classes = ['action-item', action.type];
    if (isHidden) classes.push('action-hidden');
    if (isCollapsed) classes.push('collapsed');
    if (isAutoOptimized) classes.push('action-optimized');
    // Добавляем класс для действий внутри циклов/условий
    if (isInsideLoopOrCondition) classes.push('inside-nested');
    const actionClassName = classes.join(' ');
    const optimizationBadge = isAutoOptimized ? `
      <span class="action-status-badge optimized" title="${this.escapeHtml(optimizationMeta.reason || this.t('editorUI.autoOptimization'))}">
        ⚡ Оптимизация
      </span>
    ` : '';
    const gigaChatBadge = '';
    const optimizationDetails = isAutoOptimized ? `
      <div class="optimization-details">
        <div><strong>Reason:</strong> ${this.escapeHtml(optimizationMeta.reason || this.t('editorUI.autoOptimization'))}</div>
        ${optimizationMeta.removedAt ? `<div><strong>When:</strong> ${this.formatDateTime(optimizationMeta.removedAt)}</div>` : ''}
      </div>
    ` : '';

    return `
      <div class="${actionClassName}" data-index="${actionIndex}">
        <div class="action-header ${isInsideLoopOrCondition ? 'nested-header' : ''}">
          <div class="action-type">
            <span class="selector-quality-indicator" style="background-color: ${qualityColor}" title="${this.escapeHtml(qualityTooltip)}"></span>
            ${hasProblematicPatterns ? '<span class="selector-warning-icon" title="⚠️ Problematic selector: ' + this.escapeHtml(selectorQuality.issues.join(', ')) + '">⚠️</span>' : ''}
            <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${actionIndex}" data-action="toggle-visibility" title="Click to ${isHidden ? 'show' : 'hide'} action. Double click to change step number.">
              ${isCollapsed ? '#' : '# '}${visibleStepNumber}
            </span>
            <span class="drag-handle">☰</span>
            <span class="action-type-badge ${action.type}">${this.getActionTypeIcon(action.type)} ${typeBadge}</span>
            ${(action.fieldLabel && this.showFieldLabels) ? `<span class="action-field-label" title="Field label">${this.escapeHtml(action.fieldLabel)}</span>` : ''}
            ${optimizationBadge}
            ${gigaChatBadge}
            ${isCollapsed ? `
              <span class="action-summary" title="${action.type === 'api' ? 
                this.escapeHtml((action.api?.method || 'GET') + ' ' + (action.api?.url || '')) : 
                this.escapeHtml(selectorInfo) + ' | ' + this.escapeHtml(actionValue)}">
                ${action.type === 'api' ? 
                  `🌐 ${this.escapeHtml((action.api?.method || 'GET') + ' ' + (action.api?.url || '').substring(0, 60))}${(action.api?.url || '').length > 60 ? '...' : ''}` :
                  `${this.escapeHtml(selectorInfo.substring(0, 60))}${selectorInfo.length > 60 ? '...' : ''} • ${this.escapeHtml(actionValue.substring(0, 40))}${actionValue.length > 40 ? '...' : ''}`
                }
              </span>
            ` : ''}
          </div>
          <div class="action-actions ${useCompactButtons ? 'compact-buttons' : ''}">
            ${action.type === 'api' ? `
            <button class="btn btn-small btn-success api-execute-btn" data-action="execute-api" data-action-index="${actionIndex}" title="Execute API request">
              ${(isCollapsed || useCompactButtons) ? '▶️' : '▶️ ' + this.t('editorUI.executeBtn')}
            </button>
            ` : ''}
            ${parentContext?.branch !== 'loop' ? `
            <button class="btn btn-small ${hasRecordMarker ? 'btn-record-active' : 'btn-record'}" data-action="toggle-record-marker" data-action-index="${actionIndex}" title="${hasRecordMarker ? 'Remove record marker' : 'Set record marker'}">
              ${(isCollapsed || useCompactButtons) ? (hasRecordMarker ? '🔴' : '⚪') : (hasRecordMarker ? '🔴 ' + this.t('editorUI.recordMarker') : '⚪ ' + this.t('editorUI.recordMarker'))}
            </button>
            ` : ''}
            <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${actionIndex}" title="Edit">
              ${(isCollapsed || useCompactButtons) ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}
            </button>
            <button class="btn btn-small btn-info" data-action="duplicate" data-action-index="${actionIndex}" title="Duplicate">
              ${(isCollapsed || useCompactButtons) ? '📋' : '📋 ' + this.t('editorUI.duplicateBtn')}
            </button>
            <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${actionIndex}" title="${isHidden ? 'Show' : 'Hide'}">
              ${(isCollapsed || useCompactButtons) ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}
            </button>
            <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${actionIndex}" title="Delete">
              ${(isCollapsed || useCompactButtons) ? '🗑️' : '🗑️ ' + this.t('editorUI.deleteBtn')}
            </button>
          </div>
        </div>
        <div class="action-content">
          ${action.type === 'api' ? `
            <div class="action-field api-request-field">
              <label>${this.t('editorUI.apiRequestLabel')}</label>
              <div class="api-request-info">
                <div class="api-method-badge api-method-${(action.api?.method || 'GET').toLowerCase()}">
                  ${this.escapeHtml(action.api?.method || 'GET')}
                </div>
                <input 
                  type="text" 
                  class="api-url-input" 
                  data-field="api.url"
                  data-index="${actionIndex}"
                  value="${this.escapeHtml(action.api?.url || '')}"
                  placeholder="Request URL"
                />
              </div>
            </div>
            <div class="action-field api-description-field">
              <label>${this.t('editorUI.apiStepDescription')}</label>
              <input 
                type="text" 
                class="action-field-input api-description-input" 
                data-field="api.description" 
                data-index="${actionIndex}"
                value="${this.escapeHtml(action.api?.description || '')}"
                placeholder="Enter API step description"
              />
            </div>
          ` : action.type === 'variable' ? `
            <div class="action-field">
              <label>${this.t('editorUI.variableLabel')}</label>
              <div class="action-field-value">${this.escapeHtml(action.variable?.name || '')} (${this.getVariableOperationName(action.variable?.operation)})</div>
            </div>
          ` : `
          <div class="action-field">
            <label>${this.t('editorUI.selectorLabel')}</label>
            <div class="selector-field-wrapper ${reserveStats.total > 0 ? 'has-reserves' : ''}">
              <div class="selector-input-with-indicator">
                <span class="selector-quality-indicator-inline" style="background-color: ${qualityColor}" title="${this.escapeHtml(qualityTooltip)}"></span>
                <input 
                  type="text" 
                  class="action-field-input ${hasProblematicPatterns ? 'selector-problematic' : ''}" 
                  data-field="selector" 
                  data-index="${actionIndex}"
                  value="${selectorDisplayValue}"
                  placeholder="Selector"
                >
                ${hasProblematicPatterns ? '<span class="selector-warning-icon-inline" title="⚠️ Problematic selector">⚠️</span>' : ''}
              </div>
              <button 
                type="button" 
                class="selector-dropdown-toggle" 
                data-action="toggle-selector-list" 
                data-action-index="${actionIndex}"
                title="Show backup selectors"
                aria-expanded="false"
              >
                <span class="toggle-icon">▾</span>
                ${reserveStats.total > 0 ? `<span class="selector-count">${reserveStats.total}</span>` : ''}
              </button>
            </div>
            <div class="selector-quick-actions">
              <button 
                type="button" 
                class="btn btn-tiny btn-quick-action" 
                data-action="regenerate-selector" 
                data-action-index="${actionIndex}"
                title="Regenerate selector"
              >
                🔄 Regenerate
              </button>
              <button 
                type="button" 
                class="btn btn-tiny btn-quick-action" 
                data-action="copy-selector" 
                data-action-index="${actionIndex}"
                title="Copy selector to clipboard"
              >
                📋 Copy
              </button>
              <button 
                type="button" 
                class="btn btn-tiny btn-quick-action" 
                data-action="find-on-page" 
                data-action-index="${actionIndex}"
                title="Find element on page and highlight"
              >
                🔍 Find on page
              </button>
            </div>
            <div class="selector-dropdown" data-selector-dropdown="${actionIndex}">
              ${this.renderSelectorDropdown(action, actionIndex)}
            </div>
            ${selectorInfo.includes('[') ? `
              <div class="selector-details">
                <strong>${this.t('editorUI.typeLabel')}</strong> ${primarySelector?.type || 'unknown'}<br>
                <strong>${this.t('editorUI.priorityLabel')}</strong> ${primarySelector?.priority || 'N/A'}
              </div>
            ` : ''}
          </div>
          <div class="action-field">
            <label>${this.t('editorUI.valueActionLabel')}</label>
            ${action.type === 'wait' ? `
              <input 
                type="number" 
                class="action-field-input" 
                data-field="delay" 
                data-index="${actionIndex}"
                value="${action.delay || action.value || 1000}"
                placeholder="ms (15000 = 15 sec)"
                min="1"
                step="1000"
              >
              <small style="display: block; margin-top: 4px; color: #666;">
                ${((action.delay || action.value || 1000) / 1000).toFixed(1)} сек
              </small>
            ` : action.type === 'keyboard' ? `
              <div style="padding: 8px; background: #f5f5f5; border-radius: 4px;">
                <strong>${this.escapeHtml(action.keyCombination || action.key || 'Unknown')}</strong>
                <br>
                <small style="color: #666;">
                  ${action.isGlobal !== false ? '🌐 Global (whole page)' : '📍 On element'}
                </small>
              </div>
            ` : action.type === 'setVariable' ? `
            <div class="set-variable-field">
              <span class="set-variable-prefix">\${${this.escapeHtml(action.variableName || 'var')}} =</span>
              <input 
                type="text" 
                class="action-field-input set-variable-input" 
                data-field="variableValue" 
                data-index="${actionIndex}"
                value="${this.escapeHtml(action.variableValue || action.variable?.value || action.value || '')}"
                placeholder="Variable value"
              >
            </div>
            ` : `
            <input 
              type="text" 
              class="action-field-input" 
              data-field="value" 
              data-index="${actionIndex}"
              value="${this.escapeHtml(actionValue)}"
              placeholder="Value"
            >
            `}
          </div>
          `}
          ${(action.url && this.showUrls && action.type !== 'api' && action.type !== 'variable') ? `
          <div class="action-field action-field-url">
            <label>${this.t('editorUI.pageUrlLabel')}</label>
            <div 
              class="action-url-display clickable-url" 
              data-url="${this.escapeHtml(action.url)}"
              data-action-index="${index}"
              title="Click to copy URL to clipboard"
            >
              <span class="url-text">${this.escapeHtml(action.url)}</span>
              <span class="url-copy-icon">📋</span>
            </div>
          </div>
          ` : ''}
          ${optimizationDetails}
          ${this.renderScreenshotComparison(action, index)}
        </div>
        ${!isInsideLoopOrCondition ? `
          <button class="action-insert-before" data-insert-position="before" data-target-index="${actionIndex}" title="Add step before this">+</button>
          <button class="action-insert-after" data-insert-position="after" data-target-index="${actionIndex}" title="Add step after this">+</button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Рендерит сравнение скриншотов для действия
   */
  renderScreenshotComparison(action, index) {
    if (!action.screenshotComparison && !action.screenshot) {
      return '';
    }
    
    const hasComparison = !!action.screenshotComparison;
    const hasScreenshot = !!action.screenshot;
    
    if (!hasComparison && !hasScreenshot) {
      return '';
    }
    
    let html = '<div class="screenshot-section">';
    html += '<label>📸 Screenshots</label>';
    
    if (hasScreenshot) {
      html += `
        <div class="screenshot-container">
          <img src="${action.screenshot}" alt="Screenshot on error" class="screenshot-image" />
          <small>${this.t('editorUI.screenshotOnErrorSmall')}</small>
        </div>
      `;
    }
    
    if (hasComparison) {
      const comparison = action.screenshotComparison;
      html += `
        <div class="screenshot-comparison">
          <div class="comparison-header">
            <span>${this.t('editorUI.screenshotCompLabel')}</span>
            <span class="comparison-badge ${comparison.hasDifferences ? 'has-differences' : 'no-differences'}">
              ${comparison.hasDifferences ? `⚠️ ${comparison.diffPercentage}% diff` : '✅ No diff'}
            </span>
          </div>
          ${comparison.diffImage ? `
            <div class="screenshot-container">
              <img src="${comparison.diffImage}" alt="Differences" class="screenshot-image" />
              <small>${this.t('editorUI.highlightedDiffs')}</small>
            </div>
          ` : ''}
          ${comparison.screenshotComparisonView ? `
            <div class="screenshot-container">
              <img src="${comparison.screenshotComparisonView}" alt="Comparison" class="screenshot-image" />
              <small>${this.t('editorUI.beforeAfterComp')}</small>
            </div>
          ` : ''}
        </div>
      `;
    }
    
    html += '</div>';
    return html;
  }

  getActionTypeIcon(type) {
    const icons = {
      'click': '🖱️',
      'dblclick': '🖱️',
      'input': '✏️',
      'change': '🔄',
      'scroll': '📜',
      'navigation': '🌐',
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

  getActionTypeBadge(type) {
    const badges = {
      'click': this.t('editorUI.actionTypeClick'),
      'dblclick': this.t('editorUI.actionTypeDblclick'),
      'input': this.t('editorUI.actionTypeInput'),
      'change': this.t('editorUI.actionTypeChange'),
      'scroll': this.t('editorUI.actionTypeScroll'),
      'navigation': this.t('editorUI.actionTypeNavigation'),
      'wait': this.t('editorUI.actionTypeWait'),
      'keyboard': this.t('editorUI.actionTypeKeyboard'),
      'api': this.t('editorUI.actionTypeApi'),
      'variable': this.t('editorUI.actionTypeVariable'),
      'setVariable': this.t('editorUI.actionTypeSetVariable'),
      'assertion': this.t('editorUI.actionTypeAssertion') || 'Assertion',
      'ai': this.t('editorUI.actionTypeAI') || 'AI',
      'cloud': this.t('editorUI.actionTypeCloud') || 'Cloud',
      'suite': this.t('editorUI.actionTypeSuite') || 'Suite',
      'javascript': this.t('editorUI.actionTypeJavaScript') || 'JavaScript',
      'screenshot': this.t('editorUI.actionTypeScreenshot') || 'Screenshot',
      'cookie': this.t('editorUI.actionTypeCookie') || 'Cookie',
      'mobile': this.t('editorUI.actionTypeMobile') || 'Mobile',
      'hover': this.t('editorUI.actionTypeHover') || 'Hover',
      'focus': this.t('editorUI.actionTypeFocus') || 'Focus',
      'blur': this.t('editorUI.actionTypeBlur') || 'Blur',
      'clear': this.t('editorUI.actionTypeClear') || 'Clear',
      'upload': this.t('editorUI.actionTypeUpload') || 'Upload'
    };
    return badges[type] || type;
  }

  getPrimarySelector(action) {
    if (!action) return null;
    if (typeof action.selector === 'string') {
      action.selector = {
        type: 'css',
        selector: action.selector,
        value: action.selector,
        priority: 10
      };
    }
    return action.selector || null;
  }

  getUserSelectors(action) {
    if (!action) return [];
    if (!Array.isArray(action.userSelectors)) {
      action.userSelectors = [];
    }
    return action.userSelectors;
  }

  getSelectorReserveStats(action) {
    const userSelectors = this.getUserSelectors(action);
    const primary = this.getPrimarySelector(action);
    const autoAlternatives = Array.isArray(primary?.alternatives) ? primary.alternatives : [];
    const normalizedPrimary = this.normalizeSelectorValue(primary?.selector || primary?.value);
    const optimizedReserves = this.getOptimizedReserves(action, normalizedPrimary);
    const uniqueAlternatives = autoAlternatives.filter((alt, idx, arr) => {
      const normalized = this.normalizeSelectorValue(alt?.selector);
      if (!normalized) return false;
      return arr.findIndex(item => this.normalizeSelectorValue(item?.selector) === normalized) === idx;
    });

    const total = userSelectors.length + uniqueAlternatives.length + optimizedReserves.length;
    const userSelected = userSelectors.find(sel => sel?.isUserSelected);

    return {
      total,
      userCount: userSelectors.length,
      autoCount: uniqueAlternatives.length,
      optimizedCount: optimizedReserves.length,
      hasUserSelected: !!userSelected
    };
  }

  getOptimizedReserves(action, normalizedPrimary = null) {
    if (!action) return [];
    const reserves = [];
    const seen = new Set();

    const pushReserve = (selectorObj, label) => {
      if (!selectorObj) return;
      const selectorValue = selectorObj.selector || selectorObj.value;
      const normalized = this.normalizeSelectorValue(selectorValue);
      if (!normalized || (normalizedPrimary && normalized === normalizedPrimary)) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      reserves.push({
        label: label || this.t('editorUI.optimizationLabel'),
        selector: selectorValue,
        meta: selectorObj
      });
    };

    if (action.originalSelector) {
      pushReserve(action.originalSelector, this.t('editorUI.historicalBest'));
    }

    if (Array.isArray(action.optimizedHistory)) {
      action.optimizedHistory.forEach((entry, idx) => {
        pushReserve(entry, `${this.t('editorUI.optimizationLabel')} #${idx + 1}`);
      });
    }

    return reserves;
  }

  getUniqueAutoAlternatives(action, normalizedPrimary = null) {
    const primary = this.getPrimarySelector(action);
    const alternatives = Array.isArray(primary?.alternatives) ? primary.alternatives : [];
    const seen = new Set();
    const unique = [];

    alternatives.forEach((alt, idx) => {
      const selectorValue = alt?.selector || alt?.value;
      const normalized = this.normalizeSelectorValue(selectorValue);
      if (!normalized) return;
      if (normalizedPrimary && normalized === normalizedPrimary) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      unique.push({
        alt,
        indexInAlternatives: idx,
        selectorValue
      });
    });

    return unique;
  }

  renderSelectorDropdown(action, index) {
    const primary = this.getPrimarySelector(action);
    const userSelectors = this.getUserSelectors(action);
    const alternatives = Array.isArray(primary?.alternatives) ? primary.alternatives : [];
    const normalizedPrimary = this.normalizeSelectorValue(primary?.selector);
    const optimizedReserves = this.getOptimizedReserves(action, normalizedPrimary);
    const autoAlternatives = this.getUniqueAutoAlternatives(action, normalizedPrimary);
    const includedSelectors = new Set();
    if (normalizedPrimary) {
      includedSelectors.add(normalizedPrimary);
    }

    const hasPrimaryUserTag = action.primaryUserTag === true &&
      this.normalizeSelectorValue(primary?.selector) === action.primaryUserTagValue;

    const entries = [
      {
        label: this.t('editorUI.bestSelectorLabel'),
        value: primary?.selector || '—',
        meta: primary,
        source: 'primary',
        orderIndex: 0,
        orderCount: 1,
        badges: [
          ...(hasPrimaryUserTag ? [this.t('editorUI.userCustom')] : []),
          'SelectorEngine',
          (primary?.suspicious || primary?.status === 'сомнительный' || primary?.demotedReason === 'not-found') ? this.t('editorUI.suspicious') : null,
          action.selectorOptimized ? this.t('editorUI.optimizationNew') : ''
        ].filter(Boolean),
        readonly: true
      }
    ];

    if (userSelectors.length > 0) {
      entries.push({
        divider: true,
        title: this.t('editorUI.userReserves')
      });

      userSelectors.forEach((sel, idx) => {
        const normalizedUser = this.normalizeSelectorValue(sel.selector);
        if (!normalizedUser || includedSelectors.has(normalizedUser)) {
          return;
        }
        includedSelectors.add(normalizedUser);
        entries.push({
          label: `Reserve #${idx + 1}`,
          value: sel.selector,
          meta: sel,
          source: 'user',
          orderIndex: idx,
          orderCount: userSelectors.length,
          badges: [
            this.t('editorUI.userCustom'),
            sel.isUserSelected ? this.t('editorUI.selected') : null,
            (sel?.suspicious || sel?.status === 'сомнительный' || sel?.demotedReason === 'not-found') ? this.t('editorUI.suspicious') : null
          ].filter(Boolean),
          removable: true,
          removableIndex: idx
        });
      });
    }

    if (optimizedReserves.length > 0) {
      entries.push({
        divider: true,
        title: this.t('editorUI.optimizedSelectors')
      });

      optimizedReserves.forEach((opt, idx) => {
        const normalizedOpt = this.normalizeSelectorValue(opt.selector);
        if (!normalizedOpt || includedSelectors.has(normalizedOpt)) {
          return;
        }
        includedSelectors.add(normalizedOpt);
        entries.push({
          label: opt.label || `${this.t('editorUI.optimizationLabel')} #${idx + 1}`,
          value: opt.selector,
          meta: opt.meta,
          badges: [this.t('editorUI.optimizationBadge')],
          readonly: true
        });
      });
    }

    if (autoAlternatives.length > 0) {
      entries.push({
        divider: true,
        title: this.t('editorUI.engineAlternatives')
      });

      autoAlternatives.forEach((altEntry, idx) => {
        const alt = altEntry.alt;
        entries.push({
          label: `Auto #${idx + 1}`,
          value: alt.selector,
          meta: alt,
          source: 'auto',
          orderIndex: idx,
          orderCount: autoAlternatives.length,
          sourceIndex: altEntry.indexInAlternatives,
          badges: [
            'Auto',
            (alt?.suspicious || alt?.status === 'сомнительный' || alt?.demotedReason === 'not-found') ? this.t('editorUI.suspicious') : null
          ].filter(Boolean),
          removable: true
        });
      });
    }

    // Добавляем подсказку в начало списка
    const hintHtml = `
      <div class="selector-dropdown-hint">
        <small>${this.t('editorUI.bestSelectorHint')}.</small>
      </div>
    `;

    if (entries.length === 1) {
      return `
        ${hintHtml}
        <div class="selector-dropdown-empty">
          Нет резервных селекторов. Добавьте новый через поле ввода.
        </div>
      `;
    }

    return hintHtml + entries.map(entry => {
      if (entry.divider) {
        return `
          <div class="selector-dropdown-divider">
            ${this.escapeHtml(entry.title)}
          </div>
        `;
      }

      const badgesHtml = (entry.badges || []).map(badge => `
        <span class="selector-badge">${this.escapeHtml(badge)}</span>
      `).join('');

      const hasMoves = entry.source === 'user' || entry.source === 'auto' || entry.source === 'primary';
      const canMoveUp = hasMoves && entry.source !== 'primary' && entry.orderIndex > 0;
      const canPromote = hasMoves && entry.source !== 'primary' && entry.orderIndex === 0;
      const canMoveDown = hasMoves && ((entry.source === 'primary' && (userSelectors.length + autoAlternatives.length) > 0) || (entry.source !== 'primary' && entry.orderIndex < (entry.orderCount - 1)));
      const upTitle = canPromote ? this.t('editorUI.makeActive') : this.t('editorUI.moveUp');
      const downTitle = entry.source === 'primary' ? this.t('editorUI.moveToAlternatives') : this.t('editorUI.moveDown');
      const selectorValue = entry.value || '';

      return `
        <div class="selector-entry ${entry.readonly ? 'readonly' : ''}">
          <div class="selector-entry-main">
            <div class="selector-entry-label">${this.escapeHtml(entry.label)}</div>
            <code class="selector-entry-value">${this.escapeHtml(selectorValue)}</code>
            <div class="selector-entry-badges">
              ${badgesHtml}
            </div>
          </div>
          ${hasMoves ? `
            <div class="selector-entry-actions">
              ${entry.source !== 'primary' ? `
                <button 
                  type="button" 
                  class="selector-entry-btn" 
                  data-action="selector-move-up"
                  data-action-index="${index}"
                  data-selector-source="${entry.source}"
                  data-selector-order-index="${entry.orderIndex}"
                  data-selector-index="${entry.sourceIndex !== undefined ? entry.sourceIndex : entry.orderIndex}"
                  data-selector-value="${this.escapeHtml(selectorValue)}"
                  title="${this.escapeHtml(upTitle)}"
                  ${(!canMoveUp && !canPromote) ? 'disabled' : ''}
                >
                  ↑
                </button>
              ` : ''}
              <button 
                type="button" 
                class="selector-entry-btn" 
                data-action="selector-move-down"
                data-action-index="${index}"
                data-selector-source="${entry.source}"
                data-selector-order-index="${entry.orderIndex}"
                data-selector-index="${entry.sourceIndex !== undefined ? entry.sourceIndex : entry.orderIndex}"
                data-selector-value="${this.escapeHtml(selectorValue)}"
                title="${this.escapeHtml(downTitle)}"
                ${!canMoveDown ? 'disabled' : ''}
              >
                ↓
              </button>
              ${entry.removable ? `
                <button 
                  type="button" 
                  class="selector-entry-remove" 
                  data-action="selector-remove-entry"
                  data-action-index="${index}"
                  data-selector-source="${entry.source}"
                  data-selector-order-index="${entry.orderIndex}"
                  data-selector-index="${entry.sourceIndex !== undefined ? entry.sourceIndex : entry.orderIndex}"
                  data-selector-value="${this.escapeHtml(selectorValue)}"
                  title="Delete selector"
                >
                  ✕
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  normalizeSelectorValue(value) {
    return (value || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  }

  getSelectorInfo(selector) {
    if (!selector) return this.t('editorUI.selectorNotSpecified');
    if (typeof selector === 'string') return selector;
    return selector.selector || JSON.stringify(selector);
  }

  /**
   * Рассчитывает метрики качества селектора
   */
  calculateSelectorQuality(selector, savedQuality = null) {
    if (!selector) {
      return { score: 0, stability: 0, length: 0, uniqueness: false, issues: [] };
    }

    const selectorStr = typeof selector === 'string' ? selector : (selector.selector || selector.value || '');
    if (!selectorStr) {
      return { score: 0, stability: 0, length: 0, uniqueness: false, issues: [] };
    }

    // Если селектор был успешно найден во время воспроизведения, не проверяем его на текущей странице
    // Используем сохраненные значения, но обновляем только если есть новые проблемы
    if (savedQuality && savedQuality.lastFoundDuringPlayback) {
      // Не проверяем на текущей странице, если селектор был найден во время воспроизведения
      // Возвращаем сохраненное качество, но обновляем issues, если они были удалены
      return {
        ...savedQuality,
        // Удаляем проблемы "не найден", если они были удалены во время воспроизведения
        issues: (savedQuality.issues || []).filter(
          issue => !issue.includes('not found') && !issue.includes('Element not found')
        )
      };
    }

    const issues = [];
    let stability = 100;
    let score = 100;

    // Проверка уникальности (делаем сначала, чтобы знать, работает ли селектор)
    let uniqueness = false;
    let elementFound = false;
    try {
      const count = document.querySelectorAll(selectorStr).length;
      uniqueness = count === 1;
      elementFound = count > 0;
      
      // Критические проблемы - селектор не работает
      // НО: если селектор был найден во время воспроизведения, не добавляем проблему "не найден"
      if (count === 0) {
        // Проверяем, был ли селектор найден во время воспроизведения
        if (!savedQuality || !savedQuality.lastFoundDuringPlayback) {
          issues.push(this.t('editorUI.elementNotFoundOnPage'));
          score -= 50;
        }
        // Если был найден во время воспроизведения, просто не добавляем проблему
      } else if (count > 1) {
        issues.push(`Found ${count} elements (not unique)`);
        score -= 30;
      }
    } catch (e) {
      issues.push(this.t('editorUI.invalidCssSelector'));
      score -= 50;
    }

    // Проверка на проблемные паттерны (только если селектор не работает или не уникален)
    // Если селектор работает and уникален, не помечаем как проблемный
    const problematicPatterns = [
      { pattern: /\d{10,}/, issue: this.t('editorUI.containsLongNumber'), penalty: 30, critical: true },
      { pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, issue: this.t('editorUI.containsUuid'), penalty: 45, critical: true },
      { pattern: /_ngcontent-[a-z0-9]+|_nghost-[a-z0-9]+/i, issue: this.t('editorUI.containsAngularScoped'), penalty: 25, critical: false },
      { pattern: /ng-reflect-[a-z-]+/, issue: this.t('editorUI.containsAngularReflect'), penalty: 20, critical: false },
      { pattern: /\.css-[\da-z]{5,}/i, issue: this.t('editorUI.containsCssInJsHash'), penalty: 30, critical: false },
      { pattern: /\.sc-[a-z0-9]+/i, issue: this.t('editorUI.containsStyledComponentsHash'), penalty: 30, critical: false },
      { pattern: /\.emotion-[a-z0-9]+/i, issue: this.t('editorUI.containsEmotionHash'), penalty: 30, critical: false },
      { pattern: /:nth-child\(\d{3,}\)|:nth-of-type\(\d{3,}\)/, issue: this.t('editorUI.highNthChildIndex'), penalty: 20, critical: false }
    ];

    problematicPatterns.forEach(({ pattern, issue, penalty, critical }) => {
      if (pattern.test(selectorStr)) {
        // Критические паттерны (UUID, timestamp) всегда помечаем
        // Некритические паттерны помечаем только если селектор не работает или не уникален
        if (critical || !elementFound || !uniqueness) {
          issues.push(issue);
          stability -= penalty;
        } else {
          // Если селектор работает and уникален, только снижаем стабильность, но не помечаем как проблемный
          stability -= Math.floor(penalty / 2);
        }
      }
    });

    // Бонусы за стабильные атрибуты
    const stableAttrs = ['data-testid', 'data-cy', 'data-test', 'data-qa', 'data-automation', 'aria-label'];
    if (stableAttrs.some(attr => selectorStr.includes(attr))) {
      stability += 20;
      score += 20;
    }

    // Бонус за простоту
    const depth = (selectorStr.match(/\s+/g) || []).length;
    if (depth <= 2) {
      score += 10;
    }

    // Штраф за длину
    const length = selectorStr.length;
    score -= Math.min(length / 10, 25);

    // Нормализация
    stability = Math.max(0, Math.min(100, stability));
    score = Math.max(0, Math.min(100, score));

    return {
      score: Math.round(score),
      stability: Math.round(stability),
      length,
      uniqueness,
      issues
    };
  }

  /**
   * Получает цвет индикатора качества на основе метрик
   */
  getQualityIndicatorColor(quality) {
    if (!quality || quality.score === 0) return '#ccc'; // Серый для невалидных
    
    if (quality.score >= 80 && quality.stability >= 80) return '#4CAF50'; // Зеленый
    if (quality.score >= 60 && quality.stability >= 60) return '#FFC107'; // Желтый
    return '#F44336'; // Красный
  }

  /**
   * Получает текст tooltip с метриками
   */
  getQualityTooltip(quality) {
    if (!quality) return this.t('editorUI.metricsUnavailable');
    
    const parts = [
      `Score: ${quality.score}/100`,
      `Stability: ${quality.stability}/100`,
      `Length: ${quality.length} chars`,
      `Uniqueness: ${quality.uniqueness ? '✓ Yes' : '✗ No'}`
    ];
    
    if (quality.issues && quality.issues.length > 0) {
      parts.push('');
      parts.push('Issues:');
      quality.issues.forEach(issue => parts.push(`• ${issue}`));
    }
    
    return parts.join('\n');
  }

  getVariableOperationName(operation) {
    const operationNames = {
      'extract-url': this.t('editorUI.extractFromUrl'),
      'extract-element': this.t('editorUI.extractFromElement'),
      'set': this.t('editorUI.setValue'),
      'calculate': this.t('editorUI.compute')
    };
    return operationNames[operation] || operation || '';
  }

  getActionValue(action) {
    if (action.type === 'keyboard') {
      return action.keyCombination || action.key || 'Unknown';
    }
    if (action.type === 'api') {
      const api = action.api || {};
      const method = api.method || 'GET';
      const url = api.url || '';
      return `${method} ${url}`;
    }
    if (action.type === 'variable') {
      const variable = action.variable || {};
      const name = variable.name || '';
      const operation = variable.operation || '';
      return `${this.getVariableOperationName(operation)}: ${name}`;
    }
    switch (action.type) {
      case 'click':
        return action.element?.text || action.element?.href || this.t('editorUI.clickOnElement');
      case 'input':
      case 'change':
        // Маскируем пароли
        if (action.isPassword || (action.element && action.element.type === 'password')) {
          return '***';
        }
        return action.value || this.t('editorUI.emptyValue');
      case 'scroll':
        return `X: ${action.position?.x || 0}, Y: ${action.position?.y || 0}`;
      case 'navigation':
        return action.url || this.t('editorUI.actionTypeNavigation');
      case 'wait':
        const delay = action.delay || action.value || 0;
        return `${delay} ms (${(delay / 1000).toFixed(1)} sec)`;
      case 'setVariable':
        const varName = action.variableName || 'var';
        const varValue = action.variableValue || action.variable?.value || action.value || '';
        const displayValue = varValue.length > 30 ? varValue.substring(0, 30) + '...' : varValue;
        return `\${${varName}} = "${displayValue}"`;
      case 'javascript':
        const script = action.value || action.script || '';
        return script.length > 50 ? script.substring(0, 50) + '...' : script || this.t('editorUI.javascriptScriptLabel') || 'JavaScript';
      default:
        return JSON.stringify(action);
    }
  }

  getOptimizationMeta(action) {
    if (!action) return null;
    if (action.optimizationMeta) {
      return action.optimizationMeta;
    }
    if (action.hiddenReason && typeof action.hiddenReason === 'string') {
      if (/автомат/i.test(action.hiddenReason)) {
        return {
          reason: action.hiddenReason,
          removedAt: action.hiddenAt
        };
      }
    }
    return null;
  }

  hasOptimizationAvailable() {
    if (!this.test || !Array.isArray(this.test.actions)) return false;
    if (this.test.optimization?.optimizedAvailable) return true;
    return this.test.actions.some(action => this.getOptimizationMeta(action));
  }

  countOptimizedActions() {
    if (!this.test || !Array.isArray(this.test.actions)) return 0;
    return this.test.actions.filter(action => this.getOptimizationMeta(action)).length;
  }

  refreshOptimizationUI() {
    this.updateRunButtons();
    this.renderOptimizationStatus();
  }

  updateRunButtons() {
    if (!this.fullRunBtn) return;
    const hasTest = !!this.test;
    this.fullRunBtn.disabled = !hasTest;
    const lastFull = this.formatDateTime(this.test?.optimization?.lastFullRunAt);
    this.fullRunBtn.title = hasTest
      ? `Run all steps including hidden. Last full run: ${lastFull}`
      : 'Load test to start run';

    if (this.optimizedRunBtn) {
      const canUseOptimized = this.hasOptimizationAvailable();
      this.optimizedRunBtn.classList.toggle('hidden', !canUseOptimized);
      this.optimizedRunBtn.disabled = !canUseOptimized;
      if (canUseOptimized) {
        const optimizedCount = this.countOptimizedActions();
        this.optimizedRunBtn.title = `Run confirmed steps (skipping ${optimizedCount} optimized). Ctrl+Enter`;
      } else {
        this.optimizedRunBtn.title = this.t('editorUI.optimizedRunHint');
      }
    }
  }

  renderOptimizationStatus() {
    if (!this.optimizationStatusEl) return;
    if (!this.test) {
      this.optimizationStatusEl.classList.add('hidden');
      return;
    }

    this.optimizationStatusEl.classList.remove('hidden');
    const hasOptimization = this.hasOptimizationAvailable();

    if (!hasOptimization) {
      this.optimizationStatusEl.innerHTML = `
        <span>⚠️ ${this.t('editorUI.optimizationNotRun')}</span>
        <span>${this.t('editorUI.runFullToCollectData')}</span>
      `;
      return;
    }

    // Подсчитываем статистику
    const totalActions = this.test.actions?.length || 0;
    const activeActions = this.test.actions?.filter(a => !a.hidden).length || 0;
    const hiddenActions = totalActions - activeActions;
    const optimizedActions = this.countOptimizedActions();
    
    // Даты
    const lastFull = this.formatDateTime(this.test.optimization?.lastFullRunAt);
    const lastOpt = this.formatDateTime(this.test.optimization?.lastOptimizationAt);
    const lastUserEdit = this.formatDateTime(this.test.updatedAt);

    this.optimizationStatusEl.innerHTML = `
      <div class="optimization-stats-grid">
        <div class="stat-item">
          <span class="stat-label">📊 ${this.t('editorUI.totalSteps')}</span>
          <span class="stat-value">${totalActions}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">✅ ${this.t('editorUI.activeSteps')}</span>
          <span class="stat-value active">${activeActions}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">🙈 ${this.t('editorUI.inactiveSteps')}</span>
          <span class="stat-value inactive">${hiddenActions}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">⚡ ${this.t('editorUI.optimizedSteps')}</span>
          <span class="stat-value optimized">${optimizedActions}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">🧪 ${this.t('editorUI.lastFullRun')}</span>
          <span class="stat-value">${lastFull}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">🛠️ ${this.t('editorUI.lastOptimization')}</span>
          <span class="stat-value">${lastOpt}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">✏️ ${this.t('editorUI.lastChange')}</span>
          <span class="stat-value">${lastUserEdit}</span>
        </div>
      </div>
    `;
  }

  formatDateTime(dateInput) {
    if (!dateInput) return '—';
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) {
        return dateInput;
      }
      return date.toLocaleString('ru-RU');
    } catch (error) {
      return dateInput;
    }
  }


  editAction(index) {
    const action = this.test.actions[index];
    if (!action) return;

    this.currentEditingAction = index;
    
    // Если это условие или цикл, открываем соответствующее модальное окно
    if (action.type === 'condition') {
      this.showEditConditionModal(action, index);
      return;
    }
    
    if (action.type === 'loop') {
      this.showEditLoopModal(action, index);
      return;
    }
    
    // Обычное действие
    this.currentEditingActionType = 'action';
    
    // Восстанавливаем subtype если есть
    if (action.subtype) {
      this.currentSubtype = action.subtype;
    }
    
    this.showActionModal(action);
  }

  async deleteAction(index) {
    const action = this.test.actions[index];
    
    // Проверяем, является ли это циклом или условием с вложенными действиями
    if (action && (action.type === 'loop' || action.type === 'condition')) {
      let hasInnerActions = false;
      if (action.type === 'loop' && action.actions?.length > 0) {
        hasInnerActions = true;
      } else if (action.type === 'condition' && (action.thenActions?.length > 0 || action.elseActions?.length > 0)) {
        hasInnerActions = true;
      }
      
      if (hasInnerActions) {
        // Показываем специальное подтверждение для циклов/условий с вложениями
        const typeLabel = action.type === 'loop' ? 'loop' : 'condition';
        const innerCount = action.type === 'loop' 
          ? action.actions.length 
          : (action.thenActions?.length || 0) + (action.elseActions?.length || 0);
        
        if (!confirm(this.t('editorUI.confirmDeleteWithNested', { type: typeLabel, count: innerCount }))) {
          return;
        }
      } else {
        if (!confirm(this.t('editorUI.confirmDeleteAction'))) {
          return;
        }
      }
    } else {
      if (!confirm(this.t('editorUI.confirmDeleteAction'))) {
        return;
      }
    }

    this.test.actions.splice(index, 1);
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  duplicateAction(index) {
    const action = this.test.actions[index];
    if (!action) return;

    // Создаем глубокую копию действия
    const duplicatedAction = JSON.parse(JSON.stringify(action));
    duplicatedAction.timestamp = Date.now();
    
    // Вставляем дубликат после текущего действия
    this.test.actions.splice(index + 1, 0, duplicatedAction);
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  toggleActionVisibility(index) {
    const action = this.test.actions[index];
    if (!action) return;

    const wasHidden = action.hidden;
    action.hidden = !action.hidden;
    
    // Если шаг был оптимизирован and пользователь его включает - сохраняем метаданные оптимизации
    // но делаем шаг активным (не скрытым)
    if (wasHidden && !action.hidden && action.optimizationMeta) {
      // Шаг был скрыт оптимизацией, теперь пользователь его включает
      // Сохраняем optimizationMeta, но убираем hidden
      // Это позволяет видеть, что шаг был оптимизирован, но теперь активен
      console.log(`✅ Пользователь включил оптимизированный шаг ${index + 1}`);
    }
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  toggleRecordMarker(index) {
    const action = this.test.actions[index];
    if (!action) return;

    // Переключаем маркер для текущего действия
    // Если поле отсутствует (старые тесты), устанавливаем его в true, иначе инвертируем
    const currentValue = action.recordMarker === true;
    action.recordMarker = !currentValue;
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Получает вложенное действие из цикла или условия
   */
  getNestedAction(parentIndex, branch, branchIndex) {
    if (!this.test || !this.test.actions || parentIndex < 0 || parentIndex >= this.test.actions.length) {
      return null;
    }
    
    const parentAction = this.test.actions[parentIndex];
    if (!parentAction) return null;
    
    let actionsArray = null;
    if (parentAction.type === 'loop' && branch === 'loop') {
      actionsArray = parentAction.actions || [];
    } else if (parentAction.type === 'condition') {
      if (branch === 'then') {
        actionsArray = parentAction.thenActions || [];
      } else if (branch === 'else') {
        actionsArray = parentAction.elseActions || [];
      }
    }
    
    if (!actionsArray || branchIndex < 0 || branchIndex >= actionsArray.length) {
      return null;
    }
    
    return { action: actionsArray[branchIndex], parentAction, actionsArray };
  }

  /**
   * Редактирует вложенное действие
   */
  editNestedAction(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) {
      console.error(`❌ [Editor] Вложенное действие не найдено: parentIndex=${parentIndex}, branch=${branch}, branchIndex=${branchIndex}`);
      return;
    }
    
    this.currentParentAction = parentIndex;
    this.currentBranch = branch;
    this.currentEditingAction = branchIndex;
    this.currentEditingActionType = 'action';
    
    this.showActionModal(nested.action);
  }

  /**
   * Дублирует вложенное действие
   */
  duplicateNestedAction(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    const duplicatedAction = JSON.parse(JSON.stringify(nested.action));
    duplicatedAction.timestamp = Date.now();
    
    nested.actionsArray.splice(branchIndex + 1, 0, duplicatedAction);
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Переключает видимость вложенного действия
   */
  toggleNestedActionVisibility(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    const wasHidden = nested.action.hidden;
    nested.action.hidden = !nested.action.hidden;
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Переключает маркер записи для вложенного действия
   */
  toggleNestedActionRecordMarker(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    const currentValue = nested.action.recordMarker === true;
    nested.action.recordMarker = !currentValue;
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Удаляет вложенное действие
   */
  deleteNestedAction(parentIndex, branch, branchIndex) {
    if (!confirm(this.t('editorUI.confirmDeleteAction'))) {
      return;
    }
    
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    nested.actionsArray.splice(branchIndex, 1);
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Удаляет резервный селектор для вложенного действия
   */
  removeReserveSelectorForNestedAction(parentIndex, branch, branchIndex, reserveIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    const action = nested.action;
    if (!action.selector || !action.selector.alternatives) return;
    
    action.selector.alternatives.splice(reserveIndex, 1);
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Перегенерирует селектор для вложенного действия
   */
  regenerateSelectorForNestedAction(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    // Используем существующую логику перегенерации
    this.regenerateSelectorForAction(nested.action);
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Копирует селектор для вложенного действия
   */
  copySelectorForNestedAction(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    const selector = this.getPrimarySelector(nested.action);
    const selectorStr = selector?.selector || selector?.value || selector || '';
    
    if (selectorStr) {
      navigator.clipboard.writeText(selectorStr).then(() => {
        this.showToast(this.t('editorUI.selectorCopied'), 'success');
      }).catch(err => {
        console.error('Ошибка при копировании:', err);
        this.showToast(this.t('editorUI.failedToCopySelector'), 'error');
      });
    }
  }

  /**
   * Находит элемент на странице для вложенного действия
   */
  findOnPageForNestedAction(parentIndex, branch, branchIndex) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    
    // Используем существующую логику поиска
    this.findOnPageForAction(nested.action);
  }

  /**
   * Перегенерирует селектор для конкретного действия (в т.ч. вложенного) через content script
   */
  async regenerateSelectorForAction(action) {
    const selector = this.getPrimarySelector(action);
    const selectorStr = typeof selector === 'string' ? selector : (selector?.selector || selector?.value || '');
    if (!selectorStr || selectorStr === this.t('editorUI.selectorNotSpecified')) {
      this.showToast(this.t('editorUI.selectorNotSpecifiedError'), 'error');
      return;
    }
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        this.showToast(this.t('editorUI.couldNotFindActiveTab'), 'error');
        return;
      }
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'REGENERATE_SELECTOR',
        selector: selectorStr
      });
      if (response && response.success && response.newSelector) {
        action.selector = response.newSelector;
        action.selectorRegenerated = true;
        action.selectorRegeneratedAt = new Date().toISOString();
        this.renderActions();
        this.showToast(this.t('editorUI.selectorRegenerated'), 'success');
      } else {
        this.showToast(response?.error || this.t('editorUI.failedToRegenerateSelector'), 'error');
      }
    } catch (err) {
      console.error('Ошибка при перегенерации селектора для вложенного действия:', err);
      this.showToast(this.t('editorUI.regenerationError'), 'error');
    }
  }

  /**
   * Находит элемент на странице для конкретного действия (вспомогательный метод)
   */
  async findOnPageForAction(action) {
    const selector = this.getPrimarySelector(action);
    const selectorStr = selector?.selector || selector?.value || selector || '';
    
    if (!selectorStr) {
      this.showToast(this.t('editorUI.selectorNotSpecifiedError'), 'error');
      return;
    }
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        this.showToast(this.t('editorUI.couldNotFindActiveTab'), 'error');
        return;
      }

      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'HIGHLIGHT_ELEMENT',
        selector: selectorStr
      });

      if (response && response.success) {
        this.showToast(this.t('editorUI.elementFoundHighlighted'), 'success');
      } else {
        this.showToast(this.t('editorUI.elementNotFoundError'), 'error');
      }
    } catch (err) {
      console.error('Ошибка при поиске элемента:', err);
      this.showToast(this.t('editorUI.findElementError'), 'error');
    }
  }

  updateActionField(index, field, value) {
    const action = this.test.actions[index];
    if (!action) return;

    if (field === 'variableValue') {
      if (action.type === 'setVariable') {
        action.variableValue = value;
        action.userEdited = true;
        action.userEditedAt = new Date().toISOString();
        this.extractVariablesFromActions(this.test.actions);
        this.updateScenarioVariablesPanel();
        return;
      }
    }

    if (field === 'selector') {
      this.addReserveSelector(index, value);
      return;
    } else if (field === 'value') {
      // Обновляем значение в зависимости от типа действия
      if (action.type === 'input' || action.type === 'change') {
        action.value = value;
      } else if (action.type === 'scroll') {
        const [x, y] = value.split(',').map(v => parseInt(v.trim()) || 0);
        action.position = { x, y };
      } else if (action.type === 'navigation') {
        action.url = value;
      } else if (action.type === 'click' || action.type === 'dblclick') {
        // Для клика and двойного клика можно обновить текст элемента
        if (!action.element) {
          action.element = {};
        }
        action.element.text = value;
      }
    } else if (field === 'delay') {
      // Обновляем задержку для шага wait (значение в мс)
      if (action.type === 'wait') {
        const delay = parseInt(String(value).replace(/\s/g, ''), 10) || 1000;
        action.delay = Math.max(100, delay);
        action.value = action.delay; // Для совместимости
      }
    } else if (field.startsWith('api.')) {
      // Обновляем поля API действия
      if (action.type === 'api' && action.api) {
        const apiField = field.substring(4); // Убираем "api."
        if (apiField === 'description' || apiField === 'url') {
          action.api[apiField] = value;
          this.saveTest();
        }
      }
    }
    
    // Если шаг был оптимизирован and пользователь его редактирует - снимаем признак оптимизации
    if (action.optimizationMeta) {
      console.log(`🔄 Пользователь редактирует оптимизированный шаг ${index + 1}, снимаю признак оптимизации`);
      // Удаляем метаданные оптимизации
      delete action.optimizationMeta;
      delete action.hiddenReason;
      delete action.hiddenAt;
      // Убираем скрытие, если было
      action.hidden = false;
    }
    
    // Отмечаем, что действие было отредактировано пользователем
    action.userEdited = true;
    action.userEditedAt = new Date().toISOString();

    this.extractVariablesFromActions(this.test.actions);
    this.updateScenarioVariablesPanel();
    
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  addReserveSelector(index, rawValue) {
    const action = this.test.actions[index];
    if (!action) return;

    const value = (rawValue || '').trim();
    if (!value) {
      this.showToast(this.t('editorUI.enterSelectorToAdd'), 'error');
      return;
    }

    const primary = this.getPrimarySelector(action);
    if (!primary) {
      action.selector = {
        type: 'css',
        selector: value,
        value: value,
        priority: 10
      };
      this.showToast(this.t('editorUI.primarySelectorUpdated'), 'success');
      this.renderActions();
      return;
    }

    const normalizedPrimary = this.normalizeSelectorValue(primary.selector);
    const normalizedValue = this.normalizeSelectorValue(value);

    if (normalizedPrimary === normalizedValue) {
      action.primaryUserTag = true;
      action.primaryUserTagValue = normalizedValue;
      this.showToast(this.t('editorUI.selectorMatchesBest'), 'success');
      this.renderActions();
      return;
    }

    const userSelectors = this.getUserSelectors(action);
    const existsInUser = userSelectors.some(sel => this.normalizeSelectorValue(sel.selector) === normalizedValue);
    const existsInAlternatives = Array.isArray(primary.alternatives)
      ? primary.alternatives.some(sel => this.normalizeSelectorValue(sel.selector) === normalizedValue)
      : false;

    if (existsInUser || existsInAlternatives) {
      this.showToast(this.t('editorUI.selectorAlreadyInReserves'), 'error');
      return;
    }

    userSelectors.forEach(sel => sel.isUserSelected = false);
    userSelectors.push({
      type: 'css',
      selector: value,
      value: value,
      priority: (primary.priority || 10) + 1,
      source: 'user',
      isUserSelected: true,
      addedAt: new Date().toISOString()
    });

    action.userPreferredSelector = value;
    action.userEdited = true;
    action.userEditedAt = new Date().toISOString();

    this.showToast(this.t('editorUI.reserveSelectorAdded'), 'success');
    this.renderActions();
  }

  removeReserveSelector(actionIndex, reserveIndex) {
    const action = this.test.actions[actionIndex];
    if (!action) return;

    const userSelectors = this.getUserSelectors(action);
    if (!userSelectors[reserveIndex]) return;

    const [removed] = userSelectors.splice(reserveIndex, 1);

    if (removed?.isUserSelected && userSelectors.length > 0) {
      userSelectors[0].isUserSelected = true;
      action.userPreferredSelector = userSelectors[0].selector;
    }

    if (userSelectors.length === 0) {
      delete action.userPreferredSelector;
    }

    this.showToast(this.t('editorUI.reserveSelectorDeleted'), 'success');
    this.renderActions();
  }

  markActionEdited(action) {
    if (!action) return;
    action.userEdited = true;
    action.userEditedAt = new Date().toISOString();
  }

  removeSelectorEntry(actionIndex, source, orderIndex, sourceIndex, selectorValue, dropdownIndexStr) {
    const action = this.test.actions[actionIndex];
    if (!action) return;

    if (source === 'user') {
      const userSelectors = this.getUserSelectors(action);
      if (!userSelectors[orderIndex]) return;
      const [removed] = userSelectors.splice(orderIndex, 1);
      if (removed?.isUserSelected && userSelectors.length > 0) {
        userSelectors[0].isUserSelected = true;
        action.userPreferredSelector = userSelectors[0].selector;
      }
      if (userSelectors.length === 0) {
        delete action.userPreferredSelector;
      }
    } else if (source === 'auto') {
      const primary = this.getPrimarySelector(action);
      if (!primary || !Array.isArray(primary.alternatives)) return;
      const alternatives = primary.alternatives;
      const idx = Number.isNaN(sourceIndex) ? -1 : sourceIndex;
      if (idx < 0 || idx >= alternatives.length) return;
      alternatives.splice(idx, 1);
    } else {
      return;
    }

    this.markActionEdited(action);
    this.showToast(this.t('editorUI.selectorDeleted'), 'success');
    this.renderActionsPreservingDropdown(dropdownIndexStr ?? actionIndex);
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  removeSelectorEntryForNestedAction(parentIndex, branch, branchIndex, source, orderIndex, sourceIndex, selectorValue, dropdownIndexStr) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    const action = nested.action;
    if (!action) return;

    if (source === 'user') {
      const userSelectors = this.getUserSelectors(action);
      if (!userSelectors[orderIndex]) return;
      const [removed] = userSelectors.splice(orderIndex, 1);
      if (removed?.isUserSelected && userSelectors.length > 0) {
        userSelectors[0].isUserSelected = true;
        action.userPreferredSelector = userSelectors[0].selector;
      }
      if (userSelectors.length === 0) {
        delete action.userPreferredSelector;
      }
    } else if (source === 'auto') {
      const primary = this.getPrimarySelector(action);
      if (!primary || !Array.isArray(primary.alternatives)) return;
      const alternatives = primary.alternatives;
      const idx = Number.isNaN(sourceIndex) ? -1 : sourceIndex;
      if (idx < 0 || idx >= alternatives.length) return;
      alternatives.splice(idx, 1);
    } else {
      return;
    }

    this.markActionEdited(action);
    this.showToast(this.t('editorUI.selectorDeleted'), 'success');
    this.renderActionsPreservingDropdown(dropdownIndexStr ?? `${branch}-${parentIndex}-${branchIndex}`);
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  moveSelectorEntry(actionIndex, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr) {
    const action = this.test.actions[actionIndex];
    if (!action) return;
    this.moveSelectorEntryForAction(action, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr ?? actionIndex);
  }

  moveSelectorEntryForNestedAction(parentIndex, branch, branchIndex, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr) {
    const nested = this.getNestedAction(parentIndex, branch, branchIndex);
    if (!nested) return;
    const action = nested.action;
    if (!action) return;
    this.moveSelectorEntryForAction(action, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr ?? `${branch}-${parentIndex}-${branchIndex}`);
  }

  moveSelectorEntryForAction(action, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr) {
    if (!action) return;
    const primary = this.getPrimarySelector(action);
    const userSelectors = this.getUserSelectors(action);
    const normalizedPrimary = this.normalizeSelectorValue(primary?.selector || primary?.value);
    const autoAlternatives = this.getUniqueAutoAlternatives(action, normalizedPrimary);

    if (source === 'primary') {
      if (direction > 0) {
        if (userSelectors.length > 0) {
          this.promoteSelectorToPrimary(action, 'user', 0, dropdownIndexStr);
        } else if (autoAlternatives.length > 0) {
          this.promoteSelectorToPrimary(action, 'auto', autoAlternatives[0].indexInAlternatives, dropdownIndexStr);
        }
      }
      return;
    }

    if (source === 'user') {
      if (direction < 0 && orderIndex === 0) {
        this.promoteSelectorToPrimary(action, 'user', orderIndex, dropdownIndexStr);
        return;
      }
      const targetIndex = orderIndex + direction;
      if (targetIndex < 0 || targetIndex >= userSelectors.length) return;
      [userSelectors[orderIndex], userSelectors[targetIndex]] = [userSelectors[targetIndex], userSelectors[orderIndex]];
      this.markActionEdited(action);
      this.renderActionsPreservingDropdown(dropdownIndexStr);
      return;
    }

    if (source === 'auto') {
      if (direction < 0 && orderIndex === 0) {
        if (autoAlternatives.length > 0) {
          this.promoteSelectorToPrimary(action, 'auto', autoAlternatives[0].indexInAlternatives, dropdownIndexStr);
        }
        return;
      }
      const targetOrderIndex = orderIndex + direction;
      if (targetOrderIndex < 0 || targetOrderIndex >= autoAlternatives.length) return;
      const fromIndex = autoAlternatives[orderIndex]?.indexInAlternatives;
      const toIndex = autoAlternatives[targetOrderIndex]?.indexInAlternatives;
      if (fromIndex === undefined || toIndex === undefined) return;
      if (!primary || !Array.isArray(primary.alternatives)) return;
      [primary.alternatives[fromIndex], primary.alternatives[toIndex]] = [primary.alternatives[toIndex], primary.alternatives[fromIndex]];
      this.markActionEdited(action);
      this.renderActionsPreservingDropdown(dropdownIndexStr);
    }
  }

  promoteSelectorToPrimary(action, source, sourceIndex, dropdownIndexStr) {
    if (!action) return;
    const primary = this.getPrimarySelector(action);
    if (!primary) return;
    const userSelectors = this.getUserSelectors(action);
    const alternatives = Array.isArray(primary.alternatives) ? primary.alternatives : [];

    let promoted = null;
    if (source === 'user') {
      promoted = userSelectors[sourceIndex];
      if (!promoted) return;
      userSelectors.splice(sourceIndex, 1);
    } else if (source === 'auto') {
      promoted = alternatives[sourceIndex];
      if (!promoted) return;
      alternatives.splice(sourceIndex, 1);
    } else {
      return;
    }

    if (!promoted.selector && promoted.value) {
      promoted.selector = promoted.value;
    }

    const demoted = { ...primary };
    delete demoted.alternatives;
    const normalizedPromoted = this.normalizeSelectorValue(promoted.selector || promoted.value);
    const normalizedDemoted = this.normalizeSelectorValue(demoted.selector || demoted.value);

    if (normalizedDemoted && normalizedDemoted !== normalizedPromoted) {
      const exists = alternatives.some(alt => this.normalizeSelectorValue(alt?.selector || alt?.value) === normalizedDemoted);
      if (!exists) {
        alternatives.unshift({
          ...demoted,
          demotedAt: new Date().toISOString(),
          demotedReason: 'manual'
        });
      }
    }

    action.selector = {
      ...promoted,
      alternatives
    };

    if (source === 'user') {
      action.primaryUserTag = true;
      action.primaryUserTagValue = normalizedPromoted;
      action.userPreferredSelector = promoted.selector || promoted.value;
    }

    this.markActionEdited(action);
    this.renderActionsPreservingDropdown(dropdownIndexStr);
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  toggleSelectorDropdown(index, button) {
    // index может быть числом или строкой (для вложенных действий)
    const indexStr = String(index);
    const dropdown = document.querySelector(`.selector-dropdown[data-selector-dropdown="${indexStr}"]`);
    if (!dropdown) {
      console.warn(`⚠️ [Editor] Dropdown не найден для индекса: ${indexStr}`);
      return;
    }

    const isOpen = dropdown.classList.contains('open');
    this.closeAllSelectorDropdowns();

    if (!isOpen) {
      dropdown.classList.add('open');
      if (button) {
        button.setAttribute('aria-expanded', 'true');
      }
    }
  }

  openSelectorDropdownByIndex(indexStr) {
    const normalized = String(indexStr);
    const dropdown = document.querySelector(`.selector-dropdown[data-selector-dropdown="${normalized}"]`);
    if (!dropdown) {
      return;
    }
    dropdown.classList.add('open');
    const toggle = document.querySelector(`.selector-dropdown-toggle[data-action-index="${normalized}"]`);
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
    }
  }

  renderActionsPreservingDropdown(indexStr) {
    this.renderActions();
    if (indexStr === undefined || indexStr === null) return;
    const normalized = String(indexStr);
    setTimeout(() => {
      this.openSelectorDropdownByIndex(normalized);
    }, 0);
  }

  closeAllSelectorDropdowns() {
    document.querySelectorAll('.selector-dropdown').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.selector-dropdown-toggle').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
  }

  handleDocumentClick(event) {
    if (event.target.closest('.selector-field-wrapper') || event.target.closest('.selector-dropdown')) {
      return;
    }
    this.closeAllSelectorDropdowns();
  }

  toggleCollapseAll() {
    this.allCollapsed = !this.allCollapsed;
    this.updateCollapseButton();
    this.renderActions();
  }

  updateCollapseButton() {
    const btn = document.getElementById('toggleCollapseAll');
    if (btn) {
      if (this.allCollapsed) {
        btn.textContent = '📂 ' + this.t('editorUI.expandAll');
        btn.title = this.t('editorUI.expandAll');
      } else {
        btn.textContent = '📦 ' + this.t('editorUI.collapseAll');
        btn.title = this.t('editorUI.collapseAll');
      }
    }
  }

  toggleShowUrls() {
    this.showUrls = !this.showUrls;
    this.updateShowUrlsButton();
    this.renderActions();
  }

  updateShowUrlsButton() {
    const btn = document.getElementById('toggleShowUrls');
    if (btn) {
      if (this.showUrls) {
        btn.textContent = '🔗 ' + this.t('editorUI.hideUrl');
        btn.title = this.t('editorUI.hideUrl');
      } else {
        btn.textContent = '🔗 ' + this.t('editorUI.showUrl');
        btn.title = this.t('editorUI.showUrl');
      }
    }
  }

  toggleShowFieldLabels() {
    this.showFieldLabels = !this.showFieldLabels;
    this.updateShowFieldLabelsButton();
    this.renderActions();
  }

  updateShowFieldLabelsButton() {
    const btn = document.getElementById('toggleShowFieldLabels');
    if (btn) {
      if (this.showFieldLabels) {
        btn.textContent = '🏷️ ' + this.t('editorUI.hideFieldLabels');
        btn.title = this.t('editorUI.hideFieldLabels');
      } else {
        btn.textContent = '🏷️ ' + this.t('editorUI.showFieldLabels');
        btn.title = this.t('editorUI.showFieldLabels');
      }
    }
  }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    this.applyTheme();
    this.updateThemeButton();
    this.saveTheme();
  }

  applyTheme() {
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
  }

  updateThemeButton() {
    const btn = document.getElementById('toggleTheme');
    if (btn) {
      if (this.isDarkTheme) {
        btn.textContent = '☀️ ' + this.t('editorUI.lightTheme');
        btn.title = this.t('editorUI.lightTheme');
      } else {
        btn.textContent = '🌙 ' + this.t('editorUI.darkTheme');
        btn.title = this.t('editorUI.darkTheme');
      }
    }
  }

  loadTheme() {
    try {
      const saved = localStorage.getItem('editorTheme');
      if (saved === 'dark') {
        this.isDarkTheme = true;
      } else if (saved === 'light') {
        this.isDarkTheme = false;
      } else {
        // Автоопределение по системным настройкам
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.isDarkTheme = prefersDark;
      }
      this.applyTheme();
      this.updateThemeButton();
    } catch (error) {
      console.warn('Ошибка загрузки темы:', error);
    }
  }

  saveTheme() {
    try {
      localStorage.setItem('editorTheme', this.isDarkTheme ? 'dark' : 'light');
    } catch (error) {
      console.warn('Ошибка сохранения темы:', error);
    }
  }

  toggleGrouping() {
    this.groupByUrl = !this.groupByUrl;
    localStorage.setItem('groupByUrl', this.groupByUrl ? 'true' : 'false');
    this.updateGroupingButton();
    this.renderActions();
  }

  updateGroupingButton() {
    const btn = document.getElementById('toggleGrouping');
    if (btn) {
      if (this.groupByUrl) {
        btn.textContent = '📋 ' + this.t('editorUI.ungroup');
        btn.title = this.t('editorUI.ungroup');
      } else {
        btn.textContent = '📑 ' + this.t('editorUI.group');
        btn.title = this.t('editorUI.group');
      }
    }
  }

  toggleGroup(groupUrl) {
    if (this.collapsedGroups.has(groupUrl)) {
      this.collapsedGroups.delete(groupUrl);
    } else {
      this.collapsedGroups.add(groupUrl);
    }
    this.renderActions();
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
    if (window.location && window.location.href) {
      preconditions.push(`Start page: ${window.location.href}`);
    }
    return preconditions;
  }

  showAddActionModal() {
    const newAction = {
      type: 'click',
      selector: { type: 'id', selector: '', value: '' },
      timestamp: Date.now()
    };
    this.currentEditingAction = -1; // -1 означает новое действие
    this.currentEditingActionType = 'action'; // Обычное действие
    this.insertAfterIndex = null; // Сбрасываем позицию вставки
    this.showActionModal(newAction);
  }

  /**
   * Вставляет новое действие в указанную позицию
   * @param {number} targetIndex - Индекс целевого действия
   * @param {number} insertIndex - Индекс, куда вставить новое действие
   */
  insertActionAtPosition(targetIndex, insertIndex) {
    // Скрываем кнопки вставки
    document.querySelectorAll('.action-item.show-insert-buttons').forEach(item => {
      item.classList.remove('show-insert-buttons');
    });
    
    const newAction = {
      type: 'click',
      selector: { type: 'id', selector: '', value: '' },
      timestamp: Date.now()
    };
    this.currentEditingAction = -1; // -1 означает новое действие
    this.currentEditingActionType = 'action'; // Обычное действие
    this.insertAfterIndex = insertIndex - 1; // Устанавливаем позицию вставки (insertIndex - 1, так как вставляем после этого индекса)
    this.showActionModal(newAction);
  }

  showActionModal(action) {
    const modal = document.getElementById('actionModal');
    const modalBody = document.getElementById('modalBody');

    if (!modal || !modalBody) {
      console.error('❌ Модальное окно не найдено');
      return;
    }

    modalBody.innerHTML = this.getActionFormHTML(action);
    modal.style.display = 'block';
    modal.classList.add('show');

    // Привязываем обработчики для формы
    this.attachFormHandlers();
    
    // Предотвращаем отправку формы по Enter
    this.preventFormSubmit();
  }
  
  preventFormSubmit() {
    const modal = document.getElementById('actionModal');
    if (!modal) return;
    
    // Проверяем, что модальное окно действительно открыто
    if (!modal.classList.contains('show')) {
      return;
    }
    
    // Обработчик для предотвращения отправки формы по Enter
    const handleKeyDown = (e) => {
      // Проверяем, что модальное окно все еще открыто
      if (!modal.classList.contains('show')) {
        return;
      }
      
      // Предотвращаем стандартное поведение Enter во всех случаях
      if (e.key === 'Enter') {
        // Если Enter нажат в textarea, разрешаем перенос строки
        if (e.target.tagName === 'TEXTAREA') {
          return; // Разрешаем стандартное поведение для textarea
        }
        
        // Проверяем, что событие происходит внутри модального окна
        if (!modal.contains(e.target)) {
          return; // Игнорируем события вне модального окна
        }
        
        // Для всех остальных элементов предотвращаем стандартное поведение
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Если Enter нажат в поле ввода или селекте, сохраняем действие
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
          // Небольшая задержка, чтобы избежать конфликтов
          setTimeout(() => {
            try {
              // Проверяем еще раз, что модальное окно открыто
              if (modal.classList.contains('show')) {
                this.saveAction();
              }
            } catch (error) {
              console.error('Ошибка при сохранении действия:', error);
            }
          }, 50);
        }
      }
    };
    
    // Удаляем старый обработчик, если есть
    if (this.modalKeyDownHandler) {
      modal.removeEventListener('keydown', this.modalKeyDownHandler, true);
    }
    
    // Сохраняем ссылку на обработчик для последующего удаления
    this.modalKeyDownHandler = handleKeyDown;
    modal.addEventListener('keydown', handleKeyDown, true);
    
    // Также предотвращаем submit на случай, если есть форма
    const modalBody = document.getElementById('modalBody');
    if (modalBody) {
      const handleSubmit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      // Удаляем старый обработчик submit, если есть
      if (this.modalSubmitHandler) {
        modalBody.removeEventListener('submit', this.modalSubmitHandler, true);
      }
      
      this.modalSubmitHandler = handleSubmit;
      modalBody.addEventListener('submit', handleSubmit, true);
    }
  }

  getActionFormHTML(action) {
    const selectorType = action.selector?.type || 'id';
    const selectorValue = action.selector?.value || action.selector?.selector || '';
    const actionValue = action.type === 'wait' 
      ? (action.delay || action.value || 1000) 
      : (action.value || '');
    const variableNameValue = action.type === 'setVariable'
      ? (action.variableName || '')
      : (action.variable?.name || '');
    const variableSetValue = action.type === 'setVariable'
      ? (action.variableValue || '')
      : (action.variable?.value || '');
    const variableNamePreview = variableNameValue || 'name';

    return `
      <div class="form-group">
        <label>${this.t('editorUI.actionTypeLabel')}</label>
        <select id="actionType">
          <option value="click" ${action.type === 'click' ? 'selected' : ''}>${this.getActionTypeIcon('click')} ${this.t('editorUI.actionTypeClick')}</option>
          <option value="dblclick" ${action.type === 'dblclick' ? 'selected' : ''}>${this.getActionTypeIcon('dblclick')} ${this.t('editorUI.actionTypeDblclick')}</option>
          <option value="input" ${action.type === 'input' ? 'selected' : ''}>${this.getActionTypeIcon('input')} ${this.t('editorUI.actionTypeTextInput')}</option>
          <option value="change" ${action.type === 'change' ? 'selected' : ''}>${this.getActionTypeIcon('change')} ${this.t('editorUI.actionTypeChangeValue')}</option>
          <option value="scroll" ${action.type === 'scroll' ? 'selected' : ''}>${this.getActionTypeIcon('scroll')} ${this.t('editorUI.actionTypeScroll')}</option>
          <option value="navigation" ${action.type === 'navigation' ? 'selected' : ''}>${this.getActionTypeIcon('navigation')} ${this.t('editorUI.actionTypeNavigation')}</option>
          <option value="wait" ${action.type === 'wait' ? 'selected' : ''}>${this.t('editorUI.actionTypeWait')}</option>
          <option value="keyboard" ${action.type === 'keyboard' ? 'selected' : ''}>${this.t('editorUI.actionTypeKeypress')}</option>
          <option value="api" ${action.type === 'api' ? 'selected' : ''}>${this.t('editorUI.actionTypeApi')}</option>
          <option value="variable" ${action.type === 'variable' ? 'selected' : ''}>${this.t('editorUI.actionTypeVarOperation')}</option>
          <option value="setVariable" ${action.type === 'setVariable' ? 'selected' : ''}>${this.t('editorUI.actionTypeSetVar')}</option>
          
          <!-- NEW TYPES v1.9.3 -->
          <option value="assertion" ${action.type === 'assertion' ? 'selected' : ''}>${this.getActionTypeIcon('assertion')} ${this.t('editorUI.actionTypeAssertion') || 'Проверка'}</option>
          <option value="ai" ${action.type === 'ai' ? 'selected' : ''}>${this.getActionTypeIcon('ai')} ${this.t('editorUI.actionTypeAI') || 'AI Операция'}</option>
          <option value="cloud" ${action.type === 'cloud' ? 'selected' : ''}>${this.getActionTypeIcon('cloud')} ${this.t('editorUI.actionTypeCloud') || 'Облачная операция'}</option>
          <option value="suite" ${action.type === 'suite' ? 'selected' : ''}>${this.getActionTypeIcon('suite')} ${this.t('editorUI.actionTypeSuite') || 'Набор тестов'}</option>
          <option value="javascript" ${action.type === 'javascript' ? 'selected' : ''}>${this.getActionTypeIcon('javascript')} ${this.t('editorUI.actionTypeJavaScript') || 'JavaScript'}</option>
          <option value="screenshot" ${action.type === 'screenshot' ? 'selected' : ''}>${this.getActionTypeIcon('screenshot')} ${this.t('editorUI.actionTypeScreenshot') || 'Скриншот'}</option>
          <option value="cookie" ${action.type === 'cookie' ? 'selected' : ''}>${this.getActionTypeIcon('cookie')} ${this.t('editorUI.actionTypeCookie') || 'Cookie'}</option>
          <option value="mobile" ${action.type === 'mobile' ? 'selected' : ''}>${this.getActionTypeIcon('mobile')} ${this.t('editorUI.actionTypeMobile') || 'Мобильный жест'}</option>
          <option value="hover" ${action.type === 'hover' ? 'selected' : ''}>${this.getActionTypeIcon('hover')} ${this.t('editorUI.actionTypeHover') || 'Наведение'}</option>
          <option value="focus" ${action.type === 'focus' ? 'selected' : ''}>${this.getActionTypeIcon('focus')} ${this.t('editorUI.actionTypeFocus') || 'Фокус'}</option>
          <option value="blur" ${action.type === 'blur' ? 'selected' : ''}>${this.getActionTypeIcon('blur')} ${this.t('editorUI.actionTypeBlur') || 'Снятие фокуса'}</option>
          <option value="clear" ${action.type === 'clear' ? 'selected' : ''}>${this.getActionTypeIcon('clear')} ${this.t('editorUI.actionTypeClear') || 'Очистить'}</option>
          <option value="upload" ${action.type === 'upload' ? 'selected' : ''}>${this.getActionTypeIcon('upload')} ${this.t('editorUI.actionTypeUpload') || 'Загрузка файла'}</option>
        </select>
      </div>

      <div class="form-group" id="keyboardGroup" style="display: ${action.type === 'keyboard' ? 'block' : 'none'};">
        <label>${this.t('editorUI.keyOrCombination')}</label>
        <select id="keyboardKey">
          <option value="">${this.t('editorUI.selectKey')}</option>
          <optgroup label="Main keys">
            <option value="Enter" ${action.key === 'Enter' ? 'selected' : ''}>Enter</option>
            <option value="Escape" ${action.key === 'Escape' ? 'selected' : ''}>Escape</option>
            <option value="Tab" ${action.key === 'Tab' ? 'selected' : ''}>Tab</option>
            <option value="Backspace" ${action.key === 'Backspace' ? 'selected' : ''}>Backspace</option>
            <option value="Delete" ${action.key === 'Delete' ? 'selected' : ''}>Delete</option>
            <option value="Space" ${action.key === 'Space' ? 'selected' : ''}>Space</option>
          </optgroup>
          <optgroup label="Arrows">
            <option value="ArrowUp" ${action.key === 'ArrowUp' ? 'selected' : ''}>↑ Arrow Up</option>
            <option value="ArrowDown" ${action.key === 'ArrowDown' ? 'selected' : ''}>↓ Arrow Down</option>
            <option value="ArrowLeft" ${action.key === 'ArrowLeft' ? 'selected' : ''}>← Arrow Left</option>
            <option value="ArrowRight" ${action.key === 'ArrowRight' ? 'selected' : ''}>→ Arrow Right</option>
          </optgroup>
          <optgroup label="Function keys">
            <option value="F1" ${action.key === 'F1' ? 'selected' : ''}>F1</option>
            <option value="F2" ${action.key === 'F2' ? 'selected' : ''}>F2</option>
            <option value="F3" ${action.key === 'F3' ? 'selected' : ''}>F3</option>
            <option value="F4" ${action.key === 'F4' ? 'selected' : ''}>F4</option>
            <option value="F5" ${action.key === 'F5' ? 'selected' : ''}>F5</option>
            <option value="F6" ${action.key === 'F6' ? 'selected' : ''}>F6</option>
            <option value="F7" ${action.key === 'F7' ? 'selected' : ''}>F7</option>
            <option value="F8" ${action.key === 'F8' ? 'selected' : ''}>F8</option>
            <option value="F9" ${action.key === 'F9' ? 'selected' : ''}>F9</option>
            <option value="F10" ${action.key === 'F10' ? 'selected' : ''}>F10</option>
            <option value="F11" ${action.key === 'F11' ? 'selected' : ''}>F11</option>
            <option value="F12" ${action.key === 'F12' ? 'selected' : ''}>F12</option>
          </optgroup>
          <optgroup label="Navigation">
            <option value="Home" ${action.key === 'Home' ? 'selected' : ''}>Home</option>
            <option value="End" ${action.key === 'End' ? 'selected' : ''}>End</option>
            <option value="PageUp" ${action.key === 'PageUp' ? 'selected' : ''}>Page Up</option>
            <option value="PageDown" ${action.key === 'PageDown' ? 'selected' : ''}>Page Down</option>
          </optgroup>
        </select>
        
        <div style="margin-top: 16px; margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333; font-size: 14px; text-align: left;">${this.t('editorUI.modifiers')}</label>
          <div style="display: flex; flex-direction: column; gap: 8px; align-items: stretch; width: 100%;">
            <label style="display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; width: 100%; min-width: 0;">
              <input type="checkbox" id="keyboardCtrl" ${action.modifiers?.ctrl ? 'checked' : ''} style="margin: 0; flex-shrink: 0; width: 18px; height: 18px;">
              <span style="text-align: left; flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word;">Ctrl</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; width: 100%; min-width: 0;">
              <input type="checkbox" id="keyboardAlt" ${action.modifiers?.alt ? 'checked' : ''} style="margin: 0; flex-shrink: 0; width: 18px; height: 18px;">
              <span style="text-align: left; flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word;">Alt</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; width: 100%; min-width: 0;">
              <input type="checkbox" id="keyboardShift" ${action.modifiers?.shift ? 'checked' : ''} style="margin: 0; flex-shrink: 0; width: 18px; height: 18px;">
              <span style="text-align: left; flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word;">Shift</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; width: 100%; min-width: 0;">
              <input type="checkbox" id="keyboardMeta" ${action.modifiers?.meta ? 'checked' : ''} style="margin: 0; flex-shrink: 0; width: 18px; height: 18px;">
              <span style="text-align: left; flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word;">Meta (Win/Cmd)</span>
            </label>
          </div>
        </div>
        
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
          <label style="display: flex; align-items: flex-start; gap: 8px; text-align: left; cursor: pointer; width: 100%;">
            <input type="checkbox" id="keyboardGlobal" ${action.isGlobal !== false ? 'checked' : ''} style="margin-top: 2px; flex-shrink: 0;">
            <div style="flex: 1; text-align: left;">
              <span style="display: block; font-weight: 600; color: #333; font-size: 14px; margin-bottom: 4px; text-align: left;">${this.t('editorUI.applyToWholePage')}</span>
              <small style="display: block; color: #666; text-align: left; line-height: 1.4; font-size: 12px;">
                Если не отмечено, нажатие клавиши будет применено к выбранному элементу (требуется указать селектор)
              </small>
            </div>
          </label>
        </div>
      </div>

      <div class="form-group" id="selectorGroup">
        <label>${this.t('editorUI.selectorTypeLabel')}</label>
        <select id="selectorType">
          <option value="id" ${selectorType === 'id' ? 'selected' : ''}>ID</option>
          <option value="data-testid" ${selectorType === 'data-testid' ? 'selected' : ''}>data-testid</option>
          <option value="data-cy" ${selectorType === 'data-cy' ? 'selected' : ''}>data-cy</option>
          <option value="data-test" ${selectorType === 'data-test' ? 'selected' : ''}>data-test</option>
          <option value="name" ${selectorType === 'name' ? 'selected' : ''}>Name</option>
          <option value="aria-label" ${selectorType === 'aria-label' ? 'selected' : ''}>Aria-label</option>
          <option value="class" ${selectorType === 'class' ? 'selected' : ''}>Class</option>
          <option value="css" ${selectorType === 'css' ? 'selected' : ''}>${this.t('editorUI.cssSelector')}</option>
        </select>
      </div>

      <div class="form-group" id="selectorValueGroup">
        <label>${this.t('editorUI.selectorValueLabel')}</label>
        <input type="text" id="selectorValue" value="${this.escapeHtml(selectorValue)}" placeholder="Enter selector value">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.enterSelectorExample')}
        </small>
      </div>

      <div class="form-group" id="actionValueGroup">
        <label id="actionValueLabel">${this.t('editorUI.actionValueLabel')}</label>
        <div style="position: relative;">
          ${action.type === 'wait' 
            ? `<input type="number" id="actionValue" value="${actionValue}" placeholder="ms (15000 = 15 sec)" min="1" step="1000">`
            : `<input type="text" id="actionValue" value="${this.escapeHtml(actionValue)}" placeholder="Enter value">
               <span class="variable-hint-icon" id="variableHintIcon" title="Show variable hint">ℹ️</span>`
          }
        </div>
        <div id="fileSelectorGroup" style="margin-top: 8px; display: none;">
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px; text-align: left;">${this.t('editorUI.orSelectFile')}</label>
          <select id="fileSelector" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; text-align: left;">
            <option value="">${this.t('editorUI.selectFile')}</option>
          </select>
        </div>
        <small id="actionValueHint" style="text-align: left; display: block;">${this.t('editorUI.noValueForClick')}</small>
        <div id="variableHint" class="variable-hint hidden">
          <strong>${this.t('editorUI.availableVars')}</strong>
          <ul>
            <li><code>{date}</code> - Current date (21.11.2025)</li>
            <li><code>{time}</code> - Current time (18:53:08)</li>
            <li><code>{datetime}</code> - Date and time (21.11.2025 18:53:08)</li>
            <li><code>{timestamp}</code> - Unix timestamp (1732204388)</li>
            <li><code>{counter:name}</code> - Counter (starts at 1, increments by +1 on each run)</li>
            <li><code>{counter:name:start_value}</code> - Counter with specified start value</li>
            <li><code>{counter:name}</code> - Example: starts with 1, then 2, 3...</li>
            <li><code>{counter:name:10}</code> - Example: starts with 10, then 11, 12...</li>
          </ul>
          <strong>Examples:</strong>
          <ul>
            <li><code>Request {counter:name} from {date}</code> → "Request 1 from 21.11.2025" (next: "Request 2...")</li>
            <li><code>Request {counter:name:100} from {date}</code> → "Request 100 from 21.11.2025" (next: "Request 101...")</li>
            <li><code>Test_{timestamp}</code> → "Test_1732204388"</li>
            <li><code>Document_{counter:doc}_{time}</code> → "Document_1_18:53:08"</li>
          </ul>
        </div>
      </div>

      <div class="form-group hidden" id="urlGroup">
        <label>URL</label>
        <input type="text" id="actionUrl" value="${action.url || ''}" placeholder="https://example.com">
      </div>

      <!-- Форма для Screenshot: выбор области снимка -->
      <div class="form-group" id="screenshotCaptureGroup" style="display: ${action.type === 'screenshot' ? 'block' : 'none'};">
        <label>${this.t('editorUI.screenshotCaptureLabel') || 'Область снимка'}</label>
        <select id="screenshotCaptureType">
          <option value="full" ${action.screenshotCaptureType === 'full' ? 'selected' : ''}>${this.t('editorUI.screenshotCaptureFull') || 'Весь экран'}</option>
          <option value="region" ${action.screenshotCaptureType === 'region' ? 'selected' : ''}>${this.t('editorUI.screenshotCaptureRegion') || 'Область экрана'}</option>
          <option value="element" ${(action.screenshotCaptureType || 'element') === 'element' ? 'selected' : ''}>${this.t('editorUI.screenshotCaptureElement') || 'Элемент (селектор)'}</option>
        </select>
      </div>
      <div class="form-group" id="screenshotRegionGroup" style="display: ${action.type === 'screenshot' && action.screenshotCaptureType === 'region' ? 'block' : 'none'};">
        <label>${this.t('editorUI.screenshotRegionLabel') || 'Координаты области (x, y, width, height)'}</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input type="number" id="screenshotRegionX" value="${action.screenshotRegion?.x ?? 0}" placeholder="X" min="0" style="width: 70px;">
          <input type="number" id="screenshotRegionY" value="${action.screenshotRegion?.y ?? 0}" placeholder="Y" min="0" style="width: 70px;">
          <input type="number" id="screenshotRegionWidth" value="${action.screenshotRegion?.width ?? 400}" placeholder="Width" min="1" style="width: 70px;">
          <input type="number" id="screenshotRegionHeight" value="${action.screenshotRegion?.height ?? 300}" placeholder="Height" min="1" style="width: 70px;">
        </div>
        <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.screenshotRegionHint') || 'Пиксели от левого верхнего угла окна'}</small>
      </div>

      <!-- Форма для JavaScript -->
      <div class="form-group" id="javascriptGroup" style="display: ${action.type === 'javascript' ? 'block' : 'none'};">
        <label>${this.t('editorUI.javascriptScriptLabel') || 'JavaScript code'}</label>
        <textarea id="javascriptScript" rows="8" placeholder="return document.title;">${this.escapeHtml(action.value || action.script || '')}</textarea>
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.javascriptScriptHint') || 'Code runs in page context. Use return for result.'}
        </small>
      </div>

      <!-- Форма для API запросов -->
      <div class="form-group" id="apiGroup" style="display: ${action.type === 'api' ? 'block' : 'none'};">
        <label>${this.t('editorUI.httpMethodLabel')}</label>
        <select id="apiMethod">
          <option value="GET" ${action.api?.method === 'GET' ? 'selected' : ''}>GET</option>
          <option value="POST" ${action.api?.method === 'POST' ? 'selected' : ''}>POST</option>
          <option value="PUT" ${action.api?.method === 'PUT' ? 'selected' : ''}>PUT</option>
          <option value="PATCH" ${action.api?.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
          <option value="DELETE" ${action.api?.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          <option value="HEAD" ${action.api?.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
          <option value="OPTIONS" ${action.api?.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
        </select>
      </div>

      <div class="form-group" id="apiUrlGroup" style="display: ${action.type === 'api' ? 'block' : 'none'};">
        <label>${this.t('editorUI.requestUrlLabel')}</label>
        <input type="text" id="apiUrl" value="${this.escapeHtml(action.api?.url || '')}" placeholder="https://api.example.com/endpoint">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.apiUrlHint')}
        </small>
      </div>

      <div class="form-group" id="apiHeadersGroup" style="display: ${action.type === 'api' ? 'block' : 'none'};">
        <label>${this.t('editorUI.headersJson')}</label>
        <textarea id="apiHeaders" rows="4" placeholder='{"Content-Type": "application/json", "Authorization": "Bearer {var:token}"}'>${this.escapeHtml(action.api?.headers ? JSON.stringify(action.api.headers, null, 2) : '')}</textarea>
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.apiHeadersHint')}
        </small>
      </div>

      <div class="form-group" id="apiBodyGroup" style="display: ${action.type === 'api' && ['POST', 'PUT', 'PATCH'].includes(action.api?.method || 'POST') ? 'block' : 'none'};">
        <label>${this.t('editorUI.requestBodyJson')}</label>
        <textarea id="apiBody" rows="6" placeholder='{"key": "value", "id": "{var:userId}"}'>${this.escapeHtml(action.api?.body ? (typeof action.api.body === 'string' ? action.api.body : JSON.stringify(action.api.body, null, 2)) : '')}</textarea>
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.apiBodyHint')}
        </small>
      </div>

      <div class="form-group" id="apiSaveResponseGroup" style="display: ${action.type === 'api' ? 'block' : 'none'};">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="apiSaveResponse" ${action.api?.saveResponse ? 'checked' : ''}>
          <span>${this.t('editorUI.saveResponseToVar')}</span>
        </label>
        <input type="text" id="apiResponseVariable" value="${this.escapeHtml(action.api?.responseVariable || '')}" placeholder="responseData" style="margin-top: 8px; display: ${action.api?.saveResponse ? 'block' : 'none'};">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.apiResponseHint')}
        </small>
      </div>

      <!-- Форма для работы с переменными -->
      <div class="form-group" id="variableGroup" style="display: ${action.type === 'variable' ? 'block' : 'none'};">
        <label>${this.t('editorUI.variableOperationLabel')}</label>
        <select id="variableOperation">
          <option value="extract-url" ${action.variable?.operation === 'extract-url' ? 'selected' : ''}>${this.t('editorUI.extractFromUrlOp')}</option>
          <option value="extract-element" ${action.variable?.operation === 'extract-element' ? 'selected' : ''}>${this.t('editorUI.extractFromElementOp')}</option>
          <option value="set" ${action.variable?.operation === 'set' ? 'selected' : ''}>${this.t('editorUI.setValueOp')}</option>
          <option value="calculate" ${action.variable?.operation === 'calculate' ? 'selected' : ''}>${this.t('editorUI.calculateOp')}</option>
        </select>
      </div>

      <div class="form-group" id="variableNameGroup" style="display: ${action.type === 'variable' ? 'block' : 'none'};">
        <label>${this.t('editorUI.variableNameLabel2')}</label>
        <input type="text" id="variableName" value="${this.escapeHtml(variableNameValue)}" placeholder="userId">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.variableNameHint')}
        </small>
        <small style="text-align: left; display: block; margin-top: 4px; color: #666;">
          ${this.t('editorUI.variableFormatHint')}: <code>\${${this.escapeHtml(variableNamePreview)}}</code> and <code>{var:${this.escapeHtml(variableNamePreview)}}</code>
        </small>
      </div>

      <div class="form-group" id="variableUrlSourceGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'extract-url' ? 'block' : 'none'};">
        <label>${this.t('editorUI.urlSourceLabel')}</label>
        <select id="variableUrlSource">
          <option value="current" ${action.variable?.urlSource === 'current' ? 'selected' : ''}>${this.t('editorUI.currentPage')}</option>
          <option value="previous" ${action.variable?.urlSource === 'previous' ? 'selected' : ''}>${this.t('editorUI.previousPage')}</option>
          <option value="custom" ${action.variable?.urlSource === 'custom' ? 'selected' : ''}>${this.t('editorUI.customUrl')}</option>
        </select>
      </div>

      <div class="form-group" id="variableUrlCustomGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'extract-url' && action.variable?.urlSource === 'custom' ? 'block' : 'none'};">
        <label>URL</label>
        <input type="text" id="variableUrlCustom" value="${this.escapeHtml(action.variable?.url || '')}" placeholder="https://example.com/page?id=123">
      </div>

      <div class="form-group" id="variableUrlPatternGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'extract-url' ? 'block' : 'none'};">
        <label>${this.t('editorUI.extractionPattern')}</label>
        <select id="variableUrlPatternType">
          <option value="query" ${action.variable?.patternType === 'query' ? 'selected' : ''}>${this.t('editorUI.queryParam')}</option>
          <option value="path" ${action.variable?.patternType === 'path' ? 'selected' : ''}>${this.t('editorUI.pathSegment')}</option>
          <option value="regex" ${action.variable?.patternType === 'regex' ? 'selected' : ''}>${this.t('editorUI.regex')}</option>
        </select>
        <input type="text" id="variableUrlPattern" value="${this.escapeHtml(action.variable?.pattern || '')}" placeholder="id" style="margin-top: 8px;">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.urlPatternHint')}
        </small>
      </div>

      <div class="form-group" id="variableSelectorGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'extract-element' ? 'block' : 'none'};">
        <label>${this.t('editorUI.elementSelectorLabel')}</label>
        <input type="text" id="variableSelector" value="${this.escapeHtml(action.variable?.selector || '')}" placeholder="#element-id or .class">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.elementSelectorHint')}
        </small>
      </div>

      <div class="form-group" id="variableExtractTypeGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'extract-element' ? 'block' : 'none'};">
        <label>${this.t('editorUI.extractTypeLabel')}</label>
        <select id="variableExtractType">
          <option value="text" ${action.variable?.extractType === 'text' ? 'selected' : ''}>${this.t('editorUI.elementTextOp')}</option>
          <option value="value" ${action.variable?.extractType === 'value' ? 'selected' : ''}>Value</option>
          <option value="attribute" ${action.variable?.extractType === 'attribute' ? 'selected' : ''}>${this.t('editorUI.attributeOp')}</option>
        </select>
        <input type="text" id="variableAttributeName" value="${this.escapeHtml(action.variable?.attributeName || '')}" placeholder="data-id" style="margin-top: 8px; display: ${action.variable?.extractType === 'attribute' ? 'block' : 'none'};">
      </div>

      <div class="form-group" id="variableSetValueGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'set' ? 'block' : 'none'};">
        <label>${this.t('editorUI.valuePlaceholder')}</label>
        <input type="text" id="variableSetValue" value="${this.escapeHtml(variableSetValue)}" placeholder="Value or {var:variable_name}">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.useOtherVarsHint')}
        </small>
      </div>

      <div class="form-group" id="variableCalculateGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'calculate' ? 'block' : 'none'};">
        <label>${this.t('editorUI.expressionLabel')}</label>
        <input type="text" id="variableCalculate" value="${this.escapeHtml(action.variable?.expression || '')}" placeholder="{var:a} + {var:b} * 2">
        <small style="text-align: left; display: block; margin-top: 4px;">
          Математическое выражение с переменными: <code>{var:a} + {var:b}</code>, <code>{var:x} * 2 - 1</code>
        </small>
      </div>
    `;
  }

  attachFormHandlers() {
    const actionType = document.getElementById('actionType');
    const selectorType = document.getElementById('selectorType');
    
    // Обновляем форму при изменении типа действия
    actionType.addEventListener('change', () => this.updateFormForActionType());
    
    // Загружаем список файлов and проверяем, является ли это файловым input
    this.loadFilesForSelector();
    
    // Обработчик выбора файла
    const fileSelector = document.getElementById('fileSelector');
    if (fileSelector) {
      fileSelector.addEventListener('change', (e) => {
        const actionValueInput = document.getElementById('actionValue');
        if (e.target.value) {
          actionValueInput.value = e.target.value;
        }
      });
    }
    
    // Обновляем список файлов при изменении селектора
    const selectorValueInput = document.getElementById('selectorValue');
    if (selectorValueInput) {
      selectorValueInput.addEventListener('input', () => {
        this.loadFilesForSelector();
      });
    }
    
    selectorType.addEventListener('change', () => this.updateFormForSelectorType());
    
    // Обработчик для иконки подсказки по переменным
    const variableHintIcon = document.getElementById('variableHintIcon');
    if (variableHintIcon) {
      variableHintIcon.addEventListener('click', (e) => {
        e.preventDefault();
        const hint = document.getElementById('variableHint');
        if (hint) {
          hint.classList.toggle('hidden');
        }
      });
    }
    
    // Инициализируем форму
    this.updateFormForActionType();
  }

  async loadFilesForSelector() {
    const fileSelectorGroup = document.getElementById('fileSelectorGroup');
    const fileSelector = document.getElementById('fileSelector');
    if (!fileSelectorGroup || !fileSelector) return;

    // Проверяем, является ли это файловым input по селектору
    const selectorValue = document.getElementById('selectorValue')?.value || '';
    const isFileInput = selectorValue.includes('file-input') || 
                       selectorValue.includes('type="file"') ||
                       selectorValue.includes('[type="file"]') ||
                       selectorValue.toLowerCase().includes('file');

    if (isFileInput) {
      // Загружаем список файлов из настроек
      try {
        const result = await chrome.storage.local.get('pluginSettings');
        const settings = result.pluginSettings;
        const files = settings?.files?.uploaded || [];

        fileSelector.innerHTML = '<option value="">' + this.t('editorUI.selectFile') + '</option>';
        
        if (files.length === 0) {
          fileSelector.innerHTML += '<option value="" disabled>No uploaded files</option>';
        } else {
          files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.name;
            option.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
            fileSelector.appendChild(option);
          });
        }

        fileSelectorGroup.style.display = 'block';
      } catch (error) {
        console.error('Ошибка при загрузке файлов:', error);
        fileSelectorGroup.style.display = 'none';
      }
    } else {
      fileSelectorGroup.style.display = 'none';
    }
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  updateFormForActionType(subtype = null) {
    const actionType = document.getElementById('actionType').value;
    const effectiveSubtype = subtype || this.currentSubtype;
    
    const actionValueGroup = document.getElementById('actionValueGroup');
    const actionValueLabel = document.getElementById('actionValueLabel');
    const actionValueHint = document.getElementById('actionValueHint');
    const urlGroup = document.getElementById('urlGroup');
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    const variableHintIcon = document.getElementById('variableHintIcon');
    
    // Очищаем динамические поля от предыдущего subtype
    this.clearDynamicFields();

    // Сначала скрываем все специальные группы, чтобы избежать наложения элементов
    const specialGroups = [
      'keyboardGroup',
      'javascriptGroup',
      'screenshotCaptureGroup', 'screenshotRegionGroup',
      'apiGroup', 'apiUrlGroup', 'apiHeadersGroup', 'apiBodyGroup', 'apiSaveResponseGroup',
      'variableGroup', 'variableNameGroup', 'variableUrlSourceGroup', 'variableUrlCustomGroup',
      'variableUrlPatternGroup', 'variableSelectorGroup', 'variableExtractTypeGroup',
      'variableSetValueGroup', 'variableCalculateGroup'
    ];
    
    specialGroups.forEach(groupId => {
      const group = document.getElementById(groupId);
      if (group) {
        group.style.display = 'none';
      }
    });

    // Сбрасываем все к видимому состоянию
    if (actionValueGroup) actionValueGroup.classList.remove('hidden');
    if (selectorGroup) selectorGroup.classList.remove('hidden');
    if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
    if (urlGroup) urlGroup.classList.add('hidden');
    
    // Показываем иконку подсказки для полей ввода
    if (variableHintIcon) {
      if (actionType === 'input' || actionType === 'change') {
        variableHintIcon.style.display = 'inline-block';
      } else {
        variableHintIcon.style.display = 'none';
      }
    }

    switch (actionType) {
      case 'click':
      case 'dblclick':
      case 'hover':
      case 'focus':
      case 'blur':
      case 'clear':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        break;
      case 'input':
      case 'change':
        if (actionValueLabel) actionValueLabel.textContent = this.t('editorUI.textToInputLabel');
        if (actionValueHint) actionValueHint.textContent = this.t('editorUI.textToInputHint');
        // Меняем тип input обратно на text
        const actionValueInputText = document.getElementById('actionValue');
        if (actionValueInputText) {
          actionValueInputText.type = 'text';
          actionValueInputText.removeAttribute('min');
          actionValueInputText.removeAttribute('step');
        }
        // Проверяем, является ли это файловым input
        this.loadFilesForSelector();
        break;
      case 'scroll':
        if (actionValueLabel) actionValueLabel.textContent = this.t('editorUI.positionXY');
        if (actionValueHint) actionValueHint.textContent = this.t('editorUI.positionXYHint');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        break;
      case 'navigation':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        if (urlGroup) urlGroup.classList.remove('hidden');
        
        // ИСПРАВЛЕНИЕ #27: Добавляем превью нормализованного URL
        this.setupUrlPreview();
        break;
      case 'wait':
        if (actionValueLabel) actionValueLabel.textContent = this.t('editorUI.delayMsLabel');
        if (actionValueHint) actionValueHint.textContent = this.t('editorUI.delayMsHint');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        const actionValueInput = document.getElementById('actionValue');
        if (actionValueInput) {
          actionValueInput.type = 'number';
          actionValueInput.min = '1';
          actionValueInput.step = '1000';
          actionValueInput.placeholder = 'ms (15000 = 15 sec)';
          const num = parseInt(String(actionValueInput.value).replace(/\s/g, ''), 10);
          if (isNaN(num) || num < 1) actionValueInput.value = '1000';
        }
        break;
      case 'keyboard':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        const keyboardGroup = document.getElementById('keyboardGroup');
        if (keyboardGroup) {
          keyboardGroup.style.display = 'block';
        }
        // Для keyboard селектор опционален (если не глобальное действие)
        break;
      case 'api':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        const apiGroup = document.getElementById('apiGroup');
        const apiUrlGroup = document.getElementById('apiUrlGroup');
        const apiHeadersGroup = document.getElementById('apiHeadersGroup');
        const apiBodyGroup = document.getElementById('apiBodyGroup');
        const apiSaveResponseGroup = document.getElementById('apiSaveResponseGroup');
        if (apiGroup) apiGroup.style.display = 'block';
        if (apiUrlGroup) apiUrlGroup.style.display = 'block';
        if (apiHeadersGroup) apiHeadersGroup.style.display = 'block';
        if (apiBodyGroup) apiBodyGroup.style.display = 'block';
        if (apiSaveResponseGroup) apiSaveResponseGroup.style.display = 'block';
        
        // Обработчик изменения метода для показа/скрытия body
        const apiMethod = document.getElementById('apiMethod');
        if (apiMethod) {
          apiMethod.addEventListener('change', () => {
            const method = apiMethod.value;
            if (apiBodyGroup) {
              apiBodyGroup.style.display = ['POST', 'PUT', 'PATCH'].includes(method) ? 'block' : 'none';
            }
          });
        }
        
        // Обработчик для сохранения ответа
        const apiSaveResponse = document.getElementById('apiSaveResponse');
        const apiResponseVariable = document.getElementById('apiResponseVariable');
        if (apiSaveResponse && apiResponseVariable) {
          apiSaveResponse.addEventListener('change', () => {
            apiResponseVariable.style.display = apiSaveResponse.checked ? 'block' : 'none';
          });
        }
        break;
      case 'variable':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        const variableGroup = document.getElementById('variableGroup');
        const variableNameGroup = document.getElementById('variableNameGroup');
        if (variableGroup) variableGroup.style.display = 'block';
        if (variableNameGroup) variableNameGroup.style.display = 'block';
        
        // Обработчик изменения операции
        const variableOperation = document.getElementById('variableOperation');
        if (variableOperation) {
          variableOperation.addEventListener('change', () => {
            this.updateVariableForm();
          });
        }
        
        // Обработчик для источника URL
        const variableUrlSource = document.getElementById('variableUrlSource');
        if (variableUrlSource) {
          variableUrlSource.addEventListener('change', () => {
            this.updateVariableForm();
          });
        }
        
        // Обработчик для типа извлечения из элемента
        const variableExtractType = document.getElementById('variableExtractType');
        if (variableExtractType) {
          variableExtractType.addEventListener('change', () => {
            const extractType = variableExtractType.value;
            const variableAttributeName = document.getElementById('variableAttributeName');
            if (variableAttributeName) {
              variableAttributeName.style.display = extractType === 'attribute' ? 'block' : 'none';
            }
          });
        }
        
        this.updateVariableForm();
        break;
      case 'setVariable':
        // Для setVariable показываем специальную форму
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        
        // Показываем поля для setVariable (используем существующие поля variable)
        const setVarNameGroup = document.getElementById('variableNameGroup');
        const setVarValueGroup = document.getElementById('variableSetValueGroup');
        if (setVarNameGroup) setVarNameGroup.style.display = 'block';
        if (setVarValueGroup) setVarValueGroup.style.display = 'block';
        
        // Скрываем остальные группы variable
        const hideGroups = ['variableGroup', 'variableUrlSourceGroup', 'variableUrlCustomGroup', 
                           'variableUrlPatternGroup', 'variableSelectorGroup', 'variableExtractTypeGroup', 
                           'variableCalculateGroup'];
        hideGroups.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        break;
      case 'javascript':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        const javascriptGroup = document.getElementById('javascriptGroup');
        if (javascriptGroup) javascriptGroup.style.display = 'block';
        break;
      case 'screenshot':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        const screenshotCaptureGroup = document.getElementById('screenshotCaptureGroup');
        const screenshotRegionGroup = document.getElementById('screenshotRegionGroup');
        if (screenshotCaptureGroup) screenshotCaptureGroup.style.display = 'block';
        this.updateScreenshotFormForCaptureType();
        const screenshotCaptureTypeEl = document.getElementById('screenshotCaptureType');
        if (screenshotCaptureTypeEl) {
          screenshotCaptureTypeEl.removeEventListener('change', this._screenshotCaptureTypeHandler);
          this._screenshotCaptureTypeHandler = () => this.updateScreenshotFormForCaptureType();
          screenshotCaptureTypeEl.addEventListener('change', this._screenshotCaptureTypeHandler);
        }
        break;
    }
    
    // Применяем специфичную логику для подтипов
    if (effectiveSubtype) {
      this.applySubtypeLogic(actionType, effectiveSubtype);
    } else if (actionType === 'assertion') {
      this.currentSubtype = 'assert-value';
      this.applyAssertionSubtype('assert-value');
    } else if (actionType === 'screenshot') {
      this.currentSubtype = 'visual-screenshot';
      this.applyScreenshotSubtype('visual-screenshot');
    } else if (actionType === 'ai') {
      this.currentSubtype = 'ai-smart-selector';
      this.applyAISubtype('ai-smart-selector');
    } else {
      this.currentSubtype = null;
    }
  }

  // ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С SUBTYPES ====================
  
  /**
   * Очистка динамических полей, созданных для subtypes
   */
  clearDynamicFields() {
    const dynamicIds = [
      'expectedValueField', 'countField', 'optionTextField', 
      'conditionField', 'baselineField', 'descriptionField',
      'stateRadioField', 'multiValueField'
    ];
    
    dynamicIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }
  
  /**
   * ИСПРАВЛЕНИЕ #27: Превью нормализованного URL для navigation шагов
   */
  setupUrlPreview() {
    const urlInput = document.getElementById('actionUrl');
    if (!urlInput) return;
    
    // Удаляем старый preview элемент если есть
    const existingPreview = document.getElementById('urlNormalizedPreview');
    if (existingPreview) existingPreview.remove();
    
    // Создаем элемент для превью
    const preview = document.createElement('div');
    preview.id = 'urlNormalizedPreview';
    preview.style.cssText = 'font-size: 11px; color: #666; margin-top: 4px; padding: 4px 8px; background: #f5f5f5; border-radius: 4px;';
    
    // Функция нормализации URL (аналогичная player.js)
    const normalizeUrl = (url) => {
      if (!url || typeof url !== 'string') return null;
      url = url.trim();
      if (!url) return null;
      
      // Если уже есть протокол
      if (/^https?:\/\//i.test(url)) {
        return url;
      }
      
      // Если начинается с //
      if (url.startsWith('//')) {
        return 'https:' + url;
      }
      
      // Bare domain - добавляем https://
      return 'https://' + url;
    };
    
    // Функция обновления превью
    const updatePreview = () => {
      const rawUrl = urlInput.value.trim();
      const normalized = normalizeUrl(rawUrl);
      
      if (normalized && normalized !== rawUrl) {
        preview.textContent = `→ ${normalized}`;
        preview.style.display = 'block';
      } else if (normalized === rawUrl) {
        preview.textContent = '✓ URL корректный';
        preview.style.color = '#4caf50';
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    };
    
    // Вставляем превью после поля ввода
    urlInput.parentNode.insertBefore(preview, urlInput.nextSibling);
    
    // Слушаем изменения
    urlInput.removeEventListener('input', urlInput._urlPreviewHandler);
    urlInput._urlPreviewHandler = updatePreview;
    urlInput.addEventListener('input', updatePreview);
    
    // Начальное обновление
    updatePreview();
  }
  
  /**
   * Применение специфичной логики для подтипов
   * @param {string} type - Основной тип действия
   * @param {string} subtype - Подтип действия
   */
  applySubtypeLogic(type, subtype) {
    if (!subtype) return;
    
    switch (type) {
      case 'wait':
        this.applyWaitSubtype(subtype);
        break;
      case 'assertion':
        this.applyAssertionSubtype(subtype);
        break;
      case 'click':
        if (subtype.startsWith('dropdown-')) {
          this.applyDropdownSubtype(subtype);
        }
        break;
      case 'input':
        if (subtype.startsWith('dropdown-')) {
          this.applyDropdownSubtype(subtype);
        }
        break;
      case 'screenshot':
        this.applyScreenshotSubtype(subtype);
        break;
      case 'ai':
        this.applyAISubtype(subtype);
        break;
      case 'scroll':
        this.applyScrollSubtype(subtype);
        break;
    }
  }
  
  /**
   * Логика для Wait subtypes
   */
  applyWaitSubtype(subtype) {
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    const actionValueGroup = document.getElementById('actionValueGroup');
    const actionValueLabel = document.getElementById('actionValueLabel');
    const actionValueInput = document.getElementById('actionValue');
    
    // Для всех wait subtypes показываем поле таймаута
    if (actionValueGroup && actionValueLabel && actionValueInput) {
      actionValueGroup.classList.remove('hidden');
      actionValueLabel.textContent = this.t('editorUI.maxTimeout') || 'Максимальный таймаут (мс)';
      actionValueInput.value = '5000'; // Предзаполнение
      actionValueInput.placeholder = this.t('editorUI.maxTimeout') || '5000';
      actionValueInput.type = 'number';
      actionValueInput.min = '100';
      actionValueInput.step = '1000';
    }
    
    switch (subtype) {
      case 'wait-value':
        // Показываем селектор + поле для ожидаемого значения
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        this.addExpectedValueField();
        break;
        
      case 'wait-option':
        // Селектор dropdown + текст опции
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        this.addOptionTextField(this.t('editorUI.optionTextLabel') || 'Текст опции для ожидания');
        break;
        
      case 'wait-options-count':
        // Селектор + количество
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        this.addCountField(this.t('editorUI.expectedCount') || 'Ожидаемое количество опций');
        break;
        
      case 'wait-enabled':
        // Только селектор
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        break;
        
      case 'wait-until':
        // Поле для условия
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        this.addConditionField(this.t('editorUI.conditionLabel') || 'Условие для ожидания');
        break;
        
      default:
        // Простая задержка - только таймаут
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        if (actionValueLabel) {
          actionValueLabel.textContent = this.t('editorUI.delayMsLabel') || 'Задержка (мс)';
        }
        break;
    }
  }
  
  /**
   * Логика для Assertion subtypes
   */
  applyAssertionSubtype(subtype) {
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    
    // Для всех assertions нужен селектор
    if (selectorGroup) selectorGroup.classList.remove('hidden');
    if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
    
    switch (subtype) {
      case 'assert-value':
        this.addExpectedValueField();
        break;
        
      case 'assert-count':
        this.addCountField(this.t('editorUI.expectedCount') || 'Ожидаемое количество элементов');
        break;
        
      case 'assert-contains':
        this.addOptionTextField(this.t('editorUI.optionTextLabel') || 'Текст, который должен содержаться');
        break;
        
      case 'assert-disabled':
        this.addStateRadioField();
        break;
        
      case 'assert-multiselect':
        this.addMultiValueField();
        break;
    }
  }
  
  /**
   * Логика для Dropdown subtypes
   */
  applyDropdownSubtype(subtype) {
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    const selectorValueLabel = selectorValueGroup?.querySelector('label');
    
    if (selectorGroup) selectorGroup.classList.remove('hidden');
    if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
    
    switch (subtype) {
      case 'dropdown-select':
        if (selectorValueLabel) {
          selectorValueLabel.textContent = this.t('editorUI.selectorDropdownLabel') || 'Селектор dropdown';
        }
        this.addOptionTextField(this.t('editorUI.optionToSelect') || 'Текст или селектор опции для выбора');
        break;
        
      case 'dropdown-multiselect':
        if (selectorValueLabel) {
          selectorValueLabel.textContent = this.t('editorUI.selectorDropdownLabel') || 'Селектор dropdown';
        }
        this.addMultiValueField();
        break;
        
      case 'dropdown-deselect':
        this.addOptionTextField(this.t('editorUI.optionToDeselect') || 'Текст опции для отмены выбора');
        break;
        
      case 'dropdown-select-all':
      case 'dropdown-clear-all':
        if (selectorValueLabel) {
          selectorValueLabel.textContent = this.t('editorUI.selectorButtonLabel') || 'Селектор кнопки';
        }
        break;
        
      case 'dropdown-datalist':
      case 'dropdown-combobox':
        this.addOptionTextField(this.t('editorUI.textToSearch') || 'Текст для ввода/поиска');
        break;
    }
  }
  
  /**
   * Обновляет форму скриншота в зависимости от выбранного типа области
   */
  updateScreenshotFormForCaptureType() {
    const captureType = document.getElementById('screenshotCaptureType')?.value || 'element';
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    const screenshotRegionGroup = document.getElementById('screenshotRegionGroup');
    
    if (selectorGroup) selectorGroup.classList.toggle('hidden', captureType !== 'element');
    if (selectorValueGroup) selectorValueGroup.classList.toggle('hidden', captureType !== 'element');
    if (screenshotRegionGroup) screenshotRegionGroup.style.display = captureType === 'region' ? 'block' : 'none';
  }

  /**
   * Логика для Screenshot subtypes
   */
  applyScreenshotSubtype(subtype) {
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    
    if (subtype === 'visual-screenshot') {
      this.updateScreenshotFormForCaptureType();
      return;
    }
    
    if (selectorGroup) selectorGroup.classList.remove('hidden');
    if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
    
    switch (subtype) {
      case 'visual-baseline':
        this.addBaselineNameField();
        break;
        
      case 'visual-compare-baseline':
        this.addBaselineNameField();
        break;
    }
  }
  
  /**
   * Логика для AI subtypes
   */
  applyAISubtype(subtype) {
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    
    switch (subtype) {
      case 'ai-smart-selector':
      case 'ai-find-healing':
        // Текстовое поле для описания
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        this.addDescriptionField();
        break;
        
      case 'ai-analyze-stability':
      case 'ai-suggest-alternatives':
      case 'ai-heal-selector':
        // Селектор обязателен
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        break;
    }
  }
  
  /**
   * Логика для Scroll subtypes
   */
  applyScrollSubtype(subtype) {
    const selectorGroup = document.getElementById('selectorGroup');
    const selectorValueGroup = document.getElementById('selectorValueGroup');
    const actionValueGroup = document.getElementById('actionValueGroup');
    
    switch (subtype) {
      case 'scroll-element':
        // Показываем селектор
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        break;
        
      case 'scroll-top':
      case 'scroll-bottom':
        // Скрываем селектор и position
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        break;
    }
  }
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ДОБАВЛЕНИЯ ПОЛЕЙ ====================
  
  /**
   * Добавление поля для ожидаемого значения
   */
  addExpectedValueField() {
    const container = document.getElementById('actionValueGroup');
    if (!container) return;
    
    // Проверяем, не добавлено ли уже поле
    if (document.getElementById('expectedValueField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="expectedValueField">
        <label>${this.t('editorUI.expectedValue') || 'Ожидаемое значение'}</label>
        <input type="text" id="expectedValue" placeholder="${this.t('editorUI.expectedValuePlaceholder') || 'Например: $99.99'}">
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.expectedValueHint') || 'Значение, которое должно появиться в элементе'}
        </small>
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление поля для количества
   */
  addCountField(label) {
    const container = document.getElementById('actionValueGroup');
    if (!container || document.getElementById('countField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="countField">
        <label>${label}</label>
        <input type="number" id="expectedCount" min="0" value="1" placeholder="${this.t('editorUI.expectedCountPlaceholder') || 'Число'}">
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление поля для текста опции
   */
  addOptionTextField(label) {
    const container = document.getElementById('selectorValueGroup');
    if (!container || document.getElementById('optionTextField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="optionTextField">
        <label>${label}</label>
        <input type="text" id="optionText" placeholder="${this.t('editorUI.optionTextPlaceholder') || 'Текст опции'}">
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление поля для условия
   */
  addConditionField(label) {
    const container = document.getElementById('actionValueGroup');
    if (!container || document.getElementById('conditionField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="conditionField">
        <label>${label}</label>
        <textarea id="conditionExpression" rows="3" placeholder="${this.t('editorUI.conditionPlaceholder') || "element.textContent === 'Loaded'"}"></textarea>
        <small style="text-align: left; display: block; margin-top: 4px;">
          ${this.t('editorUI.conditionHint') || 'JavaScript выражение, которое должно вернуть true'}
        </small>
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление radio для состояния enabled/disabled
   */
  addStateRadioField() {
    const container = document.getElementById('selectorValueGroup');
    if (!container || document.getElementById('stateRadioField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="stateRadioField">
        <label>${this.t('editorUI.expectedState') || 'Ожидаемое состояние'}</label>
        <div style="display: flex; gap: 16px;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="radio" name="expectedState" value="enabled" checked>
            <span>${this.t('editorUI.stateEnabled') || 'Enabled (активен)'}</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="radio" name="expectedState" value="disabled">
            <span>${this.t('editorUI.stateDisabled') || 'Disabled (неактивен)'}</span>
          </label>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление поля для множественных значений
   */
  addMultiValueField() {
    const container = document.getElementById('selectorValueGroup');
    if (!container || document.getElementById('multiValueField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="multiValueField">
        <label>${this.t('editorUI.expectedValuesMultiline') || 'Ожидаемые значения (по одному на строку)'}</label>
        <textarea id="expectedValues" rows="5" placeholder="${this.t('editorUI.expectedValuesPlaceholder') || 'Значение 1\\nЗначение 2\\nЗначение 3'}"></textarea>
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление поля для имени baseline
   */
  addBaselineNameField() {
    const container = document.getElementById('selectorValueGroup');
    if (!container || document.getElementById('baselineField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="baselineField">
        <label>${this.t('editorUI.baselineName') || 'Имя baseline'}</label>
        <input type="text" id="baselineName" placeholder="${this.t('editorUI.baselineNamePlaceholder') || 'Например: homepage-header'}">
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  
  /**
   * Добавление поля для описания элемента (AI)
   */
  addDescriptionField() {
    const container = document.getElementById('actionValueGroup');
    if (!container || document.getElementById('descriptionField')) return;
    
    const fieldHTML = `
      <div class="form-group" id="descriptionField">
        <label>${this.t('editorUI.elementDescription') || 'Описание элемента'}</label>
        <textarea id="elementDescription" rows="3" placeholder="${this.t('editorUI.elementDescriptionPlaceholder') || 'Опишите элемент естественным языком'}"></textarea>
        <small style="text-align: left; display: block; margin-top: 4px;">
          Например: "Красная кнопка Submit в футере, справа от кнопки Cancel"
        </small>
      </div>
    `;
    
    container.insertAdjacentHTML('afterend', fieldHTML);
  }
  // ==================== ВАЛИДАЦИЯ И СОХРАНЕНИЕ SUBTYPES ====================
  
  /**
   * Валидация полей в зависимости от subtype
   */
  validateSubtype(type, subtype) {
    const result = { valid: true, message: '' };
    
    switch (type) {
      case 'wait':
        return this.validateWaitSubtype(subtype);
      case 'assertion':
        return this.validateAssertionSubtype(subtype);
      case 'click':
      case 'input':
        if (subtype?.startsWith('dropdown-')) {
          return this.validateDropdownSubtype(subtype);
        }
        break;
    }
    
    return result;
  }
  
  /**
   * Валидация Wait subtypes
   */
  validateWaitSubtype(subtype) {
    const result = { valid: true, message: '' };
    const selectorValue = document.getElementById('selectorValue')?.value;
    
    switch (subtype) {
      case 'wait-value':
        if (!selectorValue) {
          return { valid: false, message: this.t('editorUI.selectorRequired') || 'Укажите селектор элемента' };
        }
        const expectedValue = document.getElementById('expectedValue')?.value;
        if (!expectedValue) {
          return { valid: false, message: this.t('editorUI.expectedValueRequired') || 'Укажите ожидаемое значение' };
        }
        break;
        
      case 'wait-option':
        if (!selectorValue) {
          return { valid: false, message: 'Укажите селектор dropdown' };
        }
        const optionText = document.getElementById('optionText')?.value;
        if (!optionText) {
          return { valid: false, message: 'Укажите текст опции' };
        }
        break;
        
      case 'wait-options-count':
        if (!selectorValue) {
          return { valid: false, message: 'Укажите селектор контейнера' };
        }
        const count = document.getElementById('expectedCount')?.value;
        if (!count || parseInt(count) < 0) {
          return { valid: false, message: 'Укажите корректное количество (>= 0)' };
        }
        break;
        
      case 'wait-enabled':
        if (!selectorValue) {
          return { valid: false, message: 'Укажите селектор элемента' };
        }
        break;
        
      case 'wait-until':
        const condition = document.getElementById('conditionExpression')?.value;
        if (!condition) {
          return { valid: false, message: 'Укажите условие для ожидания' };
        }
        break;
    }
    
    return result;
  }
  
  /**
   * Валидация Assertion subtypes
   */
  validateAssertionSubtype(subtype) {
    const result = { valid: true, message: '' };
    const selectorValue = document.getElementById('selectorValue')?.value;
    
    // Для всех assertions нужен селектор
    if (!selectorValue) {
      return { valid: false, message: 'Укажите селектор элемента' };
    }
    
    switch (subtype) {
      case 'assert-value':
        const expectedValue = document.getElementById('expectedValue')?.value;
        if (!expectedValue) {
          return { valid: false, message: 'Укажите ожидаемое значение' };
        }
        break;
        
      case 'assert-count':
        const count = document.getElementById('expectedCount')?.value;
        if (!count || parseInt(count) < 0) {
          return { valid: false, message: 'Укажите корректное количество' };
        }
        break;
        
      case 'assert-contains':
        const text = document.getElementById('optionText')?.value;
        if (!text) {
          return { valid: false, message: 'Укажите текст для проверки' };
        }
        break;
    }
    
    return result;
  }
  
  /**
   * Валидация Dropdown subtypes
   */
  validateDropdownSubtype(subtype) {
    const result = { valid: true, message: '' };
    const selectorValue = document.getElementById('selectorValue')?.value;
    
    if (!selectorValue) {
      return { valid: false, message: 'Укажите селектор' };
    }
    
    switch (subtype) {
      case 'dropdown-select':
      case 'dropdown-deselect':
        const optionText = document.getElementById('optionText')?.value;
        if (!optionText) {
          return { valid: false, message: 'Укажите текст опции' };
        }
        break;
        
      case 'dropdown-multiselect':
        const valuesText = document.getElementById('expectedValues')?.value;
        if (!valuesText || !valuesText.trim()) {
          return { valid: false, message: 'Укажите значения опций' };
        }
        break;
    }
    
    return result;
  }
  
  /**
   * Сохранение дополнительных полей subtype в action
   */
  saveSubtypeFields(action, type, subtype) {
    switch (type) {
      case 'wait':
        this.saveWaitSubtypeFields(action, subtype);
        break;
      case 'assertion':
        this.saveAssertionSubtypeFields(action, subtype);
        break;
      case 'click':
      case 'input':
        if (subtype?.startsWith('dropdown-')) {
          this.saveDropdownSubtypeFields(action, subtype);
        }
        break;
      case 'screenshot':
        this.saveScreenshotSubtypeFields(action, subtype);
        break;
      case 'ai':
        this.saveAISubtypeFields(action, subtype);
        break;
    }
  }
  
  /**
   * Сохранение полей Wait subtypes
   */
  saveWaitSubtypeFields(action, subtype) {
    // Сохраняем maxTimeout для всех wait subtypes
    const maxTimeout = parseInt(document.getElementById('actionValue')?.value);
    if (maxTimeout && maxTimeout > 0) {
      action.maxTimeout = maxTimeout;
    }
    
    switch (subtype) {
      case 'wait-value':
        action.expectedValue = document.getElementById('expectedValue')?.value;
        break;
        
      case 'wait-option':
        action.optionText = document.getElementById('optionText')?.value;
        break;
        
      case 'wait-options-count':
        action.expectedCount = parseInt(document.getElementById('expectedCount')?.value);
        break;
        
      case 'wait-until':
        action.condition = document.getElementById('conditionExpression')?.value;
        break;
    }
  }
  
  /**
   * Сохранение полей Assertion subtypes
   */
  saveAssertionSubtypeFields(action, subtype) {
    switch (subtype) {
      case 'assert-value':
        action.expectedValue = document.getElementById('expectedValue')?.value;
        break;
        
      case 'assert-count':
        action.expectedCount = parseInt(document.getElementById('expectedCount')?.value);
        break;
        
      case 'assert-contains':
        action.expectedText = document.getElementById('optionText')?.value;
        break;
        
      case 'assert-disabled':
        const state = document.querySelector('input[name="expectedState"]:checked')?.value;
        action.expectedState = state;
        break;
        
      case 'assert-multiselect':
        const valuesText = document.getElementById('expectedValues')?.value;
        action.expectedValues = valuesText.split('\n').map(v => v.trim()).filter(v => v);
        break;
    }
  }
  
  /**
   * Сохранение полей Dropdown subtypes
   */
  saveDropdownSubtypeFields(action, subtype) {
    switch (subtype) {
      case 'dropdown-select':
      case 'dropdown-deselect':
        action.optionText = document.getElementById('optionText')?.value;
        break;
        
      case 'dropdown-multiselect':
        const valuesText = document.getElementById('expectedValues')?.value;
        action.optionValues = valuesText.split('\n').map(v => v.trim()).filter(v => v);
        break;
        
      case 'dropdown-datalist':
      case 'dropdown-combobox':
        action.searchText = document.getElementById('optionText')?.value;
        break;
    }
  }
  
  /**
   * Сохранение полей Screenshot subtypes
   */
  saveScreenshotSubtypeFields(action, subtype) {
    const captureType = document.getElementById('screenshotCaptureType')?.value || 'element';
    action.screenshotCaptureType = captureType;
    if (captureType === 'region') {
      action.screenshotRegion = {
        x: parseInt(document.getElementById('screenshotRegionX')?.value, 10) || 0,
        y: parseInt(document.getElementById('screenshotRegionY')?.value, 10) || 0,
        width: parseInt(document.getElementById('screenshotRegionWidth')?.value, 10) || 400,
        height: parseInt(document.getElementById('screenshotRegionHeight')?.value, 10) || 300
      };
    } else {
      delete action.screenshotRegion;
    }
    switch (subtype) {
      case 'visual-baseline':
      case 'visual-compare-baseline':
        action.baselineName = document.getElementById('baselineName')?.value;
        break;
    }
  }
  
  /**
   * Сохранение полей AI subtypes
   */
  saveAISubtypeFields(action, subtype) {
    switch (subtype) {
      case 'ai-smart-selector':
      case 'ai-find-healing':
        action.elementDescription = document.getElementById('elementDescription')?.value;
        break;
    }
  }

  updateVariableForm() {
    const variableOperation = document.getElementById('variableOperation')?.value;
    const variableUrlSource = document.getElementById('variableUrlSource')?.value;
    const variableExtractType = document.getElementById('variableExtractType')?.value;
    
    // Скрываем все группы
    const groups = [
      'variableUrlSourceGroup', 'variableUrlCustomGroup', 'variableUrlPatternGroup',
      'variableSelectorGroup', 'variableExtractTypeGroup', 'variableSetValueGroup', 'variableCalculateGroup'
    ];
    groups.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    
    // Показываем нужные группы в зависимости от операции
    if (variableOperation === 'extract-url') {
      const urlSourceGroup = document.getElementById('variableUrlSourceGroup');
      const urlPatternGroup = document.getElementById('variableUrlPatternGroup');
      if (urlSourceGroup) urlSourceGroup.style.display = 'block';
      if (urlPatternGroup) urlPatternGroup.style.display = 'block';
      
      if (variableUrlSource === 'custom') {
        const urlCustomGroup = document.getElementById('variableUrlCustomGroup');
        if (urlCustomGroup) urlCustomGroup.style.display = 'block';
      }
    } else if (variableOperation === 'extract-element') {
      const selectorGroup = document.getElementById('variableSelectorGroup');
      const extractTypeGroup = document.getElementById('variableExtractTypeGroup');
      if (selectorGroup) selectorGroup.style.display = 'block';
      if (extractTypeGroup) extractTypeGroup.style.display = 'block';
      
      if (variableExtractType === 'attribute') {
        const attributeName = document.getElementById('variableAttributeName');
        if (attributeName) attributeName.style.display = 'block';
      }
    } else if (variableOperation === 'set') {
      const setValueGroup = document.getElementById('variableSetValueGroup');
      if (setValueGroup) setValueGroup.style.display = 'block';
    } else if (variableOperation === 'calculate') {
      const calculateGroup = document.getElementById('variableCalculateGroup');
      if (calculateGroup) calculateGroup.style.display = 'block';
    }
  }

  updateFormForSelectorType() {
    // Можно добавить логику для разных типов селекторов
  }

  saveAction() {
    // Проверяем тип редактируемого действия
    if (this.currentEditingActionType === 'condition') {
      this.saveCondition();
      return;
    }
    
    if (this.currentEditingActionType === 'loop') {
      this.saveLoop();
      return;
    }
    
    // Обычное действие
    const actionType = document.getElementById('actionType')?.value;
    const subtype = this.currentSubtype;

    if (!this.runtimeSupportedActionTypes.has(actionType)) {
      alert(`Тип действия "${actionType}" пока не поддерживается при воспроизведении`);
      return;
    }
    if (subtype && this.runtimeSupportedSubtypes[actionType] && !this.runtimeSupportedSubtypes[actionType].has(subtype)) {
      alert(`Быстрый шаг "${subtype}" пока не поддерживается при воспроизведении`);
      return;
    }
    
    // Валидация в зависимости от subtype
    if (subtype) {
      const validationResult = this.validateSubtype(actionType, subtype);
      if (!validationResult.valid) {
        alert(validationResult.message);
        return;
      }
    }
    
    const selectorType = document.getElementById('selectorType')?.value;
    const selectorValue = document.getElementById('selectorValue')?.value;
    const actionValue = document.getElementById('actionValue')?.value;
    const actionUrl = document.getElementById('actionUrl')?.value;

    const screenshotCaptureType = document.getElementById('screenshotCaptureType')?.value;
    const screenshotSkipsSelector = actionType === 'screenshot' && (screenshotCaptureType === 'full' || screenshotCaptureType === 'region');
    if (!selectorValue && actionType !== 'scroll' && actionType !== 'navigation' && actionType !== 'wait' && actionType !== 'keyboard' && actionType !== 'api' && actionType !== 'variable' && actionType !== 'setVariable' && actionType !== 'javascript' && actionType !== 'cookie' && !screenshotSkipsSelector) {
      alert(this.t('editorUI.specifySelector'));
      return;
    }
    
    if (actionType === 'wait') {
      const delay = parseInt(String(actionValue).replace(/\s/g, ''), 10) || 0;
      if (delay <= 0) {
        alert(this.t('editorUI.specifyDelay'));
        return;
      }
    }

    if (actionType === 'keyboard') {
      const keyboardKey = document.getElementById('keyboardKey').value;
      if (!keyboardKey) {
        alert(this.t('editorUI.selectKey'));
        return;
      }
    }

    if (actionType === 'api') {
      const apiUrl = document.getElementById('apiUrl')?.value;
      const apiMethod = document.getElementById('apiMethod')?.value;
      if (!apiUrl) {
        alert(this.t('editorUI.specifyApiUrl'));
        return;
      }
      if (!apiMethod) {
        alert(this.t('editorUI.selectHttpMethod'));
        return;
      }
    }

    if (actionType === 'variable') {
      const variableName = document.getElementById('variableName')?.value;
      const variableOperation = document.getElementById('variableOperation')?.value;
      if (!variableName) {
        alert(this.t('editorUI.specifyVariableName'));
        return;
      }
      if (!variableOperation) {
        alert(this.t('editorUI.selectVariableOperation'));
        return;
      }
    }

    if (actionType === 'javascript') {
      const scriptEl = document.getElementById('javascriptScript');
      const script = scriptEl ? scriptEl.value.trim() : '';
      if (!script) {
        alert(this.t('editorUI.specifyJavascriptScript') || 'Enter JavaScript code');
        return;
      }
    }

    if (actionType === 'cookie') {
      const cookieValue = String(actionValue || '').trim();
      const isGetCookies = subtype === 'get-cookies';
      if (!isGetCookies && (!cookieValue || !cookieValue.includes('='))) {
        alert('Для cookie-шага укажите значение в формате name=value');
        return;
      }
    }

    // Создаем объект селектора
    let selector = null;
    const screenshotNoSelector = actionType === 'screenshot' && (screenshotCaptureType === 'full' || screenshotCaptureType === 'region');
    if (actionType !== 'scroll' && actionType !== 'navigation' && actionType !== 'wait' && actionType !== 'api' && actionType !== 'variable' && actionType !== 'setVariable' && actionType !== 'javascript' && actionType !== 'cookie' && !screenshotNoSelector) {
      if (actionType === 'keyboard') {
        // Для keyboard селектор опционален (если не глобальное действие)
        const isGlobal = document.getElementById('keyboardGlobal').checked;
        if (!isGlobal && selectorValue) {
          selector = this.buildSelector(selectorType, selectorValue);
        }
      } else {
        selector = this.buildSelector(selectorType, selectorValue);
      }
    }

    // Создаем объект действия
    const action = {
      type: actionType,
      selector: selector,
      timestamp: Date.now(),
      url: actionUrl || window.location.href
    };
    
    // Сохраняем subtype если есть
    if (this.currentSubtype) {
      action.subtype = this.currentSubtype;
    }

    // Добавляем значение в зависимости от типа
    if (actionType === 'input' || actionType === 'change') {
      action.value = actionValue;
    } else if (actionType === 'scroll') {
      const [x, y] = actionValue.split(',').map(v => parseInt(v.trim()) || 0);
      action.position = { x, y };
    } else if (actionType === 'navigation') {
      action.url = actionUrl;
    } else if (actionType === 'wait') {
      const delay = parseInt(String(actionValue).replace(/\s/g, ''), 10) || 1000;
      action.delay = Math.max(100, delay);
      action.value = action.delay; // Для совместимости
    } else if (actionType === 'keyboard') {
      const keyboardKey = document.getElementById('keyboardKey').value;
      const keyboardCtrl = document.getElementById('keyboardCtrl').checked;
      const keyboardAlt = document.getElementById('keyboardAlt').checked;
      const keyboardShift = document.getElementById('keyboardShift').checked;
      const keyboardMeta = document.getElementById('keyboardMeta').checked;
      const isGlobal = document.getElementById('keyboardGlobal').checked;
      
      action.key = keyboardKey;
      action.code = keyboardKey;
      action.modifiers = {
        ctrl: keyboardCtrl,
        alt: keyboardAlt,
        shift: keyboardShift,
        meta: keyboardMeta
      };
      action.isGlobal = isGlobal;
      
      // Формируем комбинацию для отображения
      const modifiers = [];
      if (keyboardCtrl) modifiers.push('Ctrl');
      if (keyboardMeta) modifiers.push('Meta');
      if (keyboardAlt) modifiers.push('Alt');
      if (keyboardShift) modifiers.push('Shift');
        action.keyCombination = modifiers.length > 0 
        ? `${modifiers.join('+')}+${keyboardKey}`
        : keyboardKey;
    } else if (actionType === 'api') {
      const apiMethod = document.getElementById('apiMethod').value;
      const apiUrl = document.getElementById('apiUrl').value;
      const apiHeaders = document.getElementById('apiHeaders').value;
      const apiBody = document.getElementById('apiBody').value;
      const apiSaveResponse = document.getElementById('apiSaveResponse').checked;
      const apiResponseVariable = document.getElementById('apiResponseVariable').value;
      
      action.api = {
        method: apiMethod,
        url: apiUrl,
        headers: apiHeaders ? (() => {
          try {
            return JSON.parse(apiHeaders);
          } catch (e) {
            console.warn('Невалидный JSON для заголовков, используем пустой объект');
            return {};
          }
        })() : {},
        body: apiBody ? (() => {
          try {
            return JSON.parse(apiBody);
          } catch (e) {
            // Если не JSON, сохраняем как строку
            return apiBody;
          }
        })() : null,
        saveResponse: apiSaveResponse,
        responseVariable: apiSaveResponse ? apiResponseVariable : null
      };
    } else if (actionType === 'variable') {
      const variableName = document.getElementById('variableName').value;
      const variableOperation = document.getElementById('variableOperation').value;
      
      action.variable = {
        name: variableName,
        operation: variableOperation
      };
      
      if (variableOperation === 'extract-url') {
        const urlSource = document.getElementById('variableUrlSource').value;
        const urlCustom = document.getElementById('variableUrlCustom')?.value;
        const patternType = document.getElementById('variableUrlPatternType').value;
        const pattern = document.getElementById('variableUrlPattern').value;
        
        action.variable.urlSource = urlSource;
        if (urlSource === 'custom' && urlCustom) {
          action.variable.url = urlCustom;
        }
        action.variable.patternType = patternType;
        action.variable.pattern = pattern;
      } else if (variableOperation === 'extract-element') {
        const selector = document.getElementById('variableSelector').value;
        const extractType = document.getElementById('variableExtractType').value;
        const attributeName = document.getElementById('variableAttributeName')?.value;
        
        action.variable.selector = selector;
        action.variable.extractType = extractType;
        if (extractType === 'attribute' && attributeName) {
          action.variable.attributeName = attributeName;
        }
      } else if (variableOperation === 'set') {
        const setValue = document.getElementById('variableSetValue').value;
        action.variable.value = setValue;
      } else if (variableOperation === 'calculate') {
        const expression = document.getElementById('variableCalculate').value;
        action.variable.expression = expression;
      }
    } else if (actionType === 'setVariable') {
      const variableName = document.getElementById('variableName')?.value || '';
      const variableValue = document.getElementById('variableSetValue')?.value || '';
      
      if (!variableName) {
        alert(this.t('editorUI.specifyVariableName'));
        return;
      }
      
      action.variableName = variableName;
      action.variableValue = variableValue;
      action.source = 'manual';
    } else if (actionType === 'javascript') {
      const scriptEl = document.getElementById('javascriptScript');
      const script = scriptEl ? scriptEl.value : '';
      action.value = script;
      action.script = script;
    }
    
    // Сохраняем дополнительные поля в зависимости от subtype
    if (this.currentSubtype) {
      this.saveSubtypeFields(action, actionType, this.currentSubtype);
    }

    // Сохраняем или обновляем действие
    // Проверяем, добавляем ли мы действие внутрь цикла или условия
    if (this.currentParentAction !== null && this.currentBranch !== null) {
      console.log(`💾 [Editor] Сохраняю действие внутрь ${this.currentBranch === 'loop' ? 'цикла' : 'условия'} (parentIndex: ${this.currentParentAction})`);
      
      // Добавляем действие внутрь цикла или условия
      const parentAction = this.test.actions[this.currentParentAction];
      if (!parentAction) {
        console.error(`❌ [Editor] Родительское действие не найдено (index: ${this.currentParentAction})`);
        alert(this.t('editorUI.parentActionNotFound'));
        return;
      }
      
      action.userEdited = true;
      action.userEditedAt = new Date().toISOString();
      
      if (parentAction.type === 'condition') {
        // Добавляем в ветку условия
        if (this.currentBranch === 'then') {
          if (!parentAction.thenActions) parentAction.thenActions = [];
          if (this.currentEditingAction !== null && this.currentEditingAction !== -1 && typeof this.currentEditingAction === 'number') {
            // Редактируем существующее действие в ветке
            const branchIndex = this.currentEditingAction;
            if (branchIndex >= 0 && branchIndex < parentAction.thenActions.length) {
              parentAction.thenActions[branchIndex] = action;
              console.log(`✅ [Editor] Обновлено действие в ветке "Тогда" (index: ${branchIndex})`);
            } else {
              parentAction.thenActions.push(action);
              console.log(`✅ [Editor] Добавлено действие в ветку "Тогда" (всего: ${parentAction.thenActions.length})`);
            }
          } else {
            parentAction.thenActions.push(action);
            console.log(`✅ [Editor] Добавлено действие в ветку "Тогда" (всего: ${parentAction.thenActions.length})`);
          }
        } else if (this.currentBranch === 'else') {
          if (!parentAction.elseActions) parentAction.elseActions = [];
          if (this.currentEditingAction !== null && this.currentEditingAction !== -1 && typeof this.currentEditingAction === 'number') {
            // Редактируем существующее действие в ветке
            const branchIndex = this.currentEditingAction;
            if (branchIndex >= 0 && branchIndex < parentAction.elseActions.length) {
              parentAction.elseActions[branchIndex] = action;
              console.log(`✅ [Editor] Обновлено действие в ветке "Иначе" (index: ${branchIndex})`);
            } else {
              parentAction.elseActions.push(action);
              console.log(`✅ [Editor] Добавлено действие в ветку "Иначе" (всего: ${parentAction.elseActions.length})`);
            }
          } else {
            parentAction.elseActions.push(action);
            console.log(`✅ [Editor] Добавлено действие в ветку "Иначе" (всего: ${parentAction.elseActions.length})`);
          }
        }
      } else if (parentAction.type === 'loop') {
        // Добавляем в цикл
        if (!parentAction.actions) parentAction.actions = [];
        if (this.currentEditingAction !== null && this.currentEditingAction !== -1 && typeof this.currentEditingAction === 'number') {
          // Редактируем существующее действие в цикле
          const loopIndex = this.currentEditingAction;
          if (loopIndex >= 0 && loopIndex < parentAction.actions.length) {
            parentAction.actions[loopIndex] = action;
            console.log(`✅ [Editor] Обновлено действие в цикле (index: ${loopIndex})`);
          } else {
            parentAction.actions.push(action);
            console.log(`✅ [Editor] Добавлено действие в цикл (всего: ${parentAction.actions.length})`);
          }
        } else {
          parentAction.actions.push(action);
          console.log(`✅ [Editor] Добавлено действие в цикл (всего: ${parentAction.actions.length})`);
        }
      }
      
      // НЕ сохраняем автоматически - пользователь сам сохранит через кнопку "Сохранить"
      
      // Сбрасываем контекст
      this.currentParentAction = null;
      this.currentBranch = null;
      this.renderActions();
      this.extractVariablesFromActions(this.test.actions);
      this.updateScenarioVariablesPanel();
      this.closeModal();
      this.showToast(this.t('editorUI.actionAdded'), 'success');
      return;
    }
    
    if (this.currentEditingAction === -1) {
      // Новое действие
      action.userEdited = true;
      action.userEditedAt = new Date().toISOString();
      
      // Проверяем, нужно ли вставить в определенную позицию
      if (this.insertAfterIndex !== null && this.insertAfterIndex !== undefined) {
        if (this.insertAfterIndex === -1) {
          // Вставить в начало
          this.test.actions.unshift(action);
        } else if (this.insertAfterIndex >= this.test.actions.length) {
          // Вставить в конец
          this.test.actions.push(action);
        } else {
          // Вставить после указанного индекса
          const insertIndex = this.insertAfterIndex + 1;
          this.test.actions.splice(insertIndex, 0, action);
        }
        // Сбрасываем позицию вставки
        this.insertAfterIndex = null;
      } else {
        // По умолчанию добавляем в конец
        this.test.actions.push(action);
      }
    } else {
      // Обновляем существующее действие
      const existingAction = this.test.actions[this.currentEditingAction];
      
      // Если редактируется оптимизированный шаг - снимаем признак оптимизации
      if (existingAction && existingAction.optimizationMeta) {
        console.log(`🔄 Пользователь редактирует оптимизированный шаг ${this.currentEditingAction + 1}, снимаю признак оптимизации`);
        // Удаляем метаданные оптимизации
        delete action.optimizationMeta;
        delete action.hiddenReason;
        delete action.hiddenAt;
        // Убираем скрытие, если было
        action.hidden = false;
      }
      
      // Отмечаем как отредактированное пользователем
      action.userEdited = true;
      action.userEditedAt = new Date().toISOString();
      
      // Сохраняем остальные свойства существующего действия, если они не были изменены
      if (existingAction) {
        // Сохраняем timestamp, если не был изменён
        if (!action.timestamp) {
          action.timestamp = existingAction.timestamp;
        }
        // Сохраняем url, если не был изменён
        if (!action.url && existingAction.url) {
          action.url = existingAction.url;
        }
      }
      
      this.test.actions[this.currentEditingAction] = action;
    }

    this.renderActions();
    this.extractVariablesFromActions(this.test.actions);
    this.updateScenarioVariablesPanel();
    this.closeModal();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Сохраняет условие
   */
  saveCondition() {
    const expression = document.getElementById('conditionExpression')?.value || '';
    const operator = document.getElementById('conditionOperator')?.value || 'exists';
    const value = document.getElementById('conditionValue')?.value || '';
    const gotoThenValue = document.getElementById('gotoThen')?.value;
    const gotoElseValue = document.getElementById('gotoElse')?.value;
    
    if (!expression) {
      alert(this.t('editorUI.specifyCondition'));
      return;
    }
    
    const action = {
      type: 'condition',
      condition: {
        expression: expression,
        operator: operator,
        value: value
      },
      thenActions: [],
      elseActions: [],
      gotoThen: gotoThenValue ? parseInt(gotoThenValue) : null,
      gotoElse: gotoElseValue ? parseInt(gotoElseValue) : null,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    if (this.currentEditingAction === -1 || this.currentEditingAction === null) {
      // Новое условие
      this.test.actions.push(action);
    } else {
      // Обновляем существующее условие
      const existingAction = this.test.actions[this.currentEditingAction];
      if (existingAction && existingAction.type === 'condition') {
        // Сохраняем существующие действия внутри условия
        action.thenActions = existingAction.thenActions || [];
        action.elseActions = existingAction.elseActions || [];
      }
      this.test.actions[this.currentEditingAction] = action;
    }
    
    this.renderActions();
    this.extractVariablesFromActions(this.test.actions);
    this.updateScenarioVariablesPanel();
    this.closeModal();
    this.showToast(this.t('editorUI.conditionSaved'), 'success');
  }

  /**
   * Сохраняет цикл
   */
  saveLoop() {
    const loopType = document.getElementById('loopType')?.value || 'for';
    const count = parseInt(document.getElementById('loopCount')?.value || '5');
    const condition = document.getElementById('loopCondition')?.value || '';
    const selector = document.getElementById('loopSelector')?.value || '';
    
    if (loopType === 'for' && (!count || count < 1)) {
      alert(this.t('editorUI.specifyIterationCount'));
      return;
    }
    
    if (loopType === 'while' && !condition) {
      alert(this.t('editorUI.specifyLoopCondition'));
      return;
    }
    
    if (loopType === 'forEach' && !selector) {
      alert(this.t('editorUI.specifyLoopSelector'));
      return;
    }
    
    const loopVariable = document.getElementById('loopVariable')?.value?.trim() || 'i';
    
    // Автоматически создаем переменную цикла в test.variables, если её еще нет
    if (!this.test.variables) {
      this.test.variables = {};
    }
    // Переменная цикла создается автоматически, но не сохраняется в переменных (она управляется циклом)
    // Просто убеждаемся, что переменная есть в структуре, но значение будет устанавливаться циклом
    
    const action = {
      type: 'loop',
      loop: {
        type: loopType,
        count: loopType === 'for' ? count : undefined,
        condition: loopType === 'while' ? condition : undefined,
        selector: loopType === 'forEach' ? selector : undefined,
        variable: loopVariable // Имя переменной цикла
      },
      actions: [],
      timestamp: Date.now(),
      url: window.location.href
    };
    
    if (this.currentEditingAction === -1 || this.currentEditingAction === null) {
      // Новый цикл
      this.test.actions.push(action);
    } else {
      // Обновляем существующий цикл
      const existingAction = this.test.actions[this.currentEditingAction];
      if (existingAction && existingAction.type === 'loop') {
        // Сохраняем существующие действия внутри цикла
        action.actions = existingAction.actions || [];
      }
      this.test.actions[this.currentEditingAction] = action;
    }
    
    this.renderActions();
    this.extractVariablesFromActions(this.test.actions);
    this.updateScenarioVariablesPanel();
    this.closeModal();
    this.showToast(this.t('editorUI.loopAdded'), 'success');
  }

  /**
   * Показывает модальное окно для добавления действия в ветку условия
   */
  showAddActionToBranchModal(parentIndex, branch) {
    this.currentParentAction = parentIndex;
    this.currentBranch = branch;
    this.currentEditingAction = -1;
    this.currentEditingActionType = 'action';
    this.showAddActionModal();
  }

  /**
   * Показывает модальное окно для добавления действия в цикл
   */
  showAddActionToLoopModal(parentIndex) {
    console.log(`🔧 [Editor] Открываю модальное окно для добавления действия в цикл (parentIndex: ${parentIndex}, type: ${typeof parentIndex})`);
    
    // Нормализуем индекс (может быть строкой)
    const normalizedIndex = typeof parentIndex === 'string' ? parseInt(parentIndex) : parentIndex;
    
    if (isNaN(normalizedIndex)) {
      console.error(`❌ [Editor] Некорректный parentIndex (не число): ${parentIndex}`);
      alert(this.t('editorUI.incorrectParentIndex'));
      return;
    }
    
    // Проверяем, что родительское действие существует and является циклом
    if (!this.test || !this.test.actions) {
      console.error(`❌ [Editor] Тест или действия не загружены`);
      alert(this.t('editorUI.testOrActionsNotLoaded'));
      return;
    }
    
    if (normalizedIndex < 0 || normalizedIndex >= this.test.actions.length) {
      console.error(`❌ [Editor] Некорректный parentIndex: ${normalizedIndex} (всего действий: ${this.test.actions.length})`);
      console.log(`   Доступные индексы: 0-${this.test.actions.length - 1}`);
      console.log(`   Действия:`, this.test.actions.map((a, i) => `${i}: ${a.type}`).join(', '));
      alert(this.t('editorUI.loopNotFound', { index: normalizedIndex }));
      return;
    }
    
    const parentAction = this.test.actions[normalizedIndex];
    console.log(`🔍 [Editor] Проверяю действие с индексом ${normalizedIndex}:`, {
      type: parentAction?.type,
      hasLoop: !!parentAction?.loop,
      action: parentAction
    });
    
    if (!parentAction) {
      console.error(`❌ [Editor] Действие с индексом ${normalizedIndex} не найдено`);
      alert(this.t('editorUI.actionNotFound'));
      return;
    }
    
    // Проверяем, что это действительно цикл (может быть type === 'loop' или есть свойство loop)
    const isLoop = parentAction.type === 'loop' || (parentAction.loop && typeof parentAction.loop === 'object');
    
    if (!isLoop) {
      console.error(`❌ [Editor] Действие с индексом ${normalizedIndex} не является циклом:`, {
        expected: 'loop',
        actual: parentAction.type,
        hasLoop: !!parentAction.loop,
        action: parentAction
      });
      alert(this.t('editorUI.notALoop', { type: parentAction.type }));
      return;
    }
    
    this.currentParentAction = normalizedIndex;
    this.currentBranch = 'loop';
    this.currentEditingAction = -1;
    this.currentEditingActionType = 'action';
    
    console.log(`✅ [Editor] Контекст установлен: currentParentAction=${this.currentParentAction}, currentBranch=${this.currentBranch}`);
    
    this.showAddActionModal();
  }

  buildSelector(type, value) {
    if (!value) return null;

    let selector = null;

    switch (type) {
      case 'id':
        // Убираем # из начала, если он уже есть
        const cleanValue = value.startsWith('#') ? value.substring(1) : value;
        selector = `#${this.escapeSelector(cleanValue)}`;
        break;
      case 'data-testid':
        selector = `[data-testid="${this.escapeSelector(value)}"]`;
        break;
      case 'data-cy':
        selector = `[data-cy="${this.escapeSelector(value)}"]`;
        break;
      case 'data-test':
        selector = `[data-test="${this.escapeSelector(value)}"]`;
        break;
      case 'name':
        selector = `[name="${this.escapeSelector(value)}"]`;
        break;
      case 'aria-label':
        selector = `[aria-label="${this.escapeSelector(value)}"]`;
        break;
      case 'class':
        selector = `.${this.escapeSelector(value)}`;
        break;
      case 'css':
        selector = value; // Используем как есть
        break;
    }

    return {
      type: type,
      value: value,
      selector: selector,
      priority: this.getSelectorPriority(type)
    };
  }

  getSelectorPriority(type) {
    const priorities = {
      'data-testid': 1,
      'data-cy': 2,
      'data-test': 3,
      'id': 4,
      'name': 5,
      'aria-label': 6,
      'class': 8,
      'css': 10
    };
    return priorities[type] || 10;
  }

  escapeSelector(str) {
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  closeModal() {
    const modal = document.getElementById('actionModal');
    const modalBody = document.getElementById('modalBody');
    
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
    
    // Сбрасываем контекст добавления действий внутрь циклов/условий
    this.currentParentAction = null;
    this.currentBranch = null;
    
    // Очищаем текущий subtype
    this.currentSubtype = null;
    
    // Удаляем обработчики при закрытии модального окна
    if (this.modalKeyDownHandler && modal) {
      modal.removeEventListener('keydown', this.modalKeyDownHandler, true);
      this.modalKeyDownHandler = null;
    }
    
    if (this.modalSubmitHandler && modalBody) {
      modalBody.removeEventListener('submit', this.modalSubmitHandler, true);
      this.modalSubmitHandler = null;
    }
    
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
    this.currentEditingAction = null;
    this.currentEditingActionType = null;
  }

  /**
   * Показывает toast-уведомление
   * @param {string} message - Текст сообщения
   * @param {string} type - Тип уведомления: 'success' или 'error'
   */
  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(err => {
        console.error('Ошибка при копировании в буфер обмена:', err);
        // Fallback для старых браузеров
        this.fallbackCopyToClipboard(text);
      });
    } else {
      // Fallback для старых браузеров
      return Promise.resolve(this.fallbackCopyToClipboard(text));
    }
  }

  fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Ошибка при копировании (fallback):', err);
      document.body.removeChild(textArea);
      return false;
    }
  }

  showToast(message, type = 'success') {
    // Создаем контейнер для toast, если его еще нет
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // Создаем элемент toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Выбираем иконку в зависимости от типа
    let icon = '✅';
    if (type === 'error') {
      icon = '❌';
    } else if (type === 'info') {
      icon = '▶️'; // Иконка play для информационных сообщений
    } else if (type === 'success') {
      icon = '✅';
    }
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    `;

    // Добавляем toast в контейнер
    container.appendChild(toast);

    // Автоматически удаляем через 3 секунды
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300); // Время анимации fade-out
    }, 3000);
  }

  /**
   * Запускает запись в текущий тест (шаги будут добавляться в этот тест).
   * После нажатия нужно перейти на вкладку с сайтом и выполнять действия.
   */
  async startRecordingIntoTest() {
    if (!this.test || !this.test.id) {
      this.showToast(this.t('editorUI.testNotSpecified') || 'Test not loaded', 'error');
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING_INTO_TEST',
        testId: this.test.id,
        insertAfterIndex: undefined
      });
      if (response && response.success) {
        this.showToast(this.t('editorUI.recordingStartedSwitchTab'), 'success');
      } else {
        this.showToast(response?.error || this.t('common.unknownError'), 'error');
      }
    } catch (e) {
      console.error('Start recording into test error:', e);
      this.showToast(e?.message || this.t('common.unknownError'), 'error');
    }
  }

  async saveTest() {
    this.test.name = document.getElementById('testName').value.trim() || this.test.name;
    this.test.updatedAt = new Date().toISOString();
    // Отмечаем, что тест был отредактирован пользователем
    this.test.lastEditedBy = 'user';

    try {
      // Проверяем, что extension готов
      if (!chrome.runtime || !chrome.runtime.id) {
        // Extension не загружен, пробуем позже
        if (!this.saveTestAttempts) {
          this.saveTestAttempts = 0;
        }
        this.saveTestAttempts++;
        
        if (this.saveTestAttempts < 5) {
          console.warn(`⚠️ Extension не загружен, повторяю попытку ${this.saveTestAttempts}/5 через 1 секунду...`);
          setTimeout(() => {
            this.saveTest();
          }, 1000);
        } else {
          console.error('❌ Extension не загружен после 5 попыток');
          this.showToast(this.t('editorUI.extensionNotReady'), 'error');
          this.saveTestAttempts = 0;
        }
        return;
      }

      // Сбрасываем счетчик при успешной проверке
      this.saveTestAttempts = 0;

      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_TEST',
        test: this.test
      });

      // Проверяем, что response не undefined
      if (!response) {
        throw new Error(this.t('editorUI.backgroundNoResponse'));
      }

      if (response.success) {
        console.log('✅ Тест сохранен');
        // Обновляем метаданные после сохранения
        this.renderMetadata();
        // Показываем уведомление об успехе
        this.showToast(this.t('editorUI.testSaved'), 'success');
      } else {
        const errorMsg = response?.error || this.t('common.unknownError');
        console.error('Ошибка при сохранении:', errorMsg);
        this.showToast(this.t('editorUI.saveError') + ': ' + errorMsg, 'error');
      }
    } catch (error) {
      // Обрабатываем ошибки соединения
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('Receiving end does not exist') || 
          errorMessage.includes('Extension context invalidated') ||
          errorMessage.includes('Could not establish connection')) {
        // Background script еще не готов или extension перезагружен, пробуем позже (максимум 5 попыток)
        if (!this.saveTestAttempts) {
          this.saveTestAttempts = 0;
        }
        this.saveTestAttempts++;
        
        if (this.saveTestAttempts < 5) {
          // Не показываем предупреждение в консоль при первых попытках (это нормально)
          if (this.saveTestAttempts > 2) {
            console.warn(`⚠️ Background script не готов, повторяю попытку ${this.saveTestAttempts}/5 через 1 секунду...`);
          }
          setTimeout(() => {
            this.saveTest();
          }, 1000);
        } else {
          console.error('❌ Background script не готов после 5 попыток');
          this.showToast(this.t('editorUI.extensionNotReady'), 'error');
          this.saveTestAttempts = 0; // Сбрасываем счетчик
        }
      } else {
        console.error('Error saving test:', error);
        const errorMsg = errorMessage || this.t('common.unknownError');
        this.showToast(this.t('editorUI.saveError') + ': ' + errorMsg, 'error');
        this.saveTestAttempts = 0; // Сбрасываем счетчик при другой ошибке
      }
    }
  }

  async playTest(mode = null, options = {}) {
    try {
      if (!this.test) {
        alert(this.t('editorUI.testNotLoaded'));
        return;
      }
      
      // Проверяем наличие обязательных переменных перед запуском
      const missingVars = this.checkRequiredVariables(mode);
      if (missingVars.length > 0) {
        const shouldContinue = await this.showMissingVariablesDialog(missingVars);
        if (!shouldContinue) {
          return;
        }
      }
      
      // Если режим не указан, используем оптимизированный если доступен, иначе полный
      if (mode === null) {
        mode = this.hasOptimizationAvailable() ? 'optimized' : 'full';
      }
      
      const debugMode = mode === 'debug';
      const actualMode = debugMode ? 'optimized' : mode;
      
      // Проверяем, есть ли в тесте действия, требующие визуального интерфейса
      const visualActionTypes = ['click', 'dblclick', 'input', 'change', 'scroll', 'navigation', 'keyboard'];
      const actionsToCheck = (this.test.actions || []).filter(action => {
        return actualMode === 'full' ? true : !action.hidden;
      });
      
      const hasVisualActions = actionsToCheck.some(action => {
        if (visualActionTypes.includes(action.type)) {
          return true;
        }
        const checkNestedActions = (nestedActions) => {
          if (!Array.isArray(nestedActions)) return false;
          const filteredNested = actualMode === 'full' 
            ? nestedActions 
            : nestedActions.filter(a => !a.hidden);
          return filteredNested.some(subAction => visualActionTypes.includes(subAction.type));
        };
        if (action.actions && checkNestedActions(action.actions)) return true;
        if (action.thenActions && checkNestedActions(action.thenActions)) return true;
        if (action.elseActions && checkNestedActions(action.elseActions)) return true;
        return false;
      });
      
      // Проверяем, запускается ли тест из редактора (extension страницы)
      const isEditorPage = window.location.href.startsWith('chrome-extension://') || 
                          window.location.href.startsWith('chrome://') ||
                          window.location.href.startsWith('edge://');
      
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          type: 'PLAY_TEST',
          testId: this.test.id,
          mode: actualMode,
          debugMode: debugMode,
        });
      } catch (sendError) {
        console.error('❌ [Editor] Ошибка при отправке сообщения в background script:', sendError);
        const errorMessage = sendError?.message || String(sendError);
        if (errorMessage.includes('Extension context invalidated') || 
            errorMessage.includes('Could not establish connection')) {
          alert(this.t('editorUI.extensionReloaded'));
        } else {
          alert(this.t('editorUI.requestError', { error: errorMessage }));
        }
        return;
      }

      // Проверяем, что response не undefined
      if (!response) {
        console.error('❌ [Editor] Background script не вернул ответ на запрос PLAY_TEST');
        console.error('   Возможно, background script еще не готов или extension перезагружен');
        alert(this.t('editorUI.extensionNotResponded'));
        return;
      }

      if (response.success) {
        const modeLabel = mode === 'full' ? this.t('editorUI.fullRun') : this.t('editorUI.optimizedRun');
        
        // Если тест без визуальных действий and запускается из редактора, показываем другое сообщение
        if (!hasVisualActions && isEditorPage) {
          alert(this.t('editorUI.runStartedEditor', { mode: modeLabel }));
        } else {
          alert(this.t('editorUI.runStarted', { mode: modeLabel }));
        }
      } else {
        alert(this.t('editorUI.playbackError') + ': ' + (response.error || this.t('common.unknownError')));
      }
    } catch (error) {
      console.error('Error playing test:', error);
      alert(this.t('editorUI.playbackError2'));
    }
  }

  /**
   * Проверяет наличие обязательных переменных в тесте
   * @param {string} mode - Режим запуска ('full' или 'optimized')
   * @returns {Array<string>} Список отсутствующих переменных
   */
  checkRequiredVariables(mode = 'optimized') {
    if (!this.test || !this.test.actions) {
      return [];
    }

    const usedVars = new Set();
    const variables = this.test.variables || {};
    
    // Собираем все переменные циклов, которые создаются автоматически
    const loopVariables = new Set();
    const collectLoopVariables = (action) => {
      if (action.type === 'loop' && action.loop && action.loop.variable) {
        loopVariables.add(action.loop.variable);
      }
      if (action.actions && Array.isArray(action.actions)) {
        action.actions.forEach(collectLoopVariables);
      }
      if (action.thenActions && Array.isArray(action.thenActions)) {
        action.thenActions.forEach(collectLoopVariables);
      }
      if (action.elseActions && Array.isArray(action.elseActions)) {
        action.elseActions.forEach(collectLoopVariables);
      }
    };
    this.test.actions.forEach(collectLoopVariables);

    // Собираем все используемые переменные из видимых шагов
    const checkAction = (action) => {
      if (!action || action.hidden) {
        return;
      }

      // Проверяем переменные в разных местах действия
      const checkString = (str) => {
        if (typeof str !== 'string') return;
        const matches = str.matchAll(/\{var:([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
        for (const match of matches) {
          usedVars.add(match[1]);
        }
      };

      // API запросы
      if (action.type === 'api' && action.api) {
        checkString(action.api.url);
        if (action.api.headers) {
          if (typeof action.api.headers === 'string') {
            checkString(action.api.headers);
          } else {
            Object.values(action.api.headers).forEach(checkString);
          }
        }
        if (action.api.body) {
          if (typeof action.api.body === 'string') {
            checkString(action.api.body);
          } else {
            const checkObject = (obj) => {
              if (typeof obj === 'string') {
                checkString(obj);
              } else if (Array.isArray(obj)) {
                obj.forEach(checkObject);
              } else if (obj && typeof obj === 'object') {
                Object.values(obj).forEach(checkObject);
              }
            };
            checkObject(action.api.body);
          }
        }
      }

      // Переменные действия
      if (action.type === 'variable' && action.variable) {
        checkString(action.variable.value);
        checkString(action.variable.expression);
      }

      // Обычные действия
      if (action.value) {
        checkString(action.value);
      }

      // Рекурсивно проверяем вложенные действия (циклы, условия)
      if (action.actions && Array.isArray(action.actions)) {
        action.actions.forEach(checkAction);
      }
      if (action.thenActions && Array.isArray(action.thenActions)) {
        action.thenActions.forEach(checkAction);
      }
      if (action.elseActions && Array.isArray(action.elseActions)) {
        action.elseActions.forEach(checkAction);
      }
    };

    // Проверяем только видимые действия в зависимости от режима
    this.test.actions.forEach(action => {
      if (mode === 'full' || !action.hidden) {
        checkAction(action);
      }
    });

    // Находим отсутствующие переменные
    // Исключаем переменные циклов, так как они создаются автоматически
    const missingVars = [];
    usedVars.forEach(varName => {
      // Пропускаем переменные циклов - они создаются автоматически
      if (loopVariables.has(varName)) {
        return;
      }
      
      if (!variables[varName] || !variables[varName].value) {
        missingVars.push(varName);
      }
    });

    return missingVars;
  }

  initDragAndDrop() {
    const actionsList = document.getElementById('actionsList');
    
    // Обработка drop на сам список (для перемещения в конец)
    actionsList.addEventListener('dragover', (e) => {
      // Разрешаем drop если перетаскиваем действие из цикла/условия или основное действие
      if (this.draggedElement && (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else' || this.draggedElement.type === 'main')) {
        // Проверяем, что курсор находится в конце списка (после последнего элемента)
        const allItems = actionsList.querySelectorAll('.action-item[data-index]:not([data-index^="loop-"]):not([data-index^="then-"]):not([data-index^="else-"])');
        const actionsListRect = actionsList.getBoundingClientRect();
        
        if (allItems.length > 0) {
          const lastItem = allItems[allItems.length - 1];
          const lastItemRect = lastItem.getBoundingClientRect();
          // Если курсор ниже последнего элемента или в нижней части списка (последние 100px), разрешаем drop
          const isInBottomArea = e.clientY > lastItemRect.bottom || 
                                 (e.clientY > actionsListRect.bottom - 100 && e.clientY <= actionsListRect.bottom);
          if (isInBottomArea) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            actionsList.classList.add('drop-zone-active');
            return;
          }
        } else {
          // Если нет элементов, разрешаем drop в начало
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          actionsList.classList.add('drop-zone-active');
          return;
        }
      }
      actionsList.classList.remove('drop-zone-active');
    });
    
    actionsList.addEventListener('dragleave', (e) => {
      // Убираем подсветку только если курсор действительно покинул список
      if (!actionsList.contains(e.relatedTarget)) {
        actionsList.classList.remove('drop-zone-active');
      }
    });
    
    actionsList.addEventListener('drop', (e) => {
      e.preventDefault();
      actionsList.classList.remove('drop-zone-active');
      
      if (!this.draggedElement) return;
      
      // Обрабатываем действия из циклов/условий
      if (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else') {
        const sourceParent = this.test.actions[this.draggedElement.parentIndex];
        if (sourceParent) {
          let sourceArray = null;
          if (this.draggedElement.type === 'loop' && sourceParent.type === 'loop') {
            sourceArray = sourceParent.actions || [];
          } else if (this.draggedElement.type === 'then' && sourceParent.type === 'condition') {
            sourceArray = sourceParent.thenActions || [];
          } else if (this.draggedElement.type === 'else' && sourceParent.type === 'condition') {
            sourceArray = sourceParent.elseActions || [];
          }
          
          if (sourceArray && sourceArray[this.draggedElement.branchIndex]) {
            const actionToMove = sourceArray[this.draggedElement.branchIndex];
            
            // Определяем позицию вставки - всегда в конец списка
            const insertIndex = this.test.actions.length;
            
            // Удаляем из источника
            sourceArray.splice(this.draggedElement.branchIndex, 1);
            // Добавляем в конец основного списка
            this.test.actions.splice(insertIndex, 0, actionToMove);
            this.renderActions();
          }
        }
      } else if (this.draggedElement.type === 'main') {
        // Перемещение основного действия в конец списка
        const actionToMove = this.test.actions[this.draggedElement.index];
        if (actionToMove) {
          this.test.actions.splice(this.draggedElement.index, 1);
          this.test.actions.push(actionToMove);
          this.renderActions();
        }
      }
    });
    
    // Обработка drag-drop для основных действий
    const items = actionsList.querySelectorAll('.action-item[data-index]:not([data-index^="loop-"]):not([data-index^="then-"]):not([data-index^="else-"])');
    
    items.forEach(item => {
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        // Не начинаем drag, если клик был по номеру или кнопке
        if (e.target.closest('.clickable-number') || e.target.closest('button')) {
          e.preventDefault();
          return;
        }
        const indexStr = item.dataset.index;
        // Сохраняем информацию о том, откуда перетаскиваем
        if (indexStr && !isNaN(parseInt(indexStr))) {
          this.draggedElement = {
            type: 'main',
            index: parseInt(indexStr)
          };
        } else {
          // Это действие из цикла или условия
          const match = indexStr.match(/(loop|then|else)-(\d+)-(\d+)/);
          if (match) {
            this.draggedElement = {
              type: match[1],
              parentIndex: parseInt(match[2]),
              branchIndex: parseInt(match[3])
            };
          }
        }
        item.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', (e) => {
        item.style.opacity = '1';
        this.draggedElement = null;
        // Убираем подсветку зон сброса
        document.querySelectorAll('.drop-zone-active').forEach(zone => {
          zone.classList.remove('drop-zone-active');
        });
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        // Разрешаем drop для действий из циклов/условий
        if (this.draggedElement && (this.draggedElement.type === 'main' || this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else')) {
          e.dataTransfer.dropEffect = 'move';
        } else {
          e.dataTransfer.dropEffect = 'none';
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Останавливаем всплытие, чтобы не обрабатывать в родительских элементах
        if (!this.draggedElement) return;
        
        if (this.draggedElement.type === 'main') {
          // Перемещение между основными действиями
          const targetIndex = parseInt(item.dataset.index);
          if (!isNaN(targetIndex)) {
            const sourceIndex = this.draggedElement.index;
            const targetAction = this.test.actions[targetIndex];
            
            // Если перемещаем на самого себя, ничего не делаем
            if (sourceIndex === targetIndex) {
              return;
            }
            
            // Определяем позицию вставки на основе позиции курсора
            const itemRect = item.getBoundingClientRect();
            const cursorY = e.clientY;
            const itemCenterY = itemRect.top + itemRect.height / 2;
            
            // Если целевой элемент - цикл или условие, and курсор в верхней части элемента,
            // проверяем, нужно ли передать обработку зоне после цикла/условия
            if (targetAction && (targetAction.type === 'loop' || targetAction.type === 'condition')) {
              // Если курсор в нижней части элемента, передаем обработку зоне после цикла/условия
              if (cursorY > itemCenterY) {
                const afterZone = item.parentElement?.querySelector(`[data-drop-zone="after-${targetAction.type === 'loop' ? 'loop' : 'condition'}"][data-after-parent-index="${targetIndex}"]`);
                if (afterZone) {
                  // Передаем обработку зоне после цикла/условия
                  return;
                }
              }
              // Если курсор в верхней части цикла/условия, обрабатываем drop здесь (вставляем перед ним)
            }
            
            let insertIndex = targetIndex;
            
            // Если целевой элемент - первый (шаг 1) and курсор в верхней части элемента,
            // всегда вставляем на первое место (индекс 0)
            if (targetIndex === 0 && cursorY <= itemCenterY) {
              insertIndex = 0;
            } else if (cursorY > itemCenterY) {
              // Если курсор ниже центра элемента, вставляем после него
              insertIndex = targetIndex + 1;
            }
            // Если курсор выше центра элемента (и это не первый элемент), вставляем перед ним (insertIndex уже = targetIndex)
            
            // Если удаляем элемент до позиции вставки, нужно скорректировать индекс
            if (sourceIndex < insertIndex) {
              insertIndex--; // Сдвигаем индекс, так как элемент будет удален раньше
            }
            
            // Убеждаемся, что insertIndex не отрицательный
            if (insertIndex < 0) {
              insertIndex = 0;
            }
            
            // Перемещаем элемент
            const actionToMove = this.test.actions.splice(sourceIndex, 1)[0];
            this.test.actions.splice(insertIndex, 0, actionToMove);
            this.renderActions();
            this.showToast(this.t('editorUI.actionMoved'), 'success');
          }
        } else if (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else') {
          // Перемещение из цикла/условия в основной список
          const targetIndex = parseInt(item.dataset.index);
          if (!isNaN(targetIndex)) {
            const sourceParent = this.test.actions[this.draggedElement.parentIndex];
            if (sourceParent) {
              let sourceArray = null;
              if (this.draggedElement.type === 'loop' && sourceParent.type === 'loop') {
                sourceArray = sourceParent.actions || [];
              } else if (this.draggedElement.type === 'then' && sourceParent.type === 'condition') {
                sourceArray = sourceParent.thenActions || [];
              } else if (this.draggedElement.type === 'else' && sourceParent.type === 'condition') {
                sourceArray = sourceParent.elseActions || [];
              }
              
              if (sourceArray && sourceArray[this.draggedElement.branchIndex]) {
                const actionToMove = sourceArray[this.draggedElement.branchIndex];
                
                // Определяем позицию вставки на основе позиции курсора
                const itemRect = item.getBoundingClientRect();
                const cursorY = e.clientY;
                const itemCenterY = itemRect.top + itemRect.height / 2;
                
                let insertIndex = targetIndex;
                // Если курсор ниже центра элемента, вставляем после него
                if (cursorY > itemCenterY) {
                  insertIndex = targetIndex + 1;
                }
                
                // Удаляем из источника
                sourceArray.splice(this.draggedElement.branchIndex, 1);
                // Добавляем в основной список после целевого элемента
                this.test.actions.splice(insertIndex, 0, actionToMove);
                this.renderActions();
                this.showToast(this.t('editorUI.actionMovedFromLoop'), 'success');
              }
            }
          }
        }
      });
    });
    
    // Обработка drag-drop для действий внутри циклов and условий
    const innerItems = actionsList.querySelectorAll('.action-item[data-index^="loop-"], .action-item[data-index^="then-"], .action-item[data-index^="else-"]');
    
    innerItems.forEach(item => {
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        // КРИТИЧНО: Останавливаем всплытие, чтобы родительский цикл не перехватил событие
        e.stopPropagation();
        
        // Не начинаем drag, если клик был по номеру или кнопке
        if (e.target.closest('.clickable-number') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) {
          e.preventDefault();
          return;
        }
        const indexStr = item.dataset.index;
        const match = indexStr.match(/(loop|then|else)-(\d+)-(\d+)/);
        if (match) {
          this.draggedElement = {
            type: match[1],
            parentIndex: parseInt(match[2]),
            branchIndex: parseInt(match[3])
          };
          console.log('🎯 [DragDrop] Начало перетаскивания из', this.draggedElement);
        }
        item.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', indexStr); // Добавляем данные для совместимости
      });

      item.addEventListener('dragend', (e) => {
        e.stopPropagation();
        item.style.opacity = '1';
        this.draggedElement = null;
        document.querySelectorAll('.drop-zone-active').forEach(zone => {
          zone.classList.remove('drop-zone-active');
        });
        console.log('🎯 [DragDrop] Конец перетаскивания');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Разрешаем drop для действий внутри циклов/условий and для основных действий
        if (this.draggedElement && (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else' || this.draggedElement.type === 'main')) {
          e.dataTransfer.dropEffect = 'move';
        } else {
          e.dataTransfer.dropEffect = 'none';
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.draggedElement) return;
        
        const indexStr = item.dataset.index;
        const match = indexStr.match(/(loop|then|else)-(\d+)-(\d+)/);
        if (!match) return;
        
        const targetParentIndex = parseInt(match[2]);
        const targetBranchIndex = parseInt(match[3]);
        const targetBranchType = match[1];
        
        // Получаем родительский элемент and массив действий
        const parentAction = this.test.actions[targetParentIndex];
        if (!parentAction) return;
        
        let targetArray = null;
        if (targetBranchType === 'loop' && parentAction.type === 'loop') {
          targetArray = parentAction.actions || [];
        } else if (targetBranchType === 'then' && parentAction.type === 'condition') {
          targetArray = parentAction.thenActions || [];
        } else if (targetBranchType === 'else' && parentAction.type === 'condition') {
          targetArray = parentAction.elseActions || [];
        }
        
        if (!targetArray) return;
        
        // Определяем позицию вставки на основе позиции курсора
        const itemRect = item.getBoundingClientRect();
        const cursorY = e.clientY;
        const itemCenterY = itemRect.top + itemRect.height / 2;
        
        let insertIndex = targetBranchIndex;
        
        // Если целевой элемент - первый (индекс 0) and курсор в верхней части элемента,
        // всегда вставляем на первое место (индекс 0)
        if (targetBranchIndex === 0 && cursorY <= itemCenterY) {
          insertIndex = 0;
        } else if (cursorY > itemCenterY) {
          // Если курсор ниже центра элемента, вставляем после него
          insertIndex = targetBranchIndex + 1;
        }
        // Если курсор выше центра элемента (и это не первый элемент), вставляем перед ним (insertIndex уже = targetBranchIndex)
        
        // Обрабатываем перемещение внутри циклов/условий
        if (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else') {
          // Проверяем, что перетаскиваем в том же родителе
          if (this.draggedElement.parentIndex !== targetParentIndex) return;
          if (this.draggedElement.type !== targetBranchType) return;
          
          const sourceBranchIndex = this.draggedElement.branchIndex;
          
          // Если перемещаем на самого себя, ничего не делаем
          if (sourceBranchIndex === targetBranchIndex) {
            return;
          }
          
          // Если удаляем элемент до позиции вставки, нужно скорректировать индекс
          if (sourceBranchIndex < insertIndex) {
            insertIndex--; // Сдвигаем индекс, так как элемент будет удален раньше
          }
          
          // Убеждаемся, что insertIndex не отрицательный
          if (insertIndex < 0) {
            insertIndex = 0;
          }
          
          // Перемещаем элемент
          const actionToMove = targetArray.splice(sourceBranchIndex, 1)[0];
          targetArray.splice(insertIndex, 0, actionToMove);
          this.renderActions();
          this.showToast(this.t('editorUI.actionMoved'), 'success');
        } 
        // Обрабатываем добавление основного действия в цикл/условие
        else if (this.draggedElement.type === 'main') {
          const sourceIndex = this.draggedElement.index;
          const actionToMove = this.test.actions[sourceIndex];
          
          if (!actionToMove) return;
          
          // Убеждаемся, что insertIndex не отрицательный
          if (insertIndex < 0) {
            insertIndex = 0;
          }
          
          // Удаляем из основного списка
          this.test.actions.splice(sourceIndex, 1);
          // Добавляем в массив действий цикла/условия
          targetArray.splice(insertIndex, 0, actionToMove);
          this.renderActions();
          this.showToast(this.t('editorUI.actionAddedToLoop'), 'success');
        }
      });
    });
    
    // Обработка drop-зон (циклы and условия)
    const dropZones = actionsList.querySelectorAll('[data-drop-zone]');
    
    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        const dropZoneType = zone.getAttribute('data-drop-zone');
        // Для зоны после цикла разрешаем drop для всех действий
        if (dropZoneType === 'after-loop' || dropZoneType === 'after-condition') {
          if (this.draggedElement) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drop-zone-active');
            return;
          }
        } else {
          // Для обычных зон (внутри цикла/условия)
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          zone.classList.add('drop-zone-active');
        }
      });
      
      zone.addEventListener('dragleave', (e) => {
        zone.classList.remove('drop-zone-active');
      });
      
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drop-zone-active');
        
        if (!this.draggedElement) {
          console.log('🎯 [DragDrop] drop: нет draggedElement');
          return;
        }
        
        const dropZoneType = zone.getAttribute('data-drop-zone');
        console.log(`🎯 [DragDrop] drop на ${dropZoneType}, элемент:`, this.draggedElement);
        
        // Обработка drop в зону после цикла/условия
        if (dropZoneType === 'after-loop' || dropZoneType === 'after-condition') {
          const afterParentIndex = parseInt(zone.getAttribute('data-after-parent-index'));
          console.log(`🎯 [DragDrop] afterParentIndex=${afterParentIndex}, draggedElement:`, JSON.stringify(this.draggedElement));
          
          if (!isNaN(afterParentIndex) && this.draggedElement) {
            // Обработка для обычных действий (main)
            if (this.draggedElement.type === 'main') {
              const actionToMove = this.test.actions[this.draggedElement.index];
              if (actionToMove) {
                console.log(`🎯 [DragDrop] Перемещаем обычное действие "${actionToMove.type}" из позиции ${this.draggedElement.index} в позицию ${afterParentIndex + 1}`);
                // Удаляем из текущей позиции
                this.test.actions.splice(this.draggedElement.index, 1);
                // Вычисляем новую позицию (после удаления индекс мог измениться)
                const newAfterParentIndex = afterParentIndex > this.draggedElement.index ? afterParentIndex - 1 : afterParentIndex;
                // Вставляем после родительского элемента
                const insertIndex = newAfterParentIndex + 1;
                this.test.actions.splice(insertIndex, 0, actionToMove);
                this.renderActions();
                this.showToast(this.t('editorUI.actionMoved'), 'success');
                return;
              }
            }
            // Обработка для вложенных действий (loop, then, else)
            else if (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else') {
              const sourceParent = this.test.actions[this.draggedElement.parentIndex];
              console.log(`🎯 [DragDrop] sourceParent:`, sourceParent ? sourceParent.type : 'null');
              
              if (sourceParent) {
                let sourceArray = null;
                if (this.draggedElement.type === 'loop' && sourceParent.type === 'loop') {
                  sourceArray = sourceParent.actions || [];
                  console.log(`🎯 [DragDrop] sourceArray (loop.actions):`, sourceArray.length, 'элементов');
                } else if (this.draggedElement.type === 'then' && sourceParent.type === 'condition') {
                  sourceArray = sourceParent.thenActions || [];
                } else if (this.draggedElement.type === 'else' && sourceParent.type === 'condition') {
                  sourceArray = sourceParent.elseActions || [];
                }
                
                console.log(`🎯 [DragDrop] sourceArray:`, sourceArray ? sourceArray.length : 'null', 'branchIndex:', this.draggedElement.branchIndex);
                
                if (sourceArray && sourceArray[this.draggedElement.branchIndex]) {
                  const actionToMove = sourceArray[this.draggedElement.branchIndex];
                  console.log(`🎯 [DragDrop] Перемещаем действие "${actionToMove.type}" из позиции ${this.draggedElement.branchIndex} в позицию ${afterParentIndex + 1}`);
                  // Удаляем из источника
                  sourceArray.splice(this.draggedElement.branchIndex, 1);
                  // Вставляем после родительского элемента
                  const insertIndex = afterParentIndex + 1;
                  this.test.actions.splice(insertIndex, 0, actionToMove);
                  this.renderActions();
                  this.showToast(this.t('editorUI.actionMovedFromLoop2'), 'success');
                  return;
                } else {
                  console.log(`🎯 [DragDrop] ❌ sourceArray[${this.draggedElement.branchIndex}] не существует!`);
                }
              } else {
                console.log(`🎯 [DragDrop] ❌ sourceParent не найден для parentIndex=${this.draggedElement.parentIndex}`);
              }
            }
          } else {
            console.log(`🎯 [DragDrop] ❌ Условие не выполнено: afterParentIndex=${afterParentIndex}, type=${this.draggedElement?.type}`);
          }
          return;
        }
        
        const parentIndex = parseInt(zone.getAttribute('data-parent-index') || zone.closest('[data-parent-index]')?.getAttribute('data-parent-index'));
        
        if (isNaN(parentIndex)) return;
        
        const parentAction = this.test.actions[parentIndex];
        if (!parentAction) return;
        
        // Определяем, куда добавлять действие
        let targetArray = null;
        if (dropZoneType === 'loop' || dropZoneType === 'loop-empty') {
          if (parentAction.type === 'loop') {
            targetArray = parentAction.actions || [];
            parentAction.actions = targetArray;
          }
        } else if (dropZoneType === 'condition-then' || dropZoneType === 'condition-then-empty') {
          if (parentAction.type === 'condition') {
            targetArray = parentAction.thenActions || [];
            parentAction.thenActions = targetArray;
          }
        } else if (dropZoneType === 'condition-else' || dropZoneType === 'condition-else-empty') {
          if (parentAction.type === 'condition') {
            targetArray = parentAction.elseActions || [];
            parentAction.elseActions = targetArray;
          }
        }
        
        if (!targetArray) return;
        
        // Получаем действие для перемещения
        let actionToMove = null;
        if (this.draggedElement.type === 'main') {
          // Перемещаем из основного списка
          actionToMove = this.test.actions[this.draggedElement.index];
          
          // Проверяем, что не перетаскиваем цикл или условие внутрь другого цикла/условия
          if (actionToMove && (actionToMove.type === 'loop' || actionToMove.type === 'condition')) {
            this.showToast(this.t('editorUI.nestedLoopNotAllowed'), 'warning');
            return;
          }
          
          if (actionToMove) {
            // Удаляем из основного списка
            this.test.actions.splice(this.draggedElement.index, 1);
            // Добавляем в цикл/условие
            targetArray.push(actionToMove);
          }
        } else if (this.draggedElement.type === 'loop' || this.draggedElement.type === 'then' || this.draggedElement.type === 'else') {
          // Перемещаем из другого цикла/условия
          const sourceParent = this.test.actions[this.draggedElement.parentIndex];
          if (sourceParent) {
            let sourceArray = null;
            if (this.draggedElement.type === 'loop' && sourceParent.type === 'loop') {
              sourceArray = sourceParent.actions || [];
            } else if (this.draggedElement.type === 'then' && sourceParent.type === 'condition') {
              sourceArray = sourceParent.thenActions || [];
            } else if (this.draggedElement.type === 'else' && sourceParent.type === 'condition') {
              sourceArray = sourceParent.elseActions || [];
            }
            
            if (sourceArray && sourceArray[this.draggedElement.branchIndex]) {
              actionToMove = sourceArray[this.draggedElement.branchIndex];
              // Удаляем из источника
              sourceArray.splice(this.draggedElement.branchIndex, 1);
              // Добавляем в цель
              targetArray.push(actionToMove);
            }
          }
        }
        
        if (actionToMove) {
          this.renderActions();
        }
      });
    });
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.action-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  moveAction(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    // splice правильно обрабатывает сдвиг индексов:
    // - Если fromIndex < toIndex: после первого splice, toIndex автоматически уменьшится на 1
    // - Если fromIndex > toIndex: toIndex не изменится
    // Поэтому просто используем toIndex как есть
    const action = this.test.actions.splice(fromIndex, 1)[0];
    this.test.actions.splice(toIndex, 0, action);
    
    // Состояние allCollapsed сохраняется, так как оно применяется ко всем шагам
    
    this.renderActions();
    // НЕ сохраняем автоматически - пользователь сам сохранит
  }

  /**
   * Редактирование номера шага двойным кликом
   */
  editStepNumber(actionIndex, numberElement) {
    if (!this.test || !this.test.actions || actionIndex < 0 || actionIndex >= this.test.actions.length) {
      return;
    }

    const action = this.test.actions[actionIndex];
    if (action.hidden) {
      alert(this.t('editorUI.cannotChangeHiddenStep'));
      return;
    }

    // Получаем текущий номер шага
    const currentStepNumber = this.getVisibleStepNumber(actionIndex);
    
    // Подсчитываем максимальное количество видимых шагов
    const maxVisibleSteps = this.test.actions.filter(a => !a.hidden).length;
    
    // Создаем input для ввода нового номера
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = maxVisibleSteps.toString();
    input.value = currentStepNumber.toString();
    input.style.cssText = `
      width: 60px;
      padding: 4px 8px;
      border: 2px solid #4CAF50;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      background: white;
      outline: none;
    `;
    
    // Сохраняем оригинальный контент
    const originalContent = numberElement.innerHTML;
    const originalDisplay = numberElement.style.display;
    
    // Заменяем содержимое на input
    numberElement.innerHTML = '';
    numberElement.appendChild(input);
    numberElement.style.display = 'inline-block';
    
    // Фокусируемся and выделяем текст
    input.focus();
    input.select();
    
    // Обработчик завершения редактирования
    const finishEdit = (save = false) => {
      if (!save) {
        // Отменяем редактирование
        numberElement.innerHTML = originalContent;
        numberElement.style.display = originalDisplay;
        return;
      }
      
      // Получаем новое значение
      let newStepNumber = parseInt(input.value);
      
      // Валидация
      if (isNaN(newStepNumber) || newStepNumber < 1) {
        alert(this.t('editorUI.stepNumberPositive'));
        numberElement.innerHTML = originalContent;
        numberElement.style.display = originalDisplay;
        return;
      }
      
      if (newStepNumber > maxVisibleSteps) {
        alert(this.t('editorUI.maxStepNumber', { max: maxVisibleSteps }));
        numberElement.innerHTML = originalContent;
        numberElement.style.display = originalDisplay;
        return;
      }
      
      if (newStepNumber === currentStepNumber) {
        // Номер не изменился
        numberElement.innerHTML = originalContent;
        numberElement.style.display = originalDisplay;
        return;
      }
      
      // Находим индекс действия, которое должно быть на позиции newStepNumber
      // newStepNumber - это номер видимого шага (1-based), куда мы хотим переместить элемент
      // 
      // Логика: мы хотим, чтобы наш элемент был на позиции newStepNumber
      // Это означает, что нужно вставить элемент ПЕРЕД элементом, который СЕЙЧАС находится на позиции newStepNumber
      // После вставки наш элемент будет на позиции newStepNumber, а элемент, который был там, сдвинется на newStepNumber + 1
      
      let targetVisibleCount = 0;
      let targetIndex = -1;
      
      // Ищем элемент, который СЕЙЧАС находится на позиции newStepNumber (среди видимых)
      for (let i = 0; i < this.test.actions.length; i++) {
        if (!this.test.actions[i].hidden) {
          targetVisibleCount++;
          if (targetVisibleCount === newStepNumber) {
            targetIndex = i;
            break;
          }
        }
      }
      
      // Если не нашли (например, newStepNumber больше чем есть шагов), оставляем прежнее значение
      if (targetIndex === -1) {
        alert(this.t('editorUI.stepNotFound', { number: newStepNumber }));
        numberElement.innerHTML = originalContent;
        numberElement.style.display = originalDisplay;
        return;
      }
      
      // Убеждаемся, что действие не скрыто перед перемещением
      // (хотя мы уже проверили это в начале функции, но на всякий случай)
      if (action.hidden) {
        action.hidden = false;
      }
      
      // Перемещаем действие
      // moveAction использует splice, который правильно обрабатывает сдвиг индексов:
      // - Если actionIndex < targetIndex: после удаления из actionIndex, targetIndex уменьшится на 1,
      //   and splice(targetIndex, 0, element) вставит элемент в правильное место
      // - Если actionIndex > targetIndex: после удаления из actionIndex, targetIndex не изменится,
      //   and splice(targetIndex, 0, element) вставит элемент в правильное место
      this.moveAction(actionIndex, targetIndex);
      
      // renderActions уже вызван в moveAction and обновил DOM синхронно
      // Структура обновлена без задержек
      // Действие остается видимым (hidden = false), так как moveAction не изменяет это свойство
    };
    
    // Флаг для отслеживания, нужно ли сохранять при blur
    let shouldSaveOnBlur = true;
    
    // Обработчик клика на документе для определения, куда кликнули
    const documentClickHandler = (e) => {
      const target = e.target;
      // Если клик по другому полю с номером шага (clickable-number) или по input, не сохраняем
      if (target.classList.contains('clickable-number') || 
          (target.tagName === 'INPUT' && target !== input) ||
          target.closest('.clickable-number')) {
        shouldSaveOnBlur = false;
      } else if (target === input || target.closest('input') === input) {
        // Клик по самому input или его стрелкам - не сохраняем and не скрываем шаг
        shouldSaveOnBlur = false;
        e.stopPropagation(); // Предотвращаем всплытие события
      } else {
        // Клик по другому месту (включая пустое поле) - сохраняем
        shouldSaveOnBlur = true;
      }
    };
    
    // Добавляем обработчик клика на документ
    document.addEventListener('mousedown', documentClickHandler, true);
    
    // Обработчик изменения значения через стрелки или прямой ввод
    // НЕ применяем изменения сразу, только обновляем значение в input
    input.addEventListener('input', (e) => {
      // Просто обновляем значение в input, но не применяем изменения
      // Валидация минимального and максимального значения
      let value = parseInt(e.target.value);
      if (!isNaN(value)) {
        if (value < 1) {
          e.target.value = '1';
        } else if (value > maxVisibleSteps) {
          e.target.value = maxVisibleSteps.toString();
        }
      }
      // НЕ вызываем finishEdit здесь - изменения будут применены только при Enter или blur
    });
    
    // Обработчик change - не применяем изменения автоматически
    // Изменения через стрелки вызовут change, но мы не будем применять их до Enter/blur
    input.addEventListener('change', (e) => {
      // Просто валидируем значение, но не применяем изменения
      let value = parseInt(e.target.value);
      if (!isNaN(value)) {
        if (value < 1) {
          e.target.value = '1';
        } else if (value > maxVisibleSteps) {
          e.target.value = maxVisibleSteps.toString();
        }
      }
      // НЕ вызываем finishEdit - изменения будут применены только при Enter или blur
    });
    
    // Обработчики событий
    input.addEventListener('blur', () => {
      // Удаляем обработчик клика
      document.removeEventListener('mousedown', documentClickHandler, true);
      
      // При потере фокуса сохраняем только если клик был не по полю с номером шага
      if (shouldSaveOnBlur) {
        finishEdit(true);
      } else {
        // Отменяем редактирование, если кликнули по другому полю с номером шага
        finishEdit(false);
      }
      
      // Сбрасываем флаг
      shouldSaveOnBlur = true;
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Удаляем обработчик клика перед сохранением
        document.removeEventListener('mousedown', documentClickHandler, true);
        finishEdit(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Удаляем обработчик клика перед отменой
        document.removeEventListener('mousedown', documentClickHandler, true);
        finishEdit(false);
      }
    });
    
    // Предотвращаем применение изменений при клике по стрелкам
    // Стрелки input[type="number"] вызывают change, но мы не хотим применять изменения сразу
    input.addEventListener('wheel', (e) => {
      if (e.target === input) {
        e.preventDefault();
        // При прокрутке колесиком изменяем значение, но не применяем
        let currentValue = parseInt(input.value) || currentStepNumber;
        if (e.deltaY < 0) {
          // Прокрутка вверх - увеличиваем
          input.value = Math.min(currentValue + 1, maxVisibleSteps).toString();
        } else {
          // Прокрутка вниз - уменьшаем
          input.value = Math.max(currentValue - 1, 1).toString();
        }
      }
    }, { passive: false });
    
    // Предотвращаем обработку кликов по input and его стрелкам как обычных кликов
    // которые могут скрыть шаг
    input.addEventListener('mousedown', (e) => {
      e.stopPropagation(); // Предотвращаем всплытие события
    }, true);
    
    input.addEventListener('click', (e) => {
      e.stopPropagation(); // Предотвращаем всплытие события
    }, true);
    
    input.addEventListener('focus', (e) => {
      e.stopPropagation(); // Предотвращаем всплытие события
    }, true);
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

  /**
   * Translate a key using i18n system
   * @param {string} key - Translation key (e.g. 'editorUI.expandAll')
   * @param {Object} [params] - Optional interpolation parameters
   * @returns {string} Translated string
   */
  t(key, params) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key, params);
    }
    return key; // Fallback to key if i18n not available
  }

  /**
   * Отображает метаданные теста (дата создания, изменения, кто правил)
   */
  renderMetadata() {
    const metadataEl = document.getElementById('testMetadata');
    if (!metadataEl || !this.test) return;

    const createdAt = this.test.createdAt ? this.formatDateTime(this.test.createdAt) : this.t('editorUI.notSpecified');
    const updatedAt = this.test.updatedAt ? this.formatDateTime(this.test.updatedAt) : this.t('editorUI.notSpecified');
    
    // Определяем кто правил тест
    let editedBy = this.t('editorUI.notSpecified');
    let editedByIcon = '👤';
    
    if (this.test.lastEditedBy) {
      switch (this.test.lastEditedBy) {
        case 'optimization':
          editedBy = this.t('editorUI.optimization');
          editedByIcon = '⚡';
          break;
        case 'user':
          editedBy = this.t('editorUI.user');
          editedByIcon = '👤';
          break;
        default:
          editedBy = this.test.lastEditedBy;
      }
    } else {
      // Определяем по косвенным признакам
      const hasOptimization = this.test.actions?.some(a => a.optimizationMeta || a.hiddenReason);
      
      if (hasOptimization) {
        editedBy = this.t('editorUI.optimization');
        editedByIcon = '⚡';
      } else {
        editedBy = this.t('editorUI.user');
        editedByIcon = '👤';
      }
    }

    metadataEl.innerHTML = `
      <div class="metadata-grid">
        <div class="metadata-item">
          <span class="metadata-label">📅 ${this.t('editorUI.created')}</span>
          <span class="metadata-value">${createdAt}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">🔄 ${this.t('editorUI.updated')}</span>
          <span class="metadata-value">${updatedAt}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">${editedByIcon} ${this.t('editorUI.editedBy')}</span>
          <span class="metadata-value">${editedBy}</span>
        </div>
      </div>
    `;
  }

  /**
   * Экспортирует тест в JSON файл
   */
  /**
   * Перегенерирует селектор для действия
   */
  async regenerateSelector(index) {
    const action = this.test.actions[index];
    if (!action) return;

    const selectorStr = this.getSelectorInfo(action.selector);
    
    try {
      // Отправляем сообщение в content script для поиска элемента and перегенерации селектора
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        this.showToast(this.t('editorUI.couldNotFindActiveTab'), 'error');
        return;
      }

      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'REGENERATE_SELECTOR',
        selector: selectorStr,
        actionIndex: index
      });

      if (response && response.success && response.newSelector) {
        // Обновляем селектор в действии
        action.selector = response.newSelector;
        action.selectorRegenerated = true;
        action.selectorRegeneratedAt = new Date().toISOString();
        
        this.renderActions();
        this.showToast(this.t('editorUI.selectorRegenerated'), 'success');
      } else {
        this.showToast(response?.error || this.t('editorUI.failedToRegenerateSelector'), 'error');
      }
    } catch (error) {
      console.error('Ошибка при перегенерации селектора:', error);
      this.showToast(this.t('editorUI.regenerationError'), 'error');
    }
  }

  /**
   * Копирует селектор в буфер обмена
   */
  async copySelector(index) {
    const action = this.test.actions[index];
    if (!action) return;

    const selectorStr = this.getSelectorInfo(action.selector);
    
    try {
      await this.copyToClipboard(selectorStr);
      this.showToast(this.t('editorUI.selectorCopied'), 'success');
    } catch (error) {
      console.error('Ошибка при копировании селектора:', error);
      this.showToast(this.t('editorUI.failedToCopySelector'), 'error');
    }
  }

  /**
   * Находит элемент на странице and подсвечивает его
   */
  async findOnPage(index) {
    const action = this.test.actions[index];
    if (!action) return;

    const selectorStr = this.getSelectorInfo(action.selector);
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        this.showToast(this.t('editorUI.couldNotFindActiveTab'), 'error');
        return;
      }

      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'HIGHLIGHT_ELEMENT',
        selector: selectorStr
      });

      if (response && response.success) {
        this.showToast(this.t('editorUI.elementFoundHighlighted'), 'success');
      } else {
        this.showToast(response?.error || this.t('editorUI.elementNotFoundError'), 'error');
      }
    } catch (error) {
      console.error('Ошибка при поиске элемента:', error);
      this.showToast(this.t('editorUI.findElementError'), 'error');
    }
  }

  exportTest() {
    if (!this.test) {
      alert(this.t('editorUI.testNotLoaded'));
      return;
    }

    // Показываем меню выбора формата экспорта
    this.showExportMenu();
  }

  showExportMenu() {
    // Упрощенное меню - только экспорт в JSON
    this.exportToJSON();
  }

  performExport(format) {
    try {
      if (format === 'json') {
        this.exportToJSON();
      } else {
        this.showToast(this.t('editorUI.exportUnavailable'), 'warning');
      }
    } catch (error) {
      console.error('Ошибка при экспорте:', error);
      this.showToast(this.t('editorUI.exportError2') + ': ' + error.message, 'error');
    }
  }

  exportToJSON() {
    try {
      // Подготавливаем данные для экспорта (включая все необходимые поля для импорта)
      const exportData = {
        id: this.test.id,
        name: this.test.name || 'Unnamed Test',
        createdAt: this.test.createdAt || new Date().toISOString(),
        updatedAt: this.test.updatedAt || new Date().toISOString(),
        lastEditedBy: this.test.lastEditedBy || 'user',
        actions: this.test.actions || [],
        variables: this.test.variables || {}, // Добавляем переменные для возможности импорта
        optimization: this.test.optimization || {},
        preconditions: this.test.preconditions || [],
        url: this.test.url || ''
      };

      // Проверяем структуру перед экспортом
      if (!exportData.actions || !Array.isArray(exportData.actions)) {
        throw new Error(this.t('editorUI.fileNotContainsActionsArray'));
      }

      if (!exportData.name) {
        throw new Error(this.t('editorUI.fileNotContainsName'));
      }

      // Форматируем JSON с отступами для читаемости
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Создаём blob and скачиваем файл
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Генерируем имя файла из названия теста and даты
      const safeName = (exportData.name || 'test')
        .replace(/[^a-zа-яё0-9]/gi, '_')
        .substring(0, 50);
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `autotest_${safeName}_${dateStr}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('✅ Тест экспортирован:', link.download);
      this.showToast(this.t('editorUI.testExportedJson'), 'success');
    } catch (error) {
      console.error('❌ Ошибка при экспорте теста:', error);
      alert(this.t('editorUI.exportError') + ':\n' + error.message);
    }
  }

  /**
   * Импортирует тест из JSON файла
   */
  importTest() {
    try {
      // Создаем скрытый input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
          return;
        }
        
        try {
          const fileContent = await file.text();
          const importedData = JSON.parse(fileContent);
          
          // Валидация импортированных данных
          if (!importedData.name) {
            throw new Error(this.t('editorUI.fileNotContainsName'));
          }
          
          if (!importedData.actions || !Array.isArray(importedData.actions)) {
            throw new Error(this.t('editorUI.fileNotContainsActionsArray'));
          }
          
          // Подтверждение импорта
          const confirmMessage = this.t('editorUI.importTestConfirm', {
            name: importedData.name,
            actions: importedData.actions.length,
            variables: Object.keys(importedData.variables || {}).length
          });
          
          if (!confirm(confirmMessage)) {
            return;
          }
          
          // Создаем новый тест на основе импортированных данных
          const newTest = {
            name: importedData.name || 'Imported Test',
            actions: importedData.actions || [],
            variables: importedData.variables || {},
            optimization: importedData.optimization || {},
            preconditions: importedData.preconditions || [],
            url: importedData.url || '',
            createdAt: importedData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastEditedBy: importedData.lastEditedBy || 'user'
          };
          
          // Сохраняем тест через background
          const response = await chrome.runtime.sendMessage({
            type: 'SAVE_TEST',
            test: newTest
          });
          
          if (response && response.success) {
            // Загружаем импортированный тест
            await this.loadTest(response.testId);
            this.showToast(this.t('editorUI.testImportedSuccess', { name: newTest.name }), 'success');
          } else {
            throw new Error(response?.error || this.t('editorUI.importSaveError'));
          }
        } catch (error) {
          console.error('❌ Ошибка при импорте теста:', error);
          alert(this.t('editorUI.importError') + ':\n' + error.message);
        } finally {
          // Удаляем input после использования
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
        }
      });
      
      document.body.appendChild(input);
      input.click();
    } catch (error) {
      console.error('❌ Ошибка при создании диалога импорта:', error);
      this.showToast(this.t('editorUI.importDialogError') + ': ' + error.message, 'error');
    }
  }

  /**
   * Показывает модальное окно импорта API
   */
  showImportApiModal() {
    const modal = document.getElementById('importApiModal');
    if (modal) {
      modal.style.display = 'flex';
      // Сбрасываем состояние
      document.getElementById('apiSpecFile').value = '';
      document.getElementById('apiImportInfo').style.display = 'none';
      document.getElementById('apiEndpointsList').style.display = 'none';
      document.getElementById('apiImportOptions').style.display = 'none';
      document.getElementById('importApiBtn').disabled = true;
      this.apiParser = null;
      this.selectedEndpoints = [];
    }
  }

  /**
   * Закрывает модальное окно импорта API
   */
  closeImportApiModal() {
    const modal = document.getElementById('importApiModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Обрабатывает выбор файла спецификации
   */
  async handleApiSpecFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      
      // Создаем парсер
      this.apiParser = new OpenAPIParser();
      const spec = await this.apiParser.parse(fileContent);
      
      // Отображаем информацию о спецификации
      this.displayApiSpecInfo(spec);
      
      // Извлекаем эндпоинты
      const endpoints = this.apiParser.extractEndpoints();
      this.displayApiEndpoints(endpoints);
      
      // Показываем опции импорта
      document.getElementById('apiImportOptions').style.display = 'block';
      document.getElementById('importApiBtn').disabled = false;
      
    } catch (error) {
      console.error('❌ Ошибка при парсинге спецификации:', error);
      this.showToast(this.t('editorUI.specParseError') + ': ' + error.message, 'error');
      document.getElementById('apiImportInfo').style.display = 'none';
      document.getElementById('apiEndpointsList').style.display = 'none';
      document.getElementById('apiImportOptions').style.display = 'none';
    }
  }

  /**
   * Отображает информацию о спецификации
   */
  displayApiSpecInfo(spec) {
    const infoContainer = document.getElementById('apiSpecInfo');
    const infoDiv = document.getElementById('apiImportInfo');
    
    const title = this.decodeUnicode(spec.info.title || 'N/A');
    const description = this.decodeUnicode(spec.info.description || this.t('editorUI.noDescription'));
    
    // Ограничиваем длину описания для отображения
    const maxDescriptionLength = 500;
    const isDescriptionLong = description.length > maxDescriptionLength;
    const shortDescription = isDescriptionLong ? description.substring(0, maxDescriptionLength) + '...' : description;
    
    infoContainer.innerHTML = `
      <p><strong>${this.t('editorUI.versionLabel')}</strong> ${spec.openapi || 'N/A'}</p>
      <p><strong>${this.t('editorUI.titleLabel')}</strong> ${this.escapeHtml(title)}</p>
      <p><strong>${this.t('editorUI.apiVersionLabel')}</strong> ${spec.info.version || 'N/A'}</p>
      <p><strong>${this.t('editorUI.descriptionLabel')}</strong></p>
      <div style="max-height: 150px; overflow-y: auto; padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 4px; font-size: 12px; line-height: 1.5;">
        <div style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;">${this.escapeHtml(description)}</div>
      </div>
      <p style="margin-top: 8px;"><strong>${this.t('editorUI.serversLabel')}</strong> ${spec.servers.length > 0 ? spec.servers.map(s => s.url).join(', ') : this.t('editorUI.notSpecifiedPlural')}</p>
      <p><strong>${this.t('editorUI.endpointsLabel')}</strong> ${this.apiParser.extractEndpoints().length}</p>
    `;
    
    infoDiv.style.display = 'block';
  }

  /**
   * Декодирует Unicode escape-последовательности в строке
   * @param {string} str - Строка с Unicode escape-последовательностями
   * @returns {string} Декодированная строка
   */
  decodeUnicode(str) {
    if (!str || typeof str !== 'string') return str;
    
    try {
      // Заменяем Unicode escape-последовательности вида \uXXXX
      return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
        return String.fromCharCode(parseInt(code, 16));
      });
    } catch (e) {
      // Если ошибка, возвращаем исходную строку
      return str;
    }
  }

  /**
   * Переключает выбор всех эндпоинтов
   */
  toggleSelectAllEndpoints() {
    const container = document.getElementById('apiEndpointsContainer');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const selectAllBtn = document.getElementById('selectAllEndpoints');
    
    // Проверяем, все ли выбраны
    const allSelected = Array.from(checkboxes).every(cb => cb.checked);
    
    // Переключаем состояние всех чекбоксов
    checkboxes.forEach(cb => {
      cb.checked = !allSelected;
      const index = parseInt(cb.value);
      
      if (!allSelected) {
        // Выбираем все
        if (!this.selectedEndpoints.includes(index)) {
          this.selectedEndpoints.push(index);
        }
      } else {
        // Снимаем выбор со всех
        this.selectedEndpoints = this.selectedEndpoints.filter(i => i !== index);
      }
    });
    
    // Обновляем текст кнопки
    selectAllBtn.textContent = allSelected ? this.t('editorUI.selectAll') : this.t('editorUI.deselectAll');
    
    // Обновляем состояние кнопки импорта
    document.getElementById('importApiBtn').disabled = this.selectedEndpoints.length === 0;
  }

  /**
   * Отображает список эндпоинтов для выбора
   */
  displayApiEndpoints(endpoints) {
    const container = document.getElementById('apiEndpointsContainer');
    const listDiv = document.getElementById('apiEndpointsList');
    
    container.innerHTML = '';
    this.selectedEndpoints = [];
    
    // Сбрасываем текст кнопки "Выбрать все"
    document.getElementById('selectAllEndpoints').textContent = this.t('editorUI.selectAll');
    
      endpoints.forEach((endpoint, index) => {
      const endpointDiv = document.createElement('div');
      endpointDiv.className = 'api-endpoint-item';
      endpointDiv.style.cssText = 'padding: 8px; margin: 4px 0; border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: flex-start; gap: 12px; min-height: 40px;';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `endpoint-${index}`;
      checkbox.value = index;
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedEndpoints.push(index);
        } else {
          this.selectedEndpoints = this.selectedEndpoints.filter(i => i !== index);
        }
        document.getElementById('importApiBtn').disabled = this.selectedEndpoints.length === 0;
      });
      
      const methodBadge = document.createElement('span');
      methodBadge.textContent = endpoint.method;
      methodBadge.style.cssText = `padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; background: ${this.getMethodColor(endpoint.method)}; color: white;`;
      
      const pathSpan = document.createElement('span');
      pathSpan.textContent = endpoint.path;
      pathSpan.style.cssText = 'flex: 1; font-family: monospace; min-width: 0; white-space: normal; word-wrap: break-word;';
      
      const summarySpan = document.createElement('span');
      const summaryText = this.decodeUnicode(endpoint.summary || endpoint.operationId || '');
      summarySpan.textContent = summaryText;
      summarySpan.title = summaryText; // Полный текст при наведении
      summarySpan.className = 'api-endpoint-summary';
      summarySpan.style.cssText = 'flex: 2; color: #666; font-size: 12px; white-space: normal; word-wrap: break-word; overflow-wrap: break-word; min-width: 0; line-height: 1.4;';
      
      endpointDiv.appendChild(checkbox);
      endpointDiv.appendChild(methodBadge);
      endpointDiv.appendChild(pathSpan);
      endpointDiv.appendChild(summarySpan);
      
      container.appendChild(endpointDiv);
    });
    
    listDiv.style.display = 'block';
  }

  /**
   * Возвращает цвет для метода HTTP
   */
  getMethodColor(method) {
    const colors = {
      'GET': '#61affe',
      'POST': '#49cc90',
      'PUT': '#fca130',
      'DELETE': '#f93e3e',
      'PATCH': '#50e3c2',
      'HEAD': '#9012fe',
      'OPTIONS': '#0d5aa7'
    };
    return colors[method] || '#666';
  }

  /**
   * Импортирует выбранные эндпоинты как API шаги
   */
  async importSelectedApiEndpoints() {
    if (!this.apiParser || this.selectedEndpoints.length === 0) {
      this.showToast(this.t('editorUI.selectAtLeastOne'), 'error');
      return;
    }

    try {
      const endpoints = this.apiParser.extractEndpoints();
      const generateTestData = document.getElementById('apiGenerateTestData').checked;
      const validateResponse = document.getElementById('apiValidateResponse').checked;
      const saveResponse = document.getElementById('apiSaveResponse').checked;
      const baseUrl = document.getElementById('apiBaseUrl').value.trim();
      
      // Если указан базовый URL, обновляем серверы
      if (baseUrl) {
        this.apiParser.servers = [{ url: baseUrl }];
      }
      
      // Извлекаем and создаем переменные из спецификации
      const extractedVariables = this.apiParser.extractVariables();
      const createdVars = this.createVariablesFromSpec(extractedVariables);
      
      const newActions = [];
      
      for (const index of this.selectedEndpoints) {
        const endpoint = endpoints[index];
        const action = this.createApiActionFromEndpoint(endpoint, generateTestData, validateResponse, saveResponse, extractedVariables);
        newActions.push(action);
      }
      
      // Добавляем действия к текущему тесту
      if (!this.test.actions) {
        this.test.actions = [];
      }
      
      this.test.actions.push(...newActions);
      
      // Извлекаем переменные из созданных действий and добавляем их в переменные сценария
      this.extractVariablesFromActions(newActions);
      
      // Обновляем кэш allTestsVariables перед сохранением
      const currentTestKey = String(this.test.id);
      if (!this.allTestsVariables) {
        this.allTestsVariables = {};
      }
      if (!this.allTestsVariables[currentTestKey]) {
        this.allTestsVariables[currentTestKey] = {
          name: this.test.name,
          variables: {}
        };
      }
      // Синхронизируем переменные с кэшем
      this.allTestsVariables[currentTestKey].variables = { ...(this.test.variables || {}) };
      console.log(`🔄 [API Import] Обновлен кэш переменных для теста ${currentTestKey}:`, Object.keys(this.allTestsVariables[currentTestKey].variables));
      console.log(`📦 [API Import] Переменные в this.test.variables:`, Object.keys(this.test.variables || {}));
      
      // Сохраняем тест
      await this.saveTest();
      
      // Перезагружаем переменные всех тестов для актуальности
      await this.loadAllTestsVariables();
      
      // Перерисовываем действия
      this.renderActions();
      
      // Перерисовываем панель переменных, чтобы показать новые переменные
      this.renderVariablesPanel();
      
      // Закрываем модальное окно
      this.closeImportApiModal();
      
      this.showToast(this.t('editorUI.apiStepsImportSuccess', { count: newActions.length }), 'success');
      
    } catch (error) {
      console.error('❌ Ошибка при импорте API шагов:', error);
      this.showToast(this.t('editorUI.apiStepsImportError2') + ': ' + error.message, 'error');
    }
  }

  /**
   * Создает переменные из спецификации
   * @param {Array} extractedVariables - Массив извлеченных переменных
   * @returns {Object} Статистика создания переменных
   */
  createVariablesFromSpec(extractedVariables) {
    if (!this.test.variables) {
      this.test.variables = {};
    }

    let createdCount = 0;
    let updatedCount = 0;
    const createdVars = [];

    for (const varInfo of extractedVariables) {
      if (!this.test.variables[varInfo.name]) {
        // Создаем новую переменную
        this.test.variables[varInfo.name] = {
          name: varInfo.name,
          value: varInfo.value || '',
          description: varInfo.description || '',
          source: varInfo.source || 'api',
          global: false
        };
        createdCount++;
        createdVars.push(varInfo.name);
        console.log(`✅ [API Import] Создана переменная: ${varInfo.name} = "${varInfo.value || ''}"`);
      } else {
        // Обновляем существующую переменную, если есть значение
        if (varInfo.value && !this.test.variables[varInfo.name].value) {
          this.test.variables[varInfo.name].value = varInfo.value;
          updatedCount++;
          console.log(`🔄 [API Import] Обновлена переменная: ${varInfo.name} = "${varInfo.value}"`);
        }
        // Обновляем описание, если оно лучше
        if (varInfo.description && (!this.test.variables[varInfo.name].description || this.test.variables[varInfo.name].description.length < varInfo.description.length)) {
          this.test.variables[varInfo.name].description = varInfo.description;
        }
      }
    }

    if (createdCount > 0 || updatedCount > 0) {
      console.log(`✅ [API Import] Итого: создано переменных: ${createdCount}, обновлено: ${updatedCount}`);
      console.log(`   Все переменные в тесте:`, Object.keys(this.test.variables));
    } else {
      console.warn(`⚠️ [API Import] Переменные не были созданы. Извлеченные переменные:`, extractedVariables.map(v => v.name));
    }

    return { createdCount, updatedCount, createdVars };
  }

  /**
   * Извлекает переменные из действий and добавляет их в переменные сценария
   * @param {Array} actions - Массив действий для анализа
   */
  extractVariablesFromActions(actions) {
    if (!actions || actions.length === 0) return;
    
    if (!this.test.variables) {
      this.test.variables = {};
    }
    
    const foundVars = new Set();
    
    // Функция для извлечения переменных из строки
    const extractVarsFromString = (str) => {
      if (!str || typeof str !== 'string') return;
      const matches = str.matchAll(/\{var:([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
      for (const match of matches) {
        foundVars.add(match[1]);
      }
      const matchesAlt = str.matchAll(/\$\{([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
      for (const match of matchesAlt) {
        foundVars.add(match[1]);
      }
    };
    
    // Проходим по всем действиям
    for (const action of actions) {
      // Извлекаем переменные из API действий
      if (action.type === 'api' && action.api) {
        // URL
        if (action.api.url) {
          extractVarsFromString(action.api.url);
        }
        
        // Заголовки (могут быть объектом или JSON строкой)
        if (action.api.headers) {
          if (typeof action.api.headers === 'string') {
            extractVarsFromString(action.api.headers);
          } else if (typeof action.api.headers === 'object') {
            // Преобразуем объект в строку для поиска переменных
            extractVarsFromString(JSON.stringify(action.api.headers));
          }
        }
        
        // Тело запроса (может быть объектом или JSON строкой)
        if (action.api.body) {
          if (typeof action.api.body === 'string') {
            extractVarsFromString(action.api.body);
          } else if (typeof action.api.body === 'object') {
            // Преобразуем объект в строку для поиска переменных
            extractVarsFromString(JSON.stringify(action.api.body));
          }
        }
        
        // Переменная для сохранения ответа
        if (action.api.responseVariable) {
          foundVars.add(action.api.responseVariable);
        }
      }
      
      // Извлекаем переменные из других типов действий
      if (action.type === 'variable' && action.variable) {
        if (action.variable.name) {
          foundVars.add(action.variable.name);
        }
        if (action.variable.value) {
          extractVarsFromString(action.variable.value);
        }
        if (action.variable.expression) {
          extractVarsFromString(action.variable.expression);
        }
      }

      if (action.type === 'setVariable') {
        if (action.variableName) {
          foundVars.add(action.variableName);
        }
        if (action.variableValue) {
          extractVarsFromString(action.variableValue);
        }
        if (action.variable?.value) {
          extractVarsFromString(action.variable.value);
        }
      }

      if (action.value && typeof action.value === 'string') {
        extractVarsFromString(action.value);
      }
      if (action.url && typeof action.url === 'string') {
        extractVarsFromString(action.url);
      }
      
      // Извлекаем переменные из условий
      if (action.type === 'condition' && action.condition) {
        if (action.condition.expression) {
          extractVarsFromString(action.condition.expression);
        }
      }
      
      // Извлекаем переменные из циклов
      if (action.type === 'loop' && action.loop) {
        if (action.loop.variable) {
          foundVars.add(action.loop.variable);
        }
        if (action.loop.expression) {
          extractVarsFromString(action.loop.expression);
        }
      }
      
      // Рекурсивно обрабатываем вложенные действия (then/else в условиях, действия в циклах)
      if (action.then && Array.isArray(action.then)) {
        this.extractVariablesFromActions(action.then);
      }
      if (action.else && Array.isArray(action.else)) {
        this.extractVariablesFromActions(action.else);
      }
      if (action.loop && action.loop.actions && Array.isArray(action.loop.actions)) {
        this.extractVariablesFromActions(action.loop.actions);
      }
    }
    
    // Добавляем найденные переменные в переменные сценария, если их там еще нет
    let addedCount = 0;
    for (const varName of foundVars) {
      if (!this.test.variables[varName]) {
        this.test.variables[varName] = {
          name: varName,
          value: '',
          description: 'Variable extracted from actions',
          source: 'action',
          global: false
        };
        addedCount++;
        console.log(`✅ [API Import] Добавлена переменная из действий: ${varName}`);
      }
    }
    
    if (addedCount > 0) {
      console.log(`✅ [API Import] Извлечено переменных из действий: ${addedCount}`);
      console.log(`   Переменные: ${Array.from(foundVars).join(', ')}`);
      this.updateScenarioVariablesPanel();
    }
  }

  getUsedVariablesFromActions(actions) {
    const usedVars = new Set();
    if (!actions || actions.length === 0) return usedVars;

    const extractVarsFromString = (str) => {
      if (!str || typeof str !== 'string') return;
      const matches = str.matchAll(/\{var:([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
      for (const match of matches) {
        usedVars.add(match[1]);
      }
      const matchesAlt = str.matchAll(/\$\{([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
      for (const match of matchesAlt) {
        usedVars.add(match[1]);
      }
    };

    const walkActions = (items) => {
      if (!Array.isArray(items)) return;
      for (const action of items) {
        if (!action) continue;

        if (action.type === 'api' && action.api) {
          if (action.api.url) extractVarsFromString(action.api.url);
          if (action.api.headers) extractVarsFromString(typeof action.api.headers === 'string' ? action.api.headers : JSON.stringify(action.api.headers));
          if (action.api.body) extractVarsFromString(typeof action.api.body === 'string' ? action.api.body : JSON.stringify(action.api.body));
          if (action.api.responseVariable) usedVars.add(action.api.responseVariable);
        }

        if (action.type === 'variable' && action.variable) {
          if (action.variable.name) usedVars.add(action.variable.name);
          if (action.variable.value) extractVarsFromString(action.variable.value);
          if (action.variable.expression) extractVarsFromString(action.variable.expression);
        }

        if (action.type === 'setVariable') {
          if (action.variableName) usedVars.add(action.variableName);
          if (action.variableValue) extractVarsFromString(action.variableValue);
          if (action.variable?.value) extractVarsFromString(action.variable.value);
        }

        if (action.value && typeof action.value === 'string') extractVarsFromString(action.value);
        if (action.url && typeof action.url === 'string') extractVarsFromString(action.url);

        if (action.type === 'condition' && action.condition?.expression) {
          extractVarsFromString(action.condition.expression);
        }
        if (action.type === 'loop' && action.loop) {
          if (action.loop.variable) usedVars.add(action.loop.variable);
          if (action.loop.expression) extractVarsFromString(action.loop.expression);
        }

        if (action.then && Array.isArray(action.then)) {
          walkActions(action.then);
        }
        if (action.else && Array.isArray(action.else)) {
          walkActions(action.else);
        }
        if (action.loop && action.loop.actions && Array.isArray(action.loop.actions)) {
          walkActions(action.loop.actions);
        }
      }
    };

    walkActions(actions);
    return usedVars;
  }

  /**
   * Выполняет один API запрос
   * @param {Object} action - Действие API
   * @param {number|string} index - Индекс действия
   */
  async executeApiAction(action, index) {
    if (!action || action.type !== 'api' || !action.api) {
      this.showToast(this.t('editorUI.invalidApiActionError'), 'error');
      return;
    }

    const api = action.api;
    const method = api.method || 'GET';
    let url = api.url || '';

    if (!url) {
      this.showToast(this.t('editorUI.specifyApiUrl'), 'error');
      return;
    }

    try {
      // Обрабатываем переменные в URL
      if (url.includes('{var:') || url.includes('{date}') || url.includes('{time}') || url.includes('{counter:')) {
        // Получаем переменные из теста
        const variables = this.test.variables || {};
        url = await this.processVariablesInString(url, variables);
      }

      // Валидация URL
      try {
        new URL(url);
      } catch (urlError) {
        this.showToast(this.t('editorUI.invalidUrl', { url: url }), 'error');
        return;
      }

      // Обрабатываем заголовки
      let headers = api.headers || {};
      const processedHeaders = {};
      if (Object.keys(headers).length > 0) {
        const variables = this.test.variables || {};
        for (const [key, value] of Object.entries(headers)) {
          const headerValue = String(value);
          if (headerValue.includes('{var:') || headerValue.includes('{date}') || headerValue.includes('{time}') || headerValue.includes('{counter:')) {
            processedHeaders[key] = await this.processVariablesInString(headerValue, variables);
          } else {
            processedHeaders[key] = headerValue;
          }
        }
      }

      // Обрабатываем тело запроса
      let body = api.body || null;
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        const variables = this.test.variables || {};
        if (typeof body === 'string') {
          if (body.includes('{var:') || body.includes('{date}') || body.includes('{time}') || body.includes('{counter:')) {
            body = await this.processVariablesInString(body, variables);
          }
        } else if (typeof body === 'object') {
          // Рекурсивно обрабатываем объект
          body = await this.processVariablesInObject(body, variables);
        }
      }

      this.showToast(this.t('editorUI.executingRequest', { method: method }), 'info');

      // Отправляем запрос через background script
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        method: method,
        url: url,
        headers: processedHeaders,
        body: body
      });

      if (response && response.success) {
        const statusText = response.statusText || 'OK';
        const statusCode = response.status || 200;
        this.showToast(this.t('editorUI.requestSuccess', { code: statusCode, status: statusText }), 'success');
        console.log('✅ [API Execute] Ответ:', response.data);
      } else {
        const errorMessage = response?.error || this.t('common.unknownError');
        this.showToast(this.t('editorUI.requestError', { error: errorMessage }), 'error');
        console.error('❌ [API Execute] Ошибка:', errorMessage);
      }
    } catch (error) {
      console.error('❌ [API Execute] Ошибка при выполнении запроса:', error);
      this.showToast(this.t('editorUI.requestError', { error: error.message }), 'error');
    }
  }

  /**
   * Обрабатывает переменные в строке
   * @param {string} str - Строка с переменными
   * @param {Object} variables - Объект переменных
   * @returns {Promise<string>} Обработанная строка
   */
  async processVariablesInString(str, variables) {
    let result = str;
    
    // Обрабатываем {var:name}
    const varMatches = result.matchAll(/\{var:([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
    for (const match of varMatches) {
      const varName = match[1];
      const varValue = variables[varName]?.value || '';
      result = result.replace(match[0], varValue);
    }
    
    // Обрабатываем {date}
    if (result.includes('{date}')) {
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0];
      result = result.replace(/\{date\}/g, dateStr);
    }
    
    // Обрабатываем {time}
    if (result.includes('{time}')) {
      const time = new Date();
      const timeStr = time.toISOString();
      result = result.replace(/\{time\}/g, timeStr);
    }
    
    // Обрабатываем {counter:name}
    const counterMatches = result.matchAll(/\{counter:([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
    for (const match of counterMatches) {
      const counterName = match[1];
      if (!this.counters) {
        this.counters = {};
      }
      if (!this.counters[counterName]) {
        this.counters[counterName] = 0;
      }
      this.counters[counterName]++;
      result = result.replace(match[0], String(this.counters[counterName]));
    }
    
    return result;
  }

  /**
   * Рекурсивно обрабатывает переменные в объекте
   * @param {Object} obj - Объект для обработки
   * @param {Object} variables - Объект переменных
   * @returns {Promise<Object>} Обработанный объект
   */
  async processVariablesInObject(obj, variables) {
    if (typeof obj === 'string') {
      return await this.processVariablesInString(obj, variables);
    } else if (Array.isArray(obj)) {
      return await Promise.all(obj.map(item => this.processVariablesInObject(item, variables)));
    } else if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = await this.processVariablesInObject(value, variables);
      }
      return result;
    }
    return obj;
  }

  /**
   * Создает API действие из эндпоинта
   */
  createApiActionFromEndpoint(endpoint, generateTestData, validateResponse, saveResponse, extractedVariables = []) {
    // Генерируем URL с использованием переменных
    // generateUrl уже заменяет path parameters через replacePathParametersWithVariables
    let url = this.apiParser.generateUrl(endpoint, true); // useVariables = true
    
    // Дополнительно обрабатываем path parameters для гарантии замены всех переменных
    // Это нужно на случай, если параметры не были в списке endpoint.parameters
    if (endpoint.parameters) {
      url = this.apiParser.replaceUrlWithVariables(url, extractedVariables, endpoint.parameters);
    } else {
      // Если параметров нет в endpoint.parameters, но они есть в пути, заменяем напрямую
      url = this.apiParser.replaceUrlWithVariables(url, extractedVariables, []);
    }
    
    let headers = this.apiParser.generateHeaders(endpoint);
    
    // Заменяем значения в заголовках на переменные
    if (extractedVariables.length > 0) {
      headers = this.apiParser.replaceHeadersWithVariables(headers, extractedVariables);
    }
    
    // Генерируем тело запроса
    let body = null;
    if (endpoint.requestBody && generateTestData) {
      body = this.apiParser.generateRequestBody(endpoint.requestBody);
    }
    
    // Генерируем схему валидации ответа
    let responseValidation = null;
    if (validateResponse && endpoint.responses && typeof endpoint.responses === 'object') {
      try {
        responseValidation = this.apiParser.generateResponseValidation(endpoint.responses);
      } catch (error) {
        console.warn('⚠️ [API Import] Ошибка при генерации схемы валидации:', error);
        // Продолжаем без валидации
        responseValidation = null;
      }
    }
    
    // Генерируем имя переменной для ответа
    const responseVariable = saveResponse ? 
      `api_${endpoint.operationId || endpoint.method.toLowerCase()}_${Date.now()}` : null;
    
    // Извлекаем описание из эндпоинта (summary или description)
    const description = this.decodeUnicode(endpoint.summary || endpoint.description || '');
    
    return {
      type: 'api',
      api: {
        method: endpoint.method,
        url: url,
        headers: headers,
        body: body,
        description: description,
        saveResponse: saveResponse,
        responseVariable: responseVariable,
        responseValidation: responseValidation
      },
      timestamp: Date.now(),
      hidden: false
    };
  }

  exportToFramework(format) {
    try {
      if (!window.TestExporter) {
        this.showToast(this.t('editorUI.exportModuleNotLoaded'), 'error');
        return;
      }
      
      const exporter = new window.TestExporter();
      const result = exporter.export(this.test, format, {
        fileName: `${this.sanitizeFileName(this.test.name || 'test')}.${this.getFileExtension(format)}`
      });
      
      // Создаём blob and скачиваем файл
      const blob = new Blob([result.code], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`✅ Тест экспортирован в ${format}:`, result.fileName);
      this.showToast(this.t('editorUI.testExportedFormat', { format: format.toUpperCase() }), 'success');
    } catch (error) {
      console.error(`❌ Ошибка при экспорте в ${format}:`, error);
      this.showToast(this.t('editorUI.exportError2') + ': ' + error.message, 'error');
    }
  }

  sanitizeFileName(name) {
    return (name || 'test')
      .replace(/[^a-zа-яё0-9]/gi, '_')
      .substring(0, 50);
  }

  getFileExtension(format) {
    const extensions = {
      'playwright': 'spec.ts',
      'cypress': 'cy.js',
      'puppeteer': 'js'
    };
    return extensions[format] || 'js';
  }

  /**
   * Показывает модальное окно для добавления условия
   */
  showAddConditionModal() {
    const modal = document.getElementById('actionModal');
    const modalTitle = modal.querySelector('.modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = this.t('editorUI.addCondition');
    }
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <div class="form-group">
        <label>${this.t('editorUI.conditionLabel')}</label>
        <input type="text" id="conditionExpression" class="input" placeholder="${this.t('editorUI.conditionExample')}">
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.operatorLabel')}</label>
        <select id="conditionOperator" class="input">
          <option value="exists">${this.t('editorUI.operatorExists')}</option>
          <option value="notExists">${this.t('editorUI.operatorNotExists')}</option>
          <option value="equals">${this.t('editorUI.operatorEquals')}</option>
          <option value="contains">${this.t('editorUI.operatorContains')}</option>
          <option value="visible">${this.t('editorUI.operatorVisible')}</option>
          <option value="hidden">${this.t('editorUI.operatorHidden')}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.conditionValue')}</label>
        <input type="text" id="conditionValue" class="input" placeholder="Value for comparison">
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.actionsWhenCondition')}</label>
        <div class="condition-actions-preview">
          <p class="description">${this.t('editorUI.actionsAddedAfter')}</p>
        </div>
      </div>
    `;
    
    modal.style.display = 'block';
    modal.classList.add('show');
    this.currentEditingAction = -1; // -1 означает новое действие
    this.currentEditingActionType = 'condition';
  }

  /**
   * Показывает модальное окно для редактирования условия
   */
  showEditConditionModal(action, index) {
    const modal = document.getElementById('actionModal');
    const modalTitle = modal.querySelector('.modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = this.t('editorUI.editCondition');
    }
    
    const condition = action.condition || {};
    const stepOptions = this.generateStepOptionsHTML(index);
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <div class="form-group">
        <label>${this.t('editorUI.conditionLabel')}</label>
        <input type="text" id="conditionExpression" class="input" value="${this.escapeHtml(condition.expression || '')}" placeholder="${this.t('editorUI.conditionExample')}">
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.conditionOperator')}</label>
        <select id="conditionOperator" class="input">
          <option value="exists" ${condition.operator === 'exists' ? 'selected' : ''}>${this.t('editorUI.operatorExists')}</option>
          <option value="notExists" ${condition.operator === 'notExists' ? 'selected' : ''}>${this.t('editorUI.operatorNotExists')}</option>
          <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>${this.t('editorUI.operatorEquals')}</option>
          <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>${this.t('editorUI.operatorContains')}</option>
          <option value="visible" ${condition.operator === 'visible' ? 'selected' : ''}>${this.t('editorUI.operatorVisible')}</option>
          <option value="hidden" ${condition.operator === 'hidden' ? 'selected' : ''}>${this.t('editorUI.operatorHidden')}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.conditionValue')}</label>
        <input type="text" id="conditionValue" class="input" value="${this.escapeHtml(condition.value || '')}" placeholder="${this.t('editorUI.conditionValuePlaceholder')}">
      </div>
      <div class="goto-section">
        <h4>${this.t('editorUI.goToStep')}</h4>
        <div class="goto-options">
          <div class="goto-option">
            <label>✅ ${this.t('editorUI.afterThen')}</label>
            <select id="gotoThen" class="input">
              <option value="">${this.t('editorUI.defaultNextStep')}</option>
              ${stepOptions}
            </select>
          </div>
          <div class="goto-option">
            <label>❌ ${this.t('editorUI.afterElse')}</label>
            <select id="gotoElse" class="input">
              <option value="">${this.t('editorUI.defaultNextStep')}</option>
              ${stepOptions}
            </select>
          </div>
        </div>
        <div class="goto-warning">
          ⚠️ Go-To позволяет перейти к любому шагу, даже если он уже был выполнен. Используйте осторожно, чтобы избежать бесконечных циклов!
        </div>
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.actionsWhenCondition')}</label>
        <div class="condition-actions-preview">
          <p class="description">${this.t('editorUI.actionsViaButtons')}</p>
        </div>
      </div>
    `;
    
    // Установим значения go-to если они есть
    if (action.gotoThen !== undefined && action.gotoThen !== null) {
      document.getElementById('gotoThen').value = action.gotoThen;
    }
    if (action.gotoElse !== undefined && action.gotoElse !== null) {
      document.getElementById('gotoElse').value = action.gotoElse;
    }
    
    modal.style.display = 'block';
    modal.classList.add('show');
    this.currentEditingAction = index;
    this.currentEditingActionType = 'condition';
    this.preventFormSubmit();
  }

  /**
   * Показывает модальное окно для быстрого добавления Telegram шага
   */
  showTelegramModal() {
    const modal = document.getElementById('telegramModal');
    if (!modal) {
      console.error('Модальное окно Telegram не найдено');
      return;
    }
    
    // Загружаем значения из переменных, если они есть
    const savedToken = this.test?.variables?.telegramBotToken?.value || '';
    const savedChatId = this.test?.variables?.telegramChatId?.value || '';
    
    const tokenInput = document.getElementById('telegramBotToken');
    const userIdInput = document.getElementById('telegramUserId');
    const messageInput = document.getElementById('telegramMessage');
    const saveTokenCheck = document.getElementById('telegramSaveToken');
    const saveUserIdCheck = document.getElementById('telegramSaveUserId');
    
    if (tokenInput) tokenInput.value = savedToken;
    if (userIdInput) userIdInput.value = savedChatId;
    if (messageInput) messageInput.value = this.t('editorUI.testCompleted');
    // Чекбоксы больше не нужны, так как переменные всегда сохраняются
    if (saveTokenCheck) saveTokenCheck.checked = true;
    if (saveUserIdCheck) saveUserIdCheck.checked = true;
    
    modal.style.display = 'block';
    modal.classList.add('show');
    
    // Закрытие по клику вне модального окна
    const handleClickOutside = (e) => {
      if (e.target === modal) {
        this.closeTelegramModal();
        modal.removeEventListener('click', handleClickOutside);
      }
    };
    modal.addEventListener('click', handleClickOutside);
  }

  closeTelegramModal() {
    const modal = document.getElementById('telegramModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
  }

  async saveTelegramAction() {
    const botToken = document.getElementById('telegramBotToken')?.value.trim() || '';
    const userId = document.getElementById('telegramUserId')?.value.trim() || '';
    const message = document.getElementById('telegramMessage')?.value.trim() || '';

    if (!botToken) {
      alert(this.t('editorUI.specifyBotToken'));
      return;
    }

    if (!userId) {
      alert(this.t('editorUI.specifyUserId'));
      return;
    }

    if (!message) {
      alert(this.t('editorUI.specifyMessage'));
      return;
    }

    // Всегда сохраняем обе переменные в панель переменных сценария
    if (!this.test.variables) {
      this.test.variables = {};
    }

    // Сохраняем токен бота (всегда как чувствительные данные)
    this.test.variables.telegramBotToken = {
      value: botToken,
      sensitive: true
    };

    // Сохраняем User ID (chat_id)
    this.test.variables.telegramChatId = {
      value: userId,
      sensitive: false
    };

    // Создаем только API запрос для отправки сообщения (всегда используем переменные)
    const apiAction = {
      type: 'api',
      api: {
        method: 'POST',
        url: `https://api.telegram.org/bot{var:telegramBotToken}/sendMessage`,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          chat_id: '{var:telegramChatId}',
          text: message,
          parse_mode: 'HTML'
        },
        saveResponse: false
      },
      timestamp: Date.now(),
      url: window.location.href,
      userEdited: true,
      userEditedAt: new Date().toISOString()
    };

    // Добавляем только API действие в тест
    if (!this.test) {
      alert(this.t('editorUI.testNotLoadedError'));
      return;
    }

    this.test.actions.push(apiAction);

    // Сохраняем тест
    await this.saveTest();
    
    // Обновляем панель переменных
    this.renderVariablesPanel();
    
    // Закрываем модальное окно
    this.closeTelegramModal();
    
    // Обновляем отображение
    this.renderActions();
    
    // Показываем уведомление
    this.showToast(this.t('editorUI.telegramActionAdded'), 'success');
  }

  /**
   * Показывает модальное окно для добавления цикла
   */
  showAddLoopModal() {
    const modal = document.getElementById('actionModal');
    const modalTitle = modal.querySelector('.modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = this.t('editorUI.addLoop');
    }
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <div class="form-group">
        <label>${this.t('editorUI.loopType')}</label>
        <select id="loopType" class="input">
          <option value="for">${this.t('editorUI.forLoop')}</option>
          <option value="while">${this.t('editorUI.whileLoop')}</option>
          <option value="forEach">${this.t('editorUI.forEachLoop')}</option>
        </select>
      </div>
      <div class="form-group" id="loopCountGroup">
        <label>${this.t('editorUI.iterationCount')}</label>
        <input type="number" id="loopCount" class="input" value="5" min="1" max="100">
      </div>
      <div class="form-group" id="loopConditionGroup" style="display: none;">
        <label>${this.t('editorUI.loopConditionLabel')}</label>
        <input type="text" id="loopCondition" class="input" placeholder="${this.t('editorUI.loopConditionHint')}">
      </div>
      <div class="form-group" id="loopSelectorGroup" style="display: none;">
        <label>${this.t('editorUI.loopSelectorLabel')}</label>
        <input type="text" id="loopSelector" class="input" placeholder="${this.t('editorUI.loopSelectorHint')}">
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.loopVarName')}</label>
        <input type="text" id="loopVariable" class="input" value="i" placeholder="${this.t('editorUI.loopVarNameHint')}">
        <small style="color: #666; display: block; margin-top: 4px;">
          💡 ${this.t('editorUI.loopVarInfo')}
        </small>
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.loopActionsInside')}</label>
        <div class="loop-actions-preview">
          <p class="description">${this.t('editorUI.actionsAfterLoopCreate')}</p>
        </div>
      </div>
    `;
    
    modal.style.display = 'block';
    modal.classList.add('show');
    this.currentEditingAction = -1; // -1 означает новое действие
    this.currentEditingActionType = 'loop';
    
    // Обработчик изменения типа цикла (добавляем после вставки HTML)
    setTimeout(() => {
      const loopTypeSelect = modalBody.querySelector('#loopType');
      if (loopTypeSelect) {
        loopTypeSelect.addEventListener('change', (e) => {
          const type = e.target.value;
          const countGroup = modalBody.querySelector('#loopCountGroup');
          const conditionGroup = modalBody.querySelector('#loopConditionGroup');
          const selectorGroup = modalBody.querySelector('#loopSelectorGroup');
          
          if (type === 'for') {
            if (countGroup) countGroup.style.display = 'block';
            if (conditionGroup) conditionGroup.style.display = 'none';
            if (selectorGroup) selectorGroup.style.display = 'none';
          } else if (type === 'while') {
            if (countGroup) countGroup.style.display = 'none';
            if (conditionGroup) conditionGroup.style.display = 'block';
            if (selectorGroup) selectorGroup.style.display = 'none';
          } else if (type === 'forEach') {
            if (countGroup) countGroup.style.display = 'none';
            if (conditionGroup) conditionGroup.style.display = 'none';
            if (selectorGroup) selectorGroup.style.display = 'block';
          }
        });
      }
    }, 0);
  }

  /**
   * Показывает модальное окно для редактирования цикла
   */
  showEditLoopModal(action, index) {
    const modal = document.getElementById('actionModal');
    const modalTitle = modal.querySelector('.modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = this.t('editorUI.editLoop');
    }
    
    const loop = action.loop || {};
    const type = loop.type || 'for';
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <div class="form-group">
        <label>${this.t('editorUI.loopType')}</label>
        <select id="loopType" class="input">
          <option value="for" ${type === 'for' ? 'selected' : ''}>${this.t('editorUI.forLoop')}</option>
          <option value="while" ${type === 'while' ? 'selected' : ''}>${this.t('editorUI.whileLoop')}</option>
          <option value="forEach" ${type === 'forEach' ? 'selected' : ''}>${this.t('editorUI.forEachLoop')}</option>
        </select>
      </div>
      <div class="form-group" id="loopCountGroup" style="${type === 'for' ? '' : 'display: none;'}">
        <label>${this.t('editorUI.iterationCount')}</label>
        <input type="number" id="loopCount" class="input" value="${loop.count || 5}" min="1" max="100">
      </div>
      <div class="form-group" id="loopConditionGroup" style="${type === 'while' ? '' : 'display: none;'}">
        <label>${this.t('editorUI.loopConditionWithVars')}</label>
        <input type="text" id="loopCondition" class="input" value="${this.escapeHtml(loop.condition || '')}" placeholder="${this.t('editorUI.loopConditionWithVarsPlaceholder')}">
        <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
          💡 ${this.t('editorUI.loopConditionVarsHint')}
        </small>
      </div>
      <div class="form-group" id="loopVariableGroup" style="${type === 'forEach' ? 'display: none;' : ''}">
        <label>${this.t('editorUI.loopVariableOptional')}</label>
        <input type="text" id="loopVariable" class="input" value="${this.escapeHtml(loop.variable || 'i')}" placeholder="${this.t('editorUI.loopVariableOptionalPlaceholder')}">
        <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
          💡 ${this.t('editorUI.loopVariableHint')}
        </small>
      </div>
      <div class="form-group" id="loopSelectorGroup" style="${type === 'forEach' ? '' : 'display: none;'}">
        <label>${this.t('editorUI.loopSelectorLabel')}</label>
        <input type="text" id="loopSelector" class="input" value="${this.escapeHtml(loop.selector || '')}" placeholder="${this.t('editorUI.loopSelectorHint')}">
      </div>
      <div class="form-group">
        <label>${this.t('editorUI.loopActionsInside')}</label>
        <div class="loop-actions-preview">
          <p class="description">${this.t('editorUI.actionsAfterLoopCreate')}</p>
        </div>
      </div>
    `;
    
    // Обработчик изменения типа цикла (добавляем после вставки HTML)
    setTimeout(() => {
      const loopTypeSelect = modalBody.querySelector('#loopType');
      if (loopTypeSelect) {
        loopTypeSelect.addEventListener('change', (e) => {
          const selectedType = e.target.value;
          const countGroup = modalBody.querySelector('#loopCountGroup');
          const conditionGroup = modalBody.querySelector('#loopConditionGroup');
          const selectorGroup = modalBody.querySelector('#loopSelectorGroup');
          
          const variableGroup = modalBody.querySelector('#loopVariableGroup');
          
          if (selectedType === 'for') {
            if (countGroup) countGroup.style.display = 'block';
            if (conditionGroup) conditionGroup.style.display = 'none';
            if (selectorGroup) selectorGroup.style.display = 'none';
            if (variableGroup) variableGroup.style.display = 'block';
          } else if (selectedType === 'while') {
            if (countGroup) countGroup.style.display = 'none';
            if (conditionGroup) conditionGroup.style.display = 'block';
            if (selectorGroup) selectorGroup.style.display = 'none';
            if (variableGroup) variableGroup.style.display = 'block';
          } else if (selectedType === 'forEach') {
            if (countGroup) countGroup.style.display = 'none';
            if (conditionGroup) conditionGroup.style.display = 'none';
            if (selectorGroup) selectorGroup.style.display = 'block';
            if (variableGroup) variableGroup.style.display = 'none';
          }
        });
      }
    }, 0);
    
    modal.style.display = 'block';
    modal.classList.add('show');
    this.currentEditingAction = index;
    this.currentEditingActionType = 'loop';
    this.preventFormSubmit();
  }

  /**
   * Рендерит блок условия
   */
  renderConditionBlock(action, index, visibleStepNumber = null) {
    // Если visibleStepNumber не передан, вычисляем его
    if (visibleStepNumber === null) {
      visibleStepNumber = this.getVisibleStepNumber(index);
    }
    
    const condition = action.condition || {};
    const expression = condition.expression || '';
    const operator = condition.operator || 'exists';
    const value = condition.value || '';
    const thenActions = action.thenActions || [];
    const elseActions = action.elseActions || [];
    const isHidden = action.hidden || false;
    const isCollapsed = this.allCollapsed; // Применяем глобальное состояние сворачивания
    const classes = ['action-item', 'condition-block'];
    if (isHidden) classes.push('action-hidden');
    if (isCollapsed) classes.push('collapsed');
    const actionClassName = classes.join(' ');
    
    // Go-to опции
    const gotoThen = action.gotoThen || null;
    const gotoElse = action.gotoElse || null;
    
    // Генерируем список шагов для go-to
    const stepOptions = this.generateStepOptionsHTML(index);
    
    return `
      <div class="${actionClassName}" data-index="${index}" data-protected="condition">
        <div class="action-header">
          <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${index}" data-action="toggle-visibility" title="Click to ${isHidden ? 'show' : 'hide'} action">${visibleStepNumber}</span>
          <span class="drag-handle" title="Drag to move">☰</span>
          <span class="action-type-badge condition">${this.t('editorUI.conditionBadge')}</span>
          <div class="condition-expression">
            <strong>${this.t('editorUI.ifLabel')}</strong> ${this.escapeHtml(expression)} ${operator} ${value ? this.escapeHtml(value) : ''}
          </div>
          <div class="action-actions">
            <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${index}" title="Edit">${isCollapsed ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}</button>
            <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${index}" title="${isHidden ? 'Show' : 'Hide'}">${isCollapsed ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}</button>
            <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${index}" title="Delete">${isCollapsed ? '🗑️' : '🗑️ ' + this.t('editorUI.deleteBtn')}</button>
          </div>
        </div>
        <div class="action-content">
          <div class="condition-branch then-branch" data-branch-label="✅ Then:">
            <div class="branch-header">
              <span>✅ Then:</span>
              <button class="btn btn-small btn-success" data-action="add-action-to-branch" data-action-index="${index}" data-branch="then" title="Add action to Then branch">${this.t('editorUI.addBtn')}</button>
            </div>
            <div class="branch-actions" data-branch="then" data-parent-index="${index}" data-drop-zone="condition-then">
              ${thenActions.length > 0 ? thenActions.map((a, i) => {
                // Нумерация внутри ветки "Тогда": пересчитываем с учётом скрытых шагов
                const innerStepNumber = this.getVisibleStepNumber(i, { parentIndex: index, branch: 'then', branchIndex: i });
                return this.renderActionItem(a, `then-${index}-${i}`, innerStepNumber, { parentIndex: index, branch: 'then', branchIndex: i });
              }).join('') : '<div class="empty-branch" data-drop-zone="condition-then-empty">No actions (drag here)</div>'}
            </div>
            <div class="goto-inline" style="margin-top: 8px; font-size: 12px;">
              <label style="display: inline-flex; align-items: center; gap: 6px; color: #666;">
                🔄 После выполнения перейти к:
                <select class="goto-select" data-goto-type="then" data-condition-index="${index}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd; font-size: 12px;">
                  <option value="">${this.t('editorUI.nextStep')}</option>
                  ${stepOptions}
                </select>
              </label>
            </div>
          </div>
          <div class="condition-branch else-branch" data-branch-label="❌ Else:">
            <div class="branch-header">
              <span>❌ Else:</span>
              <button class="btn btn-small btn-success" data-action="add-action-to-branch" data-action-index="${index}" data-branch="else" title="Add action to Else branch">${this.t('editorUI.addBtn')}</button>
            </div>
            <div class="branch-actions" data-branch="else" data-parent-index="${index}" data-drop-zone="condition-else">
              ${elseActions.length > 0 ? elseActions.map((a, i) => {
                // Нумерация внутри ветки "Иначе": пересчитываем с учётом скрытых шагов
                const innerStepNumber = this.getVisibleStepNumber(i, { parentIndex: index, branch: 'else', branchIndex: i });
                return this.renderActionItem(a, `else-${index}-${i}`, innerStepNumber, { parentIndex: index, branch: 'else', branchIndex: i });
              }).join('') : '<div class="empty-branch" data-drop-zone="condition-else-empty">No actions (drag here)</div>'}
            </div>
            <div class="goto-inline" style="margin-top: 8px; font-size: 12px;">
              <label style="display: inline-flex; align-items: center; gap: 6px; color: #666;">
                🔄 После выполнения перейти к:
                <select class="goto-select" data-goto-type="else" data-condition-index="${index}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd; font-size: 12px;">
                  <option value="">${this.t('editorUI.nextStep')}</option>
                  ${stepOptions}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Рендерит блок цикла
   */
  renderLoopBlock(action, index, visibleStepNumber = null) {
    // Если visibleStepNumber не передан, вычисляем его
    if (visibleStepNumber === null) {
      visibleStepNumber = this.getVisibleStepNumber(index);
    }
    
    const loop = action.loop || {};
    const type = loop.type || 'for';
    const count = loop.count || 5;
    const condition = loop.condition || '';
    const selector = loop.selector || '';
    const variable = loop.variable || 'i';
    const actions = action.actions || [];
    const isHidden = action.hidden || false;
    const isCollapsed = this.allCollapsed; // Применяем глобальное состояние сворачивания
    const classes = ['action-item', 'loop-block'];
    if (isHidden) classes.push('action-hidden');
    if (isCollapsed) classes.push('collapsed');
    const actionClassName = classes.join(' ');
    
    let loopDescription = '';
    if (type === 'for') {
      loopDescription = `Repeat ${count} times (${variable} = 1...${count})`;
    } else if (type === 'while') {
      loopDescription = `While: ${condition}`;
    } else if (type === 'forEach') {
      loopDescription = `For each: ${selector}`;
    }
    
    return `
      <div class="${actionClassName}" data-index="${index}" data-protected="loop">
        <div class="action-header">
          <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${index}" data-action="toggle-visibility" title="Click to ${isHidden ? 'show' : 'hide'} action">${visibleStepNumber}</span>
          <span class="drag-handle" title="Drag to move">☰</span>
          <span class="action-type-badge loop">${this.t('editorUI.loopBadge')}</span>
          <div class="loop-description">
            ${this.escapeHtml(loopDescription)}
          </div>
          <div class="action-actions">
            <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${index}" title="Edit">${isCollapsed ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}</button>
            <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${index}" title="${isHidden ? 'Show' : 'Hide'}">${isCollapsed ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}</button>
            <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${index}" title="Delete">${isCollapsed ? '🗑️' : '🗑️ ' + this.t('editorUI.deleteBtn')}</button>
          </div>
        </div>
        <div class="action-content">
          <div class="loop-actions-header">
            <span>${this.t('editorUI.actionsInsideLoop')}</span>
            <button class="btn btn-small btn-success" data-action="add-action-to-loop" data-action-index="${index}" title="Add action to loop">${this.t('editorUI.addBtn')}</button>
          </div>
          <div class="loop-actions" data-parent-index="${index}" data-drop-zone="loop">
            ${actions.length > 0 ? actions.map((a, i) => {
              // Нумерация внутри цикла: пересчитываем с учётом скрытых шагов
              const innerStepNumber = this.getVisibleStepNumber(i, { parentIndex: index, branch: 'loop', branchIndex: i });
              return this.renderActionItem(a, `loop-${index}-${i}`, innerStepNumber, { parentIndex: index, branch: 'loop', branchIndex: i });
            }).join('') : '<div class="empty-branch" data-drop-zone="loop-empty">No actions (drag here)</div>'}
          </div>
          <div class="loop-variable-info" style="margin-top: 12px; padding: 8px 12px; background: rgba(33, 150, 243, 0.1); border-radius: 6px; font-size: 12px;">
            💡 <strong>${this.t('editorUI.loopVariable')}</strong> <code style="background: white; padding: 2px 6px; border-radius: 3px; font-family: monospace;">${this.escapeHtml(variable)}</code> 
            — используйте в действиях как <code style="background: white; padding: 2px 6px; border-radius: 3px; font-family: monospace;">{var:${this.escapeHtml(variable)}}</code>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Параллельное воспроизведение теста в нескольких вкладках
   */
  async playTestParallel() {
    try {
      if (!this.test) {
        alert(this.t('editorUI.testNotLoaded'));
        return;
      }

      // Проверяем наличие обязательных переменных перед запуском
      const mode = this.hasOptimizationAvailable() ? 'optimized' : 'full';
      const missingVars = this.checkRequiredVariables(mode);
      if (missingVars.length > 0) {
        const shouldContinue = await this.showMissingVariablesDialog(missingVars);
        if (!shouldContinue) {
          return;
        }
      }

      // Запрашиваем количество вкладок
      const tabCount = prompt(this.t('editorUI.enterTabCount'), '3');
      const count = parseInt(tabCount);
      
      if (isNaN(count) || count < 2 || count > 10) {
        alert(this.t('editorUI.invalidTabCount'));
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'PLAY_TEST_PARALLEL',
        testId: this.test.id,
        tabCount: count,
        mode: mode
      });

      if (response.success) {
        this.showToast(this.t('editorUI.parallelRunStarted', { count: count }), 'success');
      } else {
        alert(this.t('editorUI.parallelRunError') + ': ' + (response.error || this.t('common.unknownError')));
      }
    } catch (error) {
      console.error('Error playing test in parallel:', error);
      alert(this.t('editorUI.parallelRunError'));
    }
  }

  /**
   * Инициализация модального окна переменных
   */
  initVariablesModal() {
    const variablesBtn = document.getElementById('variablesBtn');
    const variablesModal = document.getElementById('variablesModal');
    const closeVariablesModal = document.getElementById('closeVariablesModal');
    
    if (variablesBtn) {
      variablesBtn.addEventListener('click', () => this.showVariablesModal());
    }
    
    if (closeVariablesModal) {
      closeVariablesModal.addEventListener('click', () => this.closeVariablesModal());
    }
    
    if (variablesModal) {
      variablesModal.addEventListener('click', (e) => {
        if (e.target === variablesModal) {
          this.closeVariablesModal();
        }
        
        // Обработка кнопок редактирования переменных из всех сценариев
        const editBtn = e.target.closest('[data-edit-var]');
        if (editBtn) {
          e.preventDefault();
          e.stopPropagation();
          const testId = editBtn.getAttribute('data-edit-var');
          const varName = editBtn.getAttribute('data-var-name');
          console.log('🔍 [Editor] Клик по кнопке редактирования (через модальное окно):', testId, varName);
          this.editVariableFromTest(testId, varName);
          return;
        }
        
        // Обработка кнопок удаления переменных из всех сценариев
        const deleteBtnAll = e.target.closest('[data-delete-var]');
        if (deleteBtnAll) {
          e.preventDefault();
          e.stopPropagation();
          const testId = deleteBtnAll.getAttribute('data-delete-var');
          const varName = deleteBtnAll.getAttribute('data-var-name');
          console.log('🗑️ [Editor] Клик по кнопке удаления (через модальное окно):', testId, varName);
          this.deleteVariableFromTest(testId, varName);
          return;
        }
        
        // Обработка кнопок добавления переменных
        const addBtn = e.target.closest('[data-add-variable]');
        if (addBtn) {
          e.preventDefault();
          e.stopPropagation();
          const type = addBtn.getAttribute('data-add-variable');
          console.log('➕ [Editor] Добавление переменной типа:', type);
          this.addVariable(type);
        }
        
        // Обработка кнопок удаления переменных (старый формат)
        const deleteBtn = e.target.closest('[data-delete-variable]');
        if (deleteBtn) {
          const type = deleteBtn.getAttribute('data-delete-variable');
          const index = parseInt(deleteBtn.getAttribute('data-var-index'));
          this.deleteVariable(type, index);
        }
        
        // Обработка кнопок тестирования переменных
        const testBtn = e.target.closest('[data-test-variable]');
        if (testBtn) {
          const type = testBtn.getAttribute('data-test-variable');
          const index = parseInt(testBtn.getAttribute('data-var-index'));
          this.testVariable(type, index);
        }
        
        // Обработка кнопок рекомендаций
        const applyBtn = e.target.closest('[data-apply-recommendation]');
        if (applyBtn) {
          e.preventDefault();
          e.stopPropagation();
          const index = parseInt(applyBtn.getAttribute('data-apply-recommendation'));
          console.log('➕ [Editor] Применение рекомендации:', index);
          this.applyRecommendation(index);
        }
      });
      
      // Обработка изменения полей переменных
      variablesModal.addEventListener('change', (e) => {
        const input = e.target;
        const varItem = input.closest('.variable-item');
        if (!varItem) return;
        
        const type = varItem.getAttribute('data-var-type');
        const index = parseInt(varItem.getAttribute('data-var-index'));
        
        if (input.classList.contains('variable-name')) {
          this.updateVariable(type, index, 'name', input.value);
        } else if (input.classList.contains('variable-source-type')) {
          this.updateVariable(type, index, 'sourceType', input.value);
          // Перерисовываем для обновления placeholder
          this.renderVariables();
        } else if (input.classList.contains('variable-value')) {
          this.updateVariable(type, index, 'value', input.value);
        }
      });
    }
    
    // Обработчик переключения табов
    document.querySelectorAll('.variables-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        this.switchVariablesTab(tabName);
      });
    });
    
    // Обработчик изменения go-to селектов
    document.getElementById('actionsList')?.addEventListener('change', (e) => {
      if (e.target.classList.contains('goto-select')) {
        const gotoType = e.target.getAttribute('data-goto-type');
        const conditionIndex = parseInt(e.target.getAttribute('data-condition-index'));
        const stepIndex = e.target.value ? parseInt(e.target.value) : null;
        this.updateGoto(conditionIndex, gotoType, stepIndex);
      }
    });
  }

  /**
   * Показать модальное окно переменных
   */
  async showVariablesModal() {
    const modal = document.getElementById('variablesModal');
    if (modal) {
      modal.classList.add('show');
      await this.loadAllTestsVariables();
      this.renderVariables();
      this.detectVariableRecommendations();
    }
  }

  /**
   * Закрыть модальное окно переменных
   */
  closeVariablesModal() {
    const modal = document.getElementById('variablesModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  /**
   * Переключение табов переменных
   */
  switchVariablesTab(tabName) {
    // Обновляем активный таб
    document.querySelectorAll('.variables-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });
    
    // Обновляем контент
    document.querySelectorAll('.variables-tab-content').forEach(content => {
      content.classList.toggle('active', content.getAttribute('data-tab-content') === tabName);
    });
  }

  /**
   * Загрузка переменных из теста
   */
  loadVariables() {
    if (this.test && this.test.variables) {
      this.variables = {
        scenario: this.test.variables.scenario || [],
        loop: this.test.variables.loop || [],
        condition: this.test.variables.condition || [],
        global: this.test.variables.global || []
      };
    }
    
    // Загружаем глобальные переменные из storage
    this.loadGlobalVariables();
  }

  /**
   * Загрузка глобальных переменных
   */
  async loadGlobalVariables() {
    try {
      const result = await chrome.storage.local.get(['globalVariables']);
      if (result.globalVariables) {
        this.variables.global = result.globalVariables;
      }
    } catch (error) {
      console.warn('Ошибка загрузки глобальных переменных:', error);
    }
  }

  /**
   * Сохранение переменных в тест
   */
  saveVariables() {
    if (this.test) {
      this.test.variables = {
        scenario: this.variables.scenario,
        loop: this.variables.loop,
        condition: this.variables.condition,
        global: this.variables.global
      };
    }
    
    // Сохраняем глобальные переменные в storage
    this.saveGlobalVariables();
  }

  /**
   * Сохранение глобальных переменных
   */
  async saveGlobalVariables() {
    try {
      await chrome.storage.local.set({
        globalVariables: this.variables.global
      });
    } catch (error) {
      console.warn('Ошибка сохранения глобальных переменных:', error);
    }
  }

  /**
   * Загружает переменные всех тестов
   */
  async loadAllTestsVariables() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_TESTS' });
      if (response && response.success && response.tests) {
        this.allTestsVariables = {};
        response.tests.forEach(test => {
          // Включаем все тесты, даже если у них нет переменных, чтобы видеть структуру
          // Используем строковый ключ для единообразия
          const testIdKey = String(test.id);
          this.allTestsVariables[testIdKey] = {
            name: test.name,
            variables: test.variables || {}
          };
        });
        
        // Обновляем данные текущего теста из локального состояния (они могут быть более актуальными)
        if (this.test && this.test.id) {
          const currentTestKey = String(this.test.id);
          if (this.allTestsVariables[currentTestKey]) {
            this.allTestsVariables[currentTestKey].variables = { ...(this.test.variables || {}) };
          }
        }
        
        console.log('📦 [Editor] Загружены переменные всех тестов:', Object.keys(this.allTestsVariables).length, 'тестов');
      } else {
        this.allTestsVariables = {};
      }
    } catch (error) {
      console.error('Ошибка загрузки переменных всех тестов:', error);
      this.allTestsVariables = {};
    }
  }

  /**
   * Рендеринг списков переменных
   */
  renderVariables() {
    const types = ['scenario', 'loop', 'condition', 'global'];
    
    types.forEach(type => {
      const container = document.getElementById(`${type}Variables`);
      if (!container) return;
      
      if (type === 'scenario') {
        // Для переменных сценария показываем все переменные из всех тестов
        this.renderAllScenarioVariables(container);
      } else if (type === 'global') {
        // Для глобальных переменных показываем все переменные со всех тестов, у которых global: true
        this.renderGlobalVariables(container);
      } else {
        // Для остальных типов - как раньше
        const vars = this.variables[type] || [];
        
        if (vars.length === 0) {
          container.innerHTML = '<p style="color: #999; font-style: italic;">' + this.t('editorUI.noVariablesMsg') + '</p>';
          return;
        }
        
        container.innerHTML = vars.map((v, i) => `
          <div class="variable-item" data-var-index="${i}" data-var-type="${type}">
            <input type="text" class="variable-name" value="${this.escapeHtml(v.name || '')}" placeholder="Variable name">
            <select class="variable-source-type">
              <option value="static" ${v.sourceType === 'static' ? 'selected' : ''}>${this.t('editorUI.staticOp')}</option>
              <option value="url" ${v.sourceType === 'url' ? 'selected' : ''}>${this.t('editorUI.fromUrlOp')}</option>
              <option value="input" ${v.sourceType === 'input' ? 'selected' : ''}>${this.t('editorUI.fromInputOp')}</option>
              <option value="element" ${v.sourceType === 'element' ? 'selected' : ''}>${this.t('editorUI.fromElementOp')}</option>
              <option value="api" ${v.sourceType === 'api' ? 'selected' : ''}>${this.t('editorUI.fromApiOp')}</option>
            </select>
            <input type="text" class="variable-value" value="${this.escapeHtml(v.value || '')}" placeholder="${this.getVariablePlaceholder(v.sourceType)}">
            <button class="btn btn-tiny btn-info" data-test-variable="${type}" data-var-index="${i}" title="Check value">🔍</button>
            <button class="delete-variable" data-delete-variable="${type}" data-var-index="${i}">🗑️</button>
          </div>
        `).join('');
      }
    });
  }

  updateScenarioVariablesPanel() {
    if (!this.test || !this.test.id) return;
    if (!this.allTestsVariables) {
      this.allTestsVariables = {};
    }
    const currentTestKey = String(this.test.id);
    this.allTestsVariables[currentTestKey] = {
      name: this.test.name || this.t('editorUI.untitled'),
      variables: this.test.variables || {}
    };
    const scenarioContainer = document.getElementById('scenarioVariables');
    if (scenarioContainer) {
      this.renderAllScenarioVariables(scenarioContainer);
    }
  }

  /**
   * Рендерит переменные всех сценариев
   */
  renderAllScenarioVariables(container) {
    if (!this.allTestsVariables || Object.keys(this.allTestsVariables).length === 0) {
      container.innerHTML = '<p style="color: #999; font-style: italic;">' + this.t('editorUI.noVariablesInScenarios') + '</p>';
      return;
    }

    let html = '';
    const currentTestId = this.test?.id;

    // Сначала показываем переменные текущего сценария
    // Ищем тест по ID (сравниваем строковые представления)
    const currentTestKey = Object.keys(this.allTestsVariables || {}).find(
      key => String(key) === String(currentTestId)
    );
    
    if (currentTestKey && this.allTestsVariables[currentTestKey]) {
      const currentTest = this.allTestsVariables[currentTestKey];
      const currentVars = currentTest.variables || {};
      const varEntries = Object.entries(currentVars);
      const usedVars = this.getUsedVariablesFromActions(this.test?.actions || []);
      
      if (varEntries.length > 0) {
        html += `<div class="test-variables-group" style="margin-bottom: 24px; padding: 12px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">
          <h5 style="margin: 0 0 12px 0; color: #1976D2; font-weight: 600;">📄 ${this.escapeHtml(currentTest.name)} <span style="color: #666; font-size: 12px; font-weight: normal;">${this.t('editorUI.currentScenario')}</span></h5>`;
        
        varEntries.forEach(([varName, varData]) => {
          const value = varData.value || '';
          const isSensitive = varData.sensitive || false;
          const isGlobal = varData.global || false;
          const displayValue = isSensitive ? '••••••••' : (value.length > 40 ? value.substring(0, 40) + '...' : value);
          const source = varData.source || 'static';
          const sourceLabel = this.getSourceLabel(source);
          const globalBadge = isGlobal ? '<span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 4px;">🌐 Global</span>' : '';
          const isUnused = !usedVars.has(varName);
          const unusedBadge = isUnused ? '<span style="background: #ff9800; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 4px;">' + this.t('editorUI.unusedBadge') + '</span>' : '';
          
          html += `
            <div class="variable-item" data-test-id="${currentTestKey}" data-var-name="${this.escapeHtml(varName)}" style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; color: #2196F3; min-width: 120px;">${this.escapeHtml(varName)}${globalBadge}${unusedBadge}</span>
              <span style="flex: 1; color: #666; font-size: 12px;">${sourceLabel}</span>
              <span style="flex: 2; color: #333; font-family: monospace; font-size: 12px; word-break: break-all;" title="${isSensitive ? this.t('editorUI.sensitiveData') : this.escapeHtml(value)}">${this.escapeHtml(displayValue)}</span>
              <button class="btn btn-tiny" data-edit-var="${currentTestKey}" data-var-name="${this.escapeHtml(varName)}" title="Edit">✏️</button>
              <button class="btn btn-tiny btn-danger" data-delete-var="${currentTestKey}" data-var-name="${this.escapeHtml(varName)}" title="Delete">🗑️</button>
            </div>
          `;
        });
        
        html += `</div>`;
      }
    }

    // Затем показываем переменные других сценариев
    Object.entries(this.allTestsVariables).forEach(([testId, testData]) => {
      if (String(testId) === String(currentTestId)) return; // Уже показали выше
      
      const vars = testData.variables || {};
      const varEntries = Object.entries(vars);
      
      if (varEntries.length > 0) {
        html += `<div class="test-variables-group" style="margin-bottom: 24px; padding: 12px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #999;">
          <h5 style="margin: 0 0 12px 0; color: #666; font-weight: 600;">📄 ${this.escapeHtml(testData.name)}</h5>`;
        
        varEntries.forEach(([varName, varData]) => {
          const value = varData.value || '';
          const isSensitive = varData.sensitive || false;
          const isGlobal = varData.global || false;
          const displayValue = isSensitive ? '••••••••' : (value.length > 40 ? value.substring(0, 40) + '...' : value);
          const source = varData.source || 'static';
          const sourceLabel = this.getSourceLabel(source);
          const globalBadge = isGlobal ? '<span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 4px;">🌐 Global</span>' : '';
          
          html += `
            <div class="variable-item" data-test-id="${testId}" data-var-name="${this.escapeHtml(varName)}" style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; color: #666; min-width: 120px;">${this.escapeHtml(varName)}${globalBadge}</span>
              <span style="flex: 1; color: #666; font-size: 12px;">${sourceLabel}</span>
              <span style="flex: 2; color: #333; font-family: monospace; font-size: 12px; word-break: break-all;" title="${isSensitive ? this.t('editorUI.sensitiveData') : this.escapeHtml(value)}">${this.escapeHtml(displayValue)}</span>
              <button class="btn btn-tiny" data-edit-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="Edit">✏️</button>
              <button class="btn btn-tiny btn-danger" data-delete-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="Delete">🗑️</button>
            </div>
          `;
        });
        
        html += `</div>`;
      }
    });

    if (!html) {
      html = '<p style="color: #999; font-style: italic;">' + this.t('editorUI.noVarsInScenarios') + '</p>';
    }

    container.innerHTML = html;

    // Добавляем обработчики для кнопок редактирования and удаления
    container.querySelectorAll('[data-edit-var]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const testId = btn.getAttribute('data-edit-var');
        const varName = btn.getAttribute('data-var-name');
        console.log('🔍 [Editor] Клик по кнопке редактирования:', testId, varName);
        this.editVariableFromTest(testId, varName);
      });
    });

    container.querySelectorAll('[data-delete-var]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const testId = btn.getAttribute('data-delete-var');
        const varName = btn.getAttribute('data-var-name');
        console.log('🗑️ [Editor] Клик по кнопке удаления:', testId, varName);
        this.deleteVariableFromTest(testId, varName);
      });
    });
  }

  /**
   * Рендерит глобальные переменные из всех тестов
   */
  renderGlobalVariables(container) {
    if (!this.allTestsVariables || Object.keys(this.allTestsVariables).length === 0) {
      container.innerHTML = '<p style="color: #999; font-style: italic;">' + this.t('editorUI.noGlobalVariablesMsg') + '</p>';
      return;
    }

    // Собираем все глобальные переменные из всех тестов
    const globalVarsMap = new Map(); // Используем Map для уникальности по имени
    
    Object.entries(this.allTestsVariables).forEach(([testId, testData]) => {
      const vars = testData.variables || {};
      Object.entries(vars).forEach(([varName, varData]) => {
        if (varData.global) {
          // Если переменная уже есть, берем из текущего теста (приоритет)
          if (!globalVarsMap.has(varName) || String(testId) === String(this.test?.id)) {
            globalVarsMap.set(varName, {
              name: varName,
              data: varData,
              testId: testId,
              testName: testData.name
            });
          }
        }
      });
    });

    if (globalVarsMap.size === 0) {
      container.innerHTML = '<p style="color: #999; font-style: italic;">' + this.t('editorUI.noGlobalVariablesMsg') + '</p>';
      return;
    }

    let html = '';
    const currentTestId = this.test?.id ? String(this.test.id) : null;

    // Группируем по тестам для удобства отображения
    const varsByTest = {};
    globalVarsMap.forEach((varInfo, varName) => {
      const testKey = String(varInfo.testId);
      if (!varsByTest[testKey]) {
        varsByTest[testKey] = {
          testName: varInfo.testName,
          vars: []
        };
      }
      varsByTest[testKey].vars.push(varInfo);
    });

    // Сначала показываем глобальные переменные текущего теста
    if (currentTestId && varsByTest[currentTestId]) {
      const currentTest = varsByTest[currentTestId];
      html += `<div class="test-variables-group" style="margin-bottom: 24px; padding: 12px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #4CAF50;">
        <h5 style="margin: 0 0 12px 0; color: #2E7D32; font-weight: 600;">🌐 ${this.escapeHtml(currentTest.testName)} <span style="color: #666; font-size: 12px; font-weight: normal;">${this.t('editorUI.currentScenario')}</span></h5>`;
      
      currentTest.vars.forEach(varInfo => {
        const varName = varInfo.name;
        const varData = varInfo.data;
        const value = varData.value || '';
        const isSensitive = varData.sensitive || false;
        const displayValue = isSensitive ? '••••••••' : (value.length > 40 ? value.substring(0, 40) + '...' : value);
        const source = varData.source || 'static';
        const sourceLabel = this.getSourceLabel(source);
        
        html += `
          <div class="variable-item" data-test-id="${currentTestId}" data-var-name="${this.escapeHtml(varName)}" style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; color: #4CAF50; min-width: 120px;">${this.escapeHtml(varName)}</span>
            <span style="flex: 1; color: #666; font-size: 12px;">${sourceLabel}</span>
            <span style="flex: 2; color: #333; font-family: monospace; font-size: 12px; word-break: break-all;" title="${isSensitive ? this.t('editorUI.sensitiveData') : this.escapeHtml(value)}">${this.escapeHtml(displayValue)}</span>
            <button class="btn btn-tiny" data-edit-var="${currentTestId}" data-var-name="${this.escapeHtml(varName)}" title="Edit">✏️</button>
            <button class="btn btn-tiny btn-danger" data-delete-var="${currentTestId}" data-var-name="${this.escapeHtml(varName)}" title="Delete">🗑️</button>
          </div>
        `;
      });
      
      html += `</div>`;
    }

    // Затем показываем глобальные переменные других тестов
    Object.entries(varsByTest).forEach(([testId, testInfo]) => {
      if (String(testId) === String(currentTestId)) return; // Уже показали выше
      
      html += `<div class="test-variables-group" style="margin-bottom: 24px; padding: 12px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #999;">
        <h5 style="margin: 0 0 12px 0; color: #666; font-weight: 600;">🌐 ${this.escapeHtml(testInfo.testName)}</h5>`;
      
      testInfo.vars.forEach(varInfo => {
        const varName = varInfo.name;
        const varData = varInfo.data;
        const value = varData.value || '';
        const isSensitive = varData.sensitive || false;
        const displayValue = isSensitive ? '••••••••' : (value.length > 40 ? value.substring(0, 40) + '...' : value);
        const source = varData.source || 'static';
        const sourceLabel = this.getSourceLabel(source);
        
        html += `
          <div class="variable-item" data-test-id="${testId}" data-var-name="${this.escapeHtml(varName)}" style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; color: #666; min-width: 120px;">${this.escapeHtml(varName)}</span>
            <span style="flex: 1; color: #666; font-size: 12px;">${sourceLabel}</span>
            <span style="flex: 2; color: #333; font-family: monospace; font-size: 12px; word-break: break-all;" title="${isSensitive ? this.t('editorUI.sensitiveData') : this.escapeHtml(value)}">${this.escapeHtml(displayValue)}</span>
            <button class="btn btn-tiny" data-edit-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="Edit">✏️</button>
            <button class="btn btn-tiny btn-danger" data-delete-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="Delete">🗑️</button>
          </div>
        `;
      });
      
      html += `</div>`;
    });

    container.innerHTML = html;

    // Добавляем обработчики для кнопок редактирования and удаления
    container.querySelectorAll('[data-edit-var]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const testId = btn.getAttribute('data-edit-var');
        const varName = btn.getAttribute('data-var-name');
        console.log('🔍 [Editor] Клик по кнопке редактирования (глобальная):', testId, varName);
        this.editVariableFromTest(testId, varName);
      });
    });

    container.querySelectorAll('[data-delete-var]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const testId = btn.getAttribute('data-delete-var');
        const varName = btn.getAttribute('data-var-name');
        console.log('🗑️ [Editor] Клик по кнопке удаления (глобальная):', testId, varName);
        this.deleteVariableFromTest(testId, varName);
      });
    });
  }

  /**
   * Получает метку для источника переменной
   */
  getSourceLabel(source) {
    const labels = {
      'static': this.t('editorUI.staticValue'),
      'url': this.t('editorUI.fromUrlValue'),
      'localStorage': this.t('editorUI.fromLocalStorageValue'),
      'storage': this.t('editorUI.fromStorageValue'),
      'api': this.t('editorUI.fromApiValue'),
      'element': this.t('editorUI.fromElementValue')
    };
    return labels[source] || this.t('editorUI.staticValue');
  }

  /**
   * Редактирует переменную из конкретного теста
   */
  async editVariableFromTest(testId, varName) {
    // Нормализуем testId к строке
    testId = String(testId);
    console.log('🔍 [Editor] Редактирование переменной:', testId, varName);
    
    // Ищем тест по нормализованному ключу
    const testKey = Object.keys(this.allTestsVariables || {}).find(key => String(key) === testId);
    if (!testKey || !this.allTestsVariables[testKey]) {
      console.error('❌ [Editor] Тест не найден:', testId, 'Доступные ключи:', Object.keys(this.allTestsVariables || {}));
      this.showToast(this.t('editorUI.testNotFound'), 'error');
      return;
    }

    const testData = this.allTestsVariables[testKey];
    const varData = testData.variables[varName];
    
    if (!varData) {
      console.error('❌ [Editor] Переменная не найдена:', varName, 'Доступные переменные:', Object.keys(testData.variables || {}));
      this.showToast(this.t('editorUI.variableNotFound'), 'error');
      return;
    }

    // Если это текущий тест, используем стандартное редактирование
    if (String(testId) === String(this.test?.id)) {
      this.editVariable(varName);
      return;
    }

    // Для других тестов показываем модальное окно редактирования
    const modal = document.getElementById('variableModal');
    if (!modal) return;

    document.getElementById('variableModalTitle').textContent = this.t('editorUI.editVariableFromScenario', { name: varName, scenario: testData.name });
    document.getElementById('newVarName').value = varName;
    document.getElementById('newVarName').disabled = true; // Нельзя менять имя при редактировании другого теста
    document.getElementById('newVarValue').value = varData.value || '';
    document.getElementById('newVarGlobal').checked = varData.global || false;
    document.getElementById('newVarSensitive').checked = varData.sensitive || false;

    modal.style.display = 'block';
    modal.classList.add('show');
    modal.dataset.editingTestId = testKey; // Используем нормализованный ключ
    modal.dataset.editingVar = varName;
  }

  /**
   * Удаляет переменную из конкретного теста
   */
  async deleteVariableFromTest(testId, varName) {
    // Нормализуем testId к строке
    testId = String(testId);
    console.log('🗑️ [Editor] Начало удаления переменной:', testId, varName);
    
    if (!confirm(this.t('editorUI.deleteVariableConfirm', { name: varName }))) {
      return;
    }

    try {
      // Загружаем тест (используем оригинальный testId, так как background может ожидать число)
      const originalTestId = this.test?.id && String(this.test.id) === testId ? this.test.id : testId;
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TEST',
        testId: originalTestId
      });

      if (!response || !response.success || !response.test) {
        console.error('❌ [Editor] Не удалось загрузить тест:', response);
        this.showToast(this.t('editorUI.couldNotLoadTest'), 'error');
        return;
      }

      const test = response.test;
      console.log('📦 [Editor] Тест загружен, переменные до удаления:', Object.keys(test.variables || {}));
      
      if (test.variables && test.variables[varName]) {
        delete test.variables[varName];
        console.log('🗑️ [Editor] Переменная удалена из объекта теста, переменные после удаления:', Object.keys(test.variables || {}));
        
        // Сохраняем тест
        const saveResponse = await chrome.runtime.sendMessage({
          type: 'UPDATE_TEST',
          test: test
        });
        
        console.log('💾 [Editor] Тест сохранен, ответ:', saveResponse);

        // Если это текущий тест, обновляем его локально
        // Сравниваем как строки, так как testId может быть строкой или числом
        const isCurrentTest = String(testId) === String(this.test?.id);
        if (isCurrentTest) {
          this.test.variables = test.variables;
          console.log('🔄 [Editor] Обновлен текущий тест локально, переменные:', Object.keys(this.test.variables || {}));
        }

        // Перезагружаем переменные всех тестов для актуальности
        await this.loadAllTestsVariables();
        
        // Обновляем кэш для удаленного теста, синхронизируя с сохраненным тестом
        const testKey = Object.keys(this.allTestsVariables || {}).find(key => String(key) === testId);
        if (testKey && this.allTestsVariables[testKey]) {
          // Синхронизируем с актуальными данными из сохраненного теста
          this.allTestsVariables[testKey].variables = { ...(test.variables || {}) };
          console.log('🔄 [Editor] Кэш синхронизирован с сохраненным тестом, переменные:', Object.keys(this.allTestsVariables[testKey].variables || {}));
        }
        
        // Ищем нормализованный ключ для testId
        const normalizedTestId = Object.keys(this.allTestsVariables || {}).find(key => String(key) === testId);
        console.log('📦 [Editor] После перезагрузки, переменные теста:', testId, 'нормализованный ключ:', normalizedTestId, 'переменные:', Object.keys(this.allTestsVariables[normalizedTestId]?.variables || {}));
        
        // Обновляем панель переменных в основном интерфейсе (если это текущий тест)
        if (isCurrentTest) {
          this.renderVariablesPanel();
          console.log('🔄 [Editor] Обновлена панель переменных в основном интерфейсе');
        }
        
        // Перерисовываем модальное окно переменных
        const variablesModal = document.getElementById('variablesModal');
        if (variablesModal && variablesModal.classList.contains('show')) {
          const scenarioContainer = document.getElementById('scenarioVariables');
          if (scenarioContainer) {
            console.log('🔄 [Editor] Перерисовываю контейнер scenarioVariables');
            this.renderAllScenarioVariables(scenarioContainer);
            console.log('✅ [Editor] Контейнер перерисован');
          }
          const globalContainer = document.getElementById('globalVariables');
          if (globalContainer) {
            console.log('🔄 [Editor] Перерисовываю контейнер globalVariables');
            this.renderGlobalVariables(globalContainer);
            console.log('✅ [Editor] Контейнер глобальных переменных перерисован');
          }
        } else {
          console.warn('⚠️ [Editor] Модальное окно переменных не открыто, использую renderVariables()');
          this.renderVariables();
        }
        
        this.showToast(this.t('editorUI.variableDeleted', { name: varName }), 'success');
      } else {
        console.warn('⚠️ [Editor] Переменная не найдена в тесте:', varName, 'Доступные переменные:', Object.keys(test.variables || {}));
        this.showToast(this.t('editorUI.variableNotFound'), 'error');
      }
    } catch (error) {
      console.error('❌ [Editor] Ошибка при удалении переменной:', error);
      this.showToast(this.t('editorUI.errorDeletingVariable') + ': ' + error.message, 'error');
    }
  }

  /**
   * Получить placeholder для типа источника
   */
  getVariablePlaceholder(sourceType) {
    const placeholders = {
      static: 'Value',
      url: 'Regex or URL param (e.g.: /id/(\\d+)/)',
      input: 'Input field selector',
      element: 'Element selector',
      api: 'API URL or expression'
    };
    return placeholders[sourceType] || 'Value';
  }

  /**
   * Добавить переменную
   */
  addVariable(type) {
    // Если это переменная сценария, добавляем в текущий тест
    if (type === 'scenario') {
      if (!this.test) {
        this.showToast(this.t('editorUI.noOpenTest'), 'error');
        return;
      }
      
      if (!this.test.variables) {
        this.test.variables = {};
      }
      
      // Генерируем уникальное имя переменной
      let varName = 'var1';
      let counter = 1;
      while (this.test.variables[varName]) {
        counter++;
        varName = `var${counter}`;
      }
      
      // Добавляем переменную
      this.test.variables[varName] = {
        value: '',
        source: 'static',
        sensitive: false
      };
      
      // Сохраняем тест
      this.saveTest();
      
      // Обновляем кэш allTestsVariables сразу (без перезагрузки)
      const testKey = Object.keys(this.allTestsVariables || {}).find(
        key => String(key) === String(this.test.id)
      );
      if (testKey && this.allTestsVariables[testKey]) {
        if (!this.allTestsVariables[testKey].variables) {
          this.allTestsVariables[testKey].variables = {};
        }
        this.allTestsVariables[testKey].variables[varName] = this.test.variables[varName];
      }
      
      // Обновляем отображение
      this.renderVariables();
      this.renderVariablesPanel();
      
      this.showToast(this.t('editorUI.variableAdded', { name: varName }), 'success');
    } else {
      // Для других типов используем старую систему
      if (!this.variables[type]) {
        this.variables[type] = [];
      }
      
      this.variables[type].push({
        name: `var${this.variables[type].length + 1}`,
        sourceType: 'static',
        value: ''
      });
      
      this.renderVariables();
      this.saveVariables();
    }
  }

  /**
   * Обновить переменную
   */
  updateVariable(type, index, field, value) {
    if (this.variables[type] && this.variables[type][index]) {
      this.variables[type][index][field] = value;
      this.saveVariables();
    }
  }

  /**
   * Удалить переменную
   */
  deleteVariable(type, index) {
    if (this.variables[type]) {
      this.variables[type].splice(index, 1);
      this.renderVariables();
      this.saveVariables();
    }
  }

  /**
   * Проверить значение переменной
   */
  async testVariable(type, index) {
    const variable = this.variables[type]?.[index];
    if (!variable) return;
    
    let value = 'Could not get value';
    
    try {
      switch (variable.sourceType) {
        case 'static':
          value = variable.value;
          break;
        case 'url':
          const currentUrl = window.location.href;
          const regex = new RegExp(variable.value);
          const match = currentUrl.match(regex);
          value = match ? (match[1] || match[0]) : 'No match';
          break;
        case 'input':
        case 'element':
          // Отправляем сообщение в content script
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]) {
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
              type: 'GET_ELEMENT_VALUE',
              selector: variable.value,
              sourceType: variable.sourceType
            });
            value = response?.value || 'Element not found';
          }
          break;
        default:
          value = variable.value;
      }
    } catch (e) {
      value = this.t('editorUI.errorValue', { error: e.message });
    }
    
    this.showToast(this.t('editorUI.variableValueDisplay', { name: variable.name, value: value }), 'info');
  }

  /**
   * Обнаружение рекомендаций для переменных
   */
  detectVariableRecommendations() {
    const recommendations = [];
    
    // Анализируем URL на наличие параметров
    if (this.test && this.test.actions) {
      const urls = [...new Set(this.test.actions.map(a => a.url).filter(Boolean))];
      
      urls.forEach(url => {
        try {
          const urlObj = new URL(url);
          // Проверяем параметры запроса
          urlObj.searchParams.forEach((value, key) => {
            if (value && !recommendations.find(r => r.name === key)) {
              recommendations.push({
                name: key,
                sourceType: 'url',
                value: `[?&]${key}=([^&]+)`,
                source: `URL param: ${key}`
              });
            }
          });
          
          // Проверяем path на числовые ID
          const pathMatch = url.match(/\/(\d{3,})/);
          if (pathMatch) {
            recommendations.push({
              name: 'id',
              sourceType: 'url',
              value: `/(\\d{3,})`,
              source: 'ID in URL path'
            });
          }
        } catch (e) {
          // Игнорируем ошибки парсинга URL
        }
      });
      
      // Анализируем введённые значения
      this.test.actions.forEach(action => {
        if (action.type === 'input' && action.value) {
          // Проверяем, похоже ли значение на переменную
          if (/^\d+$/.test(action.value) || action.value.length > 20) {
            recommendations.push({
              name: 'inputValue',
              sourceType: 'static',
              value: action.value,
              source: `Input: ${action.value.substring(0, 30)}...`
            });
          }
        }
      });
    }
    
    // Отображаем рекомендации
    const container = document.getElementById('variableRecommendations');
    const list = document.getElementById('recommendationsList');
    
    if (container && list) {
      if (recommendations.length > 0) {
        container.style.display = 'block';
        list.innerHTML = recommendations.slice(0, 5).map((r, i) => `
          <div class="recommendation-item">
            <span><strong>${this.escapeHtml(r.name)}</strong> — ${this.escapeHtml(r.source)}</span>
            <button class="apply-recommendation" data-apply-recommendation="${i}">${this.t('editorUI.applyBtn')}</button>
          </div>
        `).join('');
        
        // Сохраняем рекомендации для применения
        this._recommendations = recommendations;
      } else {
        container.style.display = 'none';
      }
    }
  }

  /**
   * Применить рекомендацию
   */
  async applyRecommendation(index) {
    const rec = this._recommendations?.[index];
    if (!rec) return;
    
    if (!this.test) {
      this.showToast(this.t('editorUI.noOpenTest'), 'error');
      return;
    }
    
    if (!this.test.variables) {
      this.test.variables = {};
    }
    
    // Проверяем, не существует ли уже переменная с таким именем
    let varName = rec.name;
    let counter = 1;
    while (this.test.variables[varName]) {
      varName = `${rec.name}${counter}`;
      counter++;
    }
    
    // Добавляем переменную в тест
    this.test.variables[varName] = {
      value: rec.value || '',
      source: rec.sourceType === 'url' ? 'url' : 'static',
      sensitive: false
    };
    
    // Сохраняем тест
    this.saveTest();
    
    // Обновляем отображение
    this.renderVariables();
    this.renderVariablesPanel();
    
    // Перезагружаем переменные всех тестов
    await this.loadAllTestsVariables();
    this.renderVariables();
    
    // Убираем использованную рекомендацию
    this._recommendations.splice(index, 1);
    this.detectVariableRecommendations();
    
    this.showToast(this.t('editorUI.variableAddedFromRecommendation', { name: varName }), 'success');
  }

  /**
   * Генерация HTML опций для go-to
   */
  generateStepOptionsHTML(currentIndex) {
    if (!this.test || !this.test.actions) return '';
    
    return this.test.actions.map((action, i) => {
      if (i === currentIndex) return ''; // Не показываем текущий шаг
      
      let label = `Step ${i + 1}`;
      if (action.type === 'loop') {
        label += ` (🔁 Loop)`;
      } else if (action.type === 'condition') {
        label += ` (🔀 Condition)`;
      } else if (action.type === 'click') {
        label += ` (👆 Click)`;
      } else if (action.type === 'input') {
        label += ` (⌨️ Input)`;
      }
      
      return `<option value="${i}">${label}</option>`;
    }).join('');
  }

  /**
   * Обновление go-to для условия
   */
  updateGoto(conditionIndex, gotoType, stepIndex) {
    if (!this.test || !this.test.actions[conditionIndex]) return;
    
    const action = this.test.actions[conditionIndex];
    if (action.type !== 'condition') return;
    
    if (gotoType === 'then') {
      action.gotoThen = stepIndex;
    } else if (gotoType === 'else') {
      action.gotoElse = stepIndex;
    }
    
    console.log(`📍 [Editor] Обновлен go-to для условия ${conditionIndex}: ${gotoType} -> шаг ${stepIndex}`);
  }

  /**
   * Показать предупреждение о защите от удаления
   */
  showDragDeleteWarning(message) {
    // Удаляем существующее предупреждение
    const existing = document.querySelector('.drag-delete-warning');
    if (existing) existing.remove();
    
    const warning = document.createElement('div');
    warning.className = 'drag-delete-warning';
    warning.textContent = `⚠️ ${message}`;
    document.body.appendChild(warning);
    
    // Убираем через 3 секунды
    if (this.dragDeleteWarningTimeout) {
      clearTimeout(this.dragDeleteWarningTimeout);
    }
    
    this.dragDeleteWarningTimeout = setTimeout(() => {
      warning.remove();
    }, 3000);
  }

  /**
   * Подтверждение удаления цикла/условия
   */
  confirmDelete(index, type) {
    const action = this.test.actions[index];
    if (!action) return;
    
    // Проверяем, есть ли действия внутри
    let hasInnerActions = false;
    if (action.type === 'loop' && action.actions?.length > 0) {
      hasInnerActions = true;
    } else if (action.type === 'condition' && (action.thenActions?.length > 0 || action.elseActions?.length > 0)) {
      hasInnerActions = true;
    }
    
    if (!hasInnerActions) {
      // Если нет действий внутри, удаляем без подтверждения
      this.deleteAction(index);
      return;
    }
    
    // Показываем модальное окно подтверждения
    const modal = document.createElement('div');
    modal.className = 'confirm-delete-modal';
    modal.innerHTML = `
      <div class="confirm-delete-content">
        <h4>${this.t('editorUI.confirmDeletion')}</h4>
        <p>This ${type === 'loop' ? 'loop' : 'condition'} contains nested actions. Delete them too?</p>
        <div class="confirm-delete-buttons">
          <button class="confirm-delete-yes">${this.t('editorUI.deleteAll')}</button>
          <button class="confirm-delete-no">${this.t('editorUI.cancelBtn')}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.confirm-delete-yes').addEventListener('click', () => {
      modal.remove();
      this.deleteAction(index);
    });
    
    modal.querySelector('.confirm-delete-no').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // ==================== БЫСТРЫЕ ШАГИ ====================

  initQuickActions() {
    // Функция для обновления стрелки в кнопке
    const updateDropdownArrow = (button, isOpen) => {
      if (!button) return;
      const currentText = button.textContent.trim();
      if (isOpen) {
        button.textContent = currentText.replace('▼', '▲');
      } else {
        button.textContent = currentText.replace('▲', '▼');
      }
    };

    // Инициализация меню основных действий
    const mainActionDropdown = document.getElementById('addMainAction');
    const mainActionMenu = document.getElementById('mainActionsMenu');

    if (mainActionDropdown) {
      mainActionDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = mainActionMenu?.classList.contains('show');
        mainActionMenu?.classList.toggle('show');
        updateDropdownArrow(mainActionDropdown, !isOpen);
      });
    }

    if (mainActionMenu) {
      mainActionMenu.addEventListener('click', (e) => {
        const actionLink = e.target.closest('a[data-action]');
        if (actionLink) {
          e.preventDefault();
          const action = actionLink.getAttribute('data-action');
          mainActionMenu.classList.remove('show');
          updateDropdownArrow(mainActionDropdown, false);
          
          switch (action) {
            case 'add-action':
              this.showAddActionModal();
              break;
            case 'add-condition':
              this.showAddConditionModal();
              break;
            case 'add-loop':
              this.showAddLoopModal();
              break;
          }
        }
      });
    }

    // ===== НОВАЯ ИНИЦИАЛИЗАЦИЯ КОМПАКТНОГО МЕНЮ QUICK STEPS =====
    const dropdown = document.getElementById('addQuickAction');
    const menu = document.getElementById('quickActionsMenu');
    const searchInput = document.getElementById('quickStepsSearch');
    
    // Открытие/закрытие меню
    if (dropdown) {
      dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        menu?.classList.toggle('show');
        updateDropdownArrow(dropdown, menu?.classList.contains('show'));
      });
    }
    
    // Раскрытие/сворачивание групп
    const groupHeaders = document.querySelectorAll('.quick-group-header');
    groupHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const group = header.closest('.quick-group');
        // Не раскрываем заблокированные группы
        if (group?.classList.contains('disabled')) {
          return;
        }
        group?.classList.toggle('expanded');
      });
    });
    
    // Обработка кликов на операции
    const operations = document.querySelectorAll('.quick-operation');
    operations.forEach(op => {
      op.addEventListener('click', (e) => {
        e.preventDefault();
        // Игнорируем клики на заблокированных операциях
        if (op.classList.contains('disabled')) {
          return;
        }
        const template = op.getAttribute('data-template');
        if (template) {
          if (!this.isQuickTemplateSupported(template)) {
            alert('Этот быстрый шаг пока не поддерживается при воспроизведении. Выберите другой шаг.');
            return;
          }
          this.addQuickStep(template);
          menu?.classList.remove('show');
          updateDropdownArrow(dropdown, false);
        }
      });
    });
    
    // Поиск по операциям
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const groups = document.querySelectorAll('.quick-group');
        
        groups.forEach(group => {
          const operations = group.querySelectorAll('.quick-operation');
          let hasVisible = false;
          
          operations.forEach(op => {
            const text = op.textContent.toLowerCase();
            const matches = text.includes(query);
            op.style.display = matches ? 'flex' : 'none';
            if (matches) hasVisible = true;
          });
          
          // Показываем/скрываем группу
          group.style.display = hasVisible || query === '' ? 'block' : 'none';
          
          // Автораскрываем группы при поиске
          if (query && hasVisible) {
            group.classList.add('expanded');
          } else if (!query) {
            group.classList.remove('expanded');
          }
        });
      });
    }

    // Закрытие dropdown при клике вне
    document.addEventListener('click', (e) => {
      if (!mainActionDropdown?.contains(e.target) && !mainActionMenu?.contains(e.target)) {
        if (mainActionMenu?.classList.contains('show')) {
          mainActionMenu.classList.remove('show');
          updateDropdownArrow(mainActionDropdown, false);
        }
      }
      if (!dropdown?.contains(e.target) && !menu?.contains(e.target)) {
        if (menu?.classList.contains('show')) {
          menu.classList.remove('show');
          updateDropdownArrow(dropdown, false);
        }
      }
    });
  }

  isQuickTemplateSupported(template) {
    return !this.runtimeUnsupportedQuickTemplates.has(template);
  }

  addQuickStep(template) {
    switch (template) {
      case 'telegram':
        this.showTelegramModal();
        break;
      case 'webhook':
        this.addWebhookStep();
        break;
      case 'rest-get':
        this.addRestGetStep();
        break;
      case 'rest-post':
        this.addRestPostStep();
        break;
      case 'var-from-url':
        this.showUrlExtractModal();
        break;
      case 'var-from-element':
        this.showPageGrabberModal();
        break;
      case 'var-from-localstorage':
        this.showLocalStorageVariablesModal();
        break;
      case 'var-set':
        this.showAddVariableModal();
        break;
      
      // Dropdown Operations
      case 'dropdown-select':
        this.addGenericStep('click', 'Select dropdown option', 'dropdown-select');
        break;
      case 'dropdown-multiselect':
        this.addGenericStep('click', 'Select multiple options', 'dropdown-multiselect');
        break;
      case 'dropdown-deselect':
        this.addGenericStep('click', 'Deselect option', 'dropdown-deselect');
        break;
      case 'dropdown-select-all':
        this.addGenericStep('click', 'Select all options', 'dropdown-select-all');
        break;
      case 'dropdown-clear-all':
        this.addGenericStep('click', 'Clear all selections', 'dropdown-clear-all');
        break;
      case 'dropdown-toggle-all':
        this.addGenericStep('click', 'Toggle all selections', 'dropdown-toggle-all');
        break;
      case 'dropdown-datalist':
        this.addGenericStep('input', 'Select from HTML5 datalist', 'dropdown-datalist');
        break;
      case 'dropdown-combobox':
        this.addGenericStep('input', 'Select with search/filter', 'dropdown-combobox');
        break;
      case 'dropdown-copy':
        this.addGenericStep('click', 'Copy multiselect values', 'dropdown-copy');
        break;
      case 'dropdown-paste':
        this.addGenericStep('click', 'Paste multiselect values', 'dropdown-paste');
        break;
      case 'dropdown-reorder':
        this.addGenericStep('click', 'Reorder multiselect items', 'dropdown-reorder');
        break;
        
      // Keyboard Navigation
      case 'keyboard-navigate':
        this.addGenericStep('keypress', 'Navigate with arrow keys', 'keyboard-navigate');
        break;
      case 'keyboard-typeahead':
        this.addGenericStep('input', 'Type-ahead search', 'keyboard-typeahead');
        break;
      case 'keyboard-escape':
        this.addGenericStep('keypress', 'Close with Escape', 'keyboard-escape');
        break;
        
      // Waits
      case 'wait-option':
        this.addGenericStep('wait', 'Wait for dropdown option to appear', 'wait-option');
        break;
      case 'wait-options-count':
        this.addGenericStep('wait', 'Wait for specific options count', 'wait-options-count');
        break;
      case 'wait-enabled':
        this.addGenericStep('wait', 'Wait for element to be enabled', 'wait-enabled');
        break;
      case 'wait-value':
        this.addGenericStep('wait', 'Wait for specific value', 'wait-value');
        break;
      case 'wait-until':
        this.addGenericStep('wait', 'Wait until condition is met', 'wait-until');
        break;
        
      // Assertions
      case 'assert-value':
        this.addGenericStep('assertion', 'Assert dropdown has value', 'assert-value');
        break;
      case 'assert-contains':
        this.addGenericStep('assertion', 'Assert dropdown contains option', 'assert-contains');
        break;
      case 'assert-count':
        this.addGenericStep('assertion', 'Assert options count', 'assert-count');
        break;
      case 'assert-disabled':
        this.addGenericStep('assertion', 'Assert element is disabled/enabled', 'assert-disabled');
        break;
      case 'assert-multiselect':
        this.addGenericStep('assertion', 'Assert multiselect values', 'assert-multiselect');
        break;
        
      // Visual Testing
      case 'visual-screenshot':
        this.addGenericStep('screenshot', 'Capture dropdown screenshot', 'visual-screenshot');
        break;
      case 'visual-compare':
        this.addGenericStep('screenshot', 'Compare two screenshots', 'visual-compare');
        break;
      case 'visual-baseline':
        this.addGenericStep('screenshot', 'Save baseline screenshot', 'visual-baseline');
        break;
      case 'visual-compare-baseline':
        this.addGenericStep('screenshot', 'Compare with baseline', 'visual-compare-baseline');
        break;
      case 'visual-record-start':
        this.addGenericStep('click', 'Start visual test recording', 'visual-record-start');
        break;
      case 'visual-record-stop':
        this.addGenericStep('click', 'Stop visual test recording', 'visual-record-stop');
        break;
        
      // AI Features
      case 'ai-smart-selector':
        this.addGenericStep('ai', 'Generate AI-powered selector', 'ai-smart-selector');
        break;
      case 'ai-analyze-stability':
        this.addGenericStep('ai', 'Analyze selector stability', 'ai-analyze-stability');
        break;
      case 'ai-suggest-alternatives':
        this.addGenericStep('ai', 'Suggest alternative selectors', 'ai-suggest-alternatives');
        break;
      case 'ai-find-healing':
        this.addGenericStep('ai', 'Find element with self-healing', 'ai-find-healing');
        break;
      case 'ai-heal-selector':
        this.addGenericStep('ai', 'Heal broken selector', 'ai-heal-selector');
        break;
      case 'ai-learn-failures':
        this.addGenericStep('ai', 'Learn from test failures', 'ai-learn-failures');
        break;
        
      // Cloud Operations
      case 'cloud-upload':
        this.addGenericStep('cloud', 'Upload test to cloud', 'cloud-upload');
        break;
      case 'cloud-execute':
        this.addGenericStep('cloud', 'Execute test in cloud', 'cloud-execute');
        break;
      case 'cloud-results':
        this.addGenericStep('cloud', 'Get cloud test results', 'cloud-results');
        break;
      case 'cloud-schedule':
        this.addGenericStep('cloud', 'Schedule cloud test execution', 'cloud-schedule');
        break;
        
      // Import/Export
      case 'export-suite':
        this.addGenericStep('suite', 'Export test suite to JSON', 'export-suite');
        break;
      case 'import-suite':
        this.addGenericStep('suite', 'Import test suite from JSON', 'import-suite');
        break;
      case 'validate-suite':
        this.addGenericStep('suite', 'Validate test suite structure', 'validate-suite');
        break;
      case 'save-file':
        this.addGenericStep('suite', 'Save test suite to file', 'save-file');
        break;
      case 'load-file':
        this.addGenericStep('suite', 'Load test suite from file', 'load-file');
        break;
        
      // Navigation
      case 'nav-url':
        this.addNavigateStep();
        break;
      case 'nav-refresh':
        this.addGenericStep('refresh', 'Refresh current page', 'nav-refresh');
        break;
      case 'nav-back':
        this.addGenericStep('navigate', 'Go back in history', 'nav-back');
        break;
      case 'nav-forward':
        this.addGenericStep('navigate', 'Go forward in history', 'nav-forward');
        break;
      case 'scroll-element':
        this.addGenericStep('scroll', 'Scroll to element', 'scroll-element');
        break;
      case 'scroll-top':
        this.addGenericStep('scroll', 'Scroll to top of page', 'scroll-top');
        break;
      case 'scroll-bottom':
        this.addGenericStep('scroll', 'Scroll to bottom of page', 'scroll-bottom');
        break;
        
      // Interactions
      case 'click':
        this.addGenericStep('click', 'Click element', 'click');
        break;
      case 'double-click':
        this.addGenericStep('dblclick', 'Double click element', 'double-click');
        break;
      case 'right-click':
        this.addGenericStep('click', 'Right click element', 'right-click');
        break;
      case 'hover':
        this.addGenericStep('hover', 'Hover over element', 'hover');
        break;
      case 'focus':
        this.addGenericStep('focus', 'Focus on element', 'focus');
        break;
      case 'blur':
        this.addGenericStep('blur', 'Remove focus from element', 'blur');
        break;
        
      // Input
      case 'input-text':
        this.addGenericStep('input', 'Input text into field', 'input-text');
        break;
      case 'clear-field':
        this.addGenericStep('clear', 'Clear input field', 'clear-field');
        break;
      case 'press-key':
        this.addGenericStep('keyboard', 'Press keyboard key', 'press-key');
        break;
      case 'upload-file':
        this.addGenericStep('upload', 'Upload file', 'upload-file');
        break;
        
      // Advanced
      case 'execute-js':
        this.addGenericStep('javascript', 'Execute JavaScript code', 'execute-js');
        break;
      case 'new-tab':
        this.addGenericStep('navigation', 'Open new browser tab', 'new-tab');
        break;
      case 'switch-tab':
        this.addGenericStep('navigation', 'Switch to another tab', 'switch-tab');
        break;
      case 'close-tab':
        this.addGenericStep('navigation', 'Close current tab', 'close-tab');
        break;
      case 'page-screenshot':
        this.addGenericStep('screenshot', 'Take full page screenshot', 'page-screenshot');
        break;
      case 'set-cookie':
        this.addGenericStep('cookie', 'Set browser cookie', 'set-cookie');
        break;
      case 'get-cookies':
        this.addGenericStep('cookie', 'Get browser cookies', 'get-cookies');
        break;
        
      // Mobile
      case 'swipe-up':
        this.addGenericStep('mobile', 'Swipe up gesture', 'swipe-up');
        break;
      case 'swipe-down':
        this.addGenericStep('mobile', 'Swipe down gesture', 'swipe-down');
        break;
      case 'swipe-left':
        this.addGenericStep('mobile', 'Swipe left gesture', 'swipe-left');
        break;
      case 'swipe-right':
        this.addGenericStep('mobile', 'Swipe right gesture', 'swipe-right');
        break;
      case 'pinch-in':
        this.addGenericStep('mobile', 'Pinch zoom in gesture', 'pinch-in');
        break;
      case 'pinch-out':
        this.addGenericStep('mobile', 'Pinch zoom out gesture', 'pinch-out');
        break;
        
      // Special
      case 'switch-iframe':
        this.addGenericStep('iframe', 'Switch to iframe', 'switch-iframe');
        break;
      case 'switch-parent':
        this.addGenericStep('iframe', 'Switch to parent frame', 'switch-parent');
        break;
      case 'accept-alert':
        this.addGenericStep('alert', 'Accept browser alert', 'accept-alert');
        break;
      case 'dismiss-alert':
        this.addGenericStep('alert', 'Dismiss browser alert', 'dismiss-alert');
        break;
      case 'get-alert-text':
        this.addGenericStep('alert', 'Get alert text', 'get-alert-text');
        break;
    }
  }

  addWebhookStep() {
    this.showAddActionModal();
    setTimeout(() => {
      const actionType = document.getElementById('actionType');
      if (actionType) {
        actionType.value = 'api';
        this.updateFormForActionType();
        const apiMethod = document.getElementById('apiMethod');
        const apiUrl = document.getElementById('apiUrl');
        if (apiMethod) apiMethod.value = 'POST';
        if (apiUrl) apiUrl.value = 'https://your-webhook-url.com';
      }
    }, 100);
  }

  addRestGetStep() {
    this.showAddActionModal();
    setTimeout(() => {
      const actionType = document.getElementById('actionType');
      if (actionType) {
        actionType.value = 'api';
        this.updateFormForActionType();
        const apiMethod = document.getElementById('apiMethod');
        if (apiMethod) apiMethod.value = 'GET';
      }
    }, 100);
  }

  addRestPostStep() {
    this.showAddActionModal();
    setTimeout(() => {
      const actionType = document.getElementById('actionType');
      if (actionType) {
        actionType.value = 'api';
        this.updateFormForActionType();
        const apiMethod = document.getElementById('apiMethod');
        if (apiMethod) apiMethod.value = 'POST';
      }
    }, 100);
  }

  // ===== HELPER METHODS FOR QUICK STEPS =====
  
  /**
   * Add generic step - universal helper for most operations
   * @param {string} type - Action type
   * @param {string} description - Step description
   * @param {string} subtype - Optional subtype for specialized actions
    */
  addGenericStep(type, description, subtype = null) {
    this.showAddActionModal();
    
    // Сохраняем subtype для последующего использования
    this.currentSubtype = subtype;
    
    // ИСПРАВЛЕНИЕ #28: Используем requestAnimationFrame вместо setTimeout для надёжности
    const setupForm = () => {
      const actionType = document.getElementById('actionType');
      if (actionType) {
        // Map generic type to actual action types (updated for v1.9.2)
        const typeMap = {
          'click': 'click',
          'input': 'input',
          'wait': 'wait',
          'keypress': 'keyboard',
          'keyboard': 'keyboard',
          'hover': 'hover',
          'focus': 'focus',
          'blur': 'blur',
          'clear': 'clear',
          'upload': 'upload',
          'javascript': 'javascript',
          'navigate': 'navigation',
          'navigation': 'navigation',
          'refresh': 'navigation',
          'scroll': 'scroll',
          'newtab': 'navigation',
          'switchtab': 'navigation',
          'closetab': 'navigation',
          'screenshot': 'screenshot',
          'cookie': 'cookie',
          'swipe': 'mobile',
          'pinch': 'mobile',
          'mobile': 'mobile',
          'gesture': 'mobile',
          'iframe': 'navigation',
          'alert': 'wait',
          
          // NEW TYPES v1.9.2
          'assertion': 'assertion',
          'assert': 'assertion',
          'ai': 'ai',
          'cloud': 'cloud',
          'suite': 'suite'
        };
        
        const actualType = typeMap[type] || 'click';
        actionType.value = actualType;
        
        // Вызываем обновление формы с учетом subtype
        this.updateFormForActionType(subtype);
        
        // Set description if field exists
        const descField = document.getElementById('actionDescription');
        if (descField) {
          descField.value = description;
        }
        
        return true; // Форма готова
      }
      return false; // Форма ещё не готова
    };
    
    // Пробуем сразу, затем через requestAnimationFrame, затем через setTimeout как fallback
    if (!setupForm()) {
      requestAnimationFrame(() => {
        if (!setupForm()) {
          // Fallback на setTimeout если requestAnimationFrame не сработал
          setTimeout(setupForm, 50);
        }
      });
    }
  }
  
  /**
   * Add navigate step with URL
   * ИСПРАВЛЕНИЕ #2: Используем 'navigation' вместо 'navigate'
   */
  addNavigateStep() {
    this.showAddActionModal();
    
    const setupNavigate = () => {
      const actionType = document.getElementById('actionType');
      if (actionType) {
        actionType.value = 'navigation'; // ИСПРАВЛЕНИЕ #2: было 'navigate'
        this.updateFormForActionType();
        
        const urlField = document.getElementById('navigateUrl');
        if (urlField) {
          urlField.value = 'https://';
          urlField.focus();
        }
        return true;
      }
      return false;
    };
    
    // ИСПРАВЛЕНИЕ #28: Аналогично addGenericStep
    if (!setupNavigate()) {
      requestAnimationFrame(() => {
        if (!setupNavigate()) {
          setTimeout(setupNavigate, 50);
        }
      });
    }
  }

  // ==================== ПАНЕЛЬ ПЕРЕМЕННЫХ СЦЕНАРИЯ ====================

  initVariablesPanel() {
    // Обработчик для фильтра переменных
    const filterSelect = document.getElementById('variablesFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => {
        this.renderVariablesPanel();
      });
    }
    
    const extractBtn = document.getElementById('extractFromUrl');
    const grabBtn = document.getElementById('grabFromPage');
    const addVarBtn = document.getElementById('addVariable');
    const toggleBtn = document.getElementById('toggleVariablesPanel');
    
    // Обработчик для кнопки "Применить" изменения выделенной части текста
    const applySelectionBtn = document.getElementById('pageVarApplySelection');
    if (applySelectionBtn) {
      applySelectionBtn.addEventListener('click', () => {
        const startInput = document.getElementById('pageVarStartIndexInput');
        const endInput = document.getElementById('pageVarEndIndexInput');
        const startIndex = parseInt(startInput.value) || 0;
        const endIndex = parseInt(endInput.value) || 0;
        
        if (startIndex < 0 || endIndex <= startIndex) {
          this.showToast(this.t('editorUI.incorrectPositions'), 'error');
          return;
        }
        
        // Обновляем отображение позиций (без полного текста, так как он может измениться)
        document.getElementById('pageVarStartIndex').textContent = startIndex;
        document.getElementById('pageVarEndIndex').textContent = endIndex;
        document.getElementById('pageVarSelectedText').textContent = `chars ${startIndex}-${endIndex}`;
        
        // Обновляем значение переменной (показываем только позиции, так как полный текст неизвестен)
        document.getElementById('newVarValue').value = `[chars ${startIndex}-${endIndex}]`;
        
        this.showToast(this.t('editorUI.selectionPositionsUpdated', { start: startIndex, end: endIndex }), 'success');
      });
    }

    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.showUrlExtractModal());
    }

    if (grabBtn) {
      grabBtn.addEventListener('click', () => this.startPageGrabber());
    }

    const getFromLocalStorageBtn = document.getElementById('getFromLocalStorage');
    if (getFromLocalStorageBtn) {
      // Удаляем старые обработчики, если они есть
      const newBtn = getFromLocalStorageBtn.cloneNode(true);
      getFromLocalStorageBtn.parentNode.replaceChild(newBtn, getFromLocalStorageBtn);
      
      newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔍 [Editor] Клик по кнопке getFromLocalStorage');
        try {
          await this.showLocalStorageVariablesModal();
        } catch (error) {
          console.error('❌ [Editor] Ошибка при открытии модального окна localStorage:', error);
          this.showToast(this.t('editorUI.localStorageModalError', { error: error.message || error }), 'error');
        }
      });
      console.log('✅ [Editor] Обработчик для getFromLocalStorage привязан');
    } else {
      console.warn('⚠️ [Editor] Кнопка getFromLocalStorage не найдена в DOM');
      // Попробуем найти через querySelector
      const btn = document.querySelector('#getFromLocalStorage');
      if (btn) {
        console.log('✅ [Editor] Кнопка найдена через querySelector, привязываем обработчик');
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🔍 [Editor] Клик по кнопке getFromLocalStorage (найдена через querySelector)');
          try {
            await this.showLocalStorageVariablesModal();
          } catch (error) {
            console.error('❌ [Editor] Ошибка при открытии модального окна localStorage:', error);
            this.showToast(this.t('editorUI.localStorageModalError', { error: error.message || error }), 'error');
          }
        });
      } else {
        console.error('❌ [Editor] Кнопка getFromLocalStorage не найдена ни через getElementById, ни через querySelector');
      }
    }

    if (addVarBtn) {
      addVarBtn.addEventListener('click', () => this.showAddVariableModal());
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleVariablesPanel());
    }

    // Обработчики модальных окон переменных
    const closeVarModal = document.getElementById('closeVariableModal');
    const cancelVarBtn = document.getElementById('cancelVariable');
    const saveVarBtn = document.getElementById('saveVariable');

    if (closeVarModal) {
      closeVarModal.addEventListener('click', () => this.closeVariableModal());
    }
    if (cancelVarBtn) {
      cancelVarBtn.addEventListener('click', () => this.closeVariableModal());
    }
    if (saveVarBtn) {
      saveVarBtn.addEventListener('click', () => this.saveVariable());
    }

    // Обработчики модального окна извлечения из URL
    const closeUrlExtract = document.getElementById('closeUrlExtractModal');
    const cancelUrlExtract = document.getElementById('cancelUrlExtract');
    const saveUrlExtract = document.getElementById('saveUrlExtract');

    if (closeUrlExtract) {
      closeUrlExtract.addEventListener('click', () => this.closeUrlExtractModal());
    }
    if (cancelUrlExtract) {
      cancelUrlExtract.addEventListener('click', () => this.closeUrlExtractModal());
    }
    if (saveUrlExtract) {
      saveUrlExtract.addEventListener('click', () => this.saveUrlExtract());
    }
  }

  toggleVariablesPanel() {
    const content = document.getElementById('variablesContent');
    const toggle = document.getElementById('toggleVariablesPanel');
    if (content && toggle) {
      content.classList.toggle('collapsed');
      toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
    }
  }

  /**
   * Определяет категорию переменной
   * @param {string} varName - Имя переменной
   * @param {Object} varData - Данные переменной
   * @returns {Object} Объект с флагами категорий
   */
  getVariableCategory(varName, varData) {
    const categories = {
      empty: !varData.value || varData.value === '',
      global: varData.global || false,
      scenario: !varData.global && varData.source !== 'action',
      input: false,  // Используется для ввода значений в шагах
      output: false, // Используется для получения результатов
      body: false    // Используется в теле запроса
    };

    // Проверяем использование переменной в действиях
    if (this.test?.actions) {
      const varPattern = new RegExp(`\\{var:${varName}\\}`, 'g');
      
      for (const action of this.test.actions) {
        // Проверяем API действия
        if (action.type === 'api' && action.api) {
          // Проверяем URL
          if (action.api.url && varPattern.test(action.api.url)) {
            categories.input = true;
          }
          
          // Проверяем заголовки
          if (action.api.headers) {
            const headersStr = typeof action.api.headers === 'string' 
              ? action.api.headers 
              : JSON.stringify(action.api.headers);
            if (varPattern.test(headersStr)) {
              categories.input = true;
            }
          }
          
          // Проверяем тело запроса
          if (action.api.body) {
            const bodyStr = typeof action.api.body === 'string' 
              ? action.api.body 
              : JSON.stringify(action.api.body);
            if (varPattern.test(bodyStr)) {
              categories.input = true;
              categories.body = true;
            }
          }
          
          // Проверяем переменную для сохранения ответа
          if (action.api.responseVariable === varName) {
            categories.output = true;
          }
        }
        
        // Проверяем переменные действия
        if (action.type === 'variable' && action.variable) {
          if (action.variable.name === varName) {
            categories.output = true;
          }
          if (action.variable.value && varPattern.test(action.variable.value)) {
            categories.input = true;
          }
        }
        
        // Рекурсивно проверяем вложенные действия
        if (action.then && Array.isArray(action.then)) {
          for (const nestedAction of action.then) {
            if (nestedAction.type === 'api' && nestedAction.api) {
              const bodyStr = nestedAction.api.body ? 
                (typeof nestedAction.api.body === 'string' ? nestedAction.api.body : JSON.stringify(nestedAction.api.body)) : '';
              if (varPattern.test(bodyStr)) {
                categories.input = true;
                categories.body = true;
              }
            }
          }
        }
        if (action.else && Array.isArray(action.else)) {
          for (const nestedAction of action.else) {
            if (nestedAction.type === 'api' && nestedAction.api) {
              const bodyStr = nestedAction.api.body ? 
                (typeof nestedAction.api.body === 'string' ? nestedAction.api.body : JSON.stringify(nestedAction.api.body)) : '';
              if (varPattern.test(bodyStr)) {
                categories.input = true;
                categories.body = true;
              }
            }
          }
        }
        if (action.loop && action.loop.actions && Array.isArray(action.loop.actions)) {
          for (const nestedAction of action.loop.actions) {
            if (nestedAction.type === 'api' && nestedAction.api) {
              const bodyStr = nestedAction.api.body ? 
                (typeof nestedAction.api.body === 'string' ? nestedAction.api.body : JSON.stringify(nestedAction.api.body)) : '';
              if (varPattern.test(bodyStr)) {
                categories.input = true;
                categories.body = true;
              }
            }
          }
        }
      }
    }

    return categories;
  }

  renderVariablesPanel() {
    const list = document.getElementById('variablesList');
    if (!list) return;

    const filterSelect = document.getElementById('variablesFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    const variables = this.test?.variables || {};
    let varEntries = Object.entries(variables);

    // Применяем фильтр
    if (filterValue !== 'all') {
      varEntries = varEntries.filter(([name, varData]) => {
        const categories = this.getVariableCategory(name, varData);
        
        switch (filterValue) {
          case 'empty':
            return categories.empty;
          case 'scenario':
            return categories.scenario;
          case 'global':
            return categories.global;
          case 'input':
            return categories.input;
          case 'output':
            return categories.output;
          case 'body':
            return categories.body;
          default:
            return true;
        }
      });
    }

    if (varEntries.length === 0) {
      const filterLabels = {
        'all': this.t('editorUI.filterAll'),
        'empty': this.t('editorUI.filterEmpty'),
        'scenario': this.t('editorUI.filterForScenario'),
        'global': this.t('editorUI.filterGlobal'),
        'input': this.t('editorUI.filterInput'),
        'output': this.t('editorUI.filterOutput'),
        'body': this.t('editorUI.filterInRequestBody')
      };
      const filterLabel = filterLabels[filterValue] || this.t('editorUI.selectedFilter');
      list.innerHTML = `<div class="no-variables">No variables for filter "${filterLabel}".</div>`;
      return;
    }

    list.innerHTML = varEntries.map(([name, varData]) => {
      const value = varData.value || '';
      const isGlobal = varData.global || false;
      const isSensitive = varData.sensitive || false;
      const displayValue = isSensitive ? '••••••••' : (value.length > 30 ? value.substring(0, 30) + '...' : value);
      const lockIcon = isSensitive ? '🔒' : '';
      
      return `
        <div class="variable-tag ${isGlobal ? 'global' : ''} ${isSensitive ? 'sensitive' : ''}">
          <span class="var-name">${this.escapeHtml(name)}</span>
          <span class="var-value" title="${isSensitive ? this.t('editorUI.sensitiveData') : this.escapeHtml(value)}">
            ${this.escapeHtml(displayValue)}
            ${lockIcon}
          </span>
          <div class="var-actions">
            <button class="var-action-btn" data-var-name="${this.escapeHtml(name)}" title="Edit">✏️</button>
            <button class="var-action-btn" data-var-name="${this.escapeHtml(name)}" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    // Обработчики для кнопок переменных
    list.querySelectorAll('.var-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const varName = btn.getAttribute('data-var-name');
        if (btn.textContent.includes('✏️')) {
          this.editVariable(varName);
        } else if (btn.textContent.includes('🗑️')) {
          this.deleteVariableFromPanel(varName);
        }
      });
    });
  }

  showAddVariableModal() {
    const modal = document.getElementById('variableModal');
    if (!modal) return;

    document.getElementById('variableModalTitle').textContent = this.t('editorUI.addVariable');
    document.getElementById('newVarName').value = '';
    document.getElementById('newVarValue').value = '';
    document.getElementById('newVarGlobal').checked = false;
    document.getElementById('newVarSensitive').checked = false;

    modal.style.display = 'block';
    modal.classList.add('show');
  }

  closeVariableModal() {
    const modal = document.getElementById('variableModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
  }

  async saveVariable() {
    const modal = document.getElementById('variableModal');
    const isEditing = modal?.dataset.editingVar; // Оригинальное имя переменной при редактировании
    const editingTestId = modal?.dataset.editingTestId;
    const nameInput = document.getElementById('newVarName');
    const newName = nameInput?.value.trim(); // Новое имя (может быть таким же или изменённым)
    const value = document.getElementById('newVarValue')?.value.trim();
    const isGlobal = document.getElementById('newVarGlobal')?.checked || false;
    const isSensitive = document.getElementById('newVarSensitive')?.checked || false;

    if (!newName) {
      alert(this.t('editorUI.specifyVariableName'));
      return;
    }

    // Проверяем формат имени (всегда, and для новых, and для переименованных)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      alert(this.t('editorUI.variableNameInvalid'));
      return;
    }

    // Проверяем, это текущий тест или другой
    const isCurrentTest = !editingTestId || String(editingTestId) === String(this.test?.id);

    if (!isCurrentTest) {
      // Редактируем переменную из другого теста
      try {
        // Загружаем тест
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TEST',
          testId: editingTestId
        });

        if (!response || !response.success || !response.test) {
          this.showToast(this.t('editorUI.couldNotLoadTest'), 'error');
          return;
        }

        const test = response.test;
        if (!test.variables) {
          test.variables = {};
        }

        // Если имя изменилось при редактировании, удаляем старую переменную
        if (isEditing && isEditing !== newName) {
          delete test.variables[isEditing];
        }

        // Сохраняем переменную с новым именем, сохраняя информацию о выделенном тексте (если есть)
        const varDataToSave = {
          value: value,
          global: isGlobal,
          sensitive: isSensitive
        };
        
        // Если редактируем переменную со страницы, сохраняем информацию об элементе
        const originalVarData = isEditing ? test.variables[isEditing] : null;
        if (originalVarData && originalVarData.source === 'page') {
          varDataToSave.source = 'page';
          varDataToSave.selector = originalVarData.selector;
          varDataToSave.extractType = originalVarData.extractType;
          varDataToSave.regex = originalVarData.regex;
          varDataToSave.urlMatch = originalVarData.urlMatch;
          varDataToSave.tabId = originalVarData.tabId;
          
          // Сохраняем только позиции выделения (без fullText)
          if (originalVarData.textSelection) {
            varDataToSave.textSelection = {
              startIndex: originalVarData.textSelection.startIndex,
              endIndex: originalVarData.textSelection.endIndex
            };
          }
        }
        
        test.variables[newName] = varDataToSave;

        // Сохраняем тест
        await chrome.runtime.sendMessage({
          type: 'UPDATE_TEST',
          test: test
        });

        // Обновляем локальный кэш
        const testKey = Object.keys(this.allTestsVariables || {}).find(
          key => String(key) === String(editingTestId)
        );
        if (testKey && this.allTestsVariables[testKey]) {
          if (!this.allTestsVariables[testKey].variables) {
            this.allTestsVariables[testKey].variables = {};
          }
          this.allTestsVariables[testKey].variables[newName] = test.variables[newName];
          if (isEditing && isEditing !== newName) {
            delete this.allTestsVariables[testKey].variables[isEditing];
          }
        }

        // Перерисовываем
        this.renderVariables();
        this.closeVariableModal();
        
        // Очищаем флаги редактирования
        if (modal) {
          delete modal.dataset.editingVar;
          delete modal.dataset.editingTestId;
        }
        
        this.showToast(this.t('editorUI.variableUpdated', { name: newName }), 'success');
        return;
      } catch (error) {
        console.error('Ошибка при сохранении переменной:', error);
        this.showToast(this.t('editorUI.errorSavingVariable'), 'error');
        return;
      }
    }

    // Сохранение в текущий тест
    if (!this.test.variables) {
      this.test.variables = {};
    }

    // Получаем исходные данные переменной (если редактируем)
    const originalVarData = isEditing ? this.test.variables[isEditing] : null;

    // Проверяем на конфликт имён при создании новой переменной
    if (!isEditing && this.test.variables[newName]) {
      if (!confirm(this.t('editorUI.variableAlreadyExists', { name: newName }))) {
        return;
      }
    }

    // Если имя изменилось при редактировании, удаляем старую переменную
    if (isEditing && isEditing !== newName) {
      // Проверяем на конфликт с существующей переменной
      if (this.test.variables[newName]) {
        if (!confirm(this.t('editorUI.variableAlreadyExists', { name: newName }))) {
          return;
        }
      }
      delete this.test.variables[isEditing];
    }

    // Сохраняем переменную с сохранением информации о выделенном тексте (если есть)
    const varDataToSave = {
      value: value,
      global: isGlobal,
      sensitive: isSensitive
    };
    
    // Если редактируем переменную со страницы, сохраняем информацию об элементе and выделенном тексте
    if (originalVarData && originalVarData.source === 'page') {
      varDataToSave.source = 'page';
      varDataToSave.selector = originalVarData.selector;
      varDataToSave.extractType = originalVarData.extractType;
      varDataToSave.regex = originalVarData.regex;
      varDataToSave.urlMatch = originalVarData.urlMatch;
      varDataToSave.tabId = originalVarData.tabId;
      
      // Обновляем информацию о выделенном тексте, если она была изменена
      const startInput = document.getElementById('pageVarStartIndexInput');
      const endInput = document.getElementById('pageVarEndIndexInput');
      if (startInput && endInput && originalVarData.textSelection) {
        const newStartIndex = parseInt(startInput.value);
        const endIndex = parseInt(endInput.value);
        if (!isNaN(newStartIndex) && !isNaN(endIndex) && newStartIndex >= 0 && endIndex > newStartIndex) {
          // Сохраняем только позиции, без полного текста (он может измениться)
          varDataToSave.textSelection = {
            startIndex: newStartIndex,
            endIndex: endIndex
          };
        } else {
          varDataToSave.textSelection = originalVarData.textSelection;
        }
      } else if (originalVarData.textSelection) {
        varDataToSave.textSelection = originalVarData.textSelection;
      }
    }
    
    this.test.variables[newName] = varDataToSave;

    // Сохраняем тест
    await this.saveTest();

    // Обновляем кэш allTestsVariables для синхронизации
    const testKey = Object.keys(this.allTestsVariables || {}).find(
      key => String(key) === String(this.test.id)
    );
    if (testKey && this.allTestsVariables[testKey]) {
      if (!this.allTestsVariables[testKey].variables) {
        this.allTestsVariables[testKey].variables = {};
      }
      this.allTestsVariables[testKey].variables[newName] = this.test.variables[newName];
      if (isEditing && isEditing !== newName) {
        delete this.allTestsVariables[testKey].variables[isEditing];
      }
    }

    this.renderVariablesPanel();
    
    // Обновляем модальное окно если оно открыто
    const variablesModal = document.getElementById('variablesModal');
    if (variablesModal && variablesModal.classList.contains('show')) {
      // Обновляем все табы
      const scenarioContainer = document.getElementById('scenarioVariables');
      if (scenarioContainer) {
        this.renderAllScenarioVariables(scenarioContainer);
      }
      const globalContainer = document.getElementById('globalVariables');
      if (globalContainer) {
        this.renderGlobalVariables(globalContainer);
      }
    }
    
    this.closeVariableModal();
    
    // Очищаем флаг редактирования
    if (modal) {
      delete modal.dataset.editingVar;
      delete modal.dataset.editingTestId;
    }
    
    this.showToast(`Variable "${newName}" ${isEditing ? 'updated' : 'added'}`, 'success');
  }

  editVariable(varName) {
    const varData = this.test.variables?.[varName];
    if (!varData) return;

    const modal = document.getElementById('variableModal');
    if (!modal) return;

    document.getElementById('variableModalTitle').textContent = this.t('editorUI.editVariable');
    const nameInput = document.getElementById('newVarName');
    nameInput.value = varName;
    nameInput.disabled = false; // Разрешаем редактирование имени
    document.getElementById('newVarValue').value = varData.value || '';
    document.getElementById('newVarGlobal').checked = varData.global || false;
    document.getElementById('newVarSensitive').checked = varData.sensitive || false;

    // Если переменная извлечена со страницы, показываем информацию об элементе
    const pageInfoGroup = document.getElementById('pageVariableInfoGroup');
    const textSelectionGroup = document.getElementById('pageVarTextSelectionGroup');
    
    if (varData.source === 'page' && varData.selector) {
      // Показываем информацию об элементе
      document.getElementById('pageVarSelector').textContent = varData.selector;
      pageInfoGroup.style.display = 'block';
      
      // Если есть информация о выделенном тексте, показываем её
      if (varData.textSelection) {
        const ts = varData.textSelection;
        // Показываем сохраненные позиции (без полного текста, так как он может измениться)
        document.getElementById('pageVarStartIndex').textContent = ts.startIndex;
        document.getElementById('pageVarEndIndex').textContent = ts.endIndex;
        document.getElementById('pageVarSelectedText').textContent = `chars ${ts.startIndex}-${ts.endIndex}`;
        document.getElementById('pageVarTextSelectionInfo').style.display = 'block';
        
        // Показываем поля для редактирования (без ограничения по длине, так как текст может измениться)
        document.getElementById('pageVarStartIndexInput').value = ts.startIndex;
        document.getElementById('pageVarEndIndexInput').value = ts.endIndex;
        // Убираем ограничение max, так как длина текста может измениться
        document.getElementById('pageVarStartIndexInput').removeAttribute('max');
        document.getElementById('pageVarEndIndexInput').removeAttribute('max');
        textSelectionGroup.style.display = 'block';
      } else {
        document.getElementById('pageVarTextSelectionInfo').style.display = 'none';
        textSelectionGroup.style.display = 'none';
      }
    } else {
      pageInfoGroup.style.display = 'none';
    }

    modal.style.display = 'block';
    modal.classList.add('show');

    // Сохраняем оригинальное имя для обновления and testId для текущего теста
    modal.dataset.editingVar = varName;
    modal.dataset.editingTestId = String(this.test.id);
  }

  deleteVariableFromPanel(varName) {
    if (!confirm(this.t('editorUI.deleteVariableConfirm', { name: varName }))) {
      return;
    }

    if (this.test.variables && this.test.variables[varName]) {
      delete this.test.variables[varName];
      
      // Сохраняем тест
      this.saveTest();
      
      // Обновляем кэш allTestsVariables для синхронизации с модальным окном
      const testKey = Object.keys(this.allTestsVariables || {}).find(
        key => String(key) === String(this.test.id)
      );
      if (testKey && this.allTestsVariables[testKey]) {
        if (this.allTestsVariables[testKey].variables && this.allTestsVariables[testKey].variables[varName]) {
          delete this.allTestsVariables[testKey].variables[varName];
        }
      }
      
      this.renderVariablesPanel();
      
      // Обновляем модальное окно если оно открыто
      const variablesModal = document.getElementById('variablesModal');
      if (variablesModal && variablesModal.classList.contains('show')) {
        // Обновляем все табы
        const scenarioContainer = document.getElementById('scenarioVariables');
        if (scenarioContainer) {
          this.renderAllScenarioVariables(scenarioContainer);
        }
        const globalContainer = document.getElementById('globalVariables');
        if (globalContainer) {
          this.renderGlobalVariables(globalContainer);
        }
      }
      
      this.showToast(this.t('editorUI.variableDeleted', { name: varName }), 'success');
    }
  }

  showUrlExtractModal() {
    const modal = document.getElementById('urlExtractModal');
    if (!modal) return;

    // Заполняем список URL из шагов теста
    const sourceSelect = document.getElementById('urlExtractSource');
    if (sourceSelect && this.test?.actions) {
      sourceSelect.innerHTML = '<option value="current">' + this.t('editorUI.currentPageUrl2') + '</option>';
      
      const urlSet = new Set();
      this.test.actions.forEach((action, index) => {
        if (action.url && !action.url.startsWith('chrome-extension://') && !action.url.startsWith('chrome://')) {
          if (!urlSet.has(action.url)) {
            urlSet.add(action.url);
            const option = document.createElement('option');
            option.value = action.url;
            option.textContent = `Step ${index + 1}: ${action.url.substring(0, 50)}${action.url.length > 50 ? '...' : ''}`;
            sourceSelect.appendChild(option);
          }
        }
      });
    }

    modal.style.display = 'block';
    modal.classList.add('show');
  }

  closeUrlExtractModal() {
    const modal = document.getElementById('urlExtractModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
  }

  async saveUrlExtract() {
    const source = document.getElementById('urlExtractSource')?.value;
    const extractType = document.getElementById('urlExtractType')?.value;
    const pattern = document.getElementById('urlExtractPattern')?.value.trim();

    if (!pattern) {
      alert(this.t('editorUI.specifyPattern'));
      return;
    }

    let url = '';
    if (source === 'current') {
      url = window.location.href;
    } else if (source) {
      url = source;
    }

    if (!url) {
      alert(this.t('editorUI.urlNotFound'));
      return;
    }

    let extractedValue = '';
    try {
      const urlObj = new URL(url);
      
      if (extractType === 'query') {
        extractedValue = urlObj.searchParams.get(pattern) || '';
      } else if (extractType === 'path') {
        const segments = urlObj.pathname.split('/').filter(s => s);
        const index = parseInt(pattern) - 1;
        if (index >= 0 && index < segments.length) {
          extractedValue = segments[index];
        }
      } else if (extractType === 'regex') {
        const match = url.match(new RegExp(pattern));
        extractedValue = match ? (match[1] || match[0]) : '';
      }
    } catch (e) {
      alert(this.t('editorUI.extractionError', { error: e.message }));
      return;
    }

    if (!extractedValue) {
      alert(this.t('editorUI.noMatch'));
      return;
    }

    // Предлагаем имя переменной
    const varName = prompt(this.t('editorUI.enterVariableName'), pattern);
    if (!varName) return;

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
      alert(this.t('editorUI.variableNameInvalid'));
      return;
    }

    if (!this.test.variables) {
      this.test.variables = {};
    }

    this.test.variables[varName] = {
      value: extractedValue,
      global: false,
      sensitive: false
    };

    this.renderVariablesPanel();
    this.closeUrlExtractModal();
    this.showToast(this.t('editorUI.variableExtractedFromUrl', { name: varName }), 'success');
  }

  startPageGrabber() {
    this.showPageGrabberModal();
  }
  
  /**
   * Инициализирует обработчики для модального окна извлечения переменной со страницы
   */
  initPageGrabberModal() {
    const closeBtn = document.getElementById('closePageGrabberModal');
    const cancelBtn = document.getElementById('cancelPageGrabber');
    const saveBtn = document.getElementById('savePageGrabber');
    const tabSelect = document.getElementById('pageGrabberTabSelect');
    const selectBtn = document.getElementById('pageGrabberSelectBtn');
    const extractType = document.getElementById('pageGrabberExtractType');
    const regexInput = document.getElementById('pageGrabberRegex');
    const varNameInput = document.getElementById('pageGrabberVarName');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePageGrabberModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closePageGrabberModal());
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePageGrabberVariable());
    }
    if (tabSelect) {
      tabSelect.addEventListener('change', () => this.onPageGrabberTabSelect());
    }
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        if (this.pageGrabberSelecting) {
          this.stopPageGrabberSelection();
        } else {
          this.startPageGrabberSelection();
        }
      });
    }
    if (extractType) {
      extractType.addEventListener('change', () => {
        const regexGroup = document.getElementById('pageGrabberRegexGroup');
        regexGroup.style.display = extractType.value === 'regex' ? 'block' : 'none';
        this.updatePageGrabberPreview();
      });
    }
    if (regexInput) {
      regexInput.addEventListener('input', () => this.updatePageGrabberPreview());
    }
    if (varNameInput) {
      varNameInput.addEventListener('input', () => this.updatePageGrabberPreview());
    }
  }

  /**
   * Показывает модальное окно для извлечения переменной со страницы
   */
  async showPageGrabberModal() {
    const modal = document.getElementById('pageGrabberModal');
    if (!modal) return;
    
    // Сбрасываем состояние
    document.getElementById('pageGrabberTabSelect').innerHTML = '<option value="">' + this.t('editorUI.loadingTabs') + '</option>';
    document.getElementById('pageGrabberUrlGroup').style.display = 'none';
    document.getElementById('pageGrabberSelectorGroup').style.display = 'none';
    document.getElementById('pageGrabberVariableGroup').style.display = 'none';
    document.getElementById('pageGrabberExtractGroup').style.display = 'none';
    document.getElementById('pageGrabberPreviewGroup').style.display = 'none';
    document.getElementById('pageGrabberUrlMatchGroup').style.display = 'none';
    document.getElementById('pageGrabberSelectorInfo').style.display = 'none';
    document.getElementById('savePageGrabber').disabled = true;
    
    // Загружаем список вкладок
    try {
      const tabs = await chrome.tabs.query({});
      const tabSelect = document.getElementById('pageGrabberTabSelect');
      tabSelect.innerHTML = '<option value="">' + this.t('editorUI.selectTab') + '</option>';
      
      tabs.forEach(tab => {
        // Пропускаем extension страницы
        if (tab.url && (
          tab.url.startsWith('chrome-extension://') || 
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('edge://')
        )) {
          return;
        }
        
        const option = document.createElement('option');
        option.value = tab.id;
        option.textContent = this.t('editorUI.tabTitle', { title: tab.title || this.t('editorUI.noTitle'), url: (tab.url?.substring(0, 50) || 'about:blank') + (tab.url?.length > 50 ? '...' : '') });
        option.dataset.url = tab.url || '';
        tabSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Ошибка при загрузке вкладок:', error);
      this.showToast(this.t('editorUI.errorLoadingTabs'), 'error');
    }
    
    modal.style.display = 'block';
    modal.classList.add('show');
  }

  /**
   * Закрывает модальное окно извлечения переменной
   */
  closePageGrabberModal() {
    const modal = document.getElementById('pageGrabberModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
    
    // Останавливаем режим выбора элемента, если активен
    if (this.pageGrabberSelecting) {
      this.stopPageGrabberSelection();
    }
  }

  /**
   * Обработчик выбора вкладки
   */
  async onPageGrabberTabSelect() {
    const tabSelect = document.getElementById('pageGrabberTabSelect');
    const tabId = parseInt(tabSelect.value);
    
    if (!tabId) {
      document.getElementById('pageGrabberUrlGroup').style.display = 'none';
      document.getElementById('pageGrabberSelectorGroup').style.display = 'none';
      return;
    }
    
    try {
      const tab = await chrome.tabs.get(tabId);
      const urlGroup = document.getElementById('pageGrabberUrlGroup');
      const urlDisplay = document.getElementById('pageGrabberUrl');
      const selectorGroup = document.getElementById('pageGrabberSelectorGroup');
      
      urlDisplay.textContent = tab.url || 'about:blank';
      urlGroup.style.display = 'block';
      selectorGroup.style.display = 'block';
      
      // Проверяем, есть ли URL в шагах теста
      const urlMatchGroup = document.getElementById('pageGrabberUrlMatchGroup');
      if (this.test?.actions) {
        const hasMatchingUrl = this.test.actions.some(action => {
          if (!action.url) return false;
          try {
            const actionUrl = new URL(action.url);
            const tabUrl = new URL(tab.url);
            return actionUrl.origin === tabUrl.origin;
          } catch (e) {
            return action.url === tab.url;
          }
        });
        if (hasMatchingUrl) {
          urlMatchGroup.style.display = 'block';
        }
      }
    } catch (error) {
      console.error('Ошибка при получении информации о вкладке:', error);
      this.showToast(this.t('editorUI.errorGettingTabInfo'), 'error');
    }
  }

  /**
   * Начинает режим выбора элемента на странице
   */
  async startPageGrabberSelection() {
    const tabSelect = document.getElementById('pageGrabberTabSelect');
    const tabId = parseInt(tabSelect.value);
    
    if (!tabId) {
      this.showToast(this.t('editorUI.selectTabFirst'), 'error');
      return;
    }
    
    try {
      // Активируем режим выбора элемента
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'START_ELEMENT_SELECTION',
        mode: 'grabber'
      });
      
      if (response && response.success) {
        this.pageGrabberSelecting = true;
        this.pageGrabberTabId = tabId;
        document.getElementById('pageGrabberSelectBtn').textContent = this.t('editorUI.stopElementSelection');
        this.showToast(this.t('editorUI.clickElementToSelect'), 'info');
        
        // Слушаем сообщения о выборе элемента
        if (!this.pageGrabberMessageListener) {
          this.pageGrabberMessageListener = (message, sender, sendResponse) => {
            if (message.type === 'ELEMENT_SELECTED' && this.pageGrabberSelecting) {
              this.onPageGrabberElementSelected(message.element, message.selector, message.textSelection);
              sendResponse({ success: true });
              return true;
            }
          };
          chrome.runtime.onMessage.addListener(this.pageGrabberMessageListener);
        }
      } else {
        this.showToast(this.t('editorUI.couldNotActivatePicker'), 'error');
      }
    } catch (error) {
      console.error('Ошибка при активации режима выбора:', error);
      this.showToast(this.t('editorUI.errorActivatingPicker'), 'error');
    }
  }

  /**
   * Останавливает режим выбора элемента
   */
  async stopPageGrabberSelection() {
    if (this.pageGrabberTabId) {
      try {
        await chrome.tabs.sendMessage(this.pageGrabberTabId, {
          type: 'STOP_ELEMENT_SELECTION'
        });
      } catch (e) {
        // Игнорируем ошибки
      }
    }
    
    this.pageGrabberSelecting = false;
    this.pageGrabberTabId = null;
    document.getElementById('pageGrabberSelectBtn').textContent = this.t('editorUI.clickToSelectElement');
    
    if (this.pageGrabberMessageListener) {
      chrome.runtime.onMessage.removeListener(this.pageGrabberMessageListener);
      this.pageGrabberMessageListener = null;
    }
  }

  /**
   * Обработчик выбора элемента
   */
  onPageGrabberElementSelected(elementInfo, selector, textSelectionInfo) {
    this.stopPageGrabberSelection();
    
    const selectorInfo = document.getElementById('pageGrabberSelectorInfo');
    const selectorValue = document.getElementById('pageGrabberSelectorValue');
    const elementPreview = document.getElementById('pageGrabberElementPreview');
    const variableGroup = document.getElementById('pageGrabberVariableGroup');
    const extractGroup = document.getElementById('pageGrabberExtractGroup');
    
    selectorValue.textContent = selector;
    
    // Формируем информацию об элементе с учетом выделенного текста
    let previewHtml = `
      <strong>${this.t('editorUI.textLabel')}</strong> ${this.escapeHtml(elementInfo.text || this.t('editorUI.noText'))}<br>
      <strong>${this.t('editorUI.valueLabel2')}</strong> ${this.escapeHtml(elementInfo.value || this.t('editorUI.noValue'))}<br>
    `;
    
    if (textSelectionInfo) {
      previewHtml += `
        <strong>${this.t('editorUI.selectedTextLabel')}</strong> <span style="background: #fff3cd; padding: 2px 4px; border-radius: 2px;">${this.escapeHtml(textSelectionInfo.selectedText)}</span><br>
        <strong>${this.t('editorUI.positionLabel')}</strong> chars ${textSelectionInfo.startIndex}-${textSelectionInfo.endIndex} of ${textSelectionInfo.fullText.length}<br>
      `;
    }
    
    previewHtml += `<strong>${this.t('editorUI.attributes')}</strong> ${this.escapeHtml(elementInfo.attributes || this.t('editorUI.noAttributes'))}`;
    elementPreview.innerHTML = previewHtml;
    
    selectorInfo.style.display = 'block';
    variableGroup.style.display = 'block';
    extractGroup.style.display = 'block';
    
    // Сохраняем информацию об элементе and выделенном тексте
    this.pageGrabberElementInfo = elementInfo;
    this.pageGrabberSelector = selector;
    this.pageGrabberTextSelection = textSelectionInfo; // Сохраняем информацию о выделенном тексте
    
    // Обновляем предпросмотр
    this.updatePageGrabberPreview();
  }

  /**
   * Обновляет предпросмотр извлеченного значения
   */
  updatePageGrabberPreview() {
    if (!this.pageGrabberElementInfo) return;
    
    const extractType = document.getElementById('pageGrabberExtractType').value;
    const regexInput = document.getElementById('pageGrabberRegex').value;
    const previewGroup = document.getElementById('pageGrabberPreviewGroup');
    const preview = document.getElementById('pageGrabberPreview');
    
    let value = this.pageGrabberElementInfo.value || this.pageGrabberElementInfo.text || '';
    
    // Если есть выделенный текст and тип извлечения "full", используем выделенный текст
    if (this.pageGrabberTextSelection && extractType === 'full') {
      value = this.pageGrabberTextSelection.selectedText;
    } else if (extractType === 'number') {
      // Извлекаем только цифры
      const numbers = value.match(/\d+/g);
      value = numbers ? numbers.join('') : '';
    } else if (extractType === 'regex' && regexInput) {
      try {
        const regex = new RegExp(regexInput);
        const match = value.match(regex);
        if (match && match[1]) {
          value = match[1]; // Используем первую группу захвата
        } else if (match && match[0]) {
          value = match[0]; // Используем полное совпадение
        } else {
          value = this.t('editorUI.notFoundValue');
        }
      } catch (e) {
        value = this.t('editorUI.regexError');
      }
    }
    
    preview.textContent = value || this.t('editorUI.emptyValue');
    previewGroup.style.display = 'block';
    
    // Проверяем, можно ли сохранить
    const varName = document.getElementById('pageGrabberVarName').value.trim();
    document.getElementById('savePageGrabber').disabled = !varName || !value;
  }

  /**
   * Сохраняет переменную, извлеченную со страницы
   */
  async savePageGrabberVariable() {
    const varName = document.getElementById('pageGrabberVarName').value.trim();
    const extractType = document.getElementById('pageGrabberExtractType').value;
    const regexInput = extractType === 'regex' ? document.getElementById('pageGrabberRegex').value : '';
    const urlMatch = document.getElementById('pageGrabberUrlMatch').checked;
    const tabSelect = document.getElementById('pageGrabberTabSelect');
    const tabId = parseInt(tabSelect.value);
    
    if (!varName) {
      this.showToast(this.t('editorUI.enterVariableName'), 'error');
      return;
    }
    
    if (!this.pageGrabberElementInfo || !this.pageGrabberSelector) {
      this.showToast(this.t('editorUI.selectElementFirst'), 'error');
      return;
    }
    
    // Получаем текущее значение
    let value = this.pageGrabberElementInfo.value || this.pageGrabberElementInfo.text || '';
    
    // Применяем извлечение
    if (extractType === 'number') {
      const numbers = value.match(/\d+/g);
      value = numbers ? numbers.join('') : '';
    } else if (extractType === 'regex' && regexInput) {
      try {
        const regex = new RegExp(regexInput);
        const match = value.match(regex);
        if (match && match[1]) {
          value = match[1];
        } else if (match && match[0]) {
          value = match[0];
        } else {
          this.showToast(this.t('editorUI.valueNotFoundByRegex'), 'error');
          return;
        }
      } catch (e) {
        this.showToast(this.t('editorUI.regexErrorPrefix') + e.message, 'error');
        return;
      }
    }
    
    if (!value) {
      this.showToast(this.t('editorUI.couldNotExtractValue'), 'error');
      return;
    }
    
    // Сохраняем переменную
    if (!this.test.variables) {
      this.test.variables = {};
    }
    
    // Определяем тип извлечения для переменной
    const extractTypeForVar = extractType === 'number' ? 'number' : extractType === 'regex' ? 'regex' : 'full';
    
    // Если есть выделенный текст, используем его вместо полного значения
    let finalValue = value;
    let textSelection = null;
    
    if (this.pageGrabberTextSelection && extractType === 'full') {
      // Если пользователь выделил часть текста, используем только выделенную часть
      finalValue = this.pageGrabberTextSelection.selectedText;
      // Сохраняем только позиции, без полного текста (он может измениться)
      textSelection = {
        startIndex: this.pageGrabberTextSelection.startIndex,
        endIndex: this.pageGrabberTextSelection.endIndex
        // НЕ сохраняем fullText, так как он может измениться от теста к тесту
      };
    }
    
    this.test.variables[varName] = {
      value: finalValue,
      source: 'page',
      selector: this.pageGrabberSelector,
      extractType: extractTypeForVar,
      regex: extractType === 'regex' ? regexInput : undefined,
      urlMatch: urlMatch,
      tabId: urlMatch ? tabId : undefined,
      textSelection: textSelection // Сохраняем только позиции начала and конца выделения
    };
    
    // Если urlMatch включен, добавляем действие для извлечения из элемента
    if (urlMatch) {
      const action = {
        type: 'variable',
        variable: {
          name: varName,
          operation: 'extract-element',
          selector: this.pageGrabberSelector,
          extractType: extractTypeForVar === 'number' ? 'text' : 'text',
          regex: extractType === 'regex' ? regexInput : undefined,
          textSelection: textSelection // Передаем информацию о выделенном тексте
        }
      };
      
      // Добавляем действие в тест
      if (!this.test.actions) {
        this.test.actions = [];
      }
      this.test.actions.push(action);
    }
    
    this.renderVariablesPanel();
    this.closePageGrabberModal();
    this.showToast(this.t('editorUI.savedWithValue', { name: varName, value }), 'success');
  }

  /**
   * Показывает модальное окно для выбора переменных из хранилища
   */
  /**
   * Показывает модальное окно для выбора переменных из localStorage страницы
   */
  async showLocalStorageVariablesModal() {
    console.log('🔍 [Editor] Открываю модальное окно localStorage переменных');
    const modal = document.getElementById('localStorageVariablesModal');
    if (!modal) {
      console.error('❌ [Editor] Модальное окно localStorageVariablesModal не найдено в DOM');
      this.showToast(this.t('editorUI.modalNotFound'), 'error');
      return;
    }
    console.log('✅ [Editor] Модальное окно найдено');
    
    // Сбрасываем состояние
    document.getElementById('localStorageTabSelect').innerHTML = '<option value="">' + this.t('editorUI.loadingTabs') + '</option>';
    document.getElementById('localStorageUrlGroup').style.display = 'none';
    document.getElementById('localStorageVariablesGroup').style.display = 'none';
    document.getElementById('localStorageVariableInfo').style.display = 'none';
    document.getElementById('localStorageVariableNameGroup').style.display = 'none';
    document.getElementById('saveLocalStorageVariable').disabled = true;
    this.selectedLocalStorageVariable = null;
    this.localStorageTabId = null;
    
    // Загружаем список вкладок
    try {
      const tabs = await chrome.tabs.query({});
      const tabSelect = document.getElementById('localStorageTabSelect');
      tabSelect.innerHTML = '<option value="">' + this.t('editorUI.selectTab') + '</option>';
      
      tabs.forEach(tab => {
        // Пропускаем extension страницы
        if (tab.url && (
          tab.url.startsWith('chrome-extension://') || 
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('edge://')
        )) {
          return;
        }
        
        const option = document.createElement('option');
        option.value = tab.id;
        option.textContent = this.t('editorUI.tabTitle', { title: tab.title || this.t('editorUI.noTitle'), url: (tab.url?.substring(0, 50) || 'about:blank') + (tab.url?.length > 50 ? '...' : '') });
        option.dataset.url = tab.url || '';
        tabSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Ошибка при загрузке вкладок:', error);
      this.showToast(this.t('editorUI.errorLoadingTabs'), 'error');
    }
    
    modal.classList.add('show');
    console.log('✅ [Editor] Модальное окно localStorage переменных открыто');
  }

  /**
   * Обработчик выбора вкладки для localStorage
   */
  async onLocalStorageTabSelect() {
    const tabSelect = document.getElementById('localStorageTabSelect');
    const tabId = parseInt(tabSelect.value);
    
    if (!tabId) {
      document.getElementById('localStorageUrlGroup').style.display = 'none';
      document.getElementById('localStorageVariablesGroup').style.display = 'none';
      return;
    }
    
    try {
      const tab = await chrome.tabs.get(tabId);
      const urlGroup = document.getElementById('localStorageUrlGroup');
      const urlDisplay = document.getElementById('localStorageUrl');
      const variablesGroup = document.getElementById('localStorageVariablesGroup');
      
      urlDisplay.textContent = tab.url || 'about:blank';
      urlGroup.style.display = 'block';
      variablesGroup.style.display = 'block';
      
      this.localStorageTabId = tabId;
      
      // Очищаем список переменных
      document.getElementById('localStorageVariablesList').innerHTML =
        '<div style="text-align: center; padding: 20px; color: #666;">' + this.t('editorUI.clickLoadVars') + '</div>';
    } catch (error) {
      console.error('Ошибка при получении информации о вкладке:', error);
      this.showToast(this.t('editorUI.errorGettingTabInfo'), 'error');
    }
  }

  /**
   * Загружает переменные из localStorage выбранной вкладки
   */
  async loadLocalStorageVariables() {
    if (!this.localStorageTabId) {
      this.showToast(this.t('editorUI.selectTabFirst'), 'error');
      return;
    }
    
    const list = document.getElementById('localStorageVariablesList');
    list.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">' + this.t('editorUI.loadingVarsFromLocalStorage') + '</div>';
    
    try {
      // Проверяем статус вкладки перед выполнением скрипта
      const tab = await chrome.tabs.get(this.localStorageTabId);
      
      if (!tab) {
        throw new Error(this.t('editorUI.tabNotFound'));
      }
      
      // Проверяем, что вкладка не является error page или extension page
      if (tab.url && (
        tab.url.startsWith('chrome-error://') ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:') ||
        tab.status === 'loading' ||
        tab.status === 'unloaded'
      )) {
        throw new Error('Cannot get localStorage from this page. Select a regular web page (http:// or https://)');
      }
      
      // Проверяем, что вкладка полностью загружена
      if (tab.status !== 'complete') {
        throw new Error('Page is still loading. Wait for full load and try again.');
      }
      
      console.log('✅ [Editor] Вкладка проверена, выполняю скрипт для получения localStorage');
      
      // Пробуем выполнить скрипт через executeScript
      let results;
      let scriptError = null;
      
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId: this.localStorageTabId },
          func: () => {
            try {
              const items = {};
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                items[key] = value;
              }
              return items;
            } catch (e) {
              return { error: e.message };
            }
          }
        });
        
        // Проверяем, есть ли ошибка в результате
        if (results && results[0] && results[0].result && results[0].result.error) {
          throw new Error(results[0].result.error);
        }
      } catch (error) {
        scriptError = error;
        console.log('⚠️ [Editor] executeScript не сработал:', error.message);
        console.log('⚠️ [Editor] Пробую через content script message');
        
        // Если executeScript не работает, пробуем через content script message
        try {
          const response = await chrome.tabs.sendMessage(this.localStorageTabId, { type: 'GET_LOCAL_STORAGE' });
          if (response && response.success && response.data) {
            results = [{ result: response.data }];
            console.log('✅ [Editor] localStorage получен через content script message');
          } else {
            throw new Error(response?.error || this.t('editorUI.couldNotGetLocalStorage'));
          }
        } catch (messageError) {
          console.error('❌ [Editor] Content script message также не сработал:', messageError.message);
          // Если and это не сработало, выбрасываем понятную ошибку
          let errorMessage = this.t('editorUI.couldNotAccessLocalStorage') + ' ';
          
          if (scriptError && scriptError.message.includes('error page')) {
            errorMessage += 'Page shows error. Make sure the page is fully loaded and accessible.';
          } else if (scriptError && scriptError.message.includes('Cannot access')) {
            errorMessage += 'No access to this page. This may be a system browser page.';
          } else {
            errorMessage += `Error: ${scriptError?.message || messageError.message}. Make sure the page is fully loaded.`;
          }
          
          throw new Error(errorMessage);
        }
      }
      
      if (!results || !results[0] || !results[0].result) {
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">' + this.t('editorUI.couldNotGetVarsFromLocalStorage') + '</div>';
        return;
      }
      
      const localStorageData = results[0].result;
      const variables = [];
      
      // Форматируем переменные
      for (const [key, value] of Object.entries(localStorageData)) {
        let displayValue = '';
        let valueType = 'string';
        
        if (value === null || value === undefined) {
          displayValue = 'null';
          valueType = 'null';
        } else {
          // Пробуем распарсить как JSON
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object') {
              if (Array.isArray(parsed)) {
                displayValue = `[Array of ${parsed.length} elements]`;
                valueType = 'array';
              } else {
                displayValue = '{Object}';
                valueType = 'object';
              }
            } else {
              displayValue = String(value);
              valueType = typeof parsed;
            }
          } catch (e) {
            // Не JSON, просто строка
            displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            valueType = 'string';
          }
        }
        
        variables.push({
          key: key,
          value: value,
          displayValue: displayValue,
          type: valueType
        });
      }
      
      if (variables.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">' + this.t('editorUI.noVarsInLocalStorage') + '</div>';
        return;
      }
      
      // Сортируем по ключу
      variables.sort((a, b) => a.key.localeCompare(b.key));
      
      // Отображаем список переменных
      list.innerHTML = variables.map(v => `
        <div class="localstorage-variable-item" data-key="${this.escapeHtml(v.key)}" style="padding: 12px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; transition: background 0.2s;" 
             onmouseover="this.style.background='#f5f5f5'" 
             onmouseout="this.style.background='white'">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #2196F3; margin-bottom: 4px;">
                ${this.escapeHtml(v.key)}
              </div>
              <div style="font-size: 12px; color: #666; font-family: monospace; word-break: break-all;">
                ${this.escapeHtml(v.displayValue)}
              </div>
              <div style="font-size: 11px; color: #999; margin-top: 4px;">
                Тип: ${v.type}
              </div>
            </div>
          </div>
        </div>
      `).join('');
      
      // Добавляем обработчики клика
      list.querySelectorAll('.localstorage-variable-item').forEach(item => {
        item.addEventListener('click', () => {
          const key = item.dataset.key;
          const variable = variables.find(v => v.key === key);
          if (variable) {
            this.selectLocalStorageVariable(variable);
          }
        });
      });
      
    } catch (error) {
      console.error('Ошибка при загрузке переменных из localStorage:', error);
      list.innerHTML = '<div style="text-align: center; padding: 20px; color: #f44336;">' + this.t('editorUI.errorLoadingVarsFromLocalStorage') + '</div>';
      this.showToast(this.t('editorUI.errorLoadingVarsFromLocalStorage') + ': ' + error.message, 'error');
    }
  }

  /**
   * Выбирает переменную из localStorage
   */
  selectLocalStorageVariable(variable) {
    this.selectedLocalStorageVariable = variable;
    
    // Убираем выделение с других элементов
    document.querySelectorAll('.localstorage-variable-item').forEach(item => {
      item.style.border = '1px solid #ddd';
      item.style.background = 'white';
    });
    
    // Выделяем выбранный элемент
    const selectedItem = document.querySelector(`.localstorage-variable-item[data-key="${this.escapeHtml(variable.key)}"]`);
    if (selectedItem) {
      selectedItem.style.border = '2px solid #2196F3';
      selectedItem.style.background = '#e3f2fd';
    }
    
    // Показываем информацию о переменной
    const infoGroup = document.getElementById('localStorageVariableInfo');
    const nameGroup = document.getElementById('localStorageVariableNameGroup');
    const keySpan = document.getElementById('localStorageVarKey');
    const valueSpan = document.getElementById('localStorageVarValue');
    const typeSpan = document.getElementById('localStorageVarType');
    const nameInput = document.getElementById('localStorageVariableName');
    
    // Форматируем значение для отображения
    let displayValue = '';
    try {
      const parsed = JSON.parse(variable.value);
      if (typeof parsed === 'object') {
        displayValue = JSON.stringify(parsed, null, 2);
        if (displayValue.length > 200) {
          displayValue = displayValue.substring(0, 200) + '...';
        }
      } else {
        displayValue = String(variable.value);
        if (displayValue.length > 100) {
          displayValue = displayValue.substring(0, 100) + '...';
        }
      }
    } catch (e) {
      displayValue = String(variable.value);
      if (displayValue.length > 100) {
        displayValue = displayValue.substring(0, 100) + '...';
      }
    }
    
    keySpan.textContent = variable.key;
    valueSpan.textContent = displayValue;
    typeSpan.textContent = variable.type;
    
    // Предзаполняем имя переменной
    nameInput.value = variable.key;
    
    infoGroup.style.display = 'block';
    nameGroup.style.display = 'block';
    document.getElementById('saveLocalStorageVariable').disabled = false;
  }

  /**
   * Закрывает модальное окно выбора переменных из localStorage
   */
  closeLocalStorageVariablesModal() {
    const modal = document.getElementById('localStorageVariablesModal');
    if (modal) {
      modal.classList.remove('show');
    }
    this.selectedLocalStorageVariable = null;
    this.localStorageTabId = null;
  }

  /**
   * Сохраняет переменную из localStorage в тест
   */
  saveLocalStorageVariable() {
    if (!this.selectedLocalStorageVariable) {
      this.showToast(this.t('editorUI.selectVariableFromList'), 'error');
      return;
    }
    
    const varName = document.getElementById('localStorageVariableName').value.trim();
    if (!varName) {
      this.showToast(this.t('editorUI.enterVariableName'), 'error');
      return;
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
      this.showToast(this.t('editorUI.variableNameValidation'), 'error');
      return;
    }
    
    // Сохраняем переменную
    if (!this.test.variables) {
      this.test.variables = {};
    }
    
    // Сохраняем значение как есть (оно уже строка из localStorage)
    const value = this.selectedLocalStorageVariable.value;
    
    this.test.variables[varName] = {
      value: value,
      source: 'localStorage',
      localStorageKey: this.selectedLocalStorageVariable.key,
      type: this.selectedLocalStorageVariable.type,
      tabId: this.localStorageTabId
    };
    
    this.renderVariablesPanel();
    this.closeLocalStorageVariablesModal();
    this.showToast(this.t('editorUI.variableSavedFromLocalStorage', { name: varName, key: this.selectedLocalStorageVariable.key }), 'success');
  }

  /**
   * Инициализирует обработчики для модального окна переменных из localStorage
   */
  initLocalStorageVariablesModal() {
    const closeBtn = document.getElementById('closeLocalStorageVariablesModal');
    const cancelBtn = document.getElementById('cancelLocalStorageVariable');
    const saveBtn = document.getElementById('saveLocalStorageVariable');
    const tabSelect = document.getElementById('localStorageTabSelect');
    const loadBtn = document.getElementById('loadLocalStorageBtn');
    const nameInput = document.getElementById('localStorageVariableName');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeLocalStorageVariablesModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeLocalStorageVariablesModal());
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveLocalStorageVariable());
    }
    if (tabSelect) {
      tabSelect.addEventListener('change', () => this.onLocalStorageTabSelect());
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', () => this.loadLocalStorageVariables());
    }
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        const varName = nameInput.value.trim();
        document.getElementById('saveLocalStorageVariable').disabled = !varName || !this.selectedLocalStorageVariable;
      });
    }
  }

  /**
   * Показывает диалог с незаданными переменными
   * @param {string[]} missingVars - Массив имен незаданных переменных
   * @returns {Promise<boolean>} - true если продолжить, false если отменить
   */
  async showMissingVariablesDialog(missingVars) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('missingVariablesDialog');
      const list = document.getElementById('missingVarsList');
      const setVarsBtn = document.getElementById('setMissingVarsBtn');
      const continueBtn = document.getElementById('continueWithoutVarsBtn');
      const cancelBtn = document.getElementById('cancelMissingVarsBtn');
      const closeBtn = document.getElementById('closeMissingVarsDialog');

      // Очищаем предыдущие обработчики
      const newSetVarsBtn = setVarsBtn.cloneNode(true);
      const newContinueBtn = continueBtn.cloneNode(true);
      const newCancelBtn = cancelBtn.cloneNode(true);
      const newCloseBtn = closeBtn.cloneNode(true);
      
      setVarsBtn.parentNode.replaceChild(newSetVarsBtn, setVarsBtn);
      continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

      // Заполняем список переменных
      list.innerHTML = '';
      missingVars.forEach(varName => {
        const li = document.createElement('li');
        li.textContent = varName;
        li.style.marginBottom = '4px';
        list.appendChild(li);
      });

      // Обработчики
      newSetVarsBtn.addEventListener('click', async () => {
        dialog.classList.remove('show');
        const saved = await this.showSetMissingVariablesModal(missingVars);
        if (saved) {
          resolve(true); // Переменные заданы, можно продолжать
        } else {
          resolve(false); // Пользователь отменил
        }
      });

      newContinueBtn.addEventListener('click', () => {
        dialog.classList.remove('show');
        resolve(true); // Продолжить без переменных
      });

      const cancelHandler = () => {
        dialog.classList.remove('show');
        resolve(false); // Отменить запуск
      };

      newCancelBtn.addEventListener('click', cancelHandler);
      newCloseBtn.addEventListener('click', cancelHandler);

      // Закрытие при клике на фон
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          cancelHandler();
        }
      });

      // Показываем диалог
      dialog.classList.add('show');
    });
  }

  /**
   * Показывает модальное окно для задания значений незаданных переменных
   * @param {string[]} missingVars - Массив имен незаданных переменных
   * @returns {Promise<boolean>} - true если сохранено, false если отменено
   */
  async showSetMissingVariablesModal(missingVars) {
    return new Promise((resolve) => {
      const modal = document.getElementById('setMissingVariablesModal');
      const form = document.getElementById('missingVarsForm');
      const saveBtn = document.getElementById('saveMissingVarsBtn');
      const cancelBtn = document.getElementById('cancelSetMissingVarsBtn');
      const closeBtn = document.getElementById('closeSetMissingVarsModal');

      // Очищаем предыдущие обработчики
      const newSaveBtn = saveBtn.cloneNode(true);
      const newCancelBtn = cancelBtn.cloneNode(true);
      const newCloseBtn = closeBtn.cloneNode(true);
      
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

      // Очищаем форму
      form.innerHTML = '';

      // Создаем поля для каждой переменной
      const varInputs = {};
      missingVars.forEach(varName => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = varName;
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '4px';
        label.style.display = 'block';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input';
        input.id = `var_${varName}`;
        input.placeholder = this.t('editorUI.enterVariableValue', { name: varName });
        
        // Заполняем текущее значение, если переменная уже существует
        if (this.test && this.test.variables && this.test.variables[varName]) {
          input.value = this.test.variables[varName].value || '';
        }
        
        varInputs[varName] = input;
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        form.appendChild(formGroup);
      });

      // Обработчик сохранения
      newSaveBtn.addEventListener('click', async () => {
        try {
          // Инициализируем variables если их нет
          if (!this.test.variables) {
            this.test.variables = {};
          }

          // Сохраняем значения переменных
          let hasValues = false;
          for (const varName of missingVars) {
            const input = varInputs[varName];
            const value = input.value.trim();
            
            if (value) {
              hasValues = true;
              // Если переменная уже существует, обновляем значение
              if (this.test.variables[varName]) {
                this.test.variables[varName].value = value;
              } else {
                // Создаем новую переменную
                this.test.variables[varName] = {
                  value: value,
                  source: 'manual',
                  type: 'string'
                };
              }
            }
          }

          if (hasValues) {
            // Сохраняем тест
            await chrome.runtime.sendMessage({
              type: 'UPDATE_TEST',
              test: this.test
            });

            // Обновляем UI
            this.renderVariablesPanel();
            this.showToast(this.t('editorUI.variablesSaved'), 'success');
          }

          modal.classList.remove('show');
          resolve(hasValues);
        } catch (error) {
          console.error('❌ Ошибка при сохранении переменных:', error);
          this.showToast(this.t('editorUI.errorSavingVariables'), 'error');
          resolve(false);
        }
      });

      const cancelHandler = () => {
        modal.classList.remove('show');
        resolve(false);
      };

      newCancelBtn.addEventListener('click', cancelHandler);
      newCloseBtn.addEventListener('click', cancelHandler);

      // Закрытие при клике на фон
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cancelHandler();
        }
      });

      // Показываем модальное окно
      modal.classList.add('show');
    });
  }


}

// Инициализируем редактор
const testEditor = new TestEditor();

