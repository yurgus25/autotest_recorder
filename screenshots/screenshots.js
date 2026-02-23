// Просмотр скриншотов теста

class ScreenshotsViewer {
  constructor() {
    this.screenshots = [];
    this.init();
  }

  async init() {
    // Загружаем JSZip локально
    await this.loadJSZip();

    // Получаем testId из URL
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('testId');

    if (!testId) {
      document.getElementById('emptyState').textContent = 'Тест не указан';
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('loading').classList.add('hidden');
      return;
    }

    this.testId = testId;

    // Привязываем обработчики
    document.getElementById('closeBtn').addEventListener('click', () => {
      window.close();
    });

    document.getElementById('downloadBtn').addEventListener('click', () => {
      this.downloadAsZip();
    });

    document.getElementById('closeFullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeFullscreen();
    });

    document.getElementById('fullscreenView').addEventListener('click', () => {
      this.closeFullscreen();
    });

    // Загружаем скриншоты
    await this.loadScreenshots(testId);
  }

  async loadScreenshots(testId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TEST_HISTORY',
        testId: testId
      });

      if (response && response.success) {
        const history = response.history || [];
        await this.processScreenshots(history);
        this.renderScreenshots();
      } else {
        this.showScreenshotsError((response?.error || 'Не удалось загрузить историю') + '.', testId);
      }
    } catch (error) {
      console.error('❌ Ошибка при получении истории:', error);
      this.showScreenshotsError(error.message || 'Ошибка при загрузке истории.', testId);
    }
  }

  showScreenshotsError(message, testId) {
    document.getElementById('loading').classList.add('hidden');
    const emptyEl = document.getElementById('emptyState');
    emptyEl.innerHTML = `
      <div class="error-block">
        <div class="error-icon" style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
        <p style="color: #c62828; margin: 0;">${message.replace(/</g, '&lt;')}</p>
        <button type="button" class="btn-retry" id="screenshotsRetryBtn">Повторить</button>
      </div>
    `;
    emptyEl.classList.remove('hidden');
    document.getElementById('screenshotsRetryBtn')?.addEventListener('click', () => {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('emptyState').innerHTML = '';
      document.getElementById('loading').classList.remove('hidden');
      this.loadScreenshots(testId);
    });
  }

  async processScreenshots(history) {
    this.screenshots = [];
    
    // Сортируем историю по дате (новые прогоны первыми)
    const sortedHistory = [...history].sort((a, b) => {
      const dateA = new Date(a.startTime || 0).getTime();
      const dateB = new Date(b.startTime || 0).getTime();
      return dateB - dateA; // Новые первыми
    });
    
    sortedHistory.forEach((run, runIndex) => {
      if (run.steps) {
        run.steps.forEach((step, stepIndex) => {
          const runDate = new Date(run.startTime).toLocaleString('ru-RU');
          const stepNumber = step.stepNumber || (stepIndex + 1);
          
          // Проверяем наличие скриншотов в полях (если они еще не удалены)
          if (step.screenshot) {
            this.screenshots.push({
              type: 'error',
              image: step.screenshot,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `Ошибка на шаге ${stepNumber}: ${step.error || 'Неизвестная ошибка'}`
            });
          }
          
          if (step.beforeScreenshot) {
            // Проверяем, является ли это скриншотом навигации
            const isNavigation = step.actionType === 'navigate' || step.actionType === 'url' || (step.expectedValue && step.expectedValue.includes('http'));
            const description = isNavigation 
              ? `До навигации (шаг ${stepNumber}): ${step.expectedValue || 'Переход на страницу'}`
              : `До шага ${stepNumber}`;
            
            this.screenshots.push({
              type: 'before',
              image: step.beforeScreenshot,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: description
            });
          }
          
          if (step.afterScreenshot) {
            // Проверяем, является ли это скриншотом навигации
            const isNavigation = step.actionType === 'navigate' || step.actionType === 'url' || (step.expectedValue && step.expectedValue.includes('http'));
            const description = isNavigation 
              ? `После навигации (шаг ${stepNumber}): ${step.expectedValue || 'Переход на страницу'}`
              : `После шага ${stepNumber}`;
            
            this.screenshots.push({
              type: 'after',
              image: step.afterScreenshot,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: description
            });
          }
          
          if (step.screenshotComparison && step.screenshotComparison.diffImage) {
            this.screenshots.push({
              type: 'comparison',
              image: step.screenshotComparison.diffImage,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `Сравнение шага ${stepNumber}: ${step.screenshotComparison.diffPercentage}% различий`
            });
          }
          
          if (step.screenshotComparisonView) {
            this.screenshots.push({
              type: 'comparison-view',
              image: step.screenshotComparisonView,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `Визуальное сравнение шага ${stepNumber}`
            });
          }
          
          // Если скриншоты удалены из истории (для экономии места), проверяем пути к файлам
          // ВАЖНО: Скриншоты сохраняются в файлы, но мы не можем их загрузить из файлов напрямую
          // Поэтому показываем информацию о наличии скриншотов по путям
          if (!step.beforeScreenshot && step.beforeScreenshotPath) {
            console.log(`📸 [Screenshots] Найден путь к скриншоту "до шага ${stepNumber}": ${step.beforeScreenshotPath}`);
            // Показываем placeholder, так как мы не можем загрузить файл напрямую
            this.screenshots.push({
              type: 'before',
              image: null, // Файл сохранен, но не загружен
              path: step.beforeScreenshotPath,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `До шага ${stepNumber} (файл: ${step.beforeScreenshotPath})`
            });
          }
          
          if (!step.afterScreenshot && step.afterScreenshotPath) {
            console.log(`📸 [Screenshots] Найден путь к скриншоту "после шага ${stepNumber}": ${step.afterScreenshotPath}`);
            this.screenshots.push({
              type: 'after',
              image: null,
              path: step.afterScreenshotPath,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `После шага ${stepNumber} (файл: ${step.afterScreenshotPath})`
            });
          }
          
          if (!step.screenshot && step.errorScreenshotPath) {
            console.log(`📸 [Screenshots] Найден путь к скриншоту ошибки шага ${stepNumber}: ${step.errorScreenshotPath}`);
            this.screenshots.push({
              type: 'error',
              image: null,
              path: step.errorScreenshotPath,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `Ошибка на шаге ${stepNumber} (файл: ${step.errorScreenshotPath})`
            });
          }
          
          if (step.screenshotComparison && step.screenshotComparison.diffImagePath && !step.screenshotComparison.diffImage) {
            console.log(`📸 [Screenshots] Найден путь к сравнению шага ${stepNumber}: ${step.screenshotComparison.diffImagePath}`);
            this.screenshots.push({
              type: 'comparison',
              image: null,
              path: step.screenshotComparison.diffImagePath,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `Сравнение шага ${stepNumber} (файл: ${step.screenshotComparison.diffImagePath})`
            });
          }
          
          if (!step.screenshotComparisonView && step.screenshotComparisonViewPath) {
            console.log(`📸 [Screenshots] Найден путь к визуальному сравнению шага ${stepNumber}: ${step.screenshotComparisonViewPath}`);
            this.screenshots.push({
              type: 'comparison-view',
              image: null,
              path: step.screenshotComparisonViewPath,
              runIndex: runIndex,
              stepIndex: stepIndex,
              stepNumber: stepNumber,
              runDate: runDate,
              description: `Визуальное сравнение шага ${stepNumber} (файл: ${step.screenshotComparisonViewPath})`
            });
          }
        });
      }
    });
  }

  renderScreenshots() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const container = document.getElementById('screenshotsContainer');
    const grid = document.getElementById('screenshotsGrid');
    const downloadBtn = document.getElementById('downloadBtn');

    loading.classList.add('hidden');

    if (this.screenshots.length === 0) {
      emptyState.classList.remove('hidden');
      downloadBtn.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    downloadBtn.classList.remove('hidden');

    const typeLabels = {
      'error': 'Ошибка',
      'before': 'До',
      'after': 'После',
      'comparison': 'Сравнение',
      'comparison-view': 'Визуальное сравнение'
    };

    // Фильтруем скриншоты, оставляя только те, у которых есть изображение
    const screenshotsWithImages = this.screenshots.filter(s => s.image !== null && s.image !== undefined);
    
    if (screenshotsWithImages.length === 0) {
      emptyState.textContent = 'Скриншоты сохранены в файлы, но не могут быть загружены напрямую. Проверьте папку Downloads/AutoTestRecorder/screenshots/';
      emptyState.classList.remove('hidden');
      downloadBtn.classList.add('hidden');
      return;
    }
    
    grid.innerHTML = screenshotsWithImages.map((screenshot, index) => `
      <div class="screenshot-item" data-index="${index}">
        <img src="${screenshot.image}" alt="${this.escapeHtml(screenshot.description)}" loading="lazy">
        <div class="screenshot-info">
          <div class="screenshot-description">${this.escapeHtml(screenshot.description)}</div>
          <div class="screenshot-date">${screenshot.runDate}</div>
          <span class="screenshot-type-badge ${screenshot.type}">${typeLabels[screenshot.type] || screenshot.type}</span>
        </div>
      </div>
    `).join('');
    
    // Обновляем массив скриншотов для полноэкранного просмотра
    this.screenshots = screenshotsWithImages;

    // Привязываем обработчики клика
    grid.querySelectorAll('.screenshot-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.showFullscreen(this.screenshots[index]);
      });
    });
  }

  showFullscreen(screenshot) {
    const fullscreenView = document.getElementById('fullscreenView');
    const fullscreenImage = document.getElementById('fullscreenImage');
    const fullscreenInfo = document.getElementById('fullscreenInfo');

    fullscreenImage.src = screenshot.image;
    fullscreenInfo.textContent = `${screenshot.description} | ${screenshot.runDate}`;
    
    fullscreenView.classList.remove('hidden');
  }

  closeFullscreen() {
    const fullscreenView = document.getElementById('fullscreenView');
    fullscreenView.classList.add('hidden');
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

  async loadJSZip() {
    return new Promise((resolve, reject) => {
      // Проверяем, не загружен ли уже JSZip
      if (window.JSZip) {
        resolve();
        return;
      }

      // Загружаем JSZip из локального файла
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('libs/jszip.min.js');
      script.onload = () => {
        console.log('✅ JSZip загружен локально');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Ошибка загрузки JSZip');
        reject(new Error('Не удалось загрузить JSZip'));
      };
      document.head.appendChild(script);
    });
  }

  async downloadAsZip() {
    if (!window.JSZip) {
      alert('Ошибка: JSZip не загружен. Проверьте подключение к интернету.');
      return;
    }

    if (this.screenshots.length === 0) {
      alert('Нет скриншотов для скачивания');
      return;
    }

    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.disabled = true;
    downloadBtn.textContent = '📦 Создание архива...';

    try {
      const zip = new JSZip();
      
      // Получаем информацию о тесте для имени архива
      const testInfo = await this.getTestInfo();
      const testName = testInfo.name || 'test';
      const runDate = this.screenshots[0]?.runDate || new Date().toLocaleString('ru-RU');
      
      // Форматируем дату для имени файла
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
      const zipFileName = `Скриншоты_${testName}_${dateStr}_${timeStr}.zip`;
      
      // Добавляем скриншоты в архив
      let addedCount = 0;
      for (let i = 0; i < this.screenshots.length; i++) {
        const screenshot = this.screenshots[i];
        try {
          // Конвертируем base64 в blob
          const base64Data = screenshot.image.split(',')[1] || screenshot.image;
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }

          // Формируем имя файла скриншота
          const typeLabels = {
            'error': 'Ошибка',
            'before': 'До',
            'after': 'После',
            'comparison': 'Сравнение',
            'comparison-view': 'Визуальное_сравнение'
          };
          const typeLabel = typeLabels[screenshot.type] || screenshot.type;
          const stepNum = String(screenshot.stepNumber || i + 1).padStart(3, '0');
          const screenshotFileName = `${stepNum}_${typeLabel}_шаг${screenshot.stepNumber || i + 1}.png`;

          zip.file(screenshotFileName, bytes, { binary: true });
          addedCount++;
        } catch (error) {
          console.warn(`⚠️ Не удалось добавить скриншот ${i + 1}:`, error);
        }
      }

      // Обновляем README с фактическим количеством добавленных скриншотов
      const readmeContent = `Скриншоты теста: ${testName}\n` +
                           `Дата прогона: ${runDate}\n` +
                           `Всего скриншотов: ${addedCount}\n` +
                           `\nЭто архив содержит скриншоты, сделанные во время выполнения теста.\n` +
                           `Скриншоты включают:\n` +
                           `- Снимки до выполнения шагов\n` +
                           `- Снимки после выполнения шагов\n` +
                           `- Снимки при ошибках\n` +
                           `- Сравнения скриншотов (если доступны)\n`;
      
      zip.file('README.txt', readmeContent);

      // Генерируем ZIP файл
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Скачиваем файл
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`✅ Создан ZIP архив "${zipFileName}" с ${addedCount} скриншотами`);
      alert(`✅ Архив "${zipFileName}" успешно создан и скачан!\n\nСодержит ${addedCount} скриншотов.`);
    } catch (error) {
      console.error('❌ Ошибка при создании ZIP архива:', error);
      alert('❌ Ошибка при создании архива: ' + error.message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '💾 Скачать ZIP';
    }
  }

  async getTestInfo() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TEST',
        testId: this.testId
      });

      if (response && response.success && response.test) {
        return {
          name: response.test.name || 'Неизвестный тест',
          id: response.test.id
        };
      }
    } catch (error) {
      console.warn('⚠️ Не удалось получить информацию о тесте:', error);
    }

    return {
      name: 'Тест',
      id: this.testId
    };
  }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotsViewer();
});


