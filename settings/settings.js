// Settings Manager for AutoTest Recorder Enhanced

class SettingsManager {
  constructor() {
    this.defaultSettings = {
      selectorEngine: {
        finder: {
          enabled: true,
          version: 'lite'
        },
        optimalSelect: {
          enabled: true,
          version: 'lite'
        },
        uniqueSelector: {
          enabled: true,
          version: 'lite'
        },
        attributePriorities: [
          'data-testid',
          'data-cy',
          'data-test',
          'id',
          'name',
          'aria-label',
          'role',
          'class',
          'tag'
        ],
        // === НОВЫЕ НАСТРОЙКИ ОПТИМИЗАЦИИ (Фаза 1-3) ===
        optimization: {
          // Фаза 1: Критические улучшения
          deduplicateSelectors: true,        // Дедупликация селекторов
          enableSelectorCache: true,         // Кэширование селекторов
          selectorCacheTTL: 30000,           // TTL кэша (мс)
          asyncUniquenessCheck: true,        // Асинхронная проверка уникальности
          
          // Фаза 2: Значительные улучшения
          smartSelectorScoring: true,        // Улучшенная стратегия выбора селектора
          penalizeDynamicParts: true,        // Штраф за динамические части (UUID, timestamp)
          improvedDropdownDetection: true,   // Улучшенное обнаружение dropdown
          exponentialBackoffRetry: true,     // Экспоненциальный backoff при поиске
          useMutationObserver: true,         // Использовать MutationObserver для ожидания
          
          // Фаза 3: Дополнительные улучшения
          generateXPath: false,              // Генерировать XPath селекторы (выкл по умолчанию)
          improvedOverlaySearch: true,       // Улучшенный поиск overlay-элементов
          validateBeforeSave: true,          // Валидация селекторов перед сохранением
          eventDebounce: true,               // Debounce/throttle событий
          eventDebounceDelay: 100,           // Задержка debounce (мс)
          clickThrottleMs: 200,              // Throttle кликов (мс)
          
          // Метрики и автоисправление
          calculateMetrics: false,           // Расчёт метрик качества (выкл по умолчанию)
          autoFixUnstable: false,            // Автоисправление нестабильных селекторов
          minStabilityScore: 70              // Минимальный порог стабильности для автоисправления
        }
      },
      performance: {
        cacheSelectors: true,
        maxSelectorLength: 200,
        selectorTimeout: 5000
      },
      advanced: {
        verboseLogging: false,
        excludeHiddenElements: true,
        smartWaits: true
      },
      autotests: {
        enabled: true
      },
      analytics: {
        enabled: false
      },
      videoRecording: {
        enabled: false,
        makeSeekable: false
      },
      files: {
        uploaded: [] // Массив загруженных файлов: {id, name, size, type, data (base64), uploadedAt}
      },
      excelExport: {
        enabled: true,
        autoExportEnabled: false,
        exportOnRecord: true,
        exportOnPlay: true,
        exportOnOptimize: true,
        format: 'xls',
        delimiter: ';',
        exportPath: '', // Путь для сохранения (опционально)
        recordConsoleErrors: false // Записывать ошибки консоли в Excel
      },
      mediaSavePath: 'AutoTestRecorder', // Общая базовая папка для видео и скриншотов (относительно Загрузки)
      screenshots: {
        saveToDisk: false,
        onlyOnError: false,
        storeInMemory: true
      },
      // === Настройки режима записи ===
      recordingMode: 'auto', // auto | picker | inspector
      selectorStrategy: 'stability', // stability | readability | shortest
      pickerSettings: {
        timeout: 5,               // Таймаут автовыбора (сек)
        showScores: true,         // Показывать оценки стабильности
        highlightBest: true,      // Выделять лучший вариант
        maxVisible: 4             // Максимум видимых вариантов
      },
      playback: {
        stepTimeoutSeconds: 5     // Таймаут выполнения шага (5, 10 или 15 сек); при превышении — диалог «Продолжить» / «Остановить»
      }
    };

    this.currentSettings = null;
    this.init();
  }

  async init() {
    // Initialize i18n
    if (window.i18n) {
      try { await window.i18n.init(); window.i18n.applyToDOM(); } catch(e) {}
    }
    await this.loadSettings();
    this.setupEventListeners();
    this.populateForm();
    this.setupDragAndDrop();
    this.scrollToAnchor();
  }

  scrollToAnchor() {
    // Проверяем, есть ли якорь в URL
    const hash = window.location.hash;
    if (hash) {
      // Небольшая задержка для полной загрузки страницы
      setTimeout(() => {
        const element = document.querySelector(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Добавляем визуальное выделение
          element.style.transition = 'box-shadow 0.3s';
          element.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.3)';
          setTimeout(() => {
            element.style.boxShadow = '';
          }, 2000);
        }
      }, 100);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('pluginSettings');
      if (result.pluginSettings) {
        this.currentSettings = result.pluginSettings;
        // Если в старых настройках нет приоритетов атрибутов — подставляем дефолт (чтобы список не был пустым)
        if (!Array.isArray(this.currentSettings.selectorEngine?.attributePriorities)) {
          if (!this.currentSettings.selectorEngine) this.currentSettings.selectorEngine = {};
          this.currentSettings.selectorEngine.attributePriorities = this.defaultSettings.selectorEngine.attributePriorities.slice();
        }
      } else {
        // Настройки ещё не сохранялись — записываем дефолты в storage
        this.currentSettings = JSON.parse(JSON.stringify(this.defaultSettings));
        await chrome.storage.local.set({ pluginSettings: this.currentSettings });
        console.log('✅ [Settings] Дефолтные настройки записаны в storage');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.currentSettings = this.defaultSettings;
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ pluginSettings: this.currentSettings });
      
      // Notify all tabs about settings change
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsUpdated',
          settings: this.currentSettings
        }).catch(() => {}); // Ignore errors for tabs without content script
      });

      this.showNotification(window.i18n ? window.i18n.t('settings.savedToast') : 'Settings saved!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showNotification('Error saving settings', 'error');
    }
  }

  populateForm() {
    const s = this.currentSettings;

    // Selector Engine
    document.getElementById('useFinder').checked = s.selectorEngine.finder.enabled;
    document.querySelector(`input[name="finderVersion"][value="${s.selectorEngine.finder.version}"]`).checked = true;
    
    document.getElementById('useOptimalSelect').checked = s.selectorEngine.optimalSelect.enabled;
    document.querySelector(`input[name="optimalSelectVersion"][value="${s.selectorEngine.optimalSelect.version}"]`).checked = true;
    
    document.getElementById('useUniqueSelector').checked = s.selectorEngine.uniqueSelector.enabled;
    document.querySelector(`input[name="uniqueSelectorVersion"][value="${s.selectorEngine.uniqueSelector.version}"]`).checked = true;

    // Attribute priorities (если в сохранённых настройках нет массива — берём из дефолта)
    const prioritiesContainer = document.getElementById('attributePriorities');
    if (prioritiesContainer) {
      const list = Array.isArray(s.selectorEngine?.attributePriorities)
        ? s.selectorEngine.attributePriorities
        : (this.defaultSettings.selectorEngine.attributePriorities || []);
      prioritiesContainer.innerHTML = '';
      list.forEach(attr => {
        const item = this.createPriorityItem(attr);
        prioritiesContainer.appendChild(item);
      });
    }

    // Performance
    document.getElementById('cacheSelectors').checked = s.performance.cacheSelectors;
    document.getElementById('maxSelectorLength').value = s.performance.maxSelectorLength;
    document.getElementById('selectorTimeout').value = s.performance.selectorTimeout;

    // Optimization Settings (NEW)
    const opt = s.selectorEngine.optimization || this.defaultSettings.selectorEngine.optimization;
    
    // Фаза 1
    this.setCheckboxSafe('optDeduplicateSelectors', opt.deduplicateSelectors);
    this.setCheckboxSafe('optEnableSelectorCache', opt.enableSelectorCache);
    this.setInputSafe('optSelectorCacheTTL', opt.selectorCacheTTL);
    this.setCheckboxSafe('optAsyncUniquenessCheck', opt.asyncUniquenessCheck);
    
    // Фаза 2
    this.setCheckboxSafe('optSmartSelectorScoring', opt.smartSelectorScoring);
    this.setCheckboxSafe('optPenalizeDynamicParts', opt.penalizeDynamicParts);
    this.setCheckboxSafe('optImprovedDropdownDetection', opt.improvedDropdownDetection);
    this.setCheckboxSafe('optExponentialBackoffRetry', opt.exponentialBackoffRetry);
    this.setCheckboxSafe('optUseMutationObserver', opt.useMutationObserver);
    
    // Фаза 3
    this.setCheckboxSafe('optGenerateXPath', opt.generateXPath);
    this.setCheckboxSafe('optImprovedOverlaySearch', opt.improvedOverlaySearch);
    this.setCheckboxSafe('optValidateBeforeSave', opt.validateBeforeSave);
    this.setCheckboxSafe('optEventDebounce', opt.eventDebounce);
    this.setInputSafe('optEventDebounceDelay', opt.eventDebounceDelay);
    this.setInputSafe('optClickThrottleMs', opt.clickThrottleMs);
    
    // Метрики
    this.setCheckboxSafe('optCalculateMetrics', opt.calculateMetrics);
    this.setCheckboxSafe('optAutoFixUnstable', opt.autoFixUnstable);
    this.setInputSafe('optMinStabilityScore', opt.minStabilityScore);

    // Advanced
    document.getElementById('verboseLogging').checked = s.advanced.verboseLogging;
    document.getElementById('excludeHiddenElements').checked = s.advanced.excludeHiddenElements;
    document.getElementById('smartWaits').checked = s.advanced.smartWaits;
    
    // Recording Mode Settings (NEW)
    const recordingMode = s.recordingMode || 'auto';
    const modeRadio = document.querySelector(`input[name="recordingMode"][value="${recordingMode}"]`);
    if (modeRadio) modeRadio.checked = true;
    
    const selectorStrategy = s.selectorStrategy || 'stability';
    const strategyRadio = document.querySelector(`input[name="selectorStrategy"][value="${selectorStrategy}"]`);
    if (strategyRadio) strategyRadio.checked = true;
    
    const pickerSettings = s.pickerSettings || this.defaultSettings.pickerSettings;
    this.setInputSafe('pickerTimeout', pickerSettings.timeout);
    this.setCheckboxSafe('showSelectorScores', pickerSettings.showScores);
    this.setCheckboxSafe('highlightBestSelector', pickerSettings.highlightBest);

    const playback = s.playback || this.defaultSettings.playback || {};
    const stepTimeout = [5, 10, 15].includes(playback.stepTimeoutSeconds) ? playback.stepTimeoutSeconds : 5;
    const playbackEl = document.getElementById('playbackStepTimeout');
    if (playbackEl) playbackEl.value = String(stepTimeout);
    
    // Показываем/скрываем настройки пикера
    this.togglePickerSettings(recordingMode === 'picker');

    // Autotests
    document.getElementById('autotestsEnabled').checked = s.autotests?.enabled !== false;

    // Analytics
    this.setCheckboxSafe('analyticsEnabled', s.analytics?.enabled === true);
    this.setCheckboxSafe('videoRecordingEnabled', s.videoRecording?.enabled === true);
    this.setCheckboxSafe('videoRecordingMakeSeekable', s.videoRecording?.makeSeekable === true);
    const analyticsLink = document.getElementById('openAnalyticsDashboard');
    if (analyticsLink) {
      analyticsLink.href = chrome.runtime.getURL('analytics/analytics-dashboard.html');
    }

    // Excel Export
    const excelExport = s.excelExport || this.defaultSettings.excelExport;
    document.getElementById('excelExportEnabled').checked = excelExport.enabled !== false;
    document.getElementById('excelAutoExportEnabled').checked = excelExport.autoExportEnabled === true;
    document.getElementById('excelExportOnRecord').checked = excelExport.exportOnRecord !== false;
    document.getElementById('excelExportOnPlay').checked = excelExport.exportOnPlay !== false;
    document.getElementById('excelExportOnOptimize').checked = excelExport.exportOnOptimize !== false;
    this.setCheckboxSafe('excelRecordConsoleErrors', excelExport.recordConsoleErrors === true);
    document.getElementById('excelExportFormat').value = excelExport.format || 'xls';
    document.getElementById('excelExportDelimiter').value = excelExport.delimiter || ';';
    document.getElementById('excelExportPath').value = excelExport.exportPath || '';

    // Видео и скриншоты: общий путь сохранения
    const basePath = (s.mediaSavePath || (s.screenshots?.savePath || '').replace(/\/screenshots\/?$/i, '') || 'AutoTestRecorder').trim();
    this.setInputSafe('mediaSavePath', basePath || 'AutoTestRecorder');
    const screenshots = s.screenshots || this.defaultSettings.screenshots;
    const saveToDiskEnabled = screenshots.saveToDisk === true || screenshots.mode === 'download';
    this.setCheckboxSafe('screenshotsSaveEnabled', saveToDiskEnabled);
    this.setCheckboxSafe('screenshotsOnlyOnError', screenshots.onlyOnError === true);
    this.setCheckboxSafe('screenshotsStoreInMemory', screenshots.storeInMemory !== false);

    // Update radio group visibility
    this.updateRadioGroupVisibility();
    this.updateExcelExportControls();
    this.updateScreenshotControls();
    this.updateVideoRecordingDependentOptions();

    // Files
    this.loadAndDisplayFiles();
  }

  createPriorityItem(attr) {
    const item = document.createElement('div');
    item.className = 'sortable-item';
    item.setAttribute('data-attr', attr);
    item.setAttribute('draggable', 'true');

    const priority = this.getAttrPriority(attr);
    
    item.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <span class="attr-name">${attr}</span>
      <span class="badge badge-${priority}">${this.getPriorityLabel(priority)}</span>
    `;

    return item;
  }

  getAttrPriority(attr) {
    const list = this.currentSettings?.selectorEngine?.attributePriorities;
    const index = Array.isArray(list) ? list.indexOf(attr) : -1;
    if (index < 3) return 'high';
    if (index < 6) return 'medium';
    return 'low';
  }

  getPriorityLabel(priority) {
    const labels = {
      'high': (window.i18n ? window.i18n.t('common.high') : 'High'),
      'medium': (window.i18n ? window.i18n.t('common.medium') : 'Medium'),
      'low': (window.i18n ? window.i18n.t('common.low') : 'Low')
    };
    return labels[priority] || (window.i18n ? window.i18n.t('common.low') : 'Low');
  }

  // Безопасная установка значения checkbox
  setCheckboxSafe(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.checked = value !== false && value !== undefined;
    }
  }

  // Безопасная установка значения input
  setInputSafe(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.value = value !== undefined ? value : '';
    }
  }

  // Безопасное получение значения checkbox
  getCheckboxSafe(id, defaultValue = false) {
    const el = document.getElementById(id);
    return el ? el.checked : defaultValue;
  }

  // Безопасное получение значения input
  getInputSafe(id, defaultValue = '') {
    const el = document.getElementById(id);
    return el ? el.value : defaultValue;
  }

  // Безопасное получение числового значения
  getNumberSafe(id, defaultValue = 0) {
    const el = document.getElementById(id);
    return el ? parseInt(el.value) || defaultValue : defaultValue;
  }

  setupEventListeners() {
    // Back button
    document.getElementById('backButton').addEventListener('click', () => {
      window.close();
    });

    // Save button
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.collectFormData();
      this.saveSettings();
    });

    // Reset button
    document.getElementById('resetSettings').addEventListener('click', () => {
      if (confirm(window.i18n ? window.i18n.t('settings.resetConfirm') : 'Reset all settings to defaults?')) {
        this.currentSettings = JSON.parse(JSON.stringify(this.defaultSettings));
        this.populateForm();
        this.showNotification(window.i18n ? window.i18n.t('settings.savedToast') : 'Settings reset', 'success');
      }
    });

    // Export button
    document.getElementById('exportSettings').addEventListener('click', () => {
      this.exportSettings();
    });

    // Import button
    document.getElementById('importSettings').addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });

    // Видимая проверка формата Authorization key при вводе и при потере фокуса
    // Update radio group visibility when checkboxes change
    document.getElementById('useFinder').addEventListener('change', () => {
      this.updateRadioGroupVisibility();
    });
    document.getElementById('useOptimalSelect').addEventListener('change', () => {
      this.updateRadioGroupVisibility();
    });
    document.getElementById('useUniqueSelector').addEventListener('change', () => {
      this.updateRadioGroupVisibility();
    });

    const excelExportEnabledCheckbox = document.getElementById('excelExportEnabled');
    const excelAutoExportCheckbox = document.getElementById('excelAutoExportEnabled');
    if (excelExportEnabledCheckbox && excelAutoExportCheckbox) {
      excelExportEnabledCheckbox.addEventListener('change', () => this.updateExcelExportControls());
      excelAutoExportCheckbox.addEventListener('change', () => this.updateExcelExportControls());
    }

    const screenshotsSaveCheckbox = document.getElementById('screenshotsSaveEnabled');
    const screenshotsOnlyOnErrorCheckbox = document.getElementById('screenshotsOnlyOnError');
    if (screenshotsSaveCheckbox) {
      screenshotsSaveCheckbox.addEventListener('change', () => this.updateScreenshotControls());
    }
    if (screenshotsOnlyOnErrorCheckbox) {
      screenshotsOnlyOnErrorCheckbox.addEventListener('change', () => this.updateScreenshotControls());
    }

    const videoRecordingEnabledCheckbox = document.getElementById('videoRecordingEnabled');
    if (videoRecordingEnabledCheckbox) {
      videoRecordingEnabledCheckbox.addEventListener('change', () => this.updateVideoRecordingDependentOptions());
    }

    // File upload
    const fileUploadInput = document.getElementById('fileUploadInput');
    const fileUploadLabel = document.querySelector('label[for="fileUploadInput"]');
    if (fileUploadInput && fileUploadLabel) {
      fileUploadLabel.addEventListener('click', (e) => {
        e.preventDefault();
        fileUploadInput.click();
      });
      
      fileUploadInput.addEventListener('change', (e) => {
        this.handleFileUpload(e.target.files);
      });
    }
    
    // Recording Mode change handler
    document.querySelectorAll('input[name="recordingMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.togglePickerSettings(e.target.value === 'picker');
      });
    });

    // Load and display files
    this.loadAndDisplayFiles();
  }
  
  /**
   * Показывает/скрывает настройки пикера
   */
  togglePickerSettings(show) {
    const pickerSettingsEl = document.getElementById('pickerSettings');
    if (pickerSettingsEl) {
      pickerSettingsEl.style.display = show ? 'block' : 'none';
    }
  }

  async loadAndDisplayFiles() {
    const filesList = document.getElementById('uploadedFilesList');
    if (!filesList) return;

    const files = this.currentSettings.files?.uploaded || [];
    
    if (files.length === 0) {
      filesList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #999;">' + (window.i18n ? window.i18n.t('settings.noUploadedFiles') : 'No uploaded files') + '</div>';
      return;
    }

    filesList.innerHTML = files.map(file => `
      <div class="file-item" data-file-id="${file.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9f9f9; border-radius: 6px; margin-bottom: 8px; border: 1px solid #e0e0e0;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${this.escapeHtml(file.name)}</div>
          <div style="font-size: 12px; color: #666;">
            ${this.formatFileSize(file.size)} • ${file.type || 'unknown'} • 
            ${new Date(file.uploadedAt).toLocaleString('ru-RU')}
          </div>
        </div>
        <button class="btn-delete-file" data-file-id="${file.id}" style="background: #f44336; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          🗑️ ' + (window.i18n ? window.i18n.t('common.delete') : 'Delete') + '
        </button>
      </div>
    `).join('');

    // Add delete handlers
    filesList.querySelectorAll('.btn-delete-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fileId = e.target.getAttribute('data-file-id');
        this.deleteFile(fileId);
      });
    });
  }

  async handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const uploadedFiles = this.currentSettings.files?.uploaded || [];

    for (const file of Array.from(files)) {
      if (file.size > maxFileSize) {
        this.showNotification(`Файл "${file.name}" too big (max 5MB)`, 'error');
        continue;
      }

      // Check total storage size (approximate)
      const totalSize = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      if (totalSize + file.size > 10 * 1024 * 1024) {
        this.showNotification('Storage limit exceeded (10MB). Delete old files.', 'error');
        continue;
      }

      try {
        const fileData = await this.fileToBase64(file);
        const fileObj = {
          id: Date.now() + Math.random(),
          name: file.name,
          size: file.size,
          type: file.type,
          data: fileData,
          uploadedAt: new Date().toISOString()
        };

        uploadedFiles.push(fileObj);
        this.showNotification(`Файл "${file.name}" загружен`, 'success');
      } catch (error) {
        console.error('Error uploading file:', error);
        this.showNotification(`Ошибка при загрузке файла "${file.name}"`, 'error');
      }
    }

    if (!this.currentSettings.files) {
      this.currentSettings.files = { uploaded: [] };
    }
    this.currentSettings.files.uploaded = uploadedFiles;
    
    await this.saveSettings();
    this.loadAndDisplayFiles();
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Сохраняем только base64 данные (без префикса data:...)
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async deleteFile(fileId) {
    if (!confirm('Delete this file?')) return;

    const uploadedFiles = this.currentSettings.files?.uploaded || [];
    this.currentSettings.files.uploaded = uploadedFiles.filter(f => f.id !== fileId);
    
    await this.saveSettings();
    this.loadAndDisplayFiles();
    this.showNotification('File deleted', 'success');
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

  updateRadioGroupVisibility() {
    const finderEnabled = document.getElementById('useFinder').checked;
    const optimalEnabled = document.getElementById('useOptimalSelect').checked;
    const uniqueEnabled = document.getElementById('useUniqueSelector').checked;

    document.getElementById('finderVersion').style.display = finderEnabled ? 'flex' : 'none';
    document.getElementById('optimalSelectVersion').style.display = optimalEnabled ? 'flex' : 'none';
    document.getElementById('uniqueSelectorVersion').style.display = uniqueEnabled ? 'flex' : 'none';
  }

  updateExcelExportControls() {
    const enabledCheckbox = document.getElementById('excelExportEnabled');
    const autoCheckbox = document.getElementById('excelAutoExportEnabled');
    const pathInput = document.getElementById('excelExportPath');
    const triggerIds = ['excelExportOnRecord', 'excelExportOnPlay', 'excelExportOnOptimize'];

    if (!enabledCheckbox || !autoCheckbox) return;

    const isFeatureEnabled = enabledCheckbox.checked;
    const isAutoEnabled = isFeatureEnabled && autoCheckbox.checked;

    autoCheckbox.disabled = !isFeatureEnabled;
    const autoLabel = autoCheckbox.closest('.checkbox-label');
    if (autoLabel) {
      autoLabel.classList.toggle('disabled', !isFeatureEnabled);
    }

    triggerIds.forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.disabled = !isAutoEnabled;
      const label = input.closest('.checkbox-label-small');
      if (label) {
        label.classList.toggle('disabled', !isAutoEnabled);
      }
    });

    if (pathInput) {
      pathInput.disabled = !isFeatureEnabled;
    }

    const formatSelect = document.getElementById('excelExportFormat');
    const delimiterInput = document.getElementById('excelExportDelimiter');
    if (formatSelect) {
      formatSelect.disabled = !isFeatureEnabled;
    }
    if (delimiterInput) {
      delimiterInput.disabled = !isFeatureEnabled;
    }
  }

  updateVideoRecordingDependentOptions() {
    const enabledCheckbox = document.getElementById('videoRecordingEnabled');
    const makeSeekableCheckbox = document.getElementById('videoRecordingMakeSeekable');
    const wrap = document.getElementById('videoRecordingMakeSeekableWrap');
    const hint = document.getElementById('videoRecordingSeekableHint');
    if (!enabledCheckbox || !makeSeekableCheckbox || !wrap) return;

    const enabled = enabledCheckbox.checked;
    makeSeekableCheckbox.disabled = !enabled;
    wrap.classList.toggle('disabled', !enabled);
    if (hint) hint.classList.toggle('disabled', !enabled);
  }

  updateScreenshotControls() {
    const enabledCheckbox = document.getElementById('screenshotsSaveEnabled');
    const pathInput = document.getElementById('mediaSavePath');
    const onlyOnErrorCheckbox = document.getElementById('screenshotsOnlyOnError');
    const onlyOnErrorHint = document.getElementById('screenshotsOnlyOnErrorHint');
    if (!enabledCheckbox || !onlyOnErrorCheckbox) return;

    const enabled = enabledCheckbox.checked;
    if (pathInput) pathInput.disabled = false; // путь общий для видео и скриншотов, всегда доступен
    onlyOnErrorCheckbox.disabled = !enabled;
    const pathItem = pathInput ? pathInput.closest('.setting-item') : null;
    if (pathItem) pathItem.classList.remove('disabled');
    const onlyOnErrorLabel = onlyOnErrorCheckbox.closest('.checkbox-label');
    if (onlyOnErrorLabel) {
      onlyOnErrorLabel.classList.toggle('disabled', !enabled);
    }
    if (onlyOnErrorHint) {
      onlyOnErrorHint.style.opacity = enabled ? '0.7' : '0.4';
    }
  }

  setupDragAndDrop() {
    const container = document.getElementById('attributePriorities');
    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('sortable-item')) {
        draggedItem = e.target;
        e.target.classList.add('dragging');
      }
    });

    container.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('sortable-item')) {
        e.target.classList.remove('dragging');
        this.updatePrioritiesFromDOM();
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(draggedItem);
      } else {
        container.insertBefore(draggedItem, afterElement);
      }
    });
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.sortable-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  updatePrioritiesFromDOM() {
    const items = document.querySelectorAll('#attributePriorities .sortable-item');
    const newPriorities = Array.from(items).map(item => item.getAttribute('data-attr'));
    this.currentSettings.selectorEngine.attributePriorities = newPriorities;

    // Update badges
    items.forEach((item, index) => {
      const badge = item.querySelector('.badge');
      let priority, label;
      
      if (index < 3) {
        priority = 'high';
        label = (window.i18n ? window.i18n.t('common.high') : 'High');
      } else if (index < 6) {
        priority = 'medium';
        label = 'Средний';
      } else {
        priority = 'low';
        label = 'Низкий';
      }

      badge.className = `badge badge-${priority}`;
      badge.textContent = label;
    });
  }

  collectFormData() {
    const s = this.currentSettings;

    // Selector Engine
    s.selectorEngine.finder.enabled = document.getElementById('useFinder').checked;
    s.selectorEngine.finder.version = document.querySelector('input[name="finderVersion"]:checked').value;
    
    s.selectorEngine.optimalSelect.enabled = document.getElementById('useOptimalSelect').checked;
    s.selectorEngine.optimalSelect.version = document.querySelector('input[name="optimalSelectVersion"]:checked').value;
    
    s.selectorEngine.uniqueSelector.enabled = document.getElementById('useUniqueSelector').checked;
    s.selectorEngine.uniqueSelector.version = document.querySelector('input[name="uniqueSelectorVersion"]:checked').value;

    // Performance
    s.performance.cacheSelectors = document.getElementById('cacheSelectors').checked;
    s.performance.maxSelectorLength = parseInt(document.getElementById('maxSelectorLength').value);
    s.performance.selectorTimeout = parseInt(document.getElementById('selectorTimeout').value);

    // Optimization Settings (NEW)
    s.selectorEngine.optimization = s.selectorEngine.optimization || {};
    const opt = s.selectorEngine.optimization;
    
    // Фаза 1
    opt.deduplicateSelectors = this.getCheckboxSafe('optDeduplicateSelectors', true);
    opt.enableSelectorCache = this.getCheckboxSafe('optEnableSelectorCache', true);
    opt.selectorCacheTTL = this.getNumberSafe('optSelectorCacheTTL', 30000);
    opt.asyncUniquenessCheck = this.getCheckboxSafe('optAsyncUniquenessCheck', true);
    
    // Фаза 2
    opt.smartSelectorScoring = this.getCheckboxSafe('optSmartSelectorScoring', true);
    opt.penalizeDynamicParts = this.getCheckboxSafe('optPenalizeDynamicParts', true);
    opt.improvedDropdownDetection = this.getCheckboxSafe('optImprovedDropdownDetection', true);
    opt.exponentialBackoffRetry = this.getCheckboxSafe('optExponentialBackoffRetry', true);
    opt.useMutationObserver = this.getCheckboxSafe('optUseMutationObserver', true);
    
    // Фаза 3
    opt.generateXPath = this.getCheckboxSafe('optGenerateXPath', false);
    opt.improvedOverlaySearch = this.getCheckboxSafe('optImprovedOverlaySearch', true);
    opt.validateBeforeSave = this.getCheckboxSafe('optValidateBeforeSave', true);
    opt.eventDebounce = this.getCheckboxSafe('optEventDebounce', true);
    opt.eventDebounceDelay = this.getNumberSafe('optEventDebounceDelay', 100);
    opt.clickThrottleMs = this.getNumberSafe('optClickThrottleMs', 200);
    
    // Метрики
    opt.calculateMetrics = this.getCheckboxSafe('optCalculateMetrics', false);
    opt.autoFixUnstable = this.getCheckboxSafe('optAutoFixUnstable', false);
    opt.minStabilityScore = this.getNumberSafe('optMinStabilityScore', 70);

    // Advanced
    s.advanced.verboseLogging = document.getElementById('verboseLogging').checked;
    s.advanced.excludeHiddenElements = document.getElementById('excludeHiddenElements').checked;
    s.advanced.smartWaits = document.getElementById('smartWaits').checked;
    
    // Recording Mode Settings (NEW)
    const recordingModeRadio = document.querySelector('input[name="recordingMode"]:checked');
    s.recordingMode = recordingModeRadio ? recordingModeRadio.value : 'auto';
    
    const selectorStrategyRadio = document.querySelector('input[name="selectorStrategy"]:checked');
    s.selectorStrategy = selectorStrategyRadio ? selectorStrategyRadio.value : 'stability';
    
    s.pickerSettings = s.pickerSettings || {};
    s.pickerSettings.timeout = this.getNumberSafe('pickerTimeout', 5);
    s.pickerSettings.showScores = this.getCheckboxSafe('showSelectorScores', true);
    s.pickerSettings.highlightBest = this.getCheckboxSafe('highlightBestSelector', true);

    s.playback = s.playback || {};
    const stepTimeoutVal = parseInt(document.getElementById('playbackStepTimeout')?.value, 10);
    s.playback.stepTimeoutSeconds = [5, 10, 15].includes(stepTimeoutVal) ? stepTimeoutVal : 5;

    // Autotests
    s.autotests = s.autotests || {};
    s.autotests.enabled = document.getElementById('autotestsEnabled').checked;

    // Analytics
    s.analytics = s.analytics || {};
    s.analytics.enabled = this.getCheckboxSafe('analyticsEnabled', false);
    s.videoRecording = s.videoRecording || {};
    s.videoRecording.enabled = this.getCheckboxSafe('videoRecordingEnabled', false);
    s.videoRecording.makeSeekable = s.videoRecording.enabled && this.getCheckboxSafe('videoRecordingMakeSeekable', false);

    // Excel Export
    s.excelExport = s.excelExport || {};
    s.excelExport.enabled = document.getElementById('excelExportEnabled').checked;
    s.excelExport.autoExportEnabled = document.getElementById('excelAutoExportEnabled').checked;
    s.excelExport.exportOnRecord = document.getElementById('excelExportOnRecord').checked;
    s.excelExport.exportOnPlay = document.getElementById('excelExportOnPlay').checked;
    s.excelExport.exportOnOptimize = document.getElementById('excelExportOnOptimize').checked;
    s.excelExport.recordConsoleErrors = this.getCheckboxSafe('excelRecordConsoleErrors', false);
    s.excelExport.format = document.getElementById('excelExportFormat').value || 'xls';
    const delimiterValue = document.getElementById('excelExportDelimiter').value || ';';
    s.excelExport.delimiter = delimiterValue.trim() || ';';
    s.excelExport.exportPath = document.getElementById('excelExportPath').value.trim();

    // Общий путь для видео и скриншотов
    s.mediaSavePath = (this.getInputSafe('mediaSavePath', 'AutoTestRecorder') || 'AutoTestRecorder').trim().replace(/\/+$/, '');
    // Screenshots
    s.screenshots = s.screenshots || {};
    s.screenshots.saveToDisk = this.getCheckboxSafe('screenshotsSaveEnabled', false);
    s.screenshots.onlyOnError = this.getCheckboxSafe('screenshotsOnlyOnError', false);
    s.screenshots.storeInMemory = this.getCheckboxSafe('screenshotsStoreInMemory', true);
    s.screenshots.mode = s.screenshots.saveToDisk ? 'download' : 'none';
  }

  exportSettings() {
    this.collectFormData();
    
    const dataStr = JSON.stringify(this.currentSettings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `autotest-recorder-settings-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    this.showNotification('Настройки экспортированы', 'success');
  }

  async importSettings(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      
      // Validate settings structure
      if (!imported.selectorEngine || !imported.ai || !imported.performance) {
        throw new Error('Неверный формат файла настроек');
      }

      this.currentSettings = imported;
      this.populateForm();
      this.showNotification('Настройки импортированы', 'success');
    } catch (error) {
      console.error('Error importing settings:', error);
      this.showNotification('Ошибка при импорте настроек: ' + error.message, 'error');
    }
  }

  showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      background: ${type === 'success' ? '#4caf50' : '#f44336'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      font-size: 14px;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize settings manager
const settingsManager = new SettingsManager();
