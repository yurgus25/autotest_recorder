/**
 * Finder - Full version
 * Enhanced CSS selector generation library
 * Based on @medv/finder
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.finder = factory());
})(this, (function () { 'use strict';

  var Limit;
  (function (Limit) {
    Limit[Limit["All"] = 0] = "All";
    Limit[Limit["Two"] = 1] = "Two";
    Limit[Limit["One"] = 2] = "One";
  })(Limit || (Limit = {}));

  var config;
  var rootDocument;

  function finder(input, options) {
    if (input.nodeType !== Node.ELEMENT_NODE) {
      throw new Error(`Can't generate CSS selector for non-element node type.`);
    }
    if ("html" === input.tagName.toLowerCase()) {
      return "html";
    }
    const defaults = {
      root: document.body,
      idName: name => true,
      className: name => true,
      tagName: name => true,
      attr: (name, value) => false,
      seedMinLength: 1,
      optimizedMinLength: 2,
      threshold: 1000,
      maxNumberOfTries: 10000
    };

    config = { ...defaults, ...options };
    rootDocument = findRootDocument(config.root, defaults);

    let path = null;
    let stack = [];
    let current = input;
    let i = 0;

    while (current && current !== config.root.parentElement) {
      let level = maybe(id(current)) ||
        maybe(...attr(current)) ||
        maybe(...classNames(current)) ||
        maybe(tagName(current)) || [any()];

      const nth = index(current);
      if (limit(stack[stack.length - 1], level[0]) === Limit.All) {
        level.push(nth);
      }
      
      stack.push(level[0]);
      
      if (stack.length >= config.seedMinLength) {
        path = finder$1(stack);
        if (path) {
          break;
        }
      }
      
      current = current.parentElement;
      i++;
      
      if (i > config.maxNumberOfTries) {
        break;
      }
    }

    if (!path) {
      path = finder$1(stack);
    }
    
    if (!path) {
      throw new Error(`Selector was not found.`);
    }

    return optimize(path, input);
  }

  function findRootDocument(rootNode, defaults) {
    if (rootNode.nodeType === Node.DOCUMENT_NODE) {
      return rootNode;
    }
    if (rootNode === defaults.root) {
      return rootNode.ownerDocument;
    }
    return rootNode;
  }

  function maybe(...level) {
    const list = level.filter(notEmpty);
    if (list.length > 0) {
      return list;
    }
    return null;
  }

  function notEmpty(value) {
    return value !== null && value !== undefined;
  }

  function id(input) {
    const elementId = input.getAttribute("id");
    if (elementId && config.idName(elementId)) {
      return {
        name: "#" + cssesc(elementId, { isIdentifier: true }),
        penalty: 0
      };
    }
    return null;
  }

  function attr(input) {
    const attrs = Array.from(input.attributes).filter(attr =>
      config.attr(attr.name, attr.value)
    );

    return attrs.map(attr => ({
      name: `[${cssesc(attr.name, { isIdentifier: true })}="${cssesc(attr.value)}"]`,
      penalty: 0.5
    }));
  }

  function classNames(input) {
    const names = Array.from(input.classList).filter(config.className);

    return names.map(name => ({
      name: "." + cssesc(name, { isIdentifier: true }),
      penalty: 1
    }));
  }

  function tagName(input) {
    const name = input.tagName.toLowerCase();
    if (config.tagName(name)) {
      return {
        name,
        penalty: 2
      };
    }
    return null;
  }

  function any() {
    return {
      name: "*",
      penalty: 3
    };
  }

  function index(input) {
    const parent = input.parentElement;
    if (!parent) {
      return null;
    }

    let child = parent.firstElementChild;
    if (!child) {
      return null;
    }

    let i = 0;
    while (child) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        i++;
      }
      if (child === input) {
        break;
      }
      child = child.nextElementSibling;
    }

    return {
      name: `:nth-child(${i})`,
      penalty: 1
    };
  }

  function limit(prev, level) {
    if (prev) {
      if (prev.name === level.name) {
        return Limit.One;
      }
    }
    return Limit.All;
  }

  function* finder$1(stack) {
    if (stack.length > 0) {
      yield selector(stack);
    }
  }

  function selector(stack) {
    return stack.map(level => level.name).join(" > ");
  }

  function penalty(path) {
    return path.map(node => node.penalty).reduce((acc, val) => acc + val, 0);
  }

  function optimize(path, input, scope = {
    counter: 0,
    visited: new Map()
  }) {
    if (path.length > config.optimizedMinLength && path.length > 1) {
      const newPath = [...path];
      newPath.pop();
      const newSelector = selector(newPath);
      
      if (unique(newSelector, input)) {
        return optimize(newPath, input, scope);
      }
    }
    
    return selector(path);
  }

  function unique(selector, input) {
    const elements = rootDocument.querySelectorAll(selector);
    return elements.length === 1 && elements[0] === input;
  }

  // CSS.escape polyfill
  function cssesc(value, options = {}) {
    const string = String(value);
    const { isIdentifier = false } = options;
    
    if (string.length === 0) {
      return isIdentifier ? '\\' : '';
    }

    let result = '';
    const firstCharCode = string.charCodeAt(0);

    for (let i = 0; i < string.length; i++) {
      const charCode = string.charCodeAt(i);

      if (charCode === 0x0000) {
        result += '\uFFFD';
        continue;
      }

      if (
        (charCode >= 0x0001 && charCode <= 0x001F) ||
        charCode === 0x007F ||
        (i === 0 && charCode >= 0x0030 && charCode <= 0x0039) ||
        (i === 1 && charCode >= 0x0030 && charCode <= 0x0039 && firstCharCode === 0x002D)
      ) {
        result += '\\' + charCode.toString(16) + ' ';
        continue;
      }

      if (i === 0 && charCode === 0x002D && string.length === 1) {
        result += '\\' + string.charAt(i);
        continue;
      }

      if (
        charCode >= 0x0080 ||
        charCode === 0x002D ||
        charCode === 0x005F ||
        (charCode >= 0x0030 && charCode <= 0x0039) ||
        (charCode >= 0x0041 && charCode <= 0x005A) ||
        (charCode >= 0x0061 && charCode <= 0x007A)
      ) {
        result += string.charAt(i);
        continue;
      }

      result += '\\' + string.charAt(i);
    }

    return result;
  }

  return finder;

}));
