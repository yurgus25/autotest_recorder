/**
 * CSV Export Utility
 * Exports performance data to CSV format for Excel, Google Sheets, etc.
 */

(function() {
  'use strict';

  /**
   * Export performance data to CSV
   * @param {Object} performanceData - Performance data from collector
   * @param {string} type - Type of export: 'steps', 'resources', 'longtasks', 'summary'
   * @returns {string} CSV formatted data
   */
  function exportToCSV(performanceData, type = 'steps') {
    switch (type) {
      case 'steps':
        return exportStepsCSV(performanceData);
      case 'resources':
        return exportResourcesCSV(performanceData);
      case 'longtasks':
        return exportLongTasksCSV(performanceData);
      case 'summary':
        return exportSummaryCSV(performanceData);
      default:
        throw new Error(`Unknown export type: ${type}`);
    }
  }

  /**
   * Export steps to CSV
   */
  function exportStepsCSV(performanceData) {
    const headers = [
      'Step Index',
      'Step Type',
      'Duration (ms)',
      'Plugin Overhead (ms)',
      'Page Delay (ms)',
      'LCP (ms)',
      'CLS',
      'INP (ms)',
      'Resources Count',
      'DOM Size',
      'Memory Used (MB)',
      'Timestamp'
    ];

    const rows = (performanceData.steps || []).map(step => {
      return [
        step.stepIndex,
        step.stepType,
        (step.timing?.sinceLastStep || 0).toFixed(2),
        (step.timing?.pluginOverhead || 0).toFixed(2),
        (step.timing?.pageDelay || 0).toFixed(2),
        (step.webVitals?.lcp?.value || '').toString(),
        (step.webVitals?.cls?.value || '').toString(),
        (step.webVitals?.inp?.value || '').toString(),
        step.resources || 0,
        step.dom?.size || 0,
        step.memory ? (step.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) : '',
        new Date(step.timestamp).toISOString()
      ];
    });

    return arrayToCSV([headers, ...rows]);
  }

  /**
   * Export resources to CSV
   */
  function exportResourcesCSV(performanceData) {
    const headers = [
      'Name',
      'Type',
      'Size (bytes)',
      'Duration (ms)',
      'DNS (ms)',
      'TCP (ms)',
      'Request (ms)',
      'Response (ms)',
      'Step Index',
      'Start Time (ms)'
    ];

    const rows = (performanceData.resources || []).map(resource => {
      return [
        resource.name,
        resource.type,
        resource.size || 0,
        (resource.duration || 0).toFixed(2),
        (resource.dns || 0).toFixed(2),
        (resource.tcp || 0).toFixed(2),
        (resource.request || 0).toFixed(2),
        (resource.response || 0).toFixed(2),
        resource.stepIndex || 0,
        (resource.startTime || 0).toFixed(2)
      ];
    });

    return arrayToCSV([headers, ...rows]);
  }

  /**
   * Export long tasks to CSV
   */
  function exportLongTasksCSV(performanceData) {
    const headers = [
      'Duration (ms)',
      'Step Index',
      'Source',
      'Container Type',
      'Start Time (ms)',
      'Timestamp'
    ];

    const rows = (performanceData.longTasks || []).map(task => {
      const source = task.attribution?.[0]?.containerSrc || 
                    task.attribution?.[0]?.containerName ||
                    task.attribution?.[0]?.name ||
                    'Unknown';
      
      return [
        task.duration.toFixed(2),
        task.stepIndex || 0,
        source,
        task.attribution?.[0]?.containerType || '',
        (task.startTime || 0).toFixed(2),
        new Date(task.timestamp).toISOString()
      ];
    });

    return arrayToCSV([headers, ...rows]);
  }

  /**
   * Export summary to CSV
   */
  function exportSummaryCSV(performanceData) {
    const headers = ['Metric', 'Value', 'Unit'];
    
    const rows = [
      ['Test ID', performanceData.testId, ''],
      ['Duration', performanceData.duration.toFixed(2), 'ms'],
      ['Steps Count', performanceData.steps?.length || 0, ''],
      ['Resources Count', performanceData.resources?.length || 0, ''],
      ['Total Size', formatBytes(performanceData.summary?.totalSize || 0), ''],
      ['LCP', (performanceData.webVitals?.lcp?.value || 0).toFixed(2), 'ms'],
      ['CLS', (performanceData.webVitals?.cls?.value || 0).toFixed(3), ''],
      ['INP', (performanceData.webVitals?.inp?.value || 0).toFixed(2), 'ms'],
      ['TTFB', (performanceData.webVitals?.ttfb?.value || 0).toFixed(2), 'ms'],
      ['Long Tasks', performanceData.longTasks?.length || 0, ''],
      ['Memory Leak Detected', performanceData.memory?.leak?.detected ? 'Yes' : 'No', ''],
      ['Collected At', new Date(performanceData.collectedAt).toISOString(), '']
    ];

    return arrayToCSV([headers, ...rows]);
  }

  /**
   * Convert 2D array to CSV string
   */
  function arrayToCSV(data) {
    return data.map(row => {
      return row.map(cell => {
        // Escape quotes and wrap in quotes if needed
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',');
    }).join('\n');
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

  /**
   * Download CSV file
   */
  function downloadCSV(performanceData, type = 'steps', filename) {
    const csv = exportToCSV(performanceData, type);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `performance-${type}-${performanceData.testId || Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✅ CSV file downloaded:', a.download);
    return csv;
  }

  // Export to window
  window.CSVExport = {
    exportToCSV,
    downloadCSV
  };

})();
