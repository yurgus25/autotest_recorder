/**
 * Advanced Performance Analysis
 * Automatic regression detection, bottleneck identification, and recommendations
 */

(function() {
  'use strict';

  /**
   * Analyze performance data for issues and recommendations
   */
  function analyzePerformance(performanceData, baseline = null) {
    const analysis = {
      score: 100,
      regressions: [],
      bottlenecks: [],
      recommendations: [],
      summary: {}
    };

    // Detect regressions (if baseline provided)
    if (baseline) {
      analysis.regressions = detectRegressions(performanceData, baseline);
    }

    // Detect bottlenecks
    analysis.bottlenecks = detectBottlenecks(performanceData);

    // Generate recommendations
    analysis.recommendations = generateRecommendations(performanceData, analysis.bottlenecks);

    // Calculate performance score
    analysis.score = calculatePerformanceScore(performanceData, analysis);

    // Summary
    analysis.summary = {
      totalIssues: analysis.regressions.length + analysis.bottlenecks.length,
      criticalIssues: [...analysis.regressions, ...analysis.bottlenecks]
        .filter(i => i.severity === 'critical').length,
      score: analysis.score,
      rating: getScoreRating(analysis.score)
    };

    return analysis;
  }

  /**
   * Detect regressions compared to baseline
   */
  function detectRegressions(current, baseline) {
    const regressions = [];
    const threshold = 0.1; // 10% threshold

    // Compare test duration
    if (current.duration > baseline.duration * (1 + threshold)) {
      regressions.push({
        type: 'regression',
        metric: 'Test Duration',
        current: current.duration,
        baseline: baseline.duration,
        change: ((current.duration - baseline.duration) / baseline.duration) * 100,
        severity: current.duration > baseline.duration * 1.3 ? 'critical' : 'warning'
      });
    }

    // Compare Web Vitals
    ['lcp', 'cls', 'inp', 'ttfb'].forEach(metric => {
      const curr = current.webVitals?.[metric]?.value || 0;
      const base = baseline.webVitals?.[metric]?.value || 0;
      
      if (base > 0 && curr > base * (1 + threshold)) {
        regressions.push({
          type: 'regression',
          metric: metric.toUpperCase(),
          current: curr,
          baseline: base,
          change: ((curr - base) / base) * 100,
          severity: curr > base * 1.3 ? 'critical' : 'warning'
        });
      }
    });

    return regressions;
  }

  /**
   * Detect performance bottlenecks
   */
  function detectBottlenecks(data) {
    const bottlenecks = [];

    // Slow steps (>2x average)
    if (data.steps && data.steps.length > 0) {
      const avgDuration = data.steps.reduce((sum, s) => 
        sum + (s.timing?.sinceLastStep || 0), 0) / data.steps.length;
      
      data.steps.forEach(step => {
        const duration = step.timing?.sinceLastStep || 0;
        if (duration > avgDuration * 2) {
          bottlenecks.push({
            type: 'slow_step',
            step: step.stepIndex,
            stepType: step.stepType,
            duration: duration,
            average: avgDuration,
            severity: duration > avgDuration * 3 ? 'critical' : 'warning'
          });
        }
      });
    }

    // Large resources (>500KB)
    if (data.resources) {
      data.resources.forEach(resource => {
        if (resource.size > 500000) {
          bottlenecks.push({
            type: 'large_resource',
            resource: resource.name,
            size: resource.size,
            resourceType: resource.type,
            severity: resource.size > 1000000 ? 'critical' : 'warning'
          });
        }
      });
    }

    // Long tasks (>100ms)
    if (data.longTasks) {
      data.longTasks.forEach(task => {
        if (task.duration > 100) {
          bottlenecks.push({
            type: 'long_task',
            duration: task.duration,
            step: task.stepIndex,
            source: task.attribution?.[0]?.containerSrc || 'Unknown',
            severity: 'critical'
          });
        }
      });
    }

    // Poor Web Vitals
    const vitals = data.webVitals || {};
    if (vitals.lcp?.value > 2500) {
      bottlenecks.push({
        type: 'poor_vital',
        metric: 'LCP',
        value: vitals.lcp.value,
        threshold: 2500,
        severity: vitals.lcp.value > 4000 ? 'critical' : 'warning'
      });
    }
    if (vitals.cls?.value > 0.1) {
      bottlenecks.push({
        type: 'poor_vital',
        metric: 'CLS',
        value: vitals.cls.value,
        threshold: 0.1,
        severity: vitals.cls.value > 0.25 ? 'critical' : 'warning'
      });
    }

    return bottlenecks;
  }

  /**
   * Generate actionable recommendations
   */
  function generateRecommendations(data, bottlenecks) {
    const recommendations = [];
    const seen = new Set();

    bottlenecks.forEach(issue => {
      let rec = null;

      switch (issue.type) {
        case 'slow_step':
          rec = {
            priority: 'high',
            title: `Optimize Step ${issue.step} (${issue.stepType})`,
            description: `This step takes ${issue.duration.toFixed(0)}ms, which is ${((issue.duration / issue.average) * 100).toFixed(0)}% of average.`,
            actions: [
              'Check for unnecessary waits or delays',
              'Optimize selector complexity',
              'Consider using faster actions'
            ]
          };
          break;

        case 'large_resource':
          const key = `large_${issue.resourceType}`;
          if (!seen.has(key)) {
            seen.add(key);
            rec = {
              priority: issue.severity === 'critical' ? 'high' : 'medium',
              title: `Optimize ${issue.resourceType} resources`,
              description: `Found ${issue.resourceType} files over 500KB. Largest: ${(issue.size / 1024).toFixed(0)}KB`,
              actions: [
                'Minify and compress files',
                'Use code splitting for scripts',
                'Optimize images (WebP, compression)',
                'Enable CDN caching'
              ]
            };
          }
          break;

        case 'long_task':
          if (!seen.has('long_tasks')) {
            seen.add('long_tasks');
            rec = {
              priority: 'critical',
              title: 'Reduce Long Tasks blocking main thread',
              description: `Found ${bottlenecks.filter(b => b.type === 'long_task').length} tasks blocking UI for >100ms`,
              actions: [
                'Break up long JavaScript execution',
                'Use Web Workers for heavy computation',
                'Defer non-critical scripts',
                'Use requestIdleCallback for low-priority work'
              ]
            };
          }
          break;

        case 'poor_vital':
          const vitalKey = `vital_${issue.metric}`;
          if (!seen.has(vitalKey)) {
            seen.add(vitalKey);
            rec = getVitalRecommendation(issue.metric, issue.value);
          }
          break;
      }

      if (rec) {
        recommendations.push(rec);
      }
    });

    return recommendations.sort((a, b) => {
      const priority = { critical: 0, high: 1, medium: 2, low: 3 };
      return priority[a.priority] - priority[b.priority];
    });
  }

  /**
   * Get recommendation for Web Vital
   */
  function getVitalRecommendation(metric, value) {
    const recommendations = {
      'LCP': {
        priority: value > 4000 ? 'critical' : 'high',
        title: 'Improve Largest Contentful Paint (LCP)',
        description: `LCP is ${(value / 1000).toFixed(2)}s (target: <2.5s)`,
        actions: [
          'Optimize server response time (TTFB)',
          'Preload critical resources',
          'Optimize images and media',
          'Remove render-blocking resources'
        ]
      },
      'CLS': {
        priority: value > 0.25 ? 'critical' : 'high',
        title: 'Fix Cumulative Layout Shift (CLS)',
        description: `CLS is ${value.toFixed(3)} (target: <0.1)`,
        actions: [
          'Add explicit width/height to images and videos',
          'Reserve space for ads and embeds',
          'Avoid inserting content above existing content',
          'Use transform instead of layout-triggering properties'
        ]
      },
      'INP': {
        priority: value > 500 ? 'critical' : 'high',
        title: 'Improve Interaction to Next Paint (INP)',
        description: `INP is ${value.toFixed(0)}ms (target: <200ms)`,
        actions: [
          'Optimize event handlers',
          'Reduce JavaScript execution time',
          'Break up long tasks',
          'Minimize layout thrashing'
        ]
      }
    };

    return recommendations[metric] || null;
  }

  /**
   * Calculate overall performance score (0-100)
   */
  function calculatePerformanceScore(data, analysis) {
    let score = 100;

    // Deduct for regressions
    analysis.regressions.forEach(r => {
      score -= r.severity === 'critical' ? 10 : 5;
    });

    // Deduct for bottlenecks
    analysis.bottlenecks.forEach(b => {
      score -= b.severity === 'critical' ? 8 : 3;
    });

    // Deduct for poor Web Vitals
    const vitals = data.webVitals || {};
    if (vitals.lcp?.value > 4000) score -= 15;
    else if (vitals.lcp?.value > 2500) score -= 8;
    
    if (vitals.cls?.value > 0.25) score -= 15;
    else if (vitals.cls?.value > 0.1) score -= 8;
    
    if (vitals.inp?.value > 500) score -= 15;
    else if (vitals.inp?.value > 200) score -= 8;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get score rating
   */
  function getScoreRating(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 50) return 'needs-improvement';
    return 'poor';
  }

  // Export
  window.AdvancedAnalysis = {
    analyzePerformance,
    detectRegressions,
    detectBottlenecks,
    generateRecommendations,
    calculatePerformanceScore
  };

})();
