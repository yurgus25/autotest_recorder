/**
 * Feature Flags System for AutoTest Recorder
 * Управление активацией функций по подписке
 * 
 * @version 1.0.0
 * @date 2026-02-25
 */

const FeatureFlags = {
  /**
   * Определение всех feature flags
   */
  FLAGS: {
    ANALYSIS_STEP: {
      id: 'analysisStep',
      name: 'Analysis Step Feature',
      description: 'Пошаговый анализ страниц с сохранением селекторов',
      enabled: false,           // По умолчанию выключено
      requiresLicense: true,    // Требует лицензии
      localOverrideKey: 'enableAnalysisStep', // Ключ для локального включения
      remoteCheckUrl: null,     // URL для проверки лицензии (будет установлен позже)
      fallbackEnabled: true     // Включить для тестирования в Phase 1
    },
    
    // Будущие функции можно добавить здесь
    AI_SELECTORS: {
      id: 'aiSelectors',
      name: 'AI-Powered Selectors',
      description: 'AI-generated and self-healing selectors',
      enabled: false,
      requiresLicense: true,
      localOverrideKey: 'enableAiSelectors',
      remoteCheckUrl: null,
      fallbackEnabled: false
    },
    
    EXCEL_EXPORT: {
      id: 'excelExport',
      name: 'Excel Export',
      description: 'Export test results to Excel format',
      enabled: false,
      requiresLicense: true,
      localOverrideKey: 'enableExcelExport',
      remoteCheckUrl: null,
      fallbackEnabled: false
    }
  },

  /**
   * Кэш состояния флагов
   */
  _cache: {},
  
  /**
   * Время жизни кэша (5 минут)
   */
  CACHE_TTL: 5 * 60 * 1000,

  init: function() {
    return this.loadSettings().then(function() {
      console.log('[FeatureFlags] Initialized');
    });
  },
  loadSettings: function() {
    var self = this;
    return chrome.storage.local.get(['featureFlags', 'license']).then(function(result) {
      if (result.featureFlags) self._cache = result.featureFlags;
      if (result.license) self._license = result.license;
    }).catch(function(error) {
      console.warn('[FeatureFlags] Could not load settings:', error);
    });
  },
  isEnabled: function(flagName) {
    var self = this;
    var flag = this.FLAGS[flagName];
    if (!flag) {
      console.warn('[FeatureFlags] Unknown flag: ' + flagName);
      return Promise.resolve(false);
    }
    var cachedValue = this._cache[flag.id];
    if (cachedValue !== undefined && cachedValue.timestamp) {
      var age = Date.now() - cachedValue.timestamp;
      if (age < this.CACHE_TTL) return Promise.resolve(cachedValue.enabled);
    }
    return this.checkLocalOverride(flag).then(function(localOverride) {
      if (localOverride !== null) {
        self._updateCache(flag.id, localOverride);
        return localOverride;
      }
      if (flag.fallbackEnabled) {
        self._updateCache(flag.id, true);
        return true;
      }
      if (flag.requiresLicense) {
        return self.checkLicense(flag).then(function(hasLicense) {
          self._updateCache(flag.id, hasLicense);
          return hasLicense;
        });
      }
      return flag.enabled;
    });
  },
  checkLocalOverride: function(flag) {
    return chrome.storage.local.get(flag.localOverrideKey).then(function(result) {
      var v = result[flag.localOverrideKey];
      if (v !== undefined && v !== null) {
        console.log('[FeatureFlags] Local override for ' + flag.id + ': ' + v);
        return v === true || v === 'true';
      }
      return null;
    }).catch(function(error) {
      console.warn('[FeatureFlags] Could not check local override:', error);
      return null;
    });
  },
  checkLicense: function(flag) {
    var self = this;
    return chrome.storage.local.get('license').then(function(result) {
      var license = result.license;
      if (license && license.valid && license.expiresAt) {
        if (new Date(license.expiresAt) > new Date()) return true;
      }
      if (flag.remoteCheckUrl) return self.checkRemoteLicense(flag.remoteCheckUrl);
      return false;
    }).catch(function() { return false; });
  },
  checkRemoteLicense: function(url) {
    return fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { return data && data.valid === true; })
      .catch(function(e) { console.warn('[FeatureFlags] Remote license check failed:', e); return false; });
  },

  /**
   * Обновление кэша
   * @param {string} flagId - ID флага
   * @param {boolean} enabled - Состояние
   */
  _updateCache(flagId, enabled) {
    this._cache[flagId] = {
      enabled,
      timestamp: Date.now()
    };
    
    // Сохраняем в storage асинхронно
    chrome.storage.local.set({ featureFlags: this._cache }).catch(() => {});
  },

  setLocalOverride: function(flagName, enabled) {
    var flag = this.FLAGS[flagName];
    if (!flag) {
      console.warn('[FeatureFlags] Unknown flag: ' + flagName);
      return Promise.resolve(false);
    }
    var self = this;
    return chrome.storage.local.set({ [flag.localOverrideKey]: enabled }).then(function() {
      self._updateCache(flag.id, enabled);
      console.log('[FeatureFlags] Local override set: ' + flag.id + ' = ' + enabled);
      return true;
    }).catch(function(e) {
      console.error('[FeatureFlags] Could not set local override:', e);
      return false;
    });
  },
  setLicense: function(licenseData) {
    var self = this;
    return chrome.storage.local.set({ license: licenseData }).then(function() {
      self._license = licenseData;
      self._cache = {};
      return chrome.storage.local.remove('featureFlags');
    }).then(function() {
      console.log('[FeatureFlags] License updated');
      return true;
    }).catch(function(e) {
      console.error('[FeatureFlags] Could not save license:', e);
      return false;
    });
  },
  getAllFlagsStatus: function() {
    var self = this;
    var names = Object.keys(this.FLAGS);
    return names.reduce(function(p, name) {
      return p.then(function(status) {
        return self.isEnabled(name).then(function(enabled) {
          status[name] = { id: self.FLAGS[name].id, name: self.FLAGS[name].name, enabled: enabled };
          return status;
        });
      });
    }, Promise.resolve({}));
  },
  reset: function() {
    var self = this;
    var keys = ['featureFlags', 'license'];
    Object.values(this.FLAGS).forEach(function(f) { keys.push(f.localOverrideKey); });
    return chrome.storage.local.remove(keys).then(function() {
      self._cache = {};
      self._license = null;
      console.log('[FeatureFlags] All settings reset');
      return true;
    }).catch(function(e) {
      console.error('[FeatureFlags] Reset failed:', e);
      return false;
    });
  }
};

// Экспорт для использования в других модулях
if (typeof window !== 'undefined') {
  window.FeatureFlags = FeatureFlags;
}

// Для background script
if (typeof self !== 'undefined') {
  self.FeatureFlags = FeatureFlags;
}
