# Формат тест-кейсов для AutoTest Recorder

Данный документ описывает формат JSON-файлов тест-кейсов, которые могут быть импортированы в плагин AutoTest Recorder и успешно воспроизведены.

## Содержание

1. [Общая структура теста](#общая-структура-теста)
2. [Типы действий](#типы-действий)
3. [Структура селекторов](#структура-селекторов)
4. [Переменные](#переменные)
5. [Условия и циклы](#условия-и-циклы)
6. [Примеры](#примеры)

---

## Общая структура теста

### Обязательные поля

```json
{
  "name": "Название теста",
  "actions": []
}
```

### Полная структура с опциональными полями

```json
{
  "id": "test-123",                    // Опционально: уникальный ID теста
  "name": "Название теста",            // Обязательно: название теста
  "actions": [],                       // Обязательно: массив действий
  "variables": {},                    // Опционально: объект переменных
  "preconditions": [],                 // Опционально: массив предварительных условий
  "url": "https://example.com",        // Опционально: базовый URL
  "createdAt": "2024-01-01T00:00:00.000Z",  // Опционально: дата создания
  "updatedAt": "2024-01-01T00:00:00.000Z",  // Опционально: дата обновления
  "lastEditedBy": "user",             // Опционально: кто последний редактировал (user/ai/optimization)
  "optimization": {}                   // Опционально: метаданные оптимизации
}
```

---

## Типы действий

### 1. Click (Клик)

Клик по элементу на странице.

```json
{
  "type": "click",
  "selector": {
    "type": "id",
    "selector": "#submit-button",
    "value": "#submit-button"
  },
  "url": "https://example.com/form",
  "timestamp": 1234567890,
  "fieldLabel": "Кнопка отправки"  // Опционально: метка поля
}
```

### 2. Double Click (Двойной клик)

```json
{
  "type": "dblclick",
  "selector": {
    "type": "css",
    "selector": ".file-item",
    "value": ".file-item"
  },
  "url": "https://example.com/files"
}
```

### 3. Input (Ввод текста)

Ввод текста в текстовое поле.

```json
{
  "type": "input",
  "selector": {
    "type": "name",
    "selector": "username",
    "value": "username"
  },
  "value": "testuser",
  "url": "https://example.com/login",
  "fieldLabel": "Имя пользователя"
}
```

**Особенности:**
- Для файловых input используйте `type: "change"` с путем к файлу
- Для dropdown элементов плагин автоматически определит тип и выберет опцию

### 4. Change (Изменение значения)

Изменение значения в select, dropdown или файловом input.

```json
{
  "type": "change",
  "selector": {
    "type": "id",
    "selector": "#country-select",
    "value": "#country-select"
  },
  "value": "Россия",
  "url": "https://example.com/form"
}
```

**Для файлов:**
```json
{
  "type": "change",
  "selector": {
    "type": "id",
    "selector": "#file-upload",
    "value": "#file-upload"
  },
  "value": "document.pdf"
}
```

### 5. Navigation (Навигация)

Переход на другую страницу.

```json
{
  "type": "navigation",
  "url": "https://example.com/page",
  "value": "https://example.com/page"
}
```

### 6. Wait (Задержка)

Ожидание указанного времени в миллисекундах.

```json
{
  "type": "wait",
  "delay": 2000,
  "value": 2000
}
```

### 7. Keyboard (Нажатие клавиши)

Нажатие клавиши или комбинации клавиш.

```json
{
  "type": "keyboard",
  "key": "Enter",
  "keyCombination": "Enter",
  "isGlobal": true,  // true = глобально на странице, false = на элементе
  "modifiers": {     // Опционально: модификаторы
    "ctrl": false,
    "shift": false,
    "alt": false,
    "meta": false
  }
}
```

**Пример с модификаторами:**
```json
{
  "type": "keyboard",
  "key": "s",
  "keyCombination": "Ctrl+S",
  "isGlobal": true,
  "modifiers": {
    "ctrl": true,
    "shift": false,
    "alt": false,
    "meta": false
  }
}
```

### 8. Scroll (Прокрутка)

Прокрутка страницы к указанной позиции.

```json
{
  "type": "scroll",
  "position": {
    "x": 0,
    "y": 500
  }
}
```

### 9. API Request (API запрос)

Выполнение HTTP запроса.

```json
{
  "type": "api",
  "api": {
    "method": "POST",
    "url": "https://api.example.com/users",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer {var:token}"
    },
    "body": {
      "name": "Test User",
      "email": "{var:email}"
    },
    "saveResponse": true,           // Опционально: сохранить ответ в переменную
    "responseVariable": "apiResponse" // Опционально: имя переменной для ответа
  }
}
```

**Поддерживаемые методы:** GET, POST, PUT, PATCH, DELETE

**Использование переменных в API:**
- В URL: `https://api.example.com/users/{var:userId}`
- В headers: `"Authorization": "Bearer {var:token}"`
- В body: `{"id": "{var:userId}"}`

### 10. Variable (Работа с переменной)

Извлечение значения из URL или элемента.

```json
{
  "type": "variable",
  "variable": {
    "name": "userId",
    "operation": "extract-url",  // extract-url | extract-element | set | calculate
    "pattern": "/users/(\\d+)"    // Для extract-url: регулярное выражение
  },
  "selector": {                   // Для extract-element
    "type": "id",
    "selector": "#user-id",
    "value": "#user-id"
  }
}
```

**Операции:**
- `extract-url` - извлечь из URL по регулярному выражению
- `extract-element` - извлечь текст/значение из элемента
- `set` - установить значение (используйте `setVariable`)
- `calculate` - вычислить математическое выражение

### 11. Set Variable (Установка переменной)

Установка значения переменной.

```json
{
  "type": "setVariable",
  "variableName": "counter",
  "variableValue": "1",
  "value": "1"
}
```

### 12. Condition (Условие)

Условное выполнение действий.

```json
{
  "type": "condition",
  "condition": {
    "expression": "{var:userRole} === 'admin'",
    "type": "javascript"  // Опционально: тип условия
  },
  "thenActions": [
    {
      "type": "click",
      "selector": {
        "type": "id",
        "selector": "#admin-panel",
        "value": "#admin-panel"
      }
    }
  ],
  "elseActions": [
    {
      "type": "click",
      "selector": {
        "type": "id",
        "selector": "#user-panel",
        "value": "#user-panel"
      }
    }
  ]
}
```

### 13. Loop (Цикл)

Повторение действий.

```json
{
  "type": "loop",
  "loop": {
    "type": "for",           // for | while
    "iterations": 5,         // Для for: количество итераций
    "condition": "{var:hasMore} === true"  // Для while: условие
  },
  "actions": [
    {
      "type": "click",
      "selector": {
        "type": "id",
        "selector": "#next-button",
        "value": "#next-button"
      }
    }
  ]
}
```

---

## Структура селекторов

Селектор определяет элемент на странице для взаимодействия.

### Базовая структура

```json
{
  "type": "id",              // Тип селектора (см. ниже)
  "selector": "#my-button",  // Значение селектора
  "value": "#my-button",     // Дублирование значения (для совместимости)
  "priority": 75,            // Опционально: приоритет (0-100)
  "alternatives": []         // Опционально: альтернативные селекторы
}
```

### Типы селекторов

1. **id** - по ID элемента: `#my-button`
2. **name** - по атрибуту name: `input[name="username"]`
3. **css** - CSS селектор: `.button-primary`
4. **xpath** - XPath: `//button[@class='submit']`
5. **data-testid** - по data-testid: `[data-testid="submit-btn"]`
6. **data-cy** - по data-cy (Cypress): `[data-cy="submit-btn"]`
7. **aria-label** - по aria-label: `[aria-label="Submit"]`
8. **text** - по тексту элемента: `button:contains("Submit")`

### Альтернативные селекторы

Для повышения надежности можно указать альтернативные селекторы:

```json
{
  "type": "id",
  "selector": "#submit-button",
  "value": "#submit-button",
  "alternatives": [
    {
      "type": "css",
      "selector": ".btn-submit",
      "value": ".btn-submit"
    },
    {
      "type": "data-testid",
      "selector": "[data-testid='submit']",
      "value": "[data-testid='submit']"
    }
  ]
}
```

Плагин будет пробовать селекторы в порядке: основной → альтернативные.

**ВАЖНО:** Селекторы с `:contains()` (тип `text`) **НЕ должны** объединяться через запятую в одном селекторе. Каждый такой селектор должен быть отдельным элементом в массиве `alternatives`.

**Неправильно:**
```json
{
  "type": "css",
  "selector": "button:contains('Далее'), button:contains('Продолжить')",
  "value": "button:contains('Далее'), button:contains('Продолжить')"
}
```

**Правильно:**
```json
{
  "type": "text",
  "selector": "button:contains('Далее')",
  "value": "button:contains('Далее')",
  "alternatives": [
    {
      "type": "text",
      "selector": "button:contains('Продолжить')",
      "value": "button:contains('Продолжить')"
    }
  ]
}
```

**Примечание:** Для CSS селекторов объединение через запятую допустимо (это валидный CSS синтаксис), но для селекторов типа `text` с `:contains()` это не работает, так как `:contains()` не является стандартным CSS селектором.

---

## Переменные

Переменные используются для хранения значений между шагами теста.

### Определение переменных

```json
{
  "variables": {
    "username": {
      "value": "testuser",
      "type": "string",
      "source": "manual"
    },
    "password": {
      "value": "password123",
      "type": "string",
      "source": "manual"
    },
    "userId": {
      "value": "",
      "type": "string",
      "source": "extracted"
    }
  }
}
```

### Использование переменных

Переменные используются через синтаксис `{var:имя}`:

```json
{
  "type": "input",
  "selector": {
    "type": "name",
    "selector": "username",
    "value": "username"
  },
  "value": "{var:username}"
}
```

### Встроенные переменные

- `{date}` - текущая дата в формате YYYY-MM-DD
- `{time}` - текущее время в формате HH:mm:ss
- `{counter:имя}` - счетчик (увеличивается на 1 при каждом использовании)

---

## Условия и циклы

### Условие (Condition)

```json
{
  "type": "condition",
  "condition": {
    "expression": "{var:status} === 'active'"
  },
  "thenActions": [
    // Действия, если условие истинно
  ],
  "elseActions": [
    // Действия, если условие ложно (опционально)
  ]
}
```

### Цикл (Loop)

**Цикл for:**
```json
{
  "type": "loop",
  "loop": {
    "type": "for",
    "iterations": 10
  },
  "actions": [
    // Действия внутри цикла
  ]
}
```

**Цикл while:**
```json
{
  "type": "loop",
  "loop": {
    "type": "while",
    "condition": "{var:hasMore} === true"
  },
  "actions": [
    // Действия внутри цикла
  ]
}
```

---

## Примеры

### Пример 1: Простой тест логина

```json
{
  "name": "Авторизация пользователя",
  "actions": [
    {
      "type": "navigation",
      "url": "https://example.com/login",
      "value": "https://example.com/login"
    },
    {
      "type": "input",
      "selector": {
        "type": "id",
        "selector": "#username",
        "value": "#username"
      },
      "value": "{var:username}",
      "url": "https://example.com/login"
    },
    {
      "type": "input",
      "selector": {
        "type": "id",
        "selector": "#password",
        "value": "#password"
      },
      "value": "{var:password}",
      "url": "https://example.com/login"
    },
    {
      "type": "click",
      "selector": {
        "type": "id",
        "selector": "#login-button",
        "value": "#login-button"
      },
      "url": "https://example.com/login"
    },
    {
      "type": "wait",
      "delay": 2000,
      "value": 2000
    }
  ],
  "variables": {
    "username": {
      "value": "testuser",
      "type": "string",
      "source": "manual"
    },
    "password": {
      "value": "password123",
      "type": "string",
      "source": "manual"
    }
  }
}
```

### Пример 2: Тест с API запросом

```json
{
  "name": "Создание пользователя через API",
  "actions": [
    {
      "type": "api",
      "api": {
        "method": "POST",
        "url": "https://api.example.com/users",
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer {var:token}"
        },
        "body": {
          "name": "Test User",
          "email": "test@example.com"
        },
        "saveResponse": true,
        "responseVariable": "newUser"
      }
    },
    {
      "type": "variable",
      "variable": {
        "name": "userId",
        "operation": "extract-element",
        "pattern": "\"id\":(\\d+)"
      },
      "selector": {
        "type": "id",
        "selector": "#response-data",
        "value": "#response-data"
      }
    }
  ],
  "variables": {
    "token": {
      "value": "your-api-token",
      "type": "string",
      "source": "manual"
    }
  }
}
```

### Пример 3: Тест с условием

```json
{
  "name": "Условное выполнение",
  "actions": [
    {
      "type": "variable",
      "variable": {
        "name": "userRole",
        "operation": "extract-element"
      },
      "selector": {
        "type": "id",
        "selector": "#user-role",
        "value": "#user-role"
      }
    },
    {
      "type": "condition",
      "condition": {
        "expression": "{var:userRole} === 'admin'"
      },
      "thenActions": [
        {
          "type": "click",
          "selector": {
            "type": "id",
            "selector": "#admin-panel",
            "value": "#admin-panel"
          }
        }
      ],
      "elseActions": [
        {
          "type": "click",
          "selector": {
            "type": "id",
            "selector": "#user-panel",
            "value": "#user-panel"
          }
        }
      ]
    }
  ]
}
```

### Пример 4: Тест с циклом

```json
{
  "name": "Обработка списка элементов",
  "actions": [
    {
      "type": "setVariable",
      "variableName": "counter",
      "variableValue": "0",
      "value": "0"
    },
    {
      "type": "loop",
      "loop": {
        "type": "for",
        "iterations": 5
      },
      "actions": [
        {
          "type": "click",
          "selector": {
            "type": "css",
            "selector": ".list-item:nth-child({var:counter})",
            "value": ".list-item:nth-child({var:counter})"
          }
        },
        {
          "type": "setVariable",
          "variableName": "counter",
          "variableValue": "{counter:counter}",
          "value": "{counter:counter}"
        },
        {
          "type": "wait",
          "delay": 1000,
          "value": 1000
        }
      ]
    }
  ]
}
```

---

## Рекомендации

### 1. Используйте стабильные селекторы

**Хорошо:**
- `#submit-button` (ID)
- `[data-testid="submit"]` (data-testid)
- `button[name="submit"]` (name)

**Плохо:**
- `.css-abc123` (динамический класс)
- `div:nth-child(5)` (позиция может измениться)
- `.button-primary.active` (зависит от состояния)

### 2. Добавляйте альтернативные селекторы

Для критичных элементов всегда указывайте альтернативные селекторы:

```json
{
  "selector": {
    "type": "id",
    "selector": "#main-button",
    "value": "#main-button",
    "alternatives": [
      {
        "type": "data-testid",
        "selector": "[data-testid='main-button']",
        "value": "[data-testid='main-button']"
      },
      {
        "type": "css",
        "selector": "button.primary",
        "value": "button.primary"
      }
    ]
  }
}
```

### 3. Используйте переменные для данных

Не хардкодьте данные в тестах, используйте переменные:

```json
{
  "variables": {
    "testEmail": {
      "value": "test@example.com",
      "type": "string",
      "source": "manual"
    }
  }
}
```

### 4. Добавляйте задержки после критичных действий

После навигации или действий, требующих загрузки:

```json
{
  "type": "navigation",
  "url": "https://example.com/page",
  "value": "https://example.com/page"
},
{
  "type": "wait",
  "delay": 2000,
  "value": 2000
}
```

### 5. Указывайте URL для действий

Это помогает плагину отслеживать контекст:

```json
{
  "type": "click",
  "selector": {
    "type": "id",
    "selector": "#button",
    "value": "#button"
  },
  "url": "https://example.com/page"
}
```

---

## Валидация

При импорте теста плагин проверяет:

1. ✅ Наличие поля `name`
2. ✅ Наличие поля `actions` (массив)
3. ✅ Каждое действие имеет поле `type`
4. ✅ Действия с селекторами имеют поле `selector`
5. ✅ Селектор имеет поля `type` и `selector` (или `value`)

---

## Ограничения

1. **Файлы:** Файлы должны быть предварительно загружены в настройки плагина
2. **Переменные:** Переменные должны быть определены до использования
3. **Условия:** Выражения условий выполняются как JavaScript код
4. **API:** CORS ограничения могут блокировать запросы к внешним API

---

## Поддержка

При возникновении проблем с импортом или воспроизведением тестов:

1. Проверьте формат JSON (используйте валидатор JSON)
2. Убедитесь, что все обязательные поля присутствуют
3. Проверьте селекторы в браузерной консоли: `document.querySelector('#your-selector')`
4. Убедитесь, что переменные определены перед использованием

---

**Версия документа:** 1.0  
**Дата обновления:** 2024-01-01
