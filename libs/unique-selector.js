/**
 * Unique Selector - Full version
 * Generates unique CSS selectors with advanced strategies
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.unique = factory());
})(this, (function () { 'use strict';

  const defaultOptions = {
    selectorTypes: ['ID', 'Class', 'Tag', 'NthChild'],
    attributesToIgnore: ['id', 'class', 'length'],
    excludeRegex: null
  };

  function unique(element, options = {}) {
    const opts = { ...defaultOptions, ...options };
    
    if (!element || element.nodeType !== 1) {
      throw new Error('Element must be a DOM element');
    }

    // Try different strategies in order
    const strategies = [
      () => getIDSelector(element, opts),
      () => getClassSelector(element, opts),
      () => getAttributeSelector(element, opts),
      () => getNthChildSelector(element, opts),
      () => getTagSelector(element, opts)
    ];

    for (const strategy of strategies) {
      const selector = strategy();
      if (selector && isUnique(element, selector)) {
        return selector;
      }
    }

    // Fallback: build path from root
    return buildPathSelector(element, opts);
  }

  function getIDSelector(element, options) {
    if (!options.selectorTypes.includes('ID')) {
      return null;
    }

    const id = element.getAttribute('id');
    if (!id) {
      return null;
    }

    if (options.excludeRegex && options.excludeRegex.test(id)) {
      return null;
    }

    return `#${CSS.escape(id)}`;
  }

  function getClassSelector(element, options) {
    if (!options.selectorTypes.includes('Class')) {
      return null;
    }

    const classList = Array.from(element.classList);
    if (classList.length === 0) {
      return null;
    }

    // Filter out excluded classes
    const validClasses = classList.filter(cls => {
      if (options.excludeRegex && options.excludeRegex.test(cls)) {
        return false;
      }
      return true;
    });

    if (validClasses.length === 0) {
      return null;
    }

    // Try individual classes first
    for (const cls of validClasses) {
      const selector = `.${CSS.escape(cls)}`;
      if (isUnique(element, selector)) {
        return selector;
      }
    }

    // Try combinations of classes
    const classSelector = validClasses.map(cls => `.${CSS.escape(cls)}`).join('');
    if (isUnique(element, classSelector)) {
      return classSelector;
    }

    // Try with tag name
    const tag = element.tagName.toLowerCase();
    const tagWithClass = `${tag}${classSelector}`;
    if (isUnique(element, tagWithClass)) {
      return tagWithClass;
    }

    return null;
  }

  function getAttributeSelector(element, options) {
    const attributes = Array.from(element.attributes);
    
    // Filter out ignored attributes
    const validAttributes = attributes.filter(attr => {
      if (options.attributesToIgnore.includes(attr.name)) {
        return false;
      }
      if (options.excludeRegex && options.excludeRegex.test(attr.value)) {
        return false;
      }
      return true;
    });

    // Priority attributes
    const priorityAttrs = ['data-testid', 'data-test', 'data-cy', 'name', 'type', 'href', 'src'];
    
    // Try priority attributes first
    for (const attrName of priorityAttrs) {
      const attr = validAttributes.find(a => a.name === attrName);
      if (attr) {
        const selector = `[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`;
        if (isUnique(element, selector)) {
          return selector;
        }
      }
    }

    // Try other attributes
    for (const attr of validAttributes) {
      if (!priorityAttrs.includes(attr.name)) {
        const selector = `[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`;
        if (isUnique(element, selector)) {
          return selector;
        }
      }
    }

    // Try combinations
    const tag = element.tagName.toLowerCase();
    for (const attr of validAttributes) {
      const selector = `${tag}[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`;
      if (isUnique(element, selector)) {
        return selector;
      }
    }

    return null;
  }

  function getNthChildSelector(element, options) {
    if (!options.selectorTypes.includes('NthChild')) {
      return null;
    }

    const parent = element.parentElement;
    if (!parent) {
      return null;
    }

    const index = Array.from(parent.children).indexOf(element) + 1;
    const tag = element.tagName.toLowerCase();
    
    // Try nth-child with tag
    const selector = `${tag}:nth-child(${index})`;
    if (isUnique(element, selector)) {
      return selector;
    }

    // Try with parent context
    const parentSelector = getSimpleSelector(parent);
    if (parentSelector) {
      const fullSelector = `${parentSelector} > ${selector}`;
      if (isUnique(element, fullSelector)) {
        return fullSelector;
      }
    }

    return null;
  }

  function getTagSelector(element, options) {
    if (!options.selectorTypes.includes('Tag')) {
      return null;
    }

    const tag = element.tagName.toLowerCase();
    
    // Tag alone is rarely unique, so combine with parent
    const parent = element.parentElement;
    if (!parent) {
      return tag;
    }

    const parentSelector = getSimpleSelector(parent);
    if (parentSelector) {
      const selector = `${parentSelector} > ${tag}`;
      if (isUnique(element, selector)) {
        return selector;
      }
    }

    return null;
  }

  function getSimpleSelector(element) {
    // Get a simple selector for an element (for use in parent context)
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    if (element.classList.length > 0) {
      const firstClass = element.classList[0];
      return `.${CSS.escape(firstClass)}`;
    }

    return element.tagName.toLowerCase();
  }

  function buildPathSelector(element, options) {
    const path = [];
    let current = element;

    while (current && current.nodeType === 1) {
      let selector = current.tagName.toLowerCase();

      // Add ID if available
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add classes
      if (current.classList.length > 0) {
        const classes = Array.from(current.classList)
          .filter(cls => !options.excludeRegex || !options.excludeRegex.test(cls))
          .map(cls => `.${CSS.escape(cls)}`)
          .join('');
        
        if (classes) {
          selector += classes;
        }
      }

      // Add nth-child if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          child => child.tagName === current.tagName
        );
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);

      // Stop at body or document
      if (current.tagName.toLowerCase() === 'body' || current.tagName.toLowerCase() === 'html') {
        break;
      }

      current = parent;
    }

    return path.join(' > ');
  }

  function isUnique(element, selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1 && elements[0] === element;
    } catch (e) {
      return false;
    }
  }

  // Additional utility functions
  function isValidSelector(selector) {
    try {
      document.querySelector(selector);
      return true;
    } catch (e) {
      return false;
    }
  }

  function optimizeSelector(selector, element) {
    const parts = selector.split(' > ');
    
    // Try removing parts from the beginning
    for (let i = 1; i < parts.length; i++) {
      const shortened = parts.slice(i).join(' > ');
      if (isUnique(element, shortened)) {
        return shortened;
      }
    }

    // Try removing nth-child where possible
    const withoutNth = parts.map(part => {
      return part.replace(/:nth-child\(\d+\)/, '');
    }).join(' > ');

    if (withoutNth !== selector && isUnique(element, withoutNth)) {
      return withoutNth;
    }

    return selector;
  }

  // Export functions
  unique.isValidSelector = isValidSelector;
  unique.optimizeSelector = optimizeSelector;
  unique.isUnique = isUnique;

  return unique;

}));
