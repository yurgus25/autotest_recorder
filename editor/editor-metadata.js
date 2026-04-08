/**
 * AutoTest Recorder - Editor Module
 * Metadata render, export menu, API/OpenAPI import
 * 
 * Loaded after editor-core.js. Extends TestEditor.prototype.
 * @module editor-metadata
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-metadata.js] TestEditor not found. Load editor-core.js first.');
    return;
  }

TestEditor.prototype.renderMetadata = function() {
  const metadataEl = document.getElementById('testMetadata');
  if (!metadataEl || !this.test) return;

  const createdAt = this.test.createdAt ? this.formatDateTime(this.test.createdAt) : this.t('editorUI.notSpecified');
  const updatedAt = this.test.updatedAt ? this.formatDateTime(this.test.updatedAt) : this.t('editorUI.notSpecified');
  
  let editedBy = this.t('editorUI.notSpecified');
  let editedByIcon = '👤';
  
  if (this.test.lastEditedBy) {
    switch (this.test.lastEditedBy) {
      case 'optimization':
        editedBy = this.t('editorUI.optimization');
        editedByIcon = '⚡';
        break;
      case 'user':
        editedBy = this.t('editorUI.user');
        editedByIcon = '👤';
        break;
      default:
        editedBy = this.test.lastEditedBy;
    }
  } else {
    const hasOptimization = this.test.actions?.some(a => a.optimizationMeta || a.hiddenReason);
    editedBy = hasOptimization ? this.t('editorUI.optimization') : this.t('editorUI.user');
    editedByIcon = hasOptimization ? '⚡' : '👤';
  }

  let groupBlock = '';
  if (this.testGroupContext) {
    const g = this.testGroupContext;
    const groupName = this.escapeHtml(g.group.name || this.t('editorUI.unnamedGroup') || 'Group');
    const posLabel = `${g.index} ${this.t('editorUI.of')} ${g.total}`;
    const prevLabel = g.prevTestName
      ? `<a href="#" class="editor-group-nav" data-test-id="${this.escapeHtml(g.prevTestId)}" title="${this.t('editorUI.openTest')}">${this.escapeHtml(g.prevTestName)}</a>`
      : (this.t('editorUI.groupNoPrev') || '—');
    const nextLabel = g.nextTestName
      ? `<a href="#" class="editor-group-nav" data-test-id="${this.escapeHtml(g.nextTestId)}" title="${this.t('editorUI.openTest')}">${this.escapeHtml(g.nextTestName)}</a>`
      : (this.t('editorUI.groupNoNext') || '—');
    groupBlock = `
      <div class="metadata-group-context">
        <span class="metadata-label">🧩 ${this.t('editorUI.groupInGroup') || 'Группа'}: ${groupName}</span>
        <span class="metadata-value">${posLabel}</span>
        <div class="metadata-group-nav">
          <span class="metadata-label">${this.t('editorUI.groupPrev') || 'Предыдущий'}:</span> ${prevLabel}
          <span class="metadata-label" style="margin-left: 12px;">${this.t('editorUI.groupNext') || 'Следующий'}:</span> ${nextLabel}
        </div>
      </div>
    `;
  }

  metadataEl.innerHTML = `
    <div class="metadata-grid">
      <div class="metadata-item">
        <span class="metadata-label">📅 ${this.t('editorUI.created')}</span>
        <span class="metadata-value">${createdAt}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">🔄 ${this.t('editorUI.updated')}</span>
        <span class="metadata-value">${updatedAt}</span>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">${editedByIcon} ${this.t('editorUI.editedBy')}</span>
        <span class="metadata-value">${editedBy}</span>
      </div>
    </div>
    ${groupBlock}
  `;

  metadataEl.querySelectorAll('.editor-group-nav').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('data-test-id');
      if (id) {
        const url = new URL(window.location.href);
        url.searchParams.set('testId', id);
        window.location.href = url.toString();
      }
    });
  });
}

/**
 * Экспортирует тест в JSON файл
 */
/**
 * Перегенерирует селектор для действия
 */
TestEditor.prototype.regenerateSelector = async function(index) {
  const action = this.test.actions[index];
  if (!action) return;

  const selectorStr = this.getSelectorInfo(action.selector);
  
  try {
    // Отправляем сообщение в content script для поиска элемента and перегенерации селектора
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      this.showToast(this.t('editorUI.couldNotFindActiveTab'), 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      type: 'REGENERATE_SELECTOR',
      selector: selectorStr,
      actionIndex: index
    });

    if (response && response.success && response.newSelector) {
      // Обновляем селектор в действии
      action.selector = response.newSelector;
      action.selectorRegenerated = true;
      action.selectorRegeneratedAt = new Date().toISOString();
      
      this.renderActions();
      this.showToast(this.t('editorUI.selectorRegenerated'), 'success');
    } else {
      this.showToast(response?.error || this.t('editorUI.failedToRegenerateSelector'), 'error');
    }
  } catch (error) {
    console.error('Ошибка при перегенерации селектора:', error);
    this.showToast(this.t('editorUI.regenerationError'), 'error');
  }
}

/**
 * Копирует селектор в буфер обмена
 */
TestEditor.prototype.copySelector = async function(index) {
  const action = this.test.actions[index];
  if (!action) return;

  const selectorStr = this.getSelectorInfo(action.selector);
  
  try {
    await this.copyToClipboard(selectorStr);
    this.showToast(this.t('editorUI.selectorCopied'), 'success');
  } catch (error) {
    console.error('Ошибка при копировании селектора:', error);
    this.showToast(this.t('editorUI.failedToCopySelector'), 'error');
  }
}

/**
 * Находит элемент на странице and подсвечивает его
 */
TestEditor.prototype.findOnPage = async function(index) {
  const action = this.test.actions[index];
  if (!action) return;

  const selectorStr = this.getSelectorInfo(action.selector);
  
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
      this.showToast(response?.error || this.t('editorUI.elementNotFoundError'), 'error');
    }
  } catch (error) {
    console.error('Ошибка при поиске элемента:', error);
    this.showToast(this.t('editorUI.findElementError'), 'error');
  }
}

TestEditor.prototype.exportTest = function() {
  if (!this.test) {
    alert(this.t('editorUI.testNotLoaded'));
    return;
  }

  // Показываем меню выбора формата экспорта
  this.showExportMenu();
}

TestEditor.prototype.showExportMenu = function() {
  // Упрощенное меню - только экспорт в JSON
  this.exportToJSON();
}

TestEditor.prototype.performExport = function(format) {
  try {
    if (format === 'json') {
      this.exportToJSON();
    } else {
      this.showToast(this.t('editorUI.exportUnavailable'), 'warning');
    }
  } catch (error) {
    console.error('Ошибка при экспорте:', error);
    this.showToast(this.t('editorUI.exportError2') + ': ' + error.message, 'error');
  }
}

TestEditor.prototype.exportToJSON = function() {
  try {
    // Подготавливаем данные для экспорта (включая все необходимые поля для импорта)
    const exportData = {
      id: this.test.id,
      name: this.test.name || 'Unnamed Test',
      createdAt: this.test.createdAt || new Date().toISOString(),
      updatedAt: this.test.updatedAt || new Date().toISOString(),
      lastEditedBy: this.test.lastEditedBy || 'user',
      actions: this.test.actions || [],
      variables: this.test.variables || {}, // Добавляем переменные для возможности импорта
      optimization: this.test.optimization || {},
      preconditions: this.test.preconditions || [],
      url: this.test.url || ''
    };
    // Расширение: эталоны визуальной регрессии и др. (при импорте можно опционально отбрасывать)
    if (this.test.extensionAssets && typeof this.test.extensionAssets === 'object' && Object.keys(this.test.extensionAssets).length > 0) {
      exportData.extensionAssets = JSON.parse(JSON.stringify(this.test.extensionAssets));
    }

    // Проверяем структуру перед экспортом
    if (!exportData.actions || !Array.isArray(exportData.actions)) {
      throw new Error(this.t('editorUI.fileNotContainsActionsArray'));
    }

    if (!exportData.name) {
      throw new Error(this.t('editorUI.fileNotContainsName'));
    }

    // Форматируем JSON с отступами для читаемости
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Создаём blob and скачиваем файл
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Генерируем имя файла из названия теста and даты
    const safeName = (exportData.name || 'test')
      .replace(/[^a-zа-яё0-9]/gi, '_')
      .substring(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `autotest_${safeName}_${dateStr}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ Тест экспортирован:', link.download);
    this.showToast(this.t('editorUI.testExportedJson'), 'success');
  } catch (error) {
    console.error('❌ Ошибка при экспорте теста:', error);
    alert(this.t('editorUI.exportError') + ':\n' + error.message);
  }
}

/**
 * Импортирует тест из JSON файла
 */
TestEditor.prototype.importTest = function() {
  try {
    // Создаем скрытый input для выбора файла
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }
      
      try {
        const fileContent = await file.text();
        const importedData = JSON.parse(fileContent);
        
        // Валидация импортированных данных
        if (!importedData.name) {
          throw new Error(this.t('editorUI.fileNotContainsName'));
        }
        
        if (!importedData.actions || !Array.isArray(importedData.actions)) {
          throw new Error(this.t('editorUI.fileNotContainsActionsArray'));
        }
        
        // Подтверждение импорта
        const confirmMessage = this.t('editorUI.importTestConfirm', {
          name: importedData.name,
          actions: importedData.actions.length,
          variables: Object.keys(importedData.variables || {}).length
        });
        
        if (!confirm(confirmMessage)) {
          return;
        }
        
        // Создаем новый тест на основе импортированных данных
        const newTest = {
          name: importedData.name || 'Imported Test',
          actions: importedData.actions || [],
          variables: importedData.variables || {},
          optimization: importedData.optimization || {},
          preconditions: importedData.preconditions || [],
          url: importedData.url || '',
          createdAt: importedData.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastEditedBy: importedData.lastEditedBy || 'user'
        };
        // extensionAssets: визуальные эталоны и др.; при «чистом» импорте шаринга можно не передавать в JSON
        if (importedData.extensionAssets && typeof importedData.extensionAssets === 'object') {
          newTest.extensionAssets = JSON.parse(JSON.stringify(importedData.extensionAssets));
        }
        
        // Сохраняем тест через background
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_TEST',
          test: newTest
        });
        
        if (response && response.success) {
          // Загружаем импортированный тест
          await this.loadTest(response.testId);
          this.showToast(this.t('editorUI.testImportedSuccess', { name: newTest.name }), 'success');
        } else {
          throw new Error(response?.error || this.t('editorUI.importSaveError'));
        }
      } catch (error) {
        console.error('❌ Ошибка при импорте теста:', error);
        alert(this.t('editorUI.importError') + ':\n' + error.message);
      } finally {
        // Удаляем input после использования
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      }
    });
    
    document.body.appendChild(input);
    input.click();
  } catch (error) {
    console.error('❌ Ошибка при создании диалога импорта:', error);
    this.showToast(this.t('editorUI.importDialogError') + ': ' + error.message, 'error');
  }
}

/**
 * Показывает модальное окно импорта API
 */
TestEditor.prototype.showImportApiModal = function() {
  const modal = document.getElementById('importApiModal');
  if (modal) {
    modal.style.display = 'flex';
    // Сбрасываем состояние
    document.getElementById('apiSpecFile').value = '';
    document.getElementById('apiImportInfo').style.display = 'none';
    document.getElementById('apiEndpointsList').style.display = 'none';
    document.getElementById('apiImportOptions').style.display = 'none';
    document.getElementById('importApiBtn').disabled = true;
    this.apiParser = null;
    this.selectedEndpoints = [];
  }
}

/**
 * Закрывает модальное окно импорта API
 */
TestEditor.prototype.closeImportApiModal = function() {
  const modal = document.getElementById('importApiModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Обрабатывает выбор файла спецификации
 */
TestEditor.prototype.handleApiSpecFileSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const fileContent = await file.text();
    
    // Создаем парсер
    this.apiParser = new OpenAPIParser();
    const spec = await this.apiParser.parse(fileContent);
    
    // Отображаем информацию о спецификации
    this.displayApiSpecInfo(spec);
    
    // Извлекаем эндпоинты
    const endpoints = this.apiParser.extractEndpoints();
    this.displayApiEndpoints(endpoints);
    
    // Показываем опции импорта
    document.getElementById('apiImportOptions').style.display = 'block';
    document.getElementById('importApiBtn').disabled = false;
    
  } catch (error) {
    console.error('❌ Ошибка при парсинге спецификации:', error);
    this.showToast(this.t('editorUI.specParseError') + ': ' + error.message, 'error');
    document.getElementById('apiImportInfo').style.display = 'none';
    document.getElementById('apiEndpointsList').style.display = 'none';
    document.getElementById('apiImportOptions').style.display = 'none';
  }
}

/**
 * Отображает информацию о спецификации
 */
TestEditor.prototype.displayApiSpecInfo = function(spec) {
  const infoContainer = document.getElementById('apiSpecInfo');
  const infoDiv = document.getElementById('apiImportInfo');
  
  const title = this.decodeUnicode(spec.info.title || 'N/A');
  const description = this.decodeUnicode(spec.info.description || this.t('editorUI.noDescription'));
  
  // Ограничиваем длину описания для отображения
  const maxDescriptionLength = 500;
  const isDescriptionLong = description.length > maxDescriptionLength;
  const shortDescription = isDescriptionLong ? description.substring(0, maxDescriptionLength) + '...' : description;
  
  infoContainer.innerHTML = `
    <p><strong>${this.t('editorUI.versionLabel')}</strong> ${spec.openapi || 'N/A'}</p>
    <p><strong>${this.t('editorUI.titleLabel')}</strong> ${this.escapeHtml(title)}</p>
    <p><strong>${this.t('editorUI.apiVersionLabel')}</strong> ${spec.info.version || 'N/A'}</p>
    <p><strong>${this.t('editorUI.descriptionLabel')}</strong></p>
    <div style="max-height: 150px; overflow-y: auto; padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 4px; font-size: 12px; line-height: 1.5;">
      <div style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;">${this.escapeHtml(description)}</div>
    </div>
    <p style="margin-top: 8px;"><strong>${this.t('editorUI.serversLabel')}</strong> ${spec.servers.length > 0 ? spec.servers.map(s => s.url).join(', ') : this.t('editorUI.notSpecifiedPlural')}</p>
    <p><strong>${this.t('editorUI.endpointsLabel')}</strong> ${this.apiParser.extractEndpoints().length}</p>
  `;
  
  infoDiv.style.display = 'block';
}

/**
 * Декодирует Unicode escape-последовательности в строке
 * @param {string} str - Строка с Unicode escape-последовательностями
 * @returns {string} Декодированная строка
 */
TestEditor.prototype.decodeUnicode = function(str) {
  if (!str || typeof str !== 'string') return str;
  
  try {
    // Заменяем Unicode escape-последовательности вида \uXXXX
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  } catch (e) {
    // Если ошибка, возвращаем исходную строку
    return str;
  }
}

/**
 * Переключает выбор всех эндпоинтов
 */
TestEditor.prototype.toggleSelectAllEndpoints = function() {
  const container = document.getElementById('apiEndpointsContainer');
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  const selectAllBtn = document.getElementById('selectAllEndpoints');
  
  // Проверяем, все ли выбраны
  const allSelected = Array.from(checkboxes).every(cb => cb.checked);
  
  // Переключаем состояние всех чекбоксов
  checkboxes.forEach(cb => {
    cb.checked = !allSelected;
    const index = parseInt(cb.value);
    
    if (!allSelected) {
      // Выбираем все
      if (!this.selectedEndpoints.includes(index)) {
        this.selectedEndpoints.push(index);
      }
    } else {
      // Снимаем выбор со всех
      this.selectedEndpoints = this.selectedEndpoints.filter(i => i !== index);
    }
  });
  
  // Обновляем текст кнопки
  selectAllBtn.textContent = allSelected ? this.t('editorUI.selectAll') : this.t('editorUI.deselectAll');
  
  // Обновляем состояние кнопки импорта
  document.getElementById('importApiBtn').disabled = this.selectedEndpoints.length === 0;
}

/**
 * Отображает список эндпоинтов для выбора
 */
TestEditor.prototype.displayApiEndpoints = function(endpoints) {
  const container = document.getElementById('apiEndpointsContainer');
  const listDiv = document.getElementById('apiEndpointsList');
  
  container.innerHTML = '';
  this.selectedEndpoints = [];
  
  // Сбрасываем текст кнопки "Выбрать все"
  document.getElementById('selectAllEndpoints').textContent = this.t('editorUI.selectAll');
  
    endpoints.forEach((endpoint, index) => {
    const endpointDiv = document.createElement('div');
    endpointDiv.className = 'api-endpoint-item';
    endpointDiv.style.cssText = 'padding: 8px; margin: 4px 0; border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: flex-start; gap: 12px; min-height: 40px;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `endpoint-${index}`;
    checkbox.value = index;
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.selectedEndpoints.push(index);
      } else {
        this.selectedEndpoints = this.selectedEndpoints.filter(i => i !== index);
      }
      document.getElementById('importApiBtn').disabled = this.selectedEndpoints.length === 0;
    });
    
    const methodBadge = document.createElement('span');
    methodBadge.textContent = endpoint.method;
    methodBadge.style.cssText = `padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; background: ${this.getMethodColor(endpoint.method)}; color: white;`;
    
    const pathSpan = document.createElement('span');
    pathSpan.textContent = endpoint.path;
    pathSpan.style.cssText = 'flex: 1; font-family: monospace; min-width: 0; white-space: normal; word-wrap: break-word;';
    
    const summarySpan = document.createElement('span');
    const summaryText = this.decodeUnicode(endpoint.summary || endpoint.operationId || '');
    summarySpan.textContent = summaryText;
    summarySpan.title = summaryText; // Полный текст при наведении
    summarySpan.className = 'api-endpoint-summary';
    summarySpan.style.cssText = 'flex: 2; color: #666; font-size: 12px; white-space: normal; word-wrap: break-word; overflow-wrap: break-word; min-width: 0; line-height: 1.4;';
    
    endpointDiv.appendChild(checkbox);
    endpointDiv.appendChild(methodBadge);
    endpointDiv.appendChild(pathSpan);
    endpointDiv.appendChild(summarySpan);
    
    container.appendChild(endpointDiv);
  });
  
  listDiv.style.display = 'block';
}

/**
 * Возвращает цвет для метода HTTP
 */
TestEditor.prototype.getMethodColor = function(method) {
  const colors = {
    'GET': '#61affe',
    'POST': '#49cc90',
    'PUT': '#fca130',
    'DELETE': '#f93e3e',
    'PATCH': '#50e3c2',
    'HEAD': '#9012fe',
    'OPTIONS': '#0d5aa7'
  };
  return colors[method] || '#666';
}

/**
 * Импортирует выбранные эндпоинты как API шаги
 */
TestEditor.prototype.importSelectedApiEndpoints = async function() {
  if (!this.apiParser || this.selectedEndpoints.length === 0) {
    this.showToast(this.t('editorUI.selectAtLeastOne'), 'error');
    return;
  }

  try {
    const endpoints = this.apiParser.extractEndpoints();
    const generateTestData = document.getElementById('apiGenerateTestData').checked;
    const validateResponse = document.getElementById('apiValidateResponse').checked;
    const saveResponse = document.getElementById('apiSaveResponse').checked;
    const baseUrl = document.getElementById('apiBaseUrl').value.trim();
    
    // Если указан базовый URL, обновляем серверы
    if (baseUrl) {
      this.apiParser.servers = [{ url: baseUrl }];
    }
    
    // Извлекаем and создаем переменные из спецификации
    const extractedVariables = this.apiParser.extractVariables();
    const createdVars = this.createVariablesFromSpec(extractedVariables);
    
    const newActions = [];
    
    for (const index of this.selectedEndpoints) {
      const endpoint = endpoints[index];
      const action = this.createApiActionFromEndpoint(endpoint, generateTestData, validateResponse, saveResponse, extractedVariables);
      newActions.push(action);
    }
    
    // Добавляем действия к текущему тесту
    if (!this.test.actions) {
      this.test.actions = [];
    }
    
    this.test.actions.push(...newActions);
    
    // Извлекаем переменные из созданных действий and добавляем их в переменные сценария
    this.extractVariablesFromActions(newActions);
    
    // Обновляем кэш allTestsVariables перед сохранением
    const currentTestKey = String(this.test.id);
    if (!this.allTestsVariables) {
      this.allTestsVariables = {};
    }
    if (!this.allTestsVariables[currentTestKey]) {
      this.allTestsVariables[currentTestKey] = {
        name: this.test.name,
        variables: {}
      };
    }
    // Синхронизируем переменные с кэшем
    this.allTestsVariables[currentTestKey].variables = { ...(this.test.variables || {}) };
    console.log(`🔄 [API Import] Обновлен кэш переменных для теста ${currentTestKey}:`, Object.keys(this.allTestsVariables[currentTestKey].variables));
    console.log(`📦 [API Import] Переменные в this.test.variables:`, Object.keys(this.test.variables || {}));
    
    // Сохраняем тест
    await this.saveTest();
    
    // Перезагружаем переменные всех тестов для актуальности
    await this.loadAllTestsVariables();
    
    // Перерисовываем действия
    this.renderActions();
    
    // Перерисовываем панель переменных, чтобы показать новые переменные
    this.renderVariablesPanel();
    
    // Закрываем модальное окно
    this.closeImportApiModal();
    
    this.showToast(this.t('editorUI.apiStepsImportSuccess', { count: newActions.length }), 'success');
    
  } catch (error) {
    console.error('❌ Ошибка при импорте API шагов:', error);
    this.showToast(this.t('editorUI.apiStepsImportError2') + ': ' + error.message, 'error');
  }
}

/**
 * Создает переменные из спецификации
 * @param {Array} extractedVariables - Массив извлеченных переменных
 * @returns {Object} Статистика создания переменных
 */
TestEditor.prototype.createVariablesFromSpec = function(extractedVariables) {
  if (!this.test.variables) {
    this.test.variables = {};
  }

  let createdCount = 0;
  let updatedCount = 0;
  const createdVars = [];

  for (const varInfo of extractedVariables) {
    if (!this.test.variables[varInfo.name]) {
      // Создаем новую переменную
      this.test.variables[varInfo.name] = {
        name: varInfo.name,
        value: varInfo.value || '',
        description: varInfo.description || '',
        source: varInfo.source || 'api',
        global: false
      };
      createdCount++;
      createdVars.push(varInfo.name);
      console.log(`✅ [API Import] Создана переменная: ${varInfo.name} = "${varInfo.value || ''}"`);
    } else {
      // Обновляем существующую переменную, если есть значение
      if (varInfo.value && !this.test.variables[varInfo.name].value) {
        this.test.variables[varInfo.name].value = varInfo.value;
        updatedCount++;
        console.log(`🔄 [API Import] Обновлена переменная: ${varInfo.name} = "${varInfo.value}"`);
      }
      // Обновляем описание, если оно лучше
      if (varInfo.description && (!this.test.variables[varInfo.name].description || this.test.variables[varInfo.name].description.length < varInfo.description.length)) {
        this.test.variables[varInfo.name].description = varInfo.description;
      }
    }
  }

  if (createdCount > 0 || updatedCount > 0) {
    console.log(`✅ [API Import] Итого: создано переменных: ${createdCount}, обновлено: ${updatedCount}`);
    console.log(`   Все переменные в тесте:`, Object.keys(this.test.variables));
  } else {
    console.warn(`⚠️ [API Import] Переменные не были созданы. Извлеченные переменные:`, extractedVariables.map(v => v.name));
  }

  return { createdCount, updatedCount, createdVars };
}

/**
 * Извлекает переменные из действий and добавляет их в переменные сценария
 * @param {Array} actions - Массив действий для анализа
 */
TestEditor.prototype.extractVariablesFromActions = function(actions) {
  if (!actions || actions.length === 0) return;
  
  if (!this.test.variables) {
    this.test.variables = {};
  }
  
  const foundVars = new Set();
  
  // Функция для извлечения переменных из строки
  const extractVarsFromString = (str) => {
    if (!str || typeof str !== 'string') return;
    const matches = str.matchAll(/\{var:([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
    for (const match of matches) {
      foundVars.add(match[1]);
    }
    const matchesAlt = str.matchAll(/\$\{([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
    for (const match of matchesAlt) {
      foundVars.add(match[1]);
    }
  };
  
  // Проходим по всем действиям
  for (const action of actions) {
    // Извлекаем переменные из API действий
    if (action.type === 'api' && action.api) {
      // URL
      if (action.api.url) {
        extractVarsFromString(action.api.url);
      }
      
      // Заголовки (могут быть объектом или JSON строкой)
      if (action.api.headers) {
        if (typeof action.api.headers === 'string') {
          extractVarsFromString(action.api.headers);
        } else if (typeof action.api.headers === 'object') {
          // Преобразуем объект в строку для поиска переменных
          extractVarsFromString(JSON.stringify(action.api.headers));
        }
      }
      
      // Тело запроса (может быть объектом или JSON строкой)
      if (action.api.body) {
        if (typeof action.api.body === 'string') {
          extractVarsFromString(action.api.body);
        } else if (typeof action.api.body === 'object') {
          // Преобразуем объект в строку для поиска переменных
          extractVarsFromString(JSON.stringify(action.api.body));
        }
      }
      
      // Переменная для сохранения ответа
      if (action.api.responseVariable) {
        foundVars.add(action.api.responseVariable);
      }
    }
    
    // Извлекаем переменные из других типов действий
    if (action.type === 'variable' && action.variable) {
      if (action.variable.name) {
        foundVars.add(action.variable.name);
      }
      if (action.variable.value) {
        extractVarsFromString(action.variable.value);
      }
      if (action.variable.expression) {
        extractVarsFromString(action.variable.expression);
      }
    }

    if (action.type === 'setVariable') {
      if (action.variableName) {
        foundVars.add(action.variableName);
      }
      if (action.variableValue) {
        extractVarsFromString(action.variableValue);
      }
      if (action.variable?.value) {
        extractVarsFromString(action.variable.value);
      }
    }

    if (action.value && typeof action.value === 'string') {
      extractVarsFromString(action.value);
    }
    if (action.url && typeof action.url === 'string') {
      extractVarsFromString(action.url);
    }
    
    // Извлекаем переменные из условий
    if (action.type === 'condition' && action.condition) {
      if (action.condition.expression) {
        extractVarsFromString(action.condition.expression);
      }
    }
    
    // Извлекаем переменные из циклов
    if (action.type === 'loop' && action.loop) {
      if (action.loop.variable) {
        foundVars.add(action.loop.variable);
      }
      if (action.loop.expression) {
        extractVarsFromString(action.loop.expression);
      }
    }
    
    // Рекурсивно обрабатываем вложенные действия (then/else в условиях, действия в циклах)
    if (action.then && Array.isArray(action.then)) {
      this.extractVariablesFromActions(action.then);
    }
    if (action.else && Array.isArray(action.else)) {
      this.extractVariablesFromActions(action.else);
    }
    if (action.loop && action.loop.actions && Array.isArray(action.loop.actions)) {
      this.extractVariablesFromActions(action.loop.actions);
    }
  }
  
  // Добавляем найденные переменные в переменные сценария, если их там еще нет
  let addedCount = 0;
  for (const varName of foundVars) {
    if (!this.test.variables[varName]) {
      this.test.variables[varName] = {
        name: varName,
        value: '',
        description: 'Variable extracted from actions',
        source: 'action',
        global: false
      };
      addedCount++;
      console.log(`✅ [API Import] Добавлена переменная из действий: ${varName}`);
    }
  }
  
  if (addedCount > 0) {
    console.log(`✅ [API Import] Извлечено переменных из действий: ${addedCount}`);
    console.log(`   Переменные: ${Array.from(foundVars).join(', ')}`);
    this.updateScenarioVariablesPanel();
  }
}

TestEditor.prototype.getUsedVariablesFromActions = function(actions) {
  const usedVars = new Set();
  if (!actions || actions.length === 0) return usedVars;

  const extractVarsFromString = (str) => {
    if (!str || typeof str !== 'string') return;
    const matches = str.matchAll(/\{var:([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
    for (const match of matches) {
      usedVars.add(match[1]);
    }
    const matchesAlt = str.matchAll(/\$\{([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\}/g);
    for (const match of matchesAlt) {
      usedVars.add(match[1]);
    }
  };

  const walkActions = (items) => {
    if (!Array.isArray(items)) return;
    for (const action of items) {
      if (!action) continue;

      if (action.type === 'api' && action.api) {
        if (action.api.url) extractVarsFromString(action.api.url);
        if (action.api.headers) extractVarsFromString(typeof action.api.headers === 'string' ? action.api.headers : JSON.stringify(action.api.headers));
        if (action.api.body) extractVarsFromString(typeof action.api.body === 'string' ? action.api.body : JSON.stringify(action.api.body));
        if (action.api.responseVariable) usedVars.add(action.api.responseVariable);
      }

      if (action.type === 'variable' && action.variable) {
        if (action.variable.name) usedVars.add(action.variable.name);
        if (action.variable.value) extractVarsFromString(action.variable.value);
        if (action.variable.expression) extractVarsFromString(action.variable.expression);
      }

      if (action.type === 'setVariable') {
        if (action.variableName) usedVars.add(action.variableName);
        if (action.variableValue) extractVarsFromString(action.variableValue);
        if (action.variable?.value) extractVarsFromString(action.variable.value);
      }

      if (action.value && typeof action.value === 'string') extractVarsFromString(action.value);
      if (action.url && typeof action.url === 'string') extractVarsFromString(action.url);

      if (action.type === 'condition' && action.condition?.expression) {
        extractVarsFromString(action.condition.expression);
      }
      if (action.type === 'loop' && action.loop) {
        if (action.loop.variable) usedVars.add(action.loop.variable);
        if (action.loop.expression) extractVarsFromString(action.loop.expression);
      }

      if (action.then && Array.isArray(action.then)) {
        walkActions(action.then);
      }
      if (action.else && Array.isArray(action.else)) {
        walkActions(action.else);
      }
      if (action.loop && action.loop.actions && Array.isArray(action.loop.actions)) {
        walkActions(action.loop.actions);
      }
    }
  };

  walkActions(actions);
  return usedVars;
}

/**
 * Выполняет один API запрос
 * @param {Object} action - Действие API
 * @param {number|string} index - Индекс действия
 */
TestEditor.prototype.executeApiAction = async function(action, index) {
  if (!action || action.type !== 'api' || !action.api) {
    this.showToast(this.t('editorUI.invalidApiActionError'), 'error');
    return;
  }

  const api = action.api;
  const method = api.method || 'GET';
  let url = api.url || '';

  if (!url) {
    this.showToast(this.t('editorUI.specifyApiUrl'), 'error');
    return;
  }

  try {
    // Обрабатываем переменные в URL
    if (url.includes('{var:') || url.includes('{date}') || url.includes('{time}') || url.includes('{counter:')) {
      // Получаем переменные из теста
      const variables = this.test.variables || {};
      url = await this.processVariablesInString(url, variables);
    }

    // Валидация URL
    try {
      new URL(url);
    } catch (urlError) {
      this.showToast(this.t('editorUI.invalidUrl', { url: url }), 'error');
      return;
    }

    // Обрабатываем заголовки
    let headers = api.headers || {};
    const processedHeaders = {};
    if (Object.keys(headers).length > 0) {
      const variables = this.test.variables || {};
      for (const [key, value] of Object.entries(headers)) {
        const headerValue = String(value);
        if (headerValue.includes('{var:') || headerValue.includes('{date}') || headerValue.includes('{time}') || headerValue.includes('{counter:')) {
          processedHeaders[key] = await this.processVariablesInString(headerValue, variables);
        } else {
          processedHeaders[key] = headerValue;
        }
      }
    }

    // Обрабатываем тело запроса
    let body = api.body || null;
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      const variables = this.test.variables || {};
      if (typeof body === 'string') {
        if (body.includes('{var:') || body.includes('{date}') || body.includes('{time}') || body.includes('{counter:')) {
          body = await this.processVariablesInString(body, variables);
        }
      } else if (typeof body === 'object') {
        // Рекурсивно обрабатываем объект
        body = await this.processVariablesInObject(body, variables);
      }
    }

    this.showToast(this.t('editorUI.executingRequest', { method: method }), 'info');

    // Отправляем запрос через background script
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      method: method,
      url: url,
      headers: processedHeaders,
      body: body
    });

    if (response && response.success) {
      const statusText = response.statusText || 'OK';
      const statusCode = response.status || 200;
      this.showToast(this.t('editorUI.requestSuccess', { code: statusCode, status: statusText }), 'success');
      console.log('✅ [API Execute] Ответ:', response.data);
    } else {
      const errorMessage = response?.error || this.t('common.unknownError');
      this.showToast(this.t('editorUI.requestError', { error: errorMessage }), 'error');
      console.error('❌ [API Execute] Ошибка:', errorMessage);
    }
  } catch (error) {
    console.error('❌ [API Execute] Ошибка при выполнении запроса:', error);
    this.showToast(this.t('editorUI.requestError', { error: error.message }), 'error');
  }
}

/**
 * Обрабатывает переменные в строке
 * @param {string} str - Строка с переменными
 * @param {Object} variables - Объект переменных
 * @returns {Promise<string>} Обработанная строка
 */
TestEditor.prototype.processVariablesInString = async function(str, variables) {
  let result = str;
  
  // Обрабатываем {var:name}
  const varMatches = result.matchAll(/\{var:([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
  for (const match of varMatches) {
    const varName = match[1];
    const varValue = variables[varName]?.value || '';
    result = result.replace(match[0], varValue);
  }
  
  // Обрабатываем {date}
  if (result.includes('{date}')) {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    result = result.replace(/\{date\}/g, dateStr);
  }
  
  // Обрабатываем {time}
  if (result.includes('{time}')) {
    const time = new Date();
    const timeStr = time.toISOString();
    result = result.replace(/\{time\}/g, timeStr);
  }
  
  // Обрабатываем {counter:name}
  const counterMatches = result.matchAll(/\{counter:([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
  for (const match of counterMatches) {
    const counterName = match[1];
    if (!this.counters) {
      this.counters = {};
    }
    if (!this.counters[counterName]) {
      this.counters[counterName] = 0;
    }
    this.counters[counterName]++;
    result = result.replace(match[0], String(this.counters[counterName]));
  }
  
  return result;
}

/**
 * Рекурсивно обрабатывает переменные в объекте
 * @param {Object} obj - Объект для обработки
 * @param {Object} variables - Объект переменных
 * @returns {Promise<Object>} Обработанный объект
 */
TestEditor.prototype.processVariablesInObject = async function(obj, variables) {
  if (typeof obj === 'string') {
    return await this.processVariablesInString(obj, variables);
  } else if (Array.isArray(obj)) {
    return await Promise.all(obj.map(item => this.processVariablesInObject(item, variables)));
  } else if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = await this.processVariablesInObject(value, variables);
    }
    return result;
  }
  return obj;
}

/**
 * Создает API действие из эндпоинта
 */
TestEditor.prototype.createApiActionFromEndpoint = function(endpoint, generateTestData, validateResponse, saveResponse, extractedVariables = []) {
  // Генерируем URL с использованием переменных
  // generateUrl уже заменяет path parameters через replacePathParametersWithVariables
  let url = this.apiParser.generateUrl(endpoint, true); // useVariables = true
  
  // Дополнительно обрабатываем path parameters для гарантии замены всех переменных
  // Это нужно на случай, если параметры не были в списке endpoint.parameters
  if (endpoint.parameters) {
    url = this.apiParser.replaceUrlWithVariables(url, extractedVariables, endpoint.parameters);
  } else {
    // Если параметров нет в endpoint.parameters, но они есть в пути, заменяем напрямую
    url = this.apiParser.replaceUrlWithVariables(url, extractedVariables, []);
  }
  
  let headers = this.apiParser.generateHeaders(endpoint);
  
  // Заменяем значения в заголовках на переменные
  if (extractedVariables.length > 0) {
    headers = this.apiParser.replaceHeadersWithVariables(headers, extractedVariables);
  }
  
  // Генерируем тело запроса
  let body = null;
  if (endpoint.requestBody && generateTestData) {
    body = this.apiParser.generateRequestBody(endpoint.requestBody);
  }
  
  // Генерируем схему валидации ответа
  let responseValidation = null;
  if (validateResponse && endpoint.responses && typeof endpoint.responses === 'object') {
    try {
      responseValidation = this.apiParser.generateResponseValidation(endpoint.responses);
    } catch (error) {
      console.warn('⚠️ [API Import] Ошибка при генерации схемы валидации:', error);
      // Продолжаем без валидации
      responseValidation = null;
    }
  }
  
  // Генерируем имя переменной для ответа
  const responseVariable = saveResponse ? 
    `api_${endpoint.operationId || endpoint.method.toLowerCase()}_${Date.now()}` : null;
  
  // Извлекаем описание из эндпоинта (summary или description)
  const description = this.decodeUnicode(endpoint.summary || endpoint.description || '');
  
  return {
    type: 'api',
    api: {
      method: endpoint.method,
      url: url,
      headers: headers,
      body: body,
      description: description,
      saveResponse: saveResponse,
      responseVariable: responseVariable,
      responseValidation: responseValidation
    },
    timestamp: Date.now(),
    hidden: false
  };
}

TestEditor.prototype.exportToFramework = function(format) {
  try {
    if (!window.TestExporter) {
      this.showToast(this.t('editorUI.exportModuleNotLoaded'), 'error');
      return;
    }
    
    const exporter = new window.TestExporter();
    const result = exporter.export(this.test, format, {
      fileName: `${this.sanitizeFileName(this.test.name || 'test')}.${this.getFileExtension(format)}`
    });
    
    // Создаём blob and скачиваем файл
    const blob = new Blob([result.code], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Тест экспортирован в ${format}:`, result.fileName);
    this.showToast(this.t('editorUI.testExportedFormat', { format: format.toUpperCase() }), 'success');
  } catch (error) {
    console.error(`❌ Ошибка при экспорте в ${format}:`, error);
    this.showToast(this.t('editorUI.exportError2') + ': ' + error.message, 'error');
  }
}

TestEditor.prototype.sanitizeFileName = function(name) {
  return (name || 'test')
    .replace(/[^a-zа-яё0-9]/gi, '_')
    .substring(0, 50);
}

TestEditor.prototype.getFileExtension = function(format) {
  const extensions = {
    'playwright': 'spec.ts',
    'cypress': 'cy.js',
    'puppeteer': 'js'
  };
  return extensions[format] || 'js';
}

/**
 * Показывает модальное окно для добавления условия
 */
})();
