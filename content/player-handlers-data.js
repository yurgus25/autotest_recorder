/**
 * AutoTest Recorder - Player Module
 * Data action handlers: cookie, clipboard, network
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-data
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-data.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleCookie = async function(action) {
  const subtype = action.subtype || '';
  if (subtype === 'get-cookies') {
    const cookies = document.cookie || '';
    console.log(`🍪 Cookies: ${cookies || '(пусто)'}`);
    
    // ИСПРАВЛЕНИЕ #13: Сохраняем cookies в переменную если указана
    if (action.variableName) {
      this.userVariables[action.variableName] = cookies;
      console.log(`✅ Cookies сохранены в переменную: ${action.variableName}`);
    }
    return;
  }

  const rawCookie = String(action.value || '').trim();
  if (!rawCookie) {
    throw new Error('Для cookie-шага не задано значение (ожидается "name=value")');
  }
  const hasPath = /;\s*path=/i.test(rawCookie);
  const cookieString = hasPath ? rawCookie : `${rawCookie}; path=/`;
  document.cookie = cookieString;
  await this.delay(50);
  console.log('✅ Cookie установлен');
}

/**
 * Обработчик clipboard операций
 */
TestPlayer.prototype.handleClipboard = async function(action) {
  const subtype = action.subtype || '';
  
  switch (subtype) {
    case 'clipboard-copy': {
      // Копировать текст из элемента
      const findResult = await this.findElementWithRetry(action.selector, 5, 300);
      const element = findResult?.element;
      
      if (!element) {
        throw new Error(`Элемент не найден для копирования: ${this.formatSelector(action.selector)}`);
      }
      
      const text = element.value || element.textContent || element.innerText || '';
      
      // Пробуем использовать Clipboard API
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          console.log(`📋 Текст скопирован в буфер (${text.length} символов): ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        } else {
          throw new Error('Clipboard API недоступен');
        }
      } catch (clipError) {
        // Fallback на execCommand для HTTP страниц
        console.warn('⚠️ Clipboard API failed, используем execCommand:', clipError.message);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (!success) {
          throw new Error('Не удалось скопировать текст (Clipboard API и execCommand недоступны)');
        }
        console.log(`📋 Текст скопирован через execCommand (${text.length} символов)`);
      }
      break;
    }
    
    case 'clipboard-paste': {
      // Вставить текст из буфера в элемент
      const findResult = await this.findElementWithRetry(action.selector, 5, 300);
      const element = findResult?.element;
      
      if (!element) {
        throw new Error(`Элемент не найден для вставки: ${this.formatSelector(action.selector)}`);
      }
      
      let text = '';
      
      // Пробуем использовать Clipboard API
      try {
        if (navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        } else {
          throw new Error('Clipboard API недоступен');
        }
      } catch (clipError) {
        // Fallback на execCommand
        console.warn('⚠️ Clipboard API failed, используем execCommand:', clipError.message);
        const textArea = document.createElement('textarea');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        const success = document.execCommand('paste');
        if (success) {
          text = textArea.value;
        }
        document.body.removeChild(textArea);
        
        if (!text) {
          throw new Error('Не удалось прочитать буфер обмена (требуются права или HTTPS)');
        }
      }
      
      // Вставляем текст в элемент
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.isContentEditable) {
        element.textContent = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        element.textContent = text;
      }
      
      console.log(`📋 Текст вставлен из буфера (${text.length} символов): ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      break;
    }
    
    case 'clipboard-get': {
      // Получить текст из буфера в переменную
      if (!action.variableName) {
        throw new Error('Не указано имя переменной для сохранения текста из буфера');
      }
      
      let text = '';
      
      try {
        if (navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        } else {
          throw new Error('Clipboard API недоступен');
        }
      } catch (clipError) {
        console.warn('⚠️ Clipboard API failed:', clipError.message);
        throw new Error('Не удалось прочитать буфер обмена (требуются права или HTTPS)');
      }
      
      this.userVariables[action.variableName] = text;
      console.log(`📋 Текст из буфера сохранён в переменную ${action.variableName} (${text.length} символов): ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      break;
    }
    
    case 'clipboard-set': {
      // Установить текст в буфер
      const text = this.substituteVariables(action.text || action.value || '');
      
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          console.log(`📋 Текст установлен в буфер (${text.length} символов): ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        } else {
          throw new Error('Clipboard API недоступен');
        }
      } catch (clipError) {
        // Fallback на execCommand
        console.warn('⚠️ Clipboard API failed, используем execCommand:', clipError.message);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (!success) {
          throw new Error('Не удалось установить текст в буфер');
        }
        console.log(`📋 Текст установлен в буфер через execCommand (${text.length} символов)`);
      }
      break;
    }
    
    default:
      throw new Error(`Неподдерживаемый подтип clipboard: ${subtype}`);
  }
}

/**
 * Обработчик network операций
 */
TestPlayer.prototype.handleNetwork = async function(action) {
  const subtype = action.subtype || '';
  
  switch (subtype) {
    case 'network-wait-request': {
      // Ожидание конкретного запроса
      const urlPattern = action.urlPattern || action.value;
      if (!urlPattern) {
        throw new Error('Не указан URL pattern для ожидания запроса');
      }
      
      const timeout = action.timeout || 10000;
      const startTime = Date.now();
      
      // Начать мониторинг
      await chrome.runtime.sendMessage({ type: 'NETWORK_START_MONITORING' });
      
      console.log(`🌐 Ожидание запроса: ${urlPattern} (timeout: ${timeout}ms)`);
      
      // Polling для проверки
      while (Date.now() - startTime < timeout) {
        const response = await chrome.runtime.sendMessage({
          type: 'NETWORK_GET_REQUESTS',
          tabId: this.tabId
        });
        
        const requests = response?.requests || [];
        const matched = requests.find(r => 
          this.matchUrlPattern(r.url, urlPattern) &&
          r.status === 'completed'
        );
        
        if (matched) {
          console.log(`✅ Запрос найден: ${matched.url} (${matched.duration}ms, статус ${matched.statusCode})`);
          
          // Сохранить в переменную если нужно
          if (action.variableName || action.saveToVariable) {
            const varName = action.variableName || action.saveToVariable;
            this.userVariables[varName] = {
              url: matched.url,
              method: matched.method,
              statusCode: matched.statusCode,
              duration: matched.duration,
              timestamp: matched.timestamp
            };
            console.log(`📦 Данные запроса сохранены в переменную: ${varName}`);
          }
          
          return;
        }
        
        await this.delay(100); // Polling interval
      }
      
      throw new Error(`Timeout: запрос ${urlPattern} не найден за ${timeout}ms`);
    }
    
    case 'network-wait-idle': {
      // Ожидание завершения всех запросов
      const idleTime = action.idleTime || 500; // ms без новых запросов
      const timeout = action.timeout || 10000;
      const startTime = Date.now();
      
      console.log(`🌐 Ожидание network idle (${idleTime}ms без запросов, timeout: ${timeout}ms)`);
      
      let lastRequestTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        const response = await chrome.runtime.sendMessage({
          type: 'NETWORK_GET_REQUESTS',
          tabId: this.tabId
        });
        
        const requests = response?.requests || [];
        
        // Найти последний запрос
        const latestRequest = requests.reduce((latest, r) => 
          (!latest || r.timestamp > latest.timestamp) ? r : latest
        , null);
        
        if (latestRequest && latestRequest.timestamp > lastRequestTime) {
          lastRequestTime = latestRequest.timestamp;
        }
        
        // Проверка idle
        if (Date.now() - lastRequestTime >= idleTime) {
          console.log(`✅ Network idle: ${idleTime}ms без новых запросов`);
          return;
        }
        
        await this.delay(100);
      }
      
      throw new Error(`Timeout: сеть не стала idle за ${timeout}ms`);
    }
    
    case 'network-assert-request': {
      // Проверка что запрос был выполнен
      const urlPattern = action.urlPattern || action.value;
      if (!urlPattern) {
        throw new Error('Не указан URL pattern для проверки запроса');
      }
      
      const response = await chrome.runtime.sendMessage({
        type: 'NETWORK_GET_REQUESTS',
        tabId: this.tabId
      });
      
      const requests = response?.requests || [];
      const matched = requests.find(r => 
        this.matchUrlPattern(r.url, urlPattern)
      );
      
      if (!matched) {
        throw new Error(`Assertion failed: запрос ${urlPattern} не найден в истории`);
      }
      
      // Проверка статуса если указан
      const expectedStatus = action.expectedStatus || action.status;
      if (expectedStatus !== undefined && matched.statusCode !== parseInt(expectedStatus)) {
        throw new Error(
          `Assertion failed: ожидался статус ${expectedStatus}, получен ${matched.statusCode} для ${matched.url}`
        );
      }
      
      console.log(`✅ Assert passed: ${matched.url} (статус ${matched.statusCode}, ${matched.duration}ms)`);
      break;
    }
    
    case 'network-assert-status': {
      // Проверка статуса последнего запроса по pattern
      const urlPattern = action.urlPattern || action.value;
      const expectedStatus = action.expectedStatus || action.status;
      
      if (!urlPattern || expectedStatus === undefined) {
        throw new Error('Не указан URL pattern или expectedStatus для проверки');
      }
      
      const response = await chrome.runtime.sendMessage({
        type: 'NETWORK_GET_REQUESTS',
        tabId: this.tabId
      });
      
      const requests = response?.requests || [];
      const matched = requests.find(r => 
        this.matchUrlPattern(r.url, urlPattern)
      );
      
      if (!matched) {
        throw new Error(`Assertion failed: запрос ${urlPattern} не найден`);
      }
      
      if (matched.statusCode !== parseInt(expectedStatus)) {
        throw new Error(
          `Assertion failed: ожидался статус ${expectedStatus}, получен ${matched.statusCode}`
        );
      }
      
      console.log(`✅ Assert status passed: ${matched.url} имеет статус ${matched.statusCode}`);
      break;
    }
    
    default:
      throw new Error(`Неподдерживаемый подтип network: ${subtype}`);
  }
}

/**
 * Проверка соответствия URL паттерну (regex или glob)
 */
TestPlayer.prototype.matchUrlPattern = function(url, pattern) {
  if (!pattern) return false;
  
  // Поддержка regex (/pattern/)
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(url);
    } catch (e) {
      console.warn('⚠️ Неверный regex pattern:', pattern, e.message);
      return false;
    }
  }
  
  // Поддержка glob patterns (* и ?)
  const escapedPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*')                  // * → .*
    .replace(/\?/g, '.');                  // ? → .
  
  try {
    const globRegex = new RegExp('^' + escapedPattern + '$');
    return globRegex.test(url);
  } catch (e) {
    console.warn('⚠️ Неверный glob pattern:', pattern, e.message);
    return false;
  }
}

/**
 * Обработчик работы с таблицами
 */
})();
