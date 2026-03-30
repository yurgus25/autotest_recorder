/*!
 * OptimalSelectLite — адаптированная реализация идей библиотеки optimal-select (MIT).
 * Предназначена для получения максимально устойчивых CSS-селекторов к элементу.
 */

(function initOptimalSelectLite(global) {
  if (global.OptimalSelectLite) {
    return;
  }

  const DEFAULT_CONFIG = {
    includeTag: true,
    includeNthChild: true,
    attributeWeights: {
      id: 1,
      'data-testid': 2,
      'data-cy': 2,
      'data-test': 2,
      'aria-label': 4,
      name: 5,
      placeholder: 6,
      class: 7,
      text: 8,
      nth: 9
    }
  };

  const TEXT_LENGTH_LIMIT = 80;

  function cssEscape(value) {
    if (global.CSS && typeof global.CSS.escape === 'function') {
      return global.CSS.escape(value);
    }
    return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function normalizeText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getNthChild(element) {
    let index = 1;
    let prev = element;
    while (prev.previousElementSibling) {
      prev = prev.previousElementSibling;
      if (prev.tagName === element.tagName) {
        index++;
      }
    }
    return index;
  }

  function uniquenessScore(selector) {
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 0) return Infinity;
      return matches.length;
    } catch (e) {
      return Infinity;
    }
  }

  function buildToken(element, config) {
    const tag = element.tagName.toLowerCase();
    const parts = [];
    const scoreMeta = [];

    if (config.includeTag) {
      parts.push(tag);
      scoreMeta.push({ type: 'tag', weight: 10 });
    }

    if (element.id) {
      const escaped = cssEscape(element.id);
      parts.push(`#${escaped}`);
      scoreMeta.push({ type: 'id', weight: config.attributeWeights.id });
      return { token: parts.join(''), scoreMeta };
    }

    const preferredAttrs = [
      'data-testid',
      'data-cy',
      'data-test',
      'data-value',
      'elementid',
      'ng-reflect-element-id',
      'ng-reflect-label',
      'name',
      'aria-label',
      'placeholder'
    ];

    preferredAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (!value) return;
      const escaped = cssEscape(value);
      parts.push(`[${attr}="${escaped}"]`);
      scoreMeta.push({ type: attr, weight: config.attributeWeights[attr] || 6 });
    });

    if (element.classList && element.classList.length > 0) {
      const className = cssEscape(element.classList[0]);
      parts.push(`.${className}`);
      scoreMeta.push({ type: 'class', weight: config.attributeWeights.class });
    }

    if (parts.length === 0 && config.includeNthChild) {
      const nth = getNthChild(element);
      parts.push(`${tag}:nth-of-type(${nth})`);
      scoreMeta.push({ type: 'nth', weight: config.attributeWeights.nth });
    }

    return {
      token: parts.join(''),
      scoreMeta
    };
  }

  function buildTextSelector(element, config) {
    const text = normalizeText(element.textContent || '');
    if (!text || text.length === 0 || text.length > TEXT_LENGTH_LIMIT) {
      return null;
    }
    const escaped = cssEscape(text);
    return {
      token: `${element.tagName.toLowerCase()}:contains("${escaped}")`,
      scoreMeta: [{ type: 'text', weight: config.attributeWeights.text }]
    };
  }

  function combineTokens(element, config) {
    const base = buildToken(element, config);
    const result = [];
    if (base && base.token) {
      result.push(base);
    }

    const textSelector = buildTextSelector(element, config);
    if (textSelector) {
      result.push(textSelector);
    }

    return result;
  }

  function select(element, config = {}) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      throw new Error('OptimalSelectLite: element must be a DOM Element');
    }

    const finalConfig = Object.assign({}, DEFAULT_CONFIG, config);
    const tokens = [];
    let node = element;

    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const nodeTokens = combineTokens(node, finalConfig);
      if (nodeTokens.length === 0) break;
      tokens.unshift(nodeTokens);
      if (node.id) break; // id гарантирует уникальность выше
      node = node.parentElement;
    }

    // Перебираем комбинации от корня к элементу
    let best = null;

    const dfs = (index, pathTokens, meta) => {
      if (index >= tokens.length) {
        const selector = pathTokens.join(' > ');
        const uniqueness = uniquenessScore(selector);
        if (uniqueness === 1) {
          const score = meta.reduce((acc, item) => acc + item.weight, 0);
          if (!best || score < best.score) {
            best = { selector, score, meta: [...meta] };
          }
        }
        return;
      }

      for (const token of tokens[index]) {
        pathTokens.push(token.token);
        meta.push(...token.scoreMeta);
        dfs(index + 1, pathTokens, meta);
        pathTokens.pop();
        meta.splice(meta.length - token.scoreMeta.length, token.scoreMeta.length);
      }
    };

    dfs(0, [], []);

    if (best) {
      return best;
    }

    // Fallback: используем простую цепочку nth-of-type
    const fallbackPath = [];
    let anchor = element;
    while (anchor && anchor.nodeType === Node.ELEMENT_NODE) {
      const nth = getNthChild(anchor);
      fallbackPath.unshift(`${anchor.tagName.toLowerCase()}:nth-of-type(${nth})`);
      anchor = anchor.parentElement;
    }
    return {
      selector: fallbackPath.join(' > '),
      score: Number.MAX_SAFE_INTEGER,
      meta: []
    };
  }

  global.OptimalSelectLite = {
    version: '0.1.0',
    select,
    getSelector(element, config) {
      const result = select(element, config);
      return result ? result.selector : null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);



