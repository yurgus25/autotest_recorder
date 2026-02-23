/**
 * InlineSelectorPicker - Компактный пикер селекторов при записи
 * Показывается рядом с кликнутым элементом для быстрого выбора лучшего селектора
 */

class InlineSelectorPicker {
  constructor(element, selectors, options = {}) {
    this.element = element;
    this.selectors = selectors;
    this.options = {
      autoSelectTimeout: 5000, // Автовыбор лучшего через 5 сек
      maxVisibleSelectors: 3,
      showScores: true,
      ...options
    };
    
    this.panel = null;
    this.backdrop = null;
    this.timeout = null;
    this.countdownInterval = null;
    this.countdown = Math.floor(this.options.autoSelectTimeout / 1000);
    this.callbacks = {
      select: [],
      timeout: [],
      cancel: []
    };
    
    this.selectedIndex = 0;
    this.isExpanded = false;
  }

  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
    return this;
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  show() {
    this.injectStyles();
    this.createBackdrop();
    this.createPanel();
    this.positionPanel();
    this.attachHandlers();
    this.startCountdown();
    this.highlightElement();
  }

  close() {
    this.stopCountdown();
    this.removeHighlight();
    
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
    
    // Удаляем стили при закрытии
    const styles = document.getElementById('autotest-selector-picker-styles');
    if (styles) styles.remove();
  }

  createBackdrop() {
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'autotest-selector-picker-backdrop';
    this.backdrop.setAttribute('data-autotest-picker', 'true');
    this.backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      z-index: 2147483645;
    `;
    document.body.appendChild(this.backdrop);
  }

  createPanel() {
    const scored = this.scoreAndSort(this.selectors);
    this.selectors = scored;
    
    this.panel = document.createElement('div');
    this.panel.id = 'autotest-selector-picker';
    this.panel.setAttribute('data-autotest-picker', 'true');
    this.panel.innerHTML = this.buildHTML();
    
    document.body.appendChild(this.panel);
  }

  scoreAndSort(selectors) {
    return selectors.map(sel => {
      const score = this.calculateScore(sel);
      return { ...sel, score };
    }).sort((a, b) => b.score - a.score);
  }

  calculateScore(selector) {
    let score = 0;
    const sel = selector.selector || '';
    const type = selector.type || '';
    
    // Базовые очки по типу
    const typeScores = {
      'data-testid': 100,
      'data-cy': 95,
      'data-test': 90,
      'data-qa': 85,
      'data-automation': 80,
      'unique-selector': 78,
      'finder-lite': 76,
      'id': 75,
      'name': 70,
      'aria-label': 65,
      'ng-reflect-label': 62,
      'ng-reflect-element-id': 62,
      'angular-component': 60,
      'role-text': 55,
      'title': 50,
      'placeholder': 50,
      'class': 40,
      'optimal-select': 35,
      'tag-text': 30,
      'tag-position': 10
    };
    
    score += typeScores[type] || 25;
    
    // Бонус за уникальность
    if (selector.isUnique) score += 20;
    
    // Штрафы за нестабильность
    
    // Динамические классы (хэши)
    if (/css-[\da-z]+/i.test(sel)) score -= 30;
    if (/sc-[a-z0-9]+/i.test(sel)) score -= 30;
    if (/emotion-[a-z0-9]+/i.test(sel)) score -= 30;
    if (/[a-f0-9]{8,}/i.test(sel) && !sel.includes('data-')) score -= 20;
    
    // nth-child с большими индексами
    const nthMatch = sel.match(/:nth-(?:child|of-type)\((\d+)\)/);
    if (nthMatch) {
      const idx = parseInt(nthMatch[1]);
      if (idx > 10) score -= 25;
      else if (idx > 5) score -= 15;
      else if (idx > 3) score -= 10;
    }
    
    // Слишком длинный селектор
    if (sel.length > 150) score -= 20;
    else if (sel.length > 100) score -= 10;
    else if (sel.length > 60) score -= 5;
    
    // Слишком глубокая вложенность
    const depth = (sel.match(/>/g) || []).length + (sel.match(/\s+/g) || []).length;
    if (depth > 6) score -= 15;
    else if (depth > 4) score -= 10;
    
    // ng-star-inserted (Angular динамические элементы)
    if (sel.includes('ng-star-inserted')) score -= 25;
    
    // Бонусы за стабильность
    
    // Семантические атрибуты
    if (sel.includes('data-testid')) score += 10;
    if (sel.includes('[aria-')) score += 5;
    if (sel.includes('[role=')) score += 5;
    
    // Короткий и чистый селектор
    if (sel.length < 40 && selector.isUnique) score += 15;
    else if (sel.length < 60 && selector.isUnique) score += 10;
    
    // Простой ID селектор
    if (/^#[\w-]+$/.test(sel) && selector.isUnique) score += 15;
    
    // Простой data- атрибут
    if (/^\[data-[\w-]+="[^"]+"\]$/.test(sel) && selector.isUnique) score += 15;
    
    return Math.max(0, Math.min(100, score));
  }

  buildHTML() {
    const visible = this.selectors.slice(0, this.isExpanded ? 10 : this.options.maxVisibleSelectors);
    const hasMore = this.selectors.length > this.options.maxVisibleSelectors;
    const best = this.selectors[0];
    
    return `
      <div class="picker-header">
        <div class="picker-title">
          <span class="picker-icon">🎯</span>
          <span>Выберите селектор</span>
        </div>
        <div class="picker-actions">
          <span class="picker-countdown" id="picker-countdown">${this.countdown}с</span>
          <button class="picker-close" id="picker-close">✕</button>
        </div>
      </div>
      
      <div class="picker-content">
        <div class="picker-info">
          <span class="picker-element-tag">&lt;${this.element.tagName.toLowerCase()}&gt;</span>
          <span class="picker-element-text">${this.getElementPreview()}</span>
        </div>
        
        <div class="picker-selectors">
          ${visible.map((sel, idx) => this.buildSelectorOption(sel, idx, idx === 0)).join('')}
        </div>
        
        ${hasMore && !this.isExpanded ? `
          <button class="picker-expand" id="picker-expand">
            Показать все (${this.selectors.length})
          </button>
        ` : ''}
        
        ${this.isExpanded ? `
          <button class="picker-collapse" id="picker-collapse">
            Свернуть
          </button>
        ` : ''}
      </div>
      
      <div class="picker-footer">
        <button class="picker-btn picker-btn-primary" id="picker-use-best">
          ⚡ Использовать лучший
        </button>
        <button class="picker-btn picker-btn-secondary" id="picker-open-inspector">
          🔍 Инспектор
        </button>
      </div>
    `;
  }

  buildSelectorOption(sel, idx, isBest) {
    const scoreColor = sel.score >= 70 ? '#4caf50' : sel.score >= 50 ? '#ff9800' : '#f44336';
    const scoreLabel = sel.score >= 70 ? 'Отличный' : sel.score >= 50 ? 'Хороший' : 'Рискованный';
    
    return `
      <div class="selector-option ${isBest ? 'selector-option-best' : ''} ${idx === this.selectedIndex ? 'selector-option-selected' : ''}"
           data-index="${idx}">
        <div class="selector-option-header">
          <span class="selector-badge ${isBest ? 'selector-badge-best' : ''}">
            ${isBest ? '⭐ Лучший' : sel.type}
          </span>
          ${this.options.showScores ? `
            <span class="selector-score" style="color: ${scoreColor}">
              ${sel.score} • ${scoreLabel}
            </span>
          ` : ''}
          ${sel.isUnique ? '<span class="selector-unique">✓</span>' : '<span class="selector-not-unique">⚠</span>'}
        </div>
        <code class="selector-value">${this.escapeHtml(sel.selector)}</code>
        <div class="selector-option-actions">
          <button class="selector-copy" data-selector="${this.escapeHtml(sel.selector)}">📋</button>
          <button class="selector-test" data-selector="${this.escapeHtml(sel.selector)}">✓ Тест</button>
          <button class="selector-use" data-index="${idx}">Выбрать</button>
        </div>
      </div>
    `;
  }

  getElementPreview() {
    const text = this.element.textContent?.trim() || this.element.innerText?.trim() || '';
    const preview = text.substring(0, 40);
    return preview ? `"${this.escapeHtml(preview)}${text.length > 40 ? '...' : ''}"` : '(без текста)';
  }

  positionPanel() {
    if (!this.panel || !this.element) return;
    
    const rect = this.element.getBoundingClientRect();
    const panelWidth = 380;
    const panelHeight = 400; // Примерная высота
    
    // Определяем позицию
    let left = rect.left;
    let top = rect.bottom + 10;
    
    // Проверяем, помещается ли справа
    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth - 20;
    }
    
    // Проверяем, помещается ли снизу
    if (top + panelHeight > window.innerHeight) {
      top = rect.top - panelHeight - 10;
      if (top < 0) {
        top = 20;
      }
    }
    
    this.panel.style.left = `${Math.max(10, left)}px`;
    this.panel.style.top = `${Math.max(10, top)}px`;
  }

  attachHandlers() {
    // === ВАЖНО: Помечаем события как "от пикера" чтобы recorder их игнорировал ===
    // НЕ блокируем propagation внутри панели - это мешает кнопкам работать!
    // Вместо этого recorder проверяет closest() на #autotest-selector-picker
    
    // Закрытие
    const closeBtn = this.panel.querySelector('#picker-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.emit('cancel');
        this.close();
      });
    }
    
    // Клик по backdrop - закрывает
    if (this.backdrop) {
      this.backdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        this.emit('cancel');
        this.close();
      });
    }
    
    // Использовать лучший
    const useBestBtn = this.panel.querySelector('#picker-use-best');
    if (useBestBtn) {
      useBestBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.emit('select', this.selectors[0]);
        this.close();
      });
    }
    
    // Открыть инспектор
    const openInspectorBtn = this.panel.querySelector('#picker-open-inspector');
    if (openInspectorBtn) {
      openInspectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.emit('cancel');
        this.close();
        // Открываем инспектор
        if (window.selectorInspector) {
          window.selectorInspector.activate();
        }
      });
    }
    
    // Развернуть/свернуть
    const expandBtn = this.panel.querySelector('#picker-expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isExpanded = true;
        this.updateContent();
      });
    }
    
    const collapseBtn = this.panel.querySelector('#picker-collapse');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isExpanded = false;
        this.updateContent();
      });
    }
    
    // Клик по опции селектора - выбор
    this.panel.querySelectorAll('.selector-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        // Если кликнули по кнопке внутри - не обрабатываем
        if (e.target.closest('.selector-copy') || 
            e.target.closest('.selector-test') ||
            e.target.closest('.selector-use')) {
          return;
        }
        e.stopPropagation();
        const idx = parseInt(opt.dataset.index);
        this.selectedIndex = idx;
        this.updateSelection();
      });
    });
    
    // Кнопка "Выбрать" - выбирает и закрывает
    this.panel.querySelectorAll('.selector-use').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        this.emit('select', this.selectors[idx]);
        this.close();
      });
    });
    
    // Кнопка "Копировать" - только копирует, НЕ закрывает
    this.panel.querySelectorAll('.selector-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const selector = btn.dataset.selector;
        navigator.clipboard.writeText(selector).then(() => {
          const originalText = btn.textContent;
          btn.textContent = '✓';
          btn.style.color = '#4caf50';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
          }, 1500);
        }).catch(err => {
          console.error('Ошибка копирования:', err);
          btn.textContent = '✕';
          btn.style.color = '#f44336';
          setTimeout(() => {
            btn.textContent = '📋';
            btn.style.color = '';
          }, 1500);
        });
      });
    });
    
    // Кнопка "Тест" - только тестирует, НЕ закрывает
    this.panel.querySelectorAll('.selector-test').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const selector = btn.dataset.selector;
        const originalText = btn.textContent;
        
        try {
          const found = document.querySelectorAll(selector);
          if (found.length === 1) {
            btn.textContent = '✓ 1';
            btn.style.color = '#4caf50';
            // Подсветить найденный элемент
            this.flashElement(found[0]);
          } else if (found.length > 1) {
            btn.textContent = `⚠ ${found.length}`;
            btn.style.color = '#ff9800';
            // Подсветить все найденные
            found.forEach(el => this.flashElement(el));
          } else {
            btn.textContent = '✕ 0';
            btn.style.color = '#f44336';
          }
        } catch (err) {
          btn.textContent = '✕ Err';
          btn.style.color = '#f44336';
        }
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = '';
        }, 2000);
      });
    });
    
    // Клавиатура
    document.addEventListener('keydown', this.keyHandler = (e) => {
      if (e.key === 'Escape') {
        this.emit('cancel');
        this.close();
      } else if (e.key === 'Enter') {
        this.emit('select', this.selectors[this.selectedIndex]);
        this.close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.selectors.length - 1);
        this.updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
      }
    });
  }

  updateContent() {
    if (this.panel) {
      const content = this.panel.querySelector('.picker-content');
      if (content) {
        this.panel.innerHTML = this.buildHTML();
        this.attachHandlers();
      }
    }
  }

  updateSelection() {
    if (!this.panel) return;
    
    this.panel.querySelectorAll('.selector-option').forEach((opt, idx) => {
      opt.classList.toggle('selector-option-selected', idx === this.selectedIndex);
    });
  }

  startCountdown() {
    this.countdownInterval = setInterval(() => {
      this.countdown--;
      const countdownEl = document.getElementById('picker-countdown');
      if (countdownEl) {
        countdownEl.textContent = `${this.countdown}с`;
      }
      
      if (this.countdown <= 0) {
        this.stopCountdown();
        this.emit('timeout', this.selectors[0]);
        this.close();
      }
    }, 1000);
  }

  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  highlightElement() {
    if (!this.element) return;
    
    this.originalOutline = this.element.style.outline;
    this.originalOutlineOffset = this.element.style.outlineOffset;
    
    this.element.style.outline = '3px solid #2196f3';
    this.element.style.outlineOffset = '2px';
  }

  removeHighlight() {
    if (this.element) {
      this.element.style.outline = this.originalOutline || '';
      this.element.style.outlineOffset = this.originalOutlineOffset || '';
    }
  }

  flashElement(el) {
    const originalBg = el.style.backgroundColor;
    el.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
    setTimeout(() => {
      el.style.backgroundColor = originalBg;
    }, 500);
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

  injectStyles() {
    if (document.getElementById('autotest-selector-picker-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'autotest-selector-picker-styles';
    style.textContent = `
      #autotest-selector-picker {
        position: fixed;
        width: 380px;
        max-height: 80vh;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        overflow: hidden;
        animation: picker-slide-in 0.2s ease-out;
      }
      
      @keyframes picker-slide-in {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .picker-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .picker-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
      }
      
      .picker-icon {
        font-size: 18px;
      }
      
      .picker-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .picker-countdown {
        background: rgba(255,255,255,0.2);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
      }
      
      .picker-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .picker-close:hover {
        background: rgba(255,255,255,0.3);
      }
      
      .picker-content {
        padding: 12px;
        max-height: 350px;
        overflow-y: auto;
      }
      
      .picker-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: #f5f5f5;
        border-radius: 6px;
        margin-bottom: 12px;
      }
      
      .picker-element-tag {
        background: #e3f2fd;
        color: #1976d2;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
      }
      
      .picker-element-text {
        color: #666;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .picker-selectors {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .selector-option {
        padding: 10px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .selector-option:hover {
        border-color: #2196f3;
        background: #f8f9fa;
      }
      
      .selector-option-selected {
        border-color: #2196f3;
        background: #e3f2fd;
      }
      
      .selector-option-best {
        border-color: #4caf50;
        border-width: 2px;
        background: #f1f8e9;
      }
      
      .selector-option-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      
      .selector-badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #e0e0e0;
        color: #666;
      }
      
      .selector-badge-best {
        background: #ff9800;
        color: white;
      }
      
      .selector-score {
        font-size: 11px;
        margin-left: auto;
      }
      
      .selector-unique {
        color: #4caf50;
        font-weight: bold;
      }
      
      .selector-not-unique {
        color: #ff9800;
      }
      
      .selector-value {
        display: block;
        font-size: 12px;
        color: #333;
        background: #fafafa;
        padding: 6px 8px;
        border-radius: 4px;
        word-break: break-all;
        max-height: 60px;
        overflow: hidden;
        margin-bottom: 8px;
      }
      
      .selector-option-actions {
        display: flex;
        gap: 6px;
      }
      
      .selector-option-actions button {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.15s;
      }
      
      .selector-option-actions button:hover {
        background: #f0f0f0;
      }
      
      .selector-copy, .selector-test {
        flex: 0 0 auto !important;
        width: 40px;
      }
      
      .selector-use {
        background: #2196f3 !important;
        color: white !important;
        border-color: #2196f3 !important;
      }
      
      .selector-use:hover {
        background: #1976d2 !important;
      }
      
      .picker-expand, .picker-collapse {
        width: 100%;
        padding: 10px;
        margin-top: 8px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        color: #666;
      }
      
      .picker-expand:hover, .picker-collapse:hover {
        background: #e0e0e0;
      }
      
      .picker-footer {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid #eee;
        background: #fafafa;
      }
      
      .picker-btn {
        flex: 1;
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.15s;
      }
      
      .picker-btn-primary {
        background: #4caf50;
        color: white;
      }
      
      .picker-btn-primary:hover {
        background: #43a047;
      }
      
      .picker-btn-secondary {
        background: white;
        border: 1px solid #ddd;
        color: #666;
      }
      
      .picker-btn-secondary:hover {
        background: #f5f5f5;
      }
    `;
    
    document.head.appendChild(style);
  }
}

// Экспортируем для использования
window.InlineSelectorPicker = InlineSelectorPicker;

console.log('✅ [InlineSelectorPicker] Модуль загружен');
