# Performance Analytics - Complete Guide v0.9.4.8

## 🚀 Quick Start

### 1. Enable Performance Analysis
1. Open test in editor
2. Click **+ Insert Step**
3. Select **Analysis → Performance**
4. Save test

### 2. Run Test
- Click **▶️ Full Run** or **⚡ Optimized**
- Performance data collected automatically
- Metrics tracked at each step

### 3. View Results
- Click **📊 View Performance Report** button
- Performance Dashboard opens in new tab
- Review metrics, budgets, recommendations

---

## 📊 Features Overview

### Core Metrics (Collected Automatically)
- ✅ **Web Vitals**: LCP, CLS, INP, TTFB
- ✅ **Navigation Timing**: DNS, TCP, Request, Response, DOM, Load
- ✅ **Resource Timing**: Size, Duration per resource
- ✅ **Step Timing**: Duration, Plugin vs Page breakdown
- ✅ **Long Tasks**: Tasks blocking UI >50ms
- ✅ **Memory**: Heap size, leak detection
- ✅ **DOM**: Size, depth, element counts

### Export Formats
- **📥 JSON**: Full data export
  - Complete performance dataset
  - Baseline compatible
  - Custom analysis ready

- **📊 HAR**: HTTP Archive format
  - Chrome DevTools import
  - WebPageTest upload
  - Standard waterfall analysis

- **📊 CSV**: Excel/Sheets analysis
  - 4 types: Steps, Resources, Long Tasks, Summary
  - Pivot table ready
  - Chart friendly

### Performance Budgets
**Click ⚙️ Budgets button to configure**

**Presets**:
- 🔴 **Strict**: High-performance apps (LCP <1.5s)
- 🟡 **Moderate**: Balanced (LCP <2.5s) - Default
- 🟢 **Relaxed**: Complex apps (LCP <4s)
- ⚙️ **Custom**: Manual configuration

**Categories**:
1. **Web Vitals Budgets**
   - LCP (Largest Contentful Paint)
   - CLS (Cumulative Layout Shift)
   - INP (Interaction to Next Paint)
   - TTFB (Time to First Byte)

2. **Test Performance Budgets**
   - Total Test Duration
   - Average Step Duration
   - Max Long Tasks count
   - Total Blocking Time

3. **Resource Budgets**
   - Total Resources count
   - Total Size (MB)
   - Max Script Size (KB)
   - Max Image Size (KB)

**Validation**:
- Automatic after each test
- Shows violations in dashboard
- Severity: Critical / Warning / Minor
- CI/CD ready (exit codes)

### Advanced Analysis

**Performance Score (0-100)**:
- Overall performance rating
- Ratings: Excellent (90+), Good (75-89), Needs Improvement (50-74), Poor (<50)
- Automatic calculation based on metrics

**Regression Detection**:
- Automatic comparison with saved baseline
- 10% threshold (configurable)
- Highlights performance drops
- Shows exact change percentage

**Bottleneck Detection**:
- Slow steps (>2x average)
- Large resources (>500KB)
- Long tasks (>100ms)
- Poor Web Vitals
- High DOM complexity

**Recommendations Engine**:
- Actionable optimization suggestions
- Priority ranking (Critical → High → Medium → Low)
- Context-aware based on actual issues
- Step-by-step fixes

### Timeline Visualization

**Features**:
- Visual timeline chart by steps
- Plugin overhead vs Page delay
- Interactive tooltips
- Summary statistics

**Comparison View**:
- Overlay current vs baseline
- Color-coded regression (red = slower, green = faster)
- Comparison table with diffs
- Percentage changes

### Long Tasks Tracking

**Automatic Detection**:
- Tasks blocking main thread >50ms
- Attribution (which script)
- Step association
- Severity classification

**Visualization**:
- Timeline chart by steps
- Top 10 long tasks list
- Critical (>100ms) vs Warning (50-100ms)
- Source identification

**Metrics**:
- Total long tasks count
- Critical tasks count
- Total blocking time
- Longest task duration
- Average duration

### Memory Profiling

**Per-Step Tracking**:
- Used JS Heap Size
- Total JS Heap Size
- Heap Size Limit
- Usage percentage

**Leak Detection**:
- Automatic algorithm
- Criteria: >1MB/step or >10MB total
- Growth pattern analysis
- Severity: Critical / Warning / Info

**Export**:
- Memory snapshots in JSON
- CSV export for charts
- Trend analysis

---

## 🎯 Common Workflows

### Workflow 1: Performance Monitoring
```
1. Create test with performance analysis
2. Set budgets (⚙️ Budgets button)
3. Run test regularly
4. Review violations
5. Fix critical issues
6. Re-test and verify
```

### Workflow 2: Baseline Comparison
```
1. Run test on stable version
2. Save as baseline (💾 Save Baseline)
3. Make code changes
4. Run test again
5. Review regression detection
6. Compare timeline charts
7. Export diff report
```

### Workflow 3: Optimization
```
1. Run test to establish baseline
2. Review bottlenecks section
3. Check recommendations
4. Apply optimizations
5. Re-test
6. Compare performance score
7. Iterate until score >90
```

### Workflow 4: CI/CD Integration
```
1. Configure strict budgets
2. Export JSON in CI pipeline
3. Check budget violations
4. Fail build if critical issues
5. Store reports as artifacts
6. Track trends over time
```

---

## 📈 Metrics Reference

### Web Vitals Thresholds

**LCP (Largest Contentful Paint)**:
- ✅ Good: ≤ 2500ms
- ⚠️ Needs Improvement: 2500-4000ms
- ❌ Poor: > 4000ms

**CLS (Cumulative Layout Shift)**:
- ✅ Good: ≤ 0.1
- ⚠️ Needs Improvement: 0.1-0.25
- ❌ Poor: > 0.25

**INP (Interaction to Next Paint)**:
- ✅ Good: ≤ 200ms
- ⚠️ Needs Improvement: 200-500ms
- ❌ Poor: > 500ms

**TTFB (Time to First Byte)**:
- ✅ Good: ≤ 800ms
- ⚠️ Needs Improvement: 800-1800ms
- ❌ Poor: > 1800ms

### Long Tasks Classification
- **Normal**: <50ms (not tracked)
- **Warning**: 50-100ms (impacts UX)
- **Critical**: >100ms (blocks UI significantly)

### Memory Leak Criteria
- Average growth >1MB per step
- Total growth >10MB
- Growth in >70% of steps

---

## 🔧 Troubleshooting

### Issue: No performance data collected
**Solution**: Ensure test has `analysis-performance` step and was run successfully

### Issue: Web Vitals show null/0
**Solution**: Use Chrome/Edge browser. Firefox/Safari have limited API support

### Issue: Budget violations not showing
**Solution**: Click ⚙️ Budgets to configure budgets first

### Issue: Comparison view empty
**Solution**: Save a baseline first (💾 Save Baseline button)

### Issue: Export buttons not working
**Solution**: Ensure performance data loaded. Check browser console for errors

### Issue: Long tasks section hidden
**Solution**: Long tasks only appear if tasks >50ms detected

### Issue: Memory data unavailable
**Solution**: Chrome only feature. Enable in chrome://flags if needed

---

## 💡 Best Practices

### Budget Configuration
- Start with Moderate preset
- Tighten gradually as you optimize
- Different budgets for dev/staging/prod
- Review and update quarterly

### Performance Testing
- Test on consistent network conditions
- Multiple runs for statistical significance
- Test both cold and warm cache scenarios
- Track trends over time, not single values

### Optimization Strategy
- Measure before optimizing (baseline)
- One change at a time
- Verify impact with re-test
- Document what worked
- Focus on Critical issues first

### Data Export
- JSON for programmatic analysis
- HAR for waterfall visualization
- CSV for executive reports
- Regular exports for historical tracking

---

## 📚 Additional Resources

### Files
- `performance/performance-dashboard.html` - Main dashboard
- `performance/performance-budgets.html` - Budget configuration
- `performance/budget-validator.js` - Validation logic
- `performance/advanced-analysis.js` - Analysis engine
- `performance/har-export.js` - HAR export
- `performance/csv-export.js` - CSV export

### Browser Support
- ✅ **Chrome/Edge**: Full support (recommended)
- ⚠️ **Firefox**: Partial (no Long Tasks, limited Web Vitals)
- ⚠️ **Safari**: Limited (basic metrics only)

### API Documentation
- Web Vitals: https://web.dev/vitals/
- Long Tasks API: https://w3c.github.io/longtasks/
- Navigation Timing: https://w3c.github.io/navigation-timing/
- Resource Timing: https://w3c.github.io/resource-timing/

---

**Version**: 0.9.4.8  
**Last Updated**: March 1, 2026  
**Status**: Production Ready ✅
