/**
 * AutoTest Recorder - Player Module
 * Adaptive mode handlers: single, auto, flow
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-adaptive
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-adaptive.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleAdaptive = async function(adaptiveAction) {
  // Маршрутизация по подтипу
  const subtype = adaptiveAction.subtype || 'adaptive-single';
  
  // adaptive-auto: всегда 1 прогон (maxRepeatCount не применяется — UI не показывает это поле)
  if (subtype === 'adaptive-auto') {
    return await this.handleAdaptiveAuto(adaptiveAction);
  }
  
  // adaptive-flow: пошаговый сценарий с контролем и вариациями
  if (subtype === 'adaptive-flow') {
    return await this.handleAdaptiveFlow(adaptiveAction);
  }

  // adaptive-single: одно действие из перечня (существующая логика)
  await this._handleOpenDialogIfAny(3);

  const innerAction = adaptiveAction.action;
  if (!innerAction || !innerAction.type) {
    throw new Error('Адаптивный шаг: не задано внутреннее действие (action.type)');
  }

  // Проверяем, является ли это dropdown-действием
  const isDropdownAction = (innerAction.type === 'change' && 
    (innerAction.subtype || '').toLowerCase().includes('dropdown')) ||
    (innerAction.type === 'click' && 
      (innerAction.subtype || '').toLowerCase().includes('dropdown'));

  // При входе на новую страницу — сначала заполнить все поля (Анализ: заполнить поля), затем сохранять/переходить
  // НО: НЕ заполнять dropdown, если это dropdown-действие (чтобы не конфликтовать)
  const currentUrl = window.location.href;
  if (this._lastFillFieldsUrl !== currentUrl && !isDropdownAction) {
    try {
      console.log('📋 [Adaptive] Новая страница — заполняю поля перед действием');
      await this.handleAnalysis({
        type: 'analysis',
        subtype: 'analysis-fill-fields',
        fillOptions: { fillTarget: 'empty', fillMode: 'random', charCount: 10, charset: 'lettersAndNumbers' }
      });
      this._lastFillFieldsUrl = currentUrl;
    } catch (e) {
      if (this.debugMode) console.warn('[Adaptive] Заполнение полей не удалось:', e?.message || e);
    }
  } else if (isDropdownAction) {
    console.log('📋 [Adaptive] Пропускаю автозаполнение — это dropdown-действие');
  }

  const excludePreviousValues = adaptiveAction.excludePreviousValues === true;
  const maxRepeatCount = Math.max(1, parseInt(adaptiveAction.maxRepeatCount, 10) || 1);
  if (!Array.isArray(adaptiveAction._runHistory)) {
    adaptiveAction._runHistory = [];
  }
  if (!adaptiveAction._statistics) {
    adaptiveAction._statistics = { stepsInvoked: 0, actionsInvoked: 0, errors: [] };
  }
  const stats = adaptiveAction._statistics;

  await this._ensureSelectorsForAdaptive();

  let lastUrl = window.location.href;
  let executions = 0;
  let lastError = null;

  for (let attempt = 0; attempt < maxRepeatCount; attempt++) {
    if (!this.isPlaying) break;

    const urlBefore = window.location.href;
    
    // Проверка смены URL и обновление селекторов
    if (urlBefore !== lastUrl) {
      console.log(`📋 [Adaptive-single] URL изменился: ${lastUrl} → ${urlBefore}`);
      try {
        console.log(`🔄 [Adaptive-single] Обновление селекторов для новой страницы...`);
        await this._ensureSelectorsForAdaptive();
        console.log(`✅ [Adaptive-single] Селекторы обновлены для новой страницы`);
      } catch (e) {
        console.warn(`⚠️ [Adaptive-single] Не удалось обновить селекторы:`, e?.message);
      }
      lastUrl = urlBefore;
    }
    
    const actionToRun = { ...innerAction };

    if (excludePreviousValues && adaptiveAction._runHistory.length > 0) {
      const lastRun = adaptiveAction._runHistory[adaptiveAction._runHistory.length - 1];
      if (lastRun.enteredValue !== undefined && lastRun.enteredValue !== null) {
        actionToRun.value = '';
      }
      if (lastRun.selectedOption !== undefined && lastRun.selectedOption !== null) {
        actionToRun.optionText = '';
        actionToRun.value = '';
      }
    }

    const innerNeedsSelector = ['click', 'dblclick', 'input', 'change', 'scroll', 'assert', 'assertion', 'hover', 'focus', 'blur', 'clear', 'screenshot', 'wait'].includes(actionToRun.type);
    const hasSelector = actionToRun.selector && (actionToRun.selector.selector || actionToRun.selector.value || (typeof actionToRun.selector === 'string' ? actionToRun.selector : ''));

    if (innerNeedsSelector && !hasSelector) {
      const selectorHint = actionToRun.selectorHint || adaptiveAction.selectorHint || adaptiveAction.action?.selectorHint || '';
      let candidates = await this._getCollectedCandidatesForAction(actionToRun, selectorHint);
      if (candidates.length === 0) {
        await this._ensureSelectorsForAdaptive();
        candidates = await this._getCollectedCandidatesForAction(actionToRun, selectorHint);
      }
      if (candidates.length === 0) {
        const { handled: dialogClosed } = await this._handleOpenDialogIfAny(3);
        if (dialogClosed) {
          candidates = await this._getCollectedCandidatesForAction(actionToRun, selectorHint);
        }
      }
      if (candidates.length === 0) {
        const isDropdown = (actionToRun.subtype || '').toLowerCase().includes('dropdown');
        const targetVal = String(actionToRun.value || actionToRun.optionText || '').trim();
        if (isDropdown && targetVal) {
          try {
            const res = await this.fillDropdownViaAnalysis(document.body, targetVal);
            if (res?.success) {
              return { success: true, executions: 1, lastError: null };
            }
          } catch (e) {
            if (this.debugMode) console.warn('[Adaptive] fillDropdownViaAnalysis fallback:', e.message);
          }
        }
        const ctxMsg = !this._isExtensionContextValid()
          ? ' Контекст расширения инвалидирован (перезагрузка/обновление). Перезапустите тест.'
          : '';
        throw new Error(`Адаптивный шаг: нет подходящих селекторов для действия "${actionToRun.type}/${actionToRun.subtype || 'click'}". Выполните шаг «Получить селекторы» перед этим шагом или укажите селектор вручную.${ctxMsg}`);
      }
      let executed = false;
      let lastCandidateError = null;
      for (let idx = 0; idx < candidates.length; idx++) {
        const sel = candidates[idx];
        try {
          actionToRun.selector = sel;
          await this.executeAction(actionToRun);
          executed = true;
          break;
        } catch (e) {
          lastCandidateError = e.message || String(e);
          if (this.debugMode) console.warn(`[Adaptive] Селектор ${this.formatSelector(sel)} не сработал:`, e.message);
        }
      }
      if (!executed) {
        const { handled: dialogClosed } = await this._handleOpenDialogIfAny(3);
        if (dialogClosed) {
          executed = false;
          for (let retryIdx = 0; retryIdx < candidates.length; retryIdx++) {
            const sel = candidates[retryIdx];
            try {
              actionToRun.selector = sel;
              await this.executeAction(actionToRun);
              executed = true;
              break;
            } catch (e) {
              if (this.debugMode) console.warn(`[Adaptive] Повтор после закрытия диалога: ${this.formatSelector(sel)} не сработал`);
            }
          }
        }
        if (!executed) {
          const isDropdown = (actionToRun.subtype || '').toLowerCase().includes('dropdown');
          const targetVal = String(actionToRun.value || actionToRun.optionText || '').trim();
          if (isDropdown && targetVal) {
            try {
              const res = await this.fillDropdownViaAnalysis(document.body, targetVal);
              if (res?.success) {
                return { success: true, executions: 1, lastError: null };
              }
            } catch (e) {
              if (this.debugMode) console.warn('[Adaptive] fillDropdownViaAnalysis после кандидатов:', e.message);
            }
          }
          throw new Error(`Адаптивный шаг: ни один из ${candidates.length} кандидатов не сработал. Проверьте, что страница загружена и элементы доступны.`);
        }
      }
    } else {
      try {
        await this.executeAction(actionToRun);
        executions++;
        stats.actionsInvoked++;
        
        // Проверка смены URL после выполнения
        const urlAfter = window.location.href;
        if (urlAfter !== urlBefore) {
          console.log(`📋 [Adaptive-single] URL изменился: ${urlBefore} → ${urlAfter}`);
          // Обновляем селекторы для новой страницы
          try {
            await this._ensureSelectorsForAdaptive();
            console.log(`✅ [Adaptive-single] Селекторы обновлены для новой страницы`);
          } catch (e) {
            console.warn(`⚠️ [Adaptive-single] Не удалось обновить селекторы:`, e?.message);
          }
        }
      } catch (err) {
        const { handled: dialogClosed } = await this._handleOpenDialogIfAny(3);
        if (dialogClosed) {
          try {
            await this.executeAction(actionToRun);
            executions++;
            stats.actionsInvoked++;
            
            // Проверка смены URL после retry
            const urlAfter = window.location.href;
            if (urlAfter !== urlBefore) {
              console.log(`📋 [Adaptive-single] URL изменился после retry: ${urlBefore} → ${urlAfter}`);
              try {
                await this._ensureSelectorsForAdaptive();
                console.log(`✅ [Adaptive-single] Селекторы обновлены`);
              } catch (e) {
                console.warn(`⚠️ [Adaptive-single] Не удалось обновить селекторы:`, e?.message);
              }
            }
          } catch (retryErr) {
            lastError = retryErr;
            stats.errors.push({
              attempt: attempt + 1,
              message: retryErr.message || String(retryErr),
              timestamp: new Date().toISOString()
            });
            adaptiveAction._runHistory.push({
              actionType: innerAction.type,
              subtype: innerAction.subtype || '',
              selector: this.formatSelector(innerAction.selector),
              value: innerAction.value ?? null,
              enteredValue: null,
              selectedOption: null,
              url: window.location.href,
              timestamp: new Date().toISOString(),
              success: false,
              error: retryErr.message || String(retryErr),
              attempt: attempt + 1
            });
            throw retryErr;
          }
        } else {
          lastError = err;
          stats.errors.push({
            attempt: attempt + 1,
            message: err.message || String(err),
            timestamp: new Date().toISOString()
          });
          adaptiveAction._runHistory.push({
            actionType: innerAction.type,
            subtype: innerAction.subtype || '',
            selector: this.formatSelector(innerAction.selector),
            value: innerAction.value ?? null,
            enteredValue: null,
            selectedOption: null,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            success: false,
            error: err.message || String(err),
            attempt: attempt + 1
          });
          throw err;
        }
      }
    }
  }

  if (this.runHistory && adaptiveAction._statistics) {
    this.runHistory.adaptiveStatistics = this.runHistory.adaptiveStatistics || {};
    const key = String(this.currentActionIndex ?? 'unknown');
    this.runHistory.adaptiveStatistics[key] = {
      stepsInvoked: stats.stepsInvoked,
      actionsInvoked: stats.actionsInvoked,
      errors: stats.errors,
      executions
    };
  }

  return { success: true, executions, lastError };
}

/**
 * Проверяет, пусто ли значение app-select / app-group-item-select (Angular)
 */
TestPlayer.prototype._isAppSelectEmpty = function(el) {
  if (!el) return true;
  const display = el.querySelector('.result__content, .result__value, .result, .placeholder, [class*="placeholder"], [ng-reflect-value]');
  const raw = (display?.textContent || display?.getAttribute?.('ng-reflect-app-tooltip') || el.getAttribute?.('ng-reflect-value') || '').trim();
  const ph = (el.getAttribute?.('placeholder') || el.getAttribute?.('ng-reflect-placeholder') || '').trim();
  if (raw && ph && (raw === ph || /^введите\s|^укажите\s|^выберите\s/i.test(raw))) return true;
  if (/не\s*указано|^введите\s|^укажите\s|^выберите\s/i.test(raw)) return true;
  if (/^выберите\s*$/i.test(raw)) return true;
  return !raw;
}

/**
 * Получает состояние всех форм на странице
 * Включает input, select, textarea и Angular app-select, app-group-item-select
 */
TestPlayer.prototype._getFormState = function() {
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
  const appSelects = document.querySelectorAll('app-select, app-group-item-select');
  const placeholderDivs = document.querySelectorAll('div.placeholder, div[class*="placeholder"]');
  
  let placeholderCount = 0;
  placeholderDivs.forEach(div => {
    if (div.closest('app-select, app-group-item-select')) return;
    const text = (div.textContent || '').trim();
    if (!/^выберите\s*$/i.test(text)) return;
    const style = window.getComputedStyle(div);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    placeholderCount++;
  });
  
  const state = {
    total: inputs.length + appSelects.length + placeholderCount,
    filled: 0,
    empty: 0,
    required: 0,
    emptyRequired: 0,
    fieldsByType: {
      text: [],
      select: [],
      checkbox: [],
      radio: [],
      textarea: []
    }
  };
  
  inputs.forEach(input => {
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    
    const type = input.type || input.tagName.toLowerCase();
    const isEmpty = !input.value || (input.type === 'checkbox' && !input.checked) || (input.type === 'radio' && !input.checked);
    const isRequired = input.required || input.getAttribute('aria-required') === 'true' || 
                      input.closest('[class*="required"]') !== null ||
                      input.closest('.required') !== null;
    
    if (isEmpty) {
      state.empty++;
      if (isRequired) state.emptyRequired++;
    } else {
      state.filled++;
    }
    
    if (isRequired) state.required++;
    
    if (type === 'select' || input.tagName === 'SELECT') {
      state.fieldsByType.select.push(input);
    } else if (type === 'checkbox') {
      state.fieldsByType.checkbox.push(input);
    } else if (type === 'radio') {
      state.fieldsByType.radio.push(input);
    } else if (input.tagName === 'TEXTAREA') {
      state.fieldsByType.textarea.push(input);
    } else {
      state.fieldsByType.text.push(input);
    }
  });
  
  appSelects.forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const isEmpty = this._isAppSelectEmpty(el);
    const isRequired = el.closest('[class*="required"]') !== null || !!el.querySelector('[class*="required"]');
    
    if (isEmpty) {
      state.empty++;
      if (isRequired) state.emptyRequired++;
    } else {
      state.filled++;
    }
    
    if (isRequired) state.required++;
    state.fieldsByType.select.push(el);
  });
  
  placeholderDivs.forEach(div => {
    if (div.closest('app-select, app-group-item-select')) return;
    const text = (div.textContent || '').trim();
    if (!/^выберите\s*$/i.test(text)) return;
    const style = window.getComputedStyle(div);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    state.empty++;
    state.fieldsByType.select.push(div);
  });
  
  return state;
}

/**
 * Получает текущие значения всех полей на странице
 * Возвращает Map с ключом селектор и значением поля
 */
TestPlayer.prototype._getCurrentFormValues = function() {
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
  const values = new Map();
  
  inputs.forEach(input => {
    // Игнорируем скрытые элементы
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    
    // Генерируем уникальный ключ для поля
    const key = this._getFieldKey(input);
    
    // Получаем значение
    let value;
    if (input.type === 'checkbox' || input.type === 'radio') {
      value = input.checked;
    } else {
      value = input.value || '';
    }
    
    values.set(key, value);
  });
  
  return values;
}

/**
 * Генерирует уникальный ключ для поля (name или id или селектор)
 */
TestPlayer.prototype._getFieldKey = function(input) {
  if (input.name) return `name:${input.name}`;
  if (input.id) return `id:${input.id}`;
  
  // Fallback: генерируем селектор
  const tag = input.tagName.toLowerCase();
  const type = input.type || '';
  const classes = Array.from(input.classList).slice(0, 2).join('.');
  return `${tag}${type ? `[type="${type}"]` : ''}${classes ? `.${classes}` : ''}`;
}

/**
 * Сравнивает два набора значений форм
 * Возвращает true если значения изменились
 */
TestPlayer.prototype._compareFormValues = function(oldValues, newValues) {
  if (!oldValues || !newValues) return true;
  
  // Проверяем что хотя бы одно поле изменилось
  let changed = false;
  
  for (const [key, oldValue] of oldValues.entries()) {
    const newValue = newValues.get(key);
    
    if (newValue !== undefined && oldValue !== newValue) {
      changed = true;
      if (this.debugMode) {
        console.log(`   🔄 Поле "${key}": "${oldValue}" → "${newValue}"`);
      }
    }
  }
  
  // Проверяем новые поля
  for (const [key, newValue] of newValues.entries()) {
    if (!oldValues.has(key) && newValue) {
      changed = true;
      if (this.debugMode) {
        console.log(`   🆕 Новое поле "${key}": "${newValue}"`);
      }
    }
  }
  
  return changed;
}

/**
 * Детектирует multi-step wizard формы
 * Ищет индикаторы прогресса и текст вида "Шаг X из Y"
 */
TestPlayer.prototype._detectWizard = function() {
  // Ищем текстовые индикаторы вида "Шаг 2 из 5" или "Step 2 of 5"
  const stepTextPatterns = [
    /шаг\s+(\d+)\s+(?:из|\/)\s+(\d+)/i,
    /step\s+(\d+)\s+(?:of|\/)\s+(\d+)/i,
    /этап\s+(\d+)\s+(?:из|\/)\s+(\d+)/i,
    /stage\s+(\d+)\s+(?:of|\/)\s+(\d+)/i,
    /(\d+)\s*\/\s*(\d+)/
  ];
  
  const bodyText = document.body.textContent;
  for (const pattern of stepTextPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      const currentStep = parseInt(match[1]);
      const totalSteps = parseInt(match[2]);
      
      // Проверяем валидность (шаги должны быть разумными)
      if (currentStep > 0 && totalSteps > 1 && currentStep <= totalSteps && totalSteps <= 20) {
        return {
          isWizard: true,
          currentStep: currentStep,
          totalSteps: totalSteps,
          progress: Math.round((currentStep / totalSteps) * 100),
          source: 'text-pattern'
        };
      }
    }
  }
  
  // Ищем progressbar элементы
  const progressBars = document.querySelectorAll('[role="progressbar"], .progress, .wizard-progress, [class*="step-indicator"]');
  for (const bar of progressBars) {
    // Проверяем aria-valuenow и aria-valuemax
    const current = parseInt(bar.getAttribute('aria-valuenow') || '0');
    const max = parseInt(bar.getAttribute('aria-valuemax') || '0');
    
    if (current > 0 && max > 1 && current <= max && max <= 20) {
      return {
        isWizard: true,
        currentStep: current,
        totalSteps: max,
        progress: Math.round((current / max) * 100),
        source: 'progressbar-aria'
      };
    }
    
    // Проверяем data-атрибуты
    const dataCurrent = parseInt(bar.getAttribute('data-step') || bar.getAttribute('data-current') || '0');
    const dataTotal = parseInt(bar.getAttribute('data-total') || bar.getAttribute('data-max') || '0');
    
    if (dataCurrent > 0 && dataTotal > 1 && dataCurrent <= dataTotal && dataTotal <= 20) {
      return {
        isWizard: true,
        currentStep: dataCurrent,
        totalSteps: dataTotal,
        progress: Math.round((dataCurrent / dataTotal) * 100),
        source: 'progressbar-data'
      };
    }
  }
  
  // Ищем элементы с классами step-X или active среди siblings
  const stepElements = document.querySelectorAll('[class*="step"]');
  const stepGroups = new Map();
  
  for (const el of stepElements) {
    const parent = el.parentElement;
    if (!parent) continue;
    
    if (!stepGroups.has(parent)) {
      stepGroups.set(parent, []);
    }
    stepGroups.get(parent).push(el);
  }
  
  for (const [parent, steps] of stepGroups.entries()) {
    if (steps.length >= 2 && steps.length <= 20) {
      // Ищем активный шаг
      let activeIndex = -1;
      for (let i = 0; i < steps.length; i++) {
        const el = steps[i];
        const classes = el.className.toLowerCase();
        if (classes.includes('active') || classes.includes('current') || 
            el.getAttribute('aria-current') === 'step') {
          activeIndex = i;
          break;
        }
      }
      
      if (activeIndex >= 0) {
        return {
          isWizard: true,
          currentStep: activeIndex + 1,
          totalSteps: steps.length,
          progress: Math.round(((activeIndex + 1) / steps.length) * 100),
          source: 'step-elements'
        };
      }
    }
  }
  
  return { isWizard: false };
}

/**
 * Генерирует селектор для ограничения области заполнения модальным окном.
 * Добавляет data-атрибут к элементу (сериализуемый scope для background).
 */
TestPlayer.prototype._getModalScopeSelector = function(modalInfo) {
  if (!modalInfo?.element) return null;
  const el = modalInfo.element;
  const id = 'at-modal-' + Date.now();
  el.setAttribute('data-autotest-modal-scope', id);
  return `[data-autotest-modal-scope="${id}"]`;
}

/**
 * Детектирует модальные формы и диалоги, которые требуют заполнения
 * Возвращает информацию о форме и рекомендуемые действия
 */
TestPlayer.prototype._detectModalForm = function() {
  const isVisible = (el) => {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const countFormFields = (el) => {
    const inputs = el.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    const appSelects = el.querySelectorAll('app-select, app-group-item-select');
    return inputs.length + appSelects.length;
  };
  const modalSelectors = [
    '[role="dialog"]', '.mat-dialog-container',
    '.modal.show', '.modal.active', '.modal.open',
    '[class*="modal"][style*="display: block"]',
    '[class*="dialog"].open', '[class*="dialog"].active',
    '.popup.active', '.popup.show', '[class*="overlay"].active',
    '.cdk-overlay-pane', '.ui-dialog', '.ant-modal', '.el-dialog',
    '[data-testid*="modal"]', '[data-testid*="dialog"]'
  ];
  let best = { el: null, fields: 0 };
  for (const selector of modalSelectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 80) continue;
      let candidate = el;
      let fields = countFormFields(el);
      if (selector === '.cdk-overlay-pane' && fields === 0) {
        const mat = el.querySelector('.mat-dialog-container');
        if (mat) {
          candidate = mat;
          fields = countFormFields(mat);
        } else if (rect.width < 250 || rect.height < 150) continue;
      }
      if (fields > best.fields || (fields > 0 && best.fields === 0)) {
        best = { el: candidate, fields };
      }
    }
    if (best.el && best.fields > 0) break;
  }
  const modalElement = best.el;
  if (!modalElement) {
    return { isModal: false };
  }

  // Проверяем наличие форм внутри модального окна (включая app-select, app-group-item-select)
  const forms = modalElement.querySelectorAll('form, [class*="form"]');
  const inputs = modalElement.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
  const appSelects = modalElement.querySelectorAll('app-select, app-group-item-select');
  const totalFields = inputs.length + appSelects.length;

  if (totalFields === 0) {
    return { isModal: true, hasForm: false, element: modalElement };
  }

  const getAppSelectEmpty = (el) => {
    const display = el.querySelector('.result__content, .result__value, .result, [ng-reflect-value]');
    const raw = (display?.textContent || display?.getAttribute?.('ng-reflect-app-tooltip') || el.getAttribute?.('ng-reflect-value') || '').trim();
    const ph = (el.getAttribute?.('placeholder') || el.getAttribute?.('ng-reflect-placeholder') || '').trim();
    if (raw && ph && (raw === ph || /^введите\s|^укажите\s|^выберите\s/i.test(raw))) return true;
    if (/не\s*указано|^введите\s|^укажите\s|^выберите\s/i.test(raw)) return true;
    return !raw;
  };

  const formState = {
    total: totalFields,
    filled: 0,
    empty: 0,
    required: 0,
    emptyRequired: 0
  };

  inputs.forEach(input => {
    const isEmpty = !input.value || (input.type === 'checkbox' && !input.checked);
    const isRequired = input.required || input.getAttribute('aria-required') === 'true' || 
                      input.closest('[class*="required"]') !== null;
    
    if (isEmpty) {
      formState.empty++;
      if (isRequired) formState.emptyRequired++;
    } else {
      formState.filled++;
    }
    
    if (isRequired) formState.required++;
  });

  appSelects.forEach(el => {
    const isEmpty = getAppSelectEmpty(el);
    const isRequired = el.closest('[class*="required"]') !== null || !!el.querySelector('[class*="required"]');
    
    if (isEmpty) {
      formState.empty++;
      if (isRequired) formState.emptyRequired++;
    } else {
      formState.filled++;
    }
    
    if (isRequired) formState.required++;
  });

  // Ищем кнопки внутри модального окна
  const buttons = {
    save: [],
    close: [],
    cancel: []
  };

  const allButtons = modalElement.querySelectorAll('button, [role="button"], input[type="submit"]');
  
  allButtons.forEach(btn => {
    const text = (btn.textContent || btn.value || '').toLowerCase().trim();
    const style = window.getComputedStyle(btn);
    
    if (style.display === 'none' || style.visibility === 'hidden') return;
    
    // Кнопки сохранения/отправки
    if (/сохранить|save|отправить|submit|создать|create|добавить|add|применить|apply|готово|done|ok|да|yes/.test(text)) {
      buttons.save.push(btn);
    }
    // Кнопки закрытия без сохранения
    else if (/закрыть|close|отмена|cancel|отменить|нет|no/.test(text)) {
      buttons.cancel.push(btn);
    }
    // Кнопка закрытия (X)
    else if (/×|✕|close/i.test(text) || btn.className.includes('close')) {
      buttons.close.push(btn);
    }
  });

  return {
    isModal: true,
    hasForm: true,
    element: modalElement,
    formState: formState,
    buttons: buttons,
    needsFilling: formState.empty > 0,
    requiresAction: formState.emptyRequired > 0
  };
}

/**
 * Обрабатывает модальную форму: заполняет и сохраняет или закрывает
 * @param {Object} modalInfo - Информация о модальной форме из _detectModalForm
 * @param {string} fillMode - Режим заполнения ('required', 'all', 'empty')
 * @param {boolean} shouldSave - Сохранить (true) или закрыть без сохранения (false)
 */
TestPlayer.prototype._handleModalForm = async function(modalInfo, fillMode = 'required', shouldSave = true, retryAttempt = 0, options = {}, context = {}) {
  if (!modalInfo.isModal || !modalInfo.hasForm) {
    return { success: false, message: 'Not a modal form' };
  }

  const actions = [];
  const { state, navGraph, currentUrl } = context;

  try {
    // КРИТИЧНО: Обновить селекторы для модального окна
    console.log(`🔄 [ModalForm] Обновление селекторов для модальной формы...`);
    try {
      await this._ensureSelectorsForAdaptive();
      console.log(`✅ [ModalForm] Селекторы обновлены`);
    } catch (e) {
      console.warn(`⚠️ [ModalForm] Не удалось обновить селекторы:`, e?.message);
    }
    
    // 1. Заполнить поля если нужно (пропускаем если уже заполнено через analysis-fill-fields в adaptive)
    if (!options.skipFill && modalInfo.needsFilling && shouldSave) {
      console.log(`📝 [ModalForm] Заполнение полей (режим: ${fillMode})`);
      
      // Используем существующий метод заполнения полей
      const scopeSelector = this._getModalScopeSelector(modalInfo);
      await this.handleAnalysis({
        type: 'analysis',
        subtype: 'analysis-fill-fields',
        fillOptions: { 
          fillTarget: fillMode, 
          fillMode: 'random', 
          charCount: 10, 
          charset: 'lettersAndNumbers',
          scopeSelector
        }
      });
      
      actions.push({ action: 'fill-fields', fields: modalInfo.formState.empty });
      await this.delay(300);
    }

    let actuallySaved = false;
    // 2. Нажать кнопку сохранения или закрытия
    if (shouldSave && modalInfo.buttons.save.length > 0) {
      const saveBtn = modalInfo.buttons.save[0];
      const saveDisabled = !!(saveBtn.disabled || saveBtn.getAttribute?.('aria-disabled') === 'true' || saveBtn.closest?.('[aria-disabled="true"]'));
      if (saveDisabled) {
        console.log(`⚠️ [ModalForm] Кнопка сохранения отключена (обязательные поля не заполнены), закрываю через Отмена`);
        const closeBtn = modalInfo.buttons.cancel[0] || modalInfo.buttons.close[0];
        if (closeBtn) {
          closeBtn.click();
          actions.push({ action: 'click', button: 'cancel', text: closeBtn.textContent.trim() });
          await this.delay(500);
        }
        actuallySaved = false;
      } else {
        console.log(`💾 [ModalForm] Нажатие кнопки сохранения: "${saveBtn.textContent.trim()}"`);
        saveBtn.click();
        actions.push({ action: 'click', button: 'save', text: saveBtn.textContent.trim() });
        const btnKey = this._getButtonKey({ selector: saveBtn.id ? `#${saveBtn.id}` : (saveBtn.className ? `button.${String(saveBtn.className).split(' ').filter(c=>c).slice(0,2).join('.')}` : 'button'), textLower: (saveBtn.textContent||'').toLowerCase().trim() });
        if (state) state.clickedButtons?.add(btnKey);
        if (navGraph && currentUrl) navGraph.markButtonClicked(currentUrl, btnKey, window.location.href, true);
        await this.delay(500);
        actuallySaved = true;
      }
    } else if (!shouldSave) {
      // Пробуем кнопку отмены, затем закрытия
      const closeBtn = modalInfo.buttons.cancel[0] || modalInfo.buttons.close[0];
      if (closeBtn) {
        console.log(`❌ [ModalForm] Закрытие без сохранения: "${closeBtn.textContent.trim()}"`);
        
        closeBtn.click();
        actions.push({ action: 'click', button: 'cancel', text: closeBtn.textContent.trim() });
        await this.delay(500);
      }
      actuallySaved = false;
    }

    return { 
      success: true, 
      actions: actions,
      saved: actuallySaved
    };
  } catch (error) {
    console.error(`⚠️ [ModalForm] Ошибка обработки:`, error.message);
    return { 
      success: false, 
      error: error.message,
      actions: actions
    };
  }
}

/**
 * Заполняет поле даты: двойной клик (вставка сегодня) или DD.MM.YYYY.
 * @returns {Promise<boolean>}
 */
TestPlayer.prototype._tryDateFieldFill = async function(el) {
  if (!el) return false;
  const type = (el.type || 'text').toLowerCase();
  const ctx = (el.placeholder || '') + (el.name || '') + (el.id || '') + (el.getAttribute?.('aria-label') || '') +
    (el.closest?.('label')?.textContent || '') + (el.closest?.('[class*="field"], [class*="form"]')?.textContent || '').slice(0, 100);
  const isDateLike = ['date', 'datetime-local', 'month', 'week'].includes(type) ||
    /дд\.мм|dd\.mm|гггг|yyyy|date|дата|срок|согласовать|calendar|datepicker|date-picker/i.test(ctx);
  if (!isDateLike) return false;
  const hasVal = (el.value || '').trim().replace(/\s/g, '');
  if (hasVal && /^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(hasVal)) return false;
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const ruDate = `${dd}.${mm}.${yyyy}`;
  try {
    if (type === 'date' || type === 'datetime-local') {
      el.value = d.toISOString().slice(0, 10);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    el.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    await this.delay(100);
    el.focus();
    el.click();
    await this.delay(300);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
    await this.delay(600);
    let afterDbl = (el.value || '').trim().replace(/\s/g, '');
    if (afterDbl && /^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(afterDbl)) return true;
    const tryCalendar = async () => {
      const wrapper = el.closest?.('[class*="date"], [class*="picker"], [class*="datepicker"], mat-form-field');
      const icon = wrapper?.querySelector?.('.mat-datepicker-toggle, .mat-icon-button, button[mat-icon-button], [class*="calendar"], [class*="icon"], [mat-datepicker-toggle]');
      if (icon) {
        icon.click();
      } else {
        el.click();
      }
      for (let w = 0; w < 5; w++) {
        await this.delay(400);
        const todayCell = document.querySelector('.mat-calendar-body-today, .mat-calendar-body-cell.mat-calendar-body-active');
        const todayAria = document.querySelector('[aria-label*="сегодня"], [aria-label*="Сегодня"], [aria-label*="today"], [aria-label*="Today"]');
        const btn = todayCell || todayAria;
        if (btn) {
          btn.click();
          await this.delay(500);
          afterDbl = (el.value || '').trim().replace(/\s/g, '');
          if (afterDbl && /^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(afterDbl)) return true;
        }
      }
      return false;
    };
    if (await tryCalendar()) return true;
    if (!el.readOnly && el.getAttribute?.('readonly') !== 'readonly') {
      el.focus();
      el.value = ruDate;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Прямое заполнение текстовых полей (fallback когда analysis возвращает 0).
 * Пропускает combobox и readOnly.
 * @returns {Promise<number>} количество заполненных полей
 */
TestPlayer.prototype._tryDirectTextFill = async function(formState, maxFields = 5) {
  let filled = 0;
  const isDateLike = (el) => {
    const type = (el.type || 'text').toLowerCase();
    if (['date', 'datetime-local', 'month', 'week'].includes(type)) return true;
    const ph = (el.placeholder || el.getAttribute?.('placeholder') || el.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase();
    const name = (el.name || el.id || el.getAttribute?.('aria-label') || '').toLowerCase();
    const labelText = (el.closest?.('label')?.textContent || el.closest?.('[class*="form-field"], [class*="form-group"], .mat-form-field')?.textContent || '').slice(0, 150).toLowerCase();
    const ctx = ph + ' ' + name + ' ' + labelText;
    return /дд\.мм|dd\.mm|date|дата|срок|согласовать|calendar|datepicker|date-picker|mat-datepicker/i.test(ctx);
  };
  const isComboboxLike = (el) => {
    if (isDateLike(el)) return false; // date fields: fill via calendar, not skip
    if (el.readOnly || el.getAttribute?.('aria-readonly') === 'true') return true;
    const ph = (el.placeholder || el.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase();
    if (/выберите|укажите|select|choose|или введите/i.test(ph)) return true;
    return !!el.closest('app-select, [class*="select"], [class*="combobox"], [class*="dropdown"]');
  };
  const tryFill = async (el) => {
    if (!el || filled >= maxFields) return;
    const type = (el.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type)) return;
    const skipCombobox = isComboboxLike(el);
    if (skipCombobox) return;
    const hasVal = (el.value || '').trim().length > 0;
    if (hasVal) return;
    const isDate = isDateLike(el);
    try {
      if (type === 'date' || type === 'datetime-local') {
        el.value = new Date().toISOString().slice(0, 10);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      } else if (isDateLike(el)) {
        if (await this._tryDateFieldFill(el)) filled++;
      } else if (type === 'number') {
        el.value = '1';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      } else if (el.tagName === 'TEXTAREA') {
        el.value = 'Тест';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      } else {
        el.value = 'Тест';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      }
    } catch (e) {}
  };
  const textFields = formState.fieldsByType?.text || [];
  const dateFirst = [...textFields].sort((a, b) => (isDateLike(b) ? 1 : 0) - (isDateLike(a) ? 1 : 0));
  for (const el of dateFirst.slice(0, maxFields)) {
    await tryFill(el);
  }
  for (const el of (formState.fieldsByType?.textarea || []).slice(0, 2)) {
    await tryFill(el);
  }
  return filled;
}

/**
 * Пытается заполнить combobox (input с "Выберите или введите") через dropdown.
 * @returns {{ success: boolean, value?: string }}
 */
TestPlayer.prototype._tryComboboxFill = async function(input) {
  if (!input || input.tagName !== 'INPUT') return { success: false };
  const ph = (input.placeholder || input.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase();
  if (!/выберите|укажите|select|choose|или введите/i.test(ph)) return { success: false };
  const getDisplayValue = () => {
    const container = input.closest?.('app-select, .ant-select, .el-select, [class*="select"], [class*="combobox"], .select-box, [class*="ng-select"]') || input.parentElement;
    const display = container?.querySelector?.('[class*="selection"], .result__content, .result__value, .result:not(input), [class*="selection-item"]');
    return (display?.textContent || input.value || input.getAttribute?.('ng-reflect-value') || '').trim();
  };
  const raw = getDisplayValue();
  if (raw && raw.length > 2 && !/^введите\s|^укажите\s|^выберите\s/i.test(raw)) return { success: false };
  const isVisible = (el) => el && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
  const isSafeOption = (el) => !el?.closest('a') && el?.tagName !== 'A' && !/^(да|нет|отменить|cancel|ok)$/i.test((el?.textContent || '').trim());
  const isSelectableOption = (txt) => {
    if (!txt || txt.length < 2) return false;
    const t = txt.replace(/^[—–-\s]+/, '').trim();
    if (/^[А-ЯA-Z\s:]+$/.test(t)) return false;
    return t.includes('(') || /фз|пп|рп|пр|закон|план/i.test(t) || t.length > 4;
  };
  const inputHasResultClass = input.classList?.contains?.('result') || (input.className || '').includes?.('result');
  let container = input.closest('app-select, .ant-select, .el-select, [class*="select"], [class*="combobox"], [class*="dropdown"], .select-box, [class*="ng-select"]') || input.parentElement;
  let p = input.parentElement;
  while (p && p !== document.body) {
    if (p.querySelector('.arrow, [class*="arrow"], [class*="caret"], [class*="suffix"], .options, [class*="options"]')) { container = p; break; }
    p = p.parentElement;
  }
  let trigger = container?.querySelector('.arrow, [class*="arrow"], [class*="caret"], [class*="suffix"], .select-box, [class*="select-box"]');
  if (!trigger && inputHasResultClass) trigger = input;
  if (!trigger) trigger = container?.querySelector('.result:not(input), input.result, input[class*="result"]') || container?.querySelector('input, [role="combobox"]') || container || input;
  if (!trigger) return { success: false };
  trigger.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  await this.delay(100);
  try {
    input.focus();
    if (inputHasResultClass) {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
      input.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
    }
    if (trigger !== input) {
      trigger.click();
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
    }
  } catch (e) {}
  await this.delay(1200);
  const overlayRoot = document.querySelector('.cdk-overlay-container');
  const panelSelectors = '.ant-select-dropdown, .el-select-dropdown, .cdk-overlay-pane, .options, .content-list, [role="listbox"], [class*="dropdown"]:not([class*="modal"]), [class*="overlay-pane"], nz-option-container, [class*="options"]';
  const optionSelectors = '[role="option"], .ant-select-item-option, .el-select-dropdown__item, .mat-option, .ng-option, li[role="option"], .cdk-option, .option, .option.cutted-text, .result__content, .result__item, [class*="option-item"], [class*="select-item"], div[class*="item-option"]';
  const collectOptions = () => {
    let panels = overlayRoot ? overlayRoot.querySelectorAll(panelSelectors) : document.querySelectorAll(panelSelectors);
    if (!panels.length) panels = document.querySelectorAll(panelSelectors);
    const options = [];
    for (const pane of Array.from(panels).filter(p => p && isVisible(p))) {
      for (const o of pane.querySelectorAll(optionSelectors)) {
        const txt = (o.textContent || '').trim();
        if (txt && isVisible(o) && (o.offsetParent !== null || o.offsetHeight > 0) && isSelectableOption(txt) && isSafeOption(o)) options.push(o);
      }
    }
    return options;
  };
  let options = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    await this.delay(attempt === 0 ? 500 : 300);
    options = collectOptions();
    if (options.length > 0) break;
  }
  if (options.length === 0) return { success: false };
  const chosen = options[0];
  const chosenText = (chosen.textContent || '').trim().replace(/^[—–-]\s*/, '');
  chosen.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  await this.delay(300);
  try { chosen.click(); } catch (e) {}
  const rect = chosen.getBoundingClientRect();
  chosen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  chosen.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  chosen.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  await this.delay(500);
  for (let v = 0; v < 3; v++) {
    await this.delay(200);
    const afterRaw = getDisplayValue();
    const filled = afterRaw.length > 2 && !/^введите\s|^укажите\s|^выберите\s/i.test(afterRaw);
    if (filled) return { success: true, value: chosenText };
    const containerCheck = input.closest?.('[class*="select"], [class*="combobox"], app-select, .select-box') || input.parentElement;
    const hasChosenInContainer = containerCheck && (containerCheck.textContent || '').includes(chosenText);
    if (hasChosenInContainer) return { success: true, value: chosenText };
  }
  return { success: false };
}

/**
 * Пытается заполнить app-select / app-group-item-select (Angular) одной опцией.
 * Fallback когда analysis-fill-fields не справляется.
 * @returns {{ success: boolean, value?: string }}
 */
TestPlayer.prototype._tryAppSelectFill = async function(container) {
  const isAppSelect = /^app-select|app-group-item-select$/i.test(container?.tagName || '');
  const isPlaceholderDiv = container?.matches?.('div.placeholder, div[class*="placeholder"]') && /^выберите\s*$/i.test((container.textContent || '').trim());
  if (!container || (!isAppSelect && !isPlaceholderDiv)) return { success: false };
  if (isAppSelect && !this._isAppSelectEmpty(container)) return { success: false };
  if (isPlaceholderDiv) { /* уже пустой по определению */ }
  const isVisible = (el) => {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const isSafeOption = (el) => {
    if (!el || el.closest('a') || el.tagName === 'A') return false;
    const txt = (el.textContent || '').trim();
    if (/^(да|нет|отменить|cancel|ok|add)$/i.test(txt)) return false;
    return true;
  };
  const isSelectableOption = (txt) => {
    if (!txt || txt.length < 2) return false;
    const t = txt.replace(/^[—–-\s]+/, '').trim();
    if (/^[А-ЯA-Z\s:]+$/.test(t)) return false;
    return t.includes('(') || /фз|пп|рп|пр|закон|план|указано/i.test(t) || t.length > 5;
  };
  const effectiveContainer = (container?.matches?.('div.placeholder, div[class*="placeholder"]')
    ? container.closest('app-select, app-group-item-select') || container.closest('.select-box') || container
    : container);
  effectiveContainer.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  await this.delay(100);
  const clickTargets = [
    () => effectiveContainer.querySelector('.options, [class*="options"]'),
    () => effectiveContainer.querySelector('.arrow.isShowOptions, .arrow[class*="isShowOptions"], .arrow, [class*="arrow"]'),
    () => effectiveContainer.querySelector('.select-box, .result, .placeholder, [class*="placeholder"], [class*="select-box"]'),
    () => effectiveContainer
  ];
  const trigger = clickTargets[0]() || clickTargets[1]() || clickTargets[2]() || clickTargets[3]();
  if (!trigger) return { success: false };
  try { trigger.focus?.(); trigger.click(); } catch (e) {}
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
  await this.delay(800);
  const overlayRoot = document.querySelector('.cdk-overlay-container');
  const panelSelectors = '.ant-select-dropdown, .el-select-dropdown, .cdk-overlay-pane, .options, .content-list, [role="listbox"], [class*="dropdown"]:not([class*="modal"]), [class*="overlay-pane"], nz-option-container';
  const optionSelectors = '[role="option"], .ant-select-item-option, .el-select-dropdown__item, .ant-select-item, .mat-option, .ng-option, nz-option-item, li[role="option"], .cdk-option, li.ant-select-item, div.ant-select-item, [class*="option-item"], [class*="select-item"], div[class*="item-option"], .option, .option.cutted-text, .result__content, .result__item';
  const collectOptions = () => {
    let panels = overlayRoot ? overlayRoot.querySelectorAll(panelSelectors) : document.querySelectorAll(panelSelectors);
    if (!panels.length) panels = document.querySelectorAll(panelSelectors);
    panels = Array.from(panels).filter(p => p && isVisible(p));
    const options = [];
    for (const p of panels) {
      for (const o of p.querySelectorAll(optionSelectors)) {
        const txt = (o.textContent || '').trim();
        if (txt && isVisible(o) && (o.offsetParent !== null || o.offsetHeight > 0) && (isSelectableOption(txt) || txt.length > 4) && isSafeOption(o)) options.push(o);
      }
    }
    if (options.length === 0) {
      for (const o of effectiveContainer.querySelectorAll('.option, .option.cutted-text, .result__content, .result__item, [role="option"], li')) {
        const txt = (o.textContent || '').trim();
        if (txt && isVisible(o) && (isSelectableOption(txt) || txt.length > 4) && isSafeOption(o) && !effectiveContainer.querySelector('.result, .result__value')?.contains?.(o)) options.push(o);
      }
    }
    return options;
  };
  let options = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    await this.delay(attempt === 0 ? 400 : 250);
    options = collectOptions();
    if (options.length > 0) break;
  }
  if (options.length === 0) return { success: false };
  const chosen = options[0];
  const chosenText = (chosen.textContent || '').trim().replace(/^[—–-]\s*/, '');
  chosen.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  await this.delay(300);
  try { chosen.click(); } catch (e) {}
  const rect = chosen.getBoundingClientRect();
  chosen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  chosen.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  chosen.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  await this.delay(500);
  const filled = isPlaceholderDiv
    ? (() => { const t = (container.textContent || '').trim(); return t.length > 2 && !/^выберите\s*$/i.test(t); })()
    : !this._isAppSelectEmpty(container);
  return filled ? { success: true, value: chosenText } : { success: false };
}

/**
 * Пробует разные опции в dropdown для исследования вариантов
 */
TestPlayer.prototype._tryDropdownOptions = async function(selectElement, maxOptions = 5) {
  if (!selectElement || selectElement.tagName !== 'SELECT') return [];
  
  const options = Array.from(selectElement.options).filter(opt => !opt.disabled && opt.value);
  if (options.length <= 1) return [];
  
  const tried = [];
  const currentValue = selectElement.value;
  
  for (let i = 0; i < Math.min(options.length, maxOptions); i++) {
    const option = options[i];
    
    if (option.value === currentValue) continue;
    
    try {
      selectElement.value = option.value;
      selectElement.dispatchEvent(new Event('change', { bubbles: true }));
      selectElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      await this.delay(300);
      
      tried.push({
        value: option.value,
        text: option.text,
        index: i
      });
      
      if (this.debugMode) {
        console.log(`✅ [Dropdown] Выбрана опция: "${option.text}"`);
      }
    } catch (e) {
      if (this.debugMode) console.warn(`[Dropdown] Ошибка при выборе опции:`, e);
    }
  }
  
  return tried;
}

/**
 * Переключает checkbox в обоих состояниях для тестирования
 */
TestPlayer.prototype._tryCheckboxToggle = async function(checkbox, iterations = 2) {
  if (!checkbox || checkbox.type !== 'checkbox') return [];
  
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const beforeState = checkbox.checked;
      checkbox.checked = !checkbox.checked;
      
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      
      await this.delay(200);
      
      results.push({
        state: checkbox.checked ? 'checked' : 'unchecked',
        iteration: i + 1
      });
      
      if (this.debugMode) {
        console.log(`✅ [Checkbox] ${checkbox.checked ? 'Включён' : 'Выключен'}`);
      }
    } catch (e) {
      if (this.debugMode) console.warn(`[Checkbox] Ошибка при toggle:`, e);
    }
  }
  
  return results;
}

/**
 * Выполняет основное действие шага flow
 */
TestPlayer.prototype._executeFlowStepAction = async function(flowStep, adaptiveAction) {
  const actions = flowStep.actions || [];
  if (actions.length === 0) {
    return { success: false, error: 'No actions defined' };
  }

  // Пока поддерживаем одно действие на шаг
  const action = actions[0];

  try {
    switch (action.type) {
      case 'fill-fields':
        await this.handleAnalysis({
          type: 'analysis',
          subtype: 'analysis-fill-fields',
          fillOptions: {
            fillTarget: action.fillTarget || 'required',
            fillMode: 'random',
            charCount: 10,
            charset: 'lettersAndNumbers'
          }
        });
        return { success: true, type: 'fill-fields', fillTarget: action.fillTarget };

      case 'click':
        const button = await this._findButtonByHint(action.selectorHint);
        if (!button) {
          return { success: false, error: 'Button not found', hint: action.selectorHint };
        }
        await this._clickElement(button);
        await this.delay(500);
        return { success: true, type: 'click', button: button.text };

      case 'select-dropdown':
        const dropdown = await this._findDropdownByHint(action.selectorHint);
        if (!dropdown) {
          return { success: false, error: 'Dropdown not found', hint: action.selectorHint };
        }
        const options = Array.from(dropdown.options).filter(opt => opt.value);
        if (options.length > 1) {
          const option = options[1]; // Выбираем первую не-пустую опцию
          dropdown.value = option.value;
          dropdown.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, type: 'select-dropdown', value: option.text };
        }
        return { success: false, error: 'No options available' };

      case 'toggle-checkbox':
        const checkbox = await this._findCheckboxByHint(action.selectorHint);
        if (!checkbox) {
          return { success: false, error: 'Checkbox not found', hint: action.selectorHint };
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, type: 'toggle-checkbox', state: checkbox.checked ? 'checked' : 'unchecked' };

      case 'input':
        const input = await this._findInputByHint(action.selectorHint);
        if (!input) {
          return { success: false, error: 'Input not found', hint: action.selectorHint };
        }
        input.value = action.value || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, type: 'input', value: action.value };

      default:
        return { success: false, error: 'Unknown action type', type: action.type };
    }
  } catch (error) {
    return { success: false, error: error.message, type: action.type };
  }
}

/**
 * Пробует вариации на шаге flow
 */
TestPlayer.prototype._tryFlowStepVariations = async function(flowStep, maxVariations, adaptiveAction) {
  const variations = [];
  const actions = flowStep.actions || [];
  if (actions.length === 0) return variations;

  const action = actions[0];

  try {
    // Вариации для select-dropdown
    if (action.type === 'select-dropdown' && flowStep.variations.tryAllOptions) {
      const dropdown = await this._findDropdownByHint(action.selectorHint);
      if (dropdown) {
        const options = Array.from(dropdown.options).filter(opt => opt.value).slice(1, maxVariations + 1);

        for (const option of options) {
          // Сохраняем snapshot перед вариацией
          if (flowStep.variations.saveSnapshotBeforeVariation) {
            await this._saveSnapshot(adaptiveAction, `variation-${option.value}`, flowStep.name);
          }

          dropdown.value = option.value;
          dropdown.dispatchEvent(new Event('change', { bubbles: true }));
          await this.delay(300);

          variations.push({
            type: 'dropdown-option',
            value: option.value,
            text: option.text,
            timestamp: new Date().toISOString()
          });

          // Восстанавливаем snapshot после вариации
          if (flowStep.variations.restoreAfterVariation && adaptiveAction._snapshots.length > 0) {
            const lastSnapshot = adaptiveAction._snapshots[adaptiveAction._snapshots.length - 1];
            await this._restoreSnapshot(adaptiveAction, adaptiveAction._snapshots.length - 1);
          }
        }
      }
    }

    // Вариации для fill-fields
    if (action.type === 'fill-fields' && flowStep.variations.tryDifferentValues) {
      const fillModes = ['random', 'realistic', 'edge-cases'].slice(0, Math.min(maxVariations, 3));

      for (const fillMode of fillModes) {
        await this.handleAnalysis({
          type: 'analysis',
          subtype: 'analysis-fill-fields',
          fillOptions: {
            fillTarget: action.fillTarget || 'required',
            fillMode: fillMode,
            charCount: 10,
            charset: 'lettersAndNumbers'
          }
        });

        variations.push({
          type: 'fill-variation',
          fillMode: fillMode,
          timestamp: new Date().toISOString()
        });

        await this.delay(200);
      }
    }

    // Вариации для click
    if (action.type === 'click' && flowStep.variations.tryAlternativeButtons) {
      const buttons = await this._findAllButtonsByHint(action.selectorHint, maxVariations);

      for (let i = 1; i < Math.min(buttons.length, maxVariations); i++) {
        const btn = buttons[i];

        await this._clickElement(btn);
        await this.delay(500);

        variations.push({
          type: 'alternative-button',
          button: btn.text,
          selector: btn.selector,
          timestamp: new Date().toISOString()
        });
      }
    }

  } catch (e) {
    console.warn(`⚠️ [FlowVariations] Ошибка при исследовании вариаций:`, e?.message);
  }

  return variations;
}

/**
 * Находит кнопку по подсказке (текст или label)
 */
TestPlayer.prototype._findButtonByHint = async function(hint) {
  if (!hint) return null;

  const buttons = this._findInteractiveElements([]);
  const allButtons = [...buttons.save, ...buttons.navigation, ...buttons.other];

  const hintLower = hint.toLowerCase();

  return allButtons.find(btn =>
    btn.text.toLowerCase().includes(hintLower) ||
    btn.textLower.includes(hintLower)
  );
}

/**
 * Находит ВСЕ кнопки по подсказке (для вариаций)
 */
TestPlayer.prototype._findAllButtonsByHint = async function(hint, max = 5) {
  if (!hint) return [];

  const buttons = this._findInteractiveElements([]);
  const allButtons = [...buttons.save, ...buttons.navigation, ...buttons.other];

  const hintLower = hint.toLowerCase();

  return allButtons.filter(btn =>
    btn.text.toLowerCase().includes(hintLower) ||
    btn.textLower.includes(hintLower)
  ).slice(0, max);
}

/**
 * Находит dropdown по подсказке
 */
TestPlayer.prototype._findDropdownByHint = async function(hint) {
  if (!hint) return null;

  const selects = document.querySelectorAll('select:not([disabled])');
  const hintLower = hint.toLowerCase();

  for (const select of selects) {
    const style = window.getComputedStyle(select);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const label = this._getFieldLabel(select);
    if (label.toLowerCase().includes(hintLower)) {
      return select;
    }

    if (select.name && select.name.toLowerCase().includes(hintLower)) {
      return select;
    }
  }

  return null;
}

/**
 * Находит checkbox по подсказке
 */
TestPlayer.prototype._findCheckboxByHint = async function(hint) {
  if (!hint) return null;

  const checkboxes = document.querySelectorAll('input[type="checkbox"]:not([disabled])');
  const hintLower = hint.toLowerCase();

  for (const checkbox of checkboxes) {
    const style = window.getComputedStyle(checkbox);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const label = this._getFieldLabel(checkbox);
    if (label.toLowerCase().includes(hintLower)) {
      return checkbox;
    }
  }

  return null;
}

/**
 * Находит input по подсказке
 */
TestPlayer.prototype._findInputByHint = async function(hint) {
  if (!hint) return null;

  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), textarea:not([disabled])');
  const hintLower = hint.toLowerCase();

  for (const input of inputs) {
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const label = this._getFieldLabel(input);
    if (label.toLowerCase().includes(hintLower)) {
      return input;
    }

    if (input.name && input.name.toLowerCase().includes(hintLower)) {
      return input;
    }

    if (input.placeholder && input.placeholder.toLowerCase().includes(hintLower)) {
      return input;
    }
  }

  return null;
}

/**
 * Получает label для поля
 */
TestPlayer.prototype._getFieldLabel = function(field) {
  if (!field) return '';

  // Попробовать найти связанный label
  if (field.id) {
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) return label.textContent.trim();
  }

  // Попробовать найти родительский label
  const parentLabel = field.closest('label');
  if (parentLabel) {
    return parentLabel.textContent.trim();
  }

  // Попробовать найти предыдущий label
  let prev = field.previousElementSibling;
  while (prev) {
    if (prev.tagName === 'LABEL') {
      return prev.textContent.trim();
    }
    prev = prev.previousElementSibling;
  }

  return field.name || field.placeholder || '';
}

/**
 * Сохраняет snapshot состояния
 */
TestPlayer.prototype._saveSnapshot = async function(adaptiveAction, label, stepName) {
  try {
    const snapshot = {
      label: label,
      stepName: stepName || '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      formData: this._captureFormData(),
      localStorage: { ...localStorage },
      cookies: document.cookie,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      }
    };

    adaptiveAction._snapshots.push(snapshot);

    console.log(`📸 [Snapshot] Сохранён: ${label}`);
  } catch (e) {
    console.warn(`⚠️ [Snapshot] Ошибка сохранения:`, e?.message);
  }
}

/**
 * Захватывает данные форм на странице
 */
TestPlayer.prototype._captureFormData = function() {
  const data = {};

  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');

  inputs.forEach((input, index) => {
    const key = input.name || input.id || `field_${index}`;
    if (input.type === 'checkbox' || input.type === 'radio') {
      data[key] = input.checked;
    } else {
      data[key] = input.value;
    }
  });

  return data;
}

/**
 * Восстанавливает snapshot
 */
TestPlayer.prototype._restoreSnapshot = async function(adaptiveAction, snapshotIndex) {
  if (!adaptiveAction._snapshots || snapshotIndex >= adaptiveAction._snapshots.length) {
    console.warn(`⚠️ [Snapshot] Snapshot ${snapshotIndex} не найден`);
    return;
  }

  const snapshot = adaptiveAction._snapshots[snapshotIndex];

  try {
    // Восстанавливаем URL если изменился
    if (window.location.href !== snapshot.url) {
      window.location.href = snapshot.url;
      await this.delay(2000);
    }

    // Восстанавливаем данные форм
    this._restoreFormData(snapshot.formData);

    // Восстанавливаем scroll position
    if (snapshot.scrollPosition) {
      window.scrollTo(snapshot.scrollPosition.x, snapshot.scrollPosition.y);
    }

    console.log(`♻️ [Snapshot] Восстановлён: ${snapshot.label}`);

    if (adaptiveAction._statistics) {
      adaptiveAction._statistics.snapshotsRestored++;
    }
  } catch (e) {
    console.error(`⚠️ [Snapshot] Ошибка восстановления:`, e?.message);
  }
}

/**
 * Восстанавливает данные форм
 */
TestPlayer.prototype._restoreFormData = function(formData) {
  if (!formData) return;

  Object.entries(formData).forEach(([key, value]) => {
    // Пробуем найти по name
    let input = document.querySelector(`[name="${key}"]`);

    // Пробуем найти по id
    if (!input) {
      input = document.getElementById(key);
    }

    if (input) {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

/**
 * Создаёт overlay с прогрессом для adaptive-flow
 */
TestPlayer.prototype._createFlowOverlay = function(state, stats, testName, flow) {
  const oldOverlay = document.getElementById('autotest-flow-overlay');
  if (oldOverlay) oldOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = 'autotest-flow-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    min-width: 300px;
    max-width: 350px;
    animation: slideIn 0.3s ease-out;
  `;

  const progressPercent = Math.round(((state.currentStepIndex + 1) / state.totalSteps) * 100);
  const currentStep = flow[state.currentStepIndex];

  overlay.innerHTML = `
    <style>
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    </style>

    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="font-size: 20px;">🎬</span>
      <div style="flex: 1;">
        <div style="font-weight: 700; font-size: 15px;">Adaptive Flow</div>
        <div style="font-size: 11px; opacity: 0.8;">${testName}</div>
      </div>
    </div>

    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.3); border-radius: 3px; overflow: hidden; margin: 8px 0;">
      <div style="height: 100%; background: white; border-radius: 3px; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
    </div>

    <div style="margin: 8px 0; font-size: 13px;">
      <div style="display: flex; justify-content: space-between; margin: 4px 0;">
        <span style="opacity: 0.9;">Шаг:</span>
        <span style="font-weight: 600;">${state.currentStepIndex + 1} / ${state.totalSteps}</span>
      </div>
      <div style="margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; font-size: 12px;">
        ${currentStep?.name || 'Loading...'}
      </div>
      <div style="display: flex; justify-content: space-between; margin: 4px 0;">
        <span style="opacity: 0.9;">Действий:</span>
        <span style="font-weight: 600;">${state.totalActions}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 4px 0;">
        <span style="opacity: 0.9;">Вариаций:</span>
        <span style="font-weight: 600;">${stats.variationsExplored}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 4px 0;">
        <span style="opacity: 0.9;">Snapshots:</span>
        <span style="font-weight: 600;">${stats.snapshotsCreated}</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Обновляет overlay с текущим прогрессом
 */
TestPlayer.prototype._updateFlowOverlay = function(overlay, state, stats, flow) {
  if (!overlay) return;

  const progressPercent = Math.round(((state.currentStepIndex + 1) / state.totalSteps) * 100);
  const currentStep = flow[state.currentStepIndex];

  // Обновляем прогресс бар
  const progressBar = overlay.querySelector('div > div[style*="width"]');
  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }

  // Обновляем текстовые значения (простой способ)
  const html = overlay.innerHTML;
  const updatedHtml = html
    .replace(/Шаг:<\/span>\s*<span[^>]*>\d+ \/ \d+/, `Шаг:</span><span style="font-weight: 600;">${state.currentStepIndex + 1} / ${state.totalSteps}`)
    .replace(/Действий:<\/span>\s*<span[^>]*>\d+/, `Действий:</span><span style="font-weight: 600;">${state.totalActions}`)
    .replace(/Вариаций:<\/span>\s*<span[^>]*>\d+/, `Вариаций:</span><span style="font-weight: 600;">${stats.variationsExplored}`)
    .replace(/Snapshots:<\/span>\s*<span[^>]*>\d+/, `Snapshots:</span><span style="font-weight: 600;">${stats.snapshotsCreated}`);

  overlay.innerHTML = updatedHtml;
}

/**
 * Удаляет overlay
 */
TestPlayer.prototype._removeFlowOverlay = function() {
  const overlay = document.getElementById('autotest-flow-overlay');
  if (overlay) {
    overlay.style.animation = 'slideOut 0.3s ease-in';
    overlay.style.cssText += 'animation: slideOut 0.3s ease-in;';
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * Создаёт селектор для элемента
 */
TestPlayer.prototype._getElementSelector = function(element) {
  if (!element) return '';
  if (element.id) return `#${element.id}`;
  if (element.name) return `[name="${element.name}"]`;
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter(c => c && !c.includes(':')).slice(0, 2).join('.');
    if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
  }
  return element.tagName.toLowerCase();
}

/**
 * Создаёт overlay с прогрессом выполнения adaptive-auto
 */
TestPlayer.prototype._createAdaptiveOverlay = function(state, stats, testName) {
  const oldOverlay = document.getElementById('autotest-adaptive-overlay');
  if (oldOverlay) oldOverlay.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'autotest-adaptive-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 999999;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    min-width: 280px;
    max-width: 320px;
    animation: slideIn 0.3s ease-out;
  `;
  
  const progressPercent = Math.round((state.iterations / state.maxIterations) * 100);
  const extensionId = chrome.runtime?.id || 'unknown';
  
  overlay.innerHTML = `
    <style>
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      #autotest-adaptive-overlay .progress-bar {
        width: 100%;
        height: 6px;
        background: rgba(255,255,255,0.3);
        border-radius: 3px;
        overflow: hidden;
        margin: 8px 0;
      }
      #autotest-adaptive-overlay .progress-fill {
        height: 100%;
        background: white;
        border-radius: 3px;
        transition: width 0.3s ease;
      }
      #autotest-adaptive-overlay .stat-row {
        display: flex;
        justify-content: space-between;
        margin: 4px 0;
        font-size: 13px;
      }
      #autotest-adaptive-overlay .stat-label {
        opacity: 0.9;
      }
      #autotest-adaptive-overlay .stat-value {
        font-weight: 600;
      }
      #autotest-adaptive-overlay .report-link {
        display: block;
        background: white;
        color: #667eea;
        text-align: center;
        padding: 8px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 600;
        margin-top: 12px;
        transition: transform 0.2s;
        cursor: pointer;
        pointer-events: auto;
      }
      #autotest-adaptive-overlay .report-link:hover {
        transform: scale(1.02);
      }
    </style>
    
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="font-size: 20px;">🤖</span>
      <div style="flex: 1;">
        <div style="font-weight: 700; font-size: 15px;">Adaptive Auto</div>
        <div style="font-size: 11px; opacity: 0.8;">${testName || 'Running...'}</div>
      </div>
    </div>
    
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progressPercent}%"></div>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Итерация:</span>
      <span class="stat-value">${state.iterations} / ${state.maxIterations}</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Выполнено действий:</span>
      <span class="stat-value">${stats.actionsInvoked || 0}</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Посещено страниц:</span>
      <span class="stat-value">${state.visitedUrls ? state.visitedUrls.size : 0}</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Заполнено полей:</span>
      <span class="stat-value">${stats.fieldsFilled || 0}</span>
    </div>
    
    <div class="stat-row">
      <span class="stat-label">Нажато кнопок:</span>
      <span class="stat-value">${state.clickedButtons ? state.clickedButtons.size : 0}</span>
    </div>
    
    <a href="chrome-extension://${extensionId}/analytics/analytics-dashboard.html?auto=true" 
       target="_blank" 
       class="report-link">
      📊 Посмотреть отчёт
    </a>
  `;
  
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Обновляет overlay с текущим прогрессом
 */
TestPlayer.prototype._updateAdaptiveOverlay = function(overlay, state, stats) {
  if (!overlay) return;
  
  const progressPercent = Math.round((state.iterations / state.maxIterations) * 100);
  const progressFill = overlay.querySelector('.progress-fill');
  if (progressFill) progressFill.style.width = `${progressPercent}%`;
  
  const statValues = overlay.querySelectorAll('.stat-value');
  if (statValues.length >= 5) {
    statValues[0].textContent = `${state.iterations} / ${state.maxIterations}`;
    statValues[1].textContent = stats.actionsInvoked || 0;
    statValues[2].textContent = state.visitedUrls ? state.visitedUrls.size : 0;
    statValues[3].textContent = stats.fieldsFilled || 0;
    statValues[4].textContent = state.clickedButtons ? state.clickedButtons.size : 0;
  }
}

/**
 * Удаляет overlay с анимацией
 */
TestPlayer.prototype._removeAdaptiveOverlay = function() {
  const overlay = document.getElementById('autotest-adaptive-overlay');
  if (overlay) {
    overlay.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => overlay.remove(), 300);
  }
}


/**
 * Адаптивный шаг: автоматический режим (adaptive-auto)
 * Самостоятельно находит поля, заполняет их, находит кнопки сохранения и нажимает их
 * Цикл продолжается пока есть доступные действия или не достигнут лимит итераций
 */
TestPlayer.prototype.handleAdaptiveAuto = async function(adaptiveAction) {
  const maxIterations = Math.max(1, Math.min(999, parseInt(adaptiveAction.maxIterations, 10) || 99));
  const excludeButtons = (adaptiveAction.excludeButtons || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const fillMode = adaptiveAction.fillMode || 'required'; // 'all', 'required', 'empty'
  const ignoreValidationErrors = adaptiveAction.ignoreValidationErrors === true;
  const exploreDropdowns = adaptiveAction.exploreDropdowns !== false; // По умолчанию включено
  const toggleCheckboxes = adaptiveAction.toggleCheckboxes !== false; // По умолчанию включено
  const enableBacktracking = adaptiveAction.enableBacktracking !== false; // По умолчанию включено
  const maxDialogCloseAttempts = Math.max(0, Math.min(100, parseInt(adaptiveAction.maxDialogCloseAttempts, 10) || 0)); // По умолчанию 0 = без ограничений

  // Каждый прогон — с нуля, не из предыдущего отчёта
  adaptiveAction._runHistory = [];
  adaptiveAction._statistics = { 
    iterations: 0, 
    actionsInvoked: 0, 
    errors: [], 
    fieldsFilled: 0, 
    dropdownsExplored: 0, 
    checkboxesToggles: 0,
    backtrackCount: 0,
    recoveryAttempts: 0,
    wizardSteps: 0,
    modalFormsHandled: 0
  };
  const stats = adaptiveAction._statistics;

  // Создаём граф навигации для backtracking.
  // Класс объявлен в player-core.js и экспортируется в window.
  const AdaptiveNavigationGraphCtor = window.AdaptiveNavigationGraph;
  if (typeof AdaptiveNavigationGraphCtor !== 'function') {
    throw new Error('AdaptiveNavigationGraph is not available. Ensure player-core.js is loaded before adaptive handlers.');
  }
  const navGraph = new AdaptiveNavigationGraphCtor();

  const state = {
    visitedUrls: new Set(),
    clickedButtons: new Set(),
    iterations: 0,
    maxIterations: maxIterations,
    lastUrl: window.location.href,
    stuckCount: 0, // Счётчик "зависания" - URL не меняется после кликов
    lastDialogText: null,
    dialogCloseCount: 0, // Счётчик закрытия диалогов
    lastFilledValues: null, // Значения полей при последнем заполнении
    wizardInfo: null, // Информация о wizard, если детектирован
    modalFormCloseWithoutSaveCount: 0 // Повторы: форма закрыта без сохранения → при повторной попытке заполнять все поля
  };
  state.visitedUrls.add(window.location.href);

  console.log(`🔄 [AdaptiveAuto] Запуск: maxIterations=${maxIterations}, fillMode=${fillMode}, exploreDropdowns=${exploreDropdowns}, toggleCheckboxes=${toggleCheckboxes}, backtracking=${enableBacktracking}, maxDialogClose=${maxDialogCloseAttempts}`);

  // Создаём overlay с прогрессом
  const testName = adaptiveAction.description || 'Adaptive Test';
  let overlay = this._createAdaptiveOverlay(state, stats, testName);

  while (state.iterations < maxIterations && this.isPlaying) {
    state.iterations++;
    stats.iterations++;
    
    // Обновляем overlay
    this._updateAdaptiveOverlay(overlay, state, stats);

    const currentUrl = window.location.href;
    const urlChanged = currentUrl !== state.lastUrl;

    // 1. Обработать диалоги
    const dialogResult = await this._handleOpenDialogIfAny(3);
    if (dialogResult.handled) {
      // Проверяем что это тот же диалог
      const isSameDialog = state.lastDialogText === dialogResult.dialogText;
      if (isSameDialog) {
        state.dialogCloseCount++;
      } else {
        state.dialogCloseCount = 1; // Сброс счётчика для нового диалога
        state.lastFilledValues = null; // Сброс сохранённых значений
      }
      
      state.lastDialogText = dialogResult.dialogText || null;
      
      // КРИТИЧНО: Проверка ограничения закрытия диалога (если maxDialogCloseAttempts > 0)
      if (maxDialogCloseAttempts > 0 && state.dialogCloseCount > maxDialogCloseAttempts) {
        console.error(`❌ [AdaptiveAuto] Диалог "${dialogResult.dialogText}" закрывался ${state.dialogCloseCount} раз подряд (лимит: ${maxDialogCloseAttempts})! Останавливаю.`);
        console.error(`   💡 Возможные причины:`);
        console.error(`      • Поля не заполняются (проверьте что analysis находит селекторы)`);
        console.error(`      • Есть скрытые обязательные поля`);
        console.error(`      • Валидация требует специфичных значений`);
        
        stats.errors.push({ 
          iteration: state.iterations, 
          message: `Dialog loop detected: closed ${state.dialogCloseCount} times (limit: ${maxDialogCloseAttempts})`,
          dialogText: dialogResult.dialogText
        });
        
        // Показываем уведомление пользователю
        await chrome.runtime.sendMessage({
          type: 'SHOW_NOTIFICATION',
          title: '⚠️ Adaptive-Auto остановлен',
          message: `Диалог закрывался ${state.dialogCloseCount} раз подряд (превышен лимит ${maxDialogCloseAttempts}). Возможно, поля не заполняются или требуется ручная настройка.`,
          timeout: 10000
        });
        
        break; // Выходим из цикла
      }
      
      stats.actionsInvoked++;
      adaptiveAction._runHistory.push({
        iteration: state.iterations,
        action: 'dialog',
        dialogText: dialogResult.dialogText,
        closeAttempt: state.dialogCloseCount,
        url: currentUrl,
        timestamp: new Date().toISOString(),
        success: true
      });

      // Если диалог валидации - заполнить обязательные поля
      if (dialogResult.isValidation) {
        try {
          // КРИТИЧНО: Если диалог повторяется - проверяем что поля заполняются разными значениями
          const currentValues = state.dialogCloseCount > 1 ? this._getCurrentFormValues() : null;
          
          if (currentValues && state.lastFilledValues) {
            console.log(`📊 [AdaptiveAuto] Проверка: заполнены ли поля разными значениями...`);
            const valuesChanged = this._compareFormValues(state.lastFilledValues, currentValues);
            
            if (!valuesChanged) {
              console.warn(`⚠️ [AdaptiveAuto] Поля НЕ изменились после ${state.dialogCloseCount} попытки! Значения те же.`);
              console.warn(`   💡 Возможно, analysis НЕ заполняет поля или генерирует одинаковые значения`);
            } else {
              console.log(`✅ [AdaptiveAuto] Поля заполнены разными значениями`);
            }
          }
          
          const fillT0 = Date.now();
          await this.handleAnalysis({
            type: 'analysis',
            subtype: 'analysis-fill-fields',
            fillOptions: { 
              fillTarget: 'required', 
              fillMode: 'random', 
              charCount: 10 + state.dialogCloseCount, // Увеличиваем длину при повторах
              charset: 'lettersAndNumbers' 
            }
          });
          this._pushAnalysisSubStep('analysis-fill-fields', true, Date.now() - fillT0);
          
          // Сохраняем текущие значения после заполнения
          state.lastFilledValues = this._getCurrentFormValues();
          
        } catch (e) {
          this._pushAnalysisSubStep('analysis-fill-fields', false, 0, e?.message);
          if (this.debugMode) console.warn('[AdaptiveAuto] Заполнение после валидации не удалось:', e?.message);
          if (!ignoreValidationErrors) {
            stats.errors.push({ iteration: state.iterations, message: e?.message || 'Validation fill failed' });
          }
        }
      }
      await this.delay(300);
      continue;
    }

    // 2. Отслеживание смены URL
    if (urlChanged) {
      state.lastUrl = currentUrl;
      state.stuckCount = 0;
      if (!state.visitedUrls.has(currentUrl)) {
        state.visitedUrls.add(currentUrl);
        console.log(`📋 [AdaptiveAuto] Новая страница: ${currentUrl}`);
        
        // КРИТИЧНО: Обновить селекторы для новой страницы
        try {
          console.log(`🔄 [AdaptiveAuto] Обновление селекторов для новой страницы...`);
          const t0 = Date.now();
          await this._ensureSelectorsForAdaptive();
          this._pushAnalysisSubStep('analysis-selectors', true, Date.now() - t0);
          console.log(`✅ [AdaptiveAuto] Селекторы обновлены`);
        } catch (e) {
          this._pushAnalysisSubStep('analysis-selectors', false, 0, e?.message);
          console.warn(`⚠️ [AdaptiveAuto] Не удалось обновить селекторы:`, e?.message);
        }
      }
    }

    // 2.4. Добавляем узел в граф навигации (чтобы markButtonClicked работал при клике в модали)
    const allButtonsForGraph = this._findInteractiveElements(excludeButtons);
    const allButtonsFlatForGraph = [...allButtonsForGraph.save, ...allButtonsForGraph.navigation, ...allButtonsForGraph.other];
    navGraph.addNode(currentUrl, allButtonsFlatForGraph);

    // 2.5. ДЕТЕКЦИЯ И ОБРАБОТКА МОДАЛЬНЫХ ФОРМ
    const modalInfo = this._detectModalForm();
    if (modalInfo.isModal && modalInfo.hasForm) {
      const retryAttempt = state.modalFormCloseWithoutSaveCount;
      const effectiveFillMode = retryAttempt >= 1 ? 'all' : fillMode;
      const needsFilling = modalInfo.formState.empty > 0 || modalInfo.formState.emptyRequired > 0;
      // При появлении новой формы: 1) анализ селекторов, 2) заполнение всех форм, 3) кнопка сохранить
      console.log(`📋 [AdaptiveAuto] Новая модальная форма — 1) анализ селекторов, 2) заполнение всех форм, 3) кнопка сохранить`);
      try {
        if (this._isExtensionContextValid()) {
          const url = window.location.href;
          const stored = await chrome.storage.local.get(['collectedSelectors']);
          const collected = stored.collectedSelectors || {};
          delete collected[url];
          await chrome.storage.local.set({ collectedSelectors: collected });
        }
        // 1. Сначала анализ селекторов (свежие селекторы для новой формы)
        try {
          const selT0 = Date.now();
          const selOk = await this._ensureSelectorsForAdaptive();
          this._pushAnalysisSubStep('analysis-selectors', !!selOk?.success, Date.now() - selT0);
        } catch (e) {
          this._pushAnalysisSubStep('analysis-selectors', false, 0, e?.message);
          if (!/Extension context invalidated/i.test(e?.message || '')) throw e;
        }
        await this.delay(300);
        // 2. Заполнение всех форм (включая модальную)
        const scopeSelector = this._getModalScopeSelector(modalInfo);
        try {
          const fillT0 = Date.now();
          let fillResult = null;
          try {
            fillResult = await this.handleAnalysis({
              type: 'analysis',
              subtype: 'analysis-fill-fields',
              fillOptions: { fillTarget: 'all', fillMode: 'random', charCount: 10, charset: 'lettersAndNumbers', scopeSelector }
            });
          } catch (fillErr) {
            if (/Extension context invalidated/i.test(fillErr?.message || '')) {
              fillResult = { data: { summary: { filled: 0 } } };
            } else {
              throw fillErr;
            }
          }
          const filled = fillResult?.data?.summary?.filled ?? 0;
          this._pushAnalysisSubStep('analysis-fill-fields', filled > 0, Date.now() - fillT0);
          // 2b. Fallback: прямой ввод текста + combobox + app-select если analysis не заполнил
          if (filled === 0 && modalInfo.formState?.empty > 0 && modalInfo.element) {
            const scopeInputs = modalInfo.element.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
            const textInputs = Array.from(scopeInputs).filter(i => i.tagName !== 'TEXTAREA' && ['text', 'date', 'number', ''].includes((i.type || 'text').toLowerCase()));
            const textareas = Array.from(scopeInputs).filter(i => i.tagName === 'TEXTAREA');
            const scopeState = { fieldsByType: { text: textInputs, textarea: textareas } };
            await this._tryDirectTextFill(scopeState, 4);
            const emptyComboboxInputs = Array.from(scopeInputs).filter(i => i.tagName === 'INPUT' && /выберите|укажите|select|choose|или введите/i.test((i.placeholder || i.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase()) && (!i.value || (i.value || '').trim().length < 2));
            for (const el of emptyComboboxInputs.slice(0, 3)) {
              try {
                const r = await this._tryComboboxFill(el);
                if (r.success && this.debugMode) console.log(`✅ [ModalForm] Combobox заполнен: "${r.value}"`);
              } catch (e) {}
            }
            const emptyAppSelects = Array.from(modalInfo.element.querySelectorAll('app-select, app-group-item-select'))
              .filter(el => this._isAppSelectEmpty(el));
            const emptyPlaceholderDivs = Array.from(modalInfo.element.querySelectorAll('div.placeholder, div[class*="placeholder"]'))
              .filter(el => !el.closest('app-select, app-group-item-select') && /^выберите\s*$/i.test((el.textContent || '').trim()));
            let modalSelectFilled = 0;
            for (const el of [...emptyAppSelects, ...emptyPlaceholderDivs].slice(0, 4)) {
              try {
                const r = await this._tryAppSelectFill(el);
                if (r.success) {
                  modalSelectFilled++;
                  if (this.debugMode) console.log(`✅ [ModalForm] app-select заполнен: "${r.value}"`);
                }
              } catch (e) {}
            }
            // Каскадное заполнение вложений в модальной форме
            if (modalSelectFilled > 0) {
              await this.delay(600);
              const scopeInputs = modalInfo.element.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
              const textInputs = Array.from(scopeInputs).filter(i => i.tagName !== 'TEXTAREA' && ['text', 'date', 'number', ''].includes((i.type || 'text').toLowerCase()));
              const textareas = Array.from(scopeInputs).filter(i => i.tagName === 'TEXTAREA');
              const scopeState = { fieldsByType: { text: textInputs, textarea: textareas } };
              await this._tryDirectTextFill(scopeState, 3);
              const cascadeSelects = Array.from(modalInfo.element.querySelectorAll('app-select, app-group-item-select'))
                .filter(el => this._isAppSelectEmpty(el));
              for (const el of cascadeSelects.slice(0, 2)) {
                try {
                  const r = await this._tryAppSelectFill(el);
                  if (r.success && this.debugMode) console.log(`✅ [ModalForm] Вложение заполнено: "${r.value}"`);
                } catch (e) {}
              }
            }
          }
        } catch (e) {
          this._pushAnalysisSubStep('analysis-fill-fields', false, 0, e?.message);
          throw e;
        }
        await this.delay(500);
      } catch (e) {
        console.warn(`⚠️ [AdaptiveAuto] Анализ/заполнение не удалось:`, e?.message);
      }
      console.log(`🪟 [AdaptiveAuto] Обнаружена модальная форма: ${modalInfo.formState.total} полей, ${modalInfo.formState.empty} пустых, ${modalInfo.formState.emptyRequired} обязательных`);
      
      // Пробуем нажать сохранить (если кнопка доступна). _handleModalForm проверит disabled и при необходимости закроет через Отмена
      const shouldSave = true;
      
      try {
        const result = await this._handleModalForm(modalInfo, effectiveFillMode, shouldSave, retryAttempt, { skipFill: true }, { state, navGraph, currentUrl });
        
        if (result.success) {
          if (result.saved) {
            state.modalFormCloseWithoutSaveCount = 0;
          } else {
            state.modalFormCloseWithoutSaveCount = (state.modalFormCloseWithoutSaveCount || 0) + 1;
            console.log(`📋 [AdaptiveAuto] Форма закрыта без сохранения (попытка ${state.modalFormCloseWithoutSaveCount}) — при следующем открытии заполню все поля`);
          }
          stats.actionsInvoked += result.actions.length;
          stats.modalFormsHandled++;
          
          const modalDetails = result.saved ? 'Сохранено' : `Не сохранено (пустых: ${modalInfo.formState?.empty ?? 0})`;
          adaptiveAction._runHistory.push({
            iteration: state.iterations,
            action: 'modal-form',
            formState: modalInfo.formState,
            actions: result.actions,
            saved: result.saved,
            details: modalDetails,
            retryAttempt: retryAttempt,
            url: currentUrl,
            timestamp: new Date().toISOString(),
            success: true
          });
          
          // Обновляем селекторы после закрытия модального окна
          await this.delay(500);
          try {
            const t0 = Date.now();
            await this._ensureSelectorsForAdaptive();
            this._pushAnalysisSubStep('analysis-selectors', true, Date.now() - t0);
            console.log(`✅ [AdaptiveAuto] Селекторы обновлены после обработки модальной формы`);
          } catch (e) {
            this._pushAnalysisSubStep('analysis-selectors', false, 0, e?.message);
            console.warn(`⚠️ [AdaptiveAuto] Не удалось обновить селекторы:`, e?.message);
          }
          
          continue; // Переходим к следующей итерации
        }
      } catch (e) {
        console.warn(`⚠️ [AdaptiveAuto] Ошибка обработки модальной формы:`, e?.message);
        stats.errors.push({ 
          iteration: state.iterations, 
          message: `Modal form error: ${e?.message}` 
        });
      }
    }

    // 3. УМНОЕ ЗАПОЛНЕНИЕ: проверяем состояние форм
    const formState = this._getFormState();
    
    if (formState.empty > 0) {
      try {
        // Сначала селекторы (если ещё не получены на этой странице)
        try {
          const selT0 = Date.now();
          const selOk = await this._ensureSelectorsForAdaptive();
          this._pushAnalysisSubStep('analysis-selectors', !!selOk?.success, Date.now() - selT0);
        } catch (e) {
          this._pushAnalysisSubStep('analysis-selectors', false, 0, e?.message);
          if (!/Extension context invalidated/i.test(e?.message || '')) throw e;
        }
        const fillTarget = fillMode === 'all' ? 'all' : (fillMode === 'empty' ? 'empty' : 'required');
        const fillT0 = Date.now();
        let fillResult = null;
        try {
          fillResult = await this.handleAnalysis({
            type: 'analysis',
            subtype: 'analysis-fill-fields',
            fillOptions: { fillTarget, fillMode: 'random', charCount: 10, charset: 'lettersAndNumbers' }
          });
        } catch (fillErr) {
          if (/Extension context invalidated/i.test(fillErr?.message || '')) {
            fillResult = { data: { summary: { filled: null } } };
          } else {
            throw fillErr;
          }
        }
        const actualFilled = fillResult?.data?.summary?.filled ?? null;
        const emptyBefore = formState.empty;
        await this.delay(200);
        const formStateAfter = this._getFormState();
        const emptyAfter = formStateAfter.empty;
        const verified = emptyAfter < emptyBefore;
        const reportedFilled = (actualFilled != null) ? actualFilled : (verified ? emptyBefore - emptyAfter : 0);
        if (!verified && reportedFilled === 0 && emptyBefore > 0) {
          console.warn(`⚠️ [AdaptiveAuto] Заполнение не подтверждено: attempted=${emptyBefore}, actualFilled=${actualFilled ?? 'n/a'}, emptyAfter=${emptyAfter}`);
        }
        this._pushAnalysisSubStep('analysis-fill-fields', reportedFilled > 0 || verified, Date.now() - fillT0);
        stats.actionsInvoked++;
        stats.fieldsFilled += (reportedFilled > 0 ? reportedFilled : (verified ? emptyBefore - emptyAfter : 0));
        const fillDetails = (verified === false || reportedFilled === 0) && emptyBefore > 0
          ? `Попытка ${emptyBefore} (фактически ${reportedFilled})`
          : `Заполнено ${reportedFilled} полей`;
        adaptiveAction._runHistory.push({
          iteration: state.iterations,
          action: 'fill-fields',
          fillTarget,
          fieldsFilled: reportedFilled,
          fieldsAttempted: emptyBefore,
          verified,
          details: fillDetails,
          url: currentUrl,
          timestamp: new Date().toISOString(),
          success: verified || reportedFilled > 0
        });
        // 3b. Fallback: прямое заполнение текста + combobox + app-select если analysis не справился
        if ((verified === false || reportedFilled === 0) && emptyBefore > 0) {
          const fsNow = this._getFormState();
          const directFilled = await this._tryDirectTextFill(fsNow, 5);
          if (directFilled > 0) {
            stats.fieldsFilled += directFilled;
            stats.actionsInvoked += directFilled;
            adaptiveAction._runHistory.push({
              iteration: state.iterations,
              action: 'direct-text-fill',
              fieldsFilled: directFilled,
              url: currentUrl,
              timestamp: new Date().toISOString(),
              success: true
            });
            if (this.debugMode) console.log(`✅ [AdaptiveAuto] Прямое заполнение: ${directFilled} полей`);
          }
          const comboboxInputs = (fsNow.fieldsByType?.text || []).filter(el => {
            const ph = (el.placeholder || el.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase();
            return /выберите|укажите|select|choose|или введите/i.test(ph) && (!el.value || (el.value || '').trim().length < 2);
          });
          for (const el of comboboxInputs.slice(0, 3)) {
            try {
              const r = await this._tryComboboxFill(el);
              if (r.success) {
                stats.fieldsFilled++;
                stats.actionsInvoked++;
                adaptiveAction._runHistory.push({
                  iteration: state.iterations,
                  action: 'combobox-fill',
                  selector: this._getElementSelector(el),
                  value: r.value,
                  url: currentUrl,
                  timestamp: new Date().toISOString(),
                  success: true
                });
                if (this.debugMode) console.log(`✅ [AdaptiveAuto] Combobox заполнен: "${r.value}"`);
              }
            } catch (e) {}
          }
          const emptyAppSelects = fsNow.fieldsByType.select.filter(el => {
            if (/^app-select|app-group-item-select$/i.test(el.tagName || '')) return this._isAppSelectEmpty(el);
            if (el.matches?.('div.placeholder, div[class*="placeholder"]')) return /^выберите\s*$/i.test((el.textContent || '').trim());
            return false;
          });
          let appSelectCountFilled = 0;
          for (const el of emptyAppSelects.slice(0, 3)) {
            try {
              const r = await this._tryAppSelectFill(el);
              if (r.success) {
                appSelectCountFilled++;
                stats.fieldsFilled++;
                stats.actionsInvoked++;
                adaptiveAction._runHistory.push({
                  iteration: state.iterations,
                  action: 'app-select-fill',
                  selector: this._getElementSelector(el),
                  value: r.value,
                  url: currentUrl,
                  timestamp: new Date().toISOString(),
                  success: true
                });
                if (this.debugMode) console.log(`✅ [AdaptiveAuto] app-select заполнен: "${r.value}"`);
              }
            } catch (e) {
              if (this.debugMode) console.warn('[AdaptiveAuto] app-select fill error:', e?.message);
            }
          }
          // Каскадное заполнение вложенных полей, появившихся после выбора в dropdown
          for (let cascade = 0; cascade < 2 && appSelectCountFilled > 0; cascade++) {
            await this.delay(600);
            const fsCascade = this._getFormState();
            if (fsCascade.empty === 0) break;
            const directCascade = await this._tryDirectTextFill(fsCascade, 3);
            if (directCascade > 0) {
              stats.fieldsFilled += directCascade;
              stats.actionsInvoked += directCascade;
              if (this.debugMode) console.log(`✅ [AdaptiveAuto] Вложения заполнены (текст): ${directCascade}`);
            }
            const comboboxCascade = (fsCascade.fieldsByType?.text || []).filter(el => {
              const ph = (el.placeholder || el.getAttribute?.('ng-reflect-placeholder') || '').toLowerCase();
              return /выберите|укажите|select|choose|или введите/i.test(ph) && (!el.value || (el.value || '').trim().length < 2);
            });
            for (const el of comboboxCascade.slice(0, 2)) {
              try {
                const r = await this._tryComboboxFill(el);
                if (r.success) {
                  stats.fieldsFilled++;
                  stats.actionsInvoked++;
                  if (this.debugMode) console.log(`✅ [AdaptiveAuto] Вложение combobox заполнен: "${r.value}"`);
                }
              } catch (e) {}
            }
            const emptyCascade = fsCascade.fieldsByType.select.filter(el => {
              if (/^app-select|app-group-item-select$/i.test(el.tagName || '')) return this._isAppSelectEmpty(el);
              if (el.matches?.('div.placeholder, div[class*="placeholder"]')) return /^выберите\s*$/i.test((el.textContent || '').trim());
              return false;
            });
            for (const el of emptyCascade.slice(0, 2)) {
              try {
                const r = await this._tryAppSelectFill(el);
                if (r.success) {
                  stats.fieldsFilled++;
                  stats.actionsInvoked++;
                  if (this.debugMode) console.log(`✅ [AdaptiveAuto] Вложение заполнено: "${r.value}"`);
                }
              } catch (e) {}
            }
            const fsAfter = this._getFormState();
            if (fsAfter.empty >= fsCascade.empty) break;
          }
        }
      } catch (e) {
        this._pushAnalysisSubStep('analysis-fill-fields', false, 0, e?.message);
        if (this.debugMode) console.warn('[AdaptiveAuto] Заполнение полей не удалось:', e?.message);
      }
    } else {
      if (this.debugMode) console.log('📝 [AdaptiveAuto] Все поля уже заполнены, пропускаем');
    }
    
    // 4. ПЕРЕБОР DROPDOWN ОПЦИЙ (native SELECT) и заполнение app-select
    if (exploreDropdowns && formState.fieldsByType.select.length > 0) {
      const nativeSelects = formState.fieldsByType.select.filter(el => el.tagName === 'SELECT');
      const appSelects = formState.fieldsByType.select.filter(el => /^app-select|app-group-item-select$/i.test(el.tagName || ''));
      for (const select of nativeSelects.slice(0, 3)) {
        const options = await this._tryDropdownOptions(select, 3);
        if (options.length > 0) {
          stats.dropdownsExplored++;
          stats.actionsInvoked += options.length;
          adaptiveAction._runHistory.push({
            iteration: state.iterations,
            action: 'dropdown-exploration',
            selector: this._getElementSelector(select),
            optionsTried: options.length,
            options: options,
            url: currentUrl,
            timestamp: new Date().toISOString(),
            success: true
          });
        }
      }
      for (const appSelect of appSelects.filter(el => this._isAppSelectEmpty(el)).slice(0, 2)) {
        const r = await this._tryAppSelectFill(appSelect);
        if (r.success) {
          stats.dropdownsExplored++;
          stats.actionsInvoked++;
          adaptiveAction._runHistory.push({
            iteration: state.iterations,
            action: 'app-select-exploration',
            selector: this._getElementSelector(appSelect),
            value: r.value,
            url: currentUrl,
            timestamp: new Date().toISOString(),
            success: true
          });
        }
      }
    }
    
    // 5. TOGGLE CHECKBOXES
    if (toggleCheckboxes && formState.fieldsByType.checkbox.length > 0) {
      for (const checkbox of formState.fieldsByType.checkbox.slice(0, 2)) { // Макс 2 checkbox за итерацию
        const toggles = await this._tryCheckboxToggle(checkbox, 2);
        if (toggles.length > 0) {
          stats.checkboxesToggles++;
          stats.actionsInvoked += toggles.length;
          
          adaptiveAction._runHistory.push({
            iteration: state.iterations,
            action: 'checkbox-toggle',
            selector: this._getElementSelector(checkbox),
            toggles: toggles,
            url: currentUrl,
            timestamp: new Date().toISOString(),
            success: true
          });
        }
      }
    }

    await this.delay(200);

    // 6. ДЕТЕКЦИЯ WIZARD
    const wizardInfo = this._detectWizard();
    if (wizardInfo.isWizard && !state.wizardInfo) {
      state.wizardInfo = wizardInfo;
      stats.wizardSteps = wizardInfo.totalSteps;
      console.log(`🧙 [AdaptiveAuto] Детектирован Wizard: шаг ${wizardInfo.currentStep}/${wizardInfo.totalSteps}`);
      
      adaptiveAction._runHistory.push({
        iteration: state.iterations,
        action: 'wizard-detected',
        wizardInfo: wizardInfo,
        url: currentUrl,
        timestamp: new Date().toISOString()
      });
    } else if (wizardInfo.isWizard && state.wizardInfo) {
      // Обновляем информацию о wizard
      if (wizardInfo.currentStep !== state.wizardInfo.currentStep) {
        console.log(`🧙 [AdaptiveAuto] Wizard прогресс: ${wizardInfo.currentStep}/${wizardInfo.totalSteps}`);
        state.wizardInfo = wizardInfo;
      }
    }

    // 7. Найти кнопки и добавить в граф (переиспользуем результат из 2.4)
    const allButtons = allButtonsForGraph;
    const allButtonsFlat = allButtonsFlatForGraph;
    
    // Добавляем текущую страницу в граф
    navGraph.addNode(currentUrl, allButtonsFlat);
    
    // Получаем только непробованные кнопки (доп. фильтр по clickedButtons для кнопок из модалей)
    let untriedButtons = enableBacktracking ? 
      navGraph.getUntriedButtons(currentUrl, allButtonsFlat) : 
      allButtonsFlat.filter(btn => !state.clickedButtons.has(this._getButtonKey(btn)));
    untriedButtons = untriedButtons.filter(btn => !state.clickedButtons.has(this._getButtonKey(btn)));
    
    // Категоризируем непробованные кнопки
    const buttons = {
      save: untriedButtons.filter(btn => allButtons.save.includes(btn)),
      navigation: untriedButtons.filter(btn => allButtons.navigation.includes(btn)),
      other: untriedButtons.filter(btn => allButtons.other.includes(btn))
    };
    
    if (this.debugMode) {
      console.log(`🔍 [AdaptiveAuto] Непробованных кнопок: save=${buttons.save.length}, nav=${buttons.navigation.length}, other=${buttons.other.length}`);
    }

    // 8. Попробовать нажать кнопку (save → navigation → other)
    let clicked = false;
    let clickedButton = null;
    const formStateForSave = this._getFormState(); // актуальное состояние после fill
    const buttonCategories = [
      { name: 'save', buttons: buttons.save },
      { name: 'navigation', buttons: buttons.navigation },
      { name: 'other', buttons: buttons.other }
    ];

    for (const category of buttonCategories) {
      if (clicked) break;
      
      // КРИТИЧНО: Проверка обязательных полей перед нажатием SAVE кнопки
      if (category.name === 'save' && formStateForSave.emptyRequired > 0) {
        console.log(`⚠️ [AdaptiveAuto] Пропускаю save кнопку: есть ${formStateForSave.emptyRequired} незаполненных обязательных полей`);
        console.log(`   📝 Обязательные поля: ${formStateForSave.required}, пустых: ${formStateForSave.emptyRequired}`);
        
        // Попытка заполнить обязательные поля
        try {
          console.log(`📝 [AdaptiveAuto] Заполнение обязательных полей перед save...`);
          await this.handleAnalysis({
            type: 'analysis',
            subtype: 'analysis-fill-fields',
            fillOptions: { fillTarget: 'required', fillMode: 'random', charCount: 10, charset: 'lettersAndNumbers' }
          });
          stats.actionsInvoked++;
          stats.fieldsFilled += formState.emptyRequired;
          
          // Проверяем снова
          const updatedFormState = this._getFormState();
          if (updatedFormState.emptyRequired > 0) {
            console.log(`⚠️ [AdaptiveAuto] После заполнения всё ещё ${updatedFormState.emptyRequired} незаполненных обязательных полей`);
            console.log(`   ❌ Пропускаю save кнопку`);
            continue; // Пропускаем save кнопки
          } else {
            console.log(`✅ [AdaptiveAuto] Все обязательные поля заполнены, можно нажать save`);
          }
        } catch (e) {
          console.warn(`⚠️ [AdaptiveAuto] Не удалось заполнить обязательные поля:`, e?.message);
          continue; // Пропускаем save кнопки
        }
      }
      
      for (const btn of category.buttons) {
        const btnKey = this._getButtonKey(btn);
        const el = btn.element || btn;
        const isDisabled = !!(el?.disabled || el?.getAttribute?.('aria-disabled') === 'true' || el?.closest?.('[aria-disabled="true"]'));
        if (isDisabled) {
          if (this.debugMode) console.log(`⏭️ [AdaptiveAuto] Пропускаю отключённую кнопку: "${btn.text}"`);
          continue;
        }
        
        try {
          // Попытка клика
          await this._clickElement(btn);
          clicked = true;
          clickedButton = btn;
          state.clickedButtons.add(btnKey);
          stats.actionsInvoked++;
          
          console.log(`✅ [AdaptiveAuto] Нажата кнопка (${category.name}): "${btn.text}"`);
          break;
          
        } catch (error) {
          console.warn(`⚠️ [AdaptiveAuto] Ошибка клика по "${btn.text}":`, error?.message);
          
          // RECOVERY: Попытка восстановления
          stats.recoveryAttempts++;
          const recovery = await RECOVERY_STRATEGIES.BUTTON_NOT_CLICKABLE(btn, this);
          
          if (recovery.success) {
            console.log(`✅ [Recovery] Клик успешен через: ${recovery.strategy}`);
            clicked = true;
            clickedButton = btn;
            state.clickedButtons.add(btnKey);
            stats.actionsInvoked++;
            
            adaptiveAction._runHistory.push({
              iteration: state.iterations,
              action: 'recovery',
              recoveryType: 'BUTTON_NOT_CLICKABLE',
              strategy: recovery.strategy,
              buttonText: btn.text,
              url: currentUrl,
              timestamp: new Date().toISOString(),
              success: true
            });
            
            break;
          } else {
            console.warn(`❌ [Recovery] Не удалось восстановить клик`);
            adaptiveAction._runHistory.push({
              iteration: state.iterations,
              action: 'recovery',
              recoveryType: 'BUTTON_NOT_CLICKABLE',
              strategy: 'failed',
              buttonText: btn.text,
              url: currentUrl,
              timestamp: new Date().toISOString(),
              success: false,
              error: error?.message
            });
          }
        }
      }
    }

    // 9. Обработка результата клика
    if (clicked && clickedButton) {
      await this.delay(500);
      const newUrl = window.location.href;
      const urlChanged = newUrl !== currentUrl;
      
      // Записываем в граф
      if (enableBacktracking) {
        const btnKey = this._getButtonKey(clickedButton);
        navGraph.markButtonClicked(currentUrl, btnKey, newUrl, urlChanged);
      }
      
      // Записываем в историю
      adaptiveAction._runHistory.push({
        iteration: state.iterations,
        action: 'click',
        buttonType: clickedButton.type || 'unknown',
        buttonText: clickedButton.text,
        selector: clickedButton.selector,
        url: currentUrl,
        newUrl: newUrl,
        urlChanged: urlChanged,
        timestamp: new Date().toISOString(),
        success: true
      });
      
      if (urlChanged) {
        state.stuckCount = 0;
      } else {
        state.stuckCount++;
        if (state.stuckCount >= 3) {
          console.log(`⚠️ [AdaptiveAuto] URL не меняется после ${state.stuckCount} кликов`);
        }
      }
      
    } else {
      // 10. НЕТ ДОСТУПНЫХ КНОПОК - BACKTRACKING
      if (enableBacktracking) {
        const backtrackInfo = navGraph.canBacktrack(currentUrl);
        
        if (backtrackInfo) {
          console.log(`🔙 [AdaptiveAuto] Backtrack к ${backtrackInfo.url} (непробованных кнопок: ${backtrackInfo.untriedCount})`);
          
          stats.backtrackCount++;
          navGraph.recordBacktrack(currentUrl, backtrackInfo.url, 'no-untried-buttons');
          
          // Переходим назад
          window.location.href = backtrackInfo.url;
          await this.delay(2000);
          
          // Ждём готовности страницы
          await RECOVERY_STRATEGIES.PAGE_NOT_READY(this);
          
          adaptiveAction._runHistory.push({
            iteration: state.iterations,
            action: 'backtrack',
            from: currentUrl,
            to: backtrackInfo.url,
            reason: 'no-untried-buttons',
            untriedCount: backtrackInfo.untriedCount,
            timestamp: new Date().toISOString(),
            success: true
          });
          
          // Сбрасываем stuckCount после backtrack
          state.stuckCount = 0;
          
          continue; // Продолжаем цикл
          
        } else {
          // Нет возможности backtrack
          console.log(`🏁 [AdaptiveAuto] Нет доступных кнопок и нет путей для backtrack`);
          
          // Статистика графа
          const graphStats = navGraph.getStats();
          console.log(`📊 [AdaptiveAuto] Граф навигации: URLs=${graphStats.urls}, кнопок=${graphStats.buttons}, нажато=${graphStats.clicked}, покрытие=${graphStats.coverage}%`);
          
          break;
        }
      } else {
        // Backtracking отключён - просто завершаем
        console.log(`🏁 [AdaptiveAuto] Нет доступных кнопок для нажатия`);
        break;
      }
    }

    // Небольшая пауза между итерациями
    await this.delay(300);
  }
  
  // Удаляем overlay
  this._removeAdaptiveOverlay();
  
  // Статистика графа навигации
  if (enableBacktracking) {
    const graphStats = navGraph.getStats();
    stats.graphStats = graphStats;
    console.log(`📊 [AdaptiveAuto] Финальная статистика графа: URLs=${graphStats.urls}, кнопок=${graphStats.buttons}, нажато=${graphStats.clicked}, покрытие=${graphStats.coverage}%, backtracks=${graphStats.backtracks}`);
  }

  // Сохраняем статистику
  if (this.runHistory && adaptiveAction._statistics) {
    this.runHistory.adaptiveStatistics = this.runHistory.adaptiveStatistics || {};
    const key = String(this.currentActionIndex ?? 'unknown');
    this.runHistory.adaptiveStatistics[key] = {
      iterations: stats.iterations,
      actionsInvoked: stats.actionsInvoked,
      fieldsFilled: stats.fieldsFilled,
      dropdownsExplored: stats.dropdownsExplored,
      checkboxesToggles: stats.checkboxesToggles,
      backtrackCount: stats.backtrackCount,
      recoveryAttempts: stats.recoveryAttempts,
      wizardSteps: stats.wizardSteps,
      graphStats: stats.graphStats,
      errors: stats.errors,
      clickedButtons: Array.from(state.clickedButtons),
      visitedUrls: Array.from(state.visitedUrls)
    };
  }

  console.log(`✅ [AdaptiveAuto] Завершён: iterations=${state.iterations}, actions=${stats.actionsInvoked}, fields=${stats.fieldsFilled}, dropdowns=${stats.dropdownsExplored}, checkboxes=${stats.checkboxesToggles}, backtracks=${stats.backtrackCount}, recovery=${stats.recoveryAttempts}`);
  return { success: true, iterations: state.iterations, statistics: stats };
}

/**
 * Выполняет пользовательский сценарий (adaptive-flow)
 * Контролируемая последовательность шагов с вариациями
 */
TestPlayer.prototype.handleAdaptiveFlow = async function(adaptiveAction) {
  const flow = adaptiveAction.flow || [];
  const flowOptions = adaptiveAction.flowOptions || {};
  
  if (flow.length === 0) {
    throw new Error('Adaptive-flow: нет шагов для выполнения');
  }

  // Инициализация
  if (!Array.isArray(adaptiveAction._runHistory)) {
    adaptiveAction._runHistory = [];
  }
  if (!adaptiveAction._flowStatistics) {
    adaptiveAction._flowStatistics = {
      stepsCompleted: 0,
      totalVariations: 0,
      actionsInvoked: 0,
      errors: [],
      snapshots: {}
    };
  }

  const stats = adaptiveAction._flowStatistics;
  const snapshots = flowOptions.saveSnapshots !== false ? {} : null;

  console.log(`🎯 [AdaptiveFlow] Запуск сценария: ${flow.length} шагов`);
  console.log(`   Настройки: maxVariations=${flowOptions.maxVariationsPerStep || 5}, backtrack=${flowOptions.allowBacktrack !== false}, stopOnError=${flowOptions.stopOnError === true}, snapshots=${snapshots !== null}`);

  // ГЛАВНЫЙ ЦИКЛ - выполнение шагов
  for (let stepIndex = 0; stepIndex < flow.length; stepIndex++) {
    if (!this.isPlaying) {
      console.log(`⏸️ [AdaptiveFlow] Остановлено пользователем на шаге ${stepIndex + 1}`);
      break;
    }

    const step = flow[stepIndex];
    console.log(`\n📍 [AdaptiveFlow] Шаг ${step.step}/${flow.length}: "${step.name}"`);

    try {
      // 1. Сохранить snapshot перед выполнением (если включено)
      if (snapshots) {
        try {
          console.log(`💾 [AdaptiveFlow] Сохранение snapshot для шага ${step.step}...`);
          snapshots[step.step] = await this._captureSnapshot();
          console.log(`✅ [AdaptiveFlow] Snapshot сохранён`);
        } catch (snapError) {
          console.warn(`⚠️ [AdaptiveFlow] Не удалось сохранить snapshot:`, snapError.message);
        }
      }

      // 2. Обновить селекторы для текущей страницы
      console.log(`🔄 [AdaptiveFlow] Обновление селекторов...`);
      await this._ensureSelectorsForAdaptive();
      console.log(`✅ [AdaptiveFlow] Селекторы обновлены`);

      // 3. Выполнить действия шага
      const stepActions = step.actions || [];
      for (let i = 0; i < stepActions.length; i++) {
        const action = stepActions[i];
        console.log(`   ▶️ Действие ${i + 1}/${stepActions.length}: ${action.type}`);
        
        await this._executeFlowAction(action);
        stats.actionsInvoked++;
        
        await this.delay(300); // Небольшая задержка между действиями
      }

      // 4. Выполнить вариации (если включено)
      if (step.variations?.enabled) {
        console.log(`🔄 [AdaptiveFlow] Выполнение вариаций...`);
        
        const variationResults = await this._executeFlowVariations(
          step, 
          flowOptions.maxVariationsPerStep || 5
        );
        
        stats.totalVariations += variationResults.length;
        console.log(`   ✅ Вариаций выполнено: ${variationResults.length}`);
        
        adaptiveAction._runHistory.push({
          step: step.step,
          name: step.name,
          action: 'variations',
          results: variationResults,
          timestamp: new Date().toISOString(),
          success: true
        });
      }

      stats.stepsCompleted++;
      console.log(`✅ [AdaptiveFlow] Шаг ${step.step} завершён успешно`);
      
      adaptiveAction._runHistory.push({
        step: step.step,
        name: step.name,
        action: 'completed',
        success: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ [AdaptiveFlow] Ошибка на шаге ${step.step}: ${error.message}`);
      
      stats.errors.push({
        step: step.step,
        name: step.name,
        message: error.message,
        timestamp: new Date().toISOString()
      });

      adaptiveAction._runHistory.push({
        step: step.step,
        name: step.name,
        action: 'error',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Если шаг обязательный ИЛИ stopOnError - остановить
      if (step.required) {
        console.error(`🛑 [AdaptiveFlow] Шаг ${step.step} обязательный - останавливаем выполнение`);
        throw new Error(`Критическая ошибка на обязательном шаге ${step.step}: ${error.message}`);
      }
      
      if (flowOptions.stopOnError === true) {
        console.error(`🛑 [AdaptiveFlow] Настройка "остановить при ошибке" активна - останавливаем`);
        throw new Error(`Ошибка на шаге ${step.step}: ${error.message}`);
      }

      // Попытка восстановления через snapshot
      if (snapshots && flowOptions.allowBacktrack !== false && snapshots[step.step]) {
        console.log(`🔄 [AdaptiveFlow] Попытка восстановления через snapshot...`);
        try {
          await this._restoreSnapshot(snapshots[step.step]);
          console.log(`✅ [AdaptiveFlow] Snapshot восстановлен, продолжаем со следующего шага`);
        } catch (restoreError) {
          console.error(`⚠️ [AdaptiveFlow] Не удалось восстановить snapshot:`, restoreError.message);
        }
      }

      // Продолжаем со следующего шага (если не обязательный и не stopOnError)
      console.log(`⏭️ [AdaptiveFlow] Пропускаем шаг ${step.step}, переходим к следующему`);
    }
  }

  console.log(`\n✅ [AdaptiveFlow] Сценарий завершён:`);
  console.log(`   Шагов выполнено: ${stats.stepsCompleted}/${flow.length}`);
  console.log(`   Всего вариаций: ${stats.totalVariations}`);
  console.log(`   Действий: ${stats.actionsInvoked}`);
  console.log(`   Ошибок: ${stats.errors.length}`);
  
  return {
    success: stats.stepsCompleted === flow.length,
    stepsCompleted: stats.stepsCompleted,
    totalSteps: flow.length,
    totalVariations: stats.totalVariations,
    actionsInvoked: stats.actionsInvoked,
    errors: stats.errors
  };
}

/**
 * Выполняет одно действие из flow
 */
TestPlayer.prototype._executeFlowAction = async function(action) {
  const actionType = action.type;

  if (actionType === 'fill-fields') {
    console.log(`   📝 Заполнение полей (режим: ${action.fillTarget || 'required'})`);
    
    await this.handleAnalysis({
      type: 'analysis',
      subtype: 'analysis-fill-fields',
      fillOptions: {
        fillTarget: action.fillTarget || 'required',
        fillMode: 'random',
        charCount: 10,
        charset: 'lettersAndNumbers'
      }
    });
    
  } else if (actionType === 'click') {
    console.log(`   👆 Поиск кнопки: "${action.selectorHint || '(не указана подсказка)'}"`);
    
    // Найти кнопку по selectorHint
    const buttons = this._findInteractiveElements([]);
    const allButtons = [...buttons.save, ...buttons.navigation, ...buttons.other];
    
    const hint = (action.selectorHint || '').toLowerCase();
    
    let button = null;
    if (hint) {
      // Поиск по подсказке
      button = allButtons.find(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        return text.includes(hint);
      });
    }
    
    // Если не найдена по подсказке, берём первую кнопку save или navigation
    if (!button && allButtons.length > 0) {
      button = buttons.save[0] || buttons.navigation[0] || allButtons[0];
      console.log(`   ℹ️ Кнопка по подсказке не найдена, используем первую доступную: "${button.textContent}"`);
    }

    if (button) {
      console.log(`   ✓ Найдена кнопка: "${button.textContent.trim()}"`);
      button.click();
      await this.delay(500);
    } else {
      throw new Error(`Кнопка не найдена${hint ? `: "${action.selectorHint}"` : ''}`);
    }
    
  } else if (actionType === 'wait') {
    const delay = action.delay || 1000;
    console.log(`   ⏱️ Ожидание ${delay}ms`);
    await this.delay(delay);
    
  } else if (actionType === 'screenshot') {
    console.log(`   📸 Создание скриншота`);
    await this.handleScreenshot({ type: 'screenshot' });
    
  } else {
    console.warn(`   ⚠️ Неизвестный тип действия: ${actionType}`);
  }
}

/**
 * Выполняет вариации на текущем шаге
 */
TestPlayer.prototype._executeFlowVariations = async function(step, maxVariations) {
  const results = [];
  const formState = this._getFormState();

  // 1. Перебор dropdown опций
  if (step.variations.tryDropdownOptions && formState.fieldsByType.select.length > 0) {
    const dropdownCount = Math.min(
      step.variations.tryDropdownOptions || 3,
      maxVariations
    );
    
    console.log(`   🔽 Исследование dropdown (до ${dropdownCount} опций)...`);
    
    for (const select of formState.fieldsByType.select.slice(0, 3)) { // Макс 3 dropdown за шаг
      try {
        const options = await this._tryDropdownOptions(select, dropdownCount);
        results.push(...options);
        console.log(`      ✓ Dropdown исследован: ${options.length} опций`);
      } catch (e) {
        console.warn(`      ⚠️ Ошибка исследования dropdown:`, e.message);
      }
    }
  }

  // 2. Переключение checkbox
  if (step.variations.tryCheckboxStates && formState.fieldsByType.checkbox.length > 0) {
    console.log(`   ☑️ Переключение checkbox (2 состояния)...`);
    
    for (const checkbox of formState.fieldsByType.checkbox.slice(0, 3)) { // Макс 3 checkbox за шаг
      try {
        const toggles = await this._tryCheckboxToggle(checkbox, 2);
        results.push(...toggles);
        console.log(`      ✓ Checkbox переключен: ${toggles.length} состояний`);
      } catch (e) {
        console.warn(`      ⚠️ Ошибка переключения checkbox:`, e.message);
      }
    }
  }

  return results;
}

/**
 * Захватывает snapshot текущего состояния
 */
TestPlayer.prototype._captureSnapshot = async function() {
  return {
    url: window.location.href,
    scrollPosition: {
      x: window.scrollX,
      y: window.scrollY
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Восстанавливает состояние из snapshot
 */
TestPlayer.prototype._restoreSnapshot = async function(snapshot) {
  if (!snapshot) {
    throw new Error('Snapshot не найден');
  }

  console.log(`   🔄 Восстановление snapshot от ${snapshot.timestamp}`);

  // Переход на сохранённый URL (если изменился)
  if (window.location.href !== snapshot.url) {
    console.log(`   🌐 Переход на URL: ${snapshot.url}`);
    
    await this.handleNavigation({
      type: 'navigation',
      subtype: 'nav-url',
      url: snapshot.url
    });
    
    await this.delay(1000); // Дожидаемся загрузки
  }

  // Восстановление scroll позиции
  window.scrollTo(snapshot.scrollPosition.x, snapshot.scrollPosition.y);
  
  console.log(`   ✅ Snapshot восстановлен`);
}

/**
 * Поиск интерактивных элементов на странице
 * Возвращает объект с категориями кнопок: save, navigation, other
 */
TestPlayer.prototype._findInteractiveElements = function(excludeButtons = []) {
  const result = {
    save: [],       // Кнопки сохранения/отправки
    navigation: [], // Кнопки навигации (Далее, Продолжить)
    other: []       // Прочие кнопки
  };

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
  };

  const getText = (el) => {
    return (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || '').trim();
  };

  const getSelector = (el) => {
    // Пытаемся построить надёжный селектор
    if (el.id) return `#${el.id}`;
    if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
    if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(c => c && !c.includes(':')).slice(0, 2).join('.');
      if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
    }
    return el.tagName.toLowerCase();
  };

  // Тексты для категоризации
  const saveTexts = ['сохранить', 'save', 'отправить', 'send', 'submit', 'создать', 'create', 'добавить', 'add', 'применить', 'apply', 'зарегистрировать', 'register'];
  const navTexts = ['далее', 'next', 'продолжить', 'continue', 'следующий', 'вперед', 'forward', 'готово', 'done', 'закончить', 'finish'];
  const actionLikeTexts = ['добавить', 'add', 'создать', 'create', 'документ', 'document', 'новый', 'new', 'открыть', 'open'];
  const excludeTexts = ['отмена', 'cancel', 'удалить', 'delete', 'закрыть', 'close', 'назад', 'back', 'очистить', 'clear', 'сбросить', 'reset', ...excludeButtons];

  // Ищем все кнопки и ссылки
  const elements = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"], [onclick]');
  // Div/span, выглядящие как кнопки (Angular: text-body, link и т.д.)
  const divLike = document.querySelectorAll('div[class*="text-body"], div[class*="link"], div[class*="action"], span[class*="text-body"], span[class*="link"], [class*="add-document"], [class*="add-link"]');
  const allElements = [...elements, ...divLike];

  const isDisabled = (el) => !!(el?.disabled || el?.getAttribute?.('aria-disabled') === 'true' || el?.closest?.('[aria-disabled="true"]'));
  const isActionLikeDiv = (el) => (el.tagName === 'DIV' || el.tagName === 'SPAN') && actionLikeTexts.some(t => (el.textContent || '').toLowerCase().includes(t));
  for (const el of allElements) {
    if (!isVisible(el)) continue;
    if (isDisabled(el)) continue;
    const text = getText(el).toLowerCase();
    if (!text || text.length < 2) continue;
    if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && (!isActionLikeDiv(el) || el.closest('button, a, [role="button"]'))) continue;
    const selector = getSelector(el);

    // Пропускаем исключённые кнопки
    if (excludeTexts.some(ex => text.includes(ex))) continue;

    // Проверяем, что это не кнопка внутри нашего UI
    if (el.closest('#autotest-completion-popup, .autotest-overlay, [id*="autotest"]')) continue;

    const btnInfo = { element: el, text: getText(el), selector, textLower: text };

    // Категоризируем
    if (saveTexts.some(s => text.includes(s))) {
      result.save.push(btnInfo);
    } else if (navTexts.some(n => text.includes(n))) {
      result.navigation.push(btnInfo);
    } else if (text.length > 0) {
      result.other.push(btnInfo);
    }
  }

  // Сортируем по приоритету (сначала кнопки с более точным совпадением)
  const sortByPriority = (arr, priorities) => {
    arr.sort((a, b) => {
      const aPriority = priorities.findIndex(p => a.textLower.includes(p));
      const bPriority = priorities.findIndex(p => b.textLower.includes(p));
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.text.length - b.text.length; // Короче = точнее
    });
  };

  sortByPriority(result.save, ['сохранить', 'save', 'отправить', 'send', 'submit']);
  sortByPriority(result.navigation, ['далее', 'next', 'продолжить', 'continue']);

  return result;
}

/**
 * Генерирует уникальный ключ для кнопки (для отслеживания нажатых)
 */
TestPlayer.prototype._getButtonKey = function(btnInfo) {
  return btnInfo.selector + '|' + btnInfo.textLower;
}

/**
 * Adaptive-Flow: Пошаговый сценарий с контролем последовательности и вариациями
 * Позволяет задать последовательность действий с возможностью исследования вариантов на каждом шаге
 */
TestPlayer.prototype.handleAdaptiveFlow = async function(adaptiveAction) {
  const flow = adaptiveAction.flow || [];
  const flowOptions = adaptiveAction.flowOptions || {
    maxVariationsPerStep: 5,
    allowBacktrack: true,
    stopOnError: false,
    saveStateAtEachStep: true
  };

  if (flow.length === 0) {
    throw new Error('Adaptive Flow: не задана последовательность шагов (flow)');
  }

  if (!Array.isArray(adaptiveAction._runHistory)) {
    adaptiveAction._runHistory = [];
  }
  if (!adaptiveAction._statistics) {
    adaptiveAction._statistics = {
      stepsCompleted: 0,
      actionsInvoked: 0,
      variationsExplored: 0,
      snapshotsCreated: 0,
      snapshotsRestored: 0,
      errors: []
    };
  }
  if (!adaptiveAction._snapshots) {
    adaptiveAction._snapshots = [];
  }

  const stats = adaptiveAction._statistics;
  const state = {
    currentStepIndex: 0,
    totalSteps: flow.length,
    stepHistory: [],
    variations: new Map(), // stepIndex -> [variation1, variation2, ...]
    totalActions: 0
  };

  console.log(`🎬 [AdaptiveFlow] Запуск: ${flow.length} шагов, maxVariationsPerStep=${flowOptions.maxVariationsPerStep}`);

  // Создаём overlay с прогрессом
  const testName = adaptiveAction.description || 'Adaptive Flow';
  let overlay = this._createFlowOverlay(state, stats, testName, flow);

  for (let stepIndex = 0; stepIndex < flow.length; stepIndex++) {
    if (!this.isPlaying) break;

    const flowStep = flow[stepIndex];
    state.currentStepIndex = stepIndex;

    // Обновляем overlay
    this._updateFlowOverlay(overlay, state, stats, flow);

    console.log(`📍 [AdaptiveFlow] Шаг ${stepIndex + 1}/${flow.length}: ${flowStep.name || 'Unnamed'}`);

    // Сохраняем snapshot ПЕРЕД выполнением шага
    if (flowOptions.saveStateAtEachStep) {
      await this._saveSnapshot(adaptiveAction, `before-step-${stepIndex + 1}`, flowStep.name);
      stats.snapshotsCreated++;
    }

    // Обработать диалоги
    await this._handleOpenDialogIfAny(3);

    // Обновить селекторы для текущей страницы
    try {
      await this._ensureSelectorsForAdaptive();
    } catch (e) {
      console.warn(`⚠️ [AdaptiveFlow] Не удалось обновить селекторы:`, e?.message);
    }

    // Выполняем основное действие шага
    const mainResult = await this._executeFlowStepAction(flowStep, adaptiveAction);

    if (!mainResult.success && flowStep.required) {
      console.error(`❌ [AdaptiveFlow] Обязательный шаг ${stepIndex + 1} не выполнен, остановка`);
      stats.errors.push({
        step: stepIndex + 1,
        name: flowStep.name,
        error: mainResult.error || 'Step failed',
        timestamp: new Date().toISOString()
      });

      if (!flowOptions.stopOnError) {
        console.warn(`⚠️ [AdaptiveFlow] Продолжаем выполнение несмотря на ошибку`);
      } else {
        break;
      }
    }

    state.stepHistory.push({
      step: stepIndex + 1,
      name: flowStep.name,
      success: mainResult.success,
      mainAction: mainResult,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });

    stats.stepsCompleted++;
    stats.actionsInvoked++;
    state.totalActions++;

    adaptiveAction._runHistory.push({
      step: stepIndex + 1,
      name: flowStep.name,
      action: mainResult,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      success: mainResult.success
    });

    // Пробуем вариации если включены
    if (flowStep.variations?.enabled && mainResult.success) {
      console.log(`🔀 [AdaptiveFlow] Исследование вариаций шага ${stepIndex + 1}...`);

      const variations = await this._tryFlowStepVariations(
        flowStep,
        flowOptions.maxVariationsPerStep || 5,
        adaptiveAction
      );

      state.variations.set(stepIndex, variations);
      stats.variationsExplored += variations.length;
      state.totalActions += variations.length;

      // Записываем вариации в историю
      variations.forEach(v => {
        adaptiveAction._runHistory.push({
          step: stepIndex + 1,
          name: flowStep.name,
          variation: v,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          success: true
        });
      });
    }

    // Сохраняем snapshot ПОСЛЕ выполнения шага
    if (flowOptions.saveStateAtEachStep) {
      await this._saveSnapshot(adaptiveAction, `after-step-${stepIndex + 1}`, flowStep.name);
      stats.snapshotsCreated++;
    }

    await this.delay(300);
  }

  // Удаляем overlay
  this._removeFlowOverlay();

  console.log(`✅ [AdaptiveFlow] Завершён: ${state.totalActions} действий за ${stats.stepsCompleted} шагов`);

  // Сохраняем финальное состояние
  adaptiveAction._flowState = { ...state };

  return { success: true, state, stats };
}

/**
 * Кликает по элементу с обработкой событий
 */
TestPlayer.prototype._clickElement = async function(btnInfo) {
  const el = btnInfo.element;
  if (!el) throw new Error('Element not found');

  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  await this.delay(100);

  try {
    el.focus();
  } catch (e) {}

  // Пробуем программный клик
  try {
    el.click();
    return;
  } catch (e) {}

  // Fallback: MouseEvent
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

  el.dispatchEvent(new MouseEvent('mousedown', opts));
  await this.delay(50);
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  await this.delay(30);
  el.dispatchEvent(new MouseEvent('click', opts));
}

/**
 * Обработчик ввода текста
 */
})();
