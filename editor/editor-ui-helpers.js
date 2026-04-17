/**
 * AutoTest Recorder - Editor Module
 * UI helpers: closeModal, toast, helpers, drag-and-drop
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-ui-helpers
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-ui-helpers.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.closeModal = function() {
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
  this.currentEditAction = null;
}

/**
 * Показывает toast-уведомление
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип уведомления: 'success' или 'error'
 */
TestEditor.prototype.copyToClipboard = function(text) {
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

TestEditor.prototype.fallbackCopyToClipboard = function(text) {
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

TestEditor.prototype.showToast = function(message, type = 'success') {
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
/**
 * Находит индекс действия с маркером записи
 * @returns {number|null} Индекс маркера или null, если маркер не найден
 */
TestEditor.prototype.findRecordMarkerIndex = function() {
  if (!this.test || !this.test.actions) return null;
  
  for (let i = 0; i < this.test.actions.length; i++) {
    if (this.test.actions[i].recordMarker === true) {
      return i;
    }
  }
  return null;
}

TestEditor.prototype.startRecordingIntoTest = async function() {
  if (!this.test || !this.test.id) {
    this.showToast(this.t('editorUI.testNotSpecified') || 'Test not loaded', 'error');
    return;
  }

  // Ищем маркер записи в тесте
  const markerIndex = this.findRecordMarkerIndex();
  const insertAfterIndex = markerIndex !== null ? markerIndex : undefined;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING_INTO_TEST',
      testId: this.test.id,
      insertAfterIndex
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

TestEditor.prototype.saveTest = async function() {
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

    let response = await chrome.runtime.sendMessage({
      type: 'UPDATE_TEST',
      test: this.test
    });

    if (!response) {
      // Временный null-ответ из MV3 канала: короткий ретрай вместо ошибки пользователю.
      await new Promise(r => setTimeout(r, 250));
      response = await chrome.runtime.sendMessage({
        type: 'UPDATE_TEST',
        test: this.test
      });
      if (!response) {
        if (!this.saveTestAttempts) this.saveTestAttempts = 0;
        this.saveTestAttempts++;
        if (this.saveTestAttempts < 5) {
          setTimeout(() => this.saveTest(), 400 * this.saveTestAttempts);
          return;
        }
        this.showToast(this.t('editorUI.saveError') + ': ' + this.t('popup.backgroundNotResponding'), 'warning');
        return;
      }
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

TestEditor.prototype.saveTestAs = async function() {
  if (!this.test) {
    this.showToast(this.t ? this.t('editorUI.testNotLoaded') : 'Test not loaded', 'error');
    return;
  }

  const currentName = document.getElementById('testName').value.trim() || this.test.name || '';
  const defaultName = currentName ? `${currentName} - копия` : '';
  const promptText = this.t
    ? (this.t('editorUI.saveAsPrompt') || 'Введите новое имя для копии теста')
    : 'Введите новое имя для копии теста';

  const newName = window.prompt(promptText, defaultName);
  if (!newName) {
    return;
  }

  const trimmedName = newName.trim();
  if (!trimmedName) {
    return;
  }

  const nowIso = new Date().toISOString();
  const cloned = JSON.parse(JSON.stringify(this.test));
  cloned.id = Date.now().toString();
  cloned.name = trimmedName;
  cloned.createdAt = nowIso;
  cloned.updatedAt = nowIso;
  cloned.lastEditedBy = 'user';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_TEST',
      test: cloned
    });

    if (response && response.success) {
      this.test = cloned;
      const nameInput = document.getElementById('testName');
      if (nameInput) {
        nameInput.value = trimmedName;
      }
      const url = new URL(window.location.href);
      url.searchParams.set('testId', cloned.id);
      window.history.replaceState({}, '', url.toString());

      this.renderMetadata();
      this.showToast(
        this.t ? (this.t('editorUI.testSavedAs') || this.t('editorUI.testSaved')) : 'Test copy saved',
        'success'
      );
    } else {
      const errorCode = response?.error;
      if (errorCode === 'FREE_TIER_LIMIT') {
        this.showToast(
          this.t ? this.t('popup.freeTierTestsLimitReached') : 'Free tier test limit reached',
          'error'
        );
      } else {
        const msg = response?.error || (this.t ? this.t('common.unknownError') : 'Unknown error');
        this.showToast(
          (this.t ? this.t('editorUI.saveError') : 'Error saving test') + ': ' + msg,
          'error'
        );
      }
    }
  } catch (error) {
    const msg = error?.message || (this.t ? this.t('common.unknownError') : 'Unknown error');
    this.showToast(
      (this.t ? this.t('editorUI.saveError') : 'Error saving test') + ': ' + msg,
      'error'
    );
  }
}

TestEditor.prototype.playTest = async function(mode = null, options = {}) {
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

    if (actionsToCheck.length === 0) {
      this.showToast(this.t ? this.t('popup.noStepsToPlay') : 'This test has no steps to run.', 'warning');
      return;
    }

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
    
    // Передаём текущее состояние теста из редактора (включая снятие скрытия шагов),
    // чтобы воспроизведение использовало то, что видит пользователь, а не только сохранённую копию.
    let response;
    const sendPlayRequest = () => chrome.runtime.sendMessage({
      type: 'PLAY_TEST',
      testId: this.test.id,
      test: this.test,
      mode: actualMode,
      debugMode: debugMode,
    });
    try {
      response = await sendPlayRequest();
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
      await new Promise(r => setTimeout(r, 250));
      response = await sendPlayRequest().catch(() => null);
      if (!response) {
        // Не показываем фатальную ошибку: просим пользователя повторить, но без блокирующего alert.
        this.showToast(this.t('popup.backgroundNotResponding'), 'warning');
        return;
      }
    }

    if (response?.success) {
      const modeLabel = mode === 'full' ? this.t('editorUI.fullRun') : this.t('editorUI.optimizedRun');
      
      // Если тест без визуальных действий and запускается из редактора, показываем другое сообщение
      if (!hasVisualActions && isEditorPage) {
        alert(this.t('editorUI.runStartedEditor', { mode: modeLabel }));
      } else {
        alert(this.t('editorUI.runStarted', { mode: modeLabel }));
      }
    } else {
      if (response.error === 'NO_STEPS_TO_PLAY') {
        this.showToast(this.t ? this.t('popup.noStepsToPlay') : 'This test has no steps to run.', 'warning');
      } else {
        const hint = typeof window !== 'undefined' && window.i18n && typeof window.i18n.playbackUserMessage === 'function'
          ? window.i18n.playbackUserMessage(response.error)
          : ((this.t ? this.t('editorUI.playbackError') : 'Playback error') + ': ' + (response.error || ''));
        alert(hint);
      }
    }
  } catch (error) {
    console.error('Error playing test:', error);
    const hint = typeof window !== 'undefined' && window.i18n && typeof window.i18n.playbackUserMessage === 'function'
      ? window.i18n.playbackUserMessage(error && error.message)
      : this.t('editorUI.playbackError2');
    alert(hint);
  }
}

/**
 * Проверяет наличие обязательных переменных в тесте
 * @param {string} mode - Режим запуска ('full' или 'optimized')
 * @returns {Array<string>} Список отсутствующих переменных
 */
TestEditor.prototype.checkRequiredVariables = function(mode = 'optimized') {
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

TestEditor.prototype.initDragAndDrop = function() {
  const actionsList = document.getElementById('actionsList');
  let lastMousedownTarget = null;

  // Запоминаем элемент, по которому был mousedown (для проверки в dragstart)
  actionsList.addEventListener('mousedown', (e) => {
    lastMousedownTarget = e.target;
  }, true);
  actionsList.addEventListener('mouseup', () => {
    lastMousedownTarget = null;
  }, true);

  const isInSelectableArea = (el) => el && (
    el.closest('.analysis-debug-json') ||
    el.closest('.analysis-debug-content') ||
    el.closest('.analysis-broken-links-list') ||
    el.closest('.analysis-validation-errors-list') ||
    el.closest('.analysis-validate-issues-list') ||
    el.closest('.analysis-forms-list')
  );

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
      // Не начинаем drag, если mousedown был по номеру, кнопке или полю с выделяемым текстом
      const mousedownEl = lastMousedownTarget;
      if (mousedownEl && (mousedownEl.closest('.clickable-number') || mousedownEl.closest('button') || isInSelectableArea(mousedownEl))) {
        e.preventDefault();
        e.stopImmediatePropagation();
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
      
      // Не начинаем drag, если mousedown был по номеру, кнопке или полю с выделяемым текстом
      const mousedownEl = lastMousedownTarget;
      if (mousedownEl && (mousedownEl.closest('.clickable-number') || mousedownEl.closest('button') || mousedownEl.closest('input') || mousedownEl.closest('select') || isInSelectableArea(mousedownEl))) {
        e.preventDefault();
        e.stopImmediatePropagation();
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

TestEditor.prototype.getDragAfterElement = function(container, y) {
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

TestEditor.prototype.moveAction = function(fromIndex, toIndex) {
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
TestEditor.prototype.editStepNumber = function(actionIndex, numberElement) {
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

TestEditor.prototype.escapeHtml = function(text) {
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
 * Обрезает текст по границе слова; если обрезали — добавляет троеточие.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
TestEditor.prototype._truncateAtWord = function(text, maxLen) {
  if (!text || typeof text !== 'string') return '';
  const s = text.trim();
  if (s.length <= maxLen) return s;
  const chunk = s.substring(0, maxLen + 1);
  const lastSpace = chunk.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) {
    return s.substring(0, lastSpace).trim() + '...';
  }
  return s.substring(0, maxLen - 3) + '...';
}

/**
 * Возвращает подпись типа элемента только для отображения (не в сам селектор).
 * @param {{ element?: string, inputType?: string }} sel - объект селектора с полями element (tagName), inputType
 * @returns {string} например " [Кнопка]" или ""
 */
TestEditor.prototype._getElementTypeDisplaySuffix = function(sel) {
  if (!sel) return '';
  const tag = (sel.element || '').toLowerCase();
  const inputType = (sel.inputType || '').toLowerCase();
  if (tag === 'button') return ' [' + (this.t('editorUI.elButton') || 'Button') + ']';
  if (tag === 'a') return ' [' + (this.t('editorUI.elLink') || 'Link') + ']';
  if (tag === 'input') {
    if (inputType === 'checkbox') return ' [' + (this.t('editorUI.elCheckbox') || 'Checkbox') + ']';
    if (inputType === 'radio') return ' [' + (this.t('editorUI.elRadio') || 'Radio') + ']';
    if (inputType === 'submit' || inputType === 'button') return ' [' + (this.t('editorUI.elSubmitButton') || 'Submit button') + ']';
    return ' [' + (this.t('editorUI.elInput') || 'Input') + ']';
  }
  if (tag === 'select') return ' [' + (this.t('editorUI.elSelect') || 'Dropdown') + ']';
  if (tag === 'textarea') return ' [' + (this.t('editorUI.elTextarea') || 'Text area') + ']';
  if (tag === 'div' || tag === 'span') return ' [' + (this.t('editorUI.elElement') || 'Element') + ']';
  if (tag) return ' [' + (this.t('editorUI.elElement') || 'Element') + ']';
  return '';
}

/**
 * Translate a key using i18n system
 * @param {string} key - Translation key (e.g. 'editorUI.expandAll')
 * @param {Object} [params] - Optional interpolation parameters
 * @returns {string} Translated string
 */
TestEditor.prototype.t = function(key, params) {
  if (window.i18n && typeof window.i18n.t === 'function') {
    return window.i18n.t(key, params);
  }
  return key; // Fallback to key if i18n not available
}

/**
 * Загружает контекст группы для текущего теста (предыдущий/следующий тест в группе).
 */
TestEditor.prototype.loadTestGroupContext = async function() {
  if (!this.test || !this.test.id || !chrome.runtime?.id) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TESTS' });
    if (!response?.tests || !response?.groups) return;
    const tests = response.tests || [];
    const groups = Array.isArray(response.groups) ? response.groups : [];
    const testIdStr = String(this.test.id);
    const testById = new Map(tests.map(t => [String(t.id), t]));
    for (const group of groups) {
      const ids = (group.testIds || []).map(String);
      const idx = ids.indexOf(testIdStr);
      if (idx === -1) continue;
      const prevId = idx > 0 ? ids[idx - 1] : null;
      const nextId = idx < ids.length - 1 ? ids[idx + 1] : null;
      this.testGroupContext = {
        group,
        index: idx + 1,
        total: ids.length,
        prevTestId: prevId,
        nextTestId: nextId,
        prevTestName: prevId ? (testById.get(prevId)?.name || prevId) : null,
        nextTestName: nextId ? (testById.get(nextId)?.name || nextId) : null
      };
      this.renderMetadata();
      return;
    }
    this.testGroupContext = null;
    this.renderMetadata();
  } catch (e) {
    this.testGroupContext = null;
  }
}

/**
 * Отображает метаданные теста (дата создания, изменения, кто правил) и контекст группы (пред./след. тест).
 */
})();
