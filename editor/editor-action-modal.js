/**
 * AutoTest Recorder - Editor Module
 * Action modal: show, form building, subtype functions, field helpers
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-action-modal
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-action-modal.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.showAddActionModal = function() {
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
TestEditor.prototype.insertActionAtPosition = function(targetIndex, insertIndex) {
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

TestEditor.prototype.showActionModal = function(action) {
  const modal = document.getElementById('actionModal');
  const modalBody = document.getElementById('modalBody');

  if (!modal || !modalBody) {
    console.error('❌ Модальное окно не найдено');
    return;
  }

  // URL редактируемого шага — для загрузки кэша селекторов из анализа (getCurrentTestUrl)
  this.currentEditAction = action;

  modalBody.innerHTML = this.getActionFormHTML(action);
  modal.style.display = 'block';
  modal.classList.add('show');

  // Привязываем обработчики для формы
  this.attachFormHandlers();
  
  // Предотвращаем отправку формы по Enter
  this.preventFormSubmit();
  
  // Загружаем кэшированные селекторы для действий, требующих селектор
  if (this.actionRequiresSelector(action)) {
    this.loadCachedSelectorsForCurrentTab();
  }
}

/**
 * Проверяет, требует ли действие селектора
 */
TestEditor.prototype.actionRequiresSelector = function(action) {
  const typesWithSelector = ['click', 'dblclick', 'input', 'change', 'hover', 'focus', 'blur', 'clear', 'upload', 'wait', 'assertion', 'scroll', 'javascript'];
  return typesWithSelector.includes(action.type);
}

/**
 * Загружает кэшированные селекторы для тестируемой страницы (не для страницы редактора!)
 */
TestEditor.prototype.loadCachedSelectorsForCurrentTab = async function() {
  try {
    // Получаем URL тестируемой страницы из действий теста
    const targetUrl = this.getCurrentTestUrl();
    if (targetUrl) {
      // Загружаем кэш по URL (без tabId)
      await this.loadCachedSelectors(null, targetUrl);
    }
  } catch (e) {
    console.warn('Failed to load cached selectors for target page:', e);
  }
}

TestEditor.prototype.preventFormSubmit = function() {
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

TestEditor.prototype.getActionFormHTML = function(action) {
  const inner = action.type === 'adaptive' && action.action ? action.action : null;
  const selectorType = inner ? (inner.selector?.type || 'css') : (action.selector?.type || 'id');
  const selectorValue = inner ? (inner.selector?.value || inner.selector?.selector || '') : (action.selector?.value || action.selector?.selector || '');
  const actionValue = action.type === 'adaptive' && inner
    ? (inner.value || inner.optionText || '')
    : (action.type === 'wait' 
      ? (action.delay || action.value || 1000) 
      : (action.value || ''));
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
        <option value="wait" ${action.type === 'wait' ? 'selected' : ''}>${this.getActionTypeIcon('wait')} ${this.t('editorUI.actionTypeWait')}</option>
        <option value="keyboard" ${action.type === 'keyboard' ? 'selected' : ''}>${this.getActionTypeIcon('keyboard')} ${this.t('editorUI.actionTypeKeypress')}</option>
        <option value="api" ${action.type === 'api' ? 'selected' : ''}>${this.getActionTypeIcon('api')} ${this.t('editorUI.actionTypeApi')}</option>
        <option value="variable" ${action.type === 'variable' ? 'selected' : ''}>${this.getActionTypeIcon('variable')} ${this.t('editorUI.actionTypeVarOperation')}</option>
        <option value="setVariable" ${action.type === 'setVariable' ? 'selected' : ''}>${this.getActionTypeIcon('setVariable')} ${this.t('editorUI.actionTypeSetVar')}</option>
        
        <!-- NEW TYPES v1.9.3 -->
        <option value="assertion" ${action.type === 'assertion' ? 'selected' : ''}>${this.getActionTypeIcon('assertion')} ${this.t('editorUI.actionTypeAssertion') || 'Assertion'}</option>
        <option value="ai" ${action.type === 'ai' ? 'selected' : ''} ${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('ai')) ? 'disabled' : ''}>${this.getActionTypeIcon('ai')} ${this.t('editorUI.actionTypeAI') || 'AI operation'}${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('ai')) ? ' — ' + (this.t('editorUI.actionTypeNotImplemented') || 'Not implemented') : ''}</option>
        <option value="cloud" ${action.type === 'cloud' ? 'selected' : ''} ${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('cloud')) ? 'disabled' : ''}>${this.getActionTypeIcon('cloud')} ${this.t('editorUI.actionTypeCloud') || 'Cloud operation'}${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('cloud')) ? ' — ' + (this.t('editorUI.actionTypeNotImplemented') || 'Not implemented') : ''}</option>
        <option value="suite" ${action.type === 'suite' ? 'selected' : ''} ${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('suite')) ? 'disabled' : ''}>${this.getActionTypeIcon('suite')} ${this.t('editorUI.actionTypeSuite') || 'Test suite'}${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('suite')) ? ' — ' + (this.t('editorUI.actionTypeNotImplemented') || 'Not implemented') : ''}</option>
        <option value="javascript" ${action.type === 'javascript' ? 'selected' : ''}>${this.getActionTypeIcon('javascript')} ${this.t('editorUI.actionTypeJavaScript') || 'JavaScript'}</option>
        <option value="screenshot" ${action.type === 'screenshot' ? 'selected' : ''}>${this.getActionTypeIcon('screenshot')} ${this.t('editorUI.actionTypeScreenshot') || 'Screenshot'}</option>
        <option value="cookie" ${action.type === 'cookie' ? 'selected' : ''}>${this.getActionTypeIcon('cookie')} ${this.t('editorUI.actionTypeCookie') || 'Cookie'}</option>
        <option value="clipboard" ${action.type === 'clipboard' ? 'selected' : ''}>${this.getActionTypeIcon('clipboard')} ${this.t('editorUI.actionTypeClipboard') || 'Clipboard'}</option>
        <option value="network" ${action.type === 'network' ? 'selected' : ''}>${this.getActionTypeIcon('network')} ${this.t('editorUI.actionTypeNetwork') || 'Network'}</option>
        <option value="table" ${action.type === 'table' ? 'selected' : ''}>${this.getActionTypeIcon('table')} ${this.t('editorUI.actionTypeTable') || 'Table'}</option>
        <option value="drag" ${action.type === 'drag' ? 'selected' : ''}>${this.getActionTypeIcon('drag')} ${this.t('editorUI.actionTypeDrag') || 'Drag & Drop'}</option>
        <option value="datepicker" ${action.type === 'datepicker' ? 'selected' : ''}>${this.getActionTypeIcon('datepicker')} ${this.t('editorUI.actionTypeDatepicker') || 'Datepicker'}</option>
        <option value="media" ${action.type === 'media' ? 'selected' : ''}>${this.getActionTypeIcon('media')} ${this.t('editorUI.actionTypeMedia') || 'Media'}</option>
        <option value="device" ${action.type === 'device' ? 'selected' : ''}>${this.getActionTypeIcon('device')} ${this.t('editorUI.actionTypeDevice') || 'Device'}</option>
        <option value="chain" ${action.type === 'chain' ? 'selected' : ''}>${this.getActionTypeIcon('chain')} ${this.t('editorUI.actionTypeChain') || 'Action Chain'}</option>
        <option value="mobile" ${action.type === 'mobile' ? 'selected' : ''} ${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('mobile')) ? 'disabled' : ''}>${this.getActionTypeIcon('mobile')} ${this.t('editorUI.actionTypeMobile') || 'Mobile gesture'}${(this.runtimeUnsupportedActionTypes && this.runtimeUnsupportedActionTypes.has('mobile')) ? ' — ' + (this.t('editorUI.actionTypeNotImplemented') || 'Not implemented') : ''}</option>
        <option value="hover" ${action.type === 'hover' ? 'selected' : ''}>${this.getActionTypeIcon('hover')} ${this.t('editorUI.actionTypeHover') || 'Hover'}</option>
        <option value="focus" ${action.type === 'focus' ? 'selected' : ''}>${this.getActionTypeIcon('focus')} ${this.t('editorUI.actionTypeFocus') || 'Focus'}</option>
        <option value="blur" ${action.type === 'blur' ? 'selected' : ''}>${this.getActionTypeIcon('blur')} ${this.t('editorUI.actionTypeBlur') || 'Blur'}</option>
        <option value="clear" ${action.type === 'clear' ? 'selected' : ''}>${this.getActionTypeIcon('clear')} ${this.t('editorUI.actionTypeClear') || 'Clear'}</option>
        <option value="upload" ${action.type === 'upload' ? 'selected' : ''}>${this.getActionTypeIcon('upload')} ${this.t('editorUI.actionTypeUpload') || 'Upload file'}</option>
        <option value="analysis" ${action.type === 'analysis' ? 'selected' : ''}>${this.getActionTypeIcon('analysis')} ${this.t('editorUI.actionTypeAnalysis') || 'Analysis'}</option>
        <option value="adaptive" ${action.type === 'adaptive' ? 'selected' : ''}>${this.getActionTypeIcon('adaptive')} ${this.t('editorUI.actionTypeAdaptive') || 'Adaptive step'}</option>
        <option value="try-catch" ${action.type === 'try-catch' ? 'selected' : ''}>${this.getActionTypeIcon('try-catch')} ${this.t('editorUI.actionTypeTryCatch') || 'Error handling'}</option>
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

    <!-- Выпадающее меню подтипов для Wait -->
    <div class="form-group" id="waitSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.waitSubtypeLabel') || 'Wait type'}</label>
      <select id="waitSubtypeSelect">
        <option value="" ${!action.subtype ? 'selected' : ''}>${this.t('editorUI.waitDelay') || '⏳ Задержка (по умолчанию)'}</option>
        <option value="wait-visible" ${action.subtype === 'wait-visible' ? 'selected' : ''}>🔍 ${this.t('quickStepsDescriptions.waitVisible') || 'Visible'}</option>
        <option value="wait-hidden" ${action.subtype === 'wait-hidden' ? 'selected' : ''}>👻 ${this.t('quickStepsDescriptions.waitHidden') || 'Hidden'}</option>
        <option value="wait-exists" ${action.subtype === 'wait-exists' ? 'selected' : ''}>📍 ${this.t('quickStepsDescriptions.waitExists') || 'Exists'}</option>
        <option value="wait-not-exists" ${action.subtype === 'wait-not-exists' ? 'selected' : ''}>🚫 ${this.t('quickStepsDescriptions.waitNotExists') || 'Not exists'}</option>
        <option value="wait-enabled" ${action.subtype === 'wait-enabled' ? 'selected' : ''}>✅ ${this.t('editorUI.waitEnabled') || 'Enabled'}</option>
        <option value="wait-value" ${action.subtype === 'wait-value' ? 'selected' : ''}>💬 ${this.t('editorUI.waitValue') || 'Value'}</option>
        <option value="wait-option" ${action.subtype === 'wait-option' ? 'selected' : ''}>⏳ ${this.t('editorUI.waitOption') || 'Option'}</option>
        <option value="wait-options-count" ${action.subtype === 'wait-options-count' ? 'selected' : ''}>🔢 ${this.t('editorUI.waitOptionsCount') || 'Count'}</option>
        <option value="wait-until" ${action.subtype === 'wait-until' ? 'selected' : ''}>⚡ ${this.t('editorUI.waitUntil') || 'Condition'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Assertion -->
    <div class="form-group" id="assertSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.assertSubtypeLabel') || 'Assert type'}</label>
      <select id="assertSubtypeSelect">
        <option value="assert-value" ${(action.subtype || 'assert-value') === 'assert-value' ? 'selected' : ''}>💬 ${this.t('editorUI.assertValue') || 'Value'}</option>
        <option value="assert-visible" ${action.subtype === 'assert-visible' ? 'selected' : ''}>🔍 ${this.t('quickStepsDescriptions.assertVisible') || 'Visible'}</option>
        <option value="assert-hidden" ${action.subtype === 'assert-hidden' ? 'selected' : ''}>👻 ${this.t('quickStepsDescriptions.assertHidden') || 'Hidden'}</option>
        <option value="assert-exists" ${action.subtype === 'assert-exists' ? 'selected' : ''}>📍 ${this.t('quickStepsDescriptions.assertExists') || 'Exists'}</option>
        <option value="assert-not-exists" ${action.subtype === 'assert-not-exists' ? 'selected' : ''}>🚫 ${this.t('quickStepsDescriptions.assertNotExists') || 'Not exists'}</option>
        <option value="assert-contains" ${action.subtype === 'assert-contains' ? 'selected' : ''}>🔤 ${this.t('editorUI.assertContains') || 'Contains text'}</option>
        <option value="assert-count" ${action.subtype === 'assert-count' ? 'selected' : ''}>🔢 ${this.t('editorUI.assertCount') || 'Count'}</option>
        <option value="assert-disabled" ${action.subtype === 'assert-disabled' ? 'selected' : ''}>🔘 ${this.t('editorUI.assertDisabled') || 'State'}</option>
        <option value="assert-multiselect" ${action.subtype === 'assert-multiselect' ? 'selected' : ''}>☑️ ${this.t('editorUI.assertMultiselect') || 'Multiselect'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Clipboard -->
    <div class="form-group" id="clipboardSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.clipboardOperation')}</label>
      <select id="clipboardSubtypeSelect">
        <option value="clipboard-copy" ${(action.subtype || 'clipboard-copy') === 'clipboard-copy' ? 'selected' : ''}>📋 ${this.t('editorUI.clipboardCopy') || 'Copy from element'}</option>
        <option value="clipboard-paste" ${action.subtype === 'clipboard-paste' ? 'selected' : ''}>📝 ${this.t('editorUI.clipboardPaste') || 'Paste to element'}</option>
        <option value="clipboard-get" ${action.subtype === 'clipboard-get' ? 'selected' : ''}>📥 ${this.t('editorUI.clipboardGet') || 'Get to variable'}</option>
        <option value="clipboard-set" ${action.subtype === 'clipboard-set' ? 'selected' : ''}>📤 ${this.t('editorUI.clipboardSet') || 'Set text'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Network -->
    <div class="form-group" id="networkSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.networkOperation')}</label>
      <select id="networkSubtypeSelect">
        <option value="network-wait-request" ${(action.subtype || 'network-wait-request') === 'network-wait-request' ? 'selected' : ''}>⏳ ${this.t('editorUI.networkWaitRequest') || 'Wait for request'}</option>
        <option value="network-wait-idle" ${action.subtype === 'network-wait-idle' ? 'selected' : ''}>🌐 ${this.t('editorUI.networkWaitIdle') || 'Wait network idle'}</option>
        <option value="network-assert-request" ${action.subtype === 'network-assert-request' ? 'selected' : ''}>✅ ${this.t('editorUI.networkAssertRequest') || 'Assert request made'}</option>
        <option value="network-assert-status" ${action.subtype === 'network-assert-status' ? 'selected' : ''}>🔍 ${this.t('editorUI.networkAssertStatus') || 'Assert status code'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Table -->
    <div class="form-group" id="tableSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.tableOperation')}</label>
      <select id="tableSubtypeSelect">
        <option value="table-get-cell-value" ${(action.subtype || 'table-get-cell-value') === 'table-get-cell-value' ? 'selected' : ''}>📋 ${this.t('editorUI.tableGetCellValue') || 'Get cell value'}</option>
        <option value="table-click-cell" ${action.subtype === 'table-click-cell' ? 'selected' : ''}>👆 ${this.t('editorUI.tableClickCell') || 'Click cell'}</option>
        <option value="table-get-row" ${action.subtype === 'table-get-row' ? 'selected' : ''}>📊 ${this.t('editorUI.tableGetRow') || 'Get row'}</option>
        <option value="table-get-column" ${action.subtype === 'table-get-column' ? 'selected' : ''}>📊 ${this.t('editorUI.tableGetColumn') || 'Get column'}</option>
        <option value="table-get-row-count" ${action.subtype === 'table-get-row-count' ? 'selected' : ''}>🔢 ${this.t('editorUI.tableGetRowCount') || 'Get row count'}</option>
        <option value="table-get-column-count" ${action.subtype === 'table-get-column-count' ? 'selected' : ''}>🔢 ${this.t('editorUI.tableGetColumnCount') || 'Get column count'}</option>
        <option value="table-assert-cell-value" ${action.subtype === 'table-assert-cell-value' ? 'selected' : ''}>✅ ${this.t('editorUI.tableAssertCellValue') || 'Assert cell value'}</option>
        <option value="table-assert-row-count" ${action.subtype === 'table-assert-row-count' ? 'selected' : ''}>✅ ${this.t('editorUI.tableAssertRowCount') || 'Assert row count'}</option>
        <option value="table-find-row" ${action.subtype === 'table-find-row' ? 'selected' : ''}>🔍 ${this.t('editorUI.tableFindRow') || 'Find row'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Drag -->
    <div class="form-group" id="dragSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.dragOperation')}</label>
      <select id="dragSubtypeSelect">
        <option value="drag-and-drop" ${(action.subtype || 'drag-and-drop') === 'drag-and-drop' ? 'selected' : ''}>🔀 ${this.t('editorUI.dragAndDrop') || 'Drag and drop'}</option>
        <option value="drag-by-offset" ${action.subtype === 'drag-by-offset' ? 'selected' : ''}>➡️ ${this.t('editorUI.dragByOffset') || 'Drag by offset'}</option>
        <option value="drag-to-coordinates" ${action.subtype === 'drag-to-coordinates' ? 'selected' : ''}>🎯 ${this.t('editorUI.dragToCoordinates') || 'Drag to coordinates'}</option>
        <option value="drag-start" ${action.subtype === 'drag-start' ? 'selected' : ''}>▶️ ${this.t('editorUI.dragStart') || 'Start dragging'}</option>
        <option value="drag-over" ${action.subtype === 'drag-over' ? 'selected' : ''}>👆 ${this.t('editorUI.dragOver') || 'Drag over'}</option>
        <option value="drop" ${action.subtype === 'drop' ? 'selected' : ''}>⬇️ ${this.t('editorUI.drop') || 'Drop'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Datepicker -->
    <div class="form-group" id="datepickerSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.datepickerOperation')}</label>
      <select id="datepickerSubtypeSelect">
        <option value="datepicker-select-date" ${(action.subtype || 'datepicker-select-date') === 'datepicker-select-date' ? 'selected' : ''}>📅 ${this.t('editorUI.datepickerSelectDate') || 'Select date'}</option>
        <option value="datepicker-select-range" ${action.subtype === 'datepicker-select-range' ? 'selected' : ''}>📅 ${this.t('editorUI.datepickerSelectRange') || 'Select range'}</option>
        <option value="datepicker-select-time" ${action.subtype === 'datepicker-select-time' ? 'selected' : ''}>⏰ ${this.t('editorUI.datepickerSelectTime') || 'Select time'}</option>
        <option value="datepicker-select-datetime" ${action.subtype === 'datepicker-select-datetime' ? 'selected' : ''}>📅 ${this.t('editorUI.datepickerSelectDatetime') || 'Select datetime'}</option>
        <option value="datepicker-clear" ${action.subtype === 'datepicker-clear' ? 'selected' : ''}>🧹 ${this.t('editorUI.datepickerClear') || 'Clear'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Media -->
    <div class="form-group" id="mediaSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.mediaOperation')}</label>
      <select id="mediaSubtypeSelect">
        <option value="media-play" ${(action.subtype || 'media-play') === 'media-play' ? 'selected' : ''}>▶️ ${this.t('editorUI.mediaPlay') || 'Play'}</option>
        <option value="media-pause" ${action.subtype === 'media-pause' ? 'selected' : ''}>⏸️ ${this.t('editorUI.mediaPause') || 'Pause'}</option>
        <option value="media-stop" ${action.subtype === 'media-stop' ? 'selected' : ''}>⏹️ ${this.t('editorUI.mediaStop') || 'Stop'}</option>
        <option value="media-seek" ${action.subtype === 'media-seek' ? 'selected' : ''}>⏩ ${this.t('editorUI.mediaSeek') || 'Seek'}</option>
        <option value="media-set-volume" ${action.subtype === 'media-set-volume' ? 'selected' : ''}>🔊 ${this.t('editorUI.mediaSetVolume') || 'Set volume'}</option>
        <option value="media-mute" ${action.subtype === 'media-mute' ? 'selected' : ''}>🔇 ${this.t('editorUI.mediaMute') || 'Mute'}</option>
        <option value="media-unmute" ${action.subtype === 'media-unmute' ? 'selected' : ''}>🔊 ${this.t('editorUI.mediaUnmute') || 'Unmute'}</option>
        <option value="media-set-playback-rate" ${action.subtype === 'media-set-playback-rate' ? 'selected' : ''}>⚡ ${this.t('editorUI.mediaSetPlaybackRate') || 'Set speed'}</option>
        <option value="media-fullscreen" ${action.subtype === 'media-fullscreen' ? 'selected' : ''}>⛶ ${this.t('editorUI.mediaFullscreen') || 'Fullscreen'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Device -->
    <div class="form-group" id="deviceSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.deviceOperation')}</label>
      <select id="deviceSubtypeSelect">
        <option value="device-set-viewport" ${(action.subtype || 'device-set-viewport') === 'device-set-viewport' ? 'selected' : ''}>📐 ${this.t('editorUI.deviceSetViewport') || 'Set viewport'}</option>
        <option value="device-rotate" ${action.subtype === 'device-rotate' ? 'selected' : ''}>🔄 ${this.t('editorUI.deviceRotate') || 'Rotate'}</option>
        <option value="device-emulate-mobile" ${action.subtype === 'device-emulate-mobile' ? 'selected' : ''}>📱 ${this.t('editorUI.deviceEmulateMobile') || 'Mobile'}</option>
        <option value="device-emulate-tablet" ${action.subtype === 'device-emulate-tablet' ? 'selected' : ''}>📱 ${this.t('editorUI.deviceEmulateTablet') || 'Tablet'}</option>
        <option value="device-emulate-desktop" ${action.subtype === 'device-emulate-desktop' ? 'selected' : ''}>💻 ${this.t('editorUI.deviceEmulateDesktop') || 'Desktop'}</option>
      </select>
    </div>

    <!-- Выпадающее меню подтипов для Chain -->
    <div class="form-group" id="chainSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.chainStrategy')}</label>
      <select id="chainSubtypeSelect">
        <option value="chain-sequential" ${(action.subtype || 'chain-sequential') === 'chain-sequential' ? 'selected' : ''}>➡️ ${this.t('editorUI.chainSequential') || 'Sequential'}</option>
        <option value="chain-parallel" ${action.subtype === 'chain-parallel' ? 'selected' : ''}>⚡ ${this.t('editorUI.chainParallel') || 'Parallel'}</option>
        <option value="chain-conditional" ${action.subtype === 'chain-conditional' ? 'selected' : ''}>❓ ${this.t('editorUI.chainConditional') || 'Conditional'}</option>
        <option value="chain-retry" ${action.subtype === 'chain-retry' ? 'selected' : ''}>🔄 ${this.t('editorUI.chainRetry') || 'Retry'}</option>
        <option value="chain-batch" ${action.subtype === 'chain-batch' ? 'selected' : ''}>📦 ${this.t('editorUI.chainBatch') || 'Batch'}</option>
      </select>
    </div>

    <div class="form-group" id="actionValueGroup">
      <label id="actionValueLabel">${this.t('editorUI.actionValueLabel')}</label>
      <div style="position: relative;">
        ${action.type === 'wait' 
          ? `<input type="number" id="actionValue" value="${actionValue}" placeholder="ms (15000 = 15 sec)" min="1" step="1000">`
          : `<input type="text" id="actionValue" value="${this.escapeHtml(actionValue)}" placeholder="Enter value">
             <span class="variable-hint-icon" id="variableHintIcon" title="${this.t('editorUI.showVariableHint') || 'Show variable hint'}">ℹ️</span>`
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

    <!-- v0.9.6.1: Селектор типа навигации (Переход / Новая вкладка / и т.д.) -->
    <div class="form-group" id="navSubtypeGroup" style="display: none;">
      <label>${this.t('editorUI.navSubtypeLabel') || 'Navigation type'}</label>
      <select id="navSubtypeSelect">
        <option value="nav-url" ${(action.subtype || 'nav-url') === 'nav-url' ? 'selected' : ''}>${this.t('editorUI.navUrl') || 'Navigate'} 🌐</option>
        <option value="new-tab" ${action.subtype === 'new-tab' ? 'selected' : ''}>${this.t('editorUI.navNewTab') || 'New tab'} 🆕</option>
        <option value="switch-tab" ${action.subtype === 'switch-tab' ? 'selected' : ''}>${this.t('editorUI.switchTab') || 'Switch tab'} ↔️</option>
        <option value="close-tab" ${action.subtype === 'close-tab' ? 'selected' : ''}>${this.t('editorUI.navCloseTab') || 'Close tab'} ❌</option>
        <option value="nav-refresh" ${action.subtype === 'nav-refresh' ? 'selected' : ''}>${this.t('editorUI.navRefresh') || 'Refresh'} 🔄</option>
        <option value="nav-back" ${action.subtype === 'nav-back' ? 'selected' : ''}>${this.t('editorUI.navBack') || 'Back'} ⬅️</option>
        <option value="nav-forward" ${action.subtype === 'nav-forward' ? 'selected' : ''}>${this.t('editorUI.navForward') || 'Forward'} ➡️</option>
        <option value="nav-get-url" ${action.subtype === 'nav-get-url' ? 'selected' : ''}>${this.t('editorUI.navGetUrl') || 'Get URL'} 🔗</option>
      </select>
    </div>

    <div class="form-group" id="navGetUrlGroup" style="display: none;">
      <label>${this.t('editorUI.navGetUrlVariableLabel') || 'Variable'}</label>
      <input type="text" id="navGetUrlVariableName" value="${this.escapeHtml(action.variableName || '')}" placeholder="currentUrl">
      <label style="margin-top: 8px;">${this.t('editorUI.navGetUrlPartLabel') || 'URL part'}</label>
      <select id="navGetUrlPart">
        <option value="full" ${(action.urlPart || 'full') === 'full' ? 'selected' : ''}>${this.t('editorUI.navGetUrlFull') || 'Full URL'}</option>
        <option value="href" ${action.urlPart === 'href' ? 'selected' : ''}>${this.t('editorUI.navGetUrlHref') || 'href (полный)'}</option>
        <option value="origin" ${action.urlPart === 'origin' ? 'selected' : ''}>${this.t('editorUI.navGetUrlOrigin') || 'Origin (протокол + хост)'}</option>
        <option value="pathname" ${action.urlPart === 'pathname' ? 'selected' : ''}>${this.t('editorUI.navGetUrlPathname') || 'Path (/path/to/page)'}</option>
        <option value="path" ${action.urlPart === 'path' ? 'selected' : ''}>${this.t('editorUI.navGetUrlPath') || 'Path without /'}</option>
        <option value="hostname" ${action.urlPart === 'hostname' ? 'selected' : ''}>${this.t('editorUI.navGetUrlHostname') || 'Hostname'}</option>
        <option value="host" ${action.urlPart === 'host' ? 'selected' : ''}>${this.t('editorUI.navGetUrlHost') || 'Host (хост:порт)'}</option>
        <option value="protocol" ${action.urlPart === 'protocol' ? 'selected' : ''}>${this.t('editorUI.navGetUrlProtocol') || 'Protocol'}</option>
        <option value="search" ${action.urlPart === 'search' ? 'selected' : ''}>${this.t('editorUI.navGetUrlSearch') || 'Query (?key=val)'}</option>
        <option value="hash" ${action.urlPart === 'hash' ? 'selected' : ''}>${this.t('editorUI.navGetUrlHash') || 'Hash (#anchor)'}</option>
      </select>
      <small style="display: block; margin-top: 4px; color: #666;">${this.t('editorUI.navGetUrlHint') || 'Saves current page URL to variable'}</small>
    </div>

    <div class="form-group hidden" id="urlGroup">
      <label>URL</label>
      <input type="text" id="actionUrl" value="${action.url || ''}" placeholder="https://example.com">
    </div>

    <!-- v0.9.6.1: Форма для switch-tab — выбор вкладки для переключения -->
    <div class="form-group" id="switchTabGroup" style="display: none;">
      <label>${this.t('editorUI.switchTabMatchMode') || 'Tab match mode'}</label>
      <select id="switchTabMode">
        <option value="index" ${(action.switchTab?.mode || 'index') === 'index' ? 'selected' : ''}>${this.t('editorUI.switchTabByIndex') || 'By index (0, 1, 2...)'}</option>
        <option value="url" ${action.switchTab?.mode === 'url' ? 'selected' : ''}>${this.t('editorUI.switchTabByUrl') || 'By URL (substring or regex)'}</option>
        <option value="title" ${action.switchTab?.mode === 'title' ? 'selected' : ''}>${this.t('editorUI.switchTabByTitle') || 'By title (substring or regex)'}</option>
      </select>
      <div id="switchTabIndexGroup" style="margin-top: 8px;">
        <label>${this.t('editorUI.switchTabIndex') || 'Tab index (0 = first)'}</label>
        <input type="number" id="switchTabIndex" value="${action.switchTab?.tabIndex ?? 0}" min="0" placeholder="0" class="form-control">
      </div>
      <div id="switchTabUrlGroup" style="margin-top: 8px; display: none;">
        <label>${this.t('editorUI.switchTabUrlPattern') || 'URL (подстрока или /regex/)'}</label>
        <input type="text" id="switchTabUrlPattern" value="${this.escapeHtml(action.switchTab?.urlPattern || '')}" placeholder="example.com или /example\\.com/' class="form-control">
      </div>
      <div id="switchTabTitleGroup" style="margin-top: 8px; display: none;">
        <label>${this.t('editorUI.switchTabTitlePattern') || 'Title (substring or /regex/)'}</label>
        <input type="text" id="switchTabTitlePattern" value="${this.escapeHtml(action.switchTab?.titlePattern || '')}" placeholder="Dashboard или /Dashboard/i" class="form-control">
      </div>
      <small style="display: block; margin-top: 8px; color: #666;">${this.t('editorUI.switchTabHint') || 'Tab index (0 = first). URL/title — substring or regex /pattern/.'}</small>
    </div>

    <!-- Форма для Screenshot: выбор области снимка -->
    <div class="form-group" id="screenshotCaptureGroup" style="display: ${action.type === 'screenshot' ? 'block' : 'none'};">
      <label>${this.t('editorUI.screenshotCaptureLabel') || 'Capture area'}</label>
      <select id="screenshotCaptureType">
        <option value="full" ${action.screenshotCaptureType === 'full' ? 'selected' : ''}>${this.t('editorUI.screenshotCaptureFull') || 'Full screen'}</option>
        <option value="full-page" ${action.screenshotCaptureType === 'full-page' || action.subtype === 'page-screenshot-full' ? 'selected' : ''}>${this.t('editorUI.pageScreenshotFull') || 'Full page (with scroll)'}</option>
        <option value="region" ${action.screenshotCaptureType === 'region' ? 'selected' : ''}>${this.t('editorUI.screenshotCaptureRegion') || 'Screen region'}</option>
        <option value="element" ${(action.screenshotCaptureType || 'element') === 'element' && action.screenshotCaptureType !== 'full-page' && action.subtype !== 'page-screenshot-full' ? 'selected' : ''}>${this.t('editorUI.screenshotCaptureElement') || 'Element (selector)'}</option>
      </select>
    </div>
    <div class="form-group" id="screenshotRegionGroup" style="display: ${action.type === 'screenshot' && action.screenshotCaptureType === 'region' ? 'block' : 'none'};">
      <label>${this.t('editorUI.screenshotRegionLabel') || 'Region (x, y, width, height)'}</label>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <input type="number" id="screenshotRegionX" value="${action.screenshotRegion?.x ?? 0}" placeholder="X" min="0" style="width: 70px;">
        <input type="number" id="screenshotRegionY" value="${action.screenshotRegion?.y ?? 0}" placeholder="Y" min="0" style="width: 70px;">
        <input type="number" id="screenshotRegionWidth" value="${action.screenshotRegion?.width ?? 400}" placeholder="Width" min="1" style="width: 70px;">
        <input type="number" id="screenshotRegionHeight" value="${action.screenshotRegion?.height ?? 300}" placeholder="Height" min="1" style="width: 70px;">
      </div>
      <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.screenshotRegionHint') || 'Pixels from top-left of window'}</small>
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
        <option value="collect-data" ${action.variable?.operation === 'collect-data' ? 'selected' : ''}>${this.t('editorUI.collectDataOp') || 'Collect data row'}</option>
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

    <div class="form-group" id="variableCollectDataGroup" style="display: ${action.type === 'variable' && action.variable?.operation === 'collect-data' ? 'block' : 'none'};">
      <label>${this.t('editorUI.collectDataVariableNamesLabel') || 'Variable names to collect'}</label>
      <input type="text" id="variableCollectDataNames" value="${this.escapeHtml(Array.isArray(action.variable?.variableNames) ? action.variable.variableNames.join(', ') : (action.variable?.variableNames || ''))}" placeholder="price, title, link">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.collectDataHint') || 'Comma-separated. Leave empty to use variables with exportToRow.'}
      </small>
    </div>

<!-- Clipboard fields -->
    <div class="form-group" id="clipboardVariableNameGroup" style="display: none;">
      <label>${this.t('editorUI.clipboardVariableNameLabel')}</label>
      <input type="text" id="clipboardVariableName" value="${this.escapeHtml(action.variableName || '')}" placeholder="copiedText">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.clipboardVariableNameHint')}
      </small>
    </div>

    <div class="form-group" id="clipboardTextGroup" style="display: none;">
      <label>${this.t('editorUI.textToCopyLabel')}</label>
      <textarea id="clipboardText" rows="3" placeholder="${this.t('editorUI.textToCopyPlaceholder')}">${this.escapeHtml(action.text || action.value || '')}</textarea>
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.clipboardVarsHint')}
      </small>
    </div>

<!-- Network fields -->
    <div class="form-group" id="networkUrlPatternGroup" style="display: none;">
      <label>${this.t('editorUI.urlPatternLabel')}</label>
      <input type="text" id="networkUrlPattern" value="${this.escapeHtml(action.urlPattern || action.value || '')}" placeholder="*/api/users/* or /api\\/users\\/\\d+/">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.urlPatternHint2')}
      </small>
    </div>

    <div class="form-group" id="networkTimeoutGroup" style="display: none;">
      <label>${this.t('editorUI.timeoutMs')}</label>
      <input type="number" id="networkTimeout" min="1000" max="60000" step="1000" value="${action.timeout || 10000}" placeholder="10000">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.timeoutHint')}
      </small>
    </div>

    <div class="form-group" id="networkIdleTimeGroup" style="display: none;">
      <label>${this.t('editorUI.idleTimeMs')}</label>
      <input type="number" id="networkIdleTime" min="100" max="5000" step="100" value="${action.idleTime || 500}" placeholder="500">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.idleTimeHint')}
      </small>
    </div>

    <div class="form-group" id="networkExpectedStatusGroup" style="display: none;">
      <label>${this.t('editorUI.expectedHttpStatus')}</label>
      <input type="number" id="networkExpectedStatus" min="100" max="599" value="${action.expectedStatus || action.status || 200}" placeholder="200">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.expectedHttpStatusHint')}
      </small>
    </div>

    <div class="form-group" id="networkSaveToVariableGroup" style="display: none;">
      <label style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="networkSaveToVariableCheckbox" ${action.saveToVariable || action.variableName ? 'checked' : ''}>
        <span>${this.t('editorUI.saveRequestDataToVar')}</span>
      </label>
      <input type="text" id="networkSaveToVariable" value="${this.escapeHtml(action.saveToVariable || action.variableName || '')}" placeholder="requestData" style="margin-top: 8px; display: ${action.saveToVariable || action.variableName ? 'block' : 'none'};">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.saveRequestDataHint')}
      </small>
    </div>

<!-- Table fields -->
    <div class="form-group" id="tableRowIndexGroup" style="display: none;">
      <label>${this.t('editorUI.rowIndexLabel')}</label>
      <input type="number" id="tableRowIndex" min="0" max="9999" value="${action.rowIndex || action.row || 0}" placeholder="0">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.rowIndexHint')}
      </small>
    </div>

    <div class="form-group" id="tableColumnIndexGroup" style="display: none;">
      <label>${this.t('editorUI.columnIndexLabel')}</label>
      <input type="number" id="tableColumnIndex" min="0" max="9999" value="${action.columnIndex || action.column || 0}" placeholder="0">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.columnIndexHint')}
      </small>
    </div>

    <div class="form-group" id="tableVariableNameGroup" style="display: none;">
      <label>${this.t('editorUI.tableVariableNameLabel')}</label>
      <input type="text" id="tableVariableName" value="${this.escapeHtml(action.variableName || action.saveToVariable || '')}" placeholder="cellValue">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.variableToStoreResult')}
      </small>
    </div>

    <div class="form-group" id="tableExpectedValueGroup" style="display: none;">
      <label>${this.t('editorUI.expectedValueLabel')}</label>
      <input type="text" id="tableExpectedValue" value="${this.escapeHtml(action.expectedValue || action.value || '')}" placeholder="${this.t('editorUI.expectedValuePlaceholder') || 'Expected cell value'}">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.expectedValueHint')}
      </small>
    </div>

    <div class="form-group" id="tableExpectedCountGroup" style="display: none;">
      <label>${this.t('editorUI.expectedCountLabel')}</label>
      <input type="number" id="tableExpectedCount" min="0" max="9999" value="${action.expectedCount || action.count || action.value || 0}" placeholder="5">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.expectedCountHint')}
      </small>
    </div>

    <div class="form-group" id="tableSearchTextGroup" style="display: none;">
      <label>${this.t('editorUI.searchTextLabel')}</label>
      <input type="text" id="tableSearchText" value="${this.escapeHtml(action.searchText || action.text || action.value || '')}" placeholder="${this.t('editorUI.searchTextPlaceholder') || 'Search for...'}">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.searchTextHint')}
      </small>
    </div>

    <div class="form-group" id="tableSearchColumnGroup" style="display: none;">
      <label>${this.t('editorUI.searchColumnLabel')}</label>
      <input type="number" id="tableSearchColumn" min="0" max="9999" value="${action.columnIndex !== undefined ? action.columnIndex : ''}" placeholder="">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.searchColumnHint')}
      </small>
    </div>

<!-- Drag fields -->
    <div class="form-group" id="dragTargetSelectorGroup" style="display: none;">
      <label>${this.t('editorUI.targetSelectorLabel')}</label>
      <input type="text" id="dragTargetSelector" value="${this.escapeHtml(action.targetSelector || action.target || '')}" placeholder="#drop-zone">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.targetSelectorHint')}
      </small>
    </div>

    <div class="form-group" id="dragOffsetXGroup" style="display: none;">
      <label>${this.t('editorUI.offsetXLabel')}</label>
      <input type="number" id="dragOffsetX" min="-9999" max="9999" value="${action.offsetX || action.x || 0}" placeholder="100">
    </div>

    <div class="form-group" id="dragOffsetYGroup" style="display: none;">
      <label>${this.t('editorUI.offsetYLabel')}</label>
      <input type="number" id="dragOffsetY" min="-9999" max="9999" value="${action.offsetY || action.y || 0}" placeholder="100">
    </div>

    <div class="form-group" id="dragTargetXGroup" style="display: none;">
      <label>${this.t('editorUI.targetXLabel')}</label>
      <input type="number" id="dragTargetX" min="0" max="9999" value="${action.targetX || action.x || 0}" placeholder="500">
    </div>

    <div class="form-group" id="dragTargetYGroup" style="display: none;">
      <label>${this.t('editorUI.targetYLabel')}</label>
      <input type="number" id="dragTargetY" min="0" max="9999" value="${action.targetY || action.y || 0}" placeholder="300">
    </div>

<!-- Datepicker fields -->
    <div class="form-group" id="datepickerDateGroup" style="display: none;">
      <label>${this.t('editorUI.dateLabel')}</label>
      <input type="text" id="datepickerDate" value="${this.escapeHtml(action.date || action.value || '')}" placeholder="2024-12-31">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.dateFormatHint')}
      </small>
    </div>

    <div class="form-group" id="datepickerRangeGroup" style="display: none;">
      <label>${this.t('editorUI.startDate')}</label>
      <input type="text" id="datepickerStartDate" value="${this.escapeHtml(action.startDate || action.from || '')}" placeholder="2024-01-01">
      <label style="margin-top: 8px;">${this.t('editorUI.endDate')}</label>
      <input type="text" id="datepickerEndDate" value="${this.escapeHtml(action.endDate || action.to || '')}" placeholder="2024-12-31">
    </div>

    <div class="form-group" id="datepickerTimeGroup" style="display: none;">
      <label>${this.t('editorUI.timeLabel')}</label>
      <input type="text" id="datepickerTime" value="${this.escapeHtml(action.time || action.value || '')}" placeholder="14:30">
    </div>

<!-- Media fields -->
    <div class="form-group" id="mediaSeekTimeGroup" style="display: none;">
      <label>${this.t('editorUI.seekTimeLabel')}</label>
      <input type="number" id="mediaSeekTime" min="0" max="99999" step="0.1" value="${action.time || action.position || 0}" placeholder="30">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.seekTimeHint')}
      </small>
    </div>

    <div class="form-group" id="mediaVolumeGroup" style="display: none;">
      <label>${this.t('editorUI.volumeLabel')}</label>
      <input type="number" id="mediaVolume" min="0" max="1" step="0.1" value="${action.volume || action.value || 0.5}" placeholder="0.5">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.volumeHint')}
      </small>
    </div>

    <div class="form-group" id="mediaPlaybackRateGroup" style="display: none;">
      <label>${this.t('editorUI.playbackSpeedLabel')}</label>
      <input type="number" id="mediaPlaybackRate" min="0.25" max="4" step="0.25" value="${action.rate || action.speed || 1}" placeholder="1">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.playbackSpeedHint')}
      </small>
    </div>

<!-- Device fields -->
    <div class="form-group" id="deviceViewportGroup" style="display: none;">
      <label>${this.t('editorUI.viewportWidth')}</label>
      <input type="number" id="deviceWidth" min="320" max="3840" value="${action.width || action.viewportWidth || 1920}" placeholder="1920">
      <label style="margin-top: 8px;">${this.t('editorUI.viewportHeight')}</label>
      <input type="number" id="deviceHeight" min="240" max="2160" value="${action.height || action.viewportHeight || 1080}" placeholder="1080">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.viewportCommonHint')}
      </small>
    </div>

    <div class="form-group" id="deviceOrientationGroup" style="display: none;">
      <label>${this.t('editorUI.orientation')}</label>
      <select id="deviceOrientation">
        <option value="portrait" ${(action.orientation || 'portrait') === 'portrait' ? 'selected' : ''}>📱 ${this.t('editorUI.portrait')}</option>
        <option value="landscape" ${action.orientation === 'landscape' ? 'selected' : ''}>📱 ${this.t('editorUI.landscape')}</option>
      </select>
    </div>

<!-- Chain fields -->
    <div class="form-group" id="chainRetryGroup" style="display: none;">
      <label>${this.t('editorUI.maxRetriesLabel')}</label>
      <input type="number" id="chainMaxRetries" min="1" max="10" value="${action.maxRetries || action.retries || 3}" placeholder="3">
      <label style="margin-top: 8px;">${this.t('editorUI.retryDelayLabel')}</label>
      <input type="number" id="chainRetryDelay" min="0" max="10000" step="100" value="${action.retryDelay || action.delay || 1000}" placeholder="1000">
    </div>

    <div class="form-group" id="chainStepsGroup" style="display: none;">
      <label>${this.t('editorUI.chainStepsLabel')}</label>
      <textarea id="chainSteps" rows="6" placeholder='[{"type": "click", "selector": {...}}, ...]'>${this.escapeHtml(JSON.stringify(action.steps || action.actions || [], null, 2))}</textarea>
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.chainStepsHint')}
      </small>
    </div>

    <div class="form-group" id="chainResultVarGroup" style="display: none;">
      <label>${this.t('editorUI.chainResultVarLabel')}</label>
      <input type="text" id="chainResultVariable" value="${this.escapeHtml(action.resultVariable || action.saveResults || '')}" placeholder="batchResults">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.chainResultVarHint')}
      </small>
    </div>

<!-- Адаптивный шаг -->
    <div class="form-group" id="adaptiveGroup" style="display: ${action.type === 'adaptive' ? 'block' : 'none'};">
      <label>${this.t('editorUI.adaptiveStepSpan') || 'Step span (stepSpan)'}</label>
      <input type="number" id="adaptiveStepSpan" min="1" max="99" value="${action.stepSpan || 1}" placeholder="1">
      <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.adaptiveStepSpanHint') || 'Next step number = current + stepSpan'}</small>
      
      <!-- Выбор режима адаптивного шага -->
      <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveMode') || 'Mode'}</label>
      <select id="adaptiveSubtype">
        <option value="adaptive-single" ${action.subtype === 'adaptive-single' || (!action.subtype && action.subtype !== 'adaptive-auto' && action.subtype !== 'adaptive-flow') ? 'selected' : ''}>${this.t('editorUI.adaptiveSingle') || 'Single action'}</option>
        <option value="adaptive-auto" ${action.subtype === 'adaptive-auto' ? 'selected' : ''}>${this.t('editorUI.adaptiveAuto') || 'Automatic'}</option>
        <option value="adaptive-flow" ${action.subtype === 'adaptive-flow' ? 'selected' : ''}>${this.t('editorUI.adaptiveFlow') || '🎯 Пользовательский сценарий'}</option>
      </select>
      
      <!-- Поля для adaptive-auto -->
      <div id="adaptiveAutoFields" style="display: ${action.subtype === 'adaptive-auto' ? 'block' : 'none'}; margin-top: 12px; padding: 12px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">
        <label>${this.t('editorUI.adaptiveAutoMaxIterations') || 'Max iterations'}</label>
        <input type="number" id="adaptiveAutoMaxIterations" min="1" max="999" value="${action.maxIterations || 99}" placeholder="99">
        <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.adaptiveAutoMaxIterationsHint') || 'Max fill/save cycles (1-999)'}</small>
        
        <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveAutoExcludeButtons') || 'Exclude buttons'}</label>
        <input type="text" id="adaptiveAutoExcludeButtons" value="${this.escapeHtml(action.excludeButtons || '')}" placeholder="${this.t('editorUI.adaptiveAutoExcludeButtonsPlaceholder') || 'Cancel, Delete'}">
        <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.adaptiveAutoExcludeButtonsHint') || 'Buttons to skip (comma-separated)'}</small>
        
        <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveAutoFillMode') || 'Fill mode'}</label>
        <select id="adaptiveAutoFillMode">
          <option value="required" ${action.fillMode !== 'all' && action.fillMode !== 'empty' ? 'selected' : ''}>${this.t('editorUI.adaptiveAutoFillModeRequired') || 'Required only'}</option>
          <option value="all" ${action.fillMode === 'all' ? 'selected' : ''}>${this.t('editorUI.adaptiveAutoFillModeAll') || 'All fields'}</option>
          <option value="empty" ${action.fillMode === 'empty' ? 'selected' : ''}>${this.t('editorUI.adaptiveAutoFillModeEmpty') || 'Empty only'}</option>
        </select>
        
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
          <input type="checkbox" id="adaptiveAutoIgnoreValidation" ${action.ignoreValidationErrors ? 'checked' : ''}>
          <span>${this.t('editorUI.adaptiveAutoIgnoreValidation') || 'Ignore validation errors'}</span>
        </label>
        <small style="text-align: left; display: block; margin-top: 4px; color: #64748b;">${this.t('editorUI.adaptiveAutoIgnoreValidationHint') || 'Continue when required fields fail'}</small>
        
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
          <input type="checkbox" id="adaptiveAutoExploreDropdowns" ${action.exploreDropdowns !== false ? 'checked' : ''}>
          <span>${this.t('editorUI.adaptiveAutoExploreDropdowns') || 'Try different dropdown options'}</span>
        </label>
        <small style="text-align: left; display: block; margin-top: 4px; color: #64748b;">${this.t('editorUI.adaptiveAutoExploreDropdownsHint') || 'Select up to 3-5 options per dropdown'}</small>
        
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
          <input type="checkbox" id="adaptiveAutoToggleCheckboxes" ${action.toggleCheckboxes !== false ? 'checked' : ''}>
          <span>${this.t('editorUI.adaptiveAutoToggleCheckboxes') || 'Toggle checkboxes in both states'}</span>
        </label>
        <small style="text-align: left; display: block; margin-top: 4px; color: #64748b;">${this.t('editorUI.adaptiveAutoToggleCheckboxesHint') || 'Test checked and unchecked states'}</small>
        
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
          <input type="checkbox" id="adaptiveAutoEnableBacktracking" ${action.enableBacktracking !== false ? 'checked' : ''}>
          <span>${this.t('editorUI.adaptiveAutoEnableBacktracking') || 'Enable backtracking'}</span>
        </label>
        <small style="text-align: left; display: block; margin-top: 4px; color: #64748b;">${this.t('editorUI.adaptiveAutoEnableBacktrackingHint') || 'Return to previous pages to try other buttons'}</small>
        
        <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveAutoMaxDialogClose') || 'Max same-dialog closes (0 = unlimited)'}</label>
        <input type="number" id="adaptiveAutoMaxDialogClose" min="0" max="100" value="${action.maxDialogCloseAttempts !== undefined ? action.maxDialogCloseAttempts : 0}" placeholder="0">
        <small style="text-align: left; display: block; margin-top: 4px; color: #64748b;">${this.t('editorUI.adaptiveAutoMaxDialogCloseHint') || 'Stop if same dialog closes more than N times. 0 = unlimited'}</small>
        
        <div style="margin-top: 12px; padding: 8px; background: #ecfdf5; border-radius: 4px; font-size: 12px; color: #047857;">
          <strong>${this.t('editorUI.adaptiveAutoModeTitle') || 'Auto mode:'}</strong> ${this.t('editorUI.adaptiveAutoModeDescription') || 'Step will find fields, fill them, try dropdown options, toggle checkboxes, find save buttons and click them. Cycle repeats while there are available actions.'}
        </div>
      </div>
      
      <!-- Поля для adaptive-single -->
      <div id="adaptiveSingleFields" style="display: ${action.subtype !== 'adaptive-auto' ? 'block' : 'none'};">
        <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
          <input type="checkbox" id="adaptiveExcludePreviousValues" ${action.excludePreviousValues ? 'checked' : ''}>
          <span>${this.t('editorUI.adaptiveExcludePreviousValues') || 'Do not apply values from previous run'}</span>
        </label>
        <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveMaxRepeatCount') || 'Repeat action (times)'}</label>
        <input type="number" id="adaptiveMaxRepeatCount" min="1" max="100" value="${action.maxRepeatCount || 1}" placeholder="1">
        <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.adaptiveMaxRepeatCountHint') || 'E.g.: select option from dropdown 5 times'}</small>
        <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveInnerActionType') || 'Inner action type'}</label>
        <select id="adaptiveInnerActionType">
          <option value="click" ${(inner && inner.type === 'click') ? 'selected' : ''}>${this.t('editorUI.actionTypeClick')}</option>
          <option value="input" ${(inner && inner.type === 'input') ? 'selected' : ''}>${this.t('editorUI.actionTypeInput')}</option>
          <option value="change" ${(inner && inner.type === 'change') ? 'selected' : ''}>${this.t('editorUI.actionTypeChange')}</option>
          <option value="scroll" ${(inner && inner.type === 'scroll') ? 'selected' : ''}>${this.t('editorUI.actionTypeScroll')}</option>
          <option value="keyboard" ${(inner && inner.type === 'keyboard') ? 'selected' : ''}>${this.t('editorUI.actionTypeKeyboard')}</option>
          <option value="wait" ${(inner && inner.type === 'wait') ? 'selected' : ''}>${this.t('editorUI.actionTypeWait')}</option>
          <option value="assert" ${(inner && (inner.type === 'assert' || inner.type === 'assertion')) ? 'selected' : ''}>${this.t('editorUI.actionTypeAssertion')}</option>
          <option value="hover" ${(inner && inner.type === 'hover') ? 'selected' : ''}>${this.t('editorUI.actionTypeHover')}</option>
          <option value="focus" ${(inner && inner.type === 'focus') ? 'selected' : ''}>${this.t('editorUI.actionTypeFocus')}</option>
          <option value="blur" ${(inner && inner.type === 'blur') ? 'selected' : ''}>${this.t('editorUI.actionTypeBlur')}</option>
          <option value="clear" ${(inner && inner.type === 'clear') ? 'selected' : ''}>${this.t('editorUI.actionTypeClear')}</option>
          <option value="screenshot" ${(inner && inner.type === 'screenshot') ? 'selected' : ''}>${this.t('editorUI.actionTypeScreenshot')}</option>
          <option value="cookie" ${(inner && inner.type === 'cookie') ? 'selected' : ''}>${this.t('editorUI.actionTypeCookie')}</option>
          <option value="variable" ${(inner && inner.type === 'variable') ? 'selected' : ''}>${this.t('editorUI.actionTypeVariable')}</option>
          <option value="api" ${(inner && inner.type === 'api') ? 'selected' : ''}>${this.t('editorUI.actionTypeApi')}</option>
          <option value="javascript" ${(inner && inner.type === 'javascript') ? 'selected' : ''}>${this.t('editorUI.actionTypeJavaScript')}</option>
        </select>
        <label style="display: block; margin-top: 8px;">${this.t('editorUI.adaptiveInnerSubtype') || 'Subtype'}</label>
        <input type="text" id="adaptiveInnerSubtype" value="${this.escapeHtml((inner && inner.subtype) || 'click')}" placeholder="click, input-text, dropdown-select...">
        <label style="display: block; margin-top: 12px;">${this.t('editorUI.adaptiveSelectorHint') || 'Search hint (optional)'}</label>
        <input type="text" id="adaptiveSelectorHint" value="${this.escapeHtml(action.selectorHint || (inner && inner.selectorHint) || '')}" placeholder="${this.t('editorUI.adaptiveSelectorHintPlaceholder') || 'Order, Send, Save...'}">
        <small style="text-align: left; display: block; margin-top: 4px;">${this.t('editorUI.adaptiveSelectorHintDesc') || 'Text in element label for priority during auto-search. Leave empty for first matching element.'}</small>
        <div style="margin-top: 16px; padding: 12px; background: #f0f9ff; border-radius: 6px; border: 1px solid #bae6fd;">
          <strong>${this.t('editorUI.adaptiveInnerAction') || 'Inner action'}</strong>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">${this.t('editorUI.adaptiveInnerActionHint') || 'Selector optional — step will find element from collected selectors. Value for input/select.'}</p>
        </div>
      </div>
      
      <!-- Поля для adaptive-flow (Пользовательский сценарий) -->
      <div id="adaptiveFlowFields" style="display: ${action.subtype === 'adaptive-flow' ? 'block' : 'none'}; margin-top: 12px;">
        
        <!-- Описание режима -->
        <div style="padding: 12px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 6px; border: 1px solid #7dd3fc; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 20px;">🎯</span>
            <strong style="color: #0369a1;">${this.t('editorUI.adaptiveFlowTitle') || 'Custom scenario'}</strong>
          </div>
          <p style="margin: 0; font-size: 12px; color: #075985; line-height: 1.5;">
            ${this.t('editorUI.adaptiveFlowDescription') || 'Create a sequence of steps with full control. Each step can include auto-exploration (try dropdown options, toggle checkboxes).'}
          </p>
        </div>

        <!-- Список шагов -->
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label style="margin: 0; font-weight: 600;">${this.t('editorUI.flowSteps') || 'Scenario steps'}</label>
            <button type="button" id="addFlowStepBtn" style="
              padding: 6px 12px;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span>+</span> ${this.t('editorUI.addStep') || 'Add step'}
            </button>
          </div>
          
          <div id="flowStepsList" style="
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            background: white;
            min-height: 100px;
            max-height: 400px;
            overflow-y: auto;
          ">
            ${this._renderFlowSteps(action.flow || [])}
          </div>
        </div>

        <!-- Глобальные настройки сценария -->
        <div style="padding: 12px; background: #fafaf9; border-radius: 6px; border: 1px solid #e7e5e4;">
          <strong style="display: block; margin-bottom: 8px; color: #292524;">${this.t('editorUI.flowGlobalOptions') || 'Global settings'}</strong>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #57534e;">${this.t('editorUI.flowMaxVariationsPerStep') || 'Max variations per step'}</span>
            <input type="number" id="flowMaxVariationsPerStep" min="1" max="20" value="${action.flowOptions?.maxVariationsPerStep || 5}" 
              style="width: 100%; margin-top: 4px; padding: 6px; border: 1px solid #d6d3d1; border-radius: 4px;">
          </label>
          <small style="display: block; margin-bottom: 12px; color: #78716c; font-size: 11px;">
            ${this.t('editorUI.flowMaxVariationsPerStepHint') || 'Max variations for dropdown/checkbox on one step'}
          </small>

          <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <input type="checkbox" id="flowAllowBacktrack" ${action.flowOptions?.allowBacktrack !== false ? 'checked' : ''}>
            <span style="font-size: 12px;">${this.t('editorUI.flowAllowBacktrack') || 'Allow backtracking'}</span>
          </label>

          <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <input type="checkbox" id="flowStopOnError" ${action.flowOptions?.stopOnError === true ? 'checked' : ''}>
            <span style="font-size: 12px;">${this.t('editorUI.flowStopOnError') || 'Stop on error'}</span>
          </label>

          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="flowSaveSnapshots" ${action.flowOptions?.saveSnapshots !== false ? 'checked' : ''}>
            <span style="font-size: 12px;">${this.t('editorUI.flowSaveSnapshots') || 'Save snapshots at each step'}</span>
          </label>
          <small style="display: block; margin-top: 4px; color: #78716c; font-size: 11px;">
            ${this.t('editorUI.flowSaveSnapshotsHint') || 'Allows restoring state at any step'}
          </small>
        </div>

        <!-- Статистика (если есть) -->
        ${action._flowStatistics ? `
        <div style="margin-top: 12px; padding: 10px; background: #ecfdf5; border-radius: 4px; border: 1px solid #86efac;">
          <strong style="display: block; margin-bottom: 6px; color: #047857; font-size: 13px;">📊 Последний прогон:</strong>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px; color: #065f46;">
            <div><strong>Шагов выполнено:</strong> ${action._flowStatistics.stepsCompleted || 0} / ${(action.flow || []).length}</div>
            <div><strong>Вариаций:</strong> ${action._flowStatistics.totalVariations || 0}</div>
            <div><strong>Действий:</strong> ${action._flowStatistics.actionsInvoked || 0}</div>
            <div><strong>Ошибок:</strong> ${(action._flowStatistics.errors || []).length}</div>
          </div>
        </div>
        ` : ''}
      </div>
      
      <!-- Кнопка для просмотра отчётов (только после выполнения теста) -->
      ${action._runHistory && action._runHistory.length > 0 ? `
      <div style="margin-top: 16px;">
        <button type="button" id="adaptiveViewReportBtn" style="
          width: 100%;
          padding: 10px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
        " class="adaptive-view-report-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3v18h18"></path>
            <path d="M18 17V9"></path>
            <path d="M13 17V5"></path>
            <path d="M8 17v-3"></path>
          </svg>
          📊 Посмотреть отчёт (${action._runHistory.length} ${action._runHistory.length === 1 ? 'действие' : action._runHistory.length < 5 ? 'действия' : 'действий'})
        </button>
        <small style="display: block; margin-top: 4px; text-align: center; color: #64748b;">
          ${action.subtype === 'adaptive-auto' ? `Итераций: ${action._statistics?.iterations || 0} | Выполнено: ${action._statistics?.actionsInvoked || 0} | Ошибок: ${(action._statistics?.errors || []).length}` : `Попыток: ${action._statistics?.stepsInvoked || 0} | Выполнено: ${action._statistics?.actionsInvoked || 0} | Ошибок: ${(action._statistics?.errors || []).length}`}
        </small>
      </div>
      ` : ''}
    </div>

    <!-- Область выбора селекторов (всегда ниже области типа действия) -->
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

    <div class="form-group cached-selectors-wrapper" id="cachedSelectorsWrapper" style="display: none;">
      <label>${this.t('editorUI.cachedSelectorsLabel') || 'Selectors from analysis'}</label>
      <select id="cachedSelectorsDropdown" class="cached-selectors-dropdown">
        <option value="">-- ${this.t('editorUI.selectFromCache') || 'Select from analysis cache'} --</option>
      </select>
      <small style="text-align: left; display: block; margin-top: 4px; color: #7c3aed;">
        ${this.t('editorUI.cachedSelectorsHint') || 'Selectors from last Analysis step — available while on this page'}
      </small>
    </div>

    <div class="form-group" id="collectedFromPageGroup" style="display: none; margin-bottom: 12px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
        <input type="checkbox" id="useSelectorFromCollectedPage" style="margin: 0;">
        <span>${this.t('editorUI.selectFromCollected') || 'Select from collected on page'}</span>
      </label>
      <div id="editorPageSelectorGroup" style="display: none; margin-top: 8px;">
        <label style="font-size: 12px; display: block; margin-bottom: 4px;">${this.t('editorUI.pageLabel') || 'Page'}:</label>
        <select id="editorCollectedPageSelect" style="width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <option value="">-- ${this.t('editorUI.selectPage') || 'Select page'} --</option>
        </select>
      </div>
      <div id="editorCollectedSelectorGroup" style="display: none; margin-top: 8px;">
        <label style="font-size: 12px; display: block; margin-bottom: 4px;">${this.t('editorUI.collectedSelectorLabel') || 'Collected selector'}:</label>
        <select id="editorCollectedSelectorSelect" style="width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; font-family: monospace;">
          <option value="">-- ${this.t('editorUI.selectPageFirst') || 'Select page first'} --</option>
        </select>
      </div>
    </div>

    <div class="form-group" id="selectorValueGroup">
      <label>${this.t('editorUI.selectorValueLabel')}</label>
      <input type="text" id="selectorValue" value="${this.escapeHtml(selectorValue)}" placeholder="${this.t('editorUI.enterSelectorValue')}">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.enterSelectorExample')}
      </small>
    </div>
  `;
}

TestEditor.prototype.attachFormHandlers = function() {
  const actionType = document.getElementById('actionType');
  const selectorType = document.getElementById('selectorType');
  
  // Обновляем форму при изменении типа действия
  actionType.addEventListener('change', () => this.updateFormForActionType());
  
  // Обработчик для переключения режима адаптивного шага
  const adaptiveSubtype = document.getElementById('adaptiveSubtype');
  if (adaptiveSubtype) {
    adaptiveSubtype.addEventListener('change', (e) => {
      const value = e.target.value;
      const autoFields = document.getElementById('adaptiveAutoFields');
      const singleFields = document.getElementById('adaptiveSingleFields');
      const flowFields = document.getElementById('adaptiveFlowFields');
      
      if (autoFields) autoFields.style.display = value === 'adaptive-auto' ? 'block' : 'none';
      if (singleFields) singleFields.style.display = value === 'adaptive-single' ? 'block' : 'none';
      if (flowFields) flowFields.style.display = value === 'adaptive-flow' ? 'block' : 'none';
    });
  }
  
  // Обработчики для adaptive-flow
  const addFlowStepBtn = document.getElementById('addFlowStepBtn');
  if (addFlowStepBtn) {
    addFlowStepBtn.addEventListener('click', () => this.showAddFlowStepModal());
  }
  
  // Обработчики для редактирования/удаления шагов
  document.addEventListener('click', (e) => {
    if (e.target.closest('.edit-flow-step-btn')) {
      const stepIndex = parseInt(e.target.closest('.edit-flow-step-btn').dataset.stepIndex);
      this.showEditFlowStepModal(stepIndex);
    }
    if (e.target.closest('.delete-flow-step-btn')) {
      const stepIndex = parseInt(e.target.closest('.delete-flow-step-btn').dataset.stepIndex);
      this.deleteFlowStep(stepIndex);
    }
  });
  
  // Обработчик для кнопки просмотра отчётов adaptive-auto
  const adaptiveViewReportBtn = document.getElementById('adaptiveViewReportBtn');
  if (adaptiveViewReportBtn) {
    adaptiveViewReportBtn.addEventListener('click', () => {
      this.openAdaptiveReport(action);
    });
  }
  
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
  
  // Загружаем кэшированные селекторы для действий, которые их используют
  this.loadCachedSelectorsDropdown();
  this.setupCollectedFromPageUI();
}

TestEditor.prototype.setupCollectedFromPageUI = function() {
  const collectedFromPageGroup = document.getElementById('collectedFromPageGroup');
  const useSelectorCheckbox = document.getElementById('useSelectorFromCollectedPage');
  const editorPageSelectorGroup = document.getElementById('editorPageSelectorGroup');
  const editorCollectedSelectorGroup = document.getElementById('editorCollectedSelectorGroup');
  const editorCollectedPageSelect = document.getElementById('editorCollectedPageSelect');
  const editorCollectedSelectorSelect = document.getElementById('editorCollectedSelectorSelect');
  const selectorValueInput = document.getElementById('selectorValue');

  if (!collectedFromPageGroup || !useSelectorCheckbox) return;

  const actionType = document.getElementById('actionType')?.value;
  const subtype = document.getElementById('actionSubtype')?.value || this.currentEditAction?.subtype;
  const selectorBasedActions = ['click', 'dblclick', 'rightclick', 'hover', 'input', 'select', 'scroll', 'assert', 'assertion', 'wait', 'screenshot', 'adaptive'];
  let isSelectorAction = actionType && selectorBasedActions.includes(actionType);
  const isScreenshotElement = actionType === 'screenshot' && document.getElementById('screenshotCaptureType')?.value === 'element';
  // Для wait: только подтипы с селектором (wait-enabled, wait-value, wait-option, wait-options-count, wait-visible, wait-hidden, wait-exists, wait-not-exists)
  if (actionType === 'wait') {
    const waitWithSelector = ['wait-enabled', 'wait-value', 'wait-option', 'wait-options-count', 'wait-visible', 'wait-hidden', 'wait-exists', 'wait-not-exists'];
    isSelectorAction = isSelectorAction && waitWithSelector.includes(subtype);
  }

  if (!isSelectorAction || (actionType === 'screenshot' && !isScreenshotElement)) {
    collectedFromPageGroup.style.display = 'none';
    return;
  }
  collectedFromPageGroup.style.display = 'block';

  useSelectorCheckbox.checked = false;
  if (editorPageSelectorGroup) editorPageSelectorGroup.style.display = 'none';
  if (editorCollectedSelectorGroup) editorCollectedSelectorGroup.style.display = 'none';

  useSelectorCheckbox.onchange = async () => {
    const isChecked = useSelectorCheckbox.checked;
    if (editorPageSelectorGroup) editorPageSelectorGroup.style.display = isChecked ? 'block' : 'none';
    if (!isChecked) {
      if (editorCollectedSelectorGroup) editorCollectedSelectorGroup.style.display = 'none';
      return;
    }
    try {
      const stored = await chrome.storage.local.get(['collectedSelectors']);
      const collectedSelectors = stored.collectedSelectors || {};
      const urls = Object.keys(collectedSelectors);
      if (editorCollectedPageSelect) {
        editorCollectedPageSelect.innerHTML = '<option value="">-- ' + (this.t('editorUI.selectPage') || 'Select page') + ' --</option>';
        urls.forEach(url => {
          const opt = document.createElement('option');
          opt.value = url;
          opt.textContent = url.length > 60 ? url.substring(0, 57) + '...' : url;
          opt.title = url;
          editorCollectedPageSelect.appendChild(opt);
        });
      }
      if (editorCollectedSelectorGroup) editorCollectedSelectorGroup.style.display = 'none';
    } catch (e) {
      console.error('Error loading collected selectors:', e);
    }
  };

  if (editorCollectedPageSelect) {
    editorCollectedPageSelect.onchange = async () => {
      const url = editorCollectedPageSelect.value;
      if (!url) {
        if (editorCollectedSelectorGroup) editorCollectedSelectorGroup.style.display = 'none';
        return;
      }
      try {
        const stored = await chrome.storage.local.get(['collectedSelectors']);
        const selectors = (stored.collectedSelectors || {})[url] || [];
        if (editorCollectedSelectorSelect) {
          editorCollectedSelectorSelect.innerHTML = '<option value="">-- ' + (this.t('editorUI.selectSelector') || 'Select selector') + ' --</option>';
          selectors.forEach(item => {
            const sel = typeof item === 'string' ? item : (item.selector || item);
            const opt = document.createElement('option');
            opt.value = sel;
            const label = typeof item === 'object' ? (item.label || '') : '';
            opt.textContent = label ? `${sel} (${label})` : sel;
            editorCollectedSelectorSelect.appendChild(opt);
          });
        }
        if (editorCollectedSelectorGroup) editorCollectedSelectorGroup.style.display = 'block';
      } catch (e) {
        console.error('Error loading selectors for page:', e);
      }
    };
  }

  if (editorCollectedSelectorSelect && selectorValueInput) {
    editorCollectedSelectorSelect.onchange = () => {
      const sel = editorCollectedSelectorSelect.value;
      if (sel) {
        selectorValueInput.value = sel;
        selectorValueInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
  }
}

TestEditor.prototype.loadFilesForSelector = async function() {
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

TestEditor.prototype.formatFileSize = function(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

TestEditor.prototype.loadCachedSelectorsDropdown = async function() {
  const cachedSelectorsWrapper = document.getElementById('cachedSelectorsWrapper');
  const cachedSelectorsDropdown = document.getElementById('cachedSelectorsDropdown');
  
  if (!cachedSelectorsWrapper || !cachedSelectorsDropdown) return;
  
  const actionType = document.getElementById('actionType')?.value;
  const subtype = document.getElementById('actionSubtype')?.value || this.currentEditAction?.subtype;
  
  // Показываем dropdown только для действий, которые используют селекторы (в т.ч. скриншот по селектору)
  const selectorBasedActions = ['click', 'dblclick', 'rightclick', 'hover', 'input', 'select', 'scroll', 'assert', 'assertion', 'wait', 'screenshot'];
  
  if (!actionType || !selectorBasedActions.includes(actionType)) {
    cachedSelectorsWrapper.style.display = 'none';
    return;
  }
  if (actionType === 'screenshot') {
    const captureType = document.getElementById('screenshotCaptureType')?.value;
    if (captureType !== 'element') {
      cachedSelectorsWrapper.style.display = 'none';
      return;
    }
  }
  // Для wait: показываем только когда subtype требует селектор (не wait-until)
  if (actionType === 'wait') {
    const waitWithSelector = ['wait-enabled', 'wait-value', 'wait-option', 'wait-options-count', 'wait-visible', 'wait-hidden', 'wait-exists', 'wait-not-exists'];
    if (!waitWithSelector.includes(subtype)) {
      cachedSelectorsWrapper.style.display = 'none';
      return;
    }
  }
  
  try {
    // Получаем URL тестируемой страницы из действий теста (не из активной вкладки!)
    const currentUrl = this.getCurrentTestUrl();
    
    console.log(`🔍 [Editor] Запрос кэшированных селекторов`);
    console.log(`   URL: ${currentUrl}`);
    
    if (!currentUrl) {
      console.log(`   ❌ URL не найден`);
      cachedSelectorsWrapper.style.display = 'none';
      return;
    }
    
    // Запрашиваем кэшированные селекторы из background по URL тестируемой страницы
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CACHED_SELECTORS',
      url: currentUrl
      // tabId не передаём - background найдёт кэш по URL
    });
    console.log(`   Ответ от background:`, response);
    
    // response.selectors - массив объектов [{selector, type, value, element, text, quality, isUnique}]
    if (response && response.success && response.selectors && response.selectors.length > 0) {
      console.log(`   ✅ Найдено ${response.selectors.length} селекторов`);
      // Группируем селекторы по типу
      const grouped = {};
      for (const sel of response.selectors) {
        const type = sel.type || 'css';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(sel);
      }
      
      // Очищаем dropdown
      cachedSelectorsDropdown.innerHTML = `<option value="">-- ${this.t('editorUI.selectFromCache') || 'Select from Analysis Cache'} --</option>`;
      
      // Добавляем селекторы по группам
      for (const [type, selectors] of Object.entries(grouped)) {
        if (selectors && selectors.length > 0) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = `${type} (${selectors.length})`;
          
          selectors.forEach(sel => {
            const selectorStr = sel.selector || sel.value || '';
            const option = document.createElement('option');
            option.value = JSON.stringify({ type: sel.type || type, value: selectorStr });
            // Наименование: селектор + описание + подпись типа элемента только для отображения (не в value)
            const descPart = sel.text ? this._truncateAtWord(sel.text, 48) : '';
            const typeSuffix = this._getElementTypeDisplaySuffix(sel);
            let displayText = (descPart ? `${selectorStr} (${descPart})` : selectorStr) + typeSuffix;
            if (displayText.length > 90) displayText = this._truncateAtWord(displayText.slice(0, displayText.length - typeSuffix.length), 90 - typeSuffix.length) + typeSuffix;
            option.textContent = displayText;
            option.title = selectorStr + (sel.text ? ` — ${sel.text}` : '') + typeSuffix;
            optgroup.appendChild(option);
          });
          
          cachedSelectorsDropdown.appendChild(optgroup);
        }
      }
      
      // Показываем dropdown
      cachedSelectorsWrapper.style.display = 'block';
      
      // Добавляем обработчик изменения - заполняет поле селектора
      cachedSelectorsDropdown.onchange = (e) => {
        if (e.target.value) {
          try {
            const selected = JSON.parse(e.target.value);
            const selectorValueInput = document.getElementById('selectorValue');
            const selectorTypeSelect = document.getElementById('selectorType');
            
            if (selectorValueInput) {
              selectorValueInput.value = selected.value;
              // Триггерим событие input для обновления зависимых полей
              selectorValueInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            if (selectorTypeSelect) {
              // Устанавливаем тип селектора
              const typeMap = {
                'data-testid': 'css',
                'data-cy': 'css',
                'data-test': 'css',
                'id': 'css',
                'name': 'css',
                'aria-label': 'css',
                'role': 'css',
                'class': 'css',
                'css': 'css',
                'xpath': 'xpath'
              };
              selectorTypeSelect.value = typeMap[selected.type] || 'css';
            }
          } catch (err) {
            console.error('Error parsing cached selector:', err);
          }
        }
      };
    } else {
      cachedSelectorsWrapper.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading cached selectors:', error);
    cachedSelectorsWrapper.style.display = 'none';
  }
}

/**
 * URL «страницы теста» для шага: последний шаг «Переход» или «Анализ» с URL до данного шага.
 * Кэш селекторов доступен для всех шагов на этой странице до следующего перехода или анализа.
 * @param {number} stepIndex - индекс шага (включительно; для нового шага передать test.actions.length)
 * @returns {string|null}
 */
TestEditor.prototype.getPageUrlForStep = function(stepIndex) {
  if (!this.test || !this.test.actions || stepIndex < 0) return null;
  for (let i = Math.min(stepIndex, this.test.actions.length - 1); i >= 0; i--) {
    const a = this.test.actions[i];
    if ((a.type === 'navigate' || a.type === 'analysis') && a.url && !this._isEditorOrExtensionUrl(a.url)) {
      return a.url;
    }
  }
  return null;
}

TestEditor.prototype.getCurrentTestUrl = function() {
  // При редактировании действия — URL страницы для этого шага (для загрузки кэша селекторов)
  if (this.currentEditAction && this.currentEditAction.url && !this._isEditorOrExtensionUrl(this.currentEditAction.url)) {
    return this.currentEditAction.url;
  }
  // Явно используем «страницу теста»: последний переход/анализ до текущего шага — кэш доступен на всей этой странице
  if (this.test && this.test.actions && this.test.actions.length > 0) {
    const stepIndex = this.currentEditingAction >= 0 && this.currentEditingAction < this.test.actions.length
      ? this.currentEditingAction
      : this.test.actions.length; // новый шаг — контекст страницы последнего шага
    const pageUrl = this.getPageUrlForStep(stepIndex);
    if (pageUrl) return pageUrl;
    // Fallback: любой последний шаг с URL до текущего
    const from = this.currentEditingAction >= 0 && this.currentEditingAction < this.test.actions.length
      ? this.currentEditingAction
      : this.test.actions.length - 1;
    for (let i = from; i >= 0; i--) {
      const a = this.test.actions[i];
      if (a.url && !this._isEditorOrExtensionUrl(a.url)) return a.url;
    }
  }
  if (this.test && this.test.url) {
    return this.test.url;
  }
  return null;
}

TestEditor.prototype.updateFormForActionType = function(subtype = null) {
  const actionType = document.getElementById('actionType').value;
  this.currentEditingActionType = actionType === 'try-catch' ? 'try-catch' : 'action';
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
    'variableSetValueGroup', 'variableCalculateGroup',
    'switchTabGroup', 'navSubtypeGroup', 'navGetUrlGroup',
    'waitSubtypeGroup', 'assertSubtypeGroup',
    'clipboardSubtypeGroup', 'clipboardVariableNameGroup', 'clipboardTextGroup',
    'networkSubtypeGroup', 'networkUrlPatternGroup', 'networkTimeoutGroup', 'networkIdleTimeGroup',
    'networkExpectedStatusGroup', 'networkSaveToVariableGroup',
    'tableSubtypeGroup', 'tableRowIndexGroup', 'tableColumnIndexGroup', 'tableVariableNameGroup',
    'tableExpectedValueGroup', 'tableExpectedCountGroup', 'tableSearchTextGroup', 'tableSearchColumnGroup',
    'dragSubtypeGroup', 'dragTargetSelectorGroup', 'dragOffsetXGroup', 'dragOffsetYGroup',
    'dragTargetXGroup', 'dragTargetYGroup',
    'datepickerSubtypeGroup', 'datepickerDateGroup', 'datepickerRangeGroup', 'datepickerTimeGroup',
    'mediaSubtypeGroup', 'mediaSeekTimeGroup', 'mediaVolumeGroup', 'mediaPlaybackRateGroup',
    'deviceSubtypeGroup', 'deviceViewportGroup', 'deviceOrientationGroup',
    'chainSubtypeGroup', 'chainRetryGroup', 'chainStepsGroup', 'chainResultVarGroup',
    'adaptiveGroup'
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

  // Скрываем поле значения селектора для действий, которые его не используют
  if (selectorValueGroup) {
    selectorValueGroup.classList.add('hidden');
  }

  // Load cached selectors for selector-based actions
  this.loadCachedSelectorsDropdown().then(() => {
    // После загрузки кэшированных селекторов показываем поле селектора для действий без значения,
    // если нет кэшированных селекторов
    const cachedSelectorsWrapper = document.getElementById('cachedSelectorsWrapper');
    const hasCachedSelectors = cachedSelectorsWrapper && cachedSelectorsWrapper.style.display !== 'none';
    
    switch (actionType) {
      case 'click':
      case 'dblclick':
      case 'hover':
      case 'focus':
      case 'blur':
      case 'clear':
        if (actionValueGroup) actionValueGroup.classList.add('hidden');
        // Показываем поле селектора, только если нет кэшированных селекторов
        if (selectorValueGroup && !hasCachedSelectors) {
          selectorValueGroup.classList.remove('hidden');
        }
        break;
      case 'adaptive': {
        const ag = document.getElementById('adaptiveGroup');
        if (ag) ag.style.display = 'block';
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
        if (actionValueGroup) actionValueGroup.classList.remove('hidden');
        if (actionValueLabel) actionValueLabel.textContent = this.t('editorUI.adaptiveInnerValue') || 'Value (for input/selection)';
        break;
      }
      default:
        // Для всех остальных действий показываем поле селектора
        if (selectorValueGroup) {
          selectorValueGroup.classList.remove('hidden');
        }
    }
  });

  switch (actionType) {
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
      // Показываем поле селектора для «прокрутка к полю» — выбранный селектор должен сохраняться и отображаться
      if (selectorGroup) selectorGroup.classList.remove('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
      break;
    case 'navigation':
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      const navSubtypeGroup = document.getElementById('navSubtypeGroup');
      if (navSubtypeGroup) {
        navSubtypeGroup.style.display = 'block';
        const navSubtypeSelect = document.getElementById('navSubtypeSelect');
        if (navSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'nav-url';
          navSubtypeSelect.value = ['nav-url', 'new-tab', 'switch-tab', 'close-tab', 'nav-refresh', 'nav-back', 'nav-forward', 'nav-get-url'].includes(resolvedSubtype) ? resolvedSubtype : 'nav-url';
          this.currentSubtype = navSubtypeSelect.value;
          if (!navSubtypeSelect.dataset.listenerAdded) {
            navSubtypeSelect.dataset.listenerAdded = '1';
            navSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = navSubtypeSelect.value;
              this.updateFormForActionType(navSubtypeSelect.value);
            });
          }
        }
      }
      if (effectiveSubtype === 'switch-tab') {
        if (urlGroup) urlGroup.classList.add('hidden');
        const switchTabGroup = document.getElementById('switchTabGroup');
        if (switchTabGroup) {
          switchTabGroup.style.display = 'block';
          this.updateSwitchTabModeVisibility();
          const modeSelect = document.getElementById('switchTabMode');
          if (modeSelect && !modeSelect.dataset.listenerAdded) {
            modeSelect.dataset.listenerAdded = '1';
            modeSelect.addEventListener('change', () => this.updateSwitchTabModeVisibility());
          }
        }
      } else {
        const switchTabGroup = document.getElementById('switchTabGroup');
        if (switchTabGroup) switchTabGroup.style.display = 'none';
      }
      if (['nav-url', 'new-tab'].includes(effectiveSubtype)) {
        if (urlGroup) urlGroup.classList.remove('hidden');
      } else {
        if (urlGroup) urlGroup.classList.add('hidden');
      }
      const navGetUrlGroup = document.getElementById('navGetUrlGroup');
      if (navGetUrlGroup) navGetUrlGroup.style.display = effectiveSubtype === 'nav-get-url' ? 'block' : 'none';
      this.setupUrlPreview();
      break;
    case 'wait':
      if (actionValueLabel) actionValueLabel.textContent = this.t('editorUI.delayMsLabel');
      if (actionValueHint) actionValueHint.textContent = this.t('editorUI.delayMsHint');
      
      // Показываем выпадающее меню подтипов wait
      const waitSubtypeGroup = document.getElementById('waitSubtypeGroup');
      if (waitSubtypeGroup) {
        waitSubtypeGroup.style.display = 'block';
        const waitSubtypeSelect = document.getElementById('waitSubtypeSelect');
        if (waitSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || '';
          waitSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = resolvedSubtype;
          
          // Добавляем обработчик изменения подтипа
          if (!waitSubtypeSelect.dataset.listenerAdded) {
            waitSubtypeSelect.dataset.listenerAdded = '1';
            waitSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = waitSubtypeSelect.value;
              this.updateFormForActionType(waitSubtypeSelect.value);
            });
          }
        }
      }
      
      // Скрываем селектор для простой задержки (без подтипа)
      if (!effectiveSubtype) {
        if (selectorGroup) selectorGroup.classList.add('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      } else {
        // Для подтипов wait показываем селектор
        if (selectorGroup) selectorGroup.classList.remove('hidden');
        if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
      }
      
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
    case 'assertion':
      // Показываем выпадающее меню подтипов assertion
      const assertSubtypeGroup = document.getElementById('assertSubtypeGroup');
      if (assertSubtypeGroup) {
        assertSubtypeGroup.style.display = 'block';
        const assertSubtypeSelect = document.getElementById('assertSubtypeSelect');
        if (assertSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'assert-value';
          assertSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = resolvedSubtype;
          
          // Добавляем обработчик изменения подтипа
          if (!assertSubtypeSelect.dataset.listenerAdded) {
            assertSubtypeSelect.dataset.listenerAdded = '1';
            assertSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = assertSubtypeSelect.value;
              this.updateFormForActionType(assertSubtypeSelect.value);
            });
          }
        }
      }
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
    case 'try-catch':
      // Try-Catch step - специальная форма
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      // Покажем специальные поля для try-catch через динамическое создание
      this.setupTryCatchForm();
      break;
    case 'clipboard':
      // Clipboard operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      const clipboardSubtypeGroup = document.getElementById('clipboardSubtypeGroup');
      if (clipboardSubtypeGroup) {
        clipboardSubtypeGroup.style.display = 'block';
        const clipboardSubtypeSelect = document.getElementById('clipboardSubtypeSelect');
        if (clipboardSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'clipboard-copy';
          clipboardSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = clipboardSubtypeSelect.value;
          if (!clipboardSubtypeSelect.dataset.listenerAdded) {
            clipboardSubtypeSelect.dataset.listenerAdded = '1';
            clipboardSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = clipboardSubtypeSelect.value;
              this.updateClipboardForm();
            });
          }
        }
      }
      this.updateClipboardForm();
      break;
    case 'network':
      // Network operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      const networkSubtypeGroup = document.getElementById('networkSubtypeGroup');
      if (networkSubtypeGroup) {
        networkSubtypeGroup.style.display = 'block';
        const networkSubtypeSelect = document.getElementById('networkSubtypeSelect');
        if (networkSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'network-wait-request';
          networkSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = networkSubtypeSelect.value;
          if (!networkSubtypeSelect.dataset.listenerAdded) {
            networkSubtypeSelect.dataset.listenerAdded = '1';
            networkSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = networkSubtypeSelect.value;
              this.updateNetworkForm();
            });
          }
        }
      }
      this.updateNetworkForm();
      break;
    case 'table':
      // Table operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      const tableSubtypeGroup = document.getElementById('tableSubtypeGroup');
      if (tableSubtypeGroup) {
        tableSubtypeGroup.style.display = 'block';
        const tableSubtypeSelect = document.getElementById('tableSubtypeSelect');
        if (tableSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'table-get-cell-value';
          tableSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = tableSubtypeSelect.value;
          if (!tableSubtypeSelect.dataset.listenerAdded) {
            tableSubtypeSelect.dataset.listenerAdded = '1';
            tableSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = tableSubtypeSelect.value;
              this.updateTableForm();
            });
          }
        }
      }
      this.updateTableForm();
      break;
    case 'drag':
      // Drag operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      const dragSubtypeGroup = document.getElementById('dragSubtypeGroup');
      if (dragSubtypeGroup) {
        dragSubtypeGroup.style.display = 'block';
        const dragSubtypeSelect = document.getElementById('dragSubtypeSelect');
        if (dragSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'drag-and-drop';
          dragSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = dragSubtypeSelect.value;
          if (!dragSubtypeSelect.dataset.listenerAdded) {
            dragSubtypeSelect.dataset.listenerAdded = '1';
            dragSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = dragSubtypeSelect.value;
              this.updateDragForm();
            });
          }
        }
      }
      this.updateDragForm();
      break;
    case 'datepicker':
      // Datepicker operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      const datepickerSubtypeGroup = document.getElementById('datepickerSubtypeGroup');
      if (datepickerSubtypeGroup) {
        datepickerSubtypeGroup.style.display = 'block';
        const datepickerSubtypeSelect = document.getElementById('datepickerSubtypeSelect');
        if (datepickerSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'datepicker-select-date';
          datepickerSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = datepickerSubtypeSelect.value;
          if (!datepickerSubtypeSelect.dataset.listenerAdded) {
            datepickerSubtypeSelect.dataset.listenerAdded = '1';
            datepickerSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = datepickerSubtypeSelect.value;
              this.updateDatepickerForm();
            });
          }
        }
      }
      this.updateDatepickerForm();
      break;
    case 'media':
      // Media operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      const mediaSubtypeGroup = document.getElementById('mediaSubtypeGroup');
      if (mediaSubtypeGroup) {
        mediaSubtypeGroup.style.display = 'block';
        const mediaSubtypeSelect = document.getElementById('mediaSubtypeSelect');
        if (mediaSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'media-play';
          mediaSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = mediaSubtypeSelect.value;
          if (!mediaSubtypeSelect.dataset.listenerAdded) {
            mediaSubtypeSelect.dataset.listenerAdded = '1';
            mediaSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = mediaSubtypeSelect.value;
              this.updateMediaForm();
            });
          }
        }
      }
      this.updateMediaForm();
      break;
    case 'device':
      // Device operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      const deviceSubtypeGroup = document.getElementById('deviceSubtypeGroup');
      if (deviceSubtypeGroup) {
        deviceSubtypeGroup.style.display = 'block';
        const deviceSubtypeSelect = document.getElementById('deviceSubtypeSelect');
        if (deviceSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'device-set-viewport';
          deviceSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = deviceSubtypeSelect.value;
          if (!deviceSubtypeSelect.dataset.listenerAdded) {
            deviceSubtypeSelect.dataset.listenerAdded = '1';
            deviceSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = deviceSubtypeSelect.value;
              this.updateDeviceForm();
            });
          }
        }
      }
      this.updateDeviceForm();
      break;
    case 'chain':
      // Chain operations
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      const chainSubtypeGroup = document.getElementById('chainSubtypeGroup');
      if (chainSubtypeGroup) {
        chainSubtypeGroup.style.display = 'block';
        const chainSubtypeSelect = document.getElementById('chainSubtypeSelect');
        if (chainSubtypeSelect) {
          const resolvedSubtype = effectiveSubtype || (this.currentEditAction?.subtype) || 'chain-sequential';
          chainSubtypeSelect.value = resolvedSubtype;
          this.currentSubtype = chainSubtypeSelect.value;
          if (!chainSubtypeSelect.dataset.listenerAdded) {
            chainSubtypeSelect.dataset.listenerAdded = '1';
            chainSubtypeSelect.addEventListener('change', () => {
              this.currentSubtype = chainSubtypeSelect.value;
              this.updateChainForm();
            });
          }
        }
      }
      this.updateChainForm();
      break;
    case 'analysis':
      // Analysis step - hide value and selector groups
      if (actionValueGroup) actionValueGroup.classList.add('hidden');
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      // Show analysis subtype selector
      this.applyAnalysisSubtype(effectiveSubtype || 'analysis-selectors');
      break;
  }
  
  // Применяем специфичную логику для подтипов
  if (effectiveSubtype) {
    this.applySubtypeLogic(actionType, effectiveSubtype);
    this.populateSubtypeFieldsFromAction(effectiveSubtype);
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
TestEditor.prototype.clearDynamicFields = function() {
  const dynamicIds = [
    'expectedValueField', 'countField', 'optionTextField', 
    'conditionField', 'baselineField', 'descriptionField',
    'stateRadioField', 'multiValueField', 'analysisFillOptionsField'
  ];
  
  dynamicIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

/**
 * v0.9.6.1: Показать/скрыть поля switch-tab в зависимости от режима поиска
 */
TestEditor.prototype.updateSwitchTabModeVisibility = function() {
  const mode = document.getElementById('switchTabMode')?.value || 'index';
  const indexGroup = document.getElementById('switchTabIndexGroup');
  const urlGroup = document.getElementById('switchTabUrlGroup');
  const titleGroup = document.getElementById('switchTabTitleGroup');
  if (indexGroup) indexGroup.style.display = mode === 'index' ? 'block' : 'none';
  if (urlGroup) urlGroup.style.display = mode === 'url' ? 'block' : 'none';
  if (titleGroup) titleGroup.style.display = mode === 'title' ? 'block' : 'none';
}

/**
 * ИСПРАВЛЕНИЕ #27: Превью нормализованного URL для navigation шагов
 */
TestEditor.prototype.setupUrlPreview = function() {
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
 * Настройка формы для Try-Catch
 */
TestEditor.prototype.setupTryCatchForm = function() {
  // Очищаем существующие поля
  const existing = document.getElementById('tryCatchFormFields');
  if (existing) existing.remove();

  // Создаём контейнер для полей try-catch
  const container = document.createElement('div');
  container.id = 'tryCatchFormFields';
  container.style.marginTop = '20px';

  // Описание
  const descHTML = `
    <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #2196f3;">
      <div style="font-weight: 600; margin-bottom: 4px;">🛡️ ${this.t('quickStepsDescriptions.tryCatch') || 'Error handling with try-catch-finally'}</div>
      <div style="font-size: 13px; color: #555;">
        ${this.t('editor.tryCatchDescription') || 'Try: основные действия | Catch: при ошибке | Finally: выполняется всегда'}
      </div>
    </div>
  `;

  // Поля
  const fieldsHTML = `
    <div class="form-group">
      <label>${this.t('editor.tryCatchErrorVar') || 'Error variable (optional)'}:</label>
      <input type="text" id="tryCatchErrorVar" class="form-control" placeholder="lastError">
      <small class="form-text text-muted">${this.t('editor.tryCatchErrorVarHint') || 'Variable name to store error message'}</small>
    </div>
    
    <div class="form-group">
      <label>
        <input type="checkbox" id="tryCatchContinueOnError" checked>
        ${this.t('editor.tryCatchContinueOnError') || 'Continue after error'}
      </label>
      <small class="form-text text-muted">${this.t('editor.tryCatchContinueOnErrorHint') || 'If false, error is rethrown after catch'}</small>
    </div>

    <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin-top: 16px;">
      <strong>ℹ️ ${this.t('editor.tryCatchNote') || 'Note'}:</strong>
      <div style="font-size: 13px; margin-top: 6px;">
        ${this.t('editor.tryCatchNoteText') || 'Add try/catch/finally blocks in editor. Set tryActions, catchActions, finallyActions in JSON.'}
      </div>
    </div>
  `;

  container.innerHTML = descHTML + fieldsHTML;

  // Заполняем поля из редактируемого действия (при открытии Try-Catch на редактирование)
  const action = this.currentEditAction;
  if (action && action.type === 'try-catch') {
    const errorVarEl = document.getElementById('tryCatchErrorVar');
    const continueEl = document.getElementById('tryCatchContinueOnError');
    if (errorVarEl) errorVarEl.value = action.errorVariable || '';
    if (continueEl) continueEl.checked = action.continueOnError !== false;
  }

  // Вставляем после формы селектора
  const selectorGroup = document.getElementById('selectorGroup');
  if (selectorGroup && selectorGroup.parentNode) {
    selectorGroup.parentNode.insertBefore(container, selectorGroup.nextSibling);
  }
}

/**
 * Применение специфичной логики для подтипов
 * @param {string} type - Основной тип действия
 * @param {string} subtype - Подтип действия
 */
TestEditor.prototype.applySubtypeLogic = function(type, subtype) {
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
    case 'keyboard':
      this.applyKeyboardSubtype(subtype);
      break;
    case 'analysis':
      this.applyAnalysisSubtype(subtype);
      break;
  }
}

/**
 * Логика для Keyboard subtypes
 */
TestEditor.prototype.applyKeyboardSubtype = function(subtype) {
  const keyboardKey = document.getElementById('keyboardKey');
  const keyboardGlobal = document.getElementById('keyboardGlobal');
  if (!keyboardKey) return;
  switch (subtype) {
    case 'keyboard-navigate':
      keyboardKey.value = 'ArrowDown';
      if (keyboardGlobal) keyboardGlobal.checked = false; // по умолчанию на элементе
      break;
    case 'keyboard-escape':
      keyboardKey.value = 'Escape';
      if (keyboardGlobal) keyboardGlobal.checked = true; // по умолчанию глобально (модальные окна)
      break;
    default:
      break;
  }
}

/**
 * Логика для Wait subtypes
 */
TestEditor.prototype.applyWaitSubtype = function(subtype) {
  const selectorGroup = document.getElementById('selectorGroup');
  const selectorValueGroup = document.getElementById('selectorValueGroup');
  const actionValueGroup = document.getElementById('actionValueGroup');
  const actionValueLabel = document.getElementById('actionValueLabel');
  const actionValueInput = document.getElementById('actionValue');
  
  // Для всех wait subtypes показываем поле таймаута
  if (actionValueGroup && actionValueLabel && actionValueInput) {
    actionValueGroup.classList.remove('hidden');
    actionValueLabel.textContent = this.t('editorUI.maxTimeout') || 'Max timeout (ms)';
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
      this.addOptionTextField(this.t('editorUI.optionTextLabel') || 'Option text to wait for');
      break;
      
    case 'wait-options-count':
      // Селектор + количество
      if (selectorGroup) selectorGroup.classList.remove('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
      this.addCountField(this.t('editorUI.expectedCount') || 'Expected option count');
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
      this.addConditionField(this.t('editorUI.conditionLabel') || 'Condition to wait for');
      break;
      
    default:
      // Простая задержка - только таймаут
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      if (actionValueLabel) {
        actionValueLabel.textContent = this.t('editorUI.delayMsLabel') || 'Delay (ms)';
      }
      break;
  }
}

/**
 * Логика для Assertion subtypes
 */
TestEditor.prototype.applyAssertionSubtype = function(subtype) {
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
      this.addCountField(this.t('editorUI.expectedCount') || 'Expected element count');
      break;
      
    case 'assert-contains':
      this.addOptionTextField(this.t('editorUI.optionTextLabel') || 'Text that must be contained');
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
 * Заполняет поля subtype из текущего редактируемого действия (при редактировании)
 */
TestEditor.prototype.populateSubtypeFieldsFromAction = function(subtype) {
  const action = this.currentEditAction;
  if (!action) return;
  switch (subtype) {
    case 'dropdown-select':
    case 'dropdown-deselect':
      const optionTextEl = document.getElementById('optionText');
      if (optionTextEl) optionTextEl.value = action.optionText || action.value || '';
      break;
    case 'dropdown-multiselect':
      const expectedValuesEl = document.getElementById('expectedValues');
      if (expectedValuesEl) {
        const vals = action.optionValues || action.expectedValues;
        expectedValuesEl.value = Array.isArray(vals) ? vals.join('\n') : (vals || '');
      }
      break;
    case 'dropdown-datalist':
    case 'dropdown-combobox':
      const searchTextEl = document.getElementById('optionText');
      if (searchTextEl) searchTextEl.value = action.searchText || action.optionText || action.value || '';
      break;
    case 'switch-tab': {
      const st = action.switchTab || {};
      const modeEl = document.getElementById('switchTabMode');
      const indexEl = document.getElementById('switchTabIndex');
      const urlEl = document.getElementById('switchTabUrlPattern');
      const titleEl = document.getElementById('switchTabTitlePattern');
      if (modeEl) modeEl.value = st.mode || 'index';
      if (indexEl) indexEl.value = st.tabIndex ?? 0;
      if (urlEl) urlEl.value = st.urlPattern || '';
      if (titleEl) titleEl.value = st.titlePattern || '';
      this.updateSwitchTabModeVisibility?.();
      break;
    }
    default:
      break;
  }
}

/**
 * Логика для Dropdown subtypes
 */
TestEditor.prototype.applyDropdownSubtype = function(subtype) {
  const selectorGroup = document.getElementById('selectorGroup');
  const selectorValueGroup = document.getElementById('selectorValueGroup');
  const selectorValueLabel = selectorValueGroup?.querySelector('label');
  
  if (selectorGroup) selectorGroup.classList.remove('hidden');
  if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
  
  switch (subtype) {
    case 'dropdown-select':
      if (selectorValueLabel) {
        selectorValueLabel.textContent = this.t('editorUI.selectorDropdownLabel') || 'Dropdown selector';
      }
      this.addOptionTextField(this.t('editorUI.optionToSelect') || 'Option text or selector to select');
      break;
      
    case 'dropdown-multiselect':
      if (selectorValueLabel) {
        selectorValueLabel.textContent = this.t('editorUI.selectorDropdownLabel') || 'Dropdown selector';
      }
      this.addMultiValueField();
      break;
      
    case 'dropdown-deselect':
      this.addOptionTextField(this.t('editorUI.optionToDeselect') || 'Option text to deselect');
      break;
      
    case 'dropdown-select-all':
    case 'dropdown-clear-all':
      if (selectorValueLabel) {
        selectorValueLabel.textContent = this.t('editorUI.selectorButtonLabel') || 'Button selector';
      }
      break;
      
    case 'dropdown-datalist':
    case 'dropdown-combobox':
      this.addOptionTextField(this.t('editorUI.textToSearch') || 'Text to type/search');
      break;
  }
}

/**
 * Обновляет форму скриншота в зависимости от выбранного типа области
 */
TestEditor.prototype.updateScreenshotFormForCaptureType = function() {
  const captureType = document.getElementById('screenshotCaptureType')?.value || 'element';
  const selectorGroup = document.getElementById('selectorGroup');
  const selectorValueGroup = document.getElementById('selectorValueGroup');
  const screenshotRegionGroup = document.getElementById('screenshotRegionGroup');
  
  if (selectorGroup) selectorGroup.classList.toggle('hidden', captureType !== 'element');
  if (selectorValueGroup) selectorValueGroup.classList.toggle('hidden', captureType !== 'element');
  if (screenshotRegionGroup) screenshotRegionGroup.style.display = captureType === 'region' ? 'block' : 'none';
  if (captureType === 'element') this.loadCachedSelectorsDropdown();
}

/**
 * Логика для Screenshot subtypes
 */
TestEditor.prototype.applyScreenshotSubtype = function(subtype) {
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
TestEditor.prototype.applyAISubtype = function(subtype) {
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
TestEditor.prototype.applyScrollSubtype = function(subtype) {
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

/**
 * Logic for Analysis subtypes
 */
TestEditor.prototype.applyAnalysisSubtype = function(subtype) {
  const selectorGroup = document.getElementById('selectorGroup');
  const selectorValueGroup = document.getElementById('selectorValueGroup');
  const actionValueGroup = document.getElementById('actionValueGroup');
  
  // Hide selector and value groups for analysis steps
  if (selectorGroup) selectorGroup.classList.add('hidden');
  if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
  if (actionValueGroup) actionValueGroup.classList.add('hidden');
  
  // Add analysis subtype selector
  const modalBody = document.getElementById('modalBody');
  if (modalBody && !document.getElementById('analysisSubtypeField')) {
    const analysisField = document.createElement('div');
    analysisField.id = 'analysisSubtypeField';
    analysisField.className = 'form-group';
    analysisField.innerHTML = `
      <label>${this.t('editorUI.analysisTypeLabel') || 'Type of Analysis'}</label>
      <select id="analysisSubtype">
        <option value="analysis-selectors" ${subtype === 'analysis-selectors' ? 'selected' : ''}>${this.t('editorUI.analysisSelectors') || 'Get Selectors'}</option>
        <option value="analysis-fill-fields" ${subtype === 'analysis-fill-fields' ? 'selected' : ''}>${this.t('editorUI.analysisFillFields') || 'Fill Fields'}</option>
        <option value="analysis-validate" ${subtype === 'analysis-validate' ? 'selected' : ''}>${this.t('editorUI.analysisValidate') || 'Validate'}</option>
        <option value="analysis-forms" ${subtype === 'analysis-forms' ? 'selected' : ''}>${this.t('editorUI.analysisForms') || 'Analyze Forms'}</option>
        <option value="analysis-links" ${subtype === 'analysis-links' ? 'selected' : ''}>${this.t('editorUI.analysisLinks') || 'Check Links'}</option>
        <option value="analysis-performance" ${subtype === 'analysis-performance' ? 'selected' : ''}>${this.t('editorUI.analysisPerformance') || 'Performance'}</option>
      </select>
    `;
    modalBody.appendChild(analysisField);
  }

  const subtypeSelect = document.getElementById('analysisSubtype');
  if (subtypeSelect) {
    subtypeSelect.value = subtype || 'analysis-selectors';
    subtypeSelect.onchange = () => {
      this.currentSubtype = subtypeSelect.value;
      this.applyAnalysisSubtype(subtypeSelect.value);
    };
  }

  this.renderAnalysisFillOptionsField(subtype);
}

/**
 * Рендерит настройки для subtype "analysis-fill-fields" в модальном окне.
 */
TestEditor.prototype.renderAnalysisFillOptionsField = function(subtype) {
  const existing = document.getElementById('analysisFillOptionsField');

  if (existing) {
    this._analysisFillOptionsDraft = {
      fillMode: document.getElementById('analysisFillMode')?.value || 'smart',
      charCount: parseInt(document.getElementById('analysisFillCharCount')?.value, 10) || 10,
      charset: document.getElementById('analysisFillCharset')?.value || 'lettersAndNumbers',
      customCharset: document.getElementById('analysisFillCustomCharset')?.value || '',
      fillTarget: document.getElementById('analysisFillTarget')?.value || 'empty',
      // НОВЫЕ v0.9.5.1
      profile: document.getElementById('analysisFillProfile')?.value || 'valid-user',
      scopeMode: document.getElementById('analysisScopeMode')?.value || 'current',
      contextAware: document.getElementById('analysisContextAware')?.checked || true,
      overwriteFilled: document.getElementById('analysisOverwriteFilled')?.checked || false
    };
    existing.remove();
  }

  if (subtype !== 'analysis-fill-fields') return;

  const modalBody = document.getElementById('modalBody');
  const anchor = document.getElementById('analysisSubtypeField');
  if (!modalBody || !anchor) return;

  const existingAction = (this.currentEditingAction !== null && this.currentEditingAction >= 0)
    ? this.test?.actions?.[this.currentEditingAction]
    : null;
  const options = this._analysisFillOptionsDraft || existingAction?.fillOptions || {};

  const fillMode = options.fillMode || 'smart';
  const charCount = Math.min(1000, Math.max(1, options.charCount || 10));
  const charset = options.charset || 'lettersAndNumbers';
  const customCharset = options.customCharset || '';
  const fillTarget = options.fillTarget || 'all';
  // НОВЫЕ v0.9.5.1
  const profile = options.profile || 'valid-user';
  const scopeMode = options.scopeMode || 'current';
  const contextAware = options.contextAware !== false;
  const overwriteFilled = options.overwriteFilled || false;

  const field = document.createElement('div');
  field.id = 'analysisFillOptionsField';
  field.className = 'form-group';
  field.innerHTML = `
    <label>${this.t('editorUI.fillFieldsOptionsTitle') || 'Fill options'}</label>
    
    <div style="display:grid; gap:12px; margin-top:12px; padding: 12px; background: #f8fafc; border-radius: 6px;">
      
      <!-- Режим заполнения -->
      <div>
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">${this.t('editorUI.fillFieldsMode') || 'Fill mode'}</label>
        <select id="analysisFillMode" style="width: 100%;">
          <option value="smart" ${fillMode === 'smart' ? 'selected' : ''}>Smart - Умное заполнение (NEW!)</option>
          <option value="random" ${fillMode === 'random' ? 'selected' : ''}>${this.t('editorUI.fillFieldsModeRandom') || 'Random value'}</option>
          <option value="count" ${fillMode === 'count' ? 'selected' : ''}>${this.t('editorUI.fillFieldsModeCount') || 'Character count'}</option>
          <option value="max" ${fillMode === 'max' ? 'selected' : ''}>${this.t('editorUI.fillFieldsModeMax') || 'Max length'}</option>
        </select>
        <small style="color: #64748b; font-size: 11px; display: block; margin-top: 2px;">
          Smart - автоматически определяет тип поля и генерирует реалистичные данные
        </small>
      </div>

      <!-- Профиль данных (только для smart) -->
      <div id="analysisFillProfileWrap">
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">Профиль данных</label>
        <select id="analysisFillProfile" style="width: 100%;">
          <option value="valid-user" ${profile === 'valid-user' ? 'selected' : ''}>valid-user - Стандартные данные</option>
          <option value="edge-case-user" ${profile === 'edge-case-user' ? 'selected' : ''}>edge-case-user - Граничные значения</option>
          <option value="international-user" ${profile === 'international-user' ? 'selected' : ''}>international-user - Международные</option>
          <option value="sql-injection-test" ${profile === 'sql-injection-test' ? 'selected' : ''}>sql-injection-test - SQL Injection</option>
          <option value="xss-test" ${profile === 'xss-test' ? 'selected' : ''}>xss-test - XSS тестирование</option>
          <option value="unicode-test" ${profile === 'unicode-test' ? 'selected' : ''}>unicode-test - Unicode/Emoji</option>
        </select>
        <small style="color: #64748b; font-size: 11px; display: block; margin-top: 2px;">
          Набор готовых данных для заполнения полей
        </small>
      </div>

      <!-- Область применения -->
      <div>
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">Область применения</label>
        <select id="analysisScopeMode" style="width: 100%;">
          <option value="current" ${scopeMode === 'current' ? 'selected' : ''}>Только этот шаг</option>
          <option value="all-steps" ${scopeMode === 'all-steps' ? 'selected' : ''}>Весь тест (все шаги)</option>
        </select>
        <small style="color: #64748b; font-size: 11px; display: block; margin-top: 2px;">
          Применить настройки к текущему шагу или ко всему тесту
        </small>
      </div>

      <!-- Что заполнять -->
      <div>
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">${this.t('editorUI.fillFieldsTarget') || 'Target fields'}</label>
        <select id="analysisFillTarget" style="width: 100%;">
          <option value="empty" ${fillTarget === 'empty' ? 'selected' : ''}>${this.t('editorUI.fillFieldsTargetEmpty') || 'Empty only'}</option>
          <option value="required" ${fillTarget === 'required' ? 'selected' : ''}>${this.t('editorUI.fillFieldsTargetRequired') || 'Required only'}</option>
          <option value="all" ${fillTarget === 'all' ? 'selected' : ''}>${this.t('editorUI.fillFieldsTargetAll') || 'All fields'}</option>
        </select>
      </div>

      <!-- Дополнительные настройки -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 8px;">
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 8px;">Дополнительные настройки</label>
        
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" id="analysisContextAware" ${contextAware ? 'checked' : ''}>
          <span style="font-size: 13px;">Автоопределение контекста полей (Smart)</span>
        </label>
        <small style="color: #64748b; font-size: 11px; display: block; margin-left: 26px; margin-top: -6px; margin-bottom: 8px;">
          Определяет тип поля (имя, email, телефон) и генерирует подходящие данные
        </small>

        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="analysisOverwriteFilled" ${overwriteFilled ? 'checked' : ''}>
          <span style="font-size: 13px; color: #dc2626; font-weight: 500;">⚠️ Перезаписывать заполненные поля</span>
        </label>
        <small style="color: #dc2626; font-size: 11px; display: block; margin-left: 26px; margin-top: 2px;">
          Если выключено - пропускаем уже заполненные поля (рекомендуется)
        </small>
      </div>

      <!-- Количество символов (для random/count) -->
      <div id="analysisFillCharCountWrap">
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">${this.t('editorUI.fillFieldsCharCount') || 'Character count'}</label>
        <input type="number" id="analysisFillCharCount" min="1" max="1000" value="${charCount}" style="width: 100%;">
        <small style="color: #64748b; font-size: 11px; display: block; margin-top: 2px;">
          Для режимов Random и Count
        </small>
      </div>

      <!-- Набор символов (для random/count) -->
      <div id="analysisFillCharsetWrap">
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">${this.t('editorUI.fillFieldsCharset') || 'Charset'}</label>
        <select id="analysisFillCharset" style="width: 100%;">
          <option value="letters" ${charset === 'letters' ? 'selected' : ''}>${this.t('editorUI.fillFieldsCharsetLetters') || 'Letters only'}</option>
          <option value="lettersAndNumbers" ${charset === 'lettersAndNumbers' ? 'selected' : ''}>${this.t('editorUI.fillFieldsCharsetLettersNumbers') || 'Letters + numbers'}</option>
          <option value="lettersNumbersSpace" ${charset === 'lettersNumbersSpace' ? 'selected' : ''}>${this.t('editorUI.fillFieldsCharsetLettersNumbersSpace') || 'Letters + numbers + space'}</option>
          <option value="custom" ${charset === 'custom' ? 'selected' : ''}>${this.t('editorUI.fillFieldsCharsetCustom') || 'Custom'}</option>
        </select>
      </div>

      <div id="analysisFillCustomCharsetWrap">
        <label style="font-size:12px; font-weight: 600; display: block; margin-bottom: 4px;">${this.t('editorUI.fillFieldsCharsetCustom') || 'Custom charset'}</label>
        <input type="text" id="analysisFillCustomCharset" value="${this.escapeHtml(customCharset)}" placeholder="abc123$%_" style="width: 100%;">
      </div>

      <!-- Кнопка открытия расширенных настроек -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 8px;">
        <button 
          type="button"
          id="openAdvancedAnalysisSettings"
          style="width: 100%; padding: 10px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
          ⚙️ Расширенные Настройки (Глобальные Правила, Профили)
        </button>
        <small style="color: #64748b; font-size: 11px; display: block; margin-top: 4px; text-align: center;">
          Настройте паттерны, глобальные правила полей и кастомные профили
        </small>
      </div>

    </div>
  `;

  anchor.insertAdjacentElement('afterend', field);

  const modeEl = document.getElementById('analysisFillMode');
  const charsetEl = document.getElementById('analysisFillCharset');
  const charWrap = document.getElementById('analysisFillCharCountWrap');
  const charsetWrap = document.getElementById('analysisFillCharsetWrap');
  const customWrap = document.getElementById('analysisFillCustomCharsetWrap');
  const profileWrap = document.getElementById('analysisFillProfileWrap');
  
  const refreshVisibility = () => {
    const mode = modeEl?.value;
    const isSmartMode = mode === 'smart';
    const isMaxMode = mode === 'max';
    
    // Показываем профиль только для smart
    if (profileWrap) profileWrap.style.display = isSmartMode ? 'block' : 'none';
    
    // Скрываем charCount для max
    if (charWrap) charWrap.style.display = isMaxMode ? 'none' : 'block';
    
    // Скрываем charset для smart (он не используется)
    if (charsetWrap) charsetWrap.style.display = isSmartMode ? 'none' : 'block';
    
    // Custom charset только если выбран custom
    if (customWrap) customWrap.style.display = charsetEl?.value === 'custom' ? 'block' : 'none';
  };
  
  if (modeEl) modeEl.onchange = refreshVisibility;
  if (charsetEl) charsetEl.onchange = refreshVisibility;
  refreshVisibility();
  
  // Обработчик для кнопки "Расширенные Настройки"
  const advancedBtn = document.getElementById('openAdvancedAnalysisSettings');
  if (advancedBtn) {
    advancedBtn.addEventListener('click', () => {
      window.open('../analysis/analysis-settings.html', '_blank', 'width=1000,height=800');
    });
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ДОБАВЛЕНИЯ ПОЛЕЙ ====================

/**
 * Добавление поля для ожидаемого значения
 */
TestEditor.prototype.addExpectedValueField = function() {
  const container = document.getElementById('actionValueGroup');
  if (!container) return;
  
  // Проверяем, не добавлено ли уже поле
  if (document.getElementById('expectedValueField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="expectedValueField">
      <label>${this.t('editorUI.expectedValue') || 'Expected value'}</label>
      <input type="text" id="expectedValue" placeholder="${this.t('editorUI.expectedValuePlaceholder') || 'e.g. $99.99'}">
      <small style="text-align: left; display: block; margin-top: 4px;">
        ${this.t('editorUI.expectedValueHint') || 'Value that should appear in element'}
      </small>
    </div>
  `;
  
  container.insertAdjacentHTML('afterend', fieldHTML);
}

/**
 * Добавление поля для количества
 */
TestEditor.prototype.addCountField = function(label) {
  const container = document.getElementById('actionValueGroup');
  if (!container || document.getElementById('countField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="countField">
      <label>${label}</label>
      <input type="number" id="expectedCount" min="0" value="1" placeholder="${this.t('editorUI.expectedCountPlaceholder') || 'Number'}">
    </div>
  `;
  
  container.insertAdjacentHTML('afterend', fieldHTML);
}

/**
 * Добавление поля для текста опции
 */
TestEditor.prototype.addOptionTextField = function(label) {
  const container = document.getElementById('selectorValueGroup');
  if (!container || document.getElementById('optionTextField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="optionTextField">
      <label>${label}</label>
      <input type="text" id="optionText" placeholder="${this.t('editorUI.optionTextPlaceholder') || 'Option text'}">
    </div>
  `;
  
  container.insertAdjacentHTML('afterend', fieldHTML);
}

/**
 * Добавление поля для условия
 */
TestEditor.prototype.addConditionField = function(label) {
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
TestEditor.prototype.addStateRadioField = function() {
  const container = document.getElementById('selectorValueGroup');
  if (!container || document.getElementById('stateRadioField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="stateRadioField">
      <label>${this.t('editorUI.expectedState') || 'Expected state'}</label>
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
TestEditor.prototype.addMultiValueField = function() {
  const container = document.getElementById('selectorValueGroup');
  if (!container || document.getElementById('multiValueField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="multiValueField">
      <label>${this.t('editorUI.expectedValuesMultiline') || 'Expected values (one per line)'}</label>
      <textarea id="expectedValues" rows="5" placeholder="${this.t('editorUI.expectedValuesPlaceholder') || 'Value 1\\nValue 2\\nValue 3'}"></textarea>
    </div>
  `;
  
  container.insertAdjacentHTML('afterend', fieldHTML);
}

/**
 * Добавление поля для имени baseline
 */
TestEditor.prototype.addBaselineNameField = function() {
  const container = document.getElementById('selectorValueGroup');
  if (!container || document.getElementById('baselineField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="baselineField">
      <label>${this.t('editorUI.baselineName') || 'Baseline name'}</label>
      <input type="text" id="baselineName" placeholder="${this.t('editorUI.baselineNamePlaceholder') || 'e.g. homepage-header'}">
    </div>
  `;
  
  container.insertAdjacentHTML('afterend', fieldHTML);
}

/**
 * Добавление поля для описания элемента (AI)
 */
TestEditor.prototype.addDescriptionField = function() {
  const container = document.getElementById('actionValueGroup');
  if (!container || document.getElementById('descriptionField')) return;
  
  const fieldHTML = `
    <div class="form-group" id="descriptionField">
      <label>${this.t('editorUI.elementDescription') || 'Element description'}</label>
      <textarea id="elementDescription" rows="3" placeholder="${this.t('editorUI.elementDescriptionPlaceholder') || 'Describe element in natural language'}"></textarea>
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
TestEditor.prototype.validateSubtype = function(type, subtype) {
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
TestEditor.prototype.validateWaitSubtype = function(subtype) {
  const result = { valid: true, message: '' };
  const selectorValue = document.getElementById('selectorValue')?.value;
  
  switch (subtype) {
    case 'wait-value':
      if (!selectorValue) {
        return { valid: false, message: this.t('editorUI.selectorRequired') || 'Specify element selector' };
      }
      const expectedValue = document.getElementById('expectedValue')?.value;
      if (!expectedValue) {
        return { valid: false, message: this.t('editorUI.expectedValueRequired') || 'Specify expected value' };
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
TestEditor.prototype.validateAssertionSubtype = function(subtype) {
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
TestEditor.prototype.validateDropdownSubtype = function(subtype) {
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
TestEditor.prototype.saveSubtypeFields = function(action, type, subtype) {
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
    case 'navigation': {
      const navSubtype = document.getElementById('navSubtypeSelect')?.value || 'nav-url';
      action.subtype = navSubtype;
      if (navSubtype === 'switch-tab') {
        const mode = document.getElementById('switchTabMode')?.value || 'index';
        action.switchTab = {
          mode,
          tabIndex: parseInt(document.getElementById('switchTabIndex')?.value, 10) || 0,
          urlPattern: document.getElementById('switchTabUrlPattern')?.value?.trim() || '',
          titlePattern: document.getElementById('switchTabTitlePattern')?.value?.trim() || ''
        };
      }
      if (navSubtype === 'nav-get-url') {
        action.variableName = document.getElementById('navGetUrlVariableName')?.value?.trim() || '';
        action.urlPart = document.getElementById('navGetUrlPart')?.value || 'full';
      }
      break;
    }
  }
}

/**
 * Сохранение полей Wait subtypes
 */
TestEditor.prototype.saveWaitSubtypeFields = function(action, subtype) {
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
TestEditor.prototype.saveAssertionSubtypeFields = function(action, subtype) {
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
TestEditor.prototype.saveDropdownSubtypeFields = function(action, subtype) {
  switch (subtype) {
    case 'dropdown-select':
    case 'dropdown-deselect': {
      const optionText = document.getElementById('optionText')?.value;
      action.optionText = optionText;
      action.value = optionText; // для совместимости и отображения
      break;
    }
      
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
TestEditor.prototype.saveScreenshotSubtypeFields = function(action, subtype) {
  const captureType = document.getElementById('screenshotCaptureType')?.value || 'element';
  action.screenshotCaptureType = captureType;
  if (captureType === 'full-page') {
    action.subtype = 'page-screenshot-full';
  } else if (action.subtype === 'page-screenshot-full') {
    delete action.subtype;
  }
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
TestEditor.prototype.saveAISubtypeFields = function(action, subtype) {
  switch (subtype) {
    case 'ai-smart-selector':
    case 'ai-find-healing':
      action.elementDescription = document.getElementById('elementDescription')?.value;
      break;
  }
}

TestEditor.prototype.updateVariableForm = function() {
  const variableOperation = document.getElementById('variableOperation')?.value;
  const variableUrlSource = document.getElementById('variableUrlSource')?.value;
  const variableExtractType = document.getElementById('variableExtractType')?.value;
  
  // Скрываем все группы
  const groups = [
    'variableUrlSourceGroup', 'variableUrlCustomGroup', 'variableUrlPatternGroup',
    'variableSelectorGroup', 'variableExtractTypeGroup', 'variableSetValueGroup', 'variableCalculateGroup', 'variableCollectDataGroup'
  ];
  groups.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  const nameGroup = document.getElementById('variableNameGroup');
  if (nameGroup) nameGroup.style.display = variableOperation === 'collect-data' ? 'none' : 'block';
  
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
  } else if (variableOperation === 'collect-data') {
    const collectDataGroup = document.getElementById('variableCollectDataGroup');
    if (collectDataGroup) collectDataGroup.style.display = 'block';
  }
}

TestEditor.prototype.updateClipboardForm = function() {
  const clipboardSubtype = document.getElementById('clipboardSubtypeSelect')?.value;
  const selectorGroup = document.getElementById('selectorGroup');
  const selectorValueGroup = document.getElementById('selectorValueGroup');
  const clipboardVariableNameGroup = document.getElementById('clipboardVariableNameGroup');
  const clipboardTextGroup = document.getElementById('clipboardTextGroup');
  
  // Скрываем все специальные группы clipboard
  if (clipboardVariableNameGroup) clipboardVariableNameGroup.style.display = 'none';
  if (clipboardTextGroup) clipboardTextGroup.style.display = 'none';
  
  // Показываем/скрываем поля в зависимости от подтипа
  switch (clipboardSubtype) {
    case 'clipboard-copy':
    case 'clipboard-paste':
      // Нужен селектор элемента
      if (selectorGroup) selectorGroup.classList.remove('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.remove('hidden');
      break;
    case 'clipboard-get':
      // Нужно имя переменной
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      if (clipboardVariableNameGroup) clipboardVariableNameGroup.style.display = 'block';
      break;
    case 'clipboard-set':
      // Нужен текст для установки
      if (selectorGroup) selectorGroup.classList.add('hidden');
      if (selectorValueGroup) selectorValueGroup.classList.add('hidden');
      if (clipboardTextGroup) clipboardTextGroup.style.display = 'block';
      break;
  }
}

TestEditor.prototype.updateNetworkForm = function() {
  const networkSubtype = document.getElementById('networkSubtypeSelect')?.value;
  const networkUrlPatternGroup = document.getElementById('networkUrlPatternGroup');
  const networkTimeoutGroup = document.getElementById('networkTimeoutGroup');
  const networkIdleTimeGroup = document.getElementById('networkIdleTimeGroup');
  const networkExpectedStatusGroup = document.getElementById('networkExpectedStatusGroup');
  const networkSaveToVariableGroup = document.getElementById('networkSaveToVariableGroup');
  const networkSaveToVariableCheckbox = document.getElementById('networkSaveToVariableCheckbox');
  const networkSaveToVariable = document.getElementById('networkSaveToVariable');
  
  // Скрываем все группы network
  if (networkUrlPatternGroup) networkUrlPatternGroup.style.display = 'none';
  if (networkTimeoutGroup) networkTimeoutGroup.style.display = 'none';
  if (networkIdleTimeGroup) networkIdleTimeGroup.style.display = 'none';
  if (networkExpectedStatusGroup) networkExpectedStatusGroup.style.display = 'none';
  if (networkSaveToVariableGroup) networkSaveToVariableGroup.style.display = 'none';
  
  // Показываем нужные поля в зависимости от подтипа
  switch (networkSubtype) {
    case 'network-wait-request':
      if (networkUrlPatternGroup) networkUrlPatternGroup.style.display = 'block';
      if (networkTimeoutGroup) networkTimeoutGroup.style.display = 'block';
      if (networkSaveToVariableGroup) {
        networkSaveToVariableGroup.style.display = 'block';
        // Обработчик для чекбокса
        if (networkSaveToVariableCheckbox && !networkSaveToVariableCheckbox.dataset.listenerAdded) {
          networkSaveToVariableCheckbox.dataset.listenerAdded = '1';
          networkSaveToVariableCheckbox.addEventListener('change', () => {
            if (networkSaveToVariable) {
              networkSaveToVariable.style.display = networkSaveToVariableCheckbox.checked ? 'block' : 'none';
            }
          });
        }
      }
      break;
    case 'network-wait-idle':
      if (networkIdleTimeGroup) networkIdleTimeGroup.style.display = 'block';
      if (networkTimeoutGroup) networkTimeoutGroup.style.display = 'block';
      break;
    case 'network-assert-request':
      if (networkUrlPatternGroup) networkUrlPatternGroup.style.display = 'block';
      if (networkExpectedStatusGroup) {
        networkExpectedStatusGroup.style.display = 'block';
        // Для assert-request статус опционален
        const statusLabel = networkExpectedStatusGroup.querySelector('label');
        if (statusLabel) statusLabel.textContent = 'Expected HTTP status (optional)';
      }
      break;
    case 'network-assert-status':
      if (networkUrlPatternGroup) networkUrlPatternGroup.style.display = 'block';
      if (networkExpectedStatusGroup) networkExpectedStatusGroup.style.display = 'block';
      break;
  }
}

TestEditor.prototype.updateTableForm = function() {
  const tableSubtype = document.getElementById('tableSubtypeSelect')?.value;
  const tableRowIndexGroup = document.getElementById('tableRowIndexGroup');
  const tableColumnIndexGroup = document.getElementById('tableColumnIndexGroup');
  const tableVariableNameGroup = document.getElementById('tableVariableNameGroup');
  const tableExpectedValueGroup = document.getElementById('tableExpectedValueGroup');
  const tableExpectedCountGroup = document.getElementById('tableExpectedCountGroup');
  const tableSearchTextGroup = document.getElementById('tableSearchTextGroup');
  const tableSearchColumnGroup = document.getElementById('tableSearchColumnGroup');
  
  // Скрываем все группы table
  if (tableRowIndexGroup) tableRowIndexGroup.style.display = 'none';
  if (tableColumnIndexGroup) tableColumnIndexGroup.style.display = 'none';
  if (tableVariableNameGroup) tableVariableNameGroup.style.display = 'none';
  if (tableExpectedValueGroup) tableExpectedValueGroup.style.display = 'none';
  if (tableExpectedCountGroup) tableExpectedCountGroup.style.display = 'none';
  if (tableSearchTextGroup) tableSearchTextGroup.style.display = 'none';
  if (tableSearchColumnGroup) tableSearchColumnGroup.style.display = 'none';
  
  // Показываем нужные поля в зависимости от подтипа
  switch (tableSubtype) {
    case 'table-get-cell-value':
    case 'table-get-cell-text':
      if (tableRowIndexGroup) tableRowIndexGroup.style.display = 'block';
      if (tableColumnIndexGroup) tableColumnIndexGroup.style.display = 'block';
      if (tableVariableNameGroup) tableVariableNameGroup.style.display = 'block';
      break;
    case 'table-click-cell':
      if (tableRowIndexGroup) tableRowIndexGroup.style.display = 'block';
      if (tableColumnIndexGroup) tableColumnIndexGroup.style.display = 'block';
      break;
    case 'table-get-row':
      if (tableRowIndexGroup) tableRowIndexGroup.style.display = 'block';
      if (tableVariableNameGroup) tableVariableNameGroup.style.display = 'block';
      break;
    case 'table-get-column':
      if (tableColumnIndexGroup) tableColumnIndexGroup.style.display = 'block';
      if (tableVariableNameGroup) tableVariableNameGroup.style.display = 'block';
      break;
    case 'table-get-row-count':
    case 'table-get-column-count':
      if (tableVariableNameGroup) tableVariableNameGroup.style.display = 'block';
      break;
    case 'table-assert-cell-value':
      if (tableRowIndexGroup) tableRowIndexGroup.style.display = 'block';
      if (tableColumnIndexGroup) tableColumnIndexGroup.style.display = 'block';
      if (tableExpectedValueGroup) tableExpectedValueGroup.style.display = 'block';
      break;
    case 'table-assert-row-count':
      if (tableExpectedCountGroup) tableExpectedCountGroup.style.display = 'block';
      break;
    case 'table-find-row':
      if (tableSearchTextGroup) tableSearchTextGroup.style.display = 'block';
      if (tableSearchColumnGroup) tableSearchColumnGroup.style.display = 'block';
      if (tableVariableNameGroup) tableVariableNameGroup.style.display = 'block';
      break;
  }
}

TestEditor.prototype.updateDragForm = function() {
  const dragSubtype = document.getElementById('dragSubtypeSelect')?.value;
  const dragTargetSelectorGroup = document.getElementById('dragTargetSelectorGroup');
  const dragOffsetXGroup = document.getElementById('dragOffsetXGroup');
  const dragOffsetYGroup = document.getElementById('dragOffsetYGroup');
  const dragTargetXGroup = document.getElementById('dragTargetXGroup');
  const dragTargetYGroup = document.getElementById('dragTargetYGroup');
  
  // Скрываем все группы drag
  if (dragTargetSelectorGroup) dragTargetSelectorGroup.style.display = 'none';
  if (dragOffsetXGroup) dragOffsetXGroup.style.display = 'none';
  if (dragOffsetYGroup) dragOffsetYGroup.style.display = 'none';
  if (dragTargetXGroup) dragTargetXGroup.style.display = 'none';
  if (dragTargetYGroup) dragTargetYGroup.style.display = 'none';
  
  // Показываем нужные поля в зависимости от подтипа
  switch (dragSubtype) {
    case 'drag-and-drop':
      if (dragTargetSelectorGroup) dragTargetSelectorGroup.style.display = 'block';
      break;
    case 'drag-by-offset':
      if (dragOffsetXGroup) dragOffsetXGroup.style.display = 'block';
      if (dragOffsetYGroup) dragOffsetYGroup.style.display = 'block';
      break;
    case 'drag-to-coordinates':
      if (dragTargetXGroup) dragTargetXGroup.style.display = 'block';
      if (dragTargetYGroup) dragTargetYGroup.style.display = 'block';
      break;
    case 'drag-start':
    case 'drag-over':
    case 'drop':
      // Эти подтипы используют только основной selector
      break;
  }
}

TestEditor.prototype.updateDatepickerForm = function() {
  const datepickerSubtype = document.getElementById('datepickerSubtypeSelect')?.value;
  const datepickerDateGroup = document.getElementById('datepickerDateGroup');
  const datepickerRangeGroup = document.getElementById('datepickerRangeGroup');
  const datepickerTimeGroup = document.getElementById('datepickerTimeGroup');
  
  // Скрываем все группы
  if (datepickerDateGroup) datepickerDateGroup.style.display = 'none';
  if (datepickerRangeGroup) datepickerRangeGroup.style.display = 'none';
  if (datepickerTimeGroup) datepickerTimeGroup.style.display = 'none';
  
  // Показываем нужные поля
  switch (datepickerSubtype) {
    case 'datepicker-select-date':
    case 'datepicker-select-datetime':
      if (datepickerDateGroup) datepickerDateGroup.style.display = 'block';
      break;
    case 'datepicker-select-range':
      if (datepickerRangeGroup) datepickerRangeGroup.style.display = 'block';
      break;
    case 'datepicker-select-time':
      if (datepickerTimeGroup) datepickerTimeGroup.style.display = 'block';
      break;
    case 'datepicker-clear':
    case 'datepicker-open':
    case 'datepicker-close':
      // Не требуют дополнительных полей
      break;
  }
}

TestEditor.prototype.updateMediaForm = function() {
  const mediaSubtype = document.getElementById('mediaSubtypeSelect')?.value;
  const mediaSeekTimeGroup = document.getElementById('mediaSeekTimeGroup');
  const mediaVolumeGroup = document.getElementById('mediaVolumeGroup');
  const mediaPlaybackRateGroup = document.getElementById('mediaPlaybackRateGroup');
  
  // Скрываем все группы
  if (mediaSeekTimeGroup) mediaSeekTimeGroup.style.display = 'none';
  if (mediaVolumeGroup) mediaVolumeGroup.style.display = 'none';
  if (mediaPlaybackRateGroup) mediaPlaybackRateGroup.style.display = 'none';
  
  // Показываем нужные поля
  switch (mediaSubtype) {
    case 'media-seek':
      if (mediaSeekTimeGroup) mediaSeekTimeGroup.style.display = 'block';
      break;
    case 'media-set-volume':
      if (mediaVolumeGroup) mediaVolumeGroup.style.display = 'block';
      break;
    case 'media-set-playback-rate':
      if (mediaPlaybackRateGroup) mediaPlaybackRateGroup.style.display = 'block';
      break;
    case 'media-play':
    case 'media-pause':
    case 'media-stop':
    case 'media-mute':
    case 'media-unmute':
    case 'media-fullscreen':
      // Не требуют дополнительных полей
      break;
  }
}

TestEditor.prototype.updateDeviceForm = function() {
  const deviceSubtype = document.getElementById('deviceSubtypeSelect')?.value;
  const deviceViewportGroup = document.getElementById('deviceViewportGroup');
  const deviceOrientationGroup = document.getElementById('deviceOrientationGroup');
  
  // Скрываем все группы
  if (deviceViewportGroup) deviceViewportGroup.style.display = 'none';
  if (deviceOrientationGroup) deviceOrientationGroup.style.display = 'none';
  
  // Показываем нужные поля
  switch (deviceSubtype) {
    case 'device-set-viewport':
      if (deviceViewportGroup) deviceViewportGroup.style.display = 'block';
      break;
    case 'device-rotate':
      if (deviceOrientationGroup) deviceOrientationGroup.style.display = 'block';
      break;
    case 'device-emulate-mobile':
    case 'device-emulate-tablet':
    case 'device-emulate-desktop':
      // Используют предустановленные размеры
      break;
  }
}

TestEditor.prototype.updateChainForm = function() {
  const chainSubtype = document.getElementById('chainSubtypeSelect')?.value;
  const chainRetryGroup = document.getElementById('chainRetryGroup');
  const chainStepsGroup = document.getElementById('chainStepsGroup');
  const chainResultVarGroup = document.getElementById('chainResultVarGroup');
  
  // Скрываем все группы
  if (chainRetryGroup) chainRetryGroup.style.display = 'none';
  if (chainStepsGroup) chainStepsGroup.style.display = 'none';
  if (chainResultVarGroup) chainResultVarGroup.style.display = 'none';
  
  // Steps всегда показываем
  if (chainStepsGroup) chainStepsGroup.style.display = 'block';
  
  // Дополнительные поля
  switch (chainSubtype) {
    case 'chain-retry':
      if (chainRetryGroup) chainRetryGroup.style.display = 'block';
      break;
    case 'chain-batch':
      if (chainResultVarGroup) chainResultVarGroup.style.display = 'block';
      break;
  }
}

TestEditor.prototype.updateFormForSelectorType = function() {
  // Можно добавить логику для разных типов селекторов
}

})();
