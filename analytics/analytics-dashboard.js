/**
 * Дашборд аналитики и метрик тестов.
 * Данные берутся из chrome.storage.local (tests, testHistory).
 * Включение/выключение — в настройках (pluginSettings.analytics.enabled).
 */

(function () {
  const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  let chartSuccess = null;
  let chartDuration = null;

  function $(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (el) el.classList.remove('hidden');
  }
  function hide(el) {
    if (el) el.classList.add('hidden');
  }

  async function loadData() {
    const data = await chrome.storage.local.get(['pluginSettings', 'tests', 'testHistory']);
    const settings = data.pluginSettings || {};
    const analyticsEnabled = settings.analytics?.enabled === true;
    const testsRaw = data.tests || {};
    const historyRaw = data.testHistory || {};

    const tests = typeof testsRaw === 'object' && !Array.isArray(testsRaw)
      ? testsRaw
      : {};
    const testHistory = typeof historyRaw === 'object' && !Array.isArray(historyRaw)
      ? historyRaw
      : {};

    return { analyticsEnabled, tests, testHistory };
  }

  function computeMetrics(tests, testHistory) {
    const runsByDay = {};
    const durationByDay = {};
    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
    const stepFailures = new Map();

    const testIds = Object.keys(testHistory);
    let totalRuns = 0;
    let successRuns = 0;
    let totalFailedSteps = 0;

    testIds.forEach(testId => {
      const runs = testHistory[testId];
      if (!Array.isArray(runs)) return;
      const testName = (tests[testId] && tests[testId].name) || testId;

      runs.forEach(run => {
        const startTime = run.startTime || run.runId || 0;
        const dateKey = new Date(startTime).toISOString().slice(0, 10);
        if (!runsByDay[dateKey]) {
          runsByDay[dateKey] = { total: 0, success: 0 };
        }
        runsByDay[dateKey].total++;
        totalRuns++;
        if (run.success) {
          runsByDay[dateKey].success++;
          successRuns++;
        }

        const duration = run.totalDuration != null ? run.totalDuration / 1000 : 0;
        if (!durationByDay[dateKey]) durationByDay[dateKey] = [];
        durationByDay[dateKey].push(duration);

        if (!run.success) {
          const d = new Date(startTime);
          heatmap[d.getDay()][d.getHours()]++;
        }

        (run.steps || []).forEach(step => {
          const key = `${testId}|${step.stepNumber}|${step.actionType || 'unknown'}`;
          if (!stepFailures.has(key)) {
            stepFailures.set(key, { testId, testName, stepNumber: step.stepNumber, actionType: step.actionType || 'unknown', failures: 0, total: 0 });
          }
          const rec = stepFailures.get(key);
          rec.total++;
          if (!step.success) {
            rec.failures++;
            totalFailedSteps++;
          }
        });
      });
    });

    const dayKeys = Object.keys(runsByDay).sort();
    const successRateByDay = dayKeys.map(day => ({
      day,
      label: formatDayLabel(day),
      total: runsByDay[day].total,
      success: runsByDay[day].success,
      rate: runsByDay[day].total ? (runsByDay[day].success / runsByDay[day].total) * 100 : 0
    }));

    const durationTrend = dayKeys.map(day => {
      const arr = durationByDay[day] || [];
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return { day, label: formatDayLabel(day), avg: Math.round(avg * 10) / 10, count: arr.length };
    });

    const stepFailuresList = Array.from(stepFailures.values())
      .filter(r => r.failures > 0)
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 50);

    return {
      totalRuns,
      successRuns,
      successRatePercent: totalRuns ? Math.round((successRuns / totalRuns) * 1000) / 10 : 0,
      totalFailedSteps,
      testsCount: Object.keys(tests).length,
      successRateByDay,
      durationTrend,
      heatmap,
      stepFailuresList,
      hasData: totalRuns > 0
    };
  }

  function formatDayLabel(isoDate) {
    const d = new Date(isoDate + 'T12:00:00');
    return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  }

  function renderCharts(metrics) {
    const ctxSuccess = document.getElementById('chartSuccessRate');
    const ctxDuration = document.getElementById('chartDuration');
    if (!ctxSuccess || !ctxDuration) return;

    if (chartSuccess) chartSuccess.destroy();
    if (chartDuration) chartDuration.destroy();

    const labels = metrics.successRateByDay.map(d => d.label);
    chartSuccess = new Chart(ctxSuccess, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Успешные',
            data: metrics.successRateByDay.map(d => d.success),
            backgroundColor: 'rgba(76, 175, 80, 0.8)'
          },
          {
            label: 'С ошибкой',
            data: metrics.successRateByDay.map(d => d.total - d.success),
            backgroundColor: 'rgba(244, 67, 54, 0.8)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });

    chartDuration = new Chart(ctxDuration, {
      type: 'line',
      data: {
        labels: metrics.durationTrend.map(d => d.label),
        datasets: [{
          label: 'Средняя длительность (с)',
          data: metrics.durationTrend.map(d => d.avg),
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          fill: true,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  function renderHeatmap(heatmap) {
    const container = $('heatmapContainer');
    if (!container) return;
    container.innerHTML = '';

    const maxVal = Math.max(1, ...heatmap.flat());
    container.style.gridTemplateColumns = '40px ' + '1fr '.repeat(24);

    const headerRow = document.createElement('div');
    headerRow.className = 'heatmap-row-label';
    headerRow.textContent = '';
    container.appendChild(headerRow);
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-col-label';
      cell.textContent = h;
      container.appendChild(cell);
    }

    for (let day = 0; day < 7; day++) {
      const label = document.createElement('div');
      label.className = 'heatmap-row-label';
      label.textContent = DAYS_RU[day];
      container.appendChild(label);
      for (let h = 0; h < 24; h++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        const v = heatmap[day][h] || 0;
        cell.textContent = v || '';
        const intensity = maxVal > 0 ? (v / maxVal) : 0;
        cell.style.background = intensity > 0
          ? `rgba(244, 67, 54, ${0.2 + intensity * 0.8})`
          : '#f5f5f5';
        container.appendChild(cell);
      }
    }
  }

  function renderStepFailures(list) {
    const tbody = $('stepFailuresTable') && $('stepFailuresTable').querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    list.forEach(r => {
      const pct = r.total ? Math.round((r.failures / r.total) * 1000) / 10 : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.testName)}</td>
        <td>${r.stepNumber}</td>
        <td>${escapeHtml(r.actionType)}</td>
        <td>${r.failures}</td>
        <td>${r.total}</td>
        <td>${pct}%</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderSummary(metrics) {
    const grid = $('summaryGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="summary-item">
        <div class="value">${metrics.totalRuns}</div>
        <div class="label">Всего прогонов</div>
      </div>
      <div class="summary-item ${metrics.successRatePercent >= 80 ? 'success' : metrics.successRatePercent >= 50 ? '' : 'danger'}">
        <div class="value">${metrics.successRatePercent}%</div>
        <div class="label">Успешность</div>
      </div>
      <div class="summary-item">
        <div class="value">${metrics.testsCount}</div>
        <div class="label">Тестов</div>
      </div>
      <div class="summary-item danger">
        <div class="value">${metrics.totalFailedSteps}</div>
        <div class="label">Падений шагов</div>
      </div>
    `;
  }

  // Используем глобальную функцию escapeHtml из shared/utils.js, с fallback для обратной совместимости
  const escapeHtml = typeof window.escapeHtml === 'function' 
    ? window.escapeHtml 
    : function(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
      };

  function exportCsv(metrics) {
    const rows = [];
    rows.push('Сводка');
    rows.push('Всего прогонов,' + metrics.totalRuns);
    rows.push('Успешность %,' + metrics.successRatePercent);
    rows.push('Тестов,' + metrics.testsCount);
    rows.push('Падений шагов,' + metrics.totalFailedSteps);
    rows.push('');
    rows.push('Проблемные шаги;Тест;Шаг;Тип;Падений;Всего;%');
    metrics.stepFailuresList.forEach(r => {
      const pct = r.total ? Math.round((r.failures / r.total) * 1000) / 10 : 0;
      rows.push([r.testName, r.stepNumber, r.actionType, r.failures, r.total, pct + '%'].join(';'));
    });
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'autotest-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function init() {
    const dashboardContent = $('dashboardContent');
    const disabledMsg = $('analyticsDisabled');
    const loadingState = $('loadingState');
    const emptyState = $('emptyState');
    const chartsSection = $('chartsSection');

    const settingsUrl = chrome.runtime.getURL('settings/settings.html#analytics-settings');
    const backBtn = $('backToSettings');
    const openSettings = $('openSettings');
    if (backBtn) backBtn.href = settingsUrl;
    if (openSettings) openSettings.href = settingsUrl;

    const { analyticsEnabled, tests, testHistory } = await loadData();

    if (!analyticsEnabled) {
      hide(dashboardContent);
      show(disabledMsg);
      return;
    }

    show(dashboardContent);
    hide(disabledMsg);
    hide(loadingState);

    const metrics = computeMetrics(tests, testHistory);

    if (!metrics.hasData) {
      show(emptyState);
      hide(chartsSection);
      const headerActions = document.querySelector('.header-actions');
      if (headerActions) headerActions.style.display = 'none';
      return;
    }

    hide(emptyState);
    show(chartsSection);
    renderSummary(metrics);
    renderCharts(metrics);
    renderHeatmap(metrics.heatmap);
    renderStepFailures(metrics.stepFailuresList);

    const exportBtn = $('exportCsv');
    const printBtn = $('printPdf');
    if (exportBtn) exportBtn.addEventListener('click', () => exportCsv(metrics));
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  }

  init();
})();
