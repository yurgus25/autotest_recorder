(() => {
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
  const FREE_TIER_TEST_LIMIT = 10;
  const ENABLE_FREEMIUM_LIMITS = false;
  function requireAccess(action, sendResponse2) {
    return __async(this, null, function* () {
      if (!self.AccessPolicy || !self.AccessPolicy.can) return true;
      const decision = yield self.AccessPolicy.can(action);
      if (decision.allowed) return true;
      sendResponse2({
        success: false,
        error: "TIER_REQUIRED",
        requiredTier: decision.requiredTier,
        tier: decision.tier,
        action: decision.action
      });
      return false;
    });
  }
  function getTestById(manager2, testId) {
    if (testId == null) return void 0;
    return manager2.tests.get(testId) || manager2.tests.get(String(testId)) || (typeof testId === "string" && /^\d+$/.test(testId) ? manager2.tests.get(Number(testId)) : void 0);
  }
  function formatAppliedWhen(appliedWhen) {
    if (!appliedWhen) return "";
    const map = {
      during_playback: "\u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0442\u0435\u0441\u0442\u0430",
      after_playback: "\u043F\u043E\u0441\u043B\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0442\u0435\u0441\u0442\u0430",
      during_recording: "\u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0437\u0430\u043F\u0438\u0441\u0438 \u0442\u0435\u0441\u0442\u0430"
    };
    return map[appliedWhen] || appliedWhen;
  }
  function getActionSelectorKey(action) {
    const selector = action?.selector;
    if (!selector) return "";
    if (typeof selector === "string") return selector;
    return selector.selector || selector.value || "";
  }
  function getActionTargetKey(action) {
    if (!action) return "";
    if (action.elementKey) return `element:${action.elementKey}`;
    const selectorKey = getActionSelectorKey(action);
    return selectorKey ? `selector:${selectorKey}` : "";
  }
  function isSingleTargetSelector(action) {
    const selector = action?.selector;
    if (!selector || typeof selector !== "object") return false;
    return selector.isUnique === true || selector.unique === true || selector.matchCount === 1 || selector.matchesCount === 1;
  }
  function isActionSingleTarget(action) {
    return !!(action?.elementKey || isSingleTargetSelector(action));
  }
  function isValueAction(action) {
    return !!(action && (action.type === "input" || action.type === "change") && action.value !== void 0 && action.value !== null);
  }
  function shouldReplacePreviousValueAction(prevAction, nextAction) {
    if (!isValueAction(prevAction) || !isValueAction(nextAction)) return false;
    if (!isActionSingleTarget(nextAction)) return false;
    const prevTarget = getActionTargetKey(prevAction);
    const nextTarget = getActionTargetKey(nextAction);
    if (!prevTarget || prevTarget !== nextTarget) return false;
    if (prevAction.type !== nextAction.type) return false;
    const prevTs = Number(prevAction.timestamp) || 0;
    const nextTs = Number(nextAction.timestamp) || 0;
    if (!prevTs || !nextTs || nextTs - prevTs > 5e3) return false;
    return true;
  }
  function findPreviousValueActionIndex(actions, nextAction, fromIndex, toIndex) {
    if (!Array.isArray(actions) || actions.length === 0) return -1;
    if (!isValueAction(nextAction) || !isActionSingleTarget(nextAction)) return -1;
    const nextTarget = getActionTargetKey(nextAction);
    if (!nextTarget) return -1;
    const nextTs = Number(nextAction.timestamp) || 0;
    const start = Math.max(0, Number(fromIndex) || 0);
    const end = Math.min(actions.length - 1, Number.isFinite(toIndex) ? Number(toIndex) : actions.length - 1);
    for (let i = end; i >= start; i--) {
      const candidate = actions[i];
      if (!isValueAction(candidate)) continue;
      if (candidate.type !== nextAction.type) continue;
      if (getActionTargetKey(candidate) !== nextTarget) continue;
      if (!isActionSingleTarget(candidate) && !isActionSingleTarget(nextAction)) continue;
      const candidateTs = Number(candidate.timestamp) || 0;
      if (nextTs && candidateTs && Math.abs(nextTs - candidateTs) > 5e3) continue;
      return i;
    }
    return -1;
  }
  function removeInternalRecordMeta(action) {
    if (!action || typeof action !== "object") return action;
    if (Object.prototype.hasOwnProperty.call(action, "__recordArrivalOrder")) {
      delete action.__recordArrivalOrder;
    }
    return action;
  }
  function normalizeActionTypeForIngress(type) {
    if (self.ActionTypes && typeof self.ActionTypes.normalizeActionType === "function") {
      return self.ActionTypes.normalizeActionType(type);
    }
    if (type === "assertion") return "assert";
    if (type === "navigate") return "navigation";
    return type;
  }
  function getSelectorValueFromAction(action) {
    const selector = action?.selector;
    if (!selector) return "";
    if (typeof selector === "string") return selector.trim();
    return String(selector.selector || selector.value || "").trim();
  }
  function isSelectorRequiredTypeForIngress(type) {
    const required = /* @__PURE__ */ new Set([
      "click",
      "dblclick",
      "input",
      "change",
      "hover",
      "focus",
      "blur",
      "clear",
      "upload",
      "drag",
      "table",
      "datepicker",
      "assert",
      "wait"
    ]);
    return required.has(type);
  }
  function validateIncomingRecordedAction(action) {
    if (!action || typeof action !== "object") {
      return { ok: false, error: "INVALID_ACTION_PAYLOAD", details: "action must be an object" };
    }
    const normalizedType = normalizeActionTypeForIngress(action.type);
    if (!normalizedType) {
      return { ok: false, error: "INVALID_ACTION_PAYLOAD", details: "missing action.type" };
    }
    if (self.ActionTypes && typeof self.ActionTypes.isActionTypeSupported === "function") {
      if (!self.ActionTypes.isActionTypeSupported(normalizedType)) {
        return { ok: false, error: "UNSUPPORTED_ACTION_TYPE", details: normalizedType };
      }
    }
    const subtype = typeof action.subtype === "string" ? action.subtype.trim() : action.subtype;
    if (subtype && self.ActionTypes && typeof self.ActionTypes.isSubtypeSupported === "function") {
      if (!self.ActionTypes.isSubtypeSupported(normalizedType, subtype)) {
        return { ok: false, error: "UNSUPPORTED_ACTION_SUBTYPE", details: `${normalizedType}:${subtype}` };
      }
    }
    if (isSelectorRequiredTypeForIngress(normalizedType)) {
      const selectorValue = getSelectorValueFromAction(action);
      if (!selectorValue) {
        return { ok: false, error: "INVALID_ACTION_SELECTOR", details: `selector is required for ${normalizedType}` };
      }
    }
    return { ok: true, normalizedType };
  }
  function isDuplicateClientRecordedAction(manager2, action) {
    const clientActionId = String(action?._clientActionId || "").trim();
    if (!clientActionId) return false;
    if (!manager2._recordedClientActionIds) {
      manager2._recordedClientActionIds = /* @__PURE__ */ new Set();
      manager2._recordedClientActionOrder = [];
    }
    if (manager2._recordedClientActionIds.has(clientActionId)) {
      return true;
    }
    manager2._recordedClientActionIds.add(clientActionId);
    manager2._recordedClientActionOrder.push(clientActionId);
    if (manager2._recordedClientActionOrder.length > 1200) {
      const staleId = manager2._recordedClientActionOrder.shift();
      if (staleId) {
        manager2._recordedClientActionIds.delete(staleId);
      }
    }
    return false;
  }
  function registerBackgroundMessageHandlers(manager, registry) {
    if (!registry) {
      return;
    }
    registry.register("PERFORMANCE_START_MONITORING", ({ message: message2, sender, sendResponse: sendResponse2 }) => {
      const safeSend = (res) => {
        try {
          sendResponse2(res);
        } catch (e) {
        }
      };
      if (!sender.tab?.id) {
        safeSend({ success: false, error: "No tab ID in sender" });
        return;
      }
      console.log("\u{1F680} [Performance] Starting monitoring for test:", message2.testId);
      chrome.tabs.sendMessage(sender.tab.id, {
        type: "START_PERFORMANCE_MONITORING",
        testId: message2.testId,
        config: message2.config || {
          webVitals: true,
          resourceTiming: true,
          navigationTiming: true
        }
      }).then(() => safeSend({ success: true })).catch((err) => {
        console.warn("\u26A0\uFE0F [Performance] Start monitoring failed (content script may not be ready):", err.message);
        safeSend({ success: true });
      });
      return true;
    });
    registry.register("PERFORMANCE_MARK_STEP", ({ message: message2, sender, sendResponse: sendResponse2 }) => {
      const safeSend = (res) => {
        try {
          sendResponse2(res);
        } catch (e) {
        }
      };
      if (!sender.tab?.id) {
        safeSend({ success: false, error: "No tab ID in sender" });
        return;
      }
      chrome.tabs.sendMessage(sender.tab.id, {
        type: "MARK_PERFORMANCE_STEP",
        stepIndex: message2.stepIndex,
        stepType: message2.stepType,
        metadata: message2.metadata || {}
      }).then(() => safeSend({ success: true })).catch((err) => {
        console.warn("\u26A0\uFE0F [Performance] Mark step failed (content script may have unloaded):", err?.message);
        safeSend({ success: true });
      });
      return true;
    });
    registry.register("PERFORMANCE_SAVE_PARTIAL", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      try {
        if (!message2.testId || !sender.tab?.id) {
          sendResponse2({ success: false });
          return;
        }
        const response = yield chrome.tabs.sendMessage(sender.tab.id, { type: "COLLECT_PERFORMANCE_DATA" });
        if (response?.success && response?.data?.steps?.length > 0) {
          const partialKey = `performanceData_partial_${message2.testId}`;
          yield chrome.storage.local.set({
            [partialKey]: {
              testId: message2.testId,
              timestamp: Date.now(),
              data: response.data
            }
          });
          console.log("\u{1F4CA} [Performance] Partial data saved before nav:", response.data.steps.length, "steps");
        }
        sendResponse2({ success: true });
      } catch (e) {
        console.warn("\u26A0\uFE0F [Performance] Save partial failed:", e?.message);
        sendResponse2({ success: false });
      }
    }));
    registry.register("PERFORMANCE_COLLECT_DATA", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F4CA} [Performance] Collecting data for test:", message2.testId);
        let performanceData = null;
        if (message2.data && typeof message2.data === "object") {
          performanceData = message2.data;
          console.log("\u{1F4CA} [Performance] Using data from message (analysis response)");
        }
        if (!performanceData && sender.tab?.id) {
          try {
            const response = yield chrome.tabs.sendMessage(sender.tab.id, {
              type: "COLLECT_PERFORMANCE_DATA"
            });
            if (response?.success && response?.data) {
              performanceData = response.data;
              console.log("\u{1F4CA} [Performance] Using data from content script");
            }
          } catch (e) {
            console.warn("\u26A0\uFE0F [Performance] Content script collect failed:", e.message);
          }
        }
        if (performanceData?.steps?.length >= 0) {
          const partialKey = `performanceData_partial_${message2.testId}`;
          const stored = yield chrome.storage.local.get(partialKey);
          const partial = stored[partialKey];
          if (partial?.data?.steps?.length > 0) {
            const partialSteps = partial.data.steps;
            const currentSteps = performanceData.steps || [];
            const maxPartialIndex = Math.max(...partialSteps.map((s) => s.stepIndex ?? -1), -1);
            const mergedSteps = [...partialSteps];
            for (const s of currentSteps) {
              const idx = s.stepIndex ?? mergedSteps.length;
              if (idx > maxPartialIndex) {
                mergedSteps.push(s);
              }
            }
            mergedSteps.sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
            performanceData = { ...performanceData, steps: mergedSteps };
            yield chrome.storage.local.remove(partialKey);
            console.log("\u{1F4CA} [Performance] Merged partial + current:", partialSteps.length, "+", currentSteps.length, "->", mergedSteps.length, "steps");
          }
        }
        if (!performanceData) {
          sendResponse2({ success: false, error: "No performance data available. Ensure performance monitoring was started before the analysis step (e.g. no navigation before analysis-performance)." });
          return;
        }
        const storageKey = `performanceData_${message2.testId}`;
        yield chrome.storage.local.set({
          [storageKey]: {
            testId: message2.testId,
            timestamp: Date.now(),
            data: performanceData
          }
        });
        yield chrome.storage.local.set({
          "performanceData_latest": {
            testId: message2.testId,
            timestamp: Date.now(),
            data: performanceData
          }
        });
        console.log("\u2705 [Performance] Data saved to storage:", storageKey);
        sendResponse2({ success: true, data: performanceData });
      } catch (error) {
        console.error("\u274C [Performance] Error collecting data:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("PERFORMANCE_STOP_MONITORING", ({ message: message2, sender, sendResponse: sendResponse2 }) => {
      if (!sender.tab?.id) {
        sendResponse2({ success: false, error: "No tab ID in sender" });
        return;
      }
      console.log("\u{1F6D1} [Performance] Stopping monitoring");
      chrome.tabs.sendMessage(sender.tab.id, { type: "STOP_PERFORMANCE_MONITORING" }).catch(() => {
      });
      sendResponse2({ success: true });
    });
    registry.register("PERFORMANCE_SAVE_BASELINE", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      const safeSend = (res) => {
        try {
          sendResponse2(res);
        } catch (e) {
          console.warn("sendResponse failed:", e);
        }
      };
      try {
        const testId = message2.testId || message2.data?.testId || "latest";
        console.log("\u{1F4BE} [Performance] Saving baseline for test:", testId);
        if (!message2.data) {
          safeSend({ success: false, error: "No data provided for baseline" });
          return;
        }
        const storage = yield chrome.storage.local.get("performanceBaselines");
        const baselines = storage.performanceBaselines || {};
        if (!baselines[testId]) {
          baselines[testId] = [];
        }
        baselines[testId].push({
          timestamp: Date.now(),
          data: message2.data,
          label: message2.label || `Baseline ${(/* @__PURE__ */ new Date()).toLocaleString()}`
        });
        if (baselines[testId].length > 10) {
          baselines[testId] = baselines[testId].slice(-10);
        }
        yield chrome.storage.local.set({ performanceBaselines: baselines });
        console.log("\u2705 [Performance] Baseline saved");
        safeSend({ success: true, count: baselines[testId].length });
      } catch (error) {
        console.error("\u274C [Performance] Error saving baseline:", error);
        safeSend({ success: false, error: error?.message || String(error) });
      }
    }));
    registry.register("PERFORMANCE_LOAD_BASELINES", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F4C2} [Performance] Loading baselines for test:", message2.testId);
        const storage = yield chrome.storage.local.get("performanceBaselines");
        const baselines = storage.performanceBaselines || {};
        const testBaselines = baselines[message2.testId] || [];
        console.log(`\u2705 [Performance] Found ${testBaselines.length} baselines`);
        sendResponse2({ success: true, baselines: testBaselines });
      } catch (error) {
        console.error("\u274C [Performance] Error loading baselines:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("PERFORMANCE_DELETE_BASELINE", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F5D1}\uFE0F [Performance] Deleting baseline:", message2.testId, message2.timestamp);
        const storage = yield chrome.storage.local.get("performanceBaselines");
        const baselines = storage.performanceBaselines || {};
        if (baselines[message2.testId]) {
          baselines[message2.testId] = baselines[message2.testId].filter(
            (b) => b.timestamp !== message2.timestamp
          );
          yield chrome.storage.local.set({ performanceBaselines: baselines });
          console.log("\u2705 [Performance] Baseline deleted");
        }
        sendResponse2({ success: true });
      } catch (error) {
        console.error("\u274C [Performance] Error deleting baseline:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("PERFORMANCE_GET_DATA", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const testId = message2.testId || "latest";
        const storageKey = `performanceData_${testId}`;
        console.log("\u{1F4CA} [Performance] Getting data:", storageKey);
        let storage = yield chrome.storage.local.get(storageKey);
        let data = storage[storageKey];
        let usedFallback = false;
        if (!data && testId !== "latest") {
          console.log("\u26A0\uFE0F [Performance] No data for testId, trying latest...");
          storage = yield chrome.storage.local.get("performanceData_latest");
          data = storage.performanceData_latest;
          if (data) {
            usedFallback = true;
            console.log("\u{1F4CA} [Performance] Using latest data (testId may differ)");
          }
        }
        if (!data) {
          console.log("\u26A0\uFE0F [Performance] No data found for:", storageKey);
          sendResponse2({ success: false, error: "No performance data found" });
          return;
        }
        console.log("\u2705 [Performance] Data retrieved");
        sendResponse2({ success: true, data, usedFallback });
      } catch (error) {
        console.error("\u274C [Performance] Error getting data:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("GET_TEST_HISTORY", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const history = manager.getTestHistory(message2.testId);
        sendResponse2({ success: true, history });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("GET_TESTS", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        const testsArray = Array.from(manager.tests.values());
        const groupsArray = Array.from(manager.testGroups?.values?.() || []);
        const license = self.AccessPolicy && self.AccessPolicy.getLicense ? yield self.AccessPolicy.getLicense() : { tier: "free", valid: false };
        const capabilities = self.AccessPolicy && self.AccessPolicy.getCapabilities ? self.AccessPolicy.getCapabilities(license) : { tier: "free" };
        console.log(`\u{1F4CB} \u0417\u0430\u043F\u0440\u043E\u0441 \u0441\u043F\u0438\u0441\u043A\u0430 \u0442\u0435\u0441\u0442\u043E\u0432: \u043D\u0430\u0439\u0434\u0435\u043D\u043E ${testsArray.length} \u0442\u0435\u0441\u0442\u043E\u0432, ${groupsArray.length} \u0433\u0440\u0443\u043F\u043F`);
        sendResponse2({
          success: true,
          tests: testsArray,
          groups: groupsArray,
          tier: capabilities.tier || "free",
          capabilities,
          freeTierLimit: FREE_TIER_TEST_LIMIT,
          limitsEnabled: ENABLE_FREEMIUM_LIMITS
        });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u0441\u043F\u0438\u0441\u043A\u0430 \u0442\u0435\u0441\u0442\u043E\u0432:", error);
        sendResponse2({ success: false, error: error.message, tests: [], groups: [] });
      }
    }));
    registry.register("GET_TEST_GROUPS", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        const groupsArray = Array.from(manager.testGroups?.values?.() || []);
        sendResponse2({ success: true, groups: groupsArray });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u0433\u0440\u0443\u043F\u043F \u0442\u0435\u0441\u0442\u043E\u0432:", error);
        sendResponse2({ success: false, error: error.message, groups: [] });
      }
    }));
    registry.register("UPDATE_TEST_GROUP", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const incoming = message2.group || {};
        const now = (/* @__PURE__ */ new Date()).toISOString();
        let id = incoming.id;
        if (!id) {
          id = String(Date.now());
        }
        const existing = manager.testGroups.get(id);
        const baseCreatedAt = existing?.createdAt || incoming.createdAt || now;
        const group = {
          id,
          name: incoming.name || existing?.name || `Group ${id}`,
          description: incoming.description ?? existing?.description ?? "",
          testIds: Array.isArray(incoming.testIds) ? incoming.testIds.map(String) : existing?.testIds || [],
          createdAt: baseCreatedAt,
          updatedAt: now,
          meta: incoming.meta ?? existing?.meta ?? {}
        };
        manager.testGroups.set(id, group);
        yield manager.saveTestGroups();
        console.log("\u2705 \u0413\u0440\u0443\u043F\u043F\u0430 \u0442\u0435\u0441\u0442\u043E\u0432 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430:", { id: group.id, name: group.name, tests: group.testIds.length });
        sendResponse2({ success: true, group });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0433\u0440\u0443\u043F\u043F\u044B \u0442\u0435\u0441\u0442\u043E\u0432:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("DELETE_TEST_GROUP", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const groupId = String(message2.groupId);
        if (!groupId) {
          sendResponse2({ success: false, error: "groupId is required" });
          return;
        }
        const existed = manager.testGroups.delete(groupId);
        if (existed) {
          yield manager.saveTestGroups();
          console.log("\u{1F5D1}\uFE0F \u0413\u0440\u0443\u043F\u043F\u0430 \u0442\u0435\u0441\u0442\u043E\u0432 \u0443\u0434\u0430\u043B\u0435\u043D\u0430:", groupId);
        }
        sendResponse2({ success: true, removed: existed });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438 \u0433\u0440\u0443\u043F\u043F\u044B \u0442\u0435\u0441\u0442\u043E\u0432:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("GET_TEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      const test = getTestById(manager, message2.testId);
      if (!test) {
        sendResponse2({ success: false, test: void 0 });
        return;
      }
      const actionsCopy = Array.isArray(test.actions) ? [...test.actions] : [];
      sendResponse2({ success: true, test: { ...test, actions: actionsCopy } });
    }));
    registry.register("GET_ALL_TESTS", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      const tests = Array.from(manager.tests.values());
      sendResponse2({ success: true, tests });
    }));
    registry.register("DELETE_TEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const testId = String(message2.testId);
        manager.tests.delete(testId);
        if (/^\d+$/.test(testId)) {
          manager.tests.delete(Number(testId));
        }
        manager.testHistory.delete(testId);
        if (/^\d+$/.test(testId)) {
          manager.testHistory.delete(Number(testId));
        }
        let groupsChanged = false;
        if (manager.testGroups && manager.testGroups.size > 0) {
          for (const [groupId, group] of manager.testGroups.entries()) {
            const beforeLen = Array.isArray(group.testIds) ? group.testIds.length : 0;
            const filtered = (group.testIds || []).filter((id) => String(id) !== testId);
            if (filtered.length !== beforeLen) {
              manager.testGroups.set(groupId, { ...group, testIds: filtered, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
              groupsChanged = true;
            }
          }
        }
        yield manager.saveTests();
        yield manager.saveTestHistory();
        if (groupsChanged) {
          yield manager.saveTestGroups();
        }
        sendResponse2({ success: true });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438 \u0442\u0435\u0441\u0442\u0430:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("SAVE_TEST_RUN_HISTORY", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F4BE} [Background] SAVE_TEST_RUN_HISTORY \u043F\u043E\u043B\u0443\u0447\u0435\u043D:", {
          testId: message2.runHistory?.testId,
          hasSteps: !!message2.runHistory?.steps,
          stepsCount: message2.runHistory?.steps?.length || 0,
          hasStartTime: !!message2.runHistory?.startTime,
          success: message2.runHistory?.success
        });
        if (!message2.runHistory || !message2.runHistory.testId) {
          console.error("\u274C [Background] \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u0430:", message2.runHistory);
          sendResponse2({
            success: false,
            error: "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u0430: \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 testId"
          });
          return;
        }
        manager.addTestRunHistory(message2.runHistory.testId, message2.runHistory);
        console.log("\u2705 [Background] \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430 \u0432 \u043F\u0430\u043C\u044F\u0442\u044C");
        try {
          yield manager.saveTestHistory();
          console.log("\u2705 [Background] \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0432 storage");
        } catch (storageError) {
          const errorMessage = storageError?.message || storageError?.toString() || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
          if (errorMessage.includes("quota") || errorMessage.includes("QUOTA") || errorMessage.includes("QuotaExceededError") || errorMessage.includes("kQuotaBytes") || errorMessage.includes("Resource::kQuotaBytes")) {
            console.warn("\u26A0\uFE0F \u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D\u0430 \u043A\u0432\u043E\u0442\u0430 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043F\u0440\u043E\u0433\u043E\u043D\u0430");
            console.warn("   \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438, \u043D\u043E \u043D\u0435 \u0432 storage \u0438\u0437-\u0437\u0430 \u043A\u0432\u043E\u0442\u044B");
            sendResponse2({
              success: true,
              warning: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438, \u043D\u043E \u043D\u0435 \u0432 storage \u0438\u0437-\u0437\u0430 \u043A\u0432\u043E\u0442\u044B"
            });
            return;
          }
          throw storageError;
        }
        const test = manager.tests.get(message2.runHistory.testId);
        if (test) {
          manager.triggerExcelExport(message2.runHistory.testId, "history", message2.runHistory).catch((error) => {
            console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0432 Excel:", error);
          });
        }
        sendResponse2({ success: true });
      } catch (error) {
        const errorMessage = error?.message || error?.toString() || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043F\u0440\u043E\u0433\u043E\u043D\u0430:", errorMessage);
        console.error("\u274C \u0414\u0435\u0442\u0430\u043B\u0438 \u043E\u0448\u0438\u0431\u043A\u0438:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
          runHistory: message2.runHistory
        });
        sendResponse2({
          success: true,
          warning: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438, \u043D\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0432 storage",
          error: errorMessage
        });
      }
    }));
    registry.register("GET_STATE", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      var _a, _b;
      const playbackTestId = manager.activePlaybackTestId || ((_a = manager.playbackState) == null ? void 0 : _a.test?.id) || ((_b = manager.playbackState) == null ? void 0 : _b.testRefId) || null;
      sendResponse2({
        success: true,
        state: {
          isRecording: manager.isRecording,
          isPlaying: manager.isPlaying,
          isPaused: manager.isPaused === true,
          currentTestId: manager.currentTest?.id ?? playbackTestId ?? null,
          testsCount: manager.tests.size,
          currentStep: manager.currentStep || 0,
          totalSteps: manager.totalSteps || 0,
          stepType: manager.stepType || null,
          currentGroupId: manager.currentGroupId || null
        }
      });
    }));
    registry.register("PAUSE_PLAYBACK", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      if (manager.isPlaying) {
        manager.isPaused = true;
        yield manager.broadcast({ type: "PAUSE_PLAYBACK" });
        console.log("\u23F8\uFE0F [Background] \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u043F\u0430\u0443\u0437\u044B \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F");
      } else {
        sendResponse2({ success: false, error: "\u0412\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u0435 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u043E" });
        return;
      }
      sendResponse2({ success: true });
    }));
    registry.register("RESUME_PLAYBACK_FROM_PAUSE", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      manager.isPaused = false;
      yield manager.broadcast({ type: "RESUME_PLAYBACK_FROM_PAUSE" });
      console.log("\u25B6\uFE0F [Background] \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u0432\u043E\u0437\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F");
      sendResponse2({ success: true });
    }));
    registry.register("STOP_PLAYING", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      if (manager.currentVideoRecording) {
        yield manager.stopVideoRecordingIfActive(manager.currentVideoRecording.testId);
      }
      if (manager.isRecording) {
        manager.isRecording = false;
        if (manager.currentTest) {
          manager.tests.set(manager.currentTest.id, manager.currentTest);
          yield manager.saveTests();
          const testId = manager.currentTest.id;
          manager.currentTest = null;
          yield manager.broadcast({ type: "RECORDING_STOPPED", testId });
        } else {
          yield manager.broadcast({ type: "FORCE_STOP" });
        }
      }
      if (manager.isPlaying) {
        manager.isPlaying = false;
        manager.isPaused = false;
        manager.activePlaybackTestId = null;
        manager.currentStep = 0;
        manager.totalSteps = 0;
        manager.stepType = null;
        manager.playbackState = null;
        manager.playbackTabId = null;
        try {
          yield chrome.storage.local.remove("playbackState");
          console.log("\u2705 \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E\u0447\u0438\u0449\u0435\u043D\u043E \u0438\u0437 storage");
        } catch (error) {
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0438\u0437 storage:", error);
        }
        yield manager.broadcast({ type: "STOP_PLAYING" });
      }
      sendResponse2({ success: true });
    }));
    registry.register("FORCE_STOP", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      if (manager.currentVideoRecording) {
        yield manager.stopVideoRecordingIfActive(manager.currentVideoRecording.testId);
      }
      if (manager.isRecording) {
        manager.isRecording = false;
        if (manager.currentTest) {
          manager.tests.set(manager.currentTest.id, manager.currentTest);
          yield manager.saveTests();
          const testId = manager.currentTest.id;
          manager.currentTest = null;
          yield manager.broadcast({ type: "RECORDING_STOPPED", testId });
        } else {
          yield manager.broadcast({ type: "FORCE_STOP" });
        }
      }
      if (manager.isPlaying) {
        manager.isPlaying = false;
        manager.isPaused = false;
        manager.activePlaybackTestId = null;
        manager.currentStep = 0;
        manager.totalSteps = 0;
        manager.stepType = null;
        manager.playbackState = null;
        manager.playbackTabId = null;
        try {
          yield chrome.storage.local.remove("playbackState");
          console.log("\u2705 \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E\u0447\u0438\u0449\u0435\u043D\u043E \u0438\u0437 storage");
        } catch (error) {
          console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0438\u0437 storage:", error);
        }
        yield manager.broadcast({ type: "STOP_PLAYING" });
      }
      sendResponse2({ success: true });
    }));
    registry.register("PLAY_TEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      manager.currentGroupId = null;
      yield manager.handlePlayTest(message2, sendResponse2);
    }));
    registry.register("PLAY_TEST_GROUP", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        if (!message2.groupId) {
          sendResponse2({ success: false, error: "groupId is required" });
          return;
        }
        if (typeof manager.playTestGroup === "function") {
          yield manager.playTestGroup(String(message2.groupId), message2.mode || "optimized", !!message2.debugMode);
          sendResponse2({ success: true });
        } else {
          sendResponse2({ success: false, error: "playTestGroup is not implemented" });
        }
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0433\u0440\u0443\u043F\u043F\u044B \u0442\u0435\u0441\u0442\u043E\u0432:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("PATCH_TEST_ACTION", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const { testId, actionIndex, patch } = message2;
        if (!testId || patch == null || typeof patch !== "object") {
          sendResponse2({ success: false, error: "testId and patch required" });
          return;
        }
        const test = manager.tests.get(testId);
        if (!test || !Array.isArray(test.actions)) {
          sendResponse2({ success: false, error: "Test not found" });
          return;
        }
        const idx = parseInt(actionIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= test.actions.length) {
          sendResponse2({ success: false, error: "Invalid actionIndex" });
          return;
        }
        const action = test.actions[idx];
        if (patch.selector != null) {
          action.selector = patch.selector;
        }
        if (patch.source != null) {
          action.source = patch.source;
        }
        if (patch.urlResult != null) {
          action.urlResult = patch.urlResult;
        }
        yield manager.saveTests();
        manager.broadcast({ type: "TEST_UPDATED", testId, actionIndex: idx, patch });
        chrome.runtime.sendMessage({ type: "TEST_UPDATED", testId }).catch(() => {
        });
        sendResponse2({ success: true });
      } catch (error) {
        console.error("\u274C [Background] PATCH_TEST_ACTION error:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("PLAY_TEST_PARALLEL", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      const testToPlay = manager.tests.get(message2.testId);
      if (!testToPlay) {
        sendResponse2({ success: false, error: "Test not found" });
        return;
      }
      const tabCount = message2.tabCount || 3;
      const runMode = message2.mode || "optimized";
      try {
        const actionsToCheck = (testToPlay.actions || []).filter((action) => {
          return runMode === "full" ? true : !action.hidden;
        });
        const visualActionTypes = ["click", "input", "change", "scroll", "navigation", "waitForElement", "screenshot"];
        const hasVisualActions = actionsToCheck.some((action) => {
          if (visualActionTypes.includes(action.type)) {
            return true;
          }
          const checkNestedActions = (nestedActions) => {
            const filteredNested = nestedActions.filter((a) => runMode === "full" ? true : !a.hidden);
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
        if (!hasVisualActions) {
          console.log(`\u2705 [Parallel] \u0422\u0435\u0441\u0442 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439, \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044E ${tabCount} \u043F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u044B\u0445 \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432 \u0438\u0437 background script`);
          const runPromises = [];
          for (let i = 0; i < tabCount; i++) {
            const runPromise = (() => __async(null, null, function* () {
              try {
                yield new Promise((resolve) => setTimeout(resolve, i * 10));
                console.log(`\u{1F680} [Parallel] \u0417\u0430\u043F\u0443\u0441\u043A \u043F\u0440\u043E\u0433\u043E\u043D\u0430 ${i + 1}/${tabCount} \u0438\u0437 background script`);
                yield manager.executeTestFromBackground(testToPlay, runMode, false);
                console.log(`\u2705 [Parallel] \u041F\u0440\u043E\u0433\u043E\u043D ${i + 1}/${tabCount} \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D \u0443\u0441\u043F\u0435\u0448\u043D\u043E`);
                return { runIndex: i + 1, success: true };
              } catch (error) {
                console.error(`\u274C [Parallel] \u041E\u0448\u0438\u0431\u043A\u0430 \u0432 \u043F\u0440\u043E\u0433\u043E\u043D\u0435 ${i + 1}/${tabCount}:`, error);
                return { runIndex: i + 1, success: false, error: error.message };
              }
            }))();
            runPromises.push(runPromise);
          }
          const allResults2 = yield Promise.all(runPromises);
          const successCount2 = allResults2.filter((r) => r.success).length;
          sendResponse2({
            success: true,
            totalRuns: tabCount,
            successRuns: successCount2,
            results: allResults2,
            executionMode: "background"
          });
          return;
        }
        console.log(`\u{1F310} [Parallel] \u0422\u0435\u0441\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F, \u0441\u043E\u0437\u0434\u0430\u044E ${tabCount} \u0432\u043A\u043B\u0430\u0434\u043E\u043A`);
        const tabPromises = [];
        for (let i = 0; i < tabCount; i++) {
          const tabPromise = (() => __async(null, null, function* () {
            try {
              const firstAction = testToPlay.actions?.find((a) => a.url);
              const startUrl = firstAction?.url || "about:blank";
              const tab = yield chrome.tabs.create({ url: startUrl });
              yield new Promise((resolve) => {
                chrome.tabs.onUpdated.addListener(function listener(tabId2, info) {
                  if (tabId2 === tab.id && info.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                  }
                });
              });
              yield chrome.tabs.sendMessage(tab.id, {
                type: "PLAY_TEST",
                test: testToPlay,
                mode: runMode,
                parallelRun: true,
                runIndex: i + 1,
                totalRuns: tabCount
              });
              return { tabId: tab.id, runIndex: i + 1, success: true };
            } catch (error) {
              console.error(`\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0442\u0435\u0441\u0442\u0430 \u0432\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0435 ${i + 1}:`, error);
              return { tabId: null, runIndex: i + 1, success: false, error: error.message };
            }
          }))();
          tabPromises.push(tabPromise);
        }
        const allResults = yield Promise.all(tabPromises);
        const successCount = allResults.filter((r) => r.success).length;
        sendResponse2({
          success: true,
          totalTabs: tabCount,
          successTabs: successCount,
          results: allResults,
          executionMode: "tabs"
        });
      } catch (error) {
        console.error("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u043E\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u0435:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("SAVE_PLAYBACK_STATE", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      if (sender?.tab?.id != null) {
        manager.playbackTabId = sender.tab.id;
      }
      console.log("\u{1F4BE} \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F:", {
        testId: message2.test?.id,
        testName: message2.test?.name,
        actionIndex: message2.actionIndex,
        nextUrl: message2.nextUrl,
        hasTest: !!message2.test,
        testActionsCount: message2.test?.actions?.length
      });
      if (message2.test) {
        const test = message2.test;
        console.log("\u{1F50D} \u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u0442\u0435\u0441\u0442\u0430 \u043F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C:", {
          hasId: !!test.id,
          hasName: !!test.name,
          hasActions: !!test.actions,
          actionsIsArray: Array.isArray(test.actions),
          actionsCount: test.actions?.length,
          hasCreatedAt: !!test.createdAt,
          hasUpdatedAt: !!test.updatedAt
        });
        if (!Array.isArray(test.actions)) {
          console.error("\u274C \u041E\u0428\u0418\u0411\u041A\u0410: test.actions \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C!", typeof test.actions, test.actions);
        }
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
        console.error("\u274C \u041E\u0428\u0418\u0411\u041A\u0410: message.test \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442!");
      }
      let testToSave = message2.test ? {
        id: message2.test.id,
        name: message2.test.name,
        actions: message2.test.actions ? [...message2.test.actions] : [],
        createdAt: message2.test.createdAt,
        updatedAt: message2.test.updatedAt
      } : null;
      const runMode = message2.runMode || manager.playbackState?.runMode || "optimized";
      const prevSteps = manager.playbackState?.runHistory && Array.isArray(manager.playbackState.runHistory.steps) ? manager.playbackState.runHistory.steps.length : 0;
      const incomingSteps = message2.runHistory && Array.isArray(message2.runHistory.steps) ? message2.runHistory.steps.length : 0;
      let effectiveRunHistory = message2.runHistory || null;
      const prevState = manager.playbackState;
      const sameTestEarly = !!(testToSave && prevState?.test && String(testToSave.id) === String(prevState.test?.id || prevState.testRefId || ""));
      if (sameTestEarly && prevSteps > 0 && incomingSteps === 0) {
        effectiveRunHistory = manager.playbackState.runHistory || null;
        if (effectiveRunHistory !== message2.runHistory) {
          console.log("\u{1F6E1}\uFE0F [SAVE_PLAYBACK_STATE] \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F runHistory (\u0432\u0445\u043E\u0434\u044F\u0449\u0430\u044F \u0431\u0435\u0437 \u0448\u0430\u0433\u043E\u0432):", { prevSteps, nextUrl: message2.nextUrl });
        }
      }
      if (testToSave && prevState?.test && Array.isArray(prevState.test.actions) && prevState.test.actions.length > 0 &&
          (!Array.isArray(testToSave.actions) || testToSave.actions.length === 0) &&
          String(testToSave.id) === String(prevState.test?.id || prevState.testRefId || "")) {
        testToSave = __spreadProps(__spreadValues({}, testToSave), {
          actions: [...prevState.test.actions]
        });
        console.log("\u{1F6E1}\uFE0F [SAVE_PLAYBACK_STATE] \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B actions \u0438\u0437 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F:", prevState.test.actions.length);
      }
      const incomingIdx = Number(message2.actionIndex);
      const incomingIdxSafe = Number.isFinite(incomingIdx) ? incomingIdx : 0;
      const prevIdx = Number(prevState?.actionIndex);
      const prevIdxSafe = Number.isFinite(prevIdx) ? prevIdx : 0;
      const sameTest = !!(testToSave && prevState?.test && String(testToSave.id) === String(prevState.test?.id || prevState.testRefId || ""));
      let mergedActionIndex = incomingIdxSafe;
      let mergedPlaybackSessionId = message2.playbackSessionId || prevState?.playbackSessionId || null;
      if (sameTest) {
        mergedActionIndex = Math.max(incomingIdxSafe, prevIdxSafe);
        if (mergedActionIndex > incomingIdxSafe) {
          mergedPlaybackSessionId = prevState.playbackSessionId || mergedPlaybackSessionId;
          console.log("\u{1F6E1}\uFE0F [SAVE_PLAYBACK_STATE] \u041D\u0435 \u0443\u043C\u0435\u043D\u044C\u0448\u0430\u044E actionIndex (\u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0435\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E):", {
            incoming: incomingIdxSafe,
            previous: prevIdxSafe,
            merged: mergedActionIndex
          });
        }
      }
      const inferMinIndexFromRunHistory = (rh) => {
        if (!rh || !Array.isArray(rh.steps) || rh.steps.length === 0) return null;
        let maxDone = -1;
        for (const st of rh.steps) {
          if (!st || st.success === false) continue;
          const ai = Number(st.actionIndex);
          if (Number.isFinite(ai)) maxDone = Math.max(maxDone, ai);
        }
        if (maxDone < 0) return null;
        return maxDone + 1;
      };
      const inferredFromRh = inferMinIndexFromRunHistory(effectiveRunHistory);
      if (inferredFromRh != null && inferredFromRh > mergedActionIndex) {
        console.log("\u{1F6E1}\uFE0F [SAVE_PLAYBACK_STATE] actionIndex \u043F\u043E\u0434\u043D\u044F\u0442 \u043F\u043E runHistory:", {
          inferredFromRh,
          mergedBefore: mergedActionIndex
        });
        mergedActionIndex = inferredFromRh;
      }
      const mergedRunFinished = !!(message2.playbackRunFinished || prevState?.playbackRunFinished);
      let mergedIsPaused = prevState?.isPaused === true;
      if (message2 && Object.prototype.hasOwnProperty.call(message2, "isPaused")) {
        mergedIsPaused = message2.isPaused === true;
      }
      manager.isPaused = mergedIsPaused;
      manager.playbackState = {
        test: testToSave,
        actionIndex: mergedActionIndex,
        nextUrl: message2.nextUrl,
        runMode,
        runHistory: effectiveRunHistory,
        isGroupRun: message2.isGroupRun || false,
        groupRunCurrentIndex: message2.groupRunCurrentIndex,
        groupRunTotal: message2.groupRunTotal,
        playbackSessionId: mergedPlaybackSessionId,
        playbackRunFinished: mergedRunFinished,
        isPaused: mergedIsPaused
      };
      if (testToSave?.id != null) {
        manager.activePlaybackTestId = String(testToSave.id);
      }
      const playbackStateForStorage = {
        ...manager.playbackState,
        testRefId: testToSave?.id || null,
        // Храним в storage только метаданные теста, чтобы не выбивать квоту.
        test: testToSave ? {
          id: testToSave.id,
          name: testToSave.name,
          createdAt: testToSave.createdAt,
          updatedAt: testToSave.updatedAt
        } : null
      };
      if (!manager.isPlaying) {
        console.log("\u26A0\uFE0F isPlaying \u0431\u044B\u043B false, \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E \u0432 true");
        manager.isPlaying = true;
      }
      const isQuotaError = (e) => {
        const msg = (e?.message || e?.toString() || "").toLowerCase();
        return msg.includes("quota") || msg.includes("kquotabytes") || msg.includes("resource::");
      };
      try {
        yield chrome.storage.local.set({ playbackState: playbackStateForStorage });
        console.log("\u2705 \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0432 storage");
        const verify = yield chrome.storage.local.get("playbackState");
        if (verify.playbackState) {
          console.log("\u2705 \u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F: \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0438 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E");
          console.log("   \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E:", {
            testId: verify.playbackState.test?.id,
            actionIndex: verify.playbackState.actionIndex,
            nextUrl: verify.playbackState.nextUrl
          });
        } else {
          console.error("\u274C \u041E\u0428\u0418\u0411\u041A\u0410: \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F!");
        }
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0432 storage:", error);
        console.error("   \u0414\u0435\u0442\u0430\u043B\u0438 \u043E\u0448\u0438\u0431\u043A\u0438:", error.message, error.stack);
        if (isQuotaError(error)) {
          try {
            const trimmed = { ...playbackStateForStorage };
            if (trimmed.runHistory?.steps?.length) {
              trimmed.runHistory = {
                ...trimmed.runHistory,
                steps: trimmed.runHistory.steps.map((s) => ({
                  ...s,
                  screenshot: void 0,
                  beforeScreenshot: void 0,
                  afterScreenshot: void 0
                }))
              };
            }
            yield chrome.storage.local.set({ playbackState: trimmed });
            console.warn("\u26A0\uFE0F \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0431\u0435\u0437 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u0438\u0437-\u0437\u0430 \u043A\u0432\u043E\u0442\u044B \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430");
          } catch (e2) {
            console.warn("\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0434\u0430\u0436\u0435 \u043E\u0431\u043B\u0435\u0433\u0447\u0451\u043D\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435:", e2?.message);
          }
        }
      }
      console.log("\u2705 \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E");
      sendResponse2({ success: true });
    }));
    registry.register("GET_PLAYBACK_STATE", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      let state = manager.playbackState;
      if (!state) {
        try {
          const data = yield chrome.storage.local.get("playbackState");
          if (data.playbackState) {
            state = data.playbackState;
            manager.playbackState = state;
            manager.isPlaying = true;
            manager.isPaused = state.isPaused === true;
            console.log("\u{1F4E5} \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E playbackState \u0438\u0437 storage (service worker \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0449\u0435\u043D)");
          }
        } catch (e) {
          console.warn("\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 playbackState \u0438\u0437 storage:", e?.message);
        }
      }
      console.log("\u{1F4E5} \u0417\u0430\u043F\u0440\u043E\u0441 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F:", {
        hasPlaybackState: !!state,
        isPlaying: manager.isPlaying,
        actionIndex: state?.actionIndex,
        nextUrl: state?.nextUrl
      });
      const stateHasActions = !!(state?.test && Array.isArray(state.test.actions));
      if (state && !stateHasActions) {
        const refId = state?.testRefId || state?.test?.id;
        const fullTest = refId ? getTestById(manager, refId) : null;
        if (fullTest) {
          state = {
            ...state,
            test: {
              ...fullTest,
              actions: Array.isArray(fullTest.actions) ? [...fullTest.actions] : []
            }
          };
          manager.playbackState = state;
        }
      }
      if (state && (manager.isPlaying || state.test)) {
        console.log("\u2705 \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u044E \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F");
        const inGroupRun = !!manager.currentGroupId;
        manager.isPaused = state.isPaused === true;
        sendResponse2({
          success: true,
          isPlaying: true,
          test: state.test,
          actionIndex: state.actionIndex,
          nextUrl: state.nextUrl,
          runMode: state.runMode || "optimized",
          runHistory: state.runHistory || null,
          isGroupRun: state.isGroupRun || inGroupRun,
          groupRunCurrentIndex: state.groupRunCurrentIndex,
          groupRunTotal: state.groupRunTotal,
          playbackSessionId: state.playbackSessionId || null,
          playbackRunFinished: state.playbackRunFinished === true,
          isPaused: state.isPaused === true
        });
      } else {
        console.log("\u2139\uFE0F \u0412\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u0435 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u043E");
        if (!manager.isPlaying) manager.isPaused = false;
        sendResponse2({ success: true, isPlaying: false, isPaused: false });
      }
    }));
    registry.register("GET_I18N_TRANSLATIONS", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      const lang = message2.lang === "ru" ? "ru" : "en";
      try {
        const url = chrome.runtime.getURL(`i18n/${lang}.json`);
        const resp = yield fetch(url);
        if (!resp.ok) {
          sendResponse2({ success: false, error: `HTTP ${resp.status}` });
          return;
        }
        const translations = yield resp.json();
        let enFallback = null;
        if (lang !== "en") {
          try {
            const enResp = yield fetch(chrome.runtime.getURL("i18n/en.json"));
            if (enResp.ok) enFallback = yield enResp.json();
          } catch (_) {
          }
        }
        sendResponse2({ success: true, translations, enFallback });
      } catch (e) {
        sendResponse2({ success: false, error: e?.message || String(e) });
      }
    }));
    registry.register("CLEAR_PLAYBACK_STATE", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        manager.playbackState = null;
        yield chrome.storage.local.remove("playbackState");
        console.log("\u2705 [CLEAR_PLAYBACK_STATE] \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E\u0447\u0438\u0449\u0435\u043D\u043E");
        sendResponse2({ success: true });
      } catch (e) {
        console.warn("\u26A0\uFE0F [CLEAR_PLAYBACK_STATE]", e?.message);
        sendResponse2({ success: false, error: e?.message });
      }
    }));
    registry.register("CLEAR_ALL_SCREENSHOTS", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F9F9} [Background] \u041E\u0447\u0438\u0441\u0442\u043A\u0430 \u0432\u0441\u0435\u0445 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u0438\u0437 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043F\u0440\u043E\u0433\u043E\u043D\u043E\u0432...");
        yield manager.deleteScreenshotFiles();
        let clearedCount = 0;
        for (const [, history] of manager.testHistory.entries()) {
          for (const run of history) {
            if (run.steps) {
              for (const step of run.steps) {
                if (step.screenshot) {
                  delete step.screenshot;
                }
                if (step.beforeScreenshot) {
                  delete step.beforeScreenshot;
                }
                if (step.afterScreenshot) {
                  delete step.afterScreenshot;
                }
                if (step.screenshotComparison) {
                  delete step.screenshotComparison;
                }
                if (step.screenshotComparisonView) {
                  delete step.screenshotComparisonView;
                }
                delete step.screenshotPath;
                delete step.beforeScreenshotPath;
                delete step.afterScreenshotPath;
                delete step.errorScreenshotPath;
                if (step.screenshotComparison) {
                  delete step.screenshotComparison.diffImagePath;
                }
                delete step.screenshotComparisonViewPath;
                clearedCount++;
              }
            }
            if (run.screenshots) {
              delete run.screenshots;
            }
          }
        }
        yield manager.saveTestHistory();
        console.log(`\u2705 [Background] \u041E\u0447\u0438\u0449\u0435\u043D\u043E \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432 \u0438\u0437 ${clearedCount} \u0448\u0430\u0433\u043E\u0432, \u0444\u0430\u0439\u043B\u044B \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0441 \u0434\u0438\u0441\u043A\u0430`);
        sendResponse2({
          success: true,
          clearedCount
        });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0435 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u043E\u0432:", error);
        sendResponse2({
          success: false,
          error: error.message
        });
      }
    }));
    registry.register("ANALYZE_TEST_HISTORY", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const analysis = manager.analyzeTestHistory(message2.testId);
        sendResponse2(analysis);
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0430\u043D\u0430\u043B\u0438\u0437\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438:", error);
        sendResponse2({
          success: false,
          error: error.message
        });
      }
    }));
    registry.register("OPTIMIZE_SELECTORS_FROM_HISTORY", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const optimizationResult = yield manager.optimizeSelectorsFromHistory(message2.testId, message2.runHistory);
        sendResponse2(optimizationResult);
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u0438 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u043E\u0432:", error);
        sendResponse2({
          success: false,
          error: error.message
        });
      }
    }));
    registry.register("GET_CURRENT_TAB", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        const tabs = yield chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
          sendResponse2({ success: true, id: tabs[0].id });
        } else {
          sendResponse2({ success: false, error: "No active tab found" });
        }
      } catch (error) {
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("START_RECORDING", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      console.log("\u{1F3AC} \u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 START_RECORDING...");
      if (!(yield requireAccess(self.ActionCatalog ? self.ActionCatalog.START_RECORDING : "recording.start", sendResponse2))) {
        return;
      }
      if (manager.isRecording) {
        sendResponse2({ success: false, error: "\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0436\u0435 \u0438\u0434\u0435\u0442" });
        return;
      }
      if (ENABLE_FREEMIUM_LIMITS && manager.tests.size >= FREE_TIER_TEST_LIMIT) {
        sendResponse2({
          success: false,
          error: "FREE_TIER_LIMIT",
          limit: FREE_TIER_TEST_LIMIT
        });
        return;
      }
      manager.isRecording = true;
      manager.resumePlaybackAfterRecordingStop = false;
      manager._recordedClientActionIds = /* @__PURE__ */ new Set();
      manager._recordedClientActionOrder = [];
      manager.currentTest = {
        id: Date.now().toString(),
        name: message2.testName || `Test ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
        actions: [],
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        optimization: {
          optimizedAvailable: false
        }
      };
      console.log(`\u{1F3AC} \u041D\u0430\u0447\u0430\u043B\u043E \u0437\u0430\u043F\u0438\u0441\u0438 \u0442\u0435\u0441\u0442\u0430: ${manager.currentTest.name} (ID: ${manager.currentTest.id})`);
      try {
        yield manager.broadcast({ type: "RECORDING_STARTED", testId: manager.currentTest.id });
        console.log("\u2705 Broadcast \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D, \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E \u043E\u0442\u0432\u0435\u0442...");
        sendResponse2({ success: true, testId: manager.currentTest.id });
        console.log("\u2705 \u041E\u0442\u0432\u0435\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0443\u0441\u043F\u0435\u0448\u043D\u043E");
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0437\u0430\u043F\u0438\u0441\u0438:", error);
        manager.isRecording = false;
        manager.currentTest = null;
        manager.resumePlaybackAfterRecordingStop = false;
        sendResponse2({
          success: false,
          error: error && error.message ? error.message : String(error || "START_RECORDING_FAILED")
        });
      }
    }));
    function getActionUrl(test, actionIndex) {
      if (!test || !test.actions || actionIndex < 0 || actionIndex >= test.actions.length) {
        return null;
      }
      return test.actions[actionIndex].url || null;
    }
    registry.register("START_RECORDING_INTO_TEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      console.log("\u{1F3AC} \u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 START_RECORDING_IN\u0422\u041E_TEST...");
      if (manager.isRecording) {
        sendResponse2({ success: false, error: "\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0436\u0435 \u0438\u0434\u0435\u0442" });
        return;
      }
      const existingTest = getTestById(manager, message2.testId);
      if (!existingTest) {
        sendResponse2({ success: false, error: "\u0422\u0435\u0441\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
        return;
      }
      manager.isRecording = true;
      manager._recordedClientActionIds = /* @__PURE__ */ new Set();
      manager._recordedClientActionOrder = [];
      manager.currentTest = existingTest;
      manager.recordInsertIndex = message2.insertAfterIndex !== void 0 ? message2.insertAfterIndex + 1 : existingTest.actions.length;
      manager.recordedActionsCount = 0;
      manager.recordMarkerActionIndex = message2.insertAfterIndex;
      manager.resumePlaybackAfterRecordingStop = false;
      console.log(`\u{1F3AC} \u041D\u0430\u0447\u0430\u043B\u043E \u0437\u0430\u043F\u0438\u0441\u0438 \u0432 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0442\u0435\u0441\u0442: ${existingTest.name} (ID: ${existingTest.id}), \u0432\u0441\u0442\u0430\u0432\u043A\u0430 \u043F\u043E\u0441\u043B\u0435 \u0438\u043D\u0434\u0435\u043A\u0441\u0430 ${message2.insertAfterIndex}`);
      let targetUrl = null;
      if (message2.insertAfterIndex !== void 0 && message2.insertAfterIndex !== null) {
        targetUrl = getActionUrl(existingTest, message2.insertAfterIndex);
      }
      if (!targetUrl) {
        const firstAction = existingTest.actions?.find((a) => a.url);
        if (firstAction) {
          targetUrl = firstAction.url;
        }
      }
      if (!targetUrl) {
        targetUrl = "about:blank";
      }
      console.log(`\u{1F3AF} \u0426\u0435\u043B\u0435\u0432\u043E\u0439 URL \u0434\u043B\u044F \u0437\u0430\u043F\u0438\u0441\u0438: ${targetUrl}`);
      try {
        const targetTabId2 = message2?.tabId ? Number(message2.tabId) : null;
        if (targetTabId2) {
          let tab = null;
          try {
            tab = yield chrome.tabs.get(targetTabId2);
          } catch (e) {
            tab = null;
          }
          if (!tab) {
            throw new Error("Target tab not found for recording");
          }
          try {
            yield manager.injectContentScriptsIfNeeded(targetTabId2, tab.url);
          } catch (_) {
          }
          yield chrome.tabs.sendMessage(targetTabId2, {
            type: "RECORDING_STARTED",
            testId: manager.currentTest.id,
            insertAfterIndex: message2.insertAfterIndex,
            fromMarker: true
          });
          console.log(`\u2705 RECORDING_STARTED \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0432 \u0446\u0435\u043B\u0435\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${targetTabId2}`);
        } else {
          const tab = yield chrome.tabs.create({ url: targetUrl, active: true });
          console.log(`\u2705 \u041E\u0442\u043A\u0440\u044B\u0442\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0430: ${tab.id} (${targetUrl})`);
          yield new Promise((resolve) => setTimeout(resolve, 1e3));
          yield chrome.action.openPopup();
          console.log("\u2705 Popup \u043E\u0442\u043A\u0440\u044B\u0442 \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u0438\u0441\u0438");
          yield manager.broadcast({
            type: "RECORDING_STARTED",
            testId: manager.currentTest.id,
            insertAfterIndex: message2.insertAfterIndex,
            fromMarker: true
          });
        }
        manager.resumePlaybackAfterRecordingStop = !!(message2.tabId != null && String(message2.tabId).trim() !== "" && Number.isFinite(Number(message2.tabId)) && Number(message2.tabId) > 0);
        console.log("\u2705 Broadcast \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D, \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E \u043E\u0442\u0432\u0435\u0442...");
        sendResponse2({ success: true, testId: manager.currentTest.id });
        console.log("\u2705 \u041E\u0442\u0432\u0435\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0443\u0441\u043F\u0435\u0448\u043D\u043E");
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0437\u0430\u043F\u0438\u0441\u0438:", error);
        manager.isRecording = false;
        manager.currentTest = null;
        manager.recordInsertIndex = null;
        manager.recordMarkerActionIndex = null;
        manager.resumePlaybackAfterRecordingStop = false;
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("STOP_RECORDING", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        if (!manager.isRecording) {
          sendResponse2({ success: false, error: "\u0417\u0430\u043F\u0438\u0441\u044C \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u0430" });
          return;
        }
        const cancelMarkerRecording = !!message2?.cancelMarkerRecording;
        manager.isRecording = false;
        if (manager.currentTest) {
          const actionsCountBefore = manager.currentTest.actions.length;
          const wasRecordingIntoExisting = manager.recordInsertIndex !== void 0 && manager.recordInsertIndex !== null;
          const recordedCount = manager.recordedActionsCount || 0;
          const sortStart = wasRecordingIntoExisting ? manager.recordInsertIndex : 0;
          const sortEndExclusive = wasRecordingIntoExisting ? Math.min(manager.currentTest.actions.length, sortStart + recordedCount) : manager.currentTest.actions.length;
          if (sortStart >= 0 && sortEndExclusive > sortStart) {
            const before = manager.currentTest.actions.slice(0, sortStart);
            const middle = manager.currentTest.actions.slice(sortStart, sortEndExclusive);
            const after = manager.currentTest.actions.slice(sortEndExclusive);
            middle.sort((a, b) => {
              const ta = Number(a?.timestamp) || 0;
              const tb = Number(b?.timestamp) || 0;
              if (ta !== tb) return ta - tb;
              const oa = Number(a?.__recordArrivalOrder) || 0;
              const ob = Number(b?.__recordArrivalOrder) || 0;
              return oa - ob;
            });
            manager.currentTest.actions = before.concat(middle, after).map(removeInternalRecordMeta);
          }
          const removedCount = manager.cleanDuplicateActions(manager.currentTest);
          if (removedCount > 0) {
            console.log(`\u{1F9F9} \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u043E ${removedCount} \u0434\u0443\u0431\u043B\u0438\u0440\u0443\u044E\u0449\u0438\u0445\u0441\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0438\u0437 \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0433\u043E \u0442\u0435\u0441\u0442\u0430`);
          }
          if (wasRecordingIntoExisting && cancelMarkerRecording && recordedCount > 0 && manager.recordInsertIndex !== void 0 && manager.recordInsertIndex !== null) {
            manager.currentTest.actions.splice(manager.recordInsertIndex, recordedCount);
            console.log(`\u23F9\uFE0F \u0417\u0430\u043F\u0438\u0441\u044C \u043F\u043E \u043C\u0430\u0440\u043A\u0435\u0440\u0443 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C, \u0443\u0434\u0430\u043B\u0435\u043D\u043E ${recordedCount} \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439, \u0442\u0435\u0441\u0442 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F.`);
          }
          const actionsCountAfter = manager.currentTest.actions.length;
          manager.tests.set(manager.currentTest.id, manager.currentTest);
          yield manager.saveTests();
          if (wasRecordingIntoExisting && manager.recordMarkerActionIndex !== null && manager.recordMarkerActionIndex !== void 0 && !cancelMarkerRecording) {
            const markerActionIndexClear = manager.recordMarkerActionIndex;
            if (markerActionIndexClear >= 0 && markerActionIndexClear < manager.currentTest.actions.length) {
              const markerAction = manager.currentTest.actions[markerActionIndexClear];
              if (markerAction && markerAction.recordMarker === true) {
                markerAction.recordMarker = false;
                console.log(`\u{1F534} \u041C\u0430\u0440\u043A\u0435\u0440 \u0437\u0430\u043F\u0438\u0441\u0438 \u0441\u043D\u044F\u0442 \u0441 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F ${markerActionIndexClear + 1}`);
              }
            }
          }
          if (wasRecordingIntoExisting) {
            if (cancelMarkerRecording) {
              console.log(`\u23F9\uFE0F \u0417\u0430\u043F\u0438\u0441\u044C \u043F\u043E \u043C\u0430\u0440\u043A\u0435\u0440\u0443 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C. \u0412 \u0442\u0435\u0441\u0442 "${manager.currentTest.name}" \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u043D\u043E\u0432\u043E\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F (\u0432\u0441\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439: ${actionsCountAfter})`);
            } else {
              console.log(`\u23F9\uFE0F \u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430. \u0412 \u0442\u0435\u0441\u0442 "${manager.currentTest.name}" \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E ${recordedCount} \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 (\u0432\u0441\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439: ${actionsCountAfter})`);
            }
          } else {
            console.log(`\u23F9\uFE0F \u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430. \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D \u0442\u0435\u0441\u0442 "${manager.currentTest.name}" \u0441 ${actionsCountAfter} \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F\u043C\u0438 (\u0431\u044B\u043B\u043E ${actionsCountBefore})`);
          }
          const testId = manager.currentTest.id;
          const markerActionIndex = manager.recordMarkerActionIndex;
          const shouldResumePlayback = wasRecordingIntoExisting && !cancelMarkerRecording && !!manager.resumePlaybackAfterRecordingStop;
          manager.resumePlaybackAfterRecordingStop = false;
          manager.currentTest = null;
          manager.recordInsertIndex = null;
          manager.recordedActionsCount = 0;
          manager.recordMarkerActionIndex = null;
          yield manager.broadcast({
            type: "RECORDING_STOPPED",
            testId,
            recordedCount: cancelMarkerRecording ? 0 : recordedCount,
            markerActionIndex,
            shouldResumePlayback
          });
          sendResponse2({ success: true, testId, recordedCount: cancelMarkerRecording ? 0 : recordedCount, canceledMarkerRecording: cancelMarkerRecording });
        } else {
          console.warn("\u26A0\uFE0F \u041F\u043E\u043F\u044B\u0442\u043A\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C, \u043D\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0442\u0435\u0441\u0442\u0430 \u043D\u0435\u0442");
          manager.resumePlaybackAfterRecordingStop = false;
          sendResponse2({ success: false, error: "No active test" });
        }
      } catch (error) {
        console.error("\u274C STOP_RECORDING:", error);
        try {
          manager.isRecording = false;
          manager.resumePlaybackAfterRecordingStop = false;
        } catch (_) {
        }
        const msg = error && error.message ? error.message : String(error || "STOP_RECORDING_FAILED");
        sendResponse2({ success: false, error: msg });
      }
    }));
    registry.register("ADD_ACTION", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      if (manager.isRecording && manager.currentTest) {
        const incomingTs = Number(message2?.action?.timestamp);
        const newAction = {
          ...message2.action,
          // ВАЖНО: сохраняем исходный timestamp события из content script, если он передан.
          // Иначе порядок шагов может "плавать" из-за задержек доставки сообщений.
          timestamp: Number.isFinite(incomingTs) && incomingTs > 0 ? incomingTs : Date.now()
        };
        manager._recordArrivalCounter = (manager._recordArrivalCounter || 0) + 1;
        newAction.__recordArrivalOrder = manager._recordArrivalCounter;
        if (isDuplicateClientRecordedAction(manager, newAction)) {
          sendResponse2({ success: true, duplicateClientAction: true });
          return;
        }
        const validation = validateIncomingRecordedAction(newAction);
        if (!validation.ok) {
          console.warn(`\u26A0\uFE0F [Background] ADD_ACTION rejected: ${validation.error}`, validation.details || "");
          sendResponse2({ success: false, error: validation.error, details: validation.details || null });
          return;
        }
        newAction.type = validation.normalizedType || newAction.type;
        if (newAction.type === "input") {
          const actions2 = manager.currentTest.actions || [];
          const last = actions2.length > 0 ? actions2[actions2.length - 1] : null;
          if (last && (last.type === "click" || last.type === "dblclick")) {
            newAction.delayBefore = 200;
            newAction.inputAfterClick = true;
          }
        }
        const actions = manager.currentTest.actions || [];
        const hasInsertMode = manager.recordInsertIndex !== void 0 && manager.recordInsertIndex !== null;
        const lastRecordedIndex = hasInsertMode ? manager.recordedActionsCount > 0 ? manager.recordInsertIndex + manager.recordedActionsCount - 1 : -1 : actions.length - 1;
        if (lastRecordedIndex >= 0 && shouldReplacePreviousValueAction(actions[lastRecordedIndex], newAction)) {
          actions.splice(lastRecordedIndex, 1);
          if (hasInsertMode) {
            manager.recordedActionsCount = Math.max(0, manager.recordedActionsCount - 1);
            actions.splice(manager.recordInsertIndex + manager.recordedActionsCount, 0, newAction);
            manager.recordedActionsCount++;
          } else {
            actions.push(newAction);
          }
          manager.currentTest.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          if (hasInsertMode) {
            manager.tests.set(manager.currentTest.id, manager.currentTest);
            yield manager.saveTests();
          }
          sendResponse2({ success: true, replacedPreviousValue: true });
          return;
        }
        if (hasInsertMode) {
          manager.currentTest.actions.splice(manager.recordInsertIndex + manager.recordedActionsCount, 0, newAction);
          manager.recordedActionsCount++;
          console.log(`\u{1F4DD} \u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0432 \u043F\u043E\u0437\u0438\u0446\u0438\u044E ${manager.recordInsertIndex + manager.recordedActionsCount - 1} (\u0432\u0441\u0435\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043E: ${manager.recordedActionsCount})`);
        } else {
          manager.currentTest.actions.push(newAction);
        }
        manager.currentTest.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        if (manager.recordInsertIndex !== void 0 && manager.recordInsertIndex !== null) {
          manager.tests.set(manager.currentTest.id, manager.currentTest);
          yield manager.saveTests();
        }
        sendResponse2({ success: true });
      } else {
        sendResponse2({ success: false, error: "Not recording" });
      }
    }));
    registry.register("SET_TEST_VARIABLE", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const { testId, variableName, variableValue, source } = message2;
        let test = null;
        if (testId) {
          test = manager.tests.get(testId);
        } else if (manager.currentTest) {
          test = manager.currentTest;
        }
        if (!test) {
          sendResponse2({ success: false, error: "\u0422\u0435\u0441\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
          return;
        }
        if (!test.variables) {
          test.variables = {};
        }
        test.variables[variableName] = {
          value: variableValue,
          source: source || "selection",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        manager.tests.set(test.id, test);
        yield manager.saveTests();
        console.log(`\u{1F4E6} [Background] \u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F "${variableName}" \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430 \u0432 \u0442\u0435\u0441\u0442\u0435 ${test.id}`);
        sendResponse2({ success: true });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("DOWNLOAD_FILE", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F4E5} [Background] \u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u0430:", message2.fileName);
        const mimeType = message2.mimeType || "text/csv;charset=utf-8";
        const dataUrl = `data:${mimeType};base64,${message2.data}`;
        const downloadId = yield chrome.downloads.download({
          url: dataUrl,
          filename: message2.fileName,
          saveAs: message2.saveAs === true
        });
        console.log("\u2705 [Background] \u0424\u0430\u0439\u043B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u043D\u0430 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435, ID:", downloadId);
        console.log("\u{1F4C1} [Background] \u0411\u0443\u0434\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442 \u0434\u0438\u0430\u043B\u043E\u0433 \u0432\u044B\u0431\u043E\u0440\u0430 \u043C\u0435\u0441\u0442\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u0430");
        sendResponse2({ success: true, downloadId });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0438 \u0444\u0430\u0439\u043B\u0430:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("UPDATE_TEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      if (!(yield requireAccess(self.ActionCatalog ? self.ActionCatalog.UPDATE_TEST : "test.update", sendResponse2))) {
        return;
      }
      const updatedTest = message2.test;
      const isNewTest = !manager.tests.has(updatedTest.id);
      if (ENABLE_FREEMIUM_LIMITS && isNewTest && manager.tests.size >= FREE_TIER_TEST_LIMIT) {
        sendResponse2({
          success: false,
          error: "FREE_TIER_LIMIT",
          limit: FREE_TIER_TEST_LIMIT
        });
        return;
      }
      const actionsOrdered = Array.isArray(updatedTest.actions) ? [...updatedTest.actions] : [];
      const prevTest = manager.tests.get(String(updatedTest.id));
      let mergedExt = updatedTest.extensionAssets;
      if (prevTest?.extensionAssets && typeof prevTest.extensionAssets === "object") {
        const inc = mergedExt && typeof mergedExt === "object" ? mergedExt : {};
        mergedExt = { ...prevTest.extensionAssets, ...inc };
        mergedExt.visualRegressionBaselines = {
          ...prevTest.extensionAssets.visualRegressionBaselines || {},
          ...inc.visualRegressionBaselines || {}
        };
      }
      manager.tests.set(updatedTest.id, {
        ...updatedTest,
        actions: actionsOrdered,
        extensionAssets: mergedExt,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      yield manager.saveTests();
      yield manager.triggerExcelExport(updatedTest.id, "save");
      sendResponse2({ success: true });
    }));
    registry.register("MERGE_TEST_EXTENSION_ASSETS", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      if (!(yield requireAccess(self.ActionCatalog ? self.ActionCatalog.UPDATE_TEST : "test.update", sendResponse2))) {
        return;
      }
      const testId = String(message2.testId || "");
      const assets = message2.assets;
      if (!testId || !assets || typeof assets !== "object") {
        sendResponse2({ success: false, error: "Invalid testId or assets" });
        return;
      }
      const test = manager.tests.get(testId);
      if (!test) {
        sendResponse2({ success: false, error: "Test not found" });
        return;
      }
      test.extensionAssets = { ...test.extensionAssets || {} };
      const incoming = assets;
      if (incoming.visualRegressionBaselines && typeof incoming.visualRegressionBaselines === "object") {
        test.extensionAssets.visualRegressionBaselines = {
          ...test.extensionAssets.visualRegressionBaselines || {},
          ...incoming.visualRegressionBaselines
        };
      }
      for (const key of Object.keys(incoming)) {
        if (key !== "visualRegressionBaselines") {
          test.extensionAssets[key] = incoming[key];
        }
      }
      test.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      yield manager.saveTests();
      sendResponse2({ success: true });
    }));
    registry.register("SELECTOR_FOUND_DURING_PLAYBACK", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const testId = String(message2.testId);
        const selector = message2.selector;
        if (!testId || !selector) {
          sendResponse2({ success: false, error: "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u044B testId \u0438\u043B\u0438 selector" });
          return;
        }
        const test = manager.tests.get(testId);
        if (!test) {
          console.warn(`\u26A0\uFE0F \u0422\u0435\u0441\u0442 ${testId} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D`);
          sendResponse2({ success: false, error: "\u0422\u0435\u0441\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
          return;
        }
        const formatSelector = (sel) => {
          if (!sel) return "N/A";
          if (typeof sel === "string") return sel;
          if (sel.selector) return sel.selector;
          if (sel.value) return sel.value;
          return JSON.stringify(sel);
        };
        let found = false;
        for (let i = 0; i < test.actions.length; i++) {
          const action = test.actions[i];
          const actionSelector = action.selector;
          const formattedActionSelector = formatSelector(actionSelector);
          const normalizedActionSelector = formattedActionSelector.trim();
          const normalizedReceivedSelector = selector.trim();
          if (normalizedActionSelector === normalizedReceivedSelector || normalizedActionSelector.includes(normalizedReceivedSelector) || normalizedReceivedSelector.includes(normalizedActionSelector)) {
            if (action.selectorQuality) {
              const originalIssuesCount = action.selectorQuality.issues?.length || 0;
              action.selectorQuality.issues = (action.selectorQuality.issues || []).filter(
                (issue) => !issue.includes("\u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D") && !issue.includes("\u042D\u043B\u0435\u043C\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D")
              );
              if (action.selectorQuality.issues.length < originalIssuesCount) {
                action.selectorQuality.score = Math.max(action.selectorQuality.score || 0, 70);
                action.selectorQuality.stability = Math.max(action.selectorQuality.stability || 0, 60);
                action.selectorQuality.lastFoundDuringPlayback = true;
                action.selectorQuality.lastFoundAt = (/* @__PURE__ */ new Date()).toISOString();
                console.log(`\u2705 \u041C\u0435\u0442\u043A\u0430 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u043E\u0433\u043E \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440\u0430 \u0441\u043D\u044F\u0442\u0430 \u0434\u043B\u044F action #${i + 1} \u0432 \u0442\u0435\u0441\u0442\u0435 ${testId}`);
                found = true;
              } else if (originalIssuesCount === 0) {
                action.selectorQuality.lastFoundDuringPlayback = true;
                action.selectorQuality.lastFoundAt = (/* @__PURE__ */ new Date()).toISOString();
                found = true;
              }
            } else {
              action.selectorQuality = {
                score: 70,
                stability: 60,
                issues: [],
                lastFoundDuringPlayback: true,
                lastFoundAt: (/* @__PURE__ */ new Date()).toISOString()
              };
              console.log(`\u2705 \u0421\u043E\u0437\u0434\u0430\u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u044C selectorQuality \u0434\u043B\u044F action #${i + 1} \u0432 \u0442\u0435\u0441\u0442\u0435 ${testId}`);
              found = true;
            }
            if (found) break;
          }
        }
        if (found) {
          test.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          manager.tests.set(testId, test);
          yield manager.saveTests();
          chrome.runtime.sendMessage({
            type: "TEST_UPDATED",
            testId
          }).catch(() => {
          });
        }
        sendResponse2({ success: true, found });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 SELECTOR_FOUND_DURING_PLAYBACK:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("GET_LOCAL_STORAGE_FROM_TAB", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const tabId2 = message2.tabId;
        const keys = message2.keys || [];
        if (!tabId2) {
          sendResponse2({ success: false, error: "Tab ID \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D" });
          return;
        }
        let tab;
        try {
          tab = yield chrome.tabs.get(tabId2);
        } catch (e) {
          sendResponse2({ success: false, error: `\u0412\u043A\u043B\u0430\u0434\u043A\u0430 ${tabId2} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430` });
          return;
        }
        if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
          sendResponse2({ success: false, error: `\u0412\u043A\u043B\u0430\u0434\u043A\u0430 ${tabId2} \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0434\u043B\u044F \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F localStorage` });
          return;
        }
        try {
          const response = yield chrome.tabs.sendMessage(tabId2, { type: "GET_LOCAL_STORAGE" });
          if (response && response.success && response.data) {
            const data = keys.length > 0 ? Object.fromEntries(keys.filter((k) => k in response.data).map((k) => [k, response.data[k]])) : response.data;
            sendResponse2({ success: true, data });
          } else {
            sendResponse2({ success: false, error: response?.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C localStorage" });
          }
        } catch (scriptError) {
          try {
            const results2 = yield chrome.scripting.executeScript({
              target: { tabId: tabId2 },
              func: (keys2) => {
                const items = {};
                if (keys2.length === 0) {
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    items[key] = localStorage.getItem(key);
                  }
                } else {
                  for (const key of keys2) {
                    items[key] = localStorage.getItem(key);
                  }
                }
                return items;
              },
              args: [keys]
            });
            if (results2 && results2[0] && results2[0].result) {
              sendResponse2({ success: true, data: results2[0].result });
            } else {
              sendResponse2({ success: false, error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C localStorage \u0447\u0435\u0440\u0435\u0437 executeScript" });
            }
          } catch (executeError) {
            sendResponse2({ success: false, error: `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C localStorage: ${executeError.message}` });
          }
        }
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 localStorage \u0441 \u0432\u043A\u043B\u0430\u0434\u043A\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("API_REQUEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        console.log("\u{1F310} [Background] \u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 API \u0437\u0430\u043F\u0440\u043E\u0441\u0430");
        const { method, url, headers, body } = message2;
        const fetchOptions = {
          method: method || "GET",
          headers: {
            "Content-Type": "application/json",
            ...headers
          }
        };
        if (body && ["POST", "PUT", "PATCH"].includes(method)) {
          fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
        }
        const response = yield typeof withRetry === "function" ? withRetry(() => fetch(url, fetchOptions), {
          maxAttempts: 3,
          delayMs: 1e3,
          shouldRetry: (err) => err?.name === "TypeError" || err?.message && /network|failed|fetch/i.test(err.message)
        }) : fetch(url, fetchOptions);
        const responseData = yield response.text();
        let parsedData;
        try {
          parsedData = JSON.parse(responseData);
        } catch (e) {
          parsedData = responseData;
        }
        if (!response.ok) {
          sendResponse2({
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            data: parsedData
          });
          return;
        }
        sendResponse2({
          success: true,
          data: parsedData,
          status: response.status,
          statusText: response.statusText
        });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 API \u0437\u0430\u043F\u0440\u043E\u0441\u0430:", error);
        sendResponse2({
          success: false,
          error: error.message || "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 API \u0437\u0430\u043F\u0440\u043E\u0441\u0430"
        });
      }
    }));
    registry.register("TEST_STEP_PROGRESS", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      if (sender?.tab?.id != null) {
        manager.playbackTabId = sender.tab.id;
      }
      if (message2.testId != null && message2.testId !== "") {
        manager.activePlaybackTestId = String(message2.testId);
      }
      manager.currentStep = message2.step;
      manager.totalSteps = message2.total;
      manager.stepType = message2.stepType;
      manager.broadcast({
        type: "STEP_PROGRESS_UPDATE",
        step: message2.step,
        total: message2.total,
        stepType: message2.stepType,
        testId: message2.testId
      }).catch(() => {
      });
      sendResponse2({ success: true });
    }));
    registry.register("TEST_STEP_COMPLETED", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      if (sender?.tab?.id != null) {
        manager.playbackTabId = sender.tab.id;
      }
      if (message2.testId != null && message2.testId !== "") {
        manager.activePlaybackTestId = String(message2.testId);
      }
      if (!manager.completedSteps) {
        manager.completedSteps = /* @__PURE__ */ new Map();
      }
      const testId = message2.testId;
      if (!manager.completedSteps.has(testId)) {
        manager.completedSteps.set(testId, []);
      }
      const completedSteps = manager.completedSteps.get(testId);
      const existingStepIndex = completedSteps.findIndex((s) => s.step === message2.step);
      const stepInfo = {
        step: message2.step,
        total: message2.total,
        success: message2.success,
        error: message2.error || null,
        timestamp: Date.now()
      };
      if (existingStepIndex >= 0) {
        completedSteps[existingStepIndex] = stepInfo;
      } else {
        completedSteps.push(stepInfo);
      }
      completedSteps.sort((a, b) => a.step - b.step);
      const nextStep = Number(message2.step) + 1;
      if (!Number.isNaN(nextStep)) {
        manager.currentStep = Math.max(manager.currentStep || 0, nextStep);
        manager.totalSteps = Math.max(manager.totalSteps || 0, Number(message2.total) || 0);
      }
      manager.broadcast({
        type: "STEP_COMPLETED_UPDATE",
        testId,
        step: message2.step,
        total: message2.total,
        success: message2.success,
        error: message2.error || null,
        completedSteps
      }).catch(() => {
      });
      sendResponse2({ success: true });
    }));
    registry.register("TEST_COMPLETED", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      yield manager.stopVideoRecordingIfActive(message2.testId);
      const runMode = message2.runMode || "optimized";
      const optimizationSummary = message2.optimizationSummary || {};
      let suppressCompletionPopup = false;
      if (manager.dataDrivenState && String(manager.dataDrivenState.testId) === String(message2.testId)) {
        const st = manager.dataDrivenState;
        const durationMs = typeof message2.durationMs === "number" ? message2.durationMs : 0;
        const stepsCompleted = typeof message2.stepsCompleted === "number" ? message2.stepsCompleted : 0;
        const stepsTotal = typeof message2.stepsTotal === "number" ? message2.stepsTotal : 0;
        st.results.push({
          rowIndex: st.index,
          row: st.rows[st.index],
          success: message2.success,
          error: message2.error || null,
          stepsCompleted,
          stepsTotal,
          durationMs
        });
        st.index++;
        if (st.index < st.rows.length) {
          suppressCompletionPopup = true;
          manager.isPlaying = true;
          manager.handlePlayTest({
            testId: st.testId,
            test: st.test,
            mode: st.mode,
            debugMode: st.debugMode,
            groupContext: { ...st.rows[st.index] },
            _fromDataDrivenQueue: true
          }, () => {
          });
          sendResponse2({ success: true, suppressCompletionPopup: true });
          return;
        }
        const summary = {
          testId: st.testId,
          testName: manager.tests.get(String(st.testId))?.name || "",
          totalRows: st.rows.length,
          results: st.results.slice(),
          allPassed: st.results.every((r) => r.success)
        };
        manager.dataDrivenState = null;
        manager.broadcast({
          type: "DATA_DRIVEN_RUN_COMPLETED",
          summary
        }).catch(() => {
        });
      }
      if (manager.currentGroupId) {
        suppressCompletionPopup = true;
        const group = manager.testGroups.get(manager.currentGroupId);
        if (group && Array.isArray(group.testIds) && message2.testId === group.testIds[manager.groupRunIndex]) {
          const testName = message2.testName || manager.tests.get(message2.testId)?.name || String(message2.testId);
          const durationMs = typeof message2.durationMs === "number" ? message2.durationMs : 0;
          const stepsCompleted = typeof message2.stepsCompleted === "number" ? message2.stepsCompleted : 0;
          const stepsTotal = typeof message2.stepsTotal === "number" ? message2.stepsTotal : 0;
          (manager.groupRunResults = manager.groupRunResults || []).push({
            testId: message2.testId,
            testName,
            success: message2.success,
            error: message2.error || null,
            stepsCompleted,
            stepsTotal,
            durationMs
          });
          if (message2.updatedVariables && typeof message2.updatedVariables === "object") {
            for (const [k, v] of Object.entries(message2.updatedVariables)) {
              manager.groupContext[k] = v;
            }
          }
          manager.groupRunIndex++;
          if (manager.groupRunIndex < group.testIds.length) {
            const nextTestId = group.testIds[manager.groupRunIndex];
            manager.isPlaying = true;
            manager.handlePlayTest({
              testId: nextTestId,
              mode: manager.groupRunMode,
              debugMode: manager.groupDebugMode,
              groupContext: { ...manager.groupContext },
              isGroupRun: true,
              groupRunCurrentIndex: manager.groupRunIndex,
              groupRunTotal: group.testIds.length
            }, () => {
            });
            sendResponse2({ success: true, suppressCompletionPopup: true });
            return;
          }
        }
        const finishedGroupId = manager.currentGroupId;
        const results2 = manager.groupRunResults || [];
        const totalDurationMs = results2.reduce((sum, r) => sum + (r.durationMs || 0), 0);
        const errors = results2.filter((r) => !r.success && (r.error || r.error === 0)).map((r) => ({ testName: r.testName || r.testId, error: r.error }));
        const groupSuccess = results2.every((r) => r.success);
        const groupError = errors.length > 0 ? errors.map((e) => `${e.testName}: ${e.error}`).join("; ") : null;
        manager.groupRunIndex = 0;
        manager.groupRunResults = [];
        manager.groupContext = {};
        manager.currentGroupId = null;
        manager.broadcast({
          type: "GROUP_COMPLETED",
          groupId: finishedGroupId,
          success: groupSuccess,
          error: groupError,
          summary: { results: results2, totalDurationMs, errors }
        }).catch(() => {
        });
        const tabId2 = sender?.tab?.id;
        if (tabId2 && results2.length > 0) {
          const summaryPayload = { results: results2, totalDurationMs, errors, success: groupSuccess, error: groupError };
          const GROUP_SUMMARY_DELAY_MS = 2200;
          const RETRY_DELAY_MS = 1500;
          const MAX_RETRIES = 3;
          let attempt = 0;
          const sendSummary = () => {
            attempt += 1;
            chrome.tabs.sendMessage(tabId2, {
              type: "SHOW_GROUP_SUMMARY",
              summary: summaryPayload
            }).catch((e) => {
              if (attempt < MAX_RETRIES) {
                console.warn(`SHOW_GROUP_SUMMARY \u043F\u043E\u043F\u044B\u0442\u043A\u0430 ${attempt} \u043D\u0435 \u0443\u0434\u0430\u043B\u0430\u0441\u044C, \u043F\u043E\u0432\u0442\u043E\u0440 \u0447\u0435\u0440\u0435\u0437 ${RETRY_DELAY_MS}ms:`, e?.message);
                setTimeout(sendSummary, RETRY_DELAY_MS);
              } else {
                console.warn("SHOW_GROUP_SUMMARY \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432:", e?.message);
              }
            });
          };
          setTimeout(sendSummary, GROUP_SUMMARY_DELAY_MS);
        }
      }
      manager.isPlaying = false;
      manager.isPaused = false;
      manager.activePlaybackTestId = null;
      manager.currentStep = 0;
      manager.totalSteps = 0;
      manager.stepType = null;
      manager.playbackState = null;
      manager.playbackTabId = null;
      try {
        yield chrome.storage.local.remove("playbackState");
        console.log("\u2705 \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E\u0447\u0438\u0449\u0435\u043D\u043E \u0438\u0437 storage \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0442\u0435\u0441\u0442\u0430");
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0438\u0437 storage:", error);
      }
      manager.broadcast({
        type: "TEST_COMPLETED",
        testId: message2.testId,
        success: message2.success,
        error: message2.error,
        adaptiveRunResults: message2.adaptiveRunResults || null,
        actionUrlUpdates: message2.actionUrlUpdates || null
      }).catch(() => {
      });
      manager.broadcast({
        type: "STEP_PROGRESS_UPDATE",
        step: 0,
        total: 0,
        stepType: null,
        testId: message2.testId
      }).catch(() => {
      });
      const completedTest = manager.tests.get(message2.testId);
      if (completedTest && message2.adaptiveRunResults && Array.isArray(message2.adaptiveRunResults) && completedTest.actions) {
        message2.adaptiveRunResults.forEach((result2, idx) => {
          if (result2 && completedTest.actions[idx]?.type === "adaptive") {
            completedTest.actions[idx]._runHistory = result2._runHistory || [];
            if (result2._statistics) completedTest.actions[idx]._statistics = result2._statistics;
          }
        });
      }
      if (completedTest?.actions && message2.actionUrlUpdates?.length) {
        message2.actionUrlUpdates.forEach(({ index, url }) => {
          if (completedTest.actions[index]?.type === "analysis" && url) {
            completedTest.actions[index].url = url;
          }
        });
      }
      if (completedTest) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        completedTest.optimization = completedTest.optimization || {};
        if (runMode === "full") {
          completedTest.optimization.lastFullRunAt = now;
          completedTest.optimization.lastFullRunStatus = message2.success ? "success" : "failed";
        } else if (runMode === "optimized") {
          completedTest.optimization.lastOptimizedRunAt = now;
        }
        if (optimizationSummary.removedCount > 0) {
          completedTest.optimization.optimizedAvailable = true;
          completedTest.optimization.lastOptimizationAt = now;
          completedTest.optimization.lastRemovedCount = optimizationSummary.removedCount;
          completedTest.optimization.lastRemovedIndices = optimizationSummary.removedIndices || optimizationSummary.removedActions || [];
        } else if (!completedTest.optimization.optimizedAvailable) {
          completedTest.optimization.optimizedAvailable = completedTest.actions?.some((action) => action.hidden) || false;
        }
        manager.tests.set(completedTest.id, completedTest);
        yield manager.saveTests();
        manager.broadcast({
          type: "TEST_OPTIMIZATION_UPDATED",
          testId: completedTest.id,
          optimization: completedTest.optimization
        }).catch(() => {
        });
      }
      sendResponse2({ success: true, suppressCompletionPopup });
    }));
    registry.register("REMOVE_INEFFECTIVE_ACTIONS", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      const testToUpdate = manager.tests.get(message2.testId);
      if (!testToUpdate) {
        sendResponse2({ success: false, error: "Test not found" });
        return;
      }
      if (testToUpdate.optimization?.optimizedApplied) {
        console.log(`\u26A0\uFE0F \u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u0430 ${testToUpdate.name} \u0443\u0436\u0435 \u0431\u044B\u043B\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0430 \u0440\u0430\u043D\u0435\u0435, \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E`);
        sendResponse2({
          success: true,
          removed: 0,
          skipped: true,
          reason: "\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u0443\u0436\u0435 \u0431\u044B\u043B\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0430 \u0440\u0430\u043D\u0435\u0435"
        });
        return;
      }
      const actionIndices = message2.actionIndices || [];
      if (actionIndices.length === 0) {
        sendResponse2({ success: true, removed: 0 });
        return;
      }
      const runMode = message2.runMode || "optimized";
      const actionDetails = message2.actionDetails || [];
      const detailMap = new Map(actionDetails.map((detail) => [detail.index, detail]));
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const actions = testToUpdate.actions;
      const getActionText = (action) => String(
        action?.fieldLabel || action?.description || action?.name || action?.label || action?.value || ""
      ).toLowerCase();
      const hasExplicitSelector = (action) => {
        const selectorText = String(action?.selector?.selector || action?.selector?.value || action?.selector || "").trim();
        if (!selectorText) return false;
        return selectorText.startsWith("#") || /\[[^\]]+\]/.test(selectorText) || /elementid|ng-reflect-element-id|aria-label|name=|id=/.test(selectorText);
      };
      const hasNearbyAnalog = (index, action) => {
        for (let j = Math.max(0, index - 2); j <= Math.min(actions.length - 1, index + 2); j++) {
          if (j === index) continue;
          const neighbor = actions[j];
          if (!neighbor || neighbor.hidden) continue;
          if (neighbor.type !== action.type) continue;
          if (!neighbor.selector || !action.selector) continue;
          if (manager.areSelectorsEqual(neighbor.selector, action.selector)) {
            return true;
          }
        }
        return false;
      };
      const shouldProtectFromAutoHide = (index, action) => {
        if (!action) return false;
        const type = String(action.type || "").toLowerCase();
        if (!["click", "dblclick", "input", "change", "navigate", "navigation"].includes(type)) return false;
        if (!hasExplicitSelector(action)) return false;
        const text = getActionText(action);
        const isSignificant = /(save|submit|send|create|delete|publish|apply|сохран|отправ|созда|удал|примен|опубли)/i.test(text);
        if (!isSignificant) return false;
        return !hasNearbyAnalog(index, action);
      };
      const sortedIndices = [...actionIndices].sort((a, b) => b - a);
      let removedCount = 0;
      let skippedCount = 0;
      for (const index of sortedIndices) {
        if (index >= 0 && index < testToUpdate.actions.length) {
          const action = testToUpdate.actions[index];
          if (action.userEdited) {
            console.log(`\u23ED\uFE0F \u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E \u0448\u0430\u0433 ${index + 1}: \u0431\u044B\u043B \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C`);
            skippedCount++;
            continue;
          }
          if (!action.hidden) {
            if (shouldProtectFromAutoHide(index, action)) {
              console.log(`\u{1F6E1}\uFE0F \u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u044E auto-hidden \u0434\u043B\u044F \u0437\u043D\u0430\u0447\u0438\u043C\u043E\u0433\u043E \u0448\u0430\u0433\u0430 ${index + 1} (\u044F\u0432\u043D\u044B\u0439 \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440, \u043D\u0435\u0442 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u0430\u043D\u0430\u043B\u043E\u0433\u043E\u0432)`);
              skippedCount++;
              continue;
            }
            action.hidden = true;
            removedCount++;
            action.hiddenAt = now;
            action.hiddenReason = "ineffective";
            action.hiddenBy = "auto";
            action.hiddenRunMode = runMode;
            action.hiddenDetails = detailMap.get(index) || {};
            console.log(`\u{1F9F9} \u0421\u043A\u0440\u044B\u0442 \u043D\u0435\u044D\u0444\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0448\u0430\u0433 ${index + 1}: ${action.type}`);
          } else {
            skippedCount++;
          }
        }
      }
      if (removedCount > 0) {
        testToUpdate.optimization = testToUpdate.optimization || {};
        testToUpdate.optimization.optimizedAvailable = true;
        testToUpdate.optimization.optimizedApplied = true;
        testToUpdate.optimization.lastOptimizationAt = now;
        testToUpdate.optimization.lastRemovedCount = removedCount;
        testToUpdate.optimization.lastRemovedIndices = sortedIndices;
        manager.tests.set(testToUpdate.id, testToUpdate);
        yield manager.saveTests();
        console.log(`\u2705 \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u043E ${removedCount} \u043D\u0435\u044D\u0444\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0448\u0430\u0433\u043E\u0432 \u0438\u0437 \u0442\u0435\u0441\u0442\u0430 ${testToUpdate.name}`);
        if (skippedCount > 0) {
          console.log(`   \u23ED\uFE0F \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${skippedCount} \u0448\u0430\u0433\u043E\u0432, \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C`);
        }
        manager.broadcast({
          type: "TEST_OPTIMIZATION_UPDATED",
          testId: testToUpdate.id,
          optimization: testToUpdate.optimization
        }).catch(() => {
        });
      } else if (skippedCount > 0) {
        console.log("\u2139\uFE0F \u0412\u0441\u0435 \u043D\u0435\u044D\u0444\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0448\u0430\u0433\u0438 \u0431\u044B\u043B\u0438 \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C, \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0430");
      }
      sendResponse2({
        success: true,
        removed: removedCount,
        removedIndices: sortedIndices,
        skipped: skippedCount
      });
    }));
    registry.register("OPEN_POPUP", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        try {
          yield chrome.action.openPopup();
          sendResponse2({ success: true });
        } catch (openError) {
          const popupUrl = chrome.runtime.getURL("popup/popup-fullscreen.html");
          yield chrome.windows.create({
            url: popupUrl,
            type: "popup",
            width: 500,
            height: 700,
            focused: true
          });
          sendResponse2({ success: true });
        }
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0438 popup:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("CLOSE_POPUP_IF_OPEN", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        const windows = yield chrome.windows.getAll({ windowTypes: ["popup"] });
        for (const win of windows) {
          try {
            const tab = yield chrome.tabs.query({ windowId: win.id });
            if (tab && tab.length > 0 && tab[0].url && tab[0].url.includes(chrome.runtime.id)) {
              yield chrome.windows.remove(win.id);
              console.log("\u2705 Popup \u043E\u043A\u043D\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u043E:", win.id);
            }
          } catch (err) {
            console.warn("\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0438 popup \u043E\u043A\u043D\u0430:", err);
          }
        }
        sendResponse2({ success: true });
      } catch (error) {
        console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0438 popup:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("CAPTURE_FULL_PAGE_SCREENSHOT", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      const safeSend = (res) => {
        try {
          sendResponse2(res);
        } catch (e) {
          console.warn("CAPTURE_FULL_PAGE_SCREENSHOT sendResponse failed:", e?.message);
        }
      };
      const tabId2 = message2?.tabId || sender?.tab?.id;
      if (!tabId2) {
        safeSend({ success: false, error: "tabId \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D" });
        return;
      }
      try {
        yield chrome.debugger.attach({ tabId: tabId2 }, "1.3");
      } catch (e) {
        if (e?.message?.includes("Another debugger")) {
          safeSend({ success: false, error: "DevTools \u0443\u0436\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044B. \u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 DevTools (Ctrl+Shift+I) \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435. \u041A\u043E\u043C\u0430\u043D\u0434\u0430 \xAB\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u043E\u0440\u0430\u0437\u043C\u0435\u0440\u043D\u044B\u0439 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\xBB / \xABCapture full size screenshot\xBB \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 DevTools." });
          return;
        }
        safeSend({ success: false, error: e?.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C debugger" });
        return;
      }
      const detach = () => {
        try {
          chrome.debugger.detach({ tabId: tabId2 });
        } catch (_) {
        }
      };
      const sendCmd = (method, params = {}) => new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId: tabId2 }, method, params, (result2) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result2);
          }
        });
      });
      try {
        yield sendCmd("Page.enable");
        const metrics = yield sendCmd("Page.getLayoutMetrics");
        const rect = metrics.cssContentSize || metrics.contentSize || metrics.layoutMetrics?.contentSize;
        const rawHeight = rect?.height ?? 1080;
        const rawWidth = rect?.width ?? 1920;
        if (rawHeight > 16384 || rawWidth > 16384) {
          detach();
          safeSend({ success: false, error: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043B\u0438\u043C\u0438\u0442 Chrome (16384px). \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0441\u043A\u043B\u0435\u0439\u043A\u0430." });
          return;
        }
        const width = Math.ceil(Math.min(Math.max(rawWidth, 800), 16384));
        const height = Math.ceil(Math.min(Math.max(rawHeight, 600), 16384));
        yield sendCmd("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        yield new Promise((r) => setTimeout(r, 1500));
        const shot = yield sendCmd("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: true
        });
        yield sendCmd("Emulation.clearDeviceMetricsOverride");
        detach();
        safeSend({ success: true, screenshot: "data:image/png;base64," + shot.data });
      } catch (e) {
        detach();
        const errMsg = e?.message || e?.toString?.() || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0445\u0432\u0430\u0442\u0430";
        console.warn("CAPTURE_FULL_PAGE_SCREENSHOT error:", errMsg);
        safeSend({ success: false, error: errMsg });
      }
    }));
    registry.register("TAKE_SCREENSHOT", (_0) => __async(null, [_0], function* ({ sender, sendResponse: sendResponse2 }) {
      const safeSend = (res) => {
        try {
          sendResponse2(res);
        } catch (e) {
          console.warn("TAKE_SCREENSHOT sendResponse failed:", e?.message);
        }
      };
      let activeTab;
      try {
        if (sender?.tab?.id) {
          activeTab = sender.tab;
        }
        if (!activeTab) {
          const [tab] = yield chrome.tabs.query({ active: true, currentWindow: true });
          activeTab = tab;
        }
        if (!activeTab || !activeTab.id) {
          safeSend({ success: false, error: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
          return;
        }
        const { pluginSettings } = yield chrome.storage.local.get("pluginSettings");
        const screenshotSettings = pluginSettings?.screenshots || {};
        const format = screenshotSettings.format === "png" || screenshotSettings.format === "jpeg" ? screenshotSettings.format : "jpeg";
        const quality = Math.min(100, Math.max(0, Number(screenshotSettings.quality) || 85));
        const captureOptions = { format, quality };
        const dataUrl = yield chrome.tabs.captureVisibleTab(activeTab.windowId, captureOptions);
        safeSend({ success: true, screenshot: dataUrl });
      } catch (error) {
        console.error("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u0430:", error);
        if (error.message && error.message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
          console.warn("\u26A0\uFE0F \u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D\u0430 \u043A\u0432\u043E\u0442\u0430 captureVisibleTab, \u043E\u0436\u0438\u0434\u0430\u044E 1.5 \u0441\u0435\u043A \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u043C...");
          try {
            yield new Promise((r) => setTimeout(r, 1500));
            const retryTab = activeTab || (yield chrome.tabs.query({ active: true, currentWindow: true }))[0];
            if (!retryTab || !retryTab.id) {
              safeSend({ success: false, error: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
              return;
            }
            const { pluginSettings } = yield chrome.storage.local.get("pluginSettings");
            const screenshotSettings = pluginSettings?.screenshots || {};
            const format = screenshotSettings.format === "png" || screenshotSettings.format === "jpeg" ? screenshotSettings.format : "jpeg";
            const quality = Math.min(100, Math.max(0, Number(screenshotSettings.quality) || 85));
            const retryDataUrl = yield chrome.tabs.captureVisibleTab(retryTab.windowId, { format, quality });
            safeSend({ success: true, screenshot: retryDataUrl, retriedAfterQuota: true });
            return;
          } catch (retryError) {
            console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043F\u043E\u043F\u044B\u0442\u043A\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u0430:", retryError);
          }
        } else if (error.message && error.message.includes("Tabs cannot be edited right now")) {
          console.warn("\u26A0\uFE0F \u0412\u043A\u043B\u0430\u0434\u043A\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 (Tabs cannot be edited right now), \u0436\u0434\u0443 1 \u0441\u0435\u043A \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u043C...");
          try {
            yield new Promise((r) => setTimeout(r, 1e3));
            const retryTab = activeTab || (yield chrome.tabs.query({ active: true, currentWindow: true }))[0];
            if (!retryTab || !retryTab.id) {
              safeSend({ success: false, error: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
              return;
            }
            const { pluginSettings } = yield chrome.storage.local.get("pluginSettings");
            const screenshotSettings = pluginSettings?.screenshots || {};
            const format = screenshotSettings.format === "png" || screenshotSettings.format === "jpeg" ? screenshotSettings.format : "jpeg";
            const quality = Math.min(100, Math.max(0, Number(screenshotSettings.quality) || 85));
            const retryDataUrl = yield chrome.tabs.captureVisibleTab(retryTab.windowId, { format, quality });
            safeSend({ success: true, screenshot: retryDataUrl, retriedAfterTabEditBusy: true });
            return;
          } catch (retryError) {
            console.error("\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043F\u043E\u043F\u044B\u0442\u043A\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u0430 \u043F\u043E\u0441\u043B\u0435 Tabs cannot be edited:", retryError);
          }
        }
        safeSend({ success: false, error: error.message });
      }
    }));
    registry.register("SAVE_SCREENSHOT_TO_FILE", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const { screenshot, testId, runId, stepNumber, screenshotType, savePath } = message2;
        if (!screenshot || !testId || stepNumber === void 0) {
          sendResponse2({ success: false, error: "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u044B \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B" });
          return;
        }
        const settings = yield chrome.storage.local.get("pluginSettings");
        const screenshotSettings = settings.pluginSettings?.screenshots || {};
        let screenshotMode = "none";
        if (screenshotSettings.saveToDisk === true) {
          screenshotMode = "download";
        } else if (screenshotSettings.saveToDisk === false) {
          screenshotMode = "none";
        } else if (screenshotSettings.mode === "download" || screenshotSettings.mode === "extension" || screenshotSettings.mode === "none") {
          screenshotMode = screenshotSettings.mode;
        }
        if (screenshotMode === "none") {
          sendResponse2({ success: true, skipped: true, reason: "mode:none" });
          return;
        }
        if (screenshotMode === "extension") {
          sendResponse2({ success: true, skipped: true, reason: "mode:extension" });
          return;
        }
        const timestamp = runId || Date.now();
        const typeSuffix = screenshotType || "screenshot";
        const stepNumberForFile = String(stepNumber).replace(/\./g, "_");
        const fileLabel = typeSuffix === "screenshot" ? `screenshot_step_${stepNumberForFile}` : `step${stepNumberForFile}_${typeSuffix}`;
        const mediaBase = (settings.pluginSettings?.mediaSavePath || screenshotSettings.saveFolder || (screenshotSettings.savePath || "").replace(/\/screenshots\/?$/i, "") || "AutoTestRecorder").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
        const baseDir = (mediaBase || "AutoTestRecorder") + "/screenshots";
        const format = screenshotSettings.format === "png" || screenshotSettings.format === "jpeg" ? screenshotSettings.format : "jpeg";
        const ext = format === "jpeg" ? "jpg" : "png";
        const mime = format === "jpeg" ? "image/jpeg" : "image/png";
        const fileName = `${baseDir}/${testId}/${timestamp}/${fileLabel}.${ext}`;
        const dataUrl = screenshot.startsWith("data:") ? screenshot : `data:${mime};base64,${screenshot}`;
        const downloadId = yield chrome.downloads.download({
          url: dataUrl,
          filename: fileName,
          saveAs: false
        });
        sendResponse2({
          success: true,
          filePath: fileName,
          downloadId
        });
      } catch (error) {
        console.error("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442\u0430 \u0432 \u0444\u0430\u0439\u043B:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("SAVE_VIDEO_FILE", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const { filename, base64Data, mimeType } = message2;
        if (!filename || !base64Data) {
          sendResponse2({ success: false, error: "Missing filename or base64Data" });
          return;
        }
        const dataUrl = `data:${mimeType || "video/webm"};base64,${base64Data}`;
        yield chrome.downloads.download({
          url: dataUrl,
          filename,
          saveAs: false
        });
        sendResponse2({ success: true, filename });
      } catch (error) {
        console.error("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0432\u0438\u0434\u0435\u043E:", error);
        sendResponse2({ success: false, error: error?.message || String(error) });
      } finally {
        if (chrome.offscreen && typeof chrome.offscreen.closeDocument === "function") {
          chrome.offscreen.closeDocument().catch(() => {
          });
        }
      }
    }));
    registry.register("CLOSE_DIALOG_MAIN", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      try {
        const tabId2 = message2?.tabId || sender?.tab?.id || (yield chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (!tabId2) {
          sendResponse2({ closed: false, error: "no tab" });
          return;
        }
        const results2 = yield chrome.scripting.executeScript({
          target: { tabId: tabId2, allFrames: true },
          world: "MAIN",
          func: () => {
            const tryClose = (root) => {
              const sel = '.cdk-overlay-pane,[role="dialog"],.mat-dialog-container,.mat-mdc-dialog-container,[class*="dialog-container"],[class*="modal"],[class*="overlay-pane"]';
              const all = root.querySelectorAll(sel);
              for (let j = 0; j < all.length; j++) {
                const d = all[j];
                if (d.id === "autotest-completion-popup" || d.closest("#autotest-completion-popup")) continue;
                if (!d.offsetParent || d.offsetWidth < 80) continue;
                const txt = (d.textContent || "").toLowerCase();
                if (txt.indexOf("\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F") < 0 && txt.indexOf("\u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D") < 0) continue;
                const closeEl = d.querySelector('[aria-label*="close"],[aria-label*="Close"],[aria-label*="\u0437\u0430\u043A\u0440\u044B\u0442\u044C"],[class*="close-icon"],[class*="close"]');
                if (closeEl) {
                  closeEl.click();
                  return true;
                }
                const btns = d.querySelectorAll('button,[role="button"],[class*="button"]');
                for (let i = 0; i < btns.length; i++) {
                  const t = (btns[i].textContent || "").trim().toLowerCase();
                  if (t === "ok" || t === "\u043E\u043A") {
                    btns[i].click();
                    return true;
                  }
                }
                if (btns.length > 0) {
                  btns[btns.length - 1].click();
                  return true;
                }
              }
              return false;
            };
            if (tryClose(document)) return true;
            const walk = (el) => {
              if (el.shadowRoot) {
                if (tryClose(el.shadowRoot)) return true;
                for (const c of el.shadowRoot.querySelectorAll("*")) {
                  if (walk(c)) return true;
                }
              }
              for (const c of el.children || []) {
                if (walk(c)) return true;
              }
              return false;
            };
            if (walk(document.body)) return true;
            const iter = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
            let n;
            while (n = iter.nextNode()) {
              if (n.id === "autotest-completion-popup" || n.closest("#autotest-completion-popup")) continue;
              const txt = (n.textContent || "").toLowerCase();
              if (txt.indexOf("\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F") < 0) continue;
              let d = n;
              for (let up = 0; up < 20 && d; up++) {
                d = d.parentElement;
                if (!d || !d.offsetParent) continue;
                if (d.id === "autotest-completion-popup" || d.closest("#autotest-completion-popup")) break;
                const btns = d.querySelectorAll('button,[role="button"]');
                if (btns.length === 0) continue;
                for (let i = 0; i < btns.length; i++) {
                  const t = (btns[i].textContent || "").trim().toLowerCase();
                  if (t === "ok" || t === "\u043E\u043A") {
                    btns[i].click();
                    return true;
                  }
                }
                btns[btns.length - 1].click();
                return true;
              }
            }
            return false;
          }
        });
        const closed = results2?.some((r) => r?.result === true);
        sendResponse2({ closed });
      } catch (e) {
        sendResponse2({ closed: false, error: e?.message });
      }
    }));
    registry.register("EXECUTE_JS", (_0) => __async(null, [_0], function* ({ message, sendResponse }) {
      try {
        const { script, tabId } = message;
        if (!script || typeof script !== "string") {
          sendResponse({ success: false, error: "\u0421\u043A\u0440\u0438\u043F\u0442 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u0438\u043B\u0438 \u0438\u043C\u0435\u0435\u0442 \u043D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442" });
          return;
        }
        const targetTabId = tabId || (yield chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (!targetTabId) {
          sendResponse({ success: false, error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C tabId \u0434\u043B\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0441\u043A\u0440\u0438\u043F\u0442\u0430" });
          return;
        }
        console.log(`\u{1F4DC} [Background] \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 JS \u0447\u0435\u0440\u0435\u0437 chrome.scripting \u0432\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0435 ${targetTabId}`);
        const results = yield chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: (scriptCode) => {
            try {
              const result = eval(scriptCode);
              return { success: true, result };
            } catch (e) {
              return { success: false, error: e.message };
            }
          },
          args: [script]
        });
        if (results && results[0] && results[0].result) {
          const { success, result: result2, error } = results[0].result;
          if (success) {
            console.log(`\u2705 [Background] JS \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D \u0443\u0441\u043F\u0435\u0448\u043D\u043E`);
            sendResponse({ success: true, result: result2 });
          } else {
            console.error(`\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F JS: ${error}`);
            sendResponse({ success: false, error });
          }
        } else {
          sendResponse({ success: false, error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442" });
        }
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 JS \u0447\u0435\u0440\u0435\u0437 chrome.scripting:", error);
        sendResponse({ success: false, error: error.message });
      }
    }));
    registry.register("SWITCH_TAB", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      try {
        const { switchTab } = message2;
        const mode = switchTab?.mode || "index";
        let currentWindowId = sender?.tab?.windowId;
        if (!currentWindowId) {
          const win = yield chrome.windows.getCurrent();
          currentWindowId = win?.id;
        }
        const tabs = yield chrome.tabs.query({
          windowId: currentWindowId,
          windowType: "normal"
        });
        const filteredTabs = tabs.filter((t) => t.url && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://"));
        const sortedTabs = filteredTabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        let targetTab = null;
        if (mode === "index") {
          const idx = Math.max(0, parseInt(switchTab?.tabIndex, 10) || 0);
          targetTab = sortedTabs[idx] || null;
        } else if (mode === "url" && switchTab?.urlPattern) {
          const pattern = switchTab.urlPattern.trim();
          const isRegex = pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/");
          let re = null;
          if (isRegex) {
            try {
              re = new RegExp(pattern.slice(1, -1));
            } catch (e) {
              console.warn("\u26A0\uFE0F [Background] \u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 regex \u0434\u043B\u044F switch-tab url:", e.message);
            }
          }
          targetTab = sortedTabs.find((t) => {
            if (re) return re.test(t.url || "");
            return (t.url || "").toLowerCase().includes(pattern.toLowerCase());
          }) || null;
        } else if (mode === "title" && switchTab?.titlePattern) {
          const pattern = switchTab.titlePattern.trim();
          const isRegex = pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/");
          let re = null;
          if (isRegex) {
            try {
              re = new RegExp(pattern.slice(1, -1));
            } catch (e) {
              console.warn("\u26A0\uFE0F [Background] \u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 regex \u0434\u043B\u044F switch-tab title:", e.message);
            }
          }
          targetTab = sortedTabs.find((t) => {
            const title = t.title || "";
            if (re) return re.test(title);
            return title.toLowerCase().includes(pattern.toLowerCase());
          }) || null;
        }
        if (!targetTab || !targetTab.id) {
          sendResponse2({ success: false, error: "\u0412\u043A\u043B\u0430\u0434\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
          return;
        }
        yield chrome.tabs.update(targetTab.id, { active: true });
        sendResponse2({ success: true, tabId: targetTab.id });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("REFRESH_TAB", (_0) => __async(null, [_0], function* ({ message: message2, sender, sendResponse: sendResponse2 }) {
      try {
        const tabId2 = message2.tabId ?? sender?.tab?.id;
        if (!tabId2) {
          sendResponse2({ success: false, error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0434\u043B\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F" });
          return;
        }
        const tab = yield chrome.tabs.get(tabId2);
        const url = tab?.url || message2.url || "";
        console.log(`\u{1F504} [Background] \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabId2}, URL: ${url}`);
        yield chrome.tabs.reload(tabId2);
        sendResponse2({ success: true, url });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("CLOSE_TAB", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const { tabId: tabId2 } = message2;
        const targetTabId2 = tabId2 || (yield chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (!targetTabId2) {
          sendResponse2({ success: false, error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C tabId \u0434\u043B\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F" });
          return;
        }
        console.log(`\u{1F5D1}\uFE0F [Background] \u0417\u0430\u043A\u0440\u044B\u0442\u0438\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${targetTabId2}`);
        yield chrome.tabs.remove(targetTabId2);
        sendResponse2({ success: true });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("NEW_TAB_WITH_TEST", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const { url, testState } = message2;
        if (!url) {
          sendResponse2({ success: false, error: "URL \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D" });
          return;
        }
        console.log(`\u{1F517} [Background] \u041E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u043D\u043E\u0432\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438: ${url}`);
        const newTab = yield chrome.tabs.create({ url, active: true });
        if (testState) {
          yield new Promise((resolve) => {
            const listener = (tabId2, info) => {
              if (tabId2 === newTab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(resolve, 1e4);
          });
          try {
            yield chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              files: TestManager.CONTENT_SCRIPT_FILES || ["content/content.js", "content/player-core.js"]
            });
            yield chrome.tabs.sendMessage(newTab.id, {
              type: "RESUME_TEST",
              testState
            });
            console.log(`\u2705 [Background] \u0422\u0435\u0441\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 ${newTab.id}`);
          } catch (injectError) {
            console.warn(`\u26A0\uFE0F [Background] \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0442\u0435\u0441\u0442 \u0432 \u043D\u043E\u0432\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443: ${injectError.message}`);
          }
        }
        sendResponse2({ success: true, tabId: newTab.id });
      } catch (error) {
        console.error("\u274C [Background] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0438 \u043D\u043E\u0432\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("NETWORK_START_MONITORING", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        if (typeof isNetworkMonitoring !== "undefined") {
          isNetworkMonitoring = true;
          console.log("[Network] \u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u0437\u0430\u043F\u0443\u0449\u0435\u043D");
          sendResponse2({ success: true });
        } else {
          throw new Error("Network monitoring \u043D\u0435 \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D \u0432 background.js");
        }
      } catch (error) {
        console.error("\u274C [Network] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u043C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433\u0430:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("NETWORK_STOP_MONITORING", (_0) => __async(null, [_0], function* ({ sendResponse: sendResponse2 }) {
      try {
        if (typeof isNetworkMonitoring !== "undefined") {
          isNetworkMonitoring = false;
          console.log("[Network] \u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D");
          sendResponse2({ success: true });
        } else {
          throw new Error("Network monitoring \u043D\u0435 \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D");
        }
      } catch (error) {
        console.error("\u274C [Network] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435 \u043C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433\u0430:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
    registry.register("NETWORK_GET_REQUESTS", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const tabId2 = message2.tabId;
        if (!tabId2) {
          throw new Error("tabId \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D");
        }
        if (typeof networkRequests !== "undefined") {
          const requests = networkRequests.get(tabId2) || [];
          sendResponse2({ success: true, requests });
        } else {
          throw new Error("networkRequests \u043D\u0435 \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D");
        }
      } catch (error) {
        console.error("\u274C [Network] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432:", error);
        sendResponse2({ success: false, error: error.message, requests: [] });
      }
    }));
    registry.register("NETWORK_CLEAR_HISTORY", (_0) => __async(null, [_0], function* ({ message: message2, sendResponse: sendResponse2 }) {
      try {
        const tabId2 = message2.tabId;
        if (!tabId2) {
          throw new Error("tabId \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D");
        }
        if (typeof networkRequests !== "undefined") {
          networkRequests.delete(tabId2);
          console.log(`[Network] \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u0434\u043B\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0438 ${tabId2} \u043E\u0447\u0438\u0449\u0435\u043D\u0430`);
          sendResponse2({ success: true });
        } else {
          throw new Error("networkRequests \u043D\u0435 \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D");
        }
      } catch (error) {
        console.error("\u274C [Network] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438:", error);
        sendResponse2({ success: false, error: error.message });
      }
    }));
  }
  self.registerBackgroundMessageHandlers = registerBackgroundMessageHandlers;
})();
