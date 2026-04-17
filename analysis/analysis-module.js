/**
 * Analysis Module for AutoTest Recorder
 * Модуль анализа страниц с различными типами проверки
 * 
 * @version 1.0.0
 * @date 2026-02-25
 */

const AnalysisModule = {
  /**
   * Типы анализа
   */
  ANALYSIS_TYPES: {
    SELECTORS: 'analysis-selectors',
    FILL_FIELDS: 'analysis-fill-fields',
    VALIDATE: 'analysis-validate',
    FORMS: 'analysis-forms',
    LINKS: 'analysis-links',
    PERFORMANCE: 'analysis-performance',
    SECURITY: 'analysis-security-comprehensive'
  },

  /**
   * Приоритеты типов селекторов
   */
  SELECTOR_PRIORITIES: [
    'data-testid',
    'data-cy',
    'data-test',
    'id',
    'name',
    'aria-label',
    'role',
    'class',
    'tag'
  ],

  /**
   * Интерактивные элементы для анализа
   */
  INTERACTIVE_ELEMENTS: [
    'a', 'button', 'input', 'select', 'textarea', 
    '[onclick]', '[role="button"]', '[role="link"]',
    '[tabindex]', '[contenteditable="true"]'
  ],

  /**
   * Выполняет executeScript с повтором при ошибке "Frame was removed" (Chrome bfcache/prerender)
   */
  async _executeScriptWithRetry(target, func, args, opts = {}, maxRetries = 4) {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    await delay(200);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const params = { target, func, args, ...opts };
        return await chrome.scripting.executeScript(params);
      } catch (e) {
        const msg = (e?.message || '').toLowerCase();
        const isFrameRemoved = /frame.*removed|frame.*was removed/i.test(msg);
        if (isFrameRemoved && attempt < maxRetries) {
          const waitMs = attempt === 1 ? 1200 : 1000;
          console.warn(`⚠️ [AnalysisModule] Frame removed (попытка ${attempt}/${maxRetries}), повтор через ${waitMs}мс...`);
          await delay(waitMs);
          continue;
        }
        throw e;
      }
    }
  },

  /**
   * Находит селекторы для URL: точное совпадение или origin+pathname (без привязки к query/hash).
   * Позволяет переиспользовать селекторы при запуске на той же странице с другими параметрами.
   */
  _findCollectedSelectorsForUrl(collectedSelectors, url) {
    if (!collectedSelectors || typeof collectedSelectors !== 'object') return null;
    if (collectedSelectors[url] && Array.isArray(collectedSelectors[url]) && collectedSelectors[url].length > 0) {
      return collectedSelectors[url];
    }
    try {
      const urlObj = new URL(url);
      const base = urlObj.origin + urlObj.pathname;
      for (const [key, list] of Object.entries(collectedSelectors)) {
        if (!Array.isArray(list) || list.length === 0) continue;
        try {
          const keyObj = new URL(key);
          if (keyObj.origin + keyObj.pathname === base) return list;
        } catch {
          if (key.startsWith(base)) return list;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  },

  /**
   * Запуск анализа
   * @param {number} tabId - ID вкладки
   * @param {string} analysisType - Тип анализа
   * @param {Object} [options] - Дополнительные опции (fillOptions для analysis-fill-fields)
   * @returns {Promise<Object>}
   */
  async runAnalysis(tabId, analysisType, options = {}) {
    console.log(`🔍 [AnalysisModule] Starting ${analysisType} for tab ${tabId}`);

    try {
      if (typeof chrome === 'undefined' || !chrome.scripting) {
        return { success: false, error: 'chrome.scripting not available in this context' };
      }
      // Получаем информацию о вкладке
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      let analysisResult;

      // Для analysis-fill-fields: сначала получаем селекторы (текущая страница), затем заполняем по ним
      if (analysisType === 'analysis-fill-fields') {
        let selectorsResult;
        
        // Используем селекторы для текущей страницы: точное совпадение URL или origin+pathname (без привязки к query/hash)
        try {
          const stored = await chrome.storage.local.get(['collectedSelectors']);
          const collected = stored.collectedSelectors;
          const collectedData = collected && typeof collected === 'object'
            ? this._findCollectedSelectorsForUrl(collected, tab.url)
            : null;
          if (collectedData && collectedData.length > 0) {
            console.log(`✅ [AnalysisModule] Using ${collectedData.length} collected selectors for current page`);
            selectorsResult = {
              success: true,
              data: {
                selectors: collectedData.map(item => ({
                  selector: item.selector || item,
                  element: item.type || 'input',
                  text: item.label || '',
                  attributes: {}
                })),
                summary: { total: collectedData.length }
              }
            };
          }
        } catch (error) {
          console.warn('⚠️ [AnalysisModule] Could not load collected selectors:', error);
        }
        
        // Если нет селекторов для этой страницы — получаем заново (тест можно запускать на любой странице с похожими полями)
        if (!selectorsResult) {
          console.log('📍 [AnalysisModule] No selectors for this page, running analysis-selectors on current tab...');
          selectorsResult = await this.runAnalysis(tabId, 'analysis-selectors');
        }
        
        if (!selectorsResult.success || !selectorsResult.data?.selectors) {
          return { success: false, error: 'Не удалось получить селекторы для заполнения полей' };
        }
        const inputSelectors = selectorsResult.data.selectors.filter(s =>
          ['input', 'select', 'textarea', 'app-select', 'app-group-item-select', 'div'].includes((s.element || '').toLowerCase())
        );
        if (inputSelectors.length === 0) {
          return {
            success: true,
            data: {
              fields: [],
              summary: { total: 0, byType: {}, required: 0, empty: 0, filled: 0, validationErrors: 0 },
              validationErrors: [],
              metadata: { tabId, url: tab.url, title: tab.title, timestamp: new Date().toISOString(), analysisType }
            }
          };
        }
        const fillOptions = options.fillOptions || {};
        // КРИТИЧНО: Загрузить globalFieldRules ДО executeScript
        // т.к. injected функция не имеет доступа к chrome.storage
        let globalFieldRules = {};
        try {
          const stored = await chrome.storage.local.get(['globalFieldRules']);
          globalFieldRules = stored.globalFieldRules || {};
          console.log(`✅ [AnalysisModule] Loaded ${Object.keys(globalFieldRules).length} global field rules`);
        } catch (error) {
          console.warn('⚠️ [AnalysisModule] Could not load globalFieldRules:', error);
        }
        
        const results = await this._executeScriptWithRetry(
          { tabId },
          this._getFillBySelectorsFunction(),
          [inputSelectors, fillOptions, globalFieldRules]
        );
        if (!results || !results[0]) {
          throw new Error('Fill fields script failed to execute');
        }
        const fillResult = results[0].result;
        const fillError = results[0].error;
        if (!fillResult || typeof fillResult !== 'object') {
          // Вместо выброса возвращаем валидный пустой результат — adaptive может продолжить
          const errMsg = fillError || 'Fill fields returned no results';
          console.warn(`⚠️ [AnalysisModule] ${errMsg}, returning empty result`);
          analysisResult = {
            fields: [],
            summary: { total: 0, byType: {}, required: 0, empty: 0, filled: 0, validationErrors: 0 },
            validationErrors: [],
            _fillError: errMsg
          };
        } else {
          analysisResult = fillResult;
        }
      } else if (analysisType === 'fill-single-dropdown') {
        const { containerSelector, targetValue } = options;
        if (!containerSelector || !targetValue) {
          return { success: false, error: 'fill-single-dropdown requires containerSelector and targetValue' };
        }
        const results = await this._executeScriptWithRetry(
          { tabId },
          this._getFillSingleDropdownFunction(),
          [containerSelector, String(targetValue)],
          { world: 'MAIN' }
        );
        if (!results || !results[0]) {
          return { success: false, error: 'fill-single-dropdown script failed' };
        }
        const r = results[0].result;
        analysisResult = r && typeof r === 'object' ? r : { success: false, error: 'No result' };
      } else {
        const args = [analysisType];
        const results = await this._executeScriptWithRetry(
          { tabId },
          this._getAnalysisFunction(analysisType),
          args
        );
        if (!results || !results[0] || !results[0].result) {
          throw new Error('Analysis returned no results');
        }
        analysisResult = results[0].result;
      }
      
      // Для analysis-links: HTTP-проверка доступности ссылок в background
      if (analysisType === 'analysis-links' && analysisResult.links) {
        analysisResult = await this._checkLinksHttpStatus(analysisResult);
      }
      
      // Добавляем метаданные
      analysisResult.metadata = {
        tabId,
        url: tab.url,
        title: tab.title,
        timestamp: new Date().toISOString(),
        analysisType
      };

      if (analysisType === 'fill-single-dropdown' && analysisResult.success === false) {
        return { success: false, error: analysisResult.error || 'Dropdown fill failed' };
      }
      console.log(`✅ [AnalysisModule] Analysis complete:`, analysisResult.summary || analysisResult.success);
      
      return {
        success: true,
        data: analysisResult
      };

    } catch (error) {
      console.error(`❌ [AnalysisModule] Analysis failed:`, error);
      const isFrameRemoved = /frame.*removed|frame.*was removed/i.test(error?.message || '');
      if (isFrameRemoved) {
        console.warn(`⚠️ [AnalysisModule] Frame removed после повторов. Возвращаю пустой результат для продолжения.`);
        let tabUrl = '';
        try { tabUrl = (await chrome.tabs.get(tabId))?.url || ''; } catch (_) {}
        const metadata = { tabId, url: tabUrl, title: '', timestamp: new Date().toISOString(), analysisType };
        if (analysisType === 'analysis-fill-fields') {
          return {
            success: true,
            data: {
              fields: [],
              summary: { total: 0, byType: {}, required: 0, empty: 0, filled: 0, validationErrors: 0 },
              validationErrors: [],
              _fillError: 'Frame was removed',
              metadata
            }
          };
        }
        if (analysisType === 'analysis-selectors') {
          return {
            success: true,
            data: {
              selectors: [],
              summary: { total: 0 },
              metadata
            }
          };
        }
        return {
          success: true,
          data: { _error: 'Frame was removed', metadata }
        };
      }
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * HTTP-проверка доступности ссылок (выполняется в background)
   * @param {Object} linkResult - Результат analysis-links из страницы
   * @returns {Promise<Object>}
   */
  async _checkLinksHttpStatus(linkResult) {
    const LINKS_LIMIT = 50;
    const FETCH_TIMEOUT_MS = 5000;
    const PARALLEL_LIMIT = 5;

    const links = linkResult.links || [];
    const fetchable = links.filter(l => l.isFetchable);
    const uniqueUrls = [...new Set(fetchable.map(l => l.href))];
    const toCheck = uniqueUrls.slice(0, LINKS_LIMIT);

    const statusMap = {};
    const checkOne = async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
          mode: 'cors'
        });
        clearTimeout(timeoutId);
        const status = res.status;
        const isLive = status >= 200 && status < 400;
        return { status, isLive };
      } catch (e) {
        const isAbort = e.name === 'AbortError';
        return { status: isAbort ? 'timeout' : 'error', isLive: false };
      }
    };

    // Параллельно по PARALLEL_LIMIT
    for (let i = 0; i < toCheck.length; i += PARALLEL_LIMIT) {
      const batch = toCheck.slice(i, i + PARALLEL_LIMIT);
      const results = await Promise.all(batch.map(url => checkOne(url)));
      batch.forEach((url, j) => {
        statusMap[url] = results[j];
      });
    }

    let liveCount = 0;
    let brokenCount = 0;
    for (const url of toCheck) {
      const s = statusMap[url];
      if (s.isLive) liveCount++;
      else brokenCount++;
    }

    const updatedLinks = links.map(link => {
      if (!link.isFetchable) {
        const isLive = link.isEmpty ? false : null;
        return { ...link, status: link.isEmpty ? 'empty' : 'skipped', isLive };
      }
      const cached = statusMap[link.href];
      if (cached) {
        return { ...link, status: cached.status, isLive: cached.isLive };
      }
      return { ...link, status: 'skipped', isLive: null };
    });

    return {
      ...linkResult,
      links: updatedLinks,
      summary: {
        ...linkResult.summary,
        live: liveCount,
        broken: brokenCount,
        checked: toCheck.length
      }
    };
  },

  /**
   * Получение функции анализа по типу
   * @param {string} analysisType - Тип анализа
   * @returns {Function}
   */
  _getAnalysisFunction(analysisType) {
    const self = this;
    
    return function(type, fillOptions) {
      // Внутренние утилиты
      const utils = {
        escapeSelector(str) {
          return str.replace(/([!"#$%&'()*+,.\\/:;<=>?@[\]^`{|}~])/g, '\\$1');
        },

        checkUniqueness(selector) {
          try {
            return document.querySelectorAll(selector).length === 1;
          } catch {
            return false;
          }
        },

        getElementText(element) {
          if (!element) return '';
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            return element.value || element.placeholder || '';
          }
          const text = element.textContent?.trim() || '';
          if (!text && element.getAttribute('aria-label')) {
            return element.getAttribute('aria-label');
          }
          return text.substring(0, 100);
        },

        isVisible(element) {
          if (!element) return false;
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0';
        },

        isInteractive(element) {
          const tagName = element.tagName.toLowerCase();
          const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
          const hasClickHandler = element.onclick || element.getAttribute('onclick');
          const hasRole = element.getAttribute('role') === 'button' || 
                         element.getAttribute('role') === 'link';
          const isContentEditable = element.contentEditable === 'true';
          const hasTabindex = element.hasAttribute('tabindex');
          
          return interactiveTags.includes(tagName) || 
                 hasClickHandler || hasRole || isContentEditable || hasTabindex;
        },

        generateSelector(element) {
          const selectors = [];
          
          // data-testid
          if (element.dataset?.testid) {
            const sel = `[data-testid="${element.dataset.testid}"]`;
            selectors.push({
              type: 'data-testid',
              value: element.dataset.testid,
              selector: sel,
              priority: 1,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // data-cy
          if (element.dataset?.cy) {
            const sel = `[data-cy="${element.dataset.cy}"]`;
            selectors.push({
              type: 'data-cy',
              value: element.dataset.cy,
              selector: sel,
              priority: 2,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // data-test
          if (element.dataset?.test) {
            const sel = `[data-test="${element.dataset.test}"]`;
            selectors.push({
              type: 'data-test',
              value: element.dataset.test,
              selector: sel,
              priority: 3,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // data-qa, data-automation (как в SelectorEngine / Инспектор селекторов)
          if (element.dataset?.qa) {
            const sel = `[data-qa="${utils.escapeSelector(element.dataset.qa)}"]`;
            selectors.push({
              type: 'data-qa',
              value: element.dataset.qa,
              selector: sel,
              priority: 3.5,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          if (element.dataset?.automation) {
            const sel = `[data-automation="${utils.escapeSelector(element.dataset.automation)}"]`;
            selectors.push({
              type: 'data-automation',
              value: element.dataset.automation,
              selector: sel,
              priority: 3.6,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // app-select и app-group-item-select: elementid + label + formControlName + fallback по placeholder
          if (element.tagName === 'APP-SELECT' || element.tagName === 'APP-GROUP-ITEM-SELECT') {
            const tag = element.tagName.toLowerCase();
            const elementId = element.getAttribute('elementid') || element.getAttribute('ng-reflect-element-id');
            const label = element.getAttribute('label') || element.getAttribute('ng-reflect-label');
            const formControlName = element.getAttribute('formcontrolname') || element.getAttribute('ng-reflect-name') || element.getAttribute('ng-reflect-form-control-name');
            const prefix = tag;
            if (elementId) {
              const sel = `${prefix}[elementid="${utils.escapeSelector(elementId)}"], ${prefix}[ng-reflect-element-id="${utils.escapeSelector(elementId)}"]`;
              if (utils.checkUniqueness(sel)) {
                selectors.push({ type: prefix + '-id', value: elementId, selector: sel, priority: 3.7, isUnique: true });
              }
            }
            if (label) {
              const sel = `${prefix}[label="${utils.escapeSelector(label)}"], ${prefix}[ng-reflect-label="${utils.escapeSelector(label)}"]`;
              if (utils.checkUniqueness(sel)) {
                selectors.push({ type: prefix + '-label', value: label, selector: sel, priority: 3.8, isUnique: true });
              }
            }
            if (formControlName && !selectors.some(s => s.type && s.type.startsWith(prefix))) {
              const sel = `${prefix}[formcontrolname="${utils.escapeSelector(formControlName)}"], ${prefix}[ng-reflect-name="${utils.escapeSelector(formControlName)}"]`;
              if (utils.checkUniqueness(sel)) {
                selectors.push({ type: prefix + '-name', value: formControlName, selector: sel, priority: 3.9, isUnique: true });
              }
            }
            if (!selectors.some(s => s.type && s.type.startsWith(prefix))) {
              const inputInside = element.querySelector('input[placeholder]');
              const ph = inputInside?.getAttribute('placeholder') || '';
              if (ph && ph.length > 3 && ph.length < 80) {
                const escaped = utils.escapeSelector(ph);
                try {
                  const sel = `${prefix}:has(input[placeholder="${escaped}"])`;
                  if (document.querySelector(sel) === element) {
                    selectors.push({ type: prefix + '-placeholder', value: ph.substring(0, 30), selector: sel, priority: 4.5, isUnique: true });
                  }
                } catch (e) {}
                const phPart = ph.substring(0, 25).replace(/["\\]/g, '\\$&');
                try {
                  const sel2 = `${prefix}:has(input[placeholder*="${phPart}"])`;
                  if (document.querySelector(sel2) === element) {
                    selectors.push({ type: prefix + '-placeholder', value: phPart, selector: sel2, priority: 4.6, isUnique: true });
                  }
                } catch (e2) {}
              }
            }
          }
          
          // id
          if (element.id) {
            const sel = '#' + utils.escapeSelector(element.id);
            selectors.push({
              type: 'id',
              value: element.id,
              selector: sel,
              priority: 4,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // name
          if (element.name) {
            const sel = `[name="${utils.escapeSelector(element.name)}"]`;
            selectors.push({
              type: 'name',
              value: element.name,
              selector: sel,
              priority: 5,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // aria-label
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel) {
            const sel = `[aria-label="${utils.escapeSelector(ariaLabel)}"]`;
            selectors.push({
              type: 'aria-label',
              value: ariaLabel,
              selector: sel,
              priority: 6,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // title, placeholder (как в Инспекторе)
          const title = element.getAttribute('title');
          if (title) {
            const sel = `[title="${utils.escapeSelector(title)}"]`;
            selectors.push({
              type: 'title',
              value: title,
              selector: sel,
              priority: 6.1,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          const placeholder = element.getAttribute('placeholder');
          if (placeholder) {
            const sel = `[placeholder="${utils.escapeSelector(placeholder)}"]`;
            selectors.push({
              type: 'placeholder',
              value: placeholder,
              selector: sel,
              priority: 6.2,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // role
          const role = element.getAttribute('role');
          if (role) {
            const sel = `[role="${role}"]`;
            selectors.push({
              type: 'role',
              value: role,
              selector: sel,
              priority: 7,
              isUnique: utils.checkUniqueness(sel)
            });
          }
          
          // class: приоритет стабильным классам (как в SelectorEngine / Инспектор)
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(' ').filter(c => c && !c.match(/^[0-9]/));
            const dynamicClassPatterns = [
              /^ng-/, /^css-[\da-z]+$/i, /^sc-[a-z0-9]+$/i, /^emotion-[a-z0-9]+$/i,
              /^_[a-z0-9]+$/i, /^[a-z0-9]{8,}$/i
            ];
            const stableClasses = classes.filter(c => !dynamicClassPatterns.some(p => p.test(c)));
            for (const className of stableClasses.length ? stableClasses : classes) {
              const sel = '.' + utils.escapeSelector(className);
              if (utils.checkUniqueness(sel)) {
                selectors.push({
                  type: 'class',
                  value: className,
                  selector: sel,
                  priority: stableClasses.includes(className) ? 8 : 8.5,
                  isUnique: true
                });
                break;
              }
            }
          }
          
          // CSS path как fallback
          if (selectors.length === 0 || !selectors.some(s => s.isUnique)) {
            const cssPath = utils.getCssPath(element);
            if (cssPath) {
              selectors.push({
                type: 'css',
                value: cssPath,
                selector: cssPath,
                priority: 9,
                isUnique: utils.checkUniqueness(cssPath)
              });
            }
          }
          
          return selectors;
        },

        /** Выбор лучшего селектора (логика как в SelectorEngine.selectBestSelector / Инспектор селекторов) */
        selectBestSelector(candidates) {
          if (!candidates || candidates.length === 0) return null;
          const sorted = candidates.slice().sort((a, b) => {
            if (a.isUnique && !b.isUnique) return -1;
            if (!a.isUnique && b.isUnique) return 1;
            return a.priority - b.priority;
          });
          return sorted[0];
        },

        getCssPath(element) {
          const path = [];
          let current = element;
          
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
              selector = '#' + utils.escapeSelector(current.id);
              path.unshift(selector);
              break;
            }
            
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.split(' ').filter(c => c && !c.match(/^[0-9]/));
              if (classes.length > 0) {
                selector += '.' + classes.map(c => utils.escapeSelector(c)).join('.');
              }
            }
            
            const siblings = current.parentElement?.children;
            if (siblings && siblings.length > 1) {
              const index = Array.from(siblings).indexOf(current) + 1;
              selector += `:nth-child(${index})`;
            }
            
            path.unshift(selector);
            current = current.parentElement;
          }
          
          return path.join(' > ');
        },

        calculateQuality(selector, element) {
          let score = 50;
          
          // Бонусы за тип селектора (как в SelectorEngine / Инспектор)
          if (selector.type === 'data-testid') score += 30;
          else if (selector.type === 'data-cy' || selector.type === 'data-qa') score += 25;
          else if (selector.type === 'data-test' || selector.type === 'data-automation') score += 22;
          else if (selector.type === 'id') score += 20;
          else if (selector.type === 'name') score += 15;
          else if (selector.type === 'aria-label' || selector.type === 'title') score += 10;
          else if (selector.type === 'placeholder' || selector.type === 'role') score += 8;
          else if (selector.type === 'class') score += 5;
          
          // Бонус за уникальность
          if (selector.isUnique) score += 20;
          
          // Штраф за длину
          if (selector.selector.length > 50) score -= 10;
          if (selector.selector.length > 100) score -= 10;
          
          // Штраф за динамические паттерны
          if (selector.value?.match(/[0-9]{4,}/)) score -= 20;
          if (selector.value?.match(/[a-f0-9]{8}-[a-f0-9]{4}/i)) score -= 30;
          
          return Math.max(0, Math.min(100, score));
        }
      };

      // Функции анализа
      const analyzers = {
        // 1. Получение всех селекторов
        'analysis-selectors': function() {
          const elements = document.querySelectorAll(
            'a, button, input, select, textarea, app-select, app-group-item-select, div.placeholder, div[class*="placeholder"], [onclick], [role="button"], [role="link"], [tabindex]'
          );
          
          const selectors = [];
          const seen = new Set();
          
          elements.forEach(element => {
            if (!utils.isVisible(element)) return;
            if (element.matches?.('div.placeholder, div[class*="placeholder"]')) {
              if (!/выберите/i.test((element.textContent || '').trim())) return;
            }
            
            const generated = utils.generateSelector(element);
            if (generated.length === 0) return;
            
            const best = utils.selectBestSelector(generated);
            if (!best) return;
            
            const key = best.selector;
            if (seen.has(key)) return;
            seen.add(key);
            
            // В списке — только лучшие селекторы; длинные хрупкие CSS не добавляем (как в Инспекторе)
            if (best.type === 'css') {
              const nthCount = (best.selector.match(/:nth-child/g) || []).length;
              if (best.selector.length > 150 || nthCount > 2) return;
            }
            
            const quality = utils.calculateQuality(best, element);
            
            selectors.push({
              selector: best.selector,
              type: best.type,
              value: best.value,
              element: element.tagName.toLowerCase(),
              text: utils.getElementText(element),
              inputType: element.type || null,
              quality,
              isUnique: best.isUnique,
              attributes: {
                id: element.id || null,
                name: element.name || null,
                className: element.className || null,
                placeholder: element.placeholder || null
              }
            });

            // Добавляем селекторы для прямых потомков (div, span) — чтобы в списке были варианты вида ".block a div"
            const childTags = ['div', 'span'];
            for (const child of element.children) {
              if (!child || child.nodeType !== 1) continue;
              const tag = child.tagName.toLowerCase();
              if (!childTags.includes(tag) || !utils.isVisible(child)) continue;
              // Пробуем короткую форму с пробелами (например ".reasoning-section__item_id_alice_tile a div")
              const parentWithSpaces = best.selector.replace(/\s*>\s*/g, ' ');
              const descendantSel = (utils.checkUniqueness(parentWithSpaces + ' ' + tag)
                ? parentWithSpaces + ' ' + tag
                : best.selector + ' ' + tag);
              if (seen.has(descendantSel)) continue;
              if (!utils.checkUniqueness(descendantSel)) continue;
              seen.add(descendantSel);
              const childQuality = Math.max(0, quality - 10);
              selectors.push({
                selector: descendantSel,
                type: 'css',
                value: descendantSel,
                element: tag,
                text: utils.getElementText(child),
                inputType: null,
                quality: childQuality,
                isUnique: true,
                attributes: {
                  id: child.id || null,
                  name: child.name || null,
                  className: child.className || null,
                  placeholder: child.placeholder || null
                }
              });
            }
          });
          
          return {
            selectors,
            summary: {
              total: selectors.length,
              byType: selectors.reduce((acc, s) => {
                acc[s.type] = (acc[s.type] || 0) + 1;
                return acc;
              }, {}),
              unique: selectors.filter(s => s.isUnique).length,
              highQuality: selectors.filter(s => s.quality >= 80).length
            }
          };
        },

        // 2. Анализ полей для заполнения (с опциональным заполнением)
        'analysis-fill-fields': function(fillOptions) {
          const inputs = document.querySelectorAll('input, textarea, select');
          const fields = [];
          const fillMode = fillOptions?.fillMode || 'random';
          const charCount = Math.min(1000, Math.max(1, fillOptions?.charCount || 10));
          const charsetPreset = fillOptions?.charset || 'lettersAndNumbers';
          const fillTarget = fillOptions?.fillTarget || 'all';
          
          // НОВОЕ: Настройки области применения
          const scopeMode = fillOptions?.scopeMode || 'current'; // 'current', 'all-steps', 'selected-steps'
          const selectedSteps = fillOptions?.selectedSteps || []; // Массив номеров шагов для scopeMode='selected-steps'
          const currentStepIndex = fillOptions?.currentStepIndex || 0;

          const CHARSETS = {
            letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            lettersAndNumbers: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            lettersNumbersSpace: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
            alphanumeric: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
          };
          const charset = (charsetPreset === 'custom' && fillOptions?.customCharset)
            ? fillOptions.customCharset
            : (CHARSETS[charsetPreset] || CHARSETS.lettersAndNumbers);

          const randomStr = (len, chars) => {
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return s;
          };

          const validationErrors = [];
          const fillReports = []; // НОВОЕ: Детальные отчёты о заполнении
          let filledCount = 0;

          // НОВАЯ ФУНКЦИЯ: Проверка validation messages после заполнения
          const checkValidationMessage = (input) => {
            // Ищем validation message рядом с полем
            const messages = [];
            
            // 1. Стандартный HTML5 validationMessage
            if (input.validationMessage) {
              messages.push({
                type: 'html5',
                text: input.validationMessage,
                element: input
              });
            }
            
            // 2. aria-describedby (связанные сообщения)
            const describedBy = input.getAttribute('aria-describedby');
            if (describedBy) {
              describedBy.split(' ').forEach(id => {
                const el = document.getElementById(id);
                if (el && el.textContent.trim()) {
                  messages.push({
                    type: 'aria-describedby',
                    text: el.textContent.trim(),
                    element: el
                  });
                }
              });
            }
            
            // 3. Поиск error/validation элементов рядом
            const parent = input.closest('div, fieldset, form, label');
            if (parent) {
              const errorEls = parent.querySelectorAll('.error, .invalid, .validation-error, [role="alert"], .field-error, .help-block.error');
              errorEls.forEach(el => {
                if (el.textContent.trim() && utils.isVisible(el)) {
                  messages.push({
                    type: 'css-error',
                    text: el.textContent.trim(),
                    element: el
                  });
                }
              });
            }
            
            // 4. Проверка title с ограничениями
            if (input.title && /max|limit|символ|character/i.test(input.title)) {
              messages.push({
                type: 'title',
                text: input.title,
                element: input
              });
            }
            
            return messages;
          };

          // НОВАЯ ФУНКЦИЯ: Извлечение максимального количества символов из сообщения
          const extractMaxLengthFromMessage = (message) => {
            // Паттерны: "максимум 250 символов", "max 100 characters", "до 50 символов"
            const patterns = [
              /максимум\s+(\d+)/i,
              /max(?:imum)?\s+(\d+)/i,
              /до\s+(\d+)/i,
              /limit\s+(\d+)/i,
              /не\s+более\s+(\d+)/i,
              /(\d+)\s+symbol/i,
              /(\d+)\s+character/i,
              /(\d+)\s+chars?/i
            ];
            
            for (const pattern of patterns) {
              const match = message.match(pattern);
              if (match && match[1]) {
                return parseInt(match[1], 10);
              }
            }
            return null;
          };

          // НОВАЯ ФУНКЦИЯ: Умное заполнение с проверкой validation
          const smartFillField = (input, fieldMeta, initialValue) => {
            let finalValue = initialValue;
            let attemptedValue = initialValue;
            let adjustmentReason = null;
            let validationMessages = [];
            let maxAttempts = 3;
            let attempt = 0;
            
            while (attempt < maxAttempts) {
              attempt++;
              
              // Устанавливаем значение
              input.focus();
              input.value = finalValue;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.blur();
              
              // Небольшая задержка для появления validation messages
              // (в синхронном коде используем setTimeout с промисом, но здесь упрощаем)
              
              // Проверяем validation messages
              const messages = checkValidationMessage(input);
              validationMessages = messages;
              
              if (messages.length === 0) {
                // Успешно заполнено без ошибок
                break;
              }
              
              // Есть сообщения об ошибках - пытаемся исправить
              let needAdjustment = false;
              let newMaxLength = null;
              
              messages.forEach(msg => {
                const msgText = msg.text.toLowerCase();
                
                // Проверка на превышение лимита
                if (/max|limit|exceed|превыш|больше|более/.test(msgText)) {
                  const extractedLimit = extractMaxLengthFromMessage(msg.text);
                  if (extractedLimit && extractedLimit < finalValue.length) {
                    newMaxLength = extractedLimit;
                    needAdjustment = true;
                    adjustmentReason = `Превышен лимит поля: ${msg.text}`;
                  }
                }
              });
              
              if (needAdjustment && newMaxLength) {
                // Уменьшаем значение до допустимого
                finalValue = finalValue.substring(0, newMaxLength);
                attemptedValue = initialValue;
                
                // Повторяем попытку
                continue;
              } else {
                // Не можем автоматически исправить - выходим
                break;
              }
            }
            
            return {
              finalValue,
              attemptedValue,
              adjustmentReason,
              validationMessages,
              attempts: attempt,
              success: validationMessages.length === 0 || 
                      validationMessages.every(m => /successfully|успешно|заполнен|filled/i.test(m.text))
            };
          };

          inputs.forEach(input => {
            if (!utils.isVisible(input)) return;
            if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return;
            
            const generated = utils.generateSelector(input);
            const best = generated[0];
            const maxLen = input.maxLength > 0 ? input.maxLength : (input.tagName === 'TEXTAREA' ? 524288 : 524288);
            const minVal = input.min !== undefined && input.min !== '' ? parseFloat(input.min) : null;
            const maxVal = input.max !== undefined && input.max !== '' ? parseFloat(input.max) : null;
            
            const fieldMeta = {
              selector: best?.selector || '',
              type: input.type || input.tagName.toLowerCase(),
              name: input.name || '',
              id: input.id || '',
              placeholder: input.placeholder || '',
              label: input.labels?.[0]?.textContent || input.getAttribute('aria-label') || '',
              required: input.required,
              value: input.value || '',
              maxLength: maxLen,
              min: minVal,
              max: maxVal,
              pattern: input.pattern || null,
              options: input.tagName === 'SELECT' ? 
                Array.from(input.options).map(o => ({ value: o.value, text: o.text })) : null
            };
            fields.push(fieldMeta);

            // Определяем нужно ли заполнять поле
            const isEmpty = !input.value || String(input.value).trim() === '';
            const isRequired = !!input.required ||
              input.getAttribute('aria-required') === 'true' ||
              !!input.closest?.('[required]');
            
            // НОВОЕ: Учитываем настройку overwriteFilled
            const overwriteFilled = fillOptions?.overwriteFilled !== undefined 
              ? fillOptions.overwriteFilled 
              : false; // По умолчанию НЕ перезаписываем
            
            let shouldFill = false;
            
            if (fillTarget === 'all') {
              // Режим "Все поля"
              shouldFill = isEmpty || overwriteFilled;
            } else if (fillTarget === 'required') {
              // Режим "Только обязательные"
              shouldFill = isRequired && (isEmpty || overwriteFilled);
            } else {
              // Режим "Только пустые" (по умолчанию)
              shouldFill = isEmpty;
            }
            
            if (!shouldFill) {
              // Пропускаем поле, но логируем в отчёт
              fillReports.push({
                selector: fieldMeta.selector,
                type: type,
                label: fieldMeta.label || fieldMeta.name,
                skipped: true,
                reason: isEmpty ? 'fillTarget не совпадает' : 'Поле уже заполнено (overwriteFilled=false)',
                currentValue: input.value,
                report: `Поле "${fieldMeta.label || fieldMeta.name}" пропущено: ${isEmpty ? 'не подходит под fillTarget' : 'уже заполнено, overwriteFilled отключен'}`
              });
              return;
            }

            let valueToSet = '';
            const tag = input.tagName.toLowerCase();
            const type = (input.type || 'text').toLowerCase();
            const idNameLabel = `${fieldMeta.id} ${fieldMeta.name} ${fieldMeta.label}`.toLowerCase();
            const plRaw = fieldMeta.placeholder || input.getAttribute?.('placeholder') || input.getAttribute?.('ng-reflect-placeholder') || '';
            const plLower = plRaw.toLowerCase();
            const isDateLikeText = (type === 'text') && (
              /\bdate\b/i.test(idNameLabel) ||
              /дата|срок|согласовать|deadline|receive|контрольн|period|calendar/i.test(idNameLabel) ||
              /дд\.мм\.гггг|dd\.mm\.yyyy|datepicker|date-picker/i.test(plLower) ||
              /datepicker|date-picker|mat-datepicker/i.test((input.className || '') + ' ' + (input.getAttribute?.('ng-reflect-type') || ''))
            );
            const isDateType = ['date', 'datetime-local', 'month', 'week'].includes(type) || isDateLikeText;

            if (tag === 'select') {
              const opts = Array.from(input.options).filter(o => {
                if (!o || o.disabled) return false;
                const v = o.value;
                return v !== undefined && v !== null && String(v).trim() !== '';
              });
              if (opts.length) {
                valueToSet = opts[Math.floor(Math.random() * opts.length)].value;
              }
            } else if (type === 'checkbox' || type === 'radio') {
              input.checked = !input.checked;
              filledCount++;
              
              fillReports.push({
                selector: fieldMeta.selector,
                type: type,
                label: fieldMeta.label,
                attemptedValue: input.checked ? 'checked' : 'unchecked',
                finalValue: input.checked ? 'checked' : 'unchecked',
                success: true,
                report: `Поле "${fieldMeta.label || fieldMeta.name || fieldMeta.selector}" было ${input.checked ? 'отмечено' : 'снято'}`
              });
              return;
            } else if (type === 'email') {
              valueToSet = `user${Math.floor(Math.random() * 9999)}@example.com`;
            } else if (type === 'number') {
              const min = minVal ?? 0;
              const max = maxVal ?? 9999;
              valueToSet = String(Math.floor(min + Math.random() * (max - min + 1)));
            } else if (type === 'tel') {
              valueToSet = `+7 (${randomStr(3, '0123456789')}) ${randomStr(3, '0123456789')}-${randomStr(2, '0123456789')}-${randomStr(2, '0123456789')}`;
            } else if (type === 'url') {
              valueToSet = `https://example.com/path${Math.floor(Math.random() * 9999)}`;
            } else if (isDateType && !fillOptions?.testInvalidDateInput) {
              const d = new Date();
              d.setDate(d.getDate() + Math.floor(Math.random() * 30) - 15);
              if (type === 'datetime-local') {
                valueToSet = d.toISOString().slice(0, 10) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
              } else if (type === 'month') {
                valueToSet = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              } else if (type === 'week') {
                const startOfYear = new Date(d.getFullYear(), 0, 1);
                const weekNum = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
                valueToSet = d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
            } else if (isDateLikeText) {
              const dd = String(d.getDate()).padStart(2, '0');
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              valueToSet = `${dd}.${mm}.${d.getFullYear()}`;
              } else {
                valueToSet = d.toISOString().slice(0, 10);
              }
            } else if (isDateType && fillOptions?.testInvalidDateInput) {
              valueToSet = randomStr(Math.min(8, maxLen), charset);
            } else {
              // УЛУЧШЕНО: Генерация значения с учётом режима
              let len = charCount;
              if (fillMode === 'max') {
                len = maxLen;
              } else if (fillMode === 'count') {
                len = charCount;
              } else {
                len = Math.floor(Math.random() * Math.min(charCount, maxLen)) + 1;
              }
              valueToSet = randomStr(len, charset);
            }

            if (valueToSet !== '') {
              try {
                // Для полей дат: placeholder "дд.мм.гггг" — формат, не значение. Подставляем реальную дату.
                const valTrim = String(valueToSet).trim();
                const ph = (input.placeholder || input.getAttribute?.('placeholder') || input.getAttribute?.('ng-reflect-placeholder') || '').trim();
                const isPlaceholderAsValue = /^дд\.мм\.гггг$|^dd\.mm\.yyyy$/i.test(valTrim) || (ph && valTrim === ph && /дд\.мм\.гггг|dd\.mm\.yyyy/i.test(ph));
                if (isDateType && !fillOptions?.testInvalidDateInput && isPlaceholderAsValue) {
                  const d = new Date();
                  valueToSet = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
                }
                // НОВОЕ: Умное заполнение с проверкой validation
                const result = smartFillField(input, fieldMeta, valueToSet);
                
                if (result.success) {
                  filledCount++;
                }
                
                // Создаём детальный отчёт
                let report = `Поле "${fieldMeta.label || fieldMeta.name || fieldMeta.selector}"`;
                
                if (result.adjustmentReason) {
                  // Было скорректировано
                  report += ` изначально было заполнено значением длиной ${result.attemptedValue.length} символов, `;
                  report += `однако ${result.adjustmentReason.toLowerCase()}. `;
                  report += `Значение было скорректировано до ${result.finalValue.length} символов. `;
                  report += `Финальное значение: "${result.finalValue.substring(0, 50)}${result.finalValue.length > 50 ? '...' : ''}".`;
                } else {
                  // Заполнено без коррекции
                  report += ` успешно заполнено значением длиной ${result.finalValue.length} символов`;
                  if (maxLen < 524288) {
                    report += ` (максимально допустимо: ${maxLen} символов)`;
                  }
                  report += `.`;
                }
                
                if (!result.success && result.validationMessages.length > 0) {
                  report += ` Остались validation сообщения: ${result.validationMessages.map(m => m.text).join('; ')}`;
                  validationErrors.push({
                    selector: fieldMeta.selector,
                    message: result.validationMessages.map(m => m.text).join('; '),
                    value: result.finalValue.substring(0, 50)
                  });
                }
                
                fillReports.push({
                  selector: fieldMeta.selector,
                  type: type,
                  label: fieldMeta.label || fieldMeta.name,
                  attemptedValue: result.attemptedValue,
                  finalValue: result.finalValue,
                  actualLength: result.finalValue.length,
                  maxLength: maxLen < 524288 ? maxLen : null,
                  adjusted: !!result.adjustmentReason,
                  adjustmentReason: result.adjustmentReason,
                  success: result.success,
                  validationMessages: result.validationMessages.map(m => m.text),
                  attempts: result.attempts,
                  report: report
                });
                
              } catch (e) {
                validationErrors.push({ 
                  selector: fieldMeta.selector, 
                  message: e.message, 
                  value: valueToSet.substring(0, 50) 
                });
                
                fillReports.push({
                  selector: fieldMeta.selector,
                  type: type,
                  label: fieldMeta.label || fieldMeta.name,
                  error: e.message,
                  success: false,
                  report: `Ошибка при заполнении поля "${fieldMeta.label || fieldMeta.name}": ${e.message}`
                });
              }
            }
          });
          
          const summary = {
            total: fields.length,
            byType: fields.reduce((acc, f) => {
              acc[f.type] = (acc[f.type] || 0) + 1;
              return acc;
            }, {}),
            required: fields.filter(f => f.required).length,
            empty: fields.filter(f => !f.value).length,
            filled: filledCount,
            skipped: fillReports.filter(r => r.skipped).length, // НОВОЕ: Пропущенные
            adjusted: fillReports.filter(r => r.adjusted).length,
            validationErrors: validationErrors.length,
            scopeMode: scopeMode,
            currentStep: currentStepIndex,
            selectedSteps: scopeMode === 'selected-steps' ? selectedSteps : null,
            overwriteFilled: fillOptions?.overwriteFilled || false // НОВОЕ
          };
          
          return {
            fields,
            summary,
            validationErrors,
            fillReports // НОВОЕ: Детальные отчёты
          };
        },

        // 3. Проверка доступности элементов (WCAG-ориентированная)
        'analysis-validate': function() {
          const elements = document.querySelectorAll(
            'a, button, input, select, textarea, img, [onclick], [role], [tabindex]'
          );
          const issues = [];
          const seenSelectors = new Set();

          function addIssue(el, problemCodes, severity, wcagCriterion, suggestion, category) {
            const generated = utils.generateSelector(el);
            const selector = generated[0]?.selector || '';
            if (seenSelectors.has(selector)) return;
            seenSelectors.add(selector);
            issues.push({
              selector,
              element: el.tagName?.toLowerCase?.() || '',
              tagName: el.tagName?.toLowerCase?.() || '',
              problems: problemCodes,
              severity: severity || 'warning',
              wcagCriterion: wcagCriterion || undefined,
              suggestion: suggestion || undefined,
              category: category || 'accessibility'
            });
          }

          elements.forEach(element => {
            if (!utils.isVisible(element)) return;
            const problems = [];
            let severity = 'warning';
            let wcagCriterion;
            let suggestion;

            // Ссылки: a без href или href="#" без aria-label
            if (element.tagName === 'A') {
              const href = element.getAttribute('href');
              if (!href || href === '#') {
                if (!element.getAttribute('aria-label') && !element.getAttribute('title')) {
                  problems.push('linkWithoutHref');
                  wcagCriterion = '2.1.1';
                  suggestion = 'Add href or aria-label';
                }
              }
            }

            // Кнопки: без текста и без aria-label/title
            if (element.tagName === 'BUTTON') {
              const text = element.textContent?.trim?.() || '';
              const ariaLabel = element.getAttribute('aria-label');
              const title = element.getAttribute('title');
              if (!text && !ariaLabel && !title) {
                problems.push('buttonWithoutLabel');
                wcagCriterion = '4.1.2';
                suggestion = 'Add visible text, aria-label or title';
              }
              if (text.length === 0 && (ariaLabel || title)) return; // has label
            }

            // Поля форм: без label, aria-label, aria-labelledby или placeholder (для input)
            if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
              if (element.type === 'hidden' || element.type === 'submit' || element.type === 'button') return;
              const hasLabel = element.labels?.length || element.getAttribute('aria-label') ||
                element.getAttribute('aria-labelledby') || (element.tagName === 'INPUT' && element.getAttribute('placeholder'));
              if (!hasLabel) {
                problems.push('fieldWithoutLabel');
                wcagCriterion = '1.3.1';
                suggestion = 'Add label, aria-label, aria-labelledby or placeholder';
              }
            }

            // Изображения: img без alt
            if (element.tagName === 'IMG') {
              const alt = element.getAttribute('alt');
              if (alt === null || alt === undefined) {
                problems.push('imageWithoutAlt');
                wcagCriterion = '1.1.1';
                suggestion = 'Add alt attribute (use empty string for decorative images)';
              }
            }

            // Элементы с role: без доступного имени
            const role = element.getAttribute('role');
            if (role && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') &&
                !(element.textContent?.trim?.() || '')) {
              problems.push('roleWithoutName');
              wcagCriterion = '4.1.2';
              suggestion = 'Add aria-label, aria-labelledby or visible text';
            }

            // tabindex на неинтерактивных элементах
            if (element.hasAttribute('tabindex') && !utils.isInteractive(element)) {
              const tabindex = element.getAttribute('tabindex');
              if (tabindex !== '-1') {
                problems.push('tabindexOnNonInteractive');
                wcagCriterion = '2.1.1';
                suggestion = 'Remove tabindex or use tabindex="-1" for programmatic focus';
              }
            }

            // Пустые button/a (только пробелы)
            if ((element.tagName === 'BUTTON' || element.tagName === 'A') && element.textContent?.trim?.() === '') {
              if (!element.getAttribute('aria-label') && !element.getAttribute('title')) {
                if (!problems.includes('buttonWithoutLabel') && !problems.includes('linkWithoutHref')) {
                  problems.push('emptyInteractiveElement');
                  suggestion = 'Add visible text or aria-label';
                }
              }
            }

            if (problems.length > 0) {
              const isError = problems.some(p =>
                ['imageWithoutAlt', 'fieldWithoutLabel', 'roleWithoutName'].includes(p)
              );
              addIssue(element, problems, isError ? 'error' : 'warning', wcagCriterion, suggestion, 'accessibility');
            }
          });

          // Дублирующиеся id
          const ids = {};
          document.querySelectorAll('[id]').forEach(el => {
            if (!utils.isVisible(el)) return;
            const id = el.id;
            if (ids[id]) {
              const sel = '#' + utils.escapeSelector(id);
              if (!seenSelectors.has(sel)) {
                seenSelectors.add(sel);
                issues.push({
                  selector: sel,
                  element: el.tagName?.toLowerCase?.() || '',
                  tagName: el.tagName?.toLowerCase?.() || '',
                  problems: ['duplicateId'],
                  severity: 'error',
                  wcagCriterion: '4.1.1',
                  suggestion: 'Ensure id values are unique',
                  category: 'code'
                });
              }
            } else ids[id] = true;
          });

          const accessibilityIssues = issues.filter(i => i.category === 'accessibility');
          const codeIssues = issues.filter(i => i.category === 'code');
          return {
            issues,
            summary: {
              total: issues.length,
              errors: issues.filter(i => i.severity === 'error').length,
              warnings: issues.filter(i => i.severity === 'warning').length,
              accessibilityCount: accessibilityIssues.length,
              codeCount: codeIssues.length
            }
          };
        },

        // 4. Анализ форм (нативные form, role="form", SPA-контейнеры)
        'analysis-forms': function() {
          const FIELD_SELECTOR = 'input, select, textarea, app-select, app-group-item-select, div.placeholder, div[class*="placeholder"]';
          const formData = [];
          let formIndex = 0;

          function collectFields(container) {
            return Array.from(container.querySelectorAll(FIELD_SELECTOR))
              .filter(f => {
                if (!utils.isVisible(f)) return false;
                if (f.tagName === 'INPUT' && ['hidden', 'submit', 'button'].includes((f.type || '').toLowerCase())) return false;
                if (f.tagName === 'DIV' && f.matches?.('div.placeholder, div[class*="placeholder"]')) {
                  if (f.closest('app-select, app-group-item-select')) return false;
                  if (!/^выберите\s*$/i.test((f.textContent || '').trim())) return false;
                }
                return true;
              })
              .map(field => {
                const tag = (field.tagName || '').toLowerCase();
                let type = field.type || tag;
                let name = field.name || field.getAttribute('formcontrolname') || field.getAttribute('ng-reflect-name') || field.getAttribute('ng-reflect-form-control-name') || '';
                let label = field.labels?.[0]?.textContent?.trim?.() || field.getAttribute('aria-label') || field.getAttribute('label') || field.getAttribute('ng-reflect-label') || '';
                if (!label && tag === 'input') label = field.getAttribute('placeholder') || '';
                let placeholder = field.getAttribute('placeholder') || '';
                let required = !!field.required || field.hasAttribute('required');
                let optionsCount;
                if (tag === 'select') {
                  optionsCount = field.querySelectorAll('option').length;
                } else if (tag === 'app-select' || tag === 'app-group-item-select') {
                  const opts = field.querySelectorAll('.options option, [class*="option"]');
                  optionsCount = opts.length || undefined;
                }
                return {
                  selector: utils.generateSelector(field)[0]?.selector || '',
                  type,
                  name,
                  label: (label || '').trim(),
                  placeholder: (placeholder || '').trim(),
                  required,
                  elementTag: tag,
                  optionsCount
                };
              });
          }

          // Нативные form
          document.querySelectorAll('form').forEach(form => {
            const fields = collectFields(form);
            formData.push({
              index: formIndex++,
              id: form.id || null,
              name: form.name || null,
              action: form.action || '',
              method: (form.method || 'get').toLowerCase(),
              fields,
              submitButton: form.querySelector('button[type="submit"], input[type="submit"]')?.textContent?.trim?.() || '',
              fieldCount: fields.length
            });
          });

          // Контейнеры с role="form"
          document.querySelectorAll('[role="form"]').forEach(roleForm => {
            if (roleForm.closest('form')) return;
            const fields = collectFields(roleForm);
            formData.push({
              index: formIndex++,
              id: roleForm.id || null,
              name: roleForm.getAttribute('name') || null,
              action: '',
              method: 'get',
              fields,
              submitButton: roleForm.querySelector('button[type="submit"], input[type="submit"]')?.textContent?.trim?.() || '',
              fieldCount: fields.length
            });
          });

          // Form-like: блоки с form/formGroup (Angular) или общий родитель input/select/textarea/app-select/app-group-item-select
          const controlsNotInForm = Array.from(document.querySelectorAll(FIELD_SELECTOR))
            .filter(f => {
              if (!utils.isVisible(f)) return false;
              if (f.tagName === 'INPUT' && ['hidden', 'submit', 'button'].includes((f.type || '').toLowerCase())) return false;
              return !f.closest('form, [role="form"]');
            });
          const allRoots = new Set();
          controlsNotInForm.forEach(control => {
            let el = control.parentElement;
            while (el && el !== document.body) {
              const count = el.querySelectorAll(FIELD_SELECTOR).length;
              if (count >= 2) {
                allRoots.add(el);
                break;
              }
              el = el.parentElement;
            }
            if (!el || el === document.body) allRoots.add(control.parentElement);
          });
          const minimalRoots = [...allRoots].filter(r => {
            if (!r || r === document.body) return false;
            const hasChildRoot = [...allRoots].some(other => other !== r && r.contains(other));
            return !hasChildRoot;
          });
          const rootToControls = new Map();
          minimalRoots.forEach(root => rootToControls.set(root, []));
          controlsNotInForm.forEach(control => {
            const root = minimalRoots.find(r => r.contains(control));
            if (root) rootToControls.get(root).push(control);
          });
          const assigned = new Set();
          rootToControls.forEach((controls) => controls.forEach(c => assigned.add(c)));
          controlsNotInForm.filter(c => !assigned.has(c)).forEach(control => {
            const root = control.parentElement;
            if (root && root !== document.body) {
              if (!rootToControls.has(root)) rootToControls.set(root, []);
              rootToControls.get(root).push(control);
            }
          });
          rootToControls.forEach((controls, root) => {
            const unique = [...new Set(controls)];
            const fields = unique.map(f => {
              const tag = (f.tagName || '').toLowerCase();
              let type = f.type || tag;
              let name = f.name || f.getAttribute('formcontrolname') || f.getAttribute('ng-reflect-name') || '';
              let label = f.labels?.[0]?.textContent?.trim?.() || f.getAttribute('aria-label') || f.getAttribute('label') || f.getAttribute('ng-reflect-label') || '';
              if (!label && tag === 'input') label = f.getAttribute('placeholder') || '';
              let placeholder = f.getAttribute('placeholder') || '';
              let required = !!f.required || f.hasAttribute('required');
              let optionsCount;
              if (tag === 'select') optionsCount = f.querySelectorAll('option').length;
              else if (tag === 'app-select' || tag === 'app-group-item-select') optionsCount = f.querySelectorAll('.options option, [class*="option"]').length || undefined;
              return {
                selector: utils.generateSelector(f)[0]?.selector || '',
                type,
                name,
                label: (label || '').trim(),
                placeholder: (placeholder || '').trim(),
                required,
                elementTag: tag,
                optionsCount
              };
            });
            if (fields.length > 0) {
              formData.push({
                index: formIndex++,
                id: root.id || null,
                name: root.getAttribute('name') || null,
                action: '',
                method: 'get',
                fields,
                submitButton: root.querySelector('button[type="submit"], input[type="submit"]')?.textContent?.trim?.() || '',
                fieldCount: fields.length
              });
            }
          });

          return {
            forms: formData,
            summary: {
              total: formData.length,
              totalFields: formData.reduce((sum, f) => sum + f.fieldCount, 0),
              withId: formData.filter(f => f.id).length,
              withAction: formData.filter(f => f.action).length
            }
          };
        },

        // 5. Поиск битых ссылок (сбор ссылок; HTTP-проверка выполняется в background)
        'analysis-links': function() {
          const links = document.querySelectorAll('a[href]');
          const baseUrl = window.location.href;
          const linkData = [];
          
          links.forEach(link => {
            let href = link.getAttribute('href') || link.href || '';
            // Нормализация: относительные URL -> абсолютные
            let absoluteUrl = href;
            if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('data:')) {
              try {
                absoluteUrl = new URL(href, baseUrl).href;
              } catch (e) {
                absoluteUrl = href;
              }
            }
            const isInternal = absoluteUrl.startsWith(window.location.origin) || 
                              href.startsWith('/') || 
                              href.startsWith('#');
            const isEmpty = !href || href === '#' || href === 'javascript:void(0)' || href.startsWith('javascript:');
            const isMailto = href.startsWith('mailto:');
            const isTel = href.startsWith('tel:');
            const isFetchable = absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://');
            
            linkData.push({
              href: absoluteUrl,
              originalHref: href,
              text: link.textContent?.trim() || link.getAttribute('aria-label') || '',
              isInternal,
              isEmpty,
              isMailto,
              isTel,
              isFetchable,
              hasTargetBlank: link.target === '_blank',
              hasRelNoopener: link.rel?.includes('noopener')
            });
          });
          
          const potentialBroken = linkData.filter(l => l.isEmpty);
          const externalLinks = linkData.filter(l => !l.isInternal && !l.isMailto && !l.isTel);
          
          return {
            links: linkData,
            summary: {
              total: linkData.length,
              internal: linkData.filter(l => l.isInternal).length,
              external: externalLinks.length,
              potentialBroken: potentialBroken.length,
              withTargetBlank: linkData.filter(l => l.hasTargetBlank).length,
              fetchable: linkData.filter(l => l.isFetchable).length
            }
          };
        },

        // 6. Анализ производительности
        'analysis-performance': function() {
          const timing = performance.timing || {};
          const navigation = performance.getEntriesByType?.('navigation')?.[0] || {};
          
          // Базовые метрики (legacy - для обратной совместимости)
          const metrics = {
            // Время загрузки
            loadTime: timing.loadEventEnd - timing.navigationStart || 
                     navigation.loadEventEnd - navigation.startTime || 0,
            
            // DOM Content Loaded
            domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart ||
                             navigation.domContentLoadedEventEnd - navigation.startTime || 0,
            
            // Время до первого байта
            ttfb: timing.responseStart - timing.navigationStart ||
                  navigation.responseStart - navigation.startTime || 0,
            
            // Размер DOM
            domSize: document.querySelectorAll('*').length,
            
            // Количество скриптов
            scripts: document.querySelectorAll('script').length,
            
            // Количество стилей
            styles: document.querySelectorAll('link[rel="stylesheet"], style').length,
            
            // Количество изображений
            images: document.querySelectorAll('img').length,
            
            // Количество iframe
            iframes: document.querySelectorAll('iframe').length,
            
            // Размер HTML
            htmlSize: document.documentElement.outerHTML.length,
            
            // Ресурсы
            resources: performance.getEntriesByType?.('resource')?.length || 0
          };
          
          // Оценка производительности
          let score = 100;
          if (metrics.loadTime > 3000) score -= 20;
          else if (metrics.loadTime > 2000) score -= 10;
          
          if (metrics.domSize > 1500) score -= 15;
          else if (metrics.domSize > 1000) score -= 10;
          
          if (metrics.ttfb > 1000) score -= 15;
          else if (metrics.ttfb > 500) score -= 10;
          
          if (metrics.scripts > 20) score -= 10;
          if (metrics.styles > 10) score -= 5;
          
          metrics.score = Math.max(0, score);
          
          // НОВОЕ: Получить детальные данные от Performance Collector (если доступен)
          let performanceData = null;
          let hasDetailedReport = false;
          if (window.AutoTestPerformanceCollector && window.AutoTestPerformanceCollector.isMonitoring) {
            try {
              performanceData = window.AutoTestPerformanceCollector.collectData();
              hasDetailedReport = true;
              console.log('✅ [Analysis] Performance Collector data collected');
            } catch (error) {
              console.warn('⚠️ [Analysis] Failed to collect Performance Collector data:', error);
            }
          }
          
          return {
            metrics,
            summary: {
              loadTime: metrics.loadTime,
              domSize: metrics.domSize,
              score: metrics.score,
              rating: metrics.score >= 80 ? 'good' : metrics.score >= 50 ? 'average' : 'poor'
            },
            // НОВОЕ: Добавить полные данные производительности
            performanceData: performanceData,
            hasDetailedReport: hasDetailedReport
          };
        },

        // 7. Comprehensive Security Analysis
        'analysis-security-comprehensive': async function(options = {}) {
          // Check if ComprehensiveSecurityAnalyzer is available
          if (!window.ComprehensiveSecurityAnalyzer) {
            return {
              error: 'ComprehensiveSecurityAnalyzer not loaded',
              message: 'Please ensure comprehensive-security-analyzer.js is included'
            };
          }

          try {
            // Run comprehensive analysis
            const results = await window.ComprehensiveSecurityAnalyzer.runFullAnalysis(options);
            
            return {
              success: true,
              timestamp: results.timestamp,
              url: results.url,
              summary: results.summary,
              tests: results.tests,
              recommendations: generateSecurityRecommendations(results)
            };
          } catch (error) {
            return {
              error: error.message,
              stack: error.stack
            };
          }
        }
      };

      // Helper: Generate security recommendations
      function generateSecurityRecommendations(results) {
        const recommendations = [];

        // XSS recommendations
        if (results.tests.xss && results.tests.xss.vulnerabilities.length > 0) {
          recommendations.push({
            priority: 'critical',
            category: 'XSS',
            title: 'Cross-Site Scripting Vulnerabilities Detected',
            description: `Found ${results.tests.xss.vulnerabilities.length} XSS vulnerability(ies)`,
            remediation: [
              'Escape all user input before rendering in HTML',
              'Use Content Security Policy (CSP) headers',
              'Implement input validation and sanitization',
              'Use frameworks with built-in XSS protection'
            ],
            affectedFields: results.tests.xss.vulnerabilities.map(v => v.field)
          });
        }

        // SQL Injection recommendations
        if (results.tests.sqlInjection && results.tests.sqlInjection.vulnerabilities.length > 0) {
          recommendations.push({
            priority: 'critical',
            category: 'SQL Injection',
            title: 'SQL Injection Vulnerabilities Detected',
            description: `Found ${results.tests.sqlInjection.vulnerabilities.length} SQL injection vulnerability(ies)`,
            remediation: [
              'Use parameterized queries (prepared statements)',
              'Never concatenate user input into SQL queries',
              'Implement input validation',
              'Use ORM frameworks with built-in protection',
              'Apply principle of least privilege to database users'
            ],
            affectedFields: results.tests.sqlInjection.vulnerabilities.map(v => v.field)
          });
        }

        // CSRF recommendations
        if (results.tests.csrf && !results.tests.csrf.protected) {
          recommendations.push({
            priority: 'high',
            category: 'CSRF',
            title: 'CSRF Protection Missing',
            description: 'Forms lack CSRF token protection',
            remediation: [
              'Implement CSRF tokens for all state-changing requests',
              'Use SameSite cookie attribute',
              'Validate Origin and Referer headers',
              'Use framework built-in CSRF protection'
            ]
          });
        }

        // HTTPS recommendations
        if (results.tests.https && !results.tests.https.enforced) {
          recommendations.push({
            priority: 'critical',
            category: 'HTTPS',
            title: 'HTTPS Not Enforced',
            description: 'Site is not using HTTPS',
            remediation: [
              'Obtain and install SSL/TLS certificate',
              'Redirect all HTTP traffic to HTTPS',
              'Enable HSTS (HTTP Strict Transport Security)',
              'Update all internal links to use HTTPS'
            ]
          });
        }

        // Mixed Content
        if (results.tests.https && results.tests.https.mixedContent.length > 0) {
          recommendations.push({
            priority: 'medium',
            category: 'Mixed Content',
            title: 'Mixed Content Detected',
            description: `Found ${results.tests.https.mixedContent.length} HTTP resource(s) on HTTPS page`,
            remediation: [
              'Update all resource URLs to use HTTPS',
              'Use protocol-relative URLs (//example.com/resource)',
              'Use Content Security Policy to block mixed content'
            ],
            resources: results.tests.https.mixedContent
          });
        }

        // Security Headers
        if (results.tests.headers && results.tests.headers.missing.length > 0) {
          recommendations.push({
            priority: 'medium',
            category: 'Security Headers',
            title: 'Missing Security Headers',
            description: `${results.tests.headers.missing.length} security header(s) missing`,
            remediation: [
              'Add Content-Security-Policy header',
              'Add X-Frame-Options header to prevent clickjacking',
              'Add X-Content-Type-Options: nosniff',
              'Add Strict-Transport-Security header',
              'Configure Referrer-Policy and Permissions-Policy'
            ],
            missingHeaders: results.tests.headers.missing
          });
        }

        return recommendations;
      }

      // Выполняем нужный анализ
      const analyzer = analyzers[type];
      if (!analyzer) {
        return { error: `Unknown analysis type: ${type}` };
      }
      
      // Support both sync and async analyzers
      if (type === 'analysis-fill-fields') {
        return analyzer(fillOptions || {});
      } else if (type === 'analysis-security-comprehensive') {
        return analyzer(fillOptions || {});
      } else {
        return analyzer();
      }
    };
  },

  /**
   * Функция заполнения полей по селекторам (из шага "Получить селекторы").
   * Используется для analysis-fill-fields после получения селекторов.
   * @returns {Function} (selectors, fillOptions) => { fields, summary, validationErrors }
   */
  _getFillBySelectorsFunction() {
    return async function(selectors, fillOptions, globalFieldRules = {}) {
      try {
      const fillMode = fillOptions?.fillMode || 'random';
      const charCount = Math.min(1000, Math.max(1, fillOptions?.charCount || 10));
      const charsetPreset = fillOptions?.charset || 'lettersAndNumbers';
      const fillTarget = fillOptions?.fillTarget || 'all';

      const CHARSETS = {
        letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lettersAndNumbers: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        lettersNumbersSpace: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
        alphanumeric: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      };
      const charset = (charsetPreset === 'custom' && fillOptions?.customCharset)
        ? fillOptions.customCharset
        : (CHARSETS[charsetPreset] || CHARSETS.lettersAndNumbers);

      const randomStr = (len, chars) => {
        let s = '';
        for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
      };
      // Expand template patterns (Test{5} -> Test + 5 random chars, {email}, {phone}, etc.)
      const applyPattern = (pattern) => {
        if (!pattern || typeof pattern !== 'string') return pattern;
        let result = pattern;
        const cyrillicChars = pattern.match(/[а-яёА-ЯЁ]/g) || [];
        const latinChars = pattern.match(/[a-zA-Z]/g) || [];
        const hasCyrillic = cyrillicChars.length > 0;
        const hasLatin = latinChars.length > 0;
        let charset = hasCyrillic && !hasLatin ? 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
          : hasLatin && !hasCyrillic ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
          : (hasCyrillic && hasLatin) ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
          : 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (/[0-9]/.test(pattern)) charset += '0123456789';
        const gen = (n) => randomStr(n, charset);
        result = result.replace(/\{(\d+)\}/g, (m, n) => gen(parseInt(n, 10)));
        result = result.replace(/\{(\d+)-(\d+)\}/g, (m, min, max) => {
          const minLen = parseInt(min, 10);
          const maxLen = parseInt(max, 10);
          return gen(minLen + Math.floor(Math.random() * (maxLen - minLen + 1)));
        });
        result = result.replace(/\[([^\]]+)\]/g, (m, chars) => chars[Math.floor(Math.random() * chars.length)]);
        result = result.replace(/\{digit\}/g, () => Math.floor(Math.random() * 10).toString());
        result = result.replace(/\{letter\}/g, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]);
        result = result.replace(/\{upper\}/g, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]);
        result = result.replace(/\{email\}/g, () => {
          const domains = ['gmail.com', 'mail.ru', 'test.com', 'example.com'];
          return gen(8).toLowerCase() + '@' + domains[Math.floor(Math.random() * domains.length)];
        });
        result = result.replace(/\{phone\}/g, () => {
          const r = (n) => Math.floor(Math.random() * Math.pow(10, n)).toString().padStart(n, '0');
          return '+7 (' + r(3) + ') ' + r(3) + '-' + r(2) + '-' + r(2);
        });
        result = result.replace(/\{(uppercase|lowercase|capitalize):([^}]+)\}/g, (m, func, text) => {
          if (func === 'uppercase') return text.toUpperCase();
          if (func === 'lowercase') return text.toLowerCase();
          if (func === 'capitalize') return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
          return text;
        });
        while (result.includes('*')) result = result.replace('*', gen(Math.floor(Math.random() * 8) + 1));
        while (result.includes('?')) result = result.replace('?', gen(1));
        return result;
      };
      const toIsoDate = (d) => d.toISOString().slice(0, 10);
      const toRuDate = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}.${mm}.${yyyy}`;
      };
      const parseDateLike = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        const s = raw.trim();
        if (!s) return null;
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (iso) {
          const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
          return isNaN(d.getTime()) ? null : d;
        }
        const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
        if (ru) {
          const d = new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
      };

      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };

      const scopeSelector = fillOptions?.scopeSelector;
      const scopeElement = scopeSelector ? document.querySelector(scopeSelector) : null;

      const fields = [];
      const validationErrors = [];
      let filledCount = 0;
      const filledElements = new Set();
      const resolvedFields = [];
      const debugLog = [];
      const dbg = (msg, data) => { debugLog.push({ msg, data: data || {}, t: Date.now() }); };

      const inScope = (el) => !scopeElement || scopeElement.contains(el);

      const escapeCss = (s) => (s || '').replace(/([!"#$%&'()*+,.\/:;<=>?@[\]^`{|}~])/g, '\\$1');
      const getSimpleSelector = (el) => {
        if (!el) return '';
        const tag = (el.tagName || '').toLowerCase();
        if (el.id) return `#${escapeCss(el.id)}`;
        if (el.name && tag === 'input') return `input[name="${(el.name || '').replace(/"/g, '\\"')}"]`;
        const eid = el.getAttribute('elementid') || el.getAttribute('ng-reflect-element-id');
        if (eid && ['app-select', 'app-group-item-select'].includes(tag)) return `${tag}[elementid="${eid}"]`;
        const label = el.getAttribute('label') || el.getAttribute('ng-reflect-label');
        if (label && ['app-select', 'app-group-item-select'].includes(tag)) return `${tag}[label="${(label || '').replace(/"/g, '\\"')}"]`;
        return tag;
      };

      const sortByDomOrder = (arr) => {
        arr.sort((a, b) => {
          const elA = a.input || a;
          const elB = b.input || b;
          const pos = elA.compareDocumentPosition(elB);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });
      };

      const queryRoot = scopeElement || document;

      if (scopeElement) {
        const fieldTags = ['input', 'select', 'textarea', 'app-select', 'app-group-item-select'];
        const scopeFields = [];
        for (const tag of fieldTags) {
          scopeElement.querySelectorAll(tag).forEach(el => {
            if (!isVisible(el)) return;
            const t = (el.tagName || '').toLowerCase();
            if (t === 'input' && ['hidden', 'submit', 'button'].includes((el.type || '').toLowerCase())) return;
            if (filledElements.has(el)) return;
            filledElements.add(el);
            scopeFields.push({ sel: { selector: getSimpleSelector(el) || tag, element: t }, input: el });
          });
        }
        scopeElement.querySelectorAll('div.placeholder, div[class*="placeholder"]').forEach(el => {
          if (!isVisible(el)) return;
          if (el.closest('app-select, app-group-item-select')) return;
          if (!/^выберите\s*$/i.test((el.textContent || '').trim())) return;
          if (filledElements.has(el)) return;
          filledElements.add(el);
          scopeFields.push({ sel: { selector: getSimpleSelector(el) || 'div.placeholder', element: 'div' }, input: el });
        });
        sortByDomOrder(scopeFields);
        resolvedFields.push(...scopeFields);
      }

      selectors.forEach(sel => {
        let input;
        try {
          input = queryRoot.querySelector(sel.selector);
        } catch (e) {
          return;
        }
        if (!input || !isVisible(input)) return;
        if (!inScope(input)) return;
        const tag = (input.tagName || '').toLowerCase();
        const isSelectLike = tag === 'app-select' || tag === 'app-group-item-select';
        if (!isSelectLike && (input.type === 'hidden' || input.type === 'submit' || input.type === 'button')) return;
        if (filledElements.has(input)) return;
        filledElements.add(input);
        resolvedFields.push({ sel, input });
      });


      const addSelectLike = (el, tag) => {
        if (filledElements.has(el) || !isVisible(el)) return;
        const elementId = el.getAttribute('elementid') || el.getAttribute('ng-reflect-element-id');
        const label = el.getAttribute('label') || el.getAttribute('ng-reflect-label') || '';
        let selStr = null;
        if (elementId) selStr = `${tag}[elementid="${elementId}"], ${tag}[ng-reflect-element-id="${elementId}"]`;
        else if (label) selStr = `${tag}[label="${label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"], ${tag}[ng-reflect-label="${label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
        if (selStr) {
          try {
            const found = document.querySelector(selStr);
            if (found === el) {
              filledElements.add(el);
              resolvedFields.push({ sel: { selector: selStr, element: tag }, input: el });
              return true;
            }
          } catch (e) {}
        }
        return false;
      };

      const form = scopeElement ? scopeElement.querySelector('form') : document.querySelector('form');
      if (form && (!scopeElement || scopeElement.contains(form))) {
        for (const tag of ['app-select', 'app-group-item-select']) {
          const formSelects = Array.from(form.querySelectorAll(tag));
          for (const el of formSelects) {
            if (!inScope(el)) continue;
            if (addSelectLike(el, tag)) continue;
            const firstForm = document.querySelector(`form ${tag}`);
            if (firstForm === el) {
              filledElements.add(el);
              resolvedFields.push({ sel: { selector: `form ${tag}`, element: tag }, input: el });
              break;
            }
          }
        }
      }

      for (const tag of ['app-select', 'app-group-item-select']) {
        const root = scopeElement || document;
        const docSelects = Array.from(root.querySelectorAll(tag));
        for (const el of docSelects) {
          if (!inScope(el)) continue;
          addSelectLike(el, tag);
        }
      }

      sortByDomOrder(resolvedFields);

      const getAppSelectDisplayValueEarly = (container) => {
        const display = container?.querySelector?.('.result__content, .result__value, .result, .placeholder, [class*="placeholder"], [ng-reflect-value]');
        let raw = (display?.textContent || display?.getAttribute?.('ng-reflect-app-tooltip') || container?.getAttribute?.('ng-reflect-value') || '').trim();
        if (!raw && container?.matches?.('div.placeholder, div[class*="placeholder"]')) raw = (container.textContent || '').trim();
        const placeholder = (container?.getAttribute?.('placeholder') || container?.getAttribute?.('ng-reflect-placeholder') || '').trim();
        if (raw && placeholder && (raw === placeholder || /^введите\s|^укажите\s|^выберите\s/i.test(raw))) return '';
        if (/не\s*указано/i.test(raw)) return '';
        if (/^введите\s|^укажите\s|^выберите\s|^select\s*$/i.test(raw)) return '';
        return raw;
      };
      const initialEmptyCount = resolvedFields.reduce((acc, item) => {
        const el = item.input;
        const isSelectLike = ['app-select', 'app-group-item-select'].includes((el?.tagName || '').toLowerCase()) ||
          (el?.matches?.('div.placeholder, div[class*="placeholder"]') && /^выберите\s*$/i.test((el.textContent || '').trim()));
        const isEmpty = isSelectLike ? !getAppSelectDisplayValueEarly(el) : (!el?.value || String(el.value).trim() === '');
        return acc + (isEmpty ? 1 : 0);
      }, 0);
      const hasAsteriskInLabel = (el) => {
        if (!el) return false;
        const text = (el.textContent || '').trim();
        if (/\*|обязательн|required/i.test(text)) return true;
        const cls = (el.className || '').toString();
        if (/\brequired-label\b/.test(cls) && !/not-required|optional/i.test(cls)) return true;
        return false;
      };
      const isFieldRequired = (input) => {
        if (!input) return false;
        if (!!input.required || input.getAttribute('aria-required') === 'true') return true;
        if (input.closest?.('[required]')) return true;
        if (input.getAttribute('ng-reflect-required') === 'true') return true;
        const group = input.closest?.('.form-group, .form-control-wrap, [class*="form-group"], [class*="field-wrapper"], .mat-form-field, .ant-form-item, .form-row, [class*="form-field"], .select-group, .wizard_form-g');
        if (group?.classList?.contains('required')) return true;
        const reqEl = group?.querySelector?.('.required');
        if (reqEl && !/not-required|optional/i.test(reqEl.className || '')) return true;
        const label = input.closest?.('label') || document.querySelector(`label[for="${input.id}"]`) || group?.querySelector?.('label');
        if (label && hasAsteriskInLabel(label)) return true;
        if (group && hasAsteriskInLabel(group.querySelector?.('label'))) return true;
        const prev = input.previousElementSibling;
        if (prev?.tagName === 'LABEL' && hasAsteriskInLabel(prev)) return true;
        let p = input.parentElement;
        for (let i = 0; i < 5 && p; i++) {
          const lbl = p.querySelector?.('label');
          if (lbl && hasAsteriskInLabel(lbl)) return true;
          const prevSib = p.previousElementSibling;
          if (prevSib?.querySelector?.('label') && hasAsteriskInLabel(prevSib.querySelector('label'))) return true;
          p = p.parentElement;
        }
        return false;
      };
      const requiredCount = resolvedFields.filter(({ input }) => isFieldRequired(input)).length;
      // Для режима "empty": если пустых нет, заполняем все, чтобы шаг не был no-op.
      // Для режима "required": если обязательных не найдено (requiredCount=0), заполняем все.
      let effectiveFillTarget = (fillTarget === 'empty' && initialEmptyCount === 0) ? 'all' : fillTarget;
      if (effectiveFillTarget === 'required' && requiredCount === 0) {
        effectiveFillTarget = initialEmptyCount > 0 ? 'empty' : 'all';
      }

      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      const isComboboxLike = (el) => {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') return true;
        const container = el.closest('app-select, .ant-select, .el-select, .el-input, nz-select, [class*="select"], [class*="combobox"], [class*="dropdown"], .select-box, [class*="ng-select"]');
        if (container && (container.querySelector('.ant-select-arrow, .el-select__caret, .arrow, [class*="arrow"], [class*="caret"], [class*="suffix"], .options, [class*="options"]') || container.classList?.toString().includes('select') || container.tagName === 'APP-SELECT')) return true;
        const ph = (el.placeholder || el.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase();
        if (/укажите|выберите|select|choose|или введите/i.test(ph) && (el.readOnly || el.getAttribute('aria-readonly') === 'true')) return true;
        if (/укажите|выберите|или введите/i.test(ph) && el.type === 'text') return true;
        if ((el.className || '').includes('result') && /выберите|введите/i.test(ph)) return true;
        const wrapper = el.closest('app-select, [class*="select"], [class*="combobox"], [class*="dropdown"], nz-select, .select-box');
        if (wrapper && (wrapper.querySelector('.arrow, [class*="arrow"], [class*="caret"], [class*="suffix"], .options') || wrapper.tagName === 'APP-SELECT')) return true;
        return false;
      };
      const getComboboxDisplayValue = (input) => {
        const container = input.closest?.('app-select, .ant-select, .el-select, [class*="select"], [class*="combobox"], .select-box, [class*="ng-select"]') || (input.tagName === 'APP-SELECT' ? input : null) || input.parentElement;
        const display = container?.querySelector('[class*="selection-item"], [class*="selection__rendered"], .ant-select-selection-item, .el-select__selected, .result__content, .result__value, .result:not(input)');
        const raw = (display?.textContent || (input.value !== undefined ? input.value : '') || input.getAttribute?.('ng-reflect-value') || '').trim();
        const placeholder = (input.placeholder || input.getAttribute?.('ng-reflect-placeholder') || container?.getAttribute?.('placeholder') || container?.getAttribute?.('ng-reflect-placeholder') || '').trim();
        if (raw && placeholder && (raw === placeholder || raw.startsWith(placeholder))) return '';
        if (raw && /^введите\s|^укажите\s|^выберите\s/i.test(raw)) return '';
        return raw;
      };
      const getAppSelectDisplayValue = (container) => {
        const display = container?.querySelector('.result__content, .result__value, .result, .placeholder, [class*="placeholder"], [ng-reflect-value]');
        let raw = (display?.textContent || display?.getAttribute?.('ng-reflect-app-tooltip') || container?.getAttribute?.('ng-reflect-value') || '').trim();
        if (!raw && container?.matches?.('div.placeholder, div[class*="placeholder"]')) raw = (container.textContent || '').trim();
        const placeholder = (container?.getAttribute?.('placeholder') || container?.getAttribute?.('ng-reflect-placeholder') || '').trim();
        if (raw && placeholder && (raw === placeholder || /^введите\s|^укажите\s|^выберите\s/i.test(raw))) return '';
        if (/не\s*указано/i.test(raw)) return '';
        if (/^введите\s|^укажите\s|^выберите\s/i.test(raw)) return '';
        return raw;
      };
      const isModalOrDialog = (el) => {
        const root = el.closest('[role="dialog"], [role="alertdialog"], .modal, [class*="modal"], [class*="dialog"]');
        if (!root) return false;
        const text = (root.textContent || '').toLowerCase();
        return /удалена|потеряны|уверены|отменить|информация будет/i.test(text);
      };
      const isSafeOption = (el) => {
        if (!el) return false;
        if (el.closest('a') || el.tagName === 'A' || el.getAttribute('href')) return false;
        if (isModalOrDialog(el)) return false;
        const txt = (el.textContent || '').trim();
        if (/^(да|нет|отменить|cancel|ok|add)$/i.test(txt)) return false;
        if (/^\+?\s*добавить/i.test(txt)) return false;
        return true;
      };
      const tryFillCombobox = async (input) => {
        const displayBefore = getComboboxDisplayValue(input);
        dbg('tryFillCombobox', { displayBefore, placeholder: input.placeholder, tag: input.tagName });
        if (displayBefore) return true;
        let container = input.closest('app-select, .ant-select, .el-select, nz-select, [class*="select"], [class*="combobox"], [class*="ant-select"], .select-box, [class*="ng-select"]');
        if (!container) {
          let p = input.parentElement;
          while (p && p !== document.body) {
            if (p.querySelector('.arrow, [class*="arrow"], .options, [class*="options"]') || p.tagName === 'APP-SELECT') { container = p; break; }
            p = p.parentElement;
          }
        }
        container = container || input.parentElement;
        const inputHasResultClass = (input.className || '').includes('result');
        const arrow = container?.querySelector('.ant-select-arrow, .el-select__caret, .arrow, [class*="arrow"], [class*="caret"], [class*="suffix"], .select-box, [class*="select-box"]');
        let trigger = arrow || (inputHasResultClass ? input : null) || container?.querySelector('.select-box, .result:not(input), [class*="select-box"]') || container?.querySelector('input[class*="result"]') || container || input.closest('.ant-select-selector, .el-select__wrapper, [class*="selector"]') || input.parentElement || input;
        trigger.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        await delay(100);
        input.focus();
        await delay(150);
        if (trigger === input) {
          input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
          input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
          input.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
        } else {
          try { trigger.click(); } catch (e) {}
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
          trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
          trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
        }
        await delay(2000);
        const overlayRoot = document.querySelector('.cdk-overlay-container');
        const panelSelectors = '.ant-select-dropdown, .el-select-dropdown, .cdk-overlay-pane, .cdk-overlay-container, [role="listbox"], [class*="dropdown"]:not([class*="modal"]), [class*="overlay-pane"], nz-option-container, .options';
        const optionSelectors = '[role="option"], .ant-select-item-option, .el-select-dropdown__item, .ant-select-item, .mat-option, .ng-option, nz-option-item, li[role="option"], .cdk-option, li.ant-select-item, div.ant-select-item, [class*="option-item"], [class*="select-item"], div[class*="item-option"], div[class*="ant-select-item"], .option, .option.cutted-text, .result__content, .result__item';
        const isSelectableOption = (txt) => {
          if (!txt) return false;
          const t = txt.replace(/^[—–-\s]+/, '').trim();
          if (/^[А-ЯA-Z\s:]+$/.test(t)) return false;
          return t.includes('(') || /фз|пп|рп|пр/i.test(t) || t.length > 5;
        };
        const collectOptions = () => {
          let panels = document.querySelectorAll(panelSelectors);
          if (overlayRoot && overlayRoot.querySelectorAll(panelSelectors).length > 0) {
            panels = overlayRoot.querySelectorAll(panelSelectors);
          }
          panels = Array.from(panels).filter(p => p && isVisible(p) && !isModalOrDialog(p));
          const options = [];
          for (const p of panels) {
            const opts = p.querySelectorAll(optionSelectors);
            for (const o of opts) {
              const txt = (o.textContent || '').trim();
              if (txt && isVisible(o) && o.offsetParent !== null && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
            }
          }
          return options;
        };
        let options = [];
        for (let attempt = 0; attempt < 12; attempt++) {
          await delay(attempt === 0 ? 600 : 350);
          options = collectOptions();
          dbg('collectOptions', { attempt, count: options.length, overlayRoot: !!overlayRoot });
          if (options.length > 0) break;
        }
        if (options.length === 0) {
          const fixedOverlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
          for (const ov of fixedOverlays) {
            if (!isVisible(ov) || isModalOrDialog(ov)) continue;
            const opts = ov.querySelectorAll(optionSelectors);
            for (const o of opts) {
              const txt = (o.textContent || '').trim();
              if (txt && isVisible(o) && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
            }
          }
          if (options.length === 0) {
            const allOpts = document.querySelectorAll(optionSelectors);
            for (const o of allOpts) {
              const txt = (o.textContent || '').trim();
              if (txt && isVisible(o) && isSelectableOption(txt) && isSafeOption(o) && !isModalOrDialog(o)) options.push(o);
            }
          }
        }
        if (options.length === 0) {
          dbg('tryFillCombobox fail', { reason: 'no options' });
          return false;
        }
        const chosen = options[Math.floor(Math.random() * options.length)];
        const chosenText = (chosen.textContent || '').trim().replace(/^[—–-]\s*/, '');
        dbg('tryFillCombobox', { chosenText, optionsCount: options.length });
        chosen.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        await delay(400);
        const tryClick = (el) => {
          try {
            el.click();
          } catch (e) {}
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const opts = { bubbles: true, view: window, clientX: cx, clientY: cy, cancelable: true };
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.dispatchEvent(new MouseEvent('click', opts));
        };
        tryClick(chosen);
        await delay(700);
        let displayAfter = getComboboxDisplayValue(input);
        let verified = displayAfter && (displayAfter.includes(chosenText) || chosenText.includes(displayAfter) || /фз|пп|рп|пр/i.test(displayAfter) || displayAfter.length > 2);
        if (!verified) {
          await delay(500);
          displayAfter = getComboboxDisplayValue(input);
          verified = displayAfter && (displayAfter.includes(chosenText) || chosenText.includes(displayAfter) || /фз|пп|рп|пр/i.test(displayAfter) || displayAfter.length > 2);
        }
        if (!verified) {
          const inner = chosen.querySelector('[class*="content"], [class*="label"], [class*="title"], span');
          if (inner) {
            tryClick(inner);
            await delay(700);
            displayAfter = getComboboxDisplayValue(input);
            verified = displayAfter && (displayAfter.includes(chosenText) || chosenText.includes(displayAfter) || /фз|пп|рп|пр/i.test(displayAfter) || displayAfter.length > 2);
          }
        }
        if (!verified) {
          tryClick(chosen);
          await delay(800);
          displayAfter = getComboboxDisplayValue(input);
          verified = displayAfter && displayAfter.length > 2;
        }
        if (verified) await delay(400);
        dbg('tryFillCombobox result', { verified, displayAfter });
        return verified;
      };

      const tryFillAppSelect = async (container) => {
        const displayBefore = getAppSelectDisplayValue(container);
        dbg('tryFillAppSelect', { displayBefore, elementId: container.getAttribute?.('elementid'), label: container.getAttribute?.('label') });
        if (displayBefore) return true;
        const effectiveContainer = (container.matches?.('div.placeholder, div[class*="placeholder"]')
          ? container.closest('app-select, app-group-item-select') || container.closest('.select-box') || container
          : container);
        effectiveContainer.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        await delay(100);
        const clickTargets = [
          () => effectiveContainer.querySelector('.options, [class*="options"]'),
          () => effectiveContainer.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"], .arrow, [class*="arrow"]'),
          () => effectiveContainer.querySelector('.select-box, .result, .placeholder, [class*="placeholder"], [class*="select-box"]'),
          () => {
            const divs = effectiveContainer.querySelectorAll('div');
            let deepest = null;
            let maxDepth = 0;
            for (const d of divs) {
              if (!isVisible(d)) continue;
              let depth = 0;
              for (let p = d; p && p !== effectiveContainer; p = p.parentElement) depth++;
              if (depth > maxDepth) { maxDepth = depth; deepest = d; }
            }
            return deepest;
          },
          () => effectiveContainer
        ];
        let trigger = null;
        for (const fn of clickTargets) {
          trigger = fn();
          if (trigger) break;
        }
        if (!trigger) trigger = effectiveContainer;
      try { trigger.focus?.(); trigger.click(); } catch (e) {}
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
      await delay(3200);
      const overlayRoot = document.querySelector('.cdk-overlay-container');
      const panelSelectors = '.ant-select-dropdown, .el-select-dropdown, .cdk-overlay-pane, .options, .content-list, [role="listbox"], [class*="dropdown"]:not([class*="modal"]), [class*="overlay-pane"], nz-option-container, .cdk-overlay-container [class*="pane"]';
      const optionSelectors = '[role="option"], .ant-select-item-option, .el-select-dropdown__item, .ant-select-item, .mat-option, .ng-option, nz-option-item, li[role="option"], .cdk-option, li.ant-select-item, div.ant-select-item, [class*="option-item"], [class*="select-item"], div[class*="item-option"], div[class*="ant-select-item"], .option, .option.cutted-text, .result__content, .result__item, li.option, div[class*="option"]';
        const isSelectableOption = (txt) => {
          if (!txt) return false;
          const t = txt.replace(/^[—–-\s]+/, '').trim();
          if (t.length < 2) return false;
          if (/^[А-ЯA-Z\s:]{15,}$/.test(t)) return false;
          return t.includes('(') || /фз|пп|рп|пр|закон|план|указано|встреча|статус|тип/i.test(t) || t.length > 2;
        };
        const collectOptions = () => {
          const options = [];
          const addOption = (o) => {
            const txt = (o.textContent || '').trim();
            if (!txt || !isSelectableOption(txt) || !isSafeOption(o)) return;
            const listContainer = o.closest?.('.content-list, .content-list-container');
            const visibleEnough = listContainer
              ? (listContainer.offsetHeight > 0 || o.offsetParent !== null || o.offsetHeight > 0 || isVisible(listContainer))
              : isVisible(o);
            if (visibleEnough) options.push(o);
          };
          const inlineSelectors = '.content-list .option, .content-list-container .option, .content-list .option.cutted-text, .content-list-container .option.cutted-text, .option, .option.cutted-text, .result__content, .result__item, [role="option"], li';
          const optsInContainer = effectiveContainer.querySelectorAll(inlineSelectors);
          for (const o of optsInContainer) {
            if (effectiveContainer.querySelector('.result, .result__value')?.contains?.(o)) continue;
            addOption(o);
          }
          if (options.length === 0) {
            let panels = overlayRoot ? overlayRoot.querySelectorAll(panelSelectors) : document.querySelectorAll(panelSelectors);
            if (!panels.length) panels = document.querySelectorAll(panelSelectors);
            panels = Array.from(panels).filter(p => p && isVisible(p) && !isModalOrDialog(p));
            for (const p of panels) {
              const opts = p.querySelectorAll(optionSelectors);
              for (const o of opts) {
                const txt = (o.textContent || '').trim();
                if (txt && isVisible(o) && (o.offsetParent !== null || o.offsetHeight > 0) && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
              }
            }
          }
          if (options.length === 0 && effectiveContainer.id) {
            const byId = document.querySelectorAll(`#${CSS.escape(effectiveContainer.id)} .option, #${CSS.escape(effectiveContainer.id)} .content-list .option`);
            for (const o of byId) {
              const txt = (o.textContent || '').trim();
              if (txt && isVisible(o) && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
            }
          }
          if (options.length === 0) {
            const byContentListId = document.querySelectorAll('[id*="status-project"], [id*="project-status"], [id*="typeOfMeeting"], [id*="type-of-meeting"], .content-list');
            for (const listEl of byContentListId) {
              if (!effectiveContainer.contains(listEl) && listEl.closest?.('app-select, app-group-item-select') !== effectiveContainer) continue;
              const opts = listEl.querySelectorAll('.option, .option.cutted-text, [role="option"]');
              const listVisible = listEl.offsetHeight > 0 || isVisible(listEl);
              for (const o of opts) {
                const txt = (o.textContent || '').trim();
                if (!txt || !isSelectableOption(txt) || !isSafeOption(o)) continue;
                if (listVisible || o.offsetHeight > 0 || isVisible(o)) options.push(o);
              }
              if (options.length > 0) break;
            }
          }
          return options;
        };
        let options = [];
        const elementId = container.getAttribute?.('elementid') || container.getAttribute?.('ng-reflect-element-id');
        for (let attempt = 0; attempt < 12; attempt++) {
          await delay(attempt === 0 ? 600 : 350);
          options = collectOptions();
          if (options.length > 0) break;
          if (elementId) {
            const resultId = `${elementId}__result`;
            let relatedPanel = document.getElementById(resultId) || document.querySelector(`[id*="${resultId}"]`);
            if (!relatedPanel) relatedPanel = document.querySelector(`[id*="${elementId}"][id*="__result"]`);
            if (relatedPanel && container.contains(relatedPanel)) relatedPanel = null;
            if (relatedPanel) {
              const opts = relatedPanel.querySelectorAll(optionSelectors);
              for (const o of opts) {
                const txt = (o.textContent || '').trim();
                if (txt && isVisible(o) && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
              }
              if (options.length > 0) break;
            }
          }
        }
        if (options.length === 0) {
          try { trigger.click(); } catch (e) {}
          await delay(2500);
          options = collectOptions();
        }
        if (options.length === 0) {
          const fixedOverlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
          for (const ov of fixedOverlays) {
            if (!isVisible(ov) || isModalOrDialog(ov)) continue;
            const opts = ov.querySelectorAll(optionSelectors + ', li, div[class*="option"], div[class*="item"]');
            for (const o of opts) {
              const txt = (o.textContent || '').trim();
              if (txt && isVisible(o) && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
            }
          }
        }
        if (options.length === 0) {
          const broadOpts = document.querySelectorAll('.cdk-overlay-container .option, .cdk-overlay-container li, .cdk-overlay-container [role="option"], .cdk-overlay-container .result__content');
          for (const o of broadOpts) {
            const txt = (o.textContent || '').trim();
            if (txt && txt.length > 4 && !/^выберите|^укажите|^select$/i.test(txt) && isVisible(o) && isSafeOption(o)) options.push(o);
          }
        }
        dbg('tryFillAppSelect options', { count: options.length, elementId });
        if (options.length === 0) return false;
        const chosen = options[Math.floor(Math.random() * options.length)];
        const chosenText = (chosen.textContent || '').trim().replace(/^[—–-]\s*/, '');
        chosen.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        await delay(400);
        const tryClick = (el) => {
          if (!el) return;
          try { el.click(); } catch (e) {}
          const rect = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
        };
        const optionClickTarget = chosen.querySelector('span[ng-reflect-app-tooltip], span') || chosen;
        tryClick(optionClickTarget);
        if (optionClickTarget !== chosen) tryClick(chosen);
        await delay(700);
        const displayAfter = getAppSelectDisplayValue(container);
        let verified = displayAfter && (displayAfter.includes(chosenText) || chosenText.includes(displayAfter) || /фз|пп|рп|пр/i.test(displayAfter) || displayAfter.length > 2);
        if (!verified) {
          await delay(500);
          const d2 = getAppSelectDisplayValue(container);
          verified = d2 && d2.length > 2;
        }
        dbg('tryFillAppSelect result', { verified, displayAfter, chosenText });
        return !!verified;
      };

      dbg('fill start', { inputSelectorsCount: selectors.length, resolvedFieldsCount: resolvedFields.length, effectiveFillTarget, fillTarget, requiredCount });

      for (const { sel, input } of resolvedFields) {

        const maxLen = input.maxLength > 0 ? input.maxLength : (input.tagName === 'TEXTAREA' ? 524288 : 524288);
        const minVal = input.min !== undefined && input.min !== '' ? parseFloat(input.min) : null;
        const maxVal = input.max !== undefined && input.max !== '' ? parseFloat(input.max) : null;

        const fieldMeta = {
          selector: sel.selector,
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          label: input.labels?.[0]?.textContent || input.getAttribute('aria-label') || '',
          required: input.required,
          value: input.value || '',
          maxLength: maxLen,
          min: minVal,
          max: maxVal
        };
        fields.push(fieldMeta);
        const type = (input.type || 'text').toLowerCase();
        const idNameLabel = `${fieldMeta.id} ${fieldMeta.name} ${fieldMeta.label}`.toLowerCase();
        const placeholderRaw = fieldMeta.placeholder || input.getAttribute?.('placeholder') || input.getAttribute?.('ng-reflect-placeholder') || '';
        const placeholderLower = placeholderRaw.toLowerCase();
        const isDateLikeText = (fieldMeta.type === 'text') && (
          /\bdate\b/i.test(idNameLabel) ||
          /дата|срок|согласовать|deadline|receive|контрольн|period|calendar/i.test(idNameLabel) ||
          /дд\.мм\.гггг|dd\.mm\.yyyy|datepicker|date-picker/i.test(placeholderLower) ||
          /datepicker|date-picker|mat-datepicker/i.test((input.className || '') + ' ' + (input.getAttribute?.('ng-reflect-type') || ''))
        );
        const isDateType = ['date', 'datetime-local', 'month', 'week'].includes(type) || isDateLikeText;

        const appSelectContainer = input.closest?.('app-select, app-group-item-select') || (['app-select', 'app-group-item-select'].includes((input.tagName || '').toLowerCase()) ? input : null);
        const isAppSelectLike = !!appSelectContainer ||
          (input.matches?.('div.placeholder, div[class*="placeholder"]') && /^выберите\s*$/i.test((input.textContent || '').trim()));
        const isEmpty = isAppSelectLike ? !getAppSelectDisplayValue(appSelectContainer || input) : (!input.value || String(input.value).trim() === '');
        const isRequired = isFieldRequired(input);
        const shouldFill = effectiveFillTarget === 'all'
          ? true
          : effectiveFillTarget === 'required'
            ? isRequired
            : isEmpty;
        dbg('field', { selector: sel.selector, placeholder: input.placeholder, shouldFill, isEmpty, isRequired, tag: input.tagName, label: input.getAttribute?.('label') });
        if (!shouldFill) continue;
        input.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        await delay(scopeElement ? 150 : 50);
        const tag = input.tagName.toLowerCase();
        const comboboxLike = isComboboxLike(input);
        dbg('field combobox', { selector: sel.selector, comboboxLike, disabled: input.disabled, readOnly: input.readOnly });
        if (!comboboxLike && (input.disabled || input.readOnly)) continue;

        let valueToSet = '';
        
        // ПРИОРИТЕТ 1: Проверить globalFieldRules (глобальные правила)
        let globalRuleValue = null;
        
        // Проверяем точное совпадение селектора
        if (globalFieldRules && globalFieldRules[sel.selector]) {
          globalRuleValue = globalFieldRules[sel.selector];
          dbg('globalRule:exact', { selector: sel.selector, value: globalRuleValue });
        } else if (globalFieldRules && Object.keys(globalFieldRules).length > 0) {
          // Проверяем по ID
          if (fieldMeta.id && globalFieldRules[`#${fieldMeta.id}`]) {
            globalRuleValue = globalFieldRules[`#${fieldMeta.id}`];
            dbg('globalRule:id', { id: fieldMeta.id, value: globalRuleValue });
          }
          // Проверяем по name
          else if (fieldMeta.name && globalFieldRules[`[name="${fieldMeta.name}"]`]) {
            globalRuleValue = globalFieldRules[`[name="${fieldMeta.name}"]`];
            dbg('globalRule:name', { name: fieldMeta.name, value: globalRuleValue });
          }
          // Проверяем остальные правила
          else {
            for (const [ruleSelector, ruleValue] of Object.entries(globalFieldRules)) {
              try {
                // Проверяем соответствие селектору
                if (input.matches && input.matches(ruleSelector)) {
                  globalRuleValue = ruleValue;
                  dbg('globalRule:match', { selector: ruleSelector, value: ruleValue });
                  break;
                }
              } catch (e) {
                // Игнорируем невалидные селекторы
              }
            }
          }
        }
        
        // Если есть глобальное правило - используем его (с раскрытием паттернов Test{5}, {email} и т.д.)
        if (globalRuleValue !== null && globalRuleValue !== undefined && String(globalRuleValue).trim() !== '') {
          valueToSet = applyPattern(String(globalRuleValue));
          dbg('using:globalRule', { selector: sel.selector, value: valueToSet });
          // Для полей дат: placeholder "дд.мм.гггг" — это формат, не значение. Подставляем реальную дату.
          const valTrim = String(valueToSet).trim();
          const ph = (input.placeholder || input.getAttribute?.('placeholder') || input.getAttribute?.('ng-reflect-placeholder') || '').trim();
          const isPlaceholderAsValue = /^дд\.мм\.гггг$|^dd\.mm\.yyyy$/i.test(valTrim) || (ph && valTrim === ph && /дд\.мм\.гггг|dd\.mm\.yyyy/i.test(ph));
          if (isDateType && isPlaceholderAsValue) {
            const d = new Date();
            valueToSet = toRuDate(d);
            dbg('datePlaceholderOverride', { was: 'дд.мм.гггг', now: valueToSet });
          }
        }
        // Иначе генерируем значение по типу поля
        else if (isAppSelectLike) {
          try {
            await delay(1200);
            const container = appSelectContainer || input;
            const ok = await tryFillAppSelect(container);
            if (ok) filledCount++;
          } catch (e) {
            validationErrors.push({ selector: sel.selector, message: e.message, value: '(app-select-like)' });
          }
          continue;
        } else if (tag === 'select') {
          const opts = Array.from(input.options).filter(o => {
            if (!o || o.disabled) return false;
            const v = o.value;
            if (v === undefined || v === null || String(v).trim() === '') return false;
            return true;
          });
          if (opts.length) valueToSet = opts[Math.floor(Math.random() * opts.length)].value;
        } else if (comboboxLike) {
          try {
            await delay(1200);
            const ok = await tryFillCombobox(input);
            if (ok) filledCount++;
          } catch (e) {
            validationErrors.push({ selector: sel.selector, message: e.message, value: '(combobox)' });
          }
          continue;
        } else if (type === 'checkbox' || type === 'radio') {
          input.checked = !input.checked;
          filledCount++;
          continue;
        } else if (type === 'email') {
          valueToSet = `user${Math.floor(Math.random() * 9999)}@example.com`;
        } else if (type === 'number') {
          const min = minVal ?? 0;
          const max = maxVal ?? 9999;
          valueToSet = String(Math.floor(min + Math.random() * (max - min + 1)));
        } else if (type === 'tel') {
          valueToSet = `+7 (${randomStr(3, '0123456789')}) ${randomStr(3, '0123456789')}-${randomStr(2, '0123456789')}-${randomStr(2, '0123456789')}`;
        } else if (type === 'url') {
          valueToSet = `https://example.com/path${Math.floor(Math.random() * 9999)}`;
        } else if (isDateType && !(fillOptions?.testInvalidDateInput)) {
          // Поля дат: только дата. testInvalidDateInput — для проверки некорректного ввода (форма не сохранится).
          const d = new Date();
          d.setDate(d.getDate() + Math.floor(Math.random() * 30) - 15);
          if (type === 'datetime-local') {
            valueToSet = toIsoDate(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
          } else if (type === 'month') {
            valueToSet = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          } else if (type === 'week') {
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const weekNum = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
            valueToSet = d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
          } else if (isDateLikeText) {
            valueToSet = toRuDate(d);
          } else {
            valueToSet = toIsoDate(d);
          }
        } else if (isDateType && fillOptions?.testInvalidDateInput) {
          // Режим проверки некорректного ввода: заполняем не датой (форма не сохранится).
          valueToSet = randomStr(Math.min(8, maxLen), charset);
        } else {
          let len = charCount;
          if (fillMode === 'max') len = maxLen;
          else if (fillMode === 'count') len = charCount;
          else len = Math.floor(Math.random() * Math.min(charCount, maxLen)) + 1;
          valueToSet = randomStr(len, charset);
        }

        if (valueToSet !== '') {
          try {
            // Для полей дат: placeholder "дд.мм.гггг" — формат, не значение. Всегда подставляем реальную дату.
            const valTrim = String(valueToSet).trim();
            const ph = (input.placeholder || input.getAttribute?.('placeholder') || input.getAttribute?.('ng-reflect-placeholder') || '').trim();
            const isPlaceholderAsValue = /^дд\.мм\.гггг$|^dd\.mm\.yyyy$/i.test(valTrim) || (ph && valTrim === ph && /дд\.мм\.гггг|dd\.mm\.yyyy/i.test(ph));
            if (isDateType && !fillOptions?.testInvalidDateInput && isPlaceholderAsValue) {
              const d = new Date();
              valueToSet = toRuDate(d);
            }
            input.focus();
            // Для полей дат: иногда двойной клик заполняет сегодняшней датой (datepicker).
            if (isDateType && !fillOptions?.testInvalidDateInput) {
              const beforeDbl = input.value || '';
              input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
              await delay(300);
              const afterDbl = input.value || '';
              if (afterDbl && afterDbl !== beforeDbl && /^\d{4}-\d{2}-\d{2}|^\d{2}\.\d{2}\.\d{4}$/.test(afterDbl.replace(/\s/g, ''))) {
                valueToSet = afterDbl;
                filledCount++;
                input.blur();
                continue;
              }
            }
            input.value = valueToSet;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();

            // Retry для полей, не прошедших нативную валидацию: пробуем более "безопасные" форматы.
            if (!input.checkValidity()) {
              const retryCandidates = [];
              if (isDateType && !fillOptions?.testInvalidDateInput) {
                const now = new Date();
                const minDate = parseDateLike(input.min) || null;
                const maxDate = parseDateLike(input.max) || null;
                let candidate = now;
                if (minDate && candidate < minDate) candidate = minDate;
                if (maxDate && candidate > maxDate) candidate = maxDate;
                if (type === 'datetime-local') {
                  retryCandidates.push(toIsoDate(candidate) + 'T12:00');
                } else if (type === 'month') {
                  retryCandidates.push(candidate.getFullYear() + '-' + String(candidate.getMonth() + 1).padStart(2, '0'));
                } else if (type === 'week') {
                  const startOfYear = new Date(candidate.getFullYear(), 0, 1);
                  const weekNum = Math.ceil((((candidate - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
                  retryCandidates.push(candidate.getFullYear() + '-W' + String(weekNum).padStart(2, '0'));
                } else {
                  retryCandidates.push(toIsoDate(candidate));
                }
                if (isDateLikeText) {
                  retryCandidates.push(toRuDate(now));
                  retryCandidates.push(`${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`);
                }
              } else if (type === 'number') {
                const min = Number.isFinite(minVal) ? minVal : 0;
                const max = Number.isFinite(maxVal) ? maxVal : min + 100;
                const safe = Math.max(min, Math.min(max, min));
                retryCandidates.push(String(safe));
              } else if (type === 'email') {
                retryCandidates.push('user@example.com');
              } else if (type === 'url') {
                retryCandidates.push('https://example.com');
              }

              for (const candidate of retryCandidates) {
                if (!candidate || String(candidate) === String(input.value)) continue;
                input.focus();
                input.value = String(candidate);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.blur();
                if (input.checkValidity()) {
                  valueToSet = String(candidate);
                  break;
                }
              }
            }

            const afterValue = input.value;
            const isPersisted = String(afterValue) === String(valueToSet);
            if (!input.checkValidity() && input.validationMessage) {
              validationErrors.push({ selector: sel.selector, message: input.validationMessage, value: valueToSet.substring(0, 50) });
            }
            if (isPersisted) {
              filledCount++;
            }
          } catch (e) {
            validationErrors.push({ selector: sel.selector, message: e.message, value: valueToSet.substring(0, 50) });
          }
        }
      }

      // Return only JSON-serializable data so chrome.scripting result is transferred (structured clone)
      const summary = {
        total: fields.length,
        resolvedCount: resolvedFields.length,
        byType: fields.reduce((acc, f) => { acc[f.type] = (acc[f.type] || 0) + 1; return acc; }, {}),
        required: fields.filter(f => f.required).length,
        empty: fields.filter(f => !f.value).length,
        filled: filledCount,
        validationErrors: validationErrors.length
      };
      const serializableFields = fields.map(f => ({
        selector: String(f.selector || ''),
        type: String(f.type || ''),
        value: String(f.value != null ? f.value : ''),
        required: !!f.required
      }));
      const serializableValidationErrors = validationErrors.map(ve => ({
        selector: String(ve.selector != null ? ve.selector : ''),
        message: String(ve.message != null ? ve.message : ''),
        value: String(ve.value != null ? ve.value : '')
      }));
      return {
        fields: serializableFields,
        summary,
        validationErrors: serializableValidationErrors
      };
      } catch (e) {
        return {
          fields: [],
          summary: { total: 0, resolvedCount: 0, byType: {}, required: 0, empty: 0, filled: 0, validationErrors: 0 },
          validationErrors: [{ selector: '', message: String(e?.message || e), value: '' }],
          _fillError: String(e?.message || e)
        };
      }
    };
  },

  /**
   * Функция заполнения одного dropdown конкретным значением (логика analysis-fill-fields).
   * Выполняется в контексте страницы для доступа к Angular.
   */
  _getFillSingleDropdownFunction() {
    return async function(containerSelector, targetValue) {
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const normalizeCompact = (s) => normalize(String(s || '').replace(/[^\p{L}\p{N}\s()]+/gu, ' '));
      const targetLower = normalize(String(targetValue));
      const targetCompact = normalizeCompact(String(targetValue));
      const container = document.querySelector(containerSelector);
      if (!container) return { success: false, error: 'Container not found: ' + containerSelector };
      const getDisplayValue = (c) => {
        const display = c?.querySelector('.result__content, .result__value, .result, [ng-reflect-value]');
        const raw = (display?.textContent || display?.getAttribute?.('ng-reflect-app-tooltip') || c?.getAttribute?.('ng-reflect-value') || '').trim();
        const ph = (c?.getAttribute?.('placeholder') || c?.getAttribute?.('ng-reflect-placeholder') || '').trim();
        if (raw && ph && raw === ph) return '';
        return raw;
      };
      const isVisible = (el) => {
        if (!el) return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      };
      const isSafeOption = (el) => !el?.closest('a') && el?.tagName !== 'A';
      container.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
      await delay(100);
      const clickTargets = [
        () => container.querySelector('.options, [class*="options"]'),
        () => container.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]'),
        () => container.querySelector('[role="combobox"], input[role="combobox"]'),
        () => container.querySelector('.select-box, .result, .arrow, [class*="arrow"], [class*="select-box"]'),
        () => container
      ];
      let trigger = null;
      for (const fn of clickTargets) {
        trigger = fn();
        if (trigger) break;
      }
      if (!trigger) return { success: false, error: 'No trigger found' };
      const pulseOpen = (el) => {
        if (!el) return;
        try { el.focus?.(); el.click?.(); } catch (_) {}
        try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); } catch (_) {}
        try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch (_) {}
        try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch (_) {}
        try {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        } catch (_) {}
      };
      pulseOpen(trigger);
      await delay(900);
      const optionSelectors = '[role="option"], .mat-option, .ng-option, .cdk-option, .option, .option.cutted-text, .group-item, li[role="option"], .ant-select-item-option, [class*="group-item"]';
      const panelSelectors = '.cdk-overlay-pane, .cdk-overlay-container, .ant-select-dropdown, .el-select-dropdown, [role="listbox"], [id*="__result"], [class*="dropdown-panel"], [class*="content-list"]';
      const collectOptions = () => {
        const options = [];
        const overlayRoot = document.querySelector('.cdk-overlay-container');
        let panels = overlayRoot ? overlayRoot.querySelectorAll(panelSelectors) : [];
        if (!panels.length) panels = document.querySelectorAll(panelSelectors);
        panels = Array.from(panels).filter(p => p && isVisible(p));
        for (const p of panels) {
          p.querySelectorAll(optionSelectors).forEach(o => {
            const txt = (o.textContent || '').trim();
            if (txt && isVisible(o) && isSafeOption(o) && (o.offsetParent !== null || o.offsetHeight > 0)) options.push(o);
          });
        }
        const elementId = container.getAttribute?.('elementid') || container.getAttribute?.('ng-reflect-element-id');
        if (elementId) {
          const resultId = elementId + '__result';
          const relatedPanel = document.getElementById(resultId) || document.querySelector('[id*="' + resultId + '"]');
          if (relatedPanel) {
            relatedPanel.querySelectorAll(optionSelectors).forEach(o => {
              const txt = (o.textContent || '').trim();
              if (txt && isVisible(o) && isSafeOption(o)) options.push(o);
            });
          }
        }
        if (options.length === 0) {
          document.querySelectorAll('.cdk-overlay-container .option, .cdk-overlay-container .result__content').forEach(o => {
            const txt = (o.textContent || '').trim();
            if (txt && txt.length > 2 && isVisible(o) && isSafeOption(o)) options.push(o);
          });
        }
        if (options.length === 0) {
          container.querySelectorAll(optionSelectors).forEach(o => {
            const txt = (o.textContent || '').trim();
            if (txt && isVisible(o) && isSafeOption(o)) options.push(o);
          });
        }
        return [...new Set(options)];
      };
      let options = [];
      for (let attempt = 0; attempt < 16; attempt++) {
        await delay(attempt === 0 ? 800 : 400);
        options = collectOptions();
        if (options.length > 0) break;
        if (attempt >= 2 && (attempt % 2 === 1 || attempt === 14)) {
          const deepTrigger = container.querySelector('div div div div:nth-of-type(2), .select-box, .result, [role="combobox"]');
          const appSelect = container.closest?.('app-select') || container.querySelector?.('app-select');
          const openTargets = [trigger, deepTrigger, appSelect, container];
          openTargets.forEach((el) => {
            if (el) pulseOpen(el);
          });
        }
      }
      const getOptText = (o) => {
        const c = o.querySelector('.result__content, .result__value, [ng-reflect-value], [ng-reflect-app-tooltip]');
        const raw = (
          c?.textContent ||
          c?.getAttribute?.('ng-reflect-app-tooltip') ||
          o.getAttribute?.('ng-reflect-app-tooltip') ||
          o.getAttribute?.('aria-label') ||
          o.getAttribute?.('title') ||
          o.textContent ||
          o.innerText ||
          ''
        ).trim().replace(/^[—–-]\s*/, '');
        return normalize(raw) || normalize(o.textContent || '');
      };
      const abbrevMatch = targetLower.match(/\(([^)]+)\)/);
      const isStrictMatch = (txt) => {
        if (!txt) return false;
        const txtCompact = normalizeCompact(txt);
        if (txt === targetLower || txtCompact === targetCompact) return true;
        if (abbrevMatch) {
          const abRaw = String(abbrevMatch[1] || '');
          const ab = normalize(abRaw);
          if (ab && (txt === ab || txt.endsWith('(' + ab + ')') || txt.endsWith(' (' + ab + ')'))) return true;
        }
        return false;
      };
      const matchOption = (o) => {
        const txt = getOptText(o);
        if (!txt) return false;
        return isStrictMatch(txt);
      };
      let matched = options.find(matchOption);
      if (!matched) return { success: false, error: 'Option not found: ' + targetValue };
      matched.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
      await delay(400);
      const tryClick = (el) => {
        try { el.click(); } catch (e) {}
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const opts = { bubbles: true, view: window, clientX: cx, clientY: cy, cancelable: true };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      };
      const clickTarget = matched.closest?.('.option, [role="option"], [class*="option-item"]') || matched;
      tryClick(clickTarget);
      await delay(700);
      const isVerified = (disp) => {
        if (!disp) return false;
        const d = normalize(String(disp || ''));
        return isStrictMatch(d);
      };
      let displayAfter = getDisplayValue(container);
      let verified = isVerified(displayAfter);
      if (!verified) {
        const parentOption = matched.closest && matched.closest('.option, [class*="option"], [role="option"]');
        if (parentOption && parentOption !== matched) {
          tryClick(parentOption);
          await delay(600);
          displayAfter = getDisplayValue(container);
          verified = isVerified(displayAfter);
        }
      }
      if (!verified) {
        await delay(500);
        displayAfter = getDisplayValue(container);
        verified = isVerified(displayAfter);
      }
      return verified ? { success: true } : { success: false, error: 'Selection not verified' };
    };
  },

  /**
   * Форматирование результатов анализа для отображения
   * @param {Object} result - Результат анализа
   * @returns {Object}
   */
  formatResults(result) {
    if (!result.success) {
      return {
        error: result.error,
        summary: 'Analysis failed'
      };
    }

    const data = result.data;
    
    return {
      type: data.metadata.analysisType,
      url: data.metadata.url,
      timestamp: data.metadata.timestamp,
      summary: data.summary,
      data: data.selectors || data.fields || data.issues || data.forms || data.links || data.metrics
    };
  }
};

// Экспорт для использования в других модулях
if (typeof globalThis !== 'undefined') {
  globalThis.AnalysisModule = AnalysisModule;
}
if (typeof window !== 'undefined') {
  window.AnalysisModule = AnalysisModule;
}
if (typeof self !== 'undefined') {
  self.AnalysisModule = AnalysisModule;
}
