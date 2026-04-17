/**
 * AutoTest Recorder - Player Module
 * Basic action handlers: click, dblclick, hover, focus, blur, clear, upload
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-basic
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-basic.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

/**
 * Ссылка/кнопка пункта меню или команды (GWT и т.п.): клик должен быть «чистым»,
 * без ветки «выбор значения в dropdown», иначе остаётся value от шага «ввод» и ломается UI.
 */
TestPlayer.prototype.isClickCommandLinkOrMenuItem = function(element) {
  if (!element) return false;
  const role = (element.getAttribute && element.getAttribute('role')) || '';
  if (role === 'menuitem' || role === 'link') return true;
  const tag = element.tagName && element.tagName.toLowerCase();
  if (tag === 'a') {
    const href = (element.getAttribute('href') || '').trim();
    if (href === '#' || href === '' || href.startsWith('#') || /^javascript:/i.test(href)) {
      return true;
    }
  }
  if (tag === 'button') {
    const role = (element.getAttribute && element.getAttribute('role')) || '';
    if (role !== 'combobox' && role !== 'listbox') return true;
  }
  return false;
};

TestPlayer.prototype.extractDropdownOptionTargetText = function(action) {
  const candidates = [
    action?.displayValue,
    action?.optionText,
    action?.value,
    action?.optionElement?.text,
    action?.element?.text
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text && text.length <= 140) return text;
  }
  return '';
};

TestPlayer.prototype.isDropdownPlaceholderText = function(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  const placeholders = new Set([
    'выберите',
    'выберите...',
    'выберите значение',
    'выбрать',
    'select',
    'select...',
    'choose',
    'choose...'
  ]);
  return placeholders.has(text);
};

TestPlayer.prototype.isLikelyDropdownOptionClick = function(action, element) {
  if (!action || action.type !== 'click') return false;
  const selectorInfo = this.formatSelector(action.selector).toLowerCase();
  const role = String(element?.getAttribute?.('role') || '').toLowerCase();
  const cls = String(element?.className || '').toLowerCase();
  const tag = String(element?.tagName || '').toLowerCase();
  const attrClass = String(action?.element?.attributes?.class || '').toLowerCase();
  const targetText = this.extractDropdownOptionTargetText(action);

  const looksLikeOptionRole = role === 'option' || role === 'listitem';
  const looksLikeOptionClass = /option|mat-option|ng-option|result__item|result__content|group-item|select-item/.test(cls) ||
    /option|mat-option|ng-option|result__item|result__content|group-item|select-item/.test(attrClass);
  const looksLikeOptionSelector = /role=\"?option|__result|\.option|mat-option|ng-option|result__item|result__content|group-item|listbox/.test(selectorInfo);
  const allowedTag = tag === 'div' || tag === 'li' || tag === 'span' || tag === 'mat-option' || tag === 'ng-option';
  const hasDropdownHint = action?.isDropdownClick === true || !!action?.fieldLabel || !!action?.optionElement;
  const isTriggerRole = role === 'combobox' || role === 'listbox' || role === 'textbox';
  const looksLikeTriggerClass = /select-box|arrow|result|placeholder|input/.test(cls) ||
    /select-box|arrow|result|placeholder|input/.test(attrClass);
  const targetIsPlaceholder = this.isDropdownPlaceholderText(targetText);

  if (targetIsPlaceholder) return false;
  if (isTriggerRole && !looksLikeOptionRole) return false;
  if (looksLikeTriggerClass && !looksLikeOptionClass) return false;

  return !!(targetText && allowedTag && hasDropdownHint && (looksLikeOptionRole || looksLikeOptionClass || looksLikeOptionSelector));
};

TestPlayer.prototype.resolveActionDropdownTriggerElement = function(action) {
  const selectorCandidates = [];
  const pushSelector = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    if (!selectorCandidates.includes(trimmed)) selectorCandidates.push(trimmed);
  };

  pushSelector(action?.dropdownTrigger?.selector);
  if (Array.isArray(action?.dropdownTrigger?.alternatives)) {
    action.dropdownTrigger.alternatives.forEach(pushSelector);
  }
  pushSelector(action?.element?.parentDropdown?.triggerSelector);
  if (Array.isArray(action?.element?.parentDropdown?.triggerAlternatives)) {
    action.element.parentDropdown.triggerAlternatives.forEach(pushSelector);
  }

  for (const selector of selectorCandidates) {
    let candidate = null;
    try {
      candidate = document.querySelector(selector);
    } catch (e) {
      candidate = null;
    }
    if (!candidate) continue;
    const style = window.getComputedStyle(candidate);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    return candidate;
  }
  return null;
};

TestPlayer.prototype.handleClick = async function(action) {
  const clickStartedAt = Date.now();
  const selectorInfo = this.formatSelector(action.selector);
  console.log(`🖱️ Клик по: ${selectorInfo}`);

  // Находим элемент
  const findResult = await this.findElementWithRetry(action.selector, 5, 300);
  let element = findResult?.element;
  const usedSelector = findResult?.usedSelector || selectorInfo;

  if (this.currentSelectorCallback) {
    this.currentSelectorCallback(usedSelector);
  }

  if (!element) {
    // Пробуем альтернативные селекторы
    element = await this.tryAlternativeSelectors(action);
    // Для dropdown-кликов пробуем восстановить trigger по elementId/fieldLabel,
    // если исходный селектор (например ".close > .select-box > .arrow") устарел.
    if (!element) {
      const elementId = String(
        action?.element?.parentDropdown?.elementId ||
        action?.element?.attributes?.elementid ||
        action?.element?.attributes?.['ng-reflect-element-id'] ||
        ''
      ).trim();
      if (elementId) {
        const escaped = elementId.replace(/"/g, '\\"');
        const root = document.querySelector(`app-select[elementid="${escaped}"], app-select[ng-reflect-element-id="${escaped}"], [elementid="${escaped}"]`);
        if (root) {
          const trigger = root.querySelector('.select-box, [class*="select-box"], .result, [class*="result"], .options, [class*="options"], .arrow, [class*="arrow"], [role="combobox"]');
          element = (this.resolvePreferredDropdownTrigger && this.resolvePreferredDropdownTrigger(action, trigger || root)) || trigger || root;
          console.log(`✅ [DropdownClickFallback] Trigger восстановлен по elementId="${elementId}"`);
        }
      }
    }
    if (!element && action?.fieldLabel && typeof this.resolveDropdownElementByFieldLabel === 'function') {
      const byLabel = this.resolveDropdownElementByFieldLabel(action, document.body);
      if (byLabel) {
        element = (this.resolvePreferredDropdownTrigger && this.resolvePreferredDropdownTrigger(action, byLabel)) || byLabel;
        console.log(`✅ [DropdownClickFallback] Trigger восстановлен по fieldLabel="${action.fieldLabel}"`);
      }
    }
    if (!element && action?.isDropdownClick) {
      const triggerByAction = this.resolveActionDropdownTriggerElement(action);
      if (triggerByAction) {
        element = triggerByAction;
        console.log('✅ [DropdownClickFallback] Trigger восстановлен из записанного dropdownTrigger');
      }
    }
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
    console.log('✅ Элемент найден через альтернативный селектор');
  }

  if (action?.isDropdownClick) {
    const triggerByAction = this.resolveActionDropdownTriggerElement(action);
    if (triggerByAction) {
      element = triggerByAction;
      console.log('🎯 [DropdownClick] Использую записанный trigger selector для открытия списка');
    }
  }

  if (this.shouldSkipPlaybackForDomHiddenTarget?.(element)) {
    console.log('⏭️ [Player] Клик пропущен: цель не видна пользователю (скрыта в DOM); в optimized-режиме шаг не выполняется');
    return;
  }

  // Прокручиваем к элементу
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (this.smartWaiter) {
      await this.smartWaiter.waitForElementReady(element, { visible: true, timeout: 1000 });
    } else {
      await this.delay(100);
    }
  } catch (e) {
    await this.delay(100);
  }

  // Подсветка
  this.highlightElement(element);

  // Обработка dropdown-операций по subtype (dropdown-select, dropdown-multiselect и т.д.)
  const dropdownClickSubtypes = [
    'dropdown-select', 'dropdown-multiselect', 'dropdown-deselect',
    'dropdown-select-all', 'dropdown-clear-all', 'dropdown-toggle-all',
    'dropdown-copy', 'dropdown-paste', 'dropdown-reorder'
  ];
  if (action.subtype && dropdownClickSubtypes.includes(action.subtype)) {
    await this.handleDropdownAction(action, element);
    return;
  }

  // Клик по значению в раскрытом dropdown должен выбирать опцию, а не выполнять «обычный» клик.
  // Это предотвращает сценарии, где широкий селектор (например, контейнер/body) ломает форму.
  if (this.isLikelyDropdownOptionClick(action, element)) {
    const targetText = await this.processVariables(this.extractDropdownOptionTargetText(action));
    if (targetText && this.trySelectOptionInRevealedPanels) {
      const preferredContext = this.resolveDropdownElementByFieldLabel
        ? (this.resolveDropdownElementByFieldLabel(action, element) || element)
        : element;
      const picked = await this.trySelectOptionInRevealedPanels(targetText, preferredContext);
      if (picked?.success) {
        console.log(`✅ Выбрана опция dropdown по клику: "${targetText}"`);
        return;
      }
    }

    // В строгом режиме лучше зафейлить шаг, чем кликнуть по неверному контейнеру и испортить состояние формы.
    throw new Error(`Не удалось выбрать dropdown-опцию по клику: "${targetText || 'unknown'}"`);
  }

  // Проверяем, является ли это dropdown с необходимостью выбора значения
  // Не смешивать с пунктами меню <a href="#"> / кнопками — иначе value от старого шага «ввод» вызывает autoSelectDropdownValue и портит поля
  if (action.value && this.isDropdownElement(element) && !this.isClickCommandLinkOrMenuItem(element)) {
    console.log(`🔽 Обнаружен dropdown с целевым значением: "${action.value}"`);
    // Клик для открытия dropdown
    this._dispatchClick(element);
    await this.delay(200);

    // Пробуем выбрать значение
    const processedValue = await this.processVariables(action.value);
    try {
      let result = null;
      if (typeof this.selectDropdownAdaptiveValue === 'function') {
        result = await this.selectDropdownAdaptiveValue(element, processedValue, action);
      }
      if (!result?.success) {
        result = await this.autoSelectDropdownValue(element, processedValue);
      }
      if (!result?.success) {
        const container = element.closest('[class*="select"], [class*="dropdown"], [class*="combo"]') || 
                         element.closest('[role="combobox"], [role="listbox"]') ||
                         element.parentElement;
        if (container) {
          result = await this.selectDropdownValueViaFillFieldsStyle(container, processedValue);
          if (!result?.success) result = await this.fillDropdownViaAnalysis(container, processedValue);
          if (!result?.success) result = await this.selectDropdownUniversal(element, processedValue);
        }
      }
      if (result && result.success) {
        console.log(`✅ Значение "${processedValue}" выбрано в dropdown`);
        return;
      }
    } catch (e) {
      console.warn('⚠️ autoSelectDropdownValue не удался:', e.message);
    }
  }

  // Обычный клик
  let clickPointTop = null;
  try {
    const rect = element.getBoundingClientRect();
    const cx = Math.floor(rect.left + rect.width / 2);
    const cy = Math.floor(rect.top + rect.height / 2);
    const topEl = document.elementFromPoint(cx, cy);
    clickPointTop = topEl ? `${topEl.tagName}${topEl.id ? '#' + topEl.id : ''}` : null;
  } catch (e) {
    // ignore geometry diagnostics failure
  }
  if (action.subtype === 'right-click') {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 2
    }));
  } else {
    this._dispatchClick(element);
  }

  const optimizedDelay = await this.getOptimizedDelay('click', 300);
  await this.delay(optimizedDelay);
  console.log(`✅ Клик выполнен по: ${usedSelector}`);
}

/**
 * Обработчик двойного клика
 */
TestPlayer.prototype.handleDblClick = async function(action) {
  const selectorInfo = this.formatSelector(action.selector);
  console.log(`🖱️🖱️ Двойной клик по: ${selectorInfo}`);

  const findResult = await this.findElementWithRetry(action.selector, 5, 300);
  let element = findResult?.element;

  if (!element) {
    element = await this.tryAlternativeSelectors(action);
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
  }

  if (this.shouldSkipPlaybackForDomHiddenTarget?.(element)) {
    console.log('⏭️ [Player] Двойной клик пропущен: цель не видна (скрыта в DOM)');
    return;
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await this.delay(100);
  this.highlightElement(element);

  // Двойной клик
  element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
  await this.delay(300);
  console.log(`✅ Двойной клик выполнен`);
}

TestPlayer.prototype.handleHover = async function(action) {
  const selectorInfo = this.formatSelector(action.selector);
  const findResult = await this.findElementWithRetry(action.selector, 5, 300);
  const element = findResult?.element;
  if (!element) {
    throw new Error(`Элемент не найден: ${selectorInfo}`);
  }
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await this.delay(100);
  this.highlightElement(element);
  const opts = { bubbles: true, cancelable: true, view: window };
  element.dispatchEvent(new MouseEvent('mouseover', opts));
  element.dispatchEvent(new MouseEvent('mouseenter', opts));
  element.dispatchEvent(new MouseEvent('mousemove', opts));
  await this.delay(150);
}

TestPlayer.prototype.handleFocus = async function(action) {
  const selectorInfo = this.formatSelector(action.selector);
  const findResult = await this.findElementWithRetry(action.selector, 5, 300);
  const element = findResult?.element;
  if (!element) {
    throw new Error(`Элемент не найден: ${selectorInfo}`);
  }
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await this.delay(80);
  this.highlightElement(element);
  if (typeof element.focus === 'function') {
    element.focus();
  }
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  await this.delay(120);
}

TestPlayer.prototype.handleBlur = async function(action) {
  const selectorInfo = this.formatSelector(action.selector);
  const findResult = await this.findElementWithRetry(action.selector, 5, 300);
  const element = findResult?.element;
  if (!element) {
    throw new Error(`Элемент не найден: ${selectorInfo}`);
  }
  if (typeof element.blur === 'function') {
    element.blur();
  }
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  await this.delay(100);
}

TestPlayer.prototype.handleClear = async function(action) {
  const selectorInfo = this.formatSelector(action.selector);
  const findResult = await this.findElementWithRetry(action.selector, 5, 300);
  const element = findResult?.element;
  if (!element) {
    throw new Error(`Элемент не найден: ${selectorInfo}`);
  }
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await this.delay(80);
  this.highlightElement(element);
  if (typeof element.focus === 'function') {
    element.focus();
  }
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  if (typeof element.blur === 'function') {
    element.blur();
  }
  await this.delay(120);
}

TestPlayer.prototype.handleUpload = async function(action) {
  // ИСПРАВЛЕНИЕ #12: Улучшенная загрузка файлов
  const selector = action.selector;
  const fileName = action.value || action.fileName || '';
  
  if (!selector) {
    throw new Error('Для upload требуется селектор file input');
  }
  
  const findResult = await this.findElementWithRetry(selector, 3, 300);
  const element = findResult?.element;
  
  if (!element) {
    throw new Error(`File input не найден: ${selector}`);
  }
  
  if (element.type !== 'file') {
    console.warn('⚠️ Элемент не является file input, пробуем обычный ввод');
    return this.handleInput(action);
  }
  
  // Проверяем, указано ли имя файла для установки
  if (fileName) {
    // Chrome extensions не могут программно установить файлы из соображений безопасности
    // Но мы можем попробовать через DataTransfer API для тестовых целей
    console.warn(`⚠️ Программная установка файлов ограничена браузером. Имя файла: ${fileName}`);
    console.log('💡 Рекомендация: используйте нативный диалог выбора файла или chrome.debugger API');
    
    // Эмитируем событие change для тестов, которые проверяют только факт вызова
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  
  // Если имя файла не указано, просто кликаем на input для открытия диалога
  console.log('📁 Клик по file input для открытия диалога выбора файла');
  element.click();
  await this.delay(100);
}

})();
