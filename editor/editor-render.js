/**
 * AutoTest Recorder - Editor Module
 * Rendering: actions, groups, items, selectors, optimization status
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-render
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-render.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.renderActions = function() {
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
TestEditor.prototype.groupActionsByPage = function(actions) {
  const groups = [];
  let currentGroup = null;
  
  actions.forEach((action, index) => {
    let url = action.url;
    if (action.type === 'analysis' && this._isAnalysisEditorUrl(action)) url = '';
    else if (!url) url = window.location.href;
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
TestEditor.prototype.normalizeUrl = function(url) {
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
TestEditor.prototype.renderActionGroup = function(group, groupIndex) {
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

TestEditor.prototype.pluralize = function(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

TestEditor.prototype.renderActionItem = function(action, index, visibleStepNumber = null, parentContext = null) {
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
  if (action.type === 'try-catch') {
    return this.renderTryCatchBlock(action, index, visibleStepNumber);
  }
  
  const isHidden = action.hidden || false;
  const isCollapsed = this.allCollapsed;
  // Проверяем, находится ли действие внутри цикла, условия или try-catch
  const isInsideLoopOrCondition = parentContext !== null && (parentContext.branch === 'loop' || parentContext.branch === 'then' || parentContext.branch === 'else' || parentContext.branch === 'try' || parentContext.branch === 'catch' || parentContext.branch === 'finally');
  // Для действий внутри циклов/условий/try-catch в развёрнутом режиме используем компактный стиль кнопок (как в условии)
  // В свёрнутом режиме оставляем стандартный стиль
  const useCompactButtons = isInsideLoopOrCondition && !isCollapsed;
  const optimizationMeta = this.getOptimizationMeta(action);
  const isAutoOptimized = !!optimizationMeta;
  const hasRecordMarker = action.recordMarker === true; // Явная проверка на true для совместимости со старыми тестами
  const typeBadge = this.getActionTypeBadge(action.type, action);
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
          ${hasProblematicPatterns ? '<span class="selector-warning-icon" title="' + this.escapeHtml((this.t('editorUI.problematicSelectorWithIssues', { issues: selectorQuality.issues.join(', ') }) || ('⚠️ Problematic selector: ' + selectorQuality.issues.join(', ')))) + '">⚠️</span>' : ''}
          <span class="action-number clickable-number ${isHidden ? 'inactive' : ''}" data-action-index="${actionIndex}" data-action="toggle-visibility" title="${this.t('editorUI.clickToShowHideStepTooltip', { action: isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn') }) || ('Click to ' + (isHidden ? 'show' : 'hide') + ' action. Double click to change step number.')}">
            ${isCollapsed ? '#' : '# '}${visibleStepNumber}
          </span>
          <span class="drag-handle">☰</span>
          <span class="action-type-badge ${action.type} ${action.subtype ? action.subtype : ''}">${this.getActionTypeIcon(action.type, action.subtype)} ${typeBadge}</span>
          ${(action.fieldLabel && this.showFieldLabels) ? `<span class="action-field-label" title="${this.t('editorUI.fieldLabelTooltip') || 'Field label'}">${this.escapeHtml(action.fieldLabel)}</span>` : ''}
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
          <button class="btn btn-small btn-success api-execute-btn" data-action="execute-api" data-action-index="${actionIndex}" title="${this.t('editorUI.executeApiRequest') || 'Execute API request'}">
            ${(isCollapsed || useCompactButtons) ? '▶️' : '▶️ ' + this.t('editorUI.executeBtn')}
          </button>
          ` : ''}
          ${parentContext?.branch !== 'loop' ? `
          <button class="btn btn-small ${hasRecordMarker ? 'btn-record-active' : 'btn-record'}" data-action="toggle-record-marker" data-action-index="${actionIndex}" title="${hasRecordMarker ? (this.t('editorUI.removeRecordMarker') || 'Remove record marker') : (this.t('editorUI.setRecordMarker') || 'Set record marker')}">
            ${(isCollapsed || useCompactButtons) ? (hasRecordMarker ? '🔴' : '⚪') : (hasRecordMarker ? '🔴 ' + this.t('editorUI.recordMarker') : '⚪ ' + this.t('editorUI.recordMarker'))}
          </button>
          ` : ''}
          <button class="btn btn-small btn-secondary" data-action="edit" data-action-index="${actionIndex}" title="${this.t('editorUI.editBtn') || 'Edit'}">
            ${(isCollapsed || useCompactButtons) ? '✏️' : '✏️ ' + this.t('editorUI.editBtn')}
          </button>
          <button class="btn btn-small btn-info" data-action="duplicate" data-action-index="${actionIndex}" title="${this.t('editorUI.duplicateBtn') || 'Duplicate'}">
            ${(isCollapsed || useCompactButtons) ? '📋' : '📋 ' + this.t('editorUI.duplicateBtn')}
          </button>
          <button class="btn btn-small btn-warning" data-action="toggle-visibility" data-action-index="${actionIndex}" title="${(isHidden ? this.t('editorUI.showBtn') : this.t('editorUI.hideBtn')) || (isHidden ? 'Show' : 'Hide')}">
            ${(isCollapsed || useCompactButtons) ? (isHidden ? '👁️' : '🙈') : (isHidden ? '👁️ ' + this.t('editorUI.showBtn') : '🙈 ' + this.t('editorUI.hideBtn'))}
          </button>
          <button class="btn btn-small btn-danger" data-action="delete" data-action-index="${actionIndex}" title="${this.t('editorUI.deleteBtn') || 'Delete'}">
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
            <div class="action-field-value">${action.variable?.operation === 'collect-data' ? (this.getVariableOperationName('collect-data') + ': ' + (Array.isArray(action.variable?.variableNames) ? action.variable.variableNames.join(', ') : '')) : (this.escapeHtml(action.variable?.name || '') + ' (' + this.getVariableOperationName(action.variable?.operation) + ')')}</div>
          </div>
        ` : action.type === 'adaptive' ? `
          <div class="action-field">
            <label>${this.t('editorUI.adaptiveMode') || 'Mode'}</label>
            <div class="action-field-value">
              <span class="adaptive-mode-badge ${action.subtype === 'adaptive-auto' ? 'adaptive-auto' : 'adaptive-single'}" style="
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                background: ${action.subtype === 'adaptive-auto' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#3b82f6'};
                color: white;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
              ">
                ${action.subtype === 'adaptive-auto' ? '🤖' : '🎯'} ${action.subtype === 'adaptive-auto' ? (this.t('editorUI.adaptiveAuto') || 'Automatic') : (this.t('editorUI.adaptiveSingle') || 'Single action')}
              </span>
            </div>
          </div>
          ${action.subtype === 'adaptive-auto' ? `
            <div class="action-field">
              <label>${this.t('editorUI.adaptiveAutoSettings') || 'Settings'}</label>
              <div class="action-field-value" style="font-size: 12px; color: #64748b;">
                <div style="margin-bottom: 4px;">
                  <strong>${this.t('editorUI.adaptiveAutoMaxIterations') || 'Max iterations'}:</strong> ${action.maxIterations || 99}
                </div>
                ${action.excludeButtons ? `
                <div style="margin-bottom: 4px;">
                  <strong>${this.t('editorUI.adaptiveAutoExcludeButtons') || 'Exclude buttons'}:</strong> ${this.escapeHtml(action.excludeButtons)}
                </div>
                ` : ''}
                <div style="margin-bottom: 4px;">
                  <strong>${this.t('editorUI.adaptiveAutoFillMode') || 'Fill mode'}:</strong> 
                  ${action.fillMode === 'all' ? (this.t('editorUI.adaptiveAutoFillModeAll') || 'All fields') : 
                    action.fillMode === 'empty' ? (this.t('editorUI.adaptiveAutoFillModeEmpty') || 'Empty only') : 
                    (this.t('editorUI.adaptiveAutoFillModeRequired') || 'Required only')}
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                  ${action.exploreDropdowns !== false ? `<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 11px;">✓ Dropdown</span>` : ''}
                  ${action.toggleCheckboxes !== false ? `<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 11px;">✓ Checkbox</span>` : ''}
                  ${action.enableBacktracking !== false ? `<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 11px;">✓ Backtrack</span>` : ''}
                  ${action.ignoreValidationErrors ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 11px;">! ${this.t('editorUI.adaptiveAutoIgnoreValidation') || 'Ignore validation errors'}</span>` : ''}
                </div>
              </div>
            </div>
          ` : `
            <div class="action-field">
              <label>${this.t('editorUI.adaptiveInnerAction') || 'Inner action'}</label>
              <div class="action-field-value" style="font-size: 12px; color: #64748b;">
                ${action.action ? `
                  <div style="margin-bottom: 4px;">
                    <strong>${this.t('editorUI.typeLabel') || 'Type'}:</strong> ${action.action.type || 'click'}${action.action.subtype ? ` (${action.action.subtype})` : ''}
                  </div>
                  ${action.selectorHint ? `
                  <div style="margin-bottom: 4px;">
                    <strong>${this.t('editorUI.adaptiveSelectorHint') || 'Hint'}:</strong> ${this.escapeHtml(action.selectorHint)}
                  </div>
                  ` : ''}
                  <div style="margin-bottom: 4px;">
                    <strong>${this.t('editorUI.adaptiveMaxRepeatCount') || 'Repeat'}:</strong> ${action.maxRepeatCount || 1} ${this.t('editorUI.times') || 'times'}
                  </div>
                ` : `<span style="color: #94a3b8;">${this.t('editorUI.notConfigured') || 'Not configured'}</span>`}
              </div>
            </div>
          `}
          ${action._runHistory && action._runHistory.length > 0 ? `
            <div class="action-field" style="margin-top: 12px;">
              <button type="button" class="btn btn-small btn-primary adaptive-view-report-inline-btn" data-action="adaptive-view-report" data-action-index="${actionIndex}" style="
                width: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                color: white;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
              " class="adaptive-view-report-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3v18h18"></path>
                  <path d="M18 17V9"></path>
                  <path d="M13 17V5"></path>
                  <path d="M8 17v-3"></path>
                </svg>
                📊 ${this.t('editorUI.viewReport') || 'View report'} (${action._runHistory.length})
              </button>
              <small style="display: block; margin-top: 4px; text-align: center; color: #64748b; font-size: 11px;">
                ${action.subtype === 'adaptive-auto' 
                  ? `${this.t('editorUI.iterations') || 'Iterations'}: ${action._statistics?.iterations || 0} | ${this.t('editorUI.executed') || 'Executed'}: ${action._statistics?.actionsInvoked || 0} | ${this.t('editorUI.errors') || 'Errors'}: ${(action._statistics?.errors || []).length}`
                  : `${this.t('editorUI.attempts') || 'Attempts'}: ${action._statistics?.stepsInvoked || 0} | ${this.t('editorUI.executed') || 'Executed'}: ${action._statistics?.actionsInvoked || 0} | ${this.t('editorUI.errors') || 'Errors'}: ${(action._statistics?.errors || []).length}`
                }
              </small>
            </div>
          ` : ''}
        ` : action.type === 'analysis' ? `
          <div class="action-field analysis-type-field">
            <label>${this.t('editorUI.analysisTypeLabel') || 'Analysis Type'}</label>
            <div class="analysis-type-info">
              <span class="analysis-type-badge">${this.getAnalysisSubtypeName(action.subtype)}</span>
              ${action.analysisResult ? `
                <span class="analysis-result-indicator ${action.analysisResult.success ? 'success' : 'warning'}">
                  ${action.analysisResult.success ? '✓' : '⚠'} ${this.formatAnalysisSummary(action.subtype, action.analysisResult.summary) || ''}
                </span>
              ` : ''}
            </div>
          </div>
          ${this._isAnalysisEditorUrl(action) ? `
            <div class="action-field analysis-url-invalid">
              <label>${this.t('editorUI.urlLabel') || 'URL'}</label>
              <div class="action-field-value analysis-url-warning" title="${this.t('editorUI.analysisUrlEditorWarning') || 'Set target page, not editor'}">⚠️ ${this.t('editorUI.analysisUrlNotSet') || 'URL not set (editor page specified)'}</div>
              <button type="button" class="btn btn-small btn-primary analysis-set-url-btn" data-action="analysis-set-url" data-action-index="${actionIndex}" data-analysis-subtype="${this.escapeHtml(action.subtype || 'analysis-selectors')}" style="margin-top: 8px;">${this.t('editorUI.analysisSetPageUrl') || 'Set page URL'}</button>
            </div>
          ` : action.url ? `
            <div class="action-field">
              <label>${this.t('editorUI.urlLabel') || 'URL'}</label>
              <div class="action-field-value analysis-url">${this.escapeHtml(action.url)}${action.urlLocked ? ` <span class="analysis-url-locked" title="${this.t('editorUI.analysisUrlLocked') || 'URL задан вручную'}">🔒</span>` : ''}</div>
            </div>
          ` : ''}
          ${action.subtype === 'analysis-fill-fields' && action.fillOptions ? `
            <div class="action-field">
              <label>${this.t('editorUI.fillFieldsOptionsTitle') || 'Fill options'}</label>
              <div class="action-field-value">
                ${(this.t('editorUI.fillFieldsMode') || 'Mode')}: ${this.escapeHtml(action.fillOptions.fillMode || 'random')},
                ${(this.t('editorUI.fillFieldsCharCount') || 'Chars')}: ${Number.isFinite(action.fillOptions.charCount) ? action.fillOptions.charCount : 10},
                ${(this.t('editorUI.fillFieldsCharset') || 'Charset')}: ${this.escapeHtml(action.fillOptions.charset || 'lettersAndNumbers')},
                ${(this.t('editorUI.fillFieldsTarget') || 'Target')}: ${this.escapeHtml(
                  (action.fillOptions.fillTarget || 'all') === 'required'
                    ? (this.t('editorUI.fillFieldsTargetRequired') || 'Required only')
                    : ((action.fillOptions.fillTarget || 'all') === 'all'
                      ? (this.t('editorUI.fillFieldsTargetAll') || 'All fields')
                      : (this.t('editorUI.fillFieldsTargetEmpty') || 'Empty only'))
                )}
              </div>
            </div>
          ` : ''}
          ${action.analysisResult ? `
          <div class="analysis-result-details-area">
            ${action.analysisResult.selectorsCount ? `<span class="analysis-info-badge">${action.analysisResult.selectorsCount} ${this.t('editorUI.analysisSummarySelectors') || 'selectors'}</span>` : ''}
            ${action.subtype === 'analysis-links' && (action.analysisResult.brokenLinks?.length ?? 0) > 0 ? `
              <button type="button" class="btn-link analysis-toggle-btn" data-action="analysis-toggle-broken-links" data-action-index="${actionIndex}" data-expanded="false">
                ${this.t('editorUI.brokenLinksCount') || 'Broken links'}: ${action.analysisResult.brokenLinks.length} ▾
              </button>
              <div class="analysis-expandable-content" id="analysisBrokenLinks-${actionIndex}" style="display: none;">
                ${action.analysisResult.brokenLinks.map((l, i) => `
                  <div class="analysis-item">
                    <span class="analysis-status-badge status-${l.status}">${l.status}</span>
                    <a href="${this.escapeHtml(l.href || '#')}" target="_blank" rel="noopener">${this.escapeHtml((l.text || l.href || '').substring(0, 60))}${(l.href || '').length > 60 ? '…' : ''}</a>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            ${action.subtype === 'analysis-fill-fields' && (action.analysisResult.validationErrors?.length ?? 0) > 0 ? `
              <button type="button" class="btn-link analysis-toggle-btn" data-action="analysis-toggle-validation" data-action-index="${actionIndex}" data-expanded="false">
                ${this.t('editorUI.validationErrorsTitle') || 'Validation errors'}: ${action.analysisResult.validationErrors.length} ▾
              </button>
              <div class="analysis-expandable-content" id="analysisValidation-${actionIndex}" style="display: none;">
                ${action.analysisResult.validationErrors.slice(0, 10).map(e => `
                  <div class="analysis-item">
                    <code>${this.escapeHtml((e.selector || '').substring(0, 40))}${(e.selector || '').length > 40 ? '…' : ''}</code>: ${this.escapeHtml((e.message || '').substring(0, 50))}${(e.message || '').length > 50 ? '…' : ''}
                  </div>
                `).join('')}
                ${action.analysisResult.validationErrors.length > 10 ? `<div class="analysis-item-more">+${action.analysisResult.validationErrors.length - 10} more</div>` : ''}
              </div>
            ` : ''}
            ${action.subtype === 'analysis-validate' && (action.analysisResult.issues?.length ?? 0) > 0 ? `
              <button type="button" class="btn-link analysis-toggle-btn" data-action="analysis-toggle-validate-issues" data-action-index="${actionIndex}" data-expanded="false">
                ${this.t('editorUI.validationIssuesCount') || 'Errors and warnings'}: ${action.analysisResult.issues.length} ▾
              </button>
              <div class="analysis-expandable-content" id="analysisValidateIssues-${actionIndex}" style="display: none;">
                ${action.analysisResult.issues.slice(0, 10).map(issue => `
                  <div class="analysis-item">
                    <span class="analysis-severity-badge severity-${issue.severity}">${issue.severity}</span>
                    <code>${this.escapeHtml((issue.selector || '').substring(0, 40))}</code>
                    <div class="analysis-item-detail">${(issue.problems || []).join(', ')}</div>
                  </div>
                `).join('')}
                ${action.analysisResult.issues.length > 10 ? `<div class="analysis-item-more">+${action.analysisResult.issues.length - 10} more</div>` : ''}
              </div>
            ` : ''}
            ${action.subtype === 'analysis-forms' && (action.analysisResult.forms?.length ?? 0) > 0 ? `
              <button type="button" class="btn-link analysis-toggle-btn" data-action="analysis-toggle-forms" data-action-index="${actionIndex}" data-expanded="false">
                ${this.t('editorUI.formsCount') || 'Forms'}: ${action.analysisResult.forms.length} ▾
              </button>
              <div class="analysis-expandable-content" id="analysisForms-${actionIndex}" style="display: none;">
                ${(action.analysisResult.forms || []).slice(0, 5).map((form, fi) => `
                  <div class="analysis-item">
                    <strong>Form ${form.index + 1}</strong>${form.id ? ' (id=' + this.escapeHtml(form.id) + ')' : ''}: ${(form.fields || []).length} fields
                  </div>
                `).join('')}
                ${action.analysisResult.forms.length > 5 ? `<div class="analysis-item-more">+${action.analysisResult.forms.length - 5} more forms</div>` : ''}
              </div>
            ` : ''}
            <button type="button" class="btn-link analysis-toggle-btn analysis-debug-toggle" data-action="analysis-toggle-debug" data-action-index="${actionIndex}" data-expanded="false">
              Debug ${action.subtype === 'analysis-links' ? `(${action.analysisResult.links?.length ?? 0})` : action.subtype === 'analysis-forms' ? `(${action.analysisResult.forms?.length ?? 0})` : `(${action.analysisResult.debugLog?.length ?? 0})`} ▾
            </button>
            <pre class="analysis-expandable-content analysis-debug-content" id="analysisDebug-${actionIndex}" style="display:none;">${this.escapeHtml(JSON.stringify(
              action.subtype === 'analysis-links' ? action.analysisResult.links?.slice(0, 50) :
              action.subtype === 'analysis-forms' ? action.analysisResult.forms :
              action.analysisResult.debugLog?.slice(0, 50), null, 2))}</pre>
          </div>
          ` : ''}
          <div class="analysis-card-footer-unified">
            ${action.subtype === 'analysis-performance' ? `
              <button type="button" class="btn btn-small btn-primary analysis-open-dashboard-btn" data-action="analysis-open-dashboard" data-action-index="${actionIndex}" title="${this.t('editorUI.viewPerformanceReport') || 'Open performance report'}">
                📊 ${this.t('editorUI.viewPerformanceReport') || 'View Report'}
              </button>
            ` : ''}
            ${action.analysisResult ? `
              <button type="button" class="btn btn-small btn-outline analysis-clear-result-btn" data-action="analysis-clear-result" data-action-index="${actionIndex}" title="${this.t('editorUI.analysisClearResult') || 'Clear analysis result'}">🗑️ ${this.t('editorUI.clearBtn') || 'Clear'}</button>
            ` : ''}
            ${action.analysisResult?.success ? `
              <span class="analysis-status-check">✅</span>
            ` : ''}
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
              ${hasProblematicPatterns ? '<span class="selector-warning-icon-inline" title="' + this.escapeHtml(this.t('editorUI.problematicSelector') || '⚠️ Problematic selector') + '">⚠️</span>' : ''}
            </div>
            <button 
              type="button" 
              class="selector-dropdown-toggle" 
              data-action="toggle-selector-list" 
              data-action-index="${actionIndex}"
              title="${this.t('editorUI.showBackupSelectors') || 'Show backup selectors'}"
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
              title="${this.t('editorUI.regenerateSelector') || 'Regenerate selector'}"
            >
              🔄 Regenerate
            </button>
            <button 
              type="button" 
              class="btn btn-tiny btn-quick-action" 
              data-action="copy-selector" 
              data-action-index="${actionIndex}"
              title="${this.t('editorUI.copySelector') || 'Copy selector to clipboard'}"
            >
              📋 Copy
            </button>
            <button 
              type="button" 
              class="btn btn-tiny btn-quick-action" 
              data-action="find-on-page" 
              data-action-index="${actionIndex}"
              title="${this.t('editorUI.findElement') || 'Find element on page and highlight'}"
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
          ` : action.type === 'screenshot' ? `
          <div style="padding: 8px; background: #f5f5f5; border-radius: 4px;">
            ${this.escapeHtml(this.getActionValue(action))}
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
            title="${this.t('editorUI.clickToCopyUrl') || 'Click to copy URL to clipboard'}"
          >
            <span class="url-text">${this.escapeHtml(action.url)}</span>
            <span class="url-copy-icon">📋</span>
          </div>
        </div>
        ` : ''}
        ${(action.type === 'navigation' && action.subtype === 'nav-get-url' && action.urlResult) ? `
        <div class="action-field action-field-url">
          <label>${this.t('editorUI.navGetUrl') || 'Get URL'}</label>
          <div 
            class="action-url-display clickable-url" 
            data-url="${this.escapeHtml(action.urlResult)}"
            data-action-index="${index}"
            title="${this.t('editorUI.clickToCopyUrl') || 'Click to copy URL to clipboard'}"
          >
            <span class="url-text">${this.escapeHtml(action.urlResult)}</span>
            <span class="url-copy-icon">📋</span>
          </div>
        </div>
        ` : ''}
        ${optimizationDetails}
        ${this.renderScreenshotComparison(action, index)}
      </div>
      ${!isInsideLoopOrCondition ? `
        <button class="action-insert-before" data-insert-position="before" data-target-index="${actionIndex}" title="${this.t('editorUI.addStepBefore') || 'Add step before this'}">+</button>
        <button class="action-insert-after" data-insert-position="after" data-target-index="${actionIndex}" title="${this.t('editorUI.addStepAfter') || 'Add step after this'}">+</button>
      ` : ''}
    </div>
  `;
}

/**
 * Рендерит сравнение скриншотов для действия
 */
TestEditor.prototype.renderScreenshotComparison = function(action, index) {
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

TestEditor.prototype.getActionTypeIcon = function(type, subtype) {
  if (type === 'navigation') {
    const s = subtype || 'nav-url';
    if (s === 'new-tab') return '🆕';
    if (s === 'close-tab') return '❌';
    if (s === 'switch-tab') return '↔️';
    if (s === 'nav-url') return '🌐';
    if (s === 'nav-refresh') return '🔄';
    if (s === 'nav-back') return '⬅️';
    if (s === 'nav-forward') return '➡️';
    if (s === 'nav-get-url') return '🔗';
  }
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
    'clipboard': '📋',
    'network': '🌐',
    'table': '📊',
    'drag': '🔀',
    'datepicker': '📅',
    'media': '🎬',
    'device': '📱',
    'chain': '⛓️',
    'mobile': '📱',
    'hover': '👆',
    'focus': '🎯',
    'blur': '↩️',
    'clear': '🧹',
    'upload': '📤',
    'condition': '🔀',
    'loop': '🔁',
    'analysis': '🔍',
    'adaptive': '🔄',
    'try-catch': '🛡️'
  };
  return icons[type] || '📌';
}

TestEditor.prototype.getActionTypeBadge = function(type, action) {
  if (type === 'navigation') {
    const subtype = action?.subtype || 'nav-url';
    const navBadges = {
      'nav-url': this.t('editorUI.navUrl') || 'Navigate',
      'new-tab': this.t('editorUI.navNewTab') || 'New tab',
      'close-tab': this.t('editorUI.navCloseTab') || 'Close tab',
      'switch-tab': this.t('editorUI.switchTab') || 'Switch tab',
      'nav-refresh': this.t('editorUI.navRefresh') || 'Refresh',
      'nav-back': this.t('editorUI.navBack') || 'Back',
      'nav-forward': this.t('editorUI.navForward') || 'Forward',
      'nav-get-url': this.t('editorUI.navGetUrl') || 'Get URL'
    };
    if (navBadges[subtype]) return navBadges[subtype];
  }
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
    'clipboard': this.t('editorUI.actionTypeClipboard') || 'Clipboard',
    'network': this.t('editorUI.actionTypeNetwork') || 'Network',
    'table': this.t('editorUI.actionTypeTable') || 'Table',
    'drag': this.t('editorUI.actionTypeDrag') || 'Drag & Drop',
    'datepicker': this.t('editorUI.actionTypeDatepicker') || 'Datepicker',
    'media': this.t('editorUI.actionTypeMedia') || 'Media',
    'device': this.t('editorUI.actionTypeDevice') || 'Device',
    'chain': this.t('editorUI.actionTypeChain') || 'Action Chain',
    'mobile': this.t('editorUI.actionTypeMobile') || 'Mobile',
    'hover': this.t('editorUI.actionTypeHover') || 'Hover',
    'focus': this.t('editorUI.actionTypeFocus') || 'Focus',
    'blur': this.t('editorUI.actionTypeBlur') || 'Blur',
    'clear': this.t('editorUI.actionTypeClear') || 'Clear',
    'upload': this.t('editorUI.actionTypeUpload') || 'Upload',
    'analysis': this.t('editorUI.actionTypeAnalysis') || 'Analysis',
    'adaptive': this.t('editorUI.actionTypeAdaptive') || 'Adaptive step',
    'try-catch': this.t('editorUI.actionTypeTryCatch') || 'Error handling'
  };
  return badges[type] || type;
}

TestEditor.prototype.getAnalysisDescription = function(subtype) {
  const descriptions = {
    'analysis-selectors': this.t('editorUI.analysisSelectors') || 'Get all page selectors',
    'analysis-fill-fields': this.t('editorUI.analysisFillFields') || 'Analyze fillable fields',
    'analysis-validate': this.t('editorUI.analysisValidate') || 'Validate element accessibility',
    'analysis-forms': this.t('editorUI.analysisForms') || 'Analyze page forms',
    'analysis-links': this.t('editorUI.analysisLinks') || 'Check page links',
    'analysis-performance': this.t('editorUI.analysisPerformance') || 'Analyze page performance'
  };
  return descriptions[subtype] || 'Analysis';
}

TestEditor.prototype.getPrimarySelector = function(action) {
  if (!action) return null;
  const target = action.type === 'adaptive' && action.action ? action.action : action;
  if (typeof target.selector === 'string') {
    target.selector = {
      type: 'css',
      selector: target.selector,
      value: target.selector,
      priority: 10
    };
  }
  return target.selector || null;
}

TestEditor.prototype.getUserSelectors = function(action) {
  if (!action) return [];
  if (!Array.isArray(action.userSelectors)) {
    action.userSelectors = [];
  }
  return action.userSelectors;
}

TestEditor.prototype.getSelectorReserveStats = function(action) {
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

TestEditor.prototype.getOptimizedReserves = function(action, normalizedPrimary = null) {
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

TestEditor.prototype.getUniqueAutoAlternatives = function(action, normalizedPrimary = null) {
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

TestEditor.prototype.renderSelectorDropdown = function(action, index) {
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

  // Добавляем секцию кэшированных селекторов из Analysis
  const cachedSelectorsHtml = this.renderCachedSelectorsSection();

  // Добавляем подсказку в начало списка
  const hintHtml = `
    <div class="selector-dropdown-hint">
      <small>${this.t('editorUI.bestSelectorHint')}.</small>
    </div>
  `;

  if (entries.length === 1 && !this.cachedSelectors?.length) {
    return `
      ${hintHtml}
      <div class="selector-dropdown-empty">
        Нет резервных селекторов. Добавьте новый через поле ввода.
      </div>
      ${cachedSelectorsHtml}
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
                title="${this.t('editorUI.deleteSelector') || 'Delete selector'}"
              >
                ✕
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('') + cachedSelectorsHtml;
}

/**
 * Рендерит список шагов для adaptive-flow
 */
TestEditor.prototype._renderFlowSteps = function(flowSteps) {
  if (!flowSteps || flowSteps.length === 0) {
    return `
      <div style="padding: 40px; text-align: center; color: #9ca3af;">
        <div style="font-size: 48px; margin-bottom: 12px;">📝</div>
        <p style="margin: 0; font-size: 14px;">${this.t('editorUI.noStepsYet') || 'No steps. Click "+ Add step" to create.'}</p>
      </div>
    `;
  }

  return flowSteps.map((step, index) => {
    const stepActions = step.actions || [];
    const hasVariations = step.variations?.enabled === true;
    const isRequired = step.required === true;
    
    // Форматирование действий
    const actionsText = stepActions.map(act => {
      if (act.type === 'fill-fields') {
        return `📝 Заполнить (${act.fillOptions?.fillTarget || act.fillTarget || 'all'})`;
      } else if (act.type === 'click') {
        return `👆 Клик${act.selectorHint ? ` (${act.selectorHint})` : ''}`;
      } else if (act.type === 'wait') {
        return `⏱️ Ожидание (${act.delay || 1000}ms)`;
      } else if (act.type === 'screenshot') {
        return `📸 Скриншот`;
      }
      return `${act.type}`;
    }).join(', ');

    return `
      <div class="flow-step-item" data-step-index="${index}" style="
        padding: 12px;
        border-bottom: 1px solid #f3f4f6;
        transition: background 0.2s;
        cursor: pointer;
      ">
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                font-weight: 600;
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 10px;
                min-width: 24px;
                text-align: center;
              ">${index + 1}</span>
              <strong style="font-size: 13px; color: #1e293b;">${this.escapeHtml(step.name || `Шаг ${index + 1}`)}</strong>
              ${isRequired ? `<span style="color: #dc2626; font-size: 11px; font-weight: 600;">ОБЯЗАТЕЛЬНЫЙ</span>` : ''}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-left: 32px;">
              ${actionsText || 'No actions'}
            </div>
            ${hasVariations ? `
              <div style="margin-left: 32px; margin-top: 4px;">
                <span style="
                  background: #f0fdf4;
                  color: #16a34a;
                  font-size: 10px;
                  padding: 2px 6px;
                  border-radius: 4px;
                  border: 1px solid #86efac;
                ">
                  🔄 Вариации: dropdown×${step.variations.tryDropdownOptions || 3}, checkbox×${step.variations.tryCheckboxStates ? 2 : 1}
                </span>
              </div>
            ` : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="edit-flow-step-btn" data-step-index="${index}" style="
              padding: 4px 8px;
              background: white;
              border: 1px solid #e5e7eb;
              border-radius: 4px;
              font-size: 11px;
              cursor: pointer;
              color: #374151;
            " title="${this.t('editorUI.editBtn') || 'Edit'}">
              ✏️
            </button>
            <button type="button" class="delete-flow-step-btn" data-step-index="${index}" style="
              padding: 4px 8px;
              background: white;
              border: 1px solid #fecaca;
              border-radius: 4px;
              font-size: 11px;
              cursor: pointer;
              color: #dc2626;
            " title="${this.t('editorUI.deleteBtn') || 'Delete'}">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Показывает модальное окно для добавления нового шага в flow
 */
TestEditor.prototype.showAddFlowStepModal = function() {
  const modal = document.createElement('div');
  modal.className = 'flow-step-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 8px;
      padding: 24px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    ">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1e293b;">
        ${this.t('editorUI.addFlowStep') || 'Add step to scenario'}
      </h3>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">
          ${this.t('editorUI.stepName') || 'Step name'}
        </label>
        <input type="text" id="flowStepName" placeholder="${this.t('editorUI.stepNamePlaceholder') || 'e.g. Fill form'}" style="
          width: 100%;
          padding: 8px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 14px;
        ">
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">
          ${this.t('editorUI.stepActions') || 'Actions'}
        </label>
        <select id="flowStepActionType" style="
          width: 100%;
          padding: 8px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          margin-bottom: 8px;
        ">
          <option value="fill-fields">📝 ${this.t('editorUI.fillFields') || 'Fill fields'}</option>
          <option value="click">👆 ${this.t('editorUI.click') || 'Click'}</option>
          <option value="wait">⏱️ ${this.t('editorUI.wait') || 'Wait'}</option>
          <option value="screenshot">📸 ${this.t('editorUI.screenshot') || 'Screenshot'}</option>
        </select>
        
        <div id="flowActionParams" style="margin-top: 8px;"></div>
      </div>

      <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border-radius: 6px; border: 1px solid #86efac;">
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" id="flowStepEnableVariations" style="cursor: pointer;">
          <span style="font-weight: 600; font-size: 13px;">
            ${this.t('editorUI.enableVariations') || '🔄 Enable variations'}
          </span>
        </label>
        
        <div id="flowVariationsOptions" style="display: none; margin-left: 24px;">
          <label style="display: block; margin-bottom: 6px; font-size: 12px;">
            ${this.t('editorUI.tryDropdownOptions') || 'Try dropdown options'}
          </label>
          <input type="number" id="flowVariationDropdownCount" min="1" max="10" value="3" style="
            width: 100%;
            padding: 6px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            margin-bottom: 8px;
          ">
          
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="flowVariationCheckboxToggle" checked style="cursor: pointer;">
            <span style="font-size: 12px;">${this.t('editorUI.tryCheckboxStates') || 'Toggle checkbox (checked/unchecked)'}</span>
          </label>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="flowStepRequired" style="cursor: pointer;">
          <span style="font-size: 13px; color: #dc2626; font-weight: 600;">
            ${this.t('editorUI.requiredStep') || '⚠️ Required step (stop on error)'}
          </span>
        </label>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancelFlowStepBtn" style="
          padding: 8px 16px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        ">${this.t('editorUI.cancel') || 'Cancel'}</button>
        <button id="saveFlowStepBtn" style="
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        ">${this.t('editorUI.add') || 'Add'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Обработчик изменения типа действия
  const actionTypeSelect = modal.querySelector('#flowStepActionType');
  const actionParams = modal.querySelector('#flowActionParams');
  
  actionTypeSelect.addEventListener('change', () => {
    const type = actionTypeSelect.value;
    if (type === 'fill-fields') {
      actionParams.innerHTML = `
        <select id="flowActionFillTarget" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
          <option value="required">${this.t('editorUI.fillRequired') || 'Required only'}</option>
          <option value="all">${this.t('editorUI.fillAll') || 'All fields'}</option>
          <option value="empty">${this.t('editorUI.fillEmpty') || 'Empty only'}</option>
        </select>
      `;
    } else if (type === 'click') {
      actionParams.innerHTML = `
        <input type="text" id="flowActionSelectorHint" placeholder="${this.t('editorUI.selectorHint') || 'Hint: Next, Save...'}" style="
          width: 100%;
          padding: 6px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
        ">
      `;
    } else if (type === 'wait') {
      actionParams.innerHTML = `
        <input type="number" id="flowActionDelay" min="100" max="30000" value="1000" placeholder="1000" style="
          width: 100%;
          padding: 6px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
        ">
        <small style="display: block; margin-top: 4px; color: #64748b; font-size: 11px;">
          ${this.t('editorUI.delayMs') || 'Delay in ms (1000 = 1 second)'}
        </small>
      `;
    } else {
      actionParams.innerHTML = '';
    }
  });
  actionTypeSelect.dispatchEvent(new Event('change'));

  // Обработчик включения вариаций
  const enableVariations = modal.querySelector('#flowStepEnableVariations');
  const variationsOptions = modal.querySelector('#flowVariationsOptions');
  
  enableVariations.addEventListener('change', () => {
    variationsOptions.style.display = enableVariations.checked ? 'block' : 'none';
  });

  // Обработчик сохранения
  modal.querySelector('#saveFlowStepBtn').addEventListener('click', () => {
    const stepName = modal.querySelector('#flowStepName').value.trim();
    const actionType = actionTypeSelect.value;
    const enableVar = enableVariations.checked;
    const required = modal.querySelector('#flowStepRequired').checked;

    if (!stepName) {
      alert(this.t('editorUI.pleaseEnterStepName') || 'Please enter step name');
      return;
    }

    const stepActions = [];
    const stepAction = { type: actionType };

    if (actionType === 'fill-fields') {
      stepAction.fillTarget = modal.querySelector('#flowActionFillTarget')?.value || 'required';
    } else if (actionType === 'click') {
      stepAction.selectorHint = modal.querySelector('#flowActionSelectorHint')?.value || '';
    } else if (actionType === 'wait') {
      stepAction.delay = parseInt(modal.querySelector('#flowActionDelay')?.value || '1000');
    }

    stepActions.push(stepAction);

    const newStep = {
      step: this.getCurrentFlowSteps().length + 1,
      name: stepName,
      actions: stepActions,
      required: required
    };

    if (enableVar) {
      newStep.variations = {
        enabled: true,
        tryDropdownOptions: parseInt(modal.querySelector('#flowVariationDropdownCount')?.value || '3'),
        tryCheckboxStates: modal.querySelector('#flowVariationCheckboxToggle')?.checked !== false
      };
    }

    this.addFlowStep(newStep);
    document.body.removeChild(modal);
  });

  // Обработчик отмены
  modal.querySelector('#cancelFlowStepBtn').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Закрытие по клику вне модального окна
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

/**
 * Получает текущие шаги flow из формы
 */
TestEditor.prototype.getCurrentFlowSteps = function() {
  const currentAction = this.test?.actions[this.editingActionIndex];
  return currentAction?.flow || [];
}

/**
 * Добавляет новый шаг в flow
 */
TestEditor.prototype.addFlowStep = function(step) {
  const currentAction = this.test?.actions[this.editingActionIndex];
  if (!currentAction) return;

  if (!Array.isArray(currentAction.flow)) {
    currentAction.flow = [];
  }

  currentAction.flow.push(step);
  this.updateFlowStepsList();
}

/**
 * Удаляет шаг из flow
 */
TestEditor.prototype.deleteFlowStep = function(stepIndex) {
  const currentAction = this.test?.actions[this.editingActionIndex];
  if (!currentAction || !Array.isArray(currentAction.flow)) return;

  if (confirm(this.t('editorUI.confirmDeleteStep') || 'Delete this step?')) {
    currentAction.flow.splice(stepIndex, 1);
    // Обновляем номера шагов
    currentAction.flow.forEach((step, idx) => {
      step.step = idx + 1;
    });
    this.updateFlowStepsList();
  }
}

/**
 * Показывает модальное окно для редактирования шага adaptive-flow
 */
TestEditor.prototype.showEditFlowStepModal = function(stepIndex) {
  const currentAction = this.test?.actions[this.editingActionIndex];
  if (!currentAction || !Array.isArray(currentAction.flow)) return;

  const step = currentAction.flow[stepIndex];
  if (!step) return;

  const firstAction = (step.actions && step.actions[0]) || { type: 'fill-fields' };
  const actionType = firstAction.type || 'fill-fields';

  const modal = document.createElement('div');
  modal.id = 'editFlowStepModal';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100000; display: flex; align-items: center; justify-content: center;';
  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 8px;
      padding: 24px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    ">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1e293b;">
        ${this.t('editorUI.editFlowStep') || 'Edit step'}
      </h3>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">
          ${this.t('editorUI.stepName') || 'Step name'}
        </label>
        <input type="text" id="flowStepNameEdit" placeholder="${this.t('editorUI.stepNamePlaceholder') || 'e.g. Fill form'}" style="
          width: 100%;
          padding: 8px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 14px;
        ">
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">
          ${this.t('editorUI.stepActions') || 'Actions'}
        </label>
        <select id="flowStepActionTypeEdit" style="
          width: 100%;
          padding: 8px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          margin-bottom: 8px;
        ">
          <option value="fill-fields" ${actionType === 'fill-fields' ? 'selected' : ''}>📝 ${this.t('editorUI.fillFields') || 'Fill fields'}</option>
          <option value="click" ${actionType === 'click' ? 'selected' : ''}>👆 ${this.t('editorUI.click') || 'Click'}</option>
          <option value="wait" ${actionType === 'wait' ? 'selected' : ''}>⏱️ ${this.t('editorUI.wait') || 'Wait'}</option>
          <option value="screenshot" ${actionType === 'screenshot' ? 'selected' : ''}>📸 ${this.t('editorUI.screenshot') || 'Screenshot'}</option>
        </select>
        
        <div id="flowActionParamsEdit" style="margin-top: 8px;"></div>
      </div>

      <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border-radius: 6px; border: 1px solid #86efac;">
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" id="flowStepEnableVariationsEdit" ${step.variations?.enabled ? 'checked' : ''} style="cursor: pointer;">
          <span style="font-weight: 600; font-size: 13px;">
            ${this.t('editorUI.enableVariations') || '🔄 Enable variations'}
          </span>
        </label>
        
        <div id="flowVariationsOptionsEdit" style="display: ${step.variations?.enabled ? 'block' : 'none'}; margin-left: 24px;">
          <label style="display: block; margin-bottom: 6px; font-size: 12px;">
            ${this.t('editorUI.tryDropdownOptions') || 'Try dropdown options'}
          </label>
          <input type="number" id="flowVariationDropdownCountEdit" min="1" max="10" value="${step.variations?.tryDropdownOptions ?? 3}" style="
            width: 100%;
            padding: 6px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            margin-bottom: 8px;
          ">
          
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="flowVariationCheckboxToggleEdit" ${step.variations?.tryCheckboxStates !== false ? 'checked' : ''} style="cursor: pointer;">
            <span style="font-size: 12px;">${this.t('editorUI.tryCheckboxStates') || 'Toggle checkbox (checked/unchecked)'}</span>
          </label>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="flowStepRequiredEdit" ${step.required ? 'checked' : ''} style="cursor: pointer;">
          <span style="font-size: 13px; color: #dc2626; font-weight: 600;">
            ${this.t('editorUI.requiredStep') || '⚠️ Required step (stop on error)'}
          </span>
        </label>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancelFlowStepEditBtn" style="
          padding: 8px 16px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        ">${this.t('editorUI.cancel') || 'Cancel'}</button>
        <button id="saveFlowStepEditBtn" style="
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        ">${this.t('editorUI.save') || 'Save'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#flowStepNameEdit').value = step.name || '';

  const actionTypeSelect = modal.querySelector('#flowStepActionTypeEdit');
  const actionParams = modal.querySelector('#flowActionParamsEdit');

  const renderParamsForType = (type) => {
    if (type === 'fill-fields') {
      actionParams.innerHTML = `
        <select id="flowActionFillTargetEdit" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
          <option value="required">${this.t('editorUI.fillRequired') || 'Required only'}</option>
          <option value="all">${this.t('editorUI.fillAll') || 'All fields'}</option>
          <option value="empty">${this.t('editorUI.fillEmpty') || 'Empty only'}</option>
        </select>
      `;
      const sel = modal.querySelector('#flowActionFillTargetEdit');
      if (sel) sel.value = firstAction.fillTarget || firstAction.fillOptions?.fillTarget || 'required';
    } else if (type === 'click') {
      actionParams.innerHTML = `
        <input type="text" id="flowActionSelectorHintEdit" placeholder="${this.t('editorUI.selectorHint') || 'Hint: Next, Save...'}" style="
          width: 100%;
          padding: 6px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
        ">
      `;
      const input = modal.querySelector('#flowActionSelectorHintEdit');
      if (input) input.value = firstAction.selectorHint || '';
    } else if (type === 'wait') {
      actionParams.innerHTML = `
        <input type="number" id="flowActionDelayEdit" min="100" max="30000" placeholder="1000" style="
          width: 100%;
          padding: 6px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
        ">
        <small style="display: block; margin-top: 4px; color: #64748b; font-size: 11px;">
          ${this.t('editorUI.delayMs') || 'Delay in ms (1000 = 1 second)'}
        </small>
      `;
      const delayInput = modal.querySelector('#flowActionDelayEdit');
      if (delayInput) delayInput.value = firstAction.delay || 1000;
    } else {
      actionParams.innerHTML = '';
    }
  };

  actionTypeSelect.addEventListener('change', () => renderParamsForType(actionTypeSelect.value));
  renderParamsForType(actionType);

  const enableVariations = modal.querySelector('#flowStepEnableVariationsEdit');
  const variationsOptions = modal.querySelector('#flowVariationsOptionsEdit');
  enableVariations.addEventListener('change', () => {
    variationsOptions.style.display = enableVariations.checked ? 'block' : 'none';
  });

  modal.querySelector('#saveFlowStepEditBtn').addEventListener('click', () => {
    const stepName = modal.querySelector('#flowStepNameEdit').value.trim();
    const actionTypeVal = actionTypeSelect.value;
    const enableVar = enableVariations.checked;
    const required = modal.querySelector('#flowStepRequiredEdit').checked;

    if (!stepName) {
      alert(this.t('editorUI.pleaseEnterStepName') || 'Please enter step name');
      return;
    }

    const stepAction = { type: actionTypeVal };
    if (actionTypeVal === 'fill-fields') {
      stepAction.fillTarget = modal.querySelector('#flowActionFillTargetEdit')?.value || 'required';
    } else if (actionTypeVal === 'click') {
      stepAction.selectorHint = modal.querySelector('#flowActionSelectorHintEdit')?.value || '';
    } else if (actionTypeVal === 'wait') {
      stepAction.delay = parseInt(modal.querySelector('#flowActionDelayEdit')?.value || '1000');
    }

    const updatedStep = {
      step: stepIndex + 1,
      name: stepName,
      actions: [stepAction],
      required: required
    };
    if (enableVar) {
      updatedStep.variations = {
        enabled: true,
        tryDropdownOptions: parseInt(modal.querySelector('#flowVariationDropdownCountEdit')?.value || '3'),
        tryCheckboxStates: modal.querySelector('#flowVariationCheckboxToggleEdit')?.checked !== false
      };
    }

    currentAction.flow[stepIndex] = updatedStep;
    currentAction.flow.forEach((s, idx) => { s.step = idx + 1; });
    this.updateFlowStepsList();
    document.body.removeChild(modal);
  });

  modal.querySelector('#cancelFlowStepEditBtn').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) document.body.removeChild(modal);
  });
}

/**
 * Обновляет список шагов в UI
 */
TestEditor.prototype.updateFlowStepsList = function() {
  const flowStepsList = document.getElementById('flowStepsList');
  if (!flowStepsList) return;

  const currentSteps = this.getCurrentFlowSteps();
  flowStepsList.innerHTML = this._renderFlowSteps(currentSteps);
}

TestEditor.prototype.normalizeSelectorValue = function(value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

TestEditor.prototype.getSelectorInfo = function(selector) {
  if (!selector) return this.t('editorUI.selectorNotSpecified');
  if (typeof selector === 'string') return selector;
  return selector.selector || JSON.stringify(selector);
}

/**
 * Рассчитывает метрики качества селектора
 */
TestEditor.prototype.calculateSelectorQuality = function(selector, savedQuality = null) {
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
TestEditor.prototype.getQualityIndicatorColor = function(quality) {
  if (!quality || quality.score === 0) return '#ccc'; // Серый для невалидных
  
  if (quality.score >= 80 && quality.stability >= 80) return '#4CAF50'; // Зеленый
  if (quality.score >= 60 && quality.stability >= 60) return '#FFC107'; // Желтый
  return '#F44336'; // Красный
}

/**
 * Получает текст tooltip с метриками
 */
TestEditor.prototype.getQualityTooltip = function(quality) {
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

TestEditor.prototype.getVariableOperationName = function(operation) {
  const operationNames = {
    'extract-url': this.t('editorUI.extractFromUrl'),
    'extract-element': this.t('editorUI.extractFromElement'),
    'collect-data': this.t('editorUI.collectDataOp') || 'Collect data',
    'set': this.t('editorUI.setValue'),
    'calculate': this.t('editorUI.compute')
  };
  return operationNames[operation] || operation || '';
}

/**
 * Get display name for analysis subtype
 * @param {string} subtype - Analysis subtype
 * @returns {string}
 */
TestEditor.prototype.getAnalysisSubtypeName = function(subtype) {
  const names = {
    'analysis-selectors': this.t('editorUI.analysisSelectors') || 'Get Selectors',
    'analysis-fill-fields': this.t('editorUI.analysisFillFields') || 'Fill Fields',
    'analysis-validate': this.t('editorUI.analysisValidate') || 'Validate',
    'analysis-forms': this.t('editorUI.analysisForms') || 'Analyze Forms',
    'analysis-links': this.t('editorUI.analysisLinks') || 'Check Links',
    'analysis-performance': this.t('editorUI.analysisPerformance') || 'Performance'
  };
  return names[subtype] || subtype || 'Analysis';
}

/**
 * Форматирует summary анализа в читаемую строку
 * @param {string} subtype - Тип анализа
 * @param {Object} summary - Объект summary из результата
 * @returns {string}
 */
TestEditor.prototype.formatAnalysisSummary = function(subtype, summary) {
  if (!summary || typeof summary !== 'object') return '';
  const s = summary;
  switch (subtype) {
    case 'analysis-selectors':
      return `${s.total || 0} ${this.t('editorUI.analysisSummarySelectors') || 'selectors'}, ${s.unique || 0} ${this.t('editorUI.analysisSummaryUnique') || 'unique'}`;
    case 'analysis-fill-fields':
      if (s.filled !== undefined) {
        let msg = `${s.total || 0} ${this.t('editorUI.analysisSummaryFields') || 'fields'}, ${s.filled} ${this.t('editorUI.analysisSummaryFilled') || 'filled'}`;
        if (s.validationErrors > 0) {
          msg += `, ${s.validationErrors} ${this.t('editorUI.analysisSummaryValidationErrors') || 'validation errors'}`;
        }
        return msg;
      }
      return `${s.total || 0} ${this.t('editorUI.analysisSummaryFields') || 'fields'}, ${s.empty || 0} ${this.t('editorUI.analysisSummaryEmpty') || 'empty'}`;
    case 'analysis-links':
      if (s.checked !== undefined) {
        return `${s.total || 0} ${this.t('editorUI.analysisSummaryLinks') || 'links'}, ${s.live || 0} ${this.t('editorUI.analysisSummaryLive') || 'live'}, ${s.broken || 0} ${this.t('editorUI.analysisSummaryBroken') || 'broken'}`;
      }
      return `${s.total || 0} ${this.t('editorUI.analysisSummaryLinks') || 'links'}`;
    case 'analysis-validate': {
      const acc = s.accessibilityCount;
      const code = s.codeCount;
      const base = `${s.errors || 0} ${this.t('editorUI.analysisSummaryErrors') || 'errors'}, ${s.warnings || 0} ${this.t('editorUI.analysisSummaryWarnings') || 'warnings'}`;
      if (acc !== undefined && code !== undefined && (acc > 0 || code > 0)) {
        return `${base} (${this.t('editorUI.validationAccessibilityLabel') || 'accessibility'}: ${acc}, ${this.t('editorUI.validationCodeLabel') || 'code'}: ${code})`;
      }
      return base;
    }
    case 'analysis-forms':
      return `${s.total || 0} ${this.t('editorUI.analysisSummaryForms') || 'forms'}, ${s.totalFields || 0} ${this.t('editorUI.analysisSummaryFields') || 'fields'}`;
    case 'analysis-performance':
      const loadMs = s.loadTime !== undefined ? Math.round(s.loadTime) : 0;
      return `${this.t('editorUI.analysisSummaryScore') || 'Score'}: ${s.score ?? 0}, ${this.t('editorUI.analysisSummaryLoad') || 'Load'}: ${loadMs} ms`;
    default:
      return typeof s === 'string' ? s : JSON.stringify(s);
  }
}

/**
 * Возвращает true, если URL — страница расширения или редактора (не целевая страница).
 */
TestEditor.prototype._isEditorOrExtensionUrl = function(url) {
  if (!url || typeof url !== 'string') return true;
  if (url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('edge://')) return true;
  if (url.includes('/editor/') || url.includes('editor_ru.html') || url.includes('editor.html')) return true;
  return false;
}

/**
 * URL шага «Анализ» считается некорректным (редактор), если пустой или extension/editor.
 */
TestEditor.prototype._isAnalysisEditorUrl = function(action) {
  if (!action || action.type !== 'analysis') return false;
  return this._isEditorOrExtensionUrl(action.url);
}

TestEditor.prototype.getActionValue = function(action) {
  if (action.type === 'adaptive' && action.action) {
    const inner = action.action;
    const span = action.stepSpan > 1 ? ` (×${action.stepSpan})` : '';
    const repeat = action.maxRepeatCount > 1 ? ` ×${action.maxRepeatCount}` : '';
    const val = (inner.value || inner.optionText || inner.expectedValue || '').toString().substring(0, 40);
    return `${inner.type} ${inner.subtype || ''}${val ? ': ' + val : ''}${span}${repeat}`;
  }
  if (action.type === 'keyboard') {
    if (action.subtype === 'keyboard-navigate') return action.key || 'ArrowDown';
    if (action.subtype === 'keyboard-escape') return 'Escape';
    return action.keyCombination || action.key || 'Unknown';
  }
  if (action.type === 'input' && action.subtype === 'keyboard-typeahead') {
    return action.value || this.t('editorUI.emptyValue');
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
      // Для dropdown subtypes показываем опцию/значение
      if (action.subtype?.startsWith('dropdown-')) {
        if (action.subtype === 'dropdown-multiselect') {
          const vals = action.optionValues || action.expectedValues;
          return Array.isArray(vals) ? vals.join(', ') : (vals || '');
        }
        return action.optionText || action.value || action.element?.text || action.element?.href || this.t('editorUI.clickOnElement');
      }
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
    case 'navigation': {
      const navSub = action.subtype || 'nav-url';
      if (navSub === 'nav-url') return action.url || this.t('editorUI.navUrl') || 'Navigate';
      if (navSub === 'new-tab') {
        const url = action.value || action.url || '';
        return url ? `${this.t('editorUI.navNewTabOpen') || 'Open in new tab'}: ${url}` : (this.t('editorUI.navNewTab') || 'New tab');
      }
      if (navSub === 'close-tab') return this.t('editorUI.navCloseTab') || 'Close tab';
      if (navSub === 'switch-tab') {
        const st = action.switchTab || {};
        if (st.mode === 'index') return `${this.t('editorUI.switchTabByIndex') || 'By index'}: ${st.tabIndex ?? 0}`;
        if (st.mode === 'url') return `${this.t('editorUI.switchTabByUrl') || 'By URL'}: ${st.urlPattern || '—'}`;
        if (st.mode === 'title') return `${this.t('editorUI.switchTabByTitle') || 'By title'}: ${st.titlePattern || '—'}`;
        return this.t('editorUI.switchTab') || 'Switch tab';
      }
      if (['nav-refresh', 'nav-back', 'nav-forward'].includes(navSub)) {
        const labels = { 'nav-refresh': 'editorUI.navRefresh', 'nav-back': 'editorUI.navBack', 'nav-forward': 'editorUI.navForward' };
        return this.t(labels[navSub]) || navSub;
      }
      if (navSub === 'nav-get-url') {
        const varName = (action.variableName || '').trim();
        const part = action.urlPart || 'full';
        const partLabels = { full: 'полный', href: 'href', origin: 'origin', pathname: 'pathname', path: 'path', search: 'search', hash: 'hash', hostname: 'hostname', host: 'host', protocol: 'protocol' };
        if (action.urlResult) {
          const display = action.urlResult.length > 60 ? action.urlResult.substring(0, 60) + '…' : action.urlResult;
          return `${this.t('editorUI.navGetUrl') || 'Get URL'}: ${display}`;
        }
        if (varName) {
          return `${this.t('editorUI.navGetUrl') || 'Get URL'} → \${${varName}} (${partLabels[part] || part})`;
        }
        return `${this.t('editorUI.navGetUrl') || 'Get URL'} (${partLabels[part] || part})`;
      }
      return action.url || this.t('editorUI.actionTypeNavigation');
    }
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
    case 'analysis':
      return this.getAnalysisSubtypeName(action.subtype) + (action.analysisResult?.summary ? `: ${this.formatAnalysisSummary(action.subtype, action.analysisResult.summary)}` : '');
    case 'screenshot': {
      if (action.subtype === 'page-screenshot-full' || action.screenshotCaptureType === 'full-page') return this.t('editorUI.pageScreenshotFull') || 'Full page (with scroll)';
      const cap = action.screenshotCaptureType || 'element';
      if (cap === 'full') return this.t('editorUI.screenshotCaptureFull') || 'Full screen';
      if (cap === 'element') return this.t('editorUI.screenshotValueSelector') || 'Element';
      if (cap === 'region') {
        const r = action.screenshotRegion || { x: 0, y: 0, width: 400, height: 300 };
        const coords = `${r.x}, ${r.y}, ${r.width}×${r.height}`;
        return (this.t('editorUI.screenshotValueRegion') || 'Region') + ` (${coords})`;
      }
      return this.t('editorUI.screenshotValueSelector') || 'Element';
    }
    default:
      return JSON.stringify(action);
  }
}

TestEditor.prototype.getOptimizationMeta = function(action) {
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

TestEditor.prototype.hasOptimizationAvailable = function() {
  if (!this.test || !Array.isArray(this.test.actions)) return false;
  if (this.test.optimization?.optimizedAvailable) return true;
  return this.test.actions.some(action => this.getOptimizationMeta(action));
}

TestEditor.prototype.countOptimizedActions = function() {
  if (!this.test || !Array.isArray(this.test.actions)) return 0;
  return this.test.actions.filter(action => this.getOptimizationMeta(action)).length;
}

TestEditor.prototype.refreshOptimizationUI = function() {
  this.updateRunButtons();
  this.renderOptimizationStatus();
}

TestEditor.prototype.updateRunButtons = function() {
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

TestEditor.prototype.renderOptimizationStatus = function() {
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

})();
