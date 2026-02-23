// Умный движок для генерации селекторов, поддерживающий React, Angular и другие фреймворки

class SelectorEngine {
  constructor() {
    this.priorities = [
      'data-testid',
      'data-cy',
      'data-test',
      'id',
      'name',
      'aria-label',
      'role',
      'class',
      'tag'
    ];
    
    // Ссылка на оптимизатор (будет установлена после загрузки)
    this.optimizer = null;
    this._initOptimizer();
    
    // Web Worker для тяжелых вычислений
    this.worker = null;
    this.useWorker = false; // По умолчанию выключен для совместимости
    this._initWorker();
  }

  /**
   * Инициализация Web Worker
   */
  _initWorker() {
    try {
      // Проверяем поддержку Web Workers
      if (typeof Worker !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
        try {
          // Пытаемся создать worker (путь должен быть правильным)
          const workerPath = chrome.runtime.getURL('content/selector-worker.js');
          this.worker = new Worker(workerPath);
          this.worker.onerror = (error) => {
            console.warn('⚠️ [SelectorEngine] Web Worker недоступен, используем синхронный режим:', error);
            this.useWorker = false;
            this.worker = null;
          };
          this.useWorker = true;
          console.log('✅ [SelectorEngine] Web Worker инициализирован');
        } catch (workerError) {
          const errorMessage = workerError?.message || workerError?.toString() || 'Неизвестная ошибка';
          // Не показываем предупреждение, если это CSP ошибка - это нормально
          if (workerError?.name === 'SecurityError' || errorMessage.includes('SecurityError') || 
              errorMessage.includes('cannot be accessed from origin')) {
            // Это нормально для сайтов с строгой CSP политикой
            // Просто используем синхронный режим без предупреждений
            this.useWorker = false;
            this.worker = null;
          } else {
            console.warn('⚠️ [SelectorEngine] Не удалось создать Web Worker:', errorMessage);
            console.warn('   ℹ️ Используется синхронный режим генерации селекторов');
            this.useWorker = false;
            this.worker = null;
          }
        }
      } else {
        console.warn('⚠️ [SelectorEngine] Web Workers не поддерживаются или chrome.runtime недоступен');
        this.useWorker = false;
      }
    } catch (error) {
      console.warn('⚠️ [SelectorEngine] Не удалось инициализировать Web Worker:', error);
      this.useWorker = false;
      this.worker = null;
    }
  }

  /**
   * Генерация селекторов с использованием Web Worker (если доступен)
   */
  async generateSelectorsWithWorker(element) {
    if (!this.useWorker || !this.worker) {
      return null; // Fallback на синхронный режим
    }
    
    try {
      // Сериализуем данные элемента
      const elementData = {
        tagName: element.tagName,
        id: element.id,
        name: element.name,
        dataset: {
          testid: element.dataset?.testid,
          cy: element.dataset?.cy,
          test: element.dataset?.test,
          qa: element.dataset?.qa,
          automation: element.dataset?.automation
        },
        ariaLabel: element.getAttribute('aria-label'),
        classes: element.className ? element.className.split(' ').filter(c => c) : []
      };
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker timeout'));
        }, 5000);
        
        const handler = (e) => {
          clearTimeout(timeout);
          if (this.worker && typeof this.worker.removeEventListener === 'function') {
            this.worker.removeEventListener('message', handler);
          }
          
          if (e.data.success) {
            resolve(e.data.selectors);
          } else {
            reject(new Error(e.data.error));
          }
        };
        
        this.worker.addEventListener('message', handler);
        this.worker.postMessage({
          type: 'GENERATE_SELECTORS',
          data: elementData
        });
      });
    } catch (error) {
      console.warn('⚠️ [SelectorEngine] Ошибка в Web Worker, используем синхронный режим:', error);
      return null;
    }
  }

  /**
   * Инициализация оптимизатора
   */
  _initOptimizer() {
    // Отложенная инициализация, чтобы дождаться загрузки SelectorOptimizer
    setTimeout(() => {
      if (window.selectorOptimizer) {
        this.optimizer = window.selectorOptimizer;
        console.log('✅ [SelectorEngine] SelectorOptimizer подключен');
      }
    }, 100);
  }

  /**
   * Определяет используемый фреймворк
   */
  detectFramework() {
    // React
    if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      return 'react';
    }
    // Angular
    if (window.ng || window.getAllAngularRootElements) {
      return 'angular';
    }
    // Vue
    if (window.Vue || window.__VUE__) {
      return 'vue';
    }
    return 'unknown';
  }

  /**
   * Получает React-компонент для элемента (если доступен)
   */
  getReactComponent(element) {
    try {
      // Пробуем получить через React DevTools
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        const fiber = element._reactInternalFiber || 
                     element._reactInternalInstance ||
                     element.__reactInternalInstance;
        if (fiber) {
          return fiber.type?.name || fiber.type?.displayName || null;
        }
      }
    } catch (e) {
      // Игнорируем ошибки
    }
    return null;
  }

  /**
   * Получает Angular-директиву для элемента (если доступна)
   */
  getAngularDirective(element) {
    try {
      if (window.ng && element.__ngContext__) {
        // Angular элемент
        return true;
      }
    } catch (e) {
      // Игнорируем ошибки
    }
    return false;
  }

  /**
   * Генерирует все возможные варианты селекторов для элемента
   * С интеграцией оптимизатора
   */
  generateAllSelectors(element) {
    if (!element || !element.tagName) return [];

    // Проверяем кэш оптимизатора
    if (this.optimizer) {
      const cached = this.optimizer.getCachedSelectors(element);
      if (cached) return cached;
    }

    const selectors = [];

    // Самые точные внешние генераторы — сначала UniqueSelectorLite, затем FinderLite
    this.addUniqueSelector(element, selectors);
    this.addFinderLiteSelector(element, selectors);

    // Приоритет 1: data-testid (самый высокий приоритет)
    if (element.dataset.testid) {
      selectors.push({
        type: 'data-testid',
        value: element.dataset.testid,
        selector: `[data-testid="${this.escapeSelector(element.dataset.testid)}"]`,
        priority: 1,
        framework: this.detectFramework(),
        component: this.getReactComponent(element),
        isUnique: this.checkUniqueness(`[data-testid="${this.escapeSelector(element.dataset.testid)}"]`)
      });
    }

    // Приоритет 2: data-cy
    if (element.dataset.cy) {
      selectors.push({
        type: 'data-cy',
        value: element.dataset.cy,
        selector: `[data-cy="${this.escapeSelector(element.dataset.cy)}"]`,
        priority: 2,
        framework: this.detectFramework(),
        component: this.getReactComponent(element),
        isUnique: this.checkUniqueness(`[data-cy="${this.escapeSelector(element.dataset.cy)}"]`)
      });
    }

    // Приоритет 3: data-test
    if (element.dataset.test) {
      selectors.push({
        type: 'data-test',
        value: element.dataset.test,
        selector: `[data-test="${this.escapeSelector(element.dataset.test)}"]`,
        priority: 3,
        framework: this.detectFramework(),
        component: this.getReactComponent(element),
        isUnique: this.checkUniqueness(`[data-test="${this.escapeSelector(element.dataset.test)}"]`)
      });
    }

    // Приоритет 3.5: data-qa
    if (element.dataset.qa) {
      selectors.push({
        type: 'data-qa',
        value: element.dataset.qa,
        selector: `[data-qa="${this.escapeSelector(element.dataset.qa)}"]`,
        priority: 3.5,
        framework: this.detectFramework(),
        component: this.getReactComponent(element),
        isUnique: this.checkUniqueness(`[data-qa="${this.escapeSelector(element.dataset.qa)}"]`)
      });
    }

    // Приоритет 3.6: data-automation
    if (element.dataset.automation) {
      selectors.push({
        type: 'data-automation',
        value: element.dataset.automation,
        selector: `[data-automation="${this.escapeSelector(element.dataset.automation)}"]`,
        priority: 3.6,
        framework: this.detectFramework(),
        component: this.getReactComponent(element),
        isUnique: this.checkUniqueness(`[data-automation="${this.escapeSelector(element.dataset.automation)}"]`)
      });
    }

    // Приоритет 4: id
    if (element.id) {
      selectors.push({
        type: 'id',
        value: element.id,
        selector: `#${this.escapeSelector(element.id)}`,
        priority: 4,
        isUnique: this.checkUniqueness(`#${this.escapeSelector(element.id)}`)
      });
    }

    // Приоритет 5: name
    if (element.name) {
      const nameSelector = `[name="${this.escapeSelector(element.name)}"]`;
      const nameElements = document.querySelectorAll(nameSelector);
      // Для name проверяем, что это единственный элемент такого типа с таким name
      const isUnique = nameElements.length === 1 || 
        (nameElements.length > 0 && Array.from(nameElements).every(el => el.tagName === element.tagName && el.name === element.name));
      
      selectors.push({
        type: 'name',
        value: element.name,
        selector: nameSelector,
        priority: 5,
        isUnique: isUnique
      });
    }

    // Приоритет 6: aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      selectors.push({
        type: 'aria-label',
        value: ariaLabel,
        selector: `[aria-label="${this.escapeSelector(ariaLabel)}"]`,
        priority: 6,
        isUnique: this.checkUniqueness(`[aria-label="${this.escapeSelector(ariaLabel)}"]`)
      });
    }

    // Приоритет 6.1-6.8: важные атрибуты (title, placeholder, tooltip и т.д.)
    const attributeConfigs = [
      { name: 'title', type: 'title', priority: 6.1 },
      { name: 'placeholder', type: 'placeholder', priority: 6.2 },
      { name: 'data-value', type: 'data-value', priority: 6.25 },
      { name: 'tooltip', type: 'tooltip', priority: 6.3 },
      { name: 'tooltipdelay', type: 'tooltipdelay', priority: 6.35 },
      { name: 'tooltipdelayhide', type: 'tooltipdelayhide', priority: 6.4 },
      { name: 'ng-reflect-app-tooltip', type: 'ng-reflect-app-tooltip', priority: 3.2 },
      { name: 'ng-reflect-label', type: 'ng-reflect-label', priority: 3.3 },
      { name: 'ng-reflect-name', type: 'ng-reflect-name', priority: 3.35 },
      { name: 'ng-reflect-value', type: 'ng-reflect-value', priority: 3.4 },
      { name: 'ng-reflect-option-label', type: 'ng-reflect-option-label', priority: 3.45 },
      { name: 'ng-reflect-tooltip-delay', type: 'ng-reflect-tooltip-delay', priority: 3.5 },
      { name: 'ng-reflect-tooltip-delay-hide', type: 'ng-reflect-tooltip-delay-hide', priority: 3.55 }
    ];

    attributeConfigs.forEach(attr => {
      const attrValue = element.getAttribute(attr.name);
      if (attrValue) {
        const attrSelector = `[${attr.name}="${this.escapeSelector(attrValue)}"]`;
        selectors.push({
          type: attr.type,
          value: attrValue,
          selector: attrSelector,
          priority: attr.priority,
          isUnique: this.checkUniqueness(attrSelector)
        });
      }
    });

    // Приоритет 7: role + текст
    const role = element.getAttribute('role');
    if (role) {
      const text = this.getElementText(element);
      if (text) {
        const roleSelector = `[role="${role}"]`;
        const roleElements = Array.from(document.querySelectorAll(roleSelector));
        const matchingElements = roleElements.filter(el => 
          this.getElementText(el).trim() === text.trim()
        );
        
        selectors.push({
          type: 'role-text',
          value: { role, text },
          selector: roleSelector,
          text: text,
          priority: 7,
          isUnique: matchingElements.length === 1
        });
      }
    }

    // Приоритет 8: класс (проверяем все классы, игнорируя динамические)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c);
      
      // Паттерны динамических классов для игнорирования
      const dynamicClassPatterns = [
        /^ng-/,           // Angular: ng-content, ng-host
        /^css-[\da-z]+$/i, // CSS-in-JS хэши
        /^sc-[a-z0-9]+$/i, // styled-components
        /^emotion-[a-z0-9]+$/i, // Emotion
        /^_[a-z0-9]+$/i,  // Общие хэши (начинающиеся с _)
        /^[a-z0-9]{8,}$/i // Длинные хэши (8+ символов)
      ];
      
      // Фильтруем стабильные классы
      const stableClasses = classes.filter(className => {
        return !dynamicClassPatterns.some(pattern => pattern.test(className));
      });
      
      // Используем стабильные классы
      for (const className of stableClasses) {
        const classSelector = `.${this.escapeSelector(className)}`;
        const isUnique = this.checkUniqueness(classSelector);
        if (isUnique) {
          selectors.push({
            type: 'class',
            value: className,
            selector: classSelector,
            priority: 8,
            isUnique: true,
            isStable: true
          });
          break; // Берем первый уникальный стабильный класс
        }
      }
      
      // Если не нашли стабильный уникальный класс, пробуем все классы (для обратной совместимости)
      if (stableClasses.length === 0 || !selectors.some(s => s.type === 'class' && s.isUnique)) {
        for (const className of classes) {
          const classSelector = `.${this.escapeSelector(className)}`;
          const isUnique = this.checkUniqueness(classSelector);
          if (isUnique) {
            selectors.push({
              type: 'class',
              value: className,
              selector: classSelector,
              priority: 8.5, // Немного ниже приоритет для динамических классов
              isUnique: true,
              isStable: false
            });
            break;
          }
        }
      }

      // Сохраняем важные классы даже если они не уникальны (например, result__content, select-box)
      const importantClasses = ['result__content', 'result__value', 'select-box', 'option', 'mat-option', 'ant-select-item-option'];
      importantClasses.forEach(importantClass => {
        if (classes.includes(importantClass) || element.className.includes(importantClass)) {
          const exactSelector = `.${this.escapeSelector(importantClass)}`;
          selectors.push({
            type: 'class',
            value: importantClass,
            selector: exactSelector,
            priority: 8.2,
            isUnique: this.checkUniqueness(exactSelector)
          });

          const containsSelector = `[class*="${this.escapeSelector(importantClass)}"]`;
          selectors.push({
            type: 'class-contains',
            value: importantClass,
            selector: containsSelector,
            priority: 8.3,
            isUnique: this.checkUniqueness(containsSelector)
          });
        }
      });
    }

    // Приоритет 9: тег + текст
    const text = this.getElementText(element);
    if (text && text.length > 0) {
      const tag = element.tagName.toLowerCase();
      const tagElements = Array.from(document.querySelectorAll(tag));
      const matchingElements = tagElements.filter(el => 
        this.getElementText(el).trim() === text.trim()
      );
      
      selectors.push({
        type: 'tag-text',
        value: { tag, text },
        selector: tag,
        text: text,
        priority: 9,
        isUnique: matchingElements.length === 1
      });
    }

    // Приоритет 10: тег + позиция
    const position = this.getElementPosition(element);
    selectors.push({
      type: 'tag-position',
      value: { tag: element.tagName.toLowerCase(), position },
      selector: `${element.tagName.toLowerCase()}:nth-of-type(${position})`,
      priority: 10,
      isUnique: false
    });

    // Специальные селекторы для Angular компонентов
    if (this.detectFramework() === 'angular') {
      // Ищем родительский Angular компонент
      const angularComponent = this.findAngularComponent(element);
      if (angularComponent) {
        selectors.push({
          type: 'angular-component',
          value: angularComponent.name,
          selector: angularComponent.selector,
          priority: 3.5, // Высокий приоритет для Angular компонентов
          isUnique: angularComponent.isUnique,
          component: angularComponent
        });
      }
      
      // Специальная логика для app-select компонентов
      const appSelect = element.closest('app-select');
      if (appSelect) {
        const elementId = appSelect.getAttribute('elementid') || appSelect.getAttribute('ng-reflect-element-id');
        const label = appSelect.getAttribute('label') || appSelect.getAttribute('ng-reflect-label');
        const placeholder = appSelect.getAttribute('placeholder') || appSelect.getAttribute('ng-reflect-placeholder');
        
        // Ищем кликабельный элемент внутри app-select (обычно .select-box)
        const clickableElement = appSelect.querySelector('.select-box, [class*="select-box"], [class*="select"]');
        if (clickableElement) {
          // Генерируем селекторы для кликабельного элемента
          const clickableSelectors = this.generateAllSelectors(clickableElement);
          clickableSelectors.forEach(sel => {
            // Повышаем приоритет, если есть elementId или label
            if (elementId || label) {
              sel.priority = Math.min(sel.priority, 3);
            }
            selectors.push(sel);
          });
        }
        
        // Селектор по elementId + label (очень специфичный)
        if (elementId && label) {
          const specificSelector = `app-select[elementid="${elementId}"][label="${label}"], app-select[ng-reflect-element-id="${elementId}"][ng-reflect-label="${label}"]`;
          selectors.push({
            type: 'angular-component',
            value: 'app-select',
            selector: specificSelector,
            priority: 2.5, // Очень высокий приоритет
            isUnique: this.checkUniqueness(specificSelector),
            component: { elementId, label, placeholder }
          });
        }
      }
      
      // Поиск по label рядом с элементом
      const labelSelector = this.findLabelForElement(element);
      if (labelSelector) {
        selectors.push({
          type: 'label-based',
          value: labelSelector.labelText,
          selector: labelSelector.selector,
          priority: 4.5, // Высокий приоритет
          isUnique: labelSelector.isUnique,
          labelText: labelSelector.labelText
        });
      }
    }

    // Добавляем селекторы из внешних библиотек (OptimalSelect и все остальные)
    this.appendExternalSelectors(element, selectors);

    // === ИНТЕГРАЦИЯ С ОПТИМИЗАТОРОМ ===
    let finalSelectors = selectors;
    
    if (this.optimizer) {
      // Дедупликация
      finalSelectors = this.optimizer.deduplicateSelectors(finalSelectors);
      
      // Генерация XPath (если включено)
      if (this.optimizer.settings.generateXPath) {
        const xpath = this.optimizer.generateXPathSelector(element);
        if (xpath) {
          finalSelectors.push({
            type: 'xpath',
            value: xpath,
            selector: xpath,
            priority: 5.5,
            isUnique: true, // XPath обычно уникален
            source: 'SelectorOptimizer'
          });
        }
      }
      
      // Кэширование результата
      this.optimizer.setCachedSelectors(element, finalSelectors);
    }

    return finalSelectors;
  }

  /**
   * Получает лучший селектор с использованием оптимизатора
   */
  getBestSelector(element) {
    const selectors = this.generateAllSelectors(element);
    
    if (this.optimizer && this.optimizer.settings.smartSelectorScoring) {
      return this.optimizer.getBestSelector(selectors, element);
    }
    
    // Fallback - первый уникальный селектор с наименьшим приоритетом
    const uniqueSelectors = selectors.filter(s => s.isUnique);
    if (uniqueSelectors.length > 0) {
      uniqueSelectors.sort((a, b) => (a.priority || 10) - (b.priority || 10));
      return uniqueSelectors[0];
    }
    
    return selectors[0] || null;
  }

  /**
   * Валидация селектора через оптимизатор
   */
  validateSelector(selector) {
    if (this.optimizer) {
      return this.optimizer.validateSelector(selector);
    }
    return { isValid: true, issues: [] };
  }

  /**
   * Добавляет селектор FinderLite в начало списка
   */
  addFinderLiteSelector(element, selectors) {
    if (!window.FinderLite || typeof window.FinderLite.getSelector !== 'function') {
      return;
    }

    try {
      const finderSelector = window.FinderLite.getSelector(element, {
        root: document.body,
        maxDepth: 7,
        preferStableAttributes: true
      });

      if (finderSelector && !this.selectorAlreadyExists(selectors, finderSelector)) {
        selectors.unshift({
          type: 'finder-lite',
          value: finderSelector,
          selector: finderSelector,
          priority: 0.5,
          isUnique: this.checkUniqueness(finderSelector),
          source: 'FinderLite'
        });
      }
    } catch (error) {
      console.warn('FinderLite selector error:', error);
    }
  }

  /**
   * Добавляет селектор UniqueSelectorLite
   */
  addUniqueSelector(element, selectors) {
    if (!window.UniqueSelectorLite || typeof window.UniqueSelectorLite.find !== 'function') {
      return;
    }

    try {
      const uniqueSelector = window.UniqueSelectorLite.find(element, {
        root: document.body
      });
      if (uniqueSelector && !this.selectorAlreadyExists(selectors, uniqueSelector)) {
        selectors.unshift({
          type: 'unique-selector',
          value: uniqueSelector,
          selector: uniqueSelector,
          priority: 0.4,
          isUnique: this.checkUniqueness(uniqueSelector),
          source: 'UniqueSelectorLite'
        });
      }
    } catch (error) {
      console.warn('UniqueSelectorLite error:', error);
    }
  }

  /**
   * Проверяет, есть ли уже такой селектор
   */
  selectorAlreadyExists(list, selectorText) {
    if (!selectorText) return false;
    return list.some(item => item && item.selector === selectorText);
  }

  /**
   * Добавляет селекторы, сгенерированные внешними библиотеками
   */
  appendExternalSelectors(element, selectors) {
    // UniqueSelectorLite (fallback)
    try {
      if (window.UniqueSelectorLite && typeof window.UniqueSelectorLite.find === 'function') {
        const uniqueSelector = window.UniqueSelectorLite.find(element, { root: document.body });
        if (uniqueSelector && !this.selectorAlreadyExists(selectors, uniqueSelector)) {
          selectors.push({
            type: 'unique-selector',
            value: uniqueSelector,
            selector: uniqueSelector,
            priority: 0.6,
            isUnique: this.checkUniqueness(uniqueSelector),
            source: 'UniqueSelectorLite'
          });
        }
      }
    } catch (error) {
      console.warn('UniqueSelectorLite selector error:', error);
    }

    // FinderLite
    try {
      if (window.FinderLite && typeof window.FinderLite.getSelector === 'function') {
        const finderSelector = window.FinderLite.getSelector(element, {
          root: document.body,
          maxDepth: 7,
          preferStableAttributes: true
        });
        if (finderSelector && !this.selectorAlreadyExists(selectors, finderSelector)) {
          selectors.push({
            type: 'finder-lite',
            value: finderSelector,
            selector: finderSelector,
            priority: 0.7,
            isUnique: this.checkUniqueness(finderSelector),
            source: 'FinderLite'
          });
        }
      }
    } catch (error) {
      console.warn('FinderLite selector error:', error);
    }

    // OptimalSelectLite
    try {
      if (window.OptimalSelectLite && typeof window.OptimalSelectLite.select === 'function') {
        const optimalResult = window.OptimalSelectLite.select(element, {
          includeTag: true,
          includeNthChild: true
        });
        const optimalSelector = optimalResult?.selector;
        if (optimalSelector && !this.selectorAlreadyExists(selectors, optimalSelector)) {
          selectors.push({
            type: 'optimal-select',
            value: optimalSelector,
            selector: optimalSelector,
            priority: 0.8,
            isUnique: this.checkUniqueness(optimalSelector),
            meta: optimalResult,
            source: 'OptimalSelectLite'
          });
        }
      }
    } catch (error) {
      console.warn('OptimalSelectLite selector error:', error);
    }
  }

  /**
   * Находит label для элемента (по тексту label рядом с элементом)
   */
  findLabelForElement(element) {
    // Ищем label элемент рядом
    let current = element.parentElement;
    let depth = 0;
    const maxDepth = 5;
    
    while (current && depth < maxDepth) {
      // Ищем label с текстом
      const labels = current.querySelectorAll('label');
      for (const label of labels) {
        const labelText = label.textContent?.trim();
        if (labelText && labelText.length > 0) {
          // Проверяем, связан ли label с нашим элементом
          const forAttr = label.getAttribute('for');
          if (forAttr && element.id === forAttr) {
            // Label связан через for
            const selector = `label[for="${forAttr}"] + *, label[for="${forAttr}"] ~ *`;
            return {
              labelText: labelText,
              selector: selector,
              isUnique: this.checkUniqueness(selector)
            };
          }
          
          // Проверяем, находится ли элемент внутри label или рядом
          if (label.contains(element) || 
              (element.previousElementSibling === label) ||
              (label.nextElementSibling === element)) {
            // Ищем уникальный селектор для контейнера
            const container = label.parentElement;
            if (container) {
              // Пробуем найти по классу контейнера
              if (container.className) {
                const classes = container.className.split(' ').filter(c => c);
                for (const className of classes) {
                  if (className.includes('form') || className.includes('input') || className.includes('select')) {
                    const containerSelector = `.${this.escapeSelector(className)}`;
                    if (this.checkUniqueness(containerSelector)) {
                      return {
                        labelText: labelText,
                        selector: `${containerSelector} ${element.tagName.toLowerCase()}, ${containerSelector} .select-box, ${containerSelector} [class*="select"]`,
                        isUnique: true
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Ищем текст "Статус" или другой label текст в родителях
      const parentText = current.textContent?.trim() || '';
      if (parentText.includes('Статус') || parentText.includes('статус')) {
        // Нашли контейнер с текстом "Статус"
        if (current.className) {
          const classes = current.className.split(' ').filter(c => c);
          for (const className of classes) {
            if (className.includes('form') || className.includes('input') || className.includes('select') || className.includes('status')) {
              const containerSelector = `.${this.escapeSelector(className)}`;
              const isUnique = this.checkUniqueness(containerSelector);
              if (isUnique || className.includes('status')) {
                return {
                  labelText: 'Статус',
                  selector: `${containerSelector} .select-box, ${containerSelector} [class*="select-box"], ${containerSelector} app-select`,
                  isUnique: isUnique
                };
              }
            }
          }
        }
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return null;
  }

  /**
   * Находит Angular компонент для элемента
   */
  findAngularComponent(element) {
    let current = element;
    let depth = 0;
    const maxDepth = 10;

    while (current && depth < maxDepth) {
      // Проверяем, является ли элемент Angular компонентом
      if (current.tagName && current.tagName.includes('-') && current.tagName.length > 1) {
        // Это может быть кастомный элемент (Angular компонент)
        const componentName = current.tagName.toLowerCase();
        const selector = componentName;
        const isUnique = this.checkUniqueness(selector);
        
        // Проверяем атрибуты компонента
        const elementId = current.getAttribute('elementid') || current.getAttribute('ng-reflect-element-id');
        const label = current.getAttribute('label') || current.getAttribute('ng-reflect-label');
        const placeholder = current.getAttribute('placeholder') || current.getAttribute('ng-reflect-placeholder');
        
        // Для app-select ищем кликабельный элемент внутри
        if (componentName === 'app-select') {
          const clickableElement = current.querySelector('.select-box, [class*="select-box"], [class*="select"]');
          if (clickableElement) {
            // Возвращаем информацию о кликабельном элементе
            if (elementId) {
              const idSelector = `${componentName}[elementid="${elementId}"] .select-box, ${componentName}[ng-reflect-element-id="${elementId}"] .select-box, ${componentName}[elementid="${elementId}"] [class*="select-box"]`;
              return {
                name: componentName,
                selector: idSelector,
                isUnique: this.checkUniqueness(idSelector),
                elementId: elementId,
                label: label,
                placeholder: placeholder,
                clickableElement: clickableElement
              };
            }
            
            if (label) {
              const labelSelector = `${componentName}[label="${label}"] .select-box, ${componentName}[ng-reflect-label="${label}"] .select-box`;
              const isLabelUnique = this.checkUniqueness(labelSelector);
              if (isLabelUnique) {
                return {
                  name: componentName,
                  selector: labelSelector,
                  isUnique: true,
                  label: label,
                  placeholder: placeholder,
                  clickableElement: clickableElement
                };
              }
            }
          }
        }
        
        if (elementId) {
          const idSelector = `${componentName}[elementid="${elementId}"], ${componentName}[ng-reflect-element-id="${elementId}"]`;
          return {
            name: componentName,
            selector: idSelector,
            isUnique: this.checkUniqueness(idSelector),
            elementId: elementId,
            label: label,
            placeholder: placeholder
          };
        }
        
        if (label) {
          const labelSelector = `${componentName}[label="${label}"], ${componentName}[ng-reflect-label="${label}"]`;
          const isLabelUnique = this.checkUniqueness(labelSelector);
          if (isLabelUnique) {
            return {
              name: componentName,
              selector: labelSelector,
              isUnique: true,
              label: label,
              placeholder: placeholder
            };
          }
        }
        
        if (isUnique) {
          return {
            name: componentName,
            selector: selector,
            isUnique: true
          };
        }
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return null;
  }

  /**
   * Проверяет уникальность селектора
   */
  checkUniqueness(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1;
    } catch (e) {
      return false;
    }
  }

  /**
   * Выбирает лучший селектор из списка вариантов
   */
  selectBestSelector(selectors) {
    if (!selectors || selectors.length === 0) return null;

    // Сортируем по приоритету и уникальности
    const sorted = selectors.sort((a, b) => {
      // Сначала по уникальности
      if (a.isUnique && !b.isUnique) return -1;
      if (!a.isUnique && b.isUnique) return 1;
      // Затем по приоритету
      return a.priority - b.priority;
    });

    return sorted[0];
  }

  /**
   * Генерирует лучший селектор для элемента (основной метод)
   */
  generateSelector(element) {
    if (!element || !element.tagName) return null;

    // Генерируем все возможные варианты
    const allSelectors = this.generateAllSelectors(element);
    
    // Выбираем лучший
    const bestSelector = this.selectBestSelector(allSelectors);
    
    if (bestSelector) {
      console.log('🎯 Выбран селектор:', {
        type: bestSelector.type,
        selector: bestSelector.selector,
        priority: bestSelector.priority,
        isUnique: bestSelector.isUnique
      });
    }
    
    return bestSelector;
  }

  /**
   * Находит элемент по селектору с повторными попытками
   */
  findElement(selectorData, retries = 3, delay = 500) {
    if (!selectorData || !selectorData.selector) return null;

    const tryFind = () => {
      try {
        let element = null;

        switch (selectorData.type) {
          case 'data-testid':
          case 'data-cy':
          case 'data-test':
          case 'id':
          case 'name':
          case 'aria-label':
          case 'class':
          case 'css':
        case 'angular-component':
          // Убираем двойной # если он есть (для ID селекторов)
          let selector = selectorData.selector;
          if (selector && selector.startsWith('##')) {
            selector = selector.substring(1); // Убираем один #
            console.warn(`⚠️ [SelectorEngine] Обнаружен двойной # в селекторе, исправляю: ${selectorData.selector} → ${selector}`);
          }
          element = document.querySelector(selector);
          // Если не найден напрямую, пробуем найти через кликабельный элемент
          if (!element && selectorData.component && selectorData.component.clickableElement) {
            const appSelect = document.querySelector(selectorData.selector.replace(' .select-box', '').replace(' [class*="select-box"]', ''));
            if (appSelect) {
              element = appSelect.querySelector('.select-box, [class*="select-box"], [class*="select"]');
            }
          }
          break;
        case 'label-based':
          // Для label-based селекторов ищем элемент по селектору
          element = document.querySelector(selectorData.selector);
          break;

        case 'role-text':
          const roleElements = Array.from(document.querySelectorAll(selectorData.selector));
          element = roleElements.find(el => 
            this.getElementText(el).trim() === selectorData.text?.trim()
          );
          break;

        case 'tag-text':
          const tagElements = Array.from(document.querySelectorAll(selectorData.selector));
          element = tagElements.find(el => 
            this.getElementText(el).trim() === selectorData.text?.trim()
          );
          break;

          case 'tag-position':
            element = document.querySelector(selectorData.selector);
            break;

          default:
            // Пробуем как обычный CSS селектор
            element = document.querySelector(selectorData.selector);
        }

        return element;
      } catch (error) {
        console.error('Selector error:', error, selectorData);
        return null;
      }
    };

    // Первая попытка
    let element = tryFind();
    if (element) return element;

    // Повторные попытки для динамических приложений (React/Angular)
    if (retries > 0) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const found = tryFind();
          if (found || attempts >= retries) {
            clearInterval(interval);
            resolve(found);
          }
        }, delay);
      });
    }

    return element;
  }

  /**
   * Синхронная версия findElement (для обратной совместимости)
   */
  findElementSync(selectorData) {
    if (!selectorData || !selectorData.selector) return null;

    try {
      let element = null;

      switch (selectorData.type) {
        case 'data-testid':
        case 'data-cy':
        case 'data-test':
        case 'id':
        case 'name':
        case 'aria-label':
        case 'class':
        case 'css':
        case 'angular-component':
          element = document.querySelector(selectorData.selector);
          // Если не найден напрямую, пробуем найти через кликабельный элемент
          if (!element && selectorData.component && selectorData.component.clickableElement) {
            const appSelect = document.querySelector(selectorData.selector.replace(' .select-box', '').replace(' [class*="select-box"]', ''));
            if (appSelect) {
              element = appSelect.querySelector('.select-box, [class*="select-box"], [class*="select"]');
            }
          }
          break;
        case 'label-based':
          // Для label-based селекторов ищем элемент по селектору
          element = document.querySelector(selectorData.selector);
          break;

        case 'role-text':
          const roleElements = Array.from(document.querySelectorAll(selectorData.selector));
          element = roleElements.find(el => 
            this.getElementText(el).trim() === selectorData.text?.trim()
          );
          break;

        case 'tag-text':
          const tagElements = Array.from(document.querySelectorAll(selectorData.selector));
          element = tagElements.find(el => 
            this.getElementText(el).trim() === selectorData.text?.trim()
          );
          break;

        case 'tag-position':
          element = document.querySelector(selectorData.selector);
          break;

        default:
          element = document.querySelector(selectorData.selector);
      }

      return element;
    } catch (error) {
      console.error('Selector error:', error, selectorData);
      return null;
    }
  }

  /**
   * Получает текст элемента
   */
  getElementText(element) {
    if (!element) return '';

    // Для input элементов берем value или placeholder
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value || element.placeholder || '';
    }

    // Для других элементов берем textContent
    const text = element.textContent?.trim() || '';
    
    // Если текста нет, пробуем aria-label
    if (!text && element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }

    return text;
  }

  /**
   * Находит уникальный класс элемента
   */
  findUniqueClass(element, classes) {
    for (const className of classes) {
      const elements = document.querySelectorAll(`.${this.escapeSelector(className)}`);
      if (elements.length === 1) {
        return className;
      }
    }
    return null;
  }

  /**
   * Ищет альтернативные селекторы для элемента (родительские элементы)
   */
  findAlternativeSelectors(element, maxDepth = 3) {
    const alternatives = [];
    let current = element.parentElement;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Проверяем родительский элемент на наличие хороших селекторов
      if (current.id) {
        const selector = {
          type: 'id',
          value: current.id,
          selector: `#${this.escapeSelector(current.id)} > *`,
          priority: 4,
          isUnique: false,
          isParent: true,
          depth: depth
        };
        alternatives.push(selector);
      }

      if (current.dataset.testid) {
        const selector = {
          type: 'data-testid',
          value: current.dataset.testid,
          selector: `[data-testid="${this.escapeSelector(current.dataset.testid)}"] > *`,
          priority: 1,
          isUnique: false,
          isParent: true,
          depth: depth
        };
        alternatives.push(selector);
      }

      // Проверяем уникальные классы родителя
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ').filter(c => c);
        for (const className of classes) {
          if (this.checkUniqueness(`.${this.escapeSelector(className)}`)) {
            const selector = {
              type: 'class',
              value: className,
              selector: `.${this.escapeSelector(className)} > *`,
              priority: 8,
              isUnique: false,
              isParent: true,
              depth: depth
            };
            alternatives.push(selector);
            break;
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    return alternatives;
  }

  /**
   * Получает позицию элемента среди соседей
   */
  getElementPosition(element) {
    let position = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) {
        position++;
      }
      sibling = sibling.previousElementSibling;
    }
    return position;
  }

  /**
   * Экранирует специальные символы в селекторе
   */
  escapeSelector(str) {
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  /**
   * Проверяет, является ли селектор стабильным
   */
  isStableSelector(selectorData) {
    return selectorData.priority <= 7; // data-testid, data-cy, data-test, id, name, aria-label, role
  }
}

// Экспортируем для использования в других модулях
window.selectorEngine = new SelectorEngine();

