/**
 * Модуль сравнения скриншотов
 * Before/After для визуальной регрессии
 */

class ScreenshotComparer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Сравнивает два скриншота и возвращает различия
   */
  async compareScreenshots(beforeImage, afterImage, options = {}) {
    const {
      threshold = 0.1, // Порог различий (0-1)
      highlightDifferences = true,
      showOverlay = true
    } = options;

    try {
      // Загружаем изображения
      const beforeImg = await this.loadImage(beforeImage);
      const afterImg = await this.loadImage(afterImage);

      // Создаем canvas для сравнения
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(beforeImg.width, afterImg.width);
      canvas.height = Math.max(beforeImg.height, afterImg.height);
      const ctx = canvas.getContext('2d');

      // Рисуем before изображение
      ctx.drawImage(beforeImg, 0, 0);

      // Получаем данные пикселей
      const beforeData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const beforePixels = beforeData.data;

      // Рисуем after изображение
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(afterImg, 0, 0);
      const afterData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const afterPixels = afterData.data;

      // Сравниваем пиксели
      const diffData = ctx.createImageData(canvas.width, canvas.height);
      let diffCount = 0;
      let totalDiff = 0;

      for (let i = 0; i < beforePixels.length; i += 4) {
        const r1 = beforePixels[i];
        const g1 = beforePixels[i + 1];
        const b1 = beforePixels[i + 2];
        const a1 = beforePixels[i + 3];

        const r2 = afterPixels[i];
        const g2 = afterPixels[i + 1];
        const b2 = afterPixels[i + 2];
        const a2 = afterPixels[i + 3];

        // Вычисляем разницу
        const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) + Math.abs(a1 - a2);
        const normalizedDiff = diff / (255 * 4); // Нормализуем к 0-1

        if (normalizedDiff > threshold) {
          // Подсвечиваем различия красным
          diffData.data[i] = 255; // R
          diffData.data[i + 1] = 0; // G
          diffData.data[i + 2] = 0; // B
          diffData.data[i + 3] = 255; // A
          diffCount++;
          totalDiff += normalizedDiff;
        } else {
          // Копируем оригинальный пиксель
          diffData.data[i] = r2;
          diffData.data[i + 1] = g2;
          diffData.data[i + 2] = b2;
          diffData.data[i + 3] = a2;
        }
      }

      // Рисуем различия
      if (highlightDifferences) {
        ctx.putImageData(diffData, 0, 0);
      } else {
        ctx.drawImage(afterImg, 0, 0);
      }

      const diffPercentage = (diffCount / (canvas.width * canvas.height)) * 100;
      const avgDiff = diffCount > 0 ? totalDiff / diffCount : 0;

      return {
        hasDifferences: diffCount > 0,
        diffPercentage: Math.round(diffPercentage * 100) / 100,
        diffCount: diffCount,
        totalPixels: canvas.width * canvas.height,
        avgDiff: Math.round(avgDiff * 100) / 100,
        diffImage: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height
      };
    } catch (error) {
      console.error('Ошибка при сравнении скриншотов:', error);
      return {
        hasDifferences: false,
        error: error.message
      };
    }
  }

  /**
   * Загружает изображение из data URL
   */
  loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * Создает визуальное сравнение (side-by-side)
   */
  async createComparisonView(beforeImage, afterImage, diffImage) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const beforeImg = await this.loadImage(beforeImage);
    const afterImg = await this.loadImage(afterImage);
    const diffImg = diffImage ? await this.loadImage(diffImage) : null;

    const imgWidth = Math.max(beforeImg.width, afterImg.width);
    const imgHeight = Math.max(beforeImg.height, afterImg.height);
    const spacing = 20;

    canvas.width = (imgWidth * (diffImg ? 3 : 2)) + (spacing * (diffImg ? 2 : 1));
    canvas.height = imgHeight + 40; // +40 для подписей

    // Фон
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Before
    ctx.drawImage(beforeImg, 0, 20);
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.fillText('Before', 10, 15);

    // After
    ctx.drawImage(afterImg, imgWidth + spacing, 20);
    ctx.fillText('After', imgWidth + spacing + 10, 15);

    // Diff (если есть)
    if (diffImg) {
      ctx.drawImage(diffImg, (imgWidth + spacing) * 2, 20);
      ctx.fillText('Differences', (imgWidth + spacing) * 2 + 10, 15);
    }

    return canvas.toDataURL('image/png');
  }
}

// Экспортируем глобально
window.ScreenshotComparer = ScreenshotComparer;









