/**
 * Selector Cache Module for AutoTest Recorder
 * Хранение и управление найденными селекторами
 * 
 * @version 1.0.0
 * @date 2026-02-25
 */

const SelectorCache = {
  /**
   * Ключ для хранения в chrome.storage.local
   */
  STORAGE_KEY: 'selectorCache',
  
  /**
   * Время жизни кэша (30 минут)
   */
  CACHE_TTL: 30 * 60 * 1000,
  
  /**
   * Максимальное количество селекторов в кэше
   */
  MAX_SELECTORS: 500,
  
  /**
   * Локальный кэш в памяти
   */
  _cache: {},
  
  /**
   * Инициализация модуля
   */
  async init() {
    await this.loadFromStorage();
    console.log('✅ [SelectorCache] Initialized');
  },
  
  /**
   * Загрузка кэша из хранилища
   */
  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      if (result[this.STORAGE_KEY]) {
        this._cache = result[this.STORAGE_KEY];
      }
    } catch (error) {
      console.warn('⚠️ [SelectorCache] Could not load from storage:', error);
    }
  },
  
  /**
   * Сохранение кэша в хранилище
   */
  async saveToStorage() {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: this._cache
      });
    } catch (error) {
      console.warn('⚠️ [SelectorCache] Could not save to storage:', error);
    }
  },
  
  /**
   * Генерация ключа кэша для вкладки
   * @param {number} tabId - ID вкладки
   * @param {string} url - URL страницы
   * @returns {string}
   */
  _getCacheKey(tabId, url) {
    // Используем URL без hash и query параметров для стабильности
    try {
      const urlObj = new URL(url);
      const baseUrl = urlObj.origin + urlObj.pathname;
      return `${tabId}:${baseUrl}`;
    } catch {
      return `${tabId}:${url}`;
    }
  },
  
  /**
   * Сохранение селекторов для вкладки
   * @param {number} tabId - ID вкладки
   * @param {string} url - URL страницы
   * @param {Array} selectors - Массив селекторов
   * @param {Object} metadata - Дополнительные метаданные
   */
  async saveSelectors(tabId, url, selectors, metadata = {}) {
    const key = this._getCacheKey(tabId, url);
    
    // Ограничиваем количество селекторов
    const limitedSelectors = selectors.slice(0, this.MAX_SELECTORS);
    
    this._cache[key] = {
      tabId,
      url,
      selectors: limitedSelectors,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        count: limitedSelectors.length
      }
    };
    
    await this.saveToStorage();
    
    console.log(`✅ [SelectorCache] Saved ${limitedSelectors.length} selectors for tab ${tabId}`);
    
    return {
      success: true,
      count: limitedSelectors.length,
      key
    };
  },
  
  /**
   * Получение селекторов для вкладки
   * @param {number} tabId - ID вкладки
   * @param {string} currentUrl - Текущий URL (для валидации)
   * @returns {Object|null}
   */
  async getSelectors(tabId, currentUrl = null) {
    // Если URL передан, ищем по точному ключу
    if (currentUrl) {
      const key = this._getCacheKey(tabId, currentUrl);
      const cached = this._cache[key];
      
      if (cached && this._isCacheValid(cached)) {
        return cached;
      }
    }
    
    // Иначе ищем любой кэш для данной вкладки
    const tabKeyPrefix = `${tabId}:`;
    for (const [key, cached] of Object.entries(this._cache)) {
      if (key.startsWith(tabKeyPrefix) && this._isCacheValid(cached)) {
        return cached;
      }
    }
    
    return null;
  },
  
  /**
   * Получение всех селекторов для вкладки (упрощённый список)
   * @param {number} tabId - ID вкладки
   * @param {string} currentUrl - Текущий URL
   * @returns {Array}
   */
  async getSelectorsList(tabId, currentUrl = null) {
    const cached = await this.getSelectors(tabId, currentUrl);
    
    if (!cached || !cached.selectors) {
      return [];
    }
    
    return cached.selectors.map(s => ({
      selector: s.selector,
      type: s.type,
      value: s.value,
      element: s.element,
      inputType: s.inputType,
      text: s.text,
      quality: s.quality,
      isUnique: s.isUnique
    }));
  },
  
  /**
   * Получение селекторов только по URL (без tabId) - для использования из редактора
   * @param {string} url - URL страницы
   * @returns {Array}
   */
  async getSelectorsByUrl(url) {
    if (!url) return [];
    
    // Нормализуем URL для сравнения
    let baseUrl = url;
    try {
      const urlObj = new URL(url);
      baseUrl = urlObj.origin + urlObj.pathname;
    } catch {
      // Используем URL как есть
    }
    
    // Ищем в кэше по URL (перебираем все записи)
    for (const [key, cached] of Object.entries(this._cache)) {
      if (!this._isCacheValid(cached)) continue;
      
      // Сравниваем URL кэша с искомым
      let cachedBase = cached.url || '';
      try {
        const cachedUrlObj = new URL(cached.url);
        cachedBase = cachedUrlObj.origin + cachedUrlObj.pathname;
      } catch {
        // Используем URL как есть
      }
      
      if (cachedBase === baseUrl) {
        return cached.selectors.map(s => ({
          selector: s.selector,
          type: s.type,
          value: s.value,
          element: s.element,
          inputType: s.inputType,
          text: s.text,
          quality: s.quality,
          isUnique: s.isUnique
        }));
      }
    }
    
    return [];
  },

  /**
   * Получение сгруппированных селекторов только по URL (без tabId)
   * @param {string} url - URL страницы
   * @returns {Object|null}
   */
  async getSelectorsGroupedByUrl(url) {
    const selectors = await this.getSelectorsByUrl(url);
    if (!selectors || selectors.length === 0) return null;
    
    const grouped = {};
    for (const s of selectors) {
      const type = s.type || 'css';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(s.selector || s.value || '');
    }
    
    return Object.keys(grouped).length > 0 ? grouped : null;
  },

  /**
   * Получение селекторов по типу
   * @param {number} tabId - ID вкладки
   * @param {string} type - Тип селектора (data-testid, id, name, class, etc.)
   * @param {string} currentUrl - Текущий URL
   * @returns {Array}
   */
  async getSelectorsByType(tabId, type, currentUrl = null) {
    const selectors = await this.getSelectorsList(tabId, currentUrl);
    return selectors.filter(s => s.type === type);
  },
  
  /**
   * Проверка валидности кэша
   * @param {Object} cached - Объект кэша
   * @returns {boolean}
   */
  _isCacheValid(cached) {
    if (!cached || !cached.metadata || !cached.metadata.timestamp) {
      return false;
    }
    
    const age = Date.now() - cached.metadata.timestamp;
    return age < this.CACHE_TTL;
  },
  
  /**
   * Проверка актуальности кэша для текущей страницы
   * @param {number} tabId - ID вкладки
   * @param {string} currentUrl - Текущий URL
   * @returns {boolean}
   */
  async isCacheValid(tabId, currentUrl) {
    const cached = await this.getSelectors(tabId, currentUrl);
    return cached !== null;
  },
  
  /**
   * Очистка кэша для вкладки
   * @param {number} tabId - ID вкладки
   */
  async clearForTab(tabId) {
    const keysToRemove = [];
    
    for (const key of Object.keys(this._cache)) {
      if (key.startsWith(`${tabId}:`)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      delete this._cache[key];
    }
    
    if (keysToRemove.length > 0) {
      await this.saveToStorage();
      console.log(`✅ [SelectorCache] Cleared ${keysToRemove.length} cache entries for tab ${tabId}`);
    }
    
    return keysToRemove.length;
  },
  
  /**
   * Очистка устаревшего кэша
   */
  async clearExpired() {
    const keysToRemove = [];
    
    for (const [key, cached] of Object.entries(this._cache)) {
      if (!this._isCacheValid(cached)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      delete this._cache[key];
    }
    
    if (keysToRemove.length > 0) {
      await this.saveToStorage();
      console.log(`✅ [SelectorCache] Cleared ${keysToRemove.length} expired cache entries`);
    }
    
    return keysToRemove.length;
  },
  
  /**
   * Полная очистка кэша
   */
  async clearAll() {
    this._cache = {};
    await chrome.storage.local.remove(this.STORAGE_KEY);
    console.log('✅ [SelectorCache] All cache cleared');
  },
  
  /**
   * Получение статистики кэша
   * @returns {Object}
   */
  getStats() {
    let totalSelectors = 0;
    let validEntries = 0;
    let expiredEntries = 0;
    
    for (const cached of Object.values(this._cache)) {
      if (this._isCacheValid(cached)) {
        validEntries++;
        totalSelectors += cached.selectors?.length || 0;
      } else {
        expiredEntries++;
      }
    }
    
    return {
      totalEntries: Object.keys(this._cache).length,
      validEntries,
      expiredEntries,
      totalSelectors,
      maxSelectors: this.MAX_SELECTORS,
      cacheTTL: this.CACHE_TTL
    };
  },
  
  /**
   * Поиск селекторов по тексту
   * @param {number} tabId - ID вкладки
   * @param {string} searchText - Текст для поиска
   * @param {string} currentUrl - Текущий URL
   * @returns {Array}
   */
  async searchSelectors(tabId, searchText, currentUrl = null) {
    const selectors = await this.getSelectorsList(tabId, currentUrl);
    
    if (!searchText) {
      return selectors;
    }
    
    const search = searchText.toLowerCase();
    
    return selectors.filter(s => 
      (s.selector && s.selector.toLowerCase().includes(search)) ||
      (s.value && s.value.toLowerCase().includes(search)) ||
      (s.text && s.text.toLowerCase().includes(search)) ||
      (s.element && s.element.toLowerCase().includes(search))
    );
  },
  
  /**
   * Группировка селекторов по типу
   * @param {number} tabId - ID вкладки
   * @param {string} currentUrl - Текущий URL
   * @returns {Object}
   */
  async getSelectorsGrouped(tabId, currentUrl = null) {
    const selectors = await this.getSelectorsList(tabId, currentUrl);
    
    const grouped = {
      dataTestId: [],
      dataCy: [],
      id: [],
      name: [],
      ariaLabel: [],
      className: [],
      css: [],
      xpath: [],
      other: []
    };
    
    for (const s of selectors) {
      switch (s.type) {
        case 'data-testid':
          grouped.dataTestId.push(s);
          break;
        case 'data-cy':
          grouped.dataCy.push(s);
          break;
        case 'id':
          grouped.id.push(s);
          break;
        case 'name':
          grouped.name.push(s);
          break;
        case 'aria-label':
          grouped.ariaLabel.push(s);
          break;
        case 'class':
          grouped.className.push(s);
          break;
        case 'css':
          grouped.css.push(s);
          break;
        case 'xpath':
          grouped.xpath.push(s);
          break;
        default:
          grouped.other.push(s);
      }
    }
    
    return grouped;
  }
};

// Экспорт для использования в других модулях
if (typeof globalThis !== 'undefined') {
  globalThis.SelectorCache = SelectorCache;
}
if (typeof window !== 'undefined') {
  window.SelectorCache = SelectorCache;
}
if (typeof self !== 'undefined') {
  self.SelectorCache = SelectorCache;
}
export { SelectorCache };
