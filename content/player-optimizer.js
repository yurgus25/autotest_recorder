/**
 * Player Optimizer - Оптимизация выполнения тестов
 * Уменьшение времени прогона за счет:
 * 1. Уменьшения задержек
 * 2. Параллельного выполнения действий на одной странице
 */

class PlayerOptimizer {
  constructor() {
    this.optimizedDelays = {
      // Минимальные задержки для разных типов действий
      default: 100,        // Было: 300-500
      click: 150,          // Было: 300-500
      input: 100,          // Было: 300-500
      dropdown: 200,       // Было: 500-1000
      navigation: 300,     // Было: 500-1000
      waitForElement: 50,   // Было: 200-500
      screenshot: 100,     // Было: 500
      scroll: 100          // Было: 200-500
    };
    
    this.parallelExecutionEnabled = true;
    this.maxParallelActions = 5; // Максимум параллельных действий на странице
  }

  /**
   * Группирует действия по страницам (URL)
   */
  groupActionsByPage(actions) {
    const groups = [];
    let currentGroup = null;
    
    for (const action of actions) {
      const url = this.getActionUrl(action);
      
      if (!currentGroup || currentGroup.url !== url) {
        // Новая страница - начинаем новую группу
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          url: url,
          actions: []
        };
      }
      
      currentGroup.actions.push(action);
    }
    
    if (currentGroup) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * Получает URL действия
   */
  getActionUrl(action) {
    if (action.url) return action.url;
    if (action.type === 'navigate') return action.value || action.url;
    return window.location.href; // Текущая страница
  }

  /**
   * Определяет, можно ли выполнять действия параллельно
   */
  canExecuteInParallel(action1, action2) {
    // Нельзя параллельно:
    // 1. Если одно действие зависит от другого (например, клик перед input)
    // 2. Навигация всегда последовательна
    // 3. Wait действия должны быть последовательными
    
    if (action1.type === 'navigate' || action2.type === 'navigate') {
      return false;
    }
    
    if (action1.type === 'wait' || action2.type === 'wait') {
      return false;
    }
    
    // Если action1 - клик на dropdown, а action2 - input для того же dropdown
    if (action1.type === 'click' && action2.type === 'input') {
      const selector1 = this.getSelectorString(action1.selector);
      const selector2 = this.getSelectorString(action2.selector);
      if (this.isSameElement(selector1, selector2)) {
        return false; // Зависимые действия
      }
    }
    
    // Если оба действия на разных элементах и оба input/change - можно параллельно
    if ((action1.type === 'input' || action1.type === 'change') &&
        (action2.type === 'input' || action2.type === 'change')) {
      const selector1 = this.getSelectorString(action1.selector);
      const selector2 = this.getSelectorString(action2.selector);
      if (!this.isSameElement(selector1, selector2)) {
        return true; // Разные поля - можно параллельно
      }
    }
    
    // По умолчанию - последовательно
    return false;
  }

  /**
   * Получает строку селектора
   */
  getSelectorString(selector) {
    if (typeof selector === 'string') return selector;
    if (selector?.selector) return selector.selector;
    if (selector?.value) return selector.value;
    return '';
  }

  /**
   * Проверяет, указывают ли селекторы на один элемент
   */
  isSameElement(selector1, selector2) {
    if (!selector1 || !selector2) return false;
    const s1 = selector1.toLowerCase().trim();
    const s2 = selector2.toLowerCase().trim();
    return s1 === s2 || s1.includes(s2) || s2.includes(s1);
  }

  /**
   * Оптимизирует задержки в действиях
   */
  optimizeDelays(actions) {
    return actions.map(action => {
      const optimized = { ...action };
      
      // Уменьшаем задержки в зависимости от типа действия
      if (action.delay) {
        const actionType = action.type || 'default';
        const optimizedDelay = this.optimizedDelays[actionType] || this.optimizedDelays.default;
        
        // Если задержка больше оптимизированной, уменьшаем её
        if (action.delay > optimizedDelay) {
          optimized.delay = Math.max(optimizedDelay, action.delay * 0.3); // Уменьшаем на 70%
          console.log(`⚡ Оптимизация: задержка ${action.delay}мс → ${optimized.delay}мс для ${actionType}`);
        }
      }
      
      return optimized;
    });
  }

  /**
   * Создает план параллельного выполнения действий на странице
   */
  createParallelExecutionPlan(pageActions) {
    const plan = [];
    let currentBatch = [];
    
    for (let i = 0; i < pageActions.length; i++) {
      const action = pageActions[i];
      
      // Если действие можно добавить в текущий батч
      if (currentBatch.length === 0 || 
          (currentBatch.length < this.maxParallelActions && 
           currentBatch.every(a => this.canExecuteInParallel(a, action)))) {
        currentBatch.push(action);
      } else {
        // Сохраняем текущий батч и начинаем новый
        if (currentBatch.length > 0) {
          plan.push({
            type: currentBatch.length > 1 ? 'parallel' : 'sequential',
            actions: [...currentBatch]
          });
        }
        currentBatch = [action];
      }
    }
    
    // Добавляем последний батч
    if (currentBatch.length > 0) {
      plan.push({
        type: currentBatch.length > 1 ? 'parallel' : 'sequential',
        actions: currentBatch
      });
    }
    
    return plan;
  }

  /**
   * Выполняет действия параллельно
   */
  async executeParallel(actions, playerInstance) {
    console.log(`⚡ Параллельное выполнение ${actions.length} действий на странице`);
    
    const promises = actions.map(async (action, index) => {
      try {
        console.log(`  → Действие ${index + 1}: ${action.type}`);
        
        // Используем стандартный метод executeAction для всех типов действий
        // Это обеспечит правильную обработку всех типов действий и историю
        await playerInstance.executeAction(action);
        
        console.log(`  ✅ Действие ${index + 1} выполнено`);
        return { success: true, action };
      } catch (error) {
        console.error(`  ❌ Ошибка в действии ${index + 1}:`, error);
        return { success: false, action, error };
      }
    });
    
    const results = await Promise.all(promises);
    
    // Проверяем результаты
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      const errorMessages = failed.map(f => f.error?.message || f.error).join('; ');
      throw new Error(`${failed.length} из ${results.length} действий завершились с ошибкой: ${errorMessages}`);
    }
    
    console.log(`✅ Все ${actions.length} действий выполнены параллельно`);
    return results;
  }
}

// Экспортируем глобально
window.PlayerOptimizer = PlayerOptimizer;

