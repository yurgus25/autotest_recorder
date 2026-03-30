/**
 * Advanced Template System for Smart Fill
 * Поддержка паттернов, частичных профилей и экспорт/импорт
 */

(function() {
  'use strict';

  /**
   * Template Pattern System
   */
  const TemplatePatterns = {
    
    /**
     * Парсинг паттерна
     * 
     * Поддерживаемые паттерны:
     * - * = 1-8 случайных символов
     * - ? = 1 случайный символ
     * - {N} = точно N символов (например: {5} = 5 символов)
     * - {N-M} = от N до M символов (например: {3-8} = от 3 до 8)
     * - [abc] = один из символов (например: [123] = 1, 2 или 3)
     * - {digit} = случайная цифра 0-9
     * - {letter} = случайная буква a-z
     * - {upper} = случайная заглавная A-Z
     * - {email} = случайный email
     * - {phone} = случайный телефон
     * - {uppercase:text} = ТЕКСТ
     * - {lowercase:TEXT} = текст
     * - {capitalize:text} = Text
     */
    applyPattern(pattern, profile = null) {
      if (!pattern || typeof pattern !== 'string') {
        return pattern;
      }

      let result = pattern;
      
      // Определяем язык/алфавит паттерна (для * и ?)
      const cyrillicChars = pattern.match(/[а-яёА-ЯЁ]/g) || [];
      const latinChars = pattern.match(/[a-zA-Z]/g) || [];
      const digitChars = pattern.match(/[0-9]/g) || [];
      
      const hasCyrillic = cyrillicChars.length > 0;
      const hasLatin = latinChars.length > 0;
      const hasDigits = digitChars.length > 0;
      
      let charset = '';
      if (hasCyrillic && !hasLatin) {
        charset = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
      } else if (hasLatin && !hasCyrillic) {
        charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      } else if (hasCyrillic && hasLatin) {
        charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
      } else {
        charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      }
      
      if (hasDigits) {
        charset += '0123456789';
      }

      // 1. {N} - точно N символов
      result = result.replace(/\{(\d+)\}/g, (match, n) => {
        const length = parseInt(n, 10);
        return this.generateRandomString(length, charset);
      });
      
      // 2. {N-M} - от N до M символов
      result = result.replace(/\{(\d+)-(\d+)\}/g, (match, min, max) => {
        const minLen = parseInt(min, 10);
        const maxLen = parseInt(max, 10);
        const length = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
        return this.generateRandomString(length, charset);
      });
      
      // 3. [abc] - один из символов
      result = result.replace(/\[([^\]]+)\]/g, (match, chars) => {
        return chars[Math.floor(Math.random() * chars.length)];
      });
      
      // 4. Специальные типы
      const specialTypes = {
        digit: () => Math.floor(Math.random() * 10).toString(),
        letter: () => {
          const letters = 'abcdefghijklmnopqrstuvwxyz';
          return letters[Math.floor(Math.random() * letters.length)];
        },
        upper: () => {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          return letters[Math.floor(Math.random() * letters.length)];
        },
        email: () => {
          const domains = ['gmail.com', 'mail.ru', 'test.com', 'example.com'];
          const name = this.generateRandomString(8, 'abcdefghijklmnopqrstuvwxyz0123456789');
          return `${name}@${domains[Math.floor(Math.random() * domains.length)]}`;
        },
        phone: () => {
          const rand = (n) => Math.floor(Math.random() * Math.pow(10, n)).toString().padStart(n, '0');
          return `+7 (${rand(3)}) ${rand(3)}-${rand(2)}-${rand(2)}`;
        }
      };
      
      result = result.replace(/\{(digit|letter|upper|email|phone)\}/g, (match, type) => {
        return specialTypes[type] ? specialTypes[type]() : match;
      });
      
      // 5. Функции трансформации
      result = result.replace(/\{(uppercase|lowercase|capitalize):([^}]+)\}/g, (match, func, text) => {
        if (func === 'uppercase') return text.toUpperCase();
        if (func === 'lowercase') return text.toLowerCase();
        if (func === 'capitalize') return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        return text;
      });
      
      // 6. Переменные из профиля
      if (profile) {
        result = result.replace(/\{profile\.(\w+)\}/g, (match, key) => {
          return profile[key] || match;
        });
      }
      
      // 7. Оригинальные паттерны * и ?
      while (result.includes('*')) {
        const length = Math.floor(Math.random() * 8) + 1;
        const replacement = this.generateRandomString(length, charset);
        result = result.replace('*', replacement);
      }
      
      while (result.includes('?')) {
        const replacement = this.generateRandomString(1, charset);
        result = result.replace('?', replacement);
      }
      
      return result;
    },
    
    /**
     * Генерация случайной строки
     */
    generateRandomString(length, charset) {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
      }
      return result;
    },
    
    /**
     * Проверка является ли строка паттерном
     */
    isPattern(str) {
      if (typeof str !== 'string') return false;
      
      // Проверяем все поддерживаемые паттерны
      return str.includes('*') || 
             str.includes('?') || 
             /\{\d+\}/.test(str) ||           // {5}
             /\{\d+-\d+\}/.test(str) ||       // {3-8}
             /\[[^\]]+\]/.test(str) ||        // [abc]
             /\{(digit|letter|upper|email|phone)\}/.test(str) || // {digit}
             /\{(uppercase|lowercase|capitalize):[^}]+\}/.test(str) || // {uppercase:text}
             /\{profile\.\w+\}/.test(str);    // {profile.firstName}
    }
  };

  /**
   * Profile Manager - управление профилями
   */
  const ProfileManager = {
    
    /**
     * Применить профиль с возможностью переопределения полей
     * 
     * @param {string} profileName - Имя базового профиля
     * @param {Object} overrides - Поля для переопределения
     * @returns {Object} - Финальный профиль
     */
    applyProfile(profileName, overrides = {}) {
      const baseProfile = window.SmartFillModule?.getProfile(profileName);
      if (!baseProfile) {
        console.warn(`Profile "${profileName}" not found`);
        return overrides;
      }
      
      // Merge: overrides имеют приоритет
      const result = { ...baseProfile, ...overrides };
      
      // Применяем паттерны к переопределённым полям
      for (const [key, value] of Object.entries(result)) {
        if (TemplatePatterns.isPattern(value)) {
          result[key] = TemplatePatterns.applyPattern(value);
        }
      }
      
      return result;
    },
    
    /**
     * Создать кастомный профиль
     */
    createCustomProfile(name, data) {
      const profiles = this.loadCustomProfiles();
      profiles[name] = {
        ...data,
        _custom: true,
        _created: Date.now()
      };
      this.saveCustomProfiles(profiles);
      return profiles[name];
    },
    
    /**
     * Получить все профили (встроенные + кастомные)
     */
    getAllProfiles() {
      const builtIn = window.SmartFillModule?.DATA_PROFILES || {};
      const custom = this.loadCustomProfiles();
      
      return {
        ...builtIn,
        ...custom
      };
    },
    
    /**
     * Загрузить кастомные профили из storage
     */
    loadCustomProfiles() {
      try {
        const stored = localStorage.getItem('autotest_custom_profiles');
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        console.error('Error loading custom profiles:', e);
        return {};
      }
    },
    
    /**
     * Сохранить кастомные профили в storage
     */
    saveCustomProfiles(profiles) {
      try {
        localStorage.setItem('autotest_custom_profiles', JSON.stringify(profiles));
        return true;
      } catch (e) {
        console.error('Error saving custom profiles:', e);
        return false;
      }
    },
    
    /**
     * Удалить кастомный профиль
     */
    deleteCustomProfile(name) {
      const profiles = this.loadCustomProfiles();
      delete profiles[name];
      this.saveCustomProfiles(profiles);
    },
    
    /**
     * Экспорт профиля в JSON
     */
    exportProfile(profileName) {
      const allProfiles = this.getAllProfiles();
      const profile = allProfiles[profileName];
      
      if (!profile) {
        throw new Error(`Profile "${profileName}" not found`);
      }
      
      const exportData = {
        name: profileName,
        profile: profile,
        exported: new Date().toISOString(),
        version: '0.9.5.0'
      };
      
      return JSON.stringify(exportData, null, 2);
    },
    
    /**
     * Импорт профиля из JSON
     */
    importProfile(jsonString) {
      try {
        const data = JSON.parse(jsonString);
        
        if (!data.profile || !data.name) {
          throw new Error('Invalid profile format');
        }
        
        // Сохраняем как кастомный профиль
        this.createCustomProfile(data.name, data.profile);
        
        return data.name;
      } catch (e) {
        throw new Error(`Import failed: ${e.message}`);
      }
    }
  };

  /**
   * Field Rules Manager - правила заполнения по полям
   */
  const FieldRulesManager = {
    
    /**
     * Сохранить правила заполнения для конкретного шага
     */
    saveStepRules(stepIndex, rules) {
      const allRules = this.loadAllRules();
      allRules.steps = allRules.steps || {};
      allRules.steps[stepIndex] = {
        ...rules,
        _updated: Date.now()
      };
      this.saveAllRules(allRules);
    },
    
    /**
     * Сохранить глобальные правила (для всех шагов)
     */
    saveGlobalRules(rules) {
      const allRules = this.loadAllRules();
      allRules.global = {
        ...rules,
        _updated: Date.now()
      };
      this.saveAllRules(allRules);
    },
    
    /**
     * Получить правила для шага
     */
    getStepRules(stepIndex) {
      const allRules = this.loadAllRules();
      return allRules.steps?.[stepIndex] || null;
    },
    
    /**
     * Получить глобальные правила
     */
    getGlobalRules() {
      const allRules = this.loadAllRules();
      return allRules.global || null;
    },
    
    /**
     * Загрузить все правила
     */
    loadAllRules() {
      try {
        const stored = localStorage.getItem('autotest_field_rules');
        return stored ? JSON.parse(stored) : { global: null, steps: {} };
      } catch (e) {
        console.error('Error loading field rules:', e);
        return { global: null, steps: {} };
      }
    },
    
    /**
     * Сохранить все правила
     */
    saveAllRules(rules) {
      try {
        localStorage.setItem('autotest_field_rules', JSON.stringify(rules));
        return true;
      } catch (e) {
        console.error('Error saving field rules:', e);
        return false;
      }
    },
    
    /**
     * Экспорт всех правил
     */
    exportRules() {
      const rules = this.loadAllRules();
      const exportData = {
        rules: rules,
        exported: new Date().toISOString(),
        version: '0.9.5.0'
      };
      return JSON.stringify(exportData, null, 2);
    },
    
    /**
     * Импорт правил
     */
    importRules(jsonString) {
      try {
        const data = JSON.parse(jsonString);
        
        if (!data.rules) {
          throw new Error('Invalid rules format');
        }
        
        this.saveAllRules(data.rules);
        return true;
      } catch (e) {
        throw new Error(`Import failed: ${e.message}`);
      }
    },
    
    /**
     * Очистить правила для шага
     */
    clearStepRules(stepIndex) {
      const allRules = this.loadAllRules();
      if (allRules.steps) {
        delete allRules.steps[stepIndex];
      }
      this.saveAllRules(allRules);
    },
    
    /**
     * Очистить глобальные правила
     */
    clearGlobalRules() {
      const allRules = this.loadAllRules();
      allRules.global = null;
      this.saveAllRules(allRules);
    }
  };

  /**
   * Settings Manager - управление настройками анализа
   */
  const AnalysisSettingsManager = {
    
    /**
     * Сохранить настройки для типа анализа
     */
    saveSettings(analysisType, settings) {
      const allSettings = this.loadAllSettings();
      allSettings[analysisType] = {
        ...settings,
        _updated: Date.now()
      };
      this.saveAllSettings(allSettings);
    },
    
    /**
     * Получить настройки для типа анализа
     */
    getSettings(analysisType) {
      const allSettings = this.loadAllSettings();
      return allSettings[analysisType] || this.getDefaultSettings(analysisType);
    },
    
    /**
     * Сбросить настройки к defaults
     */
    resetSettings(analysisType) {
      const allSettings = this.loadAllSettings();
      delete allSettings[analysisType];
      this.saveAllSettings(allSettings);
    },
    
    /**
     * Загрузить все настройки
     */
    loadAllSettings() {
      try {
        const stored = localStorage.getItem('autotest_analysis_settings');
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        console.error('Error loading analysis settings:', e);
        return {};
      }
    },
    
    /**
     * Сохранить все настройки
     */
    saveAllSettings(settings) {
      try {
        localStorage.setItem('autotest_analysis_settings', JSON.stringify(settings));
        return true;
      } catch (e) {
        console.error('Error saving analysis settings:', e);
        return false;
      }
    },
    
    /**
     * Получить defaults для типа анализа
     */
    getDefaultSettings(analysisType) {
      const defaults = {
        'analysis-fill-fields': {
          fillMode: 'smart',
          contextAware: true,
          profile: 'valid-user',
          charset: 'lettersAndNumbers',
          charCount: 10,
          fillTarget: 'empty',
          scopeMode: 'current'
        },
        'analysis-security': {
          tests: ['xss', 'headers', 'cookies']
        },
        'analysis-seo': {},
        'analysis-ux': {},
        'analysis-content': {},
        'analysis-selector-stability': {}
      };
      
      return defaults[analysisType] || {};
    }
  };

  // Export to window
  window.AdvancedTemplateSystem = {
    TemplatePatterns,
    ProfileManager,
    FieldRulesManager,
    AnalysisSettingsManager
  };

})();
