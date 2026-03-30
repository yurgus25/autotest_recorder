/**
 * Парсер OpenAPI/Swagger спецификаций
 * Поддерживает YAML и JSON форматы
 */
class OpenAPIParser {
  constructor() {
    this.spec = null;
    this.servers = [];
    this.components = {};
  }

  /**
   * Парсит OpenAPI спецификацию из YAML или JSON
   * @param {string} content - Содержимое файла (YAML или JSON)
   * @returns {Object} Распарсенная спецификация
   */
  async parse(content) {
    try {
      // Пытаемся распарсить как JSON
      try {
        this.spec = JSON.parse(content);
      } catch (e) {
        // Если не JSON, пытаемся распарсить как YAML
        // Для YAML используем простой парсер (можно улучшить с помощью библиотеки js-yaml)
        this.spec = this.parseYAML(content);
      }

      if (!this.spec || typeof this.spec !== 'object') {
        throw new Error('Неверный формат спецификации');
      }

      // Проверяем версию OpenAPI
      const openapiVersion = this.spec.openapi || this.spec.swagger;
      if (!openapiVersion) {
        throw new Error('Не найдена версия OpenAPI/Swagger спецификации');
      }

      // Извлекаем серверы
      this.servers = this.spec.servers || [];
      if (this.spec.host && this.spec.basePath) {
        // Swagger 2.0 формат
        const scheme = this.spec.schemes && this.spec.schemes[0] || 'https';
        this.servers.push({
          url: `${scheme}://${this.spec.host}${this.spec.basePath}`
        });
      }

      // Извлекаем компоненты (schemas, parameters, etc.)
      this.components = this.spec.components || {};

      // Декодируем Unicode escape-последовательности во всех строковых значениях
      this.spec = this.decodeUnicodeRecursive(this.spec);
      this.servers = this.decodeUnicodeRecursive(this.servers);
      this.components = this.decodeUnicodeRecursive(this.components);

      return {
        openapi: openapiVersion,
        info: this.spec.info || {},
        servers: this.servers,
        paths: this.spec.paths || {},
        components: this.components,
        tags: this.spec.tags || []
      };
    } catch (error) {
      console.error('❌ [OpenAPI Parser] Ошибка парсинга:', error);
      throw new Error(`Ошибка парсинга спецификации: ${error.message}`);
    }
  }

  /**
   * Простой парсер YAML (базовая реализация)
   * Для полной поддержки рекомендуется использовать библиотеку js-yaml
   * Использует рекурсивный подход для парсинга вложенных структур
   */
  parseYAML(content) {
    try {
      // Пытаемся использовать встроенный парсер, если доступен
      // Иначе используем упрощенный парсер
      return this.parseYAMLSimple(content);
    } catch (error) {
      throw new Error(`Не удалось распарсить YAML: ${error.message}. Убедитесь, что файл в формате OpenAPI/Swagger`);
    }
  }

  /**
   * Упрощенный парсер YAML для базовых случаев
   */
  parseYAMLSimple(content) {
    // Сначала объединяем строки, которые заканчиваются на обратный слэш
    const lines = content.split('\n');
    const mergedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Объединяем строки, заканчивающиеся на обратный слэш (многострочные строки)
      while (line.trim().endsWith('\\') && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Убираем обратный слэш и пробелы в конце текущей строки
        let trimmedLine = line.replace(/\\\s*$/, '');
        
        // Получаем следующую строку
        // В YAML строках с обратным слэшем следующая строка может начинаться с пробелов
        // которые являются частью форматирования и должны быть удалены
        // Важно: убираем ВСЕ пробелы в начале следующей строки, включая те, что после обратного слэша
        // Это критично для сохранения целостности Unicode escape-последовательностей
        // Сначала убираем все пробелы в начале следующей строки
        let nextLineContent = nextLine.trimStart();
        // Затем убираем начальный обратный слэш и пробелы, если есть
        nextLineContent = nextLineContent.replace(/^\\\s*/, '');
        // Еще раз убираем все пробелы в начале (на случай, если были пробелы после обратного слэша)
        nextLineContent = nextLineContent.trimStart();
        
        // Проверяем, является ли это строкой в кавычках (начинается с кавычки, но не заканчивается)
        // Это важно для правильного объединения Unicode escape-последовательностей
        const quoteMatch = trimmedLine.match(/^[^"']*(["'])/);
        const hasOpenQuote = quoteMatch && (trimmedLine.split(quoteMatch[1]).length - 1) % 2 === 1;
        
        if (hasOpenQuote) {
          // Для строк в кавычках объединяем БЕЗ пробелов между строками
          // Это критично для сохранения целостности Unicode escape-последовательностей типа \uXXXX
          // В YAML строках с обратным слэшем пробелы после обратного слэша на следующей строке
          // являются частью форматирования и должны быть удалены при объединении
          // Убираем ВСЕ пробелы в начале следующей строки после обратного слэша
          nextLineContent = nextLineContent.trimStart();
          // Также убираем пробелы в конце текущей строки перед обратным слэшем, если они есть
          trimmedLine = trimmedLine.replace(/\s+$/, '');
          // КРИТИЧНО: объединяем БЕЗ пробелов, чтобы не разбить Unicode escape-последовательности
          // Например, если было "\u043D\u043E\u0432\ \u043E\u0433\u043E", пробел разобьет последовательность
          line = trimmedLine + nextLineContent;
        } else {
          // Для обычных строк добавляем один пробел между строками, если нужно
          nextLineContent = nextLineContent.trimStart();
          // Добавляем пробел только если текущая строка не заканчивается пробелом
          line = trimmedLine + (trimmedLine.endsWith(' ') ? '' : ' ') + nextLineContent;
        }
        
        i++;
      }
      
      mergedLines.push(line);
    }
    
    const result = {};
    const stack = [{ obj: result, indent: -1 }];

    for (let i = 0; i < mergedLines.length; i++) {
      const line = mergedLines[i];
      const trimmed = line.trim();
      
      // Пропускаем пустые строки и комментарии
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;
      
      // Убираем элементы из стека с большим отступом
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const current = stack[stack.length - 1];
      const colonIndex = trimmed.indexOf(':');
      
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();
        
        // Обработка массивов (начинаются с -)
        if (value === '' && i + 1 < mergedLines.length) {
          const nextLine = mergedLines[i + 1].trim();
          if (nextLine.startsWith('-')) {
            // Это массив
            const array = [];
            let j = i + 1;
            while (j < mergedLines.length) {
              const arrayLine = mergedLines[j].trim();
              if (!arrayLine.startsWith('-')) break;
              
              const arrayValue = arrayLine.substring(1).trim();
              if (arrayValue) {
                array.push(this.parseYAMLValue(arrayValue));
              }
              j++;
            }
            current.obj[key] = array;
            i = j - 1;
            continue;
          }
        }
        
        // Обработка вложенных объектов
        if (value === '') {
          const newObj = {};
          current.obj[key] = newObj;
          stack.push({ obj: newObj, indent: indent });
        } else {
          // Парсим значение, но НЕ декодируем Unicode здесь
          // Декодирование будет выполнено после полного парсинга всего объекта
          current.obj[key] = this.parseYAMLValue(value);
        }
      } else if (trimmed.startsWith('-')) {
        // Элемент массива на верхнем уровне
        const value = trimmed.substring(1).trim();
        if (!Array.isArray(current.obj)) {
          const parentKey = Object.keys(current.obj)[Object.keys(current.obj).length - 1];
          if (parentKey) {
            current.obj[parentKey] = [current.obj[parentKey]];
          }
        }
      }
    }

    // Декодируем Unicode escape-последовательности во всех строковых значениях результата
    // Важно: делаем это ПОСЛЕ полного парсинга, чтобы все строки были объединены
    const decodedResult = this.decodeUnicodeRecursive(result);
    return decodedResult;
  }

  /**
   * Парсит значение YAML
   */
  parseYAMLValue(value) {
    // Проверяем, является ли значение строкой в кавычках
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    
    if (isDoubleQuoted || isSingleQuoted) {
      // Для строк в двойных кавычках используем JSON.parse для правильного декодирования Unicode
      if (isDoubleQuoted) {
        try {
          // JSON.parse правильно декодирует все Unicode escape-последовательности
          // Это самый надежный способ декодирования Unicode в строках
          // Важно: JSON.parse автоматически декодирует все \uXXXX последовательности
          const decoded = JSON.parse(value);
          return decoded;
        } catch (e) {
          // Если не удалось распарсить как JSON (возможно, строка содержит невалидные escape-последовательности),
          // убираем кавычки и декодируем вручную
          let unquotedValue = value.slice(1, -1);
          // Проверяем наличие Unicode escape-последовательностей
          if (unquotedValue.includes('\\u')) {
            unquotedValue = this.decodeUnicode(unquotedValue);
          }
          return unquotedValue;
        }
      } else {
        // Для одинарных кавычек просто убираем кавычки и декодируем Unicode
        let unquotedValue = value.slice(1, -1);
        if (unquotedValue.includes('\\u')) {
          unquotedValue = this.decodeUnicode(unquotedValue);
        }
        return unquotedValue;
      }
    }
    
    // Булевы значения
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    
    // Числа
    if (!isNaN(value) && value !== '' && !value.includes('e') && !value.includes('E')) {
      return Number(value);
    }
    
    // JSON объекты/массивы
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        // Рекурсивно декодируем Unicode в распарсенном JSON
        return this.decodeUnicodeRecursive(parsed);
      } catch (e) {
        // Не JSON, возвращаем как строку
      }
    }
    
    // Для обычных строк проверяем наличие Unicode escape-последовательностей
    if (typeof value === 'string' && value.includes('\\u')) {
      return this.decodeUnicode(value);
    }
    
    return value;
  }

  /**
   * Извлекает все эндпоинты из спецификации
   * @returns {Array} Массив эндпоинтов с методами
   */
  extractEndpoints() {
    const endpoints = [];
    const paths = this.spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
      
      for (const method of methods) {
        if (pathItem[method]) {
          const operation = pathItem[method];
          endpoints.push({
            path: path,
            method: method.toUpperCase(),
            operation: operation,
            summary: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
            description: operation.description || '',
            tags: operation.tags || [],
            parameters: operation.parameters || [],
            requestBody: operation.requestBody,
            responses: operation.responses || {},
            operationId: operation.operationId,
            security: operation.security || this.spec.security || []
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Генерирует URL для эндпоинта
   * @param {Object} endpoint - Объект эндпоинта
   * @param {boolean} useVariables - Использовать переменные вместо реальных значений
   * @returns {string} Полный URL
   */
  generateUrl(endpoint, useVariables = false) {
    let path = endpoint.path;
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Если нужно использовать переменные, возвращаем путь с переменной сервера
    if (useVariables) {
      // Заменяем path parameters на переменные
      path = this.replacePathParametersWithVariables(path, endpoint.parameters || []);
      return `{var:server}${path}`;
    }

    // Иначе генерируем полный URL
    if (this.servers.length === 0) {
      return path;
    }

    const server = this.servers[0];
    let baseUrl = server.url || '';
    
    // Убираем trailing slash
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    return baseUrl + path;
  }

  /**
   * Заменяет path parameters в пути на переменные
   * @param {string} path - Путь с параметрами (например, /draft/{draftId})
   * @param {Array} parameters - Массив параметров эндпоинта
   * @returns {string} Путь с замененными параметрами на переменные
   */
  replacePathParametersWithVariables(path, parameters) {
    let result = path;
    
    // Обрабатываем параметры в формате {paramName} - заменяем на {var:paramName}
    const pathParams = parameters.filter(p => p.in === 'path');
    
    // Сначала заменяем известные параметры из списка
    for (const param of pathParams) {
      const paramName = param.name;
      // Заменяем {paramName} на {var:paramName}
      const pattern = new RegExp(`\\{${paramName}\\}`, 'g');
      result = result.replace(pattern, `{var:${paramName}}`);
    }
    
    // Также обрабатываем параметры в формате :paramName (Swagger 2.0)
    for (const param of pathParams) {
      const paramName = param.name;
      // Заменяем :paramName на {var:paramName}
      const colonPattern = new RegExp(`:${paramName}(?=/|$|\\s)`, 'g');
      result = result.replace(colonPattern, `{var:${paramName}}`);
    }
    
    // Финальная проверка: заменяем любые оставшиеся {paramName} на {var:paramName}
    // (на случай, если параметры не были в списке parameters)
    // Но не трогаем уже обработанные {var:...}
    result = result.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!var:)/g, (match, paramName) => {
      // Проверяем, не является ли это уже переменной
      if (match.startsWith('{var:')) {
        return match;
      }
      return `{var:${paramName}}`;
    });
    
    return result;
  }

  /**
   * Генерирует пример тела запроса из схемы
   * @param {Object} schema - Схема из requestBody
   * @returns {Object|null} Пример тела запроса
   */
  generateRequestBody(schema) {
    if (!schema) return null;

    let result = null;

    // Обработка $ref
    if (schema.$ref) {
      const refSchema = this.resolveRef(schema.$ref);
      result = this.generateExampleFromSchema(refSchema);
    }
    // Обработка content
    else if (schema.content) {
      const jsonContent = schema.content['application/json'];
      if (jsonContent && jsonContent.schema) {
        result = this.generateExampleFromSchema(jsonContent.schema);
      }
    }
    // Прямая схема
    else if (schema.schema) {
      result = this.generateExampleFromSchema(schema.schema);
    } else {
      result = this.generateExampleFromSchema(schema);
    }

    // Декодируем Unicode во всех строковых значениях результата
    if (result !== null && result !== undefined) {
      result = this.decodeUnicodeRecursive(result);
    }

    return result;
  }

  /**
   * Декодирует Unicode escape-последовательности в строке
   * @param {string} str - Строка с Unicode escape-последовательностями
   * @returns {string} Декодированная строка
   */
  decodeUnicode(str) {
    if (!str || typeof str !== 'string') return str;
    
    try {
      // Сначала пытаемся использовать JSON.parse для декодирования, если строка в кавычках
      if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        try {
          return JSON.parse(str);
        } catch (e) {
          // Если не удалось распарсить как JSON, продолжаем с ручным декодированием
        }
      }
      
      // Заменяем Unicode escape-последовательности вида \uXXXX
      // Важно: используем глобальный поиск и замену для всех последовательностей
      let result = str;
      
      // Ищем все Unicode escape-последовательности и заменяем их
      // Важно: обрабатываем случаи, когда последовательность может быть разбита пробелами или другими символами
      // Например, "u0434" должно быть распознано как часть "\u0434"
      
      // КРИТИЧНО: Сначала исправляем случаи, когда обратный слэш и 'u' разделены пробелами
      // Паттерн: \ пробел uXXXX -> \uXXXX
      result = result.replace(/\\\s+u([0-9a-fA-F]{4})/gi, '\\u$1');
      
      // Исправляем случаи, когда 'u' и код разделены пробелами
      // Паттерн: \u пробел XXXX -> \uXXXX
      result = result.replace(/\\u\s+([0-9a-fA-F]{4})/gi, '\\u$1');
      
      // Убираем пробелы между Unicode escape-последовательностями
      // Паттерн: \uXXXX пробел \uYYYY -> \uXXXX\uYYYY
      result = result.replace(/\\u([0-9a-fA-F]{4})\s+\\u([0-9a-fA-F]{4})/gi, '\\u$1\\u$2');
      
      // КРИТИЧНО: Агрессивно ищем и исправляем все разбитые последовательности
      // Ищем паттерны вида: u[4 hex цифры], которые НЕ являются частью уже существующей \u последовательности
      // Заменяем их на \u[4 hex цифры]
      // Используем паттерн, который проверяет, что перед 'u' НЕТ обратного слэша
      // Повторяем несколько раз, чтобы обработать все случаи
      let previousResult = '';
      let iterations = 0;
      while (previousResult !== result && iterations < 10) {
        previousResult = result;
        // Заменяем все u[4 hex] на \u[4 hex], если перед 'u' нет обратного слэша
        result = result.replace(/([^\\])u([0-9a-fA-F]{4})/gi, '$1\\u$2');
        // Также обрабатываем начало строки
        result = result.replace(/^u([0-9a-fA-F]{4})/gi, '\\u$1');
        iterations++;
      }
      
      // Теперь декодируем все Unicode escape-последовательности
      // Используем простое регулярное выражение для совместимости
      result = result.replace(/\\u([0-9a-fA-F]{4})/gi, (match, code) => {
        try {
          const charCode = parseInt(code, 16);
          if (isNaN(charCode)) {
            console.warn('⚠️ [OpenAPI Parser] Некорректный код Unicode:', code);
            return match;
          }
          return String.fromCharCode(charCode);
        } catch (e) {
          console.warn('⚠️ [OpenAPI Parser] Ошибка декодирования Unicode последовательности:', code, e);
          return match; // Если ошибка, оставляем как есть
        }
      });
      
      return result;
    } catch (e) {
      // Если ошибка, возвращаем исходную строку
      console.warn('⚠️ [OpenAPI Parser] Ошибка декодирования Unicode:', e, 'Строка:', str.substring(0, 100));
      return str;
    }
  }

  /**
   * Рекурсивно декодирует Unicode во всех строковых значениях объекта
   * @param {any} data - Данные для декодирования
   * @returns {any} Декодированные данные
   */
  decodeUnicodeRecursive(data) {
    if (typeof data === 'string') {
      return this.decodeUnicode(data);
    } else if (Array.isArray(data)) {
      return data.map(item => this.decodeUnicodeRecursive(item));
    } else if (data && typeof data === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.decodeUnicodeRecursive(value);
      }
      return result;
    }
    return data;
  }

  /**
   * Генерирует пример данных из схемы
   * @param {Object} schema - JSON Schema
   * @returns {any} Пример данных
   */
  generateExampleFromSchema(schema) {
    if (!schema) return null;

    // Обработка $ref
    if (schema.$ref) {
      const refSchema = this.resolveRef(schema.$ref);
      return this.generateExampleFromSchema(refSchema);
    }

    // Обработка типов
    let result;
    switch (schema.type) {
      case 'object':
        const obj = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.generateExampleFromSchema(propSchema);
          }
        }
        result = obj;
        break;

      case 'array':
        if (schema.items) {
          result = [this.generateExampleFromSchema(schema.items)];
        } else {
          result = [];
        }
        break;

      case 'string':
        if (schema.example !== undefined) {
          result = schema.example;
        } else if (schema.format === 'uuid') {
          result = '00000000-0000-0000-0000-000000000000';
        } else if (schema.format === 'date-time') {
          result = new Date().toISOString();
        } else if (schema.enum && schema.enum.length > 0) {
          result = schema.enum[0];
        } else {
          result = 'string';
        }
        break;

      case 'number':
      case 'integer':
        if (schema.example !== undefined) {
          result = schema.example;
        } else {
          result = 0;
        }
        break;

      case 'boolean':
        if (schema.example !== undefined) {
          result = schema.example;
        } else {
          result = false;
        }
        break;

      default:
        result = null;
    }

    // Декодируем Unicode во всех строковых значениях результата
    if (result !== null && result !== undefined) {
      result = this.decodeUnicodeRecursive(result);
    }

    return result;
  }

  /**
   * Разрешает $ref ссылки
   * @param {string} ref - Ссылка вида #/components/schemas/Name
   * @returns {Object} Схема
   */
  resolveRef(ref) {
    if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) {
      return null;
    }

    const path = ref.substring(2).split('/');
    let result = this.spec;

    if (!result) {
      return null;
    }

    for (const key of path) {
      if (result && result[key]) {
        result = result[key];
      } else {
        return null;
      }
    }

    return result;
  }

  /**
   * Генерирует заголовки из параметров и security
   * @param {Object} endpoint - Эндпоинт
   * @returns {Object} Заголовки
   */
  generateHeaders(endpoint) {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Добавляем заголовки из parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        if (param.in === 'header' && param.name) {
          if (param.example !== undefined) {
            headers[param.name] = param.example;
          } else if (param.schema && param.schema.default !== undefined) {
            headers[param.name] = param.schema.default;
          } else {
            headers[param.name] = '';
          }
        }
      }
    }

    // Добавляем security заголовки
    if (endpoint.security && endpoint.security.length > 0) {
      for (const sec of endpoint.security) {
        for (const [name, scopes] of Object.entries(sec)) {
          if (name === 'BearerAuth') {
            headers['Authorization'] = 'Bearer {var:token}';
          } else if (name === 'BasicAuth') {
            headers['Authorization'] = 'Basic {var:credentials}';
          }
        }
      }
    }

    return headers;
  }

  /**
   * Генерирует схему валидации ответа
   * @param {Object} responses - Объект responses из спецификации
   * @param {number} statusCode - Код статуса (по умолчанию 200)
   * @returns {Object|null} Схема валидации
   */
  generateResponseValidation(responses, statusCode = 200) {
    if (!responses || typeof responses !== 'object') {
      return null;
    }

    const response = responses[statusCode] || responses['default'];
    if (!response || typeof response !== 'object') {
      return null;
    }

    if (response.content && response.content['application/json']) {
      const jsonContent = response.content['application/json'];
      if (jsonContent && jsonContent.schema) {
        const schema = jsonContent.schema;
        // Проверяем наличие $ref и разрешаем его
        if (schema.$ref) {
          const resolvedSchema = this.resolveRef(schema.$ref);
          if (resolvedSchema) {
            return {
              statusCode: statusCode,
              schema: resolvedSchema
            };
          }
        }
        // Если нет $ref или не удалось разрешить, используем схему напрямую
        return {
          statusCode: statusCode,
          schema: schema
        };
      }
    }

    return null;
  }

  /**
   * Извлекает потенциальные переменные из спецификации
   * @returns {Array} Массив объектов переменных {name, value, description, source}
   */
  extractVariables() {
    const variables = [];
    const variableNames = new Set();

    // 1. Извлекаем переменные из серверов (host, IP, порт)
    if (this.servers && this.servers.length > 0) {
      for (const server of this.servers) {
        if (server.url) {
          try {
            const url = new URL(server.url);
            const hostname = url.hostname;
            const port = url.port;
            const protocol = url.protocol.replace(':', '');

            // Создаем переменную для базового URL (используем 'server' для совместимости с generateUrl)
            if (!variableNames.has('server')) {
              variables.push({
                name: 'server',
                value: server.url,
                description: `Базовый URL API сервера (из спецификации)`,
                source: 'server'
              });
              variableNames.add('server');
            }

            // Создаем переменную для hostname/IP
            if (hostname && !variableNames.has('apiHost')) {
              variables.push({
                name: 'apiHost',
                value: hostname,
                description: `Hostname/IP адрес API сервера`,
                source: 'server'
              });
              variableNames.add('apiHost');
            }

            // Создаем переменную для порта, если он указан
            if (port && !variableNames.has('apiPort')) {
              variables.push({
                name: 'apiPort',
                value: port,
                description: `Порт API сервера`,
                source: 'server'
              });
              variableNames.add('apiPort');
            }
          } catch (e) {
            // Если URL некорректный, пропускаем
          }
        }
      }
    }

    // 2. Извлекаем переменные из security schemes
    const securitySchemes = this.components?.securitySchemes || {};
    for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
      if (scheme.type === 'http') {
        if (scheme.scheme === 'bearer') {
          if (!variableNames.has('apiToken')) {
            variables.push({
              name: 'apiToken',
              value: '',
              description: `Bearer токен для авторизации (${schemeName})`,
              source: 'security'
            });
            variableNames.add('apiToken');
          }
        } else if (scheme.scheme === 'basic') {
          if (!variableNames.has('apiCredentials')) {
            variables.push({
              name: 'apiCredentials',
              value: '',
              description: `Basic Auth credentials (${schemeName})`,
              source: 'security'
            });
            variableNames.add('apiCredentials');
          }
        }
      } else if (scheme.type === 'apiKey') {
        const varName = `apiKey_${schemeName}`;
        if (!variableNames.has(varName)) {
          variables.push({
            name: varName,
            value: '',
            description: `API ключ для ${schemeName} (${scheme.in}: ${scheme.name})`,
            source: 'security'
          });
          variableNames.add(varName);
        }
      } else if (scheme.type === 'oauth2') {
        if (!variableNames.has('apiToken')) {
          variables.push({
            name: 'apiToken',
            value: '',
            description: `OAuth2 токен для авторизации (${schemeName})`,
            source: 'security'
          });
          variableNames.add('apiToken');
        }
      }
    }

    // 3. Создаем переменную для сервера (если есть серверы)
    if (this.servers.length > 0) {
      const firstServer = this.servers[0];
      if (firstServer.url) {
        if (!variableNames.has('server')) {
          variables.push({
            name: 'server',
            value: firstServer.url.endsWith('/') ? firstServer.url.slice(0, -1) : firstServer.url,
            description: `Базовый URL API сервера`,
            source: 'server'
          });
          variableNames.add('server');
        }
      }
    }

    // 4. Извлекаем переменные из path parameters всех эндпоинтов
    const endpoints = this.extractEndpoints();
    for (const endpoint of endpoints) {
      if (endpoint.parameters) {
        for (const param of endpoint.parameters) {
          if (param.in === 'path' && param.name) {
            // Используем имя параметра напрямую, без префикса path_
            const varName = param.name;
            if (!variableNames.has(varName)) {
              variables.push({
                name: varName,
                value: param.example || param.schema?.example || param.default || '',
                description: `Path параметр: ${param.name}${param.description ? ` (${param.description})` : ''}`,
                source: 'parameter'
              });
              variableNames.add(varName);
            }
          } else if (param.in === 'query' && param.name && (param.example !== undefined || param.schema?.example !== undefined)) {
            const varName = `query_${param.name}`;
            if (!variableNames.has(varName)) {
              variables.push({
                name: varName,
                value: param.example || param.schema?.example || param.default || '',
                description: `Query параметр: ${param.name}${param.description ? ` (${param.description})` : ''}`,
                source: 'parameter'
              });
              variableNames.add(varName);
            }
          }
        }
      }
    }

    return variables;
  }

  /**
   * Заменяет значения в URL на переменные
   * @param {string} url - Исходный URL
   * @param {Array} variables - Массив переменных
   * @param {Array} endpointParameters - Параметры эндпоинта для замены path parameters
   * @returns {string} URL с замененными значениями на переменные
   */
  replaceUrlWithVariables(url, variables, endpointParameters = []) {
    let result = url;

    // Если URL начинается с /, это относительный путь - добавляем переменную сервера
    if (result.startsWith('/')) {
      const serverVar = variables.find(v => v.name === 'server');
      if (serverVar) {
        // URL уже будет содержать {var:server} из generateUrl, но проверим
        if (!result.startsWith('{var:server}')) {
          result = `{var:server}${result}`;
        }
      }
    } else {
      // Если это полный URL, заменяем базовый URL на переменную
      try {
        const urlObj = new URL(result);
        const serverVar = variables.find(v => v.name === 'server');
        if (serverVar) {
          const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
          result = result.replace(baseUrl, '{var:server}');
        }
      } catch (e) {
        // Если URL некорректный, оставляем как есть
      }
    }

    // Заменяем path parameters на переменные (используем имя параметра напрямую)
    const pathParams = endpointParameters.filter(p => p.in === 'path');
    for (const param of pathParams) {
      const paramName = param.name;
      // Ищем паттерн {paramName} в URL (но не {var:paramName})
      const pattern = new RegExp(`\\{${paramName}\\}(?!var:)`, 'g');
      if (pattern.test(result)) {
        result = result.replace(pattern, `{var:${paramName}}`);
      }
      // Также обрабатываем формат :paramName
      const colonPattern = new RegExp(`:${paramName}(?=/|$|\\s)`, 'g');
      if (colonPattern.test(result) && !result.includes(`{var:${paramName}}`)) {
        result = result.replace(colonPattern, `{var:${paramName}}`);
      }
    }

    // Финальная проверка: заменяем любые оставшиеся {paramName} на {var:paramName}
    // (на случай, если параметры не были в списке endpointParameters)
    result = result.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!var:)/g, '{var:$1}');

    return result;
  }

  /**
   * Заменяет значения в заголовках на переменные
   * @param {Object} headers - Исходные заголовки
   * @param {Array} variables - Массив переменных
   * @returns {Object} Заголовки с замененными значениями на переменные
   */
  replaceHeadersWithVariables(headers, variables) {
    const result = { ...headers };

    // Заменяем токены на переменные
    if (result['Authorization']) {
      const authValue = result['Authorization'];
      if (authValue.includes('Bearer')) {
        const tokenVar = variables.find(v => v.name === 'apiToken');
        if (tokenVar) {
          result['Authorization'] = 'Bearer {var:apiToken}';
        }
      } else if (authValue.includes('Basic')) {
        const credVar = variables.find(v => v.name === 'apiCredentials');
        if (credVar) {
          result['Authorization'] = 'Basic {var:apiCredentials}';
        }
      }
    }

    // Заменяем API ключи на переменные
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value) {
        const apiKeyVar = variables.find(v => v.name.startsWith('apiKey_') && value === v.value);
        if (apiKeyVar) {
          result[key] = `{var:${apiKeyVar.name}}`;
        }
      }
    }

    return result;
  }
}


