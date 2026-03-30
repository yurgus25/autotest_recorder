/**
 * AutoTest Recorder - Player Module
 * API requests and variable handlers
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-api
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-api.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleApiRequest = async function(action) {
  const api = action.api || {};
  const method = api.method || 'GET';
  let url = api.url || '';
  let headers = api.headers || {};
  let body = api.body || null;

  try {
    // Обрабатываем переменные в URL, заголовках и теле
    url = await this.processVariables(url);
    
    // Обрабатываем переменные в заголовках
    const processedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      const processedKey = await this.processVariables(key);
      const processedValue = await this.processVariables(String(value));
      processedHeaders[processedKey] = processedValue;
    }
    
    // Обрабатываем переменные в теле запроса
    if (body) {
      if (typeof body === 'string') {
        body = await this.processVariables(body);
        try {
          body = JSON.parse(body);
        } catch (e) {
          // Если не JSON, оставляем как строку
        }
      } else if (typeof body === 'object') {
        // Рекурсивно обрабатываем все строковые значения в объекте
        const processObject = async (obj) => {
          if (typeof obj === 'string') {
            return await this.processVariables(obj);
          } else if (Array.isArray(obj)) {
            return await Promise.all(obj.map(item => processObject(item)));
          } else if (obj && typeof obj === 'object') {
            const processed = {};
            for (const [key, value] of Object.entries(obj)) {
              processed[key] = await processObject(value);
            }
            return processed;
          }
          return obj;
        };
        body = await processObject(body);
      }
    }

    console.log(`🌐 [API] Выполняю ${method} запрос: ${url}`);

    // Выполняем запрос через background script (для обхода CORS)
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      method: method,
      url: url,
      headers: processedHeaders,
      body: body
    });

    if (response && response.success) {
      console.log(`✅ [API] Запрос выполнен успешно`);
      
      const responseData = response.data;
      
      // Валидация ответа по схеме, если указана
      if (api.responseValidation && responseData !== null) {
        const validationResult = this.validateResponse(responseData, api.responseValidation.schema);
        if (!validationResult.valid) {
          console.warn(`⚠️ [API] Ответ не соответствует схеме: ${validationResult.errors.join(', ')}`);
          // Не прерываем выполнение, только предупреждаем
        } else {
          console.log(`✅ [API] Ответ валидирован по схеме`);
        }
      }
      
      // Сохраняем ответ в переменную, если указано
      if (api.saveResponse && api.responseVariable) {
        this.userVariables[api.responseVariable] = responseData;
        console.log(`💾 [API] Ответ сохранен в переменную "${api.responseVariable}"`);
      }
    } else {
      const errorMessage = response?.error || 'Неизвестная ошибка';
      console.error(`❌ [API] Ошибка запроса:`, errorMessage);
      
      // Отправляем сообщение для показа toast
      try {
        chrome.runtime.sendMessage({
          type: 'SHOW_TOAST',
          message: `❌ API ошибка: ${errorMessage}`,
          toastType: 'error'
        }).catch(() => {});
      } catch (e) {}
      
      throw new Error(errorMessage);
    }
  } catch (error) {
    const errorMessage = error?.message || String(error) || 'Неизвестная ошибка';
    console.error(`❌ [API] Ошибка при выполнении запроса:`, errorMessage);
    
    // Отправляем сообщение для показа toast
    try {
      chrome.runtime.sendMessage({
        type: 'SHOW_TOAST',
        message: `❌ API ошибка: ${errorMessage}`,
        toastType: 'error'
      }).catch(() => {});
    } catch (e) {}
    
    throw error;
  }
}

/**
 * Обрабатывает работу с переменными
 */
TestPlayer.prototype.handleVariable = async function(action) {
  const variable = action.variable || {};
  const name = variable.name;
  const operation = variable.operation;

  if (operation === 'collect-data') {
    const variableNames = variable.variableNames || [];
    if (variableNames.length === 0) {
      const exportVars = this.test?.variables ? Object.entries(this.test.variables)
        .filter(([, v]) => v && typeof v === 'object' && v.exportToRow)
        .map(([k]) => k) : [];
      if (exportVars.length > 0) variableNames.push(...exportVars);
    }
    const row = {};
    for (const vn of variableNames) {
      const v = this.userVariables[vn];
      row[vn] = v !== undefined && v !== null ? String(v) : '';
    }
    if (Object.keys(row).length > 0) {
      if (!this.collectedRows) this.collectedRows = [];
      this.collectedRows.push(row);
      if (this.runHistory && !this.runHistory.collectedRows) this.runHistory.collectedRows = [];
      this.runHistory.collectedRows.push(row);
      console.log(`📊 [Variable] collect-data: added row ${this.collectedRows.length}`, row);
    }
    return;
  }

  if (!name) {
    console.warn('⚠️ [Variable] Имя переменной не указано');
    return;
  }

  try {
    let value = null;

    if (operation === 'extract-url') {
      // Извлечение из URL
      const urlSource = variable.urlSource || 'current';
      let url = '';
      
      if (urlSource === 'current') {
        url = window.location.href;
      } else if (urlSource === 'previous') {
        url = this.previousUrl || window.location.href;
      } else if (urlSource === 'custom') {
        url = variable.url || '';
      }

      const patternType = variable.patternType || 'query';
      const pattern = variable.pattern || '';

      if (patternType === 'query') {
        // Извлечение параметра запроса
        try {
          const urlObj = new URL(url);
          value = urlObj.searchParams.get(pattern);
        } catch (e) {
          console.warn(`⚠️ [Variable] Ошибка парсинга URL:`, e);
        }
      } else if (patternType === 'path') {
        // Извлечение сегмента пути
        try {
          const urlObj = new URL(url);
          const segments = urlObj.pathname.split('/').filter(s => s);
          const index = parseInt(pattern) - 1;
          if (index >= 0 && index < segments.length) {
            value = segments[index];
          }
        } catch (e) {
          console.warn(`⚠️ [Variable] Ошибка парсинга пути:`, e);
        }
      } else if (patternType === 'regex') {
        // Извлечение через регулярное выражение
        let regex;
        try {
          regex = new RegExp(pattern);
        } catch (e) {
          console.warn(`⚠️ [Variable] Некорректное регулярное выражение: "${pattern}"`, e);
          return;
        }
        const match = url.match(regex);
        if (match && match[1]) {
          value = match[1];
        }
      }

      console.log(`📝 [Variable] Извлечено из URL "${url}": ${name} = "${value}"`);

    } else if (operation === 'extract-element') {
      // Извлечение из элемента
      const selector = variable.selector || '';
      const extractType = variable.extractType || 'text';
      const textSelection = variable.textSelection; // Информация о выделенном тексте

      if (!selector) {
        console.warn('⚠️ [Variable] Селектор не указан');
        return;
      }

      // ИСПРАВЛЕНИЕ #18: Используем SelectorEngine для консистентности с остальными операциями
      const element = await this.findElementWithRetry(selector, variable);
      if (!element) {
        console.warn(`⚠️ [Variable] Элемент не найден: ${selector}`);
        return;
      }

      if (extractType === 'text') {
        value = element.textContent?.trim() || '';
        
        // Если указана выделенная часть текста, используем её
        // Получаем актуальный текст элемента (он может измениться от теста к тесту)
        if (textSelection && textSelection.startIndex !== undefined && textSelection.endIndex !== undefined) {
          const fullText = value; // Актуальный текст элемента
          const startIndex = textSelection.startIndex;
          const endIndex = textSelection.endIndex;
          
          // Проверяем границы с учетом того, что текст может быть короче
          if (startIndex >= 0 && endIndex > startIndex) {
            if (endIndex <= fullText.length) {
              // Индексы в пределах текста - извлекаем часть
              value = fullText.substring(startIndex, endIndex);
              console.log(`📝 [Variable] Извлечена выделенная часть текста: символы ${startIndex}-${endIndex} из "${fullText}" = "${value}"`);
            } else {
              // Индексы выходят за пределы текста - извлекаем до конца
              value = fullText.substring(startIndex);
              console.warn(`⚠️ [Variable] Индекс конца (${endIndex}) выходит за пределы текста (длина: ${fullText.length}), извлечено до конца: "${value}"`);
            }
          } else {
            console.warn(`⚠️ [Variable] Некорректные индексы выделения: ${startIndex}-${endIndex}, используется полный текст`);
          }
        }
      } else if (extractType === 'value') {
        value = element.value || '';
        
        // Если указана выделенная часть текста, используем её
        if (textSelection && textSelection.startIndex !== undefined && textSelection.endIndex !== undefined) {
          const fullText = value; // Актуальное значение элемента
          const startIndex = textSelection.startIndex;
          const endIndex = textSelection.endIndex;
          
          // Проверяем границы с учетом того, что текст может быть короче
          if (startIndex >= 0 && endIndex > startIndex) {
            if (endIndex <= fullText.length) {
              value = fullText.substring(startIndex, endIndex);
              console.log(`📝 [Variable] Извлечена выделенная часть значения: символы ${startIndex}-${endIndex} из "${fullText}" = "${value}"`);
            } else {
              value = fullText.substring(startIndex);
              console.warn(`⚠️ [Variable] Индекс конца (${endIndex}) выходит за пределы значения (длина: ${fullText.length}), извлечено до конца: "${value}"`);
            }
          }
        }
      } else if (extractType === 'attribute') {
        const attributeName = variable.attributeName || '';
        if (attributeName) {
          value = element.getAttribute(attributeName) || '';
          
          // Если указана выделенная часть текста, используем её
          if (textSelection && textSelection.startIndex !== undefined && textSelection.endIndex !== undefined) {
            const fullText = value; // Актуальное значение атрибута
            const startIndex = textSelection.startIndex;
            const endIndex = textSelection.endIndex;
            
            // Проверяем границы с учетом того, что текст может быть короче
            if (startIndex >= 0 && endIndex > startIndex) {
              if (endIndex <= fullText.length) {
                value = fullText.substring(startIndex, endIndex);
                console.log(`📝 [Variable] Извлечена выделенная часть атрибута: символы ${startIndex}-${endIndex} из "${fullText}" = "${value}"`);
              } else {
                value = fullText.substring(startIndex);
                console.warn(`⚠️ [Variable] Индекс конца (${endIndex}) выходит за пределы атрибута (длина: ${fullText.length}), извлечено до конца: "${value}"`);
              }
            }
          }
        }
      }

      console.log(`📝 [Variable] Извлечено из элемента "${selector}": ${name} = "${value}"`);

    } else if (operation === 'set') {
      // Установка значения
      const setValue = variable.value || '';
      value = await this.processVariables(setValue);
      console.log(`📝 [Variable] Установлено значение: ${name} = "${value}"`);

    } else if (operation === 'calculate') {
      // Вычисление выражения
      const expression = variable.expression || '';
      const processedExpression = await this.processVariables(expression);
      
      // Заменяем {var:имя} на значения переменных для вычисления
      let calcExpression = processedExpression;
      const varRegex = /\{var:([^}]+)\}/g;
      const varMatches = [...calcExpression.matchAll(varRegex)];
      
      for (const match of varMatches) {
        const varName = match[1];
        const varValue = this.userVariables[varName];
        if (varValue !== undefined) {
          calcExpression = calcExpression.replace(match[0], String(varValue));
        }
      }

      const safeVal = this._safeEvaluateArithmetic(calcExpression);
      if (safeVal === undefined) {
        console.error(`❌ [Variable] Ошибка вычисления выражения "${expression}"`);
        return;
      }
      value = safeVal;
      console.log(`📝 [Variable] Вычислено: ${name} = ${expression} = ${value}`);
    }

    // Сохраняем переменную
    if (value !== null && value !== undefined) {
      this.userVariables[name] = value;
      console.log(`✅ [Variable] Переменная "${name}" сохранена: "${value}"`);
    } else {
      console.warn(`⚠️ [Variable] Значение переменной "${name}" пустое`);
    }

  } catch (error) {
    console.error(`❌ [Variable] Ошибка при работе с переменной "${name}":`, error);
  }
}

/**
 * Обновляет переменные из localStorage перед запуском теста
 */
TestPlayer.prototype.updateLocalStorageVariables = async function(variables) {
  const localStorageVars = [];
  
  // Находим все переменные из localStorage
  for (const [varName, varData] of Object.entries(variables)) {
    if (varData && typeof varData === 'object' && varData.source === 'localStorage' && varData.localStorageKey && varData.tabId) {
      localStorageVars.push({
        name: varName,
        key: varData.localStorageKey,
        tabId: varData.tabId
      });
    }
  }
  
  if (localStorageVars.length === 0) {
    return; // Нет переменных из localStorage
  }
  
  console.log(`🔄 [Player] Обновляю ${localStorageVars.length} переменных из localStorage`);
  
  // Группируем по tabId для оптимизации
  const varsByTab = {};
  for (const varInfo of localStorageVars) {
    if (!varsByTab[varInfo.tabId]) {
      varsByTab[varInfo.tabId] = [];
    }
    varsByTab[varInfo.tabId].push(varInfo);
  }
  
  // Обновляем переменные для каждой вкладки
  for (const [tabId, vars] of Object.entries(varsByTab)) {
    try {
      const tabIdNum = parseInt(tabId, 10);
      const currentTab = await chrome.tabs.getCurrent();
      
      // Если переменная из текущей вкладки, получаем напрямую из localStorage
      if (currentTab && currentTab.id === tabIdNum) {
        for (const varInfo of vars) {
          try {
            const value = localStorage.getItem(varInfo.key);
            // Обновляем значение, даже если оно null (это валидное значение в localStorage)
            if (value !== null) {
              variables[varInfo.name].value = value;
              console.log(`✅ [Player] Обновлена переменная "${varInfo.name}" из localStorage текущей вкладки (ключ: ${varInfo.key}, значение: ${value.substring(0, 50) + (value.length > 50 ? '...' : '')})`);
            } else {
              // Если ключ существует, но значение null, все равно обновляем
              // localStorage.getItem возвращает null только если ключ не найден
              // Но мы можем проверить, существует ли ключ
              let keyExists = false;
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  if (localStorage.key(i) === varInfo.key) {
                    keyExists = true;
                    break;
                  }
                }
              } catch (e) {
                // Игнорируем ошибки проверки
              }
              
              if (keyExists) {
                // Ключ существует, но значение null - это валидное значение
                variables[varInfo.name].value = null;
                console.log(`✅ [Player] Обновлена переменная "${varInfo.name}" из localStorage текущей вкладки (ключ: ${varInfo.key}, значение: null)`);
              } else {
                console.warn(`⚠️ [Player] Ключ "${varInfo.key}" не найден в localStorage текущей вкладки`);
              }
            }
          } catch (e) {
            console.warn(`⚠️ [Player] Ошибка при получении "${varInfo.key}" из localStorage: ${e.message}`);
          }
        }
      } else {
        // Если переменная из другой вкладки, запрашиваем через background script
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'GET_LOCAL_STORAGE_FROM_TAB',
            tabId: tabIdNum,
            keys: vars.map(v => v.key)
          });
          
          if (response && response.success && response.data) {
            for (const varInfo of vars) {
              const value = response.data[varInfo.key];
              // Обновляем значение, даже если оно null (это валидное значение)
              if (value !== undefined) {
                variables[varInfo.name].value = value;
                console.log(`✅ [Player] Обновлена переменная "${varInfo.name}" из localStorage вкладки ${tabIdNum} (ключ: ${varInfo.key}, значение: ${value === null ? 'null' : (String(value).substring(0, 50) + (String(value).length > 50 ? '...' : ''))})`);
              } else {
                console.warn(`⚠️ [Player] Ключ "${varInfo.key}" не найден в localStorage вкладки ${tabIdNum}`);
              }
            }
          } else {
            console.warn(`⚠️ [Player] Не удалось получить localStorage с вкладки ${tabIdNum}: ${response?.error || 'Unknown error'}`);
          }
        } catch (messageError) {
          console.warn(`⚠️ [Player] Ошибка при запросе localStorage с вкладки ${tabIdNum}: ${messageError.message}`);
        }
      }
    } catch (error) {
      console.error(`❌ [Player] Ошибка при обновлении переменных из localStorage для вкладки ${tabId}:`, error);
    }
  }
}

/**
 * Обрабатывает действие setVariable - установка переменной из записи
 */
TestPlayer.prototype.handleSetVariable = async function(action) {
  const varName = action.variableName;
  const varValue = action.variableValue;

  if (!varName) {
    console.warn('⚠️ [SetVariable] Имя переменной не указано');
    return;
  }

  try {
    // Устанавливаем переменную в контексте теста
    if (!this.testVariables) {
      this.testVariables = {};
    }

    // Если значение содержит ссылки на другие переменные, подставляем их
    let finalValue = varValue;
    if (typeof varValue === 'string' && varValue.includes('${')) {
      finalValue = this.substituteVariables(varValue);
    }

    this.testVariables[varName] = {
      value: finalValue,
      source: action.source || 'manual',
      timestamp: Date.now()
    };

    // Также сохраняем в текущий тест если он есть
    if (this.currentTest && this.currentTest.variables) {
      this.currentTest.variables[varName] = {
        value: finalValue,
        source: action.source || 'manual'
      };
    }

    console.log(`📦 [SetVariable] Переменная установлена: ${varName} = "${String(finalValue).substring(0, 50)}${String(finalValue).length > 50 ? '...' : ''}"`);

    // Отправляем сообщение в background для сохранения переменной в тест
    try {
      await chrome.runtime.sendMessage({
        type: 'SET_TEST_VARIABLE',
        testId: this.currentTestId,
        variableName: varName,
        variableValue: finalValue,
        source: action.source || 'manual'
      });
    } catch (e) {
      // Игнорируем ошибки отправки
    }

  } catch (error) {
    console.error(`❌ [SetVariable] Ошибка при установке переменной "${varName}":`, error);
  }
}

/**
 * Валидирует ответ API по схеме JSON Schema
 * @param {any} data - Данные для валидации
 * @param {Object} schema - JSON Schema
 * @returns {Object} Результат валидации {valid: boolean, errors: string[]}
 */
TestPlayer.prototype.validateResponse = function(data, schema) {
  const errors = [];
  
  if (!schema) {
    return { valid: true, errors: [] };
  }

  // Обработка $ref
  if (schema.$ref) {
    // В реальной реализации нужно разрешать $ref
    // Для упрощения пропускаем
    return { valid: true, errors: [] };
  }

  // Валидация типа
  if (schema.type) {
    const dataType = Array.isArray(data) ? 'array' : typeof data;
    
    if (schema.type === 'object' && dataType !== 'object') {
      errors.push(`Ожидается объект, получен ${dataType}`);
    } else if (schema.type === 'array' && dataType !== 'array') {
      errors.push(`Ожидается массив, получен ${dataType}`);
    } else if (schema.type === 'string' && dataType !== 'string') {
      errors.push(`Ожидается строка, получен ${dataType}`);
    } else if (schema.type === 'number' && dataType !== 'number') {
      errors.push(`Ожидается число, получен ${dataType}`);
    } else if (schema.type === 'integer' && (dataType !== 'number' || !Number.isInteger(data))) {
      errors.push(`Ожидается целое число, получен ${dataType}`);
    } else if (schema.type === 'boolean' && dataType !== 'boolean') {
      errors.push(`Ожидается булево значение, получен ${dataType}`);
    }
  }

  // Валидация required полей для объектов
  if (schema.type === 'object' && schema.required && Array.isArray(data) === false) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`Отсутствует обязательное поле: ${field}`);
      }
    }
  }

  // Валидация properties для объектов
  if (schema.type === 'object' && schema.properties && Array.isArray(data) === false) {
    for (const [key, value] of Object.entries(data)) {
      if (schema.properties[key]) {
        const propValidation = this.validateResponse(value, schema.properties[key]);
        if (!propValidation.valid) {
          errors.push(`Ошибка в поле "${key}": ${propValidation.errors.join(', ')}`);
        }
      }
    }
  }

  // Валидация items для массивов
  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const itemValidation = this.validateResponse(data[i], schema.items);
      if (!itemValidation.valid) {
        errors.push(`Ошибка в элементе массива [${i}]: ${itemValidation.errors.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}
})();
