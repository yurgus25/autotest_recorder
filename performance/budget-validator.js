/**
 * Performance Budget Validator
 * Validates test results against configured budgets
 */

(function() {
  'use strict';

  /**
   * Default budgets (moderate preset)
   */
  const DEFAULT_BUDGETS = {
    webVitals: {
      lcp: 2500,
      cls: 0.1,
      inp: 200,
      ttfb: 800
    },
    test: {
      duration: 5000,
      stepDuration: 1000,
      longTasks: 5,
      totalBlockingTime: 1000
    },
    resources: {
      count: 50,
      totalSize: 2 * 1024 * 1024, // 2MB
      maxScriptSize: 500 * 1024,  // 500KB
      maxImageSize: 300 * 1024    // 300KB
    }
  };

  /**
   * Validate performance data against budgets
   * @param {Object} performanceData - Performance data from collector
   * @param {Object} budgets - Budget configuration (optional, loads from storage)
   * @returns {Promise<Object>} Validation results
   */
  async function validateBudgets(performanceData, budgets = null) {
    // Load budgets from storage if not provided
    if (!budgets) {
      const result = await chrome.storage.local.get('performanceBudgets');
      budgets = result.performanceBudgets || DEFAULT_BUDGETS;
    }

    const violations = [];
    let passed = 0;
    let failed = 0;

    // Validate Web Vitals
    if (budgets.webVitals && performanceData.webVitals) {
      const checks = [
        {
          name: 'LCP',
          actual: performanceData.webVitals.lcp?.value || 0,
          budget: budgets.webVitals.lcp,
          unit: 'ms'
        },
        {
          name: 'CLS',
          actual: performanceData.webVitals.cls?.value || 0,
          budget: budgets.webVitals.cls,
          unit: ''
        },
        {
          name: 'INP',
          actual: performanceData.webVitals.inp?.value || 0,
          budget: budgets.webVitals.inp,
          unit: 'ms'
        },
        {
          name: 'TTFB',
          actual: performanceData.webVitals.ttfb?.value || 0,
          budget: budgets.webVitals.ttfb,
          unit: 'ms'
        }
      ];

      checks.forEach(check => {
        if (check.actual > check.budget) {
          violations.push({
            category: 'Web Vitals',
            metric: check.name,
            actual: check.actual,
            budget: check.budget,
            unit: check.unit,
            overBy: check.actual - check.budget,
            severity: getSeverity(check.actual, check.budget)
          });
          failed++;
        } else {
          passed++;
        }
      });
    }

    // Validate Test Performance
    if (budgets.test && performanceData.duration) {
      // Total duration
      if (performanceData.duration > budgets.test.duration) {
        violations.push({
          category: 'Test Performance',
          metric: 'Total Duration',
          actual: performanceData.duration,
          budget: budgets.test.duration,
          unit: 'ms',
          overBy: performanceData.duration - budgets.test.duration,
          severity: getSeverity(performanceData.duration, budgets.test.duration)
        });
        failed++;
      } else {
        passed++;
      }

      // Average step duration
      if (performanceData.steps && performanceData.steps.length > 0) {
        const avgStepDuration = performanceData.steps.reduce((sum, s) => 
          sum + (s.timing?.sinceLastStep || 0), 0) / performanceData.steps.length;
        
        if (avgStepDuration > budgets.test.stepDuration) {
          violations.push({
            category: 'Test Performance',
            metric: 'Average Step Duration',
            actual: avgStepDuration,
            budget: budgets.test.stepDuration,
            unit: 'ms',
            overBy: avgStepDuration - budgets.test.stepDuration,
            severity: getSeverity(avgStepDuration, budgets.test.stepDuration)
          });
          failed++;
        } else {
          passed++;
        }
      }

      // Long tasks
      const longTasksCount = performanceData.longTasks?.length || 0;
      if (longTasksCount > budgets.test.longTasks) {
        violations.push({
          category: 'Test Performance',
          metric: 'Long Tasks Count',
          actual: longTasksCount,
          budget: budgets.test.longTasks,
          unit: '',
          overBy: longTasksCount - budgets.test.longTasks,
          severity: getSeverity(longTasksCount, budgets.test.longTasks)
        });
        failed++;
      } else {
        passed++;
      }

      // Total blocking time
      const totalBlockingTime = (performanceData.longTasks || [])
        .reduce((sum, t) => sum + t.duration, 0);
      
      if (totalBlockingTime > budgets.test.totalBlockingTime) {
        violations.push({
          category: 'Test Performance',
          metric: 'Total Blocking Time',
          actual: totalBlockingTime,
          budget: budgets.test.totalBlockingTime,
          unit: 'ms',
          overBy: totalBlockingTime - budgets.test.totalBlockingTime,
          severity: getSeverity(totalBlockingTime, budgets.test.totalBlockingTime)
        });
        failed++;
      } else {
        passed++;
      }
    }

    // Validate Resources
    if (budgets.resources && performanceData.resources) {
      const resourceCount = performanceData.resources.length;
      const totalSize = performanceData.resources.reduce((sum, r) => sum + (r.size || 0), 0);
      
      // Resource count
      if (resourceCount > budgets.resources.count) {
        violations.push({
          category: 'Resources',
          metric: 'Total Resources',
          actual: resourceCount,
          budget: budgets.resources.count,
          unit: '',
          overBy: resourceCount - budgets.resources.count,
          severity: getSeverity(resourceCount, budgets.resources.count)
        });
        failed++;
      } else {
        passed++;
      }

      // Total size
      if (totalSize > budgets.resources.totalSize) {
        violations.push({
          category: 'Resources',
          metric: 'Total Size',
          actual: totalSize,
          budget: budgets.resources.totalSize,
          unit: 'bytes',
          overBy: totalSize - budgets.resources.totalSize,
          severity: getSeverity(totalSize, budgets.resources.totalSize)
        });
        failed++;
      } else {
        passed++;
      }

      // Max script size
      const scripts = performanceData.resources.filter(r => r.type === 'script');
      const maxScript = Math.max(...scripts.map(s => s.size || 0), 0);
      
      if (maxScript > budgets.resources.maxScriptSize) {
        violations.push({
          category: 'Resources',
          metric: 'Max Script Size',
          actual: maxScript,
          budget: budgets.resources.maxScriptSize,
          unit: 'bytes',
          overBy: maxScript - budgets.resources.maxScriptSize,
          severity: getSeverity(maxScript, budgets.resources.maxScriptSize)
        });
        failed++;
      } else {
        passed++;
      }

      // Max image size
      const images = performanceData.resources.filter(r => r.type === 'img');
      const maxImage = Math.max(...images.map(i => i.size || 0), 0);
      
      if (maxImage > budgets.resources.maxImageSize) {
        violations.push({
          category: 'Resources',
          metric: 'Max Image Size',
          actual: maxImage,
          budget: budgets.resources.maxImageSize,
          unit: 'bytes',
          overBy: maxImage - budgets.resources.maxImageSize,
          severity: getSeverity(maxImage, budgets.resources.maxImageSize)
        });
        failed++;
      } else {
        passed++;
      }
    }

    // Calculate overall result
    const totalChecks = passed + failed;
    const passRate = totalChecks > 0 ? (passed / totalChecks) * 100 : 100;
    
    return {
      passed: failed === 0,
      passRate: passRate,
      totalChecks: totalChecks,
      passed: passed,
      failed: failed,
      violations: violations,
      budgets: budgets,
      timestamp: Date.now()
    };
  }

  /**
   * Get severity level based on how much over budget
   */
  function getSeverity(actual, budget) {
    const percentOver = ((actual - budget) / budget) * 100;
    
    if (percentOver > 50) return 'critical'; // >50% over
    if (percentOver > 25) return 'warning';  // 25-50% over
    return 'minor';                          // <25% over
  }

  /**
   * Format violation for display
   */
  function formatViolation(violation) {
    let actualStr = violation.actual.toFixed(2);
    let budgetStr = violation.budget.toFixed(2);
    let overByStr = violation.overBy.toFixed(2);

    if (violation.unit === 'bytes') {
      actualStr = formatBytes(violation.actual);
      budgetStr = formatBytes(violation.budget);
      overByStr = formatBytes(violation.overBy);
    }

    return {
      ...violation,
      actualFormatted: `${actualStr}${violation.unit}`,
      budgetFormatted: `${budgetStr}${violation.unit}`,
      overByFormatted: `${overByStr}${violation.unit}`
    };
  }

  /**
   * Format bytes to human readable
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  // Export to window
  window.BudgetValidator = {
    validateBudgets,
    formatViolation,
    DEFAULT_BUDGETS
  };

})();
