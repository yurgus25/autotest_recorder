/**
 * SmartWaiter - Система умных ожиданий вместо фиксированных задержек
 * Использует MutationObserver, проверки готовности элементов и Promise-based ожидания
 */

class SmartWaiter {
  constructor() {
    this.defaultTimeout = 2000; // Максимальное время ожидания по умолчанию
    this.checkInterval = 50; // Интервал проверки (мс)
  }

  /**
   * Умное ожидание появления элемента в DOM
   * @param {string|object} selector - Селектор или объект селектора
   * @param {object} options - Опции ожидания
   * @returns {Promise<Element|null>} - Найденный элемент или null
   */
  async waitForElement(selector, options = {}) {
    const {
      timeout = this.defaultTimeout,
      useMutationObserver = true,
      checkInterval = this.checkInterval
    } = options;

    const selectorString = typeof selector === 'string' 
      ? selector 
      : (selector?.selector || selector?.value || JSON.stringify(selector));

    // Первая попытка - сразу проверяем
    let element = this._findElement(selectorString);
    if (element) return element;

    if (!useMutationObserver) {
      // Fallback: polling
      return this._waitForElementPolling(selectorString, timeout, checkInterval);
    }

    // Используем MutationObserver для более быстрого обнаружения
    return this._waitForElementWithObserver(selectorString, timeout);
  }

  /**
   * Поиск элемента по селектору
   */
  _findElement(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  /**
   * Ожидание элемента через polling (fallback)
   */
  _waitForElementPolling(selector, timeout, interval) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        const element = this._findElement(selector);
        if (element) {
          resolve(element);
          return;
        }
        
        if (Date.now() - startTime >= timeout) {
          resolve(null);
          return;
        }
        
        setTimeout(check, interval);
      };
      check();
    });
  }

  /**
   * Ожидание элемента через MutationObserver
   */
  _waitForElementWithObserver(selector, timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let element = this._findElement(selector);
      
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        // Проверяем элемент после каждого изменения DOM
        element = this._findElement(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
          return;
        }

        // Проверяем таймаут
        if (Date.now() - startTime >= timeout) {
          observer.disconnect();
          resolve(null);
        }
      });

      // Начинаем наблюдение
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
      });

      // Таймаут на случай, если элемент не появится
      setTimeout(() => {
        observer.disconnect();
        element = this._findElement(selector);
        resolve(element);
      }, timeout);
    });
  }

  /**
   * Умное ожидание готовности элемента (visible, enabled, etc.)
   * @param {Element} element - Элемент для проверки
   * @param {object} options - Опции проверки
   * @returns {Promise<boolean>} - true если элемент готов
   */
  async waitForElementReady(element, options = {}) {
    if (!element) return false;

    const {
      timeout = this.defaultTimeout,
      checkInterval = this.checkInterval,
      visible = true,
      enabled = false,
      editable = false,
      hasOptions = false // Для dropdown
    } = options;

    const startTime = Date.now();

    const check = () => {
      if (Date.now() - startTime >= timeout) {
        return false;
      }

      // Проверка видимости
      if (visible && !this._isElementVisible(element)) {
        return null; // Продолжаем проверку
      }

      // Проверка enabled (для кнопок, input и т.д.)
      if (enabled && (element.disabled || element.hasAttribute('disabled'))) {
        return null; // Продолжаем проверку
      }

      // Проверка editable (для input, textarea)
      if (editable) {
        if (element.disabled || 
            element.readOnly || 
            element.hasAttribute('readonly') ||
            !this._isElementVisible(element)) {
          return null; // Продолжаем проверку
        }
      }

      // Проверка наличия опций (для dropdown)
      if (hasOptions) {
        if (!this._hasDropdownOptions(element)) {
          return null; // Продолжаем проверку
        }
      }

      return true; // Элемент готов
    };

    // Первая проверка
    let result = check();
    if (result === true) return true;
    if (result === false) return false;

    // Используем MutationObserver для отслеживания изменений
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const result = check();
        if (result === true) {
          observer.disconnect();
          resolve(true);
        } else if (result === false) {
          observer.disconnect();
          resolve(false);
        }
      });

      // Наблюдаем за изменениями элемента и его родителя
      if (element.parentNode) {
        observer.observe(element.parentNode, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['disabled', 'readonly', 'class', 'style']
        });
      }

      // Также наблюдаем за самим элементом
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['disabled', 'readonly', 'class', 'style']
      });

      // Polling fallback
      const pollingInterval = setInterval(() => {
        const result = check();
        if (result === true) {
          clearInterval(pollingInterval);
          observer.disconnect();
          resolve(true);
        } else if (result === false) {
          clearInterval(pollingInterval);
          observer.disconnect();
          resolve(false);
        }
      }, checkInterval);

      // Таймаут
      setTimeout(() => {
        clearInterval(pollingInterval);
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  /**
   * Умное ожидание появления dropdown панели
   * @param {Element} dropdownElement - Элемент dropdown
   * @param {object} options - Опции ожидания
   * @returns {Promise<Element|null>} - Найденная панель или null
   */
  async waitForDropdownPanel(dropdownElement, options = {}) {
    const {
      timeout = 2000,
      maxDistance = 500 // Максимальное расстояние от dropdown до панели (px)
    } = options;

    const startTime = Date.now();
    const dropdownRect = dropdownElement.getBoundingClientRect();

    const findPanel = () => {
      const panelSelectors = [
        '.dropdown-menu',
        '[role="listbox"]',
        '.select-options',
        '[class*="dropdown"]',
        '[class*="menu"]',
        '[class*="panel"]',
        '[class*="overlay"]',
        '.cdk-overlay-pane',
        '.mat-select-panel',
        '.ng-dropdown-panel'
      ];

      const panels = Array.from(document.querySelectorAll(panelSelectors.join(', ')));
      
      // Ищем панель рядом с dropdown
      for (const panel of panels) {
        const rect = panel.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || !panel.offsetParent) {
          continue; // Панель невидима
        }

        // Проверяем расстояние до dropdown
        const distance = Math.sqrt(
          Math.pow(rect.left - dropdownRect.left, 2) + 
          Math.pow(rect.top - dropdownRect.top, 2)
        );

        if (distance <= maxDistance) {
          // Проверяем наличие опций в панели
          const options = panel.querySelectorAll('li, div, span, [role="option"], .option');
          if (options.length > 0) {
            return panel;
          }
        }
      }

      return null;
    };

    // Первая проверка
    let panel = findPanel();
    if (panel) return panel;

    // Используем MutationObserver
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        panel = findPanel();
        if (panel) {
          observer.disconnect();
          resolve(panel);
          return;
        }

        if (Date.now() - startTime >= timeout) {
          observer.disconnect();
          resolve(null);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Таймаут
      setTimeout(() => {
        observer.disconnect();
        panel = findPanel();
        resolve(panel);
      }, timeout);
    });
  }

  /**
   * Умное ожидание установки значения в dropdown
   * @param {Element} dropdownElement - Элемент dropdown
   * @param {string} expectedValue - Ожидаемое значение
   * @param {object} options - Опции ожидания
   * @returns {Promise<boolean>} - true если значение установлено
   */
  async waitForDropdownValue(dropdownElement, expectedValue, options = {}) {
    const {
      timeout = 2000,
      checkInterval = 100
    } = options;

    const startTime = Date.now();
    const expectedLower = expectedValue.toLowerCase();

    const checkValue = () => {
      // Различные способы получения значения dropdown
      const valueSelectors = [
        '.result',
        '.result__content',
        '[id*="result"]',
        '[class*="result"]',
        '.select-box',
        'input[type="hidden"]'
      ];

      for (const sel of valueSelectors) {
        const element = dropdownElement.querySelector(sel);
        if (!element) continue;

        const text = element.textContent?.trim() || element.value || '';
        const textLower = text.toLowerCase();

        if (textLower === expectedLower || 
            textLower.includes(expectedLower) ||
            expectedLower.includes(textLower)) {
          // Проверяем, что это не placeholder
          if (!textLower.includes('выберите') && 
              !textLower.includes('select') &&
              !textLower.includes('choose')) {
            return true;
          }
        }
      }

      return false;
    };

    // Первая проверка
    if (checkValue()) return true;

    // Используем MutationObserver
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (checkValue()) {
          observer.disconnect();
          resolve(true);
          return;
        }

        if (Date.now() - startTime >= timeout) {
          observer.disconnect();
          resolve(false);
        }
      });

      observer.observe(dropdownElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['value', 'ng-reflect-value', 'data-value']
      });

      // Polling fallback
      const pollingInterval = setInterval(() => {
        if (checkValue()) {
          clearInterval(pollingInterval);
          observer.disconnect();
          resolve(true);
        } else if (Date.now() - startTime >= timeout) {
          clearInterval(pollingInterval);
          observer.disconnect();
          resolve(false);
        }
      }, checkInterval);

      // Таймаут
      setTimeout(() => {
        clearInterval(pollingInterval);
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  /**
   * Умное ожидание стабилизации URL (после редиректа)
   * @param {string} initialUrl - Начальный URL
   * @param {object} options - Опции ожидания
   * @returns {Promise<string>} - Финальный стабильный URL
   */
  async waitForUrlStable(initialUrl, options = {}) {
    const {
      timeout = 5000,
      stableChecks = 3, // Количество проверок с одинаковым URL
      checkInterval = 100
    } = options;

    let lastUrl = initialUrl;
    let stableCount = 0;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        const currentUrl = window.location.href;

        if (currentUrl !== lastUrl) {
          // URL изменился
          lastUrl = currentUrl;
          stableCount = 0;
        } else {
          // URL стабилен
          stableCount++;
          if (stableCount >= stableChecks) {
            resolve(currentUrl);
            return;
          }
        }

        if (Date.now() - startTime >= timeout) {
          resolve(currentUrl); // Возвращаем текущий URL даже если не стабилизировался
          return;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  /**
   * Умное ожидание загрузки страницы
   * @param {object} options - Опции ожидания
   * @returns {Promise<void>}
   */
  async waitForPageLoad(options = {}) {
    const {
      timeout = 5000,
      waitForAngular = true,
      waitForReact = true
    } = options;

    return new Promise((resolve) => {
      // Если страница уже загружена
      if (document.readyState === 'complete') {
        // Ждем инициализации фреймворков
        if (waitForAngular && window.ng) {
          // Angular - ждем стабилизации зоны
          setTimeout(resolve, 100);
        } else if (waitForReact && window.React) {
          // React - ждем рендеринга
          setTimeout(resolve, 100);
        } else {
          resolve();
        }
        return;
      }

      // Ждем события load
      window.addEventListener('load', () => {
        setTimeout(resolve, 100);
      }, { once: true });

      // Таймаут
      setTimeout(() => {
        resolve();
      }, timeout);
    });
  }

  /**
   * Проверка видимости элемента
   */
  _isElementVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && 
           rect.height > 0 && 
           element.offsetParent !== null &&
           window.getComputedStyle(element).visibility !== 'hidden' &&
           window.getComputedStyle(element).display !== 'none';
  }

  /**
   * Проверка наличия опций в dropdown
   */
  _hasDropdownOptions(element) {
    if (!element) return false;

    // Для стандартного SELECT
    if (element.tagName === 'SELECT') {
      return element.options && element.options.length > 0;
    }

    // Для кастомных dropdown
    const optionSelectors = [
      'option',
      '[role="option"]',
      '.option',
      '.mat-option',
      '.ng-option'
    ];

    for (const selector of optionSelectors) {
      try {
        const options = element.querySelectorAll(selector);
        if (options.length > 0) return true;
      } catch (e) {
        // Игнорируем ошибки
      }
    }

    // Проверяем overlay панели
    const overlayPanels = document.querySelectorAll(
      '.cdk-overlay-pane, .mat-select-panel, .ng-dropdown-panel, [role="listbox"]'
    );

    for (const panel of overlayPanels) {
      for (const selector of optionSelectors) {
        try {
          const options = panel.querySelectorAll(selector);
          if (options.length > 0) return true;
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    }

    return false;
  }

  /**
   * Минимальная задержка (для случаев, когда без задержки нельзя обойтись)
   * Используется только когда умное ожидание невозможно
   */
  async minimalDelay(ms = 0) {
    if (ms <= 0) return;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Экспортируем в window для использования в других модулях
window.SmartWaiter = SmartWaiter;








