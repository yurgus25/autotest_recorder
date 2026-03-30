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
      if (nativeSelect) {
        const res = await this.selectNativeOption(nativeSelect, val);
        if (!res.success) throw new Error(`Не удалось выбрать опцию "${val}"`);
      } else {
        // Универсальный поиск контейнера dropdown (не только app-select)
        const container = targetEl.closest('[class*="select"], [class*="dropdown"], [class*="combo"]') || 
                         targetEl.closest('[role="combobox"], [role="listbox"]') ||
                         targetEl.parentElement;
        
        this._dispatchClick(targetEl);
        await this.delay(400);
        let res = await this.autoSelectDropdownValue(targetEl, val);
        if (!res?.success && container) {
          console.log(`🔄 Fallback 1: analysis fill-single-dropdown (MAIN world) для "${val}"`);
          res = await this.fillDropdownViaAnalysis(container, val);
        }
        if (!res?.success && container) {
          console.log(`🔄 Fallback 2: логика analysis-fill-fields для "${val}"`);
          res = await this.selectDropdownValueViaFillFieldsStyle(container, val);
        }
        if (!res?.success && container) {
          await this.delay(1200);
          res = await this.fillDropdownViaAnalysis(container, val);
        }
        if (!res?.success && container) {
          await this.delay(600);
          res = await this.selectDropdownValueViaFillFieldsStyle(container, val);
        }
        if (!res?.success) {
          // Последняя попытка: универсальный поиск опций
          console.log(`🔄 Fallback 3: универсальный поиск опций для "${val}"`);
          res = await this.selectDropdownUniversal(targetEl, val);
        }
        if (!res?.success) throw new Error(`Не удалось выбрать опцию "${val}" в dropdown. Попробуйте указать более точный селектор или используйте adaptive режим.`);
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
TestPlayer.prototype.handleDropdownDatalistCombobox = async function(inputElement, searchText, subtype) {
  if (!inputElement || inputElement.tagName !== 'INPUT') {
    throw new Error('dropdown-datalist/combobox требует input элемент');
  }
  inputElement.focus();
  await this.delay(50);
  inputElement.value = '';
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  // Для #account и type="search": посимвольный ввод для триггера async-поиска
  if (inputElement.id === 'account' || inputElement.type === 'search') {
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
  const collectOptions = () => {
    const overlayRoot = document.querySelector('.cdk-overlay-container');
    const roots = overlayRoot ? [overlayRoot, document.body] : [document.body];
    const opts = [];
    for (const root of roots) {
      for (const pane of root.querySelectorAll(panelSelectors)) {
        if (!isVisible(pane)) continue;
        for (const o of pane.querySelectorAll(optionSelectors)) {
          const txt = (o.textContent || '').trim();
          if (txt && isVisible(o) && (o.offsetParent !== null || o.offsetHeight > 0)) opts.push(o);
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
  const match = options.find(o =>
    (o.textContent || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (o.textContent || '').toLowerCase().startsWith(searchText.toLowerCase())
  );
  if (match) {
    match.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    await this.delay(100);
    match.click();
    await this.delay(150);
    console.log(`✅ dropdown-combobox: выбрано по тексту "${searchText}"`);
    return;
  }

  // Fallback: ArrowDown + Enter — выбрать первую опцию (для type-ahead, когда точное совпадение не найдено)
  if (options.length > 0 && (inputElement.id === 'account' || inputElement.type === 'search')) {
    const first = options[0];
    first.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    await this.delay(100);
    first.click();
    await this.delay(150);
    console.log(`✅ dropdown-combobox: выбрана первая опция (fallback)`);
    return;
  }

  // Fallback: симуляция клавиш ArrowDown + Enter для выбора из списка
  if (options.length > 0) {
    const keyOpts = { bubbles: true, cancelable: true, view: window };
    inputElement.focus();
    await this.delay(100);
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
    await this.delay(150);
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { ...keyOpts, key: 'Enter', code: 'Enter', keyCode: 13 }));
    await this.delay(150);
    console.log(`✅ dropdown-combobox: Enter по первой опции`);
    return;
  }

  // Значение уже введено — для combobox с type-ahead этого может быть достаточно
  console.log(`✅ dropdown-${subtype}: введён текст "${searchText}"`);
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
  
  // Ищем скрытый input
  const hiddenInput = appSelect.querySelector('input[type="hidden"]');
  if (hiddenInput && hiddenInput.value) {
    return hiddenInput.value;
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
      
      // Исключаем плейсхолдеры
      const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
      const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
      if (text && !isPlaceholder && text.length > 0) {
        return text;
      }
    }
  }
  
  // Ищем элемент с атрибутом value
  const valueElement = appSelect.querySelector('[value]:not([value=""])');
  if (valueElement && valueElement.value) {
    return valueElement.value;
  }
  
  // Ищем через data-value
  const dataValueElement = appSelect.querySelector('[data-value]');
  if (dataValueElement && dataValueElement.dataset.value) {
    return dataValueElement.dataset.value;
  }
  
  // Ищем через ng-reflect-value (Angular)
  const ngValueElement = appSelect.querySelector('[ng-reflect-value]');
  if (ngValueElement && ngValueElement.getAttribute('ng-reflect-value')) {
    return ngValueElement.getAttribute('ng-reflect-value');
  }
  
  // Ищем в дочерних элементах с текстом
  const allChildren = Array.from(appSelect.querySelectorAll('*'));
  for (const child of allChildren) {
    const text = child.textContent?.trim() || child.innerText?.trim() || '';
    const placeholderTexts = ['выберите', 'select', 'choose', 'placeholder'];
    const isPlaceholder = placeholderTexts.some(ph => text.toLowerCase().includes(ph.toLowerCase()));
    if (text && !isPlaceholder && text.length > 0 && text.length < 100) {
      // Проверяем, что это не плейсхолдер и текст не слишком длинный
      return text;
    }
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
