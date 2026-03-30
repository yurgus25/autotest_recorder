/**
 * AutoTest Recorder - Editor Module
 * Variables panel, URL extract, page grabber, localStorage variables
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-variables-ext
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-variables-ext.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

// ==================== ПАНЕЛЬ ПЕРЕМЕННЫХ СЦЕНАРИЯ ====================

TestEditor.prototype.initVariablesPanel = function() {
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

TestEditor.prototype.toggleVariablesPanel = function() {
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
TestEditor.prototype.getVariableCategory = function(varName, varData) {
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
    const escapedVarName = String(varName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let varPattern;
    try {
      varPattern = new RegExp(`\\{var:${escapedVarName}\\}`, 'g');
    } catch (e) {
      return categories;
    }
    
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

TestEditor.prototype.renderVariablesPanel = function() {
  const list = document.getElementById('variablesList');
  const content = document.getElementById('variablesContent');
  const toggle = document.getElementById('toggleVariablesPanel');
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
    if (content && toggle) {
      content.classList.add('collapsed');
      toggle.textContent = '▶';
    }
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
    list.innerHTML = `<div class="no-variables">${this.t('editorUI.noVarsForFilter', { filterLabel })}</div>`;
    return;
  } else if (content && toggle) {
    // Есть хотя бы одна переменная для отображения — разворачиваем панель
    content.classList.remove('collapsed');
    toggle.textContent = '▼';
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
          <button class="var-action-btn" data-var-name="${this.escapeHtml(name)}" title="${this.t('editorUI.editBtn') || 'Edit'}">✏️</button>
          <button class="var-action-btn" data-var-name="${this.escapeHtml(name)}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">🗑️</button>
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

TestEditor.prototype.showAddVariableModal = function() {
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

TestEditor.prototype.closeVariableModal = function() {
  const modal = document.getElementById('variableModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
}

TestEditor.prototype.saveVariable = async function() {
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

TestEditor.prototype.editVariable = function(varName) {
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

TestEditor.prototype.deleteVariableFromPanel = function(varName) {
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

TestEditor.prototype.showUrlExtractModal = function() {
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

TestEditor.prototype.closeUrlExtractModal = function() {
  const modal = document.getElementById('urlExtractModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
}

TestEditor.prototype.saveUrlExtract = async function() {
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
      try {
        const match = url.match(new RegExp(pattern));
        extractedValue = match ? (match[1] || match[0]) : '';
      } catch (e) {
        alert(this.t('editorUI.extractionError', { error: 'Invalid regex: ' + (e.message || '') }));
        return;
      }
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

TestEditor.prototype.startPageGrabber = function() {
  this.showPageGrabberModal();
}

/**
 * Инициализирует обработчики для модального окна извлечения переменной со страницы
 */
TestEditor.prototype.initPageGrabberModal = function() {
  const closeBtn = document.getElementById('closePageGrabberModal');
  const cancelBtn = document.getElementById('cancelPageGrabber');
  const saveBtn = document.getElementById('savePageGrabber');
  const tabSelect = document.getElementById('pageGrabberTabSelect');
  const selectBtn = document.getElementById('pageGrabberSelectBtn');
  const extractType = document.getElementById('pageGrabberExtractType');
  const regexInput = document.getElementById('pageGrabberRegex');
  const varNameInput = document.getElementById('pageGrabberVarName');
  const modeSelect = document.getElementById('pageGrabberMode');
  const analyzeBtn = document.getElementById('pageGrabberAnalyzeBtn');
  const selectAllBtn = document.getElementById('pageGrabberSelectAll');
  const deselectAllBtn = document.getElementById('pageGrabberDeselectAll');
  const applyVarsBtn = document.getElementById('pageGrabberApplyVars');
  const filterText = document.getElementById('pageGrabberFilterText');
  const filterType = document.getElementById('pageGrabberFilterType');
  
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
  if (modeSelect) {
    modeSelect.addEventListener('change', () => this.onPageGrabberModeChange());
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
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => this.runPageGrabberAnalysis());
  }
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => this.pageGrabberSetAllSelected(true));
  }
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => this.pageGrabberSetAllSelected(false));
  }
  if (applyVarsBtn) {
    applyVarsBtn.addEventListener('click', () => this.applyPageGrabberToVariables());
  }
  if (filterText) {
    filterText.addEventListener('input', () => this.renderPageGrabberExtractedList());
  }
  if (filterType) {
    filterType.addEventListener('change', () => this.renderPageGrabberExtractedList());
  }
}

TestEditor.prototype.onPageGrabberModeChange = function() {
  const mode = document.getElementById('pageGrabberMode')?.value || 'single';
  const singleGroup = document.getElementById('pageGrabberSelectorGroup');
  const allDataGroup = document.getElementById('pageGrabberAllDataGroup');
  const saveBtn = document.getElementById('savePageGrabber');
  if (mode === 'all') {
    if (singleGroup) singleGroup.style.display = 'none';
    if (allDataGroup) allDataGroup.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'none';
    document.getElementById('pageGrabberVariableGroup').style.display = 'none';
    document.getElementById('pageGrabberExtractGroup').style.display = 'none';
    document.getElementById('pageGrabberPreviewGroup').style.display = 'none';
    document.getElementById('pageGrabberUrlMatchGroup').style.display = 'none';
    document.getElementById('pageGrabberSelectorInfo').style.display = 'none';
    this.pageGrabberExtractedItems = this.pageGrabberExtractedItems || [];
    this.renderPageGrabberExtractedList();
  } else {
    if (singleGroup) singleGroup.style.display = 'block';
    if (allDataGroup) allDataGroup.style.display = 'none';
    if (saveBtn) saveBtn.style.display = '';
  }
}

TestEditor.prototype.pageGrabberSetAllSelected = function(selected) {
  if (!this.pageGrabberExtractedItems) return;
  this.pageGrabberExtractedItems.forEach(item => { item.selected = selected; });
  this.renderPageGrabberExtractedList();
}

TestEditor.prototype.runPageGrabberAnalysis = async function() {
  const tabSelect = document.getElementById('pageGrabberTabSelect');
  const tabId = parseInt(tabSelect?.value);
  if (!tabId) {
    this.showToast(this.t('editorUI.selectTabFirst') || 'Select tab first', 'error');
    return;
  }
  const analyzeBtn = document.getElementById('pageGrabberAnalyzeBtn');
  const origText = analyzeBtn?.textContent;
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = this.t('editorUI.loading') || 'Loading...';
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_ANALYSIS',
      analysisType: 'analysis-selectors',
      tabId
    });
    if (response?.success && response.data?.selectors) {
      this.pageGrabberExtractedItems = response.data.selectors.map(s => ({
        selector: s.selector,
        type: s.type || 'css',
        element: s.element || 'unknown',
        text: s.text || '',
        value: s.attributes?.value ?? (s.inputType ? '' : s.text),
        variableName: '',
        selected: false
      }));
      this.renderPageGrabberExtractedList();
      this.showToast(
        this.t('editorUI.analysisComplete', { count: this.pageGrabberExtractedItems.length }) || `Found ${this.pageGrabberExtractedItems.length} elements`,
        'success'
      );
    } else {
      const err = response?.error || 'Unknown error';
      this.showToast(err, 'error');
    }
  } catch (e) {
    console.error('Page grabber analysis error:', e);
    this.showToast(e?.message || 'Analysis failed', 'error');
  } finally {
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = origText || (this.t('editorUI.analyzePage') || 'Analyze page');
    }
  }
}

TestEditor.prototype.renderPageGrabberExtractedList = function() {
  const items = this.pageGrabberExtractedItems || [];
  const filterText = (document.getElementById('pageGrabberFilterText')?.value || '').toLowerCase();
  const filterType = document.getElementById('pageGrabberFilterType')?.value || '';
  let filtered = items;
  if (filterText) {
    filtered = filtered.filter(i =>
      (i.text || '').toLowerCase().includes(filterText) ||
      (i.selector || '').toLowerCase().includes(filterText) ||
      (i.variableName || '').toLowerCase().includes(filterText)
    );
  }
  if (filterType) {
    filtered = filtered.filter(i => (i.element || '').toLowerCase() === filterType);
  }
  const placeholder = document.getElementById('pageGrabberExtractedPlaceholder');
  const table = document.getElementById('pageGrabberExtractedTable');
  const tbody = document.getElementById('pageGrabberExtractedTbody');
  if (!tbody) return;
  if (filtered.length === 0) {
    if (placeholder) placeholder.style.display = 'block';
    if (table) table.style.display = 'none';
    return;
  }
  if (placeholder) placeholder.style.display = 'none';
  if (table) table.style.display = 'table';
  tbody.innerHTML = '';
  filtered.forEach((item, idx) => {
    const tr = document.createElement('tr');
    const origIdx = items.indexOf(item);
    tr.innerHTML = `
      <td style="vertical-align: middle;"><input type="checkbox" ${item.selected ? 'checked' : ''} data-idx="${origIdx}"></td>
      <td><input type="text" class="form-control" style="width:100%;font-size:12px;" placeholder="${this.t('editorUI.variableName') || 'varName'}" value="${this.escapeHtml(item.variableName || '')}" data-idx="${origIdx}"></td>
      <td style="font-family:monospace;font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;" title="${this.escapeHtml(item.selector || '')}">${this.escapeHtml((item.selector || '').substring(0, 50))}${(item.selector || '').length > 50 ? '...' : ''}</td>
      <td>${this.escapeHtml(item.element || '')}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;" title="${this.escapeHtml(item.text || item.value || '')}">${this.escapeHtml((item.text || item.value || '').substring(0, 40))}${(item.text || item.value || '').length > 40 ? '...' : ''}</td>
    `;
    tr.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      item.selected = e.target.checked;
    });
    tr.querySelector('input[type="text"]').addEventListener('input', (e) => {
      item.variableName = e.target.value.trim();
    });
    tbody.appendChild(tr);
  });
}

TestEditor.prototype.applyPageGrabberToVariables = function() {
  const items = (this.pageGrabberExtractedItems || []).filter(i => i.selected && i.variableName);
  if (items.length === 0) {
    this.showToast(this.t('editorUI.selectAndNameVariables') || 'Select elements and enter variable names', 'error');
    return;
  }
  if (!this.test.variables) this.test.variables = {};
  const tabSelect = document.getElementById('pageGrabberTabSelect');
  const tabId = parseInt(tabSelect?.value);
  const tabUrl = tabSelect?.selectedOptions?.[0]?.dataset?.url || '';
  let hasMatchingUrl = false;
  if (this.test?.actions && tabUrl) {
    hasMatchingUrl = this.test.actions.some(action => {
      if (!action.url) return false;
      try {
        const a = new URL(action.url);
        const b = new URL(tabUrl);
        return a.origin === b.origin;
      } catch { return action.url === tabUrl; }
    });
  }
  items.forEach(item => {
    const extractType = (item.element || '').toLowerCase() === 'input' || (item.element || '').toLowerCase() === 'textarea' ? 'value' : 'text';
    this.test.variables[item.variableName] = {
      value: item.text || item.value || '',
      source: 'page',
      selector: typeof item.selector === 'string' ? item.selector : (item.selector?.selector || ''),
      extractType,
      urlMatch: hasMatchingUrl,
      tabId: hasMatchingUrl ? tabId : undefined,
      exportToRow: true
    };
    if (hasMatchingUrl && this.test.actions) {
      const sel = typeof item.selector === 'string' ? item.selector : (item.selector?.selector || '');
      const varAction = {
        type: 'variable',
        variable: {
          name: item.variableName,
          operation: 'extract-element',
          selector: sel,
          extractType
        },
        timestamp: Date.now()
      };
      this.test.actions.push(varAction);
    }
  });
  this.renderVariablesPanel();
  if (hasMatchingUrl) this.renderActionsList();
  this.showToast(
    this.t('editorUI.variablesApplied', { count: items.length }) || `Applied ${items.length} variables`,
    'success'
  );
  this.closePageGrabberModal();
}

/**
 * Показывает модальное окно для извлечения переменной со страницы
 */
TestEditor.prototype.showPageGrabberModal = async function() {
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
  const allDataGroup = document.getElementById('pageGrabberAllDataGroup');
  if (allDataGroup) allDataGroup.style.display = 'none';
  document.getElementById('savePageGrabber').disabled = true;
  document.getElementById('savePageGrabber').style.display = '';
  this.pageGrabberExtractedItems = [];
  
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
  
  this.onPageGrabberModeChange();
  modal.style.display = 'block';
  modal.classList.add('show');
}

/**
 * Закрывает модальное окно извлечения переменной
 */
TestEditor.prototype.closePageGrabberModal = function() {
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
TestEditor.prototype.onPageGrabberTabSelect = async function() {
  const tabSelect = document.getElementById('pageGrabberTabSelect');
  const tabId = parseInt(tabSelect.value);
  const mode = document.getElementById('pageGrabberMode')?.value || 'single';
  
  if (!tabId) {
    document.getElementById('pageGrabberUrlGroup').style.display = 'none';
    document.getElementById('pageGrabberSelectorGroup').style.display = 'none';
    const allDataGroup = document.getElementById('pageGrabberAllDataGroup');
    if (allDataGroup) allDataGroup.style.display = 'none';
    return;
  }
  
  try {
    const tab = await chrome.tabs.get(tabId);
    const urlGroup = document.getElementById('pageGrabberUrlGroup');
    const urlDisplay = document.getElementById('pageGrabberUrl');
    const selectorGroup = document.getElementById('pageGrabberSelectorGroup');
    const allDataGroup = document.getElementById('pageGrabberAllDataGroup');
    
    urlDisplay.textContent = tab.url || 'about:blank';
    urlGroup.style.display = 'block';
    
    if (mode === 'all') {
      if (selectorGroup) selectorGroup.style.display = 'none';
      if (allDataGroup) allDataGroup.style.display = 'block';
    } else {
      if (selectorGroup) selectorGroup.style.display = 'block';
      if (allDataGroup) allDataGroup.style.display = 'none';
    }
    
    // Проверяем, есть ли URL в шагах теста
    const urlMatchGroup = document.getElementById('pageGrabberUrlMatchGroup');
    if (mode === 'single' && this.test?.actions) {
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
TestEditor.prototype.startPageGrabberSelection = async function() {
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
TestEditor.prototype.stopPageGrabberSelection = async function() {
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
TestEditor.prototype.onPageGrabberElementSelected = function(elementInfo, selector, textSelectionInfo) {
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
TestEditor.prototype.updatePageGrabberPreview = function() {
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
      let regex;
      try {
        regex = new RegExp(regexInput);
      } catch (re) {
        value = this.t('editorUI.regexError');
        preview.textContent = value || this.t('editorUI.emptyValue');
        previewGroup.style.display = 'block';
        return;
      }
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
TestEditor.prototype.savePageGrabberVariable = async function() {
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
      let regex;
      try {
        regex = new RegExp(regexInput);
      } catch (re) {
        this.showToast(this.t('editorUI.regexErrorPrefix') + (re.message || ''), 'error');
        return;
      }
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
TestEditor.prototype.showLocalStorageVariablesModal = async function() {
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
TestEditor.prototype.onLocalStorageTabSelect = async function() {
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
TestEditor.prototype.loadLocalStorageVariables = async function() {
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
      <div class="localstorage-variable-item" data-key="${this.escapeHtml(v.key)}" style="padding: 12px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; transition: background 0.2s; background: white;">
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
TestEditor.prototype.selectLocalStorageVariable = function(variable) {
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
TestEditor.prototype.closeLocalStorageVariablesModal = function() {
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
TestEditor.prototype.saveLocalStorageVariable = function() {
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
TestEditor.prototype.initLocalStorageVariablesModal = function() {
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
})();
