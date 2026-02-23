/*!
 * FinderLite — упрощённая реализация генератора CSS-селекторов,
 * вдохновлённая библиотекой @medv/finder (MIT).
 * Код написан с нуля, но полностью совместим с лицензией MIT.
 */

(function initFinderLite(global) {
  if (global.FinderLite) {
    return;
  }

  const DEFAULT_OPTIONS = {
    root: null,
    seedMinLength: 1,
    maxDepth: 6,
    preferStableAttributes: true
  };

  const STABLE_ATTRIBUTES = [
    'data-testid',
    'data-cy',
    'data-test',
    'data-qa',
    'data-value',
    'data-id',
    'data-name',
    'data-role',
    'elementid',
    'ng-reflect-element-id',
    'ng-reflect-label',
    'ng-reflect-name',
    'ng-reflect-value',
    'tooltip',
    'aria-label',
    'name',
    'placeholder',
    'id'
  ];

  function cssEscape(value) {
    if (global.CSS && typeof global.CSS.escape === 'function') {
      return global.CSS.escape(value);
    }
    return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function isElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE;
  }

  function getNthOfType(el) {
    let index = 1;
    let sibling = el;
    while (sibling.previousElementSibling) {
      sibling = sibling.previousElementSibling;
      if (sibling.tagName === el.tagName) {
        index++;
      }
    }
    return index;
  }

  function createRoot(options) {
    if (options.root && isElement(options.root)) {
      return options.root;
    }
    return document.documentElement;
  }

  function queryAll(selector, root) {
    if (!selector) return [];
    try {
      if (root && root !== document.documentElement) {
        return root.querySelectorAll(selector);
      }
      return document.querySelectorAll(selector);
    } catch (e) {
      return [];
    }
  }

  function isUniqueSelector(selector, root) {
    return queryAll(selector, root).length === 1;
  }

  function attributeTokens(element, options) {
    const tokens = [];
    for (const attr of STABLE_ATTRIBUTES) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const escaped = cssEscape(value);
      const attrSelector = `[${attr}="${escaped}"]`;
      tokens.push(attrSelector);
      tokens.push(`${element.tagName.toLowerCase()}${attrSelector}`);
      if (attr === 'id') {
        tokens.push(`#${escaped}`);
        tokens.push(`${element.tagName.toLowerCase()}#${escaped}`);
      }
    }
    return tokens;
  }

  function classTokens(element) {
    if (!element.classList || element.classList.length === 0) return [];
    const tokens = [];
    element.classList.forEach(cls => {
      const escaped = cssEscape(cls);
      tokens.push(`.${escaped}`);
      tokens.push(`${element.tagName.toLowerCase()}.${escaped}`);
    });
    if (element.classList.length > 1) {
      const combo = Array.from(element.classList)
        .slice(0, 2)
        .map(cls => `.${cssEscape(cls)}`)
        .join('');
      tokens.push(`${element.tagName.toLowerCase()}${combo}`);
    }
    return tokens;
  }

  function basicTokens(element) {
    const tag = element.tagName.toLowerCase();
    const tokens = [tag];
    tokens.push(`${tag}:nth-of-type(${getNthOfType(element)})`);
    return tokens;
  }

  function nodeCandidates(element, options) {
    if (!isElement(element)) return [];
    const tokens = [
      ...attributeTokens(element, options),
      ...classTokens(element),
      ...basicTokens(element)
    ];
    return uniq(tokens);
  }

  function combine(parentTokens, childPaths) {
    const result = [];
    for (const parent of parentTokens) {
      if (!childPaths || childPaths.length === 0) {
        result.push([parent]);
        continue;
      }
      for (const child of childPaths) {
        result.push([parent, ...child]);
      }
    }
    return result;
  }

  function buildSelector(path) {
    return path.join(' > ');
  }

  function finder(element, customOptions = {}) {
    if (!isElement(element)) {
      throw new Error('FinderLite: element must be a DOM Element');
    }
    const options = Object.assign({}, DEFAULT_OPTIONS, customOptions || {});
    const root = createRoot(options);

    const initialCandidates = nodeCandidates(element, options)
      .slice(0, Math.max(options.seedMinLength, 1))
      .map(token => [token]);

    let currentPaths = initialCandidates.length > 0 ? initialCandidates : [[element.tagName.toLowerCase()]];
    let currentElement = element;
    let depth = 0;

    while (depth < options.maxDepth && currentPaths.length > 0) {
      for (const path of currentPaths) {
        const selector = buildSelector(path);
        if (isUniqueSelector(selector, root)) {
          return selector;
        }
      }

      currentElement = currentElement.parentElement;
      depth++;

      if (!currentElement || currentElement === root.parentElement || currentElement === document) {
        break;
      }

      const parentTokens = nodeCandidates(currentElement, options);
      currentPaths = combine(parentTokens, currentPaths);
    }

    // fallback — используем полный путь из nth-of-type
    const fallbackPath = [];
    let node = element;
    while (node && node !== root.parentElement) {
      fallbackPath.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${getNthOfType(node)})`);
      node = node.parentElement;
      if (node === root) break;
    }
    const fallbackSelector = buildSelector(fallbackPath);
    return fallbackSelector || null;
  }

  global.FinderLite = {
    version: '0.1.0',
    find: finder,
    getSelector: finder
  };
})(typeof window !== 'undefined' ? window : globalThis);



