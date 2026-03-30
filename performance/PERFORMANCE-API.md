# Performance Analytics API Documentation

## Overview

Performance Analytics system для AutoTest Recorder состоит из трёх компонентов:
1. **Performance Collector** (content script) - сбор метрик
2. **Background Handlers** (service worker) - координация и storage
3. **Performance Dashboard** (UI) - визуализация

## Message API

### Background Messages

Все сообщения отправляются через `chrome.runtime.sendMessage()` и обрабатываются в `background/message-handlers.js`.

---

### 1. PERFORMANCE_START_MONITORING

**Описание**: Запускает мониторинг производительности для теста.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_START_MONITORING',
  testId: string,           // ID теста
  config: {                 // Опционально
    webVitals: boolean,     // Default: true
    resourceTiming: boolean, // Default: true
    navigationTiming: boolean // Default: true
  }
}
```

**Ответ**:
```javascript
{
  success: boolean,
  error?: string
}
```

**Пример**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_START_MONITORING',
  testId: 'test-123',
  config: {
    webVitals: true,
    resourceTiming: true,
    navigationTiming: true
  }
});
```

---

### 2. PERFORMANCE_MARK_STEP

**Описание**: Отмечает границу шага теста для корреляции метрик.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_MARK_STEP',
  stepIndex: number,    // Индекс шага (0-based)
  stepType: string      // Тип шага ('click', 'navigate', etc)
}
```

**Ответ**:
```javascript
{
  success: boolean,
  error?: string
}
```

**Пример**:
```javascript
await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_MARK_STEP',
  stepIndex: 3,
  stepType: 'click'
});
```

---

### 3. PERFORMANCE_COLLECT_DATA

**Описание**: Собирает все метрики и сохраняет в storage.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_COLLECT_DATA',
  testId: string
}
```

**Ответ**:
```javascript
{
  success: boolean,
  data?: PerformanceData,  // См. структуру ниже
  error?: string
}
```

**Структура PerformanceData**:
```javascript
{
  testId: string,
  startTime: number,        // performance.now()
  endTime: number,
  duration: number,         // endTime - startTime
  collectedAt: number,      // Date.now()
  
  webVitals: {
    lcp: {
      value: number,        // ms
      rating: 'good' | 'needs-improvement' | 'poor',
      timestamp: number,
      element?: string      // Tag name
    },
    cls: {
      value: number,        // Score 0-1+
      rating: 'good' | 'needs-improvement' | 'poor',
      timestamp: number
    },
    inp: {
      value: number,        // ms
      rating: 'good' | 'needs-improvement' | 'poor',
      timestamp: number,
      fallback?: string     // 'first-input' if using FID
    },
    ttfb: {
      value: number,        // ms
      rating: 'good' | 'needs-improvement' | 'poor',
      timestamp: number
    }
  },
  
  steps: [
    {
      stepIndex: number,
      stepType: string,
      timestamp: number,
      webVitals: { /* snapshot */ },
      dom: {
        size: number,       // Total nodes
        depth: number,      // Max depth
        scripts: number,
        styles: number,
        images: number
      },
      resources: number     // Count since last step
    }
  ],
  
  resources: [
    {
      name: string,         // URL
      type: string,         // 'script', 'stylesheet', 'img', etc
      size: number,         // transferSize (bytes)
      encodedSize: number,
      decodedSize: number,
      duration: number,     // ms
      startTime: number,
      timestamp: number,
      stepIndex: number,
      dns: number,          // DNS lookup time
      tcp: number,          // TCP connection time
      request: number,      // Request time
      response: number      // Response time
    }
  ],
  
  navigation: {
    dnsTime: number,
    tcpTime: number,
    tlsTime: number,
    requestTime: number,
    responseTime: number,
    domInteractive: number,
    domContentLoaded: number,
    domComplete: number,
    loadTime: number,
    totalTime: number,
    type: string,           // 'navigate', 'reload', etc
    redirectCount: number
  },
  
  summary: {
    totalResources: number,
    totalSize: number,      // bytes
    avgDuration: number,    // ms
    resourcesByType: {
      script: number,
      stylesheet: number,
      img: number,
      // etc
    },
    stepsCount: number
  }
}
```

**Пример**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_COLLECT_DATA',
  testId: 'test-123'
});

console.log('Web Vitals:', response.data.webVitals);
console.log('Resources:', response.data.resources.length);
```

---

### 4. PERFORMANCE_STOP_MONITORING

**Описание**: Останавливает мониторинг (disconnect observers).

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_STOP_MONITORING'
}
```

**Ответ**:
```javascript
{
  success: boolean,
  error?: string
}
```

---

### 5. PERFORMANCE_SAVE_BASELINE

**Описание**: Сохраняет текущие данные как baseline для сравнения.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_SAVE_BASELINE',
  testId: string,
  data: PerformanceData,
  label?: string          // Опционально, default: "Baseline {date}"
}
```

**Ответ**:
```javascript
{
  success: boolean,
  count?: number,         // Количество baselines для этого теста
  error?: string
}
```

**Примечание**: Хранится максимум 10 последних baselines для каждого теста.

---

### 6. PERFORMANCE_LOAD_BASELINES

**Описание**: Загружает все baselines для теста.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_LOAD_BASELINES',
  testId: string
}
```

**Ответ**:
```javascript
{
  success: boolean,
  baselines?: [
    {
      timestamp: number,
      data: PerformanceData,
      label: string
    }
  ],
  error?: string
}
```

---

### 7. PERFORMANCE_DELETE_BASELINE

**Описание**: Удаляет конкретный baseline.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_DELETE_BASELINE',
  testId: string,
  timestamp: number       // timestamp из baseline
}
```

**Ответ**:
```javascript
{
  success: boolean,
  error?: string
}
```

---

### 8. PERFORMANCE_GET_DATA

**Описание**: Получает сохранённые данные производительности.

**Параметры**:
```javascript
{
  type: 'PERFORMANCE_GET_DATA',
  testId?: string         // Опционально, default: 'latest'
}
```

**Ответ**:
```javascript
{
  success: boolean,
  data?: {
    testId: string,
    timestamp: number,
    data: PerformanceData
  },
  error?: string
}
```

---

## Content Script API

Performance Collector доступен через `window.AutoTestPerformanceCollector`.

### Methods

#### startMonitoring(testId, config)
```javascript
window.AutoTestPerformanceCollector.startMonitoring('test-123', {
  webVitals: true,
  resourceTiming: true,
  navigationTiming: true
});
```

#### markStep(stepIndex, stepType)
```javascript
window.AutoTestPerformanceCollector.markStep(0, 'click');
```

#### collectData()
```javascript
const data = window.AutoTestPerformanceCollector.collectData();
console.log('Collected data:', data);
```

#### stopMonitoring()
```javascript
window.AutoTestPerformanceCollector.stopMonitoring();
```

### Properties

- `isMonitoring: boolean` - состояние мониторинга
- `currentTestId: string` - ID текущего теста
- `currentStepIndex: number` - индекс текущего шага
- `collectedData: object` - собранные данные

---

## Storage Schema

### chrome.storage.local

```javascript
{
  // Performance data for specific test
  'performanceData_{testId}': {
    testId: string,
    timestamp: number,
    data: PerformanceData
  },
  
  // Latest performance data (quick access)
  'performanceData_latest': {
    testId: string,
    timestamp: number,
    data: PerformanceData
  },
  
  // Baselines for comparison
  'performanceBaselines': {
    '{testId}': [
      {
        timestamp: number,
        data: PerformanceData,
        label: string
      }
    ]
  }
}
```

---

## Usage Examples

### Full Workflow

```javascript
// 1. Start monitoring at test start
await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_START_MONITORING',
  testId: 'my-test-123'
});

// 2. Mark each step
for (let i = 0; i < steps.length; i++) {
  await chrome.runtime.sendMessage({
    type: 'PERFORMANCE_MARK_STEP',
    stepIndex: i,
    stepType: steps[i].type
  });
  
  // Execute step...
  await executeStep(steps[i]);
}

// 3. Collect data at end
const result = await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_COLLECT_DATA',
  testId: 'my-test-123'
});

console.log('Performance metrics:', result.data);

// 4. Save as baseline (optional)
await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_SAVE_BASELINE',
  testId: 'my-test-123',
  data: result.data,
  label: 'Production baseline'
});

// 5. Stop monitoring
await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_STOP_MONITORING'
});
```

### Dashboard Integration

```javascript
// In performance-dashboard.js

async function loadData() {
  // Get latest data
  const response = await chrome.runtime.sendMessage({
    type: 'PERFORMANCE_GET_DATA',
    testId: 'latest'
  });
  
  if (response.success) {
    renderWebVitals(response.data.data.webVitals);
    renderTimeline(response.data.data.steps);
    renderResources(response.data.data.resources);
  }
}

async function loadBaselines(testId) {
  const response = await chrome.runtime.sendMessage({
    type: 'PERFORMANCE_LOAD_BASELINES',
    testId: testId
  });
  
  if (response.success) {
    renderBaselinesSelector(response.baselines);
  }
}
```

---

## Web Vitals Rating Thresholds

### LCP (Largest Contentful Paint)
- **Good**: ≤ 2500ms
- **Needs Improvement**: 2500ms - 4000ms
- **Poor**: > 4000ms

### CLS (Cumulative Layout Shift)
- **Good**: ≤ 0.1
- **Needs Improvement**: 0.1 - 0.25
- **Poor**: > 0.25

### INP (Interaction to Next Paint)
- **Good**: ≤ 200ms
- **Needs Improvement**: 200ms - 500ms
- **Poor**: > 500ms

### TTFB (Time to First Byte)
- **Good**: ≤ 800ms
- **Needs Improvement**: 800ms - 1800ms
- **Poor**: > 1800ms

---

## Browser Support

- **Chrome/Edge**: Full support (все метрики)
- **Firefox**: Частичная поддержка (LCP, CLS могут не работать)
- **Safari**: Ограниченная поддержка

Performance Collector автоматически использует fallbacks для недоступных метрик.

---

## Error Handling

Все message handlers возвращают `{success: boolean, error?: string}`.

**Общие ошибки**:
- `"No tab ID in sender"` - сообщение не из content script
- `"Failed to collect data from content script"` - collector не инициализирован
- `"No performance data found"` - данные не сохранены в storage
- `"No data provided for baseline"` - пустые данные для baseline

**Пример обработки**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'PERFORMANCE_COLLECT_DATA',
  testId: 'test-123'
});

if (!response.success) {
  console.error('Error:', response.error);
  // Handle error
} else {
  // Use response.data
}
```

---

## Performance Impact

**Overhead мониторинга**:
- CPU: < 1% при нормальной нагрузке
- Memory: ~2-5 MB для типичного теста
- Network: Нет дополнительных запросов

**Storage limits**:
- Max 10 baselines per test
- Data auto-cleanup для старых тестов (TODO: Phase 2)

---

## Next Steps (Phase 2)

Планируется добавить:
- Long Tasks API tracking
- Memory profiling
- HAR export
- Regression detection
- Automated comparison
- Performance budgets
