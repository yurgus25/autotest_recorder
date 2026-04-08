/**
 * AutoTest Recorder - Editor Module
 * Save logic: saveAction, saveCondition, saveLoop, saveTryCatch, branch modals
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-save
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-save.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.saveAction = function() {
  // Проверяем тип редактируемого действия
  if (this.currentEditingActionType === 'condition') {
    this.saveCondition();
    return;
  }
  
  if (this.currentEditingActionType === 'loop') {
    this.saveLoop();
    return;
  }
  
  if (this.currentEditingActionType === 'try-catch') {
    this.saveTryCatch();
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

  const existingAction = (this.currentEditingAction >= 0 && this.test?.actions && this.currentEditingAction < this.test.actions.length)
    ? this.test.actions[this.currentEditingAction]
    : null;

  const screenshotCaptureType = document.getElementById('screenshotCaptureType')?.value;
  const screenshotSkipsSelector = actionType === 'screenshot' && (screenshotCaptureType === 'full' || screenshotCaptureType === 'region' || screenshotCaptureType === 'full-page');
  const adaptiveSkipsMainSelector = actionType === 'adaptive';
  const clipboardNeedsNoSelector = actionType === 'clipboard' && (subtype === 'clipboard-get' || subtype === 'clipboard-set');
  const networkNeedsNoSelector = actionType === 'network';
  const deviceNeedsNoSelector = actionType === 'device';
  const mediaNeedsNoSelector = actionType === 'media';
  const chainNeedsNoSelector = actionType === 'chain';
  const datepickerNeedsNoSelector = actionType === 'datepicker';
  const visualRegressionViewport = actionType === 'assertion' && subtype === 'assert-visual-regression' && document.getElementById('visualRegressionScope')?.value === 'viewport';
  if (!selectorValue && actionType !== 'scroll' && actionType !== 'navigation' && actionType !== 'wait' && actionType !== 'keyboard' && actionType !== 'api' && actionType !== 'variable' && actionType !== 'setVariable' && actionType !== 'javascript' && actionType !== 'cookie' && actionType !== 'analysis' && !screenshotSkipsSelector && !adaptiveSkipsMainSelector && !clipboardNeedsNoSelector && !networkNeedsNoSelector && !deviceNeedsNoSelector && !mediaNeedsNoSelector && !chainNeedsNoSelector && !datepickerNeedsNoSelector && !visualRegressionViewport) {
    alert(this.t('editorUI.specifySelector'));
    return;
  }
  if (actionType === 'adaptive') {
    // Селектор опционален — при пустом шаг сам найдёт элемент из collectedSelectors
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
    if (!variableOperation) {
      alert(this.t('editorUI.selectVariableOperation'));
      return;
    }
    if (variableOperation !== 'collect-data' && !variableName) {
      alert(this.t('editorUI.specifyVariableName'));
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
  const screenshotNoSelector = actionType === 'screenshot' && (screenshotCaptureType === 'full' || screenshotCaptureType === 'region' || screenshotCaptureType === 'full-page');
  const clipboardNeedsSel = actionType === 'clipboard' && (subtype === 'clipboard-copy' || subtype === 'clipboard-paste');
  const tableNeedsSel = actionType === 'table'; // Таблицы всегда требуют селектор (селектор таблицы)
  const dragNeedsSel = actionType === 'drag'; // Drag всегда требует селектор (исходный элемент)
  
  if (actionType !== 'scroll' && actionType !== 'navigation' && actionType !== 'wait' && actionType !== 'api' && actionType !== 'variable' && actionType !== 'setVariable' && actionType !== 'javascript' && actionType !== 'cookie' && actionType !== 'network' && actionType !== 'device' && actionType !== 'media' && actionType !== 'chain' && actionType !== 'datepicker' && !screenshotNoSelector && !visualRegressionViewport && ((actionType !== 'clipboard' || clipboardNeedsSel) || tableNeedsSel || dragNeedsSel)) {
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
  // Для scroll селектор тоже может быть задан (прокрутка «к полю»):
  // если пользователь выбрал селектор, сохраняем его и выставляем подтип scroll-element
  if (actionType === 'scroll' && selectorValue) {
    selector = this.buildSelector(selectorType || 'css', selectorValue);
    if (!this.currentSubtype) this.currentSubtype = 'scroll-element';
  }

  // URL: для шага «Анализ» не подставляем страницу редактора
  let initialUrl = actionUrl || window.location.href;
  if (actionType === 'analysis') {
    const u = (actionUrl || '').trim();
    if (!u || u.startsWith('chrome-extension://') || u.startsWith('chrome://') || u.includes('/editor/')) {
      initialUrl = ''; // не сохраняем URL редактора
    } else {
      initialUrl = u;
    }
  }
  const navSubForUrl = actionType === 'navigation' ? (this.currentSubtype || document.getElementById('navSubtypeSelect')?.value || 'nav-url') : null;
  const needsNavUrl = actionType === 'navigation' && ['nav-url', 'new-tab'].includes(navSubForUrl);
  // Создаем объект действия
  const action = {
    type: actionType,
    selector: selector,
    timestamp: Date.now(),
    url: (actionType === 'navigation' && !needsNavUrl) ? undefined : initialUrl
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
  } else     if (actionType === 'navigation') {
    if (needsNavUrl) {
      action.url = actionUrl;
    } else {
      delete action.url;
    }
  } else if (actionType === 'adaptive') {
    const selectedSubtype = document.getElementById('adaptiveSubtype')?.value || 'adaptive-single';
    
    if (selectedSubtype === 'adaptive-auto') {
      // Режим adaptive-auto
      const maxIterations = Math.max(1, Math.min(999, parseInt(document.getElementById('adaptiveAutoMaxIterations')?.value, 10) || 99));
      const excludeButtons = (document.getElementById('adaptiveAutoExcludeButtons')?.value || '').trim();
      const fillMode = document.getElementById('adaptiveAutoFillMode')?.value || 'required';
      const ignoreValidationErrors = document.getElementById('adaptiveAutoIgnoreValidation')?.checked === true;
      const exploreDropdowns = document.getElementById('adaptiveAutoExploreDropdowns')?.checked !== false;
      const toggleCheckboxes = document.getElementById('adaptiveAutoToggleCheckboxes')?.checked !== false;
      const enableBacktracking = document.getElementById('adaptiveAutoEnableBacktracking')?.checked !== false;
      const maxDialogCloseAttempts = Math.max(0, Math.min(100, parseInt(document.getElementById('adaptiveAutoMaxDialogClose')?.value, 10) || 0));
      
      action.subtype = 'adaptive-auto';
      action.maxRepeatCount = 1; // adaptive-auto по умолчанию 1 прогон (не наследуем от adaptive-single)
      action.maxIterations = maxIterations;
      action.excludeButtons = excludeButtons;
      action.fillMode = fillMode;
      action.ignoreValidationErrors = ignoreValidationErrors;
      action.exploreDropdowns = exploreDropdowns;
      action.toggleCheckboxes = toggleCheckboxes;
      action.enableBacktracking = enableBacktracking;
      action.maxDialogCloseAttempts = maxDialogCloseAttempts;
      
      delete action.selector;
      delete action.url;
      
      if (existingAction?._runHistory) action._runHistory = existingAction._runHistory;
      if (existingAction?._statistics) action._statistics = existingAction._statistics;
    } else if (selectedSubtype === 'adaptive-flow') {
      // Режим adaptive-flow (Пользовательский сценарий)
      action.subtype = 'adaptive-flow';
      
      // Сохраняем шаги сценария
      action.flow = existingAction?.flow || [];
      
      // Сохраняем глобальные настройки
      action.flowOptions = {
        maxVariationsPerStep: Math.max(1, Math.min(20, parseInt(document.getElementById('flowMaxVariationsPerStep')?.value, 10) || 5)),
        allowBacktrack: document.getElementById('flowAllowBacktrack')?.checked !== false,
        stopOnError: document.getElementById('flowStopOnError')?.checked === true,
        saveSnapshots: document.getElementById('flowSaveSnapshots')?.checked !== false
      };
      
      delete action.selector;
      delete action.url;
      
      if (existingAction?._runHistory) action._runHistory = existingAction._runHistory;
      if (existingAction?._flowStatistics) action._flowStatistics = existingAction._flowStatistics;
    } else {
      // Режим adaptive-single
      const stepSpan = Math.max(1, Math.min(99, parseInt(document.getElementById('adaptiveStepSpan')?.value, 10) || 1));
      const excludePreviousValues = document.getElementById('adaptiveExcludePreviousValues')?.checked === true;
      const maxRepeatCount = Math.max(1, Math.min(100, parseInt(document.getElementById('adaptiveMaxRepeatCount')?.value, 10) || 1));
      const innerType = document.getElementById('adaptiveInnerActionType')?.value || 'click';
      const innerSubtype = (document.getElementById('adaptiveInnerSubtype')?.value || 'click').trim() || 'click';
      action.stepSpan = stepSpan;
      action.excludePreviousValues = excludePreviousValues;
      action.maxRepeatCount = maxRepeatCount;
      action.subtype = 'adaptive-single';
      delete action.selector;
      delete action.url;
      const selectorHint = (document.getElementById('adaptiveSelectorHint')?.value || '').trim() || undefined;
      const innerSelector = selectorValue && ['click', 'dblclick', 'input', 'change', 'scroll', 'assert', 'assertion', 'hover', 'focus', 'blur', 'clear', 'screenshot', 'wait'].includes(innerType) ? this.buildSelector(selectorType, selectorValue) : null;
      const innerAction = {
        type: innerType,
        subtype: innerSubtype,
        selector: innerSelector || undefined,
        selectorHint: selectorHint,
        value: actionValue || undefined,
        optionText: (innerType === 'click' && ['dropdown-select', 'dropdown-multiselect'].includes(innerSubtype)) ? actionValue : undefined
      };
      if (innerType === 'assert' || innerType === 'assertion') {
        innerAction.expectedValue = actionValue;
        innerAction.optionText = actionValue;
      }
      if (innerType === 'wait') {
        innerAction.delay = parseInt(String(actionValue).replace(/\s/g, ''), 10) || 1000;
        innerAction.value = innerAction.delay;
      }
      action.action = innerAction;
      if (existingAction?._runHistory) action._runHistory = existingAction._runHistory;
      if (existingAction?._statistics) action._statistics = existingAction._statistics;
    }
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
    const variableName = document.getElementById('variableName')?.value || '';
    const variableOperation = document.getElementById('variableOperation').value;
    
    action.variable = {
      name: variableOperation === 'collect-data' ? 'collect-data' : variableName,
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
    } else if (variableOperation === 'collect-data') {
      const namesInput = document.getElementById('variableCollectDataNames')?.value || '';
      action.variable.variableNames = namesInput.split(',').map(s => s.trim()).filter(Boolean);
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
  } else if (actionType === 'clipboard') {
    // Clipboard operations
    const clipboardSubtype = this.currentSubtype || 'clipboard-copy';
    action.subtype = clipboardSubtype;
    
    switch (clipboardSubtype) {
      case 'clipboard-copy':
      case 'clipboard-paste':
        // Selector already added to action object above
        break;
      case 'clipboard-get':
        // variableName
        const clipboardVariableName = document.getElementById('clipboardVariableName')?.value;
        if (!clipboardVariableName) {
          alert('Specify variable name for clipboard-get');
          return;
        }
        action.variableName = clipboardVariableName;
        break;
      case 'clipboard-set':
        // text/value
        const clipboardText = document.getElementById('clipboardText')?.value;
        if (!clipboardText) {
          alert('Specify text to set in clipboard');
          return;
        }
        action.text = clipboardText;
        action.value = clipboardText;
        break;
    }
  } else if (actionType === 'network') {
    // Network operations
    const networkSubtype = this.currentSubtype || 'network-wait-request';
    action.subtype = networkSubtype;
    
    const networkUrlPattern = document.getElementById('networkUrlPattern')?.value;
    const networkTimeout = parseInt(document.getElementById('networkTimeout')?.value, 10);
    const networkIdleTime = parseInt(document.getElementById('networkIdleTime')?.value, 10);
    const networkExpectedStatus = parseInt(document.getElementById('networkExpectedStatus')?.value, 10);
    const networkSaveToVariableCheckbox = document.getElementById('networkSaveToVariableCheckbox')?.checked;
    const networkSaveToVariable = document.getElementById('networkSaveToVariable')?.value;
    
    switch (networkSubtype) {
      case 'network-wait-request':
        if (!networkUrlPattern) {
          alert('Specify URL pattern for network-wait-request');
          return;
        }
        action.urlPattern = networkUrlPattern;
        action.value = networkUrlPattern;
        if (networkTimeout) action.timeout = networkTimeout;
        if (networkSaveToVariableCheckbox && networkSaveToVariable) {
          action.saveToVariable = networkSaveToVariable;
          action.variableName = networkSaveToVariable;
        }
        break;
      case 'network-wait-idle':
        if (networkIdleTime) action.idleTime = networkIdleTime;
        if (networkTimeout) action.timeout = networkTimeout;
        break;
      case 'network-assert-request':
        if (!networkUrlPattern) {
          alert('Specify URL pattern for network-assert-request');
          return;
        }
        action.urlPattern = networkUrlPattern;
        action.value = networkUrlPattern;
        if (networkExpectedStatus) action.expectedStatus = networkExpectedStatus;
        break;
      case 'network-assert-status':
        if (!networkUrlPattern) {
          alert('Specify URL pattern for network-assert-status');
          return;
        }
        if (!networkExpectedStatus) {
          alert('Specify expected status for network-assert-status');
          return;
        }
        action.urlPattern = networkUrlPattern;
        action.value = networkUrlPattern;
        action.expectedStatus = networkExpectedStatus;
        action.status = networkExpectedStatus;
        break;
    }
  } else if (actionType === 'table') {
    // Table operations
    const tableSubtype = this.currentSubtype || 'table-get-cell-value';
    action.subtype = tableSubtype;
    
    const tableRowIndex = document.getElementById('tableRowIndex')?.value;
    const tableColumnIndex = document.getElementById('tableColumnIndex')?.value;
    const tableVariableName = document.getElementById('tableVariableName')?.value;
    const tableExpectedValue = document.getElementById('tableExpectedValue')?.value;
    const tableExpectedCount = document.getElementById('tableExpectedCount')?.value;
    const tableSearchText = document.getElementById('tableSearchText')?.value;
    const tableSearchColumn = document.getElementById('tableSearchColumn')?.value;
    
    switch (tableSubtype) {
      case 'table-get-cell-value':
      case 'table-get-cell-text':
        if (tableRowIndex === undefined || tableRowIndex === '') {
          alert('Specify row index for table operation');
          return;
        }
        if (tableColumnIndex === undefined || tableColumnIndex === '') {
          alert('Specify column index for table operation');
          return;
        }
        action.rowIndex = parseInt(tableRowIndex);
        action.columnIndex = parseInt(tableColumnIndex);
        if (tableVariableName) {
          action.variableName = tableVariableName;
          action.saveToVariable = tableVariableName;
        }
        break;
      case 'table-click-cell':
        if (tableRowIndex === undefined || tableRowIndex === '') {
          alert('Specify row index');
          return;
        }
        if (tableColumnIndex === undefined || tableColumnIndex === '') {
          alert('Specify column index');
          return;
        }
        action.rowIndex = parseInt(tableRowIndex);
        action.columnIndex = parseInt(tableColumnIndex);
        break;
      case 'table-get-row':
        if (tableRowIndex === undefined || tableRowIndex === '') {
          alert('Specify row index');
          return;
        }
        action.rowIndex = parseInt(tableRowIndex);
        if (tableVariableName) {
          action.variableName = tableVariableName;
          action.saveToVariable = tableVariableName;
        }
        break;
      case 'table-get-column':
        if (tableColumnIndex === undefined || tableColumnIndex === '') {
          alert('Specify column index');
          return;
        }
        action.columnIndex = parseInt(tableColumnIndex);
        if (tableVariableName) {
          action.variableName = tableVariableName;
          action.saveToVariable = tableVariableName;
        }
        break;
      case 'table-get-row-count':
      case 'table-get-column-count':
        if (tableVariableName) {
          action.variableName = tableVariableName;
          action.saveToVariable = tableVariableName;
        }
        break;
      case 'table-assert-cell-value':
        if (tableRowIndex === undefined || tableRowIndex === '') {
          alert('Specify row index');
          return;
        }
        if (tableColumnIndex === undefined || tableColumnIndex === '') {
          alert('Specify column index');
          return;
        }
        if (!tableExpectedValue) {
          alert('Specify expected value');
          return;
        }
        action.rowIndex = parseInt(tableRowIndex);
        action.columnIndex = parseInt(tableColumnIndex);
        action.expectedValue = tableExpectedValue;
        action.value = tableExpectedValue;
        break;
      case 'table-assert-row-count':
        if (tableExpectedCount === undefined || tableExpectedCount === '') {
          alert('Specify expected count');
          return;
        }
        action.expectedCount = parseInt(tableExpectedCount);
        action.count = parseInt(tableExpectedCount);
        action.value = tableExpectedCount;
        break;
      case 'table-find-row':
        if (!tableSearchText) {
          alert('Specify search text');
          return;
        }
        action.searchText = tableSearchText;
        action.text = tableSearchText;
        action.value = tableSearchText;
        if (tableSearchColumn !== undefined && tableSearchColumn !== '') {
          action.columnIndex = parseInt(tableSearchColumn);
        }
        if (tableVariableName) {
          action.variableName = tableVariableName;
          action.saveToVariable = tableVariableName;
        }
        break;
    }
  } else if (actionType === 'drag') {
    // Drag operations
    const dragSubtype = this.currentSubtype || 'drag-and-drop';
    action.subtype = dragSubtype;
    
    const dragTargetSelector = document.getElementById('dragTargetSelector')?.value;
    const dragOffsetX = document.getElementById('dragOffsetX')?.value;
    const dragOffsetY = document.getElementById('dragOffsetY')?.value;
    const dragTargetX = document.getElementById('dragTargetX')?.value;
    const dragTargetY = document.getElementById('dragTargetY')?.value;
    
    switch (dragSubtype) {
      case 'drag-and-drop':
        if (!dragTargetSelector) {
          alert('Specify target selector for drag-and-drop');
          return;
        }
        action.targetSelector = dragTargetSelector;
        action.target = dragTargetSelector;
        break;
      case 'drag-by-offset':
        if (dragOffsetX === undefined || dragOffsetX === '') {
          alert('Specify offset X');
          return;
        }
        if (dragOffsetY === undefined || dragOffsetY === '') {
          alert('Specify offset Y');
          return;
        }
        action.offsetX = parseInt(dragOffsetX);
        action.offsetY = parseInt(dragOffsetY);
        action.x = parseInt(dragOffsetX);
        action.y = parseInt(dragOffsetY);
        break;
      case 'drag-to-coordinates':
        if (dragTargetX === undefined || dragTargetX === '') {
          alert('Specify target X coordinate');
          return;
        }
        if (dragTargetY === undefined || dragTargetY === '') {
          alert('Specify target Y coordinate');
          return;
        }
        action.targetX = parseInt(dragTargetX);
        action.targetY = parseInt(dragTargetY);
        action.x = parseInt(dragTargetX);
        action.y = parseInt(dragTargetY);
        break;
      case 'drag-start':
      case 'drag-over':
      case 'drop':
        // Используют только основной selector
        if (dragSubtype === 'drag-over' || dragSubtype === 'drop') {
          if (dragTargetSelector) {
            action.targetSelector = dragTargetSelector;
          }
        }
        break;
    }
  } else if (actionType === 'datepicker') {
    const datepickerSubtype = this.currentSubtype || 'datepicker-select-date';
    action.subtype = datepickerSubtype;
    
    switch (datepickerSubtype) {
      case 'datepicker-select-date':
      case 'datepicker-select-datetime':
        action.date = document.getElementById('datepickerDate')?.value || '';
        action.value = action.date;
        break;
      case 'datepicker-select-range':
        action.startDate = document.getElementById('datepickerStartDate')?.value || '';
        action.endDate = document.getElementById('datepickerEndDate')?.value || '';
        action.from = action.startDate;
        action.to = action.endDate;
        break;
      case 'datepicker-select-time':
        action.time = document.getElementById('datepickerTime')?.value || '';
        action.value = action.time;
        break;
    }
  } else if (actionType === 'media') {
    const mediaSubtype = this.currentSubtype || 'media-play';
    action.subtype = mediaSubtype;
    
    switch (mediaSubtype) {
      case 'media-seek':
        action.time = parseFloat(document.getElementById('mediaSeekTime')?.value || 0);
        action.position = action.time;
        break;
      case 'media-set-volume':
        action.volume = parseFloat(document.getElementById('mediaVolume')?.value || 0.5);
        action.value = action.volume;
        break;
      case 'media-set-playback-rate':
        action.rate = parseFloat(document.getElementById('mediaPlaybackRate')?.value || 1);
        action.speed = action.rate;
        break;
    }
  } else if (actionType === 'device') {
    const deviceSubtype = this.currentSubtype || 'device-set-viewport';
    action.subtype = deviceSubtype;
    
    switch (deviceSubtype) {
      case 'device-set-viewport':
        action.width = parseInt(document.getElementById('deviceWidth')?.value || 1920);
        action.height = parseInt(document.getElementById('deviceHeight')?.value || 1080);
        action.viewportWidth = action.width;
        action.viewportHeight = action.height;
        break;
      case 'device-rotate':
        action.orientation = document.getElementById('deviceOrientation')?.value || 'portrait';
        action.value = action.orientation;
        break;
    }
  } else if (actionType === 'chain') {
    const chainSubtype = this.currentSubtype || 'chain-sequential';
    action.subtype = chainSubtype;
    
    const stepsText = document.getElementById('chainSteps')?.value || '[]';
    try {
      action.steps = JSON.parse(stepsText);
      action.actions = action.steps;
    } catch (e) {
      alert('Invalid JSON in Chain Steps: ' + e.message);
      return;
    }
    
    if (chainSubtype === 'chain-retry') {
      action.maxRetries = parseInt(document.getElementById('chainMaxRetries')?.value || 3);
      action.retryDelay = parseInt(document.getElementById('chainRetryDelay')?.value || 1000);
      action.retries = action.maxRetries;
      action.delay = action.retryDelay;
    }
    
    if (chainSubtype === 'chain-batch') {
      const resultVar = document.getElementById('chainResultVariable')?.value;
      if (resultVar) {
        action.resultVariable = resultVar;
        action.saveResults = resultVar;
      }
    }
  }
  
  // Analysis type handling
  if (actionType === 'analysis') {
    const analysisSubtypeEl = document.getElementById('analysisSubtype');
    action.subtype = analysisSubtypeEl ? analysisSubtypeEl.value : 'analysis-selectors';
    action.description = this.getAnalysisDescription(action.subtype);
    action.analysisConfig = {
      saveSelectors: action.subtype === 'analysis-selectors',
      includeHidden: false,
      maxSelectors: 500
    };
    if (action.subtype === 'analysis-fill-fields') {
      const fillMode = document.getElementById('analysisFillMode')?.value || existingAction?.fillOptions?.fillMode || 'smart';
      const charCount = Math.min(1000, Math.max(1, parseInt(document.getElementById('analysisFillCharCount')?.value, 10) || existingAction?.fillOptions?.charCount || 10));
      const charset = document.getElementById('analysisFillCharset')?.value || existingAction?.fillOptions?.charset || 'lettersAndNumbers';
      const customCharset = document.getElementById('analysisFillCustomCharset')?.value?.trim() || existingAction?.fillOptions?.customCharset || '';
      const fillTarget = document.getElementById('analysisFillTarget')?.value
        || existingAction?.fillOptions?.fillTarget
        || 'all';
      
      // НОВЫЕ ПОЛЯ v0.9.5.1
      const profile = document.getElementById('analysisFillProfile')?.value || existingAction?.fillOptions?.profile || 'valid-user';
      const scopeMode = document.getElementById('analysisScopeMode')?.value || existingAction?.fillOptions?.scopeMode || 'current';
      const contextAware = document.getElementById('analysisContextAware')?.checked !== false;
      const overwriteFilled = document.getElementById('analysisOverwriteFilled')?.checked || false;
      
      const fillOptions = { 
        fillMode, 
        charCount, 
        charset, 
        customCharset, 
        fillTarget,
        profile,           // NEW
        scopeMode,         // NEW
        contextAware,      // NEW
        overwriteFilled    // NEW
      };
      action.fillOptions = fillOptions;
      action.analysisConfig.fillOptions = fillOptions;
    } else {
      delete action.fillOptions;
    }
    if (existingAction && existingAction.analysisResult) {
      action.analysisResult = existingAction.analysisResult;
    }
    if (existingAction?.url && this._isEditorOrExtensionUrl((actionUrl || '').trim())) {
      action.url = existingAction.url;
    }
    const formUrl = (actionUrl || '').trim();
    if (formUrl && !this._isEditorOrExtensionUrl(formUrl)) {
      action.urlLocked = true;
    } else if (existingAction) {
      action.urlLocked = existingAction.urlLocked || false;
    } else {
      action.urlLocked = false;
    }
  }
  
  // Сохраняем дополнительные поля в зависимости от subtype
  if (this.currentSubtype) {
    this.saveSubtypeFields(action, actionType, this.currentSubtype);
  } else if (actionType === 'navigation' && document.getElementById('navSubtypeSelect')) {
    this.saveSubtypeFields(action, actionType, document.getElementById('navSubtypeSelect').value || 'nav-url');
  } else if (actionType === 'screenshot') {
    this.saveSubtypeFields(action, actionType, null);
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
    } else if (parentAction.type === 'try-catch') {
      // Добавляем в try-catch блок
      const branchKey = this.currentBranch === 'try' ? 'tryActions' : 
                       this.currentBranch === 'catch' ? 'catchActions' : 'finallyActions';
      
      if (!parentAction[branchKey]) parentAction[branchKey] = [];
      
      if (this.currentEditingAction !== null && this.currentEditingAction !== -1 && typeof this.currentEditingAction === 'number') {
        // Редактируем существующее действие
        const branchIndex = this.currentEditingAction;
        if (branchIndex >= 0 && branchIndex < parentAction[branchKey].length) {
          parentAction[branchKey][branchIndex] = action;
          console.log(`✅ [Editor] Обновлено действие в ${this.currentBranch} (index: ${branchIndex})`);
        } else {
          parentAction[branchKey].push(action);
          console.log(`✅ [Editor] Добавлено действие в ${this.currentBranch} (всего: ${parentAction[branchKey].length})`);
        }
      } else {
        parentAction[branchKey].push(action);
        console.log(`✅ [Editor] Добавлено действие в ${this.currentBranch} (всего: ${parentAction[branchKey].length})`);
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
TestEditor.prototype.saveCondition = function() {
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
TestEditor.prototype.saveLoop = function() {
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
 * Сохраняет try-catch блок
 */
TestEditor.prototype.saveTryCatch = function() {
  const errorVariable = document.getElementById('tryCatchErrorVar')?.value?.trim() || '';
  const continueOnError = document.getElementById('tryCatchContinueOnError')?.checked !== false;
  
  const action = {
    type: 'try-catch',
    tryActions: [],
    catchActions: [],
    finallyActions: [],
    errorVariable: errorVariable || undefined,
    continueOnError: continueOnError,
    timestamp: Date.now(),
    url: window.location.href
  };
  
  if (this.currentEditingAction === -1 || this.currentEditingAction === null) {
    // Новый try-catch блок
    this.test.actions.push(action);
  } else {
    // Обновляем существующий try-catch блок
    const existingAction = this.test.actions[this.currentEditingAction];
    if (existingAction && existingAction.type === 'try-catch') {
      // Сохраняем существующие действия внутри блоков
      action.tryActions = existingAction.tryActions || [];
      action.catchActions = existingAction.catchActions || [];
      action.finallyActions = existingAction.finallyActions || [];
    }
    this.test.actions[this.currentEditingAction] = action;
  }
  
  this.renderActions();
  this.extractVariablesFromActions(this.test.actions);
  this.updateScenarioVariablesPanel();
  this.closeModal();
  this.showToast(this.t('editorUI.tryCatchAdded') || 'Try-Catch блок добавлен', 'success');
}

/**
 * Показывает модальное окно для добавления действия в ветку условия
 */
TestEditor.prototype.showAddActionToBranchModal = function(parentIndex, branch) {
  this.currentParentAction = parentIndex;
  this.currentBranch = branch;
  this.currentEditingAction = -1;
  this.currentEditingActionType = 'action';
  this.showAddActionModal();
}

/**
 * Показывает модальное окно для добавления действия в цикл
 */
TestEditor.prototype.showAddActionToLoopModal = function(parentIndex) {
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

/**
 * Показывает модальное окно для добавления действия в try-catch блок
 */
TestEditor.prototype.showAddActionToTryCatchModal = function(parentIndex, branch) {
  console.log(`🔧 [Editor] Открываю модальное окно для добавления действия в try-catch (parentIndex: ${parentIndex}, branch: ${branch})`);
  
  // Нормализуем индекс
  const normalizedIndex = typeof parentIndex === 'string' ? parseInt(parentIndex) : parentIndex;
  
  if (isNaN(normalizedIndex)) {
    console.error(`❌ [Editor] Некорректный parentIndex: ${parentIndex}`);
    alert(this.t('editorUI.incorrectParentIndex'));
    return;
  }
  
  if (!this.test || !this.test.actions) {
    console.error(`❌ [Editor] Тест или действия не загружены`);
    alert(this.t('editorUI.testOrActionsNotLoaded'));
    return;
  }
  
  if (normalizedIndex < 0 || normalizedIndex >= this.test.actions.length) {
    console.error(`❌ [Editor] Некорректный parentIndex: ${normalizedIndex}`);
    alert(this.t('editorUI.tryCatchNotFound', { index: normalizedIndex }));
    return;
  }
  
  const parentAction = this.test.actions[normalizedIndex];
  
  if (!parentAction || parentAction.type !== 'try-catch') {
    console.error(`❌ [Editor] Действие не является try-catch:`, parentAction);
    alert(this.t('editorUI.notATryCatch', { type: parentAction?.type || 'undefined' }));
    return;
  }
  
  // Валидация branch
  if (!['try', 'catch', 'finally'].includes(branch)) {
    console.error(`❌ [Editor] Некорректный branch: ${branch}`);
    return;
  }
  
  this.currentParentAction = normalizedIndex;
  this.currentBranch = branch;
  this.currentEditingAction = -1;
  this.currentEditingActionType = 'action';
  
  console.log(`✅ [Editor] Контекст установлен: currentParentAction=${this.currentParentAction}, currentBranch=${this.currentBranch}`);
  
  this.showAddActionModal();
}

TestEditor.prototype.buildSelector = function(type, value) {
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

TestEditor.prototype.getSelectorPriority = function(type) {
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

TestEditor.prototype.escapeSelector = function(str) {
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

})();
