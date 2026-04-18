/**
 * AutoTest Recorder - Player Module
 * Screenshot extended and analysis handlers
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-analysis
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-analysis.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleScreenshotExtended = async function(action) {
  const subtype = action.subtype || 'visual-screenshot';
  
  switch (subtype) {
    case 'page-screenshot-full': {
      // Сначала CDP (как DevTools: "Capture full size screenshot" / "Сделать полноразмерный скриншот")
      console.log('📸 Создание полного скриншота страницы (CDP)...');
      let result = null;
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'CAPTURE_FULL_PAGE_SCREENSHOT',
          tabId: this.tabId
        });
        if (response?.success && response.screenshot) result = response.screenshot;
        if (response?.error?.includes('DevTools')) {
          console.warn('⚠️ Закройте DevTools и повторите');
        }
      } catch (e) {
        console.warn('📸 CDP error:', e?.message);
      }
      if (!result) {
        result = await this._captureFullPageScrollStitch();
      }
      if (!result) result = await this.takeScreenshot();
      if (result) {
        const saveVar = action.saveToVariable || action.variableName;
        if (saveVar) this.userVariables[saveVar] = result;
      }
      return result;
    }
    
    case 'screenshot-compare': {
      // Visual regression testing
      const baselineImage = action.baseline || action.baselineImage;
      if (!baselineImage) {
        throw new Error('Не указан baseline скриншот для сравнения');
      }
      
      // Делаем текущий скриншот
      const currentScreenshot = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        tabId: this.tabId,
        selector: action.selector?.value
      });
      
      // Отправляем на сравнение
      const comparisonResult = await chrome.runtime.sendMessage({
        type: 'COMPARE_SCREENSHOTS',
        baseline: baselineImage,
        current: currentScreenshot.data,
        threshold: parseFloat(action.threshold || action.tolerance || 0.1)
      });
      
      if (comparisonResult.match) {
        console.log(`✅ Скриншоты совпадают (различия: ${comparisonResult.difference}%)`);
      } else {
        throw new Error(
          `Скриншоты не совпадают! Различия: ${comparisonResult.difference}% (допустимо: ${action.threshold || 0.1}%)`
        );
      }
      
      // Сохраняем результат в переменную
      const saveVar = action.saveToVariable || action.resultVariable;
      if (saveVar) {
        this.userVariables[saveVar] = comparisonResult;
      }
      break;
    }
    
    case 'screenshot-element': {
      // Скриншот конкретного элемента
      const selector = action.selector?.value || action.selector?.selector;
      if (!selector) {
        throw new Error('Не указан селектор элемента для скриншота');
      }
      
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Элемент не найден: ${selector}`);
      }
      
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_ELEMENT_SCREENSHOT',
        tabId: this.tabId,
        selector: selector,
        filename: action.filename || `element-${Date.now()}.png`
      });
      
      console.log(`✅ Скриншот элемента сохранён: ${response.filename}`);
      break;
    }
  }
}

/**
 * Обработчик анализа страницы.
 * Анализ выполняется в background (chrome.scripting доступен только там), не в content script.
 */
TestPlayer.prototype.handleAnalysis = async function(action) {
  const subtype = action.subtype || 'analysis-selectors';
  const url = window.location.href;
  
  // tabId: в content script chrome.tabs недоступен. Background при RUN_ANALYSIS
  // использует sender.tab.id, если tabId не передан. При необходимости можно
  // запросить tabId через chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }).
  let tabId = this.tabId;
  if (!tabId && typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs?.[0]) {
        tabId = tabs[0].id;
        this.tabId = tabId;
      }
    } catch (e) {
      console.warn('⚠️ [Analysis] tabId не получен (chrome.tabs в content script недоступен), background использует sender.tab.id:', e?.message);
    }
  }
  
  console.log(`🔍 [Analysis] Запрос анализа типа: ${subtype}`);
  console.log(`   Tab ID: ${tabId}`);
  console.log(`   URL: ${url}`);

  try {
    const fillOptions = action.fillOptions || action.analysisConfig?.fillOptions;
    const containerSelector = action.containerSelector || action.analysisConfig?.containerSelector;
    const targetValue = action.targetValue || action.analysisConfig?.targetValue;
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_ANALYSIS',
      tabId: tabId,
      analysisType: subtype,
      url,
      fillOptions: fillOptions || undefined,
      containerSelector: containerSelector || undefined,
      targetValue: targetValue || undefined,
      testId: subtype === 'analysis-performance' ? (this.currentTest?.id || null) : undefined
    });

    if (!response || !response.success) {
      const errMessage = response?.error || 'Analysis returned no results';
      // fill-single-dropdown вызывается как необязательный помощник при проигрывании;
      // пустой ответ не должен ронять весь шаг — продолжаем локальные стратегии без stack-ошибки.
      if (subtype === 'fill-single-dropdown') {
        console.warn(`⚠️ [Analysis] "${subtype}" недоступен или пустой ответ: ${errMessage} (продолжаю локальный выбор в плеере)`);
        if (action) action.url = url;
        return {
          success: false,
          data: {
            success: false,
            _fillError: errMessage,
            metadata: {
              tabId: tabId || null,
              url,
              timestamp: new Date().toISOString(),
              analysisType: subtype
            }
          }
        };
      }
      // Для adaptive-auto/fill-fields не останавливаем выполнение:
      // отсутствие результата анализа трактуем как "ничего не заполнено",
      // далее adaptive может применить fallback (direct fill / combobox / app-select).
      if (subtype === 'analysis-fill-fields') {
        console.warn(`⚠️ [Analysis] "${subtype}" вернул пустой/ошибочный ответ, продолжаю с empty-result: ${errMessage}`);
        const emptyResult = {
          success: true,
          data: {
            fields: [],
            summary: { total: 0, byType: {}, required: 0, empty: 0, filled: 0, validationErrors: 0 },
            validationErrors: [],
            _fillError: errMessage,
            metadata: {
              tabId: tabId || null,
              url,
              timestamp: new Date().toISOString(),
              analysisType: subtype
            }
          }
        };
        if (action) action.url = url;
        return emptyResult;
      }
      throw new Error(errMessage);
    }

    const analysisResult = {
      success: true,
      data: response.data
    };

    // Обновляем URL шага по странице, на которой выполнился анализ (и «Получить селекторы», и «Заполнить поля»)
    const runUrl = response.data?.metadata?.url || url;
    if (runUrl && action) {
      action.url = runUrl;
    }

    console.log(`✅ [Analysis] Анализ "${subtype}" завершен:`);
    
    // НОВОЕ: Специальная обработка для analysis-performance
    if (subtype === 'analysis-performance') {
      console.log(`   - Load Time: ${response.data?.metrics?.loadTime || 0}ms`);
      console.log(`   - DOM Size: ${response.data?.metrics?.domSize || 0} nodes`);
      console.log(`   - Score: ${response.data?.metrics?.score || 0}`);
      console.log(`   - Rating: ${response.data?.summary?.rating || 'unknown'}`);
      
      // Если есть детальные данные от Performance Collector
      if (response.data?.hasDetailedReport) {
        console.log(`   📊 Detailed Performance Report available!`);
        
        // Сохраняем данные через background
        if (response.data?.performanceData) {
          try {
            await chrome.runtime.sendMessage({
              type: 'PERFORMANCE_COLLECT_DATA',
              testId: this.currentTest?.id || 'analysis-' + Date.now(),
              data: response.data.performanceData
            });
            console.log(`   ✅ Performance data saved to storage`);
          } catch (error) {
            console.warn(`   ⚠️ Could not save performance data:`, error);
          }
        }
        
        // Генерируем ссылку на dashboard
        const dashboardUrl = chrome.runtime.getURL('performance/performance-dashboard.html');
        console.log(`   🔗 View full report: ${dashboardUrl}`);
        console.log(`   📊 To open dashboard, run: chrome.tabs.create({url: "${dashboardUrl}"})`);
      }
    } else {
      console.log(`   - Всего элементов: ${response.data?.summary?.total || 0}`);
      console.log(`   - Уникальных: ${response.data?.summary?.unique || 0}`);
      console.log(`   - Высокого качества: ${response.data?.summary?.highQuality || 0}`);
    }

    return analysisResult;
  } catch (error) {
    console.error(`❌ [Analysis] Ошибка анализа "${subtype}":`, error);
    console.error(`   Error stack:`, error?.stack);
    throw error;
  }
}

/**
 * Находит видимый диалог/модальное окно (Angular Material, CDK overlay, role=dialog).
 * Возвращает элемент диалога или null.
 */
TestPlayer.prototype._findVisibleDialog = function() {
  const docs = [document];
  try {
    for (let i = 0; i < (window.frames?.length || 0); i++) {
      try {
        const f = window.frames[i];
        if (f?.document && f.document !== document) docs.push(f.document);
      } catch (e) {}
    }
  } catch (e) {}
  const isOurs = (el) => el?.id === 'autotest-completion-popup' || el?.closest?.('#autotest-completion-popup');
  const isVisible = (el) => {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
  };
  const hasDialogContent = (el) => {
    const text = (el.textContent || '').toLowerCase();
    const hasButtons = !!el.querySelector('button, [role="button"], [class*="button"], [class*="btn"], a');
    const hasWarning = /удален|потерян|уверен|отмен|подтверд|данные будут|информация будет|закрыть сайт|изменения могут|сохраниться|выйти|обязательные поля|не заполнен/i.test(text);
    return hasButtons && (hasWarning || (text.includes('да') && text.includes('отмен')));
  };
  const validationExact = /не заполнены следующие обязательные поля|обязательные поля/i;
  let allPotential = [];
  for (const doc of docs) {
    try {
      allPotential = allPotential.concat(Array.from(doc.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], .mat-dialog-container, .mat-mdc-dialog-container, .mat-snack-bar-container, .mat-snack-bar, [class*="dialog-container"], [class*="modal-content"], [class*="snackbar"], .cdk-overlay-pane, [class*="modal"], [class*="overlay-pane"]'
      )));
    } catch (e) {}
  }
  const byZIndex = (a, b) => {
    const w = (a) => a?.ownerDocument?.defaultView || window;
    const za = parseInt((w(a).getComputedStyle?.(a) || {}).zIndex, 10) || 0;
    const zb = parseInt((w(b).getComputedStyle?.(b) || {}).zIndex, 10) || 0;
    return zb - za;
  };
  for (const el of [...allPotential].sort(byZIndex)) {
    if (isOurs(el)) continue;
    if (!isVisible(el)) continue;
    const txt = (el.textContent || '').toLowerCase();
    if (validationExact.test(txt) && el.querySelector('button, [role="button"], [class*="button"], [class*="btn"], a')) {
      const pane = el.closest('.cdk-overlay-pane');
      return (pane && isVisible(pane)) ? pane : el;
    }
  }
  const candidates = allPotential;
  for (const el of candidates) {
    if (isOurs(el)) continue;
    if (!isVisible(el) || el.offsetParent === null || el.getBoundingClientRect().width < 100) continue;
    const isDialog = el.matches('[role="dialog"], [role="alertdialog"], .mat-dialog-container, .mat-snack-bar-container, .mat-snack-bar, [class*="dialog-container"], [class*="snackbar"]') || hasDialogContent(el);
    if (isDialog) {
      const pane = el.closest('.cdk-overlay-pane');
      return (pane && isVisible(pane)) ? pane : el;
    }
  }
  for (const doc of docs) {
    const cdkContainer = doc.querySelector('.cdk-overlay-container');
    if (!cdkContainer) continue;
    const panes = cdkContainer.querySelectorAll('.cdk-overlay-pane, [class*="overlay-pane"], .mat-snack-bar-container, .mat-snack-bar');
    for (const pane of panes) {
      if (isOurs(pane)) continue;
      if (!isVisible(pane) || pane.getBoundingClientRect().width < 150) continue;
      const text = (pane.textContent || '').toLowerCase();
      const hasLeaveText = text.includes('закрыть сайт') || text.includes('изменения могут') || text.includes('вы уверены') || text.includes('обязательные поля') || text.includes('не заполнен') || (text.includes('отмена') && text.includes('выйти')) || (text.includes('выйти') && text.includes('остаться'));
      if (hasLeaveText && pane.querySelector('button, [role="button"], [class*="button"], [class*="btn"], a, [class*="snack-bar-action"]')) {
        return pane;
      }
    }
  }
  for (const doc of docs) {
    const allOverlays = doc.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="dialog"], [class*="popup"], [class*="snackbar"]');
  for (const el of allOverlays) {
    if (isOurs(el)) continue;
    if (!isVisible(el) || el.getBoundingClientRect().width < 150) continue;
    const text = (el.textContent || '').toLowerCase();
    const hasLeaveText = text.includes('закрыть сайт') || text.includes('изменения могут') || text.includes('вы уверены') || text.includes('обязательные поля') || text.includes('не заполнен') || (text.includes('отмена') && text.includes('выйти')) || (text.includes('выйти') && text.includes('остаться'));
    if (hasLeaveText && el.querySelector('button, [role="button"], [class*="button"], [class*="btn"], a, [class*="snack-bar-action"]')) {
      return el;
    }
  }
  }
  const validationTextPattern = /обязательные поля|не заполнен|заполните обязательн|следующие обязательн/i;
  for (const doc of docs) {
    const anyWithValidation = doc.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container > *, [class*="dialog"], [class*="modal"], [class*="overlay-pane"], [class*="snackbar"], [class*="overlay"], [class*="mat-snack"]');
  for (const el of anyWithValidation) {
    if (isOurs(el)) continue;
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 50 && r.height < 30) continue;
    const text = (el.textContent || '').toLowerCase();
    if (validationTextPattern.test(text) && el.querySelector('button, [role="button"], [class*="button"], [class*="btn"], a')) {
      return el;
    }
  }
  }
  for (const doc of docs) {
    const anyOverlay = doc.querySelectorAll('.cdk-overlay-pane, [class*="overlay-pane"], [class*="modal"], [class*="dialog"], [class*="popup"], [role="dialog"], [role="alertdialog"]');
    for (const el of [...anyOverlay].sort(byZIndex)) {
      if (isOurs(el)) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 60) continue;
      const hasClose = el.querySelector('button, [role="button"], a, [class*="button"], [class*="btn"], [aria-label*="close" i], [aria-label*="закрыть" i], .mat-icon, [class*="close"], [class*="icon"]');
      if (hasClose) {
        return el;
      }
    }
  }
  return null;
}

/**
 * Закрывает всплывающее окно, нажимая подходящую кнопку:
 * 1) Крестик (×, close icon)
 * 2) OK, ОК, Закрыть, Понятно
 * 3) Для «Закрыть сайт?» / «Выйти?» — Отмена, Нет, Остаться
 * 4) Да, Yes
 * 5) Любая последняя кнопка
 */
TestPlayer.prototype._handleDialogDismissCancel = async function(dialog) {
  const doc = dialog?.ownerDocument || document;
  const text = (dialog?.textContent || '').toLowerCase();
  const isValidationDialog = /обязательные поля|не заполнен|следующие обязательн|заполните|required field|fill in/i.test(text);
  const isExitDialog = /закрыть сайт|изменения могут|выйти|остаться|потеря.*данн/i.test(text);
  if (isValidationDialog) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CLOSE_DIALOG_MAIN' });
      if (res?.closed) {
        await this.delay(250);
        return true;
      }
    } catch (e) {}
    try {
      const s = doc.createElement('script');
      s.textContent = `(function(){
        var all=document.querySelectorAll('.cdk-overlay-pane,[role="dialog"],.mat-dialog-container,.mat-mdc-dialog-container,[class*="dialog-container"],[class*="modal"]');
        for(var j=0;j<all.length;j++){
          var d=all[j];
          var txt=(d.textContent||'').toLowerCase();
          if(txt.indexOf('обязательные поля')<0&&txt.indexOf('не заполнен')<0)continue;
          var closeEl=d.querySelector('[aria-label*="close"],[aria-label*="закрыть"],[class*="close-icon"]');
          if(closeEl){closeEl.click();return true;}
          var btns=d.querySelectorAll('button,[role="button"],[class*="button"]');
          for(var i=0;i<btns.length;i++){
            var t=(btns[i].textContent||'').trim().toLowerCase();
            if(t==='ok'||t==='ок'){btns[i].click();return true;}
          }
          if(btns.length>0){btns[btns.length-1].click();return true;}
        }
        return false;
      })();`;
      (doc.body||doc.documentElement).appendChild(s);
      s.remove();
      await this.delay(300);
      if (!this._findVisibleDialog()) return true;
    } catch (e) {}
  }
  const buttons = dialog.querySelectorAll('button, [role="button"], a, [class*="button"], [class*="btn"], .mat-button, .mat-raised-button, .mat-flat-button, .mat-mdc-button, [class*="snack-bar-action"], .mat-dialog-actions button, .mat-mdc-dialog-actions button');
  const closeIconLabels = ['×', '✕', '✖', 'close', 'закрыть', 'x'];
  const okLabels = ['ok', 'ок', 'понятно', 'принято', 'закрыть', 'close'];
  const cancelLabels = ['отмена', 'отменить', 'cancel', 'нет', 'no', 'остаться', 'остаться на странице', 'stay'];
  const yesLabels = ['да', 'yes', 'подтвердить', 'да, удалить', 'удалить'];
  const win = doc?.defaultView || window;
  const tryClick = async (el) => {
    try {
      const targetDoc = el?.ownerDocument || doc;
      const targetWin = targetDoc?.defaultView || win;
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      await this.delay(50);
      try { el.focus?.(); } catch (e) {}
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: targetWin, clientX: cx, clientY: cy, buttons: 1 };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      await this.delay(80);
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      await this.delay(40);
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (e) {
      try {
        el.click();
        return true;
      } catch (e2) {
        try {
          const w = el?.ownerDocument?.defaultView || win;
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, view: w }));
          return true;
        } catch (e3) {
          return false;
        }
      }
    }
  };
  const getLabel = (el) => (el?.textContent || el?.getAttribute?.('aria-label') || el?.innerText || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const isDisabled = (el) => !!(el?.disabled || el?.getAttribute?.('aria-disabled') === 'true' || el?.closest?.('[aria-disabled="true"]'));
  const tryBtn = async (btn) => {
    if (isDisabled(btn)) return false;
    let ok = await tryClick(btn);
    if (!ok) { try { btn.click(); ok = true; } catch (e) {} }
    if (ok) { await this.delay(200); return true; }
    return false;
  };
  const verifyDialogClosed = async () => {
    await this.delay(250);
    return !this._findVisibleDialog();
  };
  const closeIcon = dialog.querySelector('[aria-label*="close" i], [aria-label*="закрыть" i], .mat-icon[class*="close"], [class*="close-icon"], [title*="close" i], [title*="закрыть" i], [data-mat-icon-name*="close"]');
  if (closeIcon && !isDisabled(closeIcon) && (await tryClick(closeIcon)) && (await verifyDialogClosed())) return true;
  for (const btn of buttons) {
    const label = getLabel(btn);
    const isClose = closeIconLabels.some(l => label === l || label.includes(l)) || /^[×✕✖x]$/i.test(label);
    if (isClose && (await tryBtn(btn)) && (await verifyDialogClosed())) return true;
  }
  const labelsByContext = isExitDialog ? cancelLabels : (isValidationDialog ? okLabels : [...okLabels, ...cancelLabels, ...yesLabels]);
  for (const btn of buttons) {
    const label = getLabel(btn);
    if (labelsByContext.some(l => label.includes(l) || label === l)) {
      if ((await tryBtn(btn)) && (await verifyDialogClosed())) return true;
    }
  }
  for (const btn of buttons) {
    const label = getLabel(btn);
    if (yesLabels.some(l => label.includes(l) || label === l) && !isExitDialog) {
      if ((await tryBtn(btn)) && (await verifyDialogClosed())) return true;
    }
  }
  if (buttons.length === 1 && (await tryBtn(buttons[0])) && (await verifyDialogClosed())) return true;
  if (buttons.length > 0) {
    const lastBtn = buttons[buttons.length - 1];
    if (!isDisabled(lastBtn)) {
      try { lastBtn.click(); await this.delay(200); if (await verifyDialogClosed()) return true; } catch (e) {}
    }
  }
  const iter = doc.createTreeWalker(dialog, NodeFilter.SHOW_ELEMENT, null, false);
  let n;
  while ((n = iter.nextNode())) {
    const txt = (n.textContent || '').trim().toLowerCase();
    if (txt === 'ok' || txt === 'ок') {
      const btn = (n.tagName === 'BUTTON' || n.tagName === 'A' || n.getAttribute?.('role') === 'button') ? n : n.closest?.('button, a, [role="button"]');
      if (btn && !isDisabled(btn) && (await tryClick(btn)) && (await verifyDialogClosed())) return true;
    }
  }
  const keyOpts = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true, view: win };
  dialog.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
  doc.body.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
  await this.delay(100);
  dialog.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
  doc.body.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
  await this.delay(150);
  if (!this._findVisibleDialog()) return true;
  const lastBtn = dialog.querySelector('button, [role="button"], .mat-button, .mat-raised-button');
  if (lastBtn) { try { lastBtn.focus(); await this.delay(50); } catch (e) {} }
  const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true, view: win };
  if (lastBtn) lastBtn.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
  dialog.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
  doc.body.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
  await this.delay(50);
  if (lastBtn) lastBtn.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
  dialog.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
  doc.body.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
  await this.delay(150);
  if (!this._findVisibleDialog()) return true;
  try {
      const script = doc.createElement('script');
      script.textContent = `(function(){
        var all=document.querySelectorAll('.cdk-overlay-pane,[role="dialog"],.mat-dialog-container,.mat-mdc-dialog-container,[class*="dialog-container"],[class*="modal"],[class*="overlay-pane"]');
        for(var j=0;j<all.length;j++){
          var d=all[j];
          if(!d.offsetParent||d.offsetWidth<80)continue;
          var closeEl=d.querySelector('[aria-label*="close"],[aria-label*="Close"],[aria-label*="закрыть"],[class*="close-icon"]');
          if(closeEl){closeEl.click();return;}
          var btns=d.querySelectorAll('button,[role="button"],[class*="button"]');
          for(var i=0;i<btns.length;i++){
            var t=(btns[i].textContent||'').trim().toLowerCase();
            if(t==='ok'||t==='ок'||t==='закрыть'||t==='понятно'||t==='отмена'||t==='нет'||t==='остаться'||t==='да'||t==='yes'){btns[i].click();return;}
          }
          if(btns.length>0){btns[btns.length-1].click();return;}
        }
      })();`;
      (doc.body || doc.documentElement).appendChild(script);
      script.remove();
      await this.delay(250);
      if (!this._findVisibleDialog()) return true;
    } catch (e) {}
  return false;
}

/**
 * Проверяет наличие открытого диалога и при необходимости закрывает его (Отмена/Cancel).
 * При maxRetries > 0 повторяет проверку с задержкой (для диалогов, появляющихся с задержкой).
 * Возвращает { handled: boolean, dialogText?: string }.
 */
TestPlayer.prototype._handleOpenDialogIfAny = async function(maxRetries = 0) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await this.delay(200 + attempt * 100);
    const dialog = this._findVisibleDialog();
    if (!dialog) continue;
    const dialogText = (dialog.textContent || '').trim().slice(0, 200);
    
    // КРИТИЧНО: Не закрывать модальные ФОРМЫ (Добавить согласующего и т.п.) — их обрабатывает _detectModalForm
    const inputs = dialog.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    const btns = dialog.querySelectorAll('button, [role="button"], input[type="submit"]');
    const hasSaveText = Array.from(btns).some(b => /сохранить|save|добавить|add|создать|create|применить|apply/i.test((b.textContent || b.value || '').toLowerCase()));
    if (inputs.length >= 1 && hasSaveText) {
      if (this.debugMode) console.log('📋 [Adaptive] Пропускаю закрытие — это модальная форма для заполнения');
      return { handled: false };
    }
    
    // Определяем тип диалога
    const isValidation = /обязательные поля|не заполнен|следующие обязательн|заполните|required|validation/i.test(dialogText);
    const isExit = /закрыть сайт|изменения могут|выйти|остаться|потеря.*данн|leave.*site|unsaved/i.test(dialogText);
    const isSuccess = /успешно|сохранено|завершено|success|saved|completed|добавлено|создано/i.test(dialogText);
    const isError = /ошибка|error|не удалось|failed|произошла ошибка/i.test(dialogText);
    
    let handled = await this._handleDialogDismissCancel(dialog);
    if (!handled) {
      await this.delay(300);
      handled = await this._handleDialogDismissCancel(dialog);
    }
    if (handled) {
      console.log('📋 [Adaptive] Закрыт диалог — остаёмся на странице для заполнения формы');
      this._recordDismissedDialog(dialogText);
      await this.delay(300);
      // Если это диалог валидации (обязательные поля) — заполняем поля и даём шанс сохранить
      if (isValidation) {
        try {
          console.log('📋 [Adaptive] Диалог валидации — заполняю обязательные поля');
          await this.handleAnalysis({
            type: 'analysis',
            subtype: 'analysis-fill-fields',
            fillOptions: { fillTarget: 'all', fillMode: 'random', charCount: 10, charset: 'lettersAndNumbers' }
          });
          await this.delay(500);
        } catch (e) {
          if (this.debugMode) console.warn('[Adaptive] Заполнение после валидации:', e?.message);
        }
      }
      return { handled: true, dialogText, isValidation, isExit, isSuccess, isError };
    }
  }
  return { handled: false };
}

/**
 * Записывает закрытый диалог в отчёт (runHistory).
 */
TestPlayer.prototype._recordDismissedDialog = function(dialogText) {
  if (!this.runHistory) return;
  this.runHistory.dismissedDialogs = this.runHistory.dismissedDialogs || [];
  this.runHistory.dismissedDialogs.push({
    text: dialogText,
    stepIndex: this.currentActionIndex,
    timestamp: new Date().toISOString()
  });
}

/**
 * Проверяет, доступны ли Chrome Extension API (контекст не инвалидирован).
 * Контекст инвалидируется при перезагрузке/обновлении расширения во время теста.
 */
TestPlayer.prototype._isExtensionContextValid = function() {
  try {
    return typeof chrome !== 'undefined' && !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Находит список селекторов для URL (с учётом возможных отличий query/hash)
 */
TestPlayer.prototype._findCollectedSelectorsForUrl = function(collectedSelectors, url) {
  if (!collectedSelectors || typeof collectedSelectors !== 'object') return null;
  if (collectedSelectors[url] && collectedSelectors[url].length > 0) {
    return collectedSelectors[url];
  }
  try {
    const urlObj = new URL(url);
    const base = urlObj.origin + urlObj.pathname;
    for (const [key, list] of Object.entries(collectedSelectors)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      try {
        const keyObj = new URL(key);
        if (keyObj.origin + keyObj.pathname === base) return list;
      } catch {
        if (key.startsWith(base)) return list;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Возвращает кандидатов селекторов из collectedSelectors по типу действия и опциональному selectorHint.
 * Используется для авто-подбора селектора, когда он не задан явно.
 */
TestPlayer.prototype._getCollectedCandidatesForAction = async function(innerAction, selectorHint) {
  const url = window.location.href;
  let collectedSelectors = {};
  try {
    if (!this._isExtensionContextValid()) return [];
    const stored = await chrome.storage.local.get(['collectedSelectors']);
    collectedSelectors = stored.collectedSelectors || {};
  } catch (e) {
    if (/Extension context invalidated/i.test(e?.message || '')) return [];
    throw e;
  }
  const list = this._findCollectedSelectorsForUrl(collectedSelectors, url);
  if (!list || list.length === 0) return [];

  const type = (innerAction.type || '').toLowerCase();
  const subtype = (innerAction.subtype || '').toLowerCase();
  const value = String(innerAction.value || innerAction.optionText || '').trim();
  const hint = String(selectorHint || '').trim().toLowerCase();

  const elementTypesByAction = {
    click: subtype === 'dropdown-select' || subtype === 'dropdown-multiselect'
      ? ['select', '[class*="select"]', '[role="combobox"]', '[role="listbox"]']
      : ['button', 'a', 'input', 'select', '[class*="select"]', '[role="combobox"]'],
    dblclick: ['button', 'a', 'input', 'div', 'span'],
    input: ['input', 'textarea', 'app-select', 'app-group-item-select'],
    change: ['select', 'input', '[class*="select"]', '[role="combobox"]', 'app-select', 'app-group-item-select'],
    scroll: ['div', 'span', 'section', 'main', 'article'],
    assert: ['button', 'a', 'input', 'select', 'textarea', 'div', 'span'],
    assertion: ['button', 'a', 'input', 'select', 'textarea', 'div', 'span'],
    hover: ['button', 'a', 'input', 'div', 'span'],
    focus: ['input', 'textarea', 'select', 'button', 'a'],
    blur: ['input', 'textarea', 'select', 'button', 'a'],
    clear: ['input', 'textarea'],
    screenshot: ['div', 'span', 'section', 'main', 'article', 'body'],
    wait: ['button', 'a', 'input', 'select', 'textarea', 'div', 'span']
  };

  let allowedTypes = elementTypesByAction[type] || ['button', 'a', 'input', 'select', 'textarea', 'div', 'span'];
  if (type === 'click' && hint && !['dropdown-select', 'dropdown-multiselect'].includes(subtype)) {
    const hintToTypes = { button: ['button'], input: ['input'], a: ['a'], link: ['a'], select: ['select', '[class*="select"]', '[role="combobox"]'] };
    const restricted = hintToTypes[hint];
    if (restricted) allowedTypes = restricted;
  }
  if (type === 'click' && !hint && !['dropdown-select', 'dropdown-multiselect'].includes(subtype)) {
    allowedTypes = ['button', 'a', 'select', '[class*="select"]', '[role="combobox"]'];
  }
  let candidates = list.filter(s => {
    const selectorType = (s.type || '').toLowerCase();
    return allowedTypes.some(allowedType => {
      // Точное совпадение тега
      if (selectorType === allowedType) return true;
      // Совпадение по атрибуту (например, [class*="select"])
      if (allowedType.startsWith('[') && s.selector && s.selector.includes(allowedType)) return true;
      return false;
    });
  });
  if (type === 'click' && candidates.length === 0 && !hint && !['dropdown-select', 'dropdown-multiselect'].includes(subtype)) {
    allowedTypes = ['button', 'a', 'select', '[class*="select"]', '[role="combobox"]', 'div'];
    candidates = list.filter(s => {
      const selectorType = (s.type || '').toLowerCase();
      return allowedTypes.some(allowedType => {
        if (selectorType === allowedType) return true;
        if (allowedType.startsWith('[') && s.selector && s.selector.includes(allowedType)) return true;
        return false;
      });
    });
  }

  const toSelectorObj = (s) => ({
    type: 'css',
    selector: s.selector,
    value: s.selector
  });

  if (candidates.length === 0) {
    // ИСПРАВЛЕНИЕ ПРОБЛЕМЫ #1: Если нет собранных селекторов, пытаемся найти элемент по тексту (selectorHint)
    if (hint || value) {
      console.log(`🔍 [Adaptive] Селекторы не найдены, ищу по тексту: "${hint || value}"`);
      const searchText = hint || value;
      const searchParts = searchText.split(/[\s\|,]+/).filter(Boolean);
      
      try {
        // Поиск элементов по тексту через XPath
        const foundElements = [];
        for (const part of searchParts) {
          const xpathQueries = [
            `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя'), '${part.toLowerCase()}')]`,
            `//*[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя'), '${part.toLowerCase()}')]`,
            `//*[contains(translate(@title, 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя'), '${part.toLowerCase()}')]`,
            `//*[contains(translate(@placeholder, 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя'), '${part.toLowerCase()}')]`
          ];
          
          for (const xpath of xpathQueries) {
            try {
              const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              for (let i = 0; i < Math.min(result.snapshotLength, 5); i++) {
                const el = result.snapshotItem(i);
                if (el && !foundElements.includes(el)) {
                  // Проверяем соответствие типу элемента
                  const tagName = el.tagName?.toLowerCase();
                  if (allowedTypes.some(at => at === tagName || (at.startsWith('[') && el.matches?.(at)))) {
                    foundElements.push(el);
                  }
                }
              }
            } catch (e) {
              // Ignore XPath errors
            }
          }
        }
        
        // Конвертируем найденные элементы в селекторы
        if (foundElements.length > 0) {
          console.log(`✅ [Adaptive] Найдено ${foundElements.length} элементов по тексту`);
          return foundElements.slice(0, 5).map(el => {
            // Генерируем CSS селектор для элемента
            let selector = '';
            if (el.id) {
              selector = `#${el.id}`;
            } else if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
              selector = classes ? `.${classes}` : el.tagName.toLowerCase();
            } else {
              selector = el.tagName.toLowerCase();
            }
            
            return {
              type: 'css',
              selector: selector,
              value: selector
            };
          });
        }
      } catch (e) {
        console.warn(`⚠️ [Adaptive] Ошибка поиска по тексту:`, e?.message);
      }
    }
    return [];
  }

  if (hint || value) {
    const score = (s) => {
      const label = String(s.label || '').toLowerCase();
      let sc = 0;
      if (hint && label.includes(hint)) sc += 10;
      if (value && label.includes(value.toLowerCase())) sc += 5;
      return sc;
    };
    candidates = [...candidates].sort((a, b) => score(b) - score(a));
  } else if (type === 'click' && !['dropdown-select', 'dropdown-multiselect'].includes(subtype)) {
    const btnScore = (s) => {
      const lbl = String(s.label || '').toLowerCase();
      const sel = String(s.selector || '').toLowerCase();
      let sc = 0;
      if (/\bbutton\b|btn|кнопк|mat-button|mat-raised|mat-fab|mat-icon-button/.test(lbl + ' ' + sel)) sc += 10;
      if (/\bcreate\b|создать|добавить|add|new|новый/.test(lbl + ' ' + sel)) sc += 5;
      if (/^#dashboard$|^\.dashboard\b/.test(sel)) sc -= 5;
      return sc;
    };
    candidates = [...candidates].sort((a, b) => btnScore(b) - btnScore(a));
  }

  return candidates.map(toSelectorObj);
}

/**
 * Получает селекторы для текущей страницы (из кэша или через analysis-selectors)
 */
TestPlayer.prototype._ensureSelectorsForAdaptive = async function() {
  if (!this._isExtensionContextValid()) {
    if (!this._extensionContextInvalidatedWarned) {
      this._extensionContextInvalidatedWarned = true;
      console.warn('⚠️ [Adaptive] Контекст расширения инвалидирован (перезагрузка/обновление). Селекторы недоступны. Перезапустите тест.');
    }
    return { success: false, fromCache: false };
  }
  const url = window.location.href;
  try {
    const stored = await chrome.storage.local.get(['collectedSelectors']);
    const collectedSelectors = stored.collectedSelectors || {};
    if (collectedSelectors[url] && collectedSelectors[url].length > 0) {
      return { success: true, fromCache: true };
    }
  } catch (e) {
    if (/Extension context invalidated/i.test(e?.message || '')) {
      this._extensionContextInvalidatedWarned = true;
      return { success: false, fromCache: false };
    }
    console.warn('⚠️ [Adaptive] Не удалось загрузить collectedSelectors:', e);
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_ANALYSIS',
      analysisType: 'analysis-selectors',
      url
    });
    if (response && response.success) {
      return { success: true, fromCache: false };
    }
  } catch (e) {
    if (/Extension context invalidated/i.test(e?.message || '')) {
      if (!this._extensionContextInvalidatedWarned) {
        this._extensionContextInvalidatedWarned = true;
        console.warn('⚠️ [Adaptive] Контекст расширения инвалидирован. Селекторы недоступны. Перезапустите тест.');
      }
      return { success: false, fromCache: false };
    }
    console.error('❌ [Adaptive] Ошибка получения селекторов:', e);
    throw new Error('Не удалось получить селекторы страницы: ' + (e.message || e));
  }
  throw new Error('Не удалось получить селекторы страницы');
}

/**
 * Обработчик адаптивного шага (универсальное действие)
 * Выполняет одно действие из перечня с гарантией выполнения.
 * Поддерживает: stepSpan, excludePreviousValues, maxRepeatCount, _runHistory, статистику ошибок.
 */
})();
