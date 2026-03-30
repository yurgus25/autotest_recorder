/**
 * AutoTest Recorder - Editor Module
 * Control flow: condition/loop/try-catch modals and renders, parallel play
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-control-flow
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-control-flow.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.showAddConditionModal = function() {
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
TestEditor.prototype.showEditConditionModal = function(action, index) {
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
TestEditor.prototype.showTelegramModal = function() {
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

TestEditor.prototype.closeTelegramModal = function() {
  const modal = document.getElementById('telegramModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
}

TestEditor.prototype.saveTelegramAction = async function() {
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
TestEditor.prototype.showAddLoopModal = function() {
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
TestEditor.prototype.showEditLoopModal = function(action, index) {
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
TestEditor.prototype.renderConditionBlock = function(action, index, visibleStepNumber = null) {
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
        <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${index}" data-action="toggle-visibility" title="${this.t('editorUI.clickToShowHideStepShort', { action: isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn') }) || ('Click to ' + (isHidden ? 'show' : 'hide') + ' action')}">${visibleStepNumber}</span>
        <span class="drag-handle" title="${this.t('editorUI.dragToMove') || 'Drag to move'}">☰</span>
        <span class="action-type-badge condition">${this.t('editorUI.conditionBadge')}</span>
        <div class="condition-expression">
          <strong>${this.t('editorUI.ifLabel')}</strong> ${this.escapeHtml(expression)} ${operator} ${value ? this.escapeHtml(value) : ''}
        </div>
        <div class="action-actions">
          <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${index}" title="${this.t('editorUI.editBtn') || 'Edit'}">${isCollapsed ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}</button>
          <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${index}" title="${(isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn')) || (isHidden ? 'Show' : 'Hide')}">${isCollapsed ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${index}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">${isCollapsed ? '🗑️' : '🗑️ ' + this.t('editorUI.deleteBtn')}</button>
        </div>
      </div>
      <div class="action-content">
        <div class="condition-branch then-branch" data-branch-label="✅ Then:">
          <div class="branch-header">
            <span>✅ Then:</span>
            <button class="btn btn-small btn-success" data-action="add-action-to-branch" data-action-index="${index}" data-branch="then" title="${this.t('editorUI.addActionToThen') || 'Add action to Then branch'}">${this.t('editorUI.addBtn')}</button>
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
            <button class="btn btn-small btn-success" data-action="add-action-to-branch" data-action-index="${index}" data-branch="else" title="${this.t('editorUI.addActionToElse') || 'Add action to Else branch'}">${this.t('editorUI.addBtn')}</button>
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
TestEditor.prototype.renderLoopBlock = function(action, index, visibleStepNumber = null) {
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
        <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${index}" data-action="toggle-visibility" title="${this.t('editorUI.clickToShowHideStepShort', { action: isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn') }) || ('Click to ' + (isHidden ? 'show' : 'hide') + ' action')}">${visibleStepNumber}</span>
        <span class="drag-handle" title="${this.t('editorUI.dragToMove') || 'Drag to move'}">☰</span>
        <span class="action-type-badge loop">${this.t('editorUI.loopBadge')}</span>
        <div class="loop-description">
          ${this.escapeHtml(loopDescription)}
        </div>
        <div class="action-actions">
          <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${index}" title="${this.t('editorUI.editBtn') || 'Edit'}">${isCollapsed ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}</button>
          <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${index}" title="${(isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn')) || (isHidden ? 'Show' : 'Hide')}">${isCollapsed ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${index}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">${isCollapsed ? '🗑️' : '🗑️ ' + this.t('editorUI.deleteBtn')}</button>
        </div>
      </div>
      <div class="action-content">
        <div class="loop-actions-header">
          <span>${this.t('editorUI.actionsInsideLoop')}</span>
          <button class="btn btn-small btn-success" data-action="add-action-to-loop" data-action-index="${index}" title="${this.t('editorUI.addActionToLoop') || 'Add action to loop'}">${this.t('editorUI.addBtn')}</button>
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
 * Рендеринг Try-Catch блока
 */
TestEditor.prototype.renderTryCatchBlock = function(action, index, visibleStepNumber = null) {
  // Если visibleStepNumber не передан, вычисляем его
  if (visibleStepNumber === null) {
    visibleStepNumber = this.getVisibleStepNumber(index);
  }
  
  const tryActions = action.tryActions || [];
  const catchActions = action.catchActions || [];
  const finallyActions = action.finallyActions || [];
  const errorVariable = action.errorVariable || '';
  const continueOnError = action.continueOnError !== false;
  const isHidden = action.hidden || false;
  const isCollapsed = this.allCollapsed;
  const classes = ['action-item', 'try-catch-block'];
  if (isHidden) classes.push('action-hidden');
  if (isCollapsed) classes.push('collapsed');
  const actionClassName = classes.join(' ');
  
  let description = '🛡️ Try-Catch';
  if (errorVariable) description += ` → ${errorVariable}`;
  if (!continueOnError) description += ' (⚠️ re-throw)';
  
  return `
    <div class="${actionClassName}" data-index="${index}" data-protected="try-catch">
      <div class="action-header">
        <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${index}" data-action="toggle-visibility" title="${this.t('editorUI.clickToShowHideStepShort', { action: isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn') }) || ('Click to ' + (isHidden ? 'show' : 'hide') + ' action')}">${visibleStepNumber}</span>
        <span class="drag-handle" title="${this.t('editorUI.dragToMove') || 'Drag to move'}">☰</span>
        <span class="action-type-badge try-catch">${this.t('editorUI.tryCatchBadge') || 'TRY-CATCH'}</span>
        <div class="try-catch-description">
          ${this.escapeHtml(description)}
        </div>
        <div class="action-actions">
          <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${index}" title="${this.t('editorUI.editBtn') || 'Edit'}">${isCollapsed ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}</button>
          <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${index}" title="${(isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn')) || (isHidden ? 'Show' : 'Hide')}">${isCollapsed ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${index}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">${isCollapsed ? '🗑️' : '🗑️ ' + this.t('editorUI.deleteBtn')}</button>
        </div>
      </div>
      <div class="action-content">
        <!-- Try Block -->
        <div class="try-block" style="margin-bottom: 12px;">
          <div class="try-catch-block-header" style="background: #e3f2fd; padding: 8px 12px; border-radius: 6px 6px 0 0; border-left: 4px solid #2196f3; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
            <span>🎯 Try (${tryActions.length})</span>
            <button class="btn btn-small btn-success" data-action="add-action-to-try" data-action-index="${index}" title="${this.t('editorUI.addActionToTry') || 'Add action to try block'}">${this.t('editorUI.addBtn')}</button>
          </div>
          <div class="try-actions" data-parent-index="${index}" data-drop-zone="try" style="border: 1px solid #e3f2fd; border-top: none; padding: 8px; min-height: 60px; background: #fafafa;">
            ${tryActions.length > 0 ? tryActions.map((a, i) => {
              const innerStepNumber = this.getVisibleStepNumber(i, { parentIndex: index, branch: 'try', branchIndex: i });
              return this.renderActionItem(a, `try-${index}-${i}`, innerStepNumber, { parentIndex: index, branch: 'try', branchIndex: i });
            }).join('') : '<div class="empty-branch" data-drop-zone="try-empty">' + (this.t('editorUI.noActionsDropHere') || 'No actions (drag here)') + '</div>'}
          </div>
        </div>
        
        <!-- Catch Block -->
        <div class="catch-block" style="margin-bottom: 12px;">
          <div class="try-catch-block-header" style="background: #ffebee; padding: 8px 12px; border-radius: 6px 6px 0 0; border-left: 4px solid #f44336; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
            <span>❌ Catch (${catchActions.length})</span>
            <button class="btn btn-small btn-success" data-action="add-action-to-catch" data-action-index="${index}" title="${this.t('editorUI.addActionToCatch') || 'Add action to catch block'}">${this.t('editorUI.addBtn')}</button>
          </div>
          <div class="catch-actions" data-parent-index="${index}" data-drop-zone="catch" style="border: 1px solid #ffebee; border-top: none; padding: 8px; min-height: 60px; background: #fafafa;">
            ${catchActions.length > 0 ? catchActions.map((a, i) => {
              const innerStepNumber = this.getVisibleStepNumber(i, { parentIndex: index, branch: 'catch', branchIndex: i });
              return this.renderActionItem(a, `catch-${index}-${i}`, innerStepNumber, { parentIndex: index, branch: 'catch', branchIndex: i });
            }).join('') : '<div class="empty-branch" data-drop-zone="catch-empty">' + (this.t('editorUI.noActionsDropHere') || 'No actions (drag here)') + '</div>'}
          </div>
        </div>
        
        <!-- Finally Block -->
        <div class="finally-block">
          <div class="try-catch-block-header" style="background: #f3e5f5; padding: 8px 12px; border-radius: 6px 6px 0 0; border-left: 4px solid #9c27b0; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
            <span>✅ Finally (${finallyActions.length})</span>
            <button class="btn btn-small btn-success" data-action="add-action-to-finally" data-action-index="${index}" title="${this.t('editorUI.addActionToFinally') || 'Add action to finally block'}">${this.t('editorUI.addBtn')}</button>
          </div>
          <div class="finally-actions" data-parent-index="${index}" data-drop-zone="finally" style="border: 1px solid #f3e5f5; border-top: none; padding: 8px; min-height: 60px; background: #fafafa;">
            ${finallyActions.length > 0 ? finallyActions.map((a, i) => {
              const innerStepNumber = this.getVisibleStepNumber(i, { parentIndex: index, branch: 'finally', branchIndex: i });
              return this.renderActionItem(a, `finally-${index}-${i}`, innerStepNumber, { parentIndex: index, branch: 'finally', branchIndex: i });
            }).join('') : '<div class="empty-branch" data-drop-zone="finally-empty">' + (this.t('editorUI.noActionsDropHere') || 'No actions (drag here)') + '</div>'}
          </div>
        </div>
        
        ${errorVariable ? `<div class="try-catch-variable-info" style="margin-top: 12px; padding: 8px 12px; background: rgba(244, 67, 54, 0.1); border-radius: 6px; font-size: 12px;">
          💡 <strong>${this.t('editorUI.errorVariable') || 'Error variable'}:</strong> <code style="background: white; padding: 2px 6px; border-radius: 3px; font-family: monospace;">${this.escapeHtml(errorVariable)}</code> 
          ${this.t('editorUI.tryCatchUseInCatch') || 'use in catch as'} <code style="background: white; padding: 2px 6px; border-radius: 3px; font-family: monospace;">{var:${this.escapeHtml(errorVariable)}}</code>
        </div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Параллельное воспроизведение теста в нескольких вкладках
 */
TestEditor.prototype.playTestParallel = async function() {
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

    if (response && response.success) {
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
})();
