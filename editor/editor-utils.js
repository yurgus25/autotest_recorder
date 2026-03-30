/**
 * AutoTest Recorder - Editor Module
 * Utilities: formatDateTime, theme, selector quality, action values
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-utils
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-utils.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.formatDateTime = function(dateInput) {
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


TestEditor.prototype.editAction = function(index) {
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
  
  if (action.type === 'try-catch') {
    this.currentEditingActionType = 'try-catch';
  } else {
    this.currentEditingActionType = 'action';
  }
  
  // Восстанавливаем subtype если есть
  if (action.subtype) {
    this.currentSubtype = action.subtype;
  }
  
  this.showActionModal(action);
}

TestEditor.prototype.deleteAction = async function(index) {
  const action = this.test.actions[index];
  
  // Проверяем, является ли это циклом или условием с вложенными действиями
  if (action && (action.type === 'loop' || action.type === 'condition')) {
    let hasInnerActions = false;
    if (action.type === 'loop' && action.actions?.length > 0) {
      hasInnerActions = true;
    } else if (action.type === 'condition' && (action.thenActions?.length > 0 || action.elseActions?.length > 0)) {
      hasInnerActions = true;
    } else if (action.type === 'try-catch' && (action.tryActions?.length > 0 || action.catchActions?.length > 0 || action.finallyActions?.length > 0)) {
      hasInnerActions = true;
    }
    
    if (hasInnerActions) {
      // Показываем специальное подтверждение для циклов/условий с вложениями
      const typeLabel = action.type === 'loop' ? 'loop' : (action.type === 'try-catch' ? 'try-catch' : 'condition');
      const innerCount = action.type === 'loop' 
        ? action.actions.length 
        : action.type === 'try-catch'
        ? (action.tryActions?.length || 0) + (action.catchActions?.length || 0) + (action.finallyActions?.length || 0)
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
  this.saveUndoState(`Deleted action #${index + 1}`);
  this.renderActions();
  // НЕ сохраняем автоматически - пользователь сам сохранит
}

TestEditor.prototype.duplicateAction = function(index) {
  const action = this.test.actions[index];
  if (!action) return;

  // Создаем глубокую копию действия
  const duplicatedAction = JSON.parse(JSON.stringify(action));
  duplicatedAction.timestamp = Date.now();
  
  // Вставляем дубликат после текущего действия
  this.test.actions.splice(index + 1, 0, duplicatedAction);
  this.saveUndoState(`Duplicated action #${index + 1}`);
  this.renderActions();
  // НЕ сохраняем автоматически - пользователь сам сохранит
}

TestEditor.prototype.toggleActionVisibility = function(index) {
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

TestEditor.prototype.toggleRecordMarker = function(index) {
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
TestEditor.prototype.getNestedAction = function(parentIndex, branch, branchIndex) {
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
  } else if (parentAction.type === 'try-catch') {
    if (branch === 'try') {
      actionsArray = parentAction.tryActions || [];
    } else if (branch === 'catch') {
      actionsArray = parentAction.catchActions || [];
    } else if (branch === 'finally') {
      actionsArray = parentAction.finallyActions || [];
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
TestEditor.prototype.editNestedAction = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.duplicateNestedAction = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.toggleNestedActionVisibility = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.toggleNestedActionRecordMarker = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.deleteNestedAction = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.removeReserveSelectorForNestedAction = function(parentIndex, branch, branchIndex, reserveIndex) {
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
TestEditor.prototype.regenerateSelectorForNestedAction = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.copySelectorForNestedAction = function(parentIndex, branch, branchIndex) {
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
TestEditor.prototype.findOnPageForNestedAction = function(parentIndex, branch, branchIndex) {
  const nested = this.getNestedAction(parentIndex, branch, branchIndex);
  if (!nested) return;
  
  // Используем существующую логику поиска
  this.findOnPageForAction(nested.action);
}

/**
 * Перегенерирует селектор для конкретного действия (в т.ч. вложенного) через content script
 */
TestEditor.prototype.regenerateSelectorForAction = async function(action) {
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
TestEditor.prototype.findOnPageForAction = async function(action) {
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

TestEditor.prototype.updateActionField = function(index, field, value) {
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

TestEditor.prototype.addReserveSelector = function(index, rawValue) {
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

TestEditor.prototype.removeReserveSelector = function(actionIndex, reserveIndex) {
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

TestEditor.prototype.markActionEdited = function(action) {
  if (!action) return;
  action.userEdited = true;
  action.userEditedAt = new Date().toISOString();
}

TestEditor.prototype.removeSelectorEntry = function(actionIndex, source, orderIndex, sourceIndex, selectorValue, dropdownIndexStr) {
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

TestEditor.prototype.removeSelectorEntryForNestedAction = function(parentIndex, branch, branchIndex, source, orderIndex, sourceIndex, selectorValue, dropdownIndexStr) {
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

TestEditor.prototype.moveSelectorEntry = function(actionIndex, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr) {
  const action = this.test.actions[actionIndex];
  if (!action) return;
  this.moveSelectorEntryForAction(action, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr ?? actionIndex);
}

TestEditor.prototype.moveSelectorEntryForNestedAction = function(parentIndex, branch, branchIndex, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr) {
  const nested = this.getNestedAction(parentIndex, branch, branchIndex);
  if (!nested) return;
  const action = nested.action;
  if (!action) return;
  this.moveSelectorEntryForAction(action, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr ?? `${branch}-${parentIndex}-${branchIndex}`);
}

TestEditor.prototype.moveSelectorEntryForAction = function(action, source, orderIndex, sourceIndex, selectorValue, direction, dropdownIndexStr) {
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

TestEditor.prototype.promoteSelectorToPrimary = function(action, source, sourceIndex, dropdownIndexStr) {
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

TestEditor.prototype.toggleSelectorDropdown = function(index, button) {
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

TestEditor.prototype.openSelectorDropdownByIndex = function(indexStr) {
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

TestEditor.prototype.renderActionsPreservingDropdown = function(indexStr) {
  this.renderActions();
  if (indexStr === undefined || indexStr === null) return;
  const normalized = String(indexStr);
  setTimeout(() => {
    this.openSelectorDropdownByIndex(normalized);
  }, 0);
}

TestEditor.prototype.closeAllSelectorDropdowns = function() {
  document.querySelectorAll('.selector-dropdown').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.selector-dropdown-toggle').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

TestEditor.prototype.handleDocumentClick = function(event) {
  if (event.target.closest('.selector-field-wrapper') || event.target.closest('.selector-dropdown')) {
    return;
  }
  this.closeAllSelectorDropdowns();
}

TestEditor.prototype.toggleCollapseAll = function() {
  this.allCollapsed = !this.allCollapsed;
  this.updateCollapseButton();
  this.renderActions();
}

TestEditor.prototype.updateCollapseButton = function() {
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

TestEditor.prototype.toggleShowUrls = function() {
  this.showUrls = !this.showUrls;
  this.updateShowUrlsButton();
  this.renderActions();
}

TestEditor.prototype.updateShowUrlsButton = function() {
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

TestEditor.prototype.toggleShowFieldLabels = function() {
  this.showFieldLabels = !this.showFieldLabels;
  this.updateShowFieldLabelsButton();
  this.renderActions();
}

TestEditor.prototype.updateShowFieldLabelsButton = function() {
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

TestEditor.prototype.toggleTheme = function() {
  this.isDarkTheme = !this.isDarkTheme;
  this.applyTheme();
  this.updateThemeButton();
  this.saveTheme();
}

TestEditor.prototype.applyTheme = function() {
  document.body.classList.toggle('dark-theme', this.isDarkTheme);
}

TestEditor.prototype.updateThemeButton = function() {
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

TestEditor.prototype.loadTheme = function() {
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

TestEditor.prototype.saveTheme = function() {
  try {
    localStorage.setItem('editorTheme', this.isDarkTheme ? 'dark' : 'light');
  } catch (error) {
    console.warn('Ошибка сохранения темы:', error);
  }
}

TestEditor.prototype.toggleGrouping = function() {
  this.groupByUrl = !this.groupByUrl;
  localStorage.setItem('groupByUrl', this.groupByUrl ? 'true' : 'false');
  this.updateGroupingButton();
  this.renderActions();
}

TestEditor.prototype.updateGroupingButton = function() {
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

TestEditor.prototype.toggleGroup = function(groupUrl) {
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
TestEditor.prototype.getAuthData = function() {
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
TestEditor.prototype.getPreconditions = function() {
  const preconditions = [];
  if (window.location && window.location.href) {
    preconditions.push(`Start page: ${window.location.href}`);
  }
  return preconditions;
}

})();
