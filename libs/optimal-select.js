/**
 * Optimal Select - Full version
 * Advanced CSS selector generation with optimization
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.OptimalSelect = {}));
})(this, (function (exports) { 'use strict';

  const defaultOptions = {
    root: document.body,
    skip: null,
    priority: ['id', 'class', 'href', 'src'],
    ignore: {
      attribute(name, value, defaultPredicate) {
        return defaultPredicate(name, value);
      }
    }
  };

  function getSingleSelector(element, options = {}) {
    const { root = document.body, skip = null } = options;

    if (element === root) {
      return 'root';
    }

    if (skip && skip(element)) {
      return null;
    }

    const path = [];
    let current = element;

    while (current && current !== root) {
      const level = getLevel(current, options);
      if (!level) {
        break;
      }
      path.unshift(level);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  function getLevel(element, options) {
    const { priority = defaultOptions.priority } = options;

    // Try ID
    if (priority.includes('id') && element.id) {
      const id = `#${CSS.escape(element.id)}`;
      if (isUnique(element, id)) {
        return id;
      }
    }

    // Try classes
    if (priority.includes('class') && element.classList.length > 0) {
      const classes = Array.from(element.classList)
        .map(cls => `.${CSS.escape(cls)}`)
        .join('');
      
      const tagWithClasses = `${element.tagName.toLowerCase()}${classes}`;
      if (isUnique(element, tagWithClasses)) {
        return tagWithClasses;
      }

      if (isUnique(element, classes)) {
        return classes;
      }
    }

    // Try attributes
    const attrs = getAttributeSelectors(element, options);
    for (const attr of attrs) {
      if (isUnique(element, attr)) {
        return attr;
      }
    }

    // Try tag with nth-child
    const tag = element.tagName.toLowerCase();
    const nthChild = getNthChild(element);
    return `${tag}:nth-child(${nthChild})`;
  }

  function getAttributeSelectors(element, options) {
    const { priority = defaultOptions.priority, ignore = defaultOptions.ignore } = options;
    const selectors = [];

    Array.from(element.attributes).forEach(attr => {
      if (ignore.attribute && !ignore.attribute(attr.name, attr.value, defaultAttributePredicate)) {
        return;
      }

      const selector = `[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`;
      
      if (priority.includes(attr.name)) {
        selectors.unshift(selector);
      } else {
        selectors.push(selector);
      }
    });

    return selectors;
  }

  function defaultAttributePredicate(name, value) {
    const blacklist = ['style', 'data-reactid', 'data-react-checksum'];
    return !blacklist.includes(name);
  }

  function getNthChild(element) {
    let count = 0;
    let sibling = element;

    while (sibling) {
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        count++;
      }
      if (sibling === element) {
        return count;
      }
      sibling = sibling.previousElementSibling;
    }

    return 1;
  }

  function isUnique(element, selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1 && elements[0] === element;
    } catch (e) {
      return false;
    }
  }

  function select(selector, options = {}) {
    const { root = document.body } = options;
    
    try {
      const elements = root.querySelectorAll(selector);
      return Array.from(elements);
    } catch (e) {
      return [];
    }
  }

  function getMultiSelector(elements, options = {}) {
    if (!elements || elements.length === 0) {
      return null;
    }

    if (elements.length === 1) {
      return getSingleSelector(elements[0], options);
    }

    // Find common ancestor
    const commonAncestor = getCommonAncestor(elements);
    
    // Try to find a common selector pattern
    const selectors = elements.map(el => getSingleSelector(el, options));
    
    // Look for common patterns
    const pattern = findCommonPattern(selectors);
    
    if (pattern) {
      return pattern;
    }

    // Fallback: return individual selectors joined with comma
    return selectors.join(', ');
  }

  function getCommonAncestor(elements) {
    if (elements.length === 0) return null;
    if (elements.length === 1) return elements[0].parentElement;

    const paths = elements.map(el => {
      const path = [];
      let current = el;
      while (current) {
        path.unshift(current);
        current = current.parentElement;
      }
      return path;
    });

    let commonAncestor = null;
    const minLength = Math.min(...paths.map(p => p.length));

    for (let i = 0; i < minLength; i++) {
      const node = paths[0][i];
      if (paths.every(path => path[i] === node)) {
        commonAncestor = node;
      } else {
        break;
      }
    }

    return commonAncestor;
  }

  function findCommonPattern(selectors) {
    if (selectors.length === 0) return null;

    // Split selectors into parts
    const parts = selectors.map(s => s.split(' > '));
    
    // Find common prefix
    let commonPrefix = [];
    const minLength = Math.min(...parts.map(p => p.length));

    for (let i = 0; i < minLength; i++) {
      const part = parts[0][i];
      if (parts.every(p => p[i] === part)) {
        commonPrefix.push(part);
      } else {
        break;
      }
    }

    if (commonPrefix.length > 0) {
      // Check if remaining parts follow a pattern
      const remainingParts = parts.map(p => p.slice(commonPrefix.length));
      
      // Try to generalize the pattern
      const generalized = generalizePattern(remainingParts);
      
      if (generalized) {
        return commonPrefix.join(' > ') + ' > ' + generalized;
      }
    }

    return null;
  }

  function generalizePattern(parts) {
    if (parts.length === 0) return null;

    // Check if all parts have the same structure
    const lengths = parts.map(p => p.length);
    if (new Set(lengths).size !== 1) {
      return null;
    }

    const length = lengths[0];
    const pattern = [];

    for (let i = 0; i < length; i++) {
      const values = parts.map(p => p[i]);
      const unique = new Set(values);

      if (unique.size === 1) {
        pattern.push(values[0]);
      } else {
        // Try to find a common tag
        const tags = values.map(v => v.split(/[.#\[:]/ )[0]);
        const uniqueTags = new Set(tags);

        if (uniqueTags.size === 1) {
          pattern.push(tags[0]);
        } else {
          return null;
        }
      }
    }

    return pattern.join(' > ');
  }

  function optimize(selector, element, options = {}) {
    const parts = selector.split(' > ');
    
    // Try to shorten the selector
    for (let i = parts.length - 1; i > 0; i--) {
      const shortened = parts.slice(i).join(' > ');
      if (isUnique(element, shortened)) {
        return shortened;
      }
    }

    // Try to remove nth-child if not necessary
    const withoutNth = parts.map(part => 
      part.replace(/:nth-child\(\d+\)/, '')
    ).join(' > ');

    if (withoutNth !== selector && isUnique(element, withoutNth)) {
      return withoutNth;
    }

    return selector;
  }

  exports.select = select;
  exports.getSingleSelector = getSingleSelector;
  exports.getMultiSelector = getMultiSelector;
  exports.optimize = optimize;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
