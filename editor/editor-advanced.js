/**
 * AutoTest Recorder - Editor Module
 * Advanced: missing vars, cached selectors, search, undo/redo, adaptive report
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-advanced
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-advanced.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.showMissingVariablesDialog = async function(missingVars) {
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
TestEditor.prototype.showSetMissingVariablesModal = async function(missingVars) {
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

/**
 * Загрузить кэшированные селекторы из Analysis для текущей вкладки
 * @param {number} tabId - ID вкладки
 * @param {string} currentUrl - Текущий URL страницы
 */
TestEditor.prototype.loadCachedSelectors = async function(tabId, currentUrl) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CACHED_SELECTORS',
      tabId,
      currentUrl
    });
    if (response && response.success && response.selectors) {
      this.cachedSelectors = response.selectors;
      this.cachedSelectorsUrl = currentUrl;
      console.log(`✅ Loaded ${response.selectors.length} cached selectors for analysis`);
      return response.selectors;
    }
  } catch (e) {
    console.warn('Failed to load cached selectors:', e);
  }
  this.cachedSelectors = [];
  return [];
}

/**
 * Получить кэшированные селекторы, сгруппированные по типу
 */
TestEditor.prototype.getCachedSelectorsGrouped = function() {
  if (!this.cachedSelectors || this.cachedSelectors.length === 0) {
    return null;
  }

  const groups = {
    dataTestId: [],
    id: [],
    name: [],
    className: [],
    css: [],
    xpath: []
  };

  for (const sel of this.cachedSelectors) {
    const selector = sel.selector || sel;
    const type = sel.type || 'css';
    
    if (type === 'data-testid' || selector.includes('[data-testid')) {
      groups.dataTestId.push(sel);
    } else if (type === 'id' || selector.startsWith('#')) {
      groups.id.push(sel);
    } else if (type === 'name' || selector.includes('[name=')) {
      groups.name.push(sel);
    } else if (type === 'class' || selector.startsWith('.')) {
      groups.className.push(sel);
    } else if (type === 'xpath' || selector.startsWith('//') || selector.startsWith('xpath:')) {
      groups.xpath.push(sel);
    } else {
      groups.css.push(sel);
    }
  }

  // Удаляем пустые группы
  for (const key of Object.keys(groups)) {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  }

  return Object.keys(groups).length > 0 ? groups : null;
}

/**
 * Рендеринг секции кэшированных селекторов в dropdown
 */
TestEditor.prototype.renderCachedSelectorsSection = function() {
  const groups = this.getCachedSelectorsGrouped();
  
  if (!groups) {
    return `
      <div class="selector-dropdown-divider">
        ${this.t('editorUI.cachedSelectors') || 'Cached Selectors'}
      </div>
      <div class="selector-dropdown-empty cached-empty">
        <small>${this.t('editorUI.noCachedSelectors') || 'No cached selectors. Run Analysis first.'}</small>
      </div>
    `;
  }

  const groupLabels = {
    dataTestId: 'data-testid',
    id: 'ID',
    name: 'Name',
    className: 'Class',
    css: 'CSS',
    xpath: 'XPath'
  };

  let html = `
    <div class="selector-dropdown-divider">
      ${this.t('editorUI.cachedSelectors') || 'Cached Selectors'} (${this.cachedSelectors.length})
    </div>
  `;

  for (const [groupKey, selectors] of Object.entries(groups)) {
    html += `
      <div class="cached-selector-group">
        <div class="cached-group-label">${groupLabels[groupKey] || groupKey} (${selectors.length})</div>
    `;
    
    for (const sel of selectors.slice(0, 5)) { // Максимум 5 в каждой группе
      const selector = typeof sel === 'string' ? sel : (sel.selector || sel);
      const quality = sel.quality || sel.score || 0;
      const element = sel.element || sel.tagName || '';
      const text = sel.text || '';
      const typeSuffix = typeof sel === 'object' ? this._getElementTypeDisplaySuffix(sel) : '';
      
      html += `
        <div class="selector-entry cached-selector" data-selector="${this.escapeHtml(selector)}">
          <div class="selector-entry-main">
            <div class="selector-entry-value" title="${this.escapeHtml(selector)}">
              ${this.escapeHtml((selector.length > 40 ? selector.substring(0, 40) + '...' : selector) + typeSuffix)}
            </div>
            <div class="selector-entry-meta">
              ${element ? `<span class="selector-badge element-badge">${this.escapeHtml(element)}</span>` : ''}
              ${quality > 0 ? `<span class="selector-badge quality-badge">${quality}%</span>` : ''}
            </div>
          </div>
          ${text ? `<div class="selector-entry-text" title="${this.escapeHtml(text)}">${this.escapeHtml(this._truncateAtWord(text, 42))}</div>` : ''}
        </div>
      `;
    }
    
    if (selectors.length > 5) {
      html += `<div class="cached-group-more">+${selectors.length - 5} more</div>`;
    }
    
    html += '</div>';
  }

  return html;
}

/**
 * Show search dialog (Ctrl+F)
 */
TestEditor.prototype.showSearchDialog = function() {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 50px;
    right: 20px;
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    min-width: 300px;
  `;
  
  dialog.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <input type="text" id="searchInput" placeholder="Search steps..." style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
      <button type="button" id="searchDialogClose" style="padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">✕</button>
    </div>
    <div id="searchResults" style="max-height: 300px; overflow-y: auto;"></div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector('#searchInput');
  const results = dialog.querySelector('#searchResults');

  dialog.querySelector('#searchDialogClose').addEventListener('click', () => {
    dialog.remove();
  });

  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (!query) {
      results.innerHTML = '';
      return;
    }

    const matches = this.test.actions.filter((action) => {
      const text = JSON.stringify(action).toLowerCase();
      return text.includes(query);
    });

    results.innerHTML = matches.map((action) => {
      const actualIndex = this.test.actions.indexOf(action);
      return `<div class="search-step-result-item" data-action-index="${actualIndex}" style="padding: 8px; margin: 4px 0; background: #f3f4f6; border-radius: 4px;">
        <strong>#${actualIndex + 1}</strong> ${action.type} - ${action.selector || action.value || ''}
      </div>`;
    }).join('') || '<div style="padding: 8px; color: #999;">No matches</div>';

    results.querySelectorAll('.search-step-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.actionIndex, 10);
        const items = document.querySelectorAll('.action-item');
        if (items[idx]) {
          items[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          items[idx].classList.add('selected');
        }
      });
    });
  });

  input.focus();
}

/**
 * Update undo/redo buttons state
 */
TestEditor.prototype.updateUndoRedoButtons = function(status) {
  // Update button states if they exist
  const undoBtn = document.querySelector('[data-action="undo"]');
  const redoBtn = document.querySelector('[data-action="redo"]');
  
  if (undoBtn) {
    undoBtn.disabled = !status.canUndo;
    undoBtn.title = status.canUndo ? `Undo: ${status.currentDescription}` : 'Nothing to undo';
  }
  
  if (redoBtn) {
    redoBtn.disabled = !status.canRedo;
    redoBtn.title = status.canRedo ? 'Redo' : 'Nothing to redo';
  }
}

/**
 * Save current state to undo history
 */
TestEditor.prototype.saveUndoState = function(description = '') {
  if (this.undoManager && this.test) {
    this.undoManager.saveState(this.test, description);
  }
}

/**
 * Открывает отчёт для адаптивного шага
 * Создаёт HTML страницу с детальной статистикой и графиками
 */
TestEditor.prototype.openAdaptiveReport = function(action) {
  if (!action._runHistory || action._runHistory.length === 0) {
    alert('Нет данных для отображения. Сначала выполните адаптивный шаг.');
    return;
  }

  const isAuto = action.subtype === 'adaptive-auto';
  const stats = action._statistics || {};
  
  // Создаём HTML страницу с отчётом
  const reportHtml = this.generateAdaptiveReportHTML(action, isAuto, stats);
  
  // Открываем в новом окне
  const reportWindow = window.open('', '_blank', 'width=1200,height=800');
  if (reportWindow) {
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  } else {
    alert('Не удалось открыть окно отчёта. Разрешите всплывающие окна для этого сайта.');
  }
}

/**
 * Генерирует HTML код для отчёта адаптивного шага
 */
TestEditor.prototype.generateAdaptiveReportHTML = function(action, isAuto, stats) {
  const runHistory = action._runHistory || [];
  const testName = this.test?.name || 'Test';
  const stepIndex = this.test?.actions?.indexOf(action) + 1 || 0;
  
  // Группируем данные для графиков
  const actionsByType = {};
  const urlVisits = {};
  const timeline = [];
  
  runHistory.forEach((entry, index) => {
    // Группировка по типу действия
    const actionType = isAuto ? entry.action : entry.actionType;
    if (actionType) {
      actionsByType[actionType] = (actionsByType[actionType] || 0) + 1;
    }
    
    // Подсчёт посещений URL
    if (entry.url) {
      const shortUrl = entry.url.length > 50 ? entry.url.substring(0, 50) + '...' : entry.url;
      urlVisits[shortUrl] = (urlVisits[shortUrl] || 0) + 1;
    }
    
    // Timeline
    timeline.push({
      index: index + 1,
      timestamp: entry.timestamp || '',
      action: actionType || 'unknown',
      success: entry.success !== false
    });
  });
  
  // Формируем HTML
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Отчёт: ${testName} - Шаг ${stepIndex}</title>
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
    color: #1a202c;
  }
  
  .container {
    max-width: 1400px;
    margin: 0 auto;
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }
  
  .header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 30px;
    text-align: center;
  }
  
  .header h1 {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  
  .header p {
    font-size: 16px;
    opacity: 0.9;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    padding: 30px;
    background: #f7fafc;
  }
  
  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    transition: transform 0.2s;
  }
  
  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }
  
  .stat-card .value {
    font-size: 36px;
    font-weight: 700;
    color: #667eea;
    margin-bottom: 8px;
  }
  
  .stat-card .label {
    font-size: 14px;
    color: #718096;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .section {
    padding: 30px;
  }
  
  .section-title {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 20px;
    color: #2d3748;
    border-bottom: 3px solid #667eea;
    padding-bottom: 10px;
  }
  
  .chart-container {
    background: white;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 30px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .table-container {
    overflow-x: auto;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  thead {
    background: #f7fafc;
  }
  
  th {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    color: #4a5568;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #e2e8f0;
  }
  
  td {
    padding: 12px 16px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 14px;
  }
  
  tr:hover {
    background: #f7fafc;
  }
  
  .success-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    background: #c6f6d5;
    color: #22543d;
  }
  
  .error-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    background: #fed7d7;
    color: #742a2a;
  }
  
  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .bar-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .bar-label {
    min-width: 150px;
    font-size: 14px;
    font-weight: 500;
    color: #4a5568;
  }
  
  .bar-container {
    flex: 1;
    height: 32px;
    background: #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    position: relative;
  }
  
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
    color: white;
    font-size: 12px;
    font-weight: 600;
    transition: width 0.5s ease;
  }
  
  .timeline {
    position: relative;
    padding-left: 30px;
  }
  
  .timeline::before {
    content: '';
    position: absolute;
    left: 10px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #e2e8f0;
  }
  
  .timeline-item {
    position: relative;
    padding: 16px 0;
    padding-left: 30px;
  }
  
  .timeline-item::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 20px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #667eea;
    border: 3px solid white;
    box-shadow: 0 0 0 2px #667eea;
  }
  
  .timeline-item.error::before {
    background: #f56565;
    box-shadow: 0 0 0 2px #f56565;
  }
  
  .timeline-content {
    background: #f7fafc;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
  }
  
  .timeline-time {
    font-size: 12px;
    color: #718096;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Отчёт адаптивного шага</h1>
    <p>${testName} - Шаг ${stepIndex} (${isAuto ? 'Автоматический' : 'Одно действие'})</p>
  </div>
  
  <div class="stats-grid">
    <div class="stat-card">
      <div class="value">${stats.iterations || runHistory.length}</div>
      <div class="label">Итераций</div>
    </div>
    <div class="stat-card">
      <div class="value">${stats.actionsInvoked || runHistory.length}</div>
      <div class="label">Действий выполнено</div>
    </div>
    <div class="stat-card">
      <div class="value">${(stats.errors || []).length}</div>
      <div class="label">Ошибок</div>
    </div>
    <div class="stat-card">
      <div class="value">${Object.keys(urlVisits).length}</div>
      <div class="label">Уникальных URL</div>
    </div>
    <div class="stat-card">
      <div class="value">${stats.fieldsFilled || 0}</div>
      <div class="label">Полей заполнено</div>
    </div>
    <div class="stat-card">
      <div class="value">${Math.round((runHistory.filter(e => e.success !== false).length / runHistory.length) * 100)}%</div>
      <div class="label">Успешность</div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">Распределение действий</h2>
    <div class="chart-container">
      <div class="bar-chart">
        ${Object.entries(actionsByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
          const maxCount = Math.max(...Object.values(actionsByType));
          const percentage = (count / maxCount) * 100;
          return `
            <div class="bar-item">
              <div class="bar-label">${type}</div>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${percentage}%">${count}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  </div>
  
  ${Object.keys(urlVisits).length > 0 ? `
  <div class="section">
    <h2 class="section-title">Посещённые страницы</h2>
    <div class="chart-container">
      <div class="bar-chart">
        ${Object.entries(urlVisits).sort((a, b) => b[1] - a[1]).map(([url, count]) => {
          const maxCount = Math.max(...Object.values(urlVisits));
          const percentage = (count / maxCount) * 100;
          return `
            <div class="bar-item">
              <div class="bar-label" style="min-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${url}">${url}</div>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${percentage}%">${count}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  </div>
  ` : ''}
  
  <div class="section">
    <h2 class="section-title">Детальная история (${runHistory.length} записей)</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            ${isAuto ? '<th>Итерация</th>' : '<th>Попытка</th>'}
            <th>Действие</th>
            ${isAuto ? '<th>Тип кнопки</th><th>Текст кнопки</th>' : '<th>Селектор</th><th>Значение</th>'}
            <th>Время</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${runHistory.map((entry, index) => {
            const isSuccess = entry.success !== false;
            const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('ru-RU') : '';
            
            if (isAuto) {
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${entry.iteration || '-'}</td>
                  <td><strong>${entry.action || '-'}</strong></td>
                  <td>${entry.buttonType || '-'}</td>
                  <td>${entry.buttonText || entry.fillTarget || entry.dialogText || '-'}</td>
                  <td>${time}</td>
                  <td>${isSuccess ? '<span class="success-badge">✓ Успех</span>' : '<span class="error-badge">✗ Ошибка</span>'}</td>
                </tr>
              `;
            } else {
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${entry.attempt || index + 1}</td>
                  <td><strong>${entry.actionType || '-'}</strong> ${entry.subtype ? `(${entry.subtype})` : ''}</td>
                  <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${entry.selector || '-'}">${entry.selector || '-'}</td>
                  <td>${entry.enteredValue || entry.selectedOption || entry.value || '-'}</td>
                  <td>${time}</td>
                  <td>${isSuccess ? '<span class="success-badge">✓ Успех</span>' : '<span class="error-badge">✗ Ошибка</span>'}</td>
                </tr>
              `;
            }
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
  // Анимация появления графиков
  window.addEventListener('load', () => {
    const bars = document.querySelectorAll('.bar-fill');
    bars.forEach((bar, index) => {
      setTimeout(() => {
        bar.style.width = bar.style.width; // Trigger animation
      }, index * 50);
    });
  });
</script>
</body>
</html>`;
}


})();
