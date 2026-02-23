// Анализатор селекторов для расширенного поиска

class SelectorAnalyzer {
  constructor() {
    this.tabId = null;
    this.analysisData = null;
    this.currentTab = 'all';
    this.filters = {
      buttons: true,
      inputs: true,
      selects: true,
      links: true,
      dropdowns: true
    };
    this.searchQuery = '';
    this.init();
  }

  async init() {
    // Получаем tabId из URL
    const urlParams = new URLSearchParams(window.location.search);
    this.tabId = urlParams.get('tabId');

    if (!this.tabId) {
      document.getElementById('results').innerHTML = 
        '<div class="empty-state">❌ Не удалось получить ID вкладки</div>';
      return;
    }

    // Привязываем обработчики
    document.getElementById('refreshBtn').addEventListener('click', () => this.analyze());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderResults();
    });

    // Фильтры
    ['filterButtons', 'filterInputs', 'filterSelects', 'filterLinks', 'filterDropdowns'].forEach(id => {
      document.getElementById(id).addEventListener('change', (e) => {
        const key = id.replace('filter', '').toLowerCase();
        this.filters[key] = e.target.checked;
        this.renderResults();
      });
    });

    // Вкладки
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.getAttribute('data-tab');
        this.renderResults();
      });
    });

    // Запускаем анализ
    await this.analyze();
  }

  async analyze() {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    
    loading.style.display = 'block';
    results.innerHTML = '';

    try {
      // Инжектируем скрипт анализа в активную вкладку
      const analysisFunction = function() {
          const SelectorEngine = class {
            constructor() {
              this.priorities = ['data-testid', 'data-cy', 'data-test', 'id', 'name', 'aria-label', 'role', 'class', 'tag'];
            }
            
            detectFramework() {
              if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return 'react';
              if (window.ng || window.getAllAngularRootElements) return 'angular';
              if (window.Vue || window.__VUE__) return 'vue';
              return 'unknown';
            }
            
            escapeSelector(str) {
              return str.replace(/([!"#$%&'()*+,.\\/:;<=>?@[\\\\\\]^\\`{|}~])/g, '\\\\$1');
            }
            
            getElementText(element) {
              if (!element) return '';
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                return element.value || element.placeholder || '';
              }
              const text = element.textContent?.trim() || '';
              if (!text && element.getAttribute('aria-label')) {
                return element.getAttribute('aria-label');
              }
              return text;
            }
            
            checkUniqueness(selector) {
              try {
                const elements = document.querySelectorAll(selector);
                return elements.length === 1;
              } catch (e) {
                return false;
              }
            }
            
            generateAllSelectors(element) {
              if (!element || !element.tagName) return [];
              const selectors = [];

              this.addUniqueSelector(element, selectors);
              this.addFinderLiteSelector(element, selectors);
              
              // data-testid
              if (element.dataset.testid) {
                const sel = '[data-testid="' + this.escapeSelector(element.dataset.testid) + '"]';
                selectors.push({
                  type: 'data-testid',
                  value: element.dataset.testid,
                  selector: sel,
                  priority: 1,
                  isUnique: this.checkUniqueness(sel)
                });
              }
              
              // data-cy
              if (element.dataset.cy) {
                const sel = '[data-cy="' + this.escapeSelector(element.dataset.cy) + '"]';
                selectors.push({
                  type: 'data-cy',
                  value: element.dataset.cy,
                  selector: sel,
                  priority: 2,
                  isUnique: this.checkUniqueness(sel)
                });
              }
              
              // id
              if (element.id) {
                const sel = '#' + this.escapeSelector(element.id);
                selectors.push({
                  type: 'id',
                  value: element.id,
                  selector: sel,
                  priority: 4,
                  isUnique: this.checkUniqueness(sel)
                });
              }
              
              // name
              if (element.name) {
                const sel = '[name="' + this.escapeSelector(element.name) + '"]';
                selectors.push({
                  type: 'name',
                  value: element.name,
                  selector: sel,
                  priority: 5,
                  isUnique: this.checkUniqueness(sel)
                });
              }
              
              // aria-label
              if (element.getAttribute('aria-label')) {
                const ariaLabel = element.getAttribute('aria-label');
                const sel = '[aria-label="' + this.escapeSelector(ariaLabel) + '"]';
                selectors.push({
                  type: 'aria-label',
                  value: ariaLabel,
                  selector: sel,
                  priority: 6,
                  isUnique: this.checkUniqueness(sel)
                });
              }
              
              // class (только уникальные)
              if (element.className && typeof element.className === 'string') {
                const classes = element.className.split(' ').filter(c => c);
                for (const className of classes) {
                  const sel = '.' + this.escapeSelector(className);
                  if (this.checkUniqueness(sel)) {
                    selectors.push({
                      type: 'class',
                      value: className,
                      selector: sel,
                      priority: 8,
                      isUnique: true
                    });
                    break;
                  }
                }
              }
              
              // Angular специфичные
              if (this.detectFramework() === 'angular') {
                const ngReflectTooltip = element.getAttribute('ng-reflect-app-tooltip');
                if (ngReflectTooltip) {
                  const sel = '[ng-reflect-app-tooltip="' + this.escapeSelector(ngReflectTooltip) + '"]';
                  selectors.push({
                    type: 'angular-tooltip',
                    value: ngReflectTooltip,
                    selector: sel,
                    priority: 3.1,
                    isUnique: this.checkUniqueness(sel)
                  });
                }
                
                const appSelect = element.closest('app-select');
                if (appSelect) {
                  const elementId = appSelect.getAttribute('elementid') || appSelect.getAttribute('ng-reflect-element-id');
                  const label = appSelect.getAttribute('label') || appSelect.getAttribute('ng-reflect-label');
                  
                  if (elementId && label) {
                    const sel = 'app-select[elementid="' + elementId + '"][label="' + label + '"]';
                    selectors.push({
                      type: 'angular-component',
                      value: 'app-select',
                      selector: sel,
                      priority: 2.5,
                      isUnique: this.checkUniqueness(sel)
                    });
                  }
                }
              }
              
              return selectors;
            }

            addFinderLiteSelector(element, selectors) {
              if (!window.FinderLite || typeof window.FinderLite.getSelector !== 'function') return;
              try {
                const finderSelector = window.FinderLite.getSelector(element, {
                  root: document.body,
                  maxDepth: 7,
                  preferStableAttributes: true
                });
                if (finderSelector && !selectors.find(sel => sel.selector === finderSelector)) {
                  selectors.unshift({
                    type: 'finder-lite',
                    value: finderSelector,
                    selector: finderSelector,
                    priority: 0.5,
                    isUnique: this.checkUniqueness(finderSelector),
                    libraries: ['FinderLite']
                  });
                } else if (finderSelector) {
                  const existing = selectors.find(sel => sel.selector === finderSelector);
                  if (existing) {
                    existing.libraries = existing.libraries || [];
                    if (!existing.libraries.includes('FinderLite')) {
                      existing.libraries.unshift('FinderLite');
                    }
                  }
                }
              } catch (e) {
                console.warn('FinderLite analyzer error:', e);
              }
            }

            addUniqueSelector(element, selectors) {
              if (!window.UniqueSelectorLite || typeof window.UniqueSelectorLite.find !== 'function') return;
              try {
                const uniqueSelector = window.UniqueSelectorLite.find(element, { root: document.body });
                if (uniqueSelector && !selectors.find(sel => sel.selector === uniqueSelector)) {
                  selectors.unshift({
                    type: 'unique-selector',
                    value: uniqueSelector,
                    selector: uniqueSelector,
                    priority: 0.4,
                    isUnique: this.checkUniqueness(uniqueSelector),
                    libraries: ['UniqueSelectorLite']
                  });
                } else if (uniqueSelector) {
                  const existing = selectors.find(sel => sel.selector === uniqueSelector);
                  if (existing) {
                    existing.libraries = existing.libraries || [];
                    if (!existing.libraries.includes('UniqueSelectorLite')) {
                      existing.libraries.unshift('UniqueSelectorLite');
                    }
                  }
                }
              } catch (e) {
                console.warn('UniqueSelectorLite analyzer error:', e);
              }
            }

            appendLibrarySelectors(element, selectors) {
              const libraryMap = {};

              try {
                if (window.OptimalSelectLite && typeof window.OptimalSelectLite.select === 'function') {
                  const optimalResult = window.OptimalSelectLite.select(element, {
                    includeTag: true,
                    includeNthChild: true
                  });
                  const optimalSelector = optimalResult && optimalResult.selector;
                  if (optimalSelector) {
                    libraryMap[optimalSelector] = libraryMap[optimalSelector] || [];
                    if (!libraryMap[optimalSelector].includes('OptimalSelectLite')) {
                      libraryMap[optimalSelector].push('OptimalSelectLite');
                    }
                  }
                }
              } catch (e) {
                console.warn('OptimalSelectLite analyzer error:', e);
              }

              Object.entries(libraryMap).forEach(([selectorText, libs]) => {
                const existing = selectors.find(sel => sel.selector === selectorText);
                if (existing) {
                  existing.libraries = libs;
                } else {
                  selectors.push({
                    type: 'library',
                    value: selectorText,
                    selector: selectorText,
                    priority: 4.3,
                    isUnique: this.checkUniqueness(selectorText),
                    libraries: libs
                  });
                }
              });
            }
          };
          
          const engine = new SelectorEngine();
          const framework = engine.detectFramework();
          
          // Находим все интерактивные элементы
          const allElements = Array.from(document.querySelectorAll(
            'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [data-testid], [data-cy], [data-test], app-select, .select-box, [class*="dropdown"], [class*="select"]'
          ));
          
          const elements = [];
          const dropdowns = [];
          const statusFields = [];
          const dropdownOptions = [];
          
          allElements.forEach((element, index) => {
            const text = engine.getElementText(element);
            const allSelectors = engine.generateAllSelectors(element);
            engine.appendLibrarySelectors(element, allSelectors);
            const bestSelector = allSelectors.sort((a, b) => {
              if (a.isUnique !== b.isUnique) return a.isUnique ? -1 : 1;
              return a.priority - b.priority;
            })[0];
            
            const elementData = {
              index,
              tag: element.tagName.toLowerCase(),
              type: element.type || null,
              name: element.name || null,
              id: element.id || null,
              classes: element.className || null,
              text: text,
              href: element.href || null,
              value: element.value || null,
              placeholder: element.placeholder || null,
              'data-testid': element.dataset.testid || null,
              'data-cy': element.dataset.cy || null,
              'aria-label': element.getAttribute('aria-label') || null,
              role: element.getAttribute('role') || null,
              selectors: allSelectors,
              bestSelector: bestSelector,
              html: element.outerHTML.substring(0, 200)
            };
            
            // Проверяем, является ли это dropdown
            const isDropdown = element.tagName === 'APP-SELECT' || 
                              element.closest('app-select') ||
                              element.classList.contains('select-box') ||
                              element.classList.contains('input-project-status') ||
                              element.getAttribute('role') === 'combobox';
            
            if (isDropdown) {
              elementData.dropdown = true;
              dropdowns.push(elementData);
              
              // Проверяем, является ли это полем статуса
              if (text.toLowerCase().includes('статус') || 
                  text.toLowerCase().includes('status') ||
                  element.closest('.input-project-status') ||
                  (element.closest('app-select') && element.closest('app-select').getAttribute('elementid') === 'status-project')) {
                statusFields.push(elementData);
              }
              
              // Ищем опции dropdown (если открыт)
              const appSelect = element.closest('app-select') || element;
              if (appSelect) {
                const options = Array.from(document.querySelectorAll(
                  '[role="option"], .result__content, [ng-reflect-app-tooltip], [tooltip], div[class*="result"], span[class*="result"]'
                ));
                
                options.forEach(opt => {
                  const optText = opt.textContent ? opt.textContent.trim() : (opt.getAttribute('ng-reflect-app-tooltip') || '');
                  if (optText && !dropdownOptions.find(o => o.text === optText)) {
                    dropdownOptions.push({
                      text: optText,
                      ngTooltip: opt.getAttribute('ng-reflect-app-tooltip') || null,
                      tooltip: opt.getAttribute('tooltip') || null,
                      value: opt.getAttribute('value') || (opt.dataset ? opt.dataset.value : null) || null,
                      html: opt.outerHTML.substring(0, 150)
                    });
                  }
                });
              }
            }
            
            elements.push(elementData);
          });
          
          return {
            url: window.location.href,
            framework: framework,
            timestamp: new Date().toISOString(),
            elements: elements,
            dropdowns: dropdowns,
            statusFields: statusFields,
            dropdownOptions: dropdownOptions,
            totalElements: elements.length
          };
        };

      // Выполняем скрипт в контексте страницы
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: parseInt(this.tabId) },
        func: analysisFunction
      });

      this.analysisData = result.result;
      this.updateInfo();
      this.renderResults();
    } catch (error) {
      console.error('Ошибка анализа:', error);
      results.innerHTML = `<div class="empty-state">❌ Ошибка анализа: ${error.message}</div>`;
    } finally {
      loading.style.display = 'none';
    }
  }

  updateInfo() {
    if (!this.analysisData) return;

    document.getElementById('currentUrl').textContent = this.analysisData.url;
    document.getElementById('framework').textContent = this.analysisData.framework || 'unknown';
    document.getElementById('totalElements').textContent = this.analysisData.totalElements || 0;
  }

  renderResults() {
    if (!this.analysisData) return;

    const results = document.getElementById('results');
    let elementsToShow = [];

    // Фильтруем по вкладке
    switch (this.currentTab) {
      case 'dropdowns':
        elementsToShow = this.analysisData.dropdowns || [];
        break;
      case 'status':
        elementsToShow = this.analysisData.statusFields || [];
        break;
      case 'options':
        // Показываем опции dropdown
        results.innerHTML = this.renderDropdownOptions();
        return;
      default:
        elementsToShow = this.analysisData.elements || [];
    }

    // Применяем фильтры
    elementsToShow = elementsToShow.filter(el => {
      const tag = el.tag.toLowerCase();
      if (tag === 'button' && !this.filters.buttons) return false;
      if ((tag === 'input' || tag === 'textarea') && !this.filters.inputs) return false;
      if (tag === 'select' && !this.filters.selects) return false;
      if (tag === 'a' && !this.filters.links) return false;
      if (el.dropdown && !this.filters.dropdowns) return false;
      return true;
    });

    // Применяем поиск
    if (this.searchQuery) {
      elementsToShow = elementsToShow.filter(el => {
        const searchText = (
          el.text + ' ' +
          el.selector?.selector + ' ' +
          el.type + ' ' +
          el.tag + ' ' +
          (el.selectors || []).map(s => s.selector).join(' ')
        ).toLowerCase();
        return searchText.includes(this.searchQuery);
      });
    }

    if (elementsToShow.length === 0) {
      results.innerHTML = '<div class="empty-state">🔍 Элементы не найдены</div>';
      return;
    }

    results.innerHTML = elementsToShow.map(el => this.renderElementCard(el)).join('');
    
    // Привязываем обработчики копирования
    document.querySelectorAll('.selector-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selector = e.target.getAttribute('data-selector');
        navigator.clipboard.writeText(selector).then(() => {
          e.target.textContent = '✓ Скопировано';
          setTimeout(() => {
            e.target.textContent = '📋 Копировать';
          }, 2000);
        });
      });
    });
  }

  renderElementCard(element) {
    const typeClass = this.getElementTypeClass(element);
    const typeLabel = this.getElementTypeLabel(element);
    
    return `
      <div class="element-card">
        <div class="element-header">
          <div class="element-title">${this.escapeHtml(element.tag)} ${element.id ? `#${element.id}` : ''}</div>
          <span class="element-type ${typeClass}">${typeLabel}</span>
        </div>
        
        ${element.text ? `<div class="element-text">${this.escapeHtml(element.text)}</div>` : ''}
        
        <div class="selectors-list">
          ${(element.selectors || []).slice(0, 5).map(sel => `
            <div class="selector-item ${sel.isUnique ? 'unique' : 'not-unique'}">
              <div class="selector-header">
                <span class="selector-type">${sel.type}</span>
                <span class="selector-priority">Приоритет: ${sel.priority}</span>
              </div>
              ${sel.libraries && sel.libraries.length ? `
                <div class="selector-libraries">
                  ${sel.libraries.map(lib => `<span class="library-badge">${lib}</span>`).join('')}
                </div>
              ` : ''}
              <div class="selector-value">${this.escapeHtml(sel.selector)}</div>
              <button class="selector-copy" data-selector="${this.escapeHtml(sel.selector)}">
                📋 Копировать
              </button>
            </div>
          `).join('')}
        </div>
        
        ${element.dropdownOptions ? `
          <div class="dropdown-options">
            <div class="dropdown-options-title">Опции dropdown:</div>
            ${element.dropdownOptions.map(opt => `
              <div class="option-item">
                <span class="option-text">${this.escapeHtml(opt.text)}</span>
                <span class="option-attributes">${opt.ngTooltip || opt.tooltip || ''}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderDropdownOptions() {
    const options = this.analysisData.dropdownOptions || [];
    
    if (options.length === 0) {
      return '<div class="empty-state">🔍 Опции dropdown не найдены. Откройте dropdown на странице и обновите анализ.</div>';
    }

    return `
      <div class="results">
        ${options.map(opt => `
          <div class="element-card">
            <div class="element-header">
              <div class="element-title">Опция dropdown</div>
            </div>
            <div class="element-text">${this.escapeHtml(opt.text)}</div>
            ${opt.ngTooltip ? `<div class="element-text">ng-reflect-app-tooltip: ${this.escapeHtml(opt.ngTooltip)}</div>` : ''}
            ${opt.tooltip ? `<div class="element-text">tooltip: ${this.escapeHtml(opt.tooltip)}</div>` : ''}
            ${opt.value ? `<div class="element-text">value: ${this.escapeHtml(opt.value)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  getElementTypeClass(element) {
    const tag = element.tag.toLowerCase();
    if (tag === 'button') return 'element-type-button';
    if (tag === 'input' || tag === 'textarea') return 'element-type-input';
    if (tag === 'select') return 'element-type-select';
    if (tag === 'a') return 'element-type-link';
    if (element.dropdown || tag === 'app-select') return 'element-type-dropdown';
    return '';
  }

  getElementTypeLabel(element) {
    const tag = element.tag.toLowerCase();
    if (tag === 'button') return 'Кнопка';
    if (tag === 'input') return 'Поле ввода';
    if (tag === 'textarea') return 'Текстовая область';
    if (tag === 'select') return 'Выпадающий список';
    if (tag === 'a') return 'Ссылка';
    if (tag === 'app-select') return 'Angular Select';
    if (element.dropdown) return 'Dropdown';
    return 'Элемент';
  }

  escapeHtml(text) {
    // Используем глобальную функцию из shared/utils.js если доступна
    if (window.Utils && typeof window.Utils.escapeHtml === 'function') {
      return window.Utils.escapeHtml(text);
    }
    // Fallback для обратной совместимости
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  exportData() {
    if (!this.analysisData) {
      alert('Нет данных для экспорта');
      return;
    }

    const dataStr = JSON.stringify(this.analysisData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `selectors-analysis-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

// Инициализация
const analyzer = new SelectorAnalyzer();

