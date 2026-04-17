/**
 * AutoTest Recorder - Player Module
 * All dropdown-related methods
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-dropdown
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-dropdown.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype._buildDropdownContainerSelector = function(action, targetEl) {
  const esc = (v) => String(v || '').replace(/"/g, '\\"');
  const elementId = action?.element?.parentDropdown?.elementId ||
    targetEl?.getAttribute?.('elementid') ||
    targetEl?.getAttribute?.('ng-reflect-element-id');
  if (elementId) {
    const id = esc(elementId);
    return `app-select[elementid="${id}"], app-select[ng-reflect-element-id="${id}"], [elementid="${id}"]`;
  }
  const root = targetEl?.closest?.('app-select, ng-select, mat-select, [elementid], [role="combobox"], [class*="select"], [class*="dropdown"], [class*="combo"]') || targetEl;
  if (root?.id) {
    const cssEscape = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(root.id) : root.id.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    return `#${cssEscape}`;
  }
  const selectorFromAction = action?.selector?.selector || action?.selector?.value || '';
  return selectorFromAction || '';
};

TestPlayer.prototype._getDropdownElementId = function(action, targetEl) {
  return String(
    action?.element?.parentDropdown?.elementId ||
    targetEl?.getAttribute?.('elementid') ||
    targetEl?.getAttribute?.('ng-reflect-element-id') ||
    targetEl?.closest?.('[elementid], [ng-reflect-element-id]')?.getAttribute?.('elementid') ||
    targetEl?.closest?.('[elementid], [ng-reflect-element-id]')?.getAttribute?.('ng-reflect-element-id') ||
    ''
  ).trim();
};

TestPlayer.prototype._findBoundDropdownPanel = function(elementId) {
  if (!elementId) return null;
  const escaped = String(elementId).replace(/"/g, '\\"');
  const safeId = `${elementId}__result`;
  const cssEscapedId = (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(safeId)
    : safeId.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  const selectors = [
    `#${cssEscapedId}`,
    `[id="${escaped}__result"]`,
    `[id*="${escaped}__result"]`,
    `div[id*="${escaped}"][id*="__result"]`,
    `.cdk-overlay-pane [id*="${escaped}__result"]`,
    `[role="listbox"][id*="${escaped}"]`
  ];
  for (const sel of selectors) {
    try {
      const panel = document.querySelector(sel);
      if (!panel) continue;
      const style = window.getComputedStyle(panel);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const panelId = String(panel.id || '');
      if (panelId && panelId.endsWith('__result') && !this._boundPanelHasOptions(panel)) continue;
      return panel;
    } catch (_) {}
  }
  return null;
};

TestPlayer.prototype._describeDropdownDebugNode = function(el) {
  if (!el || !(el instanceof Element)) return 'null';
  const tag = (el.tagName || '').toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  const clsPart = cls ? `.${cls}` : '';
  const role = el.getAttribute?.('role');
  const elementId = el.getAttribute?.('elementid') || el.getAttribute?.('ng-reflect-element-id') || '';
  const rolePart = role ? `[role="${role}"]` : '';
  const elementIdPart = elementId ? `[elementid="${elementId}"]` : '';
  return `${tag}${id}${clsPart}${rolePart}${elementIdPart}`;
};

TestPlayer.prototype._logDropdownOpenDebug = function(stage, data = {}) {
  try {
    console.log(`🧭 [DropdownOpenDebug] ${stage}`, data);
    const safe = JSON.stringify(data, (key, value) => {
      if (value instanceof Element) return this._describeDropdownDebugNode(value);
      if (value instanceof Node) return `[node:${value.nodeName || 'unknown'}]`;
      if (typeof value === 'function') return '[function]';
      return value;
    });
    console.log(`🧭 [DropdownOpenDebug] ${stage}::json ${safe}`);
  } catch (_) {}
};

TestPlayer.prototype._boundPanelHasOptions = function(panel) {
  if (!panel || !(panel instanceof Element)) return false;
  const optionSelector = '[role="option"], .option, .group-item, .mat-option, .ng-option, .ant-select-item-option, .result__item, .menu__item, [class*="menu__item"], [data-value], li[role="option"]';
  const candidates = Array.from(panel.querySelectorAll(optionSelector));
  let visibleCount = 0;
  for (const el of candidates) {
    try {
      const txt = String(
        el.textContent ||
        el.innerText ||
        el.getAttribute?.('title') ||
        el.getAttribute?.('aria-label') ||
        el.getAttribute?.('data-value') ||
        ''
      ).trim();
      if (!txt) continue;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      visibleCount++;
      if (visibleCount >= 1) return true;
    } catch (_) {}
  }
  return false;
};

TestPlayer.prototype._isLikelyApplicationMenuPanel = function(panel) {
  if (!panel || !(panel instanceof Element)) return false;
  try {
    const cls = String(panel.className || '').toLowerCase();
    const role = String(panel.getAttribute?.('role') || '').toLowerCase();
    const hasOptionSignals = !!panel.querySelector?.('[role="option"], .option, .group-item, .mat-option, .ng-option, .ant-select-item-option, .result__item, .menu__item, [class*="menu__item"], [data-value], li[role="option"]');
    const hasMenuSignals = !!panel.querySelector?.('[role="menuitem"], a[href], .menu__document, .menu__group, .menu__header');
    if (role === 'menu' && !hasOptionSignals) return true;
    if (cls.includes('menu__document')) return true;
    if (hasMenuSignals && !hasOptionSignals) return true;
  } catch (_) {}
  return false;
};

TestPlayer.prototype._isPanelRelevantForBoundDropdown = function(panel, targetEl, elementId = '', options = {}) {
  if (!panel || !(panel instanceof Element)) return false;
  const expectedValue = String(options?.expectedValue || '').trim();
  const requireExpectedValue = options?.requireExpectedValue === true;
  const allowFarPanel = options?.allowFarPanel === true;
  const maxDistance = Number.isFinite(options?.maxDistance) ? Number(options.maxDistance) : 420;
  const optionSelector = '[role="option"], .option, .group-item, .mat-option, .ng-option, .ant-select-item-option, .result__item, .menu__item, [class*="menu__item"], [data-value], li[role="option"]';
  const normalize = (v) => this.normalizeTextValue(String(v || ''));
  const expectedNorm = normalize(expectedValue);
  const elementNeedle = String(elementId || '').toLowerCase();

  try {
    const st = window.getComputedStyle(panel);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
  } catch (_) {
    return false;
  }

  const panelId = String(panel.id || '').toLowerCase();
  const panelCls = String(panel.className || '').toLowerCase();
  const ownerRoot = targetEl?.closest?.('app-select, [elementid], [ng-reflect-element-id], [role="combobox"], [class*="select"], [class*="dropdown"]') || null;
  if (ownerRoot && ownerRoot.contains(panel)) {
    if (!panelId || panelId.endsWith('__result') || (elementNeedle && panelId.includes(`${elementNeedle}__result`))) {
      return false;
    }
  }

  let optionsCount = 0;
  let visibleOptions = [];
  try {
    visibleOptions = Array.from(panel.querySelectorAll(optionSelector)).filter((el) => {
      const txt = normalize(
        el?.textContent ||
        el?.innerText ||
        el?.getAttribute?.('title') ||
        el?.getAttribute?.('aria-label') ||
        el?.getAttribute?.('data-value') ||
        ''
      );
      if (!txt) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    optionsCount = visibleOptions.length;
  } catch (_) {}
  if (optionsCount === 0) return false;

  const isBoundById = !!(elementNeedle && (panelId.includes(elementNeedle) || panelId.includes(`${elementNeedle}__result`) || panelCls.includes(elementNeedle)));
  const looksLikeAppMenu = this._isLikelyApplicationMenuPanel(panel);

  let hasExpectedValue = false;
  if (expectedNorm) {
    try {
      hasExpectedValue = visibleOptions.some((el) => {
        const txt = normalize(
          el?.textContent ||
          el?.innerText ||
          el?.getAttribute?.('title') ||
          el?.getAttribute?.('aria-label') ||
          el?.getAttribute?.('data-value') ||
          ''
        );
        if (!txt) return false;
        return txt === expectedNorm || txt.includes(expectedNorm);
      });
    } catch (_) {}
  }

  if (looksLikeAppMenu && !isBoundById && !hasExpectedValue) return false;
  if (requireExpectedValue && expectedNorm && !hasExpectedValue && !isBoundById) return false;

  if (!allowFarPanel && targetEl?.getBoundingClientRect) {
    try {
      const tr = targetEl.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const dist = Math.hypot(
        (tr.left + tr.width / 2) - (pr.left + pr.width / 2),
        (tr.top + tr.height / 2) - (pr.top + pr.height / 2)
      );
      if (!isBoundById && dist > maxDistance) return false;
    } catch (_) {}
  }

  // Generic .menu panels are high risk; require stronger confidence.
  if (!isBoundById && /\bmenu\b/.test(panelCls)) {
    if (!hasExpectedValue) return false;
  }

  return true;
};

TestPlayer.prototype._findNearbyOpenDropdownPanel = function(targetEl, elementId = '', options = {}) {
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const optionSelector = '[role="option"], .option, .group-item, .mat-option, .ng-option, .ant-select-item-option, .result__item, .menu__item, [class*="menu__item"], [data-value], li[role="option"]';
  const panelSelector = [
    '.cdk-overlay-pane',
    '[role="listbox"]',
    '[id*="__result"]',
    '.ng-dropdown-panel',
    '.mat-select-panel',
    '.ant-select-dropdown',
    '.el-select-dropdown',
    '.menu',
    '[class*="menu"]',
    '[class*="dropdown-panel"]',
    '[class*="content-list"]'
  ].join(',');
  const rootRect = (targetEl && targetEl.getBoundingClientRect) ? targetEl.getBoundingClientRect() : null;
  const rootCx = rootRect ? (rootRect.left + rootRect.width / 2) : 0;
  const rootCy = rootRect ? (rootRect.top + rootRect.height / 2) : 0;
  const needle = String(elementId || '').toLowerCase();
  let best = null;
  let bestScore = -Infinity;
  const ownerRoot = targetEl?.closest?.('app-select, [elementid], [ng-reflect-element-id], [role="combobox"], [class*="select"], [class*="dropdown"]') || null;
  const panels = Array.from(document.querySelectorAll(panelSelector)).filter(isVisible);
  for (const panel of panels) {
    if (!this._isPanelRelevantForBoundDropdown(panel, targetEl, elementId, options)) continue;
    // Важно: не используем локальный display/result контейнер самого поля как "панель опций".
    if (ownerRoot && ownerRoot.contains(panel)) {
      const panelIdLocal = String(panel.id || '');
      if (!panelIdLocal || panelIdLocal.endsWith('__result') || panelIdLocal.includes(`${elementId}__result`)) {
        continue;
      }
    }
    const optionsCount = panel.querySelectorAll(optionSelector).length;
    if (optionsCount === 0) continue;
    const pr = panel.getBoundingClientRect();
    const pcx = pr.left + pr.width / 2;
    const pcy = pr.top + pr.height / 2;
    const distance = rootRect ? Math.hypot(rootCx - pcx, rootCy - pcy) : 0;
    const panelId = String(panel.id || '').toLowerCase();
    const panelClass = String(panel.className || '').toLowerCase();
    let score = 200 - Math.min(180, distance);
    score += Math.min(40, optionsCount);
    if (needle && panelId.includes(needle)) score += 120;
    if (needle && panelId.includes('__result')) score += 40;
    // Штрафуем глобальные menu-панели приложения, чтобы не путать с dropdown опциями поля.
    if (panelClass.includes('menu__document')) score -= 220;
    if (panelClass.includes('menu__item-active-disable')) score -= 120;
    if (score > bestScore) {
      bestScore = score;
      best = panel;
    }
  }
  if (best) {
    this._logDropdownOpenDebug('nearby-panel-picked', {
      elementId: elementId || null,
      panel: this._describeDropdownDebugNode(best),
      score: bestScore
    });
  } else {
    this._logDropdownOpenDebug('nearby-panel-not-found', {
      elementId: elementId || null,
      scannedPanels: panels.length
    });
  }
  return best;
};

TestPlayer.prototype._findPanelByValueAffinity = function(targetEl, targetValue, elementId = '') {
  const value = String(targetValue || '').trim();
  if (!value) return null;
  const expected = this.normalizeTextValue(value);
  const expectedTokens = expected.split(/\s+/).filter(token => token.length >= 4);
  const ownerRoot = targetEl?.closest?.('app-select, [elementid], [ng-reflect-element-id], [role="combobox"], [class*="select"], [class*="dropdown"]') || null;
  const rootRect = targetEl?.getBoundingClientRect?.() || null;
  const optionSelector = '[role="option"], .option, .group-item, .mat-option, .ng-option, .ant-select-item-option, .result__item, .menu__item, [class*="menu__item"], [data-value], li[role="option"]';
  const panelSelector = '.cdk-overlay-pane, [role="listbox"], [id*="__result"], .ng-dropdown-panel, .mat-select-panel, .ant-select-dropdown, .el-select-dropdown, .menu, [class*="menu"], [class*="dropdown-panel"], [class*="content-list"]';
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const normalizeText = (el) => this.normalizeTextValue(String(
    el?.textContent ||
    el?.innerText ||
    el?.getAttribute?.('title') ||
    el?.getAttribute?.('aria-label') ||
    el?.getAttribute?.('data-value') ||
    ''
  ).replace(/\s+/g, ' ').trim());

  const panels = Array.from(document.querySelectorAll(panelSelector)).filter(isVisible);
  let best = null;
  let bestScore = 0;
  for (const panel of panels) {
    if (!this._isPanelRelevantForBoundDropdown(panel, targetEl, elementId, {
      expectedValue: value,
      requireExpectedValue: true,
      maxDistance: 520
    })) {
      continue;
    }
    if (ownerRoot && ownerRoot.contains(panel)) continue;
    const panelId = String(panel.id || '');
    if (panelId && panelId.endsWith('__result') && ownerRoot && ownerRoot.contains(panel)) continue;

    const options = Array.from(panel.querySelectorAll(optionSelector)).filter(isVisible);
    if (!options.length) continue;

    let exactMatches = 0;
    let partialMatches = 0;
    for (const opt of options) {
      const txt = normalizeText(opt);
      if (!txt) continue;
      if (txt === expected) {
        exactMatches++;
        continue;
      }
      if (txt.includes(expected)) {
        partialMatches++;
        continue;
      }
      if (expectedTokens.length > 0) {
        const matched = expectedTokens.filter(token => txt.includes(token)).length;
        if (matched >= Math.min(2, expectedTokens.length)) partialMatches++;
      }
    }

    if (exactMatches === 0 && partialMatches === 0) continue;

    let distanceScore = 0;
    if (rootRect) {
      const pr = panel.getBoundingClientRect();
      const distance = Math.hypot(
        (rootRect.left + rootRect.width / 2) - (pr.left + pr.width / 2),
        (rootRect.top + rootRect.height / 2) - (pr.top + pr.height / 2)
      );
      distanceScore = Math.max(0, 140 - Math.min(140, distance));
    }
    const score = (exactMatches * 120) + (partialMatches * 35) + Math.min(30, options.length) + distanceScore;
    if (score > bestScore) {
      bestScore = score;
      best = panel;
    }
  }

  if (best) {
    this._logDropdownOpenDebug('value-affinity-panel-picked', {
      elementId: elementId || null,
      value,
      panel: this._describeDropdownDebugNode(best),
      score: bestScore
    });
  }
  return best;
};

TestPlayer.prototype._getBoundDropdownOpenTriggers = function(action, targetEl, elementId) {
  const result = [];
  const pushUnique = (el) => {
    if (!el || !el.isConnected) return;
    if (!(el instanceof Element)) return;
    const panelId = String(el.id || '');
    if (panelId && panelId.endsWith('__result')) return;
    if (result.includes(el)) return;
    result.push(el);
  };
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const pickFromRoot = (root) => {
    if (!root) return;
    const selectors = [
      '.arrow.isShowOptions',
      '.arrow',
      '[class*="arrow"]',
      '.select-box',
      '[class*="select-box"]',
      '.result',
      '[class*="result"]',
      '.options',
      '[class*="options"]',
      '[role="combobox"]',
      '[aria-haspopup="listbox"]'
    ];
    for (const sel of selectors) {
      try {
        const candidate = root.querySelector(sel);
        if (candidate && isVisible(candidate)) pushUnique(candidate);
      } catch (_) {}
    }
    if (isVisible(root)) pushUnique(root);
  };

  const preferred = this.resolvePreferredDropdownTrigger?.(action, targetEl) || targetEl;
  if (isVisible(preferred)) pushUnique(preferred);

  const root = targetEl?.closest?.('app-select, [elementid], [ng-reflect-element-id], [role="combobox"], [class*="select"], [class*="dropdown"]') || targetEl;
  pickFromRoot(root);

  if (elementId) {
    const escaped = String(elementId).replace(/"/g, '\\"');
    const byId = document.querySelector(`app-select[elementid="${escaped}"], app-select[ng-reflect-element-id="${escaped}"], [elementid="${escaped}"]`);
    pickFromRoot(byId);
  }

  const selectorCandidates = [];
  const pushSelector = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    if (!selectorCandidates.includes(trimmed)) selectorCandidates.push(trimmed);
  };
  pushSelector(action?.dropdownTrigger?.selector);
  pushSelector(action?.element?.parentDropdown?.triggerSelector);
  if (Array.isArray(action?.dropdownTrigger?.alternatives)) {
    action.dropdownTrigger.alternatives.forEach(pushSelector);
  }
  if (Array.isArray(action?.element?.parentDropdown?.triggerAlternatives)) {
    action.element.parentDropdown.triggerAlternatives.forEach(pushSelector);
  }
  if (Array.isArray(action?.selector?.alternatives)) {
    action.selector.alternatives.forEach((alt) => pushSelector(typeof alt === 'string' ? alt : alt?.selector));
  }
  for (const css of selectorCandidates) {
    try {
      const candidate = document.querySelector(css);
      if (candidate && isVisible(candidate)) pushUnique(candidate);
    } catch (_) {}
  }

  if (String(elementId || '').toLowerCase().includes('status-project')) {
    const hardcoded = [
      '.input-project-status app-select div div div div:nth-of-type(2)',
      '.input-project-status app-select [role="combobox"]',
      '.input-project-status app-select .select-box',
      '.input-project-status app-select .result'
    ];
    for (const css of hardcoded) {
      try {
        const candidate = document.querySelector(css);
        if (candidate && isVisible(candidate)) pushUnique(candidate);
      } catch (_) {}
    }
  }

  return result.filter(isVisible);
};

TestPlayer.prototype._shouldLimitDropdownOpenSearch = function(action, targetEl, elementId, expectedValue = '') {
  const subtype = String(action?.subtype || '').toLowerCase();
  if (subtype.startsWith('dropdown-')) return false;
  if (action?.isDropdownSelection === true || action?.dropdownAutoFilled === true || action?.isDropdownClick === true) return false;

  const selectorText = String(this.formatSelector?.(action?.selector) || '').toLowerCase();
  const fieldLabel = String(action?.fieldLabel || '').toLowerCase();
  const valueText = String(expectedValue || action?.optionText || action?.value || '').trim().toLowerCase();
  const elementIdText = String(elementId || '').toLowerCase();

  const role = String(targetEl?.getAttribute?.('role') || '').toLowerCase();
  const ariaHaspopup = String(targetEl?.getAttribute?.('aria-haspopup') || '').toLowerCase();
  const tag = String(targetEl?.tagName || '').toLowerCase();
  const classText = String(targetEl?.className || '').toLowerCase();

  const dropdownHints = /(dropdown|select|combobox|listbox|option|выберите|статус|тип проекта|список)/i;
  const hasDropdownIntent = dropdownHints.test(subtype) ||
    dropdownHints.test(selectorText) ||
    dropdownHints.test(fieldLabel) ||
    dropdownHints.test(valueText) ||
    role === 'combobox' ||
    role === 'listbox' ||
    ariaHaspopup === 'listbox' ||
    /(^|[\s_-])(dropdown|select-box|select|combobox|autocomplete)([\s_-]|$)/i.test(classText);
  if (hasDropdownIntent) return false;

  const isButtonLike = tag === 'button' ||
    tag === 'a' ||
    tag === 'app-header-button' ||
    role === 'button' ||
    role === 'menuitem' ||
    role === 'link' ||
    /(^|[\s_-])(btn|button|big-button|header-button|menu__subitem)([\s_-]|$)/i.test(classText) ||
    /save|submit|apply|create|delete/.test(elementIdText);
  if (!isButtonLike) return false;

  const isActionButtonValue = /(сохран|save|submit|отправ|apply|примен|созда|create|удал|delete|ok|да)/i.test(valueText);
  return isActionButtonValue;
};

TestPlayer.prototype._openBoundDropdownPanel = async function(action, targetEl, elementId, options = {}) {
  if (!elementId) return null;
  const forceReopenWhenNoOptions = !!options?.forceReopenWhenNoOptions;
  const expectedValue = String(options?.expectedValue || '').trim();
  const singleAttemptOnly = this._shouldLimitDropdownOpenSearch(action, targetEl, elementId, expectedValue);
  const panelRelevant = (panelCandidate) => this._isPanelRelevantForBoundDropdown(panelCandidate, targetEl, elementId, {
    expectedValue,
    maxDistance: 420
  });
  const panelReady = (panelCandidate) => {
    if (!panelCandidate) return false;
    if (!panelRelevant(panelCandidate)) return false;
    if (!forceReopenWhenNoOptions) return true;
    return this._boundPanelHasOptions(panelCandidate);
  };
  const dismissInterferingPanel = async (reason = 'unknown') => {
    try {
      const keyOpts = { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape', keyCode: 27 };
      document.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
      document.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
      try { targetEl?.dispatchEvent?.(new KeyboardEvent('keydown', keyOpts)); } catch (_) {}
      try { targetEl?.dispatchEvent?.(new KeyboardEvent('keyup', keyOpts)); } catch (_) {}
      await this.delay(45);
      this._logDropdownOpenDebug('dismiss-interfering-panel', { elementId, reason });
    } catch (_) {}
  };
  this._logDropdownOpenDebug('open-start', {
    elementId,
    target: this._describeDropdownDebugNode(targetEl),
    fieldLabel: action?.fieldLabel || null,
    forceReopenWhenNoOptions
  });
  let panel = this._findBoundDropdownPanel(elementId);
  if (!panel) panel = this._findNearbyOpenDropdownPanel(targetEl, elementId, { expectedValue, maxDistance: 420 });
  if (panel) {
    const hasOptions = this._boundPanelHasOptions(panel);
    const isRelevant = panelRelevant(panel);
    this._logDropdownOpenDebug('panel-detected', {
      elementId,
      panel: this._describeDropdownDebugNode(panel),
      hasOptions,
      isRelevant
    });
    if (!isRelevant) {
      this._logDropdownOpenDebug('panel-rejected-not-relevant', {
        elementId,
        panel: this._describeDropdownDebugNode(panel),
        hasOptions
      });
      panel = null;
      await dismissInterferingPanel('initial-panel-not-relevant');
    } else if (hasOptions || !forceReopenWhenNoOptions) {
      return panel;
    }
    this._logDropdownOpenDebug('panel-no-options-reopen', {
      elementId,
      panel: this._describeDropdownDebugNode(panel)
    });
  }

  const triggers = this._getBoundDropdownOpenTriggers(action, targetEl, elementId);
  this._logDropdownOpenDebug('triggers-collected', {
    elementId,
    count: triggers.length,
    triggers: triggers.map((el) => this._describeDropdownDebugNode(el))
  });
  if (singleAttemptOnly) {
    this._logDropdownOpenDebug('open-search-limited', {
      elementId,
      reason: 'non-dropdown-intent-after-click',
      target: this._describeDropdownDebugNode(targetEl),
      value: expectedValue || action?.value || null
    });
  }
  const tryOpenWithKeys = async (el) => {
    if (!el) return;
    try { el.focus?.(); } catch (_) {}
    const keyOpts = { bubbles: true, cancelable: true, view: window };
    const keys = [
      { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      { key: 'Enter', code: 'Enter', keyCode: 13 },
      { key: ' ', code: 'Space', keyCode: 32 }
    ];
    for (const k of keys) {
      try {
        el.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, ...k }));
        el.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, ...k }));
        await this.delay(35);
      } catch (_) {}
    }
  };
  const maxAttempts = singleAttemptOnly ? 1 : 3;
  const activeTriggers = singleAttemptOnly ? triggers.slice(0, 1) : triggers;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    this._logDropdownOpenDebug('open-attempt-begin', { elementId, attempt: attempt + 1 });
    for (const trigger of activeTriggers) {
      this._logDropdownOpenDebug('trigger-attempt', {
        elementId,
        attempt: attempt + 1,
        trigger: this._describeDropdownDebugNode(trigger)
      });
      try {
        if (typeof this._handleOpenDialogIfAny === 'function') {
          await this._handleOpenDialogIfAny(0);
        }
      } catch (_) {}
      try { trigger.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' }); } catch (_) {}
      try { trigger.focus?.(); } catch (_) {}
      this._dispatchClick(trigger);
      await this.delay(90 + attempt * 60);
      panel = this._findBoundDropdownPanel(elementId);
      if (!panel) panel = this._findNearbyOpenDropdownPanel(trigger || targetEl, elementId, { expectedValue, maxDistance: 420 });
      if (panel) {
        const hasOptions = this._boundPanelHasOptions(panel);
        const isRelevant = panelRelevant(panel);
        this._logDropdownOpenDebug('panel-found-after-dispatch-click', {
          elementId,
          attempt: attempt + 1,
          trigger: this._describeDropdownDebugNode(trigger),
          panel: this._describeDropdownDebugNode(panel),
          hasOptions,
          isRelevant
        });
        if (!isRelevant) {
          panel = null;
          await dismissInterferingPanel('after-dispatch-click-not-relevant');
          continue;
        }
        if (panelReady(panel)) return panel;
      }
      try { trigger.click?.(); } catch (_) {}
      await this.delay(70);
      panel = this._findBoundDropdownPanel(elementId);
      if (!panel) panel = this._findNearbyOpenDropdownPanel(trigger || targetEl, elementId, { expectedValue, maxDistance: 420 });
      if (panel) {
        const hasOptions = this._boundPanelHasOptions(panel);
        const isRelevant = panelRelevant(panel);
        this._logDropdownOpenDebug('panel-found-after-native-click', {
          elementId,
          attempt: attempt + 1,
          trigger: this._describeDropdownDebugNode(trigger),
          panel: this._describeDropdownDebugNode(panel),
          hasOptions,
          isRelevant
        });
        if (!isRelevant) {
          panel = null;
          await dismissInterferingPanel('after-native-click-not-relevant');
          continue;
        }
        if (panelReady(panel)) return panel;
      }
      await tryOpenWithKeys(trigger);
      await this.delay(80);
      panel = this._findBoundDropdownPanel(elementId);
      if (!panel) panel = this._findNearbyOpenDropdownPanel(trigger || targetEl, elementId, { expectedValue, maxDistance: 420 });
      if (panel) {
        const hasOptions = this._boundPanelHasOptions(panel);
        const isRelevant = panelRelevant(panel);
        this._logDropdownOpenDebug('panel-found-after-keys', {
          elementId,
          attempt: attempt + 1,
          trigger: this._describeDropdownDebugNode(trigger),
          panel: this._describeDropdownDebugNode(panel),
          hasOptions,
          isRelevant
        });
        if (!isRelevant) {
          panel = null;
          await dismissInterferingPanel('after-keys-not-relevant');
          continue;
        }
        if (panelReady(panel)) return panel;
      }
    }
    await this.delay(120 + attempt * 80);
    panel = this._findBoundDropdownPanel(elementId);
    if (!panel) panel = this._findNearbyOpenDropdownPanel(targetEl, elementId, { expectedValue, maxDistance: 420 });
    if (panel) {
      const hasOptions = this._boundPanelHasOptions(panel);
      const isRelevant = panelRelevant(panel);
      this._logDropdownOpenDebug('panel-found-after-attempt-delay', {
        elementId,
        attempt: attempt + 1,
        panel: this._describeDropdownDebugNode(panel),
        hasOptions,
        isRelevant
      });
      if (!isRelevant) {
        panel = null;
        await dismissInterferingPanel('after-attempt-delay-not-relevant');
        continue;
      }
      if (panelReady(panel)) return panel;
    }
  }
  if (singleAttemptOnly) {
    this._logDropdownOpenDebug('open-search-aborted', {
      elementId,
      reason: 'click-did-not-open-dropdown-and-action-is-not-dropdown'
    });
    return null;
  }
  const finalPanel = this._findNearbyOpenDropdownPanel(targetEl, elementId, { expectedValue, maxDistance: 420 });
  const finalHasOptions = finalPanel ? this._boundPanelHasOptions(finalPanel) : false;
  const finalIsRelevant = finalPanel ? panelRelevant(finalPanel) : false;
  this._logDropdownOpenDebug('open-finished', {
    elementId,
    success: !!finalPanel,
    panel: finalPanel ? this._describeDropdownDebugNode(finalPanel) : null,
    hasOptions: finalHasOptions,
    isRelevant: finalIsRelevant
  });
  if (finalPanel && (!finalIsRelevant || (forceReopenWhenNoOptions && !finalHasOptions))) return null;
  return finalPanel;
};

TestPlayer.prototype._tryStrongBindingAdaptiveFallback = async function(targetEl, targetValue, action = {}) {
  const val = String(targetValue || '').trim();
  if (!val) return { success: false };
  const container = targetEl?.closest?.('[class*="select"], [class*="dropdown"], [class*="combo"], [role="combobox"], [role="listbox"], [elementid]') ||
    targetEl?.parentElement ||
    targetEl;
  const confirmed = async () => this._isDropdownSelectionCommitted(container || targetEl, val);
  const elementId = this._getDropdownElementId(action, container || targetEl);

  // 1) Пытаемся открыть именно связанный dropdown и выбрать из уже раскрытой панели.
  await this._openBoundDropdownPanel(action, container || targetEl, elementId, {
    forceReopenWhenNoOptions: true,
    expectedValue: val
  });
  try {
    const boundPick = await this._selectFromBoundDropdownPanel(container || targetEl, val, action);
    if (boundPick?.success && await confirmed()) {
      return { success: true, method: boundPick.method || 'strong-bound-panel' };
    }
  } catch (_) {}
  // Для strong binding избегаем "широкого" global-поиска опций:
  // он может кликнуть соседний dropdown в overlay.
  try {
    const localScoped = await this._selectFromScopedNearbyPanel(container || targetEl, val);
    if (localScoped?.success && await confirmed()) {
      return { success: true, method: localScoped.method || 'strong-scoped-nearby' };
    }
  } catch (_) {}

  // 2) Для strong-binding не используем "широкие" fallback-методы,
  // чтобы не переключать соседние поля. Пробуем только локальное keyboard-open.
  const trigger = this.resolvePreferredDropdownTrigger?.(action, container || targetEl) || container || targetEl;
  try { trigger.focus?.(); } catch (_) {}
  try {
    const keyOpts = { bubbles: true, cancelable: true, view: window };
    trigger.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    trigger.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    await this.delay(70);
    trigger.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    trigger.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
  } catch (_) {}
  await this.delay(120);
  try {
    const afterKeysScoped = await this._selectFromScopedNearbyPanel(container || targetEl, val);
    if (afterKeysScoped?.success && await confirmed()) {
      return { success: true, method: afterKeysScoped.method || 'strong-keyboard-open-select' };
    }
  } catch (_) {}

  // 3) Локальный Angular API fallback только для строго привязанного app-select.
  // Не выходим за контекст целевого elementId, чтобы не переключить соседнее поле.
  const byElementId = (() => {
    const id = String(
      action?.element?.parentDropdown?.elementId ||
      container?.getAttribute?.('elementid') ||
      container?.getAttribute?.('ng-reflect-element-id') ||
      ''
    ).trim();
    if (!id) return null;
    const escaped = id.replace(/"/g, '\\"');
    return document.querySelector(`app-select[elementid="${escaped}"], app-select[ng-reflect-element-id="${escaped}"]`);
  })();
  const appSelect = byElementId || container?.closest?.('app-select') || null;
  if (appSelect && typeof this.trySelectViaAngularAPIs === 'function') {
    try {
      const selectBoxElement = appSelect.querySelector('.select-box, [class*="select-box"], .result, [class*="result"], .options, [class*="options"], [role="combobox"]') || container || targetEl;
      const angularRes = await this.trySelectViaAngularAPIs({
        appSelect,
        selectBoxElement,
        targetValue: val,
        controlName: this.getControlNameFromElement?.(appSelect, selectBoxElement) || undefined,
        reason: 'strong-binding-fallback'
      });
      if (angularRes?.success && await confirmed()) {
        return { success: true, method: angularRes.method || 'strong-angular-api' };
      }
    } catch (_) {}
  }

  return { success: false };
};

TestPlayer.prototype._selectFromBoundDropdownPanel = async function(targetEl, targetValue, action = {}) {
  const value = String(targetValue || '').trim();
  if (!value) return { success: false };
  const elementId = this._getDropdownElementId(action, targetEl);
  if (!elementId) return { success: false, reason: 'no elementid' };
  let panel = await this._openBoundDropdownPanel(action, targetEl, elementId, {
    forceReopenWhenNoOptions: true,
    expectedValue: value
  });
  if (!panel) panel = this._findNearbyOpenDropdownPanel(targetEl, elementId, { expectedValue: value, maxDistance: 420 });
  if (!panel) {
    this._logDropdownOpenDebug('select-bound-panel-missing', {
      elementId,
      value
    });
    return { success: false, reason: 'bound panel not found' };
  }

  const normalizeLoose = (v) => this.normalizeTextValue(String(v || '').replace(/[^\p{L}\p{N}\s]+/gu, ' '));
  const getCandidateText = (el) => {
    if (!el) return '';
    const parts = [
      el.textContent,
      el.innerText,
      el.getAttribute?.('title'),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('data-value'),
      el.getAttribute?.('value'),
      el.getAttribute?.('ng-reflect-app-tooltip'),
      el.getAttribute?.('ng-reflect-value'),
      el.getAttribute?.('ng-reflect-model')
    ].filter(Boolean);
    return String(parts.join(' ').replace(/\s+/g, ' ').trim());
  };
  const optionSelector = '.option, .option.cutted-text, .group-item, [role="option"], [data-value], [ng-reflect-app-tooltip], .mat-option, .ng-option, .result__item, .menu__item, [class*="menu__item"], li[role="option"], .ant-select-item-option';
  const isContainerLikeOptionText = (raw) => {
    const t = this.normalizeTextValue(raw || '');
    if (!t) return true;
    if (t.length > 140) return true;
    const words = t.split(/\s+/).filter(Boolean).length;
    return words > 20 && t.length > 70;
  };
  const isLikelyOptionNode = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const role = String(el.getAttribute?.('role') || '').toLowerCase();
    const cls = String(el.className || '').toLowerCase();
    if (role === 'option') return true;
    if (el.hasAttribute?.('data-value')) return true;
    if (/\b(option|mat-option|ng-option|group-item|result__item|result__content|ant-select-item-option|menu__item)\b/i.test(cls)) return true;
    return !!el.closest?.('[role="option"], .option, .mat-option, .ng-option, .group-item, .result__item, .result__content, .ant-select-item-option, .menu__item, [class*="menu__item"]');
  };
  const getVisibleOptions = () => Array.from(panel.querySelectorAll(optionSelector)).filter(el => {
    const txt = getCandidateText(el);
    if (!txt || isContainerLikeOptionText(txt) || !isLikelyOptionNode(el)) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  });
  let options = getVisibleOptions();
  if (!options.length) {
    // Иногда панель монтируется быстро, а опции дорисовываются чуть позже.
    // Даем короткое окно и принудительно переоткрываем только связанный dropdown.
    await this.delay(140);
    panel = await this._openBoundDropdownPanel(action, targetEl, elementId, {
      forceReopenWhenNoOptions: true,
      expectedValue: value
    });
    if (!panel) panel = this._findNearbyOpenDropdownPanel(targetEl, elementId, { expectedValue: value, maxDistance: 420 });
    options = panel ? getVisibleOptions() : [];
  }
  if (!options.length) {
    this._logDropdownOpenDebug('bound-panel-no-options', {
      elementId,
      panel: this._describeDropdownDebugNode(panel),
      value
    });
    return { success: false, reason: 'no options in bound panel' };
  }

  const expected = this.normalizeTextValue(value);
  const expectedLoose = normalizeLoose(value);
  const expectedTokens = expectedLoose.split(/\s+/).filter(token => token.length >= 4);
  const score = (el) => {
    const raw = getCandidateText(el);
    const txt = this.normalizeTextValue(raw);
    const txtLoose = normalizeLoose(raw);
    if (!txt) return 0;
    if (txt === expected) return 100;
    if (txt.startsWith(expected) && txt.length <= expected.length + 24) return 80;
    if (txt.includes(expected)) return 60;
    if (txtLoose && expectedLoose && txtLoose === expectedLoose) return 90;
    if (txtLoose && expectedLoose && txtLoose.includes(expectedLoose)) return 55;
    if (expectedTokens.length > 0 && txtLoose) {
      const matches = expectedTokens.filter(token => txtLoose.includes(token)).length;
      if (matches === expectedTokens.length) return 52;
      if (matches >= Math.min(2, expectedTokens.length)) return 35;
    }
    return 0;
  };
  options.sort((a, b) => score(b) - score(a));
  const best = options[0];
  if (best && score(best) <= 0) {
    const affinityPanel = this._findPanelByValueAffinity(targetEl, value, elementId);
    if (affinityPanel && affinityPanel !== panel) {
      panel = affinityPanel;
      options = getVisibleOptions();
      options.sort((a, b) => score(b) - score(a));
    }
  }
  if (!best || score(best) <= 0) {
    const searchInput = panel.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]');
    if (searchInput) {
      try {
        if (searchInput.isContentEditable) {
          searchInput.textContent = value;
        } else {
          searchInput.value = value;
        }
        const evOpts = { bubbles: true, cancelable: true };
        searchInput.dispatchEvent(new Event('input', evOpts));
        searchInput.dispatchEvent(new Event('change', evOpts));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
        await this.delay(180);
        options = getVisibleOptions();
        options.sort((a, b) => score(b) - score(a));
      } catch (_) {}
    }
  }
  if (!options.length || score(options[0]) <= 0) {
    const affinityPanel = this._findPanelByValueAffinity(targetEl, value, elementId);
    if (affinityPanel && affinityPanel !== panel) {
      panel = affinityPanel;
      options = getVisibleOptions();
      options.sort((a, b) => score(b) - score(a));
    }
  }
  if (!options.length || score(options[0]) <= 0) {
    try {
      // Локальный поиск по тексту в рамках bound-panel (для виртуализированных/нестандартных опций).
      const escapedValue = value.replace(/"/g, '\\"').toLowerCase();
      const escapedValueLoose = normalizeLoose(value).replace(/"/g, '\\"').toLowerCase();
      const xpath = `.//*[self::*[@role="option"] or contains(@class,"option") or contains(@class,"item") or contains(@class,"result")][contains(translate(normalize-space(string(.)),"ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ","abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя"),"${escapedValue}") or contains(translate(@title,"ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ","abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя"),"${escapedValue}") or contains(translate(@ng-reflect-app-tooltip,"ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ","abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя"),"${escapedValue}") or contains(translate(normalize-space(string(.)),"ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ","abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя"),"${escapedValueLoose}")]`;
      const snapshot = document.evaluate(xpath, panel, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < snapshot.snapshotLength; i++) {
        const el = snapshot.snapshotItem(i);
        if (el && el instanceof Element) options.push(el);
      }
      options = options.filter((el, idx) => options.indexOf(el) === idx);
      options.sort((a, b) => score(b) - score(a));
    } catch (_) {}
  }
  if ((!options.length || score(options[0]) <= 0) && expectedTokens.length > 0) {
    try {
      const byTokens = Array.from(panel.querySelectorAll('*')).filter(el => {
        if (!(el instanceof Element)) return false;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        const txtLoose = normalizeLoose(getCandidateText(el));
        if (!txtLoose) return false;
        const matched = expectedTokens.filter(token => txtLoose.includes(token)).length;
        return matched >= Math.min(2, expectedTokens.length);
      });
      options = byTokens
        .filter((el, idx) => byTokens.indexOf(el) === idx)
        .filter(el => isLikelyOptionNode(el) && !isContainerLikeOptionText(getCandidateText(el)));
      options.sort((a, b) => score(b) - score(a));
    } catch (_) {}
  }
  const bestAfterSearch = options[0];
  if (!bestAfterSearch || score(bestAfterSearch) <= 0) {
    let optionSamples = [];
    try {
      optionSamples = Array.from(panel.querySelectorAll('*'))
        .map(el => getCandidateText(el))
        .filter(Boolean)
        .filter((txt, idx, arr) => arr.indexOf(txt) === idx)
        .slice(0, 8);
    } catch (_) {}
    this._logDropdownOpenDebug('bound-panel-option-not-found', {
      elementId,
      value,
      optionsScanned: options.length,
      panel: this._describeDropdownDebugNode(panel),
      optionSamples
    });
    return { success: false, reason: 'option not found in bound panel' };
  }

  const clickTarget = bestAfterSearch.closest?.('[role="option"], .mat-option, .ng-option, .menu__item, [class*="menu__item"]') || bestAfterSearch;
  try { clickTarget.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' }); } catch (_) {}
  await this.delay(20);
  let effectiveTarget = clickTarget;
  try {
    const r = clickTarget.getBoundingClientRect();
    const x = Math.max(1, Math.min(window.innerWidth - 1, Math.floor(r.left + r.width / 2)));
    const y = Math.max(1, Math.min(window.innerHeight - 1, Math.floor(r.top + Math.min(r.height / 2, 16))));
    const top = document.elementFromPoint(x, y);
    if (top && !(top === clickTarget || clickTarget.contains(top) || top.contains(clickTarget))) {
      const candidate = top.closest?.('[role="option"], .mat-option, .ng-option, .option, .group-item, .result__item, .result__content, .menu__item, [class*="menu__item"]');
      if (candidate) effectiveTarget = candidate;
    }
  } catch (_) {}
  effectiveTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
  effectiveTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
  effectiveTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
  await this.delay(120);
  const committed = await this._isDropdownSelectionCommitted(targetEl, value);
  if (committed) return { success: true, method: 'bound-panel' };
  const selectedFlag = effectiveTarget?.getAttribute?.('aria-selected') === 'true' ||
    /\b(selected|active|current|chosen)\b/i.test(String(effectiveTarget?.className || ''));
  if (selectedFlag) {
    await this.delay(120);
    if (await this._isDropdownSelectionCommitted(targetEl, value)) {
      return { success: true, method: 'bound-panel-delayed-commit' };
    }
  }
  // Последняя локальная попытка без смены контекста: keyboard select в рамках открытого bound panel.
  try {
    const active = document.activeElement && panel.contains(document.activeElement) ? document.activeElement : panel;
    const keyOpts = { bubbles: true, cancelable: true, view: window };
    active.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    active.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    await this.delay(60);
    active.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    active.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    await this.delay(140);
    if (await this._isDropdownSelectionCommitted(targetEl, value)) {
      return { success: true, method: 'bound-panel-keyboard-select' };
    }
  } catch (_) {}
  return { success: false, reason: 'not committed' };
};

TestPlayer.prototype._selectFromScopedNearbyPanel = async function(targetEl, targetValue) {
  const value = String(targetValue || '').trim();
  if (!value || !targetEl) return { success: false };
  const trigger = targetEl;
  const triggerRect = trigger.getBoundingClientRect?.();
  if (!triggerRect) return { success: false };
  const targetNorm = this.normalizeTextValue(value);
  const panelSelectors = [
    '.cdk-overlay-pane',
    '[role="listbox"]',
    '[id*="__result"]',
    '.ng-dropdown-panel',
    '.mat-select-panel',
    '.menu',
    '[class*="menu"]',
    '[class*="content-list"]',
    '[class*="dropdown-panel"]',
    '[class*="select-group"]'
  ].join(',');
  const optionSelector = '.option, .option.cutted-text, .group-item, [role="option"], [data-value], .mat-option, .ng-option, .result__item, .result__content, .menu__item, [class*="menu__item"], .ant-select-item-option';
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const panelDistance = (panel) => {
    const r = panel.getBoundingClientRect();
    const cx1 = triggerRect.left + triggerRect.width / 2;
    const cy1 = triggerRect.top + triggerRect.height / 2;
    const cx2 = r.left + r.width / 2;
    const cy2 = r.top + r.height / 2;
    return Math.hypot(cx1 - cx2, cy1 - cy2);
  };
  let panels = Array.from(document.querySelectorAll(panelSelectors))
    .filter(p => isVisible(p) && !trigger.contains?.(p) && !p.contains?.(trigger));
  panels.sort((a, b) => panelDistance(a) - panelDistance(b));
  panels = panels.slice(0, 3);
  for (const panel of panels) {
    const options = Array.from(panel.querySelectorAll(optionSelector)).filter(isVisible);
    if (!options.length) continue;
    let best = null;
    let bestScore = 0;
    for (const opt of options) {
      const txt = this.normalizeTextValue((opt.textContent || '').trim());
      if (!txt) continue;
      let score = 0;
      if (txt === targetNorm) score = 100;
      else if (txt.startsWith(targetNorm)) score = 80;
      else if (txt.includes(targetNorm)) score = 60;
      else if (targetNorm.includes(txt)) score = 40;
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    if (!best || bestScore <= 0) continue;
    const clickTarget = best.closest?.('[role="option"], .mat-option, .ng-option, .menu__item, [class*="menu__item"], .ant-select-item-option') || best;
    try { clickTarget.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' }); } catch (_) {}
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
    await this.delay(120);
    if (await this._isDropdownSelectionCommitted(targetEl, value)) {
      return { success: true, method: 'scoped-nearby-panel' };
    }
  }
  return { success: false };
};

TestPlayer.prototype._isLikelyCompositeRecordedDropdownValue = function(targetEl, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value || value.length < 20) return false;
  const normalized = this.normalizeTextValue(value);
  if (!normalized) return false;

  const optionSelector = '.option, .option.cutted-text, .group-item, [role="option"], [data-value], .mat-option, .ng-option, .result__item, .menu__item, [class*="menu__item"], .ant-select-item-option, li[role="option"]';
  const panelSelector = '.cdk-overlay-pane, [role="listbox"], [id*="__result"], .ng-dropdown-panel, .mat-select-panel, .menu, [class*="menu"], [class*="content-list"], [class*="dropdown-panel"]';
  const options = new Set();

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  try {
    const rootRect = targetEl?.getBoundingClientRect?.();
    const panels = Array.from(document.querySelectorAll(panelSelector)).filter(isVisible);
    for (const panel of panels) {
      if (rootRect) {
        const pr = panel.getBoundingClientRect();
        const distance = Math.hypot(
          (rootRect.left + rootRect.width / 2) - (pr.left + pr.width / 2),
          (rootRect.top + rootRect.height / 2) - (pr.top + pr.height / 2)
        );
        if (distance > 700) continue;
      }
      for (const opt of panel.querySelectorAll(optionSelector)) {
        if (!isVisible(opt)) continue;
        const txt = this.normalizeTextValue((opt.textContent || opt.innerText || '').trim());
        if (txt && txt.length <= 40) options.add(txt);
      }
    }
  } catch (_) {}

  let matchCount = 0;
  for (const opt of options) {
    if (opt && normalized.includes(opt)) matchCount++;
    if (matchCount >= 2) return true;
  }
  return /плановый\s+по поручению\s+инициативный/i.test(value);
};

TestPlayer.prototype._isDropdownSelectionCommitted = async function(targetEl, expectedValue, options = {}) {
  const expected = this.normalizeTextValue(String(expectedValue || '').trim());
  const strict = options?.strict === true;
  const normalizeCompact = (value) => this.normalizeTextValue(String(value || '').replace(/[^\p{L}\p{N}\s()]+/gu, ' '));
  const expectedCompact = normalizeCompact(expectedValue);
  const root = targetEl?.closest?.('app-select, app-autocomplete, [elementid], [ng-reflect-element-id], [role="combobox"], [class*="select"], [class*="dropdown"], [class*="combo"], [class*="autocomplete"], [class*="suggest"]') || targetEl;
  const isAutocompleteContext = !!(
    root?.closest?.('app-autocomplete, [class*="autocomplete"], [class*="suggest"]') ||
    (String(root?.tagName || '').toLowerCase() === 'app-autocomplete') ||
    /autocomplete|suggest/i.test(String(root?.className || ''))
  );
  const matchesExpected = (value) => {
    const current = this.normalizeTextValue(String(value || ''));
    if (!current || !expected) return false;
    if (current === expected || normalizeCompact(value) === expectedCompact) return true;
    // Для autocomplete контролов значение часто расширяется суффиксом:
    // "ФИО — Организация". Это валидный commit даже при strict режиме.
    if (strict && isAutocompleteContext && (current.includes(expected) || expected.includes(current))) return true;
    if (!strict && (current.includes(expected) || expected.includes(current))) return true;
    return false;
  };
  if (!expected) return false;
  try {
    if (typeof this.checkIfValueSelected === 'function' && await this.checkIfValueSelected(root, expectedValue, { strict })) {
      return true;
    }
  } catch (_) {}
  try {
    const current = this.getSelectedDropdownValue(root) || '';
    if (matchesExpected(current)) {
      return true;
    }
  } catch (_) {}
  try {
    const host = root?.closest?.('app-select') || root;
    const reflect = this.normalizeTextValue(
      host?.getAttribute?.('ng-reflect-model') ||
      host?.getAttribute?.('ng-reflect-value') ||
      host?.getAttribute?.('ng-reflect-selected-value') ||
      ''
    );
    if (matchesExpected(reflect)) {
      return true;
    }
  } catch (_) {}
  return false;
};

TestPlayer.prototype.selectDropdownAdaptiveValue = async function(targetEl, targetValue, action = {}) {
  const val = String(targetValue || '').trim();
  if (!val) return { success: false, reason: 'empty target value' };
  const nativeSelect = this.findNativeSelectElement(targetEl);
  if (nativeSelect) {
    const nativeResult = await this.selectNativeOption(nativeSelect, val);
    return nativeResult?.success ? nativeResult : { success: false, reason: nativeResult?.reason || 'native select failed' };
  }
  const container = targetEl?.closest?.('[class*="select"], [class*="dropdown"], [class*="combo"], [role="combobox"], [role="listbox"], [elementid]') ||
    targetEl?.parentElement ||
    targetEl;
  const hasStrongBinding = !!this._getDropdownElementId(action, container || targetEl);
  const strictCommitCheck = hasStrongBinding || action?.strictSelectionCheck === true;
  const confirmed = async () => this._isDropdownSelectionCommitted(container || targetEl, val, { strict: strictCommitCheck });

  // Быстрый выход: если значение уже зафиксировано в контроле, шаг сразу успешен.
  // Это убирает лишние повторные открытия dropdown после явного подтверждения выбора.
  try {
    if (await confirmed()) {
      this._logDropdownOpenDebug('already-selected-skip', {
        elementId: this._getDropdownElementId(action, container || targetEl) || null,
        value: val,
        strict: strictCommitCheck
      });
      return { success: true, method: 'already-selected' };
    }
  } catch (_) {}

  // При цепочке "шаг 1: открыть dropdown" -> "шаг 2: выбрать значение"
  // приоритетно выбираем из уже раскрытой панели и не трогаем trigger повторно.
  if (!hasStrongBinding && action?.inputAfterClick === true && typeof this.trySelectOptionInRevealedPanels === 'function') {
    try {
      const fromOpened = await this.trySelectOptionInRevealedPanels(val, container || targetEl);
      if (fromOpened?.success) {
        await this.delay(80);
        if (await confirmed()) return { success: true, method: 'opened-panel-inputAfterClick' };
      }
    } catch (_) {}
  }

  // Универсальная попытка: если панель уже раскрыта, выбираем из неё (без повторного открытия чужих dropdown).
  if (!hasStrongBinding && typeof this.trySelectOptionInRevealedPanels === 'function') {
    try {
      const directAny = await this.trySelectOptionInRevealedPanels(val, container || targetEl);
      if (directAny?.success) {
        await this.delay(80);
        if (await confirmed()) return { success: true, method: 'revealed-panels-any' };
      }
    } catch (_) {}
  }

  // Быстрый путь: сначала открываем dropdown и выбираем в уже раскрытой панели.
  // Это минимизирует "несколько попыток" и быстрее всего повторяет пользовательское поведение.
  try {
    const trigger = this.resolvePreferredDropdownTrigger?.(action, container || targetEl) || container || targetEl;
    // Для strongly-bound dropdown сначала работаем только через связанный panel,
    // чтобы не кликнуть опции из другого поля.
    if (hasStrongBinding) {
      const boundFirst = await this._selectFromBoundDropdownPanel(container || targetEl, val, action);
      if (boundFirst?.success && await confirmed()) return { success: true, method: boundFirst.method || 'bound-panel' };
      const scopedFirst = await this._selectFromScopedNearbyPanel(container || targetEl, val);
      if (scopedFirst?.success && await confirmed()) return { success: true, method: scopedFirst.method || 'scoped-nearby-panel' };
      // Если панель не была открыта/смонтирована, пробуем открыть именно связанный dropdown.
      await this._openBoundDropdownPanel(action, container || targetEl, this._getDropdownElementId(action, container || targetEl), {
        forceReopenWhenNoOptions: true,
        expectedValue: val
      });
      if (typeof this.trySelectOptionInRevealedPanels === 'function') {
        const afterOpen = await this.trySelectOptionInRevealedPanels(val, container || targetEl);
        if (afterOpen?.success) {
          await this.delay(80);
          if (await confirmed()) return { success: true, method: 'revealed-after-open-strong' };
        }
      }
    } else {
      this._dispatchClick(trigger);
      await this.delay(120);
      if (typeof this.trySelectOptionInRevealedPanels === 'function') {
        const direct = await this.trySelectOptionInRevealedPanels(val, trigger);
        if (direct?.success) {
          await this.delay(80);
          if (await confirmed()) return { success: true, method: 'revealed-panels' };
        }
      }
      const bound = await this._selectFromBoundDropdownPanel(container || targetEl, val, action);
      if (bound?.success && await confirmed()) return { success: true, method: bound.method || 'bound-panel' };
    }
  } catch (e) {
    // Продолжаем по fallback-pipeline ниже.
  }

  const containerSelector = this._buildDropdownContainerSelector(action, container || targetEl);
  if (containerSelector && typeof this.handleAnalysis === 'function') {
    try {
      const analysisRes = await this.handleAnalysis({
        type: 'analysis',
        subtype: 'fill-single-dropdown',
        containerSelector,
        targetValue: val
      });
      if (analysisRes?.success && analysisRes?.data?.success !== false) {
        await this.delay(120);
        if (await confirmed()) return { success: true, method: 'fill-single-dropdown' };
      }
    } catch (e) {
      console.warn('⚠️ [DropdownAdaptive] fill-single-dropdown failed:', e?.message || e);
    }
  }

  try {
    // Для strongly-bound dropdown запрещаем широкие fallback'и, которые могут кликать чужие поля.
    // Используем только безопасный контейнерный анализ.
    let res = await this.fillDropdownViaAnalysis(container, val);
    if (res?.success && await confirmed()) return { success: true, method: res.method || 'fillDropdownViaAnalysis' };
    if (!hasStrongBinding) {
      res = await this.autoSelectDropdownValue(container || targetEl, val);
      if (res?.success && await confirmed()) return { success: true, method: res.method || 'autoSelectDropdownValue' };
      res = await this.selectDropdownValueViaFillFieldsStyle(container, val);
      if (res?.success && await confirmed()) return { success: true, method: res.method || 'fillFieldsStyle' };
      res = await this.selectDropdownUniversal(container || targetEl, val);
      if (res?.success && await confirmed()) return { success: true, method: res.method || 'selectDropdownUniversal' };
    } else {
      res = await this._selectFromScopedNearbyPanel(container || targetEl, val);
      if (res?.success && await confirmed()) return { success: true, method: res.method || 'scoped-nearby-panel' };
      res = await this._tryStrongBindingAdaptiveFallback(container || targetEl, val, action);
      if (res?.success && await confirmed()) return { success: true, method: res.method || 'strong-adaptive-fallback' };
      console.warn('⚠️ [DropdownAdaptive] Strong binding: controlled adaptive fallback exhausted');
    }
  } catch (e) {
    console.warn('⚠️ [DropdownAdaptive] fallback pipeline failed:', e?.message || e);
  }

  return { success: await confirmed(), reason: 'selection not confirmed' };
};

TestPlayer.prototype._isLikelyStaleRepeatedDropdownInputStep = async function(action, targetEl, requestedValue) {
  try {
    const val = String(requestedValue || '').trim();
    if (!val) return false;
    if (String(action?.fieldLabel || '').trim()) return false;
    const actions = Array.isArray(this.currentTest?.actions) ? this.currentTest.actions : null;
    const currentIdx = Number(this.currentActionIndex);
    if (!actions || !Number.isFinite(currentIdx) || currentIdx < 2) return false;
    const current = actions[currentIdx];
    if (!current || current !== action) return false;
    const prev = actions[currentIdx - 1];
    const prevPrev = actions[currentIdx - 2];
    if (!prev || !prevPrev) return false;
    if (prev.type !== 'click' || prevPrev.type !== 'input') return false;

    const curSel = this.formatSelector(action.selector);
    const prevSel = this.formatSelector(prev.selector);
    const prevPrevSel = this.formatSelector(prevPrev.selector);
    if (!curSel || curSel !== prevSel || curSel !== prevPrevSel) return false;

    const prevPrevValue = String(prevPrev.optionText || prevPrev.value || '').trim();
    if (!prevPrevValue || this.normalizeTextValue(prevPrevValue) === this.normalizeTextValue(val)) return false;
    if (typeof this._isDropdownSelectionCommitted !== 'function') return false;

    const alreadyCommitted = await this._isDropdownSelectionCommitted(targetEl, prevPrevValue, { strict: true });
    if (!alreadyCommitted) return false;

    this._logDropdownOpenDebug('stale-repeated-dropdown-input-skip', {
      currentIndex: currentIdx,
      selector: curSel,
      requestedValue: val,
      committedValue: prevPrevValue
    });
    return true;
  } catch (_) {
    return false;
  }
};

TestPlayer.prototype.handleDropdownAction = async function(action, element) {
  const subtype = action.subtype || '';
  if (!subtype.startsWith('dropdown-')) return;

  // Разрешаем элемент dropdown (по fieldLabel, preferred trigger)
  let targetEl = element;
  if (this.isDropdownElement(element)) {
    const refined = this.resolveDropdownElementByFieldLabel(action, element);
    if (refined && refined !== element) targetEl = refined;
    const preferred = this.resolvePreferredDropdownTrigger(action, targetEl);
    if (preferred && preferred !== targetEl) targetEl = preferred;
  }

  const nativeSelect = this.findNativeSelectElement(targetEl);
  const values = (v) => (Array.isArray(v) ? v : (v ? String(v).split('\n').map(s => s.trim()).filter(Boolean) : []));
  const getValue = () => (action.value || action.optionText || '').trim();
  const getSearchText = () => (action.searchText || action.optionText || action.value || '').trim();
  const getOptionValues = () => values(action.optionValues || action.expectedValues);

  switch (subtype) {
    case 'dropdown-select': {
      const val = await this.processVariables(getValue());
      if (!val) throw new Error('Для dropdown-select не указано значение (value/optionText)');
      if (await this._isLikelyStaleRepeatedDropdownInputStep(action, targetEl, val)) {
        console.warn(`⚠️ [DropdownAdaptive] Пропускаю шумовой повторный шаг dropdown-select: "${val}"`);
        break;
      }
      if (nativeSelect) {
        const res = await this.selectNativeOption(nativeSelect, val);
        if (!res.success) throw new Error(`Не удалось выбрать опцию "${val}"`);
      } else {
        const res = await this.selectDropdownAdaptiveValue(targetEl, val, action);
        if (!res?.success) throw new Error(`Не удалось выбрать опцию "${val}" в dropdown`);
      }
      console.log(`✅ dropdown-select: выбрано "${val}"`);
      break;
    }

    case 'dropdown-multiselect': {
      const opts = getOptionValues().map(v => this.processVariables(v));
      const resolved = await Promise.all(opts);
      if (resolved.length === 0) throw new Error('Для dropdown-multiselect не указаны опции (optionValues/expectedValues)');
      if (nativeSelect) {
        if (!nativeSelect.multiple) throw new Error('dropdown-multiselect требует multiple select');
        for (const v of resolved) {
          const res = await this.selectNativeOption(nativeSelect, v);
          if (!res.success) console.warn(`⚠️ Не удалось выбрать опцию "${v}"`);
        }
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        this._dispatchClick(targetEl);
        await this.delay(200);
        const container = targetEl.closest('[class*="select"], [class*="dropdown"], [class*="combo"]') || 
                         targetEl.closest('[role="combobox"], [role="listbox"]') ||
                         targetEl.parentElement;
        for (const v of resolved) {
          let res = await this.autoSelectDropdownValue(targetEl, v);
          if (!res?.success && container) {
            res = await this.selectDropdownValueViaFillFieldsStyle(container, v);
            if (!res?.success) res = await this.fillDropdownViaAnalysis(container, v);
          }
          if (!res?.success) {
            console.log(`🔄 [Multiselect] Fallback: универсальный поиск для "${v}"`);
            res = await this.selectDropdownUniversal(targetEl, v);
          }
          if (!res?.success) console.warn(`⚠️ Не удалось выбрать опцию "${v}"`);
          await this.delay(100);
        }
      }
      console.log(`✅ dropdown-multiselect: выбрано ${resolved.length} опций`);
      break;
    }

    case 'dropdown-deselect': {
      const val = await this.processVariables(getValue());
      if (!val) throw new Error('Для dropdown-deselect не указана опция (optionText)');
      if (nativeSelect) {
        const options = Array.from(nativeSelect.options || []);
        const opt = options.find(o => this.getNativeOptionCandidates(o).some(c => c.includes(this.normalizeTextValue(val)) || this.normalizeTextValue(val).includes(c)));
        if (opt) {
          opt.selected = false;
          nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        this._dispatchClick(targetEl);
        await this.delay(200);
        const container = targetEl.closest('[class*="select"], [class*="dropdown"], [class*="combo"]') || 
                         targetEl.closest('[role="combobox"], [role="listbox"]');
        
        // Универсальный поиск панели с опциями
        const panel = container && (
          document.querySelector(`[id*="__result"]`) ||
          document.querySelector('[role="listbox"]') ||
          document.querySelector('[class*="dropdown-menu"]') ||
          document.querySelector('[class*="options-panel"]')
        );
        
        const match = panel && Array.from(panel.querySelectorAll('.option, [role="option"], [class*="item"]') || []).find(o =>
          (o.textContent || '').toLowerCase().includes(val.toLowerCase())
        );
        if (match) match.click();
      }
      console.log(`✅ dropdown-deselect: снята опция "${val}"`);
      break;
    }

    case 'dropdown-select-all': {
      if (nativeSelect) {
        if (!nativeSelect.multiple) throw new Error('dropdown-select-all требует multiple select');
        for (const opt of nativeSelect.options || []) opt.selected = true;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        this._dispatchClick(targetEl);
        await this.delay(200);
        const panel = document.querySelector('[role="listbox"], [class*="options"], [id*="__result"]');
        const selectAllBtn = panel?.querySelector('[data-action="select-all"], .select-all, [aria-label*="all"]');
        if (selectAllBtn) selectAllBtn.click();
        else console.warn('⚠️ Кнопка "Выбрать все" не найдена в кастомном dropdown');
      }
      console.log('✅ dropdown-select-all');
      break;
    }

    case 'dropdown-clear-all': {
      if (nativeSelect) {
        for (const opt of nativeSelect.options || []) opt.selected = false;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        this._dispatchClick(targetEl);
        await this.delay(200);
        const panel = document.querySelector('[role="listbox"], [class*="options"], [id*="__result"]');
        const clearBtn = panel?.querySelector('[data-action="clear"], .clear-all, [aria-label*="clear"]');
        if (clearBtn) clearBtn.click();
        else {
          const opts = panel?.querySelectorAll('.option[class*="selected"], [role="option"][aria-selected="true"]') || [];
          opts.forEach(o => o.click());
        }
      }
      console.log('✅ dropdown-clear-all');
      break;
    }

    case 'dropdown-toggle-all': {
      if (nativeSelect && nativeSelect.multiple) {
        const opts = Array.from(nativeSelect.options || []);
        const allSelected = opts.every(o => o.selected);
        for (const o of opts) o.selected = !allSelected;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.warn('⚠️ dropdown-toggle-all поддерживается только для native multiple select');
      }
      console.log('✅ dropdown-toggle-all');
      break;
    }

    case 'dropdown-copy': {
      let text = '';
      if (nativeSelect) {
        text = Array.from(nativeSelect.selectedOptions || []).map(o => o.textContent?.trim() || o.value).filter(Boolean).join('\n');
      } else {
        text = this.getSelectedDropdownValue(targetEl) || '';
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        console.log(`✅ dropdown-copy: скопировано в буфер`);
      } else {
        console.warn('⚠️ Clipboard API недоступна');
      }
      break;
    }

    case 'dropdown-paste': {
      let pasted = '';
      if (navigator.clipboard?.readText) {
        pasted = await navigator.clipboard.readText();
      }
      if (!pasted) throw new Error('Буфер обмена пуст или Clipboard API недоступна');
      const lines = pasted.split('\n').map(s => s.trim()).filter(Boolean);
      if (nativeSelect && nativeSelect.multiple) {
        for (const v of lines) {
          const res = await this.selectNativeOption(nativeSelect, v);
          if (!res.success) console.warn(`⚠️ Не удалось выбрать "${v}"`);
        }
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        this._dispatchClick(targetEl);
        await this.delay(200);
        const container = targetEl.closest('[class*="select"], [class*="dropdown"], [class*="combo"]') || 
                         targetEl.closest('[role="combobox"], [role="listbox"]') ||
                         targetEl.parentElement;
        for (const v of lines) {
          let res = await this.autoSelectDropdownValue(targetEl, v);
          if (!res?.success && container) {
            res = await this.selectDropdownValueViaFillFieldsStyle(container, v);
            if (!res?.success) res = await this.fillDropdownViaAnalysis(container, v);
          }
          if (!res?.success) console.warn(`⚠️ Не удалось выбрать "${v}"`);
          await this.delay(100);
        }
      }
      console.log(`✅ dropdown-paste: вставлено ${lines.length} значений`);
      break;
    }

    case 'dropdown-reorder': {
      const fromIdx = action.fromIndex ?? action.from;
      const toIdx = action.toIndex ?? action.to;
      if (nativeSelect && typeof fromIdx === 'number' && typeof toIdx === 'number') {
        const opts = Array.from(nativeSelect.options || []);
        if (fromIdx >= 0 && fromIdx < opts.length && toIdx >= 0 && toIdx < opts.length) {
          const item = opts[fromIdx];
          const parent = item.parentNode;
          parent.insertBefore(item, opts[toIdx]);
          nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`✅ dropdown-reorder: ${fromIdx} -> ${toIdx}`);
        } else {
          console.warn('⚠️ dropdown-reorder: неверные fromIndex/toIndex');
        }
      } else {
        console.warn('⚠️ dropdown-reorder: требуется native select и fromIndex, toIndex');
      }
      break;
    }

    default:
      console.warn(`⚠️ Неизвестный dropdown subtype: ${subtype}`);
  }

  await this.delay(100);
}

/**
 * Обработка dropdown-datalist и dropdown-combobox: ввод текста в input и выбор из списка.
 */
TestPlayer.prototype.handleDropdownDatalistCombobox = async function(inputElement, searchText, subtype, actionContext) {
  if (!inputElement) {
    throw new Error('dropdown-datalist/combobox: элемент не найден');
  }
  const expectedText = String(searchText || '').trim();
  const strictRecordedDropdown = !!(
    actionContext &&
    (actionContext.isDropdownSelection === true || actionContext.dropdownAutoFilled === true || actionContext.inputAfterClick === true)
  );
  // Safety: implicit "pick first option" fallback can introduce values
  // absent in the recorded test. Keep it disabled unless explicitly allowed.
  const allowFirstOptionFallback = !!(actionContext && actionContext.allowFirstOptionFallback === true);
  if (!expectedText) {
    throw new Error('Пустое значение для выбора в dropdown');
  }
  const dropdownRootByContext = this.resolveDropdownElementByFieldLabel
    ? this.resolveDropdownElementByFieldLabel(actionContext || {}, inputElement)
    : null;
  const dropdownRoot = dropdownRootByContext ||
    inputElement.closest('app-select, ng-select, mat-select, [elementid], [role="combobox"], [class*="select"], [class*="dropdown"], [class*="combo"]') ||
    inputElement.parentElement ||
    inputElement;
  const isSelectionCommitted = async () => {
    if (!expectedText) return false;
    const normalize = (v) => this.normalizeTextValue ? this.normalizeTextValue(v) : String(v || '').trim().toLowerCase();
    const expectedNorm = normalize(expectedText);
    let commitTargetNorm = expectedNorm;
    const hintSources = [
      actionContext?.optionText,
      actionContext?.displayValue,
      actionContext?.selectedOptionText,
      actionContext?.searchText
    ];
    for (const src of hintSources) {
      const hn = normalize(String(src || ''));
      if (hn.length > commitTargetNorm.length && hn.includes(commitTargetNorm)) commitTargetNorm = hn;
    }
    try {
      if (this.checkIfValueSelected) {
        const ok = await this.checkIfValueSelected(dropdownRoot, expectedText);
        if (ok) return true;
      }
    } catch (_) {}
    let displayNorm = '';
    try {
      const ant = inputElement.closest?.('.ant-select');
      const item = ant?.querySelector?.('.ant-select-selection-item');
      displayNorm = normalize((item?.textContent || '').trim());
    } catch (_) {}
    if (displayNorm && commitTargetNorm) {
      if (displayNorm.includes(commitTargetNorm) || commitTargetNorm.includes(displayNorm)) return true;
    }
    const currentInputValue = normalize(inputElement.value || '');
    if (!commitTargetNorm) return false;
    if (currentInputValue === commitTargetNorm) return true;
    if (currentInputValue.includes(commitTargetNorm)) {
      const parts = commitTargetNorm.split(/\s+/).filter((p) => p.length > 1);
      if (parts.length >= 2) return parts.every((p) => currentInputValue.includes(p));
    }
    return false;
  };
  const runRobustFallback = async () => {
    if (typeof this.selectDropdownAdaptiveValue === 'function') {
      const adaptiveRes = await this.selectDropdownAdaptiveValue(dropdownRoot, expectedText, actionContext || {});
      if (adaptiveRes?.success) return true;
    }
    try {
      let res = await this.autoSelectDropdownValue(dropdownRoot, expectedText);
      if (res?.success) return true;
      if (this.fillDropdownViaAnalysis) {
        res = await this.fillDropdownViaAnalysis(dropdownRoot, expectedText);
        if (res?.success) return true;
      }
      if (this.selectDropdownValueViaFillFieldsStyle) {
        res = await this.selectDropdownValueViaFillFieldsStyle(dropdownRoot, expectedText);
        if (res?.success) return true;
      }
      if (this.selectDropdownUniversal) {
        res = await this.selectDropdownUniversal(dropdownRoot, expectedText);
        if (res?.success) return true;
      }
    } catch (e) {
      console.warn('⚠️ [DropdownCombobox] robust fallback:', e?.message || e);
    }
    return await isSelectionCommitted();
  };
  const buildDropdownContainerSelector = (el) => {
    if (!el || !(el instanceof Element)) return '';
    const root = this.resolveToDropdownRoot ? (this.resolveToDropdownRoot(el) || el) : el;
    const elementId = root.getAttribute?.('elementid') || root.getAttribute?.('ng-reflect-element-id') || '';
    if (elementId) {
      return `app-select[elementid="${elementId}"], app-select[ng-reflect-element-id="${elementId}"], [elementid="${elementId}"]`;
    }
    if (root.id) return `#${CSS.escape(root.id)}`;
    if (actionContext?.selector?.selector) return actionContext.selector.selector;
    return '';
  };
  const tryAdaptiveSingleDropdown = async () => {
    const containerSelector = buildDropdownContainerSelector(dropdownRoot);
    if (!containerSelector || typeof this.handleAnalysis !== 'function') return false;
    try {
      const res = await this.handleAnalysis({
        type: 'analysis',
        subtype: 'fill-single-dropdown',
        containerSelector,
        targetValue: expectedText
      });
      if (res?.success && (res?.data?.success !== false)) {
        await this.delay(150);
        if (await isSelectionCommitted()) return true;
      }
    } catch (e) {
      console.warn('⚠️ [DropdownCombobox] fill-single-dropdown:', e?.message || e);
    }
    return false;
  };
  const getClickableOptionTarget = (el) => {
    if (!el || !el.isConnected) return el;
    const direct = el.closest?.('[role="option"], .mat-option, .ng-option, .option, .result__item, .result');
    if (direct) return direct;
    const child = el.querySelector?.('[role="option"], .mat-option, .ng-option, .option, .result__item, .result');
    return child || el;
  };
  const clickOptionRobustly = async (el) => {
    const target = getClickableOptionTarget(el);
    if (!target) return false;
    target.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    await this.delay(80);
    const r = target.getBoundingClientRect();
    try { target.click?.(); } catch (_) {}
    try {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    } catch (_) {}
    await this.delay(180);
    return true;
  };

  if (inputElement.tagName !== 'INPUT') {
    // Для кастомных dropdown trigger/root (app-select/div) запускаем adaptive-like pipeline:
    // 1) analysis fill-single-dropdown с targetValue
    // 2) существующие robust fallback-алгоритмы
    const byAnalysis = await tryAdaptiveSingleDropdown();
    if (byAnalysis) {
      console.log(`✅ dropdown-${subtype}: выбран через fill-single-dropdown "${expectedText}"`);
      return;
    }
    const robustSuccessNonInput = await runRobustFallback();
    if (robustSuccessNonInput) {
      console.log(`✅ dropdown-${subtype}: выбран через robust fallback "${expectedText}"`);
      return;
    }
    throw new Error(`Не удалось выбрать значение "${expectedText}" в dropdown (non-input trigger)`);
  }

  inputElement.focus();
  await this.delay(50);
  inputElement.value = '';
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  const needsIncrementalSearchInput = (el) => {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.id === 'account' || el.id === 'SELECTED_ACCOUNT') return true;
    if (String(el.type || '').toLowerCase() === 'search') return true;
    try {
      if (el.closest?.('.ant-select-show-search, .ant-select.ant-select-show-search')) return true;
    } catch (_) {}
    const cls = String(el.className || '');
    if (/ant-select-selection-search-input|rc-select|frte-select/i.test(cls)) return true;
    return false;
  };
  // Посимвольный ввод для async-поиска (Ant Select, account, search)
  if (needsIncrementalSearchInput(inputElement)) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    for (let i = 0; i < searchText.length; i++) {
      const v = searchText.slice(0, i + 1);
      if (setter) setter.call(inputElement, v); else inputElement.value = v;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      await this.delay(i < 3 ? 120 : 30);
    }
    await this.delay(600);
  } else {
    await this._performInput(inputElement, searchText);
    await this.delay(400);
  }

  // HTML5 datalist: input имеет list="id", ищем datalist#id
  const listId = inputElement.getAttribute('list');
  if (listId && subtype === 'dropdown-datalist') {
    const datalist = document.getElementById(listId);
    if (datalist) {
      const options = Array.from(datalist.querySelectorAll('option'));
      const match = options.find(o => {
        const v = (o.value || o.textContent || '').trim().toLowerCase();
        return v === searchText.toLowerCase() || v.includes(searchText.toLowerCase());
      });
      if (match) {
        inputElement.value = match.value || match.textContent?.trim() || searchText;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ dropdown-datalist: выбрано "${inputElement.value}"`);
        return;
      }
    }
  }

  // Combobox: ищем видимые опции (с учётом overlay для async-загрузки)
  const isVisible = (el) => el && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
  const panelSelectors = '.cdk-overlay-pane, .ant-select-dropdown, .el-select-dropdown, [role="listbox"], [class*="dropdown"]:not([class*="modal"]), [class*="overlay"], .options, ul[role="listbox"], .autocomplete-results, [class*="suggestions"], [class*="results"]';
  const optionSelectors = '[role="option"], .ant-select-item-option, .el-select-dropdown__item, .mat-option, .ng-option, li[role="option"], .cdk-option, .option, [class*="option-item"], [class*="select-item"], .result__content, .result__item, li.autocomplete-option, .suggestion-item, [class*="autocomplete"] li, [class*="suggestion"]';
  const linkedPanelElements = (() => {
    const out = [];
    const raw = [
      inputElement.getAttribute('aria-owns'),
      inputElement.getAttribute('aria-controls'),
      inputElement.getAttribute('aria-activedescendant')
    ].filter(Boolean).join(' ');
    for (const id of raw.split(/\s+/)) {
      const tid = (id || '').trim();
      if (!tid) continue;
      try {
        const node = document.getElementById(tid);
        if (node instanceof Element) out.push(node);
      } catch (_) {}
    }
    return out;
  })();
  const paneTouchesLinked = (pane) => {
    if (!linkedPanelElements.length || !pane) return false;
    return linkedPanelElements.some((t) => {
      try {
        return pane.contains(t) || (typeof t.contains === 'function' && t.contains(pane));
      } catch (_) {
        return false;
      }
    });
  };
  const optionLinkedWeak = new WeakMap();
  const collectOptions = () => {
    const overlayRoot = document.querySelector('.cdk-overlay-container');
    const roots = overlayRoot ? [overlayRoot, document.body] : [document.body];
    const opts = [];
    for (const root of roots) {
      for (const pane of root.querySelectorAll(panelSelectors)) {
        if (!isVisible(pane)) continue;
        const linkedPane = paneTouchesLinked(pane);
        for (const o of pane.querySelectorAll(optionSelectors)) {
          const txt = (o.textContent || '').trim();
          if (txt && isVisible(o) && (o.offsetParent !== null || o.offsetHeight > 0)) {
            opts.push(o);
            if (linkedPane) optionLinkedWeak.set(o, true);
          }
        }
      }
    }
    if (opts.length === 0) {
      for (const o of document.querySelectorAll(optionSelectors)) {
        const txt = (o.textContent || '').trim();
        if (txt && isVisible(o)) opts.push(o);
      }
    }
    return opts;
  };
  let options = collectOptions();
  for (let attempt = 0; attempt < 5 && options.length === 0; attempt++) {
    await this.delay(300);
    options = collectOptions();
  }
  const expectedNorm = this.normalizeTextValue(expectedText);
  const scoreOption = (o) => {
    const t = this.normalizeTextValue((o.textContent || '').trim());
    if (!t || !expectedNorm) return -1;
    if (t === expectedNorm) return 100;
    if (t.startsWith(expectedNorm)) return 80;
    if (t.includes(expectedNorm)) return 60;
    if (expectedNorm.includes(t) && t.length >= 4) return 40;
    return -1;
  };
  const levBounded = (a, b, cap) => {
    const aa = String(a || '').slice(0, cap);
    const bb = String(b || '').slice(0, cap);
    const m = aa.length;
    const n = bb.length;
    if (!m) return n;
    if (!n) return m;
    const row = new Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        const cost = aa.charCodeAt(i - 1) === bb.charCodeAt(j - 1) ? 0 : 1;
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return row[n];
  };
  let bestScore = -1;
  for (const o of options) {
    const s = scoreOption(o);
    if (s > bestScore) bestScore = s;
  }
  const ties = bestScore >= 0 ? options.filter((o) => scoreOption(o) === bestScore) : [];
  let match = null;
  if (ties.length === 1) {
    match = ties[0];
  } else if (ties.length > 1) {
    const CAP = 96;
    match = ties.reduce((best, o) => {
      const tBest = this.normalizeTextValue((best.textContent || '').trim()).slice(0, CAP);
      const tO = this.normalizeTextValue((o.textContent || '').trim()).slice(0, CAP);
      const lBest = !!optionLinkedWeak.get(best);
      const lO = !!optionLinkedWeak.get(o);
      if (lO !== lBest) return lO ? o : best;
      // При одинаковом score (часто общий префикс «маршрутов …») длина Levenshtein к короткому
      // expected отдаёт предпочтение более короткому суффиксу — это даёт неверный выбор.
      // Сначала предпочитаем более длинную подпись опции (обычно полное ФИО/строка списка).
      if (tO.length !== tBest.length) return tO.length > tBest.length ? o : best;
      const dBest = levBounded(tBest, expectedNorm, CAP);
      const dO = levBounded(tO, expectedNorm, CAP);
      if (dO !== dBest) return dO < dBest ? o : best;
      return best;
    });
  }
  if (match) {
    await clickOptionRobustly(match);
    if (await isSelectionCommitted()) {
      console.log(`✅ dropdown-combobox: выбрано по тексту "${searchText}"`);
      return;
    }
    console.warn(`⚠️ dropdown-combobox: клик по опции не зафиксировал выбор, пробую robust fallback`);
  }

  // Legacy fallback "pick first option" is opt-in only.
  if (allowFirstOptionFallback && !strictRecordedDropdown && options.length > 0 && (inputElement.id === 'account' || inputElement.type === 'search')) {
    const first = options[0];
    await clickOptionRobustly(first);
    if (await isSelectionCommitted()) {
      console.log(`✅ dropdown-combobox: выбрана первая опция (fallback)`);
      return;
    }
  }

  // Legacy keyboard fallback (often selects first option) is opt-in only.
  if (allowFirstOptionFallback && !strictRecordedDropdown && options.length > 0) {
    const keyOpts = { bubbles: true, cancelable: true, view: window };
    inputElement.focus();
    await this.delay(100);
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    await this.delay(150);
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    await this.delay(150);
    if (await isSelectionCommitted()) {
      console.log(`✅ dropdown-combobox: Enter по первой опции`);
      return;
    }
  }

  const robustSuccess = await runRobustFallback();
  if (robustSuccess) {
    console.log(`✅ dropdown-${subtype}: выбор подтверждён через robust fallback`);
    return;
  }

  // Для combobox/дропдауна считаем шаг неуспешным, если опция не была подтверждена.
  throw new Error(`Не удалось выбрать значение "${expectedText}" из dropdown-списка`);
}

TestPlayer.prototype.resolveDropdownElementByFieldLabel = function(action, currentElement) {
  const elementId = action?.element?.parentDropdown?.elementId;
  if (elementId) {
    const byId = document.querySelector(`app-select[elementid="${elementId}"], app-select[ng-reflect-element-id="${elementId}"]`);
    if (byId) {
      const trigger = byId.querySelector('.select-box, [class*="select-box"], .result, .options, .arrow, [class*="arrow"]');
      return trigger || byId;
    }
  }

  const fieldLabel = String(action?.fieldLabel || '').trim();
  if (!fieldLabel) return currentElement;

  const targetLabel = this.normalizeTextValue(fieldLabel);
  if (!targetLabel) return currentElement;

  const appSelectCandidates = Array.from(document.querySelectorAll('app-select'));
  if (!appSelectCandidates.length) return currentElement;
  const currentRect = currentElement?.getBoundingClientRect?.() || null;
  const distanceToCurrent = (el) => {
    if (!currentRect || !el?.getBoundingClientRect) return 0;
    const r = el.getBoundingClientRect();
    const cx1 = currentRect.left + currentRect.width / 2;
    const cy1 = currentRect.top + currentRect.height / 2;
    const cx2 = r.left + r.width / 2;
    const cy2 = r.top + r.height / 2;
    return Math.hypot(cx1 - cx2, cy1 - cy2);
  };

  let best = null;
  let bestScore = 0;
  for (const appSelect of appSelectCandidates) {
    const container = appSelect.closest('.form-input, .form-group, .field, .form-row, .row') || appSelect.parentElement || appSelect;
    const ctxText = this.normalizeTextValue(container?.textContent || '');
    if (!ctxText) continue;

    let score = 0;
    if (ctxText.includes(targetLabel)) score += 100;
    if (ctxText.startsWith(targetLabel)) score += 20;
    if (targetLabel.includes('основание') && ctxText.includes('основание')) score += 10;
    if (targetLabel.includes('должность') && ctxText.includes('должность')) score += 10;
    // При равных/близких текстовых score отдаём приоритет ближайшему к текущему найденному элементу.
    score -= Math.min(40, Math.round(distanceToCurrent(appSelect) / 40));
    if (score > bestScore) {
      bestScore = score;
      best = appSelect;
    }
  }

  if (!best || bestScore <= 0) return currentElement;
  return best.querySelector('.select-box, [class*="select-box"], .result, .options') || best;
}

TestPlayer.prototype.resolvePreferredDropdownTrigger = function(action, currentElement) {
  const fieldLabel = this.normalizeTextValue(String(action?.fieldLabel || ''));
  if (!fieldLabel || !fieldLabel.includes('основание')) {
    return currentElement;
  }
  const elementId = String(
    action?.element?.parentDropdown?.elementId ||
    currentElement?.closest?.('[elementid], [ng-reflect-element-id]')?.getAttribute?.('elementid') ||
    currentElement?.closest?.('[elementid], [ng-reflect-element-id]')?.getAttribute?.('ng-reflect-element-id') ||
    ''
  ).toLowerCase();
  const selectorStr = String(action?.selector?.selector || action?.selector?.value || '').toLowerCase();
  const isStatusProjectBinding = elementId.includes('status-project') || selectorStr.includes('status-project');
  if (!isStatusProjectBinding) {
    // ВАЖНО: не применять hardcoded статусный trigger к другим dropdown.
    return currentElement;
  }

  const preferredSelectors = [
    '#status-project__result > div',
    '#status-project__result .arrow.ng-star-inserted.up',
    '#status-project__result .arrow.ng-star-inserted',
    '#status-project__result .arrow',
    'div.arrow.ng-star-inserted.up'
  ];

  for (const selector of preferredSelectors) {
    const candidate = document.querySelector(selector);
    if (!candidate) continue;
    const style = window.getComputedStyle(candidate);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    return candidate;
  }

  return currentElement;
}

/**
 * Обрабатывает кастомные dropdown элементы (Angular Material, React Select и т.д.)
 */
TestPlayer.prototype.handleCustomDropdown = async function(element, value) {
  console.log('🎨 Пробую обработать кастомный dropdown');
  
  // Метод 1: Ищем скрытый input внутри dropdown
  const hiddenInput = element.querySelector('input[type="hidden"]');
  if (hiddenInput) {
    hiddenInput.value = value;
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Метод 2: Angular Material - ищем mat-select
  if (element.classList.contains('mat-select') || element.querySelector('mat-select')) {
    const matSelect = element.querySelector('mat-select') || element;
    // Открываем dropdown
    matSelect.click();
    await this.delay(100); // Уменьшено с 300 до 100
    
    // Ищем опцию по тексту или значению
    const options = Array.from(document.querySelectorAll('mat-option'));
    const option = options.find(opt => 
      opt.textContent?.trim() === value || 
      opt.getAttribute('value') === value ||
      opt.textContent?.toLowerCase().includes(value.toLowerCase())
    );
    
    if (option) {
      option.click();
      await this.delay(100); // Уменьшено с 300 до 100
      return true;
    }
  }

  // Метод 3: React Select - ищем .react-select
  if (element.classList.contains('react-select') || element.querySelector('.react-select')) {
    const reactSelect = element.querySelector('.react-select') || element;
    const input = reactSelect.querySelector('input');
    if (input) {
      // Открываем dropdown
      input.focus();
      input.click();
      await this.delay(100); // Уменьшено с 300 до 100
      
      // Ищем опцию
      const options = Array.from(document.querySelectorAll('.react-select__option, [class*="option"]'));
      const option = options.find(opt => 
        opt.textContent?.trim() === value || 
        opt.textContent?.toLowerCase().includes(value.toLowerCase())
      );
      
      if (option) {
        option.click();
        await this.delay(100); // Уменьшено с 300 до 100
        return true;
      }
    }
  }

  // Метод 4: PrimeNG - ищем p-dropdown
  if (element.tagName === 'P-DROPDOWN' || element.querySelector('p-dropdown')) {
    const trigger = element.querySelector('[role="combobox"], .p-dropdown-trigger, button');
    if (trigger) {
      trigger.click();
      await this.delay(300);
      
      const options = Array.from(document.querySelectorAll('.p-dropdown-item, [role="option"]'));
      const option = options.find(opt => 
        opt.textContent?.trim() === value || 
        opt.textContent?.toLowerCase().includes(value.toLowerCase())
      );
      
      if (option) {
        option.click();
        await this.delay(300);
        return true;
      }
    }
  }

  // Метод 5: Angular app-select компонент
  // ПРИОРИТЕТ: Используем SeleniumUtils для эмуляции логики из внутреннего Selenium-автотеста
  if (this.seleniumUtils) {
    console.log('🤖 [Player] ════════════════════════════════════════════════════');
    console.log('🤖 [Player] ИСПОЛЬЗУЮ SeleniumUtils (логика из внутреннего Selenium-автотеста)');
    console.log(`🤖 [Player] Выбор опции: "${value}"`);
    console.log('🤖 [Player] ════════════════════════════════════════════════════');
    try {
      const success = await this.seleniumUtils.selectDropdownOption(element, value);
      if (success) {
        console.log('✅ [Player] ✅✅✅ Опция успешно выбрана через SeleniumUtils ✅✅✅');
        return true;
      } else {
        console.warn('⚠️ [Player] SeleniumUtils не смог выбрать опцию, пробую обычную логику...');
      }
    } catch (e) {
      console.error(`❌ [Player] Ошибка при использовании SeleniumUtils: ${e.message}`);
      console.error('   Stack:', e.stack);
      // Продолжаем с обычной логикой
    }
  } else {
    console.warn('⚠️ [Player] SeleniumUtils недоступен, использую обычную логику');
  }
  
  // Сначала пытаемся найти app-select через closest или по ID из селектора
  let appSelect = element.tagName === 'APP-SELECT' ? element : element.closest('app-select');
  
  // Если не нашли через closest, пробуем найти по ID из селектора (например, #status-project__result)
  if (!appSelect) {
    const elementId = element.id || '';
    if (elementId) {
      // Извлекаем ID без суффикса (например, status-project из status-project__result)
      const baseId = elementId.replace(/__result.*$/, '').replace(/__value.*$/, '');
      if (baseId) {
        appSelect = document.querySelector(`app-select[elementid="${baseId}"], app-select[ng-reflect-element-id="${baseId}"]`);
      }
    }
  }
  
  // Если все еще не нашли, пробуем найти по тексту или другим признакам
  if (!appSelect) {
    // Ищем все app-select на странице и проверяем, содержит ли один из них наш элемент
    const allAppSelects = Array.from(document.querySelectorAll('app-select'));
    for (const select of allAppSelects) {
      if (select.contains(element)) {
        appSelect = select;
        break;
      }
    }
  }
  
  if (appSelect) {
    const elementId = appSelect.getAttribute('elementid') || appSelect.getAttribute('ng-reflect-element-id');
    const label = appSelect.getAttribute('label') || appSelect.getAttribute('ng-reflect-label');
    
    console.log(`🎯 Найден app-select: elementid="${elementId}", label="${label}"`);
    
    // Ищем кликабельный элемент (обычно .options, .result, .select-box или .arrow.isShowOptions)
    let clickableElement = appSelect.querySelector('.options, [class*="options"], .result, [class*="result"], .arrow.isShowOptions, .arrow[class*="isShowOptions"], .select-box, [class*="select-box"], [class*="select"]');
    
    // Если не нашли, пробуем найти через селектор
    if (!clickableElement) {
      if (elementId) {
        const idSelector = `app-select[elementid="${elementId}"] .options, app-select[ng-reflect-element-id="${elementId}"] .options, app-select[elementid="${elementId}"] [class*="options"], app-select[ng-reflect-element-id="${elementId}"] [class*="options"], app-select[elementid="${elementId}"] .result, app-select[ng-reflect-element-id="${elementId}"] .result, app-select[elementid="${elementId}"] .arrow.isShowOptions, app-select[ng-reflect-element-id="${elementId}"] .arrow.isShowOptions, app-select[elementid="${elementId}"] .select-box, app-select[ng-reflect-element-id="${elementId}"] .select-box`;
        clickableElement = document.querySelector(idSelector);
      }
      if (!clickableElement && label) {
        const labelSelector = `app-select[label="${label}"] .options, app-select[ng-reflect-label="${label}"] .options, app-select[label="${label}"] [class*="options"], app-select[ng-reflect-label="${label}"] [class*="options"], app-select[label="${label}"] .result, app-select[ng-reflect-label="${label}"] .result, app-select[label="${label}"] .arrow.isShowOptions, app-select[ng-reflect-label="${label}"] .arrow.isShowOptions, app-select[label="${label}"] .select-box, app-select[ng-reflect-label="${label}"] .select-box`;
        clickableElement = document.querySelector(labelSelector);
      }
    }
    
    if (clickableElement) {
      // ЛОГИРОВАНИЕ СОСТОЯНИЯ СТРАНИЦЫ ПЕРЕД КЛИКОМ
      console.log(`📊 СОСТОЯНИЕ СТРАНИЦЫ ПЕРЕД КЛИКОМ:`);
      console.log(`   - Кликабельный элемент: <${clickableElement.tagName.toLowerCase()}> id="${clickableElement.id || 'нет'}" class="${clickableElement.className || 'нет'}"`);
      const clickableRect = clickableElement.getBoundingClientRect();
      console.log(`   - Позиция: left=${Math.round(clickableRect.left)}, top=${Math.round(clickableRect.top)}`);
      
      // Логируем все видимые панели ДО клика
      const panelsBefore = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
      const visiblePanelsBefore = panelsBefore.filter(p => {
        const rect = p.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
      });
      console.log(`   - Видимых панелей ДО клика: ${visiblePanelsBefore.length}`);
      
      clickableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Умное ожидание завершения прокрутки
      if (this.smartWaiter) {
        await this.smartWaiter.waitForElementReady(clickableElement, {
          visible: true,
          timeout: 500
        });
      } else {
        await this.delay(100);
      }
      
      // Функция для ожидания появления панели с опциями
      const waitForPanel = async (maxWait = 2000) => {
        const startTime = Date.now();
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
        
        while (Date.now() - startTime < maxWait) {
          // Расширенный поиск панелей (по расширенным эвристикам SeleniumUtils)
          const panelSelectors = [
            '.dropdown-menu',
            '[role="listbox"]',
            '.select-options',
            '[class*="dropdown"]',
            '[class*="menu"]',
            '[class*="panel"]',
            '[class*="overlay"]',
            '[class*="status"]', // Специально для поля статуса
            '.cdk-overlay-pane',
            '.cdk-overlay-container',
            '[class*="cdk-overlay"]',
            'div[class*="select"]',
            'ul[class*="select"]'
          ];
          
          const panels = Array.from(document.querySelectorAll(panelSelectors.join(', ')));
          const visiblePanels = panels.filter(panel => {
            const rect = panel.getBoundingClientRect();
            // Проверяем, что панель видима
            if (rect.width > 0 && rect.height > 0 && panel.offsetParent !== null) {
              // Ищем опции в панели (как в автотесте: ['li', 'div', 'span', '[role="option"]', '.option'])
              const optionSelectors = ['li', 'div', 'span', '[role="option"]', '.option'];
              const allOptions = [];
              for (const optSel of optionSelectors) {
                try {
                  allOptions.push(...Array.from(panel.querySelectorAll(optSel)));
                } catch (e) {
                  // Игнорируем ошибки некорректных селекторов
                }
              }
              const realOptions = allOptions.filter(opt => {
                const optText = opt.textContent?.trim() || '';
                const isPlaceholder = placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()));
                const optRect = opt.getBoundingClientRect();
                return optText && optText.length > 0 && !isPlaceholder && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
              });
              // Панель должна содержать хотя бы одну реальную опцию
              return realOptions.length > 0;
            }
            return false;
          });
          if (visiblePanels.length > 0) {
            console.log(`✅ Найдено ${visiblePanels.length} видимых панелей с опциями`);
            return visiblePanels;
          }
          await this.delay(100);
        }
        return [];
      };
      
      // Первый клик
      console.log(`🖱️ ВЫПОЛНЯЮ КЛИК ПО ЭЛЕМЕНТУ...`);
      console.log(`   - Элемент: <${clickableElement.tagName.toLowerCase()}> id="${clickableElement.id || 'нет'}" class="${clickableElement.className || 'нет'}"`);
      console.log(`   - Позиция: left=${Math.round(clickableRect.left)}, top=${Math.round(clickableRect.top)}`);
      
      // Пробуем разные способы клика для надежности
      try {
        // Способ 1: Фокус + клик
        clickableElement.focus();
        // Минимальная задержка для фокуса
        if (this.smartWaiter) {
          await this.smartWaiter.minimalDelay(30);
        } else {
          await this.delay(30);
        }
        clickableElement.click();
      } catch (e) {
        console.warn('⚠️ Ошибка при focus+click, пробую только click:', e);
        clickableElement.click();
      }
      
      // Умное ожидание появления панели dropdown
      if (this.smartWaiter) {
        await this.smartWaiter.waitForDropdownPanel(clickableElement, { timeout: 1000 });
      } else {
        await this.delay(150);
      }
      
      // ЛОГИРОВАНИЕ СОСТОЯНИЯ СТРАНИЦЫ ПОСЛЕ КЛИКА
      console.log(`📊 СОСТОЯНИЕ СТРАНИЦЫ ПОСЛЕ КЛИКА:`);
      const panelsAfter = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
      const visiblePanelsAfter = panelsAfter.filter(p => {
        const rect = p.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
      });
      console.log(`   - Видимых панелей ПОСЛЕ клика: ${visiblePanelsAfter.length}`);
      
      // Находим новые панели, которые появились после клика
      const newPanels = visiblePanelsAfter.filter(p => !visiblePanelsBefore.includes(p));
      if (newPanels.length > 0) {
        console.log(`   ✅ Появилось ${newPanels.length} новых панелей после клика:`);
        newPanels.forEach((panel, idx) => {
          const rect = panel.getBoundingClientRect();
          const tag = panel.tagName.toLowerCase();
          const classes = panel.className || 'нет классов';
          const id = panel.id || 'нет id';
          const allElements = Array.from(panel.querySelectorAll('*'));
          const visibleElements = allElements.filter(el => {
            const elRect = el.getBoundingClientRect();
            const elText = el.textContent?.trim();
            return elText && elText.length > 0 && elRect.width > 0 && elRect.height > 0 && el.offsetParent !== null;
          });
          console.log(`      ${idx + 1}. <${tag}> id="${id}" class="${classes}" size=${Math.round(rect.width)}x${Math.round(rect.height)} elements=${allElements.length} visible=${visibleElements.length}`);
          if (visibleElements.length > 0 && visibleElements.length <= 10) {
            console.log(`         Тексты:`, visibleElements.map(el => el.textContent?.trim()).filter(Boolean).slice(0, 5));
          }
        });
      }
      
      // Ждем появления панели
      let visiblePanels = await waitForPanel(3000);
      
      // Если панель не появилась, пробуем кликнуть еще раз с большей задержкой
      if (visiblePanels.length === 0) {
        console.log('⚠️ Панель не появилась после первого клика, пробую еще раз...');
        clickableElement.focus();
        await this.delay(100); // Уменьшено с 200 до 100
        clickableElement.click();
        await this.delay(300); // Уменьшено с 800 до 300
        visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
      }
      
      // Если все еще не появилась, пробуем кликнуть по app-select напрямую
      if (visiblePanels.length === 0) {
        console.log('⚠️ Панель не появилась, пробую кликнуть по app-select...');
        appSelect.focus();
        await this.delay(100); // Уменьшено с 200 до 100
        appSelect.click();
        await this.delay(300); // Уменьшено с 800 до 300
        visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
      }
      
      // Последняя попытка: пробуем кликнуть по .options, .result или .arrow.isShowOptions внутри app-select
      if (visiblePanels.length === 0) {
        console.log('⚠️ Панель не появилась, пробую кликнуть по .options, .result или .arrow.isShowOptions...');
        
        // ПРИОРИТЕТ 1: Пробуем .options
        const optionsElement = appSelect.querySelector('.options, [class*="options"]');
        if (optionsElement) {
          console.log('   Пробую кликнуть по .options...');
          optionsElement.focus();
          await this.delay(100); // Уменьшено с 200 до 100
          optionsElement.click();
          await this.delay(300); // Уменьшено с 1000 до 300
          visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
          if (visiblePanels.length > 0) {
            console.log('✅ Панель появилась после клика по .options!');
          }
        }
        
        // ПРИОРИТЕТ 2: Пробуем .arrow.isShowOptions
        if (visiblePanels.length === 0) {
          const arrowElement = appSelect.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]');
          if (arrowElement) {
            console.log('   Пробую кликнуть по .arrow.isShowOptions...');
            arrowElement.focus();
            await this.delay(100); // Уменьшено с 200 до 100
            arrowElement.click();
            await this.delay(300); // Уменьшено с 1000 до 300
            visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
            if (visiblePanels.length > 0) {
              console.log('✅ Панель появилась после клика по .arrow.isShowOptions!');
            }
          }
        }
        
        // ПРИОРИТЕТ 3: Пробуем .result
        if (visiblePanels.length === 0) {
        const resultElement = appSelect.querySelector('.result, [class*="result"]');
        if (resultElement) {
            console.log('   Пробую кликнуть по .result...');
          resultElement.focus();
          await this.delay(100); // Уменьшено с 200 до 100
          resultElement.click();
            await this.delay(300); // Уменьшено с 1000 до 300
          visiblePanels = await waitForPanel(2000); // Уменьшено с 3000 до 2000
          if (visiblePanels.length > 0) {
            console.log('✅ Панель появилась после клика по .result!');
            }
          }
        }
      }
      
      // Ищем overlay/panel, связанный с этим конкретным app-select
      // Сначала ищем панель рядом с app-select (по позиции)
      const appSelectRect = appSelect.getBoundingClientRect();
      console.log(`📍 Позиция app-select: left=${Math.round(appSelectRect.left)}, top=${Math.round(appSelectRect.top)}, width=${Math.round(appSelectRect.width)}, height=${Math.round(appSelectRect.height)}`);
      
      // Расширяем поиск панелей, включая Angular CDK overlay
      const panelSelectors = [
        '[class*="panel"]',
        '[class*="overlay"]',
        '[class*="dropdown"]',
        '[class*="menu"]',
        '[role="listbox"]',
        '.cdk-overlay-pane',
        '.cdk-overlay-container',
        '[class*="cdk-overlay"]'
      ];
      // Если панель появилась после клика по .result, используем её, иначе ищем все панели
      let allPanels = visiblePanels.length > 0 ? visiblePanels : Array.from(document.querySelectorAll(panelSelectors.join(', ')));
      
      // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВСЕХ ПАНЕЛЕЙ НА СТРАНИЦЕ
      console.log(`📊 ВСЕ ПАНЕЛИ НА СТРАНИЦЕ (${allPanels.length}):`);
      allPanels.forEach((panel, idx) => {
        const rect = panel.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && panel.offsetParent !== null;
        const tag = panel.tagName.toLowerCase();
        const classes = panel.className || 'нет классов';
        const id = panel.id || 'нет id';
        const allOptions = Array.from(panel.querySelectorAll('*'));
        const visibleOptions = allOptions.filter(opt => {
          const optRect = opt.getBoundingClientRect();
          const optText = opt.textContent?.trim();
          return optText && optText.length > 0 && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
        });
        console.log(`   ${idx + 1}. <${tag}> id="${id}" class="${classes}" visible=${isVisible} size=${Math.round(rect.width)}x${Math.round(rect.height)} pos=(${Math.round(rect.left)},${Math.round(rect.top)}) elements=${allOptions.length} visibleElements=${visibleOptions.length}`);
        if (visibleOptions.length > 0 && visibleOptions.length <= 10) {
          console.log(`      Тексты элементов:`, visibleOptions.map(opt => opt.textContent?.trim()).filter(Boolean).slice(0, 5));
        }
      });
      
      // Если панель все еще не найдена, пробуем найти её еще раз после небольшой задержки
      if (allPanels.length === 0 || !allPanels.some(p => {
        const rect = p.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && p.offsetParent !== null;
      })) {
        console.log('⚠️ Панель не найдена, жду еще немного и проверяю снова...');
        await this.delay(500);
        // Проверяем панель еще раз
        visiblePanels = await waitForPanel(2000);
        if (visiblePanels.length > 0) {
          allPanels = visiblePanels;
          console.log('✅ Панель найдена после дополнительного ожидания!');
        } else {
          allPanels = Array.from(document.querySelectorAll(panelSelectors.join(', ')));
          console.log(`📊 После повторного поиска найдено ${allPanels.length} панелей`);
        }
      }
      
      let targetPanel = null;
      let minDistance = Infinity;
      
      // Находим панель, которая ближе всего к app-select
      for (const panel of allPanels) {
        const panelRect = panel.getBoundingClientRect();
        // Проверяем, что панель видима и находится рядом с app-select
        if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
          const distanceX = Math.abs(panelRect.left - appSelectRect.left);
          const distanceY = Math.abs(panelRect.top - (appSelectRect.bottom + 5)); // Панель обычно ниже
          const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
          
          // Панель должна быть в пределах 500px от app-select
          if (distance < 500 && distance < minDistance) {
            minDistance = distance;
            targetPanel = panel;
            console.log(`✅ Найдена панель на расстоянии ${Math.round(distance)}px от app-select`);
          }
        }
      }
      
      // Если не нашли панель по позиции, пробуем найти через aria-owns или другие связи
      if (!targetPanel) {
        const ariaOwns = appSelect.getAttribute('aria-owns');
        if (ariaOwns) {
          targetPanel = document.getElementById(ariaOwns);
        }
      }
      
      // Если все еще не нашли, ищем панель с опциями, которая появилась недавно
      if (!targetPanel) {
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
        console.log(`🔍 Ищу панель с целевой опцией "${value}" среди ${allPanels.length} панелей...`);
        
        // Сначала ищем панель, связанную с этим dropdown через ID
        if (elementId) {
          // Ищем панель с ID, содержащим elementId
          const relatedPanel = Array.from(allPanels).find(panel => {
            const panelId = panel.id || '';
            return panelId.includes(elementId) || panelId.includes('status-project');
          });
          
          if (relatedPanel) {
            const panelRect = relatedPanel.getBoundingClientRect();
            if (panelRect.width > 0 && panelRect.height > 0 && relatedPanel.offsetParent !== null) {
              console.log(`   📋 Найдена панель, связанная с dropdown через ID: ${relatedPanel.id || 'нет id'}`);
              targetPanel = relatedPanel;
            }
          }
        }
        
        // Если не нашли по ID, ищем панель, которая содержит целевую опцию
        if (!targetPanel) {
          // Используем расширенный поиск опций во всех панелях
          for (const panel of allPanels) {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
              // Расширенный поиск опций - ищем все элементы с текстом
              const allPanelElements = Array.from(panel.querySelectorAll('*'));
              const realOptions = allPanelElements.filter(opt => {
                const optText = opt.textContent?.trim() || '';
                const isPlaceholder = placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()));
                const optRect = opt.getBoundingClientRect();
                return optText && optText.length > 0 && !isPlaceholder && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
              });
              
              if (realOptions.length > 0) {
                console.log(`   📋 Панель ${panel.tagName.toLowerCase()} (${panel.className || 'нет классов'}): ${realOptions.length} опций`);
                const optionTexts = realOptions.map(opt => opt.textContent?.trim()).filter(Boolean).slice(0, 10);
                console.log(`      Тексты опций:`, optionTexts);
                
                // Проверяем, есть ли в панели опция с нужным текстом
                const hasTargetOption = realOptions.some(opt => {
                  const optText = opt.textContent?.trim() || '';
                  const valueLower = value.toLowerCase();
                  const optTextLower = optText.toLowerCase();
                  return optText === value || 
                         optTextLower === valueLower ||
                         optTextLower.includes(valueLower) || 
                         valueLower.includes(optTextLower) ||
                         // Для частичных совпадений (например, "По поручению" может быть частью "Плановый По поручению Инициативный")
                         (optTextLower.includes(valueLower) && valueLower.length > 3);
                });
                
                if (hasTargetOption) {
                  targetPanel = panel;
                  console.log(`✅ Найдена панель с целевой опцией "${value}" (${realOptions.length} реальных опций)`);
                  break;
                }
              }
            }
          }
        }
        
        // Если не нашли панель с целевой опцией, ищем панель, которая ближе всего к app-select
        if (!targetPanel) {
          console.log(`⚠️ Панель с целевой опцией не найдена, ищу ближайшую панель к app-select...`);
          let minDistance = Infinity;
          for (const panel of allPanels) {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
              const allPanelElements = Array.from(panel.querySelectorAll('*'));
              const realOptions = allPanelElements.filter(opt => {
                const optText = opt.textContent?.trim() || '';
                const isPlaceholder = placeholderTexts.some(ph => optText.toLowerCase().includes(ph.toLowerCase()));
                const optRect = opt.getBoundingClientRect();
                return optText && optText.length > 0 && !isPlaceholder && optRect.width > 0 && optRect.height > 0 && opt.offsetParent !== null;
              });
              
              if (realOptions.length > 0) {
                const distanceX = Math.abs(panelRect.left - appSelectRect.left);
                const distanceY = Math.abs(panelRect.top - (appSelectRect.bottom + 5));
                const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
                
                if (distance < minDistance) {
                  minDistance = distance;
                  targetPanel = panel;
                  console.log(`   📍 Найдена ближайшая панель на расстоянии ${Math.round(distance)}px (${realOptions.length} опций)`);
                }
              }
            }
          }
          
          if (targetPanel) {
            console.log(`✅ Выбрана ближайшая панель к app-select`);
          }
        }
      }
      
      let options = [];
      
      if (targetPanel) {
        console.log(`🎯 Использую найденную панель для поиска опций`);
        console.log(`📋 ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О ПАНЕЛИ:`);
        console.log(`   - Тег: ${targetPanel.tagName}`);
        console.log(`   - Классы: ${targetPanel.className || 'нет'}`);
        console.log(`   - ID: ${targetPanel.id || 'нет'}`);
        console.log(`   - Размеры: ${targetPanel.getBoundingClientRect().width}x${targetPanel.getBoundingClientRect().height}`);
        
        // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ВСЕХ ЭЛЕМЕНТОВ В ПАНЕЛИ
        const allPanelElements = Array.from(targetPanel.querySelectorAll('*'));
        console.log(`📊 Всего элементов в панели: ${allPanelElements.length}`);
        
        // Логируем все видимые элементы с текстом
        const visibleElements = allPanelElements.filter(el => {
          const rect = el.getBoundingClientRect();
          const text = el.textContent?.trim();
          return text && text.length > 0 && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
        });
        
        console.log(`📋 ВИДИМЫЕ ЭЛЕМЕНТЫ В ПАНЕЛИ (${visibleElements.length}):`);
        visibleElements.slice(0, 20).forEach((el, idx) => {
          const text = el.textContent?.trim();
          const tag = el.tagName.toLowerCase();
          const classes = el.className || 'нет классов';
          const id = el.id || 'нет id';
          console.log(`   ${idx + 1}. <${tag}> id="${id}" class="${classes}" text="${text.substring(0, 50)}"`);
        });
        
        // Ищем опции только в этой панели (как в автотесте: ['li', 'div', 'span', '[role="option"]', '.option'])
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
        const optionSelectors = [
          'li',
          'div',
          'span',
          '[role="option"]',
          '.option',
          '.option-item',
          'div[class*="option"]',
          '.mat-option',
          '.ant-select-item-option',
          'div[class*="item"]',
          'a[class*="item"]',
          'span[class*="item"]',
          'button[class*="item"]'
        ];
        
        // Пробуем каждый селектор и логируем результаты
        for (const selector of optionSelectors) {
          const found = Array.from(targetPanel.querySelectorAll(selector));
          console.log(`🔍 Селектор "${selector}": найдено ${found.length} элементов`);
          
          if (found.length > 0) {
            // Логируем первые 10 найденных элементов
            found.slice(0, 10).forEach((el, idx) => {
              const text = el.textContent?.trim();
              const tag = el.tagName.toLowerCase();
              const classes = el.className || 'нет классов';
              console.log(`   ${idx + 1}. <${tag}> class="${classes}" text="${text ? text.substring(0, 50) : 'нет текста'}"`);
            });
          }
          
          // Фильтруем плейсхолдеры
          const filtered = found.filter(el => {
            const text = el.textContent?.trim();
            const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            return text && text.length > 0 && !isPlaceholder && isVisible;
          });
          
          if (filtered.length > 0) {
            console.log(`✅ Найдено ${filtered.length} опций через селектор "${selector}" (отфильтровано ${found.length - filtered.length} плейсхолдеров/невидимых)`);
            console.log(`📝 Тексты найденных опций:`, filtered.map(opt => opt.textContent?.trim()).filter(Boolean));
            
            // Проверяем, есть ли среди них целевая опция
            const hasTarget = filtered.some(opt => {
              const optText = opt.textContent?.trim() || '';
              return optText === value || 
                     optText.toLowerCase() === value.toLowerCase() ||
                     optText.toLowerCase().includes(value.toLowerCase()) ||
                     value.toLowerCase().includes(optText.toLowerCase());
            });
            
            if (hasTarget || options.length === 0) {
              options = filtered;
              if (hasTarget) {
                console.log(`🎯 Целевая опция "${value}" найдена через селектор "${selector}"!`);
              }
              // Не прерываем цикл, продолжаем искать лучший селектор
            }
          }
        }
        
        // Если не нашли через селекторы, берем все кликабельные элементы в панели
        if (options.length === 0) {
          console.log(`⚠️ Не найдено опций через стандартные селекторы, пробую все элементы...`);
          const allElements = Array.from(targetPanel.querySelectorAll('*'));
          options = allElements.filter(el => {
            const text = el.textContent?.trim();
            const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            return text && text.length > 0 && !isPlaceholder && isVisible;
          });
          console.log(`✅ Найдено ${options.length} опций в панели (все элементы, отфильтровано плейсхолдеры)`);
          console.log(`📝 Тексты всех найденных опций:`, options.map(opt => opt.textContent?.trim()).filter(Boolean));
        }
      } else {
        console.warn('⚠️ Не найдена панель dropdown, пробую альтернативные способы поиска опций');
        
        // Сначала ищем опции внутри app-select (как в автотесте: ['li', 'div', 'span', '[role="option"]', '.option'])
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder', 'статус'];
        const optionSelectorsInSelect = ['li', 'div', 'span', '[role="option"]', '.option'];
        const allOptionsInSelect = [];
        for (const optSel of optionSelectorsInSelect) {
          try {
            allOptionsInSelect.push(...Array.from(appSelect.querySelectorAll(optSel)));
          } catch (e) {
            // Игнорируем ошибки
          }
        }
        
        const optionsInSelect = allOptionsInSelect.filter(el => {
          const text = el.textContent?.trim();
          const rect = el.getBoundingClientRect();
          // Исключаем плейсхолдеры и элементы без текста
          const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
          return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
        });
        
        if (optionsInSelect.length > 0) {
          options = optionsInSelect;
          console.log(`✅ Найдено ${options.length} опций внутри app-select`);
        } else {
          // Fallback: ищем опции, которые появились после клика (как в автотесте)
          // Сначала ищем в overlay панелях
          const overlayPanels = Array.from(document.querySelectorAll('.cdk-overlay-pane, [class*="overlay"], [class*="panel"], [class*="dropdown"], [class*="menu"], [role="listbox"]'));
          const allOptionsFromOverlays = [];
          
          // Используем те же селекторы, что и в автотесте: ['li', 'div', 'span', '[role="option"]', '.option']
          const fallbackOptionSelectors = ['li', 'div', 'span', '[role="option"]', '.option'];
          
          for (const panel of overlayPanels) {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
              for (const optSel of fallbackOptionSelectors) {
                try {
                  const panelOptions = Array.from(panel.querySelectorAll(optSel));
                  allOptionsFromOverlays.push(...panelOptions);
                } catch (e) {
                  // Игнорируем ошибки
                }
              }
            }
          }
          
          // Также ищем опции глобально (как в автотесте: browser.find_elements(By.CSS_SELECTOR, 'li, div, span'))
          const allOptions = [];
          for (const optSel of fallbackOptionSelectors) {
            try {
              allOptions.push(...Array.from(document.querySelectorAll(optSel)));
            } catch (e) {
              // Игнорируем ошибки
            }
          }
          const combinedOptions = [...allOptionsFromOverlays, ...allOptions];
          
          // Удаляем дубликаты
          const uniqueOptions = Array.from(new Set(combinedOptions));
          
          options = uniqueOptions.filter(opt => {
            const text = opt.textContent?.trim();
            const rect = opt.getBoundingClientRect();
            const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
            return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && opt.offsetParent !== null;
          });
          
          console.log(`✅ Найдено ${options.length} видимых опций на странице (без плейсхолдеров, включая overlay панели)`);
        }
      }
      
      // ДЕТАЛЬНЫЙ ПОИСК ОПЦИИ С ЛОГИРОВАНИЕМ
      console.log(`🔍 Ищу опцию "${value}" среди ${options.length} найденных опций...`);
      
      if (options.length > 0) {
        console.log(`📝 Все найденные опции:`);
        options.forEach((opt, idx) => {
          const optText = opt.textContent?.trim() || '';
          const optValue = opt.getAttribute('value') || opt.dataset.value || '';
          const tag = opt.tagName.toLowerCase();
          const classes = opt.className || 'нет классов';
          const id = opt.id || 'нет id';
          const rect = opt.getBoundingClientRect();
          console.log(`   ${idx + 1}. <${tag}> id="${id}" class="${classes}" text="${optText}" value="${optValue}" visible=${rect.width > 0 && rect.height > 0 && opt.offsetParent !== null}`);
          
          // Проверяем совпадение
          const valueLower = value.toLowerCase().trim();
          const optTextLower = optText.toLowerCase();
          const exactMatch = optText === value || optValue === value || optTextLower === valueLower;
          const caseInsensitiveMatch = optText.toLowerCase() === value.toLowerCase() || optValue.toLowerCase() === value.toLowerCase();
          const includesMatch = optText.toLowerCase().includes(value.toLowerCase()) || optValue.toLowerCase().includes(value.toLowerCase());
          const reverseIncludesMatch = value.toLowerCase().includes(optText.toLowerCase());
          
          if (exactMatch || caseInsensitiveMatch || includesMatch || reverseIncludesMatch) {
            console.log(`      ✅ СОВПАДЕНИЕ! exact=${exactMatch} caseInsensitive=${caseInsensitiveMatch} includes=${includesMatch} reverse=${reverseIncludesMatch}`);
          }
        });
      }
      
      // Ищем опцию с приоритетом: точное совпадение > частичное совпадение
      const valueLower = value.toLowerCase().trim();
      let bestOption = null;
      let bestScore = 0;
      
      for (const opt of options) {
        const optText = opt.textContent?.trim() || '';
        const optValue = opt.getAttribute('value') || opt.dataset.value || optText;
        const optTextLower = optText.toLowerCase();
        const optValueLower = optValue.toLowerCase();
        
        // Точное совпадение (без учета регистра) - высший приоритет
        if (optTextLower === valueLower || optValueLower === valueLower) {
          bestOption = opt;
          bestScore = 100;
          console.log(`✅ Найдена опция с точным совпадением: "${optText}"`);
          break;
        }
        
        // Точное совпадение (с учетом регистра)
        if (optText === value || optValue === value) {
          bestOption = opt;
          bestScore = 95;
          console.log(`✅ Найдена опция с точным совпадением (с учетом регистра): "${optText}"`);
          break;
        }
        
        // Частичное совпадение - опция содержит целевое значение
        if (optTextLower.includes(valueLower) && valueLower.length > 2) {
          const matchScore = (valueLower.length / optTextLower.length) * 80;
          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestOption = opt;
            console.log(`   💡 Потенциальное совпадение: "${optText}" (оценка: ${Math.round(matchScore)}%)`);
          }
        }
        
        // Обратное совпадение - целевое значение содержит опцию
        if (valueLower.includes(optTextLower) && optTextLower.length > 2) {
          const matchScore = (optTextLower.length / valueLower.length) * 70;
          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestOption = opt;
            console.log(`   💡 Потенциальное совпадение (обратное): "${optText}" (оценка: ${Math.round(matchScore)}%)`);
          }
        }
      }
      
      const option = bestOption && bestScore > 30 ? bestOption : null;
      
      if (option) {
        const optText = option.textContent?.trim() || '';
        console.log(`✅ Найдена опция "${optText}" для значения "${value}"`);
        option.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.delay(300);
        
        // Выполняем клик по опции с использованием MouseEvent для более надежного клика
        try {
          // Фокусируем опцию
          if (typeof option.focus === 'function') {
            option.focus();
            await this.delay(100);
          }
          
          // Создаем и диспатчим события мыши (как в автотесте)
          const mouseEvents = ['mousedown', 'mouseup', 'click'];
          for (const eventType of mouseEvents) {
            const event = new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              buttons: 1
            });
            option.dispatchEvent(event);
            await this.delay(50);
          }
          
          // Также пробуем обычный клик
          if (typeof option.click === 'function') {
            option.click();
          }
          
          await this.delay(500);
          
          // Проверяем результат
          const selectedValue = this.getSelectedDropdownValue(appSelect);
          console.log(`🔍 Значение после клика: "${selectedValue}"`);
          
          if (selectedValue && (selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
            console.log(`✅ Опция "${value}" успешно выбрана!`);
            return true;
          }
        } catch (e) {
          console.warn(`⚠️ Ошибка при клике по опции: ${e.message}`);
          // Пробуем JavaScript клик (как в автотесте)
          try {
            await this.delay(100);
            option.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.delay(200);
            
            // Используем JavaScript клик (как в автотесте: browser.execute_script("arguments[0].click();", planned_option))
            if (option.click) {
              option.click();
            } else {
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
              });
              option.dispatchEvent(clickEvent);
            }
            
            await this.delay(500);
            
            const selectedValue = this.getSelectedDropdownValue(appSelect);
            console.log(`🔍 Значение после JavaScript клика: "${selectedValue}"`);
            
            if (selectedValue && (selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
              console.log(`✅ Опция "${value}" успешно выбрана через JavaScript!`);
              return true;
            }
          } catch (e2) {
            console.error(`❌ Ошибка при JavaScript клике: ${e2.message}`);
          }
        }
        
        // Выполняем клик по опции с использованием MouseEvent для более надежного клика
        try {
          // Фокусируем опцию
          if (typeof option.focus === 'function') {
            option.focus();
            await this.delay(100);
          }
          
          // Создаем и диспатчим события мыши
          const mouseEvents = ['mousedown', 'mouseup', 'click'];
          for (const eventType of mouseEvents) {
            const event = new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              buttons: 1
            });
            option.dispatchEvent(event);
            await this.delay(50);
          }
          
          // Также пробуем нативный click
          if (typeof option.click === 'function') {
            option.click();
          }
          
          await this.delay(500);
          
          // Проверяем, что значение действительно выбрано
          const selectedValue = this.getSelectedDropdownValue(appSelect);
          if (selectedValue && (selectedValue === value || selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
            console.log(`✅ Опция "${value}" выбрана успешно, текущее значение: "${selectedValue}"`);
            await this.delay(200);
            return true;
          } else {
            // Если значение не установилось, пробуем еще раз с большей задержкой
            console.log('⚠️ Значение не установилось после первого клика, пробую еще раз...');
            await this.delay(300);
            
            // Повторный клик
            for (const eventType of mouseEvents) {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
              });
              option.dispatchEvent(event);
              await this.delay(50);
            }
            if (typeof option.click === 'function') {
              option.click();
            }
            
            await this.delay(800);
            const retryValue = this.getSelectedDropdownValue(appSelect);
            if (retryValue && (retryValue === value || retryValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(retryValue.toLowerCase()))) {
              console.log(`✅ Опция "${value}" выбрана успешно после повтора, текущее значение: "${retryValue}"`);
              return true;
            } else {
              console.warn(`⚠️ Значение не установилось после клика. Ожидалось: "${value}", получено: "${retryValue || 'пусто'}"`);
              // Пробуем найти значение в других местах
              const resultElement = appSelect.querySelector('.result, [class*="result"], .select-box, [class*="select-box"]');
              if (resultElement) {
                const resultText = resultElement.textContent?.trim() || resultElement.innerText?.trim() || '';
                console.log(`ℹ️ Текст в result элементе: "${resultText}"`);
                if (resultText && (resultText === value || resultText.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(resultText.toLowerCase()))) {
                  console.log(`✅ Значение найдено в result элементе: "${resultText}"`);
                  return true;
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ Ошибка при клике по опции:', error);
        }
      } else {
        console.warn(`⚠️ Опция "${value}" не найдена в выбранной панели. Найдено опций: ${options.length}`);
        if (options.length > 0) {
          console.log('Доступные опции в выбранной панели:', options.slice(0, 10).map(opt => opt.textContent?.trim()).filter(Boolean));
        }
        
        // FALLBACK: Ищем опцию во ВСЕХ панелях на странице
        console.log(`🔍 FALLBACK: Ищу опцию "${value}" во всех панелях на странице...`);
        const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
        const allPanelsOnPage = Array.from(document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [role="listbox"], .cdk-overlay-pane'));
        
        for (const panel of allPanelsOnPage) {
          const panelRect = panel.getBoundingClientRect();
          if (panelRect.width > 0 && panelRect.height > 0 && panel.offsetParent !== null) {
            // Ищем все элементы с текстом в панели
            const allElements = Array.from(panel.querySelectorAll('*'));
            const realOptions = allElements.filter(el => {
              const text = el.textContent?.trim() || '';
              const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
              const rect = el.getBoundingClientRect();
              return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            });
            
            if (realOptions.length > 0) {
              console.log(`   📋 Проверяю панель ${panel.tagName.toLowerCase()} (${panel.className || 'нет классов'}): ${realOptions.length} опций`);
              
              // Ищем целевую опцию
              const foundOption = realOptions.find(opt => {
                const optText = opt.textContent?.trim() || '';
                const optValue = opt.getAttribute('value') || opt.dataset.value || optText;
                return optText === value || 
                       optValue === value ||
                       optText.toLowerCase() === value.toLowerCase() ||
                       optValue.toLowerCase() === value.toLowerCase() ||
                       optText.toLowerCase().includes(value.toLowerCase()) ||
                       optValue.toLowerCase().includes(value.toLowerCase()) ||
                       value.toLowerCase().includes(optText.toLowerCase());
              });
              
              if (foundOption) {
                console.log(`✅ Найдена опция "${value}" в другой панели!`);
                const optText = foundOption.textContent?.trim() || '';
                console.log(`   Текст опции: "${optText}"`);
                
                // Прокручиваем к опции и кликаем
                foundOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(300);
                
                try {
                  // Фокусируем опцию
                  if (typeof foundOption.focus === 'function') {
                    foundOption.focus();
                    await this.delay(100);
                  }
                  
                  // Создаем и диспатчим события мыши
                  const mouseEvents = ['mousedown', 'mouseup', 'click'];
                  for (const eventType of mouseEvents) {
                    const event = new MouseEvent(eventType, {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      buttons: 1
                    });
                    foundOption.dispatchEvent(event);
                    await this.delay(50);
                  }
                  
                  // Также пробуем нативный click
                  if (typeof foundOption.click === 'function') {
                    foundOption.click();
                  }
                  
                  await this.delay(500);
                  
                  // Проверяем, что значение действительно выбрано
                  const selectedValue = this.getSelectedDropdownValue(appSelect);
                  if (selectedValue && (selectedValue === value || selectedValue.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(selectedValue.toLowerCase()))) {
                    console.log(`✅ Опция "${value}" выбрана успешно через fallback, текущее значение: "${selectedValue}"`);
                    await this.delay(200);
                    return true;
                  } else {
                    console.warn(`⚠️ Значение не установилось после fallback клика. Ожидалось: "${value}", получено: "${selectedValue || 'пусто'}"`);
                  }
                } catch (error) {
                  console.error('❌ Ошибка при fallback клике по опции:', error);
                }
              }
            }
          }
        }
        
        // ПОСЛЕДНИЙ FALLBACK: Глобальный поиск по тексту (как в автотесте: browser.find_elements(By.CSS_SELECTOR, 'li, div, span'))
        console.log(`🔍 ПОСЛЕДНИЙ FALLBACK: Ищу опцию "${value}" глобально на странице (как в автотесте)...`);
        const globalOptionSelectors = ['li', 'div', 'span']; // Как в автотесте
        const allElementsOnPage = [];
        
        for (const selector of globalOptionSelectors) {
          try {
            allElementsOnPage.push(...Array.from(document.querySelectorAll(selector)));
          } catch (e) {
            // Игнорируем ошибки
          }
        }
        
        const visibleElementsWithText = allElementsOnPage.filter(el => {
          try {
            const text = el.textContent?.trim() || '';
            const rect = el.getBoundingClientRect();
            const isPlaceholder = ['выберите', 'select', 'choose', 'placeholder', 'статус'].some(ph => text.toLowerCase().includes(ph.toLowerCase()));
            return text && text.length > 0 && !isPlaceholder && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
          } catch (e) {
            return false;
          }
        });
        
        console.log(`   🔍 Найдено ${visibleElementsWithText.length} видимых элементов с текстом на странице`);
        
        // Ищем опцию по тексту (как в автотесте: if 'плановый' in option_text.lower())
        const valueLower = value.toLowerCase().trim();
        let globalOption = null;
        
        for (const el of visibleElementsWithText) {
          const elText = el.textContent?.trim() || '';
          const elTextLower = elText.toLowerCase();
          
          // Проверяем, содержит ли текст целевое значение (как в автотесте)
          if (elTextLower.includes(valueLower) && elTextLower !== 'выберите' && elTextLower !== 'статус') {
            // Проверяем, что элемент находится рядом с app-select (в пределах 1000px)
            const elRect = el.getBoundingClientRect();
            const appSelectRect = appSelect.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(elRect.left - appSelectRect.left, 2) + 
              Math.pow(elRect.top - appSelectRect.top, 2)
            );
            
            if (distance < 1000) {
              globalOption = el;
              console.log(`   ✅ Найдена потенциальная опция "${elText}" на расстоянии ${Math.round(distance)}px от dropdown`);
              break;
            }
          }
        }
        
        if (globalOption) {
          const optText = globalOption.textContent?.trim() || '';
          console.log(`✅ Найдена опция "${optText}" через глобальный поиск!`);
          
          // Прокручиваем к опции (как в автотесте: browser.execute_script("arguments[0].scrollIntoView(true);", planned_option))
          globalOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.delay(500);
          
          try {
            // Кликаем по опции (как в автотесте: planned_option.click())
            globalOption.click();
            console.log(`✅ Кликнул по опции "${optText}" через глобальный поиск`);
            await this.delay(500); // Задержка для применения изменений
            
            // Проверяем результат (как в автотесте)
            const selectedValue = this.getSelectedDropdownValue(appSelect);
            console.log(`🔍 Значение после глобального поиска: "${selectedValue}"`);
            
            if (selectedValue && (selectedValue.toLowerCase().includes(valueLower) || valueLower.includes(selectedValue.toLowerCase()))) {
              console.log(`✅ Опция "${value}" успешно выбрана через глобальный поиск!`);
              return true;
            } else {
              // Пробуем JavaScript клик (как в автотесте: browser.execute_script("arguments[0].click();", planned_option))
              console.log(`🔄 Пробую JavaScript клик (как в автотесте)...`);
              await this.delay(100);
              globalOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await this.delay(200);
              
              if (globalOption.click) {
                globalOption.click();
              } else {
                const clickEvent = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  buttons: 1
                });
                globalOption.dispatchEvent(clickEvent);
              }
              
              await this.delay(500);
              
              const selectedValue2 = this.getSelectedDropdownValue(appSelect);
              console.log(`🔍 Значение после JavaScript клика: "${selectedValue2}"`);
              
              if (selectedValue2 && (selectedValue2.toLowerCase().includes(valueLower) || valueLower.includes(selectedValue2.toLowerCase()))) {
                console.log(`✅ Опция "${value}" успешно выбрана через JavaScript клик!`);
                return true;
              }
            }
          } catch (e) {
            console.error(`❌ Ошибка при клике по опции через глобальный поиск: ${e.message}`);
          }
        } else {
          console.warn(`❌ Опция "${value}" не найдена ни в одной панели на странице и в глобальном поиске`);
        }
      }
    } else {
      console.warn('⚠️ Не найден кликабельный элемент в app-select');
    }
  }

  // Метод 6: Общий подход для элементов с role="combobox" или role="listbox"
  if (element.getAttribute('role') === 'combobox' || element.querySelector('[role="combobox"]')) {
    const combobox = element.querySelector('[role="combobox"]') || element;
    combobox.click();
    await this.delay(300);
    
    const options = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] [role="option"]'));
    const option = options.find(opt => 
      opt.textContent?.trim() === value || 
      opt.getAttribute('value') === value ||
      opt.textContent?.toLowerCase().includes(value.toLowerCase())
    );
    
    if (option) {
      option.click();
      await this.delay(300);
      return true;
    }
  }

  // Метод 7: Попытка найти по классу .input-project-status или .select-box
  if (element.classList.contains('input-project-status') || element.querySelector('.input-project-status')) {
    const container = element.querySelector('.input-project-status') || element;
    const selectBox = container.querySelector('.select-box, [class*="select"]');
    if (selectBox) {
      selectBox.click();
      await this.delay(500);
      
      const options = Array.from(document.querySelectorAll('[role="option"], .option-item, [class*="option"], li, div[class*="option"]'));
      const option = options.find(opt => {
        const optText = opt.textContent?.trim() || '';
        return optText === value || optText.toLowerCase().includes(value.toLowerCase());
      });
      
      if (option) {
        option.click();
        await this.delay(300);
        return true;
      }
    }
  }

  return false;
}

/**
 * Получает текущее выбранное значение из dropdown
 */
TestPlayer.prototype.getSelectedDropdownValue = function(appSelect) {
  if (!appSelect) return '';
  const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
  const hasPlaceholder = (text) => placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
  const isLikelyOptionsContainer = (el, text) => {
    if (!el || !(el instanceof Element)) return false;
    const cls = (el.className || '').toString().toLowerCase();
    const role = (el.getAttribute && el.getAttribute('role')) || '';
    const optionNodes = el.querySelectorAll ? el.querySelectorAll('[role="option"], .option, .result__content, .result__item, .group-item') : [];
    const looksLikePanelClass =
      cls.includes('panel') ||
      cls.includes('overlay') ||
      cls.includes('options') ||
      cls.includes('select-group') ||
      cls.includes('__result') ||
      role === 'listbox';
    // Контейнеры опций часто содержат несколько option-узлов и длинный "склеенный" текст.
    return looksLikePanelClass || (optionNodes && optionNodes.length >= 2 && String(text || '').length > 35);
  };
  const normalizeCandidate = (text, sourceEl) => {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (hasPlaceholder(raw)) return '';
    if (isLikelyOptionsContainer(sourceEl, raw)) {
      if (typeof this.parseSelectedOptionFromText === 'function') {
        const parsed = this.parseSelectedOptionFromText(raw, '');
        if (parsed && !hasPlaceholder(parsed)) return parsed;
      }
      return '';
    }
    if (raw.length > 80 && typeof this.parseSelectedOptionFromText === 'function') {
      const parsed = this.parseSelectedOptionFromText(raw, '');
      if (parsed && !hasPlaceholder(parsed)) return parsed;
    }
    return raw;
  };
  
  // Ищем скрытый input
  const hiddenInput = appSelect.querySelector('input[type="hidden"]');
  if (hiddenInput && hiddenInput.value) {
    const normalizedHidden = normalizeCandidate(hiddenInput.value, hiddenInput);
    if (normalizedHidden) return normalizedHidden;
  }

  // Для combobox/searchable dropdown предпочитаем значение видимого input.
  const visibleInput = appSelect.querySelector('input[role="combobox"], input[type="text"], input[type="search"]');
  if (visibleInput && visibleInput.value) {
    const normalizedVisible = normalizeCandidate(visibleInput.value, visibleInput);
    if (normalizedVisible) return normalizedVisible;
  }
  
  // Ищем элемент с классом .result или .select-box, который содержит выбранное значение
  const resultSelectors = [
    '.result',
    '[class*="result"]',
    '.select-box',
    '[class*="select-box"]',
    '[id*="result"]',
    '[id*="value"]'
  ];
  
  for (const selector of resultSelectors) {
    const resultElement = appSelect.querySelector(selector);
    if (resultElement) {
      // Пробуем разные способы получения текста
      let text = resultElement.textContent?.trim() || 
                 resultElement.innerText?.trim() || 
                 resultElement.getAttribute('aria-label') ||
                 resultElement.getAttribute('title') ||
                 '';
      const normalized = normalizeCandidate(text, resultElement);
      if (normalized) return normalized;
    }
  }
  
  // Ищем элемент с атрибутом value
  const valueElement = appSelect.querySelector('[value]:not([value=""])');
  if (valueElement && valueElement.value) {
    const normalizedValue = normalizeCandidate(valueElement.value, valueElement);
    if (normalizedValue) return normalizedValue;
  }
  
  // Ищем через data-value
  const dataValueElement = appSelect.querySelector('[data-value]');
  if (dataValueElement && dataValueElement.dataset.value) {
    const normalizedDataValue = normalizeCandidate(dataValueElement.dataset.value, dataValueElement);
    if (normalizedDataValue) return normalizedDataValue;
  }
  
  // Ищем через ng-reflect-value (Angular)
  const ngValueElement = appSelect.querySelector('[ng-reflect-value]');
  if (ngValueElement && ngValueElement.getAttribute('ng-reflect-value')) {
    const normalizedNgValue = normalizeCandidate(ngValueElement.getAttribute('ng-reflect-value'), ngValueElement);
    if (normalizedNgValue) return normalizedNgValue;
  }
  
  // Ищем в дочерних элементах с текстом
  const allChildren = Array.from(appSelect.querySelectorAll('*'));
  for (const child of allChildren) {
    const text = child.textContent?.trim() || child.innerText?.trim() || '';
    const normalized = normalizeCandidate(text, child);
    if (normalized && normalized.length < 100) return normalized;
  }
  
  return '';
}

/**
 * Возвращает текущее значение поля (input, select, кастомный dropdown) для проверки заполнения.
 * @param {Element} element - DOM-элемент
 * @param {{ isDropdown?: boolean }} [options]
 * @returns {string}
 */
TestPlayer.prototype.getFieldCurrentValue = function(element, options = {}) {
  if (!element) return '';
  const tagName = element.tagName?.toLowerCase() || '';
  if (tagName === 'select') {
    const opt = element.options[element.selectedIndex];
    return (opt && (opt.textContent?.trim() || opt.value)) || element.value || '';
  }
  if (tagName === 'input' || tagName === 'textarea') {
    return (element.value || '').trim();
  }
  if (options.isDropdown !== false && this.isDropdownElement(element)) {
    return this.getSelectedDropdownValue(element) || '';
  }
  if (element.value !== undefined && element.value != null) {
    return String(element.value).trim();
  }
  const text = element.textContent?.trim() || element.innerText?.trim() || '';
  return text;
}

/**
 * Проверяет, что поле заполнено ожидаемым значением после ввода/выбора.
 * @param {Element} element - DOM-элемент
 * @param {string} expectedValue - ожидаемое значение (уже обработанное переменными)
 * @param {{ actionType?: string, strict?: boolean }} [options] - strict: только точное совпадение
 * @returns {boolean}
 */
TestPlayer.prototype.verifyFieldFilled = function(element, expectedValue, options = {}) {
  if (!element) return false;
  const expected = (expectedValue != null ? String(expectedValue) : '').trim();
  if (expected === '') return true; // пустое значение считаем успехом
  const current = this.getFieldCurrentValue(element, { isDropdown: true });
  const cur = current.trim();
  const exp = expected.trim();
  if (options.strict) {
    return cur === exp;
  }
  return cur === exp ||
    cur.toLowerCase().includes(exp.toLowerCase()) ||
    exp.toLowerCase().includes(cur.toLowerCase());
}

/**
 * Собирает список альтернативных селекторов для повторной попытки заполнения (userSelectors + alternatives).
 * @param {Object} action - действие с selector
 * @returns {Array<Object>} массив объектов селекторов
 */
TestPlayer.prototype.getAlternativesForFillRetry = function(action) {
  const list = [];
  const primarySelector = action?.selector?.selector || action?.selector?.value;
  const userSelectors = this.getUserSelectors(action) || [];
  for (const u of userSelectors) {
    if (!u?.selector) continue;
    if (u.selector === primarySelector) continue;
    list.push(u);
  }
  const alts = action?.selector?.alternatives;
  if (Array.isArray(alts)) {
    for (const alt of alts) {
      if (alt?.selector === primarySelector) continue;
      list.push(alt);
    }
  }
  return list;
}

/**
 * Если поле не заполнилось — повторяет заполнение по альтернативным селекторам; при неудаче выбрасывает ошибку ().
 * @param {Object} action - действие (selector будет временно подменяться)
 * @param {string} processedValue - обработанное значение
 * @param {'input'|'change'} actionType
 * @param {Element} currentElement - элемент, по которому уже выполняли заполнение (для проверки)
 * @throws {Error} если ни основной, ни альтернативные селекторы не привели к заполнению
 */
})();
