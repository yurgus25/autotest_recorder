/**
 * Performance Dashboard
 * Displays Web Vitals, timeline, and resource details
 * @version 1.0.0 (MVP)
 */

(function() {
  'use strict';

  const isRu = () => document.documentElement.lang === 'ru';
  const t = (en, ru) => (isRu() ? ru : en);

  // State
  let performanceData = null;
  let allResources = [];
  let filteredResources = [];
  let timelineChart = null; // Timeline chart instance
  let comparisonBaseline = null; // Baseline data for comparison

  // DOM Elements
  const elements = {
    loadingState: null,
    emptyState: null,
    dashboardContent: null,
    // Will be initialized in init()
  };

  /**
   * Initialize dashboard
   */
  async function init() {
    console.log('🚀 [Performance Dashboard] Initializing...');
    
    // Cache DOM elements
    elements.loadingState = document.getElementById('loadingState');
    elements.emptyState = document.getElementById('emptyState');
    elements.dashboardContent = document.getElementById('dashboardContent');
    
    // Cross-links to other analytics reports (use _ru when on Russian page)
    const isRuPage = document.documentElement.lang === 'ru';
    const suffix = isRuPage ? '_ru.html' : '.html';
    const linkAnalytics = document.getElementById('linkAnalytics');
    const linkAdaptive = document.getElementById('linkAdaptive');
    if (linkAnalytics && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      linkAnalytics.href = chrome.runtime.getURL('analytics/analytics-dashboard' + suffix);
    }
    if (linkAdaptive && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      linkAdaptive.href = chrome.runtime.getURL('analytics/adaptive-analytics-dashboard' + suffix);
    }
    
    // Initialize Timeline Chart
    try {
      timelineChart = new window.TimelineChart('timelineChart', {
        padding: { top: 50, right: 30, bottom: 70, left: 70 }
      });
      console.log('✅ [Performance Dashboard] Timeline chart initialized');
    } catch (error) {
      console.error('❌ [Performance Dashboard] Failed to initialize timeline chart:', error);
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Load data
    await loadData();
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Export JSON
    const exportBtn = document.getElementById('exportJson');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportJson);
    }
    
    // Export Chart PNG
    const exportChartBtn = document.getElementById('exportChartPNG');
    if (exportChartBtn) {
      exportChartBtn.addEventListener('click', () => {
        if (timelineChart) {
          const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
          const success = timelineChart.exportToPNG(`timeline-${timestamp}.png`);
          if (success) {
            showToast('Chart exported successfully', 'success');
          } else {
            showToast('Failed to export chart', 'error');
          }
        }
      });
    }
    
    // Copy Chart to Clipboard
    const copyChartBtn = document.getElementById('copyChartClipboard');
    if (copyChartBtn) {
      copyChartBtn.addEventListener('click', async () => {
        if (timelineChart) {
          const success = await timelineChart.copyToClipboard();
          if (success) {
            showToast('Chart copied to clipboard', 'success');
          } else {
            showToast('Failed to copy chart', 'error');
          }
        }
      });
    }
    
    const exportHARBtn = document.getElementById('exportHAR');
    if (exportHARBtn) exportHARBtn.addEventListener('click', exportHAR);
    
    const exportCSVBtn = document.getElementById('exportCSV');
    if (exportCSVBtn) exportCSVBtn.addEventListener('click', exportCSV);
    
    // Configure budgets
    const configureBudgetsBtn = document.getElementById('configureBudgets');
    if (configureBudgetsBtn) {
      configureBudgetsBtn.addEventListener('click', () => {
        window.open('performance-budgets.html', '_blank', 'width=1000,height=800');
      });
    }
    
    // Save baseline
    const saveBtn = document.getElementById('saveBaseline');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveBaseline);
    }
    
    // Load baseline
    const loadBtn = document.getElementById('loadBaseline');
    if (loadBtn) {
      loadBtn.addEventListener('click', loadBaseline);
    }
    
    // Comparison controls
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
      compareBtn.addEventListener('click', loadAndCompare);
    }
    
    const clearComparisonBtn = document.getElementById('clearComparisonBtn');
    if (clearComparisonBtn) {
      clearComparisonBtn.addEventListener('click', clearComparison);
    }
    
    // Resource filtering
    const searchInput = document.getElementById('searchResources');
    if (searchInput) {
      searchInput.addEventListener('input', filterResources);
    }
    
    const filterType = document.getElementById('filterType');
    if (filterType) {
      filterType.addEventListener('change', filterResources);
    }
    
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
      sortBy.addEventListener('change', sortResources);
    }
  }

  /**
   * Load performance data from storage
   */
  async function loadData() {
    try {
      console.log('📊 [Performance Dashboard] Loading data...');
      
      // Parse URL params for testId
      const urlParams = new URLSearchParams(window.location.search);
      const testId = urlParams.get('testId') || 'latest';
      
      console.log(`   Loading data for: ${testId}`);
      
      // Request data from background
      const response = await chrome.runtime.sendMessage({
        type: 'PERFORMANCE_GET_DATA',
        testId: testId
      });
      
      if (!response.success || !response.data) {
        console.log('   No data found');
        showState('empty');
        return;
      }
      
      performanceData = response.data.data;
      if (response.usedFallback) {
        console.log('   ⚠️ Loaded latest data (may be from different test)');
        showFallbackNotice();
      }
      console.log('   Data loaded:', {
        testId: performanceData.testId,
        steps: performanceData.steps?.length || 0,
        resources: performanceData.resources?.length || 0
      });
      
      // Store all resources for filtering
      allResources = performanceData.resources || [];
      filteredResources = [...allResources];
      
      // Show data state
      showState('data');
      
      // Log data for debugging
      console.log('   Rendering sections...');
      console.log('   - Steps:', performanceData.steps?.length || 0);
      console.log('   - Web Vitals:', performanceData.webVitals);
      console.log('   - Resources:', allResources.length);
      
      // Render sections
      renderTimeline(performanceData);
      renderWebVitals(performanceData.webVitals);
      renderLongTasks(performanceData.longTasks || []);
      renderResourcesTable(filteredResources);
      updateResourcesSummary(filteredResources);
      
      // Load and populate baseline select
      await populateBaselineSelect();
      
    } catch (error) {
      console.error('❌ [Performance Dashboard] Error loading data:', error);
      showState('empty');
    }
  }

  /**
   * Show specific state
   */
  function showState(state) {
    elements.loadingState?.classList.add('hidden');
    elements.emptyState?.classList.add('hidden');
    elements.dashboardContent?.classList.add('hidden');
    
    if (state === 'loading') {
      elements.loadingState?.classList.remove('hidden');
    } else if (state === 'empty') {
      elements.emptyState?.classList.remove('hidden');
    } else if (state === 'data') {
      elements.dashboardContent?.classList.remove('hidden');
    }
  }

  /**
   * Show notice when loaded latest data as fallback (testId-specific not found)
   */
  function showFallbackNotice() {
    const content = elements.dashboardContent;
    if (!content) return;
    const existing = document.getElementById('fallbackNotice');
    if (existing) return;
    const notice = document.createElement('div');
    notice.id = 'fallbackNotice';
    notice.className = 'fallback-notice';
    notice.innerHTML = 'ℹ️ Показаны данные последнего прогона (отчёт для выбранного теста не найден)';
    notice.style.cssText = 'background:#e0f2fe;color:#0369a1;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px;';
    content.insertBefore(notice, content.firstChild);
  }

  /**
   * Export data as JSON
   */
  function exportJson() {
    if (!performanceData) {
      alert('No data to export');
      return;
    }
    
    const dataStr = JSON.stringify(performanceData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✅ [Performance Dashboard] JSON exported');
  }

  /**
   * Export as HAR
   */
  function exportHAR() {
    if (!performanceData) {
      alert('No data to export');
      return;
    }
    
    try {
      if (!window.HARExport) {
        alert('HAR export module not loaded');
        return;
      }
      
      window.HARExport.downloadHAR(performanceData);
      console.log('✅ [Performance Dashboard] HAR exported');
    } catch (error) {
      console.error('❌ [Performance Dashboard] Error exporting HAR:', error);
      alert(`Error: ${error.message}`);
    }
  }

  /**
   * Export as CSV
   */
  function exportCSV() {
    if (!performanceData) {
      alert('No data to export');
      return;
    }
    
    try {
      if (!window.CSVExport) {
        alert('CSV export module not loaded');
        return;
      }
      
      // Show selection dialog
      const type = prompt(
        'Select export type:\n' +
        '1. Steps (timing, memory, vitals)\n' +
        '2. Resources (network requests)\n' +
        '3. Long Tasks (performance issues)\n' +
        '4. Summary (overview)\n\n' +
        'Enter 1-4:',
        '1'
      );
      
      const typeMap = {
        '1': 'steps',
        '2': 'resources',
        '3': 'longtasks',
        '4': 'summary'
      };
      
      const exportType = typeMap[type] || 'steps';
      window.CSVExport.downloadCSV(performanceData, exportType);
      
      console.log(`✅ [Performance Dashboard] CSV exported (${exportType})`);
    } catch (error) {
      console.error('❌ [Performance Dashboard] Error exporting CSV:', error);
      alert(`Error: ${error.message}`);
    }
  }

  /**
   * Save current data as baseline
   */
  async function saveBaseline() {
    if (!performanceData) {
      alert('No data to save');
      return;
    }
    
    const testId = performanceData.testId || 'latest';
    if (!testId) {
      alert('Cannot save: test ID is missing');
      return;
    }
    
    try {
      const label = prompt('Enter baseline label:', `Baseline ${new Date().toLocaleString()}`);
      if (!label) return;
      
      const response = await chrome.runtime.sendMessage({
        type: 'PERFORMANCE_SAVE_BASELINE',
        testId: testId,
        data: performanceData,
        label: label
      });
      
      if (!response) {
        console.error('❌ [Performance Dashboard] No response from background (extension may have reloaded)');
        alert('Не удалось сохранить. Перезагрузите расширение и попробуйте снова.');
        return;
      }
      
      if (response.success) {
        alert(`Базовая линия сохранена! Всего: ${response.count || 0}`);
        console.log('💾 [Performance Dashboard] Baseline saved');
        await populateBaselineSelect();
      } else {
        alert(`Ошибка: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ [Performance Dashboard] Error saving baseline:', error);
      alert(`Ошибка: ${error?.message || error}`);
    }
  }

  /**
   * Load baseline for comparison
   */
  async function loadBaseline() {
    if (!performanceData) {
      alert('No current data loaded');
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PERFORMANCE_LOAD_BASELINES',
        testId: performanceData.testId
      });
      
      if (!response.success) {
        alert(`Error: ${response.error}`);
        return;
      }
      
      const baselines = response.baselines || [];
      
      if (baselines.length === 0) {
        alert('No baselines found for this test');
        return;
      }
      
      // Show selection dialog
      const options = baselines.map((b, i) => 
        `${i + 1}. ${b.label} (${new Date(b.timestamp).toLocaleString()})`
      ).join('\n');
      
      const selection = prompt(`Select baseline:\n\n${options}\n\nEnter number (1-${baselines.length}):`);
      
      if (!selection) return;
      
      const index = parseInt(selection) - 1;
      if (index < 0 || index >= baselines.length) {
        alert('Invalid selection');
        return;
      }
      
      const baseline = baselines[index];
      console.log('📂 [Performance Dashboard] Baseline loaded:', baseline.label);
      
      // TODO: Implement comparison view
      alert(`Baseline loaded: ${baseline.label}\n\nComparison view will be implemented in Phase 2`);
      
    } catch (error) {
      console.error('❌ [Performance Dashboard] Error loading baseline:', error);
      alert(`Error: ${error.message}`);
    }
  }

  /**
   * Render Web Vitals cards
   */
  function renderWebVitals(vitals) {
    if (!vitals) return;
    
    // LCP
    if (vitals.lcp) {
      const lcpValue = vitals.lcp.value / 1000; // Convert to seconds
      document.getElementById('lcp-value').textContent = `${lcpValue.toFixed(2)}s`;
      document.getElementById('lcp-rating').textContent = vitals.lcp.rating;
      document.getElementById('lcp-rating').className = `vital-rating ${vitals.lcp.rating}`;
    }
    
    // CLS
    if (vitals.cls) {
      document.getElementById('cls-value').textContent = vitals.cls.value.toFixed(3);
      document.getElementById('cls-rating').textContent = vitals.cls.rating;
      document.getElementById('cls-rating').className = `vital-rating ${vitals.cls.rating}`;
    }
    
    // INP
    if (vitals.inp) {
      const inpValue = vitals.inp.value;
      document.getElementById('inp-value').textContent = `${inpValue.toFixed(0)}ms`;
      document.getElementById('inp-rating').textContent = vitals.inp.rating;
      document.getElementById('inp-rating').className = `vital-rating ${vitals.inp.rating}`;
    }
    
    // TTFB
    if (vitals.ttfb) {
      const ttfbValue = vitals.ttfb.value;
      document.getElementById('ttfb-value').textContent = `${ttfbValue.toFixed(0)}ms`;
      document.getElementById('ttfb-rating').textContent = vitals.ttfb.rating;
      document.getElementById('ttfb-rating').className = `vital-rating ${vitals.ttfb.rating}`;
    }
  }

  /**
   * Render timeline with chart
   */
  function renderTimeline(data) {
    console.log('📊 [renderTimeline] Called with data:', {
      hasData: !!data,
      hasSteps: !!data?.steps,
      stepsLength: data?.steps?.length || 0,
      hasChart: !!timelineChart
    });
    
    if (!timelineChart) {
      console.error('❌ [renderTimeline] Timeline chart not initialized');
      return;
    }
    
    if (!data || !data.steps || data.steps.length === 0) {
      console.warn('⚠️ [renderTimeline] No steps data available');
      timelineChart.renderEmptyState();
      
      // Show message in summary
      const summary = document.getElementById('timelineSummary');
      if (summary) {
        summary.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Run a test with performance analysis to see the timeline.</p>';
      }
      return;
    }
    
    // НОВОЕ: Добавляем fallback timing для старых данных
    const processedData = {
      ...data,
      steps: data.steps.map((step, index) => {
        // Если timing уже есть - используем его
        if (step.timing && step.timing.sinceLastStep !== undefined) {
          return step;
        }
        
        // Fallback для старых данных
        const prevStep = index > 0 ? data.steps[index - 1] : null;
        const sinceLastStep = prevStep ? (step.timestamp - prevStep.timestamp) : step.timestamp;
        
        return {
          ...step,
          timing: {
            sinceLastStep: sinceLastStep,
            sinceStart: step.timestamp,
            pluginOverhead: sinceLastStep * 0.1, // Примерно 10% - plugin
            pageDelay: sinceLastStep * 0.9,      // 90% - page
            delays: {
              networkWait: 0,
              renderWait: 0,
              scriptExecution: 0,
              userInteraction: 0
            }
          }
        };
      })
    };
    
    console.log('   First processed step:', processedData.steps[0]);
    console.log('   First step timing:', processedData.steps[0].timing);
    
    // Render chart
    try {
      timelineChart.render(processedData);
      console.log('✅ [renderTimeline] Chart rendered successfully');
    } catch (error) {
      console.error('❌ [renderTimeline] Chart render error:', error);
      // Show error message
      const summary = document.getElementById('timelineSummary');
      if (summary) {
        summary.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 20px;">Error rendering chart: ${error.message}</p>`;
      }
      return;
    }
    
    // Render summary stats
    const summary = document.getElementById('timelineSummary');
    if (!summary) {
      console.warn('⚠️ [renderTimeline] Summary element not found');
      return;
    }
    
    // Calculate stats
    const totalSteps = processedData.steps.length;
    const totalPluginTime = processedData.steps.reduce((sum, s) => sum + (s.timing?.pluginOverhead || 0), 0);
    const totalPageTime = processedData.steps.reduce((sum, s) => sum + (s.timing?.pageDelay || 0), 0);
    const avgStepTime = (totalPluginTime + totalPageTime) / totalSteps;
    const slowestStep = processedData.steps.reduce((max, s) => 
      (s.timing?.sinceLastStep || 0) > (max.timing?.sinceLastStep || 0) ? s : max
    );
    
    summary.innerHTML = `
      <div class="timeline-stats">
        <div class="stat-item">
          <span class="stat-label">Total Steps:</span>
          <span class="stat-value">${totalSteps}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total Plugin Time:</span>
          <span class="stat-value" style="color: #6366f1;">${totalPluginTime.toFixed(2)}ms</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total Page Time:</span>
          <span class="stat-value" style="color: #94a3b8;">${totalPageTime.toFixed(2)}ms</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Avg Step Time:</span>
          <span class="stat-value">${avgStepTime.toFixed(2)}ms</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Slowest Step:</span>
          <span class="stat-value">#${(slowestStep.stepIndex ?? 0) + 1} (${(slowestStep.timing?.sinceLastStep || 0).toFixed(2)}ms)</span>
        </div>
      </div>
    `;
    
    console.log('✅ [renderTimeline] Summary rendered');
  }

  /**
   * Render Long Tasks section
   */
  function renderLongTasks(longTasks) {
    console.log('⚠️ [renderLongTasks] Called with', longTasks.length, 'long tasks');
    
    const section = document.getElementById('longTasksSection');
    const summary = document.getElementById('longTasksSummary');
    const list = document.getElementById('longTasksList');
    if (!section || !summary || !list) return;
    
    if (!longTasks || longTasks.length === 0) {
      section.style.display = 'none';
      console.log('   No long tasks - section hidden');
      return;
    }
    
    section.style.display = 'block';
    
    // Calculate summary stats
    const totalTasks = longTasks.length;
    const criticalTasks = longTasks.filter(t => t.duration > 100).length;
    const totalBlockingTime = longTasks.reduce((sum, t) => sum + t.duration, 0);
    const maxDuration = Math.max(...longTasks.map(t => t.duration));
    const avgDuration = totalBlockingTime / totalTasks;
    
    // Render summary
    summary.innerHTML = `
      <div class="long-task-stat">
        <div class="long-task-stat-label">Total Long Tasks</div>
        <div class="long-task-stat-value ${totalTasks > 5 ? 'warning' : 'good'}">${totalTasks}</div>
      </div>
      <div class="long-task-stat">
        <div class="long-task-stat-label">Critical (>100ms)</div>
        <div class="long-task-stat-value ${criticalTasks > 0 ? 'critical' : 'good'}">${criticalTasks}</div>
      </div>
      <div class="long-task-stat">
        <div class="long-task-stat-label">Total Blocking Time</div>
        <div class="long-task-stat-value ${totalBlockingTime > 1000 ? 'critical' : totalBlockingTime > 500 ? 'warning' : 'good'}">
          ${totalBlockingTime.toFixed(0)}ms
        </div>
      </div>
      <div class="long-task-stat">
        <div class="long-task-stat-label">Longest Task</div>
        <div class="long-task-stat-value ${maxDuration > 100 ? 'critical' : 'warning'}">
          ${maxDuration.toFixed(0)}ms
        </div>
      </div>
      <div class="long-task-stat">
        <div class="long-task-stat-label">Average Duration</div>
        <div class="long-task-stat-value">${avgDuration.toFixed(0)}ms</div>
      </div>
    `;
    
    // Render chart
    renderLongTasksChart(longTasks);
    
    // Render top 10 list
    const topTasks = [...longTasks]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    list.innerHTML = topTasks.map((task, index) => {
      const severity = task.duration > 100 ? 'critical' : 'warning';
      const icon = task.duration > 100 ? '🔴' : '🟡';
      const source = getTaskSource(task);
      const blockingTime = task.duration - 50; // Time over 50ms threshold
      
      return `
        <div class="long-task-item ${severity}">
          <div class="long-task-severity">
            <span class="long-task-severity-icon">${icon}</span>
            <span class="long-task-severity-label">${severity}</span>
          </div>
          <div class="long-task-info">
            <div class="long-task-source">${source}</div>
            <div class="long-task-step">Step ${(task.stepIndex ?? 0) + 1} • ${new Date(task.timestamp).toLocaleTimeString()}</div>
          </div>
          <div class="long-task-duration">${task.duration.toFixed(0)}ms</div>
          <div class="long-task-blocking">
            Blocked UI for<br>${blockingTime.toFixed(0)}ms
          </div>
        </div>
      `;
    }).join('');
    
    console.log('✅ [renderLongTasks] Rendered', topTasks.length, 'tasks');
  }

  /**
   * Get task source from attribution
   */
  function getTaskSource(task) {
    if (!task.attribution || task.attribution.length === 0) {
      return 'Unknown source';
    }
    
    const attr = task.attribution[0];
    
    if (attr.containerSrc) {
      // Extract filename from URL
      try {
        const url = new URL(attr.containerSrc);
        const filename = url.pathname.split('/').pop();
        return filename || attr.containerSrc;
      } catch {
        return attr.containerSrc;
      }
    }
    
    if (attr.containerName) {
      return attr.containerName;
    }
    
    if (attr.name) {
      return attr.name;
    }
    
    return 'Script execution';
  }

  /**
   * Render Long Tasks chart
   */
  function renderLongTasksChart(longTasks) {
    const canvas = document.getElementById('longTasksChart');
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (longTasks.length === 0) {
      ctx.font = '14px Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('No long tasks detected', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    // Calculate layout
    const padding = { top: 40, right: 30, bottom: 60, left: 70 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    // Group tasks by step
    const maxStep = Math.max(...longTasks.map(t => t.stepIndex || 0));
    const tasksByStep = {};
    
    for (let i = 0; i <= maxStep; i++) {
      tasksByStep[i] = longTasks.filter(t => (t.stepIndex || 0) === i);
    }
    
    // Draw grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }
    
    // Draw Y-axis labels (duration)
    const maxDuration = Math.max(...longTasks.map(t => t.duration));
    const yScale = chartHeight / maxDuration;
    
    ctx.font = '11px Arial';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 4; i++) {
      const value = maxDuration - (maxDuration / 4) * i;
      const y = padding.top + (chartHeight / 4) * i;
      ctx.fillText(`${value.toFixed(0)}ms`, padding.left - 10, y + 4);
    }
    
    // Draw bars
    const barWidth = chartWidth / (maxStep + 1);
    
    Object.keys(tasksByStep).forEach(step => {
      const tasks = tasksByStep[step];
      if (tasks.length === 0) return;
      
      const x = padding.left + parseInt(step) * barWidth;
      
      tasks.forEach((task, taskIndex) => {
        const barHeight = task.duration * yScale;
        const barX = x + (barWidth * 0.2) + (taskIndex * (barWidth * 0.6 / Math.max(tasks.length, 1)));
        const barW = barWidth * 0.6 / Math.max(tasks.length, 1);
        
        // Color based on severity
        const color = task.duration > 100 
          ? 'rgba(220, 38, 38, 0.8)'    // Critical - red
          : 'rgba(245, 158, 11, 0.8)';  // Warning - orange
        
        ctx.fillStyle = color;
        ctx.fillRect(
          barX,
          padding.top + chartHeight - barHeight,
          barW,
          barHeight
        );
      });
    });
    
    // Draw X-axis labels (steps)
    ctx.font = '11px Arial';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    
    Object.keys(tasksByStep).forEach(step => {
      const x = padding.left + parseInt(step) * barWidth + barWidth / 2;
      const y = padding.top + chartHeight + 20;
      ctx.fillText(`Step ${step}`, x, y);
      
      const tasks = tasksByStep[step];
      if (tasks.length > 0) {
        ctx.fillText(`(${tasks.length})`, x, y + 14);
      }
    });
    
    // Title
    ctx.font = '14px Arial';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText('Long Tasks Timeline by Step', padding.left, 20);
    
    // Legend
    const legendX = padding.left + chartWidth - 200;
    const legendY = 20;
    
    ctx.font = '11px Arial';
    
    // Critical
    ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = '#0f172a';
    ctx.fillText('Critical (>100ms)', legendX + 18, legendY + 2);
    
    // Warning
    ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
    ctx.fillRect(legendX + 120, legendY - 8, 12, 12);
    ctx.fillStyle = '#0f172a';
    ctx.fillText('Warning (50-100ms)', legendX + 138, legendY + 2);
  }

  /**
   * Render resources table
   */
  function renderResourcesTable(resources) {
    const tbody = document.querySelector('#resourcesTable tbody');
    tbody.innerHTML = '';
    
    if (!resources || resources.length === 0) {
      const row = tbody.insertRow();
      row.innerHTML = '<td colspan="5" style="text-align: center; color: #718096;">No resources loaded</td>';
      return;
    }
    
    resources.forEach(res => {
      const row = tbody.insertRow();
      
      // Name
      const nameCell = row.insertCell();
      nameCell.className = 'resource-name';
      nameCell.textContent = truncateUrl(res.name, 50);
      nameCell.title = res.name;
      
      // Type
      const typeCell = row.insertCell();
      const typeSpan = document.createElement('span');
      typeSpan.className = `resource-type ${res.type}`;
      typeSpan.textContent = res.type;
      typeCell.appendChild(typeSpan);
      
      // Size
      const sizeCell = row.insertCell();
      sizeCell.className = 'resource-size';
      sizeCell.textContent = formatBytes(res.size);
      
      // Duration
      const durationCell = row.insertCell();
      durationCell.className = 'resource-duration';
      durationCell.textContent = `${res.duration.toFixed(2)}ms`;
      
      // Step
      const stepCell = row.insertCell();
      stepCell.className = 'resource-step';
      stepCell.textContent = `Step ${(res.stepIndex ?? 0) + 1}`;
    });
  }

  /**
   * Update resources summary
   */
  function updateResourcesSummary(resources) {
    if (!resources) return;
    
    const totalResources = resources.length;
    const totalSize = resources.reduce((sum, r) => sum + (r.size || 0), 0);
    const avgDuration = resources.length > 0 
      ? resources.reduce((sum, r) => sum + (r.duration || 0), 0) / resources.length 
      : 0;
    
    document.getElementById('totalResources').textContent = totalResources;
    document.getElementById('totalSize').textContent = formatBytes(totalSize);
    document.getElementById('avgDuration').textContent = `${avgDuration.toFixed(2)} ms`;
  }

  /**
   * Helper: Truncate URL
   */
  function truncateUrl(url, maxLength) {
    if (!url || url.length <= maxLength) return url;
    
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      if (path.length <= maxLength - 3) {
        return '...' + path;
      }
      return '...' + path.substring(path.length - maxLength + 3);
    } catch {
      return url.substring(0, maxLength - 3) + '...';
    }
  }

  /**
   * Helper: Format bytes
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes) return '-';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Filter resources based on search and type
   */
  function filterResources() {
    const searchText = document.getElementById('searchResources').value.toLowerCase();
    const filterType = document.getElementById('filterType').value;
    
    filteredResources = allResources.filter(res => {
      // Type filter
      if (filterType !== 'all' && res.type !== filterType) {
        return false;
      }
      
      // Search filter
      if (searchText && !res.name.toLowerCase().includes(searchText)) {
        return false;
      }
      
      return true;
    });
    
    // Re-sort and render
    sortResources();
  }

  /**
   * Sort resources
   */
  function sortResources() {
    const sortBy = document.getElementById('sortBy').value;
    
    const [field, order] = sortBy.split('-');
    
    filteredResources.sort((a, b) => {
      let valueA, valueB;
      
      switch (field) {
        case 'size':
          valueA = a.size || 0;
          valueB = b.size || 0;
          break;
        case 'duration':
          valueA = a.duration || 0;
          valueB = b.duration || 0;
          break;
        case 'name':
          valueA = a.name || '';
          valueB = b.name || '';
          break;
        case 'step':
          valueA = a.stepIndex || 0;
          valueB = b.stepIndex || 0;
          break;
        default:
          return 0;
      }
      
      if (order === 'asc') {
        return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      } else {
        return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
      }
    });
    
    renderResourcesTable(filteredResources);
    updateResourcesSummary(filteredResources);
  }

  /**
   * Populate baseline select dropdown
   */
  async function populateBaselineSelect() {
    if (!performanceData) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PERFORMANCE_LOAD_BASELINES',
        testId: performanceData.testId
      });
      
      if (!response.success) return;
      
      const baselines = response.baselines || [];
      const select = document.getElementById('baselineSelect');
      const comparisonControls = document.getElementById('comparisonControls');
      if (!select) return;
      
      if (baselines.length === 0) {
        if (comparisonControls) comparisonControls.style.display = 'none';
        return;
      }
      
      if (comparisonControls) comparisonControls.style.display = 'block';
      
      // Clear existing options except first
      select.innerHTML = '<option value="">Select baseline to compare...</option>';
      
      // Add baseline options
      baselines.forEach(baseline => {
        const option = document.createElement('option');
        option.value = baseline.timestamp;
        const date = new Date(baseline.timestamp).toLocaleString();
        const label = baseline.label || `Baseline ${date}`;
        option.textContent = label;
        select.appendChild(option);
      });
      
      console.log(`📋 [Dashboard] Loaded ${baselines.length} baselines`);
    } catch (error) {
      console.error('❌ [Dashboard] Error loading baselines:', error);
    }
  }

  /**
   * Load and compare with baseline
   */
  async function loadAndCompare() {
    const select = document.getElementById('baselineSelect');
    const selectedTimestamp = select.value;
    
    if (!selectedTimestamp) {
      alert('Please select a baseline to compare');
      return;
    }
    
    try {
      // Load baselines
      const response = await chrome.runtime.sendMessage({
        type: 'PERFORMANCE_LOAD_BASELINES',
        testId: performanceData.testId
      });
      
      if (!response.success) {
        alert('Error loading baselines');
        return;
      }
      
      // Find selected baseline
      const baseline = response.baselines.find(
        b => b.timestamp.toString() === selectedTimestamp
      );
      
      if (!baseline) {
        alert('Baseline not found');
        return;
      }
      
      comparisonBaseline = baseline;
      
      console.log('📊 [Dashboard] Comparing with baseline:', baseline.label);
      
      // Render comparison
      renderComparison(performanceData, baseline);
      
      const clearBtn = document.getElementById('clearComparisonBtn');
      if (clearBtn) clearBtn.style.display = 'inline-block';
      
    } catch (error) {
      console.error('❌ [Dashboard] Error comparing:', error);
      alert(`Error: ${error.message}`);
    }
  }

  /**
   * Render comparison visualization and table
   */
  function renderComparison(current, baseline) {
    // Update timeline chart with comparison
    if (timelineChart) {
      timelineChart.renderComparison(current, baseline.data);
    }
    
    // Show and populate comparison table
    const container = document.getElementById('comparisonTableContainer');
    const tbody = document.getElementById('comparisonTableBody');
    if (!container || !tbody) return;
    
    container.style.display = 'block';
    tbody.innerHTML = '';
    
    // Calculate comparison metrics
    const metrics = calculateComparisonMetrics(current, baseline.data);
    
    // Render each metric
    metrics.forEach(metric => {
      const row = tbody.insertRow();
      
      // Metric name
      const nameCell = row.insertCell();
      nameCell.className = 'metric-name';
      nameCell.textContent = metric.name;
      
      // Current value
      const currentCell = row.insertCell();
      currentCell.textContent = formatMetricValue(metric.current, metric.unit);
      
      // Baseline value
      const baselineCell = row.insertCell();
      baselineCell.textContent = formatMetricValue(metric.baseline, metric.unit);
      
      // Difference
      const diffCell = row.insertCell();
      const diffValue = metric.current - metric.baseline;
      const isImprovement = metric.lowerIsBetter ? diffValue < 0 : diffValue > 0;
      const isRegression = metric.lowerIsBetter ? diffValue > 0 : diffValue < 0;
      
      diffCell.className = isImprovement ? 'improvement' : isRegression ? 'regression' : 'neutral';
      diffCell.textContent = (diffValue >= 0 ? '+' : '') + formatMetricValue(diffValue, metric.unit);
      
      // Change percentage
      const changeCell = row.insertCell();
      const changePercent = metric.baseline !== 0 
        ? ((diffValue / metric.baseline) * 100).toFixed(1)
        : '0.0';
      
      const badge = document.createElement('span');
      badge.className = 'diff-badge ' + (isImprovement ? 'positive' : isRegression ? 'negative' : 'neutral');
      badge.textContent = (parseFloat(changePercent) >= 0 ? '+' : '') + changePercent + '%';
      changeCell.appendChild(badge);
    });
    
    console.log('✅ [Dashboard] Comparison rendered');
  }

  /**
   * Calculate comparison metrics
   */
  function calculateComparisonMetrics(current, baseline) {
    const metrics = [];
    
    // Test duration
    if (current.duration !== undefined && baseline.duration !== undefined) {
      metrics.push({
        name: t('Total Test Duration', 'Общая длительность теста'),
        current: current.duration,
        baseline: baseline.duration,
        unit: 'ms',
        lowerIsBetter: true
      });
    }
    
    // Steps count
    if (current.steps && baseline.steps) {
      const currentSteps = current.steps.length;
      const baselineSteps = baseline.steps.length;
      
      if (currentSteps === baselineSteps) {
        // Average step time
        const currentAvg = current.steps.reduce((sum, s) => sum + (s.timing?.sinceLastStep || 0), 0) / currentSteps;
        const baselineAvg = baseline.steps.reduce((sum, s) => sum + (s.timing?.sinceLastStep || 0), 0) / baselineSteps;
        
        metrics.push({
          name: t('Average Step Time', 'Среднее время шага'),
          current: currentAvg,
          baseline: baselineAvg,
          unit: 'ms',
          lowerIsBetter: true
        });
        
        // Total plugin time
        const currentPlugin = current.steps.reduce((sum, s) => sum + (s.timing?.pluginOverhead || 0), 0);
        const baselinePlugin = baseline.steps.reduce((sum, s) => sum + (s.timing?.pluginOverhead || 0), 0);
        
        metrics.push({
          name: t('Total Plugin Overhead', 'Накладные расходы плагина'),
          current: currentPlugin,
          baseline: baselinePlugin,
          unit: 'ms',
          lowerIsBetter: true
        });
        
        // Total page time
        const currentPage = current.steps.reduce((sum, s) => sum + (s.timing?.pageDelay || 0), 0);
        const baselinePage = baseline.steps.reduce((sum, s) => sum + (s.timing?.pageDelay || 0), 0);
        
        metrics.push({
          name: t('Total Page Delay', 'Задержка страницы'),
          current: currentPage,
          baseline: baselinePage,
          unit: 'ms',
          lowerIsBetter: true
        });
      }
    }
    
    // Web Vitals
    if (current.webVitals?.lcp && baseline.webVitals?.lcp) {
      metrics.push({
        name: t('LCP (Largest Contentful Paint)', 'LCP (отрисовка основного контента)'),
        current: current.webVitals.lcp.value,
        baseline: baseline.webVitals.lcp.value,
        unit: 'ms',
        lowerIsBetter: true
      });
    }
    
    if (current.webVitals?.cls && baseline.webVitals?.cls) {
      metrics.push({
        name: t('CLS (Cumulative Layout Shift)', 'CLS (смещение макета)'),
        current: current.webVitals.cls.value,
        baseline: baseline.webVitals.cls.value,
        unit: '',
        lowerIsBetter: true
      });
    }
    
    if (current.webVitals?.inp && baseline.webVitals?.inp) {
      metrics.push({
        name: t('INP (Interaction to Next Paint)', 'INP (отклик на взаимодействие)'),
        current: current.webVitals.inp.value,
        baseline: baseline.webVitals.inp.value,
        unit: 'ms',
        lowerIsBetter: true
      });
    }
    
    if (current.webVitals?.ttfb && baseline.webVitals?.ttfb) {
      metrics.push({
        name: t('TTFB (Time to First Byte)', 'TTFB (время до первого байта)'),
        current: current.webVitals.ttfb.value,
        baseline: baseline.webVitals.ttfb.value,
        unit: 'ms',
        lowerIsBetter: true
      });
    }
    
    // Resources
    if (current.summary && baseline.summary) {
      metrics.push({
        name: t('Total Resources', 'Всего ресурсов'),
        current: current.summary.totalResources,
        baseline: baseline.summary.totalResources,
        unit: '',
        lowerIsBetter: true
      });
      
      metrics.push({
        name: t('Total Size', 'Общий размер'),
        current: current.summary.totalSize,
        baseline: baseline.summary.totalSize,
        unit: 'bytes',
        lowerIsBetter: true
      });
    }
    
    return metrics;
  }

  /**
   * Format metric value with unit
   */
  function formatMetricValue(value, unit) {
    if (value === undefined || value === null) return 'N/A';
    
    switch (unit) {
      case 'ms':
        return value.toFixed(2) + 'ms';
      case 'bytes':
        return formatBytes(value);
      case '':
        return value.toFixed(3);
      default:
        return value.toString();
    }
  }

  /**
   * Clear comparison
   */
  function clearComparison() {
    comparisonBaseline = null;
    
    const tableContainer = document.getElementById('comparisonTableContainer');
    const clearBtn = document.getElementById('clearComparisonBtn');
    const baselineSelect = document.getElementById('baselineSelect');
    if (tableContainer) tableContainer.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (baselineSelect) baselineSelect.value = '';
    
    // Re-render timeline without comparison
    if (timelineChart && performanceData) {
      renderTimeline(performanceData);
    }
    
    console.log('🔄 [Dashboard] Comparison cleared');
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
