/**
 * Performance Collector Module
 * Собирает Web Vitals и Resource Timing для всего теста
 * @version 1.0.0 (MVP)
 */

(function() {
  'use strict';

  /**
   * Performance Collector Class
   */
  class PerformanceCollector {
    constructor() {
      this.isMonitoring = false;
      this.currentTestId = null;
      this.currentStepIndex = 0;
      this.config = null;
      
      this.collectedData = {
        testId: null,
        startTime: 0,
        endTime: 0,
        webVitals: {
          lcp: null,
          cls: null,
          inp: null,
          ttfb: null
        },
        steps: [],
        longTasks: [],        // Long Tasks (>50ms)
        memory: {             // НОВОЕ: Memory snapshots
          snapshots: [],
          leak: null
        },
        resources: [],
        navigation: null
      };

      // Observers
      this.resourceObserver = null;
      this.navigationObserver = null;
      this.longTasksObserver = null;  // НОВОЕ: Long Tasks observer
      
      // Web Vitals handlers (will be set up later)
      this.webVitalsHandlers = null;
      
      console.log('✨ [PerformanceCollector] Initialized');
    }

    /**
     * Start monitoring
     * @param {string} testId - Test ID
     * @param {Object} config - Configuration
     */
    startMonitoring(testId, config = {}) {
      if (this.isMonitoring) {
        console.warn('⚠️ [PerformanceCollector] Already monitoring');
        return;
      }

      console.log(`🚀 [PerformanceCollector] Starting monitoring for test: ${testId}`);
      
      this.isMonitoring = true;
      this.currentTestId = testId;
      this.currentStepIndex = 0;
      this.config = {
        webVitals: true,
        resourceTiming: true,
        navigationTiming: true,
        ...config
      };

      // Reset collected data
      this.collectedData = {
        testId: testId,
        startTime: performance.now(),
        endTime: 0,
        webVitals: {
          lcp: null,
          cls: null,
          inp: null,
          ttfb: null
        },
        steps: [],
        longTasks: [],
        memory: { snapshots: [], leak: null },
        resources: [],
        navigation: null
      };

      // Start observers
      if (this.config.webVitals) {
        this.startWebVitalsObserver();
      }
      
      if (this.config.resourceTiming) {
        this.startResourceObserver();
      }
      
      if (this.config.navigationTiming) {
        this.collectNavigationTiming();
      }
      
      // НОВОЕ: Long Tasks observer (всегда включён)
      this.startLongTasksObserver();

      console.log('✅ [PerformanceCollector] Monitoring started');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
      if (!this.isMonitoring) {
        console.warn('⚠️ [PerformanceCollector] Not monitoring');
        return;
      }

      console.log('🛑 [PerformanceCollector] Stopping monitoring');
      
      this.isMonitoring = false;
      this.collectedData.endTime = performance.now();

      // Disconnect observers
      if (this.resourceObserver) {
        this.resourceObserver.disconnect();
        this.resourceObserver = null;
      }
      
      if (this.longTasksObserver) {
        this.longTasksObserver.disconnect();
        this.longTasksObserver = null;
      }

      // Note: Web Vitals observers cannot be disconnected (by design)
      // They continue to update values, but we won't use them after stop

      console.log('✅ [PerformanceCollector] Monitoring stopped');
    }

    /**
     * Mark step boundary
     * @param {number} stepIndex - Step index
     * @param {string} stepType - Step type (action type)
     * @param {Object} metadata - Additional timing metadata from player
     */
    markStep(stepIndex, stepType, metadata = {}) {
      if (!this.isMonitoring) return; // Тихо игнорируем, если мониторинг не запущен

      const markName = `step-${stepIndex}-${stepType}`;
      performance.mark(markName);
      
      const now = performance.now();
      const prevStep = this.collectedData.steps[this.collectedData.steps.length - 1];
      
      this.currentStepIndex = stepIndex;

      // Calculate timing breakdown
      const sinceLastStep = prevStep ? (now - prevStep.timestamp) : 0;
      const pluginOverhead = metadata.executionTime || 0;
      const pageDelay = Math.max(0, sinceLastStep - pluginOverhead);

      // Snapshot current metrics at this step
      const snapshot = {
        stepIndex: stepIndex,
        stepType: stepType,
        timestamp: now,
        
        // НОВОЕ: Детальный timing breakdown
        timing: {
          // Время от предыдущего шага (total)
          sinceLastStep: sinceLastStep,
          
          // Время от начала теста
          sinceStart: now - this.collectedData.startTime,
          
          // Plugin overhead (время выполнения самого плагина)
          pluginOverhead: pluginOverhead,
          
          // Page delay (время ожидания страницы)
          pageDelay: pageDelay,
          
          // Breakdown по типам задержек (из metadata)
          delays: {
            networkWait: metadata.networkWait || 0,
            renderWait: metadata.renderWait || 0,
            scriptExecution: metadata.scriptExecution || 0,
            userInteraction: metadata.userInteraction || 0
          }
        },
        
        // НОВОЕ: Memory snapshot
        memory: this.getMemorySnapshot(),
        
        webVitals: this.getWebVitalsSnapshot(),
        dom: this.getDOMSnapshot(),
        resources: this.getResourcesSinceLastStep()
      };

      this.collectedData.steps.push(snapshot);
      
      console.log(`📍 [PerformanceCollector] Marked step ${stepIndex}: ${stepType} (${sinceLastStep.toFixed(2)}ms total, ${pluginOverhead.toFixed(2)}ms plugin, ${pageDelay.toFixed(2)}ms page)`);
    }

    /**
     * Get Web Vitals snapshot at current moment
     */
    getWebVitalsSnapshot() {
      return {
        lcp: this.collectedData.webVitals.lcp ? { ...this.collectedData.webVitals.lcp } : null,
        cls: this.collectedData.webVitals.cls ? { ...this.collectedData.webVitals.cls } : null,
        inp: this.collectedData.webVitals.inp ? { ...this.collectedData.webVitals.inp } : null,
        ttfb: this.collectedData.webVitals.ttfb ? { ...this.collectedData.webVitals.ttfb } : null
      };
    }

    /**
     * Get DOM snapshot
     */
    getDOMSnapshot() {
      return {
        size: document.querySelectorAll('*').length,
        depth: this.calculateDOMDepth(),
        scripts: document.querySelectorAll('script').length,
        styles: document.querySelectorAll('link[rel="stylesheet"], style').length,
        images: document.querySelectorAll('img').length
      };
    }

    /**
     * Get Memory snapshot
     */
    getMemorySnapshot() {
      if (!performance.memory) {
        return null;
      }
      
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        heapUsagePercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
      };
    }

    /**
     * Calculate DOM depth
     */
    calculateDOMDepth(element = document.body) {
      if (!element || !element.children || element.children.length === 0) {
        return 1;
      }
      
      let maxDepth = 0;
      for (let child of element.children) {
        const depth = this.calculateDOMDepth(child);
        maxDepth = Math.max(maxDepth, depth);
      }
      
      return maxDepth + 1;
    }

    /**
     * Get resources loaded since last step
     */
    getResourcesSinceLastStep() {
      const lastStepTimestamp = this.collectedData.steps.length > 0
        ? this.collectedData.steps[this.collectedData.steps.length - 1].timestamp
        : this.collectedData.startTime;

      return this.collectedData.resources.filter(
        res => res.timestamp >= lastStepTimestamp
      ).length;
    }

    /**
     * Start Web Vitals Observer
     * Uses web-vitals library patterns (simplified for MVP)
     */
    startWebVitalsObserver() {
      console.log('👁️ [PerformanceCollector] Starting Web Vitals observer');

      // LCP - Largest Contentful Paint
      this.observeLCP();

      // CLS - Cumulative Layout Shift
      this.observeCLS();

      // INP - Interaction to Next Paint
      this.observeINP();

      // TTFB - Time to First Byte
      this.observeTTFB();
    }

    /**
     * Observe LCP (Largest Contentful Paint)
     */
    observeLCP() {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          
          const lcpValue = lastEntry.renderTime || lastEntry.loadTime;
          const rating = lcpValue <= 2500 ? 'good' : lcpValue <= 4000 ? 'needs-improvement' : 'poor';

          this.collectedData.webVitals.lcp = {
            value: lcpValue,
            rating: rating,
            timestamp: performance.now(),
            element: lastEntry.element ? lastEntry.element.tagName : null
          };

          console.log(`📊 [PerformanceCollector] LCP: ${lcpValue.toFixed(2)}ms (${rating})`);
        });

        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (error) {
        console.warn('⚠️ [PerformanceCollector] LCP not supported:', error);
      }
    }

    /**
     * Observe CLS (Cumulative Layout Shift)
     */
    observeCLS() {
      try {
        let clsValue = 0;

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }

          const rating = clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor';

          this.collectedData.webVitals.cls = {
            value: clsValue,
            rating: rating,
            timestamp: performance.now()
          };

          console.log(`📊 [PerformanceCollector] CLS: ${clsValue.toFixed(3)} (${rating})`);
        });

        observer.observe({ type: 'layout-shift', buffered: true });
      } catch (error) {
        console.warn('⚠️ [PerformanceCollector] CLS not supported:', error);
      }
    }

    /**
     * Observe INP (Interaction to Next Paint)
     * Simplified implementation - tracks event timing
     */
    observeINP() {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          
          let maxDuration = 0;
          for (const entry of entries) {
            if (entry.duration > maxDuration) {
              maxDuration = entry.duration;
            }
          }

          if (maxDuration > 0) {
            const rating = maxDuration <= 200 ? 'good' : maxDuration <= 500 ? 'needs-improvement' : 'poor';

            this.collectedData.webVitals.inp = {
              value: maxDuration,
              rating: rating,
              timestamp: performance.now()
            };

            console.log(`📊 [PerformanceCollector] INP: ${maxDuration.toFixed(2)}ms (${rating})`);
          }
        });

        observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      } catch (error) {
        // Fallback to 'first-input' for older browsers
        try {
          const observer = new PerformanceObserver((list) => {
            const firstInput = list.getEntries()[0];
            if (firstInput) {
              const value = firstInput.processingStart - firstInput.startTime;
              const rating = value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';

              this.collectedData.webVitals.inp = {
                value: value,
                rating: rating,
                timestamp: performance.now(),
                fallback: 'first-input'
              };

              console.log(`📊 [PerformanceCollector] INP (FID fallback): ${value.toFixed(2)}ms (${rating})`);
            }
          });

          observer.observe({ type: 'first-input', buffered: true });
        } catch (fallbackError) {
          console.warn('⚠️ [PerformanceCollector] INP not supported:', error, fallbackError);
        }
      }
    }

    /**
     * Observe TTFB (Time to First Byte)
     */
    observeTTFB() {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const navigation = entries[0];

          if (navigation && navigation.responseStart) {
            const ttfbValue = navigation.responseStart;
            const rating = ttfbValue <= 800 ? 'good' : ttfbValue <= 1800 ? 'needs-improvement' : 'poor';

            this.collectedData.webVitals.ttfb = {
              value: ttfbValue,
              rating: rating,
              timestamp: performance.now()
            };

            console.log(`📊 [PerformanceCollector] TTFB: ${ttfbValue.toFixed(2)}ms (${rating})`);
          }
        });

        observer.observe({ type: 'navigation', buffered: true });
      } catch (error) {
        console.warn('⚠️ [PerformanceCollector] TTFB not supported:', error);
      }
    }

    /**
     * Start Resource Observer
     */
    startResourceObserver() {
      console.log('📦 [PerformanceCollector] Starting Resource observer');

      try {
        this.resourceObserver = new PerformanceObserver((list) => {
          if (!this.collectedData.resources) this.collectedData.resources = [];
          for (const entry of list.getEntries()) {
            this.collectedData.resources.push({
              name: entry.name,
              type: entry.initiatorType,
              size: entry.transferSize || 0,
              encodedSize: entry.encodedBodySize || 0,
              decodedSize: entry.decodedBodySize || 0,
              duration: entry.duration,
              startTime: entry.startTime,
              timestamp: performance.now(),
              stepIndex: this.currentStepIndex,
              // Detailed timing
              dns: entry.domainLookupEnd - entry.domainLookupStart,
              tcp: entry.connectEnd - entry.connectStart,
              request: entry.responseStart - entry.requestStart,
              response: entry.responseEnd - entry.responseStart
            });
          }
        });

        this.resourceObserver.observe({ type: 'resource', buffered: true });
      } catch (error) {
        console.warn('⚠️ [PerformanceCollector] Resource observer not supported:', error);
      }
    }

    /**
     * Start Long Tasks Observer
     * Tracks tasks >50ms that block main thread
     */
    startLongTasksObserver() {
      console.log('⏱️ [PerformanceCollector] Starting Long Tasks observer');

      if (!('PerformanceObserver' in window)) {
        console.warn('⚠️ [PerformanceCollector] PerformanceObserver not supported');
        return;
      }

      try {
        this.longTasksObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // Long task detected (>50ms)
            const taskData = {
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              timestamp: performance.now(),
              stepIndex: this.currentStepIndex,
              attribution: []
            };

            // Get attribution data (which script caused the long task)
            if (entry.attribution && entry.attribution.length > 0) {
              taskData.attribution = entry.attribution.map(attr => ({
                name: attr.name,
                entryType: attr.entryType,
                startTime: attr.startTime,
                duration: attr.duration,
                containerType: attr.containerType,
                containerSrc: attr.containerSrc,
                containerId: attr.containerId,
                containerName: attr.containerName
              }));
            }

            if (!this.collectedData.longTasks) this.collectedData.longTasks = [];
            this.collectedData.longTasks.push(taskData);
            
            console.log(`⚠️ [PerformanceCollector] Long Task detected: ${entry.duration.toFixed(2)}ms at step ${this.currentStepIndex}`);
          }
        });

        this.longTasksObserver.observe({ 
          type: 'longtask', 
          buffered: true 
        });
        
        console.log('✅ [PerformanceCollector] Long Tasks observer started');
      } catch (error) {
        // Long Tasks API not supported in all browsers
        console.warn('⚠️ [PerformanceCollector] Long Tasks API not supported:', error);
      }
    }

    /**
     * Collect Navigation Timing
     */
    collectNavigationTiming() {
      console.log('🧭 [PerformanceCollector] Collecting Navigation timing');

      try {
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries && navEntries.length > 0) {
          const nav = navEntries[0];

          this.collectedData.navigation = {
            // DNS
            dnsTime: nav.domainLookupEnd - nav.domainLookupStart,
            
            // TCP
            tcpTime: nav.connectEnd - nav.connectStart,
            
            // TLS
            tlsTime: nav.secureConnectionStart > 0 
              ? nav.connectEnd - nav.secureConnectionStart 
              : 0,
            
            // Request/Response
            requestTime: nav.responseStart - nav.requestStart,
            responseTime: nav.responseEnd - nav.responseStart,
            
            // DOM Processing
            domInteractive: nav.domInteractive,
            domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
            domComplete: nav.domComplete,
            
            // Load
            loadTime: nav.loadEventEnd - nav.loadEventStart,
            
            // Total
            totalTime: nav.loadEventEnd - nav.fetchStart,
            
            // Type
            type: nav.type,
            redirectCount: nav.redirectCount
          };

          console.log('✅ [PerformanceCollector] Navigation timing collected');
        }
      } catch (error) {
        console.warn('⚠️ [PerformanceCollector] Navigation timing error:', error);
      }
    }

    /**
     * Collect all data
     * @returns {Object} All collected performance data
     */
    collectData() {
      console.log('📤 [PerformanceCollector] Collecting all data');
      
      // Detect memory leak
      const memoryLeak = this.detectMemoryLeak();
      if (memoryLeak && this.collectedData.memory) {
        this.collectedData.memory.leak = memoryLeak;
      }
      
      // Final snapshot
      const finalData = {
        ...this.collectedData,
        collectedAt: Date.now(),
        duration: this.collectedData.endTime - this.collectedData.startTime,
        summary: this.generateSummary()
      };

      console.log('✅ [PerformanceCollector] Data collected:', {
        testId: finalData.testId,
        steps: finalData.steps.length,
        resources: finalData.resources.length,
        webVitals: Object.keys(finalData.webVitals).filter(k => finalData.webVitals[k]).length,
        memoryLeak: !!memoryLeak
      });

      return finalData;
    }

    /**
     * Detect memory leak
     */
    detectMemoryLeak() {
      if (!performance.memory) {
        return null;
      }
      
      const steps = this.collectedData.steps;
      if (steps.length < 3) {
        return null; // Need at least 3 steps
      }
      
      // Get memory growth between steps
      const memoryGrowth = [];
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1].memory;
        const curr = steps[i].memory;
        
        if (prev && curr) {
          const growth = curr.usedJSHeapSize - prev.usedJSHeapSize;
          if (growth > 0) {
            memoryGrowth.push({
              stepIndex: i,
              growth: growth,
              percentage: (growth / prev.usedJSHeapSize) * 100
            });
          }
        }
      }
      
      if (memoryGrowth.length === 0) {
        return null;
      }
      
      // Calculate average growth
      const avgGrowth = memoryGrowth.reduce((sum, g) => sum + g.growth, 0) / memoryGrowth.length;
      const totalGrowth = steps[steps.length - 1].memory?.usedJSHeapSize - steps[0].memory?.usedJSHeapSize;
      
      // Consider it a leak if:
      // 1. Average growth > 1MB per step
      // 2. Total growth > 10MB
      // 3. Growth is consistent (most steps show growth)
      const isLeak = avgGrowth > 1000000 || // >1MB avg
                     totalGrowth > 10000000 || // >10MB total
                     (memoryGrowth.length / steps.length) > 0.7; // >70% steps growing
      
      if (isLeak) {
        console.warn('⚠️ [PerformanceCollector] Potential memory leak detected!');
        return {
          detected: true,
          avgGrowth: avgGrowth,
          totalGrowth: totalGrowth,
          growthSteps: memoryGrowth.length,
          totalSteps: steps.length,
          severity: totalGrowth > 20000000 ? 'critical' : totalGrowth > 10000000 ? 'warning' : 'info'
        };
      }
      
      return null;
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
      const resources = this.collectedData.resources || [];
      
      const totalSize = resources.reduce((sum, r) => sum + (r.size || 0), 0);
      const totalDuration = resources.reduce((sum, r) => sum + (r.duration || 0), 0);
      
      const resourcesByType = resources.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {});

      return {
        totalResources: resources.length,
        totalSize: totalSize,
        avgDuration: resources.length > 0 ? totalDuration / resources.length : 0,
        resourcesByType: resourcesByType,
        stepsCount: this.collectedData.steps.length
      };
    }
  }

  // Create global instance
  window.AutoTestPerformanceCollector = new PerformanceCollector();

  // Message listener for background commands
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_PERFORMANCE_MONITORING') {
      window.AutoTestPerformanceCollector.startMonitoring(
        message.testId,
        message.config
      );
      sendResponse({ success: true });
    }
    else if (message.type === 'STOP_PERFORMANCE_MONITORING') {
      window.AutoTestPerformanceCollector.stopMonitoring();
      sendResponse({ success: true });
    }
    else if (message.type === 'MARK_PERFORMANCE_STEP') {
      // Вызываем markStep только при активном мониторинге — иначе тихо игнорируем
      if (window.AutoTestPerformanceCollector.isMonitoring) {
        window.AutoTestPerformanceCollector.markStep(
          message.stepIndex,
          message.stepType,
          message.metadata || {}
        );
      }
      sendResponse({ success: true });
    }
    else if (message.type === 'COLLECT_PERFORMANCE_DATA') {
      const data = window.AutoTestPerformanceCollector.collectData();
      sendResponse({ success: true, data: data });
    }
  });

  console.log('✅ [PerformanceCollector] Module loaded');

})();
