/**
 * HAR (HTTP Archive) Export Utility
 * Exports performance data to HAR format for use with DevTools, WebPageTest, etc.
 */

(function() {
  'use strict';

  /**
   * Export performance data to HAR format
   * @param {Object} performanceData - Performance data from collector
   * @returns {Object} HAR formatted data
   */
  function exportToHAR(performanceData) {
    const startTime = new Date(performanceData.collectedAt - performanceData.duration);
    
    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'AutoTest Recorder',
          version: '0.9.4.7',
          comment: 'Performance Analytics HAR Export'
        },
        browser: {
          name: navigator.userAgent.split('/')[0],
          version: navigator.userAgent.split('/')[1]?.split(' ')[0] || 'unknown'
        },
        pages: [{
          startedDateTime: startTime.toISOString(),
          id: `page_${performanceData.testId}`,
          title: performanceData.testId || 'Performance Test',
          pageTimings: {
            onContentLoad: performanceData.navigation?.domContentLoaded || -1,
            onLoad: performanceData.navigation?.loadTime || -1,
            comment: `Duration: ${performanceData.duration}ms`
          }
        }],
        entries: []
      }
    };

    // Add resources as entries
    if (performanceData.resources && performanceData.resources.length > 0) {
      har.log.entries = performanceData.resources.map((resource, index) => {
        const entryStartTime = new Date(startTime.getTime() + resource.startTime);
        
        return {
          pageref: `page_${performanceData.testId}`,
          startedDateTime: entryStartTime.toISOString(),
          time: resource.duration || 0,
          request: {
            method: 'GET',
            url: resource.name,
            httpVersion: 'HTTP/1.1',
            headers: [],
            queryString: extractQueryString(resource.name),
            cookies: [],
            headersSize: -1,
            bodySize: -1
          },
          response: {
            status: 200,
            statusText: 'OK',
            httpVersion: 'HTTP/1.1',
            headers: [],
            cookies: [],
            content: {
              size: resource.size || resource.encodedSize || 0,
              compression: resource.encodedSize && resource.decodedSize 
                ? resource.decodedSize - resource.encodedSize 
                : 0,
              mimeType: getMimeType(resource.type, resource.name),
              text: ''
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: resource.size || resource.encodedSize || 0,
            _transferSize: resource.size || 0
          },
          cache: {},
          timings: {
            blocked: 0,
            dns: resource.dns || -1,
            connect: resource.tcp || -1,
            send: 0,
            wait: resource.request || -1,
            receive: resource.response || -1,
            ssl: resource.ssl || -1
          },
          _initiatorType: resource.type,
          _priority: 'High',
          _resourceType: resource.type
        };
      });
    }

    // Add custom metadata
    har.log._customData = {
      webVitals: performanceData.webVitals,
      longTasks: performanceData.longTasks?.length || 0,
      steps: performanceData.steps?.length || 0,
      memoryLeak: performanceData.memory?.leak?.detected || false
    };

    return har;
  }

  /**
   * Extract query string from URL
   */
  function extractQueryString(url) {
    try {
      const urlObj = new URL(url);
      const params = [];
      urlObj.searchParams.forEach((value, name) => {
        params.push({ name, value });
      });
      return params;
    } catch {
      return [];
    }
  }

  /**
   * Get MIME type from resource type and URL
   */
  function getMimeType(type, url) {
    const typeMap = {
      'script': 'application/javascript',
      'stylesheet': 'text/css',
      'img': 'image/*',
      'fetch': 'application/json',
      'xmlhttprequest': 'application/json',
      'font': 'font/*',
      'document': 'text/html'
    };

    if (typeMap[type]) {
      return typeMap[type];
    }

    // Try to infer from URL extension
    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    const extMap = {
      'js': 'application/javascript',
      'css': 'text/css',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf',
      'json': 'application/json',
      'xml': 'application/xml'
    };

    return extMap[ext] || 'application/octet-stream';
  }

  /**
   * Download HAR file
   */
  function downloadHAR(performanceData, filename) {
    const har = exportToHAR(performanceData);
    const harString = JSON.stringify(har, null, 2);
    const blob = new Blob([harString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `performance-${performanceData.testId || Date.now()}.har`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✅ HAR file downloaded:', a.download);
    return har;
  }

  // Export to window
  window.HARExport = {
    exportToHAR,
    downloadHAR
  };

})();
