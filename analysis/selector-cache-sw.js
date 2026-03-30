/**
 * Selector Cache - Service Worker compatible (no async keyword for importScripts).
 * Same API as selector-cache.js, uses Promise chains instead of async/await.
 */
const SelectorCache = {
  STORAGE_KEY: 'selectorCache',
  CACHE_TTL: 30 * 60 * 1000,
  MAX_SELECTORS: 500,
  _cache: {},

  init() {
    return this.loadFromStorage().then(() => {
      console.log('✅ [SelectorCache] Initialized');
    });
  },

  loadFromStorage() {
    return chrome.storage.local.get(this.STORAGE_KEY).then((result) => {
      if (result[this.STORAGE_KEY]) {
        this._cache = result[this.STORAGE_KEY];
      }
    }).catch((error) => {
      console.warn('⚠️ [SelectorCache] Could not load from storage:', error);
    });
  },

  saveToStorage() {
    return chrome.storage.local.set({
      [this.STORAGE_KEY]: this._cache
    }).catch((error) => {
      console.warn('⚠️ [SelectorCache] Could not save to storage:', error);
    });
  },

  _getCacheKey(tabId, url) {
    try {
      const urlObj = new URL(url);
      return `${tabId}:${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return `${tabId}:${url}`;
    }
  },

  saveSelectors(tabId, url, selectors, metadata = {}) {
    const key = this._getCacheKey(tabId, url);
    const limitedSelectors = selectors.slice(0, this.MAX_SELECTORS);
    this._cache[key] = {
      tabId,
      url,
      selectors: limitedSelectors,
      metadata: { ...metadata, timestamp: Date.now(), count: limitedSelectors.length }
    };
    return this.saveToStorage().then(() => {
      console.log(`✅ [SelectorCache] Saved ${limitedSelectors.length} selectors for tab ${tabId}`);
      return { success: true, count: limitedSelectors.length, key };
    });
  },

  getSelectors(tabId, currentUrl = null) {
    if (currentUrl) {
      const key = this._getCacheKey(tabId, currentUrl);
      const cached = this._cache[key];
      if (cached && this._isCacheValid(cached)) return Promise.resolve(cached);
    }
    const tabKeyPrefix = `${tabId}:`;
    for (const [key, cached] of Object.entries(this._cache)) {
      if (key.startsWith(tabKeyPrefix) && this._isCacheValid(cached)) {
        return Promise.resolve(cached);
      }
    }
    return Promise.resolve(null);
  },

  getSelectorsList(tabId, currentUrl = null) {
    return this.getSelectors(tabId, currentUrl).then((cached) => {
      if (!cached || !cached.selectors) return [];
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
    });
  },

  getSelectorsByUrl(url) {
    if (!url) return Promise.resolve([]);
    let baseUrl = url;
    try {
      const urlObj = new URL(url);
      baseUrl = urlObj.origin + urlObj.pathname;
    } catch {}
    for (const [key, cached] of Object.entries(this._cache)) {
      if (!this._isCacheValid(cached)) continue;
      let cachedBase = cached.url || '';
      try {
        const cachedUrlObj = new URL(cached.url);
        cachedBase = cachedUrlObj.origin + cachedUrlObj.pathname;
      } catch {}
      if (cachedBase === baseUrl) {
        return Promise.resolve(cached.selectors.map(s => ({
          selector: s.selector,
          type: s.type,
          value: s.value,
          element: s.element,
          inputType: s.inputType,
          text: s.text,
          quality: s.quality,
          isUnique: s.isUnique
        })));
      }
    }
    return Promise.resolve([]);
  },

  getSelectorsGroupedByUrl(url) {
    return this.getSelectorsByUrl(url).then((selectors) => {
      if (!selectors || selectors.length === 0) return null;
      const grouped = {};
      for (const s of selectors) {
        const type = s.type || 'css';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(s.selector || s.value || '');
      }
      return Object.keys(grouped).length > 0 ? grouped : null;
    });
  },

  getSelectorsByType(tabId, type, currentUrl = null) {
    return this.getSelectorsList(tabId, currentUrl).then((list) =>
      list.filter(s => s.type === type)
    );
  },

  _isCacheValid(cached) {
    if (!cached || !cached.metadata || !cached.metadata.timestamp) return false;
    return (Date.now() - cached.metadata.timestamp) < this.CACHE_TTL;
  },

  isCacheValid(tabId, currentUrl) {
    return this.getSelectors(tabId, currentUrl).then(cached => cached !== null);
  },

  clearForTab(tabId) {
    const keysToRemove = Object.keys(this._cache).filter(k => k.startsWith(`${tabId}:`));
    keysToRemove.forEach(k => delete this._cache[k]);
    if (keysToRemove.length > 0) {
      return this.saveToStorage().then(() => {
        console.log(`✅ [SelectorCache] Cleared ${keysToRemove.length} cache entries for tab ${tabId}`);
        return keysToRemove.length;
      });
    }
    return Promise.resolve(0);
  },

  clearExpired() {
    const keysToRemove = Object.entries(this._cache)
      .filter(([, cached]) => !this._isCacheValid(cached))
      .map(([k]) => k);
    keysToRemove.forEach(k => delete this._cache[k]);
    if (keysToRemove.length > 0) {
      return this.saveToStorage().then(() => {
        console.log(`✅ [SelectorCache] Cleared ${keysToRemove.length} expired cache entries`);
        return keysToRemove.length;
      });
    }
    return Promise.resolve(0);
  },

  clearAll() {
    this._cache = {};
    return chrome.storage.local.remove(this.STORAGE_KEY).then(() => {
      console.log('✅ [SelectorCache] All cache cleared');
    });
  },

  getStats() {
    let validEntries = 0, expiredEntries = 0, totalSelectors = 0;
    for (const cached of Object.values(this._cache)) {
      if (this._isCacheValid(cached)) {
        validEntries++;
        totalSelectors += cached.selectors?.length || 0;
      } else expiredEntries++;
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

  searchSelectors(tabId, searchText, currentUrl = null) {
    return this.getSelectorsList(tabId, currentUrl).then((selectors) => {
      if (!searchText) return selectors;
      const search = searchText.toLowerCase();
      return selectors.filter(s =>
        (s.selector && s.selector.toLowerCase().includes(search)) ||
        (s.value && s.value.toLowerCase().includes(search)) ||
        (s.text && s.text.toLowerCase().includes(search)) ||
        (s.element && s.element.toLowerCase().includes(search))
      );
    });
  },

  getSelectorsGrouped(tabId, currentUrl = null) {
    return this.getSelectorsList(tabId, currentUrl).then((selectors) => {
      const grouped = {
        dataTestId: [], dataCy: [], id: [], name: [], ariaLabel: [],
        className: [], css: [], xpath: [], other: []
      };
      for (const s of selectors) {
        switch (s.type) {
          case 'data-testid': grouped.dataTestId.push(s); break;
          case 'data-cy': grouped.dataCy.push(s); break;
          case 'id': grouped.id.push(s); break;
          case 'name': grouped.name.push(s); break;
          case 'aria-label': grouped.ariaLabel.push(s); break;
          case 'class': grouped.className.push(s); break;
          case 'css': grouped.css.push(s); break;
          case 'xpath': grouped.xpath.push(s); break;
          default: grouped.other.push(s);
        }
      }
      return grouped;
    });
  }
};

if (typeof globalThis !== 'undefined') globalThis.SelectorCache = SelectorCache;
if (typeof window !== 'undefined') window.SelectorCache = SelectorCache;
if (typeof self !== 'undefined') self.SelectorCache = SelectorCache;
