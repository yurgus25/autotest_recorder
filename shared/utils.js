/**
 * Общие утилиты для проекта AutoTest Recorder & Player
 * Используется во всех компонентах расширения
 * 
 * @version 1.9.5
 * @date 2026-02-23
 */

(function(global) {
  'use strict';

  /**
   * Экранирует HTML-символы для предотвращения XSS атак
   * @param {string|null|undefined} text - Текст для экранирования
   * @returns {string} - Экранированный текст
   */
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  /**
   * Санитизирует имя файла (удаляет недопустимые символы)
   * @param {string} name - Имя файла
   * @returns {string} - Санитизированное имя
   */
  function sanitizeFileName(name) {
    if (name == null || name === '') return 'test';
    return String(name)
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200);
  }

  /**
   * Форматирует дату и время в локальном формате
   * @param {Date|number|string} date - Дата для форматирования
   * @returns {string} - Отформатированная дата
   */
  function formatDateTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  /**
   * Безопасное объединение URL частей
   * @param {...string} parts - Части URL
   * @returns {string} - Объединённый URL
   */
  function joinUrl(...parts) {
    return parts
      .map((part, i) => {
        if (i === 0) return part.replace(/\/+$/, '');
        return part.replace(/^\/+/, '').replace(/\/+$/, '');
      })
      .join('/');
  }

  /**
   * Проверяет, является ли строка валидным URL
   * @param {string} str - Строка для проверки
   * @returns {boolean}
   */
  function isValidUrl(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Нормализует URL (добавляет протокол, убирает лишние слэши)
   * @param {string} url - URL для нормализации
   * @returns {string} - Нормализованный URL
   */
  function normalizeUrl(url) {
    if (!url) return '';
    let normalized = String(url).trim();
    if (!normalized.match(/^https?:\/\//i)) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  /**
   * Создаёт debounce функцию
   * @param {Function} fn - Функция для debounce
   * @param {number} delay - Задержка в мс
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Создаёт throttle функцию
   * @param {Function} fn - Функция для throttle
   * @param {number} limit - Лимит в мс
   * @returns {Function}
   */
  function throttle(fn, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Генерирует уникальный ID
   * @param {string} [prefix=''] - Префикс для ID
   * @returns {string}
   */
  function generateId(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Глубокое клонирование объекта
   * @param {*} obj - Объект для клонирования
   * @returns {*}
   */
  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
      const copy = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          copy[key] = deepClone(obj[key]);
        }
      }
      return copy;
    }
    return obj;
  }

  // Экспорт в глобальную область видимости
  global.Utils = {
    escapeHtml,
    sanitizeFileName,
    formatDateTime,
    joinUrl,
    isValidUrl,
    normalizeUrl,
    debounce,
    throttle,
    generateId,
    deepClone
  };

  // Также экспортируем escapeHtml напрямую для удобства
  global.escapeHtml = escapeHtml;

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
