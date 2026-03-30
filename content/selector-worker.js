/**
 * Web Worker для генерации селекторов
 * Выполняет тяжелые вычисления в отдельном потоке
 */

// Импортируем необходимые функции (в реальности они должны быть сериализуемыми)
// Для Web Worker нужно передавать только данные, не DOM элементы

self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'GENERATE_SELECTORS':
      handleGenerateSelectors(data);
      break;
    case 'VALIDATE_SELECTOR':
      handleValidateSelector(data);
      break;
    case 'CALCULATE_METRICS':
      handleCalculateMetrics(data);
      break;
    default:
      self.postMessage({ success: false, error: 'Unknown message type' });
  }
};

/**
 * Генерация селекторов на основе данных элемента
 */
function handleGenerateSelectors(elementData) {
  try {
    const selectors = [];
    
    // Приоритет 1: data-testid
    if (elementData.dataset?.testid) {
      selectors.push({
        type: 'data-testid',
        value: elementData.dataset.testid,
        selector: `[data-testid="${escapeSelector(elementData.dataset.testid)}"]`,
        priority: 1
      });
    }
    
    // Приоритет 2: data-cy
    if (elementData.dataset?.cy) {
      selectors.push({
        type: 'data-cy',
        value: elementData.dataset.cy,
        selector: `[data-cy="${escapeSelector(elementData.dataset.cy)}"]`,
        priority: 2
      });
    }
    
    // Приоритет 3: data-test
    if (elementData.dataset?.test) {
      selectors.push({
        type: 'data-test',
        value: elementData.dataset.test,
        selector: `[data-test="${escapeSelector(elementData.dataset.test)}"]`,
        priority: 3
      });
    }
    
    // Приоритет 4: id
    if (elementData.id) {
      selectors.push({
        type: 'id',
        value: elementData.id,
        selector: `#${escapeSelector(elementData.id)}`,
        priority: 4
      });
    }
    
    // Приоритет 5: name
    if (elementData.name) {
      selectors.push({
        type: 'name',
        value: elementData.name,
        selector: `[name="${escapeSelector(elementData.name)}"]`,
        priority: 5
      });
    }
    
    // Приоритет 6: aria-label
    if (elementData.ariaLabel) {
      selectors.push({
        type: 'aria-label',
        value: elementData.ariaLabel,
        selector: `[aria-label="${escapeSelector(elementData.ariaLabel)}"]`,
        priority: 6
      });
    }
    
    // Приоритет 8: класс (только стабильные)
    if (elementData.classes && Array.isArray(elementData.classes)) {
      const stableClasses = elementData.classes.filter(className => {
        const dynamicPatterns = [
          /^ng-/,
          /^css-[\da-z]+$/i,
          /^sc-[a-z0-9]+$/i,
          /^emotion-[a-z0-9]+$/i,
          /^_[a-z0-9]+$/i,
          /^[a-z0-9]{8,}$/i
        ];
        return !dynamicPatterns.some(pattern => pattern.test(className));
      });
      
      stableClasses.forEach(className => {
        selectors.push({
          type: 'class',
          value: className,
          selector: `.${escapeSelector(className)}`,
          priority: 8,
          isStable: true
        });
      });
    }
    
    // Сортируем по приоритету
    selectors.sort((a, b) => a.priority - b.priority);
    
    self.postMessage({
      success: true,
      selectors: selectors
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
}

/**
 * Валидация селектора
 */
function handleValidateSelector(data) {
  try {
    const { selector } = data;
    const issues = [];
    
    // Проверка на проблемные паттерны
    const problematicPatterns = [
      { pattern: /\d{10,}/, issue: 'Содержит длинное число (возможно timestamp)' },
      { pattern: /[a-f0-9]{8}-[a-f0-9]{4}/i, issue: 'Содержит UUID' },
      { pattern: /_ngcontent-[a-z0-9]+|_nghost-[a-z0-9]+/i, issue: 'Содержит Angular scoped стили' },
      { pattern: /\.css-[\da-z]{5,}/i, issue: 'Содержит CSS-in-JS хэш' }
    ];
    
    problematicPatterns.forEach(({ pattern, issue }) => {
      if (pattern.test(selector)) {
        issues.push(issue);
      }
    });
    
    self.postMessage({
      success: true,
      isValid: issues.length === 0,
      issues: issues
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
}

/**
 * Расчет метрик качества селектора
 */
function handleCalculateMetrics(data) {
  try {
    const { selector } = data;
    
    let stability = 100;
    let score = 100;
    
    // Штрафы за нестабильные части
    if (/\d{5,}/.test(selector)) stability -= 30;
    if (/nth-child\(\d+\)/.test(selector)) stability -= 20;
    if (/_ngcontent|_nghost/.test(selector)) stability -= 25;
    if (/[a-f0-9]{8}-[a-f0-9]{4}/i.test(selector)) stability -= 35;
    
    // Бонусы за стабильные части
    if (/data-testid/.test(selector)) stability += 20;
    if (/data-cy/.test(selector)) stability += 20;
    if (/aria-label/.test(selector)) stability += 15;
    
    // Штраф за длину
    score -= Math.min(selector.length / 10, 25);
    
    // Нормализация
    stability = Math.max(0, Math.min(100, stability));
    score = Math.max(0, Math.min(100, score));
    
    self.postMessage({
      success: true,
      metrics: {
        score: Math.round(score),
        stability: Math.round(stability),
        length: selector.length
      }
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
}

/**
 * Экранирование специальных символов
 */
function escapeSelector(str) {
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}









