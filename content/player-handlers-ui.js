/**
 * AutoTest Recorder - Player Module
 * UI action handlers: datepicker, media, device, chain
 * 
 * Loaded after player-core.js. Extends TestPlayer.prototype.
 * @module player-handlers-ui
 */
(function() {
  'use strict';

  var TestPlayer = window._TestPlayerClass;
  if (!TestPlayer) {
    console.error('[player-handlers-ui.js] TestPlayer not found. Load player-core.js first.');
    return;
  }

TestPlayer.prototype.handleDatepicker = async function(action) {
  const subtype = action.subtype || 'datepicker-select-date';
  
  switch (subtype) {
    case 'datepicker-select-date': {
      const selector = action.selector?.value || action.selector?.selector;
      if (!selector) {
        throw new Error('Не указан селектор датапикера');
      }
      
      const dateInput = document.querySelector(selector);
      if (!dateInput) {
        throw new Error(`Датапикер не найден: ${selector}`);
      }
      
      const dateValue = this.substituteVariables(action.date || action.value || '');
      if (!dateValue) {
        throw new Error('Не указана дата');
      }
      
      if (dateInput.type === 'date' || dateInput.type === 'datetime-local') {
        dateInput.focus();
        dateInput.value = dateValue;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Дата установлена: ${dateValue}`);
      } else {
        const [d, m, y] = (dateValue || '').split(/[.\-/]/).map(s => parseInt(s, 10));
        const triggerBtn = document.querySelector('#deadlineDate_btn, [id*="Date_btn"]') || dateInput.closest('.form-group, .wizard__form-group, [class*="form-group"]')?.querySelector('button, [role="button"], .arrow, [class*="arrow"]') || dateInput.nextElementSibling || dateInput.parentElement?.querySelector('button, [role="button"], .arrow');
        let setByClick = false;
        if (triggerBtn && !isNaN(d) && d >= 1 && d <= 31) {
          triggerBtn.click();
          const wait = this.smartWaiter ? this.smartWaiter.minimalDelay(300) : this.delay(300);
          await wait;
          const overlay = document.querySelector('.cdk-overlay-pane [class*="calendar"], .cdk-overlay-pane [class*="datepicker"]') || document.querySelector('.cdk-overlay-pane');
          const cells = overlay ? overlay.querySelectorAll('[class*="calendar__table-cell"], [class*="day-cell"], [class*="date-cell"]') : document.querySelectorAll('.cdk-overlay-pane [class*="calendar__table-cell"], .cdk-overlay-pane [class*="day-cell"]');
          for (const cell of cells) {
            const cls = (cell.className || '').toLowerCase();
            if (cls.includes('outside') || cls.includes('other-month')) continue;
            const txt = (cell.textContent || '').trim();
            if (txt === String(d) || txt === String(d).padStart(2, '0')) {
              cell.click();
              setByClick = true;
              console.log(`✅ Дата выбрана кликом по ячейке: ${dateValue}`);
              break;
            }
          }
        }
        if (!setByClick) {
          dateInput.focus();
          dateInput.value = dateValue;
          dateInput.dispatchEvent(new Event('input', { bubbles: true }));
          dateInput.dispatchEvent(new Event('change', { bubbles: true }));
          dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
          console.log(`✅ Дата введена: ${dateValue}`);
        }
      }
      break;
    }
    
    case 'datepicker-select-range': {
      const selector = action.selector?.value || action.selector?.selector;
      if (!selector) {
        throw new Error('Не указан селектор датапикера');
      }
      
      const startDate = this.substituteVariables(action.startDate || action.from || '');
      const endDate = this.substituteVariables(action.endDate || action.to || '');
      
      if (!startDate || !endDate) {
        throw new Error('Не указаны начальная и конечная даты');
      }
      
      const dateInput = document.querySelector(selector);
      if (dateInput) {
        // Для range пикеров обычно используется формат "start - end"
        const rangeValue = `${startDate} - ${endDate}`;
        dateInput.value = rangeValue;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Диапазон дат установлен: ${rangeValue}`);
      }
      break;
    }
    
    case 'datepicker-select-time': {
      const selector = action.selector?.value || action.selector?.selector;
      const timeValue = this.substituteVariables(action.time || action.value || '');
      
      const timeInput = document.querySelector(selector);
      if (timeInput) {
        timeInput.value = timeValue;
        timeInput.dispatchEvent(new Event('input', { bubbles: true }));
        timeInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Время установлено: ${timeValue}`);
      }
      break;
    }
    
    case 'datepicker-clear': {
      const selector = action.selector?.value || action.selector?.selector;
      const dateInput = document.querySelector(selector);
      if (dateInput) {
        dateInput.value = '';
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✅ Датапикер очищен');
      }
      break;
    }
    
    case 'datepicker-open':
    case 'datepicker-close': {
      const selector = action.selector?.value || action.selector?.selector;
      const dateInput = document.querySelector(selector);
      if (dateInput) {
        if (subtype === 'datepicker-open') {
          dateInput.click();
          dateInput.focus();
          console.log('✅ Датапикер открыт');
        } else {
          dateInput.blur();
          console.log('✅ Датапикер закрыт');
        }
      }
      break;
    }
    
    default:
      throw new Error(`Неподдерживаемый подтип datepicker: ${subtype}`);
  }
}

/**
 * Обработчик управления медиа элементами
 */
TestPlayer.prototype.handleMedia = async function(action) {
  const subtype = action.subtype || 'media-play';
  const selector = action.selector?.value || action.selector?.selector;
  
  if (!selector) {
    throw new Error('Не указан селектор медиа элемента');
  }
  
  const mediaElement = document.querySelector(selector);
  if (!mediaElement) {
    throw new Error(`Медиа элемент не найден: ${selector}`);
  }
  
  if (!(mediaElement instanceof HTMLMediaElement)) {
    throw new Error('Элемент не является медиа элементом (audio/video)');
  }
  
  switch (subtype) {
    case 'media-play':
      await mediaElement.play();
      console.log('✅ Медиа воспроизводится');
      break;
      
    case 'media-pause':
      mediaElement.pause();
      console.log('✅ Медиа на паузе');
      break;
      
    case 'media-stop':
      mediaElement.pause();
      mediaElement.currentTime = 0;
      console.log('✅ Медиа остановлено');
      break;
      
    case 'media-seek': {
      const seekTime = parseFloat(action.time || action.position || action.value || 0);
      mediaElement.currentTime = seekTime;
      console.log(`✅ Перемотка на ${seekTime}s`);
      break;
    }
    
    case 'media-set-volume': {
      const volume = parseFloat(action.volume || action.value || 1);
      mediaElement.volume = Math.max(0, Math.min(1, volume)); // 0-1
      console.log(`✅ Громкость установлена: ${mediaElement.volume}`);
      break;
    }
    
    case 'media-mute':
      mediaElement.muted = true;
      console.log('✅ Звук выключен');
      break;
      
    case 'media-unmute':
      mediaElement.muted = false;
      console.log('✅ Звук включен');
      break;
      
    case 'media-set-playback-rate': {
      const rate = parseFloat(action.rate || action.speed || action.value || 1);
      mediaElement.playbackRate = rate;
      console.log(`✅ Скорость воспроизведения: ${rate}x`);
      break;
    }
    
    case 'media-fullscreen':
      if (mediaElement.requestFullscreen) {
        await mediaElement.requestFullscreen();
        console.log('✅ Полный экран');
      }
      break;
      
    case 'media-exit-fullscreen':
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        console.log('✅ Выход из полного экрана');
      }
      break;
      
    default:
      throw new Error(`Неподдерживаемый подтип media: ${subtype}`);
  }
}

/**
 * Обработчик эмуляции устройств
 */
TestPlayer.prototype.handleDevice = async function(action) {
  const subtype = action.subtype || 'device-set-viewport';
  
  switch (subtype) {
    case 'device-set-viewport': {
      const width = parseInt(action.width || action.viewportWidth || 1920);
      const height = parseInt(action.height || action.viewportHeight || 1080);
      
      // В content script нельзя изменить размер окна напрямую
      // Отправляем сообщение в background для изменения размера
      await chrome.runtime.sendMessage({
        type: 'DEVICE_SET_VIEWPORT',
        width,
        height,
        tabId: this.tabId
      });
      console.log(`✅ Viewport установлен: ${width}x${height}`);
      break;
    }
    
    case 'device-rotate': {
      const orientation = action.orientation || action.value || 'portrait';
      // Swap width/height для rotation
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      if (orientation === 'landscape' && currentWidth < currentHeight) {
        await chrome.runtime.sendMessage({
          type: 'DEVICE_SET_VIEWPORT',
          width: currentHeight,
          height: currentWidth,
          tabId: this.tabId
        });
        console.log('✅ Устройство повернуто: landscape');
      } else if (orientation === 'portrait' && currentWidth > currentHeight) {
        await chrome.runtime.sendMessage({
          type: 'DEVICE_SET_VIEWPORT',
          width: currentHeight,
          height: currentWidth,
          tabId: this.tabId
        });
        console.log('✅ Устройство повернуто: portrait');
      }
      break;
    }
    
    case 'device-emulate-mobile': {
      // Preset для мобильного устройства (iPhone 12 Pro)
      await chrome.runtime.sendMessage({
        type: 'DEVICE_SET_VIEWPORT',
        width: 390,
        height: 844,
        tabId: this.tabId
      });
      console.log('✅ Эмуляция мобильного устройства (390x844)');
      break;
    }
    
    case 'device-emulate-tablet': {
      // Preset для планшета (iPad)
      await chrome.runtime.sendMessage({
        type: 'DEVICE_SET_VIEWPORT',
        width: 768,
        height: 1024,
        tabId: this.tabId
      });
      console.log('✅ Эмуляция планшета (768x1024)');
      break;
    }
    
    case 'device-emulate-desktop': {
      // Preset для десктопа
      await chrome.runtime.sendMessage({
        type: 'DEVICE_SET_VIEWPORT',
        width: 1920,
        height: 1080,
        tabId: this.tabId
      });
      console.log('✅ Эмуляция десктопа (1920x1080)');
      break;
    }
    
    default:
      console.log(`⚠️ Подтип ${subtype} требует реализации в background`);
  }
}

/**
 * Обработчик цепочек действий
 */
TestPlayer.prototype.handleChain = async function(action) {
  const subtype = action.subtype || 'chain-sequential';
  const steps = action.steps || action.actions || [];
  
  if (!steps.length) {
    throw new Error('Цепочка не содержит действий');
  }
  
  switch (subtype) {
    case 'chain-sequential': {
      // Последовательное выполнение
      console.log(`⛓️ Выполнение цепочки из ${steps.length} шагов`);
      for (let i = 0; i < steps.length; i++) {
        console.log(`  ↳ Шаг ${i + 1}/${steps.length}`);
        await this.executeAction(steps[i]);
      }
      console.log('✅ Цепочка выполнена');
      break;
    }
    
    case 'chain-parallel': {
      // Параллельное выполнение
      console.log(`⛓️ Параллельное выполнение ${steps.length} действий`);
      const promises = steps.map(step => this.executeAction(step));
      await Promise.all(promises);
      console.log('✅ Все действия выполнены параллельно');
      break;
    }
    
    case 'chain-conditional': {
      // Условное выполнение - выполняем пока не успешно
      console.log('⛓️ Условная цепочка');
      for (const step of steps) {
        try {
          await this.executeAction(step);
          console.log('✅ Условие выполнено, цепочка завершена');
          break;
        } catch (error) {
          console.log(`  ↳ Шаг провален, пробуем следующий: ${error.message}`);
        }
      }
      break;
    }
    
    case 'chain-retry': {
      // Повтор при ошибке
      const maxRetries = parseInt(action.maxRetries || action.retries || 3);
      const retryDelay = parseInt(action.retryDelay || action.delay || 1000);
      
      console.log(`⛓️ Цепочка с повтором (макс. ${maxRetries} попыток)`);
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          for (const step of steps) {
            await this.executeAction(step);
          }
          console.log(`✅ Успешно с попытки ${attempt}`);
          return;
        } catch (error) {
          console.log(`  ↳ Попытка ${attempt} провалена: ${error.message}`);
          if (attempt < maxRetries) {
            console.log(`  ↳ Ожидание ${retryDelay}ms перед повтором...`);
            await this.wait(retryDelay);
          } else {
            throw new Error(`Цепочка провалена после ${maxRetries} попыток`);
          }
        }
      }
      break;
    }
    
    case 'chain-batch': {
      // Пакетное выполнение с сохранением результатов
      console.log(`⛓️ Пакетное выполнение ${steps.length} действий`);
      const results = [];
      
      for (let i = 0; i < steps.length; i++) {
        try {
          const result = await this.executeAction(steps[i]);
          results.push({ success: true, result, index: i });
        } catch (error) {
          results.push({ success: false, error: error.message, index: i });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Пакет выполнен: ${successCount}/${steps.length} успешно`);
      
      // Сохраняем результаты в переменную если указана
      const resultVar = action.resultVariable || action.saveResults;
      if (resultVar) {
        this.userVariables[resultVar] = results;
      }
      break;
    }
    
    default:
      throw new Error(`Неподдерживаемый подтип chain: ${subtype}`);
  }
}

/**
 * Расширенный обработчик скриншотов
 */
})();
