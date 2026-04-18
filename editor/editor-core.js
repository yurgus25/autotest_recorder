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
    
    // Initialize Undo/Redo Manager
    if (window.UndoRedoManager) {
      this.undoManager = new window.UndoRedoManager({
        maxHistory: 50,
        onChange: (status) => {
          this.updateUndoRedoButtons(status);
        }
      });
    }
    
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

    // Кэшированные селекторы из Analysis
    this.cachedSelectors = [];
    this.cachedSelectorsUrl = null;
    /** Последний отчёт data-driven (для экспорта CSV); сбрасывается при смене теста. */
    this.lastDataDrivenReport = null;

    // Контракт поддерживаемых действий (загружается из shared/action-types.js)
    // ИСПРАВЛЕНИЕ #30: Используем единый источник истины
    if (window.ActionTypes) {
      this.runtimeSupportedActionTypes = window.ActionTypes.SUPPORTED_ACTION_TYPES;
      this.runtimeSupportedSubtypes = window.ActionTypes.SUPPORTED_SUBTYPES;
      this.runtimeUnsupportedQuickTemplates = window.ActionTypes.UNSUPPORTED_QUICK_TEMPLATES;
      this.runtimeUnsupportedActionTypes = window.ActionTypes.UNSUPPORTED_ACTION_TYPES || new Set();
    } else {
      console.error('❌ [Editor] shared/action-types.js не загружен!');
      // Fallback на старые значения для обратной совместимости
      this.runtimeSupportedActionTypes = new Set([
        'click', 'dblclick', 'input', 'change', 'navigation', 'scroll',
        'wait', 'keyboard', 'api', 'variable', 'setVariable', 'assertion',
        'loop', 'condition', 'try-catch', 'javascript', 'screenshot', 'hover', 'focus',
        'blur', 'clear', 'upload', 'cookie', 'analysis', 'adaptive'
      ]);
      this.runtimeSupportedSubtypes = {
        wait: new Set(['wait-value', 'wait-option', 'wait-options-count', 'wait-enabled', 'wait-until', 'wait-visible', 'wait-hidden', 'wait-exists', 'wait-not-exists']),
        assertion: new Set(['assert-value', 'assert-contains', 'assert-count', 'assert-disabled', 'assert-multiselect', 'assert-visible', 'assert-hidden', 'assert-exists', 'assert-not-exists', 'assert-visual-regression']),
        scroll: new Set(['scroll-element', 'scroll-top', 'scroll-bottom']),
        navigation: new Set(['nav-url', 'nav-refresh', 'nav-back', 'nav-forward', 'new-tab', 'switch-tab', 'close-tab', 'nav-get-url']),
        click: new Set(['click', 'right-click', 'double-click', 'dropdown-select', 'dropdown-multiselect', 'dropdown-deselect', 'dropdown-select-all', 'dropdown-clear-all', 'dropdown-toggle-all', 'dropdown-copy', 'dropdown-paste', 'dropdown-reorder']),
        input: new Set(['input-text', 'dropdown-datalist', 'dropdown-combobox', 'keyboard-typeahead']),
        keyboard: new Set(['press-key', 'keyboard-navigate', 'keyboard-escape']),
        cookie: new Set(['set-cookie', 'get-cookies']),
        screenshot: new Set(['visual-screenshot', 'page-screenshot', 'page-screenshot-full']),
        analysis: new Set(['analysis-selectors', 'analysis-fill-fields', 'analysis-validate', 'analysis-forms', 'analysis-links', 'analysis-performance']),
        adaptive: new Set(['adaptive-single', 'adaptive-auto', 'adaptive-flow'])
      };
      this.runtimeUnsupportedActionTypes = new Set(['ai', 'cloud', 'suite', 'mobile']);
      this.runtimeUnsupportedQuickTemplates = new Set([
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
    if (!this.test) {
      return;
    }

    // Обновляем кнопку группировки после загрузки теста
    this.updateGroupingButton();

    this.fullRunBtn = document.getElementById('fullRun');
    this.optimizedRunBtn = document.getElementById('optimizedRun');
    this.debugRunBtn = document.getElementById('debugRun');
    this.optimizationStatusEl = document.getElementById('optimizationStatus');

    // Привязываем обработчики
    document.getElementById('saveTest').addEventListener('click', () => this.saveTest());
    const saveAsBtn = document.getElementById('saveAsTest');
    if (saveAsBtn) {
      saveAsBtn.addEventListener('click', () => this.saveTestAs());
    }
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
    if (typeof this.initDataDrivenModal === 'function') {
      this.initDataDrivenModal();
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
      
      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (this.undoManager) {
          const previousState = this.undoManager.undo();
          if (previousState) {
            this.test = previousState;
            this.renderActions();
            this.saveTest();
          }
        }
        return;
      }
      
      // Ctrl+Shift+Z or Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        if (this.undoManager) {
          const nextState = this.undoManager.redo();
          if (nextState) {
            this.test = nextState;
            this.renderActions();
            this.saveTest();
          }
        }
        return;
      }
      
      // Ctrl+D - Duplicate selected step
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        const selectedStep = document.querySelector('.action-item.selected');
        if (selectedStep) {
          const index = parseInt(selectedStep.dataset.index, 10);
          if (!isNaN(index) && this.test.actions[index]) {
            const duplicated = JSON.parse(JSON.stringify(this.test.actions[index]));
            this.test.actions.splice(index + 1, 0, duplicated);
            this.renderActions();
            this.saveTest();
          }
        }
        return;
      }
      
      // Delete - Remove selected step
      if (e.key === 'Delete') {
        e.preventDefault();
        const selectedStep = document.querySelector('.action-item.selected');
        if (selectedStep) {
          const index = parseInt(selectedStep.dataset.index, 10);
          if (!isNaN(index)) {
            this.deleteAction(index);
          }
        }
        return;
      }
      
      // Arrow Up - Select previous step
      if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const selectedStep = document.querySelector('.action-item.selected');
        if (selectedStep && selectedStep.previousElementSibling) {
          selectedStep.classList.remove('selected');
          selectedStep.previousElementSibling.classList.add('selected');
          const prevEl = selectedStep.previousElementSibling;
          const scrollRet = prevEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          if (scrollRet && typeof scrollRet.catch === 'function') scrollRet.catch(() => {});
        } else if (!selectedStep) {
          const firstStep = document.querySelector('.action-item');
          if (firstStep) firstStep.classList.add('selected');
        }
        return;
      }
      
      // Arrow Down - Select next step
      if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const selectedStep = document.querySelector('.action-item.selected');
        if (selectedStep && selectedStep.nextElementSibling) {
          selectedStep.classList.remove('selected');
          selectedStep.nextElementSibling.classList.add('selected');
          const nextEl = selectedStep.nextElementSibling;
          const scrollRet2 = nextEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          if (scrollRet2 && typeof scrollRet2.catch === 'function') scrollRet2.catch(() => {});
        } else if (!selectedStep) {
          const firstStep = document.querySelector('.action-item');
          if (firstStep) firstStep.classList.add('selected');
        }
        return;
      }
      
      // Ctrl+F - Search steps
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.showSearchDialog();
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
    if (this.test && !this.test.variables) {
      this.test.variables = {};
    }
    if (this.test) {
      this.renderVariablesPanel();
    }

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

      // Быстрая смена типа по клику на бейдж действия (без дополнительных кнопок)
      const typeBadge = e.target.closest('.action-type-badge[data-action="quick-cycle-type"]');
      if (typeBadge) {
        e.preventDefault();
        e.stopPropagation();
        const indexStr = typeBadge.getAttribute('data-action-index');
        if (indexStr != null) {
          this.quickCycleActionType(indexStr);
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
      if (action === 'add-action-to-branch' || action === 'add-action-to-loop' || action === 'add-action-to-try' || action === 'add-action-to-catch' || action === 'add-action-to-finally') {
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
        
        if (action === 'add-action-to-try') {
          e.preventDefault();
          e.stopPropagation();
          this.showAddActionToTryCatchModal(index, 'try');
          return;
        }
        
        if (action === 'add-action-to-catch') {
          e.preventDefault();
          e.stopPropagation();
          this.showAddActionToTryCatchModal(index, 'catch');
          return;
        }
        
        if (action === 'add-action-to-finally') {
          e.preventDefault();
          e.stopPropagation();
          this.showAddActionToTryCatchModal(index, 'finally');
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
        const match = indexStr.match(/(loop|then|else|try|catch|finally)-(\d+)-(\d+)/);
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
        case 'analysis-set-url':
          if (!isNestedAction && this.test && this.test.actions[index]?.type === 'analysis') {
            e.preventDefault();
            e.stopPropagation();
            const subtype = button.getAttribute('data-analysis-subtype') || 'analysis-selectors';
            const description = this.getAnalysisSubtypeName(subtype);
            this.showAnalysisTabPickerDialog(subtype, description, index);
          }
          break;
        case 'analysis-clear-result':
          if (!isNestedAction && this.test && this.test.actions[index]?.type === 'analysis') {
            e.preventDefault();
            e.stopPropagation();
            delete this.test.actions[index].analysisResult;
            this.renderActions();
          }
          break;
        case 'analysis-open-dashboard':
          if (!isNestedAction && this.test && this.test.actions[index]?.type === 'analysis') {
            e.preventDefault();
            e.stopPropagation();
            // Открыть Performance Dashboard в новой вкладке с testId для корректной загрузки данных
            const baseUrl = chrome.runtime.getURL('performance/performance-dashboard.html');
            const testId = this.test?.id ? String(this.test.id) : new URLSearchParams(window.location.search).get('testId');
            const dashboardUrl = testId ? `${baseUrl}?testId=${testId}` : baseUrl;
            chrome.tabs.create({ url: dashboardUrl });
          }
          break;
        case 'analysis-toggle-broken-links':
          if (!isNestedAction) {
            e.preventDefault();
            e.stopPropagation();
            const listEl = document.getElementById(`analysisBrokenLinks-${index}`);
            const expanded = button.getAttribute('data-expanded') === 'true';
            if (listEl) {
              listEl.style.display = expanded ? 'none' : 'block';
              button.setAttribute('data-expanded', !expanded);
              button.innerHTML = button.innerHTML.replace(expanded ? '▴' : '▾', expanded ? '▾' : '▴');
            }
          }
          break;
        case 'analysis-toggle-validation':
          if (!isNestedAction) {
            e.preventDefault();
            e.stopPropagation();
            const listEl = document.getElementById(`analysisValidation-${index}`);
            const expanded = button.getAttribute('data-expanded') === 'true';
            if (listEl) {
              listEl.style.display = expanded ? 'none' : 'block';
              button.setAttribute('data-expanded', !expanded);
              button.innerHTML = button.innerHTML.replace(expanded ? '▴' : '▾', expanded ? '▾' : '▴');
            }
          }
          break;
        case 'analysis-toggle-validate-issues':
          if (!isNestedAction) {
            e.preventDefault();
            e.stopPropagation();
            const listEl = document.getElementById(`analysisValidateIssues-${index}`);
            const expanded = button.getAttribute('data-expanded') === 'true';
            if (listEl) {
              listEl.style.display = expanded ? 'none' : 'block';
              button.setAttribute('data-expanded', !expanded);
              button.innerHTML = button.innerHTML.replace(expanded ? '▴' : '▾', expanded ? '▾' : '▴');
            }
          }
          break;
        case 'analysis-toggle-forms':
          if (!isNestedAction) {
            e.preventDefault();
            e.stopPropagation();
            const listEl = document.getElementById(`analysisForms-${index}`);
            const expanded = button.getAttribute('data-expanded') === 'true';
            if (listEl) {
              listEl.style.display = expanded ? 'none' : 'block';
              button.setAttribute('data-expanded', !expanded);
              button.innerHTML = button.innerHTML.replace(expanded ? '▴' : '▾', expanded ? '▾' : '▴');
            }
          }
          break;
        case 'analysis-toggle-debug':
          if (!isNestedAction) {
            e.preventDefault();
            e.stopPropagation();
            const debugEl = document.getElementById(`analysisDebug-${index}`);
            const expanded = button.getAttribute('data-expanded') === 'true';
            if (debugEl) {
              debugEl.style.display = expanded ? 'none' : 'block';
              button.setAttribute('data-expanded', !expanded);
              button.innerHTML = button.innerHTML.replace(expanded ? '▴' : '▾', expanded ? '▾' : '▴');
              
              // ИСПРАВЛЕНО: Добавляем tabindex только один раз при первом раскрытии
              if (!expanded && !debugEl.hasAttribute('data-handlers-added')) {
                // Ctrl+A handler
                debugEl.addEventListener('keydown', function(e) {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                    e.preventDefault();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(debugEl);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                });
                
                // Делаем focusable для Ctrl+A
                debugEl.setAttribute('tabindex', '0');
                debugEl.setAttribute('data-handlers-added', 'true');
                
                // Focus для возможности Ctrl+A
                setTimeout(() => debugEl.focus(), 100);
              }
            }
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
        case 'adaptive-view-report':
          e.preventDefault();
          e.stopPropagation();
          if (!isNestedAction && this.test && this.test.actions[index]) {
            const adaptiveAction = this.test.actions[index];
            if (adaptiveAction.type === 'adaptive' && adaptiveAction._runHistory?.length > 0) {
              this.openAdaptiveReport(adaptiveAction);
            }
          }
          break;
      }
    });

    // Обработчик клика на кэшированный селектор из Analysis
    document.addEventListener('click', (e) => {
      const cachedSelector = e.target.closest('.cached-selector');
      if (cachedSelector) {
        e.preventDefault();
        e.stopPropagation();
        
        const selector = cachedSelector.getAttribute('data-selector');
        if (selector) {
          // Находим ближайшее поле ввода селектора
          const dropdown = cachedSelector.closest('.selector-dropdown');
          if (dropdown) {
            const actionIndex = dropdown.getAttribute('data-selector-dropdown');
            const selectorInput = document.querySelector(`input[name="selector"][data-action-index="${actionIndex}"]`) ||
                                  document.querySelector(`input[name="selector"]`);
            
            if (selectorInput) {
              selectorInput.value = selector;
              selectorInput.dispatchEvent(new Event('input', { bubbles: true }));
              selectorInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Закрываем dropdown
              dropdown.classList.remove('open');
              
              this.showToast(this.t('editorUI.useCachedSelector') || 'Selector applied from cache', 'success');
            }
          }
        }
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
      } else if (message.type === 'DATA_DRIVEN_RUN_COMPLETED' && this.test && message.summary && String(message.summary.testId) === String(this.test.id)) {
        const s = message.summary;
        this.lastDataDrivenReport = s;
        if (typeof this.updateDataDrivenExportUi === 'function') {
          this.updateDataDrivenExportUi();
        }
        const ok = s.allPassed;
        const n = s.totalRows || 0;
        const failed = (s.results || []).filter(r => !r.success).length;
        this.showToast(
          ok
            ? this.t('editorUI.dataDrivenAllPassed', { count: n })
            : this.t('editorUI.dataDrivenSomeFailed', { total: n, failed }),
          ok ? 'success' : 'warning'
        );
      } else if (message.type === 'TEST_COMPLETED' && this.test && message.testId === this.test.id) {
        if (message.adaptiveRunResults && Array.isArray(message.adaptiveRunResults) && this.test.actions) {
          message.adaptiveRunResults.forEach((result, idx) => {
            if (result && this.test.actions[idx]?.type === 'adaptive') {
              this.test.actions[idx]._runHistory = result._runHistory || [];
              if (result._statistics) this.test.actions[idx]._statistics = result._statistics;
            }
          });
        }
        if (message.actionUrlUpdates?.length && this.test.actions) {
          message.actionUrlUpdates.forEach(({ index, url }) => {
            if (this.test.actions[index]?.type === 'analysis' && url) {
              this.test.actions[index].url = url;
            }
          });
        }
        if (message.adaptiveRunResults || message.actionUrlUpdates?.length) {
          this.renderActions();
        }
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

  _clearLoadingState(errorHtml = null) {
    const actionsList = document.getElementById('actionsList');
    if (!actionsList) return;
    if (errorHtml) {
      actionsList.innerHTML = errorHtml;
    } else if (this.test?.actions?.length > 0) {
      this.renderActions();
    } else {
      actionsList.innerHTML = '<div class="empty-state">' + (this.t('editorUI.noActionsStart') || 'No steps') + '</div>';
    }
  }

  async loadTest(testId, options = {}) {
    const { silent = false } = options;
    if (this.lastDataDrivenReport && String(this.lastDataDrivenReport.testId) !== String(testId)) {
      this.lastDataDrivenReport = null;
    }
    const actionsList = document.getElementById('actionsList');
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 200));
      }
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 300 * attempt));
            continue;
          }
          this._clearLoadingState('<div class="empty-state" style="color:#c00">' + (this.t('editorUI.extensionNotReady') || 'Extension not ready. Refresh the page.') + '</div>');
          if (!silent) alert(this.t('editorUI.extensionNotReady'));
          return;
        }

        const response = await chrome.runtime.sendMessage({
          type: 'GET_TEST',
          testId: testId
        });

        if (!response) {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 300 * attempt));
            continue;
          }
          // Не показываем пользователю техническую ошибку канала — пробуем fallback из storage ниже.
          console.warn('⚠️ [Editor] GET_TEST: background не вернул ответ, пробую fallback из storage');
        }

        if (response?.success && response.test) {
          this.test = response.test;
          if (!this.test.actions) this.test.actions = [];
          // Порядок шагов (actions) не меняется: отображаем и сохраняем строго в порядке массива.
          document.getElementById('testName').value = this.test.name;
          if (!this.test.variables) this.test.variables = {};
          if (this.test.actions.length > 0) {
            this.extractVariablesFromActions(this.test.actions);
          }
          this._clearLoadingState();
          this.renderMetadata();
          this.refreshOptimizationUI();
          this.loadTestGroupContext().catch(() => {});
          if (typeof this.updateDataDrivenExportUi === 'function') this.updateDataDrivenExportUi();
          return;
        }

        // Fallback: загрузка напрямую из storage (если background ещё не инициализирован или тест не в памяти)
        if ((!response || !response.test) && (attempt === 1 || attempt === maxRetries)) {
          try {
            const stored = await chrome.storage.local.get('tests');
            const testsObj = stored?.tests || {};
            const testIdStr = String(testId);
            let test = testsObj[testIdStr] || testsObj[testId] || (typeof testId === 'string' && /^\d+$/.test(testId) ? testsObj[Number(testId)] : null);
            if (test) {
              this.test = test;
              if (!this.test.actions) this.test.actions = [];
              document.getElementById('testName').value = this.test.name;
              if (!this.test.variables) this.test.variables = {};
              if (this.test.actions.length > 0) {
                this.extractVariablesFromActions(this.test.actions);
              }
              this._clearLoadingState();
              this.renderMetadata();
              this.refreshOptimizationUI();
              this.loadTestGroupContext().catch(() => {});
              if (typeof this.updateDataDrivenExportUi === 'function') this.updateDataDrivenExportUi();
              return;
            }
          } catch (storageErr) {
            console.warn('⚠️ [Editor] Fallback из storage не удался:', storageErr);
          }
        }

        const errorMsg = response?.error || this.t('editorUI.testNotFound');
        this._clearLoadingState('<div class="empty-state" style="color:#c00">' + (errorMsg || 'Test not found') + '</div>');
        if (!silent) {
          alert(errorMsg);
          window.close();
        }
        return;
      } catch (error) {
        lastError = error;
        const errorMessage = error?.message || String(error) || this.t('common.unknownError');
        if ((errorMessage.includes('Receiving end does not exist') || errorMessage.includes('Extension context invalidated') || errorMessage.includes('Could not establish connection')) && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
        break;
      }
    }

    const errorMsg = (lastError?.message || String(lastError) || this.t('common.unknownError')).replace('[object Object]', this.t('common.unknownError'));
    console.error('❌ Ошибка при загрузке теста:', errorMsg);
    this._clearLoadingState('<div class="empty-state" style="color:#c00">' + (this.t('editorUI.testLoadError') || 'Load error') + ': ' + (errorMsg.length > 80 ? errorMsg.slice(0, 80) + '...' : errorMsg) + '</div>');
    if (!silent) {
      if (errorMsg.includes('quota') || errorMsg.includes('QUOTA')) {
        alert(this.t('editorUI.storageQuotaExceeded'));
      } else if (errorMsg.includes('undefined')) {
        alert(this.t('editorUI.testLoadError'));
      } else {
        alert(this.t('editorUI.testLoadErrorDetail', { error: errorMsg }));
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
    // Учитываем stepSpan у adaptive-шагов: один шаг может занимать несколько номеров
    let visibleCount = 0;
    for (let i = 0; i < actionIndex; i++) {
      const action = this.test.actions[i];
      if (!action.hidden) {
        const span = (action.type === 'adaptive' && action.stepSpan > 0) ? action.stepSpan : 1;
        visibleCount += span;
      }
    }
    
    // Номер текущего шага: для adaptive с stepSpan > 1 показываем диапазон (например 5-14)
    const currentSpan = (currentAction?.type === 'adaptive' && currentAction?.stepSpan > 0) ? currentAction.stepSpan : 1;
    const startNum = visibleCount + 1;
    return currentSpan > 1 ? `${startNum}-${startNum + currentSpan - 1}` : startNum;
  }


  // ========================================================================
  // Дополнительные методы загружаются из модулей:
  //   editor-render.js, editor-utils.js, editor-action-modal.js, 
  //   editor-save.js, editor-ui-helpers.js, editor-metadata.js,
  //   editor-control-flow.js, editor-variables.js, editor-variables-ext.js,
  //   editor-advanced.js
  // ========================================================================
}

// Expose class for module registration
window._TestEditorClass = TestEditor;
