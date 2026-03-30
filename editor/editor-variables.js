/**
 * AutoTest Recorder - Editor Module
 * Variables: modal, global, scenario, step options, quick steps
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-variables
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-variables.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.initVariablesModal = function() {
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
TestEditor.prototype.showVariablesModal = async function() {
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
TestEditor.prototype.closeVariablesModal = function() {
  const modal = document.getElementById('variablesModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

/**
 * Переключение табов переменных
 */
TestEditor.prototype.switchVariablesTab = function(tabName) {
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
TestEditor.prototype.loadVariables = function() {
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
TestEditor.prototype.loadGlobalVariables = async function() {
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
TestEditor.prototype.saveVariables = function() {
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
TestEditor.prototype.saveGlobalVariables = async function() {
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
TestEditor.prototype.loadAllTestsVariables = async function() {
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
TestEditor.prototype.renderVariables = function() {
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
          <button class="btn btn-tiny btn-info" data-test-variable="${type}" data-var-index="${i}" title="${this.t('editorUI.checkValue') || 'Check value'}">🔍</button>
          <button class="delete-variable" data-delete-variable="${type}" data-var-index="${i}">🗑️</button>
        </div>
      `).join('');
    }
  });
}

TestEditor.prototype.updateScenarioVariablesPanel = function() {
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
TestEditor.prototype.renderAllScenarioVariables = function(container) {
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
            <button class="btn btn-tiny" data-edit-var="${currentTestKey}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.editBtn') || 'Edit'}">✏️</button>
            <button class="btn btn-tiny btn-danger" data-delete-var="${currentTestKey}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">🗑️</button>
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
            <button class="btn btn-tiny" data-edit-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.editBtn') || 'Edit'}">✏️</button>
            <button class="btn btn-tiny btn-danger" data-delete-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">🗑️</button>
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
TestEditor.prototype.renderGlobalVariables = function(container) {
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
          <button class="btn btn-tiny" data-edit-var="${currentTestId}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.editBtn') || 'Edit'}">✏️</button>
          <button class="btn btn-tiny btn-danger" data-delete-var="${currentTestId}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">🗑️</button>
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
          <button class="btn btn-tiny" data-edit-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.editBtn') || 'Edit'}">✏️</button>
          <button class="btn btn-tiny btn-danger" data-delete-var="${testId}" data-var-name="${this.escapeHtml(varName)}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">🗑️</button>
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
TestEditor.prototype.getSourceLabel = function(source) {
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
TestEditor.prototype.editVariableFromTest = async function(testId, varName) {
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
TestEditor.prototype.deleteVariableFromTest = async function(testId, varName) {
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
TestEditor.prototype.getVariablePlaceholder = function(sourceType) {
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
TestEditor.prototype.addVariable = function(type) {
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
TestEditor.prototype.updateVariable = function(type, index, field, value) {
  if (this.variables[type] && this.variables[type][index]) {
    this.variables[type][index][field] = value;
    this.saveVariables();
  }
}

/**
 * Удалить переменную
 */
TestEditor.prototype.deleteVariable = function(type, index) {
  if (this.variables[type]) {
    this.variables[type].splice(index, 1);
    this.renderVariables();
    this.saveVariables();
  }
}

/**
 * Проверить значение переменной
 */
TestEditor.prototype.testVariable = async function(type, index) {
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
        let regex;
        try {
          regex = new RegExp(variable.value);
        } catch (e) {
          value = this.t('editorUI.errorValue', { error: 'Invalid regex: ' + (e.message || '') });
          break;
        }
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
TestEditor.prototype.detectVariableRecommendations = function() {
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
TestEditor.prototype.applyRecommendation = async function(index) {
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
TestEditor.prototype.generateStepOptionsHTML = function(currentIndex) {
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
TestEditor.prototype.updateGoto = function(conditionIndex, gotoType, stepIndex) {
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
TestEditor.prototype.showDragDeleteWarning = function(message) {
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
TestEditor.prototype.confirmDelete = function(index, type) {
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

TestEditor.prototype.initQuickActions = function() {
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
          case 'add-try-catch':
            this.addTryCatchStep();
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

TestEditor.prototype.isQuickTemplateSupported = function(template) {
  return !this.runtimeUnsupportedQuickTemplates.has(template);
}

TestEditor.prototype.addQuickStep = function(template) {
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
    case 'var-collect-data':
      this.addCollectDataStep();
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
      this.addGenericStep('keyboard', 'Navigate with arrow keys', 'keyboard-navigate');
      break;
    case 'keyboard-typeahead':
      this.addGenericStep('input', 'Type-ahead search', 'keyboard-typeahead');
      break;
    case 'keyboard-escape':
      this.addGenericStep('keyboard', 'Close with Escape', 'keyboard-escape');
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
    case 'wait-visible':
      this.addGenericStep('wait', this.t('quickStepsDescriptions.waitVisible'), 'wait-visible');
      break;
    case 'wait-hidden':
      this.addGenericStep('wait', this.t('quickStepsDescriptions.waitHidden'), 'wait-hidden');
      break;
    case 'wait-exists':
      this.addGenericStep('wait', this.t('quickStepsDescriptions.waitExists'), 'wait-exists');
      break;
    case 'wait-not-exists':
      this.addGenericStep('wait', this.t('quickStepsDescriptions.waitNotExists'), 'wait-not-exists');
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
    case 'assert-visible':
      this.addGenericStep('assertion', this.t('quickStepsDescriptions.assertVisible'), 'assert-visible');
      break;
    case 'assert-hidden':
      this.addGenericStep('assertion', this.t('quickStepsDescriptions.assertHidden'), 'assert-hidden');
      break;
    case 'assert-exists':
      this.addGenericStep('assertion', this.t('quickStepsDescriptions.assertExists'), 'assert-exists');
      break;
    case 'assert-not-exists':
      this.addGenericStep('assertion', this.t('quickStepsDescriptions.assertNotExists'), 'assert-not-exists');
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
      this.addGenericStep('navigation', 'Refresh current page', 'nav-refresh');
      break;
    case 'nav-back':
      this.addGenericStep('navigation', 'Go back in history', 'nav-back');
      break;
    case 'nav-forward':
      this.addGenericStep('navigation', 'Go forward in history', 'nav-forward');
      break;
    case 'nav-get-url':
      this.addGenericStep('navigation', 'Get current page URL', 'nav-get-url');
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
    case 'try-catch':
      this.addTryCatchStep();
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
    case 'page-screenshot-full':
      this.addGenericStep('screenshot', 'Take full page screenshot (with scroll)', 'page-screenshot-full');
      break;
    case 'set-cookie':
      this.addGenericStep('cookie', 'Set browser cookie', 'set-cookie');
      break;
    case 'get-cookies':
      this.addGenericStep('cookie', 'Get browser cookies', 'get-cookies');
      break;
      
    // Clipboard
    case 'clipboard-copy':
      this.addGenericStep('clipboard', 'Copy text from element to clipboard', 'clipboard-copy');
      break;
    case 'clipboard-paste':
      this.addGenericStep('clipboard', 'Paste text from clipboard to element', 'clipboard-paste');
      break;
    case 'clipboard-get':
      this.addGenericStep('clipboard', 'Get clipboard content to variable', 'clipboard-get');
      break;
    case 'clipboard-set':
      this.addGenericStep('clipboard', 'Set text to clipboard', 'clipboard-set');
      break;
      
    // Network
    case 'network-wait-request':
      this.addGenericStep('network', 'Wait for network request', 'network-wait-request');
      break;
    case 'network-wait-idle':
      this.addGenericStep('network', 'Wait for network idle', 'network-wait-idle');
      break;
    case 'network-assert-request':
      this.addGenericStep('network', 'Assert network request was made', 'network-assert-request');
      break;
    case 'network-assert-status':
      this.addGenericStep('network', 'Assert network request status', 'network-assert-status');
      break;
      
    // Table
    case 'table-get-cell-value':
      this.addGenericStep('table', 'Get table cell value', 'table-get-cell-value');
      break;
    case 'table-click-cell':
      this.addGenericStep('table', 'Click table cell', 'table-click-cell');
      break;
    case 'table-get-row':
      this.addGenericStep('table', 'Get table row', 'table-get-row');
      break;
    case 'table-get-column':
      this.addGenericStep('table', 'Get table column', 'table-get-column');
      break;
    case 'table-get-row-count':
      this.addGenericStep('table', 'Get table row count', 'table-get-row-count');
      break;
    case 'table-get-column-count':
      this.addGenericStep('table', 'Get table column count', 'table-get-column-count');
      break;
    case 'table-assert-cell-value':
      this.addGenericStep('table', 'Assert table cell value', 'table-assert-cell-value');
      break;
    case 'table-assert-row-count':
      this.addGenericStep('table', 'Assert table row count', 'table-assert-row-count');
      break;
    case 'table-find-row':
      this.addGenericStep('table', 'Find table row', 'table-find-row');
      break;
      
    // Drag
    case 'drag-and-drop':
      this.addGenericStep('drag', 'Drag and drop element', 'drag-and-drop');
      break;
    case 'drag-by-offset':
      this.addGenericStep('drag', 'Drag element by offset', 'drag-by-offset');
      break;
    case 'drag-to-coordinates':
      this.addGenericStep('drag', 'Drag element to coordinates', 'drag-to-coordinates');
      break;
    case 'drag-start':
      this.addGenericStep('drag', 'Start dragging element', 'drag-start');
      break;
    case 'drag-over':
      this.addGenericStep('drag', 'Drag over element', 'drag-over');
      break;
    case 'drop':
      this.addGenericStep('drag', 'Drop element', 'drop');
      break;
      
    // Datepicker
    case 'datepicker-select-date':
      this.addGenericStep('datepicker', 'Select date', 'datepicker-select-date');
      break;
    case 'datepicker-select-range':
      this.addGenericStep('datepicker', 'Select date range', 'datepicker-select-range');
      break;
    case 'datepicker-select-time':
      this.addGenericStep('datepicker', 'Select time', 'datepicker-select-time');
      break;
    case 'datepicker-select-datetime':
      this.addGenericStep('datepicker', 'Select date and time', 'datepicker-select-datetime');
      break;
    case 'datepicker-clear':
      this.addGenericStep('datepicker', 'Clear datepicker', 'datepicker-clear');
      break;
    case 'datepicker-open':
      this.addGenericStep('datepicker', 'Open datepicker', 'datepicker-open');
      break;
    case 'datepicker-close':
      this.addGenericStep('datepicker', 'Close datepicker', 'datepicker-close');
      break;
      
    // Media
    case 'media-play':
      this.addGenericStep('media', 'Play media', 'media-play');
      break;
    case 'media-pause':
      this.addGenericStep('media', 'Pause media', 'media-pause');
      break;
    case 'media-stop':
      this.addGenericStep('media', 'Stop media', 'media-stop');
      break;
    case 'media-seek':
      this.addGenericStep('media', 'Seek to position', 'media-seek');
      break;
    case 'media-set-volume':
      this.addGenericStep('media', 'Set volume', 'media-set-volume');
      break;
    case 'media-mute':
      this.addGenericStep('media', 'Mute media', 'media-mute');
      break;
    case 'media-unmute':
      this.addGenericStep('media', 'Unmute media', 'media-unmute');
      break;
    case 'media-set-playback-rate':
      this.addGenericStep('media', 'Set playback speed', 'media-set-playback-rate');
      break;
    case 'media-fullscreen':
      this.addGenericStep('media', 'Enter fullscreen', 'media-fullscreen');
      break;
    case 'media-exit-fullscreen':
      this.addGenericStep('media', 'Exit fullscreen', 'media-exit-fullscreen');
      break;
      
    // Device
    case 'device-set-viewport':
      this.addGenericStep('device', 'Set viewport size', 'device-set-viewport');
      break;
    case 'device-rotate':
      this.addGenericStep('device', 'Rotate device', 'device-rotate');
      break;
    case 'device-emulate-mobile':
      this.addGenericStep('device', 'Emulate mobile', 'device-emulate-mobile');
      break;
    case 'device-emulate-tablet':
      this.addGenericStep('device', 'Emulate tablet', 'device-emulate-tablet');
      break;
    case 'device-emulate-desktop':
      this.addGenericStep('device', 'Emulate desktop', 'device-emulate-desktop');
      break;
      
    // Chain
    case 'chain-sequential':
      this.addGenericStep('chain', 'Sequential chain', 'chain-sequential');
      break;
    case 'chain-parallel':
      this.addGenericStep('chain', 'Parallel chain', 'chain-parallel');
      break;
    case 'chain-conditional':
      this.addGenericStep('chain', 'Conditional chain', 'chain-conditional');
      break;
    case 'chain-retry':
      this.addGenericStep('chain', 'Chain with retry', 'chain-retry');
      break;
    case 'chain-batch':
      this.addGenericStep('chain', 'Batch chain', 'chain-batch');
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
      
    // Analysis Steps
    case 'analysis-selectors':
      this.addAnalysisStep('analysis-selectors', 'Get all page selectors');
      break;
    case 'analysis-fill-fields':
      this.addAnalysisStepWithFillOptions('analysis-fill-fields', 'Analyze fillable fields');
      break;
    case 'analysis-validate':
      this.addAnalysisStep('analysis-validate', 'Validate element accessibility');
      break;
    case 'analysis-forms':
      this.addAnalysisStep('analysis-forms', 'Analyze page forms');
      break;
    case 'analysis-links':
      this.addAnalysisStep('analysis-links', 'Check page links');
      break;
    case 'analysis-performance':
      this.addAnalysisStep('analysis-performance', 'Analyze page performance');
      break;
  }
}

/**
 * Add Analysis Step - показывает диалог выбора вкладки и запускает анализ
 * @param {string} subtype - Analysis subtype
 * @param {string} description - Step description
 * @param {Object} [fillOptions] - Опции заполнения (для analysis-fill-fields)
 */
TestEditor.prototype.addAnalysisStep = function(subtype, description, fillOptions = null) {
  this.showAnalysisTabPickerDialog(subtype, description, undefined, fillOptions);
}

/**
 * Add Analysis Step для «Заполнить поля» — сначала диалог настроек, затем выбор вкладки
 */
TestEditor.prototype.addAnalysisStepWithFillOptions = async function(subtype, description) {
  const fillOptions = await this.showFillFieldsOptionsDialog();
  if (fillOptions === null) return;
  this.addAnalysisStep(subtype, description, fillOptions);
}

/**
 * Диалог настроек заполнения полей
 * @returns {Promise<Object|null>} fillOptions или null при отмене
 */
TestEditor.prototype.showFillFieldsOptionsDialog = async function() {
  return new Promise((resolve) => {
    const dialogId = 'fillFieldsOptionsDialog';
    let dialog = document.getElementById(dialogId);
    if (dialog) dialog.remove();

    dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    `;

    const fillModeLabel = this.t('editorUI.fillFieldsMode') || 'Fill mode';
    const fillModeRandom = this.t('editorUI.fillFieldsModeRandom') || 'Random value';
    const fillModeCount = this.t('editorUI.fillFieldsModeCount') || 'Character count';
    const fillModeMax = this.t('editorUI.fillFieldsModeMax') || 'Max length';
    const charCountLabel = this.t('editorUI.fillFieldsCharCount') || 'Character count';
    const charsetLabel = this.t('editorUI.fillFieldsCharset') || 'Charset';
    const charsetLetters = this.t('editorUI.fillFieldsCharsetLetters') || 'Letters only';
    const charsetLettersNumbers = this.t('editorUI.fillFieldsCharsetLettersNumbers') || 'Letters + numbers';
    const charsetLettersNumbersSpace = this.t('editorUI.fillFieldsCharsetLettersNumbersSpace') || 'Letters + numbers + space';
    const charsetCustom = this.t('editorUI.fillFieldsCharsetCustom') || 'Custom';
    const fillTargetLabel = this.t('editorUI.fillFieldsTarget') || 'Target fields';
    const fillTargetEmpty = this.t('editorUI.fillFieldsTargetEmpty') || 'Empty only';
    const fillTargetRequired = this.t('editorUI.fillFieldsTargetRequired') || 'Required only';
    const fillTargetAll = this.t('editorUI.fillFieldsTargetAll') || 'All fields';

    dialog.innerHTML = `
      <div style="background: white; border-radius: 8px; padding: 24px; max-width: 420px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
        <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #333;">
          ✏️ ${this.t('editorUI.fillFieldsOptionsTitle') || 'Fill options'}
        </h3>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 13px; margin-bottom: 4px; color: #555;">${fillModeLabel}</label>
          <select id="fillFieldsMode" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
            <option value="random">${fillModeRandom}</option>
            <option value="count">${fillModeCount}</option>
            <option value="max">${fillModeMax}</option>
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 13px; margin-bottom: 4px; color: #555;">${charCountLabel}</label>
          <input type="number" id="fillFieldsCharCount" min="1" max="1000" value="10" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 13px; margin-bottom: 4px; color: #555;">${charsetLabel}</label>
          <select id="fillFieldsCharset" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
            <option value="letters">${charsetLetters}</option>
            <option value="lettersAndNumbers" selected>${charsetLettersNumbers}</option>
            <option value="lettersNumbersSpace">${charsetLettersNumbersSpace}</option>
            <option value="custom">${charsetCustom}</option>
          </select>
          <input type="text" id="fillFieldsCustomCharset" placeholder="a-zA-Z0-9" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; margin-top: 6px; display: none;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 13px; margin-bottom: 4px; color: #555;">${fillTargetLabel}</label>
          <select id="fillFieldsTarget" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
            <option value="empty">${fillTargetEmpty}</option>
            <option value="required">${fillTargetRequired}</option>
            <option value="all" selected>${fillTargetAll}</option>
          </select>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="fillFieldsCancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 13px;">
            ${this.t('common.cancel') || 'Cancel'}
          </button>
          <button id="fillFieldsConfirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #7c3aed; color: white; cursor: pointer; font-size: 13px;">
            ${this.t('common.confirm') || 'OK'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const charsetSelect = document.getElementById('fillFieldsCharset');
    const customInput = document.getElementById('fillFieldsCustomCharset');
    charsetSelect.onchange = () => {
      customInput.style.display = charsetSelect.value === 'custom' ? 'block' : 'none';
    };

    document.getElementById('fillFieldsCancel').onclick = () => {
      dialog.remove();
      resolve(null);
    };
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        dialog.remove();
        resolve(null);
      }
    };
    document.getElementById('fillFieldsConfirm').onclick = () => {
      const fillMode = document.getElementById('fillFieldsMode').value;
      const charCount = Math.min(1000, Math.max(1, parseInt(document.getElementById('fillFieldsCharCount').value) || 10));
      const charset = document.getElementById('fillFieldsCharset').value;
      const customCharset = document.getElementById('fillFieldsCustomCharset').value.trim();
      const fillTarget = document.getElementById('fillFieldsTarget').value || 'all';
      dialog.remove();
      resolve({
        fillMode,
        charCount,
        charset,
        customCharset: charset === 'custom' ? customCharset : undefined,
        fillTarget
      });
    };
  });
}

/**
 * Показывает диалог выбора вкладки для анализа
 * @param {string} subtype - Тип анализа
 * @param {string} description - Описание шага
 * @param {number} [existingActionIndex] - Если задан, обновляем URL и запускаем анализ для существующего шага (не добавляем новый)
 * @param {Object} [fillOptions] - Опции заполнения (для analysis-fill-fields)
 */
TestEditor.prototype.showAnalysisTabPickerDialog = async function(subtype, description, existingActionIndex = undefined, fillOptions = null) {
  try {
    // Получаем список открытых вкладок (исключаем extension, chrome://, about:, страницу редактора)
    const allTabs = await chrome.tabs.query({});
    const validTabs = allTabs.filter(tab => {
      if (!tab.url) return false;
      if (tab.url.startsWith('chrome-extension://')) return false;
      if (tab.url.startsWith('chrome://')) return false;
      if (tab.url.startsWith('about:')) return false;
      if (tab.url.startsWith('edge://')) return false;
      if (tab.url.includes('/editor/') || tab.url.includes('editor_ru.html') || tab.url.includes('editor.html')) return false;
      return true;
    });

    if (validTabs.length === 0) {
      this.showToast(
        this.t('editorUI.analysisNoUrl') || 'No target page found. Open the page you want to analyze.',
        'warning'
      );
      return;
    }

    // При обновлении существующего шага подсказка — его текущий URL
    const suggestedUrl = (existingActionIndex >= 0 && this.test?.actions[existingActionIndex]?.url) ? this.test.actions[existingActionIndex].url : this.getCurrentTestUrl();

    // Создаём диалог
    const dialogId = 'analysisTabPickerDialog';
    let dialog = document.getElementById(dialogId);
    if (dialog) dialog.remove();

    dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    `;

    const tabOptions = validTabs.map(tab => {
      const isSelected = suggestedUrl && tab.url && (
        tab.url === suggestedUrl ||
        (tab.url.split('?')[0] === suggestedUrl.split('?')[0])
      );
      const title = tab.title || tab.url;
      const shortUrl = tab.url.length > 60 ? tab.url.substring(0, 60) + '...' : tab.url;
      return `<option value="${tab.id}" ${isSelected ? 'selected' : ''}>${this.escapeHtml(title)} — ${this.escapeHtml(shortUrl)}</option>`;
    }).join('');

    dialog.innerHTML = `
      <div style="background: white; border-radius: 8px; padding: 24px; max-width: 500px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
        <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #333;">
          🔍 ${this.t('editorUI.selectTabForAnalysis') || 'Select page for analysis'}
        </h3>
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #666;">
          ${this.t('editorUI.selectTabForAnalysisHint') || 'Choose the browser tab to run analysis on:'}
        </p>
        <select id="analysisTabSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; margin-bottom: 16px;">
          ${tabOptions}
        </select>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="analysisTabCancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 13px;">
            ${this.t('common.cancel') || 'Cancel'}
          </button>
          <button id="analysisTabConfirm" style="padding: 8px 16px; border: none; border-radius: 4px; background: #7c3aed; color: white; cursor: pointer; font-size: 13px;">
            ${this.t('editorUI.runAnalysis') || 'Run Analysis'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Обработчики
    document.getElementById('analysisTabCancel').onclick = () => dialog.remove();
    dialog.onclick = (e) => { if (e.target === dialog) dialog.remove(); };

    document.getElementById('analysisTabConfirm').onclick = async () => {
      const tabSelect = document.getElementById('analysisTabSelect');
      const selectedTabId = parseInt(tabSelect.value);
      const selectedTab = validTabs.find(t => t.id === selectedTabId);

      if (!selectedTab) {
        this.showToast('Please select a tab', 'error');
        return;
      }

      dialog.remove();

      const targetUrl = (selectedTab && selectedTab.url) ? String(selectedTab.url) : '';

      if (typeof existingActionIndex === 'number' && existingActionIndex >= 0 && this.test && this.test.actions[existingActionIndex]?.type === 'analysis') {
        // Обновляем существующий шаг: задаём URL и запускаем анализ (URL не блокируем — обновится при прогоне)
        const action = this.test.actions[existingActionIndex];
        action.url = targetUrl;
        action.urlLocked = false;
        this.renderActions();
        const opts = subtype === 'analysis-fill-fields' ? (action.fillOptions || fillOptions) : null;
        const response = await this.runAnalysisOnTargetPage(subtype, targetUrl, selectedTabId, opts);
        if (response && response.success) {
          const brokenLinks = (subtype === 'analysis-links' && response.data?.links)
            ? response.data.links.filter(l => l.isLive === false)
            : [];
          action.analysisResult = {
            success: true,
            summary: response.data?.summary,
            selectorsCount: response.data?.selectors?.length || 0,
            brokenLinks,
            validationErrors: response.data?.validationErrors,
            debugLog: response.data?.debugLog,
            links: subtype === 'analysis-links' ? (response.data?.links || []) : undefined,
            issues: subtype === 'analysis-validate' ? (response.data?.issues || []) : undefined,
            forms: subtype === 'analysis-forms' ? (response.data?.forms || []) : undefined
          };
          const analyzedUrl = response.data?.metadata?.url || targetUrl;
          if (analyzedUrl) action.url = analyzedUrl;
          this.renderActions();
        }
        return;
      }

      // Добавляем новый шаг в тест (url — только целевая страница, не редактор; не блокируем — обновим при прогоне)
      const action = {
        type: 'analysis',
        subtype,
        description,
        url: targetUrl,
        urlLocked: false,
        fillOptions: subtype === 'analysis-fill-fields' ? fillOptions : undefined,
        analysisConfig: {
          saveSelectors: true,
          includeHidden: false,
          maxSelectors: 500
        },
        timestamp: new Date().toISOString()
      };

      if (this.test && this.test.actions) {
        this.test.actions.push(action);
        this.renderActions();
        this.extractVariablesFromActions(this.test.actions);
        this.updateScenarioVariablesPanel();
      }

      // Запускаем анализ на выбранной вкладке
      const opts = subtype === 'analysis-fill-fields' ? fillOptions : null;
      const response = await this.runAnalysisOnTargetPage(subtype, targetUrl, selectedTabId, opts);
      // Обновляем шаг результатом анализа (иконка «данные собраны») и сохраняем фактический URL страницы
      if (response && response.success && this.test && this.test.actions.length) {
        const lastAction = this.test.actions[this.test.actions.length - 1];
        if (lastAction && lastAction.type === 'analysis') {
          const brokenLinks = (subtype === 'analysis-links' && response.data?.links)
            ? response.data.links.filter(l => l.isLive === false)
            : [];
          lastAction.analysisResult = {
            success: true,
            summary: response.data?.summary,
            selectorsCount: response.data?.selectors?.length || 0,
            brokenLinks,
            validationErrors: response.data?.validationErrors,
            debugLog: response.data?.debugLog,
            links: subtype === 'analysis-links' ? (response.data?.links || []) : undefined,
            issues: subtype === 'analysis-validate' ? (response.data?.issues || []) : undefined,
            forms: subtype === 'analysis-forms' ? (response.data?.forms || []) : undefined
          };
          const analyzedUrl = response.data?.metadata?.url || targetUrl;
          if (analyzedUrl) lastAction.url = analyzedUrl;
          this.renderActions();
        }
      }
    };

  } catch (e) {
    console.error('❌ [Editor] showAnalysisTabPickerDialog error:', e);
    this.showToast('Error opening tab picker: ' + e.message, 'error');
  }
}

/**
 * Запускает анализ на вкладке с тестируемой страницей
 * @param {string} analysisType - Тип анализа
 * @param {string} targetUrl - URL тестируемой страницы
 * @param {number} [tabId] - ID вкладки (опционально)
 * @param {Object} [fillOptions] - Опции заполнения (для analysis-fill-fields)
 */
TestEditor.prototype.runAnalysisOnTargetPage = async function(analysisType, targetUrl, tabId = null, fillOptions = null) {
  try {
    this.showToast(
      this.t('editorUI.analysisRunning') || 'Running analysis on target page...',
      'info'
    );
    
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_ANALYSIS',
      analysisType,
      url: targetUrl,
      tabId: tabId || undefined,
      fillOptions: fillOptions || undefined
    });
    
    if (response && response.success) {
      const count = response.data?.summary?.total || response.data?.selectors?.length || 0;
      this.showToast(
        this.t('editorUI.analysisComplete', { count }) || `Analysis complete. Found ${count} elements.`,
        'success'
      );
      console.log(`✅ [Editor] Analysis complete for ${targetUrl}:`, response.data?.summary);
      return response;
    } else {
      const errMsg = response?.error || 'Unknown error';
      this.showToast(
        this.t('editorUI.analysisFailed', { error: errMsg }) || `Analysis failed: ${errMsg}`,
        'error'
      );
      console.warn(`⚠️ [Editor] Analysis failed:`, errMsg);
      return response || null;
    }
  } catch (e) {
    console.error('❌ [Editor] runAnalysisOnTargetPage error:', e);
    this.showToast(
      this.t('editorUI.analysisError') || 'Analysis error. Check that the target page is open.',
      'error'
    );
    return null;
  }
}

TestEditor.prototype.addWebhookStep = function() {
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

TestEditor.prototype.addRestGetStep = function() {
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

TestEditor.prototype.addRestPostStep = function() {
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

TestEditor.prototype.addTryCatchStep = function() {
  this.showAddActionModal();
  this.currentEditingActionType = 'try-catch';
  const setup = () => {
    const actionType = document.getElementById('actionType');
    if (actionType) {
      actionType.value = 'try-catch';
      this.updateFormForActionType();
      return true;
    }
    return false;
  };
  if (!setup()) requestAnimationFrame(() => setup() || setTimeout(setup, 50));
}

// ===== HELPER METHODS FOR QUICK STEPS =====

/**
 * Add generic step - universal helper for most operations
 * @param {string} type - Action type
 * @param {string} description - Step description
 * @param {string} subtype - Optional subtype for specialized actions
  */
TestEditor.prototype.addGenericStep = function(type, description, subtype = null) {
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

TestEditor.prototype.addCollectDataStep = function() {
  this.showAddActionModal();
  const setup = () => {
    const actionType = document.getElementById('actionType');
    if (actionType) {
      actionType.value = 'variable';
      this.updateFormForActionType();
      const opSelect = document.getElementById('variableOperation');
      if (opSelect) {
        opSelect.value = 'collect-data';
        this.updateVariableForm();
      }
      return true;
    }
    return false;
  };
  if (!setup()) requestAnimationFrame(() => setup() || setTimeout(setup, 50));
}

/**
 * Add navigate step with URL
 * ИСПРАВЛЕНИЕ #2: Используем 'navigation' вместо 'navigate'
 */
TestEditor.prototype.addNavigateStep = function() {
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

})();
