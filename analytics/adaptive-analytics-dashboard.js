/**
 * Аналитика адаптивных шагов и шагов анализа.
 * Данные: tests, testHistory из chrome.storage.local.
 * adaptiveStatistics в runHistory, steps с type=adaptive|analysis.
 */
(function () {
  const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const isRu = document.documentElement.lang === 'ru' || document.querySelector('html')?.lang === 'ru';
  const t = (en, ru) => (isRu ? ru : en);

  let chartAdaptive = null;

  function $(id) {
    return typeof id === 'string' ? document.getElementById(id) : id;
  }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  async function loadData() {
    const data = await chrome.storage.local.get(['pluginSettings', 'tests', 'testHistory']);
    const settings = data.pluginSettings || {};
    const analyticsEnabled = settings.analytics?.enabled === true;
    const tests = typeof data.tests === 'object' && !Array.isArray(data.tests) ? data.tests : {};
    const testHistory = typeof data.testHistory === 'object' && !Array.isArray(data.testHistory) ? data.testHistory : {};
    return { analyticsEnabled, tests, testHistory };
  }

  function computeAdaptiveAndAnalysisMetrics(tests, testHistory) {
    const adaptiveByKey = new Map(); // key: testId|stepIdx|subtype
    const analysisByKey = new Map(); // key: testId|stepIdx|subtype
    let totalAdaptiveRuns = 0;
    let totalAnalysisRuns = 0;
    let totalAnalysisSuccess = 0;
    const adaptiveRunsByDay = {};

    Object.keys(testHistory).forEach(testId => {
      const test = tests[testId] || {};
      const actions = test.actions || [];
      const runs = testHistory[testId];
      if (!Array.isArray(runs)) return;
      const testName = test.name || testId;

      runs.forEach(run => {
        const steps = run.steps || [];
        const adaptiveStats = run.adaptiveStatistics || {};
        const dateKey = run.startTime ? new Date(run.startTime).toISOString().slice(0, 10) : '';

        steps.forEach((step, stepIdx) => {
          const stepType = (step.type || step.actionType || '').trim();
          const actionIdx = step.actionIndex != null ? step.actionIndex : stepIdx;
          const action = actions[actionIdx] || actions[stepIdx] || {};
          const subtype = (action.subtype || step.subtype || stepType || '').trim() || stepType;
          const isAnalysis = stepType === 'analysis' ||
            (typeof stepType === 'string' && stepType.toLowerCase().includes('analysis')) ||
            (typeof (step.subtype || '') === 'string' && String(step.subtype).startsWith('analysis-'));

          if (stepType === 'adaptive') {
            totalAdaptiveRuns++;
            const stats = adaptiveStats[String(actionIdx)] || adaptiveStats[String(stepIdx)] || {};
            const key = `${testId}|${actionIdx}|${subtype}`;
            if (!adaptiveByKey.has(key)) {
              adaptiveByKey.set(key, {
                testId,
                testName,
                stepIdx: actionIdx + 1,
                subtype: subtype || 'adaptive',
                runs: 0,
                iterations: [],
                actionsInvoked: [],
                fieldsFilled: 0,
                errors: 0
              });
            }
            const rec = adaptiveByKey.get(key);
            rec.runs++;
            if (stats.iterations != null) rec.iterations.push(stats.iterations);
            if (stats.actionsInvoked != null) rec.actionsInvoked.push(stats.actionsInvoked);
            if (stats.fieldsFilled != null) rec.fieldsFilled += stats.fieldsFilled;
            if (Array.isArray(stats.errors)) rec.errors += stats.errors.length;

            if (dateKey) {
              if (!adaptiveRunsByDay[dateKey]) adaptiveRunsByDay[dateKey] = { count: 0, iterations: [], actions: [] };
              adaptiveRunsByDay[dateKey].count++;
              if (stats.iterations != null) adaptiveRunsByDay[dateKey].iterations.push(stats.iterations);
              if (stats.actionsInvoked != null) adaptiveRunsByDay[dateKey].actions.push(stats.actionsInvoked);
            }
          } else if (isAnalysis) {
            totalAnalysisRuns++;
            if (step.success !== false) totalAnalysisSuccess++;
            const key = `${testId}|${actionIdx}|${subtype}`;
            if (!analysisByKey.has(key)) {
              analysisByKey.set(key, { testId, testName, stepIdx: actionIdx + 1, subtype: subtype || 'analysis', success: 0, total: 0 });
            }
            const rec = analysisByKey.get(key);
            rec.total++;
            if (step.success !== false) rec.success++;
          }
          // Подшаги adaptive (analysis-selectors, analysis-fill-fields) — из step.subSteps
          if (stepType === 'adaptive' && Array.isArray(step.subSteps) && step.subSteps.length > 0) {
            step.subSteps.forEach((sub) => {
              const subType = (sub.subtype || sub.type || '').trim();
              if (!subType || !subType.startsWith('analysis-')) return;
              totalAnalysisRuns++;
              if (sub.success !== false) totalAnalysisSuccess++;
              const key = `${testId}|${sub.actionIndex != null ? sub.actionIndex : actionIdx}|${subType}`;
              if (!analysisByKey.has(key)) {
                analysisByKey.set(key, { testId, testName, stepIdx: (sub.actionIndex != null ? sub.actionIndex : actionIdx) + 1, subtype: subType, success: 0, total: 0 });
              }
              const rec = analysisByKey.get(key);
              rec.total++;
              if (sub.success !== false) rec.success++;
            });
          }
          // Анализ внутри adaptive (fallback): когда adaptive заполнял поля, но subSteps нет (старые прогоны)
          if (stepType === 'adaptive') {
            const stats = adaptiveStats[String(actionIdx)] || adaptiveStats[String(stepIdx)] || {};
            const fieldsFilled = stats.fieldsFilled || 0;
            if (fieldsFilled > 0 && (!step.subSteps || step.subSteps.length === 0)) {
              totalAnalysisRuns++;
              if (step.success !== false) totalAnalysisSuccess++;
              const key = `${testId}|adaptive-fill|${actionIdx}`;
              if (!analysisByKey.has(key)) {
                analysisByKey.set(key, { testId, testName, stepIdx: actionIdx + 1, subtype: 'analysis-fill-fields (из adaptive)', success: 0, total: 0 });
              }
              const rec = analysisByKey.get(key);
              rec.total++;
              if (step.success !== false) rec.success++;
            }
          }
        });
      });
    });

    const adaptiveList = Array.from(adaptiveByKey.values()).sort((a, b) => {
      const cmp = (a.testName || '').localeCompare(b.testName || '');
      return cmp !== 0 ? cmp : a.stepIdx - b.stepIdx;
    });

    const analysisList = Array.from(analysisByKey.values())
      .filter(r => r.total > 0)
      .sort((a, b) => {
        const cmp = (a.testName || '').localeCompare(b.testName || '');
        return cmp !== 0 ? cmp : a.stepIdx - b.stepIdx;
      });

    const dayKeys = Object.keys(adaptiveRunsByDay).sort();
    const chartData = dayKeys.map(day => {
      const d = adaptiveRunsByDay[day];
      const avgIter = d.iterations?.length ? d.iterations.reduce((a, b) => a + b, 0) / d.iterations.length : 0;
      const avgAct = d.actions?.length ? d.actions.reduce((a, b) => a + b, 0) / d.actions.length : 0;
      const date = new Date(day + 'T12:00:00');
      const label = `${date.getDate()} ${MONTHS_RU[date.getMonth()]}`;
      return { day, label, count: d.count, avgIter, avgAct };
    });

    return {
      totalAdaptiveRuns,
      totalAnalysisRuns,
      totalAnalysisSuccess,
      analysisRatePercent: totalAnalysisRuns ? Math.round((totalAnalysisSuccess / totalAnalysisRuns) * 1000) / 10 : 0,
      adaptiveList,
      analysisList,
      chartData,
      hasData: totalAdaptiveRuns > 0 || totalAnalysisRuns > 0
    };
  }

  function renderSummary(metrics) {
    const grid = $('summaryGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="summary-item adaptive">
        <div class="value">${metrics.totalAdaptiveRuns}</div>
        <div class="label">${t('Adaptive runs', 'Прогонов адаптивных')}</div>
      </div>
      <div class="summary-item analysis">
        <div class="value">${metrics.totalAnalysisRuns}</div>
        <div class="label">${t('Analysis runs', 'Прогонов анализа')}</div>
      </div>
      <div class="summary-item ${metrics.analysisRatePercent >= 80 ? 'success' : metrics.analysisRatePercent >= 50 ? '' : 'danger'}">
        <div class="value">${metrics.analysisRatePercent}%</div>
        <div class="label">${t('Analysis success', 'Успешность анализа')}</div>
      </div>
    `;
  }

  function renderAdaptiveTable(list) {
    const tbody = $('adaptiveTable')?.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    list.forEach(r => {
      const avgIter = r.iterations?.length ? (r.iterations.reduce((a, b) => a + b, 0) / r.iterations.length).toFixed(1) : '-';
      const avgAct = r.actionsInvoked?.length ? (r.actionsInvoked.reduce((a, b) => a + b, 0) / r.actionsInvoked.length).toFixed(1) : '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.testName)}</td>
        <td>${r.stepIdx}</td>
        <td>${escapeHtml(r.subtype)}</td>
        <td>${r.runs}</td>
        <td>${avgIter}</td>
        <td>${avgAct}</td>
        <td>${r.fieldsFilled ?? '-'}</td>
        <td>${r.errors ?? 0}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderAnalysisTable(list) {
    const tbody = $('analysisTable')?.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    list.forEach(r => {
      const pct = r.total ? Math.round((r.success / r.total) * 1000) / 10 : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.testName)}</td>
        <td>${r.stepIdx}</td>
        <td>${escapeHtml(r.subtype)}</td>
        <td>${r.success}</td>
        <td>${r.total}</td>
        <td>${pct}%</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderChart(data) {
    const ctx = $('chartAdaptive');
    if (!ctx) return;
    if (chartAdaptive) chartAdaptive.destroy();

    if (!data || data.length === 0) {
      ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
      return;
    }

    chartAdaptive = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [
          {
            label: t('Avg iterations', 'Ср. итераций'),
            data: data.map(d => d.avgIter),
            backgroundColor: 'rgba(124, 77, 255, 0.7)'
          },
          {
            label: t('Avg actions', 'Ср. действий'),
            data: data.map(d => d.avgAct),
            backgroundColor: 'rgba(0, 188, 212, 0.7)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function exportCsv(metrics) {
    const rows = [];
    rows.push('Adaptive Steps');
    rows.push('Test;Step;Subtype;Runs;Avg Iterations;Avg Actions;Fields;Errors');
    metrics.adaptiveList.forEach(r => {
      const avgIter = r.iterations?.length ? (r.iterations.reduce((a, b) => a + b, 0) / r.iterations.length).toFixed(1) : '-';
      const avgAct = r.actionsInvoked?.length ? (r.actionsInvoked.reduce((a, b) => a + b, 0) / r.actionsInvoked.length).toFixed(1) : '-';
      rows.push([r.testName, r.stepIdx, r.subtype, r.runs, avgIter, avgAct, r.fieldsFilled ?? '', r.errors ?? 0].join(';'));
    });
    rows.push('');
    rows.push('Analysis Steps');
    rows.push('Test;Step;Type;Success;Total;%');
    metrics.analysisList.forEach(r => {
      const pct = r.total ? Math.round((r.success / r.total) * 1000) / 10 : 0;
      rows.push([r.testName, r.stepIdx, r.subtype, r.success, r.total, pct + '%'].join(';'));
    });
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'autotest-adaptive-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
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
    const isRu = document.documentElement.lang === 'ru';
    const suffix = isRu ? '_ru.html' : '.html';
    const mainUrl = chrome.runtime.getURL('analytics/analytics-dashboard' + suffix);
    const perfUrl = chrome.runtime.getURL('performance/performance-dashboard' + suffix);

    const backBtn = $('backToSettings');
    const openSettings = $('openSettings');
    const linkMain = $('linkMainAnalytics');
    const linkPerf = $('linkPerformance');
    if (backBtn) backBtn.href = settingsUrl;
    if (openSettings) openSettings.href = settingsUrl;
    if (linkMain) { linkMain.href = mainUrl; linkMain.target = '_blank'; linkMain.rel = 'noopener'; }
    if (linkPerf) { linkPerf.href = perfUrl; linkPerf.target = '_blank'; linkPerf.rel = 'noopener'; }

    const { analyticsEnabled, tests, testHistory } = await loadData();

    if (!analyticsEnabled) {
      hide(dashboardContent);
      show(disabledMsg);
      return;
    }

    show(dashboardContent);
    hide(disabledMsg);
    hide(loadingState);

    const metrics = computeAdaptiveAndAnalysisMetrics(tests, testHistory);

    if (!metrics.hasData) {
      show(emptyState);
      hide(chartsSection);
      return;
    }

    hide(emptyState);
    show(chartsSection);
    renderSummary(metrics);
    renderAdaptiveTable(metrics.adaptiveList);
    renderAnalysisTable(metrics.analysisList);
    renderChart(metrics.chartData);

    const exportBtn = $('exportCsv');
    if (exportBtn) exportBtn.addEventListener('click', () => exportCsv(metrics));
  }

  init();
})();
