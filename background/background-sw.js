(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // background/background.js
  var _url = function(p) {
    return chrome.runtime.getURL(p);
  };
  importScripts(
    _url("background/message-registry.js"),
    _url("background/feature-flags.js"),
    _url("analysis/selector-cache-sw.js"),
    _url("background/message-handlers-sw.js")
  );
  var _selectorCache = self.SelectorCache;
  var _analysisModule = null;
  var analysisModulesReady = null;
  try {
    importScripts(_url("analysis/analysis-module-sw.js"));
    _analysisModule = self.AnalysisModule;
  } catch (e) {
    console.warn("[Background] analysis-module-sw.js:", e && e.message);
  }
  analysisModulesReady = _selectorCache && _selectorCache.init ? _selectorCache.init().then(function() {
    console.log("[Background] Analysis modules loaded");
    return null;
  }) : Promise.resolve();
  if (!_selectorCache || !_selectorCache.init) {
    console.log("[Background] Analysis modules loaded");
  }
  function _ensureAnalysisModule() {
    return analysisModulesReady.then(function() {
      return _analysisModule;
    });
  }
  function withRetry(fn, options) {
    options = options || {};
    var maxAttempts = options.maxAttempts || 3;
    var delayMs = options.delayMs || 500;
    var shouldRetry = options.shouldRetry || function() {
      return true;
    };
    var lastError;
    function attempt(n) {
      return Promise.resolve().then(fn).catch(function(err) {
        lastError = err;
        if (n >= maxAttempts || !shouldRetry(err)) throw err;
        console.warn("[Background] Retry " + n + "/" + maxAttempts + ":", err && err.message);
        return new Promise(function(r) {
          setTimeout(r, delayMs * n);
        }).then(function() {
          return attempt(n + 1);
        });
      });
    }
    return attempt(1);
  }
  function safeEvaluateArithmetic(expr, loopVariables = {}, userVariables = {}) {
    const s = String(expr).trim();
    if (!s) return 0;
    let i = 0;
    const skipSpace = () => {
      while (i < s.length && /\s/.test(s[i])) i++;
    };
    const isDigit = (c) => /[0-9.]/.test(c);
    const resolveVariable = (name) => {
      if (loopVariables[name] !== void 0) return loopVariables[name];
      if (userVariables[name] !== void 0) return userVariables[name];
      return void 0;
    };
    const parseNumber = () => {
      const start = i;
      if (s[i] === "-") i++;
      while (i < s.length && isDigit(s[i])) i++;
      const num = parseFloat(s.slice(start, i));
      return typeof num === "number" && !isNaN(num) ? num : void 0;
    };
    const parseIdentifier = () => {
      const start = i;
      if (/[a-zA-Z_$]/.test(s[i])) {
        i++;
        while (i < s.length && /[a-zA-Z0-9_$]/.test(s[i])) i++;
      }
      return s.slice(start, i);
    };
    const parseFactor = () => {
      skipSpace();
      if (i >= s.length) return void 0;
      if (s[i] === "(") {
        i++;
        const val = parseExpr();
        skipSpace();
        if (s[i] === ")") {
          i++;
          return val;
        }
        return void 0;
      }
      if (s[i] === "-") {
        i++;
        const val = parseFactor();
        return val !== void 0 ? -val : void 0;
      }
      if (isDigit(s[i]) || s[i] === "-" && i + 1 < s.length && isDigit(s[i + 1])) {
        return parseNumber();
      }
      const id = parseIdentifier();
      if (id) {
        const v = resolveVariable(id);
        if (v !== void 0) return typeof v === "number" ? v : Number(v);
        return void 0;
      }
      return void 0;
    };
    const parseTerm = () => {
      let left = parseFactor();
      if (left === void 0) return void 0;
      for (; ; ) {
        skipSpace();
        if (i >= s.length) return left;
        if (s[i] === "*") {
          i++;
          const right = parseFactor();
          if (right === void 0) return void 0;
          left = left * right;
        } else if (s[i] === "/") {
          i++;
          const right = parseFactor();
          if (right === void 0) return void 0;
          left = right !== 0 ? left / right : 0;
        } else return left;
      }
    };
    const parseExpr = () => {
      let left = parseTerm();
      if (left === void 0) return void 0;
      for (; ; ) {
        skipSpace();
        if (i >= s.length) return left;
        if (s[i] === "+") {
          i++;
          const right = parseTerm();
          if (right === void 0) return void 0;
          left = left + right;
        } else if (s[i] === "-") {
          i++;
          const right = parseTerm();
          if (right === void 0) return void 0;
          left = left - right;
        } else return left;
      }
    };
    const result = parseExpr();
    skipSpace();
    return i === s.length && result !== void 0 ? result : void 0;
  }
  var TestManager = class _TestManager {
    constructor() {
      this.tests = /* @__PURE__ */ new Map();
      this.testGroups = /* @__PURE__ */ new Map();
      this.currentTest = null;
      this.isRecording = false;
      this.isPlaying = false;
      this.isPaused = false;
      this.currentStep = 0;
      this.totalSteps = 0;
      this.stepType = null;
      this.playbackState = null;
      this.playbackTabId = null;
      this.activePlaybackTestId = null;
      this.recordInsertIndex = null;
      this.recordedActionsCount = 0;
      this.recordMarkerActionIndex = null;
      this.resumePlaybackAfterRecordingStop = false;
      this.testHistory = /* @__PURE__ */ new Map();
      this.currentVideoRecording = null;
      this.currentGroupId = null;
      this.groupRunIndex = 0;
      this.groupRunResults = [];
      this.groupContext = {};
      this.groupRunMode = "optimized";
      this.groupDebugMode = false;
      this.dataDrivenState = null;
      this.messageRegistry = new MessageRegistry(this);
      this.init();
    }
    init() {
      return __async(this, null, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          console.log("\u{1F680} [Background] \u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F TestManager...");
          const data = yield chrome.storage.local.get(["tests", "testGroups", "playbackState", "testHistory"]);
          if (data.tests && typeof data.tests === "object") {
            this.tests = new Map(Object.entries(data.tests));
            console.log(`\u2705 \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E ${this.tests.size} \u0442\u0435\u0441\u0442\u043E\u0432 \u0438\u0437 storage`);
          } else {
            console.log("\u2139\uFE0F \u0422\u0435\u0441\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B \u0432 storage, \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u043C \u0441 \u043F\u0443\u0441\u0442\u043E\u0433\u043E \u0441\u043F\u0438\u0441\u043A\u0430");
            this.tests = /* @__PURE__ */ new Map();
          }
          if (data.testGroups && typeof data.testGroups === "object") {
            this.testGroups = new Map(Object.entries(data.testGroups));
            console.log(`\u2705 \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E ${this.testGroups.size} \u0433\u0440\u0443\u043F\u043F \u0442\u0435\u0441\u0442\u043E\u0432 \u0438\u0437 storage`);
          } else {
            console.log("\u2139\uFE0F \u0413\u0440\u0443\u043F\u043F\u044B \u0442\u0435\u0441\u0442\u043E\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B \u0432 storage, \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u043C \u0441 \u043F\u0443\u0441\u0442\u043E\u0433\u043E \u0441\u043F\u0438\u0441\u043A\u0430");
            this.testGroups = /* @__PURE__ */ new Map();
          }
          if (data.testHistory && typeof data.testHistory === "object") {
            this.testHistory = /* @__PURE__ */ new Map();
            for (const [testId, history] of Object.entries(data.testHistory)) {
              const normalizedTestId = String(testId);
              this.testHistory.set(normalizedTestId, Array.isArray(history) ? history : []);
            }
            console.log(`\u2705 \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0434\u043B\u044F ${this.testHistory.size} \u0442\u0435\u0441\u0442\u043E\u0432`);
            for (const [testId, history] of this.testHistory.entries()) {
              console.log(`   \u{1F4CA} \u0422\u0435\u0441\u0442 ${testId}: ${history.length} \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432`);
            }
          } else {
            console.log("\u2139\uFE0F \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0432 storage, \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u043C \u0441 \u043F\u0443\u0441\u0442\u043E\u0433\u043E \u0441\u043F\u0438\u0441\u043A\u0430");
            this.testHistory = /* @__PURE__ */ new Map();
          }
          if (data.playbackState) {
            console.log("\u{1F4E5} \u041D\u0430\u0439\u0434\u0435\u043D\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0432 storage:", {
              testId: (_a = data.playbackState.test) == null ? void 0 : _a.id,
              testName: (_b = data.playbackState.test) == null ? void 0 : _b.name,
              actionIndex: data.playbackState.actionIndex,
              nextUrl: data.playbackState.nextUrl,
              hasTest: !!data.playbackState.test,
              testActionsCount: (_d = (_c = data.playbackState.test) == null ? void 0 : _c.actions) == null ? void 0 : _d.length
            });
            if (data.playbackState.test) {
              const test = data.playbackState.test;
              console.log("\u{1F50D} \u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u0442\u0435\u0441\u0442\u0430:", {
                hasId: !!test.id,
                hasName: !!test.name,
                hasActions: !!test.actions,
                actionsIsArray: Array.isArray(test.actions),
                actionsCount: (_e = test.actions) == null ? void 0 : _e.length,
                hasCreatedAt: !!test.createdAt,
                hasUpdatedAt: !!test.updatedAt
              });
              if (test.actions && test.actions.length > 0) {
                const firstAction = test.actions[0];
                console.log("\u{1F50D} \u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F:", {
                  hasType: !!firstAction.type,
                  hasSelector: !!firstAction.selector,
                  hasTimestamp: !!firstAction.timestamp,
                  type: firstAction.type,
                  selectorType: typeof firstAction.selector
                });
              }
            } else {
              console.error("\u274C \u0422\u0435\u0441\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 playbackState!");
            }
            this.playbackState = __spreadProps(__spreadValues({}, data.playbackState), {
              runMode: data.playbackState.runMode || "optimized"
            });
            this.isPlaying = true;
            this.isPaused = this.playbackState.isPaused === true;
            this.activePlaybackTestId = this.playbackState.test?.id != null ? String(this.playbackState.test.id) : null;
            console.log("\u2705 \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0438\u0437 storage:", {
              testId: (_f = this.playbackState.test) == null ? void 0 : _f.id,
              testName: (_g = this.playbackState.test) == null ? void 0 : _g.name,
              actionIndex: this.playbackState.actionIndex,
              nextUrl: this.playbackState.nextUrl,
              isPlaying: this.isPlaying,
              hasTest: !!this.playbackState.test
            });
          } else {
            console.log("\u2139\uFE0F \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432 storage");
            this.activePlaybackTestId = null;
            this.isPaused = false;
          }
        } catch (error) {
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0434\u0430\u043D\u043D\u044B\u0445 \u0438\u0437 storage:", error);
          this.tests = /* @__PURE__ */ new Map();
        }
        try {
          const settingsData = yield chrome.storage.local.get("pluginSettings");
          if (!settingsData.pluginSettings) {
            const defaultSettings = {
              selectorEngine: { finder: { enabled: true, version: "lite" }, optimalSelect: { enabled: true, version: "lite" }, uniqueSelector: { enabled: true, version: "lite" } },
              performance: { cacheSelectors: true, maxSelectorLength: 200, selectorTimeout: 5e3 },
              advanced: { verboseLogging: false, excludeHiddenElements: true, smartWaits: true },
              autotests: { enabled: true },
              analytics: { enabled: false },
              videoRecording: { enabled: false, makeSeekable: false },
              files: { uploaded: [] },
              excelExport: { enabled: true, autoExportEnabled: false, exportOnRecord: true, exportOnPlay: true, exportOnOptimize: true, format: "xls", delimiter: ";", exportPath: "", recordConsoleErrors: false, appendCollectedData: false },
              mediaSavePath: "AutoTestRecorder",
              screenshots: { saveToDisk: false, onlyOnError: false, storeInMemory: true, format: "jpeg", quality: 85 },
              recordingMode: "auto",
              selectorStrategy: "stability",
              pickerSettings: { timeout: 5, showScores: true, highlightBest: true, maxVisible: 4 },
              playback: { stepTimeoutSeconds: 5, showRunNotifications: true, selectorNotFoundStreakWarningThreshold: 3 }
            };
            yield chrome.storage.local.set({ pluginSettings: defaultSettings });
            console.log("\u2705 [Background] \u0414\u0435\u0444\u043E\u043B\u0442\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B \u0432 storage");
          }
        } catch (settingsError) {
          console.warn("\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438:", settingsError);
        }
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          const t = message == null ? void 0 : message.type;
          if (t !== "GET_TEST_HISTORY" && t !== "GET_STATE") {
            console.log("\u{1F4EC} \u041D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E:", t);
          }
          this.handleMessage(message, sender, sendResponse).catch((error) => {
            console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:", error);
            sendResponse({ success: false, error: error.message });
          });
          return true;
        });
        registerBackgroundMessageHandlers(this, this.messageRegistry);
        console.log("\u2705 Background script \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D, \u0441\u043B\u0443\u0448\u0430\u0442\u0435\u043B\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D");
      });
    }
    onPlaybackTabRemoved(tabId) {
      var _a, _b, _c, _d;
      if (!this.isPlaying || this.playbackTabId == null || this.playbackTabId !== tabId) {
        return;
      }
      const testId = (_b = (_a = this.playbackState) == null ? void 0 : _a.test) == null ? void 0 : _b.id;
      const testName = (_d = (_c = this.playbackState) == null ? void 0 : _c.test) == null ? void 0 : _d.name;
      this.playbackTabId = null;
      const self = this;
      __async(null, null, function* () {
        try {
          if (testId) yield self.stopVideoRecordingIfActive(testId);
        } catch (e) {
        }
        self.isPlaying = false;
        self.isPaused = false;
        self.activePlaybackTestId = null;
        self.currentStep = 0;
        self.totalSteps = 0;
        self.stepType = null;
        self.playbackState = null;
        try {
          yield chrome.storage.local.remove("playbackState");
        } catch (e) {
        }
        try {
          yield self.broadcast({
            type: "TEST_COMPLETED",
            testId: testId || "",
            testName,
            success: false,
            error: "\u0412\u043A\u043B\u0430\u0434\u043A\u0430 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u0430"
          });
        } catch (e) {
        }
        try {
          yield self.broadcast({
            type: "STEP_PROGRESS_UPDATE",
            step: 0,
            total: 0,
            stepType: null,
            testId: testId
          });
        } catch (e) {
        }
      });
    }
    handleMessage(message, sender, sendResponse) {
      return __async(this, null, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i;
        const messageType = String((message == null ? void 0 : message.type) || (message == null ? void 0 : message.action) || (message == null ? void 0 : message.command) || "").trim();
        if (messageType !== "GET_TEST_HISTORY" && messageType !== "GET_STATE") {
          console.log("\u{1F4E8} \u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435:", messageType, message);
        }
        let responseSent = false;
        const safeSendResponse = (response) => {
          if (!responseSent) {
            responseSent = true;
            try {
              sendResponse(response);
            } catch (error) {
              console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u043E\u0442\u0432\u0435\u0442\u0430:", error);
            }
          }
        };
        try {
          if (this.messageRegistry) {
            const handled = yield this.messageRegistry.handle(messageType, message, sender, safeSendResponse);
            if (handled) {
              return;
            }
          }
          switch (messageType) {
            case "START_RECORDING":
              break;
            case "START_RECORDING_INTO_TEST":
              break;
            case "STOP_RECORDING":
              break;
            case "ADD_ACTION":
              break;
            case "SET_TEST_VARIABLE": {
              break;
            }
            case "DOWNLOAD_FILE": {
              break;
            }
            case "UPDATE_TEST": {
              break;
            }
            case "SELECTOR_FOUND_DURING_PLAYBACK": {
              break;
            }
            case "UPDATE_ANALYSIS_ACTION_URL": {
              try {
                const { testId, actionIndex, url } = message;
                const test = testId ? this.tests.get(String(testId)) : null;
                if (test && typeof actionIndex === "number" && actionIndex >= 0 && actionIndex < (((_a = test.actions) == null ? void 0 : _a.length) || 0) && url) {
                  const a = test.actions[actionIndex];
                  if ((a == null ? void 0 : a.type) === "analysis" && !a.urlLocked) {
                    a.url = url;
                    yield this.saveTests();
                  }
                }
                safeSendResponse({ success: true });
              } catch (e) {
                safeSendResponse({ success: false, error: e == null ? void 0 : e.message });
              }
              return;
            }
            case "UPDATE_ANALYSIS_RESULT": {
              try {
                const { testId, actionIndex, analysisResult } = message;
                const test = testId ? this.tests.get(String(testId)) : null;
                if (test && typeof actionIndex === "number" && actionIndex >= 0 && actionIndex < (((_b = test.actions) == null ? void 0 : _b.length) || 0) && analysisResult) {
                  const a = test.actions[actionIndex];
                  if ((a == null ? void 0 : a.type) === "analysis") {
                    a.analysisResult = analysisResult;
                    yield this.saveTests();
                    chrome.runtime.sendMessage({ type: "TEST_UPDATED", testId }).catch(() => {
                    });
                  }
                }
                safeSendResponse({ success: true });
              } catch (e) {
                safeSendResponse({ success: false, error: e == null ? void 0 : e.message });
              }
              return;
            }
            case "MARK_SELECTOR_SUSPICIOUS": {
              try {
                const testId = message.testId;
                const actionIdx = message.actionIndex;
                const test = this.tests.get(String(testId));
                if (test && actionIdx >= 0 && actionIdx < test.actions.length) {
                  const action = test.actions[actionIdx];
                  if (!action._suspiciousSelectors) {
                    action._suspiciousSelectors = [];
                  }
                  action._suspiciousSelectors.push({
                    selector: message.originalSelector,
                    reason: message.reason || "\u042D\u043B\u0435\u043C\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043F\u0440\u0438 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u0438",
                    donorStep: message.donorStepIndex,
                    replacedAt: (/* @__PURE__ */ new Date()).toISOString()
                  });
                  if (message.newSelector) {
                    action.selector = message.newSelector;
                  }
                  yield this.saveTests();
                  console.log(`\u{1F504} [Background] \u0421\u0435\u043B\u0435\u043A\u0442\u043E\u0440 \u0448\u0430\u0433\u0430 ${actionIdx + 1} \u043F\u043E\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A \u0441\u043E\u043C\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0432 \u0442\u0435\u0441\u0442\u0435 "${test.name}"`);
                }
                safeSendResponse({ success: true });
              } catch (e) {
                console.warn("\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043C\u0435\u0442\u043A\u0435 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u0430:", e);
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "GET_SETTINGS": {
              try {
                const { pluginSettings } = yield chrome.storage.local.get("pluginSettings");
                safeSendResponse({
                  success: true,
                  settings: pluginSettings || {},
                  isGroupRun: !!this.currentGroupId
                });
              } catch (e) {
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "GET_LOCAL_STORAGE_FROM_TAB":
              break;
            case "CLEAR_ALL_SCREENSHOTS":
              break;
            case "ANALYZE_TEST_HISTORY":
              break;
            case "OPTIMIZE_SELECTORS_FROM_HISTORY":
              break;
            case "PLAY_TEST": {
              yield this.handlePlayTest(message, safeSendResponse);
              return;
            }
            case "PAUSE_PLAYBACK":
              break;
            case "RESUME_PLAYBACK_FROM_PAUSE":
              break;
            case "STOP_PLAYING":
            case "FORCE_STOP":
              break;
            case "API_REQUEST":
              break;
            case "GENERATE_TEST_DATA":
              break;
            case "ANALYZE_SELECTOR":
              break;
            // Analysis Feature - Page Analysis
            case "RUN_ANALYSIS": {
              try {
                if (typeof chrome === "undefined" || !chrome.scripting) {
                  safeSendResponse({ success: false, error: "chrome.scripting not available" });
                  return;
                }
                const analysisModule = yield _ensureAnalysisModule();
                let { tabId, analysisType, url, fillOptions, containerSelector, targetValue } = message;
                const actionName = self.ActionCatalog ? self.ActionCatalog.RUN_ANALYSIS : "analysis.run";
                const accessDecision = self.AccessPolicy && self.AccessPolicy.can ? yield self.AccessPolicy.can(actionName, { analysisType }) : { allowed: true };
                const isEnabled = yield FeatureFlags.isEnabled("ANALYSIS_STEP");
                if (!accessDecision.allowed || !isEnabled) {
                  safeSendResponse({
                    success: false,
                    error: accessDecision.allowed ? "Analysis feature is not enabled. Please upgrade to Pro." : "TIER_REQUIRED",
                    requiredTier: accessDecision.requiredTier || "premium",
                    tier: accessDecision.tier || "free",
                    action: actionName
                  });
                  return;
                }
                if (!tabId && ((_c = sender == null ? void 0 : sender.tab) == null ? void 0 : _c.id)) {
                  tabId = sender.tab.id;
                }
                if (!tabId && url) {
                  try {
                    const tabs = yield chrome.tabs.query({});
                    const matchingTab = tabs.find((t) => {
                      if (!t.url) return false;
                      try {
                        const tabUrlObj = new URL(t.url);
                        const targetUrlObj = new URL(url);
                        return tabUrlObj.origin + tabUrlObj.pathname === targetUrlObj.origin + targetUrlObj.pathname;
                      } catch (e) {
                        return t.url === url;
                      }
                    });
                    if (matchingTab) {
                      tabId = matchingTab.id;
                      console.log(`\u{1F50D} [RUN_ANALYSIS] Found tab ${tabId} for URL: ${url}`);
                    }
                  } catch (e) {
                    console.warn("\u26A0\uFE0F [RUN_ANALYSIS] Could not find tab by URL:", e);
                  }
                }
                if (!tabId) {
                  safeSendResponse({ success: false, error: "No tab found for analysis. Please open the target page first." });
                  return;
                }
                if (analysisModule) {
                  const runOptions = { fillOptions };
                  if (analysisType === "fill-single-dropdown") {
                    runOptions.containerSelector = containerSelector;
                    runOptions.targetValue = targetValue;
                  }
                  const result = yield analysisModule.runAnalysis(tabId, analysisType, runOptions);
                  if (result.success && _selectorCache) {
                    const tab = yield chrome.tabs.get(tabId);
                    if (((_d = result.data) == null ? void 0 : _d.selectors) && result.data.selectors.length > 0) {
                      yield _selectorCache.saveSelectors(tabId, tab.url, result.data.selectors, result.data.summary);
                      try {
                        const collected = yield chrome.storage.local.get(["collectedSelectors"]);
                        const collectedSelectors = collected.collectedSelectors || {};
                        collectedSelectors[tab.url] = result.data.selectors.map((s) => {
                          var _a2, _b2;
                          return {
                            selector: s.selector,
                            label: s.text || ((_a2 = s.attributes) == null ? void 0 : _a2.placeholder) || ((_b2 = s.attributes) == null ? void 0 : _b2.name) || "",
                            type: s.element
                          };
                        });
                        yield chrome.storage.local.set({ collectedSelectors });
                        console.log(`\u2705 [RUN_ANALYSIS] Saved ${result.data.selectors.length} selectors to collectedSelectors`);
                      } catch (e) {
                        console.warn("\u26A0\uFE0F [RUN_ANALYSIS] Could not save to collectedSelectors:", e);
                      }
                    } else {
                      try {
                        const selectorsResult = yield analysisModule.runAnalysis(tabId, "analysis-selectors");
                        if (selectorsResult.success && ((_e = selectorsResult.data) == null ? void 0 : _e.selectors)) {
                          yield _selectorCache.saveSelectors(tabId, tab.url, selectorsResult.data.selectors, selectorsResult.data.summary);
                          console.log(`\u2705 [RUN_ANALYSIS] Also saved ${selectorsResult.data.selectors.length} selectors for ${analysisType}`);
                          try {
                            const collected = yield chrome.storage.local.get(["collectedSelectors"]);
                            const collectedSelectors = collected.collectedSelectors || {};
                            collectedSelectors[tab.url] = selectorsResult.data.selectors.map((s) => {
                              var _a2, _b2;
                              return {
                                selector: s.selector,
                                label: s.text || ((_a2 = s.attributes) == null ? void 0 : _a2.placeholder) || ((_b2 = s.attributes) == null ? void 0 : _b2.name) || "",
                                type: s.element
                              };
                            });
                            yield chrome.storage.local.set({ collectedSelectors });
                          } catch (e) {
                            console.warn("\u26A0\uFE0F [RUN_ANALYSIS] Could not save to collectedSelectors:", e);
                          }
                        }
                      } catch (e) {
                        console.warn("\u26A0\uFE0F [RUN_ANALYSIS] Could not save selectors cache:", e);
                      }
                    }
                  }
                  if (analysisType === "analysis-performance" && result.success && ((_f = result.data) == null ? void 0 : _f.hasDetailedReport) && ((_g = result.data) == null ? void 0 : _g.performanceData)) {
                    const perfTestId = message.testId || ((_i = (_h = result.data) == null ? void 0 : _h.performanceData) == null ? void 0 : _i.testId) || "latest";
                    try {
                      const storageKey = `performanceData_${perfTestId}`;
                      yield chrome.storage.local.set({
                        [storageKey]: {
                          testId: perfTestId,
                          timestamp: Date.now(),
                          data: result.data.performanceData
                        },
                        "performanceData_latest": {
                          testId: perfTestId,
                          timestamp: Date.now(),
                          data: result.data.performanceData
                        }
                      });
                      console.log("\u2705 [RUN_ANALYSIS] Performance data saved directly:", storageKey);
                    } catch (perfErr) {
                      console.warn("\u26A0\uFE0F [RUN_ANALYSIS] Failed to save performance data:", perfErr);
                    }
                  }
                  safeSendResponse(result);
                } else {
                  safeSendResponse({ success: false, error: "AnalysisModule not loaded" });
                }
              } catch (e) {
                console.error("\u274C RUN_ANALYSIS error:", e);
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "GET_CACHED_SELECTORS": {
              try {
                yield _ensureAnalysisModule();
                const { tabId, currentUrl, url } = message;
                console.log(`\u{1F4E5} [Background] \u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 GET_CACHED_SELECTORS`);
                console.log(`   Tab ID: ${tabId}`);
                console.log(`   URL: ${url || currentUrl}`);
                let selectors = [];
                if (!_selectorCache) {
                  console.error("\u274C [Background] SelectorCache \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D");
                  safeSendResponse({ success: true, selectors: [] });
                  return;
                }
                if (!tabId && (url || currentUrl)) {
                  const targetUrl = url || currentUrl;
                  console.log(`   \u041F\u043E\u0438\u0441\u043A \u043A\u044D\u0448\u0430 \u043F\u043E URL: ${targetUrl}`);
                  selectors = yield _selectorCache.getSelectorsByUrl(targetUrl);
                } else if (tabId) {
                  console.log(`   \u041F\u043E\u0438\u0441\u043A \u043A\u044D\u0448\u0430 \u043F\u043E tabId: ${tabId}`);
                  selectors = yield _selectorCache.getSelectorsList(tabId, currentUrl);
                }
                console.log(`   \u041D\u0430\u0439\u0434\u0435\u043D\u043E \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432: ${selectors.length}`);
                safeSendResponse({ success: true, selectors });
              } catch (e) {
                console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u043A\u044D\u0448\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432:", e);
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "SAVE_CACHED_SELECTORS": {
              try {
                yield _ensureAnalysisModule();
                const { tabId, url, selectors, metadata } = message;
                console.log(`\u{1F4E5} [Background] \u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 SAVE_CACHED_SELECTORS`);
                console.log(`   Tab ID: ${tabId}`);
                console.log(`   URL: ${url}`);
                console.log(`   \u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432: ${(selectors == null ? void 0 : selectors.length) || 0}`);
                console.log(`   Metadata:`, metadata);
                if (!_selectorCache) {
                  console.error("\u274C [Background] SelectorCache \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D");
                  safeSendResponse({ success: false, error: "SelectorCache not loaded" });
                  return;
                }
                console.log(`   \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432 \u0432 \u043A\u044D\u0448...`);
                yield _selectorCache.saveSelectors(tabId, url, selectors, metadata);
                console.log(`\u2705 [Background] \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E ${selectors.length} \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432 \u0434\u043B\u044F ${url}`);
                safeSendResponse({ success: true });
              } catch (e) {
                console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432:", e);
                console.error(`   Stack trace:`, e.stack);
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "CLEAR_SELECTOR_CACHE": {
              try {
                yield _ensureAnalysisModule();
                const { tabId } = message;
                if (!_selectorCache) {
                  safeSendResponse({ success: false, error: "SelectorCache not loaded" });
                  return;
                }
                if (tabId) {
                  yield _selectorCache.clearForTab(tabId);
                } else {
                  yield _selectorCache.clearAll();
                }
                safeSendResponse({ success: true });
              } catch (e) {
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "GET_SELECTOR_CACHE_STATS": {
              try {
                yield _ensureAnalysisModule();
                if (!_selectorCache) {
                  safeSendResponse({ success: true, stats: {} });
                  return;
                }
                const stats = _selectorCache.getStats();
                safeSendResponse({ success: true, stats });
              } catch (e) {
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "CHECK_FEATURE_FLAG": {
              try {
                const { flagName } = message;
                const isEnabled = yield FeatureFlags.isEnabled(flagName);
                safeSendResponse({ success: true, enabled: isEnabled });
              } catch (e) {
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "CHECK_ACCESS": {
              try {
                const action = (message == null ? void 0 : message.action) || "";
                const context = (message == null ? void 0 : message.context) || null;
                if (!self.AccessPolicy || !self.AccessPolicy.can) {
                  safeSendResponse({ success: true, allowed: true, action });
                  return;
                }
                const decision = yield self.AccessPolicy.can(action, context);
                safeSendResponse(__spreadValues({ success: true }, decision));
              } catch (e) {
                safeSendResponse({ success: false, error: e.message });
              }
              return;
            }
            case "TEST_STEP_PROGRESS":
              break;
            case "TEST_STEP_COMPLETED":
              break;
            case "SAVE_PLAYBACK_STATE":
              break;
            case "GET_PLAYBACK_STATE":
              break;
            case "GET_CURRENT_TAB":
              break;
            case "ANALYZE_TEST_ERROR":
              break;
            case "TEST_COMPLETED": {
              break;
            }
            case "REMOVE_INEFFECTIVE_ACTIONS": {
              break;
            }
            case "OPEN_POPUP":
              break;
            case "CLOSE_POPUP_IF_OPEN":
              break;
            default:
              safeSendResponse({ success: false, error: "Unknown message type" });
          }
        } catch (error) {
          console.error("Background error:", error);
          sendResponse({ success: false, error: error.message });
        }
      });
    }
    handlePlayTest(message, sendResponse) {
      return __async(this, null, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
        let responseSent = false;
        const safeSendResponse = (response) => {
          if (!responseSent) {
            responseSent = true;
            try {
              sendResponse(response);
            } catch (error) {
              console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u043E\u0442\u0432\u0435\u0442\u0430:", error);
            }
          }
        };
        let runMode = message.mode;
        if (!runMode) {
          const testToCheck = this.tests.get(message.testId);
          const hasOptimization = ((_a = testToCheck == null ? void 0 : testToCheck.optimization) == null ? void 0 : _a.optimizedAvailable) === true;
          runMode = hasOptimization ? "optimized" : "full";
        }
        let testToPlay = message.test && message.test.id === message.testId
          ? message.test
          : this.tests.get(message.testId);
        if (!testToPlay) {
          safeSendResponse({ success: false, error: "Test not found" });
          return;
        }
        const actionsForRun = (testToPlay.actions || []).filter((action) => {
          return runMode === "full" ? true : !action.hidden;
        });
        if (actionsForRun.length === 0) {
          safeSendResponse({ success: false, error: "NO_STEPS_TO_PLAY" });
          return;
        }
        this.isPlaying = true;
        this.isPaused = false;
        this.activePlaybackTestId = testToPlay?.id != null ? String(testToPlay.id) : null;
        this.currentStep = 0;
        this.totalSteps = 0;
        this.stepType = null;
        this.playbackState = null;
        if (!message.dataDrivenStart && !message._fromDataDrivenQueue && this.dataDrivenState) {
          this.dataDrivenState = null;
        }
        if (message.dataDrivenStart && Array.isArray(message.dataDrivenRows) && message.dataDrivenRows.length > 0) {
          const MAX_DATA_DRIVEN_ROWS = 50;
          const rows = message.dataDrivenRows.slice(0, MAX_DATA_DRIVEN_ROWS);
          this.dataDrivenState = {
            testId: message.testId,
            rows,
            index: 0,
            mode: runMode,
            debugMode: !!message.debugMode,
            test: message.test && message.test.id === message.testId ? message.test : testToPlay,
            results: []
          };
          message.groupContext = __spreadValues(__spreadValues({}, message.groupContext || {}), rows[0]);
        }
        let testToSend = testToPlay;
        if (message.groupContext && typeof message.groupContext === "object" && Object.keys(message.groupContext).length > 0) {
          const baseVars = testToPlay.variables || {};
          const merged = __spreadValues({}, baseVars);
          for (const [k, v] of Object.entries(message.groupContext)) {
            merged[k] = v && typeof v === "object" && "value" in v ? v : { value: v, source: "group", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          }
          testToSend = __spreadProps(__spreadValues({}, testToPlay), { variables: merged });
        }
        const playbackSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const playPayloadBase = { type: "PLAY_TEST", test: testToSend, mode: runMode, debugMode: message.debugMode || false, playbackSessionId };
        if (this.dataDrivenState && String(this.dataDrivenState.testId) === String(message.testId)) {
          playPayloadBase.dataDrivenRowIndex = this.dataDrivenState.index;
          playPayloadBase.dataDrivenRowTotal = this.dataDrivenState.rows.length;
        }
        if (message.isGroupRun) {
          playPayloadBase.isGroupRun = true;
          playPayloadBase.groupRunCurrentIndex = message.groupRunCurrentIndex;
          playPayloadBase.groupRunTotal = message.groupRunTotal;
        }
        this.totalSteps = actionsForRun.length;
        this.playbackState = {
          test: testToPlay,
          actionIndex: 0,
          nextUrl: null,
          runMode,
          playbackSessionId
        };
        const actionsToCheck = actionsForRun;
        const visualActionTypes = ["click", "dblclick", "input", "change", "scroll", "navigation", "keyboard", "javascript", "screenshot", "adaptive", "analysis"];
        const hasVisualActions = actionsToCheck.some((action) => {
          if (visualActionTypes.includes(action.type)) {
            return true;
          }
          const checkNestedActions = (nestedActions) => {
            if (!Array.isArray(nestedActions)) return false;
            const filteredNested = runMode === "full" ? nestedActions : nestedActions.filter((a) => !a.hidden);
            return filteredNested.some((subAction) => visualActionTypes.includes(subAction.type));
          };
          if (action.actions && checkNestedActions(action.actions)) {
            return true;
          }
          if (action.thenActions && checkNestedActions(action.thenActions)) {
            return true;
          }
          if (action.elseActions && checkNestedActions(action.elseActions)) {
            return true;
          }
          return false;
        });
        const firstActionWithUrl = (_b = testToPlay.actions) == null ? void 0 : _b.find((action) => {
          const rawUrl = action.url != null && action.url !== "" ? action.url : action.value;
          if (rawUrl == null || rawUrl === "") return false;
          const url = String(rawUrl).trim();
          if (!url) return false;
          if (url.startsWith("chrome-extension://") || url.startsWith("chrome://") || url.startsWith("edge://")) return false;
          if (url.includes("/editor/editor.html") || url.includes("editor_ru.html")) return false;
          if (action.type === "navigation" && (action.subtype === "nav-url" || action.subtype === "new-tab")) return true;
          if (action.type === "navigate") return true;
          return false;
        });
        const urlForTab = (firstActionWithUrl == null ? void 0 : firstActionWithUrl.url) || (firstActionWithUrl == null ? void 0 : firstActionWithUrl.value);
        const normalizeUrl = (raw) => {
          if (raw == null || raw === "") return null;
          const s = String(raw).trim();
          if (!s) return null;
          if (/^https?:\/\//i.test(s)) return s;
          if (s.startsWith("//")) return "https:" + s;
          return "https://" + s.replace(/^\//, "");
        };
        const targetUrl = urlForTab;
        const normalizedTargetUrl = normalizeUrl(targetUrl);
        const firstVisibleAction = actionsToCheck[0];
        const isFirstActionNewTab = (firstVisibleAction == null ? void 0 : firstVisibleAction.type) === "navigation" && (firstVisibleAction == null ? void 0 : firstVisibleAction.subtype) === "new-tab";
        if (hasVisualActions && isFirstActionNewTab) {
          const newTabRaw = firstVisibleAction.url != null && firstVisibleAction.url !== "" ? firstVisibleAction.url : firstVisibleAction.value;
          const newTabUrl = normalizeUrl(newTabRaw) || "about:blank";
          try {
            console.log(`\u{1F517} [Background] \u041F\u0435\u0440\u0432\u044B\u0439 \u0448\u0430\u0433 new-tab \u2014 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E \u043E\u0434\u043D\u0443 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${newTabUrl} \u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u044E RESUME_TEST`);
            const newTab = yield chrome.tabs.create({ url: newTabUrl, active: true });
            yield new Promise((resolve) => {
              const listener = (tabId, info) => {
                if (tabId === newTab.id && info.status === "complete") {
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              };
              chrome.tabs.onUpdated.addListener(listener);
              setTimeout(resolve, 1e4);
            });
            const userVars = {};
            if (testToSend.variables) {
              for (const [k, v] of Object.entries(testToSend.variables)) {
                userVars[k] = v && typeof v === "object" && v.value !== void 0 ? v.value : v;
              }
            }
            const testState = __spreadValues({
              testId: testToPlay.id,
              testName: testToPlay.name,
              actions: testToPlay.actions,
              currentActionIndex: 1,
              userVariables: userVars,
              isPlaying: true,
              runMode,
              playbackSessionId,
              runHistory: null
            }, message.isGroupRun && { isGroupRun: true, groupRunCurrentIndex: message.groupRunCurrentIndex, groupRunTotal: message.groupRunTotal });
            const contentFiles = _TestManager.CONTENT_SCRIPT_FILES || ["content/content.js", "content/player-core.js"];
            yield chrome.scripting.executeScript({ target: { tabId: newTab.id }, files: contentFiles });
            yield chrome.tabs.sendMessage(newTab.id, { type: "RESUME_TEST", testState });
            this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, newTab.id).catch(() => {
            });
            console.log(`\u2705 [Background] \u0422\u0435\u0441\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${newTab.id} (\u0441 \u0448\u0430\u0433\u0430 2)`);
            safeSendResponse({ success: true });
            return;
          } catch (e) {
            console.warn(`\u26A0\uFE0F [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0447\u0435\u0440\u0435\u0437 new-tab, fallback \u043D\u0430 \u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u043F\u043E\u0442\u043E\u043A: ${(e == null ? void 0 : e.message) || e}`);
          }
        }
        if (!hasVisualActions) {
          console.log("\u2705 \u0422\u0435\u0441\u0442 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u043E\u043C (\u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435/API/wait), \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A \u0438\u0437 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0430");
          console.log(`   \u0420\u0435\u0436\u0438\u043C: ${runMode}, \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439: ${actionsToCheck.length}, \u0432\u0441\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0432 \u0442\u0435\u0441\u0442\u0435: ${((_c = testToPlay.actions) == null ? void 0 : _c.length) || 0}`);
        } else {
          console.log("\u26A0\uFE0F \u0422\u0435\u0441\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u043E\u043C, \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043E\u0431\u044B\u0447\u043D\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430");
          console.log(`   \u0420\u0435\u0436\u0438\u043C: ${runMode}, \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439: ${actionsToCheck.length}, \u0432\u0441\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0432 \u0442\u0435\u0441\u0442\u0435: ${((_d = testToPlay.actions) == null ? void 0 : _d.length) || 0}`);
        }
        let targetTabId = null;
        try {
          const [activeTab] = yield chrome.tabs.query({ active: true, currentWindow: true });
          const isExtensionPage = ((_e = activeTab == null ? void 0 : activeTab.url) == null ? void 0 : _e.startsWith("chrome-extension://")) || ((_f = activeTab == null ? void 0 : activeTab.url) == null ? void 0 : _f.startsWith("chrome://")) || ((_g = activeTab == null ? void 0 : activeTab.url) == null ? void 0 : _g.startsWith("edge://"));
          if (activeTab && activeTab.id) {
            if (!hasVisualActions && isExtensionPage) {
              console.log("\u2705 \u0422\u0435\u0441\u0442 \u0431\u0435\u0437 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u043E\u043C, \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0430 extension \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 (\u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440)");
              console.log("   \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u044E \u0442\u0435\u0441\u0442 \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E \u0438\u0437 background script (\u0431\u0435\u0437 content scripts)");
              this.executeTestFromBackground(testToPlay, runMode, message.debugMode || false).catch((error) => {
                console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 \u0442\u0435\u0441\u0442\u0430 \u0438\u0437 background:", error);
              });
              safeSendResponse({ success: true });
              return;
            } else if (!isExtensionPage) {
              if (normalizedTargetUrl) {
                try {
                  const currentUrl = new URL(activeTab.url);
                  const targetUrlObj = new URL(normalizedTargetUrl);
                  const urlsMatch = currentUrl.origin === targetUrlObj.origin;
                  if (urlsMatch) {
                    console.log(`\u2705 \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F: ${activeTab.url}`);
                    targetTabId = activeTab.id;
                  } else {
                    console.log("\u26A0\uFE0F URL \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0446\u0435\u043B\u0435\u0432\u044B\u043C URL");
                    console.log(`   \u0422\u0435\u043A\u0443\u0449\u0430\u044F: ${activeTab.url}`);
                    console.log(`   \u0426\u0435\u043B\u0435\u0432\u0430\u044F: ${normalizedTargetUrl}`);
                  }
                } catch (e) {
                  console.warn("\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0440\u0430\u0432\u043D\u0438\u0442\u044C origin \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u0441 targetUrl:", (e == null ? void 0 : e.message) || e);
                }
              } else {
                console.log("\u2705 \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F (\u043D\u0435\u0442 \u0446\u0435\u043B\u0435\u0432\u043E\u0433\u043E URL \u0432 \u0442\u0435\u0441\u0442\u0435)");
                targetTabId = activeTab.id;
              }
            } else if (isExtensionPage && hasVisualActions) {
              console.log("\u26A0\uFE0F \u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430 - \u044D\u0442\u043E extension \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430, \u043D\u043E \u0442\u0435\u0441\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u043E\u043C, \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E \u0435\u0451");
            }
          }
          if (!targetTabId && normalizedTargetUrl) {
            const allTabs = yield chrome.tabs.query({});
            const matchingTab = allTabs.find((tab) => {
              if (!tab.url) return false;
              if (tab.url.startsWith("chrome-extension://") || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
                return false;
              }
              try {
                const tabUrl = new URL(tab.url);
                const targetUrlObj = new URL(normalizedTargetUrl);
                return tabUrl.origin === targetUrlObj.origin;
              } catch (e) {
                return false;
              }
            });
            if (matchingTab) {
              console.log(`\u2705 \u041D\u0430\u0439\u0434\u0435\u043D\u0430 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430: ${matchingTab.url}`);
              targetTabId = matchingTab.id;
              yield chrome.tabs.update(matchingTab.id, { active: true });
            }
          }
          if (!targetTabId && isExtensionPage && hasVisualActions) {
            const allTabs = yield chrome.tabs.query({});
            const anyWebTab = allTabs.find((tab) => {
              if (!tab.url || !tab.id) return false;
              return (tab.url.startsWith("http://") || tab.url.startsWith("https://")) && !tab.url.includes("/editor/") && !tab.url.includes("editor_ru.html") && !tab.url.includes("editor.html");
            });
            if (anyWebTab) {
              console.log(`\u2705 \u0417\u0430\u043F\u0443\u0441\u043A \u0442\u0435\u0441\u0442\u0430 \u043D\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 (\u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430 \u043F\u043E URL \u0442\u0435\u0441\u0442\u0430): ${anyWebTab.url}`);
              targetTabId = anyWebTab.id;
              yield chrome.tabs.update(anyWebTab.id, { active: true });
            }
          }
          if (!targetTabId && (normalizedTargetUrl || targetUrl)) {
            console.log("\u26A0\uFE0F \u041D\u0435\u0442 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0435\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0442\u0435\u0441\u0442\u0430. \u041D\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 (\u0432 \u0442\u0435\u0441\u0442\u0435 \u043D\u0435\u0442 \u0448\u0430\u0433\u0430 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438).");
            safeSendResponse({
              success: false,
              error: "\u041D\u0435\u0442 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0441 \u043D\u0443\u0436\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435\u0439 (\u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043B\u044E\u0431\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u043D\u0443\u0436\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0442\u0435\u0441\u0442), \u0437\u0430\u0442\u0435\u043C \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0417\u0430\u043F\u0443\u0441\u043A\xBB \u0441\u043D\u043E\u0432\u0430."
            });
            return;
          }
          if (!targetTabId && !targetUrl) {
            if (!hasVisualActions) {
              const [activeTab2] = yield chrome.tabs.query({ active: true, currentWindow: true });
              if (activeTab2 && activeTab2.id) {
                console.log(`\u2705 \u0422\u0435\u0441\u0442 \u0431\u0435\u0437 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u043E\u043C, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 (\u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440): ${activeTab2.url}`);
                targetTabId = activeTab2.id;
              } else {
                console.error("\u274C \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443");
                safeSendResponse({ success: false, error: "No active tab found" });
                return;
              }
            } else {
              const allTabs = yield chrome.tabs.query({});
              const webTab = allTabs.find((tab) => {
                if (!tab.url || !tab.id) return false;
                return (tab.url.startsWith("http://") || tab.url.startsWith("https://")) && !tab.url.includes("/editor/editor.html");
              });
              if (webTab) {
                console.log(`\u2705 \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E \u043E\u0442\u043A\u0440\u044B\u0442\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0434\u043B\u044F \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439: ${webTab.url}`);
                targetTabId = webTab.id;
                yield chrome.tabs.update(webTab.id, { active: true });
              } else {
                console.log("\u26A0\uFE0F \u041D\u0435\u0442 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0435\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438. \u041D\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 (\u0432 \u0442\u0435\u0441\u0442\u0435 \u043D\u0435\u0442 \u0448\u0430\u0433\u0430 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438).");
                safeSendResponse({
                  success: false,
                  error: "\u041D\u0435\u0442 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0441 \u043D\u0443\u0436\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435\u0439 (\u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043B\u044E\u0431\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u043D\u0443\u0436\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0442\u0435\u0441\u0442), \u0437\u0430\u0442\u0435\u043C \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0417\u0430\u043F\u0443\u0441\u043A\xBB \u0441\u043D\u043E\u0432\u0430."
                });
                return;
              }
            }
          }
        } catch (error) {
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u0438\u0441\u043A\u0435/\u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438:", error);
        }
        if (targetTabId) {
          try {
            const targetTab = yield chrome.tabs.get(targetTabId);
            const isExtensionPage = ((_h = targetTab == null ? void 0 : targetTab.url) == null ? void 0 : _h.startsWith("chrome-extension://")) || ((_i = targetTab == null ? void 0 : targetTab.url) == null ? void 0 : _i.startsWith("chrome://")) || ((_j = targetTab == null ? void 0 : targetTab.url) == null ? void 0 : _j.startsWith("edge://"));
            if (isExtensionPage && !hasVisualActions) {
              console.log("\u{1F4E6} \u0422\u0435\u0441\u0442 \u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0438\u0437 background script, \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F");
            } else {
              this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, targetTabId).catch(() => {
              });
              yield chrome.tabs.sendMessage(targetTabId, __spreadProps(__spreadValues({}, playPayloadBase), { tabId: targetTabId }));
              console.log(`\u2705 PLAY_TEST \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${targetTabId}`);
            }
          } catch (error) {
            console.warn("\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0432 \u0446\u0435\u043B\u0435\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443:", error);
            const targetTab = yield chrome.tabs.get(targetTabId).catch(() => null);
            const isExtensionPage = ((_k = targetTab == null ? void 0 : targetTab.url) == null ? void 0 : _k.startsWith("chrome-extension://")) || ((_l = targetTab == null ? void 0 : targetTab.url) == null ? void 0 : _l.startsWith("chrome://")) || ((_m = targetTab == null ? void 0 : targetTab.url) == null ? void 0 : _m.startsWith("edge://"));
            if (isExtensionPage && !hasVisualActions) {
              console.log("\u{1F4E6} \u0422\u0435\u0441\u0442 \u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0438\u0437 background script, \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u044E \u043E\u0448\u0438\u0431\u043A\u0443 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F");
            } else {
              const injected = yield this.injectContentScriptsIfNeeded(targetTabId, targetTab == null ? void 0 : targetTab.url);
              if (injected) {
                yield new Promise((r) => setTimeout(r, 300));
                try {
                  yield chrome.tabs.sendMessage(targetTabId, __spreadProps(__spreadValues({}, playPayloadBase), { tabId: targetTabId }));
                  console.log(`\u2705 PLAY_TEST \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${targetTabId} \u043F\u043E\u0441\u043B\u0435 \u0432\u043D\u0435\u0434\u0440\u0435\u043D\u0438\u044F \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432`);
                } catch (retryErr) {
                  console.warn("\u26A0\uFE0F \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u043E\u0441\u043B\u0435 \u0432\u043D\u0435\u0434\u0440\u0435\u043D\u0438\u044F \u043D\u0435 \u0443\u0434\u0430\u043B\u0430\u0441\u044C:", retryErr);
                  yield this.broadcast(__spreadProps(__spreadValues({}, playPayloadBase), { targetTabId }));
                }
              } else {
                yield this.broadcast(__spreadProps(__spreadValues({}, playPayloadBase), { targetTabId }));
              }
            }
          }
        } else {
          if (!hasVisualActions) {
            const [activeTab] = yield chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.id) {
              console.log(`\u2705 \u0422\u0435\u0441\u0442 \u0431\u0435\u0437 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u043E\u043C, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 (\u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440): ${activeTab.url}`);
              const isExtensionPage = ((_n = activeTab.url) == null ? void 0 : _n.startsWith("chrome-extension://")) || ((_o = activeTab.url) == null ? void 0 : _o.startsWith("chrome://")) || ((_p = activeTab.url) == null ? void 0 : _p.startsWith("edge://"));
              if (isExtensionPage && !hasVisualActions) {
                console.log("\u2705 \u0422\u0435\u0441\u0442 \u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0438\u0437 background script \u0434\u043B\u044F extension \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B");
              } else {
                this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, activeTab.id).catch(() => {
                });
                try {
                  yield chrome.tabs.sendMessage(activeTab.id, __spreadProps(__spreadValues({}, playPayloadBase), { tabId: activeTab.id }));
                  console.log(`\u2705 PLAY_TEST \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${activeTab.id}`);
                } catch (error) {
                  console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:", error);
                  safeSendResponse({ success: false, error: "Failed to send message to tab" });
                  return;
                }
              }
            } else {
              console.error("\u274C \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443");
              safeSendResponse({ success: false, error: "No active tab found" });
              return;
            }
          } else {
            const firstValidUrl = (_r = (_q = testToPlay.actions) == null ? void 0 : _q.find((action) => {
              const u = action.url == null ? "" : String(action.url).trim();
              if (!u) return false;
              return !u.startsWith("chrome-extension://") && !u.startsWith("chrome://") && !u.startsWith("edge://") && !u.includes("/editor/editor.html");
            })) == null ? void 0 : _r.url;
            const tabUrlFromFirst = normalizeUrl(firstValidUrl != null ? String(firstValidUrl) : "");
            if (tabUrlFromFirst) {
              console.log(`\u{1F4C2} \u041E\u0442\u043A\u0440\u044B\u0432\u0430\u044E \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0441 \u043F\u0435\u0440\u0432\u044B\u043C \u043D\u0430\u0439\u0434\u0435\u043D\u043D\u044B\u043C URL: ${tabUrlFromFirst}`);
              try {
                const newTab = yield chrome.tabs.create({ url: tabUrlFromFirst });
                yield new Promise((resolve) => setTimeout(resolve, 1500));
                this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, newTab.id).catch(() => {
                });
                try {
                  yield chrome.tabs.sendMessage(newTab.id, __spreadProps(__spreadValues({}, playPayloadBase), { tabId: newTab.id }));
                  console.log(`\u2705 PLAY_TEST \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${newTab.id}`);
                } catch (sendError) {
                  console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0432 \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443:", sendError);
                  yield this.broadcast(__spreadProps(__spreadValues({}, playPayloadBase), { targetTabId: newTab.id }));
                }
              } catch (error) {
                console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0442\u0435\u0441\u0442\u0430:", error);
                safeSendResponse({ success: false, error: "Failed to open tab for test" });
                return;
              }
            } else {
              const hasJavaScriptOnly = actionsToCheck.some((a) => a.type === "javascript") && !actionsToCheck.some((a) => ["click", "dblclick", "input", "change", "scroll", "navigation", "keyboard"].includes(a.type));
              if (hasJavaScriptOnly) {
                console.log("\u{1F4C2} \u0422\u0435\u0441\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0442\u043E\u043B\u044C\u043A\u043E JavaScript, \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E \u043F\u0443\u0441\u0442\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0434\u043B\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F");
                try {
                  const newTab = yield chrome.tabs.create({ url: "data:text/html,<html><head><title>AutoTest</title></head><body></body></html>" });
                  yield new Promise((resolve) => setTimeout(resolve, 800));
                  this.startVideoRecordingIfEnabled(message.testId, testToPlay.name, newTab.id).catch(() => {
                  });
                  try {
                    yield chrome.tabs.sendMessage(newTab.id, __spreadProps(__spreadValues({}, playPayloadBase), { tabId: newTab.id }));
                    console.log(`\u2705 PLAY_TEST \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 about:blank \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${newTab.id}`);
                  } catch (sendError) {
                    const injected = yield this.injectContentScriptsIfNeeded(newTab.id, "about:blank");
                    if (injected) {
                      yield new Promise((r) => setTimeout(r, 500));
                      yield chrome.tabs.sendMessage(newTab.id, __spreadProps(__spreadValues({}, playPayloadBase), { tabId: newTab.id }));
                    }
                  }
                  safeSendResponse({ success: true });
                } catch (error) {
                  console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0438 about:blank:", error);
                  safeSendResponse({ success: false, error: "Failed to open tab" });
                  return;
                }
              } else {
                console.error("\u274C \u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0445 URL \u0432 \u0442\u0435\u0441\u0442\u0435 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430");
                safeSendResponse({ success: false, error: "No valid URL found in test" });
                return;
              }
            }
          }
        }
        safeSendResponse({ success: true });
      });
    }
    /**
     * Запускает запись видео вкладки, если включено в настройках. Не блокирует воспроизведение.
     */
    startVideoRecordingIfEnabled(testId, testName, tabId) {
      return __async(this, null, function* () {
        var _a, _b, _c;
        if (!tabId) return;
        try {
          const { pluginSettings } = yield chrome.storage.local.get("pluginSettings");
          if (((_a = pluginSettings == null ? void 0 : pluginSettings.videoRecording) == null ? void 0 : _a.enabled) !== true) {
            console.log("\u{1F3AC} [Video] \u0417\u0430\u043F\u0438\u0441\u044C \u0432\u0438\u0434\u0435\u043E \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445");
            return;
          }
          const offscreenUrl = chrome.runtime.getURL("video-recorder/offscreen.html");
          if (typeof chrome !== "undefined" && !chrome.offscreen) {
            console.warn("\u26A0\uFE0F [Video] \u0417\u0430\u043F\u0438\u0441\u044C \u0432\u0438\u0434\u0435\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430: \u043D\u0443\u0436\u0435\u043D Chrome 109+ (API chrome.offscreen). \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 Chrome.");
            return;
          }
          try {
            const hasDoc = yield (_c = (_b = chrome.offscreen).hasDocument) == null ? void 0 : _c.call(_b);
            if (!hasDoc) {
              yield chrome.offscreen.createDocument({
                url: offscreenUrl,
                reasons: ["USER_MEDIA"],
                justification: "Record test playback to video file"
              });
            }
          } catch (e) {
            if (!String((e == null ? void 0 : e.message) || "").includes("single offscreen") && !String((e == null ? void 0 : e.message) || "").includes("already exists")) {
              throw e;
            }
          }
          const streamId = yield chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
          if (!streamId) {
            console.warn("\u26A0\uFE0F [Video] getMediaStreamId \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B streamId");
            return;
          }
          this.currentVideoRecording = { testId: String(testId), testName: testName || "", tabId };
          chrome.runtime.sendMessage({ type: "START_RECORDING", streamId }).catch(() => {
          });
          console.log("\u{1F3AC} [Video] \u0417\u0430\u043F\u0438\u0441\u044C \u0432\u0438\u0434\u0435\u043E \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u0430 \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u0430", testId);
        } catch (err) {
          console.warn("\u26A0\uFE0F [Video] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C:", (err == null ? void 0 : err.message) || err);
        }
      });
    }
    /**
     * Останавливает запись видео для теста testId и сохраняет файл в Загрузки.
     * Учитывает настройку videoRecording.makeSeekable (постобработка для перемотки).
     */
    stopVideoRecordingIfActive(testId) {
      return __async(this, null, function* () {
        var _a, _b;
        const rec = this.currentVideoRecording;
        if (!rec || String(rec.testId) !== String(testId)) return;
        const testName = ((_a = this.tests.get(String(testId))) == null ? void 0 : _a.name) || rec.testName || "";
        this.currentVideoRecording = null;
        try {
          const { pluginSettings } = yield chrome.storage.local.get("pluginSettings");
          const makeSeekable = ((_b = pluginSettings == null ? void 0 : pluginSettings.videoRecording) == null ? void 0 : _b.makeSeekable) === true;
          const mediaBase = ((pluginSettings == null ? void 0 : pluginSettings.mediaSavePath) || "AutoTestRecorder").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
          const videosPath = (mediaBase || "AutoTestRecorder") + "/videos";
          chrome.runtime.sendMessage({
            type: "STOP_RECORDING",
            testId: String(testId),
            testName,
            makeSeekable,
            savePath: videosPath
          }).catch(() => {
          });
          console.log("\u{1F3AC} [Video] \u0417\u0430\u043F\u0438\u0441\u044C \u0432\u0438\u0434\u0435\u043E \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430, \u0444\u0430\u0439\u043B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F" + (makeSeekable ? " (\u0441 \u043F\u043E\u0441\u0442\u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u043E\u0439 \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u043C\u043E\u0442\u043A\u0438)" : ""));
        } catch (err) {
          console.warn("\u26A0\uFE0F [Video] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435 \u0437\u0430\u043F\u0438\u0441\u0438:", (err == null ? void 0 : err.message) || err);
        }
      });
    }
    saveTests() {
      return __async(this, null, function* () {
        try {
          const testsObj = Object.fromEntries(this.tests);
          yield withRetry(() => chrome.storage.local.set({ tests: testsObj }), {
            maxAttempts: 3,
            delayMs: 300,
            shouldRetry: (err) => !String((err == null ? void 0 : err.message) || "").includes("QUOTA")
          });
          console.log(`\u{1F4BE} \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E ${this.tests.size} \u0442\u0435\u0441\u0442\u043E\u0432 \u0432 storage`);
        } catch (error) {
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0442\u0435\u0441\u0442\u043E\u0432:", error);
          throw error;
        }
      });
    }
    /**
     * Сохраняет группы тестов в chrome.storage.local.
     * Формат: { [groupId]: Group }
     */
    saveTestGroups() {
      return __async(this, null, function* () {
        try {
          const groupsObj = Object.fromEntries(this.testGroups);
          yield withRetry(() => chrome.storage.local.set({ testGroups: groupsObj }), {
            maxAttempts: 3,
            delayMs: 300,
            shouldRetry: (err) => !String((err == null ? void 0 : err.message) || "").includes("QUOTA")
          });
          console.log(`\u{1F4BE} \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E ${this.testGroups.size} \u0433\u0440\u0443\u043F\u043F \u0442\u0435\u0441\u0442\u043E\u0432 \u0432 storage`);
        } catch (error) {
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0433\u0440\u0443\u043F\u043F \u0442\u0435\u0441\u0442\u043E\u0432:", error);
          throw error;
        }
      });
    }
    /**
     * Запускает группу тестов: задаёт контекст группы и запускает первый тест.
     * Следующие тесты запускаются из обработчика TEST_COMPLETED с передачей переменных (groupContext).
     * @param {string} groupId
     * @param {'optimized'|'full'} runMode
     * @param {boolean} debugMode
     */
    playTestGroup(groupId, runMode = "optimized", debugMode = false) {
      return __async(this, null, function* () {
        const gid = String(groupId);
        const group = this.testGroups.get(gid);
        if (!group || !Array.isArray(group.testIds) || group.testIds.length === 0) {
          console.warn("[Background] \u0413\u0440\u0443\u043F\u043F\u0430 \u0442\u0435\u0441\u0442\u043E\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043F\u0443\u0441\u0442\u0430:", groupId);
          throw new Error("\u0413\u0440\u0443\u043F\u043F\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043F\u0443\u0441\u0442\u0430");
        }
        const firstTestId = String(group.testIds[0]);
        const test = this.tests.get(firstTestId) || this.tests.get(Number(firstTestId));
        if (!test) {
          console.warn("[Background] \u041F\u0435\u0440\u0432\u044B\u0439 \u0442\u0435\u0441\u0442 \u0433\u0440\u0443\u043F\u043F\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D:", firstTestId);
          throw new Error("\u041F\u0435\u0440\u0432\u044B\u0439 \u0442\u0435\u0441\u0442 \u0433\u0440\u0443\u043F\u043F\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
        }
        this.currentGroupId = gid;
        this.groupRunIndex = 0;
        this.groupRunResults = [];
        this.groupContext = {};
        this.groupRunMode = runMode;
        this.groupDebugMode = !!debugMode;
        console.log(`\u25B6\uFE0F [Background] \u0417\u0430\u043F\u0443\u0441\u043A \u0433\u0440\u0443\u043F\u043F\u044B \u0442\u0435\u0441\u0442\u043E\u0432 ${gid}: ${group.testIds.length} \u0442\u0435\u0441\u0442(\u043E\u0432)`);
        return new Promise((resolve, reject) => {
          this.handlePlayTest(
            { testId: firstTestId, mode: runMode, debugMode: !!debugMode, groupContext: this.groupContext, isGroupRun: true, groupRunCurrentIndex: 0, groupRunTotal: group.testIds.length },
            (res) => {
              if (!(res == null ? void 0 : res.success)) {
                console.warn("[Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u0442\u0435\u0441\u0442\u0430 \u0433\u0440\u0443\u043F\u043F\u044B:", firstTestId, res == null ? void 0 : res.error);
              }
              resolve();
            }
          );
        });
      });
    }
    saveTestHistory() {
      return __async(this, null, function* () {
        try {
          const historyObj = {};
          for (const [testId, history] of this.testHistory.entries()) {
            const normalizedTestId = String(testId);
            const limitedHistory = history.slice(-10);
            const cleanedHistory = limitedHistory.map((run, runIndex) => {
              const cleanedRun = __spreadValues({}, run);
              cleanedRun.testId = normalizedTestId;
              const isLastRun = runIndex === limitedHistory.length - 1;
              if (cleanedRun.steps) {
                cleanedRun.steps = cleanedRun.steps.map((step) => {
                  var _a;
                  const cleanedStep = __spreadValues({}, step);
                  if (cleanedStep.screenshotComparison) {
                    if (!isLastRun && cleanedStep.screenshotComparison.diffImage) {
                      delete cleanedStep.screenshotComparison.diffImage;
                    }
                    if (cleanedStep.screenshotComparison.diffImagePath) {
                      cleanedStep.screenshotComparison.diffImagePath = cleanedStep.screenshotComparison.diffImagePath;
                    }
                  }
                  if (cleanedStep.screenshotComparisonView) {
                    if (!isLastRun) {
                      delete cleanedStep.screenshotComparisonView;
                    }
                  }
                  cleanedStep.beforeScreenshotPath = cleanedStep.beforeScreenshotPath || null;
                  cleanedStep.afterScreenshotPath = cleanedStep.afterScreenshotPath || null;
                  cleanedStep.errorScreenshotPath = cleanedStep.errorScreenshotPath || null;
                  cleanedStep.screenshotPath = cleanedStep.screenshotPath || null;
                  const MAX_SCREENSHOT_BYTES = 1e6;
                  const stripIfTooLarge = (s) => s && typeof s === "string" && s.length > MAX_SCREENSHOT_BYTES;
                  if (stripIfTooLarge(cleanedStep.screenshot)) delete cleanedStep.screenshot;
                  if (stripIfTooLarge(cleanedStep.beforeScreenshot)) delete cleanedStep.beforeScreenshot;
                  if (stripIfTooLarge(cleanedStep.afterScreenshot)) delete cleanedStep.afterScreenshot;
                  if (stripIfTooLarge(cleanedStep.errorScreenshot)) delete cleanedStep.errorScreenshot;
                  if (((_a = cleanedStep.screenshotComparison) == null ? void 0 : _a.diffImage) && stripIfTooLarge(cleanedStep.screenshotComparison.diffImage)) {
                    delete cleanedStep.screenshotComparison.diffImage;
                  }
                  if (stripIfTooLarge(cleanedStep.screenshotComparisonView)) delete cleanedStep.screenshotComparisonView;
                  if (!isLastRun) {
                    if (cleanedStep.screenshot) delete cleanedStep.screenshot;
                    if (cleanedStep.beforeScreenshot) delete cleanedStep.beforeScreenshot;
                    if (cleanedStep.afterScreenshot) delete cleanedStep.afterScreenshot;
                    if (cleanedStep.errorScreenshot) delete cleanedStep.errorScreenshot;
                  }
                  return cleanedStep;
                });
              }
              if (!isLastRun && cleanedRun.screenshots) {
                delete cleanedRun.screenshots;
              } else if (isLastRun && Array.isArray(cleanedRun.screenshots)) {
                const MAX_B = 1e6;
                cleanedRun.screenshots = cleanedRun.screenshots.map((s) => {
                  if ((s == null ? void 0 : s.screenshot) && typeof s.screenshot === "string" && s.screenshot.length > MAX_B) {
                    const _a = s, { screenshot } = _a, rest = __objRest(_a, ["screenshot"]);
                    return rest;
                  }
                  return s;
                });
              }
              return cleanedRun;
            });
            historyObj[normalizedTestId] = cleanedHistory;
          }
          yield withRetry(() => chrome.storage.local.set({ testHistory: historyObj }), {
            maxAttempts: 3,
            delayMs: 300,
            shouldRetry: (err) => !String((err == null ? void 0 : err.message) || "").includes("QUOTA")
          });
          console.log(`\u{1F4BE} \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0434\u043B\u044F ${Object.keys(historyObj).length} \u0442\u0435\u0441\u0442\u043E\u0432`);
          for (const [testId, history] of Object.entries(historyObj)) {
            const totalSteps = history.reduce((sum, run) => {
              var _a;
              return sum + (((_a = run.steps) == null ? void 0 : _a.length) || 0);
            }, 0);
            console.log(`   \u{1F4CA} \u0422\u0435\u0441\u0442 ${testId}: ${history.length} \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432, \u0432\u0441\u0435\u0433\u043E ${totalSteps} \u0448\u0430\u0433\u043E\u0432`);
          }
        } catch (error) {
          const errorMessage = (error == null ? void 0 : error.message) || (error == null ? void 0 : error.toString()) || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438:", errorMessage);
          if (errorMessage.includes("quota") || errorMessage.includes("QUOTA") || errorMessage.includes("QuotaExceededError") || errorMessage.includes("QuotaBytes")) {
            console.warn("\u26A0\uFE0F \u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D\u0430 \u043A\u0432\u043E\u0442\u0430 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430, \u043E\u0447\u0438\u0449\u0430\u044E \u0441\u0442\u0430\u0440\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435...");
            try {
              yield chrome.storage.local.remove("testHistory");
              console.log("\u{1F9F9} \u0423\u0434\u0430\u043B\u0435\u043D\u0430 \u0441\u0442\u0430\u0440\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0438\u0437 storage");
              const buildMinimalHistory = (history) => {
                const sorted = [...history].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
                const lastRuns = sorted.slice(0, 3);
                return lastRuns.map((run) => {
                  const minimalRun = {
                    testId: run.testId,
                    runId: run.runId,
                    startTime: run.startTime,
                    success: run.success,
                    totalDuration: run.totalDuration
                  };
                  if (run.steps && run.steps.length) {
                    minimalRun.steps = run.steps.map((step) => ({
                      stepNumber: step.stepNumber,
                      success: step.success,
                      duration: step.duration,
                      error: step.error ? String(step.error).slice(0, 500) : void 0,
                      actionType: step.actionType || step.type,
                      type: step.type || step.actionType,
                      subtype: step.subtype,
                      actionIndex: step.actionIndex
                    }));
                  } else {
                    minimalRun.steps = [];
                  }
                  return minimalRun;
                });
              };
              const historyObj = {};
              for (const [testId, history] of this.testHistory.entries()) {
                historyObj[String(testId)] = buildMinimalHistory(history);
              }
              yield chrome.storage.local.set({ testHistory: historyObj });
              console.log("\u2705 \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u043F\u043E\u0441\u043B\u0435 \u0430\u0433\u0440\u0435\u0441\u0441\u0438\u0432\u043D\u043E\u0439 \u043E\u0447\u0438\u0441\u0442\u043A\u0438 (\u0431\u0435\u0437 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432, \u043C\u0430\u043A\u0441. 3 \u043F\u0440\u043E\u0433\u043E\u043D\u0430 \u043D\u0430 \u0442\u0435\u0441\u0442)");
              for (const [testId, history] of this.testHistory.entries()) {
                const sorted = [...history].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
                const kept = sorted.slice(0, 3);
                for (const run of kept) {
                  if (run.steps) {
                    for (const step of run.steps) {
                      delete step.screenshotComparison;
                      delete step.screenshotComparisonView;
                      delete step.screenshot;
                      delete step.beforeScreenshot;
                      delete step.afterScreenshot;
                      delete step.errorScreenshot;
                    }
                  }
                  delete run.screenshots;
                }
                this.testHistory.set(testId, kept);
              }
            } catch (retryError) {
              console.error("\u274C \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0434\u0430\u0436\u0435 \u043F\u043E\u0441\u043B\u0435 \u043E\u0447\u0438\u0441\u0442\u043A\u0438:", (retryError == null ? void 0 : retryError.message) || retryError);
              try {
                console.warn("\u26A0\uFE0F \u041A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F: \u0443\u0434\u0430\u043B\u044F\u044E \u0432\u0441\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432 \u0434\u043B\u044F \u043E\u0441\u0432\u043E\u0431\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u043C\u0435\u0441\u0442\u0430");
                this.testHistory.clear();
                yield chrome.storage.local.remove("testHistory");
                console.log("\u2705 \u0412\u0441\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432 \u0443\u0434\u0430\u043B\u0435\u043D\u0430 \u0434\u043B\u044F \u043E\u0441\u0432\u043E\u0431\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u043C\u0435\u0441\u0442\u0430 \u0432 storage");
              } catch (criticalError) {
                console.error("\u274C \u041A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430: \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u044C storage:", criticalError);
              }
            }
          }
        }
      });
    }
    addTestRunHistory(testId, runHistory) {
      var _a;
      testId = String(testId);
      if (!runHistory || !runHistory.testId || !runHistory.startTime) {
        console.warn("\u26A0\uFE0F \u041F\u043E\u043F\u044B\u0442\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0443\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u043F\u0440\u043E\u0433\u043E\u043D\u0430:", runHistory);
        return;
      }
      if (!runHistory.steps) {
        runHistory.steps = [];
      }
      const runHistoryTestId = String(runHistory.testId);
      if (runHistoryTestId !== testId) {
        console.warn(`\u26A0\uFE0F testId \u0432 runHistory (${runHistoryTestId}) \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043D\u044B\u043C (${testId}), \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u044F\u044E...`);
        runHistory.testId = testId;
      }
      if (!this.testHistory.has(testId)) {
        this.testHistory.set(testId, []);
      }
      const history = this.testHistory.get(testId);
      if (!runHistory.runId) {
        runHistory.runId = runHistory.startTime || Date.now();
      }
      const existingRunIndex = history.findIndex(
        (run) => run.runId === runHistory.runId || run.startTime === runHistory.startTime && !run.success
      );
      if (existingRunIndex >= 0) {
        console.log(`\u{1F504} [Background] \u041E\u0431\u043D\u043E\u0432\u043B\u044F\u044E \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u043F\u0440\u043E\u0433\u043E\u043D \u0441 runId ${runHistory.runId} (\u043F\u0440\u043E\u043C\u0435\u0436\u0443\u0442\u043E\u0447\u043D\u043E\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435)`);
        history[existingRunIndex] = runHistory;
      } else {
        history.push(runHistory);
      }
      const screenshotsCount = ((_a = runHistory.steps) == null ? void 0 : _a.reduce((count, step) => {
        if (step.beforeScreenshot || step.beforeScreenshotPath) count++;
        if (step.afterScreenshot || step.afterScreenshotPath) count++;
        if (step.errorScreenshot || step.errorScreenshotPath) count++;
        if (step.screenshot || step.screenshotPath) count++;
        return count;
      }, 0)) || 0;
      console.log(`\u{1F4BE} \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u0430 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430 \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u0430 ${testId}:`, {
        runId: runHistory.runId,
        stepsCount: runHistory.steps.length,
        screenshotsCount,
        success: runHistory.success,
        duration: runHistory.totalDuration,
        startTime: runHistory.startTime,
        totalRuns: history.length
      });
      this.saveTestHistory().catch((err) => {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043F\u0440\u043E\u0433\u043E\u043D\u0430:", err);
        console.log("\u2139\uFE0F \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438, \u043D\u043E \u043D\u0435 \u0432 storage \u0438\u0437-\u0437\u0430 \u043E\u0448\u0438\u0431\u043A\u0438");
      });
    }
    getTestHistory(testId) {
      testId = String(testId);
      const history = this.testHistory.get(testId) || [];
      if (history.length > 0) {
        console.log(`\u{1F4CA} [Background] getTestHistory \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u0430 ${testId}: \u043D\u0430\u0439\u0434\u0435\u043D\u043E ${history.length} \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432`);
      }
      return history;
    }
    analyzeTestHistory(testId) {
      const history = this.getTestHistory(testId);
      if (history.length === 0) {
        return {
          success: false,
          errorCode: "historyEmpty"
        };
      }
      const successfulRuns = history.filter((run) => run.success === true);
      if (successfulRuns.length === 0) {
        return {
          success: false,
          errorCode: "noSuccessfulRuns"
        };
      }
      const stepStats = /* @__PURE__ */ new Map();
      successfulRuns.forEach((run) => {
        if (run.steps && run.steps.length > 0) {
          run.steps.forEach((step) => {
            const stepNum = step.stepNumber;
            if (!stepStats.has(stepNum)) {
              stepStats.set(stepNum, {
                stepNumber: stepNum,
                durations: [],
                errors: [],
                actionTypes: [],
                selectors: [],
                values: [],
                successCount: 0,
                totalCount: 0
              });
            }
            const stats = stepStats.get(stepNum);
            stats.totalCount++;
            if (step.success) {
              stats.successCount++;
              if (step.duration) {
                stats.durations.push(step.duration);
              }
            } else {
              stats.errors.push(step.error || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430");
            }
            if (step.actionType) {
              stats.actionTypes.push(step.actionType);
            }
            if (step.expectedSelector) {
              stats.selectors.push(step.expectedSelector);
            }
            if (step.expectedValue) {
              stats.values.push(step.expectedValue);
            }
          });
        }
      });
      const analysis = {
        totalRuns: history.length,
        successfulRuns: successfulRuns.length,
        failedRuns: history.length - successfulRuns.length,
        averageDuration: 0,
        stepAnalysis: [],
        recommendations: [],
        missingActions: []
      };
      const totalDuration = successfulRuns.reduce((sum, run) => sum + (run.totalDuration || 0), 0);
      analysis.averageDuration = successfulRuns.length > 0 ? totalDuration / successfulRuns.length : 0;
      stepStats.forEach((stats, stepNum) => {
        const avgDuration = stats.durations.length > 0 ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length : 0;
        const maxDuration = stats.durations.length > 0 ? Math.max(...stats.durations) : 0;
        const minDuration = stats.durations.length > 0 ? Math.min(...stats.durations) : 0;
        const successRate = stats.totalCount > 0 ? stats.successCount / stats.totalCount * 100 : 0;
        const actionTypeCounts = {};
        stats.actionTypes.forEach((type) => {
          actionTypeCounts[type] = (actionTypeCounts[type] || 0) + 1;
        });
        const mostCommonActionType = Object.keys(actionTypeCounts).reduce(
          (a, b) => actionTypeCounts[a] > actionTypeCounts[b] ? a : b,
          stats.actionTypes[0] || "unknown"
        );
        const selectorCounts = {};
        stats.selectors.forEach((sel) => {
          selectorCounts[sel] = (selectorCounts[sel] || 0) + 1;
        });
        const mostCommonSelector = Object.keys(selectorCounts).reduce(
          (a, b) => selectorCounts[a] > selectorCounts[b] ? a : b,
          stats.selectors[0] || "N/A"
        );
        analysis.stepAnalysis.push({
          stepNumber: stepNum,
          averageDuration: avgDuration,
          maxDuration,
          minDuration,
          successRate,
          errorCount: stats.errors.length,
          mostCommonErrors: this.getMostCommon(stats.errors, 3),
          actionType: mostCommonActionType,
          selector: mostCommonSelector,
          executionCount: stats.totalCount
        });
      });
      analysis.stepAnalysis.sort((a, b) => a.stepNumber - b.stepNumber);
      analysis.stepAnalysis.forEach((step) => {
        if (step.averageDuration > 3e3) {
          analysis.recommendations.push({
            type: "performance",
            priority: "high",
            stepNumber: step.stepNumber,
            message: `\u0428\u0430\u0433 ${step.stepNumber} \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E (\u0441\u0440\u0435\u0434\u043D\u0435\u0435 \u0432\u0440\u0435\u043C\u044F: ${this.formatDuration(step.averageDuration)}). \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F:`,
            suggestions: [
              step.actionType === "click" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434 \u043A\u043B\u0438\u043A\u043E\u043C, \u0435\u0441\u043B\u0438 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u043F\u043E\u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0441 \u0437\u0430\u0434\u0435\u0440\u0436\u043A\u043E\u0439" : null,
              step.actionType === "input" ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043B\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0430 \u043F\u043E\u043B\u044F \u043F\u0435\u0440\u0435\u0434 \u0432\u0432\u043E\u0434\u043E\u043C" : null,
              step.actionType === "change" ? "\u0423\u0431\u0435\u0434\u0438\u0442\u044C\u0441\u044F, \u0447\u0442\u043E dropdown \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D \u043F\u0435\u0440\u0435\u0434 \u0432\u044B\u0431\u043E\u0440\u043E\u043C" : null,
              "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440 - \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043E\u043D \u043D\u0435 \u043E\u043F\u0442\u0438\u043C\u0430\u043B\u0435\u043D",
              "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u044F\u0432\u043D\u043E\u0435 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430 \u043F\u0435\u0440\u0435\u0434 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435\u043C"
            ].filter((s) => s !== null)
          });
        }
        if (step.successRate < 100 && step.successRate >= 70) {
          analysis.recommendations.push({
            type: "stability",
            priority: "medium",
            stepNumber: step.stepNumber,
            message: `\u0428\u0430\u0433 ${step.stepNumber} \u0438\u043D\u043E\u0433\u0434\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442\u0441\u044F \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439 (\u0443\u0441\u043F\u0435\u0448\u043D\u043E\u0441\u0442\u044C: ${step.successRate.toFixed(1)}%). \u0427\u0430\u0441\u0442\u044B\u0435 \u043E\u0448\u0438\u0431\u043A\u0438:`,
            suggestions: [
              ...step.mostCommonErrors.map((err) => `\u041E\u0448\u0438\u0431\u043A\u0430: ${err}`),
              "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0448\u0430\u0433\u0430",
              "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440 - \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043E\u043D \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043D\u0430\u0445\u043E\u0434\u0438\u0442 \u044D\u043B\u0435\u043C\u0435\u043D\u0442",
              "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435\u043C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F"
            ]
          });
        }
        if (step.successRate < 70) {
          analysis.recommendations.push({
            type: "critical",
            priority: "high",
            stepNumber: step.stepNumber,
            message: `\u0428\u0430\u0433 ${step.stepNumber} \u0447\u0430\u0441\u0442\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442\u0441\u044F \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439 (\u0443\u0441\u043F\u0435\u0448\u043D\u043E\u0441\u0442\u044C: ${step.successRate.toFixed(1)}%). \u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0441\u0440\u043E\u0447\u043D\u043E\u0435 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435!`,
            suggestions: [
              ...step.mostCommonErrors.map((err) => `\u041E\u0448\u0438\u0431\u043A\u0430: ${err}`),
              "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u0430",
              "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0430\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u044B",
              "\u0423\u0431\u0435\u0434\u0438\u0442\u044C\u0441\u044F, \u0447\u0442\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435",
              "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043B\u0438 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F \u043F\u0435\u0440\u0435\u0434 \u044D\u0442\u0438\u043C \u0448\u0430\u0433\u043E\u043C"
            ]
          });
        }
        if (step.maxDuration > 0 && step.maxDuration - step.minDuration > step.averageDuration * 0.5) {
          analysis.recommendations.push({
            type: "variability",
            priority: "low",
            stepNumber: step.stepNumber,
            message: `\u0428\u0430\u0433 ${step.stepNumber} \u0438\u043C\u0435\u0435\u0442 \u0431\u043E\u043B\u044C\u0448\u0443\u044E \u0432\u0430\u0440\u0438\u0430\u0446\u0438\u044E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F (\u043E\u0442 ${this.formatDuration(step.minDuration)} \u0434\u043E ${this.formatDuration(step.maxDuration)}).`,
            suggestions: [
              "\u0412\u0440\u0435\u043C\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0441\u0438\u043B\u044C\u043D\u043E \u0432\u0430\u0440\u044C\u0438\u0440\u0443\u0435\u0442\u0441\u044F - \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438",
              "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u043D\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043B\u0438 \u0432\u0440\u0435\u043C\u044F \u043E\u0442 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B",
              "\u0420\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u044F\u0432\u043D\u043E\u0433\u043E \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u0441\u0442\u0430\u0431\u0438\u043B\u0438\u0437\u0430\u0446\u0438\u0438"
            ]
          });
        }
      });
      const actionTypes = /* @__PURE__ */ new Set();
      analysis.stepAnalysis.forEach((step) => {
        actionTypes.add(step.actionType);
      });
      const hasNavigation = Array.from(actionTypes).includes("navigation");
      const firstStep = analysis.stepAnalysis[0];
      if (firstStep && firstStep.actionType !== "navigation" && !hasNavigation) {
        analysis.missingActions.push({
          type: "navigation",
          message: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0448\u0430\u0433 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438 \u0432 \u043D\u0430\u0447\u0430\u043B\u0435 \u0442\u0435\u0441\u0442\u0430 \u0434\u043B\u044F \u044F\u0432\u043D\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430 \u043D\u0430 \u043D\u0443\u0436\u043D\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443",
          priority: "medium"
        });
      }
      analysis.stepAnalysis.forEach((step, index) => {
        if (step.actionType === "navigation" && index < analysis.stepAnalysis.length - 1) {
          const nextStep = analysis.stepAnalysis[index + 1];
          if (nextStep && nextStep.averageDuration < 1e3) {
            analysis.missingActions.push({
              type: "wait",
              stepNumber: step.stepNumber + 1,
              message: `\u041F\u043E\u0441\u043B\u0435 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438 (\u0448\u0430\u0433 ${step.stepNumber}) \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u043F\u0435\u0440\u0435\u0434 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435\u043C (\u0448\u0430\u0433 ${nextStep.stepNumber})`,
              priority: "high"
            });
          }
        }
      });
      analysis.stepAnalysis.forEach((step, index) => {
        if (step.actionType === "click" && index < analysis.stepAnalysis.length - 1) {
          const nextStep = analysis.stepAnalysis[index + 1];
          if (nextStep && nextStep.actionType === "change" && nextStep.averageDuration < 500) {
            analysis.missingActions.push({
              type: "wait",
              stepNumber: step.stepNumber + 1,
              message: `\u041F\u043E\u0441\u043B\u0435 \u043A\u043B\u0438\u043A\u0430 \u043D\u0430 dropdown (\u0448\u0430\u0433 ${step.stepNumber}) \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u0443\u044E \u0437\u0430\u0434\u0435\u0440\u0436\u043A\u0443 \u043F\u0435\u0440\u0435\u0434 \u0432\u044B\u0431\u043E\u0440\u043E\u043C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F (\u0448\u0430\u0433 ${nextStep.stepNumber})`,
              priority: "medium"
            });
          }
        }
      });
      analysis.stepAnalysis.forEach((step, index) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
        const isDropdownClick = step.actionType === "click" && (((_a = step.selector) == null ? void 0 : _a.includes("status-project")) || ((_b = step.selector) == null ? void 0 : _b.includes("select-box")) || ((_c = step.selector) == null ? void 0 : _c.includes("placeholder")) || ((_d = step.selector) == null ? void 0 : _d.includes("app-select")));
        if (isDropdownClick && index < analysis.stepAnalysis.length - 1) {
          const nextStep = analysis.stepAnalysis[index + 1];
          const isDropdownInput = (nextStep.actionType === "input" || nextStep.actionType === "change") && (((_e = nextStep.selector) == null ? void 0 : _e.includes("status-project")) || ((_f = nextStep.selector) == null ? void 0 : _f.includes("select-box")) || ((_g = nextStep.selector) == null ? void 0 : _g.includes("app-select")));
          if (isDropdownInput) {
            if (nextStep.averageDuration > 1e4) {
              analysis.recommendations.push({
                type: "performance",
                priority: "high",
                stepNumber: nextStep.stepNumber,
                message: `\u0428\u0430\u0433 ${nextStep.stepNumber} (\u0432\u044B\u0431\u043E\u0440 \u043E\u043F\u0446\u0438\u0438 \u0432 dropdown) \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043E\u0447\u0435\u043D\u044C \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E (\u0441\u0440\u0435\u0434\u043D\u0435\u0435 \u0432\u0440\u0435\u043C\u044F: ${this.formatDuration(nextStep.averageDuration)}). \u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E \u043C\u043D\u043E\u0433\u043E \u043B\u0438\u0448\u043D\u0438\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A \u0432\u044B\u0431\u043E\u0440\u0430.`,
                suggestions: [
                  "\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043B\u043E\u0433\u0438\u043A\u0443 \u0432\u044B\u0431\u043E\u0440\u0430 \u043E\u043F\u0446\u0438\u0438 \u0432 dropdown - \u0441\u043E\u043A\u0440\u0430\u0442\u0438\u0442\u044C \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A",
                  "\u0423\u043B\u0443\u0447\u0448\u0438\u0442\u044C \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440 \u0434\u043B\u044F \u043F\u043E\u0438\u0441\u043A\u0430 \u043E\u043F\u0446\u0438\u0439 \u0432 dropdown",
                  "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0431\u043E\u043B\u0435\u0435 \u0442\u043E\u0447\u043D\u043E\u0435 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043F\u043E\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u043F\u0430\u043D\u0435\u043B\u0438 \u0441 \u043E\u043F\u0446\u0438\u044F\u043C\u0438",
                  "\u0420\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0448\u0430\u0433\u0430 3 (\u043A\u043B\u0438\u043A) \u0438 \u0448\u0430\u0433\u0430 5 (\u0432\u044B\u0431\u043E\u0440) \u0432 \u043E\u0434\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0434\u043B\u044F \u0443\u0441\u043A\u043E\u0440\u0435\u043D\u0438\u044F",
                  "\u0423\u043C\u0435\u043D\u044C\u0448\u0438\u0442\u044C \u0442\u0430\u0439\u043C\u0430\u0443\u0442\u044B \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F \u043F\u0430\u043D\u0435\u043B\u0438 dropdown"
                ]
              });
            }
            analysis.recommendations.push({
              type: "optimization",
              priority: "medium",
              stepNumber: step.stepNumber,
              message: `\u0428\u0430\u0433\u0438 ${step.stepNumber} (\u043A\u043B\u0438\u043A \u043F\u043E dropdown) \u0438 ${nextStep.stepNumber} (\u0432\u044B\u0431\u043E\u0440 \u043E\u043F\u0446\u0438\u0438) \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u044C \u0434\u043B\u044F \u0443\u0441\u043A\u043E\u0440\u0435\u043D\u0438\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F.`,
              suggestions: [
                `\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u044C \u043A\u043B\u0438\u043A \u043F\u043E dropdown \u0438 \u0432\u044B\u0431\u043E\u0440 \u043E\u043F\u0446\u0438\u0438 "${((_h = nextStep.selector) == null ? void 0 : _h.includes("status-project")) ? "\u0432 \u0441\u0442\u0430\u0442\u0443\u0441\u0435" : "\u0432 dropdown"}" \u0432 \u043E\u0434\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435`,
                "\u042D\u0442\u043E \u0441\u043E\u043A\u0440\u0430\u0442\u0438\u0442 \u0432\u0440\u0435\u043C\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0438 \u0443\u043C\u0435\u043D\u044C\u0448\u0438\u0442 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0448\u0430\u0433\u043E\u0432",
                "\u041F\u0440\u0438 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0438 dropdown \u0431\u0443\u0434\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u0438 \u0441\u0440\u0430\u0437\u0443 \u0432\u044B\u0431\u0438\u0440\u0430\u0442\u044C\u0441\u044F \u043D\u0443\u0436\u043D\u0430\u044F \u043E\u043F\u0446\u0438\u044F"
              ]
            });
          }
        }
        if (step.actionType === "input" && step.averageDuration > 8e3) {
          const isDropdownInput = ((_i = step.selector) == null ? void 0 : _i.includes("status-project")) || ((_j = step.selector) == null ? void 0 : _j.includes("select-box")) || ((_k = step.selector) == null ? void 0 : _k.includes("app-select"));
          if (isDropdownInput) {
            analysis.recommendations.push({
              type: "performance",
              priority: "high",
              stepNumber: step.stepNumber,
              message: `\u0428\u0430\u0433 ${step.stepNumber} (\u0432\u044B\u0431\u043E\u0440 \u043E\u043F\u0446\u0438\u0438 \u0432 dropdown) \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E (\u0441\u0440\u0435\u0434\u043D\u0435\u0435 \u0432\u0440\u0435\u043C\u044F: ${this.formatDuration(step.averageDuration)}). \u0412 \u043A\u043E\u043D\u0441\u043E\u043B\u0438 \u0432\u0438\u0434\u043D\u043E \u043C\u043D\u043E\u0433\u043E \u043B\u0438\u0448\u043D\u0438\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A \u0432\u044B\u0431\u043E\u0440\u0430.`,
              suggestions: [
                "\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043B\u043E\u0433\u0438\u043A\u0443 \u0432\u044B\u0431\u043E\u0440\u0430 \u043E\u043F\u0446\u0438\u0438 - \u0441\u043E\u043A\u0440\u0430\u0442\u0438\u0442\u044C \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A \u043F\u0435\u0440\u0435\u0431\u043E\u0440\u0430 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432",
                "\u0423\u043B\u0443\u0447\u0448\u0438\u0442\u044C \u043F\u043E\u0438\u0441\u043A \u043F\u0430\u043D\u0435\u043B\u0438 \u0441 \u043E\u043F\u0446\u0438\u044F\u043C\u0438 - \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0431\u043E\u043B\u0435\u0435 \u0442\u043E\u0447\u043D\u044B\u0435 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u044B",
                "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u044D\u0448\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043D\u044B\u0445 \u043F\u0430\u043D\u0435\u043B\u0435\u0439 \u0434\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u044F",
                "\u0423\u043C\u0435\u043D\u044C\u0448\u0438\u0442\u044C \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A \u043A\u043B\u0438\u043A\u0430 \u043F\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430\u043C dropdown \u043F\u0435\u0440\u0435\u0434 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0435\u043C \u043F\u0430\u043D\u0435\u043B\u0438",
                "\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C MutationObserver - \u0441\u043E\u043A\u0440\u0430\u0442\u0438\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F \u043F\u043E\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u043F\u0430\u043D\u0435\u043B\u0438"
              ]
            });
          }
        }
      });
      analysis.stepAnalysis.forEach((step, index) => {
        if (index < analysis.stepAnalysis.length - 1) {
          const nextStep = analysis.stepAnalysis[index + 1];
          if (step.actionType === "input" && nextStep.actionType === "change" || step.actionType === "change" && nextStep.actionType === "input") {
            if (step.selector === nextStep.selector) {
              analysis.recommendations.push({
                type: "optimization",
                priority: "low",
                stepNumber: step.stepNumber,
                message: `\u0428\u0430\u0433\u0438 ${step.stepNumber} (${step.actionType}) \u0438 ${nextStep.stepNumber} (${nextStep.actionType}) \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044E\u0442 \u043E\u0434\u043D\u043E \u0438 \u0442\u043E \u0436\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0441 \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u043C \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u043C.`,
                suggestions: [
                  "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0434\u0438\u043D \u0438\u0437 \u044D\u0442\u0438\u0445 \u0448\u0430\u0433\u043E\u0432 (\u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C CHANGE \u0434\u043B\u044F dropdown)",
                  "\u0421\u0438\u0441\u0442\u0435\u043C\u0430 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0434\u0430\u043B\u044F\u0435\u0442 \u0442\u0430\u043A\u0438\u0435 \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442\u044B, \u043D\u043E \u043C\u043E\u0436\u043D\u043E \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0434\u043B\u044F \u044F\u0441\u043D\u043E\u0441\u0442\u0438"
                ]
              });
            }
          }
        }
      });
      return {
        success: true,
        analysis
      };
    }
    getMostCommon(items, count = 5) {
      const counts = {};
      items.forEach((item) => {
        counts[item] = (counts[item] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, count).map(([item]) => item);
    }
    formatDuration(ms) {
      if (!ms) return "0\u043C\u0441";
      if (ms < 1e3) return `${Math.round(ms)}\u043C\u0441`;
      const seconds = Math.floor(ms / 1e3);
      if (seconds < 60) return `${seconds}\u0441`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes < 60) return `${minutes}\u043C ${remainingSeconds}\u0441`;
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}\u0447 ${remainingMinutes}\u043C`;
    }
    optimizeSelectorsFromHistory(testId, runHistory) {
      return __async(this, null, function* () {
        const test = this.tests.get(testId);
        if (!test) {
          return { success: false, error: "\u0422\u0435\u0441\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" };
        }
        if (!runHistory || !runHistory.steps || runHistory.steps.length === 0) {
          return { success: false, error: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u0448\u0430\u0433\u0430\u0445 \u0434\u043B\u044F \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u0438" };
        }
        const allSuccessful = runHistory.steps.every((step) => step.success);
        if (!allSuccessful) {
          return { success: false, error: "\u041D\u0435 \u0432\u0441\u0435 \u0448\u0430\u0433\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u0443\u0441\u043F\u0435\u0448\u043D\u043E, \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F" };
        }
        let optimizedCount = 0;
        const optimizations = [];
        runHistory.steps.forEach((step) => {
          var _a, _b;
          const stepIndex = step.stepNumber - 1;
          const action = test.actions[stepIndex];
          if (!action) {
            console.warn(`\u26A0\uFE0F \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0434\u043B\u044F \u0448\u0430\u0433\u0430 ${step.stepNumber} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E`);
            return;
          }
          if (action.userEdited) {
            console.log(`\u23ED\uFE0F \u0428\u0430\u0433 ${step.stepNumber} \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C, \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044E`);
            return;
          }
          const expectedSelector = step.expectedSelector || "";
          const actualSelector = step.actualSelector || expectedSelector;
          if (actualSelector && actualSelector !== expectedSelector && actualSelector !== "N/A") {
            const stepDuration = step.averageDuration || (((_a = runHistory.steps.find((s) => s.stepNumber === step.stepNumber)) == null ? void 0 : _a.duration) || 0);
            const isBetter = this.isSelectorBetter(actualSelector, expectedSelector, stepDuration);
            if (isBetter) {
              const previousAlternatives = Array.isArray((_b = action.selector) == null ? void 0 : _b.alternatives) ? JSON.parse(JSON.stringify(action.selector.alternatives)) : [];
              const newSelector = this.parseSelectorString(actualSelector);
              if (newSelector) {
                const oldSelector = JSON.stringify(action.selector);
                const demotedSelector = JSON.parse(oldSelector);
                demotedSelector.demotedByOptimization = true;
                demotedSelector.demotedAt = (/* @__PURE__ */ new Date()).toISOString();
                demotedSelector.demotedReason = "optimize-from-history";
                const normalizedDemoted = (demotedSelector.selector || demotedSelector.value || "").toString().trim().toLowerCase();
                const normalizedSet = /* @__PURE__ */ new Set();
                if (normalizedDemoted) {
                  normalizedSet.add(normalizedDemoted);
                }
                const mergedAlternatives = [];
                if (normalizedDemoted) {
                  mergedAlternatives.push(JSON.parse(JSON.stringify(demotedSelector)));
                }
                previousAlternatives.forEach((alt) => {
                  const value = (alt == null ? void 0 : alt.selector) || (alt == null ? void 0 : alt.value);
                  const normalized = (value || "").toString().trim().toLowerCase();
                  if (!normalized || normalizedSet.has(normalized)) {
                    return;
                  }
                  normalizedSet.add(normalized);
                  mergedAlternatives.push(alt);
                });
                if (mergedAlternatives.length > 0) {
                  newSelector.alternatives = mergedAlternatives;
                }
                action.selector = newSelector;
                action.selectorOptimized = true;
                action.selectorOptimizedAt = (/* @__PURE__ */ new Date()).toISOString();
                action.selectorOptimizedSource = "run-history";
                action.originalSelector = demotedSelector;
                optimizations.push({
                  stepNumber: step.stepNumber,
                  oldSelector: expectedSelector,
                  newSelector: actualSelector,
                  timeSaved: step.averageDuration > 2e3 ? Math.round(step.averageDuration - 2e3) : 0
                });
                optimizedCount++;
                console.log(`\u2705 \u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440 \u0434\u043B\u044F \u0448\u0430\u0433\u0430 ${step.stepNumber}: ${expectedSelector} \u2192 ${actualSelector}`);
              }
            }
          }
        });
        if (optimizedCount > 0) {
          test.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          test.lastEditor = "Optimization";
          this.tests.set(testId, test);
          yield this.saveTests();
          console.log(`\u2705 \u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043E ${optimizedCount} \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432 \u0432 \u0442\u0435\u0441\u0442\u0435 ${test.name}`);
        }
        return {
          success: true,
          optimizedCount,
          optimizations
        };
      });
    }
    isSelectorBetter(newSelector, oldSelector, stepDuration) {
      const newLength = newSelector.length;
      const oldLength = oldSelector.length;
      if (newLength < oldLength * 0.8) {
        return true;
      }
      if (stepDuration > 2e3 && newLength < oldLength) {
        return true;
      }
      const newHasId = newSelector.includes("#") && !newSelector.includes(" > ");
      const oldHasComplexPath = oldSelector.includes(" > ") && oldSelector.split(" > ").length > 3;
      if (newHasId && oldHasComplexPath) {
        return true;
      }
      return false;
    }
    parseSelectorString(selectorString) {
      if (!selectorString || selectorString === "N/A") {
        return null;
      }
      let type = "css";
      if (selectorString.startsWith("#")) {
        type = "id";
      } else if (selectorString.startsWith(".")) {
        type = "class";
      } else if (selectorString.startsWith("[")) {
        type = "attribute";
      }
      return {
        type,
        selector: selectorString,
        value: selectorString,
        priority: type === "id" ? 10 : type === "class" ? 8 : 5
      };
    }
    /** Порядок файлов content_scripts как в manifest (для внедрения при отсутствии в вкладке). */
    static get CONTENT_SCRIPT_FILES() {
      return [
        "libs/finder-lite.js",
        "libs/finder.js",
        "libs/unique-selector-lite.js",
        "libs/unique-selector.js",
        "libs/optimal-select-lite.js",
        "libs/optimal-select.js",
        "content/selector-engine.js",
        "content/selector-optimizer.js",
        "content/selenium-utils.js",
        "content/player-optimizer.js",
        "content/smart-waiter.js",
        "excel-export/excel-export.js",
        "content/screenshot-comparer.js",
        "content/content.js",
        "content/inline-selector-picker.js",
        "content/recorder.js",
        "content/player-core.js",
        "content/player-handlers-basic.js",
        "content/player-handlers-data.js",
        "content/player-handlers-table-drag.js",
        "content/player-handlers-ui.js",
        "content/player-handlers-analysis.js",
        "content/player-handlers-adaptive.js",
        "content/player-handlers-form.js",
        "content/player-handlers-dropdown.js",
        "content/player-handlers-extended.js",
        "content/player-handlers-api.js",
        "content/player-init.js",
        "content/selector-inspector.js"
      ];
    }
    /**
     * Внедряет content scripts во вкладку, если это обычная веб-страница (не extension).
     * Используется, когда sendMessage падает из-за отсутствия скрипта (вкладка открыта до установки расширения).
     * @param {number} tabId
     * @param {string} [tabUrl]
     * @returns {Promise<boolean>} true если внедрение выполнено (или не требуется), false при ошибке
     */
    injectContentScriptsIfNeeded(tabId, tabUrl) {
      return __async(this, null, function* () {
        if (!tabId) return false;
        if (tabUrl && (tabUrl.startsWith("chrome-extension://") || tabUrl.startsWith("chrome://") || tabUrl.startsWith("edge://"))) {
          return false;
        }
        try {
          for (let pingAttempt = 0; pingAttempt < 3; pingAttempt++) {
            try {
              yield chrome.tabs.sendMessage(tabId, { type: "PING_CONTENT_SCRIPT" });
              return false;
            } catch (_) {
              if (pingAttempt < 2) yield new Promise((r) => setTimeout(r, 100));
            }
          }
          const files = _TestManager.CONTENT_SCRIPT_FILES;
          yield chrome.scripting.executeScript({ target: { tabId }, files });
          console.log(`\u2705 Content scripts \u0432\u043D\u0435\u0434\u0440\u0435\u043D\u044B \u0432\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${tabId}`);
          return true;
        } catch (err) {
          console.warn("\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043D\u0435\u0434\u0440\u0438\u0442\u044C content scripts \u0432\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0443:", err == null ? void 0 : err.message);
          return false;
        }
      });
    }
    broadcast(message) {
      return __async(this, null, function* () {
        var _a, _b, _c;
        if (message.type === "PLAY_TEST" && message.targetTabId) {
          try {
            const payload = __spreadValues({
              type: "PLAY_TEST",
              test: message.test,
              mode: message.mode,
              debugMode: message.debugMode || false,
              tabId: message.targetTabId
            }, message.playbackSessionId ? { playbackSessionId: message.playbackSessionId } : {}, message.dataDrivenRowIndex != null ? { dataDrivenRowIndex: message.dataDrivenRowIndex, dataDrivenRowTotal: message.dataDrivenRowTotal } : {}, message.isGroupRun ? { isGroupRun: true, groupRunCurrentIndex: message.groupRunCurrentIndex, groupRunTotal: message.groupRunTotal } : {});
            yield chrome.tabs.sendMessage(message.targetTabId, payload);
            console.log(`\u{1F4E1} PLAY_TEST \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0446\u0435\u043B\u0435\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${message.targetTabId} (\u0431\u0435\u0437 broadcast)`);
            return;
          } catch (e) {
            console.warn(`\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C PLAY_TEST \u0432 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${message.targetTabId}, \u043F\u0440\u043E\u0431\u0443\u044E \u043F\u0435\u0440\u0432\u0443\u044E \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0443\u044E:`, e == null ? void 0 : e.message);
          }
        }
        const tabs = yield chrome.tabs.query({});
        let targets = tabs.filter((tab) => tab.url && !tab.url.startsWith("chrome-extension://") && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://"));
        if (message.type === "PLAY_TEST") {
          const tid = message.targetTabId;
          const byId = tid ? targets.find((t) => t.id === tid) : null;
          const targetUrl = (_c = (_b = (_a = message.test) == null ? void 0 : _a.actions) == null ? void 0 : _b.find((a) => a == null ? void 0 : a.url)) == null ? void 0 : _c.url;
          const byUrl = targetUrl ? targets.filter((t) => {
            try {
              const tu = new URL(targetUrl);
              const tabUrl = new URL(t.url);
              return tu.origin === tabUrl.origin;
            } catch (e) {
              return false;
            }
          }) : targets;
          const single = byId || (byUrl.length > 0 ? byUrl[0] : null) || targets[0];
          targets = single ? [single] : [];
        }
        let sentCount = 0;
        yield Promise.all(targets.map((tab) => __async(null, null, function* () {
          try {
            const msg = message.type === "PLAY_TEST" ? __spreadValues({ type: "PLAY_TEST", test: message.test, mode: message.mode, debugMode: message.debugMode || false, tabId: tab.id }, message.playbackSessionId ? { playbackSessionId: message.playbackSessionId } : {}, message.dataDrivenRowIndex != null ? { dataDrivenRowIndex: message.dataDrivenRowIndex, dataDrivenRowTotal: message.dataDrivenRowTotal } : {}, message.isGroupRun && { isGroupRun: true, groupRunCurrentIndex: message.groupRunCurrentIndex, groupRunTotal: message.groupRunTotal }) : message;
            yield chrome.tabs.sendMessage(tab.id, msg);
            sentCount++;
            console.log(`\u{1F4E1} Broadcast \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${tab.id} (${tab.url})`);
          } catch (e) {
          }
        })));
        console.log(`\u{1F4E1} Broadcast \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u043D\u0430 ${sentCount} \u0432\u043A\u043B\u0430\u0434\u043E\u043A (\u0432\u0441\u0435\u0433\u043E \u0432\u043A\u043B\u0430\u0434\u043E\u043A: ${tabs.length})`);
      });
    }
    /**
     * Триггерит экспорт в Excel через content script
     */
    triggerExcelExport(testId, trigger, runHistory = null) {
      return __async(this, null, function* () {
        try {
          const test = this.tests.get(testId);
          if (!test) {
            console.warn(`\u26A0\uFE0F [ExcelExport] \u0422\u0435\u0441\u0442 ${testId} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0434\u043B\u044F \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430`);
            return;
          }
          const tabs = yield chrome.tabs.query({});
          for (const tab of tabs) {
            try {
              yield chrome.tabs.sendMessage(tab.id, {
                type: "EXPORT_TEST_TO_EXCEL",
                testId,
                test,
                trigger,
                runHistory
              });
              console.log(`\u2705 [ExcelExport] \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0431 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${tab.id}`);
              break;
            } catch (error) {
            }
          }
        } catch (error) {
          console.error("\u274C [ExcelExport] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0442\u0440\u0438\u0433\u0433\u0435\u0440\u0435 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430:", error);
        }
      });
    }
    /**
     * Очищает дублирующиеся действия из теста
     * @param {Object} test - Тест для очистки
     * @returns {number} - Количество удаленных действий
     */
    cleanDuplicateActions(test) {
      if (!test || !test.actions || test.actions.length === 0) {
        return 0;
      }
      let removedCount = 0;
      const actionsToRemove = [];
      const actions = test.actions;
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (action.hidden) {
          continue;
        }
        if (action.type === "input" && i > 0) {
          const prevAction = actions[i - 1];
          if (prevAction && !prevAction.hidden && prevAction.type === "change" && prevAction.selector && action.selector && this.areSelectorsEqual(prevAction.selector, action.selector) && prevAction.value === action.value) {
            console.log(`\u{1F504} \u041D\u0430\u0439\u0434\u0435\u043D \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442: INPUT \u043F\u043E\u0441\u043B\u0435 CHANGE \u0441 \u0442\u0435\u043C \u0436\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435\u043C "${action.value}"`);
            console.log(`   \u{1F4DD} \u0423\u0434\u0430\u043B\u044F\u044E \u043F\u0435\u0440\u0432\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C (CHANGE, \u0438\u043D\u0434\u0435\u043A\u0441 ${i - 1}), \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E INPUT (\u0438\u043D\u0434\u0435\u043A\u0441 ${i})`);
            if (!actionsToRemove.includes(i - 1)) {
              actionsToRemove.push(i - 1);
            }
            continue;
          }
        }
        if (action.type === "change" && i > 0) {
          const prevAction = actions[i - 1];
          if (prevAction && !prevAction.hidden && prevAction.type === "input" && prevAction.selector && action.selector && this.areSelectorsEqual(prevAction.selector, action.selector) && prevAction.value === action.value) {
            console.log(`\u{1F504} \u041D\u0430\u0439\u0434\u0435\u043D \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442: CHANGE \u043F\u043E\u0441\u043B\u0435 INPUT \u0441 \u0442\u0435\u043C \u0436\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435\u043C "${action.value}"`);
            console.log(`   \u{1F4DD} \u0423\u0434\u0430\u043B\u044F\u044E \u043F\u0435\u0440\u0432\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C (INPUT, \u0438\u043D\u0434\u0435\u043A\u0441 ${i - 1}), \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E CHANGE (\u0438\u043D\u0434\u0435\u043A\u0441 ${i})`);
            if (!actionsToRemove.includes(i - 1)) {
              actionsToRemove.push(i - 1);
            }
            continue;
          }
        }
        if (action.type === "click" && i > 0) {
          const prevAction = actions[i - 1];
          if (prevAction && !prevAction.hidden && prevAction.type === "click" && prevAction.selector && action.selector && this.areSelectorsEqual(prevAction.selector, action.selector)) {
            const currentTs = Number(action.timestamp) || 0;
            const prevTs = Number(prevAction.timestamp) || 0;
            const hasValidTimestamps = currentTs > 0 && prevTs > 0;
            const timeDiff = hasValidTimestamps ? currentTs - prevTs : Number.POSITIVE_INFINITY;
            if (hasValidTimestamps && timeDiff >= 0 && timeDiff < 500) {
              console.log(`\u{1F504} \u041D\u0430\u0439\u0434\u0435\u043D \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442: \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u043A\u043B\u0438\u043A \u043F\u043E \u0442\u043E\u043C\u0443 \u0436\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0443 (\u0440\u0430\u0437\u043D\u0438\u0446\u0430 ${timeDiff}\u043C\u0441)`);
              console.log(`   \u{1F4DD} \u0423\u0434\u0430\u043B\u044F\u044E \u043F\u0435\u0440\u0432\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C (\u043A\u043B\u0438\u043A, \u0438\u043D\u0434\u0435\u043A\u0441 ${i - 1}), \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u043A\u043B\u0438\u043A (\u0438\u043D\u0434\u0435\u043A\u0441 ${i})`);
              if (!actionsToRemove.includes(i - 1)) {
                actionsToRemove.push(i - 1);
              }
              continue;
            }
          }
        }
      }
      const getSelectorKey = (selector) => {
        if (!selector) return "";
        if (typeof selector === "string") return selector;
        return selector.selector || selector.value || "";
      };
      const getTargetKey = (action) => {
        if (!action) return "";
        if (action.elementKey) return `element:${action.elementKey}`;
        const sel = getSelectorKey(action.selector);
        return sel ? `selector:${sel}` : "";
      };
      const isValueAction = (action) => !!(action && !action.hidden && (action.type === "input" || action.type === "change") && action.value !== void 0 && action.value !== null && getTargetKey(action));
      const normalizeValue = (value) => String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
      const shouldReplaceBestValueAction = (prevAction, nextAction) => {
        if (!prevAction) return true;
        const prevTs = Number(prevAction.timestamp) || 0;
        const nextTs = Number(nextAction.timestamp) || 0;
        const dt = nextTs - prevTs;
        const prevIsDropdownSelect = !!(prevAction.isDropdownSelection || prevAction.dropdownAutoFilled);
        const nextIsDropdownSelect = !!(nextAction.isDropdownSelection || nextAction.dropdownAutoFilled);
        if (nextIsDropdownSelect && !prevIsDropdownSelect) return true;
        if (prevIsDropdownSelect && !nextIsDropdownSelect && dt >= 0 && dt <= 5e3) return false;
        const prevNorm = normalizeValue(prevAction.value);
        const nextNorm = normalizeValue(nextAction.value);
        if (prevNorm && nextNorm && prevNorm === nextNorm) {
          return nextTs >= prevTs;
        }
        return nextTs >= prevTs;
      };
      const lastValueIndexByTarget = /* @__PURE__ */ new Map();
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (!isValueAction(action)) continue;
        const target = getTargetKey(action);
        const currentBestIndex = lastValueIndexByTarget.get(target);
        const currentBest = currentBestIndex !== void 0 ? actions[currentBestIndex] : null;
        if (shouldReplaceBestValueAction(currentBest, action)) {
          lastValueIndexByTarget.set(target, i);
        }
      }
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (!isValueAction(action)) continue;
        const targetKey = getTargetKey(action);
        const lastIdx = lastValueIndexByTarget.get(targetKey);
        if (lastIdx !== i && !actionsToRemove.includes(i)) {
          console.log(`\u{1F9F9} \u0423\u0434\u0430\u043B\u044F\u044E \u043F\u0440\u043E\u043C\u0435\u0436\u0443\u0442\u043E\u0447\u043D\u043E\u0435 value-\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 (${action.type}) \u0434\u043B\u044F ${targetKey}, \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E \u0438\u043D\u0434\u0435\u043A\u0441 ${lastIdx}`);
          actionsToRemove.push(i);
        }
      }
      // Phase 3 disabled: keep dropdown "open" click step.
      // Hiding it causes open/select sequence drift and hidden dropdown actions.
      const getActionText = (action) => String(action?.fieldLabel || action?.description || action?.name || action?.label || action?.value || "").toLowerCase();
      const hasExplicitSelector = (action) => {
        const selectorText = String(action?.selector?.selector || action?.selector?.value || action?.selector || "").trim();
        if (!selectorText) return false;
        return selectorText.startsWith("#") || /\[[^\]]+\]/.test(selectorText) || /elementid|ng-reflect-element-id|aria-label|name=|id=/.test(selectorText);
      };
      const isSignificantAction = (action) => {
        if (!action) return false;
        const type = String(action.type || "").toLowerCase();
        if (!["click", "dblclick", "input", "change", "navigate", "navigation"].includes(type)) return false;
        const text = getActionText(action);
        return /(save|submit|send|create|delete|publish|apply|сохран|отправ|созда|удал|примен|опубли)/i.test(text);
      };
      const hasNearbyAnalog = (index) => {
        const action = actions[index];
        if (!action) return false;
        const currentSelector = action.selector;
        const currentType = action.type;
        for (let j = Math.max(0, index - 2); j <= Math.min(actions.length - 1, index + 2); j++) {
          if (j === index) continue;
          const other = actions[j];
          if (!other || other.hidden) continue;
          if (other.type !== currentType) continue;
          if (currentSelector && other.selector && this.areSelectorsEqual(currentSelector, other.selector)) {
            return true;
          }
        }
        return false;
      };
      actionsToRemove.sort((a, b) => b - a);
      for (const index of actionsToRemove) {
        if (index >= 0 && index < actions.length) {
          const candidate = actions[index];
          if (isSignificantAction(candidate) && hasExplicitSelector(candidate) && !hasNearbyAnalog(index)) {
            console.log(`\u{1F6E1}\uFE0F \u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E auto-hidden \u0434\u043B\u044F \u0437\u043D\u0430\u0447\u0438\u043C\u043E\u0433\u043E \u0448\u0430\u0433\u0430 ${index + 1} (\u044F\u0432\u043D\u044B\u0439 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440, \u043D\u0435\u0442 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u0430\u043D\u0430\u043B\u043E\u0433\u043E\u0432)`);
            continue;
          }
          actions[index].hidden = true;
          actions[index].hiddenReason = "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0434\u0430\u043B\u0435\u043D \u043A\u0430\u043A \u0434\u0443\u0431\u043B\u0438\u0440\u0443\u044E\u0449\u0435\u0435\u0441\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435";
          actions[index].hiddenAt = (/* @__PURE__ */ new Date()).toISOString();
          removedCount++;
        }
      }
      return removedCount;
    }
    /**
     * Сравнивает два селектора на равенство
     */
    areSelectorsEqual(selector1, selector2) {
      if (!selector1 || !selector2) return false;
      if (selector1.selector && selector2.selector) {
        return selector1.selector === selector2.selector;
      }
      if (selector1.value && selector2.value) {
        const val1 = typeof selector1.value === "string" ? selector1.value : JSON.stringify(selector1.value);
        const val2 = typeof selector2.value === "string" ? selector2.value : JSON.stringify(selector2.value);
        return val1 === val2;
      }
      return false;
    }
    /**
     * Строит промпт для генерации тестовых данных
     */
    buildTestDataPrompt(dataType, elementInfo) {
      let prompt = `\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u0439 \u0440\u0435\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u043D\u044B\u0435 \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043B\u044F \u043F\u043E\u043B\u044F \u0444\u043E\u0440\u043C\u044B.

`;
      prompt += `**\u0422\u0438\u043F \u0434\u0430\u043D\u043D\u044B\u0445:** ${dataType}
`;
      if (elementInfo) {
        if (elementInfo.placeholder) {
          prompt += `- Placeholder: ${elementInfo.placeholder}
`;
        }
        if (elementInfo.label) {
          prompt += `- Label: ${elementInfo.label}
`;
        }
        if (elementInfo.type) {
          prompt += `- HTML type: ${elementInfo.type}
`;
        }
        if (elementInfo.name) {
          prompt += `- Name: ${elementInfo.name}
`;
        }
      }
      prompt += `
**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F:**
`;
      switch (dataType) {
        case "name":
        case "fullname":
          prompt += `- \u0420\u0435\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u043D\u043E\u0435 \u0424\u0418\u041E \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u043E\u043C \u044F\u0437\u044B\u043A\u0435
`;
          prompt += `- \u0424\u043E\u0440\u043C\u0430\u0442: \u0424\u0430\u043C\u0438\u043B\u0438\u044F \u0418\u043C\u044F \u041E\u0442\u0447\u0435\u0441\u0442\u0432\u043E
`;
          break;
        case "phone":
          prompt += `- \u041D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 +7 (XXX) XXX-XX-XX
`;
          prompt += `- \u0418\u043B\u0438 8 (XXX) XXX-XX-XX
`;
          break;
        case "email":
          prompt += `- Email \u0430\u0434\u0440\u0435\u0441 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 example@domain.com
`;
          break;
        case "address":
          prompt += `- \u041F\u043E\u043B\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441: \u0433\u043E\u0440\u043E\u0434, \u0443\u043B\u0438\u0446\u0430, \u0434\u043E\u043C
`;
          break;
        case "inn":
          prompt += `- \u0418\u041D\u041D (10 \u0438\u043B\u0438 12 \u0446\u0438\u0444\u0440)
`;
          break;
        case "snils":
          prompt += `- \u0421\u041D\u0418\u041B\u0421 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 XXX-XXX-XXX XX
`;
          break;
        default:
          prompt += `- \u0420\u0435\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043B\u044F \u0442\u0438\u043F\u0430 "${dataType}"
`;
      }
      prompt += `
\u0412\u0435\u0440\u043D\u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u0430\u043D\u043D\u044B\u0435, \u0431\u0435\u0437 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043F\u043E\u044F\u0441\u043D\u0435\u043D\u0438\u0439.`;
      return prompt;
    }
    /**
     * Строит промпт для анализа ошибки
     */
    buildErrorAnalysisPrompt(errorInfo, testContext) {
      let prompt = `\u041F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0439 \u043E\u0448\u0438\u0431\u043A\u0443 \u043F\u0440\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 \u0430\u0432\u0442\u043E\u0442\u0435\u0441\u0442\u0430 \u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438 \u0440\u0435\u0448\u0435\u043D\u0438\u0435.

`;
      prompt += `**\u041E\u0448\u0438\u0431\u043A\u0430:**
`;
      prompt += `- \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435: ${errorInfo.error || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430"}
`;
      prompt += `- \u0422\u0438\u043F: ${errorInfo.type || "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E"}
`;
      if (errorInfo.selector) {
        prompt += `- \u0421\u0435\u043B\u0435\u043A\u0442\u043E\u0440: ${errorInfo.selector}
`;
      }
      if (errorInfo.stepNumber) {
        prompt += `- \u0428\u0430\u0433: ${errorInfo.stepNumber}
`;
      }
      if (testContext) {
        prompt += `
**\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0442\u0435\u0441\u0442\u0430:**
`;
        if (testContext.testName) {
          prompt += `- \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u0435\u0441\u0442\u0430: ${testContext.testName}
`;
        }
        if (testContext.url) {
          prompt += `- URL: ${testContext.url}
`;
        }
        if (testContext.actionType) {
          prompt += `- \u0422\u0438\u043F \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F: ${testContext.actionType}
`;
        }
      }
      prompt += `
**\u0417\u0430\u0434\u0430\u0447\u0430:**
`;
      prompt += `\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u0438 \u043F\u0440\u0438\u0447\u0438\u043D\u0443 \u043E\u0448\u0438\u0431\u043A\u0438 \u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435:
`;
      prompt += `1. \u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0448\u0438\u0431\u043A\u0438
`;
      prompt += `2. \u0410\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440 (\u0435\u0441\u043B\u0438 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0430 \u0432 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u0435)
`;
      prompt += `3. \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u0438 \u043F\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044E
`;
      return prompt;
    }
    /**
     * Очищает все скриншоты из истории прогонов (для использования внутри класса)
     */
    clearAllScreenshotsFromStorage() {
      return __async(this, null, function* () {
        console.log("\u{1F9F9} [Background] \u041E\u0447\u0438\u0449\u0430\u044E \u0432\u0441\u0435 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u044B \u0438\u0437 storage...");
        try {
          yield this.deleteScreenshotFiles();
          for (const [testId, history] of this.testHistory.entries()) {
            for (const run of history) {
              if (run.screenshots) {
                delete run.screenshots;
              }
              if (run.steps) {
                for (const step of run.steps) {
                  delete step.screenshot;
                  delete step.beforeScreenshot;
                  delete step.afterScreenshot;
                  delete step.screenshotComparison;
                  delete step.screenshotComparisonView;
                  delete step.screenshotPath;
                  delete step.beforeScreenshotPath;
                  delete step.afterScreenshotPath;
                  delete step.errorScreenshotPath;
                  if (step.screenshotComparison) {
                    delete step.screenshotComparison.diffImagePath;
                  }
                  delete step.screenshotComparisonViewPath;
                }
              }
            }
          }
          yield this.saveTestHistory();
          console.log("\u2705 [Background] \u0412\u0441\u0435 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u044B \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0438\u0437 storage \u0438 \u0444\u0430\u0439\u043B\u044B \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0441 \u0434\u0438\u0441\u043A\u0430.");
        } catch (error) {
          console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0435 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u0438\u0437 storage:", error);
          throw error;
        }
      });
    }
    /**
     * Удаляет все файлы скриншотов с диска
     */
    deleteScreenshotFiles() {
      return __async(this, null, function* () {
        try {
          console.log("\u{1F5D1}\uFE0F [Background] \u0423\u0434\u0430\u043B\u044F\u044E \u0444\u0430\u0439\u043B\u044B \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u0441 \u0434\u0438\u0441\u043A\u0430...");
          const allDownloads = yield chrome.downloads.search({});
          if (!allDownloads || allDownloads.length === 0) {
            console.log("\u2139\uFE0F [Background] \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B");
            return;
          }
          const screenshotDownloads = allDownloads.filter((download) => {
            const filename = download.filename || download.filenameCurrent || "";
            return filename.includes("screenshots") && filename.endsWith(".png");
          });
          if (screenshotDownloads.length === 0) {
            console.log("\u2139\uFE0F [Background] \u0424\u0430\u0439\u043B\u044B \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B");
            return;
          }
          console.log(`\u{1F4C1} [Background] \u041D\u0430\u0439\u0434\u0435\u043D\u043E ${screenshotDownloads.length} \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u0434\u043B\u044F \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F`);
          let deletedCount = 0;
          let errorCount = 0;
          for (const download of screenshotDownloads) {
            try {
              const filename = download.filename || download.filenameCurrent || "unknown";
              try {
                yield chrome.downloads.removeFile(download.id);
                console.log(`\u{1F5D1}\uFE0F [Background] \u0424\u0430\u0439\u043B \u0443\u0434\u0430\u043B\u0435\u043D: ${filename}`);
                deletedCount++;
              } catch (removeError) {
                console.warn(`\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B ${filename}, \u0443\u0434\u0430\u043B\u044F\u044E \u0437\u0430\u043F\u0438\u0441\u044C:`, removeError.message);
              }
              try {
                yield chrome.downloads.erase({ id: download.id });
              } catch (eraseError) {
                console.warn(`\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u043E \u0444\u0430\u0439\u043B\u0435 ${filename}:`, eraseError.message);
              }
            } catch (error) {
              console.warn(`\u26A0\uFE0F [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u0444\u0430\u0439\u043B\u0430 ${download.filename}:`, error);
              errorCount++;
            }
          }
          console.log(`\u2705 [Background] \u0423\u0434\u0430\u043B\u0435\u043D\u043E \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432: ${deletedCount}, \u043E\u0448\u0438\u0431\u043E\u043A: ${errorCount}`);
        } catch (error) {
          console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438 \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432:", error);
        }
      });
    }
    /**
     * Парсит ответ от AI об анализе ошибки
     */
    parseErrorAnalysis(responseText) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        const analysis = {
          cause: null,
          alternativeSelector: null,
          recommendations: []
        };
        const causeMatch = responseText.match(/(?:причина|причина ошибки)[\s:]+([^\n]+)/i);
        if (causeMatch) {
          analysis.cause = causeMatch[1].trim();
        }
        const selectorMatch = responseText.match(/(?:селектор|selector)[\s:]+['"]?([^'"]+)['"]?/i);
        if (selectorMatch) {
          analysis.alternativeSelector = selectorMatch[1];
        }
        const recommendationLines = responseText.match(/\d+\.\s*[^\n]+/g);
        if (recommendationLines) {
          analysis.recommendations = recommendationLines.map((line) => line.replace(/^\d+\.\s*/, ""));
        }
        return analysis;
      } catch (error) {
        console.warn("\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u0430\u0440\u0441\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442, \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u044E \u0442\u0435\u043A\u0441\u0442 \u043A\u0430\u043A \u0435\u0441\u0442\u044C:", error);
        return {
          rawText: responseText,
          recommendations: [responseText]
        };
      }
    }
    /**
     * Выполняет тест напрямую из background script (для API тестов без визуальных действий)
     */
    executeTestFromBackground(test, mode, debugMode) {
      return __async(this, null, function* () {
        console.log(`\u{1F680} [Background] \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u044E \u0442\u0435\u0441\u0442 "${test.name}" \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E \u0438\u0437 background script`);
        if (test.variables) {
          console.log(`\u{1F504} [Background] \u041D\u0430\u0447\u0438\u043D\u0430\u044E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0438\u0437 localStorage...`);
          yield this.updateLocalStorageVariables(test.variables);
          console.log(`\u2705 [Background] \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0438\u0437 localStorage \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E`);
        }
        const userVariables = {};
        if (test.variables) {
          for (const [varName, varData] of Object.entries(test.variables)) {
            if (varData && typeof varData === "object" && varData.value !== void 0 && varData.value !== null) {
              userVariables[varName] = varData.value;
              console.log(`\u{1F4E6} [Background] \u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${varName}" = "${String(varData.value).substring(0, 50)}${String(varData.value).length > 50 ? "..." : ""}"`);
            } else if (varData !== void 0 && varData !== null && typeof varData !== "object") {
              userVariables[varName] = varData;
              console.log(`\u{1F4E6} [Background] \u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${varName}" (\u0441\u0442\u0430\u0440\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442) = "${String(varData).substring(0, 50)}${String(varData).length > 50 ? "..." : ""}"`);
            } else if (varData && typeof varData === "object" && varData.value === null) {
              userVariables[varName] = null;
              console.log(`\u{1F4E6} [Background] \u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${varName}" = null`);
            }
          }
          console.log(`\u{1F4E6} [Background] \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E ${Object.keys(userVariables).length} \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445`);
        }
        const loopVariables = {};
        const processVariables = (value) => __async(this, null, function* () {
          if (!value || typeof value !== "string") {
            return value;
          }
          let processedValue = value;
          const now = /* @__PURE__ */ new Date();
          const dateStr = now.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
          const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const datetimeStr = `${dateStr} ${timeStr}`;
          const timestamp = Math.floor(now.getTime() / 1e3);
          processedValue = processedValue.replace(/{date}/g, dateStr);
          processedValue = processedValue.replace(/{time}/g, timeStr);
          processedValue = processedValue.replace(/{datetime}/g, datetimeStr);
          processedValue = processedValue.replace(/{timestamp}/g, timestamp.toString());
          const counterRegex = /\{counter:([^}:]+)(?::(\d+))?\}/g;
          const counterMatches = [...processedValue.matchAll(counterRegex)];
          for (const match of counterMatches) {
            const counterName = match[1];
            const initialValue = match[2] ? parseInt(match[2], 10) : null;
            const fullMatch = match[0];
            try {
              const storageKey = `testCounter_${counterName}`;
              const result = yield chrome.storage.local.get(storageKey);
              let counterValue = result[storageKey];
              if (counterValue === void 0 || counterValue === null) {
                counterValue = initialValue !== null ? initialValue : 1;
              } else {
                counterValue++;
              }
              yield chrome.storage.local.set({ [storageKey]: counterValue });
              processedValue = processedValue.replace(fullMatch, counterValue.toString());
            } catch (error) {
              const fallbackValue = initialValue !== null ? initialValue : 1;
              processedValue = processedValue.replace(fullMatch, fallbackValue.toString());
            }
          }
          const varRegex = /\{var:([^}]+)\}/g;
          const varMatches = [...processedValue.matchAll(varRegex)];
          for (const match of varMatches) {
            const varName = match[1].trim();
            const fullMatch = match[0];
            let varValue = loopVariables[varName];
            if (varValue === void 0 || varValue === null) {
              varValue = userVariables[varName];
            }
            if (varValue !== void 0 && varValue !== null) {
              processedValue = processedValue.replace(fullMatch, String(varValue));
            } else {
              const availableUserVars = Object.keys(userVariables).join(", ") || "\u043D\u0435\u0442";
              const availableLoopVars = Object.keys(loopVariables).join(", ") || "\u043D\u0435\u0442";
              throw new Error(`\u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F {var:${varName}} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435 (userVariables): ${availableUserVars}. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435 (loopVariables): ${availableLoopVars}`);
            }
          }
          return processedValue;
        });
        const actionsToExecute = (test.actions || []).filter((action) => {
          return mode === "full" ? true : !action.hidden;
        });
        console.log(`\u{1F4CA} [Background] \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u044E ${actionsToExecute.length} \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 (\u0440\u0435\u0436\u0438\u043C: ${mode})`);
        const startTime = Date.now();
        const normalizedTestId = String(test.id);
        const runId = startTime + Math.floor(Math.random() * 1e3);
        const runHistory = {
          testId: normalizedTestId,
          testName: test.name,
          startTime: new Date(startTime).toISOString(),
          runId,
          mode,
          steps: [],
          success: false,
          error: null,
          totalDuration: 0
        };
        try {
          chrome.runtime.sendMessage({
            type: "STEP_PROGRESS_UPDATE",
            testId: normalizedTestId,
            step: 0,
            total: actionsToExecute.length,
            stepType: null
          }).catch(() => {
          });
        } catch (e) {
        }
        try {
          for (let i = 0; i < actionsToExecute.length; i++) {
            const action = actionsToExecute[i];
            const stepNumber = i + 1;
            const stepStartTime = Date.now();
            console.log(`
\u{1F4CB} [Background] \u0428\u0430\u0433 ${stepNumber}/${actionsToExecute.length}: ${action.type.toUpperCase()}`);
            try {
              if (action.type === "api") {
                const api = action.api || {};
                const method = api.method || "GET";
                let url = api.url || "";
                if (!url) {
                  throw new Error("URL \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u0434\u043B\u044F API \u0437\u0430\u043F\u0440\u043E\u0441\u0430");
                }
                if (url.includes("{var:") || url.includes("{date}") || url.includes("{time}") || url.includes("{counter:")) {
                  url = yield processVariables(url);
                }
                try {
                  new URL(url);
                } catch (urlError) {
                  throw new Error(`\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 URL: ${url}. \u041E\u0448\u0438\u0431\u043A\u0430: ${urlError.message}`);
                }
                console.log(`\u{1F310} [API] \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u044E ${method} \u0437\u0430\u043F\u0440\u043E\u0441: ${url}`);
                let headers = api.headers || {};
                const processedHeaders = {};
                if (Object.keys(headers).length > 0) {
                  for (const [key, value] of Object.entries(headers)) {
                    const headerValue = String(value);
                    if (headerValue.includes("{var:") || headerValue.includes("{date}") || headerValue.includes("{time}") || headerValue.includes("{counter:")) {
                      processedHeaders[key] = yield processVariables(headerValue);
                    } else {
                      processedHeaders[key] = headerValue;
                    }
                  }
                }
                let body = api.body || null;
                if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                  if (typeof body === "string") {
                    if (body.includes("{var:") || body.includes("{date}") || body.includes("{time}") || body.includes("{counter:")) {
                      body = yield processVariables(body);
                      if (body.trim().startsWith("{") || body.trim().startsWith("[")) {
                        try {
                          body = JSON.parse(body);
                        } catch (e) {
                        }
                      }
                    }
                  } else if (typeof body === "object") {
                    const hasVariables = JSON.stringify(body).includes("{var:") || JSON.stringify(body).includes("{date}") || JSON.stringify(body).includes("{time}") || JSON.stringify(body).includes("{counter:");
                    if (hasVariables) {
                      const processObject = (obj) => __async(this, null, function* () {
                        if (typeof obj === "string") {
                          if (obj.includes("{var:") || obj.includes("{date}") || obj.includes("{time}") || obj.includes("{counter:")) {
                            return yield processVariables(obj);
                          }
                          return obj;
                        } else if (Array.isArray(obj)) {
                          return yield Promise.all(obj.map((item) => processObject(item)));
                        } else if (obj && typeof obj === "object") {
                          const processed = {};
                          for (const [key, value] of Object.entries(obj)) {
                            processed[key] = yield processObject(value);
                          }
                          return processed;
                        }
                        return obj;
                      });
                      body = yield processObject(body);
                    }
                  }
                }
                const fetchOptions = {
                  method,
                  headers: __spreadValues({
                    "Content-Type": "application/json"
                  }, processedHeaders)
                };
                if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                  fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
                }
                let response;
                try {
                  response = yield fetch(url, fetchOptions);
                } catch (fetchError) {
                  const errorMessage = fetchError.message || "Failed to fetch";
                  console.error(`\u274C [API] \u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438 \u043F\u0440\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 \u0437\u0430\u043F\u0440\u043E\u0441\u0430: ${errorMessage}`);
                  console.error(`   URL: ${url}`);
                  console.error(`   Method: ${method}`);
                  if (errorMessage.includes("Failed to fetch") || errorMessage.includes("CORS") || errorMessage.includes("NetworkError")) {
                    throw new Error(`CORS \u0438\u043B\u0438 \u0441\u0435\u0442\u0435\u0432\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430: ${errorMessage}. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 URL \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 CORS \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. URL: ${url}`);
                  }
                  throw new Error(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438: ${errorMessage}`);
                }
                let parsedData = null;
                if (api.responseVariable || !response.ok) {
                  try {
                    const responseData = yield response.text();
                    try {
                      parsedData = JSON.parse(responseData);
                    } catch (e) {
                      parsedData = responseData;
                    }
                  } catch (readError) {
                    console.warn(`\u26A0\uFE0F [API] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0447\u0442\u0435\u043D\u0438\u0438 \u043E\u0442\u0432\u0435\u0442\u0430: ${readError.message}`);
                    parsedData = null;
                  }
                }
                if (!response.ok) {
                  const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                  console.error(`\u274C [API] \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0441\u0430: ${errorMessage}`);
                  console.error(`   URL: ${url}`);
                  console.error(`   Response:`, parsedData);
                  try {
                    chrome.runtime.sendMessage({
                      type: "SHOW_TOAST",
                      message: `\u274C API \u043E\u0448\u0438\u0431\u043A\u0430: ${errorMessage}`,
                      toastType: "error"
                    }).catch(() => {
                    });
                  } catch (e) {
                  }
                  throw new Error(errorMessage);
                }
                if (api.responseValidation && parsedData !== null) {
                  const validationResult = this.validateResponse(parsedData, api.responseValidation.schema);
                  if (!validationResult.valid) {
                    console.warn(`\u26A0\uFE0F [API] \u041E\u0442\u0432\u0435\u0442 \u043D\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0441\u0445\u0435\u043C\u0435: ${validationResult.errors.join(", ")}`);
                  }
                }
                if (api.responseVariable && parsedData !== null) {
                  userVariables[api.responseVariable] = parsedData;
                }
                const stepEndTime = Date.now();
                runHistory.steps.push({
                  stepNumber,
                  actionType: action.type,
                  success: true,
                  duration: stepEndTime - stepStartTime,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
                try {
                  chrome.runtime.sendMessage({
                    type: "STEP_COMPLETED_UPDATE",
                    testId: normalizedTestId,
                    step: stepNumber,
                    total: actionsToExecute.length,
                    success: true,
                    error: null,
                    stepType: action.type
                  }).catch(() => {
                  });
                  if (stepNumber < actionsToExecute.length) {
                    chrome.runtime.sendMessage({
                      type: "STEP_PROGRESS_UPDATE",
                      testId: normalizedTestId,
                      step: stepNumber + 1,
                      total: actionsToExecute.length,
                      stepType: null
                    }).catch(() => {
                    });
                  }
                } catch (e) {
                }
              } else if (action.type === "variable") {
                const variable = action.variable || {};
                const name = variable.name;
                let value = variable.value || "";
                if (variable.sourceType === "static") {
                  value = yield processVariables(value);
                } else if (variable.sourceType === "expression") {
                  const expression = variable.expression || "";
                  let calcExpression = yield processVariables(expression);
                  const varRegex = /\{var:([^}]+)\}/g;
                  const varMatches = [...calcExpression.matchAll(varRegex)];
                  for (const match of varMatches) {
                    const varName = match[1].trim();
                    const varValue = userVariables[varName];
                    if (varValue !== void 0) {
                      calcExpression = calcExpression.replace(match[0], String(varValue));
                    }
                  }
                  const safeVal = safeEvaluateArithmetic(calcExpression, {}, userVariables);
                  if (safeVal === void 0) {
                    throw new Error(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u044F "${expression}"`);
                  }
                  value = safeVal;
                }
                if (value !== void 0 && value !== null && value !== "") {
                  userVariables[name] = value;
                  console.log(`\u2705 [Background] \u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${name}" = "${value}"`);
                }
                const stepEndTime = Date.now();
                runHistory.steps.push({
                  stepNumber,
                  actionType: action.type,
                  success: true,
                  duration: stepEndTime - stepStartTime,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
                try {
                  chrome.runtime.sendMessage({
                    type: "STEP_COMPLETED_UPDATE",
                    testId: normalizedTestId,
                    step: stepNumber,
                    total: actionsToExecute.length,
                    success: true,
                    error: null,
                    stepType: action.type
                  }).catch(() => {
                  });
                  if (stepNumber < actionsToExecute.length) {
                    chrome.runtime.sendMessage({
                      type: "STEP_PROGRESS_UPDATE",
                      testId: normalizedTestId,
                      step: stepNumber + 1,
                      total: actionsToExecute.length,
                      stepType: null
                    }).catch(() => {
                    });
                  }
                } catch (e) {
                }
              } else if (action.type === "wait") {
                const delay = action.delay || action.value || 1e3;
                yield new Promise((resolve) => setTimeout(resolve, delay));
                const stepEndTime = Date.now();
                runHistory.steps.push({
                  stepNumber,
                  actionType: action.type,
                  success: true,
                  duration: stepEndTime - stepStartTime,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
                try {
                  chrome.runtime.sendMessage({
                    type: "STEP_COMPLETED_UPDATE",
                    testId: normalizedTestId,
                    step: stepNumber,
                    total: actionsToExecute.length,
                    success: true,
                    error: null,
                    stepType: action.type
                  }).catch(() => {
                  });
                  if (stepNumber < actionsToExecute.length) {
                    chrome.runtime.sendMessage({
                      type: "STEP_PROGRESS_UPDATE",
                      testId: normalizedTestId,
                      step: stepNumber + 1,
                      total: actionsToExecute.length,
                      stepType: null
                    }).catch(() => {
                    });
                  }
                } catch (e) {
                }
              } else if (action.type === "loop") {
                const loop = action.loop || {};
                const loopType = loop.type || "for";
                const loopActions = action.actions || [];
                const variable = loop.variable || "i";
                console.log(`\u{1F501} [Background] \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u044E \u0446\u0438\u043A\u043B \u0442\u0438\u043F\u0430 "${loopType}" \u0441 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439 "${variable}"`);
                const variablesToSave = /* @__PURE__ */ new Set();
                for (const loopAction of loopActions) {
                  if (loopAction.type === "variable" && loopAction.variable && loopAction.variable.name) {
                    variablesToSave.add(loopAction.variable.name);
                  }
                }
                const savedVariables = {};
                for (const varName of variablesToSave) {
                  if (userVariables.hasOwnProperty(varName)) {
                    savedVariables[varName] = userVariables[varName];
                    console.log(`\u{1F4BE} [Background Loop] \u0421\u043E\u0445\u0440\u0430\u043D\u044F\u044E \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0443\u044E "${varName}" = "${savedVariables[varName]}" \u043F\u0435\u0440\u0435\u0434 \u0432\u0445\u043E\u0434\u043E\u043C \u0432 \u0446\u0438\u043A\u043B`);
                  }
                }
                let initialValue = 0;
                if (userVariables.hasOwnProperty(variable) && userVariables[variable] !== void 0 && userVariables[variable] !== null) {
                  const existingValue = userVariables[variable];
                  const numValue = Number(existingValue);
                  if (!isNaN(numValue)) {
                    initialValue = numValue;
                    console.log(`\u{1F4CA} [Background Loop] \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439 "${variable}" = ${initialValue} \u043A\u0430\u043A \u043D\u0430\u0447\u0430\u043B\u044C\u043D\u043E\u0435`);
                  }
                }
                loopVariables[variable] = initialValue;
                if (loopType === "for") {
                  const count = loop.count || 5;
                  console.log(`  \u{1F4CA} [Background] \u0426\u0438\u043A\u043B for: ${count} \u0438\u0442\u0435\u0440\u0430\u0446\u0438\u0439`);
                  for (let i2 = 0; i2 < count; i2++) {
                    loopVariables[variable] = initialValue + i2 + 1;
                    console.log(`  \u{1F504} [Background] \u0418\u0442\u0435\u0440\u0430\u0446\u0438\u044F ${i2 + 1}/${count} (${variable} = ${initialValue + i2 + 1})`);
                    for (const loopAction of loopActions) {
                      if (mode === "full" || !loopAction.hidden) {
                        if (loopAction.type === "api") {
                          const api = loopAction.api || {};
                          const method = api.method || "GET";
                          let url = api.url || "";
                          if (url.includes("{var:") || url.includes("{date}") || url.includes("{time}") || url.includes("{counter:")) {
                            url = yield processVariables(url);
                          }
                          let headers = api.headers || {};
                          const processedHeaders = {};
                          if (Object.keys(headers).length > 0) {
                            for (const [key, value] of Object.entries(headers)) {
                              const headerValue = String(value);
                              if (headerValue.includes("{var:") || headerValue.includes("{date}") || headerValue.includes("{time}") || headerValue.includes("{counter:")) {
                                processedHeaders[key] = yield processVariables(headerValue);
                              } else {
                                processedHeaders[key] = headerValue;
                              }
                            }
                          }
                          let body = api.body || null;
                          if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                            if (typeof body === "string") {
                              if (body.includes("{var:") || body.includes("{date}") || body.includes("{time}") || body.includes("{counter:")) {
                                body = yield processVariables(body);
                                if (body.trim().startsWith("{") || body.trim().startsWith("[")) {
                                  try {
                                    body = JSON.parse(body);
                                  } catch (e) {
                                  }
                                }
                              }
                            } else if (typeof body === "object") {
                              const bodyStr = JSON.stringify(body);
                              if (bodyStr.includes("{var:") || bodyStr.includes("{date}") || bodyStr.includes("{time}") || bodyStr.includes("{counter:")) {
                                body = JSON.parse(yield processVariables(bodyStr));
                              }
                            }
                          }
                          const fetchOptions = {
                            method,
                            headers: __spreadValues({
                              "Content-Type": "application/json"
                            }, processedHeaders)
                          };
                          if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                            fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
                          }
                          const response = yield fetch(url, fetchOptions);
                          let parsedData = null;
                          if (api.responseVariable || !response.ok) {
                            const responseData = yield response.text();
                            try {
                              parsedData = JSON.parse(responseData);
                            } catch (e) {
                              parsedData = responseData;
                            }
                          }
                          if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                          }
                          if (api.responseVariable && parsedData !== null) {
                            userVariables[api.responseVariable] = parsedData;
                          }
                        } else if (loopAction.type === "variable") {
                          const varAction = loopAction.variable || {};
                          const name = varAction.name;
                          let value = varAction.value || "";
                          if (varAction.sourceType === "static") {
                            value = yield processVariables(value);
                          } else if (varAction.sourceType === "expression") {
                            const expression = varAction.expression || "";
                            let calcExpression = expression;
                            const varRegex = /\{var:([^}]+)\}/g;
                            const varMatches = [...calcExpression.matchAll(varRegex)];
                            for (const match of varMatches) {
                              const varName = match[1].trim();
                              const varValue = userVariables[varName] !== void 0 ? userVariables[varName] : loopVariables[varName];
                              if (varValue !== void 0) {
                                calcExpression = calcExpression.replace(match[0], String(varValue));
                              }
                            }
                            const safeValLoop = safeEvaluateArithmetic(calcExpression, loopVariables, userVariables);
                            if (safeValLoop === void 0) {
                              throw new Error(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u044F "${expression}"`);
                            }
                            value = safeValLoop;
                          }
                          if (value !== void 0 && value !== null && value !== "") {
                            userVariables[name] = value;
                            console.log(`\u2705 [Background] \u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${name}" = "${value}"`);
                          }
                        } else if (loopAction.type === "wait") {
                          const delay = loopAction.delay || loopAction.value || 1e3;
                          yield new Promise((resolve) => setTimeout(resolve, delay));
                        } else if (loopAction.type === "loop") {
                          console.log(`  \u{1F501} [Background] \u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u0446\u0438\u043A\u043B \u0432\u043D\u0443\u0442\u0440\u0438 \u0446\u0438\u043A\u043B\u0430`);
                          console.warn(`\u26A0\uFE0F [Background] \u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0435 \u0446\u0438\u043A\u043B\u044B \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0432 background script`);
                        }
                      }
                    }
                  }
                  loopVariables[variable] = initialValue + count;
                  console.log(`  \u2705 [Background] \u0426\u0438\u043A\u043B for \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D (${variable} = ${initialValue + count})`);
                } else if (loopType === "while") {
                  const condition = loop.condition || "";
                  let iteration = 0;
                  let maxIterations = 1e3;
                  const evaluateCondition = (conditionStr, varName) => {
                    if (!conditionStr) return false;
                    let varValue = loopVariables[varName];
                    if (varValue === void 0 || varValue === null) {
                      varValue = userVariables[varName];
                    }
                    if (varValue === void 0 || varValue === null) {
                      varValue = 0;
                    }
                    const numValue = Number(varValue);
                    if (!isNaN(numValue) && isFinite(numValue)) {
                      varValue = numValue;
                    }
                    let conditionWithVar = conditionStr;
                    try {
                      const escapedVarName = String(varName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                      conditionWithVar = conditionStr.replace(new RegExp(`\\b${escapedVarName}\\b`, "g"), String(varValue));
                    } catch (e) {
                      console.warn("\u26A0\uFE0F [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0434\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439 \u0432 \u0443\u0441\u043B\u043E\u0432\u0438\u0438:", e.message);
                    }
                    console.log(`\u{1F50D} [Background Condition] \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E \u0443\u0441\u043B\u043E\u0432\u0438\u0435 "${conditionStr}" \u0441 ${varName}=${varValue} -> "${conditionWithVar}"`);
                    try {
                      const operators = ["<=", ">=", "===", "!==", "==", "!=", "<", ">"];
                      for (const op of operators) {
                        if (conditionWithVar.includes(op)) {
                          const parts = conditionWithVar.split(op).map((p) => p.trim());
                          if (parts.length === 2) {
                            const evaluateExpression = (expr) => {
                              const num = parseFloat(String(expr).trim());
                              if (!isNaN(num) && isFinite(num) && String(expr).trim() === String(num)) return num;
                              const safeVal = safeEvaluateArithmetic(expr, loopVariables, userVariables);
                              return safeVal !== void 0 ? safeVal : 0;
                            };
                            const left = evaluateExpression(parts[0]);
                            const right = evaluateExpression(parts[1]);
                            let result = false;
                            switch (op) {
                              case "<":
                                result = left < right;
                                break;
                              case "<=":
                                result = left <= right;
                                break;
                              case ">":
                                result = left > right;
                                break;
                              case ">=":
                                result = left >= right;
                                break;
                              case "===":
                                result = left === right;
                                break;
                              case "!==":
                                result = left !== right;
                                break;
                              case "==":
                                result = left == right;
                                break;
                              case "!=":
                                result = left != right;
                                break;
                            }
                            console.log(`\u{1F50D} [Background Condition] \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442: ${left} ${op} ${right} = ${result}`);
                            return result;
                          }
                        }
                      }
                      return false;
                    } catch (e) {
                      console.warn(`\u26A0\uFE0F [Background Condition] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F "${conditionStr}":`, e);
                      return false;
                    }
                  };
                  while (iteration < maxIterations) {
                    const conditionResult = evaluateCondition(condition, variable);
                    if (!conditionResult) {
                      console.log(`  \u2705 [Background] \u0423\u0441\u043B\u043E\u0432\u0438\u0435 "${condition}" \u0441\u0442\u0430\u043B\u043E \u043B\u043E\u0436\u043D\u044B\u043C (${variable} = ${loopVariables[variable]}), \u0432\u044B\u0445\u043E\u0434\u0438\u043C \u0438\u0437 \u0446\u0438\u043A\u043B\u0430`);
                      break;
                    }
                    console.log(`  \u{1F504} [Background] \u0418\u0442\u0435\u0440\u0430\u0446\u0438\u044F ${iteration + 1} (${variable} = ${loopVariables[variable]})`);
                    for (const loopAction of loopActions) {
                      if (mode === "full" || !loopAction.hidden) {
                        if (loopAction.type === "api") {
                          const api = loopAction.api || {};
                          const method = api.method || "GET";
                          let url = api.url || "";
                          if (url.includes("{var:") || url.includes("{date}") || url.includes("{time}") || url.includes("{counter:")) {
                            url = yield processVariables(url);
                          }
                          let headers = api.headers || {};
                          const processedHeaders = {};
                          if (Object.keys(headers).length > 0) {
                            for (const [key, value] of Object.entries(headers)) {
                              const headerValue = String(value);
                              if (headerValue.includes("{var:") || headerValue.includes("{date}") || headerValue.includes("{time}") || headerValue.includes("{counter:")) {
                                processedHeaders[key] = yield processVariables(headerValue);
                              } else {
                                processedHeaders[key] = headerValue;
                              }
                            }
                          }
                          let body = api.body || null;
                          if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                            if (typeof body === "string") {
                              if (body.includes("{var:") || body.includes("{date}") || body.includes("{time}") || body.includes("{counter:")) {
                                body = yield processVariables(body);
                                if (body.trim().startsWith("{") || body.trim().startsWith("[")) {
                                  try {
                                    body = JSON.parse(body);
                                  } catch (e) {
                                  }
                                }
                              }
                            } else if (typeof body === "object") {
                              const bodyStr = JSON.stringify(body);
                              if (bodyStr.includes("{var:") || bodyStr.includes("{date}") || bodyStr.includes("{time}") || bodyStr.includes("{counter:")) {
                                body = JSON.parse(yield processVariables(bodyStr));
                              }
                            }
                          }
                          const fetchOptions = {
                            method,
                            headers: __spreadValues({
                              "Content-Type": "application/json"
                            }, processedHeaders)
                          };
                          if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                            fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
                          }
                          const response = yield fetch(url, fetchOptions);
                          let parsedData = null;
                          if (api.responseVariable || !response.ok) {
                            const responseData = yield response.text();
                            try {
                              parsedData = JSON.parse(responseData);
                            } catch (e) {
                              parsedData = responseData;
                            }
                          }
                          if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                          }
                          if (api.responseVariable && parsedData !== null) {
                            userVariables[api.responseVariable] = parsedData;
                          }
                        } else if (loopAction.type === "variable") {
                          const varAction = loopAction.variable || {};
                          const name = varAction.name;
                          let value = varAction.value || "";
                          if (varAction.sourceType === "static") {
                            value = yield processVariables(value);
                          } else if (varAction.sourceType === "expression") {
                            const expression = varAction.expression || "";
                            let calcExpression = expression;
                            const varRegex = /\{var:([^}]+)\}/g;
                            const varMatches = [...calcExpression.matchAll(varRegex)];
                            for (const match of varMatches) {
                              const varName = match[1].trim();
                              const varValue = userVariables[varName] !== void 0 ? userVariables[varName] : loopVariables[varName];
                              if (varValue !== void 0) {
                                calcExpression = calcExpression.replace(match[0], String(varValue));
                              }
                            }
                            const safeValWhile = safeEvaluateArithmetic(calcExpression, loopVariables, userVariables);
                            if (safeValWhile === void 0) {
                              throw new Error(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u044F "${expression}"`);
                            }
                            value = safeValWhile;
                          }
                          if (value !== void 0 && value !== null && value !== "") {
                            userVariables[name] = value;
                            console.log(`\u2705 [Background] \u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${name}" = "${value}"`);
                          }
                        } else if (loopAction.type === "wait") {
                          const delay = loopAction.delay || loopAction.value || 1e3;
                          yield new Promise((resolve) => setTimeout(resolve, delay));
                        } else if (loopAction.type === "loop") {
                          console.log(`  \u{1F501} [Background] \u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u0446\u0438\u043A\u043B \u0432\u043D\u0443\u0442\u0440\u0438 \u0446\u0438\u043A\u043B\u0430`);
                          console.warn(`\u26A0\uFE0F [Background] \u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0435 \u0446\u0438\u043A\u043B\u044B \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0432 background script`);
                        }
                      }
                    }
                    iteration++;
                    loopVariables[variable] = initialValue + iteration;
                  }
                  if (iteration >= maxIterations) {
                    console.warn(`\u26A0\uFE0F [Background] \u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442\u043E \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0438\u0442\u0435\u0440\u0430\u0446\u0438\u0439 (${maxIterations}), \u0432\u044B\u0445\u043E\u0434\u0438\u043C \u0438\u0437 \u0446\u0438\u043A\u043B\u0430`);
                  }
                  console.log(`  \u2705 [Background] \u0426\u0438\u043A\u043B while \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D (${variable} = ${initialValue + iteration})`);
                }
                for (const varName of variablesToSave) {
                  if (savedVariables.hasOwnProperty(varName)) {
                    userVariables[varName] = savedVariables[varName];
                    console.log(`\u{1F504} [Background Loop] \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0443\u044E "${varName}" = "${savedVariables[varName]}" \u043F\u043E\u0441\u043B\u0435 \u0432\u044B\u0445\u043E\u0434\u0430 \u0438\u0437 \u0446\u0438\u043A\u043B\u0430`);
                  } else {
                    delete userVariables[varName];
                    console.log(`\u{1F5D1}\uFE0F [Background Loop] \u0423\u0434\u0430\u043B\u044F\u044E \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0443\u044E "${varName}", \u0442\u0430\u043A \u043A\u0430\u043A \u043E\u043D\u0430 \u043D\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043E\u0432\u0430\u043B\u0430 \u0434\u043E \u0446\u0438\u043A\u043B\u0430`);
                  }
                }
                const stepEndTime = Date.now();
                runHistory.steps.push({
                  stepNumber,
                  actionType: action.type,
                  success: true,
                  duration: stepEndTime - stepStartTime,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
                try {
                  chrome.runtime.sendMessage({
                    type: "STEP_COMPLETED_UPDATE",
                    testId: normalizedTestId,
                    step: stepNumber,
                    total: actionsToExecute.length,
                    success: true,
                    error: null,
                    stepType: action.type
                  }).catch(() => {
                  });
                  if (stepNumber < actionsToExecute.length) {
                    chrome.runtime.sendMessage({
                      type: "STEP_PROGRESS_UPDATE",
                      testId: normalizedTestId,
                      step: stepNumber + 1,
                      total: actionsToExecute.length,
                      stepType: null
                    }).catch(() => {
                    });
                  }
                } catch (e) {
                }
              } else if (action.type === "condition") {
                const condition = action.condition || {};
                const expression = condition.expression || "";
                const operator = condition.operator || "exists";
                const value = condition.value || "";
                const thenActions = action.thenActions || [];
                const elseActions = action.elseActions || [];
                console.log(`\u{1F500} [Background] \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E \u0443\u0441\u043B\u043E\u0432\u0438\u0435: ${expression} ${operator} ${value || ""}`);
                let conditionResult = false;
                let processedExpression = expression;
                const varRegex = /\{var:([^}]+)\}/g;
                const varMatches = [...expression.matchAll(varRegex)];
                for (const match of varMatches) {
                  const varName = match[1].trim();
                  const varValue = userVariables[varName] !== void 0 ? userVariables[varName] : loopVariables[varName];
                  if (varValue !== void 0 && varValue !== null) {
                    processedExpression = processedExpression.replace(match[0], String(varValue));
                  }
                }
                let processedValue = value;
                if (value && typeof value === "string") {
                  const valueVarMatches = [...value.matchAll(varRegex)];
                  for (const match of valueVarMatches) {
                    const varName = match[1].trim();
                    const varValue = userVariables[varName] !== void 0 ? userVariables[varName] : loopVariables[varName];
                    if (varValue !== void 0 && varValue !== null) {
                      processedValue = processedValue.replace(match[0], String(varValue));
                    }
                  }
                }
                if (operator === "exists") {
                  if (varMatches.length > 0) {
                    const varName = varMatches[0][1].trim();
                    const varValue = userVariables[varName] !== void 0 ? userVariables[varName] : loopVariables[varName];
                    conditionResult = varValue !== void 0 && varValue !== null && varValue !== "";
                  } else {
                    conditionResult = true;
                  }
                } else if (operator === "equals") {
                  conditionResult = String(processedExpression) === String(processedValue);
                } else if (operator === "contains") {
                  conditionResult = String(processedExpression).includes(String(processedValue));
                } else if (operator === "not_equals" || operator === "notEquals") {
                  conditionResult = String(processedExpression) !== String(processedValue);
                } else if (operator === "greater" || operator === ">") {
                  const left = parseFloat(processedExpression) || 0;
                  const right = parseFloat(processedValue) || 0;
                  conditionResult = left > right;
                } else if (operator === "less" || operator === "<") {
                  const left = parseFloat(processedExpression) || 0;
                  const right = parseFloat(processedValue) || 0;
                  conditionResult = left < right;
                } else {
                  conditionResult = true;
                }
                const executeNestedActions = (nestedActions) => __async(this, null, function* () {
                  for (const nestedAction of nestedActions) {
                    if (mode === "full" || !nestedAction.hidden) {
                      if (nestedAction.type === "api") {
                        const api = nestedAction.api || {};
                        const method = api.method || "GET";
                        let url = api.url || "";
                        if (url.includes("{var:") || url.includes("{date}") || url.includes("{time}") || url.includes("{counter:")) {
                          url = yield processVariables(url);
                        }
                        let headers = api.headers || {};
                        const processedHeaders = {};
                        if (Object.keys(headers).length > 0) {
                          for (const [key, headerValue] of Object.entries(headers)) {
                            const headerValueStr = String(headerValue);
                            if (headerValueStr.includes("{var:") || headerValueStr.includes("{date}") || headerValueStr.includes("{time}") || headerValueStr.includes("{counter:")) {
                              processedHeaders[key] = yield processVariables(headerValueStr);
                            } else {
                              processedHeaders[key] = headerValueStr;
                            }
                          }
                        }
                        let body = api.body || null;
                        if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                          if (typeof body === "string") {
                            if (body.includes("{var:") || body.includes("{date}") || body.includes("{time}") || body.includes("{counter:")) {
                              body = yield processVariables(body);
                              if (body.trim().startsWith("{") || body.trim().startsWith("[")) {
                                try {
                                  body = JSON.parse(body);
                                } catch (e) {
                                }
                              }
                            }
                          } else if (typeof body === "object") {
                            const bodyStr = JSON.stringify(body);
                            if (bodyStr.includes("{var:") || bodyStr.includes("{date}") || bodyStr.includes("{time}") || bodyStr.includes("{counter:")) {
                              body = JSON.parse(yield processVariables(bodyStr));
                            }
                          }
                        }
                        const fetchOptions = {
                          method,
                          headers: __spreadValues({
                            "Content-Type": "application/json"
                          }, processedHeaders)
                        };
                        if (body && ["POST", "PUT", "PATCH"].includes(method)) {
                          fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
                        }
                        const response = yield fetch(url, fetchOptions);
                        let parsedData = null;
                        if (api.responseVariable || !response.ok) {
                          const responseData = yield response.text();
                          try {
                            parsedData = JSON.parse(responseData);
                          } catch (e) {
                            parsedData = responseData;
                          }
                        }
                        if (!response.ok) {
                          const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                          console.error(`\u274C [API] \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0441\u0430: ${errorMessage}`);
                          try {
                            chrome.runtime.sendMessage({
                              type: "SHOW_TOAST",
                              message: `\u274C API \u043E\u0448\u0438\u0431\u043A\u0430: ${errorMessage}`,
                              toastType: "error"
                            }).catch(() => {
                            });
                          } catch (e) {
                          }
                          throw new Error(errorMessage);
                        }
                        if (api.responseVariable && parsedData !== null) {
                          userVariables[api.responseVariable] = parsedData;
                        }
                      } else if (nestedAction.type === "variable") {
                        const varAction = nestedAction.variable || {};
                        const name = varAction.name;
                        let varValue = varAction.value || "";
                        if (varAction.sourceType === "static") {
                          varValue = yield processVariables(varValue);
                        } else if (varAction.sourceType === "expression") {
                          const expr = varAction.expression || "";
                          let calcExpression = expr;
                          const varRegex2 = /\{var:([^}]+)\}/g;
                          const varMatches2 = [...calcExpression.matchAll(varRegex2)];
                          for (const match of varMatches2) {
                            const varName = match[1].trim();
                            const varVal = userVariables[varName] !== void 0 ? userVariables[varName] : loopVariables[varName];
                            if (varVal !== void 0) {
                              calcExpression = calcExpression.replace(match[0], String(varVal));
                            }
                          }
                          const safeValNested = safeEvaluateArithmetic(calcExpression, loopVariables, userVariables);
                          if (safeValNested === void 0) {
                            throw new Error(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u044F "${expr}"`);
                          }
                          varValue = safeValNested;
                        }
                        if (varValue !== void 0 && varValue !== null && varValue !== "") {
                          userVariables[name] = varValue;
                          console.log(`\u2705 [Background] \u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${name}" = "${varValue}"`);
                        }
                      } else if (nestedAction.type === "wait") {
                        const delay = nestedAction.delay || nestedAction.value || 1e3;
                        yield new Promise((resolve) => setTimeout(resolve, delay));
                      } else if (nestedAction.type === "loop") {
                        console.warn(`\u26A0\uFE0F [Background] \u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0435 \u0446\u0438\u043A\u043B\u044B \u0432\u043D\u0443\u0442\u0440\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0432 background script`);
                      } else if (nestedAction.type === "condition") {
                        console.warn(`\u26A0\uFE0F [Background] \u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0432 background script`);
                      }
                    }
                  }
                });
                if (conditionResult) {
                  console.log(`  \u2705 [Background] \u0423\u0441\u043B\u043E\u0432\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E, \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0438\u0437 \u0432\u0435\u0442\u043A\u0438 "\u0422\u043E\u0433\u0434\u0430"`);
                  yield executeNestedActions(thenActions);
                } else {
                  console.log(`  \u274C [Background] \u0423\u0441\u043B\u043E\u0432\u0438\u0435 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E, \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0438\u0437 \u0432\u0435\u0442\u043A\u0438 "\u0418\u043D\u0430\u0447\u0435"`);
                  if (elseActions.length > 0) {
                    yield executeNestedActions(elseActions);
                  }
                }
                const stepEndTime = Date.now();
                runHistory.steps.push({
                  stepNumber,
                  actionType: action.type,
                  success: true,
                  duration: stepEndTime - stepStartTime,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
                try {
                  chrome.runtime.sendMessage({
                    type: "STEP_COMPLETED_UPDATE",
                    testId: normalizedTestId,
                    step: stepNumber,
                    total: actionsToExecute.length,
                    success: true,
                    error: null,
                    stepType: action.type
                  }).catch(() => {
                  });
                  if (stepNumber < actionsToExecute.length) {
                    chrome.runtime.sendMessage({
                      type: "STEP_PROGRESS_UPDATE",
                      testId: normalizedTestId,
                      step: stepNumber + 1,
                      total: actionsToExecute.length,
                      stepType: null
                    }).catch(() => {
                    });
                  }
                } catch (e) {
                }
              } else {
                console.warn(`\u26A0\uFE0F [Background] \u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0442\u0438\u043F\u0430 "${action.type}" (\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430)`);
              }
            } catch (error) {
              const errorMessage = (error == null ? void 0 : error.message) || String(error) || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
              console.error(`\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430 \u0448\u0430\u0433\u0435 ${stepNumber}:`, errorMessage);
              if (action.type === "api") {
                try {
                  chrome.runtime.sendMessage({
                    type: "SHOW_TOAST",
                    message: `\u274C API \u043E\u0448\u0438\u0431\u043A\u0430: ${errorMessage}`,
                    toastType: "error"
                  }).catch(() => {
                  });
                } catch (e) {
                }
              }
              const stepEndTime = Date.now();
              runHistory.steps.push({
                stepNumber,
                actionType: action.type,
                success: false,
                error: errorMessage,
                duration: stepEndTime - stepStartTime,
                timestamp: (/* @__PURE__ */ new Date()).toISOString()
              });
              try {
                chrome.runtime.sendMessage({
                  type: "STEP_COMPLETED_UPDATE",
                  testId: normalizedTestId,
                  step: stepNumber,
                  total: actionsToExecute.length,
                  success: false,
                  error: error.message
                }).catch(() => {
                });
              } catch (e) {
              }
              throw error;
            }
          }
          const endTime = Date.now();
          runHistory.success = true;
          runHistory.totalDuration = endTime - startTime;
          console.log(`\u2705 [Background] \u0422\u0435\u0441\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0437\u0430 ${runHistory.totalDuration}ms`);
        } catch (error) {
          const endTime = Date.now();
          runHistory.success = false;
          runHistory.error = error.message;
          runHistory.totalDuration = endTime - startTime;
          console.error(`\u274C [Background] \u0422\u0435\u0441\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439:`, error);
        } finally {
          this.addTestRunHistory(normalizedTestId, runHistory);
          try {
            yield this.saveTestHistory();
            console.log(`\u2705 [Background] \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430`);
          } catch (error) {
            console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438:", error);
          }
          try {
            if (!this.currentGroupId) {
              chrome.runtime.sendMessage({
                type: "TEST_COMPLETED",
                testId: normalizedTestId,
                success: runHistory.success,
                error: runHistory.error || null,
                totalSteps: actionsToExecute.length,
                duration: runHistory.totalDuration
              }).catch(() => {
              });
              console.log(`\u2705 [Background] \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 TEST_COMPLETED (success: ${runHistory.success})`);
            }
          } catch (e) {
            console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 TEST_COMPLETED:", e);
          }
        }
      });
    }
    /**
     * Обновляет переменные из localStorage перед запуском теста
     */
    updateLocalStorageVariables(variables) {
      return __async(this, null, function* () {
        const localStorageVars = [];
        for (const [varName, varData] of Object.entries(variables)) {
          if (varData && typeof varData === "object" && varData.source === "localStorage" && varData.localStorageKey && varData.tabId) {
            localStorageVars.push({
              name: varName,
              key: varData.localStorageKey,
              tabId: varData.tabId
            });
          }
        }
        if (localStorageVars.length === 0) {
          return;
        }
        console.log(`\u{1F504} [Background] \u041E\u0431\u043D\u043E\u0432\u043B\u044F\u044E ${localStorageVars.length} \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0438\u0437 localStorage`);
        const varsByTab = {};
        for (const varInfo of localStorageVars) {
          if (!varsByTab[varInfo.tabId]) {
            varsByTab[varInfo.tabId] = [];
          }
          varsByTab[varInfo.tabId].push(varInfo);
        }
        for (const [tabId, vars] of Object.entries(varsByTab)) {
          try {
            const tabIdNum = parseInt(tabId, 10);
            let tab;
            try {
              tab = yield chrome.tabs.get(tabIdNum);
            } catch (e) {
              console.warn(`\u26A0\uFE0F [Background] \u0412\u043A\u043B\u0430\u0434\u043A\u0430 ${tabIdNum} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430, \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445`);
              continue;
            }
            if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
              console.warn(`\u26A0\uFE0F [Background] \u0412\u043A\u043B\u0430\u0434\u043A\u0430 ${tabIdNum} \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0434\u043B\u044F \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F localStorage`);
              continue;
            }
            let localStorageData = null;
            try {
              const response = yield chrome.tabs.sendMessage(tabIdNum, { type: "GET_LOCAL_STORAGE" });
              if (response && response.success && response.data) {
                localStorageData = response.data;
                console.log(`\u2705 [Background] \u041F\u043E\u043B\u0443\u0447\u0435\u043D localStorage \u0441 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabIdNum} \u0447\u0435\u0440\u0435\u0437 content script`);
              }
            } catch (sendMessageError) {
              console.log(`\u2139\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C localStorage \u0447\u0435\u0440\u0435\u0437 sendMessage, \u043F\u0440\u043E\u0431\u0443\u044E executeScript: ${sendMessageError.message}`);
            }
            if (!localStorageData) {
              try {
                const keysResult = yield chrome.scripting.executeScript({
                  target: { tabId: tabIdNum },
                  func: () => {
                    try {
                      const keys = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        keys.push(localStorage.key(i));
                      }
                      return keys;
                    } catch (e) {
                      return [];
                    }
                  }
                });
                if (keysResult && keysResult[0] && keysResult[0].result) {
                  const keys = keysResult[0].result;
                  localStorageData = {};
                  for (const key of keys) {
                    try {
                      const valueResult = yield chrome.scripting.executeScript({
                        target: { tabId: tabIdNum },
                        func: (k) => {
                          try {
                            return localStorage.getItem(k);
                          } catch (e) {
                            return null;
                          }
                        },
                        args: [key]
                      });
                      if (valueResult && valueResult[0] && valueResult[0].result !== null) {
                        localStorageData[key] = valueResult[0].result;
                      }
                    } catch (e) {
                      console.warn(`\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u043A\u043B\u044E\u0447\u0430 "${key}": ${e.message}`);
                    }
                  }
                  if (Object.keys(localStorageData).length > 0) {
                    console.log(`\u2705 [Background] \u041F\u043E\u043B\u0443\u0447\u0435\u043D localStorage \u0441 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabIdNum} \u0447\u0435\u0440\u0435\u0437 executeScript`);
                  }
                }
              } catch (executeError) {
                console.warn(`\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C localStorage \u0441 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabIdNum} \u0447\u0435\u0440\u0435\u0437 executeScript: ${executeError.message}`);
              }
            }
            if (localStorageData) {
              for (const varInfo of vars) {
                const value = localStorageData[varInfo.key];
                if (value !== void 0) {
                  variables[varInfo.name].value = value;
                  console.log(`\u2705 [Background] \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${varInfo.name}" \u0438\u0437 localStorage (\u043A\u043B\u044E\u0447: ${varInfo.key}, \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: ${value === null ? "null" : String(value).substring(0, 50) + (String(value).length > 50 ? "..." : "")})`);
                } else {
                  console.warn(`\u26A0\uFE0F [Background] \u041A\u043B\u044E\u0447 "${varInfo.key}" \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 localStorage \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabIdNum}`);
                }
              }
            } else {
              console.warn(`\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C localStorage \u0441 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabIdNum}`);
            }
          } catch (error) {
            console.error(`\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0438\u0437 localStorage \u0434\u043B\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabId}:`, error);
          }
        }
      });
    }
    /**
     * Валидирует ответ API по схеме JSON Schema
     * @param {any} data - Данные для валидации
     * @param {Object} schema - JSON Schema
     * @returns {Object} Результат валидации {valid: boolean, errors: string[]}
     */
    validateResponse(data, schema) {
      const errors = [];
      if (!schema) {
        return { valid: true, errors: [] };
      }
      if (schema.$ref) {
        return { valid: true, errors: [] };
      }
      if (schema.type) {
        const dataType = Array.isArray(data) ? "array" : typeof data;
        if (schema.type === "object" && dataType !== "object") {
          errors.push(`\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u044A\u0435\u043A\u0442, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${dataType}`);
        } else if (schema.type === "array" && dataType !== "array") {
          errors.push(`\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043C\u0430\u0441\u0441\u0438\u0432, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${dataType}`);
        } else if (schema.type === "string" && dataType !== "string") {
          errors.push(`\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u0442\u0440\u043E\u043A\u0430, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${dataType}`);
        } else if (schema.type === "number" && dataType !== "number") {
          errors.push(`\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0447\u0438\u0441\u043B\u043E, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${dataType}`);
        } else if (schema.type === "integer" && (dataType !== "number" || !Number.isInteger(data))) {
          errors.push(`\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0446\u0435\u043B\u043E\u0435 \u0447\u0438\u0441\u043B\u043E, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${dataType}`);
        } else if (schema.type === "boolean" && dataType !== "boolean") {
          errors.push(`\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0431\u0443\u043B\u0435\u0432\u043E \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${dataType}`);
        }
      }
      if (schema.type === "object" && schema.required && Array.isArray(data) === false) {
        for (const field of schema.required) {
          if (!(field in data)) {
            errors.push(`\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435: ${field}`);
          }
        }
      }
      if (schema.type === "object" && schema.properties && Array.isArray(data) === false) {
        for (const [key, value] of Object.entries(data)) {
          if (schema.properties[key]) {
            const propValidation = this.validateResponse(value, schema.properties[key]);
            if (!propValidation.valid) {
              errors.push(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0432 \u043F\u043E\u043B\u0435 "${key}": ${propValidation.errors.join(", ")}`);
            }
          }
        }
      }
      if (schema.type === "array" && schema.items && Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          const itemValidation = this.validateResponse(data[i], schema.items);
          if (!itemValidation.valid) {
            errors.push(`\u041E\u0448\u0438\u0431\u043A\u0430 \u0432 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0435 \u043C\u0430\u0441\u0441\u0438\u0432\u0430 [${i}]: ${itemValidation.errors.join(", ")}`);
          }
        }
      }
      return {
        valid: errors.length === 0,
        errors
      };
    }
  };
  var testManager = new TestManager();
  var networkRequests = /* @__PURE__ */ new Map();
  var isNetworkMonitoring = false;
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!isNetworkMonitoring) return;
      const tabId = details.tabId;
      if (tabId < 0) return;
      if (!networkRequests.has(tabId)) {
        networkRequests.set(tabId, []);
      }
      const requests = networkRequests.get(tabId);
      if (requests.length >= 100) {
        requests.shift();
      }
      requests.push({
        id: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type,
        timestamp: Date.now(),
        status: "pending"
      });
    },
    { urls: ["<all_urls>"] }
  );
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (!isNetworkMonitoring) return;
      const tabId = details.tabId;
      if (tabId < 0) return;
      const requests = networkRequests.get(tabId);
      if (!requests) return;
      const request = requests.find((r) => r.id === details.requestId);
      if (request) {
        request.status = "completed";
        request.statusCode = details.statusCode;
        request.completedAt = Date.now();
        request.duration = request.completedAt - request.timestamp;
      }
    },
    { urls: ["<all_urls>"] }
  );
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (!isNetworkMonitoring) return;
      const tabId = details.tabId;
      if (tabId < 0) return;
      const requests = networkRequests.get(tabId);
      if (!requests) return;
      const request = requests.find((r) => r.id === details.requestId);
      if (request) {
        request.status = "error";
        request.error = details.error;
        request.completedAt = Date.now();
        request.duration = request.completedAt - request.timestamp;
      }
    },
    { urls: ["<all_urls>"] }
  );
  chrome.tabs.onRemoved.addListener((tabId) => {
    networkRequests.delete(tabId);
    testManager.onPlaybackTabRemoved(tabId);
  });
  console.log("[Background] Network monitoring initialized");
})();

if (typeof self.registerBackgroundMessageHandlers !== "undefined") {}
