/*!
 * UniqueSelectorLite — компактная реализация идей уникального CSS-селектора.
 * Основано на принципах библиотеки unique-selector (MIT), написано с нуля.
 */

(function initUniqueSelectorLite(global) {
  if (global.UniqueSelectorLite) return;

  const DEFAULT_OPTIONS = {
    root: null,
    includeTag: true,
    includeClasses: true,
    includeId: true,
    maxCombinations: 1000
  };

  const SPECIAL_CHARS = /([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g;

  function cssEscape(str) {
    if (global.CSS && typeof global.CSS.escape === 'function') {
      return global.CSS.escape(str);
    }
    return String(str).replace(SPECIAL_CHARS, '\\$1');
  }

  function isElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE;
  }

  function getRoot(options) {
    if (options.root && isElement(options.root)) {
      return options.root;
    }
    return document.body || document.documentElement;
  }

  function queryAll(selector, root) {
    if (!selector) return [];
    try {
      if (root && root !== document.body && root !== document.documentElement) {
        return root.querySelectorAll(selector);
      }
      return document.querySelectorAll(selector);
    } catch (e) {
      return [];
    }
  }

  function isUnique(selector, root) {
    return queryAll(selector, root).length === 1;
  }

  function* combinations(array, maxComb) {
    const result = [];

    function backtrack(start, path) {
      if (result.length >= maxComb) return;
      if (path.length > 0) {
        result.push(path.slice());
      }
      for (let i = start; i < array.length; i++) {
        path.push(array[i]);
        backtrack(i + 1, path);
        path.pop();
      }
    }

    backtrack(0, []);
    yield* result;
  }

  function buildSelector(element, options) {
    if (!isElement(element)) {
      throw new Error('UniqueSelectorLite: element must be a DOM Element');
    }

    const cfg = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const root = getRoot(cfg);

    if (!root.contains(element)) {
      throw new Error('UniqueSelectorLite: root does not contain element');
    }

    const queue = [];
    const visited = new Set();
    const start = { element, selector: '', depth: 0 };
    queue.push(start);

    while (queue.length) {
      const current = queue.shift();
      const node = current.element;
      const depth = current.depth;

      if (!node || node === root.parentElement) continue;

      const tokens = [];

      if (cfg.includeId && node.id) {
        tokens.push({ selector: `#${cssEscape(node.id)}`, weight: 1 });
      }

      if (cfg.includeClasses && node.classList && node.classList.length) {
        const classes = Array.from(node.classList).map(cls => `.${cssEscape(cls)}`);
        tokens.push(...classes.map(cls => ({ selector: cls, weight: 5 })));
      }

      if (cfg.includeTag) {
        tokens.push({ selector: node.tagName.toLowerCase(), weight: 10 });
      }

      // Упорядочиваем по весу (чем меньше, тем раньше проверяем)
      tokens.sort((a, b) => a.weight - b.weight);

      for (const token of tokens) {
        const candidate = combineSelectors(token.selector, current.selector);
        if (!candidate) continue;
        if (isUnique(candidate, root)) {
          return candidate;
        }
      }

      // Комбинации классов
      if (cfg.includeClasses && node.classList && node.classList.length > 1) {
        const clsArr = Array.from(node.classList).map(cls => `.${cssEscape(cls)}`);
        const comboGen = combinations(clsArr, cfg.maxCombinations);
        for (const combo of comboGen) {
          const combined = combo.join('');
          const candidate = combineSelectors(node.tagName.toLowerCase() + combined, current.selector);
          if (isUnique(candidate, root)) {
            return candidate;
          }
        }
      }

      // Переходим к родителю
      const parent = node.parentElement;
      if (parent && !visited.has(parent)) {
        visited.add(parent);
        const parentSelectorPart = buildDirectChildSelector(node);
        queue.push({
          element: parent,
          selector: combineSelectors(parentSelectorPart, current.selector) || parentSelectorPart,
          depth: depth + 1
        });
      }
    }

    // Fallback — путь через nth-child
    return buildNthPath(element, root);
  }

  function combineSelectors(part, tail) {
    if (!part) return tail;
    if (!tail) return part;
    return `${part} ${tail}`;
  }

  function buildDirectChildSelector(element) {
    if (!element || !element.parentElement) return element.tagName.toLowerCase();
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    const children = Array.from(parent.children).filter(child => child.tagName === element.tagName);
    if (children.length === 1) {
      return `${tag}`;
    }
    const index = children.indexOf(element) + 1;
    return `${tag}:nth-of-type(${index})`;
  }

  function buildNthPath(element, root) {
    const path = [];
    let node = element;
    while (node && node !== root.parentElement) {
      const part = buildDirectChildSelector(node);
      path.unshift(part);
      if (node === root) break;
      node = node.parentElement;
    }
    return path.join(' > ');
  }

  global.UniqueSelectorLite = {
    find(element, options) {
      return buildSelector(element, options);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);



