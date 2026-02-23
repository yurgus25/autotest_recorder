/**
 * AutoTest Recorder — Internationalization (i18n) Module
 * 
 * Lightweight i18n system with:
 * - Automatic browser language detection
 * - Storage-based language preference
 * - HTML attribute-based localization (data-i18n, data-i18n-title, data-i18n-placeholder)
 * - JS API: i18n.t('key'), i18n.t('key', {param: value})
 * - Extensible: add new languages by adding JSON files
 * 
 * Supported languages: en, ru (more can be added)
 */

class I18n {
  constructor() {
    this.currentLang = 'en';
    this.translations = {};
    this.loaded = false;
    this._loadPromise = null;
    this._listeners = [];
  }

  /**
   * Initialize i18n: detect language, load translations
   * Call once at app start. Safe to call multiple times.
   * @returns {Promise<void>}
   */
  async init() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._doInit();
    return this._loadPromise;
  }

  async _doInit() {
    try {
      // 1. Try to load saved preference
      const saved = await this._getSavedLang();
      if (saved && this.getSupportedLanguages().includes(saved)) {
        this.currentLang = saved;
      } else {
        // 2. Detect browser language
        this.currentLang = this._detectBrowserLang();
        // Save the detected language
        await this._saveLang(this.currentLang);
      }

      // 3. Load translation file
      await this._loadTranslations(this.currentLang);
      this.loaded = true;
    } catch (e) {
      console.warn('[i18n] Init error, falling back to English:', e);
      this.currentLang = 'en';
      try {
        await this._loadTranslations('en');
      } catch (e2) {
        console.error('[i18n] Failed to load English translations:', e2);
        this.translations = {};
      }
      this.loaded = true;
    }
  }

  /**
   * Get list of supported languages
   * @returns {string[]}
   */
  getSupportedLanguages() {
    return ['en', 'ru'];
  }

  /**
   * Get language display names
   * @returns {Object}
   */
  getLanguageNames() {
    return {
      en: 'English',
      ru: 'Русский'
    };
  }

  /**
   * Get current language code
   * @returns {string}
   */
  getLang() {
    return this.currentLang;
  }

  /**
   * Switch language, reload translations, re-apply to DOM
   * @param {string} lang
   */
  async setLang(lang) {
    if (!this.getSupportedLanguages().includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}`);
      return;
    }
    if (lang === this.currentLang && this.loaded) return;

    this.currentLang = lang;
    await this._saveLang(lang);
    await this._loadTranslations(lang);
    this.applyToDOM();
    this._notifyListeners(lang);
  }

  /**
   * Translate a key with optional interpolation
   * @param {string} key - Dot-separated key (e.g. 'popup.startRecording')
   * @param {Object} [params] - Interpolation params: {count: 5} replaces {count}
   * @returns {string} Translated string or key if not found
   */
  t(key, params) {
    let val = this._resolve(key);
    if (val === undefined || val === null) {
      // Fallback: try English
      if (this.currentLang !== 'en' && this._enFallback) {
        val = this._resolveFrom(this._enFallback, key);
      }
      if (val === undefined || val === null) {
        return key; // Return key as-is if nothing found
      }
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return val;
  }

  /**
   * Apply translations to all DOM elements with data-i18n attributes
   * Supports:
   *   data-i18n="key"              → textContent
   *   data-i18n-title="key"        → title attribute
   *   data-i18n-placeholder="key"  → placeholder attribute
   *   data-i18n-aria-label="key"   → aria-label attribute
   *   data-i18n-html="key"         → innerHTML (use with care)
   * @param {Element} [root=document] - Root element to scan
   */
  applyToDOM(root) {
    const container = root || document;

    // textContent
    container.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = this.t(key);
    });

    // title
    container.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = this.t(key);
    });

    // placeholder
    container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = this.t(key);
    });

    // aria-label
    container.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', this.t(key));
    });

    // innerHTML (for complex content)
    container.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = this.t(key);
    });

    // Update html lang attribute
    if (document.documentElement) {
      document.documentElement.lang = this.currentLang;
    }
  }

  /**
   * Register a listener for language changes
   * @param {Function} callback - Called with (newLang)
   */
  onLangChange(callback) {
    this._listeners.push(callback);
  }

  /**
   * Remove a language change listener
   * @param {Function} callback
   */
  offLangChange(callback) {
    this._listeners = this._listeners.filter(l => l !== callback);
  }

  // ─── Private ───

  _detectBrowserLang() {
    const langs = navigator.languages || [navigator.language || navigator.userLanguage || 'en'];
    for (const lang of langs) {
      const code = lang.split('-')[0].toLowerCase();
      if (this.getSupportedLanguages().includes(code)) {
        return code;
      }
    }
    return 'en';
  }

  async _getSavedLang() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get('i18nLang');
        return result.i18nLang || null;
      }
    } catch (e) {
      // Might be in a context without chrome.storage
    }
    try {
      return localStorage.getItem('i18nLang');
    } catch (e) {
      return null;
    }
  }

  async _saveLang(lang) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ i18nLang: lang });
      }
    } catch (e) { /* ignore */ }
    try {
      localStorage.setItem('i18nLang', lang);
    } catch (e) { /* ignore */ }
  }

  async _loadTranslations(lang) {
    try {
      // Try to load via fetch (works in popup, options, web_accessible pages)
      const url = this._getTranslationUrl(lang);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.translations = await resp.json();

      // Also load English as fallback if not English
      if (lang !== 'en') {
        try {
          const enUrl = this._getTranslationUrl('en');
          const enResp = await fetch(enUrl);
          if (enResp.ok) {
            this._enFallback = await enResp.json();
          }
        } catch (e) { /* no fallback */ }
      } else {
        this._enFallback = null;
      }
    } catch (e) {
      // Fallback: try inline translations for content scripts
      console.warn(`[i18n] Could not fetch ${lang}.json, trying embedded:`, e.message);
      if (typeof __i18n_translations !== 'undefined' && __i18n_translations[lang]) {
        this.translations = __i18n_translations[lang];
      }
    }
  }

  _getTranslationUrl(lang) {
    // Works for chrome extension contexts
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(`i18n/${lang}.json`);
    }
    // Relative path fallback
    return `../i18n/${lang}.json`;
  }

  _resolve(key) {
    return this._resolveFrom(this.translations, key);
  }

  _resolveFrom(obj, key) {
    if (!obj) return undefined;
    // Support dot notation: 'popup.controls.start'
    const parts = key.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return typeof current === 'string' ? current : undefined;
  }

  _notifyListeners(lang) {
    for (const cb of this._listeners) {
      try { cb(lang); } catch (e) { /* ignore */ }
    }
  }
}

// Create global singleton
const i18n = new I18n();

// Auto-export for different contexts
if (typeof window !== 'undefined') {
  window.i18n = i18n;
}
if (typeof globalThis !== 'undefined') {
  globalThis.i18n = i18n;
}
