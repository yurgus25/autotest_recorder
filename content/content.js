// Main content script - entry point

// Initialize i18n for content scripts
if (window.i18n) {
  window.i18n.init().catch(e => console.warn('[content] i18n init:', e));
}

console.log('🚀 AutoTest Recorder & Player loaded');

// Обработчики сообщений для быстрых действий с селекторами
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REGENERATE_SELECTOR') {
    try {
      const selector = message.selector;
      const element = document.querySelector(selector);
      
      if (!element) {
        sendResponse({ success: false, error: 'Элемент не найден на странице' });
        return true;
      }
      
      // Генерируем новый селектор
      if (window.selectorEngine) {
        const newSelectors = window.selectorEngine.generateAllSelectors(element);
        const bestSelector = window.selectorEngine.selectBestSelector(newSelectors);
        
        if (bestSelector) {
          sendResponse({ success: true, newSelector: bestSelector });
        } else {
          sendResponse({ success: false, error: 'Не удалось сгенерировать селектор' });
        }
      } else {
        sendResponse({ success: false, error: 'Selector Engine не загружен' });
      }
    } catch (error) {
      console.error('Ошибка при перегенерации селектора:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Асинхронный ответ
  }
  
  if (message.type === 'HIGHLIGHT_ELEMENT') {
    try {
      const selector = message.selector;
      const element = document.querySelector(selector);
      
      if (!element) {
        sendResponse({ success: false, error: 'Элемент не найден на странице' });
        return true;
      }
      
      // Подсвечиваем элемент
      const originalOutline = element.style.outline;
      const originalZIndex = element.style.zIndex;
      
      element.style.outline = '3px solid #4CAF50';
      element.style.outlineOffset = '2px';
      element.style.zIndex = '999999';
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Убираем подсветку через 3 секунды
      setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.zIndex = originalZIndex;
      }, 3000);
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Ошибка при подсветке элемента:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  // Получение значения элемента для переменных
  if (message.type === 'GET_ELEMENT_VALUE') {
    try {
      const selector = message.selector;
      const sourceType = message.sourceType;
      const element = document.querySelector(selector);
      
      if (!element) {
        sendResponse({ success: false, error: 'Элемент не найден', value: null });
        return true;
      }
      
      let value = '';
      
      if (sourceType === 'input') {
        // Для полей ввода берем value
        value = element.value || element.textContent || '';
      } else {
        // Для обычных элементов берем текстовое содержимое
        value = element.textContent?.trim() || element.innerText?.trim() || '';
      }
      
      sendResponse({ success: true, value: value });
    } catch (error) {
      console.error('Ошибка при получении значения элемента:', error);
      sendResponse({ success: false, error: error.message, value: null });
    }
    return true;
  }
  
  // Получение localStorage страницы
  if (message.type === 'GET_LOCAL_STORAGE') {
    try {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        items[key] = value;
      }
      sendResponse({ success: true, data: items });
    } catch (error) {
      console.error('Ошибка при получении localStorage:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  // Режим выбора элемента для извлечения переменной
  if (message.type === 'START_ELEMENT_SELECTION' && message.mode === 'grabber') {
    try {
      // Активируем режим выбора элемента (аналогично инспектору селекторов)
      if (window.selectorInspector) {
        window.selectorInspector.startSelection((element, selector, textSelectionInfo) => {
          // Отправляем информацию о выбранном элементе и выделенном тексте
          chrome.runtime.sendMessage({
            type: 'ELEMENT_SELECTED',
            element: {
              text: element.textContent?.trim() || '',
              value: element.value || '',
              attributes: Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ')
            },
            selector: selector,
            textSelection: textSelectionInfo // Информация о выделенном тексте
          });
        });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'SelectorInspector не загружен' });
      }
    } catch (error) {
      console.error('Ошибка при активации режима выбора элемента:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  if (message.type === 'STOP_ELEMENT_SELECTION') {
    try {
      if (window.selectorInspector) {
        window.selectorInspector.stopSelection();
      }
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  return false; // Не обработано
});

// Проверяем, что все модули загружены
if (window.selectorEngine) {
  console.log('✅ Selector Engine загружен');
} else {
  console.error('❌ Selector Engine не загружен');
}

// Проверяем, что SeleniumUtils загружен
if (window.SeleniumUtils) {
  console.log('✅ SeleniumUtils загружен (логика из автотеста)');
  console.log('   - Доступны методы: findDropdownPanels, findOptionByText, selectDropdownOption и др.');
  
  // Тестовая проверка работы утилиты
  try {
    const testUtils = new window.SeleniumUtils();
    console.log('   ✅ Тестовая инициализация SeleniumUtils успешна');
    console.log('   - Селекторы панелей:', testUtils.dropdownPanelSelectors);
    console.log('   - Селекторы опций:', testUtils.optionSelectors);
  } catch (e) {
    console.error('   ❌ Ошибка при тестовой инициализации:', e.message);
  }
} else {
  console.error('❌ SeleniumUtils не загружен! Проверьте manifest.json');
  console.error('   - Убедитесь, что content/selenium-utils.js добавлен в manifest.json');
  console.error('   - Порядок загрузки: selector-engine.js → selenium-utils.js → content.js → recorder.js → player.js');
}





