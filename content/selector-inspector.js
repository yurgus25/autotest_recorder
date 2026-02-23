// Инспектор селекторов - показывает селекторы при наведении мыши

class SelectorInspector {
  constructor() {
    this.isActive = false;
    this.inspectorWindow = null;
    this.currentElement = null;
    this.highlightOverlay = null;
    this.fixedElement = null; // Зафиксированный элемент
    this.fixedHighlight = null; // Подсветка зафиксированного элемента
    this.holdTimer = null; // Таймер удержания
    this.holdStartTime = null; // Время начала удержания
    this.fixTime = null; // Время фиксации элемента (для предотвращения немедленного снятия)
    this.holdStartX = null; // X координата начала удержания
    this.holdStartY = null; // Y координата начала удержания
    this.zIndexObserver = null; // Наблюдатель за изменениями z-index
    this.zIndexCheckInterval = null; // Интервал для проверки z-index
    this.activeTimeouts = []; // Массив для хранения всех setTimeout ID
    this.analyzeDebounceTimer = null; // Таймер для debounce analyzeElement
    this.isActivating = false; // Флаг для защиты от race conditions
    this.init();
  }

  init() {
    // Слушаем сообщения от popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.type === 'TOGGLE_SELECTOR_INSPECTOR') {
          console.log('📨 [SelectorInspector] Получено сообщение TOGGLE_SELECTOR_INSPECTOR');
          this.toggle();
          sendResponse({ success: true });
          return true;
        } else if (message.type === 'START_ELEMENT_SELECTION' && message.mode === 'grabber') {
          console.log('📨 [SelectorInspector] Получено сообщение START_ELEMENT_SELECTION');
          this.startSelection((element, selector) => {
            // Отправляем информацию о выбранном элементе
            chrome.runtime.sendMessage({
              type: 'ELEMENT_SELECTED',
              element: {
                text: element.textContent?.trim() || '',
                value: element.value || '',
                attributes: Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ')
              },
              selector: selector
            });
          });
          sendResponse({ success: true });
          return true;
        } else if (message.type === 'STOP_ELEMENT_SELECTION') {
          console.log('📨 [SelectorInspector] Получено сообщение STOP_ELEMENT_SELECTION');
          this.stopSelection();
          sendResponse({ success: true });
          return true;
        }
      } catch (error) {
        console.error('❌ [SelectorInspector] Ошибка при обработке сообщения:', error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
      return false;
    });
    
    console.log('✅ [SelectorInspector] Инициализирован и готов к работе');
  }
  
  /**
   * Начинает режим выбора элемента с callback
   */
  startSelection(callback) {
    this.selectionCallback = callback;
    this.isActive = true;
    this.attachMouseListeners();
    this.changeCursor();
    console.log('✅ Режим выбора элемента активирован');
  }
  
  /**
   * Останавливает режим выбора элемента
   */
  stopSelection() {
    this.selectionCallback = null;
    this.isActive = false;
    this.detachMouseListeners();
    this.restoreCursor();
    this.removeHighlight();
    console.log('❌ Режим выбора элемента деактивирован');
  }

  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  activate() {
    // Защита от race conditions
    if (this.isActive || this.isActivating) {
      return;
    }
    
    this.isActivating = true;
    
    try {
      // Простая логика - всегда пытаемся активировать, даже при ошибках
      this.isActive = true;
    
    // Создаем окно инспектора
    try {
      this.createInspectorWindow();
    } catch (createError) {
      console.warn('⚠️ [SelectorInspector] Ошибка при создании окна:', createError);
      // Не сбрасываем isActive - продолжаем попытки
    }
    
    // Прикрепляем обработчики событий
    try {
      this.attachMouseListeners();
      this.changeCursor();
    } catch (listenerError) {
      console.warn('⚠️ [SelectorInspector] Ошибка при прикреплении обработчиков:', listenerError);
    }
    
    // Отправляем сообщение в background для закрытия popup
    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: 'CLOSE_POPUP_IF_OPEN'
        }).catch(() => {
          // Игнорируем все ошибки
        });
      }
    } catch (err) {
      // Игнорируем все ошибки
    }
    
    // Убеждаемся, что инспектор всегда наверху
    this.safeSetTimeout(() => {
      try {
        if (this.inspectorWindow && this.inspectorWindow.parentNode) {
          if (this.inspectorWindow.parentNode !== document.documentElement) {
            this.inspectorWindow.parentNode.removeChild(this.inspectorWindow);
            if (document.documentElement) {
              document.documentElement.appendChild(this.inspectorWindow);
            } else if (document.body) {
              document.body.appendChild(this.inspectorWindow);
            }
          }
          this.inspectorWindow.style.setProperty('z-index', '2147483647', 'important');
          this.inspectorWindow.style.setProperty('position', 'fixed', 'important');
          this.inspectorWindow.style.setProperty('display', 'flex', 'important');
          this.inspectorWindow.style.setProperty('visibility', 'visible', 'important');
          this.inspectorWindow.style.setProperty('opacity', '1', 'important');
          this.inspectorWindow.style.setProperty('pointer-events', 'auto', 'important');
        }
      } catch (zIndexError) {
        // Игнорируем ошибки
      }
    }, 50);
    
    console.log('✅ [SelectorInspector] Инспектор активирован');
    } finally {
      this.isActivating = false;
    }
  }

  deactivate() {
    if (!this.isActive) return;
    
    // Останавливаем наблюдение за z-index
    if (this.zIndexObserver) {
      this.zIndexObserver.disconnect();
      this.zIndexObserver = null;
    }
    
    // Останавливаем периодическую проверку
    if (this.zIndexCheckInterval) {
      clearInterval(this.zIndexCheckInterval);
      this.zIndexCheckInterval = null;
    }
    
    // Очищаем все таймеры
    this.clearAllTimeouts();
    
    // Очищаем debounce таймер
    if (this.analyzeDebounceTimer) {
      clearTimeout(this.analyzeDebounceTimer);
      this.analyzeDebounceTimer = null;
    }
    
    this.isActive = false;
    this.isActivating = false;
    this.removeInspectorWindow();
    this.detachMouseListeners();
    this.restoreCursor();
    this.removeHighlight();
    this.unfixElement(); // Снимаем фиксацию при закрытии
    
    console.log('❌ Инспектор селекторов деактивирован');
  }
  
  /**
   * Очищает все активные таймеры
   */
  clearAllTimeouts() {
    this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.activeTimeouts = [];
  }
  
  /**
   * Безопасный setTimeout с автоматической очисткой
   */
  safeSetTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      callback();
      // Удаляем из массива после выполнения
      const index = this.activeTimeouts.indexOf(timeoutId);
      if (index > -1) {
        this.activeTimeouts.splice(index, 1);
      }
    }, delay);
    this.activeTimeouts.push(timeoutId);
    return timeoutId;
  }

  createInspectorWindow() {
    // Удаляем старое окно, если есть
    try {
      const existing = document.getElementById('selector-inspector-window');
      if (existing) {
        existing.remove();
      }
    } catch (e) {
      // Игнорируем ошибки при удалении
    }

    // Создаем окно инспектора
    const window = document.createElement('div');
    window.id = 'selector-inspector-window';
    window.innerHTML = `
      <div class="inspector-header" id="inspectorHeader">
        <span class="inspector-title">🔍 Инспектор селекторов</span>
        <div class="inspector-header-actions">
          <button class="inspector-back" id="inspectorBack" title="Вернуться к popup">←</button>
          <button class="inspector-close" id="inspectorClose">✕</button>
        </div>
      </div>
      <div class="inspector-content">
        <div class="inspector-info">
          <div class="inspector-hint">Наведите курсор на элемент для просмотра селекторов</div>
          <div class="inspector-element-info" id="elementInfo" style="display: none;">
            <div class="element-tag" id="elementTag"></div>
            <div class="element-text" id="elementText"></div>
          </div>
        </div>
        <div class="inspector-selectors" id="selectorsList">
          <div class="empty-state">Наведите курсор на элемент</div>
        </div>
      </div>
    `;

    // Добавляем стили перед добавлением в DOM, чтобы они точно применились
    this.injectStyles();
    
    // Принудительно устанавливаем все стили через inline стиль для гарантии
    window.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      top: 20px !important;
      right: 20px !important;
      width: 450px !important;
      max-height: 600px !important;
      background: white !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
      display: flex !important;
      flex-direction: column !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    `;
    
    // Добавляем в documentElement для максимального приоритета
    // Используем document.documentElement вместо body
    try {
      if (document.documentElement) {
        document.documentElement.appendChild(window);
      } else if (document.body) {
        document.body.appendChild(window);
      } else {
        // Если нет ни documentElement, ни body, ждем и пробуем снова
        setTimeout(() => {
          try {
            if (document.documentElement) {
              document.documentElement.appendChild(window);
            } else if (document.body) {
              document.body.appendChild(window);
            }
          } catch (e) {
            console.warn('⚠️ [SelectorInspector] Не удалось добавить окно в DOM:', e);
          }
        }, 100);
      }
    } catch (e) {
      console.warn('⚠️ [SelectorInspector] Ошибка при добавлении окна в DOM:', e);
      // Пробуем еще раз через небольшую задержку
      setTimeout(() => {
        try {
          if (document.documentElement) {
            document.documentElement.appendChild(window);
          } else if (document.body) {
            document.body.appendChild(window);
          }
        } catch (e2) {
          console.warn('⚠️ [SelectorInspector] Повторная попытка не удалась:', e2);
        }
      }, 200);
    }
    
    this.inspectorWindow = window;
    
    // Принудительно перемещаем в самый верхний слой несколько раз для гарантии
    const forceToTop = () => {
      if (window && window.parentNode) {
        // Удаляем из текущего родителя
        const parent = window.parentNode;
        parent.removeChild(window);
        // Добавляем в documentElement для максимального приоритета
        if (document.documentElement) {
          document.documentElement.appendChild(window);
        } else {
          document.body.appendChild(window);
        }
        // Еще раз устанавливаем все стили для гарантии
        window.style.setProperty('z-index', '2147483647', 'important');
        window.style.setProperty('position', 'fixed', 'important');
        window.style.setProperty('display', 'flex', 'important');
        window.style.setProperty('visibility', 'visible', 'important');
        window.style.setProperty('opacity', '1', 'important');
        window.style.setProperty('pointer-events', 'auto', 'important');
      }
    };
    
    // Выполняем принудительное перемещение несколько раз с разными задержками
    // Используем safeSetTimeout для автоматической очистки
    this.safeSetTimeout(forceToTop, 10);
    this.safeSetTimeout(forceToTop, 50);
    this.safeSetTimeout(forceToTop, 100);
    this.safeSetTimeout(forceToTop, 200);

    // Делаем окно перемещаемым
    const header = document.getElementById('inspectorHeader');
    if (header) {
      this.makeDraggable(window, header);
    }

    // Обработчик закрытия
    const closeButton = document.getElementById('inspectorClose');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deactivate();
      });
    }
    
    // Обработчик возврата к popup
    const backButton = document.getElementById('inspectorBack');
    if (backButton) {
      backButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Деактивируем инспектор
        this.deactivate();
        // Открываем popup через background script
        try {
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              type: 'OPEN_POPUP'
            }).catch(err => {
              // Игнорируем ошибки, связанные с перезагрузкой расширения
              if (err.message && !err.message.includes('Extension context invalidated')) {
                console.warn('⚠️ Не удалось открыть popup:', err);
              }
            });
          }
        } catch (err) {
          // Игнорируем ошибки, если контекст расширения недействителен
          if (err.message && !err.message.includes('Extension context invalidated')) {
            console.warn('⚠️ Ошибка при открытии popup:', err);
          }
        }
      });
    }
    
    // Создаем MutationObserver для отслеживания изменений z-index и принудительного восстановления
    if (this.zIndexObserver) {
      this.zIndexObserver.disconnect();
    }
    
    this.zIndexObserver = new MutationObserver((mutations) => {
      const computedStyle = getComputedStyle(window);
      const currentZIndex = window.style.zIndex || computedStyle.zIndex;
      const maxZIndex = 2147483647;
      
      // Если z-index изменился или стал меньше максимального, восстанавливаем
      const currentZIndexNum = parseInt(currentZIndex) || 0;
      if (currentZIndexNum < maxZIndex && window) {
        window.style.setProperty('z-index', maxZIndex.toString(), 'important');
        window.style.setProperty('position', 'fixed', 'important');
        // Перемещаем в конец documentElement, чтобы быть последним элементом
        if (window.parentNode) {
          window.parentNode.removeChild(window);
          if (document.documentElement) {
            document.documentElement.appendChild(window);
          } else {
            document.body.appendChild(window);
          }
        }
      }
    });
    
    // Наблюдаем за изменениями стилей и атрибутов
    this.zIndexObserver.observe(window, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: false,
      subtree: false
    });
    
    // Также периодически проверяем и восстанавливаем z-index
    if (this.zIndexCheckInterval) {
      clearInterval(this.zIndexCheckInterval);
    }
    
    // Оптимизированная проверка z-index - реже, но эффективнее
    this.zIndexCheckInterval = setInterval(() => {
      if (!this.isActive || !window || !window.parentNode || !document.documentElement) {
        return;
      }
      
      try {
        const computedStyle = getComputedStyle(window);
        const currentZIndex = parseInt(window.style.zIndex || computedStyle.zIndex || '0');
        
        // Проверяем только если z-index меньше максимального
        if (currentZIndex < 2147483647) {
          window.style.setProperty('z-index', '2147483647', 'important');
          window.style.setProperty('position', 'fixed', 'important');
        }
        
        // Перемещаем в конец documentElement только если нужно
        if (window.parentNode !== document.documentElement) {
          window.parentNode.removeChild(window);
          document.documentElement.appendChild(window);
        }
        
        // Проверяем видимость только если есть подозрения
        const rect = window.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          const computedDisplay = computedStyle.display;
          const computedVisibility = computedStyle.visibility;
          const computedOpacity = computedStyle.opacity;
          
          if (computedDisplay === 'none' || computedVisibility === 'hidden' || computedOpacity === '0') {
            window.style.setProperty('display', 'flex', 'important');
            window.style.setProperty('visibility', 'visible', 'important');
            window.style.setProperty('opacity', '1', 'important');
            window.style.setProperty('pointer-events', 'auto', 'important');
          }
        }
      } catch (error) {
        // Игнорируем ошибки проверки
        console.warn('⚠️ [SelectorInspector] Ошибка при проверке z-index:', error);
      }
    }, 200); // Увеличена задержка до 200мс для снижения нагрузки
  }

  makeDraggable(element, handle) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    // Сохраняем обработчики для последующей очистки
    const onMouseDown = (e) => {
      if (e.target.id === 'inspectorClose' || e.target.id === 'inspectorBack') return;
      
      isDragging = true;
      initialX = e.clientX - element.offsetLeft;
      initialY = e.clientY - element.offsetTop;
      handle.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      // Ограничиваем перемещение в пределах окна
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));
      
      element.style.left = currentX + 'px';
      element.style.top = currentY + 'px';
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        handle.style.cursor = 'grab';
      }
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // Сохраняем обработчики для очистки
    this.dragHandlers = {
      handle,
      onMouseDown,
      onMouseMove,
      onMouseUp
    };
  }
  
  /**
   * Очищает обработчики перетаскивания
   */
  cleanupDraggable() {
    if (this.dragHandlers) {
      const { handle, onMouseDown, onMouseMove, onMouseUp } = this.dragHandlers;
      if (handle) {
        handle.removeEventListener('mousedown', onMouseDown);
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.dragHandlers = null;
    }
  }

  changeCursor() {
    // Изменяем курсор на увеличительное стекло
    document.body.style.cursor = 'crosshair';
    document.body.setAttribute('data-inspector-active', 'true');
  }

  restoreCursor() {
    document.body.style.cursor = '';
    document.body.removeAttribute('data-inspector-active');
  }

  attachMouseListeners() {
    document.addEventListener('mousemove', this.handleMouseMove = (e) => {
      if (!this.isActive) return;
      
      // Оптимизированная проверка: если элемент зафиксирован или курсор на окне инспектора - выходим сразу
      if (this.fixedElement || (this.inspectorWindow && this.inspectorWindow.contains(e.target))) {
        return;
      }
      
      const element = document.elementFromPoint(e.clientX, e.clientY);
      
      // Проверяем, что это не окно инспектора и элемент изменился
      if (element && 
          element !== this.inspectorWindow && 
          !this.inspectorWindow?.contains(element) &&
          element !== this.currentElement &&
          !this.fixedElement) {
        
        this.currentElement = element;
        this.highlightElement(element);
        
        // Debounce для analyzeElement - вызываем не чаще чем раз в 100мс
        if (this.analyzeDebounceTimer) {
          clearTimeout(this.analyzeDebounceTimer);
        }
        this.analyzeDebounceTimer = setTimeout(() => {
          if (this.isActive && !this.fixedElement && element === this.currentElement) {
            this.analyzeElement(element);
          }
        }, 100);
      }
    });

    // Обработчик нажатия мыши для фиксации элемента
    document.addEventListener('mousedown', this.handleMouseDown = (e) => {
      if (!this.isActive) return;
      
      // Проверяем, что клик не на окне инспектора
      if (this.inspectorWindow && this.inspectorWindow.contains(e.target)) {
        return; // Клик на окне инспектора - не обрабатываем
      }
      
      // Если элемент уже зафиксирован, не обрабатываем mousedown (фиксация снимается только через click)
      if (this.fixedElement) {
        return;
      }
      
      // Получаем элемент под курсором
      const element = document.elementFromPoint(e.clientX, e.clientY);
      
      // Проверяем, что это не окно инспектора и не его дочерние элементы
      if (element && 
          element !== this.inspectorWindow && 
          !this.inspectorWindow?.contains(element) &&
          element !== document.body &&
          element !== document.documentElement) {
        
        // Начинаем таймер удержания
        this.startHoldTimer(element, e.clientX, e.clientY);
      }
    }, true); // Используем capture phase для раннего перехвата

    // Обработчик отпускания мыши
    document.addEventListener('mouseup', this.handleMouseUp = (e) => {
      if (!this.isActive) return;
      this.cancelHoldTimer();
    }, true);

    // Обработчик движения мыши во время удержания (для отмены, если мышь сдвинулась)
    document.addEventListener('mousemove', this.handleHoldMouseMove = (e) => {
      if (!this.isActive || !this.holdStartTime) return;
      
      // Если элемент уже зафиксирован, не обрабатываем движение
      if (this.fixedElement) return;
      
      // Если мышь сдвинулась более чем на 5px, отменяем таймер
      const deltaX = Math.abs(e.clientX - this.holdStartX);
      const deltaY = Math.abs(e.clientY - this.holdStartY);
      
      if (deltaX > 5 || deltaY > 5) {
        this.cancelHoldTimer();
      }
    });

    // Обработчик клика для предотвращения стандартного поведения
    document.addEventListener('click', this.handleClick = (e) => {
      if (!this.isActive) return;
      
      // Если клик на окне инспектора, не предотвращаем
      if (this.inspectorWindow && this.inspectorWindow.contains(e.target)) {
        return;
      }
      
      // Если режим grabber активен, обрабатываем клик для выбора элемента
      if (this.selectionCallback) {
        const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
        if (clickedElement && 
            clickedElement !== this.inspectorWindow && 
            !this.inspectorWindow?.contains(clickedElement) &&
            clickedElement !== document.body &&
            clickedElement !== document.documentElement) {
          
          // Генерируем селектор для элемента
          let selector = null;
          if (window.selectorEngine) {
            const selectors = window.selectorEngine.generateAllSelectors(clickedElement);
            const bestSelector = window.selectorEngine.selectBestSelector(selectors);
            selector = bestSelector?.selector || bestSelector?.value || null;
          }
          
          // Если не удалось сгенерировать селектор, используем простой CSS селектор
          if (!selector) {
            if (clickedElement.id) {
              selector = `#${clickedElement.id}`;
            } else if (clickedElement.className) {
              const classes = clickedElement.className.split(' ').filter(c => c).join('.');
              if (classes) {
                selector = `${clickedElement.tagName.toLowerCase()}.${classes}`;
              }
            } else {
              selector = clickedElement.tagName.toLowerCase();
            }
          }
          
          // Проверяем, есть ли выделенный текст
          const selection = window.getSelection();
          const selectedText = selection.toString().trim();
          let textSelectionInfo = null;
          
          if (selectedText && selectedText.length > 0) {
            // Получаем полный текст элемента
            const fullText = clickedElement.textContent || clickedElement.innerText || '';
            
            // Находим позицию выделенного текста в полном тексте элемента
            const startIndex = fullText.indexOf(selectedText);
            if (startIndex !== -1) {
              const endIndex = startIndex + selectedText.length;
              textSelectionInfo = {
                selectedText: selectedText,
                startIndex: startIndex,
                endIndex: endIndex,
                fullText: fullText
              };
            }
          }
          
          // Вызываем callback с информацией об элементе и выделенном тексте
          if (this.selectionCallback) {
            this.selectionCallback(clickedElement, selector, textSelectionInfo);
            this.stopSelection();
          }
          
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      
      // Если элемент зафиксирован, проверяем, что клик не на зафиксированном элементе
      if (this.fixedElement) {
        // Предотвращаем снятие фиксации в течение 500мс после фиксации (чтобы избежать конфликта с событием клика после удержания)
        const timeSinceFix = this.fixTime ? Date.now() - this.fixTime : Infinity;
        if (timeSinceFix < 500) {
          // Слишком рано после фиксации - игнорируем клик
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        
        const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
        // Снимаем фиксацию только если клик был вне зафиксированного элемента
        if (clickedElement !== this.fixedElement && !this.fixedElement.contains(clickedElement)) {
          this.unfixElement();
          e.preventDefault();
          e.stopPropagation();
        } else {
          // Клик на зафиксированном элементе - не снимаем фиксацию, но предотвращаем действие
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      
      // Предотвращаем клики по элементам страницы, если элемент не зафиксирован
      if (!this.inspectorWindow || !this.inspectorWindow.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  detachMouseListeners() {
    if (this.handleMouseMove) {
      document.removeEventListener('mousemove', this.handleMouseMove);
      this.handleMouseMove = null;
    }
    if (this.handleHoldMouseMove) {
      document.removeEventListener('mousemove', this.handleHoldMouseMove);
      this.handleHoldMouseMove = null;
    }
    if (this.handleMouseDown) {
      document.removeEventListener('mousedown', this.handleMouseDown, true);
      this.handleMouseDown = null;
    }
    if (this.handleMouseUp) {
      document.removeEventListener('mouseup', this.handleMouseUp, true);
      this.handleMouseUp = null;
    }
    if (this.handleClick) {
      document.removeEventListener('click', this.handleClick, true);
      this.handleClick = null;
    }
    this.cancelHoldTimer();
  }

  startHoldTimer(element, x, y) {
    this.cancelHoldTimer();
    this.holdStartTime = Date.now();
    this.holdStartX = x;
    this.holdStartY = y;
    
    console.log('⏱️ Начато удержание элемента, жду 2 секунды...');
    
    this.holdTimer = setTimeout(() => {
      // Прошло 2 секунды - фиксируем элемент
      console.log('✅ 2 секунды прошло, фиксирую элемент');
      this.fixElement(element);
    }, 2000);
  }

  cancelHoldTimer() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdStartTime = null;
    this.holdStartX = null;
    this.holdStartY = null;
  }

  fixElement(element) {
    this.fixedElement = element;
    this.fixTime = Date.now(); // Запоминаем время фиксации
    this.cancelHoldTimer(); // Отменяем таймер и сбрасываем holdStartTime
    
    // Убираем обычную подсветку
    this.removeHighlight();
    
    // ВРЕМЕННО ОТКЛЮЧАЕМ обработчик mousemove для предотвращения обновлений
    if (this.handleMouseMove) {
      document.removeEventListener('mousemove', this.handleMouseMove);
    }
    
    // Подсвечиваем зафиксированный элемент другим цветом
    this.highlightFixedElement(element);
    
    // Анализируем элемент и фиксируем селекторы
    this.analyzeElement(element);
    
    // Обновляем подсказку
    const hint = document.querySelector('.inspector-hint');
    if (hint) {
      hint.textContent = '✓ Элемент зафиксирован. Кликните вне окна для снятия фиксации.';
      hint.style.background = '#e8f5e9';
      hint.style.color = '#2e7d32';
    }
    
    console.log('✅ Элемент зафиксирован:', element);
  }

  unfixElement() {
    if (!this.fixedElement) return;
    
    this.fixedElement = null;
    this.fixTime = null; // Сбрасываем время фиксации
    this.removeFixedHighlight();
    this.cancelHoldTimer();
    
    // ВОССТАНАВЛИВАЕМ обработчик mousemove
    if (this.handleMouseMove && this.isActive) {
      document.addEventListener('mousemove', this.handleMouseMove);
    }
    
    // Восстанавливаем подсказку
    const hint = document.querySelector('.inspector-hint');
    if (hint) {
      hint.textContent = 'Наведите курсор на элемент для просмотра селекторов';
      hint.style.background = '#f5f5f5';
      hint.style.color = '#666';
    }
    
    console.log('❌ Фиксация элемента снята');
  }

  highlightFixedElement(element) {
    this.removeFixedHighlight();
    
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.id = 'inspector-fixed-highlight';
    overlay.style.cssText = `
      position: fixed;
      left: ${rect.left + window.scrollX}px;
      top: ${rect.top + window.scrollY}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid #4CAF50;
      background: rgba(76, 175, 80, 0.15);
      pointer-events: none;
      z-index: 2147483646 !important; /* Почти максимальный z-index для подсветки */
      box-sizing: border-box;
      animation: pulse 2s infinite;
    `;
    
    document.body.appendChild(overlay);
    this.fixedHighlight = overlay;
    
    // Добавляем анимацию пульсации
    if (!document.getElementById('inspector-pulse-animation')) {
      const style = document.createElement('style');
      style.id = 'inspector-pulse-animation';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  removeFixedHighlight() {
    if (this.fixedHighlight) {
      this.fixedHighlight.remove();
      this.fixedHighlight = null;
    }
  }

  highlightElement(element) {
    // Если элемент зафиксирован, не обновляем подсветку для других элементов
    // Зафиксированный элемент подсвечивается через highlightFixedElement
    if (this.fixedElement && element !== this.fixedElement) {
      return;
    }
    
    this.removeHighlight();
    
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.id = 'inspector-highlight';
    overlay.style.cssText = `
      position: fixed;
      left: ${rect.left + window.scrollX}px;
      top: ${rect.top + window.scrollY}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #2196F3;
      background: rgba(33, 150, 243, 0.1);
      pointer-events: none;
      z-index: 2147483646 !important; /* Почти максимальный z-index для подсветки */
      box-sizing: border-box;
    `;
    
    document.body.appendChild(overlay);
    this.highlightOverlay = overlay;
  }

  removeHighlight() {
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }
    this.removeFixedHighlight();
  }

  async analyzeElement(element) {
    if (!element || !this.inspectorWindow) return;

    // Если элемент зафиксирован, анализируем только зафиксированный элемент
    if (this.fixedElement && element !== this.fixedElement) {
      return; // Не обновляем информацию для других элементов, если есть зафиксированный
    }

    // Показываем информацию об элементе
    const elementInfo = document.getElementById('elementInfo');
    const elementTag = document.getElementById('elementTag');
    const elementText = document.getElementById('elementText');
    const selectorsList = document.getElementById('selectorsList');

    elementTag.textContent = element.tagName.toLowerCase();
    const text = this.getElementText(element);
    elementText.textContent = text ? `"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` : '(нет текста)';
    elementInfo.style.display = 'block';

    // Генерируем селекторы всеми доступными библиотеками
    const selectors = await this.generateAllSelectors(element);
    
    // Отображаем селекторы
    if (selectors.length === 0) {
      selectorsList.innerHTML = '<div class="empty-state">Селекторы не найдены</div>';
      return;
    }

    selectorsList.innerHTML = selectors.map(sel => `
      <div class="selector-item ${sel.isUnique ? 'unique' : ''} ${sel.isBest ? 'best' : ''}">
        <div class="selector-header">
          <span class="selector-library">${sel.library}</span>
          ${sel.isBest ? '<span class="badge-best">✓ Лучший</span>' : ''}
          ${sel.isUnique ? '<span class="badge-unique">✓ Уникальный</span>' : ''}
        </div>
        <div class="selector-value" title="${this.escapeHtml(sel.selector)}">${this.escapeHtml(sel.selector)}</div>
        <div class="selector-actions">
          <button class="btn-copy" data-selector="${this.escapeHtml(sel.selector)}">📋 Копировать</button>
          <button class="btn-test" data-selector="${this.escapeHtml(sel.selector)}">✓ Тест</button>
        </div>
        ${sel.actionType ? `<div class="selector-action-type">Действие: ${sel.actionType}</div>` : ''}
      </div>
    `).join('');

    // Привязываем обработчики кнопок
    selectorsList.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selector = e.target.getAttribute('data-selector');
        navigator.clipboard.writeText(selector).then(() => {
          btn.textContent = '✓ Скопировано';
          setTimeout(() => {
            btn.textContent = '📋 Копировать';
          }, 2000);
        });
      });
    });

    selectorsList.querySelectorAll('.btn-test').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const selector = e.target.getAttribute('data-selector');
        const found = await this.testSelector(selector);
        if (found) {
          btn.textContent = '✓ Найден';
          btn.style.background = '#4CAF50';
        } else {
          btn.textContent = '✕ Не найден';
          btn.style.background = '#f44336';
        }
        setTimeout(() => {
          btn.textContent = '✓ Тест';
          btn.style.background = '';
        }, 2000);
      });
    });
  }

  async generateAllSelectors(element) {
    const selectors = [];

    // Используем SelectorEngine (основной)
    if (window.selectorEngine) {
      try {
        const allSelectors = window.selectorEngine.generateAllSelectors(element);
        const bestSelector = window.selectorEngine.selectBestSelector(allSelectors);
        
        allSelectors.forEach(sel => {
          selectors.push({
            library: 'SelectorEngine',
            selector: sel.selector || sel.value,
            isUnique: sel.isUnique || false,
            isBest: sel.selector === bestSelector?.selector || sel.value === bestSelector?.value,
            actionType: this.determineActionType(element)
          });
        });
      } catch (e) {
        console.warn('Ошибка SelectorEngine:', e);
      }
    }

    // Finder Lite
    if (window.FinderLite && typeof window.FinderLite.getSelector === 'function') {
      try {
        const selector = window.FinderLite.getSelector(element, {
          root: document.body,
          maxDepth: 7,
          preferStableAttributes: true
        });
        if (selector) {
          const isUnique = document.querySelectorAll(selector).length === 1;
          selectors.push({
            library: 'Finder Lite',
            selector: selector,
            isUnique: isUnique,
            isBest: false,
            actionType: this.determineActionType(element)
          });
        }
      } catch (e) {
        console.warn('Ошибка FinderLite:', e);
      }
    }

    // Finder Full
    if (window.Finder && typeof window.Finder.getSelector === 'function') {
      try {
        const selector = window.Finder.getSelector(element, {
          root: document.body,
          maxDepth: 7,
          preferStableAttributes: true
        });
        if (selector) {
          const isUnique = document.querySelectorAll(selector).length === 1;
          selectors.push({
            library: 'Finder',
            selector: selector,
            isUnique: isUnique,
            isBest: false,
            actionType: this.determineActionType(element)
          });
        }
      } catch (e) {
        console.warn('Ошибка Finder:', e);
      }
    }

    // Unique Selector Lite
    if (window.UniqueSelectorLite && typeof window.UniqueSelectorLite.find === 'function') {
      try {
        const selector = window.UniqueSelectorLite.find(element, { root: document.body });
        if (selector) {
          selectors.push({
            library: 'Unique Selector Lite',
            selector: selector,
            isUnique: true,
            isBest: false,
            actionType: this.determineActionType(element)
          });
        }
      } catch (e) {
        console.warn('Ошибка UniqueSelectorLite:', e);
      }
    }

    // Unique Selector Full
    if (window.UniqueSelector && typeof window.UniqueSelector.find === 'function') {
      try {
        const selector = window.UniqueSelector.find(element, { root: document.body });
        if (selector) {
          selectors.push({
            library: 'Unique Selector',
            selector: selector,
            isUnique: true,
            isBest: false,
            actionType: this.determineActionType(element)
          });
        }
      } catch (e) {
        console.warn('Ошибка UniqueSelector:', e);
      }
    }

    // Optimal Select Lite
    if (window.OptimalSelectLite && typeof window.OptimalSelectLite.select === 'function') {
      try {
        const result = window.OptimalSelectLite.select(element, {
          includeTag: true,
          includeNthChild: true
        });
        if (result && result.selector) {
          const isUnique = document.querySelectorAll(result.selector).length === 1;
          selectors.push({
            library: 'Optimal Select Lite',
            selector: result.selector,
            isUnique: isUnique,
            isBest: false,
            actionType: this.determineActionType(element)
          });
        }
      } catch (e) {
        console.warn('Ошибка OptimalSelectLite:', e);
      }
    }

    // Optimal Select Full
    if (window.OptimalSelect && typeof window.OptimalSelect.select === 'function') {
      try {
        const result = window.OptimalSelect.select(element, {
          includeTag: true,
          includeNthChild: true
        });
        if (result && result.selector) {
          const isUnique = document.querySelectorAll(result.selector).length === 1;
          selectors.push({
            library: 'Optimal Select',
            selector: result.selector,
            isUnique: isUnique,
            isBest: false,
            actionType: this.determineActionType(element)
          });
        }
      } catch (e) {
        console.warn('Ошибка OptimalSelect:', e);
      }
    }

    // Сортируем: сначала лучшие и уникальные
    selectors.sort((a, b) => {
      if (a.isBest !== b.isBest) return a.isBest ? -1 : 1;
      if (a.isUnique !== b.isUnique) return a.isUnique ? -1 : 1;
      return 0;
    });

    return selectors;
  }

  determineActionType(element) {
    const tag = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();
    
    if (tag === 'button' || (tag === 'input' && type === 'submit') || element.getAttribute('role') === 'button') {
      return 'click';
    }
    if (tag === 'a' && element.href) {
      return 'click';
    }
    if (tag === 'input' && type === 'file') {
      return 'change (file)';
    }
    if (tag === 'input' || tag === 'textarea') {
      return 'input';
    }
    if (tag === 'select') {
      return 'change';
    }
    if (element.onclick || element.getAttribute('onclick')) {
      return 'click';
    }
    
    return 'click';
  }

  getElementText(element) {
    if (!element) return '';
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value || element.placeholder || '';
    }
    return element.textContent?.trim() || element.innerText?.trim() || '';
  }

  async testSelector(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length > 0;
    } catch (e) {
      return false;
    }
  }

  removeInspectorWindow() {
    // Очищаем обработчики перетаскивания перед удалением окна
    this.cleanupDraggable();
    
    if (this.inspectorWindow) {
      this.inspectorWindow.remove();
      this.inspectorWindow = null;
    }
  }

  escapeHtml(text) {
    // Используем глобальную функцию из shared/utils.js если доступна
    if (window.Utils && typeof window.Utils.escapeHtml === 'function') {
      return window.Utils.escapeHtml(text);
    }
    // Fallback для обратной совместимости
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  injectStyles() {
    if (document.getElementById('selector-inspector-styles')) return;

    const style = document.createElement('style');
    style.id = 'selector-inspector-styles';
    style.textContent = `
      #selector-inspector-window {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        width: 450px !important;
        max-height: 600px !important;
        background: white !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
        z-index: 2147483647 !important; /* Максимальный z-index для отображения поверх всех элементов */
        display: flex !important;
        flex-direction: column !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .inspector-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 8px 8px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: grab;
        user-select: none;
      }

      .inspector-header:active {
        cursor: grabbing;
      }

      .inspector-title {
        font-weight: 600;
        font-size: 15px;
      }
      
      .inspector-header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      .inspector-back {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.2s;
      }
      
      .inspector-back:hover {
        background: rgba(255,255,255,0.3);
      }

      .inspector-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.2s;
      }

      .inspector-close:hover {
        background: rgba(255,255,255,0.3);
      }

      .inspector-content {
        padding: 16px;
        overflow-y: auto;
        max-height: 550px;
      }

      .inspector-hint {
        color: #666;
        font-size: 13px;
        margin-bottom: 12px;
        padding: 8px;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .inspector-element-info {
        margin-bottom: 16px;
        padding: 12px;
        background: #f9f9f9;
        border-radius: 6px;
        border-left: 3px solid #2196F3;
      }

      .element-tag {
        font-weight: 600;
        color: #333;
        margin-bottom: 4px;
      }

      .element-text {
        color: #666;
        font-size: 13px;
        font-style: italic;
      }

      .inspector-selectors {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .selector-item {
        padding: 12px;
        background: #f9f9f9;
        border-radius: 6px;
        border: 1px solid #e0e0e0;
        transition: all 0.2s;
      }

      .selector-item:hover {
        background: #f0f0f0;
        border-color: #2196F3;
      }

      .selector-item.unique {
        border-left: 3px solid #4CAF50;
      }

      .selector-item.best {
        border-left: 3px solid #FF9800;
      }

      .selector-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .selector-library {
        font-weight: 600;
        color: #667eea;
        font-size: 12px;
      }

      .badge-best, .badge-unique {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
      }

      .badge-best {
        background: #FF9800;
        color: white;
      }

      .badge-unique {
        background: #4CAF50;
        color: white;
      }

      .selector-value {
        font-family: 'Courier New', monospace;
        font-size: 13px;
        color: #333;
        background: white;
        padding: 8px;
        border-radius: 4px;
        margin-bottom: 8px;
        word-break: break-all;
        border: 1px solid #ddd;
      }

      .selector-actions {
        display: flex;
        gap: 8px;
      }

      .btn-copy, .btn-test {
        flex: 1;
        padding: 6px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .btn-copy:hover {
        background: #2196F3;
        color: white;
        border-color: #2196F3;
      }

      .btn-test:hover {
        background: #4CAF50;
        color: white;
        border-color: #4CAF50;
      }

      .selector-action-type {
        margin-top: 8px;
        font-size: 12px;
        color: #666;
        font-style: italic;
      }

      .empty-state {
        text-align: center;
        color: #999;
        padding: 40px 20px;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }
}

// Инициализируем инспектор
try {
  const selectorInspector = new SelectorInspector();
  window.SelectorInspector = SelectorInspector;
  window.selectorInspector = selectorInspector;
  console.log('✅ [SelectorInspector] Экземпляр создан и доступен через window.selectorInspector');
} catch (error) {
  console.error('❌ [SelectorInspector] Критическая ошибка при инициализации:', error);
  // Создаем заглушку, чтобы избежать ошибок при обращении
  window.selectorInspector = {
    toggle: () => console.error('❌ [SelectorInspector] Инспектор не инициализирован'),
    activate: () => console.error('❌ [SelectorInspector] Инспектор не инициализирован'),
    deactivate: () => console.error('❌ [SelectorInspector] Инспектор не инициализирован')
  };
}

