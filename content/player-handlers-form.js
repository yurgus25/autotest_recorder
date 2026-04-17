/**
 * AutoTest Recorder - Player Module
 * Form/input, navigation, assert, loop, condition, try-catch, javascript, screenshot
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-form
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-form.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleInput = async function(action) {
  // Предотвращаем рекурсию из retryFillWithAlternativesOrThrow
  if (this._fillRetryInProgress) {
    return this._handleInputDirect(action);
  }

  const selectorInfo = this.formatSelector(action.selector);
  // Для dropdown: displayValue — видимый текст опции, value может быть ID; предпочитаем displayValue для универсальности
  const rawValue = (action.dropdownAutoFilled || action.isDropdownSelection ? (action.displayValue ?? action.value) : action.value);
  const processedValue = await this.processVariables(rawValue);
  console.log(`📝 Ввод текста: "${processedValue}" в ${selectorInfo}`);

  // Если ввод идёт за кликом — сначала ищем поле в раскрывшемся контейнере (overlay/panel)
  let findResult = null;
  if (action.inputAfterClick && this.findElementInRevealedContainers) {
    findResult = this.findElementInRevealedContainers(action.selector);
  }
  if (!findResult) {
    findResult = await this.findElementWithRetry(action.selector, 5, 300);
  }
  let element = findResult?.element;
  const usedSelector = findResult?.usedSelector || selectorInfo;

  if (this.currentSelectorCallback) {
    this.currentSelectorCallback(usedSelector);
  }

  if (!element) {
    element = await this.tryAlternativeSelectors(action);
    if (!element) {
      throw new Error(`Элемент не найден: ${selectorInfo}`);
    }
  }

  // Защита: некоторые "input" шаги в старых тестах фактически являются нажатием кнопки
  // (например, "сохранить"), и не должны уходить в dropdown-анализ.
  const isButtonLikeElement = (el) => {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'app-header-button') return true;
    const role = String(el.getAttribute?.('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'menuitem') return true;
    const elementIdAttr = String(el.getAttribute?.('elementid') || '').toLowerCase();
    if (/save-button|submit|create|apply/.test(elementIdAttr)) return true;
    const cls = String(el.className || '').toLowerCase();
    if (/(^|[\s_-])(big-button|btn|button|menu__subitem)([\s_-]|$)/i.test(cls)) return true;
    if (el.closest?.('button, a, [role="button"], [role="menuitem"]')) return true;
    return false;
  };
  const isInputLikeElement = (el) => {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    const role = String(el.getAttribute?.('role') || '').toLowerCase();
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
  };
  const isButtonIntentValue = (v) => {
    const txt = String(v || '').trim().toLowerCase();
    if (!txt) return false;
    return /(сохран|save|submit|отправ|create|созда|добав|apply|примен|ok|да)/i.test(txt);
  };
  const selectorText = String(this.formatSelector(action.selector) || '').toLowerCase();
  const fieldLabelText = String(action?.fieldLabel || '').toLowerCase();
  const buttonIntentFromContext = /app-header-button|save-button|сохран|save|submit|apply/.test(selectorText) ||
    /сохран|save|submit|apply/.test(fieldLabelText);

  if (
    !isInputLikeElement(element) &&
    isButtonIntentValue(processedValue) &&
    (isButtonLikeElement(element) || buttonIntentFromContext)
  ) {
    console.log(`🖱️ [Input->ClickGuard] Шаг input распознан как кнопка "${processedValue}", выполняю click вместо dropdown/input`);
    await this.handleClick({
      ...action,
      type: 'click',
      value: null
    });
    return;
  }

  if (this.isDropdownElement(element)) {
    const refinedElement = this.resolveDropdownElementByFieldLabel(action, element);
    if (refinedElement && refinedElement !== element) {
      element = refinedElement;
    }

    const preferredTrigger = this.resolvePreferredDropdownTrigger(action, element);
    if (preferredTrigger && preferredTrigger !== element) {
      element = preferredTrigger;
    }
  }

  if (this.shouldSkipPlaybackForDomHiddenTarget?.(element)) {
    console.log('⏭️ [Player] Ввод пропущен: целевой элемент не виден (скрыт в DOM); в optimized-режиме такие поля не заполняются');
    return;
  }

  // Проверяем, нужно ли пропустить (уже заполнено)
  if (this.skipNextInput && this.skipNextInputValue === processedValue) {
    this.skipNextInput = false;
    this.skipNextInputValue = null;
    console.log('⏭️ Ввод пропущен (значение уже установлено)');
    return;
  }

  // Прокручиваем
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await this.delay(100);
  this.highlightElement(element);

  // Проверяем на файловый input
  if (element.type === 'file') {
    console.log('📁 Обнаружен файловый input');
    await this.setFileToInput(element, processedValue);
    return;
  }

  // dropdown-datalist и dropdown-combobox: ввод текста + выбор из списка
  if (action.subtype === 'dropdown-datalist' || action.subtype === 'dropdown-combobox') {
    const searchText = await this.processVariables(action.searchText || action.optionText || action.value || '');
    if (!searchText) throw new Error('Для dropdown-datalist/combobox не указан текст поиска (searchText/optionText)');
    if (element.tagName === 'INPUT') {
      await this.handleDropdownDatalistCombobox(element, searchText, action.subtype, action);
    } else {
      // Для записей, где selector указывает на root dropdown (app-select/div), а не на input,
      // используем dropdown-select pipeline вместо input-only combobox handler.
      await this.handleDropdownAction({
        ...action,
        type: 'click',
        subtype: 'dropdown-select',
        value: searchText,
        optionText: action.optionText || searchText
      }, element);
    }
    return;
  }

  // Выбор из выпадающего списка при записи: isDropdownSelection / dropdownAutoFilled.
  // isDropdownElement() для <input> всегда false — иначе шаг «ввод» только пишет текст в поле, не кликает опцию (GWT, кастомные combobox без role).
  if (element.tagName === 'INPUT' && (action.isDropdownSelection || action.dropdownAutoFilled)) {
    const searchText = this.resolveRecordedOptionSearchText
      ? this.resolveRecordedOptionSearchText(action, processedValue)
      : String(processedValue || '').trim();
    if (searchText) {
      try {
        await this.handleDropdownDatalistCombobox(element, searchText, 'dropdown-combobox', action);
        console.log(`✅ Ввод из dropdown (флаги записи): "${searchText}"`);
        const optimizedDelay = await this.getOptimizedDelay('input', 200);
        await this.delay(optimizedDelay);
        return;
      } catch (e) {
        console.warn('⚠️ Выбор из списка по флагам записи не удался, пробую robust dropdown-pipeline:', e.message);
        try {
          await this.handleDropdownAction({
            ...action,
            subtype: 'dropdown-select',
            value: searchText,
            optionText: searchText
          }, element);
          const optimizedDelay = await this.getOptimizedDelay('input', 200);
          await this.delay(optimizedDelay);
          return;
        } catch (dropdownErr) {
          // Для явно записанного dropdown-шага не делаем fallback на обычный текстовый ввод.
          throw new Error(`Не удалось выбрать dropdown-значение "${searchText}": ${dropdownErr?.message || dropdownErr}`);
        }
      }
    }
  }

  // input с role="combobox" или id="account" (поле ФИО/сотрудник): ввод + выбор из выпадающего списка
  const isComboboxInput = element.tagName === 'INPUT' &&
    this.shouldTreatInputAsDropdown?.(action, element, processedValue) &&
    (
      element.getAttribute('role') === 'combobox' ||
      element.getAttribute('aria-haspopup') === 'listbox' ||
      element.id === 'account' ||
      element.id === 'SELECTED_ACCOUNT' ||
      !!element.closest?.('.ant-select-show-search, .ant-select.ant-select-show-search') ||
      (element.type === 'search' && /сотрудник|account|фio|fio|user|пользователь/i.test(element.name || element.placeholder || element.id || ''))
    );
  if (isComboboxInput) {
    const searchText = this.resolveRecordedOptionSearchText
      ? this.resolveRecordedOptionSearchText(action, processedValue)
      : String(processedValue || '').trim();
    if (searchText) {
      try {
        await this.handleDropdownDatalistCombobox(element, searchText, 'dropdown-combobox', action);
        console.log(`✅ Combobox (ФИО/сотрудник): введено "${searchText}"`);
        return;
      } catch (e) {
        console.warn('⚠️ Combobox не сработал, пробую dropdown-select pipeline:', e.message);
        try {
          await this.handleDropdownAction({
            ...action,
            subtype: action.subtype || 'dropdown-select',
            value: searchText,
            optionText: action.optionText || searchText
          }, element);
          return;
        } catch (dropdownErr) {
          const dropdownIntent = !!(action.isDropdownSelection || action.dropdownAutoFilled || String(action.subtype || '').startsWith('dropdown-'));
          if (dropdownIntent) {
            throw new Error(`Combobox dropdown выбор не выполнен: ${dropdownErr?.message || dropdownErr}`);
          }
          console.warn('⚠️ Combobox dropdown pipeline не сработал, fallback к обычному вводу:', dropdownErr?.message || dropdownErr);
        }
      }
    }
  }

  // Проверяем, является ли это dropdown
  const shouldUseDropdownPipeline = this.shouldTreatInputAsDropdown?.(action, element, processedValue) && this.isDropdownElement(element);
  if (shouldUseDropdownPipeline) {
    console.log(`🔽 Обнаружен dropdown при вводе, пробую выбрать значение: "${processedValue}"`);
    if (this._isLikelyCompositeRecordedDropdownValue?.(element, processedValue)) {
      console.warn(`⚠️ [Input] Пропускаю составное значение dropdown из записи: "${processedValue}"`);
      return;
    }
    // Если ввод идёт сразу после клика — сначала пробуем выбрать опцию в уже открытой панели (не открывая другой dropdown)
    if (action.inputAfterClick && this.trySelectOptionInRevealedPanels) {
      console.log('🔍 [Input] inputAfterClick=true: ищу опцию в уже открытой панели (без повторного открытия dropdown)');
      const revealed = await this.trySelectOptionInRevealedPanels(processedValue, element);
      if (revealed?.success) return;
      console.log('⚠️ [Input] В открытой панели опция не найдена, переходим к открытию dropdown');
    } else if (this.trySelectOptionInRevealedPanels) {
      console.log('⚠️ [Input] inputAfterClick не установлен — пропускаем поиск в открытой панели, открываю dropdown');
    }
    try {
      const result = await this.selectDropdownAdaptiveValue(element, processedValue, action);
      if (!this.isPlaying) return;
      if (result && result.success) {
        const hasStrongBinding = !!this._getDropdownElementId?.(action, element);
        const isComboboxSubtype = String(action?.subtype || '').toLowerCase() === 'dropdown-combobox';
        const isAutocompleteElement = !!(
          element?.closest?.('app-autocomplete, [class*="autocomplete"], [class*="suggest"]') ||
          String(element?.tagName || '').toLowerCase() === 'app-autocomplete'
        );
        // Для autocomplete-комбобоксов строгая перепроверка после успешного adaptive выбора
        // часто даёт ложный негатив из-за расширенного текста ("ФИО — Организация").
        if (hasStrongBinding && !isComboboxSubtype && !isAutocompleteElement && typeof this._isDropdownSelectionCommitted === 'function') {
          const strictConfirmed = await this._isDropdownSelectionCommitted(element, processedValue, { strict: true });
          if (!strictConfirmed) {
            throw new Error(`Строгая проверка выбора не пройдена для "${processedValue}"`);
          }
        }
        console.log(`✅ Значение "${processedValue}" выбрано в dropdown`);
        return;
      }
    } catch (e) {
      console.warn('⚠️ Fallback к обычному вводу');
    }
    // Для кастомного dropdown нельзя переходить к _performInput:
    // это приводит к записи текста в соседние поля формы.
    throw new Error(`Не удалось выбрать значение "${processedValue}" в dropdown`);
  }

  // Выполняем ввод текста
  await this._performInput(element, processedValue);

  // Верифицируем заполнение
  try {
    await this.retryFillWithAlternativesOrThrow(action, processedValue, 'input', element);
  } catch (e) {
    // Если верификация не прошла, но ввод был - логируем предупреждение
    console.warn(`⚠️ Верификация ввода не прошла: ${e.message}`);
  }

  const optimizedDelay = await this.getOptimizedDelay('input', 200);
  await this.delay(optimizedDelay);
  console.log(`✅ Ввод выполнен: "${processedValue}"`);
}

/**
 * Прямой ввод текста без верификации (для retry)
 */
TestPlayer.prototype._handleInputDirect = async function(action) {
  const processedValue = await this.processVariables(action.value);
  const findResult = await this.findElementWithRetry(action.selector, 3, 300);
  const element = findResult?.element;
  if (!element) {
    throw new Error(`Элемент не найден: ${this.formatSelector(action.selector)}`);
  }
  if (this.shouldSkipPlaybackForDomHiddenTarget?.(element)) {
    console.log('⏭️ [Player] Прямой ввод пропущен: элемент не виден (скрыт в DOM)');
    return;
  }
  await this._performInput(element, processedValue);
}

/**
 * Непосредственный ввод текста в элемент
 */
TestPlayer.prototype._performInput = async function(element, value) {
  const win = element.ownerDocument?.defaultView || window;
  try {
    if (typeof element.focus === 'function') element.focus();
  } catch (e) {
    if (!String(e?.message || '').includes('Illegal invocation')) console.warn('⚠️ _performInput focus:', e?.message);
  }
  await this.delay(50);

  const setValue = () => {
    try {
      if (this.setNativeInputValue) {
        this.setNativeInputValue(element, '');
        this.setNativeInputValue(element, value);
        return;
      }
    } catch (e) {
      if (!String(e?.message || '').includes('Illegal invocation')) console.warn('⚠️ setNativeInputValue:', e?.message);
    }
    try {
      element.value = '';
      element.value = value;
    } catch (e2) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype, 'value')?.set ||
                                     Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        try {
          nativeInputValueSetter.call(element, '');
          nativeInputValueSetter.call(element, value);
        } catch (e3) {
          throw e2;
        }
      } else {
        throw e2;
      }
    }
  };

  if (this.seleniumUtils) {
    try {
      this.seleniumUtils.setNativeValue(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true, view: win }));
      element.dispatchEvent(new Event('change', { bubbles: true, view: win }));
      element.dispatchEvent(new Event('blur', { bubbles: true, view: win }));
      return;
    } catch (e) {
      // Fallback
    }
  }

  setValue();

  try {
    element.dispatchEvent(new Event('input', { bubbles: true, view: win }));
    element.dispatchEvent(new Event('change', { bubbles: true, view: win }));
    element.dispatchEvent(new Event('blur', { bubbles: true, view: win }));
  } catch (e) {
    if (!String(e?.message || '').includes('Illegal invocation')) console.warn('⚠️ _performInput dispatchEvent:', e?.message);
  }
}

/**
 * Нормализует URL для сравнения «та же страница»: origin + pathname без хвостового слэша, без hash.
 */
TestPlayer.prototype._normalizeUrlForSamePage = function(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url, window.location.origin);
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return u.origin + path;
  } catch (e) {
    return url;
  }
}

/**
 * Обработчик навигации: переход по ссылке или мгновенное завершение, если уже на целевой странице.
 */
TestPlayer.prototype.handleNavigation = async function(action) {
  const subtype = action.subtype || '';
  
  // ИСПРАВЛЕНИЕ #15: Сохраняем состояние перед операциями которые перезагружают страницу
  // Важно передать nextUrl и nextActionIndex, иначе при resume выполнится тот же шаг снова (бесконечный цикл)
  const nextActionIndex = this.currentActionIndex + 1;
  if (subtype === 'nav-refresh') {
    const currentUrl = window.location.href;
    console.log('🌐 Навигация: обновление текущей вкладки, URL:', currentUrl);
    await this.savePlaybackState(currentUrl, nextActionIndex);
    try {
      chrome.runtime.sendMessage({
        type: 'REFRESH_TAB',
        tabId: this.tabId,
        url: currentUrl
      }).catch(() => window.location.reload());
    } catch (e) {
      window.location.reload();
    }
    return;
  }
  if (subtype === 'nav-back') {
    console.log('🌐 Навигация: назад по истории');
    // URL после history.back() неизвестен — используем маркер для безусловного resume
    await this.savePlaybackState('__AUTO_NAV__', nextActionIndex);
    window.history.back();
    return;
  }
  if (subtype === 'nav-forward') {
    console.log('🌐 Навигация: вперед по истории');
    await this.savePlaybackState('__AUTO_NAV__', nextActionIndex);
    window.history.forward();
    return;
  }
  if (subtype === 'nav-get-url') {
    const varName = (action.variableName || action.value || '').trim();
    const urlPart = (action.urlPart || 'full').toLowerCase();
    let value = window.location.href;
    try {
      const u = new URL(value);
      if (urlPart === 'href' || urlPart === 'full') value = u.href;
      else if (urlPart === 'origin') value = u.origin;
      else if (urlPart === 'pathname') value = u.pathname;
      else if (urlPart === 'path') value = u.pathname.replace(/^\//, '');
      else if (urlPart === 'search') value = u.search;
      else if (urlPart === 'hash') value = u.hash;
      else if (urlPart === 'hostname') value = u.hostname;
      else if (urlPart === 'host') value = u.host;
      else if (urlPart === 'protocol') value = u.protocol;
    } catch (e) {
      console.warn('⚠️ [nav-get-url] Ошибка парсинга URL:', e?.message);
    }
    if (varName) {
      this.userVariables[varName] = value;
      console.log(`🌐 Навигация: URL сохранён в переменную "${varName}" (${urlPart}): ${value.substring(0, 80)}${value.length > 80 ? '...' : ''}`);
    } else {
      console.log(`🌐 Навигация: URL получен (${urlPart}), отображение в шаге: ${value.substring(0, 80)}${value.length > 80 ? '...' : ''}`);
      try {
        await chrome.runtime.sendMessage({
          type: 'PATCH_TEST_ACTION',
          testId: this.currentTest?.id,
          actionIndex: this.currentActionIndex,
          patch: { urlResult: value }
        }).catch(() => {});
      } catch (e) {}
    }
    return;
  }
  if (subtype === 'new-tab') {
    const target = action.value || action.url || window.location.href;
    const targetUrl = await this.processVariables(target);
    
    // ИСПРАВЛЕНИЕ #17: Передаём управление тестом в новую вкладку (по умолчанию — да, чтобы избежать цикла при воспроизведении)
    const shouldContinueInNewTab = action.continueTest !== false && this.isPlaying;
    if (shouldContinueInNewTab) {
      try {
        const testState = {
          testId: this.currentTest?.id,
          testName: this.currentTest?.name,
          actions: this.currentTest?.actions,
          currentActionIndex: this.currentActionIndex + 1, // Следующее действие
          userVariables: this.userVariables,
          isPlaying: true
        };
        
        const response = await chrome.runtime.sendMessage({
          type: 'NEW_TAB_WITH_TEST',
          url: targetUrl,
          testState
        });
        
        if (response?.success) {
          console.log(`🌐 Навигация: открыта новая вкладка ${targetUrl} с передачей теста`);
          // Останавливаем воспроизведение в текущей вкладке
          this.isPlaying = false;
          return;
        }
      } catch (e) {
        console.warn(`⚠️ Не удалось передать тест в новую вкладку: ${e.message}`);
      }
    }
    
    // Fallback: просто открываем вкладку без передачи теста
    window.open(targetUrl, '_blank', 'noopener');
    console.log(`🌐 Навигация: открыта новая вкладка ${targetUrl}`);
    return;
  }
  if (subtype === 'switch-tab') {
    // v0.9.6.1: Переключение на другую вкладку (по индексу, URL или заголовку)
    try {
      const switchTab = action.switchTab || {};
      const response = await chrome.runtime.sendMessage({
        type: 'SWITCH_TAB',
        switchTab: {
          mode: switchTab.mode || 'index',
          tabIndex: switchTab.tabIndex ?? 0,
          urlPattern: switchTab.urlPattern || '',
          titlePattern: switchTab.titlePattern || ''
        }
      });
      if (response?.success) {
        console.log(`🌐 Навигация: переключено на вкладку ${response.tabId}`);
      } else {
        throw new Error(response?.error || 'Не удалось переключить вкладку');
      }
    } catch (e) {
      throw new Error(`Ошибка переключения вкладки: ${e.message}`);
    }
    return;
  }
  if (subtype === 'close-tab') {
    // ИСПРАВЛЕНИЕ #16: Закрываем вкладку через background script
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLOSE_TAB'
      });
      if (response?.success) {
        console.log('🌐 Навигация: вкладка закрыта');
      } else {
        console.warn('⚠️ Не удалось закрыть вкладку через background, пробуем window.close()');
        window.close();
      }
    } catch (e) {
      console.warn(`⚠️ Ошибка закрытия вкладки: ${e.message}`);
      window.close();
    }
    return;
  }

  let url = action.value || action.url;
  if (!url) {
    throw new Error('URL для навигации не указан');
  }

  // Подставляем переменные в URL
  url = await this.processVariables(url);
  url = this.normalizeUrlForNavigation(url);
  console.log(`🌐 Навигация: ${url}`);

  const currentNorm = this._normalizeUrlForSamePage(window.location.href);
  const targetNorm = this._normalizeUrlForSamePage(url);
  if (currentNorm && targetNorm && currentNorm === targetNorm) {
    console.log('✅ Уже на целевой странице, переход не требуется');
    return;
  }

  const actionIndex = this.currentTest?.actions?.indexOf(action);
  await this.navigateToUrl(url, actionIndex !== -1 ? actionIndex : this.currentActionIndex);
}

/**
 * Обработчик assert (проверка утверждения)
 */
TestPlayer.prototype.handleAssert = async function(action) {
  const subtype = action.subtype || '';
  console.log(`✓ Проверка утверждения: ${subtype || action.assertion || action.value || 'N/A'}`);

  if (subtype === 'assert-visual-regression') {
    return this.handleVisualRegressionAssert(action);
  }

  // Для assert-not-exists селектор НЕ обязателен должен существовать
  if (subtype === 'assert-not-exists') {
    if (!action.selector) {
      throw new Error('Для assert-not-exists требуется селектор');
    }
    const findResult = await this.findElementWithRetry(action.selector, 1, 100);
    const element = findResult?.element;
    if (element) {
      throw new Error(`Проверка не прошла: элемент ${this.formatSelector(action.selector)} существует, ожидалось отсутствие`);
    }
    console.log(`✅ Проверка прошла: элемент не существует`);
    return;
  }

  // Для остальных проверок элемент должен существовать
  if (!action.selector) {
    throw new Error('Для assertion требуется селектор');
  }
  const findResult = await this.findElementWithRetry(action.selector, 3, 500);
  const element = findResult?.element;

  // assert-exists проверяет только наличие в DOM
  if (subtype === 'assert-exists') {
    if (!element) {
      throw new Error(`Проверка не прошла: элемент ${this.formatSelector(action.selector)} не существует`);
    }
    console.log(`✅ Проверка прошла: элемент существует`);
    return;
  }

  // Для остальных проверок выбрасываем ошибку если элемент не найден
  if (!element) {
    throw new Error(`Элемент для проверки не найден: ${this.formatSelector(action.selector)}`);
  }

  if (subtype === 'assert-visible') {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const isVisible = rect.width > 0 && rect.height > 0 && 
                     computedStyle.visibility !== 'hidden' && 
                     computedStyle.display !== 'none' &&
                     parseFloat(computedStyle.opacity) > 0;
    if (!isVisible) {
      throw new Error(`Проверка не прошла: элемент ${this.formatSelector(action.selector)} не видим`);
    }
    console.log(`✅ Проверка прошла: элемент видим`);
    return;
  }

  if (subtype === 'assert-hidden') {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const isHidden = rect.width === 0 || rect.height === 0 || 
                    computedStyle.visibility === 'hidden' || 
                    computedStyle.display === 'none' ||
                    parseFloat(computedStyle.opacity) === 0;
    if (!isHidden) {
      throw new Error(`Проверка не прошла: элемент ${this.formatSelector(action.selector)} видим, ожидалось скрытие`);
    }
    console.log(`✅ Проверка прошла: элемент скрыт`);
    return;
  }

  if (subtype === 'assert-count') {
    const expectedCount = parseInt(action.expectedCount, 10);
    if (!Number.isFinite(expectedCount)) {
      throw new Error('Для assert-count не задан expectedCount');
    }
    const actualCount = this.countMatchingElements(action.selector);
    if (actualCount !== expectedCount) {
      throw new Error(`Проверка не прошла: ожидалось количество ${expectedCount}, получено ${actualCount}`);
    }
    console.log(`✅ Проверка прошла: count=${actualCount}`);
    return;
  }

  if (subtype === 'assert-disabled') {
    const expectedState = (action.expectedState || 'enabled').toLowerCase();
    const isDisabled = !!(element.disabled || element.getAttribute('aria-disabled') === 'true');
    const mustBeDisabled = expectedState === 'disabled';
    if (isDisabled !== mustBeDisabled) {
      throw new Error(`Проверка не прошла: ожидалось состояние "${expectedState}"`);
    }
    console.log(`✅ Проверка прошла: состояние "${expectedState}"`);
    return;
  }

  if (subtype === 'assert-contains') {
    const rawExpectedText = action.expectedText ?? action.optionText ?? action.value;
    const expectedText = await this.processVariables(String(rawExpectedText || '').trim());
    const actualText = String(element.value || element.textContent || '').trim();
    if (!expectedText) {
      throw new Error('Для assert-contains не задан expectedText');
    }
    if (!actualText.includes(expectedText)) {
      throw new Error(`Проверка не прошла: "${actualText}" не содержит "${expectedText}"`);
    }
    console.log(`✅ Проверка прошла: текст содержит "${expectedText}"`);
    return;
  }

  if (subtype === 'assert-multiselect') {
    const expectedValues = Array.isArray(action.expectedValues) ? action.expectedValues : [];
    if (expectedValues.length === 0) {
      throw new Error('Для assert-multiselect не задан expectedValues');
    }
    const actualText = String(element.value || element.textContent || '').toLowerCase();
    const missed = [];
    for (const rawExpected of expectedValues) {
      const expected = String(await this.processVariables(String(rawExpected))).trim().toLowerCase();
      if (expected && !actualText.includes(expected)) {
        missed.push(rawExpected);
      }
    }
    if (missed.length > 0) {
      throw new Error(`Проверка не прошла: не найдены значения ${missed.join(', ')}`);
    }
    console.log(`✅ Проверка прошла: найдены все значения (${expectedValues.length})`);
    return;
  }

  const rawExpectedValue = action.expectedValue ?? action.value;
  if (rawExpectedValue !== undefined) {
    const expectedValue = await this.processVariables(String(rawExpectedValue));
    const actualValue = String(element.value || element.textContent?.trim() || '');
    if (actualValue !== expectedValue) {
      throw new Error(`Проверка не прошла: ожидалось "${expectedValue}", получено "${actualValue}"`);
    }
    console.log(`✅ Проверка прошла: "${actualValue}" === "${expectedValue}"`);
  } else {
    console.log('✅ Элемент найден');
  }
}

/**
 * Визуальная регрессия (lite): эталон в test.extensionAssets.visualRegressionBaselines (перенос с JSON теста);
 * legacy fallback — chrome.storage visualRegressionBaselines.
 */
TestPlayer.prototype.handleVisualRegressionAssert = async function(action) {
  const scope = String(action.visualRegressionScope || 'element').toLowerCase();
  const maxDiffPercent = typeof action.maxDiffPercent === 'number' && !Number.isNaN(action.maxDiffPercent)
    ? action.maxDiffPercent
    : parseFloat(action.maxDiffPercent) || 0.5;
  const pixelThreshold = typeof action.visualRegressionPixelThreshold === 'number' && !Number.isNaN(action.visualRegressionPixelThreshold)
    ? action.visualRegressionPixelThreshold
    : parseFloat(action.visualRegressionPixelThreshold) || 0.12;
  const updateBaseline = action.visualRegressionUpdateBaseline === true;

  if (scope === 'element' && !action.selector) {
    throw new Error('Visual regression: укажите селектор элемента или выберите область «viewport»');
  }

  const pseudoAction = scope === 'viewport'
    ? { subtype: 'page-screenshot', screenshotCaptureType: 'full' }
    : { subtype: 'visual-screenshot', screenshotCaptureType: 'element', selector: action.selector };

  const current = await this.handleScreenshot(pseudoAction);
  if (!current) {
    throw new Error('Visual regression: не удалось получить снимок');
  }

  const testId = String(this.currentTest?.id || 'unknown');
  const regKey = action.visualRegressionKey || `${testId}_${this.currentActionIndex}`;
  const storageKey = 'visualRegressionBaselines';

  const baselinesFromTest = this.currentTest?.extensionAssets?.visualRegressionBaselines;
  let legacyMap = {};
  try {
    const data = await chrome.storage.local.get(storageKey);
    if (data[storageKey] && typeof data[storageKey] === 'object') {
      legacyMap = { ...data[storageKey] };
    }
  } catch (e) {
    console.warn('Visual regression: storage read failed', e);
  }

  const baselineFromJson = baselinesFromTest && typeof baselinesFromTest === 'object' ? baselinesFromTest[regKey] : null;
  const baseline = baselineFromJson || legacyMap[regKey] || null;

  const persistBaselineToTest = async (dataUrl) => {
    if (!this.currentTest || !this.currentTest.id) return;
    this.currentTest.extensionAssets = this.currentTest.extensionAssets || {};
    this.currentTest.extensionAssets.visualRegressionBaselines = {
      ...(this.currentTest.extensionAssets.visualRegressionBaselines || {}),
      [regKey]: dataUrl
    };
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'MERGE_TEST_EXTENSION_ASSETS',
        testId: String(this.currentTest.id),
        assets: { visualRegressionBaselines: { [regKey]: dataUrl } }
      });
      if (!res || !res.success) {
        console.warn('Visual regression: MERGE_TEST_EXTENSION_ASSETS', res?.error || 'failed');
      }
    } catch (err) {
      console.warn('Visual regression: merge assets message failed', err);
    }
    if (legacyMap[regKey]) {
      delete legacyMap[regKey];
      try {
        await chrome.storage.local.set({ [storageKey]: legacyMap });
      } catch (e3) { /* ignore */ }
    }
  };

  if (!baseline || updateBaseline) {
    await persistBaselineToTest(current);
    console.log(updateBaseline ? '✅ Visual regression: эталон обновлён (в JSON теста)' : '✅ Visual regression: сохранён эталон в JSON теста');
    return;
  }

  const Comparer = window.ScreenshotComparer;
  if (!Comparer) {
    throw new Error('Visual regression: модуль ScreenshotComparer не загружен');
  }
  const comparer = new Comparer();
  const result = await comparer.compareScreenshots(baseline, current, { threshold: pixelThreshold, highlightDifferences: true });
  if (result.error) {
    throw new Error('Visual regression: ошибка сравнения: ' + result.error);
  }
  const diffPct = typeof result.diffPercentage === 'number' ? result.diffPercentage : 0;
  if (diffPct > maxDiffPercent) {
    throw new Error(`Visual regression: отличие ${diffPct.toFixed(2)}% превышает порог ${maxDiffPercent}%`);
  }
  console.log(`✅ Visual regression: отличие ${diffPct.toFixed(2)}% в пределах порога`);
}

/**
 * Обработчик циклов
  */
TestPlayer.prototype.handleLoop = async function(action) {
  const loopType = action.loop?.type || action.loopType || 'count';
  const loopActions = action.actions || [];
  
  // ИСПРАВЛЕНИЕ #10: Поддержка while-цикла
  if (loopType === 'while' || action.loop?.condition || action.condition) {
    const condition = action.loop?.condition || action.condition;
    const maxIterations = action.loop?.maxIterations || action.maxIterations || 100; // Защита от бесконечного цикла
    console.log(`🔄 While-цикл: условие "${condition}", максимум ${maxIterations} итераций`);
    
    let iter = 0;
    while (iter < maxIterations) {
      if (!this.isPlaying) return;
      
      // Проверяем условие
      const conditionMet = await this.evaluateCondition(condition, action);
      if (!conditionMet) {
        console.log(`   🔄 While-условие FALSE на итерации ${iter}, выход из цикла`);
        break;
      }
      
      console.log(`   🔄 While-итерация ${iter + 1}`);
      for (const subAction of loopActions) {
        if (!this.isPlaying) return;
        await this.executeAction(subAction);
      }
      iter++;
    }
    
    if (iter >= maxIterations) {
      console.warn(`⚠️ While-цикл достиг максимума итераций (${maxIterations})`);
    }
    console.log(`✅ While-цикл завершён после ${iter} итераций`);
    return;
  }
  
  // Обычный цикл по счётчику
  const iterations = action.iterations || action.count || 1;
  console.log(`🔄 Цикл: ${iterations} итераций, ${loopActions.length} действий`);

  for (let iter = 0; iter < iterations; iter++) {
    if (!this.isPlaying) return;
    console.log(`   🔄 Итерация ${iter + 1} / ${iterations}`);
    for (const subAction of loopActions) {
      if (!this.isPlaying) return;
      await this.executeAction(subAction);
    }
  }
  console.log(`✅ Цикл завершён`);
}

/**
 * Вычисляет условие (для while-циклов и condition-шагов)
 * ИСПРАВЛЕНИЕ #11: Поддержка JS-выражений
 */
TestPlayer.prototype.evaluateCondition = async function(condition, action = {}) {
  if (!condition) return false;
  
  // Если условие - это объект с полями
  if (typeof condition === 'object') {
    // Проверка наличия элемента
    if (condition.selector || action.selector) {
      const selector = condition.selector || action.selector;
      try {
        const findResult = await this.findElementWithRetry(selector, 5, 300);
        return !!(findResult?.element);
      } catch (e) {
        return false;
      }
    }
    return false;
  }
  
  // Если условие - строка
  if (typeof condition === 'string') {
    // Проверка наличия элемента по селектору
    if (condition.startsWith('selector:') || condition.startsWith('#') || condition.startsWith('.') || condition.startsWith('[')) {
      const selector = condition.replace(/^selector:\s*/, '');
      try {
        const findResult = await this.findElementWithRetry(selector, 5, 300);
        return !!(findResult?.element);
      } catch (e) {
        return false;
      }
    }
    
    // ИСПРАВЛЕНИЕ #11: Вычисление JS-выражения с переменными
    try {
      // Подставляем переменные в выражение
      let processedCondition = condition;
      
      // Заменяем {var:name} на значения переменных
      processedCondition = processedCondition.replace(/\{var:([^}]+)\}/g, (match, varName) => {
        const value = this.userVariables[varName];
        if (value === undefined) {
          console.warn(`⚠️ Переменная "${varName}" не найдена`);
          return 'undefined';
        }
        // Если значение - строка, добавляем кавычки
        if (typeof value === 'string') {
          return JSON.stringify(value);
        }
        return String(value);
      });
      
      // Безопасное вычисление выражения
      const result = new Function(`
        "use strict";
        return (${processedCondition});
      `)();
      
      console.log(`   📊 Выражение "${condition}" → "${processedCondition}" = ${result}`);
      return !!result;
    } catch (e) {
      console.warn(`⚠️ Ошибка вычисления условия "${condition}": ${e.message}`);
      return false;
    }
  }
  
  return false;
}

/**
 * Обработчик условий
 * ИСПРАВЛЕНИЕ #11: Расширенная поддержка условий
 */
TestPlayer.prototype.handleCondition = async function(action) {
  console.log(`❓ Условие: ${action.condition || action.conditionExpression || 'N/A'}`);

  let conditionMet = false;
  
  // Способ 1: Проверка через evaluateCondition (JS-выражения + селекторы)
  if (action.condition || action.conditionExpression) {
    conditionMet = await this.evaluateCondition(action.condition || action.conditionExpression, action);
  }
  // Способ 2: Проверка наличия элемента по селектору (legacy)
  else if (action.selector) {
    try {
      const findResult = await this.findElementWithRetry(action.selector, 5, 300);
      conditionMet = !!(findResult?.element);
    } catch (e) {
      conditionMet = false;
    }
  }
  // Способ 3: Проверка значения элемента
  else if (action.expectedValue !== undefined && action.selector) {
    try {
      const findResult = await this.findElementWithRetry(action.selector, 5, 300);
      const element = findResult?.element;
      if (element) {
        const actualValue = element.value || element.textContent || '';
        conditionMet = actualValue.includes(action.expectedValue);
      }
    } catch (e) {
      conditionMet = false;
    }
  }

  const actionsToRun = conditionMet
    ? (action.thenActions || action.actions || [])
    : (action.elseActions || []);

  console.log(`   ${conditionMet ? '✅ Условие TRUE' : '❌ Условие FALSE'}, выполняю ${actionsToRun.length} действий`);

  for (const subAction of actionsToRun) {
    if (!this.isPlaying) return;
    await this.executeAction(subAction);
  }
}

/**
 * Обработчик try-catch - обработка ошибок
 * ИСПРАВЛЕНИЕ ПРОБЛЕМЫ #4: Нет стандартизированной обработки ошибок
 */
TestPlayer.prototype.handleTryCatch = async function(action) {
  const tryActions = action.tryActions || action.actions || [];
  const catchActions = action.catchActions || [];
  const finallyActions = action.finallyActions || [];
  
  console.log(`🛡️ Try-Catch: ${tryActions.length} try, ${catchActions.length} catch, ${finallyActions.length} finally`);
  
  let error = null;
  
  // Выполнение try блока
  try {
    for (const subAction of tryActions) {
      if (!this.isPlaying) return;
      await this.executeAction(subAction);
    }
    console.log(`✅ Try блок выполнен успешно`);
  } catch (e) {
    error = e;
    console.log(`❌ Try блок завершился с ошибкой: ${e.message || String(e)}`);
    
    // Сохраняем ошибку в переменную если указано
    if (action.errorVariable) {
      this.variables[action.errorVariable] = {
        value: e.message || String(e),
        type: 'string',
        source: 'try-catch-error'
      };
    }
    
    // Выполнение catch блока
    if (catchActions.length > 0) {
      console.log(`   🔧 Выполняю catch блок (${catchActions.length} действий)`);
      for (const subAction of catchActions) {
        if (!this.isPlaying) return;
        try {
          await this.executeAction(subAction);
        } catch (catchError) {
          console.warn(`⚠️ Ошибка в catch блоке: ${catchError.message || String(catchError)}`);
        }
      }
    }
  } finally {
    // Выполнение finally блока (всегда)
    if (finallyActions.length > 0) {
      console.log(`   🔄 Выполняю finally блок (${finallyActions.length} действий)`);
      for (const subAction of finallyActions) {
        if (!this.isPlaying) return;
        try {
          await this.executeAction(subAction);
        } catch (finallyError) {
          console.warn(`⚠️ Ошибка в finally блоке: ${finallyError.message || String(finallyError)}`);
        }
      }
    }
  }
  
  // Если в опциях указано continueOnError: false (по умолчанию true), пробрасываем ошибку дальше
  if (error && action.continueOnError === false) {
    throw error;
  }
}

/**
 * Обработчик выполнения JavaScript в контексте страницы.
 * Использует blob URL вместо inline script, чтобы обойти CSP (Content Security Policy).
 */
TestPlayer.prototype.handleJavaScript = async function(action) {
  const rawScript = action.value || action.script || '';
  if (!rawScript.trim()) {
    console.warn('⚠️ JavaScript: пустой скрипт');
    return;
  }
  const script = await this.processVariables(rawScript);
  const trimmed = String(script || '').trim();

  // Safe message-mode that works on strict CSP pages:
  // - "@alert <text>" shows a blocking alert dialog
  // - "@toast <text>" shows a non-blocking in-page banner (with close button)
  if (/^@alert\s+/i.test(trimmed)) {
    const msg = trimmed.replace(/^@alert\s+/i, '').trim();
    alert(msg || 'Шаг выполнен');
    return;
  }
  if (/^@toast\s+/i.test(trimmed)) {
    const msg = trimmed.replace(/^@toast\s+/i, '').trim() || 'Шаг выполнен';
    const existing = document.getElementById('autotest-js-toast');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'autotest-js-toast';
    box.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'max-width:420px',
      'background:rgba(20,20,20,0.92)',
      'color:#fff',
      'padding:12px 14px',
      'border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
      'font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
    ].join(';');
    const text = document.createElement('div');
    text.textContent = msg;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Закрыть';
    btn.style.cssText = [
      'margin-top:10px',
      'background:#fff',
      'color:#111',
      'border:0',
      'padding:6px 10px',
      'border-radius:8px',
      'cursor:pointer',
      'font:inherit'
    ].join(';');
    btn.addEventListener('click', () => box.remove());
    box.appendChild(text);
    box.appendChild(btn);
    document.documentElement.appendChild(box);
    return;
  }

  // Heuristics for common "message" scripts on strict CSP pages:
  // - alert('text')  -> show alert
  // - console.log('text') -> show toast
  // (Only supports simple single string literal argument.)
  const mAlert = trimmed.match(/^alert\s*\(\s*(['"`])([\s\S]*?)\1\s*\)\s*;?\s*$/i);
  if (mAlert) {
    const msg = (mAlert[2] || '').trim();
    alert(msg || 'Шаг выполнен');
    return;
  }
  const mLog = trimmed.match(/^console\.log\s*\(\s*(['"`])([\s\S]*?)\1\s*\)\s*;?\s*$/i);
  if (mLog) {
    const msg = (mLog[2] || '').trim() || 'Шаг выполнен';
    const existing = document.getElementById('autotest-js-toast');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'autotest-js-toast';
    box.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'max-width:420px',
      'background:rgba(20,20,20,0.92)',
      'color:#fff',
      'padding:12px 14px',
      'border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
      'font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
    ].join(';');
    const text = document.createElement('div');
    text.textContent = msg;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Закрыть';
    btn.style.cssText = [
      'margin-top:10px',
      'background:#fff',
      'color:#111',
      'border:0',
      'padding:6px 10px',
      'border-radius:8px',
      'cursor:pointer',
      'font:inherit'
    ].join(';');
    btn.addEventListener('click', () => box.remove());
    box.appendChild(text);
    box.appendChild(btn);
    document.documentElement.appendChild(box);
    return;
  }

  console.log(`📜 Выполнение JavaScript (${trimmed.length} символов)`);

  // ИСПРАВЛЕНИЕ #14: Пробуем выполнить через background script для обхода CSP
  const cspBypass = await this.tryExecuteJsViaBackground(trimmed);
  if (cspBypass.success) {
    console.log('✅ JavaScript выполнен через background script (CSP bypass)');
    return cspBypass.result;
  }
  
  // Fallback: выполняем через blob URL (может блокироваться CSP)
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([trimmed], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const el = document.createElement('script');
      el.src = url;
      el.onload = () => {
        URL.revokeObjectURL(url);
        el.remove();
        resolve();
      };
      el.onerror = (err) => {
        URL.revokeObjectURL(url);
        el.remove();
        console.error('❌ Ошибка загрузки JavaScript:', err);
        reject(new Error('Script load failed (CSP может блокировать JavaScript шаг; используйте "@alert ..." или "@toast ..." для сообщений)'));
      };
      document.documentElement.appendChild(el);
    } catch (err) {
      console.error('❌ Ошибка выполнения JavaScript:', err);
      reject(err);
    }
  });
}

/**
 * ИСПРАВЛЕНИЕ #14: Выполняет JS через background script для обхода CSP
 */
TestPlayer.prototype.tryExecuteJsViaBackground = async function(script) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_JS',
      script: script
    });
    
    if (response && response.success) {
      return { success: true, result: response.result };
    } else {
      console.warn(`⚠️ Выполнение через background не удалось: ${response?.error || 'неизвестная ошибка'}`);
      return { success: false, error: response?.error };
    }
  } catch (e) {
    console.warn(`⚠️ Не удалось выполнить JS через background: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Выполняет скриншот: весь экран, область или элемент
 * @param {Object} action - action.screenshotCaptureType: 'full'|'region'|'element', action.screenshotRegion, action.selector
 * @returns {Promise<string|null>} Base64 data URL или null
 */
TestPlayer.prototype.handleScreenshot = async function(action) {
  // ИСПРАВЛЕНИЕ #9: Транслируем subtype в screenshotCaptureType
  let captureType = action.screenshotCaptureType;
  
  // Если screenshotCaptureType не указан, но есть subtype - маппим
  if (!captureType && action.subtype) {
    const subtypeToCaptureType = {
      'visual-screenshot': 'element',
      'page-screenshot': 'full'
    };
    captureType = subtypeToCaptureType[action.subtype] || 'element';
  }
  
  // Fallback на 'element' если ничего не указано
  captureType = captureType || 'element';
  
  console.log(`📷 Скриншот: ${captureType === 'full' ? 'весь экран' : captureType === 'region' ? 'область' : 'элемент'}`);

  let fullScreenshot = await this.takeScreenshot();
  if (!fullScreenshot) {
    console.warn('⚠️ Не удалось сделать скриншот');
    return null;
  }

  if (captureType === 'full') {
    return fullScreenshot;
  }

  if (captureType === 'region') {
    const r = action.screenshotRegion || { x: 0, y: 0, width: 400, height: 300 };
    return this.cropScreenshot(fullScreenshot, r.x, r.y, r.width, r.height);
  }

  if (captureType === 'element') {
    if (!action.selector) {
      console.warn('⚠️ Скриншот элемента: селектор не указан');
      return fullScreenshot;
    }
    const findResult = await this.findElementWithRetry(action.selector, 3, 200);
    const element = findResult?.element || await this.tryAlternativeSelectors(action);
    if (!element) {
      console.warn('⚠️ Элемент не найден, сохраняю полный скриншот');
      return fullScreenshot;
    }
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    await this.delay(50);
    const rect = element.getBoundingClientRect();
    const padding = 5;
    const x = Math.max(0, Math.floor(rect.left) - padding);
    const y = Math.max(0, Math.floor(rect.top) - padding);
    const w = Math.min(Math.ceil(rect.width) + 2 * padding, window.innerWidth - x);
    const h = Math.min(Math.ceil(rect.height) + 2 * padding, window.innerHeight - y);
    if (w <= 0 || h <= 0) {
      return fullScreenshot;
    }
    return this.cropScreenshot(fullScreenshot, x, y, w, h);
  }

  return fullScreenshot;
}

/**
 * Обрезает скриншот по заданным координатам (пиксели от левого верхнего угла viewport)
 */
TestPlayer.prototype.cropScreenshot = async function(dataUrl, x, y, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Диспатчит реалистичный клик (mousedown + mouseup + click)
 */
TestPlayer.prototype._dispatchClick = function(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0
  };

  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  element.dispatchEvent(new MouseEvent('click', eventOptions));
}

TestPlayer.prototype.init = function() {
  if (!this._debugPagehideListenerAttached) {
    this._debugPagehideListenerAttached = true;
    window.addEventListener('pagehide', () => {
      if (!this.isPlaying) return;
      if (!this.navigationInitiatedByPlayer && this.currentTest) {
        const nextActionIndex = Number(this.currentActionIndex) + 1;
        try {
          const runHistoryForStorage = this._runHistoryForStorage();
          chrome.runtime.sendMessage({
            type: 'SAVE_PLAYBACK_STATE',
            test: this.currentTest,
            actionIndex: Number.isNaN(nextActionIndex) ? this.currentActionIndex : nextActionIndex,
            nextUrl: '__AUTO_NAV__',
            runMode: this.playMode,
            runHistory: runHistoryForStorage,
            ...(this.playbackSessionId ? { playbackSessionId: this.playbackSessionId } : {})
          }).catch(() => {});
        } catch (e) { /* ignore */ }
      }
    }, { capture: true });
  }

  // Слушаем сообщения от background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PLAY_TEST') {
      // Проверяем, не запущен ли уже тест на этой вкладке
      if (this.isPlaying) {
        const incomingId = message.test?.id != null ? String(message.test.id) : '';
        const currentId = this.currentTest?.id != null ? String(this.currentTest.id) : '';
        if (incomingId && currentId && incomingId === currentId) {
          console.warn('⚠️ Повторный PLAY_TEST для того же теста (воспроизведение уже идёт) — отвечаю success (идемпотентно)');
          sendResponse({ success: true, ignoredDuplicatePlay: true });
          return true;
        }
        console.warn('⚠️ Тест уже запущен на этой вкладке, игнорирую повторный запуск');
        sendResponse({ success: false, error: 'Test already playing on this tab' });
        return true;
      }
      
      // Проверяем, есть ли в тесте действия, требующие визуального интерфейса
      // Действия, которые НЕ требуют визуального интерфейса: api, variable, wait
      // Действия, которые требуют визуального интерфейса: click, dblclick, input, change, scroll, navigation, keyboard
      // ВАЖНО: Проверяем только действия, которые будут выполняться в текущем режиме
      const runMode = message.mode || 'optimized';
      const actionsToCheck = (message.test?.actions || []).filter(action => {
        return runMode === 'full' ? true : !action.hidden;
      });
      
      const visualActionTypes = ['click', 'dblclick', 'input', 'change', 'scroll', 'navigation', 'keyboard'];
      const hasVisualActions = actionsToCheck.some(action => {
        // Проверяем тип действия
        if (visualActionTypes.includes(action.type)) {
          return true;
        }
        // Проверяем вложенные действия (циклы, условия) - тоже фильтруем по режиму
        const checkNestedActions = (nestedActions) => {
          if (!Array.isArray(nestedActions)) return false;
          const filteredNested = runMode === 'full' 
            ? nestedActions 
            : nestedActions.filter(a => !a.hidden);
          return filteredNested.some(subAction => visualActionTypes.includes(subAction.type));
        };
        
        if (action.actions && checkNestedActions(action.actions)) {
          return true;
        }
        if (action.thenActions && checkNestedActions(action.thenActions)) {
          return true;
        }
        if (action.elseActions && checkNestedActions(action.elseActions)) {
          return true;
        }
        return false;
      });
      
      // Если в тесте нет действий, требующих визуального интерфейса (только переменные/API/wait), разрешаем выполнение на extension странице
      const isExtensionPage = window.location.href.startsWith('chrome-extension://') || 
                             window.location.href.startsWith('chrome://') ||
                             window.location.href.startsWith('edge://');
      
      if (isExtensionPage && hasVisualActions) {
        console.log('⚠️ Игнорирую PLAY_TEST на extension странице (тест содержит действия с визуальным интерфейсом):', window.location.href);
        sendResponse({ success: false, error: 'Extension page, ignoring (test has visual actions)' });
        return true;
      } else if (isExtensionPage && !hasVisualActions) {
        console.log('✅ Разрешаю PLAY_TEST на extension странице (тест без действий с визуальным интерфейсом, только переменные/API/wait):', window.location.href);
        console.log(`📊 Режим запуска: ${message.mode || 'optimized'}, действий для проверки: ${actionsToCheck.length}`);
      }
      
      this.debugMode = message.debugMode || false;
      this.parallelRun = message.parallelRun || false;
      this.runIndex = message.runIndex || null;
      this.totalRuns = message.totalRuns || null;
      if (message.tabId != null) this.tabId = message.tabId;
      this.isGroupRun = message.isGroupRun || false;
      this.groupRunCurrentIndex = message.groupRunCurrentIndex;
      this.groupRunTotal = message.groupRunTotal;
      console.log(`▶️ Запускаю тест "${message.test?.name || 'без имени'}" в режиме ${message.mode || 'optimized'}`);
      this.playTest(message.test, message.mode || 'optimized', message.playbackSessionId || null);
      sendResponse({ success: true });
    } else if (message.type === 'STOP_PLAYING' || message.type === 'FORCE_STOP') {
      this.stopPlaying();
      sendResponse({ success: true });
    } else if (message.type === 'PAUSE_PLAYBACK') {
      // Ставим воспроизведение на паузу
      this.pausePlayback();
      sendResponse({ success: true, paused: true });
    } else if (message.type === 'RESUME_PLAYBACK_FROM_PAUSE') {
      // Возобновляем воспроизведение с места паузы
      this.resumePlaybackFromPause();
      sendResponse({ success: true, resumed: true });
    } else if (message.type === 'RESUME_PLAYBACK') {
      // Восстанавливаем воспроизведение после перезагрузки страницы
      this.isGroupRun = message.isGroupRun || false;
      this.groupRunCurrentIndex = message.groupRunCurrentIndex;
      this.groupRunTotal = message.groupRunTotal;
      this.resumePlayback(
        message.test,
        message.actionIndex,
        message.mode || 'optimized',
        message.runHistory || null,
        message.playbackSessionId != null ? message.playbackSessionId : this.playbackSessionId
      );
      sendResponse({ success: true });
    } else if (message.type === 'RESUME_TEST') {
      // Восстановление теста в новой вкладке (new-tab)
      const ts = message.testState;
      if (ts && ts.actions) {
        this.isGroupRun = ts.isGroupRun || false;
        this.groupRunCurrentIndex = ts.groupRunCurrentIndex;
        this.groupRunTotal = ts.groupRunTotal;
        const test = { id: ts.testId, name: ts.testName, actions: ts.actions, variables: ts.userVariables || {} };
        const actionIndex = (ts.currentActionIndex != null && ts.currentActionIndex >= 0) ? ts.currentActionIndex : 1;
        const resumeMode = ts.runMode || 'optimized';
        const resumeHistory = ts.runHistory || null;
        const resumeSessionId = ts.playbackSessionId != null ? ts.playbackSessionId : null;
        console.log(`▶️ RESUME_TEST: продолжаю тест в новой вкладке с шага ${actionIndex + 1}`);
        this.resumePlayback(test, actionIndex, resumeMode, resumeHistory, resumeSessionId);
      }
      sendResponse({ success: true });
    } else if (message.type === 'RECORDING_STOPPED') {
      // Удаляем уведомление о записи после её остановки
      this.hideRecordingNotification();
      
      // Если нужно продолжить воспроизведение после остановки записи
      if (message.shouldResumePlayback && this.currentTest) {
        console.log('▶️ Продолжаю воспроизведение после остановки записи...');
        // Продолжаем воспроизведение с действия после маркера
        this.resumePlaybackAfterRecording(message.markerActionIndex);
      }
      
      sendResponse({ success: true });
    } else if (message.type === 'SHOW_GROUP_SUMMARY') {
      if (message.summary) this.showGroupSummaryPopup(message.summary);
      sendResponse({ success: true });
    } else if (message.type === 'DEBUG_CONTINUE') {
      this.debugPaused = false;
      sendResponse({ success: true });
    } else if (message.type === 'DEBUG_STEP') {
      // Выполнить один шаг в режиме отладки
      this.debugPaused = false;
      sendResponse({ success: true });
    }
    return true;
  });

  // Проверяем, нужно ли восстановить воспроизведение после перезагрузки
  this.checkResumePlayback();
}

/**
 * Режим отладки: пауза перед шагом с возможностью редактирования
 */
TestPlayer.prototype.debugStep = async function(action, stepNumber, totalSteps) {
  this.debugPaused = true;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🐛 РЕЖИМ ОТЛАДКИ: Шаг ${stepNumber} из ${totalSteps}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Действие:', action);
  console.log('Селектор:', this.formatSelector(action.selector));
  
  // Показываем элемент на странице
  try {
    const selectorStr = this.formatSelector(action.selector);
    const element = document.querySelector(selectorStr);
    if (element) {
      this.highlightElement(element, '#FF9800', 5000); // Подсветка на 5 секунд
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log('✅ Элемент найден и подсвечен');
    } else {
      console.warn('⚠️ Элемент не найден на странице');
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при поиске элемента:', error);
  }
  
  // Отправляем сообщение в редактор для показа панели отладки
  try {
    await chrome.runtime.sendMessage({
      type: 'DEBUG_STEP_PAUSED',
      stepNumber,
      totalSteps,
      action,
      selector: this.formatSelector(action.selector)
    });
  } catch (error) {
    console.warn('⚠️ Не удалось отправить сообщение в редактор:', error);
  }
  
  // Ждем, пока пользователь не продолжит
  while (this.debugPaused && this.isPlaying) {
    await this.delay(100);
  }
  
  if (!this.isPlaying) {
    throw new Error('Воспроизведение остановлено в режиме отладки');
  }
}

/**
 * Делает скриншот страницы
 */
/**
 * Захват viewport без проверки настроек (для scroll-and-stitch)
 */
TestPlayer.prototype._captureViewportRaw = async function() {
  const now = Date.now();
  if (this._lastCaptureTime && now - this._lastCaptureTime < 600) {
    await this.delay(600 - (now - this._lastCaptureTime));
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
    this._lastCaptureTime = Date.now();
    return response?.success ? response.screenshot : null;
  } catch (_) {
    return null;
  }
}

TestPlayer.prototype._estimateStickyHeaderHeight = function() {
  try {
    let maxBottom = 0;
    const walk = (el) => {
      if (!el) return;
      try {
        const s = getComputedStyle(el);
        const pos = s.position;
        if ((pos === 'fixed' || pos === 'sticky') && el.getBoundingClientRect) {
          const r = el.getBoundingClientRect();
          if (r.top >= 0 && r.top < window.innerHeight * 0.5) {
            maxBottom = Math.max(maxBottom, r.bottom);
          }
        }
        for (const c of el.children || []) walk(c);
      } catch (_) {}
    };
    walk(document.documentElement);
    return Math.min(Math.round(maxBottom), Math.floor(window.innerHeight * 0.4));
  } catch (_) {
    return 0;
  }
}

TestPlayer.prototype._findScrollableRoot = function() {
  let best = document.scrollingElement || document.documentElement;
  let bestH = best ? best.scrollHeight : 0;
  const walk = (el) => {
    if (!el) return;
    try {
      const s = getComputedStyle(el);
      const oy = s.overflowY || s.overflow;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.scrollHeight > bestH) {
        best = el;
        bestH = el.scrollHeight;
      }
      for (const c of el.children || []) walk(c);
    } catch (_) {}
  };
  walk(document.documentElement);
  return best;
}

/**
 * Предзагрузка контента для lazy-load страниц (Pikabu и т.п.)
 */
TestPlayer.prototype._preloadLazyContent = async function(scrollRoot, viewportHeight) {
  let prevH = 0;
  for (let pass = 0; pass < 5; pass++) {
    scrollRoot.scrollTop = scrollRoot.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await this.delay(800);
    const h = Math.max(scrollRoot.scrollHeight, document.documentElement.scrollHeight);
    if (h <= prevH) break;
    prevH = h;
  }
}

/**
 * Полный скриншот страницы: прокрутка + захват viewport + склейка
 */
TestPlayer.prototype._captureFullPageScrollStitch = async function() {
  const scrollRoot = this._findScrollableRoot() || document.scrollingElement || document.documentElement;
  const savedScrollY = scrollRoot.scrollTop;
  const savedScrollX = scrollRoot.scrollLeft;
  try {
    const viewportHeight = scrollRoot === document.scrollingElement || scrollRoot === document.documentElement
      ? window.innerHeight
      : scrollRoot.clientHeight;
    await this._preloadLazyContent(scrollRoot, viewportHeight);
    const fullHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
      scrollRoot.scrollHeight,
      document.documentElement.offsetHeight
    );
    if (fullHeight <= viewportHeight) {
      return await this._captureViewportRaw();
    }
    const maxChunks = 100;
    const numChunks = Math.min(Math.ceil(fullHeight / viewportHeight), maxChunks);
    const chunks = [];
    scrollRoot.scrollTop = 0;
    scrollRoot.scrollLeft = 0;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await this.delay(500);
    for (let i = 0; i < numChunks; i++) {
      scrollRoot.scrollTop = i * viewportHeight;
      scrollRoot.scrollLeft = 0;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await this.delay(800);
      const img = await this._captureViewportRaw();
      if (!img) break;
      chunks.push(img);
    }
    scrollRoot.scrollTop = savedScrollY;
    scrollRoot.scrollLeft = savedScrollX;
    if (chunks.length === 0) return null;
    if (chunks.length === 1) return chunks[0];
    const headerHeight = this._estimateStickyHeaderHeight();
    return await this._stitchScreenshots(chunks, viewportHeight, fullHeight, headerHeight);
  } catch (e) {
    scrollRoot.scrollTop = savedScrollY;
    scrollRoot.scrollLeft = savedScrollX;
    console.warn('⚠️ Ошибка scroll-and-stitch:', e?.message);
    return null;
  }
}

TestPlayer.prototype._stitchScreenshots = async function(chunks, viewportHeight, fullHeight, stickyHeaderHeight = 0) {
  return new Promise((resolve) => {
    const img0 = new Image();
    img0.onload = () => {
      const w = img0.naturalWidth;
      const h = img0.naturalHeight;
      const numChunks = chunks.length;
      const headerPx = Math.round(stickyHeaderHeight * (h / viewportHeight));
      const cropTop = Math.min(headerPx, h - 1);
      const chunkContentH = h - cropTop;
      const canvasHeight = cropTop > 0 ? h + (numChunks - 1) * chunkContentH : numChunks * h;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      let loaded = 0;
      const drawChunk = (i, imgEl) => {
        if (i === 0 || cropTop <= 0) {
          ctx.drawImage(imgEl, 0, 0, w, h, 0, i * h, w, h);
        } else {
          ctx.drawImage(imgEl, 0, cropTop, w, chunkContentH, 0, h + (i - 1) * chunkContentH, w, chunkContentH);
        }
        if (++loaded === chunks.length) resolve(canvas.toDataURL('image/png'));
      };
      chunks.forEach((dataUrl, i) => {
        const img = new Image();
        img.onload = () => drawChunk(i, img);
        img.onerror = () => { if (++loaded === chunks.length) resolve(null); };
        img.src = dataUrl;
      });
    };
    img0.onerror = () => resolve(null);
    img0.src = chunks[0];
  });
}

TestPlayer.prototype.takeScreenshot = async function() {
  try {
    if (!this.screenshotSettingsLoaded) {
      await this.loadScreenshotSettings();
    }
    const saveToDisk = this.screenshotSettings?.saveToDisk === true;
    // storeInMemory: по умолчанию true (если не задано явно false) — скриншоты попадают в runHistory
    const storeInMemory = this.screenshotSettings?.storeInMemory !== false;
    if (!saveToDisk && !storeInMemory) {
      return null;
    }

    // Ограничиваем частоту (Chrome: несколько вызовов captureVisibleTab в секунду)
    const now = Date.now();
    if (!this.lastScreenshotTime) {
      this.lastScreenshotTime = 0;
    }
    const timeSinceLastScreenshot = now - this.lastScreenshotTime;
    const minIntervalMs = 500; // Chrome: ~2 вызова/сек, чтобы не превысить MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
    if (timeSinceLastScreenshot < minIntervalMs) {
      await this.delay(minIntervalMs - timeSinceLastScreenshot);
    }
    
    // Используем chrome.tabs.captureVisibleTab для создания скриншота
    // MV3: "пробуждаем" service worker перед первым запросом (снижает "message channel closed")
    try {
      await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      await this.delay(100);
    } catch (_) { /* ignore */ }
    // Retry при "message channel closed" (MV3: service worker может завершиться до ответа)
    const sendTakeScreenshot = () => chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
    const isMessagingError = (e) => {
      const m = (e?.message || '').toLowerCase();
      return m.includes('channel closed') || m.includes('port closed') || m.includes('message channel') ||
        m.includes('receiving end does not exist') || m.includes('response was received') ||
        m.includes('extension context invalidated') || m.includes('context invalidated');
    };
    let response = null;
    const delays = [0, 600, 1200, 1800];
    for (let attempt = 0; attempt < delays.length && !response; attempt++) {
      if (attempt > 0) await this.delay(delays[attempt]);
      try {
        response = await sendTakeScreenshot();
      } catch (err) {
        if (!isMessagingError(err) || attempt === delays.length - 1) throw err;
      }
    }
    
    this.lastScreenshotTime = Date.now();
    
    if (response && response.success && response.screenshot) {
      return response.screenshot; // Base64 строка
    }
    // Fallback: используем html2canvas если доступен
    if (window.html2canvas) {
      const canvas = await html2canvas(document.body);
      return canvas.toDataURL('image/png');
    }
    
    return null;
  } catch (error) {
    // Игнорируем ошибки превышения квоты
    if (error.message && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
      console.warn('⚠️ Превышена квота создания скриншотов, пропускаю');
      return null;
    }
    // Игнорируем ошибки messaging после retry — скриншот не критичен для прогона
    const errMsg = (error?.message || '').toLowerCase();
    if (errMsg.includes('channel closed') || errMsg.includes('port closed') || errMsg.includes('receiving end does not exist') || errMsg.includes('response was received') || errMsg.includes('extension context invalidated') || errMsg.includes('context invalidated')) {
      console.warn('⚠️ Скриншот недоступен (канал сообщений закрыт), пропускаю');
      return null;
    }
    console.error('Ошибка при создании скриншота:', error);
    return null;
  }
}

/**
 * Сохраняет скриншот в файл
 */
TestPlayer.prototype.saveScreenshotToFile = async function(screenshot, stepNumber, type = 'screenshot') {
  if (!screenshot || !this.runHistory) {
    return null;
  }

  try {
    if (!this.screenshotSettingsLoaded) {
      await this.loadScreenshotSettings();
    }
    if (!this.screenshotSettings?.saveToDisk) {
      return null;
    }
    if (this.screenshotSettings.onlyOnError && type !== 'error') {
      return null;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_SCREENSHOT_TO_FILE',
      action: 'SAVE_SCREENSHOT_TO_FILE',
      command: 'SAVE_SCREENSHOT_TO_FILE',
      screenshot: screenshot,
      testId: this.runHistory.testId,
      runId: this.runHistory.runId,
      stepNumber: stepNumber,
      screenshotType: type,
      savePath: this.screenshotSettings.savePath || ''
    });

    if (response && response.success) {
      console.log(`💾 Скриншот сохранен в файл: ${response.filePath}`);
      return response.filePath;
    } else {
      console.warn(`⚠️ Не удалось сохранить скриншот в файл: ${response?.error || 'Неизвестная ошибка'}`);
      return null;
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при сохранении скриншота в файл:', error);
    return null;
  }
}

/**
 * Проверяет наличие опций в dropdown
 */
TestPlayer.prototype.hasDropdownOptions = function(element) {
  if (!element) return false;
  
  // Для стандартного SELECT
  if (element.tagName === 'SELECT') {
    return element.options && element.options.length > 0;
  }
  
  // Для кастомных dropdown - проверяем наличие опций в overlay
  const optionSelectors = [
    'option',
    '[role="option"]',
    '.option',
    '.mat-option',
    '.ng-option',
    '.react-select__option',
    '.dropdown-item'
  ];
  
  for (const selector of optionSelectors) {
    try {
      const options = element.querySelectorAll(selector);
      if (options.length > 0) return true;
    } catch (e) {
      // Игнорируем ошибки
    }
  }
  
  // Проверяем overlay панели
  const overlayPanels = document.querySelectorAll(
    '.cdk-overlay-pane, .mat-select-panel, .ng-dropdown-panel, [role="listbox"]'
  );
  
  for (const panel of overlayPanels) {
    for (const selector of optionSelectors) {
      try {
        const options = panel.querySelectorAll(selector);
        if (options.length > 0) return true;
      } catch (e) {
        // Игнорируем ошибки
      }
    }
  }
  
  return false;
}

/**
 * Проверяет, является ли элемент dropdown
 */
TestPlayer.prototype.isDropdownElement = function(element) {
  if (!element) return false;
  
  // 1. Проверка по тегу - текстовые поля НЕ являются dropdown
  const tagName = element.tagName?.toLowerCase() || '';
  if (tagName === 'input' || tagName === 'textarea') return false;
  if (tagName === 'select') return true;
  
  // 2. Проверка кастомных dropdown компонентов
  const customDropdownTags = [
    'app-select',
    'ng-select', 
    'mat-select',
    'p-dropdown',
    'v-select',
    'el-select'
  ];
  
  if (customDropdownTags.includes(tagName)) {
    return true;
  }
  
  // 3. Проверка по атрибутам роли
  const role = element.getAttribute?.('role') || '';
  const ariaHaspopup = element.getAttribute?.('aria-haspopup') || '';
  
  if (role === 'combobox' || role === 'listbox' || ariaHaspopup === 'listbox') {
    return true;
  }
  
  // 4. Проверка по классам
  const className = element.className || '';
  const classNameStr = typeof className === 'string' ? className : (className.toString?.() || '');
  const dropdownClasses = [
    'dropdown',
    'select-box',
    'select-container',
    'combobox',
    'autocomplete',
    'mat-select',
    'react-select',
    'vue-select',
    'ng-select'
  ];
  
  const classNameLower = classNameStr.toLowerCase();
  const hasDropdownClass = dropdownClasses.some(cls =>
    classNameLower.includes(cls.toLowerCase())
  );
  
  if (hasDropdownClass) {
    return true;
  }
  
  // 5. Проверка контекста - есть ли дочерние элементы option/item
  if (element.querySelector) {
    const hasOptions = element.querySelector('option, [role="option"], .option, .item');
    if (hasOptions) {
      return true;
    }
  }
  
  // 6. Проверка родительского контейнера
  if (element.closest) {
    const dropdownParent = element.closest('app-select, ng-select, mat-select, [role="combobox"], .select-container');
    if (dropdownParent) {
      return true;
    }
  }
  
  return false;
}

/**
 * Обрабатывает dropdown-операции по subtype (dropdown-select, dropdown-multiselect и т.д.)
 * Вызывается из handleClick для явных dropdown subtypes.
 */
})();
