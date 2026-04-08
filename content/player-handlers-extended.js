/**
 * AutoTest Recorder - Player Module
 * Extended: change, scroll, keyboard, wait, resume, debug, playback state
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-extended
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-extended.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

  /**
   * Внутри {@code app-select} ищет типичную точку открытия (вложенный div), без глобального пути по приложению.
   * @param {Element|null} host корень app-select
   * @returns {Element|null}
   */
  function getAppSelectNestedOpenTarget(host) {
    if (!host || typeof host.querySelector !== 'function') return null;
    try {
      const hit = host.querySelector('div > div > div > div:nth-of-type(3)');
      return hit instanceof Element ? hit : null;
    } catch (e) {
      return null;
    }
  }

TestPlayer.prototype.retryFillWithAlternativesOrThrow = async function(action, processedValue, actionType, currentElement) {
  const verify = (el) => el && this.verifyFieldFilled(el, processedValue, { actionType });
  if (verify(currentElement)) {
    return;
  }
  const alternatives = this.getAlternativesForFillRetry(action);
  if (alternatives.length === 0) {
    const msg = `Поле не заполнено ожидаемым значением "${processedValue}" (${actionType}), альтернативных селекторов нет`;
    console.warn('⚠️', msg);
    throw new Error(msg);
  }
  const originalSelector = action.selector;
  let filled = false;
  this._fillRetryInProgress = true;
  try {
    for (const alt of alternatives) {
      try {
        action.selector = alt;
        if (actionType === 'input') {
          await this.handleInput(action);
        } else {
          await this.handleChange(action);
        }
        const el = this.selectorEngine.findElementSync(alt);
        if (verify(el)) {
          console.log('✅ Поле заполнено после повтора по альтернативному селектору:', alt?.selector || alt);
          action.selector = alt; // сохраняем сработавший селектор как основной на будущее
          filled = true;
          return;
        }
      } catch (e) {
        console.warn('⚠️ Повтор по альтернативному селектору не удался:', alt?.selector, e.message);
      } finally {
        if (!filled) action.selector = originalSelector;
      }
    }
  } finally {
    this._fillRetryInProgress = false;
    if (!filled) action.selector = originalSelector;
  }
  const msg = `Поле не заполнено значением "${processedValue}" после всех попыток (основной + ${alternatives.length} альтернатив)`;
  console.error('❌', msg);
  throw new Error(msg);
}

TestPlayer.prototype.handleChange = async function(action) {
  const selectorInfo = action.selector?.selector || action.selector?.value || JSON.stringify(action.selector);
  
  // Обрабатываем переменные в значении
  const processedValue = await this.processVariables(action.value);
  console.log('🔄 Выполняю изменение:', processedValue, 'в', selectorInfo);
  if (processedValue !== action.value) {
    console.log(`   📝 Исходное значение: "${action.value}" → Обработанное: "${processedValue}"`);
  }
  
  // Пробуем найти элемент с несколькими попытками
  const findResult = await this.findElementWithRetry(action.selector, 3);
  let element = findResult?.element; // Всегда извлекаем element из результата
  const usedSelector = findResult?.usedSelector || this.formatSelector(action.selector);
  
  if (this.currentSelectorCallback) {
    this.currentSelectorCallback(usedSelector);
  }
  
  if (!element) {
    // Пробуем альтернативные селекторы; ошибку логируем только если и они не сработали
    element = await this.tryAlternativeSelectors(action);
    if (!element) {
      const errorMsg = `Элемент не найден: ${selectorInfo}`;
      console.error('❌ Элемент не найден после всех попыток (включая запасные селекторы):', selectorInfo);
      throw new Error(errorMsg);
    }
    console.log('✅ Элемент найден по запасному селектору');
  } else {
    console.log('✅ Элемент найден');
  }

  // Умные ожидания по типу элемента
  try {
    if (typeof this.waitForElementReady === 'function') {
      await this.waitForElementReady(element, 'change');
    } else if (this.smartWaiter) {
      await this.smartWaiter.waitForElementReady(element, { visible: true, timeout: 2000 });
    } else {
      await this.delay(150);
    }
  } catch (waitError) {
    throw waitError;
  }
  
  if (element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.delay(500);
  } else {
    console.warn('⚠️ Элемент не является DOM-элементом или scrollIntoView недоступен');
    await this.delay(300);
  }

  this.highlightElement(element, '#9C27B0');
  await this.delay(300);

  const tagName = element.tagName?.toLowerCase() || '';
  
  // Проверяем, является ли это стандартным SELECT элементом
  let branch = 'other';
  if (tagName === 'select') {
    branch = 'select';
    console.log(`📝 Устанавливаю значение в SELECT: "${processedValue}"`);
    
    // #22: Приоритет поиска опции:
    // 1. По тексту опции (selectedOptionText из recorder)
    // 2. По значению (value)
    // 3. По тексту (processedValue)
    let foundOption = null;
    
    // Сначала пробуем найти по selectedOptionText (если записано с текстом опции)
    if (action.selectedOptionText) {
      foundOption = Array.from(element.options).find(opt => 
        opt.textContent?.trim() === action.selectedOptionText ||
        opt.label?.trim() === action.selectedOptionText
      );
      if (foundOption) {
        console.log(`✅ Найдена опция по selectedOptionText: "${action.selectedOptionText}"`);
      }
    }
    
    // Если не нашли, пробуем по значению
    if (!foundOption) {
      foundOption = Array.from(element.options).find(opt => opt.value === processedValue);
      if (foundOption) {
        console.log(`✅ Найдена опция по value: "${processedValue}"`);
      }
    }
    
    // Если не нашли, пробуем по тексту
    if (!foundOption) {
      foundOption = Array.from(element.options).find(opt => 
        opt.textContent?.trim() === processedValue ||
        opt.textContent?.toLowerCase().includes(processedValue.toLowerCase()) ||
        opt.label?.trim() === processedValue
      );
      if (foundOption) {
        console.log(`✅ Найдена опция по тексту: "${processedValue}"`);
      }
    }
    
    if (foundOption) {
      element.value = foundOption.value;
    } else {
      console.warn(`⚠️ Опция "${processedValue}" не найдена в SELECT, устанавливаю значение напрямую`);
      element.value = processedValue;
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (tagName === 'input' || tagName === 'textarea') {
    branch = 'input_or_textarea';
    // Проверяем, является ли это файловым input
    const inputType = element.type?.toLowerCase() || '';
    if (inputType === 'file') {
      // Пытаемся использовать сохраненный файл из настроек
      const fileSet = await this.setFileToInput(element, processedValue);
      if (fileSet) {
        console.log('✅ Файл успешно установлен в input');
        return;
      }
      
      // Если файл не найден, предупреждаем
      console.warn('⚠️ Файл не найден в настройках или невозможно установить программно');
      console.warn(`   📁 Ожидаемый файл: ${processedValue}`);
      console.warn('   💡 Загрузите файл в настройках плагина или выполните действие вручную');
      // Не выбрасываем ошибку, просто пропускаем это действие
      return;
    }
    
    // input с role="combobox" или id="account" (поле ФИО/сотрудник): ввод + выбор из выпадающего списка
    const isComboboxInput = element.getAttribute('role') === 'combobox' ||
      element.getAttribute('aria-haspopup') === 'listbox' ||
      element.id === 'account' ||
      (element.type === 'search' && /сотрудник|account|фio|fio|user|пользователь/i.test(element.name || element.placeholder || element.id || ''));
    if (isComboboxInput) {
      const searchText = String(processedValue || '').trim();
      if (searchText) {
        try {
          await this.handleDropdownDatalistCombobox(element, searchText, 'dropdown-combobox');
          console.log(`✅ Изменение (combobox): введено "${searchText}"`);
          await this.delay(300);
          return;
        } catch (e) {
          console.warn('⚠️ Combobox не сработал, fallback к прямому вводу:', e.message);
        }
      }
    }
    
    // Обычное текстовое поле - просто устанавливаем значение
    console.log(`📝 Устанавливаю значение в текстовое поле (${tagName}): "${processedValue}"`);
    
    const doc = element.ownerDocument || document;
    const win = doc.defaultView || window;
    try {
      if (typeof element.focus === 'function') element.focus();
    } catch (e) {
      if (!String(e?.message || '').includes('Illegal invocation')) console.warn('⚠️ focus:', e?.message);
    }
    try {
      this.setNativeInputValue(element, '');
      this.setNativeInputValue(element, processedValue);
    } catch (e) {
      console.warn('⚠️ Не удалось установить value (пробую напрямую):', e?.message);
      try {
        element.value = '';
        element.value = processedValue;
      } catch (e2) {
        throw new Error('Ввод в поле недоступен: ' + (e2?.message || 'Illegal invocation'));
      }
    }
    try {
      element.dispatchEvent(new Event('input', { bubbles: true, view: win }));
      element.dispatchEvent(new Event('change', { bubbles: true, view: win }));
      if (element.dispatchEvent) {
        element.dispatchEvent(new Event('blur', { bubbles: true, view: win }));
      }
    } catch (e) {
      if (!String(e?.message || '').includes('Illegal invocation')) console.warn('⚠️ dispatchEvent:', e?.message);
    }
  } else {
    branch = 'custom_or_generic';
    // Пробуем обработать как кастомный dropdown только если это не текстовое поле
    const valueForDropdown = processedValue == null || String(processedValue).trim() === '' || String(processedValue).trim().toLowerCase() === 'undefined'
      ? null
      : processedValue;
    if (valueForDropdown == null) {
      console.warn('⚠️ CHANGE для кастомного элемента без значения (undefined/пусто), пропускаю шаг');
      await this.delay(300);
      return;
    }
    console.log(`📝 Пробую установить значение в кастомный элемент (${tagName}): "${valueForDropdown}"`);
    
    // Проверяем, является ли это dropdown элементом
    const isDropdown = this.isDropdownElement(element);
    
    if (isDropdown) {
      const handled = await this.handleCustomDropdown(element, valueForDropdown);
      
      if (!handled) {
        // Fallback: пробуем стандартный способ
        if (element.value !== undefined) {
          element.value = valueForDropdown;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          console.warn('⚠️ Не удалось установить значение для кастомного элемента, пробую клик по опции');
          // Последняя попытка: ищем любой элемент с нужным текстом и кликаем
          const allElements = Array.from(document.querySelectorAll('*'));
          const valStr = String(valueForDropdown);
          const matchingElement = allElements.find(el => 
            el.textContent?.trim() === valStr ||
            el.textContent?.toLowerCase().includes(valStr.toLowerCase())
          );
          if (matchingElement) {
            matchingElement.click();
            await this.delay(300);
          }
        }
      }
    } else {
      // Не dropdown и не текстовое поле - пробуем установить значение напрямую
      console.log(`📝 Пробую установить значение напрямую в элемент ${tagName}`);
      if (element.value !== undefined) {
        element.value = valueForDropdown;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        console.warn(`⚠️ Не удалось установить значение для элемента ${tagName}`);
      }
    }
  }
  
  await this.delay(500);
  if (!this._fillRetryInProgress && !this.verifyFieldFilled(element, processedValue)) {
    await this.retryFillWithAlternativesOrThrow(action, processedValue, 'change', element);
  }
}

TestPlayer.prototype.setFileToInput = async function(inputElement, fileNameOrId) {
  try {
    // Получаем настройки из chrome.storage
    const result = await chrome.storage.local.get('pluginSettings');
    const settings = result.pluginSettings;
    
    if (!settings || !settings.files || !settings.files.uploaded || settings.files.uploaded.length === 0) {
      console.warn('⚠️ Нет загруженных файлов в настройках');
      return false;
    }

    // Ищем файл по имени или ID
    // Сначала пробуем точное совпадение, затем частичное
    let fileData = settings.files.uploaded.find(f => 
      f.name === fileNameOrId || 
      f.id.toString() === fileNameOrId.toString()
    );
    
    // Если не нашли точное совпадение, ищем по частичному совпадению имени
    if (!fileData) {
      const fileNameLower = fileNameOrId.toLowerCase();
      fileData = settings.files.uploaded.find(f => 
        f.name.toLowerCase() === fileNameLower ||
        f.name.toLowerCase().includes(fileNameLower) ||
        fileNameLower.includes(f.name.toLowerCase())
      );
    }

    if (!fileData) {
      console.warn(`⚠️ Файл "${fileNameOrId}" не найден в настройках`);
      return false;
    }

    // Конвертируем base64 обратно в File
    const byteCharacters = atob(fileData.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const file = new File([byteArray], fileData.name, { type: fileData.type || 'application/octet-stream' });

    // Используем DataTransfer API для установки файла
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Устанавливаем files в input
    inputElement.files = dataTransfer.files;

    // Диспатчим события для уведомления приложения
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));

    console.log(`✅ Файл "${fileData.name}" успешно установлен в input`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка при установке файла:', error);
    return false;
  }
}

TestPlayer.prototype._scrollElementIntoView = function(element) {
  if (!element || typeof element.scrollIntoView !== 'function') return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  // После scrollIntoView проверяем, что элемент в зоне видимости окна; при необходимости доп. прокрутка
  requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect();
    const pad = 20;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let dy = 0;
    let dx = 0;
    if (rect.top < pad) dy = rect.top - pad;
    else if (rect.bottom > vh - pad) dy = rect.bottom - (vh - pad);
    if (rect.left < pad) dx = rect.left - pad;
    else if (rect.right > vw - pad) dx = rect.right - (vw - pad);
    if (dy !== 0 || dx !== 0) {
      window.scrollBy({ top: dy, left: dx, behavior: 'smooth' });
    }
  });
}

TestPlayer.prototype.handleScroll = async function(action) {
  const subtype = action.subtype || '';
  if (subtype === 'scroll-top') {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    await this.delay(500);
    return;
  }
  if (subtype === 'scroll-bottom') {
    window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior: 'smooth' });
    await this.delay(500);
    return;
  }
  if (subtype === 'scroll-element') {
    if (!action.selector) {
      throw new Error('Для scroll-element требуется селектор');
    }
    const findResult = await this.findElementWithRetry(action.selector, 3, 250);
    const element = findResult?.element;
    if (!element) {
      throw new Error(`Элемент не найден для scroll-element: ${this.formatSelector(action.selector)}`);
    }
    this._scrollElementIntoView(element);
    await this.delay(500);
    return;
  }

  // #24: Улучшенная логика прокрутки с fallback
  // Приоритет: selector > селектор следующего шага (прокрутка «к полю») > position
  const effectiveSelector = action.selector || this._scrollNextActionSelector;
  try {
    if (effectiveSelector) {
      console.log(`📜 Прокрутка к элементу по селектору (приоритет)`);
      const findResult = await this.findElementWithRetry(effectiveSelector, 3, 250);
      const element = findResult?.element;
      if (element) {
        this._scrollElementIntoView(element);
        await this.delay(500);
        console.log('✅ Прокрутка выполнена к элементу');
        return;
      }
      if (action.selector) console.warn(`⚠️ Элемент не найден по селектору, пробую fallback на position`);
    }
  } finally {
    this._scrollNextActionSelector = null;
  }
  
  if (action.position && typeof action.position.y === 'number') {
    console.log(`📜 Прокрутка к позиции: X=${action.position.x}, Y=${action.position.y}`);
    
    // Проверяем, что позиция валидна (в пределах документа)
    const maxScrollY = document.body.scrollHeight - window.innerHeight;
    const maxScrollX = document.body.scrollWidth - window.innerWidth;
    
    const targetY = Math.min(action.position.y, maxScrollY);
    const targetX = Math.min(action.position.x, maxScrollX);
    
    if (action.position.y > maxScrollY + 100 || action.position.x > maxScrollX + 100) {
      console.warn(`⚠️ Позиция прокрутки может быть устаревшей: ` +
        `запрошено Y=${action.position.y}, макс.Y=${maxScrollY}`);
    }
    
    window.scrollTo({
      top: targetY,
      left: targetX,
      behavior: 'smooth'
    });
    await this.delay(800);
    
    // Проверяем, что прокрутка сработала
    const actualY = window.scrollY;
    if (Math.abs(actualY - targetY) > 50) {
      console.warn(`⚠️ Прокрутка могла не сработать: целевой Y=${targetY}, фактический Y=${actualY}`);
    } else {
      console.log('✅ Прокрутка выполнена');
    }
  } else if (!action.selector) {
    // Нет ни селектора, ни позиции
    console.warn('⚠️ Scroll действие без селектора и позиции, пропускаю');
  }
}

/**
 * Находит задержку перед указанным шагом
 */
TestPlayer.prototype.findDelayBeforeStep = function(actions, currentIndex) {
  if (currentIndex === 0) return null;
  const prevAction = actions[currentIndex - 1];
  if (prevAction && prevAction.type === 'wait') {
    return prevAction;
  }
  return null;
}

/**
 * Находит задержку после указанного шага
 */
TestPlayer.prototype.findDelayAfterStep = function(actions, currentIndex) {
  if (currentIndex >= actions.length - 1) return null;
  const nextAction = actions[currentIndex + 1];
  if (nextAction && nextAction.type === 'wait') {
    return nextAction;
  }
  return null;
}

/**
 * Возвращает основной прокручиваемый элемент: window или div с overflow (SPA).
 * Приоритет у scrollable div — многие SPA (Angular и др.) скроллят контент в div, а не window.
 * @param {boolean} [divOnly=false] — если true, искать только scrollable div (для fallback)
 */
TestPlayer.prototype._getMainScrollElement = function(divOnly = false) {
  let best = null;
  let bestArea = 0;
  const walk = (el) => {
    if (!el || el === document.body || el === document.documentElement) return;
    try {
      const style = getComputedStyle(el);
      const oy = style.overflowY || style.overflow;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight) {
        const area = el.clientHeight * el.clientWidth;
        if (area > bestArea && el.clientHeight > 50) {
          bestArea = area;
          best = el;
        }
      }
      for (const c of el.children || []) walk(c);
    } catch (e) { /* ignore */ }
  };
  walk(document.body);
  // Возвращаем best, если найден (даже при малой площади — SPA могут иметь компактный scroll-контейнер)
  if (best) return best;
  if (!divOnly && document.documentElement.scrollHeight > window.innerHeight) return window;
  if (divOnly) {
    const fallbackSelectors = [
      '[role="main"]', '.main', '.content', '.page-content', '.main-content', '.app-content',
      '.mat-sidenav-content', '.mat-drawer-content', '.cdk-virtual-scroll-viewport',
      'main', '[class*="sidenav-content"]', '[class*="drawer-content"]', '[class*="scroll-viewport"]'
    ];
    for (const sel of fallbackSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const st = getComputedStyle(el);
          const oy = st.overflowY || st.overflow;
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight) {
            return el;
          }
        }
      } catch (e) { /* ignore */ }
    }
    // Последний fallback: крупные элементы с overflow и scrollHeight > clientHeight
    const candidates = document.querySelectorAll('div, main, section, article');
    for (const el of candidates) {
      if (el === document.body || el === document.documentElement) continue;
      try {
        const st = getComputedStyle(el);
        const oy = st.overflowY || st.overflow;
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
          return el;
        }
      } catch (e) { /* ignore */ }
    }
  }
  return divOnly ? null : window;
}

TestPlayer.prototype.handleKeyboard = async function(action) {
  const subtype = action.subtype || '';
  // keyboard-navigate: ArrowUp/Down/Left/Right для навигации по форме
  if (subtype === 'keyboard-navigate') {
    const key = action.key || 'ArrowDown';
    let element = null;
    if (action.selector) {
      const findResult = await this.findElementWithRetry(action.selector, 3);
      element = findResult?.element;
    }
    if (!element) element = document.activeElement || document.body;
    element.focus();
    await this.delay(50);
    element.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode: this.getKeyCode(key), bubbles: true, cancelable: true, view: window }));
    await this.delay(30);
    element.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, keyCode: this.getKeyCode(key), bubbles: true, cancelable: true, view: window }));
    console.log(`✅ keyboard-navigate: ${key}`);
    return;
  }
  // PageDown, PageUp, Home, End: программные KeyboardEvent не вызывают прокрутку (isTrusted: false),
  // поэтому выполняем scroll явно. Пробуем несколько целей: document.scrollingElement, window, scrollable div.
  const rawKey = action.key || action.keyCombination || action.value || '';
  let scrollKey = String(rawKey).replace(/^[^+]*\+/, '').trim().replace(/\s+/g, '');
  const keyNorm = { 'pagedown': 'PageDown', 'pageup': 'PageUp', 'home': 'Home', 'end': 'End' };
  scrollKey = keyNorm[scrollKey.toLowerCase()] || scrollKey;
  const scrollKeys = ['PageDown', 'PageUp', 'Home', 'End'];
  if (scrollKeys.includes(scrollKey)) {
    const tryScroll = (target) => {
      const isWin = target === window;
      const before = isWin ? target.scrollY : target.scrollTop;
      const pageH = isWin ? target.innerHeight : target.clientHeight;
      const maxS = isWin ? (document.documentElement.scrollHeight - target.innerHeight) : (target.scrollHeight - target.clientHeight);
      if (scrollKey === 'PageDown') {
        const d = Math.min(pageH, Math.max(0, maxS - before));
        if (isWin) target.scrollBy({ top: d, behavior: 'auto' });
        else target.scrollTop = Math.min(before + d, maxS);
      } else if (scrollKey === 'PageUp') {
        const d = Math.min(pageH, before);
        if (isWin) target.scrollBy({ top: -d, behavior: 'auto' });
        else target.scrollTop = Math.max(0, before - d);
      } else if (scrollKey === 'Home') {
        if (isWin) target.scrollTo({ top: 0, behavior: 'auto' });
        else target.scrollTop = 0;
      } else if (scrollKey === 'End') {
        if (isWin) target.scrollTo({ top: maxS, behavior: 'auto' });
        else target.scrollTop = maxS;
      }
      return isWin ? target.scrollY : target.scrollTop;
    };

    const targets = [];
    const divEl = this._getMainScrollElement(true);
    if (divEl) targets.push(divEl);
    const scrollRoot = document.scrollingElement;
    if (scrollRoot && scrollRoot !== divEl) targets.push(scrollRoot);
    if (document.documentElement !== scrollRoot) targets.push(document.documentElement);
    if (document.body !== document.documentElement && document.body !== scrollRoot) targets.push(document.body);
    targets.push(window);

    for (const t of targets) {
      const lastBefore = t === window ? t.scrollY : t.scrollTop;
      tryScroll(t);
      await this.delay(80);
      const now = t === window ? t.scrollY : t.scrollTop;
      const targetName = t === window ? 'window' : t === scrollRoot ? 'scrollingElement' : t === document.documentElement ? 'documentElement' : t === document.body ? 'body' : 'div';
      if (now !== lastBefore) {
        console.log(`✅ ${scrollKey}: прокрутка (target=${targetName}, было=${lastBefore}, стало=${now})`);
        return;
      }
    }
    console.log(`✅ ${scrollKey}: прокрутка выполнена (без изменения позиции — возможно уже в конце)`);
    return;
  }

  // keyboard-escape: Escape для закрытия модальных окон
  if (subtype === 'keyboard-escape') {
    let target = document.activeElement || document.body;
    if (action.selector) {
      const findResult = await this.findElementWithRetry(action.selector, 3);
      if (findResult?.element) {
        findResult.element.focus();
        target = findResult.element;
        await this.delay(50);
      }
    }
    const key = 'Escape';
    target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode: 27, bubbles: true, cancelable: true, view: window }));
    await this.delay(30);
    target.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, keyCode: 27, bubbles: true, cancelable: true, view: window }));
    console.log('✅ keyboard-escape');
    return;
  }

  const keyCombination = action.keyCombination || action.key || 'Unknown';
  const isGlobal = action.isGlobal !== false; // По умолчанию глобальное, если не указано
  
  console.log(`⌨️ Выполняю нажатие клавиши: ${keyCombination} (${isGlobal ? 'глобально' : 'на элементе'})`);
  
  let targetElement = null;
  
  // Если не глобальное действие, находим элемент
  if (!isGlobal && action.selector) {
    const findResult = await this.findElementWithRetry(action.selector, 3);
    targetElement = findResult?.element; // Всегда извлекаем element из результата
    
    if (!targetElement) {
      console.warn(`⚠️ Элемент не найден для нажатия клавиши, применяю глобально`);
      targetElement = document.body;
    } else {
      // Фокусируемся на элементе перед нажатием клавиши
      targetElement.focus();
      await this.delay(100);
    }
  } else {
    // Глобальное действие - применяем к document или body
    targetElement = document.activeElement || document.body;
  }
  
  // #23: Правильная последовательность событий для комбинаций клавиш
  // Реальный пользователь нажимает: Ctrl↓ → S↓ → S↑ → Ctrl↑
  // а не все события одновременно с модификаторами
  
  const modifiers = action.modifiers || {};
  const hasModifiers = modifiers.ctrl || modifiers.meta || modifiers.alt || modifiers.shift;
  
  // Вспомогательная функция для создания события клавиши
  const createKeyEvent = (eventType, key, code, keyCode, modifierState) => {
    return new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      key: key,
      code: code || key,
      keyCode: keyCode,
      which: keyCode,
      ctrlKey: modifierState.ctrl || false,
      metaKey: modifierState.meta || false,
      altKey: modifierState.alt || false,
      shiftKey: modifierState.shift || false
    });
  };
  
  // Маппинг названий клавиш-модификаторов
  const modifierKeys = {
    ctrl: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
    meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
    alt: { key: 'Alt', code: 'AltLeft', keyCode: 18 },
    shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }
  };
  
  try {
    if (hasModifiers) {
      // Последовательность для комбинации клавиш (например, Ctrl+S)
      const activeModifiers = { ctrl: false, meta: false, alt: false, shift: false };
      
      // 1. Нажимаем модификаторы
      if (modifiers.ctrl) {
        const modKey = modifierKeys.ctrl;
        targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        activeModifiers.ctrl = true;
        await this.delay(30);
      }
      if (modifiers.meta) {
        const modKey = modifierKeys.meta;
        targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        activeModifiers.meta = true;
        await this.delay(30);
      }
      if (modifiers.alt) {
        const modKey = modifierKeys.alt;
        targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        activeModifiers.alt = true;
        await this.delay(30);
      }
      if (modifiers.shift) {
        const modKey = modifierKeys.shift;
        targetElement.dispatchEvent(createKeyEvent('keydown', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        activeModifiers.shift = true;
        await this.delay(30);
      }
      
      // 2. Нажимаем основную клавишу
      const mainKeyCode = this.getKeyCode(action.key);
      targetElement.dispatchEvent(createKeyEvent('keydown', action.key, action.code || action.key, mainKeyCode, activeModifiers));
      
      // keypress для символьных клавиш
      if (action.key && action.key.length === 1) {
        targetElement.dispatchEvent(createKeyEvent('keypress', action.key, action.code || action.key, mainKeyCode, activeModifiers));
      }
      
      await this.delay(50);
      
      // 3. Отпускаем основную клавишу
      targetElement.dispatchEvent(createKeyEvent('keyup', action.key, action.code || action.key, mainKeyCode, activeModifiers));
      
      await this.delay(30);
      
      // 4. Отпускаем модификаторы в обратном порядке
      if (modifiers.shift) {
        activeModifiers.shift = false;
        const modKey = modifierKeys.shift;
        targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        await this.delay(30);
      }
      if (modifiers.alt) {
        activeModifiers.alt = false;
        const modKey = modifierKeys.alt;
        targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        await this.delay(30);
      }
      if (modifiers.meta) {
        activeModifiers.meta = false;
        const modKey = modifierKeys.meta;
        targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
        await this.delay(30);
      }
      if (modifiers.ctrl) {
        activeModifiers.ctrl = false;
        const modKey = modifierKeys.ctrl;
        targetElement.dispatchEvent(createKeyEvent('keyup', modKey.key, modKey.code, modKey.keyCode, activeModifiers));
      }
      
      console.log(`✅ Комбинация клавиш ${keyCombination} выполнена с правильной последовательностью событий`);
    } else {
      // Простое нажатие без модификаторов
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        key: action.key,
        code: action.code || action.key,
        keyCode: this.getKeyCode(action.key),
        which: this.getKeyCode(action.key)
      };
      
      // Создаем и отправляем событие keydown
      const keydownEvent = new KeyboardEvent('keydown', eventOptions);
      targetElement.dispatchEvent(keydownEvent);
      
      // Также отправляем keypress для некоторых клавиш
      if (action.key && action.key.length === 1) {
        const keypressEvent = new KeyboardEvent('keypress', eventOptions);
        targetElement.dispatchEvent(keypressEvent);
      }
      
      // Отправляем keyup
      await this.delay(50);
      const keyupEvent = new KeyboardEvent('keyup', eventOptions);
      targetElement.dispatchEvent(keyupEvent);
      
      console.log(`✅ Нажатие клавиши ${keyCombination} выполнено`);
    }
    
    await this.delay(200);
  } catch (error) {
    console.error(`❌ Ошибка при нажатии клавиши: ${error.message}`);
    throw error;
  }
}

/**
 * Получает keyCode для клавиши
 */
TestPlayer.prototype.getKeyCode = function(key) {
  const keyMap = {
    'Enter': 13,
    'Escape': 27,
    'Tab': 9,
    'Backspace': 8,
    'Delete': 46,
    'ArrowUp': 38,
    'ArrowDown': 40,
    'ArrowLeft': 37,
    'ArrowRight': 39,
    'Home': 36,
    'End': 35,
    'PageUp': 33,
    'PageDown': 34,
    'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115,
    'F5': 116, 'F6': 117, 'F7': 118, 'F8': 119,
    'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123
  };
  
  return keyMap[key] || (key && key.length === 1 ? key.charCodeAt(0) : 0);
}

TestPlayer.prototype.handleWait = async function(action) {
  const subtype = action.subtype || '';
  const timeoutRaw = action.maxTimeout ?? action.delay ?? action.value ?? 1000;
  const timeoutMs = Math.max(100, parseInt(timeoutRaw, 10) || 1000);

  if (!subtype) {
    const delaySeconds = (timeoutMs / 1000).toFixed(1);
    console.log(`⏱️ Задержка: ${timeoutMs} мс (${delaySeconds} сек)`);
    await this.delay(timeoutMs);
    console.log(`✅ Задержка завершена (${delaySeconds} сек)`);
    return;
  }

  if (!action.selector && subtype !== 'wait-until') {
    throw new Error(`Для ${subtype} требуется селектор`);
  }

  switch (subtype) {
    case 'wait-visible':
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        const element = findResult?.element;
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && 
               computedStyle.visibility !== 'hidden' && 
               computedStyle.display !== 'none' &&
               parseFloat(computedStyle.opacity) > 0;
      }, timeoutMs, 150, `visible ${this.formatSelector(action.selector)}`);
      break;

    case 'wait-hidden':
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        const element = findResult?.element;
        if (!element) return true; // Элемент не найден = скрыт
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        return rect.width === 0 || rect.height === 0 || 
               computedStyle.visibility === 'hidden' || 
               computedStyle.display === 'none' ||
               parseFloat(computedStyle.opacity) === 0;
      }, timeoutMs, 150, `hidden ${this.formatSelector(action.selector)}`);
      break;

    case 'wait-exists':
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        return !!(findResult?.element);
      }, timeoutMs, 150, `exists ${this.formatSelector(action.selector)}`);
      break;

    case 'wait-not-exists':
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        return !(findResult?.element);
      }, timeoutMs, 150, `not exists ${this.formatSelector(action.selector)}`);
      break;

    case 'wait-enabled':
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        const element = findResult?.element;
        if (!element) return false;
        return !(element.disabled || element.getAttribute('aria-disabled') === 'true');
      }, timeoutMs, 150, `enabled ${this.formatSelector(action.selector)}`);
      break;

    case 'wait-value': {
      const expectedValue = await this.processVariables(String(action.expectedValue || '').trim());
      if (!expectedValue) throw new Error('Для wait-value не задан expectedValue');
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        const element = findResult?.element;
        if (!element) return false;
        const actual = String(element.value || element.textContent || '').trim();
        return actual === expectedValue;
      }, timeoutMs, 150, `value "${expectedValue}"`);
      break;
    }

    case 'wait-option': {
      const optionText = await this.processVariables(String(action.optionText || '').trim());
      if (!optionText) throw new Error('Для wait-option не задан optionText');
      await this.waitForCondition(async () => {
        const findResult = await this.findElementWithRetry(action.selector, 1, 50);
        const element = findResult?.element;
        if (!element) return false;
        return String(element.textContent || '').includes(optionText);
      }, timeoutMs, 150, `option "${optionText}"`);
      break;
    }

    case 'wait-options-count': {
      const expectedCount = parseInt(action.expectedCount, 10);
      if (!Number.isFinite(expectedCount) || expectedCount < 0) {
        throw new Error('Для wait-options-count не задан expectedCount');
      }
      await this.waitForCondition(async () => {
        const count = this.countMatchingElements(action.selector);
        return count >= expectedCount;
      }, timeoutMs, 150, `options count >= ${expectedCount}`);
      break;
    }

    case 'wait-until': {
      const expression = String(action.condition || '').trim();
      if (!expression) throw new Error('Для wait-until не задано условие');
      await this.waitForCondition(async () => {
        const processedExpression = await this.processVariables(expression);
        try {
          return Boolean(Function(`return (${processedExpression});`)());
        } catch (e) {
          return false;
        }
      }, timeoutMs, 200, `condition "${expression}"`);
      break;
    }

    default:
      throw new Error(`Неподдерживаемый wait subtype: ${subtype}`);
  }

  console.log(`✅ Ожидание ${subtype} выполнено (${timeoutMs} мс)`);
}

TestPlayer.prototype.navigateToUrl = async function(url, actionIndexInOriginalArray) {
  const currentNorm = this._normalizeUrlForSamePage(window.location.href);
  const targetNorm = this._normalizeUrlForSamePage(url);
  if (!url || (currentNorm && targetNorm && currentNorm === targetNorm)) {
    return; // Уже на этой странице — ничего не делаем
  }

  console.log(`🌐 Навигация на страницу: ${url}`);
  console.log(`📊 Текущий индекс действия: ${actionIndexInOriginalArray}`);

  this.previousUrl = window.location.href;

  try {
    const beforeNavigationScreenshot = await this.takeScreenshot();
    if (beforeNavigationScreenshot) {
      const stepIndex = actionIndexInOriginalArray !== undefined ? actionIndexInOriginalArray : this.currentActionIndex;
      this.screenshots.push({
        stepIndex: stepIndex,
        actionIndex: stepIndex,
        type: 'before-navigation',
        screenshot: beforeNavigationScreenshot,
        timestamp: Date.now(),
        url: window.location.href
      });
      const realStepNumber = stepIndex + 1;
      await this.saveScreenshotToFile(beforeNavigationScreenshot, realStepNumber, 'before-navigation');
    }
  } catch (error) {
    console.warn('⚠️ Не удалось сделать скриншот ДО навигации:', error);
  }

  const nextActionIndex = actionIndexInOriginalArray !== undefined
    ? actionIndexInOriginalArray + 1
    : this.currentActionIndex + 1;

  // До location.replace страница выгружается, и финальный TEST_STEP_COMPLETED из executeActions может не успеть уйти.
  // Поэтому подтверждаем завершение шага навигации заранее.
  const navStep = (actionIndexInOriginalArray !== undefined ? actionIndexInOriginalArray : this.currentActionIndex) + 1;
  const navTotal = this.getRuntimeActions(this.currentTest?.actions || []).length;
  try {
    // Ждём ответ фона до replace: иначе вкладка выгружается и сообщение может не дойти.
    await chrome.runtime.sendMessage({
      type: 'TEST_STEP_COMPLETED',
      testId: this.currentTest?.id,
      step: navStep,
      total: navTotal,
      success: true,
      error: null,
      duration: 0
    }).catch(() => {});
  } catch (e) { /* ignore */ }

  this.navigationInitiatedByPlayer = true;
  await this.savePlaybackState(url, nextActionIndex);

  try {
    window.location.replace(url);
  } catch (e) {
    console.warn('⚠️ window.location.replace не сработал, использую window.location.href:', e);
    window.location.href = url;
  }
}

/**
 * Подготавливает runHistory для сохранения в storage: клонирует и при необходимости
 * обрезает большие base64-скриншоты, чтобы не превысить квоту.
 */
TestPlayer.prototype._runHistoryForStorage = function() {
  if (!this.runHistory) return null;
  const MAX_B = 1000000; // 1MB — чтобы viewport-скриншоты ~950KB сохранялись в history
  const strip = (s) => (s && typeof s === 'string' && s.length > MAX_B);
  const steps = (this.runHistory.steps || []).map((step) => {
    const copy = { ...step };
    if (strip(copy.beforeScreenshot)) delete copy.beforeScreenshot;
    if (strip(copy.afterScreenshot)) delete copy.afterScreenshot;
    if (strip(copy.screenshot)) delete copy.screenshot;
    if (strip(copy.errorScreenshot)) delete copy.errorScreenshot;
    return copy;
  });
  return {
    testId: this.runHistory.testId,
    testName: this.runHistory.testName,
    startTime: this.runHistory.startTime,
    runId: this.runHistory.runId,
    mode: this.runHistory.mode,
    steps,
    success: this.runHistory.success,
    error: this.runHistory.error,
    totalDuration: this.runHistory.totalDuration,
    transcript: Array.isArray(this.runHistory.transcript) ? [...this.runHistory.transcript] : []
  };
}

TestPlayer.prototype.savePlaybackState = async function(nextUrl, nextActionIndex) {
  if (this.isPlaying && this.currentTest) {
    console.log('💾 Сохраняю состояние воспроизведения:', {
      testId: this.currentTest.id,
      testName: this.currentTest.name,
      actionIndex: nextActionIndex,
      nextUrl: nextUrl,
      isPlaying: this.isPlaying,
      hasTest: !!this.currentTest
    });
    const runHistoryForStorage = this._runHistoryForStorage();
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_PLAYBACK_STATE',
        test: this.currentTest,
        actionIndex: nextActionIndex,
        nextUrl: nextUrl,
        runMode: this.playMode,
        runHistory: runHistoryForStorage,
        isGroupRun: this.isGroupRun,
        groupRunCurrentIndex: this.groupRunCurrentIndex,
        groupRunTotal: this.groupRunTotal
      });
      
      if (response && response.success) {
        console.log('✅ Состояние воспроизведения успешно сохранено в background script');
      } else {
        console.error('❌ Ошибка при сохранении состояния:', response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ Ошибка при отправке сообщения для сохранения состояния:', error);
      // Пробуем еще раз через небольшую задержку
      try {
        await this.delay(100);
        const retryResponse = await chrome.runtime.sendMessage({
          type: 'SAVE_PLAYBACK_STATE',
          test: this.currentTest,
          actionIndex: nextActionIndex,
          nextUrl: nextUrl,
          runMode: this.playMode,
          runHistory: runHistoryForStorage,
          isGroupRun: this.isGroupRun,
          groupRunCurrentIndex: this.groupRunCurrentIndex,
          groupRunTotal: this.groupRunTotal
        });
        if (retryResponse && retryResponse.success) {
          console.log('✅ Состояние воспроизведения успешно сохранено после повтора');
        }
      } catch (retryError) {
        console.error('❌ Ошибка при повторной попытке сохранения:', retryError);
      }
    }
  } else {
    console.warn('⚠️ Не могу сохранить состояние: isPlaying =', this.isPlaying, ', hasTest =', !!this.currentTest);
  }
}

TestPlayer.prototype.resumePlayback = async function(test, startActionIndex, mode = 'optimized', savedRunHistory = null) {
  if (this.isPlaying) {
    if (this.currentTest?.id === test?.id) {
      if (this.debugMode) console.log('ℹ️ [Resume] Тест уже воспроизводится на этой вкладке, пропуск дубликата');
    } else {
      console.warn('⚠️ Тест уже воспроизводится, игнорирую повторный запуск');
    }
    return;
  }

  this.isPlaying = true;
  this.currentTest = test;
  const recordingIndicator = document.getElementById('autotest-recording-indicator');
  if (recordingIndicator) recordingIndicator.remove();
  this.playMode = mode || 'optimized';
  this.lastKnownUrl = window.location.href;

  // Восстановление runHistory из сохранённого состояния (после навигации), чтобы не терять шаги и скриншоты первого теста в группе
  if (savedRunHistory && String(savedRunHistory.testId) === String(test?.id)) {
    this.runHistory = {
      ...savedRunHistory,
      steps: Array.isArray(savedRunHistory.steps) ? [...savedRunHistory.steps] : [],
      transcript: Array.isArray(savedRunHistory.transcript) ? [...savedRunHistory.transcript] : []
    };
    console.log('💾 [History] Восстановлена история прогона из сохранённого состояния:', this.runHistory.steps?.length || 0, 'шагов');
  }

  // Инициализируем переменные из теста
  this.userVariables = {};
  if (test.variables) {
    console.log(`📦 [Variables] Инициализация переменных из теста (resumePlayback). Всего переменных в test.variables: ${Object.keys(test.variables).length}`);
    for (const [varName, varData] of Object.entries(test.variables)) {
      if (varData && typeof varData === 'object' && varData.value !== undefined && varData.value !== null) {
        this.userVariables[varName] = varData.value;
        const displayValue = String(varData.value);
        const isSensitive = varData.sensitive;
        console.log(`📦 [Variables] Загружена переменная "${varName}" = "${isSensitive ? '••••••••' : displayValue.substring(0, 20) + (displayValue.length > 20 ? '...' : '')}"`);
      } else if (varData !== undefined && varData !== null && typeof varData !== 'object') {
        // Если переменная сохранена в старом формате (просто значение)
        this.userVariables[varName] = varData;
        console.log(`📦 [Variables] Загружена переменная "${varName}" (старый формат) = "${String(varData).substring(0, 20)}${String(varData).length > 20 ? '...' : ''}"`);
      } else {
        console.warn(`⚠️ [Variables] Переменная "${varName}" пропущена (нет значения):`, varData);
      }
    }
    console.log(`📦 [Variables] Загружено ${Object.keys(this.userVariables).length} переменных из теста`);
    console.log(`📦 [Variables] Список переменных: ${Object.keys(this.userVariables).join(', ')}`);
  } else {
    // Это нормальная ситуация - не все тесты имеют переменные
    console.log(`ℹ️ [Variables] test.variables отсутствует или пуст (это нормально, если тест не использует переменные)`);
  }

  // Очищаем старые скриншоты для экономии памяти
  this.screenshots = [];
  console.log('🧹 Очищены старые скриншоты перед восстановлением воспроизведения');

  // Restart performance monitoring after navigation (content script reloads, collector resets)
  const hasPerformanceAnalysis = test.actions?.some(
    action => action.type === 'analysis' && action.subtype === 'analysis-performance'
  );
  if (hasPerformanceAnalysis) {
    try {
      await chrome.runtime.sendMessage({
        type: 'PERFORMANCE_START_MONITORING',
        testId: test.id,
        config: {
          webVitals: true,
          resourceTiming: true,
          navigationTiming: true
        }
      });
      console.log('✅ [Performance] Monitoring restarted after navigation');
    } catch (error) {
      console.warn('⚠️ [Performance] Failed to restart monitoring:', error);
    }
  }

  // Инициализируем историю прогона, если её еще нет
  // При восстановлении пытаемся загрузить существующую историю из предыдущего прогона
  if (!this.runHistory) {
    const normalizedTestId = String(test.id);
    
    // Пытаемся загрузить последний незавершенный прогон из истории
    try {
      const historyResponse = await chrome.runtime.sendMessage({
        type: 'GET_TEST_HISTORY',
        testId: normalizedTestId
      });
      
      if (historyResponse && historyResponse.success && historyResponse.history && historyResponse.history.length > 0) {
        // Ищем последний незавершенный прогон (success === false или отсутствует)
        const incompleteRuns = historyResponse.history.filter(run => 
          run.testId === normalizedTestId && 
          (!run.success || run.success === false) &&
          run.startTime
        );
        
        if (incompleteRuns.length > 0) {
          // Берем последний незавершенный прогон
          const lastIncompleteRun = incompleteRuns[incompleteRuns.length - 1];
          this.runHistory = {
            ...lastIncompleteRun,
            // Обновляем время начала, если нужно
            startTime: lastIncompleteRun.startTime || new Date().toISOString(),
            runId: lastIncompleteRun.runId || new Date(lastIncompleteRun.startTime || Date.now()).getTime()
          };
          console.log(`💾 [History] Загружена существующая история из предыдущего прогона: ${this.runHistory.steps?.length || 0} шагов`);
          console.log(`   Начало прогона: ${this.runHistory.startTime}`);
          console.log(`   Шаги в истории: ${this.runHistory.steps?.map(s => s.stepNumber).join(', ') || 'нет'}`);
          
          // Восстанавливаем скриншоты из предыдущего прогона в массив this.screenshots
          if (this.runHistory.steps && this.runHistory.steps.length > 0) {
            let restoredScreenshotsCount = 0;
            this.runHistory.steps.forEach((step, stepIndex) => {
              if (step.beforeScreenshot) {
                this.screenshots.push({
                  stepIndex: step.stepNumber - 1,
                  actionIndex: step.stepNumber - 1,
                  type: 'before',
                  screenshot: step.beforeScreenshot,
                  timestamp: Date.now()
                });
                restoredScreenshotsCount++;
              }
              if (step.afterScreenshot) {
                this.screenshots.push({
                  stepIndex: step.stepNumber - 1,
                  actionIndex: step.stepNumber - 1,
                  type: 'after',
                  screenshot: step.afterScreenshot,
                  timestamp: Date.now()
                });
                restoredScreenshotsCount++;
              }
              if (step.screenshot) {
                this.screenshots.push({
                  stepIndex: step.stepNumber - 1,
                  actionIndex: step.stepNumber - 1,
                  type: 'error',
                  screenshot: step.screenshot,
                  timestamp: Date.now()
                });
                restoredScreenshotsCount++;
              }
            });
            if (restoredScreenshotsCount > 0) {
              console.log(`📸 [History] Восстановлено ${restoredScreenshotsCount} скриншотов из предыдущего прогона`);
            }
          }
        } else {
          // Создаем новую историю
          const startTime = Date.now();
          this.runHistory = {
            testId: normalizedTestId,
            testName: test.name,
            startTime: new Date(startTime).toISOString(),
            runId: startTime,
            mode: this.playMode,
            steps: [],
            success: false,
            error: null,
            totalDuration: 0,
            transcript: []
          };
          console.log('💾 [History] runHistory создан при восстановлении воспроизведения (новый прогон)');
        }
      } else {
        // Создаем новую историю
        const startTime = Date.now();
        this.runHistory = {
          testId: normalizedTestId,
          testName: test.name,
          startTime: new Date(startTime).toISOString(),
          runId: startTime,
          mode: this.playMode,
          steps: [],
          success: false,
          error: null,
          totalDuration: 0,
          transcript: []
        };
        console.log('💾 [History] runHistory создан при восстановлении воспроизведения (история пуста)');
      }
    } catch (error) {
      console.warn('⚠️ [History] Ошибка при загрузке существующей истории, создаю новую:', error);
      // Создаем новую историю при ошибке
      const startTime = Date.now();
      this.runHistory = {
        testId: normalizedTestId,
        testName: test.name,
        startTime: new Date(startTime).toISOString(),
        runId: startTime,
        mode: this.playMode,
        steps: [],
        success: false,
        error: null,
        totalDuration: 0,
        transcript: []
      };
      console.log('💾 [History] runHistory создан при восстановлении воспроизведения (после ошибки)');
    }
  } else {
    console.log('💾 [History] runHistory уже существует, продолжаю использовать его');
  }

  this.addPlayingIndicator();
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`▶️ ВОССТАНОВЛЕНИЕ ВОСПРОИЗВЕДЕНИЯ ТЕСТА: ${test.name}`);
  console.log(`📊 Продолжаю с действия ${startActionIndex + 1} из ${test.actions?.length || 0}`);
  console.log(`🌐 Текущая страница: ${window.location.href}`);
  console.log(`${'='.repeat(50)}\n`);

  try {
    // Ждем полной загрузки страницы и инициализации фреймворков
    console.log('⏳ Ожидаю загрузки страницы и инициализации приложения...');
    await this.waitForPageLoad();
    console.log('✅ Страница загружена, ищу правильную точку начала...');
    
    // Делаем скриншот ПОСЛЕ навигации (после загрузки новой страницы)
    // Проверяем, была ли навигация (если есть скриншот "до навигации")
    const beforeNavScreenshot = this.screenshots.find(s => s.type === 'before-navigation');
    if (beforeNavScreenshot) {
      try {
        const afterNavigationScreenshot = await this.takeScreenshot();
        if (afterNavigationScreenshot) {
          const stepIndex = beforeNavScreenshot.stepIndex;
          this.screenshots.push({
            stepIndex: stepIndex,
            actionIndex: stepIndex,
            type: 'after-navigation',
            screenshot: afterNavigationScreenshot,
            timestamp: Date.now(),
            url: window.location.href
          });
          console.log(`📸 Скриншот ПОСЛЕ навигации сохранен (URL: ${window.location.href})`);
          
          // Сохраняем скриншот в файл
          const realStepNumber = stepIndex + 1;
          const filePath = await this.saveScreenshotToFile(afterNavigationScreenshot, realStepNumber, 'after-navigation');
          if (filePath) {
            console.log(`💾 Скриншот ПОСЛЕ навигации сохранен в файл: ${filePath}`);
          }
          
          // Обновляем историю шага навигации, если она существует.
          // В оптимизированном режиме stepNumber в runHistory — номер среди видимых шагов (getStepNumberForIndex),
          // а stepIndex здесь — индекс в полном массиве действий, поэтому поиск по stepNumber === realStepNumber не срабатывает.
          // Ищем последний шаг типа navigate/navigation без afterScreenshot.
          if (this.runHistory && this.runHistory.steps) {
            let navigationStep = this.runHistory.steps.find(s => s.stepNumber === realStepNumber);
            if (!navigationStep) {
              const navSteps = this.runHistory.steps.filter(s =>
                (s.actionType === 'navigate' || s.actionType === 'navigation') && !s.afterScreenshot
              );
              navigationStep = navSteps.length > 0 ? navSteps[navSteps.length - 1] : null;
            }
            if (navigationStep) {
              navigationStep.beforeScreenshot = beforeNavScreenshot.screenshot;
              navigationStep.afterScreenshot = afterNavigationScreenshot;
              navigationStep.beforeScreenshotPath = beforeNavScreenshot.path || null;
              navigationStep.afterScreenshotPath = filePath || null;
              console.log(`💾 [History] Скриншоты навигации добавлены в историю шага ${navigationStep.stepNumber}`);
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Не удалось сделать скриншот ПОСЛЕ навигации:', error);
      }
    }
    
    // Умный поиск начальной точки по URL (без чисел) и селекторам
    let actualStartIndex = startActionIndex;
    const currentUrl = window.location.href;
    
    // Нормализуем URL: убираем числа и параметры запроса для сравнения
    const normalizeUrlForMatching = (url) => {
      try {
        const urlObj = new URL(url);
        // Убираем числа из pathname
        const pathWithoutNumbers = urlObj.pathname.replace(/\d+/g, '');
        return urlObj.origin + pathWithoutNumbers;
      } catch (e) {
        // Убираем числа из URL строки
        return url.replace(/\d+/g, '');
      }
    };
    
    const normalizedCurrent = normalizeUrlForMatching(currentUrl);
    console.log(`🔍 Нормализованный текущий URL (без чисел): ${normalizedCurrent}`);
    
    // Ищем действие, которое лучше всего соответствует текущей странице
    let bestMatchIndex = startActionIndex;
    let bestMatchScore = 0;
    
    for (let i = 0; i < test.actions.length; i++) {
      const action = test.actions[i];
      if (!action.url) continue;
      
      const normalizedAction = normalizeUrlForMatching(action.url);
      let score = 0;
      
      // Сравниваем нормализованные URL
      if (normalizedCurrent === normalizedAction) {
        score += 10; // Полное совпадение URL
      } else if (normalizedCurrent.includes(normalizedAction) || normalizedAction.includes(normalizedCurrent)) {
        score += 5; // Частичное совпадение
      }
      
      // Проверяем только существующие следующие шаги (если шаг последний или дальше нет — не проверяем)
      const nextStepsCount = test.actions.length - 1 - i;
      if (score > 0 && nextStepsCount > 0) {
        let foundElementsCount = 0;
        const maxNextToCheck = Math.min(3, nextStepsCount);
        for (let j = 1; j <= maxNextToCheck; j++) {
          const nextIndex = i + j;
          if (nextIndex >= test.actions.length) break;
          const nextAction = test.actions[nextIndex];
          if (nextAction?.selector && nextAction.type !== 'wait' && !nextAction.hidden) {
            try {
              const findResult = await this.findElementWithRetry(nextAction.selector, 5, 200);
              if (findResult?.element) foundElementsCount++;
            } catch (e) { /* игнорируем */ }
          }
        }
        score += foundElementsCount * 2;
      }
      
      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatchIndex = i;
      }
    }
    
    // Никогда не перезаписываем на более ранний шаг (при любом resume, не только после навигации/перезагрузки):
    // сохранённый startActionIndex authoritative — иначе возможен бесконечный цикл
    if (bestMatchScore > 0 && bestMatchIndex !== startActionIndex && bestMatchIndex >= startActionIndex) {
      console.log(`✅ Найдена лучшая точка начала: действие ${bestMatchIndex + 1} (оценка: ${bestMatchScore})`);
      console.log(`   Оригинальная точка: действие ${startActionIndex + 1}`);
      actualStartIndex = bestMatchIndex;
    } else {
      console.log(`ℹ️ Использую указанную точку начала: действие ${startActionIndex + 1}`);
    }
    
    // Получаем оставшиеся действия, начиная с найденного индекса
    const remainingActions = test.actions.slice(actualStartIndex);
    // Вычисляем индекс для видимых действий
    const visibleActionsBeforeStart = test.actions
      .slice(0, actualStartIndex)
      .filter(a => this.isActionVisible(a)).length;
    
    this.currentActionIndex = visibleActionsBeforeStart;
    
    // Отслеживаем изменения URL для обработки редиректов
    this.startUrlTracking();
    
    // Отправляем информацию о прогрессе
    const visibleRemaining = remainingActions.filter(a => this.isActionVisible(a));
    if (visibleRemaining.length > 0) {
      this.notifyStepProgress({
        current: visibleActionsBeforeStart,
        total: this.getRuntimeActions(test.actions).length,
        type: 'resuming',
        action: null
      });
    }
    
    console.log('🚀 Продолжаю выполнение действий...');
    // Передаем: remainingActions, allActions, startStepNumber=0 (для корректной нумерации), startActionIndex (для stepIndex)
    await this.executeActions(remainingActions, test.actions, 0, actualStartIndex);
    const hasStepErrors = this.runHistory?.steps?.some(step => step.success === false);
    if (hasStepErrors) {
      console.log('⚠️ Тест завершён с ошибками в шагах');
    } else {
      console.log('✅ Тест успешно выполнен');
    }

    // Устанавливаем success по наличию ошибок в шагах
    if (this.runHistory) {
      this.runHistory.success = !hasStepErrors;
      if (hasStepErrors) {
        const firstFailed = this.runHistory.steps.find(step => step.success === false);
        this.runHistory.error = firstFailed?.error || 'Один или несколько шагов завершились с ошибкой';
      } else {
        this.runHistory.error = null;
      }
    }

    // Сохраняем performance data по завершении теста (все шаги выполнены)
    const hasPerformanceAnalysis = test.actions?.some(
      a => a.type === 'analysis' && a.subtype === 'analysis-performance'
    );
    if (hasPerformanceAnalysis && this.currentTest?.id) {
      try {
        await chrome.runtime.sendMessage({
          type: 'PERFORMANCE_COLLECT_DATA',
          testId: this.currentTest.id
        });
        console.log('📊 [Performance] Data saved at test completion (resume)');
      } catch (e) { /* ignore */ }
    }

    await this._handleOpenDialogIfAny(3);
    this.notifyCompletion(!hasStepErrors, hasStepErrors ? (this.runHistory?.error || 'Ошибки в шагах') : null);
  } catch (error) {
    console.error('❌ Ошибка при выполнении теста:', error);
    this.notifyCompletion(false, error.message);
  } finally {
    this.stopPlaying();
  }
}

TestPlayer.prototype.waitForPageLoad = async function() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      setTimeout(resolve, 200);
      return;
    }

    window.addEventListener('load', () => {
      setTimeout(resolve, 200);
    }, { once: true });

    setTimeout(() => {
      console.log('⏳ Таймаут ожидания загрузки страницы, продолжаю...');
      resolve();
    }, 5000);
  });
}

TestPlayer.prototype.highlightElement = function(element, color = '#4CAF50') {
  const originalOutline = element.style.outline;
  const originalOutlineOffset = element.style.outlineOffset;
  const originalBoxShadow = element.style.boxShadow;
  const originalZIndex = element.style.zIndex;
  const originalPosition = element.style.position;
  
  // Более заметное выделение
  element.style.outline = `4px solid ${color}`;
  element.style.outlineOffset = '3px';
  element.style.boxShadow = `0 0 20px ${color}80`;
  element.style.zIndex = '999999';
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }
  
  // Убираем выделение через 2 секунды
  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.outlineOffset = originalOutlineOffset;
    element.style.boxShadow = originalBoxShadow;
    element.style.zIndex = originalZIndex;
    element.style.position = originalPosition;
  }, 2000);
}

TestPlayer.prototype.addPlayingIndicator = function() {
  const indicator = document.createElement('div');
  indicator.id = 'autotest-playing-indicator';
  indicator.innerHTML = '▶️ ВОСПРОИЗВЕДЕНИЕ';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #2196F3;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-family: Arial, sans-serif;
    pointer-events: none;
    opacity: 0.7;
  `;
  document.body.appendChild(indicator);
}

TestPlayer.prototype.removePlayingIndicator = function() {
  const indicator = document.getElementById('autotest-playing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

TestPlayer.prototype.stopPlaying = function() {
  // Сохраняем историю перед остановкой, если тест был запущен
  if (this.runHistory && this.runHistory.startTime) {
    const endTime = Date.now();
    const startTime = new Date(this.runHistory.startTime).getTime();
    this.runHistory.totalDuration = endTime - startTime;
    
    // Если тест был остановлен пользователем, помечаем это
    // Устанавливаем success = false только если тест действительно был остановлен пользователем
    // Если success уже установлен в true (тест выполнен успешно), не перезаписываем его
    if (this.runHistory.success === undefined || this.runHistory.success === null) {
      // success не был установлен явно, значит тест был остановлен
      this.runHistory.success = false;
      this.runHistory.error = this.runHistory.error || 'Тест остановлен пользователем';
    } else if (this.runHistory.success === true && !this.runHistory.error) {
      // Тест выполнен успешно, убеждаемся что error = null
      this.runHistory.error = null;
    }
    
    // Убеждаемся, что история имеет минимальную информацию
    if (!this.runHistory.steps || this.runHistory.steps.length === 0) {
      this.runHistory.steps = [];
    }
    
    console.log('💾 Сохраняю историю прогона при остановке:', {
      testId: this.runHistory.testId,
      stepsCount: this.runHistory.steps.length,
      success: this.runHistory.success,
      duration: this.runHistory.totalDuration
    });
    // Отправляем историю в background для сохранения
    chrome.runtime.sendMessage({
      type: 'SAVE_TEST_RUN_HISTORY',
      runHistory: this.runHistory
    }).then(response => {
      if (response && response.success) {
        console.log('✅ История прогона успешно сохранена при остановке');
      } else {
        console.error('❌ Ошибка при сохранении истории:', response?.error);
      }
    }).catch(err => {
      console.error('❌ Ошибка при сохранении истории прогона при остановке:', err);
    });
  }
  
  // Выключаем перехват ошибок консоли
  this.stopConsoleErrorCapture();
  
  // НОВОЕ: Останавливаем Performance Monitoring если был запущен
  if (this.currentTest) {
    const hasPerformanceAnalysis = this.currentTest.actions?.some(
      action => action.type === 'analysis' && action.subtype === 'analysis-performance'
    );
    
    if (hasPerformanceAnalysis) {
      console.log('⏹️ [Performance] Stopping monitoring');
      chrome.runtime.sendMessage({
        type: 'PERFORMANCE_STOP_MONITORING'
      }).catch(err => {
        console.warn('⚠️ [Performance] Failed to stop monitoring:', err);
      });
    }
  }
  
  this.isPlaying = false;
  this.isPaused = false;
  this.pausedState = null;
  this.currentTest = null;
  this.currentActionIndex = 0;
  if (this.runHistoryCleanupTimer) {
    clearTimeout(this.runHistoryCleanupTimer);
  }
  // Очищаем историю с небольшой задержкой, чтобы не потерять шаги в фоне
  this.runHistoryCleanupTimer = setTimeout(() => {
    this.runHistory = null;
    this.runHistoryCleanupTimer = null;
  }, 3000);
  this.stopUrlTracking(); // Останавливаем отслеживание URL
  this.removePlayingIndicator();
}

/**
 * Ставит воспроизведение на паузу
 */
TestPlayer.prototype.pausePlayback = function() {
  if (!this.isPlaying || this.isPaused) {
    console.warn('⚠️ [Player] Нельзя поставить на паузу: тест не воспроизводится или уже на паузе');
    return;
  }

  console.log('⏸️ [Player] Воспроизведение поставлено на паузу');
  this.isPaused = true;
  // НЕ меняем isPlaying, чтобы циклы могли проверить isPaused
  
  // Обновляем индикатор
  this.updatePlayingIndicator('⏸️ ПАУЗА');
  
  // Состояние будет сохранено в checkAndSavePauseState при следующей проверке
  console.log('💾 [Player] Состояние паузы будет сохранено при следующей проверке цикла');
}

/**
 * Возобновляет воспроизведение с места паузы
 */
TestPlayer.prototype.resumePlaybackFromPause = async function() {
  if (!this.isPaused) {
    console.warn('⚠️ [Player] Нельзя возобновить: воспроизведение не на паузе');
    return;
  }

  console.log('▶️ [Player] Возобновляю воспроизведение с места паузы...');
  
  // Просто снимаем флаг паузы - цикл продолжит выполнение автоматически
  // (checkAndSavePauseState ждет, пока isPaused станет false)
  this.isPaused = false;
  
  // Обновляем индикатор
  this.updatePlayingIndicator('▶️ ВОСПРОИЗВЕДЕНИЕ');
  
  console.log('✅ [Player] Флаг паузы снят, цикл продолжит выполнение');
}

/**
 * Обновляет индикатор воспроизведения
 */
TestPlayer.prototype.updatePlayingIndicator = function(text) {
  const indicator = document.getElementById('autotest-playing-indicator');
  if (indicator) {
    indicator.innerHTML = text;
    if (text.includes('ПАУЗА')) {
      indicator.style.background = '#FF9800'; // Оранжевый для паузы
    } else {
      indicator.style.background = '#2196F3'; // Синий для воспроизведения
    }
  }
}

/**
 * Проверяет, нужно ли поставить на паузу, и сохраняет состояние
 */
TestPlayer.prototype.checkAndSavePauseState = async function(visibleActions, allActions, startStepNumber, currentIndex) {
  if (this.isPaused) {
    // Сохраняем состояние для возобновления (только один раз)
    if (!this.pausedState) {
      this.pausedState = {
        test: this.currentTest,
        actionIndex: this.currentActionIndex,
        mode: this.playMode,
        visibleActions: visibleActions,
        allActions: allActions,
        startStepNumber: startStepNumber,
        currentIndex: currentIndex,
        runHistory: this.runHistory ? JSON.parse(JSON.stringify(this.runHistory)) : null
      };
      console.log(`💾 [Player] Состояние паузы сохранено на шаге ${currentIndex + 1}`);
    }
    
    // Ждем, пока пауза не будет снята
    while (this.isPaused && this.isPlaying) {
      await this.delay(100); // Проверяем каждые 100мс
    }
    
    // Если воспроизведение было остановлено во время паузы
    if (!this.isPlaying) {
      throw new Error('Воспроизведение остановлено во время паузы');
    }
  }
}

/**
 * Начинает отслеживание изменений URL для обработки редиректов
 */
TestPlayer.prototype.startUrlTracking = function() {
  if (this.urlChangeListener) {
    return; // Уже отслеживаем
  }
  
  this.lastKnownUrl = window.location.href;
  
  // Отслеживаем изменения через периодическую проверку
  const checkUrl = () => {
    if (!this.isPlaying) return;
    
    const currentUrl = window.location.href;
    if (currentUrl !== this.lastKnownUrl) {
      console.log(`🔄 Обнаружено изменение URL: ${this.lastKnownUrl} → ${currentUrl}`);
      this.lastKnownUrl = currentUrl;
    }
  };
  
  // Сохраняем функцию для удаления слушателя
  this.urlCheckFunction = checkUrl;
  
  // Проверяем URL каждые 500мс
  this.urlChangeListener = setInterval(checkUrl, 500);
  
  // Также отслеживаем через popstate (для истории браузера)
  window.addEventListener('popstate', checkUrl);
  
  console.log('✅ Отслеживание изменений URL запущено');
}

/**
 * Останавливает отслеживание изменений URL
 */
TestPlayer.prototype.stopUrlTracking = function() {
  if (this.urlChangeListener) {
    clearInterval(this.urlChangeListener);
    this.urlChangeListener = null;
    if (this.urlCheckFunction && typeof window.removeEventListener === 'function') {
      window.removeEventListener('popstate', this.urlCheckFunction);
      this.urlCheckFunction = null;
    }
    console.log('✅ Отслеживание изменений URL остановлено');
  }
  this.lastKnownUrl = null;
}

TestPlayer.prototype.delay = async function(ms) {
  const chunk = 50;
  let elapsed = 0;
  while (elapsed < ms) {
    if (!this.isPlaying) return;
    const wait = Math.min(chunk, ms - elapsed);
    await new Promise(r => setTimeout(r, wait));
    elapsed += wait;
  }
}

/**
 * Получает оптимизированную задержку в зависимости от настроек
 */
TestPlayer.prototype.getOptimizedDelay = async function(actionType, defaultDelay) {
  try {
    let speedOptimization = true; // По умолчанию включено
    if (window.settingsManager) {
      const settings = await window.settingsManager.getSettings();
      speedOptimization = settings?.performance?.speedOptimization !== false;
    }
    
    if (!speedOptimization) {
      return defaultDelay;
    }
    
    // Оптимизированные задержки
    const optimizedDelays = {
      default: 100,
      click: 150,
      input: 100,
      dropdown: 200,
      navigation: 300,
      waitForElement: 50,
      screenshot: 100,
      scroll: 100
    };
    
    const optimized = optimizedDelays[actionType] || optimizedDelays.default;
    // Используем минимум из оптимизированной и 30% от исходной
    return Math.min(optimized, Math.max(defaultDelay * 0.3, 50));
  } catch (error) {
    // Если ошибка при получении настроек, используем оптимизированную задержку по умолчанию
    const optimizedDelays = {
      default: 100,
      click: 150,
      input: 100,
      dropdown: 200,
      navigation: 300,
      waitForElement: 50,
      screenshot: 100,
      scroll: 100
    };
    const optimized = optimizedDelays[actionType] || optimizedDelays.default;
    return Math.min(optimized, Math.max(defaultDelay * 0.3, 50));
  }
}

/**
 * Формирует текстовое описание шага для транскрипта
 */
TestPlayer.prototype.getStepDescription = function(action, stepNumber, totalSteps) {
  if (!action || !action.type) {
    return `Шаг ${stepNumber} из ${totalSteps}: —`;
  }
  const actionTypeNames = {
    'click': 'Клик',
    'dblclick': 'Двойной клик',
    'input': 'Ввод текста',
    'change': 'Изменение значения',
    'navigate': 'Переход на страницу',
    'wait': 'Задержка',
    'keydown': 'Нажатие клавиши',
    'keyup': 'Отпускание клавиши'
  };

  const actionTypeName = actionTypeNames[action.type] || (typeof action.type === 'string' ? action.type.toUpperCase() : '—');
  let description = `Шаг ${stepNumber} из ${totalSteps}: ${actionTypeName}`;

  // Добавляем информацию о селекторе
  if (action.selector) {
    const selectorText = this.formatSelector(action.selector);
    if (selectorText && selectorText !== 'N/A') {
      // Упрощаем селектор для читаемости
      const simplifiedSelector = selectorText.length > 60 
        ? selectorText.substring(0, 57) + '...' 
        : selectorText;
      description += ` по элементу "${simplifiedSelector}"`;
    }
  }

  // Добавляем информацию о значении
  if (action.value) {
    if (action.type === 'input' || action.type === 'change') {
      description += ` со значением "${action.value}"`;
    } else if (action.type === 'navigate') {
      description += ` на "${action.value}"`;
    } else if (action.type === 'wait') {
      const delay = action.delay || action.value;
      const seconds = Math.round(delay / 1000 * 10) / 10;
      description += ` на ${seconds} секунд`;
    }
  }

  // Добавляем информацию о тексте элемента (если есть)
  if (action.element && action.element.text) {
    const elementText = action.element.text.trim();
    if (elementText && elementText.length < 50) {
      description += ` (элемент: "${elementText}")`;
    }
  }

  return description;
}

/**
 * Ищет элемент в раскрывшихся контейнерах (overlay, dropdown panel и т.п.).
 * Используется для ввода после клика, когда поле может появиться во вновь открытой панели.
 * @param {Object|string} selectorData - селектор (объект с .selector или строка)
 * @returns {{ element: Element, usedSelector: string } | null}
 */
TestPlayer.prototype.findElementInRevealedContainers = function(selectorData) {
  const sel = selectorData?.selector || selectorData?.value || (typeof selectorData === 'string' ? selectorData : '');
  if (!sel || typeof sel !== 'string') return null;
  const isXpath = sel.startsWith('/') || sel.startsWith('(');
  const rootsSelector = [
    '.cdk-overlay-pane',
    '.mat-select-panel',
    '.ng-dropdown-panel',
    '[class*="dropdown-panel"]',
    '[class*="overlay-pane"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[class*="panel"]',
    '[class*="overlay"]'
  ].join(',');
  try {
    const roots = document.querySelectorAll(rootsSelector);
    for (const root of roots) {
      if (!root.isConnected || root.offsetParent === null) continue;
      let el = null;
      if (isXpath) {
        try {
          const result = document.evaluate(sel, root, null, window.XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el = result.singleNodeValue;
        } catch (e) { /* ignore */ }
      } else {
        try {
          el = root.querySelector(sel);
        } catch (e) { /* ignore */ }
      }
      if (el && (el instanceof Element || el instanceof HTMLElement)) {
        console.log('✅ [Input] Поле ввода найдено в раскрывшемся контейнере');
        return { element: el, usedSelector: this.formatSelector(selectorData) };
      }
    }
  } catch (e) {
    console.warn('⚠️ [Input] Поиск в раскрывшихся контейнерах:', e?.message || e);
  }
  return null;
};

/**
 * При inputAfterClick: выбирает опцию по тексту в уже открытых overlay-панелях (без повторного открытия dropdown).
 * @param {string} targetValue - текст опции для выбора
 * @param {Element} [contextElement] - элемент dropdown, к которому привязан ввод; при наличии предпочитается панель, ближайшая к нему (для нескольких открытых панелей)
 * @returns {Promise<{ success: boolean }>}
 */
TestPlayer.prototype.trySelectOptionInRevealedPanels = async function(targetValue, contextElement) {
  if (!targetValue || typeof targetValue !== 'string') return { success: false };
  await this.delay(100);
  if (!this.isPlaying) return { success: false };
  const rootsSelector = [
    '.cdk-overlay-pane',
    '.mat-select-panel',
    '.ng-dropdown-panel',
    '[class*="dropdown-panel"]',
    '[class*="overlay-pane"]',
    '[role="listbox"]',
    '.select-group',
    '[class*="select-group"]',
    '[id*="__result"]',
    '[class*="options"]'
  ].join(',');
  const optionSelector = '.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], .mat-option';
  const targetNorm = this.normalizeTextValue(targetValue);
  /** Prefer clicking the interactive option (Angular mat-option or role=option) so selection is applied. */
  const getClickableOption = (el) => {
    if (!el || !el.isConnected) return el;
    if (el.getAttribute && el.getAttribute('role') === 'option') return el;
    if (el.classList && el.classList.contains('mat-option')) return el;
    const interactive = el.closest && el.closest('[role="option"], .mat-option');
    if (interactive) return interactive;
    const child = el.querySelector && el.querySelector('[role="option"], .mat-option');
    return child || el;
  };
  if (!targetNorm) return { success: false };

  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textMatches = (el) => {
    const text = (el.textContent || '').trim();
    if (!text) return false;
    const norm = this.normalizeTextValue(text);
    return norm === targetNorm || norm.includes(targetNorm) || targetNorm.includes(norm);
  };
  const rectDistance = (a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const cxA = ra.left + ra.width / 2, cyA = ra.top + ra.height / 2;
    const cxB = rb.left + rb.width / 2, cyB = rb.top + rb.height / 2;
    return Math.hypot(cxA - cxB, cyA - cyB);
  };
  const getTriggerDisplayValue = (el) => {
    if (!el || !el.isConnected) return '';
    const inner = el.querySelector && el.querySelector('[class*="value"], [class*="placeholder"], .mat-select-value-text');
    const text = (inner && inner.textContent) || el.textContent || el.value || '';
    return String(text).trim().slice(0, 120);
  };

  try {
    const roots = document.querySelectorAll(rootsSelector);
    const visibleRoots = Array.from(roots).filter(r => isVisible(r));
    const candidates = [];
    for (const root of visibleRoots) {
      const options = root.querySelectorAll(optionSelector);
      for (const opt of options) {
        if (!isVisible(opt)) continue;
        if (!textMatches(opt)) continue;
        candidates.push({ root, opt });
        break;
      }
    }
    if (contextElement && contextElement.getBoundingClientRect && candidates.length > 1) {
      candidates.sort((a, b) => rectDistance(a.root, contextElement) - rectDistance(b.root, contextElement));
    } else if (candidates.length === 0) {
      visibleRoots.sort((a, b) => {
        const optsA = a.querySelectorAll(optionSelector).length;
        const optsB = b.querySelectorAll(optionSelector).length;
        return optsB - optsA;
      });
    }
    const triggerValueBefore = contextElement ? getTriggerDisplayValue(contextElement) : '';
    if (candidates.length > 0) {
      for (let i = 0; i < candidates.length; i++) {
        const { root, opt } = candidates[i];
        try {
          const toClick = getClickableOption(opt);
          toClick.click();
          await this.delay(50);
          const triggerValueAfter = contextElement ? getTriggerDisplayValue(contextElement) : '';
          const valueChanged = triggerValueBefore !== triggerValueAfter;
          const valueContainsTarget = targetNorm && this.normalizeTextValue(triggerValueAfter).indexOf(targetNorm) !== -1;
          const success = !contextElement || valueChanged || valueContainsTarget;
          if (success) {
            console.log('✅ [Input] Выбрана опция в уже открытой панели:', targetValue);
            return { success: true };
          }
        } catch (e) {
          continue;
        }
      }
    }
    for (const root of visibleRoots) {
      if (!isVisible(root)) continue;
      const options = root.querySelectorAll(optionSelector);
      for (const opt of options) {
        if (!isVisible(opt)) continue;
        if (!textMatches(opt)) continue;
        try {
          const toClickRoots = getClickableOption(opt);
          toClickRoots.click();
          await this.delay(50);
          const triggerValueAfterRoots = contextElement ? getTriggerDisplayValue(contextElement) : '';
          const valueChangedRoots = triggerValueBefore !== triggerValueAfterRoots;
          const valueContainsTargetRoots = targetNorm && this.normalizeTextValue(triggerValueAfterRoots).indexOf(targetNorm) !== -1;
          const successRoots = !contextElement || valueChangedRoots || valueContainsTargetRoots;
          if (successRoots) {
            console.log('✅ [Input] Выбрана опция в уже открытой панели:', targetValue);
            return { success: true };
          }
        } catch (e) {
          continue;
        }
      }
    }

    // Fallback: опция в видимой панели с нестандартным корнем (например .select-group под полем)
    const allOptions = document.querySelectorAll(optionSelector);
    const fallbackCandidates = [];
    for (const opt of allOptions) {
      if (!isVisible(opt)) continue;
      if (!textMatches(opt)) continue;
      const panel = opt.closest('[class*="overlay"], [class*="panel"], .select-group, [class*="select-group"], [role="listbox"]');
      if (!panel || !isVisible(panel)) continue;
      fallbackCandidates.push({ panel, opt });
    }
    if (contextElement && contextElement.getBoundingClientRect && fallbackCandidates.length > 1) {
      fallbackCandidates.sort((a, b) => rectDistance(a.panel, contextElement) - rectDistance(b.panel, contextElement));
    }
    const triggerValueBeforeFallback = contextElement ? getTriggerDisplayValue(contextElement) : '';
    for (const { panel, opt } of fallbackCandidates) {
      try {
        const toClickFb = getClickableOption(opt);
        toClickFb.click();
        await this.delay(50);
        const triggerValueAfterFb = contextElement ? getTriggerDisplayValue(contextElement) : '';
        const valueChangedFb = triggerValueBeforeFallback !== triggerValueAfterFb;
        const valueContainsTargetFb = targetNorm && this.normalizeTextValue(triggerValueAfterFb).indexOf(targetNorm) !== -1;
        const successFb = !contextElement || valueChangedFb || valueContainsTargetFb;
        if (successFb) {
          console.log('✅ [Input] Выбрана опция в уже открытой панели (fallback):', targetValue);
          return { success: true };
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.warn('⚠️ [Input] trySelectOptionInRevealedPanels:', e?.message || e);
  }
  return { success: false };
};

/**
 * Находит элемент с повторными попытками
 * @returns {Promise<{element: Element, usedSelector: string}>} Объект с найденным элементом и фактически использованным селектором
 */
TestPlayer.prototype.findElementWithRetry = async function(selectorData, maxRetries = 5, delayMs = 200) {
  // Проверяем, что selectorData валиден
  if (!selectorData) {
    console.error('❌ Селектор не указан');
    return { element: null, usedSelector: 'N/A' };
  }

  // Если селектор - строка, преобразуем в объект
  if (typeof selectorData === 'string') {
    const looksLikeXpath = selectorData.startsWith('/') || selectorData.startsWith('(');
    selectorData = {
      type: looksLikeXpath ? 'xpath' : 'css',
      selector: selectorData,
      value: selectorData
    };
  }

  // Нормализуем: используем value если selector отсутствует (например, после десериализации)
  if (!selectorData.selector && selectorData.value) {
    selectorData.selector = selectorData.value;
  }
  if (!selectorData.type && typeof selectorData.selector === 'string' && (selectorData.selector.startsWith('/') || selectorData.selector.startsWith('('))) {
    selectorData.type = 'xpath';
  }

  // Проверяем, что есть строка селектора
  if (!selectorData.selector) {
    console.error('❌ Селектор не содержит поле "selector" или "value":', selectorData);
    return { element: null, usedSelector: this.formatSelector(selectorData) };
  }

  // === ИСПОЛЬЗОВАНИЕ ЭКСПОНЕНЦИАЛЬНОГО BACKOFF ИЗ ОПТИМИЗАТОРА ===
  if (this.optimizer?.settings?.exponentialBackoffRetry) {
    const result = await this.optimizer.findElementWithExponentialBackoff(selectorData, {
      maxRetries,
      initialDelay: Math.min(delayMs, 500),
      maxDelay: delayMs * 2,
      useMutationObserver: this.optimizer.settings.useMutationObserver
    });
    
    if (result.element) {
      if (result.attempts > 1) {
        console.log(`✅ [Optimizer] Элемент найден на попытке ${result.attempts} (экспоненциальный backoff)`);
      }
      
      // Если элемент найден во время воспроизведения, уведомляем background для снятия метки проблемного селектора
      if (this.isPlaying && this.currentTest) {
        try {
          chrome.runtime.sendMessage({
            type: 'SELECTOR_FOUND_DURING_PLAYBACK',
            testId: this.currentTest.id,
            selector: this.formatSelector(selectorData)
          });
        } catch (error) {
          console.warn('⚠️ Не удалось отправить сообщение о найденном селекторе:', error);
        }
      }
      
      return { element: result.element, usedSelector: this.formatSelector(selectorData) };
    }
    
    console.log(`⚠️ [Optimizer] Элемент не найден после ${result.attempts} попыток`);
  } else {
    // Оригинальная логика поиска
    const selectorInfo = selectorData.selector || JSON.stringify(selectorData);
    let currentSelector = selectorData;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const element = this.selectorEngine.findElementSync(currentSelector);
      
      if (element) {
        // Проверяем, что это действительно DOM элемент
        if (element instanceof Element || element instanceof HTMLElement) {
          if (attempt > 1) {
            console.log(`✅ Элемент найден на попытке ${attempt}: ${selectorInfo}`);
          }
          
          // Если элемент найден во время воспроизведения, уведомляем background для снятия метки проблемного селектора
          if (this.isPlaying && this.currentTest) {
            try {
              chrome.runtime.sendMessage({
                type: 'SELECTOR_FOUND_DURING_PLAYBACK',
                testId: this.currentTest.id,
                selector: this.formatSelector(currentSelector)
              });
            } catch (error) {
              console.warn('⚠️ Не удалось отправить сообщение о найденном селекторе:', error);
            }
          }
          
          // Возвращаем элемент и фактически использованный селектор
          return { element, usedSelector: this.formatSelector(currentSelector) };
        } else {
          console.warn(`⚠️ Найденный объект не является DOM элементом:`, typeof element);
        }
      }
      
      // Если элемент не найден и это не последняя попытка, просто ждем
      if (attempt < maxRetries && !element) {
        console.log(`⏳ Попытка ${attempt}/${maxRetries}: элемент не найден (${selectorInfo}), жду и пробую снова...`);
        // Увеличиваем задержку с каждой попыткой (экспоненциальный backoff)
        const backoffDelay = Math.min(delayMs * Math.pow(1.5, attempt - 1), 1000);
        await this.delay(backoffDelay);
        
        // Пробуем альтернативные селекторы на средних попытках
        if (attempt >= 2 && attempt < maxRetries) {
          const altElement = await this.tryAlternativeSelectors({ selector: currentSelector });
          if (altElement) {
            console.log(`✅ Элемент найден через альтернативный селектор на попытке ${attempt}`);
            
            // Если элемент найден во время воспроизведения, уведомляем background для снятия метки проблемного селектора
            if (this.isPlaying && this.currentTest) {
              try {
                chrome.runtime.sendMessage({
                  type: 'SELECTOR_FOUND_DURING_PLAYBACK',
                  testId: this.currentTest.id,
                  selector: this.formatSelector(currentSelector)
                });
              } catch (error) {
                console.warn('⚠️ Не удалось отправить сообщение о найденном селекторе:', error);
              }
            }
            
            return { element: altElement, usedSelector: this.formatSelector(currentSelector) };
          }
        }
      }
    }
  }
  
  const selectorInfo = selectorData.selector || JSON.stringify(selectorData);
  console.warn(`⚠️ Элемент не найден по основному селектору после ${maxRetries} попыток: ${selectorInfo}`);
  return { element: null, usedSelector: this.formatSelector(selectorData) };
}

TestPlayer.prototype._tryAlternativeSelectorsFallbacks = function(action) {
  if (!action) return null;
  const selectorStr = (action.selector?.selector || action.selector?.value || '').toString();

  // Fallback для XPath вида (.//*[contains(.,'ТЕКСТ')])[2]/following::div[1]: ищем по тексту, затем первый следующий div
  const xpathContainsMatch = selectorStr.match(/contains\s*\(\s*(?:\.|text\s*\(\s*\)\s*)\s*,\s*['"]([^'"]*)['"]\s*\)/);
  const hasFollowingDiv = /following\s*::\s*div\s*\[\s*1\s*\]/.test(selectorStr);
  const indexMatch = selectorStr.match(/\)\s*\[\s*(\d+)\s*\]\s*\/\s*following/);
  const wantIndex = (indexMatch && parseInt(indexMatch[1], 10)) || 1;
  if (xpathContainsMatch && hasFollowingDiv) {
    const searchText = xpathContainsMatch[1];
    const getText = (el) => (this.selectorEngine?.getElementText?.(el) || el.textContent || '').trim();
    try {
      const all = Array.from(document.querySelectorAll('*'));
      const withText = all.filter(el => {
        const t = getText(el);
        return t === searchText || t.includes(searchText) || searchText.includes(t);
      });
      const visible = withText.filter(el => this.isElementVisible && this.isElementVisible(el));
      const list = visible.length ? visible : withText;
      const refNode = list[wantIndex - 1];
      if (refNode && refNode instanceof Element) {
        const allEls = Array.from(document.getElementsByTagName('*'));
        const idx = allEls.indexOf(refNode);
        const followingDiv = idx >= 0 ? allEls.slice(idx + 1).find(el => el.tagName === 'DIV') : null;
        if (followingDiv && followingDiv instanceof Element) {
          console.log(`✅ Элемент найден по fallback XPath (текст "${searchText}", затем следующий div)`);
          return followingDiv;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Fallback для XPath вида //tag[@id='value']/path (div, section и др.) — в т.ч. длинные пути с кастомными тегами
  if (selectorStr && /^\/\/\w+\s*\[\s*@id\s*=\s*['"]/.test(selectorStr) && this.selectorEngine?._xpathIdPathToCssFallback) {
    const el = this.selectorEngine._xpathIdPathToCssFallback(selectorStr);
    if (el && el instanceof Element) {
      console.log('✅ Элемент найден по fallback XPath→CSS (section/div/…):', selectorStr.slice(0, 60) + (selectorStr.length > 60 ? '…' : ''));
      return el;
    }
  }

  // Fallback для aria-label: при изменении части текста (температура, время) ищем по стабильной части
  const isAriaLabel = action.selector?.type === 'aria-label' || /\[aria-label\s*=\s*["']/.test(selectorStr);
  if (isAriaLabel) {
    let ariaValue = (action.selector?.value || '').toString();
    if (!ariaValue && selectorStr) {
      const m = selectorStr.match(/\[aria-label\s*=\s*["']((?:[^"\\]|\\.)*)["']/);
      if (m) ariaValue = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\,/g, ',');
    }
    if (ariaValue) {
      const normalize = (s) => String(s).replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim();
      let staticPart = ariaValue.split(/\s+[−‑–—\-]\s+/)[0].trim();
      if (!staticPart || staticPart.length < 3) staticPart = ariaValue.slice(0, 25);
      staticPart = normalize(staticPart);
      const prefixes = [staticPart];
      if (staticPart.length > 15) prefixes.push(staticPart.slice(0, 15));
      if (staticPart.length > 10) prefixes.push(staticPart.slice(0, 10));
      for (const part of prefixes) {
        if (part.length < 3) continue;
        const escaped = part.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        try {
          const byContains = document.querySelectorAll(`[aria-label*="${escaped}"]`);
          const visible = Array.from(byContains).filter(el => this.isElementVisible(el));
          const candidate = visible[0] || (byContains.length >= 1 ? byContains[0] : null);
          if (candidate && candidate instanceof Element) {
            console.log(`✅ Элемент найден по частичному aria-label: [aria-label*="${part.slice(0, 25)}…"]`);
            return candidate;
          }
        } catch (e) {
          // ignore
        }
      }
      try {
        const allWithAria = Array.from(document.querySelectorAll('[aria-label]'));
        const withStatic = allWithAria.filter(el => {
          const label = normalize(el.getAttribute('aria-label') || '');
          return staticPart.length >= 3 && label.includes(staticPart);
        });
        const visible = withStatic.filter(el => this.isElementVisible(el));
        const candidate = visible[0] || withStatic[0];
        if (candidate && candidate instanceof Element) {
          console.log(`✅ Элемент найден по совпадению aria-label (перебор)`);
          return candidate;
        }
      } catch (e2) {
        // ignore
      }
    }
  }

  // Fallback для ссылок в ленте (ya.ru и др.): длинный селектор с #rythm-feed и > a — ищем по тексту/href внутри контейнера
  const feedRootMatch = selectorStr.match(/#([a-zA-Z0-9_-]+)/);
  const isLinkInFeed = (action.element?.tag === 'a' || />\s*a\s*$/.test(selectorStr)) &&
    (selectorStr.includes('rythm-feed') || selectorStr.includes('feed__') || (feedRootMatch && selectorStr.length > 150));
  if (isLinkInFeed) {
    const rootId = feedRootMatch ? feedRootMatch[1] : 'rythm-feed';
    const root = document.getElementById(rootId);
    const linkText = (action.element?.text || '').toString().trim();
    const linkHref = (action.element?.attributes && typeof action.element.attributes === 'object' && action.element.attributes.href) ? action.element.attributes.href : '';
    if (root && (linkText || linkHref)) {
      try {
        const links = Array.from(root.querySelectorAll('a[href]'));
        const visible = links.filter(el => this.isElementVisible(el));
        const match = (visible.length ? visible : links).find(el => {
          const text = (this.selectorEngine?.getElementText?.(el) || el.textContent || '').trim();
          const href = (el.getAttribute('href') || '').trim();
          if (linkText && text && (text === linkText || text.includes(linkText) || linkText.includes(text))) return true;
          if (linkHref && href && (href === linkHref || href.includes(linkHref) || linkHref.includes(href))) return true;
          return false;
        });
        if (match && match instanceof Element) {
          console.log('✅ Элемент найден по тексту/href ссылки в ленте');
          return match;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // Fallback для хрупких селекторов dropdown: .input-select-background, .open > * (элемент виден только при открытом dropdown)
  const isFragileDropdownClick = /input-select-background|\.open\s*>\s*\*|select-background/i.test(selectorStr);
  if (isFragileDropdownClick) {
    console.log('🔍 Селектор похож на элемент открытого dropdown, ищу триггер для открытия...');
    const triggers = [
      '#type-project__result',
      '#status-project__result',
      '[id$="__result"]',
      'app-select .result',
      'app-select .select-box',
      'app-select .select-group',
      '.result.invalid',
      '.result.valid'
    ];
    for (const sel of triggers) {
      try {
        const el = document.querySelector(sel);
        if (el && this.isElementVisible && this.isElementVisible(el)) {
          console.log(`✅ Найден триггер dropdown для клика: ${sel}`);
          return el;
        }
      } catch (e) {
        // ignore
      }
    }
  }
  
  // ТОЛЬКО ПОСЛЕ неудачи с оригинальным и альтернативными селекторами:
  // Специальная логика для поиска .select-box в app-select или .input-project-status
  // Это должно срабатывать в последнюю очередь, чтобы не найти неправильный элемент
  const isStatusField = action.element?.text?.includes('Статус') || 
                       action.element?.text?.includes('статус') ||
                       (action.element?.text?.includes('выберите') && 
                        (action.selector?.selector?.includes('status') || 
                         action.selector?.value?.includes('status'))) ||
                       action.selector?.selector?.includes('input-project-status') ||
                       action.selector?.selector?.includes('status-project') ||
                       action.selector?.value?.includes('status-project') ||
                       action.selector?.selector?.includes('select-box');
  
  if (isStatusField) {
    console.log('🔍 Специальный поиск для поля статуса...');
    
    // ПРИОРИТЕТ 1: Пробуем найти через app-select[elementid="status-project"]
    const appSelect = document.querySelector('app-select[elementid="status-project"], app-select[ng-reflect-element-id="status-project"]');
    if (appSelect) {
      // Ищем .select-box или кликабельный элемент внутри app-select
      const selectBox = appSelect.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
      if (selectBox) {
        console.log('✅ Найден .select-box через app-select[elementid="status-project"]');
        return selectBox;
      }
      // Если не нашли .select-box, ищем div с placeholder "выберите" внутри app-select
      const placeholderDiv = appSelect.querySelector('div[class*="placeholder"], div:has-text("выберите")');
      if (placeholderDiv) {
        console.log('✅ Найден placeholder div через app-select[elementid="status-project"]');
        return placeholderDiv;
      }
    }
    
    // ПРИОРИТЕТ 2: Пробуем найти через .input-project-status
    const statusContainer = document.querySelector('.input-project-status');
    if (statusContainer) {
      const optionsElement = statusContainer.querySelector('.options, [class*="options"]');
      if (optionsElement) {
        console.log('✅ Найден .options через .input-project-status');
        return optionsElement;
      }
      const resultElement = statusContainer.querySelector('.result, [class*="result"]');
      if (resultElement) {
        console.log('✅ Найден .result через .input-project-status');
        return resultElement;
      }
      const arrowElement = statusContainer.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]');
      if (arrowElement) {
        console.log('✅ Найден .arrow.isShowOptions через .input-project-status');
        return arrowElement;
      }
      const selectBox = statusContainer.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
      if (selectBox) {
        console.log('✅ Найден .select-box через .input-project-status');
        return selectBox;
      }
    }
    
    // ПРИОРИТЕТ 3: Пробуем найти через app-select[label="Статус"]
    const appSelectByLabel = document.querySelector('app-select[label="Статус"], app-select[ng-reflect-label="Статус"]');
    if (appSelectByLabel) {
      const optionsElement = appSelectByLabel.querySelector('.options, [class*="options"]');
      if (optionsElement) {
        console.log('✅ Найден .options через app-select[label="Статус"]');
        return optionsElement;
      }
      const resultElement = appSelectByLabel.querySelector('.result, [class*="result"]');
      if (resultElement) {
        console.log('✅ Найден .result через app-select[label="Статус"]');
        return resultElement;
      }
      const arrowElement = appSelectByLabel.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"]');
      if (arrowElement) {
        console.log('✅ Найден .arrow.isShowOptions через app-select[label="Статус"]');
        return arrowElement;
      }
      const selectBox = appSelectByLabel.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
              if (selectBox) {
        console.log('✅ Найден .select-box через app-select[label="Статус"]');
                return selectBox;
              }
    }
    
    // ПРИОРИТЕТ 4: Пробуем найти через #status-project__result или элемент с ID, содержащим status-project
    const statusResult = document.querySelector('#status-project__result, [id*="status-project__result"], [id*="status-project"]');
    if (statusResult) {
      // Ищем родительский app-select или кликабельный элемент
      const parentAppSelect = statusResult.closest('app-select');
      if (parentAppSelect) {
        const selectBox = parentAppSelect.querySelector('.select-box, [class*="select-box"], .select-group, [class*="select-group"]');
              if (selectBox) {
          console.log('✅ Найден .select-box через #status-project__result -> app-select');
                return selectBox;
              }
            }
      // Если не нашли через app-select, возвращаем сам элемент
      console.log('✅ Найден элемент через #status-project__result');
      return statusResult;
    }
    
    console.warn('⚠️ Не удалось найти элемент для поля статуса через специальные селекторы');
  }
  
  // Если есть информация об элементе, пробуем найти по тексту или другим атрибутам
  if (action.element) {
    // Пробуем найти по тексту
    if (action.element.text) {
      const text = action.element.text.trim();
      const textLower = text.toLowerCase();
      console.log(`🔍 Ищу элемент по тексту: "${text}"`);
      
      // НЕ ищем среди ссылок, если это поле статуса (чтобы не кликнуть на меню)
      const isStatusField = text.includes('Статус') || text.includes('статус') || 
                           text.includes('выберите') || text.includes('Плановый');
      
      if (!isStatusField) {
        // Сначала пробуем найти среди интерактивных элементов (кнопки, ссылки)
        const interactiveSelectors = ['button', 'a', 'input[type="button"]', 'input[type="submit"]', '[role="button"]', '[onclick]'];
        for (const selector of interactiveSelectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          const matching = elements.find(el => {
            const elText = this.selectorEngine.getElementText(el).trim();
            const elTextLower = elText.toLowerCase();
            return elText === text || 
                   elTextLower === textLower ||
                   elText.includes(text) || 
                   text.includes(elText) ||
                   // Для кнопок с текстом "ВОЙТИ" ищем также "войти", "Войти" и т.д.
                   (textLower.includes('войти') && elTextLower.includes('войти'));
          });
          
          if (matching && matching instanceof Element) {
            console.log(`✅ Найден интерактивный элемент по тексту "${text}" через селектор ${selector}`);
            return matching;
          }
        }
      } else {
        console.log('⚠️ Пропускаю поиск среди ссылок для поля статуса (чтобы не кликнуть на меню)');
      }
      
      // Если не нашли среди интерактивных, ищем среди всех элементов
      // Для поля статуса исключаем ссылки и элементы с текстом "пакет документа"
      const selector = isStatusField ? '*:not(a)' : '*';
      const allElements = Array.from(document.querySelectorAll(selector));
      
      // Исключаем тексты, которые НЕ относятся к полю статуса
      const excludedTexts = ['пакет документа', 'пакет', 'документ', 'тип проекта', 'тип'];
      
      const matchingElements = allElements.filter(el => {
        // Для поля статуса дополнительно проверяем, что это не ссылка
        if (isStatusField && (el.tagName === 'A' || el.closest('a'))) {
          return false;
        }
        
        const elText = this.selectorEngine.getElementText(el).trim();
        const elTextLower = elText.toLowerCase();
        
        // Для поля статуса исключаем элементы с текстом "пакет документа" и подобными
        if (isStatusField) {
          const isExcluded = excludedTexts.some(excluded => elTextLower.includes(excluded.toLowerCase()));
          if (isExcluded) {
            console.log(`⚠️ Исключаю элемент с текстом "${elText}" (не относится к полю статуса)`);
            return false;
          }
          
          // Для поля статуса ищем ТОЛЬКО в app-select[elementid="status-project"] или .input-project-status
          const isInStatusField = el.closest('app-select[elementid="status-project"]') ||
                                 el.closest('.input-project-status') ||
                                 el.closest('app-select[ng-reflect-element-id="status-project"]');
          if (!isInStatusField) {
            return false; // Не ищем элементы вне поля статуса
          }
        }
        
        return elText === text || 
               elTextLower === textLower ||
               elText.includes(text) || 
               text.includes(elText);
      });
      
      if (matchingElements.length > 0) {
        // Для поля статуса приоритет отдаем .select-box
        if (isStatusField) {
          const selectBox = matchingElements.find(el => 
            el.classList.contains('select-box') || 
            el.className.includes('select-box') ||
            el.closest('.select-box') ||
            el.classList.contains('select-group') ||
            el.className.includes('select-group')
          );
          if (selectBox) {
            console.log(`✅ Найден .select-box по тексту "${text}"`);
            return selectBox;
          }
        }
        
        const found = matchingElements[0];
        if (found instanceof Element) {
          console.log(`✅ Найдено ${matchingElements.length} элементов по тексту, беру первый`);
          return found;
        }
      }
    }
    
    // Пробуем найти по href (для ссылок)
    if (action.element.href) {
      console.log(`🔍 Ищу ссылку по href: "${action.element.href}"`);
      const link = document.querySelector(`a[href="${action.element.href}"]`);
      if (link && link instanceof Element) {
        console.log('✅ Ссылка найдена по href');
        return link;
      }
    }
    
    // Пробуем найти по value (для input)
    if (action.element.value) {
      console.log(`🔍 Ищу input по value: "${action.element.value}"`);
      const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
      const matching = inputs.find(el => el.value === action.element.value);
      if (matching && matching instanceof Element) {
        console.log('✅ Input найден по value');
        return matching;
      }
    }
    
    // Пробуем найти по name
    if (action.element.name) {
      console.log(`🔍 Ищу элемент по name: "${action.element.name}"`);
      const element = document.querySelector(`[name="${action.element.name}"]`);
      if (element && element instanceof Element) {
        console.log('✅ Элемент найден по name');
        return element;
      }
    }
  }
  
  // Пробуем найти по части селектора (если это ID с динамической частью)
  if (action.selector && action.selector.type === 'id' && action.selector.value) {
    const idValue = action.selector.value;
    // Если ID содержит числа, пробуем найти по части
    const idParts = idValue.split('-');
    if (idParts.length > 1) {
      // Пробуем найти по началу ID (например, для "suggest-item-57677023-0" ищем "suggest-item-")
      const prefix = idParts.slice(0, -1).join('-');
      console.log(`🔍 Ищу элемент по части ID: "${prefix}"`);
      const elements = Array.from(document.querySelectorAll(`[id^="${prefix}"]`));
      if (elements.length > 0 && elements[0] instanceof Element) {
        console.log(`✅ Найдено ${elements.length} элементов по части ID, беру первый`);
        return elements[0];
      }
      
      // Пробуем найти по началу без последней части
      if (idParts.length > 2) {
        const prefix2 = idParts.slice(0, -2).join('-');
        console.log(`🔍 Ищу элемент по части ID (без последних 2 частей): "${prefix2}"`);
        const elements2 = Array.from(document.querySelectorAll(`[id^="${prefix2}"]`));
        if (elements2.length > 0 && elements2[0] instanceof Element) {
          console.log(`✅ Найдено ${elements2.length} элементов, беру первый`);
          return elements2[0];
        }
      }
    }
  }
  
  // Пробуем найти по тегу и тексту
  if (action.element && action.element.tag) {
    const tag = action.element.tag.toLowerCase();
    const text = action.element.text;
    if (text) {
      console.log(`🔍 Ищу ${tag} по тексту: "${text}"`);
      const elements = Array.from(document.querySelectorAll(tag));
      const matching = elements.find(el => {
        const elText = this.selectorEngine.getElementText(el).trim();
        const searchText = text.trim();
        // Более гибкое сравнение: учитываем регистр и частичное совпадение
        return elText === searchText || 
               elText.toLowerCase() === searchText.toLowerCase() ||
               elText.includes(searchText) || 
               searchText.includes(elText);
      });
      if (matching && matching instanceof Element) {
        console.log('✅ Элемент найден по тегу и тексту');
        return matching;
      }
    }
  }
  
  // Специальная обработка для кнопок: ищем по тексту среди всех кнопок
  if (action.element && action.element.text) {
    const text = action.element.text.trim().toLowerCase();
    // Ищем среди button, input[type="button"], input[type="submit"], и элементов с role="button"
    const buttonSelectors = ['button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]'];
    
    for (const selector of buttonSelectors) {
      const buttons = Array.from(document.querySelectorAll(selector));
      const matching = buttons.find(btn => {
        const btnText = this.selectorEngine.getElementText(btn).trim().toLowerCase();
        return btnText === text || 
               btnText.includes(text) || 
               text.includes(btnText) ||
               // Для кнопок с текстом "ВОЙТИ" ищем также "войти", "Войти" и т.д.
               (text.includes('войти') && btnText.includes('войти'));
      });
      
      if (matching && matching instanceof Element) {
        console.log(`✅ Кнопка найдена по тексту "${action.element.text}" через селектор ${selector}`);
        return matching;
      }
    }
  }
  
  // Пробуем найти по aria-label (для кнопок и других элементов)
  if (action.element && action.element.text) {
    const text = action.element.text.trim();
    const elementsWithAriaLabel = Array.from(document.querySelectorAll('[aria-label]'));
    const matching = elementsWithAriaLabel.find(el => {
      const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
      return ariaLabel === text || 
             ariaLabel.toLowerCase() === text.toLowerCase() ||
             ariaLabel.includes(text) || 
             text.includes(ariaLabel);
    });
    
    if (matching && matching instanceof Element) {
      console.log(`✅ Элемент найден по aria-label: "${text}"`);
      return matching;
    }
  }
  
  console.log('❌ Альтернативные способы не помогли найти элемент');
  return null;
}

TestPlayer.prototype.notifyStepProgress = function(stepInfo) {
  chrome.runtime.sendMessage({
    type: 'TEST_STEP_PROGRESS',
    testId: this.currentTest?.id,
    step: stepInfo.current,
    total: stepInfo.total,
    stepType: stepInfo.type,
    action: stepInfo.action
  }).catch(() => {});
}

TestPlayer.prototype.ensureRunHistoryInitialized = function() {
  if (this.runHistory) {
    return;
  }
  const now = Date.now();
  const testId = this.currentTest?.id ? String(this.currentTest.id) : 'unknown';
  const testName = this.currentTest?.name || 'Без имени';
  this.runHistory = {
    testId: testId,
    testName: testName,
    startTime: new Date(now).toISOString(),
    runId: now,
    mode: this.playMode || 'optimized',
    steps: [],
    success: false,
    error: null,
    totalDuration: 0,
    transcript: []
  };
  console.warn('⚠️ [History] runHistory отсутствовал, создал новую запись для продолжения.');
}

/**
 * Добавляет подшаг анализа при выполнении adaptive-auto (analysis-selectors, analysis-fill-fields).
 * Подшаги сохраняются в _collectedAdaptiveSubSteps и прикрепляются к родительскому stepRecord.
 * Позволяет отображать все шаги в отчёте и аналитике.
 */
TestPlayer.prototype._pushAnalysisSubStep = function(subtype, success, duration = 0, errorMsg = null) {
  if (!this._currentStepContext) return;
  if (!Array.isArray(this._collectedAdaptiveSubSteps)) this._collectedAdaptiveSubSteps = [];
  const ctx = this._currentStepContext;
  const stepRecord = {
    stepNumber: ctx.realStepNumber,
    actionIndex: ctx.actionIndex,
    type: 'analysis',
    subtype,
    actionType: 'analysis',
    success: success !== false,
    error: success === false ? (errorMsg || 'Ошибка') : null,
    duration: duration || 0,
    selector: null,
    value: null,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    parentStep: true,
    fieldLabel: subtype === 'analysis-selectors' ? 'Получить селекторы' : subtype === 'analysis-fill-fields' ? 'Заполнить поля' : null
  };
  this._collectedAdaptiveSubSteps.push(stepRecord);
}

TestPlayer.prototype.showRecordingNotification = function() {
  // Удаляем предыдущее уведомление, если оно есть
  this.hideRecordingNotification();
  
  // Создаем уведомление о начале записи
  const notification = document.createElement('div');
  notification.id = 'recording-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f44336;
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideInRight 0.3s ease-out;
  `;
  notification.innerHTML = `
    <span style="font-size: 20px;">🔴</span>
    <span>Запись начата. Нажмите кнопку остановки записи, чтобы завершить.</span>
  `;
  document.body.appendChild(notification);
  
  // Сохраняем ссылку на уведомление
  this.recordingNotification = notification;
  
  // Добавляем стили для анимации, если их еще нет
  if (!document.getElementById('recording-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'recording-notification-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

TestPlayer.prototype.hideRecordingNotification = function() {
  // Удаляем уведомление о записи, если оно существует
  if (this.recordingNotification && this.recordingNotification.parentNode) {
    this.recordingNotification.parentNode.removeChild(this.recordingNotification);
    this.recordingNotification = null;
  }
  
  // Также пробуем найти и удалить по ID (на случай, если ссылка потеряна)
  const notificationById = document.getElementById('recording-notification');
  if (notificationById && notificationById.parentNode) {
    notificationById.parentNode.removeChild(notificationById);
  }
}

TestPlayer.prototype.resumePlaybackAfterRecording = async function(markerActionIndex) {
  // markerActionIndex приходит из background и соответствует индексу маркера в ОРИГИНАЛЬНОМ массиве actions.
  // Это надежнее, чем полагаться на сохраненный runtime-индекс (который может "плыть" при фильтрации hidden).
  const test = this.currentTest || (this.pendingResumeAfterRecording ? this.pendingResumeAfterRecording.test : null);
  this.pendingResumeAfterRecording = null;
  // Возобновление после записи: считаем, что пауза по маркеру больше не активна
  this.pausedOnRecordMarker = false;
  if (!test) {
    console.log('⚠️ Нет теста для продолжения воспроизведения после записи');
    return;
  }

  // Загружаем обновленный тест
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_TEST',
      testId: test.id
    });

    if (response && response.success && response.test) {
      this.currentTest = response.test;
      console.log('✅ Тест обновлен после записи, продолжаю воспроизведение...');
    } else {
      console.warn('⚠️ Не удалось загрузить обновленный тест, использую сохраненный');
      this.currentTest = test;
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при загрузке обновленного теста, использую сохраненный:', error);
    this.currentTest = test;
  }

  // Инициализируем переменные из теста
  this.userVariables = {};
  if (this.currentTest.variables) {
    console.log(`📦 [Variables] Инициализация переменных из теста (resumePlaybackAfterRecording). Всего переменных: ${Object.keys(this.currentTest.variables).length}`);
    for (const [varName, varData] of Object.entries(this.currentTest.variables)) {
      if (varData && typeof varData === 'object' && varData.value !== undefined && varData.value !== null) {
        this.userVariables[varName] = varData.value;
        const displayValue = String(varData.value);
        const isSensitive = varData.sensitive;
        console.log(`📦 [Variables] Загружена переменная "${varName}" = "${isSensitive ? '••••••••' : displayValue.substring(0, 20) + (displayValue.length > 20 ? '...' : '')}"`);
      } else if (varData !== undefined && varData !== null && typeof varData !== 'object') {
        // Если переменная сохранена в старом формате (просто значение)
        this.userVariables[varName] = varData;
        console.log(`📦 [Variables] Загружена переменная "${varName}" (старый формат) = "${String(varData).substring(0, 20)}${String(varData).length > 20 ? '...' : ''}"`);
      } else {
        console.warn(`⚠️ [Variables] Переменная "${varName}" пропущена (нет значения):`, varData);
      }
    }
    console.log(`📦 [Variables] Загружено ${Object.keys(this.userVariables).length} переменных из теста`);
    console.log(`📦 [Variables] Список переменных: ${Object.keys(this.userVariables).join(', ')}`);
  } else {
    // Это нормальная ситуация - не все тесты имеют переменные
    console.log(`ℹ️ [Variables] test.variables отсутствует или пуст (это нормально, если тест не использует переменные)`);
  }

  // Продолжаем воспроизведение с действия после маркера (по оригинальному индексу)
  const updatedVisibleActions = this.getRuntimeActions(this.currentTest.actions);

  const original = this.currentTest.actions || [];
  const nextActionIndex = updatedVisibleActions.findIndex(a => original.indexOf(a) > markerActionIndex);

  if (nextActionIndex === -1) {
    console.log('✅ После маркера нет следующих действий, тест завершен');
    this.notifyCompletion(true);
    return;
  }

  console.log(`▶️ Продолжаю воспроизведение с действия ${nextActionIndex + 1} из ${updatedVisibleActions.length}`);

  const remainingActions = updatedVisibleActions.slice(nextActionIndex);
  const nextMarkerIndex = remainingActions.findIndex(a => a.recordMarker === true);

  this.isPlaying = true;
  if (nextMarkerIndex !== -1) {
    const actionsToExecute = remainingActions.slice(0, nextMarkerIndex + 1);
    console.log(`📋 Продолжаю до следующего маркера (${actionsToExecute.length} действий)`);
    await this.executeActionsFromArray(actionsToExecute, nextActionIndex);
  } else {
    const actionsToExecute = remainingActions;
    console.log(`📋 Продолжаю до конца теста (${actionsToExecute.length} действий)`);
    await this.executeActionsFromArray(actionsToExecute, nextActionIndex);
  }
}

/**
 * Получает данные авторизации (если есть)
 */
TestPlayer.prototype.getAuthData = function() {
  try {
    const authData = {};
    const storedAuth = localStorage.getItem('authData');
    if (storedAuth) {
      try {
        return JSON.parse(storedAuth);
      } catch (e) {
        // Игнорируем ошибки парсинга
      }
    }
    return authData;
  } catch (error) {
    return {};
  }
}

/**
 * Получает преднастройки (если есть)
 */
TestPlayer.prototype.getPreconditions = function() {
  const preconditions = [];
  if (window.location.href) {
    preconditions.push(`Начальная страница: ${window.location.href}`);
  }
  return preconditions;
}

TestPlayer.prototype.executeActionsFromArray = async function(actions, startIndex = 0) {
  // Выполняем действия из массива, начиная с указанного индекса
  for (let i = 0; i < actions.length; i++) {
    if (!this.isPlaying) {
      console.log('⏹️ Воспроизведение остановлено пользователем');
      return;
    }

    const action = actions[i];
    if (!action) {
      continue;
    }

    const globalIndex = startIndex + i;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`▶️ Шаг ${globalIndex + 1}: ${action.type}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // Если шаг помечен маркером — запускаем запись сразу, не выполняя шаг.
      const originalActionIndex = (this.currentTest?.actions || []).indexOf(action);
      if (action.recordMarker === true && originalActionIndex !== -1) {
        console.log(`🔴 Обнаружен маркер записи на шаге ${originalActionIndex + 1}, запускаю запись (до выполнения шага)...`);
        const allVisibleActions = this.getRuntimeActions(this.currentTest.actions);
        this.pendingResumeAfterRecording = {
          test: this.currentTest,
          currentActionIndex: originalActionIndex,
          visibleActions: allVisibleActions,
          playMode: this.playMode
        };
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'START_RECORDING_INTO_TEST',
            testId: this.currentTest.id,
            insertAfterIndex: originalActionIndex,
            tabId: this.tabId
          });
          if (response && response.success) {
            console.log('✅ Запись запущена успешно');
            this.isPlaying = false;
            this.showRecordingNotification();
          }
        } catch (error) {
          console.error('❌ Ошибка при запуске записи:', error);
          this.pendingResumeAfterRecording = null;
        }
        return;
      }

      const isHiddenInOptimized = !!action.hidden && this.playMode !== 'full';
      // Если маркер записи стоит на hidden шаге, не выполняем сам шаг (он скрыт),
      // но маркер всё равно должен запускать запись.
      if (!isHiddenInOptimized) {
        await this.executeAction(action);
      } else {
        console.log('🙈 Шаг скрыт (optimized), пропускаю выполнение действия, но обрабатываю маркер (если есть).');
      }
      
      // Маркер записи обрабатывается ВЫШЕ (до выполнения шага),
      // поэтому здесь повторно не проверяем, чтобы не дублировать логику и не ловить ошибки с переменными.
    } catch (error) {
      console.error(`❌ Ошибка при выполнении действия ${globalIndex + 1}:`, error);
      throw error;
    }
  }
  
  // Если дошли до конца без маркеров, завершаем тест
  console.log('✅ Все действия выполнены, тест завершен');
  this.notifyCompletion(true);
  this.stopPlaying();
}

TestPlayer.prototype.notifyCompletion = function(success, error = null, optimizationSummary = null) {
  const adaptiveRunResults = [];
  if (this.currentTest?.actions) {
    this.currentTest.actions.forEach((action) => {
      if (action.type === 'adaptive' && (action._runHistory?.length > 0 || action._statistics)) {
        adaptiveRunResults.push({
          _runHistory: action._runHistory || [],
          _statistics: action._statistics || null
        });
      } else {
        adaptiveRunResults.push(null);
      }
    });
  }
  const actionUrlUpdates = (this.currentTest?.actions || [])
    .map((a, i) => (a.type === 'analysis' && a.url ? { index: i, url: a.url } : null))
    .filter(Boolean);

  const updatedVariables = {};
  if (this.userVariables && typeof this.userVariables === 'object') {
    for (const [k, v] of Object.entries(this.userVariables)) {
      try {
        if (v !== undefined && v !== null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
          updatedVariables[k] = v;
        } else if (typeof v === 'object' && v !== null && !(v instanceof HTMLElement) && typeof (v.value) !== 'undefined') {
          updatedVariables[k] = v.value;
        }
      } catch (_) {}
    }
  }
  const rh = this.runHistory || {};
  const steps = rh.steps || [];
  const expectedTotal = this.getRuntimeActions(this.currentTest?.actions || []).length;
  const stepsTotal = expectedTotal > 0 ? expectedTotal : steps.length;
  let stepsCompleted = steps.filter(s => s.success !== false).length;
  // Если записей меньше, чем шагов (например, последний шаг — logout с навигацией — не успел попасть в runHistory), но все имеющиеся успешны — считаем недостающие выполненными
  if (steps.length < stepsTotal && steps.every(s => s.success !== false)) {
    stepsCompleted = stepsTotal;
  }
  const startMs = rh.startTime ? new Date(rh.startTime).getTime() : null;
  const durationMs = (rh.totalDuration > 0 ? rh.totalDuration : (startMs ? Date.now() - startMs : 0));

  chrome.runtime.sendMessage({
    type: 'TEST_COMPLETED',
    testId: this.currentTest?.id,
    testName: this.currentTest?.name,
    success,
    error,
    runMode: this.playMode,
    stepsCompleted,
    stepsTotal,
    durationMs,
    optimizationSummary,
    adaptiveRunResults,
    actionUrlUpdates: actionUrlUpdates.length ? actionUrlUpdates : undefined,
    updatedVariables: Object.keys(updatedVariables).length ? updatedVariables : undefined
  }).then((response) => {
    if (response?.suppressCompletionPopup) return;
    this.showCompletionPopup(success, error);
  }).catch(() => {
    this.showCompletionPopup(success, error);
  });

  // Очищаем информацию о шаге
  chrome.runtime.sendMessage({
    type: 'TEST_STEP_PROGRESS',
    testId: this.currentTest?.id,
    step: 0,
    total: 0,
    stepType: null,
    action: null
  }).catch(() => {});
}

/**
 * Формирует компактный отчёт по адаптивному шагу для completion popup
 */
TestPlayer.prototype._buildAdaptiveReportHTML = function(actions, stepIndexMap) {
  const reports = [];
  const test = this.currentTest;
  if (!test?.actions) return '';

  test.actions.forEach((action, idx) => {
    if (action.type !== 'adaptive') return;
    const subtype = (action.subtype || '').toLowerCase().trim();
    const runHistory = action._runHistory;
    if (!Array.isArray(runHistory) || runHistory.length === 0) return;

    const stepNum = (stepIndexMap && stepIndexMap[idx] != null) ? stepIndexMap[idx] : idx + 1;
    const isAuto = subtype === 'adaptive-auto';

    if (isAuto) {
      const seen = new Set();
      const rows = runHistory
        .filter(e => e.action && !['wizard-detected', 'completed', 'error', 'variations'].includes(e.action))
        .filter(e => {
          const key = `${e.iteration}|${e.action}|${e.timestamp || ''}|${e.selector || ''}|${e.buttonText || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(e => {
          let details = '-';
          if (e.details) {
            details = e.details;
          } else if (e.action === 'fill-fields') {
            const filled = e.fieldsFilled ?? 0;
            const attempted = e.fieldsAttempted ?? filled;
            const showAttempt = (e.verified === false || filled === 0) && attempted > 0;
            details = showAttempt
              ? `Попытка ${attempted} полей (фактически ${filled}${e.verified === false ? ', не подтверждено визуально' : ''})`
              : `Заполнено ${filled} полей`;
          } else if (e.action === 'click') {
            const bt = (e.buttonType || 'unknown').toLowerCase();
            const label = bt === 'save' ? 'save' : bt === 'navigation' ? 'navigation' : 'other';
            details = `${label}: "${(e.buttonText || '').slice(0, 40)}"`;
          } else if (e.action === 'dialog') {
            details = `Validation: "${(e.dialogText || '').slice(0, 40)}"`;
          } else if (e.action === 'dropdown-exploration') {
            const sel = (e.selector || '').split(/[#>.]/).pop() || 'select';
            details = `${sel}: ${e.optionsTried ?? 0} опции`;
          } else if (e.action === 'checkbox-toggle') {
            const sel = (e.selector || '').split(/[#>.]/).pop() || 'checkbox';
            details = `${sel}: checked`;
          } else if (e.action === 'backtrack') {
            details = e.to ? 'Вернулся к предыдущей странице' : 'Backtrack';
          } else if (e.action === 'modal-form') {
            details = e.saved ? 'Сохранено' : `Не сохранено (пустых: ${e.formState?.empty ?? 0})`;
          } else if (e.action === 'direct-text-fill') {
            details = `Заполнено ${e.fieldsFilled ?? 0} полей (прямой ввод)`;
          } else if (e.action === 'combobox-fill') {
            details = e.value ? `Выбрано: "${String(e.value).slice(0, 30)}"` : 'combobox';
          } else if (e.action === 'app-select-fill' || e.action === 'app-select-exploration') {
            details = e.value ? `Выбрано: "${String(e.value).slice(0, 30)}"` : 'app-select';
          } else if (e.action === 'recovery') {
            details = e.buttonText ? `"${String(e.buttonText).slice(0, 30)}"` : e.recoveryType || '-';
          } else {
            details = e.buttonText || e.dialogText || e.selector || '-';
          }
          const ok = e.success !== false ? '✓' : '✗';
          return { iter: e.iteration ?? null, action: e.action, details, ok };
        });
      if (rows.length === 0) return;
      let lastIter = null;
      const rowsWithGroupedIter = rows.map(r => {
        const showIter = r.iter !== lastIter;
        if (showIter) lastIter = r.iter;
        return [showIter ? String(r.iter ?? '-') : '', r.action, r.details, r.ok];
      });
      reports.push({
        title: `adaptive-auto — Шаг ${stepNum}`,
        headers: ['Итерация', 'Действие', 'Детали', 'Успех'],
        rows: rowsWithGroupedIter
      });
    } else if (subtype === 'adaptive-single') {
      const rows = runHistory.map((e, i) => {
        const ok = e.success !== false ? '✓' : '✗';
        const type = e.actionType || '-';
        const sel = (e.selector || '-').length > 25 ? (e.selector || '').slice(0, 22) + '…' : (e.selector || '-');
        return [i + 1, type, sel, ok];
      });
      reports.push({
        title: `adaptive-single — Шаг ${stepNum}`,
        headers: ['Попытка', 'Тип', 'Селектор', 'Успех'],
        rows
      });
    }
  });

  if (reports.length === 0) return '';

  return reports.map(r => `
    <div style="margin-top:12px;font-size:12px;">
      <div style="font-weight:600;margin-bottom:6px;color:#333;">${r.title}</div>
      <div style="overflow-x:auto;border:1px solid #e0e0e0;border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr>${r.headers.map(h => `<th style="padding:4px 8px;text-align:left;background:#f5f5f5;border-bottom:1px solid #e0e0e0;">${h}</th>`).join('')}</tr></thead>
          <tbody>${r.rows.map(row => `<tr>${row.map((c, i) => `<td style="padding:4px 8px;border-bottom:1px solid #eee;">${String(c).replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  `).join('');
}

/**
 * Показывает всплывающее окно с краткими результатами теста при остановке.
 * Не показывается, если в настройках отключены уведомления (playback.showRunNotifications)
 * или идёт прогон группы (ни один вложенный кейс не выводит свой отчёт — только итог по группе в popup).
 */
TestPlayer.prototype.showCompletionPopup = function(success, error = null) {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((response) => {
    const settings = response?.settings;
    const showNotifications = settings?.playback?.showRunNotifications !== false;
    if (!showNotifications) return;
    const isGroupRun = this.isGroupRun || response?.isGroupRun === true;
    if (isGroupRun) return;
    this._showCompletionPopupBody(success, error);
  }).catch(() => {
    const isGroupRun = this.isGroupRun;
    if (isGroupRun) return;
    this._showCompletionPopupBody(success, error);
  });
}

TestPlayer.prototype._showCompletionPopupBody = function(success, error = null) {
  const existing = document.getElementById('autotest-completion-popup');
  if (existing) existing.remove();

  const rh = this.runHistory || {};
  const steps = rh.steps || [];
  const completed = steps.filter(s => s.success !== false).length;
  const total = steps.length;
  const startMs = rh.startTime ? new Date(rh.startTime).getTime() : null;
  const duration = (rh.totalDuration > 0 ? rh.totalDuration : (startMs ? Date.now() - startMs : 0));
  const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`;

  const hasPerformance = this.performanceMonitoringEnabled ||
    this.currentTest?.actions?.some(
      a => a.type === 'analysis' && (a.subtype || '').toLowerCase().trim() === 'analysis-performance'
    );
  const perfLinkHtml = hasPerformance && typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? `<a href="${chrome.runtime.getURL('performance/performance-dashboard.html')}?testId=${encodeURIComponent(this.currentTest?.id || 'latest')}" target="_blank" rel="noopener" style="display:block;margin-bottom:12px;font-size:13px;color:#1565c0;text-decoration:underline;">📊 Performance dashboard</a>`
    : '';

  const stepIndexMap = {};
  if (Array.isArray(steps)) {
    steps.forEach((s, i) => {
      stepIndexMap[i] = s.stepNumber ?? i + 1;
    });
  }
  const adaptiveReportsHtml = this._buildAdaptiveReportHTML(this.currentTest?.actions, stepIndexMap);

  const overlay = document.createElement('div');
  overlay.id = 'autotest-completion-popup';
  overlay.setAttribute('data-autotest-completion', '1');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.5)',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif'
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'background:#fff',
    'border-radius:12px',
    'box-shadow:0 12px 40px rgba(0,0,0,0.25)',
    'padding:24px',
    'max-width:600px',
    'width:90%',
    'max-height:85vh',
    'overflow-y:auto'
  ].join(';');

  const statusColor = success ? '#2e7d32' : '#c62828';
  const statusText = success ? 'Тест завершён успешно' : 'Тест остановлен';
  const statusIcon = success ? '✅' : '❌';
  const dismissedDialogs = rh.dismissedDialogs || [];
  const dialogsHtml = dismissedDialogs.length > 0
    ? `<div style="font-size:13px;color:#1565c0;background:#e3f2fd;padding:10px;border-radius:8px;margin-bottom:12px;">
        <strong>Закрыто диалогов (остались на странице):</strong> ${dismissedDialogs.length}
        ${dismissedDialogs.slice(0, 2).map(d => `<div style="margin-top:4px;font-size:12px;color:#555;">${String(d.text || '').slice(0, 80).replace(/</g, '&lt;')}${(d.text || '').length > 80 ? '…' : ''}</div>`).join('')}
      </div>`
    : '';

  card.innerHTML = `
    <div style="font-size:18px;font-weight:600;margin-bottom:16px;color:${statusColor};">
      ${statusIcon} ${statusText}
    </div>
    <div style="font-size:14px;color:#555;margin-bottom:8px;">
      Выполнено шагов: ${completed}${total > 0 ? ` / ${total}` : ''}
    </div>
    <div style="font-size:14px;color:#555;margin-bottom:${error || dialogsHtml ? '12px' : '16px'};">
      Длительность: ${durationStr}
    </div>
    ${perfLinkHtml}
    ${dialogsHtml}
    ${error ? `<div style="font-size:13px;color:#c62828;background:#ffebee;padding:10px;border-radius:8px;margin-bottom:16px;">${String(error).replace(/</g, '&lt;')}</div>` : ''}
    ${adaptiveReportsHtml}
    <button type="button" id="autotest-completion-close" style="
      width:100%;margin-top:16px;background:#1976d2;color:#fff;border:0;padding:10px 16px;
      border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;
    ">Закрыть</button>
  `;

  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  card.querySelector('#autotest-completion-close').addEventListener('click', () => overlay.remove());

  document.documentElement.appendChild(overlay);
}

/**
 * Показывает сводный отчёт по завершении прогона группы тестов (с учётом настройки showRunNotifications).
 */
TestPlayer.prototype.showGroupSummaryPopup = function(summary) {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((response) => {
    const settings = response?.settings;
    const showNotifications = settings?.playback?.showRunNotifications !== false;
    if (!showNotifications) return;
    this._showGroupSummaryPopupBody(summary);
  }).catch(() => {
    this._showGroupSummaryPopupBody(summary);
  });
}

TestPlayer.prototype._showGroupSummaryPopupBody = function(summary) {
  const existing = document.getElementById('autotest-group-summary-popup');
  if (existing) existing.remove();

  const results = summary.results || [];
  const totalDurationMs = summary.totalDurationMs ?? results.reduce((s, r) => s + (r.durationMs || 0), 0);
  const durationStr = totalDurationMs < 1000 ? `${totalDurationMs}ms` : `${(totalDurationMs / 1000).toFixed(2)}s`;
  const errors = summary.errors || [];
  const success = summary.success !== false && errors.length === 0;
  const statusColor = success ? '#2e7d32' : '#c62828';
  const statusText = success ? 'Группа тестов завершена успешно' : 'Группа тестов завершена с ошибками';
  const statusIcon = success ? '✅' : '❌';

  const rowsHtml = results.map((r, i) => {
    const ok = r.success !== false ? '✅' : '❌';
    const steps = r.stepsTotal != null ? `${r.stepsCompleted ?? 0} / ${r.stepsTotal}` : '—';
    const dur = r.durationMs != null ? (r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(2)}s`) : '—';
    const name = String(r.testName || r.testId || `Тест ${i + 1}`).replace(/</g, '&lt;');
    const errHtml = r.error ? `<div style="font-size:11px;color:#c62828;margin-top:2px;">${String(r.error).replace(/</g, '&lt;')}</div>` : '';
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${ok}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${name}${errHtml}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${steps}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${dur}</td></tr>`;
  }).join('');

  const errorsBlock = errors.length > 0
    ? `<div style="font-size:13px;color:#c62828;background:#ffebee;padding:10px;border-radius:8px;margin:12px 0;"><strong>Ошибки:</strong><ul style="margin:6px 0 0;padding-left:18px;">${errors.map(e => `<li>${String(e.testName || '').replace(/</g, '&lt;')}: ${String(e.error ?? '').replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'autotest-group-summary-popup';
  overlay.setAttribute('data-autotest-completion', '1');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.25);padding:24px;max-width:640px;width:90%;max-height:85vh;overflow-y:auto';
  card.innerHTML = `
    <div style="font-size:18px;font-weight:600;margin-bottom:16px;color:${statusColor};">
      ${statusIcon} ${statusText}
    </div>
    <div style="font-size:14px;color:#555;margin-bottom:12px;">
      Выполнено тестов: ${results.length} · Общее время: ${durationStr}
    </div>
    ${errorsBlock}
    <div style="overflow-x:auto;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f5f5f5;"><th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e0e0e0;"></th><th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Тест</th><th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Шаги</th><th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Время</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <button type="button" id="autotest-group-summary-close" style="width:100%;margin-top:8px;background:#1976d2;color:#fff;border:0;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">Закрыть</button>
  `;
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  const closeBtn = card.querySelector('#autotest-group-summary-close');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  document.documentElement.appendChild(overlay);
}

/**
 * Проверяет, было ли значение выбрано в dropdown
 */
TestPlayer.prototype.checkIfValueSelected = async function(selectBoxElement, expectedValue) {
  const expectedLower = this.normalizeTextValue(expectedValue);
  const placeholderValues = ['выберите', 'выберите или введите', 'select'];
  const isMeaningful = (val) => !!val && !placeholderValues.some(ph => val.includes(ph));
  const matchesExpected = (val) => !!val && (!!expectedLower ? (val === expectedLower || val.includes(expectedLower) || expectedLower.includes(val)) : !!val);
  
  const currentLower = this.normalizeTextValue(selectBoxElement.textContent);
  if (isMeaningful(currentLower) && matchesExpected(currentLower)) {
    return true;
  }
  
  const nativeSelect = this.findNativeSelectElement(selectBoxElement);
  if (nativeSelect) {
    const nativeText = this.normalizeTextValue(this.getNativeSelectDisplayValue(nativeSelect));
    const nativeValue = this.normalizeTextValue(nativeSelect.value);
    if (isMeaningful(nativeText) && matchesExpected(nativeText)) {
      return true;
    }
    if (isMeaningful(nativeValue) && matchesExpected(nativeValue)) {
      return true;
    }
  }
  
  const appSelect = selectBoxElement.closest('app-select');
  if (appSelect) {
    const selectBox = appSelect.querySelector('.select-box, [class*="select-box"]');
    if (selectBox) {
      const boxLower = this.normalizeTextValue(selectBox.textContent);
      if (isMeaningful(boxLower) && matchesExpected(boxLower)) {
        return true;
      }
    }
    
    const ngReflectValue = this.normalizeTextValue(
      appSelect.getAttribute('ng-reflect-model') ||
      appSelect.getAttribute('ng-reflect-value') ||
      appSelect.getAttribute('ng-reflect-selected-value')
    );
    if (matchesExpected(ngReflectValue)) {
      return true;
    }
  }
  
  const hiddenInput = selectBoxElement.closest('.input-project-status, app-select')?.querySelector('input[type="hidden"]');
  if (hiddenInput && hiddenInput.value) {
    const inputValueLower = this.normalizeTextValue(hiddenInput.value);
    if (matchesExpected(inputValueLower)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Универсальный выбор опции в dropdown (работает с любыми фреймворками)
 * Ищет все видимые элементы-опции и кликает по подходящему
 */
TestPlayer.prototype.selectDropdownUniversal = async function(triggerElement, targetValue) {
  try {
    console.log(`🔍 [Universal] Универсальный поиск опции "${targetValue}"`);
    
    // Нормализуем целевое значение
    const targetNormalized = this.normalizeTextValue(String(targetValue));
    
    // Стратегия 1: Поиск опций в общих селекторах
    const commonSelectors = [
      '[role="option"]',
      '[class*="option"]',
      '[class*="item"]',
      '[class*="list-item"]',
      '[class*="dropdown-item"]',
      '[class*="menu-item"]',
      'li[data-value]',
      'li[data-option]',
      'div[data-value]',
      'div[data-option]'
    ];
    
    let allOptions = [];
    for (const selector of commonSelectors) {
      const options = Array.from(document.querySelectorAll(selector));
      allOptions = allOptions.concat(options);
    }
    
    // Убираем дубликаты
    allOptions = [...new Set(allOptions)];
    
    // Фильтруем только видимые элементы
    const visibleOptions = allOptions.filter(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && 
             style.visibility !== 'hidden' &&
             style.opacity !== '0' &&
             rect.width > 0 && 
             rect.height > 0;
    });
    
    console.log(`🔍 [Universal] Найдено ${visibleOptions.length} видимых опций`);
    
    // Функция сопоставления текста
    const matchText = (optionText, target) => {
      const optionNormalized = this.normalizeTextValue(optionText);
      if (!optionNormalized || !target) return false;
      
      // Точное совпадение
      if (optionNormalized === target) return true;
      
      // Содержит целевое значение
      if (optionNormalized.includes(target)) return true;
      
      // Целевое значение содержит текст опции
      if (target.includes(optionNormalized)) return true;
      
      // Извлечение аббревиатуры из скобок (пример: "Постановление (ПП)" → "пп")
      const abbrevMatch = target.match(/\(([^)]+)\)/);
      if (abbrevMatch) {
        const abbrev = this.normalizeTextValue(abbrevMatch[1]);
        if (optionNormalized.includes(abbrev)) return true;
      }
      
      // Проверка без скобок
      const targetWithoutParens = target.replace(/\s*\([^)]+\)\s*/g, '').trim();
      if (targetWithoutParens && optionNormalized.includes(targetWithoutParens)) return true;
      
      return false;
    };
    
    // Поиск подходящей опции
    let matchedOption = null;
    for (const option of visibleOptions) {
      const text = option.textContent || option.innerText || '';
      const dataValue = option.getAttribute('data-value') || option.getAttribute('value') || '';
      
      if (matchText(text, targetNormalized) || matchText(dataValue, targetNormalized)) {
        matchedOption = option;
        console.log(`✅ [Universal] Найдена опция: "${text.substring(0, 50)}"`);
        break;
      }
    }
    
    if (!matchedOption) {
      console.warn(`⚠️ [Universal] Не найдена опция с текстом "${targetValue}"`);
      return { success: false, reason: 'option not found' };
    }
    
    // Кликаем по опции
    this._dispatchClick(matchedOption);
    await this.delay(300);
    
    // Проверяем, что значение выбрано
    const confirmed = await this.checkIfValueSelected(triggerElement, targetValue);
    if (confirmed) {
      return { success: true, selectedValue: targetValue, method: 'universal' };
    }
    
    // Повторная попытка с двойным кликом
    console.log(`🔄 [Universal] Повторная попытка с двойным кликом`);
    this._dispatchClick(matchedOption);
    this._dispatchClick(matchedOption);
    await this.delay(300);
    
    const confirmedRetry = await this.checkIfValueSelected(triggerElement, targetValue);
    return { 
      success: confirmedRetry, 
      selectedValue: confirmedRetry ? targetValue : null,
      method: 'universal-retry'
    };
    
  } catch (e) {
    console.error(`❌ [Universal] Ошибка:`, e);
    return { success: false, reason: e.message };
  }
}

/**
 * Fallback: выбор опции в кастомном dropdown по логике analysis-fill-fields.
 * Используется когда autoSelectDropdownValue не сработал.
 */
TestPlayer.prototype.selectDropdownValueViaFillFieldsStyle = async function(container, targetValue) {
  if (!container || !targetValue) return { success: false };
  const rootContainer = (container.closest && container.closest('[elementid], app-select, app-group-item-select, ng-select, mat-select, p-dropdown, v-select')) || container;
  const targetLower = this.normalizeTextValue(String(targetValue));
  const isContainerLikeOptionText = (raw) => {
    const t = this.normalizeTextValue(raw || '');
    if (!t) return true;
    if (t.length > 140) return true;
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    return wordCount > 22 && t.length > 70;
  };
  const getAppSelectDisplayValue = (c) => {
    const display = c?.querySelector('.result__content, .result__value, .result, .placeholder, [ng-reflect-value]');
    const raw = (display?.textContent || display?.getAttribute?.('ng-reflect-app-tooltip') || c?.getAttribute?.('ng-reflect-value') || '').trim();
    const placeholder = (c?.getAttribute?.('placeholder') || c?.getAttribute?.('ng-reflect-placeholder') || display?.classList?.contains('placeholder') ? display?.textContent?.trim() : '') || '';
    if (raw && placeholder && raw === placeholder) return '';
    return raw;
  };
  const isVisible = (el) => {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const isSafeOption = (el) => {
    if (!el || el.closest('a') || el.tagName === 'A') return false;
    return true;
  };
  rootContainer.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  await this.delay(100);
  const fillDisplayNorm = this.normalizeTextValue(getAppSelectDisplayValue(rootContainer) || '');
  const fillNeedsWiderOpen = !fillDisplayNorm || fillDisplayNorm !== targetLower;
  const clickTargets = [
    () => (fillNeedsWiderOpen ? rootContainer.querySelector('.select-box') : null),
    () => (fillNeedsWiderOpen ? rootContainer.querySelector('.result') : null),
    () => {
      const host = rootContainer.closest?.('app-select');
      if (!host) return null;
      try {
        const hit = getAppSelectNestedOpenTarget(host);
        if (hit && hit instanceof Element && host.contains(hit)) {
          const ar = host.querySelector('.arrow');
          if (ar && hit === ar) return null;
          return hit;
        }
      } catch (e) {}
      return null;
    },
    () => rootContainer.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"], .arrow, [class*="arrow"]'),
    () => rootContainer.querySelector('.select-box, .result, .placeholder, [class*="placeholder"], [class*="select-box"]'),
    () => rootContainer.querySelector('.options, [class*="options"]'),
    () => rootContainer
  ];
  let trigger = null;
  for (const fn of clickTargets) {
    trigger = fn();
    if (trigger) break;
  }
  if (!trigger) return { success: false };
  try { trigger.focus?.(); trigger.click(); } catch (e) {}
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
  await this.delay(2800);
  const optionSelectors = '[role="option"], .ant-select-item-option, .mat-option, .ng-option, .cdk-option, .option, .option.cutted-text, .group-item, .result__content, .result__item, li[role="option"], div[class*="option-item"], div[class*="ant-select-item"]';
  const panelSelectors = '.cdk-overlay-pane, .cdk-overlay-container, .ant-select-dropdown, .el-select-dropdown, [role="listbox"], [id*="__result"], .select-group.open, [class*="select-group"].open, .select.position, .select.employee';
  const collectOptions = () => {
    const options = [];
    const cRect = rootContainer.getBoundingClientRect();
    const panelDistance = (p) => {
      const r = p.getBoundingClientRect();
      const cx1 = cRect.left + cRect.width / 2;
      const cy1 = cRect.top + cRect.height / 2;
      const cx2 = r.left + r.width / 2;
      const cy2 = r.top + r.height / 2;
      return Math.hypot(cx1 - cx2, cy1 - cy2);
    };
    const overlayRoot = document.querySelector('.cdk-overlay-container');
    let panels = overlayRoot ? overlayRoot.querySelectorAll(panelSelectors) : [];
    if (!panels.length) panels = document.querySelectorAll(panelSelectors);
    panels = Array.from(panels).filter(p => p && isVisible(p));
    const rootElementId = rootContainer.getAttribute?.('elementid') || rootContainer.getAttribute?.('ng-reflect-element-id') || '';
    if (rootElementId) {
      const scoped = panels.filter(p => {
        const id = ((p.id || '') + ' ' + (p.className || '')).toLowerCase();
        return id.includes(rootElementId.toLowerCase()) || p.querySelector?.(`[id*="${rootElementId}"], [elementid="${rootElementId}"]`);
      });
      if (scoped.length > 0) panels = scoped;
    }
    panels.sort((a, b) => panelDistance(a) - panelDistance(b));
    panels = panels.filter(p => panelDistance(p) < 700).slice(0, 4);
    for (const p of panels) {
      const panelOptions = [];
      p.querySelectorAll(optionSelectors).forEach(o => {
        const txt = (o.textContent || '').trim();
        if (txt && isVisible(o) && isSafeOption(o) && o.offsetParent !== null && !isContainerLikeOptionText(txt)) panelOptions.push(o);
      });
      const hasDirectTarget = panelOptions.some(o => {
        const txt = this.normalizeTextValue((o.textContent || '').trim());
        return !!txt && (txt === targetLower || txt.includes(targetLower) || targetLower.includes(txt));
      });
      if (hasDirectTarget) {
        return panelOptions.filter(o => {
          const txt = this.normalizeTextValue((o.textContent || '').trim());
          return !!txt && (txt === targetLower || txt.includes(targetLower) || targetLower.includes(txt));
        });
      }
      options.push(...panelOptions);
    }
    const elementId = rootContainer.getAttribute?.('elementid') || rootContainer.getAttribute?.('ng-reflect-element-id');
    if (options.length === 0 && elementId) {
      const resultId = `${elementId}__result`;
      const relatedPanel = document.getElementById(resultId) || document.querySelector(`[id*="${resultId}"]`);
      if (relatedPanel) {
        relatedPanel.querySelectorAll(optionSelectors).forEach(o => {
          const txt = (o.textContent || '').trim();
          if (txt && isVisible(o) && isSafeOption(o) && !isContainerLikeOptionText(txt)) options.push(o);
        });
      }
    }
    if (options.length === 0) {
      document.querySelectorAll('.cdk-overlay-container .option, .cdk-overlay-container .result__content, .cdk-overlay-container .group-item, .select-group.open .option, .select-group.open .group-item').forEach(o => {
        const txt = (o.textContent || '').trim();
        if (txt && txt.length > 2 && isVisible(o) && isSafeOption(o) && !isContainerLikeOptionText(txt)) options.push(o);
      });
    }
    return options;
  };
  let options = [];
  for (let attempt = 0; attempt < 16; attempt++) {
    await this.delay(attempt === 0 ? 800 : 400);
    options = collectOptions();
    if (options.length > 0) break;
  }
  const getOptionText = (o) => {
    const content = o.querySelector('.result__content, .result__value, [ng-reflect-value], [ng-reflect-app-tooltip]');
    const raw = (content?.textContent || content?.getAttribute?.('ng-reflect-app-tooltip') || o.getAttribute?.('ng-reflect-app-tooltip') || o.textContent || o.innerText || '').trim().replace(/^[—–-]\s*/, '');
    return this.normalizeTextValue(raw) || this.normalizeTextValue(o.textContent || '');
  };
  const abbrevMatch = targetLower.match(/\(([^)]+)\)/);
  const matchOption = (o) => {
    const txt = getOptionText(o);
    if (!txt) return false;
    if (txt === targetLower || txt.includes(targetLower) || targetLower.includes(txt)) return true;
    if (abbrevMatch) {
      const abbrev = this.normalizeTextValue(abbrevMatch[1]);
      if (abbrev && (txt.includes(abbrev) || txt.includes('(' + abbrev + ')') || txt === abbrev)) return true;
      if (abbrevMatch[1].length <= 4 && (txt.endsWith('(' + abbrev + ')') || txt.endsWith(' (' + abbrev + ')'))) return true;
    }
    const targetNoParen = targetLower.replace(/\s*\([^)]+\)\s*/, '').trim();
    if (targetNoParen && txt.includes(targetNoParen)) return true;
    const firstWord = targetLower.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 4 && txt.includes(firstWord) && targetNoParen.split(/\s+/).slice(0, 2).every(w => txt.includes(w))) return true;
    return false;
  };
  let matched = options.find(matchOption);
  if (!matched && options.length > 0) {
    const targetWords = targetLower.replace(/\s*\([^)]+\)\s*/, '').split(/\s+/).filter(w => w.length >= 2);
    matched = options.find(o => {
      const txt = getOptionText(o);
      return txt && targetWords.filter(w => txt.includes(w)).length >= Math.min(2, targetWords.length);
    });
  }
  if (!matched && options.length > 0 && abbrevMatch) {
    const abbrev = this.normalizeTextValue(abbrevMatch[1]);
    if (abbrev && abbrev.length >= 2) {
      matched = options.find(o => {
        const txt = getOptionText(o);
        return txt && txt.includes(abbrev);
      });
    }
  }
  if (!matched) {
    console.warn(`[FillFields fallback] Опция "${targetValue}" не найдена среди ${options.length} опций`);
    return { success: false };
  }
  matched.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  await this.delay(400);
  const tryClick = (el) => {
    try { el.click(); } catch (e) {}
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, view: window, clientX: cx, clientY: cy, cancelable: true };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  };
  const clickTarget = matched.closest?.('.option, [role="option"], [class*="option-item"]') || matched;
  tryClick(clickTarget);
  await this.delay(700);
  const abbrevForVerify = abbrevMatch ? this.normalizeTextValue(abbrevMatch[1]) : '';
  const isVerified = (disp) => {
    if (!disp) return false;
    const d = (disp + '').toLowerCase();
    if (d.includes(targetLower) || targetLower.includes(d)) return true;
    if (abbrevForVerify && d.includes(abbrevForVerify)) return true;
    return false;
  };
  let displayAfter = getAppSelectDisplayValue(container);
  let verified = isVerified(displayAfter);
  if (!verified) {
    const parentOption = matched.closest?.('.option, [class*="option"], [role="option"]');
    if (parentOption && parentOption !== matched) {
      tryClick(parentOption);
      await this.delay(600);
      displayAfter = getAppSelectDisplayValue(container);
      verified = isVerified(displayAfter);
    }
  }
  if (!verified) {
    await this.delay(500);
    displayAfter = getAppSelectDisplayValue(container);
    verified = isVerified(displayAfter);
  }
  if (verified) {
    console.log(`✅ [FillFields fallback] Выбрано: "${targetValue}"`);
    return { success: true, selectedValue: targetValue };
  }
  return { success: false };
}

/**
 * Вызов analysis fill-single-dropdown (выполняется в контексте страницы для Angular).
 */
TestPlayer.prototype.fillDropdownViaAnalysis = async function(container, targetValue) {
  const eid = container.getAttribute('elementid') || container.getAttribute('ng-reflect-element-id') || '';
  const tag = container.tagName.toLowerCase();
  const selectors = [];
  if (eid) {
    selectors.push(`${tag}[elementid="${eid.replace(/"/g, '\\"')}"]`);
    selectors.push(`${tag}[ng-reflect-element-id="${eid.replace(/"/g, '\\"')}"]`);
  }
  const label = container.getAttribute('label') || container.getAttribute('ng-reflect-label') || '';
  if (label) selectors.push(`${tag}[label="${label.replace(/"/g, '\\"')}"]`);
  if (selectors.length === 0) selectors.push(tag);
  for (const containerSelector of selectors) {
    try {
      const msg = {
        type: 'RUN_ANALYSIS',
        analysisType: 'fill-single-dropdown',
        containerSelector,
        targetValue: String(targetValue)
      };
      if (this.tabId) msg.tabId = this.tabId;
      const response = await chrome.runtime.sendMessage(msg);
      if (response?.success && response?.data?.success) return { success: true, selectedValue: targetValue };
      if (response?.success === false) continue;
    } catch (e) {
      console.warn('[fillDropdownViaAnalysis]', e.message);
    }
  }
  return { success: false };
}

/**
 * Автоматически находит и выбирает значение в dropdown, исследуя все варианты
 */
TestPlayer.prototype.autoSelectDropdownValue = async function(selectBoxElement, targetValue) {
  if (!this.isPlaying) return { success: false };
  console.log(`🔍 Исследую dropdown для выбора значения: "${targetValue}"`);
  const appSelectRoot = selectBoxElement.closest('app-select') || selectBoxElement;
  const selectedBeforeFromSelectBox = this.getSelectedDropdownValue(selectBoxElement) || '';
  const selectedBeforeValue = this.getSelectedDropdownValue(appSelectRoot) || '';
  const strictSelectionCheck = () => {
    const selectedAfterValue = this.getSelectedDropdownValue(appSelectRoot) || '';
    const selectedAfterLower = this.normalizeTextValue(selectedAfterValue);
    const targetLowerStrict = this.normalizeTextValue(targetValue);
    const beforeLowerStrict = this.normalizeTextValue(selectedBeforeValue);
    const afterMatchesTarget = !!selectedAfterLower && !!targetLowerStrict &&
      (selectedAfterLower === targetLowerStrict || selectedAfterLower.includes(targetLowerStrict));
    const changedFromBefore = !beforeLowerStrict || !selectedAfterLower || beforeLowerStrict !== selectedAfterLower;
    return {
      ok: afterMatchesTarget && (changedFromBefore || beforeLowerStrict === targetLowerStrict),
      selectedAfterValue,
      afterMatchesTarget,
      changedFromBefore
    };
  };
  
  const isLikelyCustomDropdownRoot = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const tag = (el.tagName || '').toLowerCase();
    const cls = (el.className || '').toString().toLowerCase();
    const hasElementId = !!(el.getAttribute('elementid') || el.getAttribute('ng-reflect-element-id'));
    const looksLikeSelectTag = tag.includes('select') || tag.includes('dropdown');
    const hasUiMarkers = !!el.querySelector?.('.select-box, .arrow, .result, [class*="option"], [role="listbox"]');
    return hasElementId && (looksLikeSelectTag || cls.includes('select') || cls.includes('dropdown') || hasUiMarkers);
  };
  let appSelect = selectBoxElement.closest('[class*="select"], [class*="dropdown"], [class*="combo"], [elementid]') || 
                  selectBoxElement.closest('[role="combobox"], [role="listbox"]');
  if (!appSelect && isLikelyCustomDropdownRoot(selectBoxElement)) {
    appSelect = selectBoxElement;
  }
  if ((!appSelect || !isLikelyCustomDropdownRoot(appSelect)) && selectBoxElement.closest('[elementid]')) {
    const nearestElementIdRoot = selectBoxElement.closest('[elementid]');
    if (isLikelyCustomDropdownRoot(nearestElementIdRoot)) {
      appSelect = nearestElementIdRoot;
    }
  }
  const nativeSelect = this.findNativeSelectElement(selectBoxElement);

  if (!appSelect && !nativeSelect) {
    console.warn('⚠️ Не удалось определить контейнер dropdown (нет контейнера с select/dropdown/combo и нативного <select>)');
  }

  if (nativeSelect) {
    const nativeResult = await this.selectNativeOption(nativeSelect, targetValue);
    if (nativeResult.success) {
      return { success: true, selectedValue: nativeResult.selectedValue };
    }
    console.warn(`⚠️ Нативный <select> найден, но не удалось выбрать значение "${targetValue}", пробую fallback через панель`);
  }

  // Сначала убеждаемся, что dropdown открыт
  if (!appSelect) {
    console.warn('⚠️ Не найден контейнер dropdown');
    return { success: false, reason: 'dropdown container not found' };
  }
  
  // Универсально получаем атрибуты для поиска связанной панели
  const elementId = appSelect.getAttribute('elementid') || 
                   appSelect.getAttribute('ng-reflect-element-id') ||
                   appSelect.getAttribute('data-id') ||
                   appSelect.id;
  const label = appSelect.getAttribute('label') || 
               appSelect.getAttribute('ng-reflect-label') ||
               appSelect.getAttribute('aria-label') ||
               appSelect.getAttribute('placeholder');
  
  let primaryClickTarget = selectBoxElement;
  const closeDropdownPanel = async () => {
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true
      }));
      await this.delay(40);
    } catch (e) {
      console.warn('⚠️ Не удалось отправить Escape для закрытия dropdown:', e);
    }
    try {
      if (primaryClickTarget) {
        primaryClickTarget.blur?.();
      }
      selectBoxElement.blur?.();
    } catch (e) {
      console.warn('⚠️ Не удалось убрать фокус с dropdown:', e);
    }
  };
  const resolveClickTarget = () => {
    const resultElement = appSelect.querySelector('.result');
    if (resultElement) {
      return resultElement;
    }
    return selectBoxElement;
  };
  
  // Пробуем открыть dropdown, если он закрыт
  const controlName = this.getControlNameFromElement(appSelect, selectBoxElement);
  const angularSelectionResult = await this.trySelectViaAngularAPIs({
    appSelect,
    selectBoxElement,
    targetValue,
    controlName
  });
  if (angularSelectionResult?.success) {
    await this.delay(30);
    return angularSelectionResult;
  }

  const selectBoxRect = selectBoxElement.getBoundingClientRect();

  const findDropdownPanel = () => {
    // Ищем панель по ID результата (например, #status-project__result)
    if (elementId) {
      const resultId = `${elementId}__result`;
      // Пробуем точный ID
      let resultPanel = document.querySelector(`#${resultId}`);
      if (resultPanel) {
        // Внутри app-select обычно находится триггер/результат, а не всплывающий список опций.
        // Такой элемент не считаем панелью dropdown.
        if (appSelect.contains(resultPanel)) {
          resultPanel = null;
        }
      }
      if (resultPanel) {
        const style = window.getComputedStyle(resultPanel);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          console.log(`✅ Найдена панель по точному ID: #${resultId}`);
          return resultPanel;
        }
      }
      // Пробуем частичное совпадение ID (div[id*="status-project__result"])
      resultPanel = document.querySelector(`[id*="${resultId}"]`);
      if (resultPanel) {
        if (appSelect.contains(resultPanel)) {
          resultPanel = null;
        }
      }
      if (resultPanel) {
        const style = window.getComputedStyle(resultPanel);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          console.log(`✅ Найдена панель по частичному ID: [id*="${resultId}"]`);
          return resultPanel;
        }
      }
      // Пробуем найти div с ID, содержащим elementId и __result
      resultPanel = document.querySelector(`div[id*="${elementId}"][id*="__result"]`);
      if (resultPanel) {
        if (appSelect.contains(resultPanel)) {
          resultPanel = null;
        }
      }
      if (resultPanel) {
        const style = window.getComputedStyle(resultPanel);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          console.log(`✅ Найдена панель по комбинированному ID: div[id*="${elementId}"][id*="__result"]`);
          return resultPanel;
        }
      }
    }
    
    // Ищем панель рядом с app-select (может быть в overlay)
    const nearbyPanels = Array.from(document.querySelectorAll('[class*="dropdown"], [class*="panel"], [class*="select"], [role="listbox"], [id*="__result"]'));
    for (const panel of nearbyPanels) {
      if (appSelect.contains(panel)) continue;
      const panelRect = panel.getBoundingClientRect();
      const style = window.getComputedStyle(panel);
      
      // Исключаем скрытые панели и меню навигации
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (panel.className && (panel.className.includes('main') || panel.className.includes('navigation'))) continue;
      if (panel.closest('nav, header, .menu, .navigation')) continue;
      
      // Проверяем, что панель находится рядом с select-box (в пределах 500px)
      const distanceX = Math.abs(panelRect.left - selectBoxRect.left);
      const distanceY = Math.abs(panelRect.top - (selectBoxRect.bottom + 5));
      
      if (distanceX < 500 && distanceY < 500) {
        console.log(`✅ Найдена панель рядом с select-box (расстояние: X=${distanceX}, Y=${distanceY})`);
        return panel;
      }
    }
    
    return null;
  };
  
  let dropdownPanel = findDropdownPanel();
  const isPanelClosedState = (panel) => {
    if (!panel) return true;
    const cls = ((panel.className || '').toString()).toLowerCase();
    const hasOpen = /\bopen\b/.test(cls) || panel.getAttribute('aria-expanded') === 'true';
    const hasClose = /\bclose\b/.test(cls) || panel.getAttribute('aria-expanded') === 'false';
    return hasClose && !hasOpen;
  };
  const isPanelVisible = (panel) => {
    if (!panel) return false;
    if (isPanelClosedState(panel)) return false;
    const style = window.getComputedStyle(panel);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const panelSeemsEmpty = (panel) => {
    if (!panel) return true;
    if (isPanelClosedState(panel)) return true;
    const optionCandidate = panel.querySelector('.option, .option.cutted-text, [role="option"], [data-value], .group-item, .mat-option, .ng-option');
    const hasOptionText = !!(optionCandidate && ((optionCandidate.textContent || '').trim().length >= 2));
    return !hasOptionText;
  };

  const uniqueTargets = [];
  const registerTarget = (el, label) => {
    if (el && el instanceof Element && !uniqueTargets.find(item => item.element === el)) {
      uniqueTargets.push({ element: el, label });
    }
  };

  const resolveScopedOpenDivHit = (dropdownContainer) => {
    if (!dropdownContainer || !dropdownContainer.closest) return null;
    const hostFromPlayer = dropdownContainer.closest('app-select');
    if (!hostFromPlayer) return null;
    try {
      const hit = getAppSelectNestedOpenTarget(hostFromPlayer);
      return hit instanceof Element ? hit : null;
    } catch (e) {
      return null;
    }
  };

  const baseResult = resolveClickTarget();
  const valueChangeNeedsOpen = this.normalizeTextValue(selectedBeforeValue || '') !== this.normalizeTextValue(targetValue || '');
  if (valueChangeNeedsOpen) {
    const priBox = appSelect.querySelector('.select-box');
    if (priBox) registerTarget(priBox, 'priority .select-box (value change)');
    const priRes = appSelect.querySelector('.result');
    if (priRes && priRes !== priBox) registerTarget(priRes, 'priority .result (value change)');
  }
  const nestedOpenHit = resolveScopedOpenDivHit(appSelect);
  const arrowEl = appSelect.querySelector('.arrow');
  const inspectorSameAsArrow = !!(nestedOpenHit && arrowEl && nestedOpenHit === arrowEl);
  if (nestedOpenHit && !inspectorSameAsArrow) {
    registerTarget(nestedOpenHit, 'app-select nested open div (4th div)');
  }
  registerTarget(appSelect.querySelector('.options'), '.options');
  registerTarget(appSelect.querySelector('[class*="options"]'), '[class*="options"]');
  registerTarget(baseResult, '.result');
  registerTarget(appSelect.querySelector('.result__value'), '.result__value');
  registerTarget(appSelect.querySelector('.result__content'), '.result__content');
  registerTarget(appSelect.querySelector('.result__arrow'), '.result__arrow');
  registerTarget(appSelect.querySelector('.arrow.isShowOptions'), '.arrow.isShowOptions');
  registerTarget(appSelect.querySelector('.arrow[class*="isShowOptions"]'), '.arrow[class*="isShowOptions"]');
  registerTarget(appSelect.querySelector('.select-btn'), '.select-btn');
  registerTarget(appSelect.querySelector('.select-group'), '.select-group');
  registerTarget(appSelect.querySelector('.select'), '.select');
  registerTarget(selectBoxElement, '.select-box (original)');
  registerTarget(appSelect, 'app-select');

  const clickMethods = [
    {
      name: 'native click',
      run: async (target) => target.click()
    },
    {
      name: 'mousedown+mouseup+click',
      run: async (target) => {
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
        await this.delay(80);
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
        await this.delay(40);
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
      }
    },
    {
      name: 'focus + Enter',
      run: async (target) => {
        target.focus?.();
        await this.delay(60);
        target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
        await this.delay(40);
        target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
      }
    },
    {
      name: 'double click',
      run: async (target) => {
        target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      }
    }
  ];

  // Функция для проверки, что dropdown действительно открыт (есть опции)
  const isDropdownReallyOpen = async (panel) => {
    if (!panel || !isPanelVisible(panel)) return false;
    // Проверяем наличие опций в панели
    const hasOptions = panel.querySelector('.option, .option.cutted-text, [role="option"], [data-value], .group-item, .mat-option, .ng-option');
    if (hasOptions && ((hasOptions.textContent || '').trim().length >= 2)) return true;
    // Ждем немного и проверяем снова (опции могут рендериться асинхронно)
    await this.delay(80);
    const hasOptionsAfterDelay = panel.querySelector('.option, .option.cutted-text, [role="option"], [data-value], .group-item, .mat-option, .ng-option');
    return !!(hasOptionsAfterDelay && ((hasOptionsAfterDelay.textContent || '').trim().length >= 2));
  };

  if (!dropdownPanel || !isPanelVisible(dropdownPanel) || panelSeemsEmpty(dropdownPanel)) {
    console.log('📂 Открываю dropdown (поиск рабочей точки клика)...');
    selectBoxElement.scrollIntoView({ behavior: 'auto', block: 'center' });
    await this.delay(120);
    if (!this.isPlaying) return { success: false };

    let opened = false;
    for (const targetInfo of uniqueTargets) {
      const target = targetInfo.element;
      for (const method of clickMethods) {
        try {
          console.log(`  → Пробую ${method.name} по ${targetInfo.label}`);
          await method.run(target);
          await this.delay(250);
          
          // Перепроверяем панель после клика
          dropdownPanel = findDropdownPanel();
          if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
            console.log(`✅ Dropdown открыт и опции видны (${targetInfo.label}, ${method.name})`);
            opened = true;
            break;
          }
        } catch (error) {
          console.warn(`   ⚠️ ${method.name} на ${targetInfo.label} завершился ошибкой:`, error);
        }
      }
      if (opened) break;
    }
    
    // Если не открылся, пробуем более агрессивные методы
    if (!opened) {
      console.log('  → Пробую более агрессивные методы открытия dropdown...');
      
      // Метод 1: Клик по .select-box внутри app-select
      const selectBox = appSelect.querySelector('.select-box');
      if (selectBox) {
        try {
          console.log('  → Пробую клик по .select-box внутри app-select');
          selectBox.click();
          await this.delay(350);
          dropdownPanel = findDropdownPanel();
          if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
            console.log('✅ Dropdown открыт через клик по .select-box');
            opened = true;
          }
        } catch (e) {
          console.warn('  ⚠️ Клик по .select-box не сработал:', e);
        }
      }
      
      // Метод 2: Клик по .result внутри app-select
      if (!opened) {
        const resultEl = appSelect.querySelector('.result');
        if (resultEl) {
          try {
            console.log('  → Пробую клик по .result внутри app-select');
            resultEl.click();
            await this.delay(350);
            dropdownPanel = findDropdownPanel();
            if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
              console.log('✅ Dropdown открыт через клик по .result');
              opened = true;
            }
          } catch (e) {
            console.warn('  ⚠️ Клик по .result не сработал:', e);
          }
        }
      }
      
      // Метод 3: Фокус + клик
      if (!opened) {
        try {
          console.log('  → Пробую focus + клик по selectBoxElement');
          selectBoxElement.focus();
          await this.delay(80);
          selectBoxElement.click();
          await this.delay(350);
          dropdownPanel = findDropdownPanel();
          if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
            console.log('✅ Dropdown открыт через focus + клик');
            opened = true;
          }
        } catch (e) {
          console.warn('  ⚠️ focus + клик не сработал:', e);
        }
      }
    }

    if (!opened) {
      // Попытка открыть через Angular API компонента
      try {
        const ngComponent = this.getAngularComponent(appSelect);
        if (ngComponent) {
          const componentInstance = ngComponent.instance || ngComponent.componentInstance;
          if (componentInstance) {
            // Пробуем вызвать методы открытия dropdown
            const openMethods = ['open', 'toggle', 'show', 'openDropdown', 'toggleDropdown', 'onClick', 'handleClick'];
            for (const methodName of openMethods) {
              if (typeof componentInstance[methodName] === 'function') {
                try {
                  console.log(`  → Пробую вызвать ${methodName}() через Angular API`);
                  componentInstance[methodName]();
                  await this.delay(800);
                  
                  dropdownPanel = findDropdownPanel();
                  if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                    console.log(`✅ Dropdown открыт через ${methodName}()`);
                    opened = true;
                    break;
                  }
                } catch (e) {
                  console.warn(`   ⚠️ ${methodName}() завершился ошибкой:`, e);
                }
              }
            }
            
            // Если методы не сработали, пробуем установить свойства открытия
            if (!opened) {
              const openProperties = ['isOpen', 'opened', 'open', 'visible', 'show', 'expanded'];
              for (const propName of openProperties) {
                try {
                  if (componentInstance[propName] !== undefined) {
                    const oldValue = componentInstance[propName];
                    componentInstance[propName] = true;
                    console.log(`  → Установил ${propName} = true через Angular API`);
                    await this.delay(800);
                    
                    dropdownPanel = findDropdownPanel();
                    if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                      console.log(`✅ Dropdown открыт через установку ${propName}`);
                      opened = true;
                      break;
                    } else {
                      // Восстанавливаем старое значение, если не помогло
                      componentInstance[propName] = oldValue;
                    }
                  }
                } catch (e) {
                  console.warn(`   ⚠️ Ошибка при установке ${propName}:`, e);
                }
              }
            }
            
            // Пробуем вызвать Angular change detection
            if (!opened) {
              try {
                const zoneToken = window.ng?.coreTokens?.NgZone;
                const injector = ngComponent.injector || window.ng?.getInjector?.(appSelect);
                const zone = zoneToken && injector?.get ? injector.get(zoneToken, null) : null;
                
                if (zone) {
                  zone.run(() => {
                    // Пробуем еще раз вызвать методы открытия внутри zone
                    for (const methodName of openMethods) {
                      if (typeof componentInstance[methodName] === 'function') {
                        try {
                          componentInstance[methodName]();
                        } catch (e) {
                          // Игнорируем ошибки
                        }
                      }
                    }
                  });
                  await this.delay(1000);
                  
                  dropdownPanel = findDropdownPanel();
                  if (dropdownPanel && await isDropdownReallyOpen(dropdownPanel)) {
                    console.log(`✅ Dropdown открыт через Angular zone`);
                    opened = true;
                  }
                }
              } catch (e) {
                console.warn('⚠️ Ошибка при работе с Angular zone:', e);
              }
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Не удалось открыть через Angular API:', e);
      }
      
      if (!opened) {
        console.warn('⚠️ Не удалось открыть dropdown перечисленными способами, продолжаю с fallback-поиском опций...');
      }
    }
  }
  
  if (dropdownPanel) {
    const panelInfo = dropdownPanel.id || dropdownPanel.className || dropdownPanel.tagName || 'unknown';
    console.log('✅ Найдена панель dropdown:', panelInfo);
  } else {
    console.warn('⚠️ Панель dropdown не найдена, ищу опции во всем документе');
  }
  
  // Ждем появления опций в панели через MutationObserver (если панель пустая)
  if (dropdownPanel && panelSeemsEmpty(dropdownPanel)) {
    console.log('⏳ Панель найдена, но пустая. Жду появления опций через MutationObserver...');
    
    // Пробуем принудительно вызвать скролл для Angular CDK overlay
    try {
      const cdkOverlay = dropdownPanel.closest('.cdk-overlay-pane, .cdk-overlay-container');
      if (cdkOverlay) {
        console.log('  → Найден Angular CDK overlay, пробую принудительный скролл...');
        cdkOverlay.dispatchEvent(new Event('scroll', { bubbles: true }));
        dropdownPanel.dispatchEvent(new Event('scroll', { bubbles: true }));
        await this.delay(300);
      }
    } catch (e) {
      console.warn('  ⚠️ Ошибка при работе с CDK overlay:', e);
    }
    
    // Пробуем еще раз кликнуть по select-box, если панель все еще пустая
    if (panelSeemsEmpty(dropdownPanel)) {
      const selectBox = appSelect.querySelector('.select-box, .result');
      if (selectBox) {
        try {
          console.log('  → Панель все еще пустая, пробую еще один клик по select-box...');
          selectBox.click();
          await this.delay(1000);
        } catch (e) {
          console.warn('  ⚠️ Повторный клик не сработал:', e);
        }
      }
    }
    
    const optionsAppeared = await this.waitForOptionsInPanel(dropdownPanel, 5000); // Увеличиваем время ожидания до 5 секунд
    if (!this.isPlaying) return { success: false };
    if (optionsAppeared) {
      console.log('✅ Опции появились в панели');
    } else {
      console.warn('⚠️ Опции не появились в панели за 5 секунд, продолжаю поиск...');
    }
  }
  
  // ---- Новый механизм поиска опций ----
  const targetLower = targetValue.trim().toLowerCase();
  const baseSelectors = [
    '[role="option"]',
    '.mat-option',
    '.react-select__option',
    '.p-dropdown-item',
    '.group-item',
    '.option-item',
    '.select-option',
    '.option', // Основной селектор для опций (например, #status-project__result .option)
    '.option.cutted-text', // Опции с классом cutted-text
    '.result__content',
    '.result__item',
    '.result__value',
    '.result__option',
    '[data-value]',
    '[ng-reflect-app-tooltip]',
    '[ng-reflect-value]',
    '[tooltip]',
    'div[class*="result"]',
    'span[class*="result"]',
    'li:not([class*="menu"]):not([class*="nav"])'
  ];
  
  const isElementVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    
    // Используем несколько методов для проверки размера (для элементов с CSS трансформациями)
    const rect = el.getBoundingClientRect();
    const hasBoundingSize = rect.width > 1 && rect.height > 1;
    
    // Проверяем offsetWidth/offsetHeight (более надежно для трансформированных элементов)
    const hasOffsetSize = el.offsetWidth > 1 && el.offsetHeight > 1;
    
    // Проверяем getClientRects (может найти видимые части даже при трансформациях)
    const clientRects = el.getClientRects();
    const hasClientRectSize = clientRects.length > 0 && 
      Array.from(clientRects).some(r => r.width > 1 && r.height > 1);
    
    return hasBoundingSize || hasOffsetSize || hasClientRectSize;
  };
  
  const extractTextFromElement = (el) => {
    if (!el) return '';
    
    // Сначала проверяем атрибуты с текстом (они часто более точные)
    const attrText = el.getAttribute('ng-reflect-app-tooltip') || 
                     el.getAttribute('tooltip') || 
                     el.getAttribute('title') ||
                     el.getAttribute('aria-label') ||
                     el.getAttribute('data-label') ||
                     el.getAttribute('data-text');
    if (attrText && attrText.trim().length >= 2) {
      return attrText.trim();
    }
    
    // Специальная обработка для .option элементов: ищем span внутри
    if (el.classList && el.classList.contains('option')) {
      const spanInside = el.querySelector('span');
      if (spanInside) {
        const spanText = spanInside.textContent?.trim() || spanInside.innerText?.trim() || '';
        if (spanText && spanText.length >= 2) {
          return spanText;
        }
      }
      // Также проверяем .result__content внутри .option
      const resultContent = el.querySelector('.result__content');
      if (resultContent) {
        const contentText = resultContent.textContent?.trim() || resultContent.innerText?.trim() || '';
        if (contentText && contentText.length >= 2) {
          return contentText;
        }
      }
    }
    
    // Специальная обработка для .result__content
    if (el.classList && el.classList.contains('result__content')) {
      const contentText = el.textContent?.trim() || el.innerText?.trim() || '';
      if (contentText && contentText.length >= 2) {
        return contentText;
      }
    }
    
    // Специальная обработка для span внутри .option
    if (el.tagName === 'SPAN' && el.closest('.option')) {
      const spanText = el.textContent?.trim() || el.innerText?.trim() || '';
      if (spanText && spanText.length >= 2) {
        return spanText;
      }
    }
    
    // Извлекаем текст из элемента
    let text = el.textContent?.trim() || el.innerText?.trim() || '';
    
    // Если текст короткий, пробуем собрать из дочерних элементов
    if (!text || text.length < 2) {
      const childTexts = Array.from(el.children)
        .map(child => {
          // Пропускаем скрытые элементы
          const style = window.getComputedStyle(child);
          if (style.display === 'none' || style.visibility === 'hidden') return '';
          return (child.textContent || child.innerText || '').trim();
        })
        .filter(t => t && t.length >= 2);
      if (childTexts.length > 0) {
        text = childTexts.join(' ').trim();
      }
    }
    
    // Если все еще нет текста, используем TreeWalker для глубокого поиска
    if (!text || text.length < 2) {
      const walker = document.createTreeWalker(
        el, 
        NodeFilter.SHOW_TEXT, 
        {
          acceptNode: (node) => {
            // Пропускаем скрытые элементы
            const parent = node.parentElement;
            if (parent) {
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || style.visibility === 'hidden') {
                return NodeFilter.FILTER_REJECT;
              }
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }, 
        false
      );
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        const nodeText = node.textContent?.trim();
        if (nodeText && nodeText.length > 0) {
          textNodes.push(nodeText);
        }
      }
      if (textNodes.length > 0) {
        text = textNodes.join(' ').trim();
      }
    }
    
    return text;
  };
  
  const getOptionTexts = (el) => {
    const texts = new Set(); // Используем Set для уникальности
    
    // Извлекаем основной текст элемента
    const text = extractTextFromElement(el);
    if (text) {
      const normalized = this.normalizeTextValue(text);
      if (normalized) texts.add(normalized);
    }
    
    // Извлекаем текст из всех дочерних элементов с текстом
    const allTextNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      const nodeText = node.textContent?.trim();
      if (nodeText && nodeText.length > 0) {
        allTextNodes.push(nodeText);
      }
    }
    if (allTextNodes.length > 0) {
      const combinedText = allTextNodes.join(' ').trim();
      const normalized = this.normalizeTextValue(combinedText);
      if (normalized) texts.add(normalized);
    }
    
    // Атрибуты
    const attrValues = [
      el.getAttribute('value'),
      el.dataset?.value,
      el.getAttribute('data-value'),
      el.getAttribute('ng-reflect-app-tooltip'),
      el.getAttribute('ng-reflect-value'),
      el.getAttribute('tooltip'),
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('data-label'),
      el.getAttribute('data-text')
    ];
    attrValues.forEach(val => {
      if (val) {
        const normalized = this.normalizeTextValue(val);
        if (normalized) texts.add(normalized);
      }
    });
    
    // Ищем вложенные элементы с атрибутами
    const nestedTooltip = el.querySelector('[ng-reflect-app-tooltip]');
    if (nestedTooltip) {
      const nestedTooltipValue = nestedTooltip.getAttribute('ng-reflect-app-tooltip');
      if (nestedTooltipValue) {
        const normalized = this.normalizeTextValue(nestedTooltipValue);
        if (normalized) texts.add(normalized);
      }
    }
    
    // Ищем span с текстом внутри
    const spans = el.querySelectorAll('span');
    spans.forEach(span => {
      const spanText = span.textContent?.trim();
      if (spanText && spanText.length > 0) {
        const normalized = this.normalizeTextValue(spanText);
        if (normalized) texts.add(normalized);
      }
      const spanTooltip = span.getAttribute('ng-reflect-app-tooltip');
      if (spanTooltip) {
        const normalized = this.normalizeTextValue(spanTooltip);
        if (normalized) texts.add(normalized);
      }
    });
    
    return Array.from(texts).filter(Boolean);
  };
  
  const isPlaceholderText = (text) => {
    if (!text) return true;
    const normalized = text.toLowerCase();
    const placeholders = ['выберите', 'статус', 'select', 'placeholder', 'label'];
    return placeholders.some(ph => normalized === ph || (normalized.includes(ph) && normalized.length < 20));
  };
  const isContainerLikeOptionText = (normalizedText) => {
    if (!normalizedText) return true;
    if (normalizedText.length > 140) return true;
    const markers = ['по поручению', 'инициатив', 'по плану', 'плану-графику'];
    const hitCount = markers.filter(m => normalizedText.includes(m)).length;
    return hitCount >= 2 && normalizedText.length > 70;
  };
  
  const qualifiesAsOption = (el) => {
    if (!el || !(el instanceof Element)) return false;
    if (el === selectBoxElement) return false;
    
    const insideTriggerButOutsidePanel = selectBoxElement.contains(el) && 
      (!dropdownPanel || !dropdownPanel.contains(el)) &&
      !el.closest('[id*="__result"]');
    if (insideTriggerButOutsidePanel) return false;
    
    if (el.closest('nav, header, .menu, .navigation, .main')) return false;
    if (!isElementVisible(el)) return false;
    
    // Улучшенная проверка размера: используем несколько методов
    const rect = el.getBoundingClientRect();
    const offsetWidth = el.offsetWidth || 0;
    const offsetHeight = el.offsetHeight || 0;
    const clientRects = el.getClientRects();
    const hasAnySize = (rect.width > 0 && rect.height > 0) || 
                      (offsetWidth > 0 && offsetHeight > 0) ||
                      (clientRects.length > 0 && Array.from(clientRects).some(r => r.width > 0 && r.height > 0));
    
    if (!hasAnySize) return false;
    
    // Для элементов внутри dropdown панели - более мягкая проверка расстояния
    const isInsidePanel = dropdownPanel && dropdownPanel.contains(el);
    if (isInsidePanel) {
      // Если элемент внутри панели, принимаем только реальные option-узлы, а не контейнеры/placeholder.
      const text = extractTextFromElement(el);
      if (text.length < 2) return false;
      if (isPlaceholderText(text)) return false;
      const normalizedText = this.normalizeTextValue(text);
      if (!normalizedText || isContainerLikeOptionText(normalizedText)) return false;
      const cls = ((el.className || '').toString()).toLowerCase();
      const role = (el.getAttribute && el.getAttribute('role')) || '';
      const hasOptionMarker =
        role === 'option' ||
        cls.includes('option') ||
        cls.includes('mat-option') ||
        cls.includes('ng-option') ||
        cls.includes('group-item') ||
        cls.includes('result__content') ||
        el.hasAttribute('data-value') ||
        !!el.closest('[role="option"], .option, .mat-option, .ng-option, .group-item, .result__content, [data-value]');
      if (!hasOptionMarker) return false;
      return true;
    }
    
    // Для элементов вне панели - проверяем расстояние
    const distanceX = Math.abs(((rect.left + rect.right) / 2) - ((selectBoxRect.left + selectBoxRect.right) / 2));
    const distanceY = Math.abs(rect.top - selectBoxRect.bottom);
    if (distanceX > 800 || distanceY > 900) return false;
    
    const text = extractTextFromElement(el);
    if (text.length < 2) return false;
    if (isPlaceholderText(text)) return false;
    const normalizedText = this.normalizeTextValue(text);
    if (!normalizedText || isContainerLikeOptionText(normalizedText)) return false;
    const cls = ((el.className || '').toString()).toLowerCase();
    const role = (el.getAttribute && el.getAttribute('role')) || '';
    const hasOptionMarkerOutside =
      role === 'option' ||
      cls.includes('option') ||
      cls.includes('mat-option') ||
      cls.includes('ng-option') ||
      cls.includes('group-item') ||
      cls.includes('result__content') ||
      el.hasAttribute('data-value') ||
      !!el.closest('[role="option"], .option, .mat-option, .ng-option, .group-item, .result__content, [data-value]');
    if (!hasOptionMarkerOutside) return false;
    return true;
  };
  
  const collectOptionsFromContainer = (container, label) => {
    if (!container || !(container instanceof Element)) return [];
    const found = new Set();
    
    // Специальный поиск для .result__content внутри панели (Angular dropdown)
    if (dropdownPanel && container === dropdownPanel) {
      const resultContents = container.querySelectorAll('.result__content');
      resultContents.forEach(contentEl => {
        // Ищем родительский .result для клика
        const resultParent = contentEl.closest('.result');
        if (resultParent) {
          found.add(resultParent); // Добавляем родителя для клика
          found.add(contentEl); // Также добавляем сам content для текста
        } else {
          found.add(contentEl);
        }
      });
      
      // Специальный поиск для .option и .mat-option внутри панели (например, #status-project__result .option)
      const options = container.querySelectorAll('.option, .option.cutted-text, .mat-option, [role="option"]');
      options.forEach(optionEl => {
        // Добавляем сам .option элемент
        found.add(optionEl);
        // Также добавляем span внутри .option (если есть)
        const spanInside = optionEl.querySelector('span');
        if (spanInside) {
          found.add(spanInside);
        }
        // Также добавляем div > span структуру (например, #status-project > div:nth-child(1) > span)
        const divInside = optionEl.querySelector('div');
        if (divInside) {
          const spanInDiv = divInside.querySelector('span');
          if (spanInDiv) {
            found.add(spanInDiv);
          }
        }
      });
      
      // Также ищем span напрямую внутри панели (на случай, если структура отличается)
      const spansInPanel = container.querySelectorAll('span');
      spansInPanel.forEach(spanEl => {
        // Проверяем, что span находится внутри .option или рядом с ним
        if (spanEl.closest('.option') || spanEl.parentElement?.classList?.contains('option')) {
          found.add(spanEl);
        }
      });
    }
    
    const selectors = [...baseSelectors, 'div', 'span', 'p', 'li', 'button'];
    selectors.forEach(selector => {
      try {
        container.querySelectorAll(selector).forEach(el => found.add(el));
      } catch (e) {
        // selector might be invalid, ignore
      }
    });
    
    const result = Array.from(found).filter(qualifiesAsOption);
    
    // Логируем информацию о найденных опциях для отладки
    if (result.length > 0 && result.length <= 10) {
      result.forEach((opt, idx) => {
        const rect = opt.getBoundingClientRect();
        const offsetW = opt.offsetWidth || 0;
        const offsetH = opt.offsetHeight || 0;
        const text = extractTextFromElement(opt).substring(0, 30);
        console.log(`    [${idx + 1}] "${text}" - rect: ${rect.width.toFixed(0)}×${rect.height.toFixed(0)}, offset: ${offsetW}×${offsetH}, pos: (${rect.left.toFixed(0)}, ${rect.top.toFixed(0)})`);
      });
    }
    
    console.log(`  Контейнер "${label}" дал ${result.length} подходящих элементов`);
    return result;
  };
  
  const findNearbyOverlays = () => {
    const overlays = [];
    const overlayCandidates = Array.from(document.body.querySelectorAll('[class*="cdk-overlay"], [class*="overlay"], [class*="portal"], [id*="__result"]'));
    const selectBoxRect = selectBoxElement.getBoundingClientRect();
    overlayCandidates.forEach(overlay => {
      const style = window.getComputedStyle(overlay);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = overlay.getBoundingClientRect();
      const distanceX = Math.abs(rect.left - selectBoxRect.left);
      const distanceY = Math.abs(rect.top - (selectBoxRect.bottom + 5));
      if (distanceX < 500 && distanceY < 500) {
        overlays.push(overlay);
      }
    });
    return overlays;
  };
  
  const collectAllOptionsWithRetries = async () => {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this.isPlaying) return [];
      // На каждой попытке убеждаемся, что панель все еще открыта
      if (!dropdownPanel || window.getComputedStyle(dropdownPanel).display === 'none') {
        console.log('ℹ️ Панель dropdown скрыта, пробую открыть повторно');
        primaryClickTarget = resolveClickTarget();
        try {
          primaryClickTarget.click();
          await this.delay(600);
        } catch (e) {
          console.warn('⚠️ Не удалось повторно открыть dropdown:', e);
        }
        dropdownPanel = findDropdownPanel();
      }
      
      let candidates = [];
      
      // Попытка получить опции через Angular API компонента
      if (attempt === 1) {
        try {
          const ngComponent = this.getAngularComponent(appSelect);
          if (ngComponent) {
            const componentInstance = ngComponent.instance || ngComponent.componentInstance;
            if (componentInstance) {
              // Ищем массив опций в компоненте
              const possibleOptionsProps = ['options', 'items', 'values', 'data', 'source', 'list'];
              for (const prop of possibleOptionsProps) {
                if (Array.isArray(componentInstance[prop]) && componentInstance[prop].length > 0) {
                  console.log(`  → Найдены опции через Angular API (${prop}): ${componentInstance[prop].length} элементов`);
                  const optionValues = componentInstance[prop];
                  
                  // Пробуем найти нужную опцию по тексту
                  const targetLower = targetValue.trim().toLowerCase();
                  const matchingOption = optionValues.find(option => {
                    const optionText = option?.name || option?.label || option?.text || option?.value || String(option);
                    const optionTextLower = this.normalizeTextValue(optionText);
                    return optionTextLower === targetLower || 
                           optionTextLower.includes(targetLower) ||
                           targetLower.includes(optionTextLower);
                  });
                  
                  if (matchingOption) {
                    console.log(`  → Найдена соответствующая опция в данных компонента`);
                    // Пробуем установить эту опцию как выбранную через Angular API
                    const selectMethods = ['select', 'selectValue', 'setSelected', 'choose', 'onSelect'];
                    for (const methodName of selectMethods) {
                      if (typeof componentInstance[methodName] === 'function') {
                        try {
                          componentInstance[methodName](matchingOption);
                          console.log(`  → Вызван метод ${methodName}() с найденной опцией`);
                          await this.delay(300);
                          const confirmed = await this.checkIfValueSelected(appSelectRoot, targetValue);
                          if (confirmed) {
                            console.log('✅ Значение установлено через выбор опции в Angular API');
                            return { success: true, selectedValue: targetValue, forced: true, method: 'angular-select' };
                          }
                        } catch (e) {
                          // Игнорируем ошибки
                        }
                      }
                    }
                  }
                  
                  // Пробуем найти соответствующие DOM элементы для этих опций
                  optionValues.forEach((option, idx) => {
                    const optionText = option?.name || option?.label || option?.text || option?.value || String(option);
                    if (optionText) {
                      // Ищем DOM элемент с этим текстом
                      const textLower = this.normalizeTextValue(optionText);
                      const matchingElements = Array.from(document.querySelectorAll('*')).filter(el => {
                        const elText = extractTextFromElement(el);
                        return this.normalizeTextValue(elText) === textLower || 
                               elText.toLowerCase().includes(textLower) ||
                               textLower.includes(elText.toLowerCase());
                      });
                      matchingElements.forEach(el => {
                        if (qualifiesAsOption(el)) {
                          candidates.push(el);
                        }
                      });
                    }
                  });
                }
              }
            }
          }
        } catch (e) {
          // Игнорируем ошибки доступа к Angular API
        }
      }
      
      if (dropdownPanel) {
        console.log(`🔍 Попытка ${attempt}: исследую основную панель dropdown`);
        candidates = candidates.concat(collectOptionsFromContainer(dropdownPanel, 'dropdown-panel'));
      }
      
      console.log(`🔍 Попытка ${attempt}: исследую сам app-select`);
      candidates = candidates.concat(collectOptionsFromContainer(appSelect, 'app-select'));
      
      const overlays = findNearbyOverlays();
      overlays.forEach((overlay, idx) => {
        candidates = candidates.concat(collectOptionsFromContainer(overlay, `overlay-${idx + 1}`));
      });
      
      if (attempt >= 2) {
        console.log(`🔍 Попытка ${attempt}: fallback поиск по всему документу`);
        candidates = candidates.concat(collectOptionsFromContainer(document.body, 'document-body'));
      }
      
      const uniqueCandidates = Array.from(new Set(candidates));
      if (uniqueCandidates.length > 0) {
        if (attempt > 1) {
          console.log(`✅ Опции найдены на попытке ${attempt}`);
        }
        return uniqueCandidates;
      }
      
      if (attempt < maxAttempts) {
        const waitTime = 250 * attempt;
        console.warn(`⚠️ Опции не найдены (попытка ${attempt}/${maxAttempts}), жду ${waitTime} мс и пробую снова`);
        await this.delay(waitTime);
        if (!this.isPlaying) return [];
      }
    }
    return [];
  };
  
  const allOptions = await collectAllOptionsWithRetries();
  if (!this.isPlaying) return { success: false };
  const optionHasTargetText = (opt) => {
    try {
      const texts = getOptionTexts(opt);
      return texts.some(t => !isContainerLikeOptionText(t) && (t === targetLower || t.includes(targetLower) || targetLower.includes(t)));
    } catch (_) {
      return false;
    }
  };
  const hasTargetOptionInitially = (allOptions || []).some(optionHasTargetText);
  const targetDiffersFromCurrent = this.normalizeTextValue(selectedBeforeValue) !== this.normalizeTextValue(targetValue);
  // Если в найденных опциях нет целевого значения, но нужно изменить текущее значение —
  // пытаемся принудительно переоткрыть dropdown и пересобрать список опций.
  if (!hasTargetOptionInitially && targetDiffersFromCurrent) {
    try {
      await closeDropdownPanel();
      await this.delay(80);
      const reopenTarget = appSelect.querySelector('.select-box') || selectBoxElement || primaryClickTarget;
      reopenTarget?.scrollIntoView?.({ behavior: 'auto', block: 'center' });
      reopenTarget?.click?.();
      await this.delay(220);
      dropdownPanel = findDropdownPanel();
      if (dropdownPanel && panelSeemsEmpty(dropdownPanel)) {
        await this.waitForOptionsInPanel(dropdownPanel, 1200);
      }
      const reopenedOptions = await collectAllOptionsWithRetries();
      if (reopenedOptions && reopenedOptions.length > 0) {
        allOptions.length = 0;
        reopenedOptions.forEach(o => allOptions.push(o));
      }
    } catch (e) {
      // ignore and continue with existing options
    }
  }
  const optionTextSamples = (allOptions || []).slice(0, 8).map(opt => {
    try {
      return extractTextFromElement(opt).slice(0, 80);
    } catch (e) {
      return '';
    }
  }).filter(Boolean);
  
  if (!allOptions || allOptions.length === 0) {
    console.warn('⚠️ Не удалось найти опции после всех попыток');
    
    const forcedResult = await this.forceSetDropdownValueWithoutOptions({
      appSelect,
      selectBoxElement,
      targetValue,
      elementId,
      reason: 'options not found'
    });
    
    if (forcedResult.success) {
      await closeDropdownPanel();
      return forcedResult;
    }
    
    return { success: false, reason: 'options not found' };
  }
  
  console.log(`📊 Всего найдено ${allOptions.length} потенциальных опций`);
  // Приоритизируем опции: сначала внутри панели, потом остальные
  const optionsInsidePanel = allOptions.filter(opt => dropdownPanel && dropdownPanel.contains(opt));
  const optionsOutsidePanel = allOptions.filter(opt => !dropdownPanel || !dropdownPanel.contains(opt));
  
  console.log(`  📍 Опций внутри панели: ${optionsInsidePanel.length}, вне панели: ${optionsOutsidePanel.length}`);
  
  // Ищем опцию с нужным значением (сначала в панели, потом везде)
  let matchingOption = null;
  
  const matchByAbbrev = (t) => {
    const m = targetLower.match(/\(([^)]+)\)/);
    if (m) {
      const ab = this.normalizeTextValue(m[1]);
      if (ab && (t.includes(ab) || t.includes('(' + m[1].toLowerCase() + ')'))) return true;
    }
    const tgtNoParen = targetLower.replace(/\s*\([^)]+\)\s*/, '').trim();
    return tgtNoParen && t.includes(tgtNoParen);
  };
  const findMatchingInArray = (optionsArray, exactMatch = true) => {
    if (exactMatch) {
      return optionsArray.find(opt => {
        const optTexts = getOptionTexts(opt);
        return optTexts.some(t => {
          if (isContainerLikeOptionText(t)) return false;
          if (t === targetLower) return true;
          const tClean = t.replace(/\s+/g, '');
          const targetClean = targetLower.replace(/\s+/g, '');
          if (tClean === targetClean) return true;
          return matchByAbbrev(t);
        });
      });
    } else {
      return optionsArray.find(opt => {
        const optTexts = getOptionTexts(opt);
        return optTexts.some(t => {
          if (isContainerLikeOptionText(t)) return false;
          if (!t || t.length > 140) return false;
          if (t.includes(targetLower)) return true;
          if (matchByAbbrev(t)) return true;
          
          // Убираем пробелы и сравниваем
          const tClean = t.replace(/\s+/g, '');
          const targetClean = targetLower.replace(/\s+/g, '');
          if (tClean.includes(targetClean)) return true;
          
          // Для "По поручению" ищем также "поручению", "поручен", "поруч"
          if (targetLower.includes('поручен')) {
            const keywords = ['поручен', 'поручению', 'поруч', 'поручен'];
            if (keywords.some(kw => t.includes(kw) || kw.includes(t))) return true;
          }
          
          // Для "Плановый" ищем также "план"
          if (targetLower.includes('план')) {
            const keywords = ['план', 'плановый', 'планов'];
            if (keywords.some(kw => t.includes(kw) || kw.includes(t))) return true;
          }
          
          // Для "Инициативный" ищем также "инициатив"
          if (targetLower.includes('инициатив')) {
            const keywords = ['инициатив', 'инициативный', 'инициативн'];
            if (keywords.some(kw => t.includes(kw) || kw.includes(t))) return true;
          }
          
          // Сравниваем по словам (если хотя бы 2 слова совпадают)
          const targetWords = targetLower.split(/\s+/).filter(w => w.length > 2);
          const tWords = t.split(/\s+/).filter(w => w.length > 2);
          if (targetWords.length > 0 && tWords.length > 0) {
            const matchingWords = targetWords.filter(tw => 
              tWords.some(tw2 => tw2.includes(tw) || tw.includes(tw2))
            );
            if (matchingWords.length >= Math.min(2, targetWords.length)) return true;
          }
          
          return false;
        });
      });
    }
  };

  const isMatchCandidateValid = (opt) => {
    if (!opt || !(opt instanceof Element)) return false;
    const texts = getOptionTexts(opt).filter(Boolean);
    if (texts.length === 0) return false;
    const hasTargetText = texts.some(t => !isContainerLikeOptionText(t) && (t === targetLower || t.includes(targetLower)));
    if (!hasTargetText) return false;
    const cls = ((opt.className || '').toString()).toLowerCase();
    const role = (opt.getAttribute && opt.getAttribute('role')) || '';
    const hasOptionMarker =
      role === 'option' ||
      cls.includes('option') ||
      cls.includes('mat-option') ||
      cls.includes('ng-option') ||
      cls.includes('group-item') ||
      cls.includes('result__content') ||
      opt.hasAttribute('data-value') ||
      !!opt.closest('[role="option"], .option, .mat-option, .ng-option, .group-item, .result__content, [data-value]');
    if (!hasOptionMarker) return false;
    return true;
  };
  
  // Сначала точное совпадение внутри панели
  matchingOption = findMatchingInArray(optionsInsidePanel, true);
  
  // Если не нашли, точное совпадение везде
  if (!matchingOption) {
    matchingOption = findMatchingInArray(allOptions, true);
  }
  
  // Если не нашли, частичное совпадение внутри панели
  if (!matchingOption) {
    matchingOption = findMatchingInArray(optionsInsidePanel, false);
  }
  
  // Если не нашли, частичное совпадение везде
  if (!matchingOption) {
    matchingOption = findMatchingInArray(allOptions, false);
  }
  
  // Если все еще не нашли, пробуем найти по первым словам (сначала в панели)
  if (!matchingOption && targetLower.length > 3) {
    const firstWords = targetLower.split(' ').slice(0, 2).join(' ');
    matchingOption = optionsInsidePanel.find(opt => {
      const optTexts = getOptionTexts(opt);
      return optTexts.some(t => t.includes(firstWords) || firstWords.includes(t));
    });
    if (!matchingOption) {
      matchingOption = allOptions.find(opt => {
        const optTexts = getOptionTexts(opt);
        return optTexts.some(t => t.includes(firstWords) || firstWords.includes(t));
      });
    }
  }

  const findGlobalMatchingOption = () => {
    const globalSelectors = [
      '.option', // Приоритет для .option
      '.option.cutted-text', // Приоритет для .option.cutted-text
      '.result__content',
      '.result__item',
      '.result__value',
      '[role="option"]',
      '[ng-reflect-app-tooltip]',
      '[data-value]',
      '[tooltip]'
    ];
    for (const selector of globalSelectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!qualifiesAsOption(node)) continue;
        const texts = getOptionTexts(node);
        if (texts.some(t => t === targetLower) ||
            texts.some(t => t.includes(targetLower) || targetLower.includes(t))) {
          return node;
        }
      }
    }
    return null;
  };

  if (!matchingOption) {
    const fallbackMatch = findGlobalMatchingOption();
    if (fallbackMatch) {
      console.log('✅ Найдена подходящая опция через глобальный поиск');
      matchingOption = fallbackMatch;
    }
  }
  if (!matchingOption && targetDiffersFromCurrent && appSelect) {
    const rawInGroup = Array.from(appSelect.querySelectorAll('.select-group .option.cutted-text, .select-group .option.ng-star-inserted, .select-group .option'));
    for (const el of rawInGroup) {
      if (!optionHasTargetText(el)) continue;
      matchingOption = el;
      break;
    }
  }
  if (matchingOption && !isMatchCandidateValid(matchingOption)) {
    matchingOption = null;
  }
  
  if (matchingOption) {
    const optionText = extractTextFromElement(matchingOption);
    console.log(`✅ Найдена опция: "${optionText.substring(0, 50)}"`);
    
    // Определяем целевой элемент для клика
    let clickTarget = matchingOption;
    
    // Если найден .result__content, ищем родительский .result для клика
    if (matchingOption.classList.contains('result__content')) {
      const resultParent = matchingOption.closest('.result');
      if (resultParent) {
        clickTarget = resultParent;
        console.log(`  → Найден родительский .result для клика`);
      }
    }
    
    // Если найден span внутри .option, ищем родительский .option для клика
    if (matchingOption.tagName === 'SPAN' && matchingOption.closest('.option')) {
      const optionParent = matchingOption.closest('.option');
      if (optionParent) {
        clickTarget = optionParent;
        console.log(`  → Найден родительский .option для клика`);
      }
    }
    
    // Если найден .option, используем его напрямую
    if (matchingOption.classList.contains('option')) {
      clickTarget = matchingOption;
      console.log(`  → Использую .option напрямую для клика`);
    }
    
    // Предпочитаем интерактивный элемент (Angular mat-option / role=option), иначе клик может не применить выбор
    const interactiveOption = clickTarget.closest && clickTarget.closest('[role="option"], .mat-option');
    if (interactiveOption && interactiveOption !== clickTarget) {
      const ir = interactiveOption.getBoundingClientRect();
      if (ir.width > 0 && ir.height > 0) {
        clickTarget = interactiveOption;
        console.log(`  → Использую интерактивную опцию [role="option"]/.mat-option для клика`);
      }
    }
    const childOption = clickTarget.querySelector && clickTarget.querySelector('[role="option"], .mat-option');
    if (childOption && (childOption.getBoundingClientRect().width > 0 && childOption.getBoundingClientRect().height > 0)) {
      clickTarget = childOption;
      console.log(`  → Использую дочернюю интерактивную опцию для клика`);
    }
    
    // Если элемент не имеет размера, ищем ближайший кликабельный родитель
    const rect = clickTarget.getBoundingClientRect();
    if ((rect.width === 0 || rect.height === 0) && clickTarget.offsetWidth === 0 && clickTarget.offsetHeight === 0) {
      const clickableParent = clickTarget.closest('.result, [role="option"], [onclick], button, a');
      if (clickableParent && clickableParent !== clickTarget) {
        const parentRect = clickableParent.getBoundingClientRect();
        if (parentRect.width > 0 && parentRect.height > 0) {
          clickTarget = clickableParent;
          console.log(`  → Найден кликабельный родитель с размером`);
        }
      }
    }
    
    // Прокручиваем к опции (instant — без анимации, чтобы заполнение было сразу)
    clickTarget.scrollIntoView({ behavior: 'auto', block: 'center' });
    await this.delay(30);
    
    // Логируем информацию о целевом элементе
    const targetRect = clickTarget.getBoundingClientRect();
    const targetOffsetW = clickTarget.offsetWidth || 0;
    const targetOffsetH = clickTarget.offsetHeight || 0;
    console.log(`  📍 Целевой элемент: ${clickTarget.tagName}.${clickTarget.className || ''} - rect: ${targetRect.width.toFixed(0)}×${targetRect.height.toFixed(0)}, offset: ${targetOffsetW}×${targetOffsetH}`);
    
    // Пробуем разные способы клика (Angular часто требует полную последовательность mousedown/mouseup/click)
    let clicked = false;
    const doMouseSequence = (el) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
    };

    // Способ 1: полная последовательность мыши (часто нужна для Angular)
    try {
      doMouseSequence(clickTarget);
      await this.delay(60);
      clicked = true;
      console.log('✅ Клик выполнен через mousedown + mouseup + click');
    } catch (e) {
      console.warn('⚠️ Mouse sequence не сработал, пробую click()...');
    }

    // Способ 2: обычный click()
    if (!clicked) {
      try {
        clickTarget.click();
        await this.delay(80);
        clicked = true;
        console.log('✅ Клик выполнен обычным способом');
      } catch (e) {
        console.warn('⚠️ Обычный клик не сработал');
      }
    }

    // Способ 3: только MouseEvent (click)
    if (!clicked) {
      try {
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
        await this.delay(80);
        clicked = true;
        console.log('✅ Клик выполнен через MouseEvent (click)');
      } catch (e) {
        console.warn('⚠️ MouseEvent (click) не сработал');
      }
    }
    
    // Способ 4: Клик по родительскому элементу, если опция не кликабельна
    if (!clicked) {
      try {
        const clickableParent = clickTarget.closest('.result, [role="option"], [onclick], button, a');
        if (clickableParent && clickableParent !== clickTarget) {
          clickableParent.click();
          await this.delay(80);
          clicked = true;
          console.log('✅ Клик выполнен по родительскому элементу');
        }
      } catch (e) {
        console.warn('⚠️ Клик по родительскому элементу не сработал');
      }
    }
    
    // Проверяем значение сразу и затем короткими интервалами (Angular обновляет DOM асинхронно)
    let wasSelected = false;
    const checkDelays = [0, 50, 80, 100, 120];
    for (let attempt = 0; attempt < checkDelays.length; attempt++) {
      if (checkDelays[attempt] > 0) await this.delay(checkDelays[attempt]);
      wasSelected = await this.checkIfValueSelected(appSelectRoot, targetValue);
      if (wasSelected) {
        console.log(`✅ Значение выбрано на попытке ${attempt + 1}`);
        break;
      }
    }
    
    // Если значение не выбрано, пробуем еще раз с полной последовательностью мыши
    if (!wasSelected && clicked) {
      console.warn('⚠️ Значение не было выбрано после первого клика, пробую mousedown+mouseup+click...');
      try {
        if (typeof doMouseSequence === 'function') {
          doMouseSequence(clickTarget);
        } else {
          clickTarget.click();
        }
        await this.delay(100);
        for (let attempt = 0; attempt < 3; attempt++) {
          await this.delay(80);
          wasSelected = await this.checkIfValueSelected(appSelectRoot, targetValue);
          if (wasSelected) {
            console.log(`✅ Значение выбрано после повторного клика (попытка ${attempt + 1})`);
            break;
          }
        }
      } catch (e) {
        console.warn('⚠️ Повторный клик не сработал:', e);
      }
    }
    
    if (wasSelected) {
      const strictCheck = strictSelectionCheck();
      if (!strictCheck.ok) {
        return { success: false, reason: 'strict confirmation failed' };
      }
      await closeDropdownPanel();
      return { success: true, selectedValue: targetValue, method: 'click-on-option' };
    } else {
      console.warn('⚠️ Значение не было выбрано после всех попыток клика');
      return { success: false, reason: 'value not selected after click attempts' };
    }
  } else {
    console.warn(`⚠️ Опция "${targetValue}" не найдена среди ${allOptions.length} опций`);
    
    // Fallback: для searchable dropdown пробуем ввести значение в поле поиска внутри панели
    // и подтвердить Enter. Это покрывает кейс, когда в списке сначала видны не все опции.
    const trySearchInputFallback = async () => {
      const candidates = [];
      if (dropdownPanel) {
        candidates.push(...Array.from(dropdownPanel.querySelectorAll('input, textarea, [contenteditable="true"]')));
      }
      if (appSelect) {
        candidates.push(...Array.from(appSelect.querySelectorAll('input, textarea, [contenteditable="true"]')));
      }
      const searchTarget = candidates.find(el => {
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return true;
        return !!el.isContentEditable;
      });
      if (!searchTarget) {
        return null;
      }

      try {
        searchTarget.focus?.();
        await this.delay(80);
        if ('value' in searchTarget) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(searchTarget, '');
            setter.call(searchTarget, targetValue);
          } else {
            searchTarget.value = '';
            searchTarget.value = targetValue;
          }
        } else if (searchTarget.isContentEditable) {
          searchTarget.textContent = targetValue;
        }

        searchTarget.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        searchTarget.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        await this.delay(220);

        searchTarget.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
        await this.delay(80);
        searchTarget.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
        await this.delay(420);

        const confirmed = await this.checkIfValueSelected(appSelectRoot, targetValue);
        const strictCheck = strictSelectionCheck();
        if (confirmed && strictCheck.ok) {
          await closeDropdownPanel();
          return { success: true, selectedValue: targetValue, method: 'search-input-enter' };
        }
        return null;
      } catch (e) {
        return null;
      }
    };
    const searchFallbackResult = await trySearchInputFallback();
    if (searchFallbackResult?.success) {
      return searchFallbackResult;
    }

    // Дополнительный fallback: typeahead через клавиатуру на самом контроле.
    // Многие кастомные селекты фильтруют опции по введённому тексту без отдельного input.
    const tryTypeaheadFallback = async () => {
      const keyTarget = primaryClickTarget || selectBoxElement;
      if (!keyTarget) return null;
      try {
        keyTarget.focus?.();
        await this.delay(80);
        const chars = String(targetValue || '').slice(0, 40).split('');
        for (const ch of chars) {
          keyTarget.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch, code: ch.length === 1 ? `Key${ch.toUpperCase()}` : '' }));
          keyTarget.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: ch, code: ch.length === 1 ? `Key${ch.toUpperCase()}` : '' }));
          keyTarget.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: ch, code: ch.length === 1 ? `Key${ch.toUpperCase()}` : '' }));
          await this.delay(20);
        }
        await this.delay(180);
        keyTarget.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
        keyTarget.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
        await this.delay(350);

        const strictCheck = strictSelectionCheck();
        if (strictCheck.ok) {
          await closeDropdownPanel();
          return { success: true, selectedValue: targetValue, method: 'typeahead-enter' };
        }
        return null;
      } catch (e) {
        return null;
      }
    };
    const typeaheadFallbackResult = await tryTypeaheadFallback();
    if (typeaheadFallbackResult?.success) {
      return typeaheadFallbackResult;
    }
    
    // Выводим список всех доступных опций для отладки
    if (allOptions.length > 0) {
      console.log('📋 Доступные опции (первые 20):');
      allOptions.slice(0, 20).forEach((opt, idx) => {
        const texts = getOptionTexts(opt);
        const text = extractTextFromElement(opt);
        const ngTooltip = opt.getAttribute('ng-reflect-app-tooltip') || '';
        const tooltip = opt.getAttribute('tooltip') || '';
        const value = opt.getAttribute('value') || '';
        const allTexts = [...texts, text, ngTooltip, tooltip, value].filter(Boolean).join(' | ');
        console.log(`  ${idx + 1}. "${allTexts.substring(0, 150)}"`);
      });
      
      // Показываем, какие опции наиболее близки к искомому значению
      console.log(`🔍 Поиск похожих опций для "${targetValue}":`);
      const targetWords = targetLower.split(/\s+/).filter(w => w.length > 2);
      const similarOptions = allOptions.map(opt => {
        const optTexts = getOptionTexts(opt);
        let score = 0;
        optTexts.forEach(t => {
          targetWords.forEach(tw => {
            if (t.includes(tw) || tw.includes(t)) score += 1;
          });
        });
        return { opt, score, texts: optTexts };
      }).filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
      if (similarOptions.length > 0) {
        console.log('  Наиболее похожие опции:');
        similarOptions.forEach((item, idx) => {
          const text = extractTextFromElement(item.opt);
          console.log(`    ${idx + 1}. "${text}" (score: ${item.score})`);
        });
      }
    }
    
    // НЕ используем forceSetDropdownValueWithoutOptions - это приводит к "жёсткой" установке значения
    // Вместо этого возвращаем false, чтобы вызвать waitForUserSelection
    console.warn('⚠️ Опция не найдена, НЕ использую fallback - требуется ручной выбор');
    await closeDropdownPanel();
    return { success: false, reason: 'option not found', availableOptions: allOptions.map(o => {
      const text = extractTextFromElement(o);
      const ngTooltip = o.getAttribute('ng-reflect-app-tooltip') || '';
      return ngTooltip || text;
    }) };
  }
}

TestPlayer.prototype.setNativeInputValue = function(input, value) {
  if (!input) return;
  try {
    const proto = Object.getPrototypeOf(input);
    const descriptor = (proto && Object.getOwnPropertyDescriptor(proto, 'value')) ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  } catch (e) {
    // Illegal invocation или cross-document: пробуем прямую запись
    if (e && (e.name === 'TypeError' || String(e.message || '').includes('Illegal invocation'))) {
      try {
        input.value = value;
      } catch (e2) {
        console.warn('⚠️ setNativeInputValue: не удалось установить value:', e2?.message || e2);
        throw e2;
      }
    } else {
      throw e;
    }
  }
}

TestPlayer.prototype.forceSetDropdownValueWithoutOptions = async function({ appSelect, selectBoxElement, targetValue, elementId, reason }) {
  if (!appSelect || !selectBoxElement || !targetValue) {
    return { success: false };
  }
  
  const statusContainer = selectBoxElement.closest('.input-project-status') || 
    (elementId && elementId.includes('status') ? appSelect : null);
  const container = statusContainer || appSelect;
  
  if (!container) {
    return { success: false };
  }

  const controlName = this.getControlNameFromElement(appSelect, selectBoxElement);

  const angularResult = await this.trySelectViaAngularAPIs({
    appSelect,
    selectBoxElement,
    targetValue,
    controlName,
    reason
  });
  if (angularResult?.success) {
    return angularResult;
  }

  console.warn(`🛠️ Опции не найдены (${reason}), пробую установить значение "${targetValue}" через Angular API...`);
  
  // Попытка 1: Использовать Angular API для обновления компонента
  try {
    const ngComponent = this.getAngularComponent(appSelect);
    if (ngComponent) {
      // Пробуем найти свойство модели в компоненте
      const componentInstance = ngComponent.instance || ngComponent.componentInstance;
      if (componentInstance) {
        // Ищем свойства, которые могут содержать значение
        const possibleProps = ['value', 'selectedValue', 'model', 'ngModel', 'formControl', 'control', 'selected', 'selectedItem'];
        
        // Также ищем через все свойства объекта (для кастомных компонентов)
        const allProps = Object.keys(componentInstance).filter(key => {
          const val = componentInstance[key];
          return val !== null && val !== undefined && 
                 (typeof val === 'string' || typeof val === 'object' || typeof val === 'number');
        });
        
        const propsToTry = [...possibleProps, ...allProps.slice(0, 20)]; // Ограничиваем до 20 для производительности
        
        for (const prop of propsToTry) {
          if (componentInstance[prop] !== undefined) {
            try {
              // Пробуем установить значение напрямую
              const oldValue = componentInstance[prop];
              
              // Если это объект с свойствами name/label/text, обновляем их
              if (typeof oldValue === 'object' && oldValue !== null) {
                if ('name' in oldValue) oldValue.name = targetValue;
                if ('label' in oldValue) oldValue.label = targetValue;
                if ('text' in oldValue) oldValue.text = targetValue;
                if ('value' in oldValue) oldValue.value = targetValue;
              } else {
                componentInstance[prop] = targetValue;
              }
              
              // Вызываем Angular change detection
              const zoneToken = window.ng?.coreTokens?.NgZone;
              const debugInjector = ngComponent.injector || window.ng?.getInjector?.(appSelect);
              const zone = zoneToken && debugInjector?.get ? debugInjector.get(zoneToken, null) : null;
              if (zone) {
                zone.run(() => {
                  // Обновляем значение внутри Angular zone
                  if (typeof componentInstance[prop] === 'object' && componentInstance[prop] !== null) {
                    if ('name' in componentInstance[prop]) componentInstance[prop].name = targetValue;
                    if ('label' in componentInstance[prop]) componentInstance[prop].label = targetValue;
                    if ('text' in componentInstance[prop]) componentInstance[prop].text = targetValue;
                    if ('value' in componentInstance[prop]) componentInstance[prop].value = targetValue;
                  } else {
                    componentInstance[prop] = targetValue;
                  }
                });
              }
              
              // Вызываем методы обновления, если они есть
              const updateMethods = ['onChange', 'writeValue', 'updateValue', 'setValue', 'patchValue', 'selectValue', 'onSelect'];
              for (const methodName of updateMethods) {
                if (typeof componentInstance[methodName] === 'function') {
                  try {
                    componentInstance[methodName](targetValue);
                    console.log(`  → Вызван метод ${methodName}(${targetValue})`);
                  } catch (e) {
                    // Игнорируем ошибки вызова методов
                  }
                }
              }
              
              console.log(`  → Обновлено свойство ${prop} компонента через Angular API`);
              await this.delay(300);
              
              // Проверяем, применилось ли значение
              const confirmed = await this.checkIfValueSelected(appSelectRoot, targetValue);
              if (confirmed) {
                console.log('✅ Значение установлено через Angular API');
                return { success: true, selectedValue: targetValue, forced: true, method: 'angular-api' };
              }
            } catch (e) {
              // Игнорируем ошибки для несуществующих свойств
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Не удалось использовать Angular API:', e);
  }
  
  // Попытка 2: Обновить через DOM события с правильными типами для Angular
  const textInputs = [
    container.querySelector('input.result'),
    container.querySelector('input.select-input'),
    container.querySelector('input[type="text"]'),
    selectBoxElement.querySelector('input')
  ].filter(Boolean);
  
  const hiddenInput = container.querySelector('input[type="hidden"]');
  const controlElements = controlName
    ? Array.from(document.querySelectorAll(`[formcontrolname="${controlName}"], [ng-reflect-name="${controlName}"], [ng-reflect-form-control-name="${controlName}"], [name="${controlName}"]`))
    : [];
  const resultElement = container.querySelector('.result');
  const resultContent = container.querySelector('.result__content');

  let changed = false;
  
  // Обновляем текстовые инпуты с правильными событиями для Angular
  textInputs.forEach(input => {
    try {
      this.setNativeInputValue(input, targetValue);
      // Angular слушает эти события
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      // Также пробуем Angular-специфичные события
      input.dispatchEvent(new CustomEvent('ngModelChange', { bubbles: true, detail: targetValue }));
      changed = true;
    } catch (e) {
      console.warn('⚠️ Не удалось установить значение текстового input:', e);
    }
  });

  // Обновляем скрытое поле
  if (hiddenInput) {
    try {
      this.setNativeInputValue(hiddenInput, targetValue);
      hiddenInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      changed = true;
    } catch (e) {
      console.warn('⚠️ Не удалось обновить скрытое поле:', e);
    }
  }

  controlElements.forEach(input => {
    try {
      this.setNativeInputValue(input, targetValue);
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new CustomEvent('ngModelChange', { bubbles: true, detail: targetValue }));
      changed = true;
    } catch (e) {
      console.warn('⚠️ Не удалось обновить formControl элемент:', e);
    }
  });

  // Обновляем отображаемые элементы
  [resultElement, resultContent, selectBoxElement].filter(Boolean).forEach(node => {
    try {
      if (node instanceof HTMLElement) {
        // Обновляем текст
        const textNode = node.querySelector('.result__content') || node;
        if (textNode) {
          textNode.textContent = targetValue;
          textNode.innerText = targetValue;
        }
        
        // Обновляем ng-reflect атрибуты
        if (appSelect) {
          appSelect.setAttribute('ng-reflect-model', targetValue);
          appSelect.setAttribute('ng-reflect-value', targetValue);
        }
        
        // Вызываем события
        node.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        node.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        node.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
        changed = true;
      }
    } catch (e) {
      console.warn('⚠️ Не удалось обновить отображение значения:', e);
    }
  });

  // Вызываем Angular change detection вручную
  try {
    const zoneToken = window.ng?.coreTokens?.NgZone;
    const injector = window.ng?.getInjector?.(appSelect) || this.getAngularComponent(appSelect)?.injector;
    const zone = zoneToken && injector?.get ? injector.get(zoneToken, null) : null;
    zone?.run?.(() => {
      // Дополнительные обновления внутри zone
    });
  } catch (e) {
    // Игнорируем, если zone недоступен
  }

  if (changed) {
    await this.delay(300);
    const confirmed = await this.checkIfValueSelected(appSelectRoot, targetValue);
    if (confirmed) {
      console.log('✅ Значение установлено через DOM события');
      return { success: true, selectedValue: targetValue, forced: true, method: 'dom-events' };
    }
  }

  console.warn('⚠️ Не удалось установить значение, потребуется ручной выбор');
  return { success: false };
}

TestPlayer.prototype.getAngularComponent = function(element) {
  if (!element) return null;
  
  try {
    if (window.ng?.getComponent) {
      const instance = window.ng.getComponent(element);
      if (instance) {
        const injector = window.ng.getInjector?.(element);
        return { instance, componentInstance: instance, injector };
      }
    }
    
    // Пробуем получить Angular компонент через ng.probe
    if (window.ng && window.ng.probe) {
      return window.ng.probe(element);
    }
    
    // Альтернативный способ через __ngContext__ (Angular 9+)
    if (element.__ngContext__) {
      const context = element.__ngContext__;
      // Ищем компонент в контексте
      for (let i = 0; i < context.length; i++) {
        if (context[i] && context[i].constructor && context[i].constructor.name) {
          return { instance: context[i], componentInstance: context[i] };
        }
      }
    }
    
    // Пробуем через ngComponentRef
    if (element.ngComponentRef) {
      return { instance: element.ngComponentRef.instance };
    }
  } catch (e) {
    // Игнорируем ошибки доступа к Angular API
  }
  
  return null;
}

TestPlayer.prototype.looksLikeFormControl = function(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const fn = (prop) => typeof obj[prop] === 'function';
  return (fn('setValue') || fn('patchValue')) && (fn('markAsDirty') || fn('markAsTouched') || fn('updateValueAndValidity'));
}

TestPlayer.prototype.getControlNameFromElement = function(...elements) {
  const attrCandidates = ['formcontrolname', 'ng-reflect-name', 'ng-reflect-form-control-name', 'name', 'data-control', 'data-control-name'];
  for (const element of elements) {
    if (!element || !(element instanceof Element)) continue;
    for (const attr of attrCandidates) {
      const value = element.getAttribute?.(attr);
      if (value && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}

TestPlayer.prototype.findAngularFormControl = function(rootInstance, controlName, maxDepth = 4) {
  if (!rootInstance || typeof rootInstance !== 'object') return null;
  const visited = new Set();
  const queue = [{ obj: rootInstance, depth: 0 }];
  
  const priorityKeys = (name) => {
    if (!name) return 2;
    const lower = name.toLowerCase();
    if (controlName && lower.includes(controlName.toLowerCase())) return 0;
    if (lower.includes('control') || lower.includes('form') || lower.includes('group')) return 1;
    return 2;
  };
  
  while (queue.length > 0 && visited.size < 200) {
    const { obj, depth } = queue.shift();
    if (!obj || typeof obj !== 'object') continue;
    if (visited.has(obj)) continue;
    visited.add(obj);
    
    if (controlName) {
      if (obj.controls && obj.controls[controlName]) {
        return obj.controls[controlName];
      }
      if (obj._controls && obj._controls[controlName]) {
        return obj._controls[controlName];
      }
      if ((obj.name || obj._name) && (obj.name === controlName || obj._name === controlName) && this.looksLikeFormControl(obj)) {
        return obj;
      }
    }
    
    if (this.looksLikeFormControl(obj) && !controlName) {
      return obj;
    }
    
    if (depth >= maxDepth) continue;
    const keys = Object.keys(obj).slice(0, 30);
    keys.sort((a, b) => priorityKeys(a) - priorityKeys(b));
    
    for (const key of keys) {
      const value = obj[key];
      if (value && typeof value === 'object') {
        queue.push({ obj: value, depth: depth + 1 });
      }
    }
  }
  return null;
}

TestPlayer.prototype.collectAngularOptionArrays = function(componentInstance) {
  const arrays = [];
  if (!componentInstance || typeof componentInstance !== 'object') return arrays;
  
  const inspectObject = (obj, depth = 0, propName = '') => {
    if (!obj || typeof obj !== 'object' || depth > 1) return;
    Object.keys(obj).slice(0, 30).forEach(key => {
      const value = obj[key];
      if (Array.isArray(value) && value.length > 0 && value.length <= 1000) {
        const sample = value[0];
        if (['object', 'string', 'number'].includes(typeof sample)) {
          arrays.push({ prop: propName ? `${propName}.${key}` : key, list: value });
        }
      } else if (value && typeof value === 'object') {
        if (/options|items|values|list|data|source/i.test(key)) {
          inspectObject(value, depth + 1, propName ? `${propName}.${key}` : key);
        }
      }
    });
  };
  
  inspectObject(componentInstance, 0, '');
  return arrays;
}

TestPlayer.prototype.findMatchingAngularOption = function(componentInstance, targetValue) {
  if (!componentInstance || !targetValue) return null;
  const optionArrays = this.collectAngularOptionArrays(componentInstance);
  if (!optionArrays.length) return null;
  
  const targetLower = this.normalizeTextValue(targetValue);
  for (const entry of optionArrays) {
    for (const option of entry.list) {
      const optionText = typeof option === 'object'
        ? (option?.name || option?.label || option?.text || option?.value || option?.title)
        : option;
      const optionLower = this.normalizeTextValue(optionText);
      if (!optionLower) continue;
      if (optionLower === targetLower || optionLower.includes(targetLower) || targetLower.includes(optionLower)) {
        return { option, sourceProperty: entry.prop };
      }
    }
  }
  return null;
}

TestPlayer.prototype.trySelectViaAngularAPIs = async function({ appSelect, selectBoxElement, targetValue, controlName, reason }) {
  if (!appSelect || !targetValue) return { success: false };
  const resolvedControlName = controlName || this.getControlNameFromElement(appSelect, selectBoxElement);
  
  const ngComponent = this.getAngularComponent(appSelect);
  const componentInstance = ngComponent?.instance || ngComponent?.componentInstance;
  const injector = ngComponent?.injector || window.ng?.getInjector?.(appSelect) || null;
  
  if (!componentInstance) {
    return { success: false };
  }
  
  const matchingOption = this.findMatchingAngularOption(componentInstance, targetValue);
  
  const selectMethodNames = ['select', 'selectValue', 'selectOption', 'setSelected', 'choose', 'onSelect', 'handleSelect'];
  if (matchingOption) {
    for (const methodName of selectMethodNames) {
      const method = componentInstance[methodName];
      if (typeof method === 'function') {
        try {
          console.log(`  → Пробую вызвать ${methodName}() через Angular API`);
          await method.call(componentInstance, matchingOption.option, targetValue);
          await this.delay(150);
          const confirmed = await this.checkIfValueSelected(appSelectRoot, targetValue);
          if (confirmed) {
            console.log('✅ Значение установлено через Angular select API');
            return { success: true, selectedValue: targetValue, method: 'angular-select' };
          }
        } catch (e) {
          console.warn(`   ⚠️ ${methodName}() завершился ошибкой:`, e);
        }
      }
    }
  }
  
  let angularControl = this.findAngularFormControl(componentInstance, resolvedControlName);
  if (!angularControl && resolvedControlName) {
    const parentFormElements = [];
    const seenAncestors = new Set();
    const pushAncestor = (el) => {
      if (el && el instanceof Element && !seenAncestors.has(el)) {
        seenAncestors.add(el);
        parentFormElements.push(el);
      }
    };
    pushAncestor(appSelect.closest('form'));
    let p = appSelect.parentElement;
    for (let d = 0; d < 15 && p; d++) {
      if (p.tagName && String(p.tagName).includes('-')) pushAncestor(p);
      p = p.parentElement;
    }
    for (const formEl of parentFormElements) {
      const formComponent = this.getAngularComponent(formEl);
      const formInstance = formComponent?.instance || formComponent?.componentInstance;
      if (formInstance) {
        angularControl = this.findAngularFormControl(formInstance, resolvedControlName);
        if (angularControl) break;
      }
    }
  }
  
  if (angularControl) {
    const candidateValues = [];
    if (matchingOption?.option) {
      candidateValues.push(matchingOption.option);
      if (matchingOption.option?.value !== undefined) candidateValues.push(matchingOption.option.value);
      if (matchingOption.option?.id !== undefined) candidateValues.push(matchingOption.option.id);
      if (matchingOption.option?.code !== undefined) candidateValues.push(matchingOption.option.code);
      const optionText = matchingOption.option?.name || matchingOption.option?.label || matchingOption.option?.text;
      if (optionText) candidateValues.push(optionText);
    }
    candidateValues.push(targetValue);
    
    for (const candidate of candidateValues.filter(Boolean)) {
      try {
        if (typeof angularControl.setValue === 'function') {
          angularControl.setValue(candidate);
        } else if (typeof angularControl.patchValue === 'function') {
          angularControl.patchValue(candidate);
        } else {
          continue;
        }
        angularControl.markAsDirty?.();
        angularControl.markAsTouched?.();
        angularControl.updateValueAndValidity?.();
        await this.delay(120);
        const confirmed = await this.checkIfValueSelected(appSelectRoot, targetValue);
        if (confirmed) {
          console.log('✅ Значение установлено через FormControl');
          return { success: true, selectedValue: targetValue, method: 'angular-control' };
        }
      } catch (e) {
        // Пробуем следующий кандидат
      }
    }
  }
  
  if (injector && window.ng?.coreTokens?.NgZone && reason) {
    try {
      const zone = injector.get(window.ng.coreTokens.NgZone, null);
      zone?.run?.(() => {});
    } catch (e) {
      // ignore
    }
  }
  
  return { success: false };
}

TestPlayer.prototype.findNativeSelectElement = function(element) {
  if (!element) return null;
  if (element.tagName === 'SELECT') {
    return element;
  }
  
  if (element.closest) {
    const closestSelect = element.closest('select');
    if (closestSelect) {
      return closestSelect;
    }
  }
  
  if (element.querySelector) {
    const nestedSelect = element.querySelector('select');
    if (nestedSelect) {
      return nestedSelect;
    }
  }
  
  const appSelect = element.closest?.('app-select');
  if (appSelect && appSelect.querySelector) {
    const selectInsideApp = appSelect.querySelector('select');
    if (selectInsideApp) {
      return selectInsideApp;
    }
  }
  
  return null;
}

TestPlayer.prototype.getNativeSelectDisplayValue = function(selectElement) {
  if (!selectElement) return '';
  const selectedOption = selectElement.options && selectElement.options[selectElement.selectedIndex];
  if (selectedOption) {
    return selectedOption.textContent?.trim() || selectedOption.label || selectedOption.value || '';
  }
  return selectElement.value || '';
}

TestPlayer.prototype.normalizeTextValue = function(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let normalized = value.toString().trim().toLowerCase();
  // Убираем множественные пробелы
  normalized = normalized.replace(/\s+/g, ' ');
  // Убираем знаки препинания в начале и конце (но оставляем внутри)
  normalized = normalized.replace(/^[.,;:!?\-—–\s]+|[.,;:!?\-—–\s]+$/g, '');
  // Убираем невидимые символы
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  return normalized;
}

TestPlayer.prototype.getNativeOptionCandidates = function(optionElement) {
  if (!optionElement) return [];
  const candidates = [];
  
  const text = optionElement.textContent?.trim();
  if (text) candidates.push(text.toLowerCase());
  
  const label = optionElement.label?.trim();
  if (label) candidates.push(label.toLowerCase());
  
  const value = optionElement.value?.trim();
  if (value) candidates.push(value.toLowerCase());
  
  const dataValue = optionElement.getAttribute?.('data-value');
  if (dataValue) candidates.push(dataValue.trim().toLowerCase());
  
  const tooltip = optionElement.getAttribute?.('title');
  if (tooltip) candidates.push(tooltip.trim().toLowerCase());
  
  return candidates.filter(Boolean);
}

TestPlayer.prototype.selectNativeOption = async function(selectElement, targetValue) {
  if (!selectElement) {
    return { success: false, reason: 'no select element' };
  }
  
  const options = Array.from(selectElement.options || []);
  if (options.length === 0) {
    return { success: false, reason: 'native select has no options' };
  }
  
  const targetLower = this.normalizeTextValue(targetValue);
  let matchingOption = options.find(option => this.getNativeOptionCandidates(option).some(val => val === targetLower));
  
  if (!matchingOption) {
    matchingOption = options.find(option => this.getNativeOptionCandidates(option).some(val => val.includes(targetLower) || targetLower.includes(val)));
  }
  
  if (!matchingOption) {
    return { success: false, reason: 'native option not found' };
  }
  
  const valueToSet = matchingOption.value ?? matchingOption.getAttribute('data-value') ?? matchingOption.textContent ?? targetValue;
  matchingOption.selected = true;
  // Для multiple select НЕ присваиваем .value — иначе сбросятся остальные выбранные опции
  if (!selectElement.multiple) {
    selectElement.value = valueToSet;
  }
  
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  selectElement.dispatchEvent(inputEvent);
  await this.delay(20);
  selectElement.dispatchEvent(changeEvent);
  await this.delay(50);
  
  const selectedValue = matchingOption.textContent?.trim() || matchingOption.label || valueToSet;
  console.log(`✅ Значение "${selectedValue}" установлено через нативный <select>`);
  return { success: true, selectedValue };
}

/**
 * Парсит длинный текст dropdown и извлекает только выбранную опцию (аналогично recorder.js)
 */
TestPlayer.prototype.parseSelectedOptionFromText = function(fullText, initialValue = '') {
  if (!fullText || typeof fullText !== 'string') return null;
  
  const text = fullText.trim();
  if (!text || text.length < 2) return null;
  
  // Игнорируем placeholder
  const placeholderValues = ['выберите', 'Выберите', 'статус', 'Статус', 'select', 'placeholder'];
  if (placeholderValues.some(ph => text.toLowerCase() === ph.toLowerCase())) return null;
  
  // Если текст короткий и не содержит множественных значений, возвращаем как есть
  if (text.length < 50 && !text.includes('Плановый') && !text.includes('По поручению') && !text.includes('Инициативный')) {
    return text;
  }
  
  // Парсим длинные строки с множественными опциями
  const knownOptions = ['Плановый', 'По поручению', 'Инициативный'];
  const foundOptions = [];
  
  for (const option of knownOptions) {
    if (text.includes(option)) {
      foundOptions.push(option);
    }
  }
  
  // Если нашли опции, берем последнюю (обычно она и есть выбранная)
  if (foundOptions.length > 0) {
    return foundOptions[foundOptions.length - 1];
  }
  
  // Если текст изменился от начального значения, но не содержит известных опций,
  // пробуем извлечь первое значимое слово (не placeholder)
  const words = text.split(/\s+/).filter(word => {
    const wordLower = word.toLowerCase();
    return word.length > 2 && !placeholderValues.some(ph => wordLower.includes(ph));
  });
  
  if (words.length > 0) {
    const candidate = words[0].substring(0, 30);
    if (candidate !== initialValue) {
      return candidate;
    }
  }
  
  // Если ничего не подошло, возвращаем весь текст (но обрезанный)
  return text.length > 50 ? text.substring(0, 50) : text;
}

/**
 * Ждет появления опций в панели dropdown через MutationObserver
 */
TestPlayer.prototype.waitForOptionsInPanel = async function(panel, maxWaitTime = 3000) {
  const self = this;
  return new Promise((resolve) => {
    if (!panel || !(panel instanceof Element)) {
      resolve(false);
      return;
    }
    
    const startTime = Date.now();
    const checkInterval = 200;
    let nextCheckId = null;
    let maxTimeoutId = null;
    let observer = null;
    
    let resolved = false;
    const doResolve = (value) => {
      if (resolved) return;
      resolved = true;
      if (observer) observer.disconnect();
      if (nextCheckId != null) clearTimeout(nextCheckId);
      if (maxTimeoutId != null) clearTimeout(maxTimeoutId);
      resolve(value);
    };
    
    const checkForOptions = () => {
      if (!self.isPlaying) {
        doResolve(false);
        return;
      }
      const hasOptions = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
      if (hasOptions) {
        doResolve(true);
        return;
      }
      
      if (Date.now() - startTime >= maxWaitTime) {
        doResolve(false);
        return;
      }
      
      nextCheckId = setTimeout(checkForOptions, checkInterval);
    };
    
    // Используем MutationObserver для мгновенной реакции
    observer = new MutationObserver(() => {
      if (!self.isPlaying) {
        doResolve(false);
        return;
      }
      const hasOptions = panel.querySelector('.option, .option.cutted-text, .result__content, .result__item, [role="option"], [data-value], li');
      if (hasOptions) {
        doResolve(true);
      }
    });
    
    observer.observe(panel, {
      childList: true,
      subtree: true,
      attributes: true
    });
    
    // Также запускаем периодическую проверку на случай, если MutationObserver пропустит
    checkForOptions();
    
    // Отключаем observer после таймаута
    maxTimeoutId = setTimeout(() => {
      if (Date.now() - startTime >= maxWaitTime) {
        doResolve(false);
      }
    }, maxWaitTime);
  });
}

/**
 * Ждет, пока пользователь выберет значение вручную
 */
TestPlayer.prototype.waitForUserSelection = async function(selectBoxElement, expectedValue) {
  console.log('⏳ Ожидаю ручного выбора значения пользователем...');
  
  const maxWaitTime = 60000; // 60 секунд
  const checkInterval = 500; // Проверяем каждые 500мс
  const startTime = Date.now();
  
  const appSelect = selectBoxElement.closest('app-select');
  const nativeSelect = this.findNativeSelectElement(selectBoxElement);
  
  const readCurrentValue = () => {
    if (nativeSelect) {
      return this.getNativeSelectDisplayValue(nativeSelect) || nativeSelect.value || '';
    }
    if (appSelect) {
      const selectBox = appSelect.querySelector('.select-box, [class*="select-box"]');
      if (selectBox) {
        return selectBox.textContent?.trim() || '';
      }
    }
    return selectBoxElement.textContent?.trim() || '';
  };
  
  let initialValue = readCurrentValue();
  
  console.log(`📝 Начальное значение dropdown: "${initialValue}"`);
  console.log(`🎯 Ожидаемое значение: "${expectedValue}"`);
  console.log(`💡 Принимаю любое изменение значения как выбор пользователя`);
  
  while (Date.now() - startTime < maxWaitTime) {
    await this.delay(checkInterval);
    
    const fullText = readCurrentValue();
    if (fullText && fullText !== initialValue && fullText.toLowerCase() !== 'выберите') {
      // Парсим текст и извлекаем только выбранную опцию
      const selectedOption = this.parseSelectedOptionFromText(fullText, initialValue);
      if (selectedOption && selectedOption !== initialValue) {
        console.log(`✅ Обнаружено изменение значения: "${initialValue}" → "${selectedOption}" (из полного текста: "${fullText.substring(0, 100)}...")`);
        return selectedOption;
      }
    }
    
    const wasExpectedSelected = await this.checkIfValueSelected(selectBoxElement, expectedValue);
    if (wasExpectedSelected) {
      const currentValue = readCurrentValue();
      const parsed = this.parseSelectedOptionFromText(currentValue, initialValue);
      return parsed || currentValue || expectedValue;
    }
  }
  
  console.warn('⚠️ Время ожидания истекло, значение не было выбрано');
  return null;
}

/**
 * Сохраняет обновленный тест
 */
TestPlayer.prototype.saveUpdatedTest = async function() {
  if (!this.currentTest) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_TEST',
      test: this.currentTest
    });
    
    if (response && response.success) {
      console.log('✅ Обновленный тест сохранен');
    } else {
      console.warn('⚠️ Не удалось сохранить обновленный тест');
    }
  } catch (e) {
    console.error('❌ Ошибка при сохранении обновленного теста:', e);
  }
}

TestPlayer.prototype.scheduleTestSave = function(delay = 400) {
  if (this.pendingTestSave) {
    clearTimeout(this.pendingTestSave);
  }
  this.pendingTestSave = setTimeout(() => {
    this.pendingTestSave = null;
    this.saveUpdatedTest();
  }, delay);
}

/**
 * Сравнивает два селектора на равенство
 */
TestPlayer.prototype.areSelectorsEqual = function(selector1, selector2) {
  if (!selector1 || !selector2) return false;
  
  // Сравниваем по selector (CSS селектору)
  if (selector1.selector && selector2.selector) {
    return selector1.selector === selector2.selector;
  }
  
  // Сравниваем по value, если selector нет
  if (selector1.value && selector2.value) {
    const val1 = typeof selector1.value === 'string' ? selector1.value : JSON.stringify(selector1.value);
    const val2 = typeof selector2.value === 'string' ? selector2.value : JSON.stringify(selector2.value);
    return val1 === val2;
  }
  
  return false;
}

/**
 * Удаляет неэффективные шаги из теста
 */
TestPlayer.prototype.removeIneffectiveActions = async function(testId, actionIndices) {
  if (!testId || !actionIndices || actionIndices.length === 0) {
    return { success: false, removed: 0 };
  }

  try {
    console.log(`🧹 Отправляю запрос на удаление ${actionIndices.length} неэффективных шагов...`);
    const timestamp = new Date().toISOString();
    const actionDetails = actionIndices.map(index => ({
      index,
      reason: this.playMode === 'full'
        ? 'Исключено после полного прогона'
        : 'Исключено в оптимизированном режиме',
      source: 'player',
      timestamp
    }));
    
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_INEFFECTIVE_ACTIONS',
      testId: testId,
      actionIndices: actionIndices.sort((a, b) => b - a), // Сортируем по убыванию для правильного удаления
      actionDetails,
      runMode: this.playMode
    });

    if (response && response.success) {
      console.log(`✅ Успешно удалено ${actionIndices.length} неэффективных шагов из теста`);
      console.log(`   Обновленный тест сохранен`);
    } else {
      console.warn(`⚠️ Не удалось удалить неэффективные шаги:`, response?.error || 'Unknown error');
    }
    return response || { success: false, removed: 0 };
  } catch (error) {
    console.error('❌ Ошибка при удалении неэффективных шагов:', error);
    return { success: false, removed: 0, error: error?.message };
  }
}

/**
 */
TestPlayer.prototype.getCandidateElementsForAction = function(action, limit = 15) {
  try {
    const tag = (action.element && (action.element.tag || action.element.tagName)) || '';
    const selector = tag ? tag.toLowerCase() : 'button, input, a, [role="button"], [role="link"], [role="option"], select';
    const nodes = document.querySelectorAll(selector);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < nodes.length && out.length < limit; i++) {
      const el = nodes[i];
      if (!el.id && !el.className && !el.textContent) continue;
      const key = (el.id || '') + '|' + (el.className || '').slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        tag: el.tagName ? el.tagName.toLowerCase() : '',
        id: el.id || undefined,
        className: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 100),
        textSlice: (el.textContent || '').trim().slice(0, 80)
      });
    }
    return out;
  } catch (e) {
    return [];
  }
}

/**
 * Обрабатывает API запрос
 */
})();
