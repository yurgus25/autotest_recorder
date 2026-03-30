/**
 * AutoTest Recorder - Player Module
 * Table and drag-and-drop handlers
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-table-drag
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-table-drag.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleTable = async function(action) {
  const subtype = action.subtype || 'table-get-cell-value';
  
  switch (subtype) {
    case 'table-get-cell-value':
    case 'table-get-cell-text': {
      // Получить значение/текст ячейки
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const rowIndex = parseInt(action.rowIndex ?? action.row ?? 0);
      const columnIndex = parseInt(action.columnIndex ?? action.column ?? 0);
      
      if (rowIndex < 0 || columnIndex < 0) {
        throw new Error('Индексы строки и столбца должны быть >= 0');
      }
      
      const rows = table.querySelectorAll('tr');
      if (rowIndex >= rows.length) {
        throw new Error(`Строка ${rowIndex} не найдена (всего строк: ${rows.length})`);
      }
      
      const cells = rows[rowIndex].querySelectorAll('td, th');
      if (columnIndex >= cells.length) {
        throw new Error(`Столбец ${columnIndex} не найден (всего столбцов: ${cells.length})`);
      }
      
      const cell = cells[columnIndex];
      const value = (cell.textContent || '').trim();
      
      // Сохраняем в переменную если указана
      const variableName = action.variableName || action.saveToVariable;
      if (variableName) {
        this.userVariables[variableName] = value;
        console.log(`✅ Значение ячейки [${rowIndex}][${columnIndex}] сохранено в переменную ${variableName}: "${value}"`);
      } else {
        console.log(`✅ Значение ячейки [${rowIndex}][${columnIndex}]: "${value}"`);
      }
      break;
    }
    
    case 'table-click-cell': {
      // Кликнуть на ячейку
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const rowIndex = parseInt(action.rowIndex ?? action.row ?? 0);
      const columnIndex = parseInt(action.columnIndex ?? action.column ?? 0);
      
      const rows = table.querySelectorAll('tr');
      if (rowIndex >= rows.length) {
        throw new Error(`Строка ${rowIndex} не найдена`);
      }
      
      const cells = rows[rowIndex].querySelectorAll('td, th');
      if (columnIndex >= cells.length) {
        throw new Error(`Столбец ${columnIndex} не найден`);
      }
      
      const cell = cells[columnIndex];
      cell.click();
      console.log(`✅ Клик по ячейке [${rowIndex}][${columnIndex}]`);
      break;
    }
    
    case 'table-get-row': {
      // Получить всю строку как массив значений
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const rowIndex = parseInt(action.rowIndex ?? action.row ?? 0);
      const rows = table.querySelectorAll('tr');
      
      if (rowIndex >= rows.length) {
        throw new Error(`Строка ${rowIndex} не найдена`);
      }
      
      const cells = rows[rowIndex].querySelectorAll('td, th');
      const rowData = Array.from(cells).map(cell => (cell.textContent || '').trim());
      
      const variableName = action.variableName || action.saveToVariable;
      if (variableName) {
        this.userVariables[variableName] = rowData;
        console.log(`✅ Строка ${rowIndex} сохранена в переменную ${variableName}:`, rowData);
      }
      break;
    }
    
    case 'table-get-column': {
      // Получить весь столбец как массив значений
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const columnIndex = parseInt(action.columnIndex ?? action.column ?? 0);
      const rows = table.querySelectorAll('tr');
      const columnData = [];
      
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        if (columnIndex < cells.length) {
          columnData.push((cells[columnIndex].textContent || '').trim());
        }
      }
      
      const variableName = action.variableName || action.saveToVariable;
      if (variableName) {
        this.userVariables[variableName] = columnData;
        console.log(`✅ Столбец ${columnIndex} сохранен в переменную ${variableName}:`, columnData);
      }
      break;
    }
    
    case 'table-get-row-count': {
      // Получить количество строк
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const rows = table.querySelectorAll('tr');
      const rowCount = rows.length;
      
      const variableName = action.variableName || action.saveToVariable;
      if (variableName) {
        this.userVariables[variableName] = rowCount;
        console.log(`✅ Количество строк (${rowCount}) сохранено в переменную ${variableName}`);
      } else {
        console.log(`✅ Количество строк: ${rowCount}`);
      }
      break;
    }
    
    case 'table-get-column-count': {
      // Получить количество столбцов
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const firstRow = table.querySelector('tr');
      if (!firstRow) {
        throw new Error('В таблице нет строк');
      }
      
      const cells = firstRow.querySelectorAll('td, th');
      const columnCount = cells.length;
      
      const variableName = action.variableName || action.saveToVariable;
      if (variableName) {
        this.userVariables[variableName] = columnCount;
        console.log(`✅ Количество столбцов (${columnCount}) сохранено в переменную ${variableName}`);
      } else {
        console.log(`✅ Количество столбцов: ${columnCount}`);
      }
      break;
    }
    
    case 'table-assert-cell-value': {
      // Проверить значение ячейки
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const rowIndex = parseInt(action.rowIndex ?? action.row ?? 0);
      const columnIndex = parseInt(action.columnIndex ?? action.column ?? 0);
      const expectedValue = this.substituteVariables(action.expectedValue || action.value || '');
      
      const rows = table.querySelectorAll('tr');
      if (rowIndex >= rows.length) {
        throw new Error(`Assertion failed: строка ${rowIndex} не найдена`);
      }
      
      const cells = rows[rowIndex].querySelectorAll('td, th');
      if (columnIndex >= cells.length) {
        throw new Error(`Assertion failed: столбец ${columnIndex} не найден`);
      }
      
      const actualValue = (cells[columnIndex].textContent || '').trim();
      
      if (actualValue !== expectedValue) {
        throw new Error(
          `Assertion failed: ожидалось "${expectedValue}", получено "${actualValue}" в ячейке [${rowIndex}][${columnIndex}]`
        );
      }
      
      console.log(`✅ Assert passed: ячейка [${rowIndex}][${columnIndex}] = "${actualValue}"`);
      break;
    }
    
    case 'table-assert-row-count': {
      // Проверить количество строк
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const rows = table.querySelectorAll('tr');
      const actualCount = rows.length;
      const expectedCount = parseInt(action.expectedCount || action.count || action.value || 0);
      
      if (actualCount !== expectedCount) {
        throw new Error(
          `Assertion failed: ожидалось ${expectedCount} строк, получено ${actualCount}`
        );
      }
      
      console.log(`✅ Assert passed: количество строк = ${actualCount}`);
      break;
    }
    
    case 'table-find-row': {
      // Найти строку по содержимому
      const tableSelector = action.selector?.value || action.selector?.selector;
      if (!tableSelector) {
        throw new Error('Не указан селектор таблицы');
      }
      
      const table = document.querySelector(tableSelector);
      if (!table) {
        throw new Error(`Таблица не найдена: ${tableSelector}`);
      }
      
      const searchText = this.substituteVariables(action.searchText || action.text || action.value || '');
      const columnIndex = action.columnIndex !== undefined ? parseInt(action.columnIndex) : null;
      
      const rows = table.querySelectorAll('tr');
      let foundRowIndex = -1;
      
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td, th');
        
        if (columnIndex !== null) {
          // Поиск в конкретном столбце
          if (columnIndex < cells.length) {
            const cellText = (cells[columnIndex].textContent || '').trim();
            if (cellText.includes(searchText)) {
              foundRowIndex = i;
              break;
            }
          }
        } else {
          // Поиск во всех столбцах
          for (const cell of cells) {
            const cellText = (cell.textContent || '').trim();
            if (cellText.includes(searchText)) {
              foundRowIndex = i;
              break;
            }
          }
          if (foundRowIndex !== -1) break;
        }
      }
      
      if (foundRowIndex === -1) {
        throw new Error(`Строка с текстом "${searchText}" не найдена`);
      }
      
      const variableName = action.variableName || action.saveToVariable || 'foundRowIndex';
      this.userVariables[variableName] = foundRowIndex;
      console.log(`✅ Строка с текстом "${searchText}" найдена: индекс ${foundRowIndex}`);
      break;
    }
    
    default:
      throw new Error(`Неподдерживаемый подтип table: ${subtype}`);
  }
}

/**
 * Обработчик drag-and-drop операций
 */
TestPlayer.prototype.handleDrag = async function(action) {
  const subtype = action.subtype || 'drag-and-drop';
  
  switch (subtype) {
    case 'drag-and-drop': {
      // Перетащить элемент на другой элемент
      const sourceSelector = action.selector?.value || action.selector?.selector;
      if (!sourceSelector) {
        throw new Error('Не указан селектор элемента для перетаскивания');
      }
      
      const targetSelector = action.targetSelector || action.target;
      if (!targetSelector) {
        throw new Error('Не указан селектор целевого элемента');
      }
      
      const sourceElement = document.querySelector(sourceSelector);
      if (!sourceElement) {
        throw new Error(`Элемент для перетаскивания не найден: ${sourceSelector}`);
      }
      
      const targetElement = document.querySelector(targetSelector);
      if (!targetElement) {
        throw new Error(`Целевой элемент не найден: ${targetSelector}`);
      }
      
      await this.simulateDragAndDrop(sourceElement, targetElement);
      console.log(`✅ Элемент перетащен: ${sourceSelector} → ${targetSelector}`);
      break;
    }
    
    case 'drag-by-offset': {
      // Перетащить элемент на X, Y пикселей
      const sourceSelector = action.selector?.value || action.selector?.selector;
      if (!sourceSelector) {
        throw new Error('Не указан селектор элемента');
      }
      
      const sourceElement = document.querySelector(sourceSelector);
      if (!sourceElement) {
        throw new Error(`Элемент не найден: ${sourceSelector}`);
      }
      
      const offsetX = parseInt(action.offsetX || action.x || 0);
      const offsetY = parseInt(action.offsetY || action.y || 0);
      
      await this.simulateDragByOffset(sourceElement, offsetX, offsetY);
      console.log(`✅ Элемент перетащен на (${offsetX}, ${offsetY})`);
      break;
    }
    
    case 'drag-to-coordinates': {
      // Перетащить элемент в конкретные координаты
      const sourceSelector = action.selector?.value || action.selector?.selector;
      if (!sourceSelector) {
        throw new Error('Не указан селектор элемента');
      }
      
      const sourceElement = document.querySelector(sourceSelector);
      if (!sourceElement) {
        throw new Error(`Элемент не найден: ${sourceSelector}`);
      }
      
      const targetX = parseInt(action.targetX || action.x || 0);
      const targetY = parseInt(action.targetY || action.y || 0);
      
      await this.simulateDragToCoordinates(sourceElement, targetX, targetY);
      console.log(`✅ Элемент перетащен в координаты (${targetX}, ${targetY})`);
      break;
    }
    
    case 'drag-start': {
      // Начать перетаскивание (без drop)
      const sourceSelector = action.selector?.value || action.selector?.selector;
      if (!sourceSelector) {
        throw new Error('Не указан селектор элемента');
      }
      
      const sourceElement = document.querySelector(sourceSelector);
      if (!sourceElement) {
        throw new Error(`Элемент не найден: ${sourceSelector}`);
      }
      
      this.dispatchDragEvent(sourceElement, 'dragstart');
      console.log(`✅ Начато перетаскивание: ${sourceSelector}`);
      break;
    }
    
    case 'drag-over': {
      // Навести при перетаскивании
      const targetSelector = action.selector?.value || action.selector?.selector || action.targetSelector;
      if (!targetSelector) {
        throw new Error('Не указан селектор элемента');
      }
      
      const targetElement = document.querySelector(targetSelector);
      if (!targetElement) {
        throw new Error(`Элемент не найден: ${targetSelector}`);
      }
      
      this.dispatchDragEvent(targetElement, 'dragover');
      this.dispatchDragEvent(targetElement, 'dragenter');
      console.log(`✅ Dragover: ${targetSelector}`);
      break;
    }
    
    case 'drop': {
      // Отпустить элемент
      const targetSelector = action.selector?.value || action.selector?.selector || action.targetSelector;
      if (!targetSelector) {
        throw new Error('Не указан селектор элемента');
      }
      
      const targetElement = document.querySelector(targetSelector);
      if (!targetElement) {
        throw new Error(`Элемент не найден: ${targetSelector}`);
      }
      
      this.dispatchDragEvent(targetElement, 'drop');
      this.dispatchDragEvent(targetElement, 'dragend');
      console.log(`✅ Drop: ${targetSelector}`);
      break;
    }
    
    default:
      throw new Error(`Неподдерживаемый подтип drag: ${subtype}`);
  }
}

/**
 * Симуляция drag-and-drop между двумя элементами
 */
TestPlayer.prototype.simulateDragAndDrop = async function(sourceElement, targetElement) {
  const sourceRect = sourceElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  
  const dataTransfer = new DataTransfer();
  
  // 1. dragstart на source
  this.dispatchDragEvent(sourceElement, 'dragstart', {
    clientX: sourceRect.left + sourceRect.width / 2,
    clientY: sourceRect.top + sourceRect.height / 2,
    dataTransfer
  });
  
  await this.wait(100);
  
  // 2. dragenter и dragover на target
  this.dispatchDragEvent(targetElement, 'dragenter', {
    clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2,
    dataTransfer
  });
  
  this.dispatchDragEvent(targetElement, 'dragover', {
    clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2,
    dataTransfer
  });
  
  await this.wait(100);
  
  // 3. drop на target
  this.dispatchDragEvent(targetElement, 'drop', {
    clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2,
    dataTransfer
  });
  
  // 4. dragend на source
  this.dispatchDragEvent(sourceElement, 'dragend', {
    clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2,
    dataTransfer
  });
}

/**
 * Симуляция drag на указанное смещение
 */
TestPlayer.prototype.simulateDragByOffset = async function(sourceElement, offsetX, offsetY) {
  const sourceRect = sourceElement.getBoundingClientRect();
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = startX + offsetX;
  const endY = startY + offsetY;
  
  const dataTransfer = new DataTransfer();
  
  // dragstart
  this.dispatchDragEvent(sourceElement, 'dragstart', {
    clientX: startX,
    clientY: startY,
    dataTransfer
  });
  
  await this.wait(100);
  
  // dragover на конечную позицию
  const targetElement = document.elementFromPoint(endX, endY) || sourceElement;
  this.dispatchDragEvent(targetElement, 'dragover', {
    clientX: endX,
    clientY: endY,
    dataTransfer
  });
  
  await this.wait(100);
  
  // drop
  this.dispatchDragEvent(targetElement, 'drop', {
    clientX: endX,
    clientY: endY,
    dataTransfer
  });
  
  // dragend
  this.dispatchDragEvent(sourceElement, 'dragend', {
    clientX: endX,
    clientY: endY,
    dataTransfer
  });
}

/**
 * Симуляция drag в конкретные координаты
 */
TestPlayer.prototype.simulateDragToCoordinates = async function(sourceElement, targetX, targetY) {
  const sourceRect = sourceElement.getBoundingClientRect();
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  
  const dataTransfer = new DataTransfer();
  
  // dragstart
  this.dispatchDragEvent(sourceElement, 'dragstart', {
    clientX: startX,
    clientY: startY,
    dataTransfer
  });
  
  await this.wait(100);
  
  // dragover и drop на целевые координаты
  const targetElement = document.elementFromPoint(targetX, targetY) || sourceElement;
  this.dispatchDragEvent(targetElement, 'dragover', {
    clientX: targetX,
    clientY: targetY,
    dataTransfer
  });
  
  await this.wait(100);
  
  this.dispatchDragEvent(targetElement, 'drop', {
    clientX: targetX,
    clientY: targetY,
    dataTransfer
  });
  
  this.dispatchDragEvent(sourceElement, 'dragend', {
    clientX: targetX,
    clientY: targetY,
    dataTransfer
  });
}

/**
 * Отправка drag события
 */
TestPlayer.prototype.dispatchDragEvent = function(element, eventType, options = {}) {
  const dragEvent = new DragEvent(eventType, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: options.clientX || 0,
    clientY: options.clientY || 0,
    dataTransfer: options.dataTransfer || new DataTransfer()
  });
  
  element.dispatchEvent(dragEvent);
}

/**
 * Обработчик работы с датапикерами
 */
})();
