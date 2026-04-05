/**
 * First-run privacy consent + onboarding wizard + quick templates.
 *
 * Flow on first launch:
 *   1. Privacy consent overlay — shown as early as possible when the script
 *      loads; blocks the popup UI until the user clicks "I agree".
 *   2. Welcome / onboarding wizard — 4-step guide with a starter template.
 */
(function() {
  'use strict';

  var PRIVACY_CONSENT_KEY = 'privacyConsentV1';
  var ONBOARDING_KEY = 'onboardingWizardV1CompletedAt';

  function t(key, params) {
    return window.i18n ? window.i18n.t(key, params) : key;
  }

  // ---------------------------------------------------------------------------
  // Privacy consent — shown immediately on first run
  // ---------------------------------------------------------------------------

  /** Module-level promise that resolves when privacy consent is given (or was already given). */
  var _privacyConsentReady = null;
  /** Stored reference to the lang-change listener so we can unsubscribe on accept. */
  var _privacyLangListener = null;

  function buildPrivacyOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'privacyConsentOverlay';
    overlay.className = 'privacy-consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'privacyConsentHeading');
    overlay.innerHTML =
      '<div class="privacy-consent-card">' +
        '<div class="privacy-consent-icon">🛡️</div>' +
        '<h2 class="privacy-consent-title" id="privacyConsentHeading"></h2>' +
        '<p class="privacy-consent-subtitle"></p>' +
        '<p class="privacy-consent-section-label"></p>' +
        '<ul class="privacy-consent-list">' +
          '<li></li><li></li><li></li><li></li>' +
        '</ul>' +
        '<p class="privacy-consent-no-upload"></p>' +
        '<a class="privacy-consent-link" href="#" target="_blank" rel="noopener"></a>' +
        '<button type="button" class="btn btn-primary privacy-consent-agree" id="privacyConsentAgreeBtn"></button>' +
      '</div>';
    return overlay;
  }

  function applyPrivacyTexts(overlay) {
    var card = overlay.querySelector('.privacy-consent-card');
    if (!card) return;

    var policyUrl = t('popup.privacyConsentFullPolicyUrl') ||
      'https://github.com/yurgus25/autotest_recorder/blob/main/PRIVACY_EN.md';

    card.querySelector('.privacy-consent-title').textContent   = t('popup.privacyConsentTitle');
    card.querySelector('.privacy-consent-subtitle').textContent = t('popup.privacyConsentSubtitle');
    card.querySelector('.privacy-consent-section-label').textContent = t('popup.privacyConsentCollects');

    var items = card.querySelectorAll('.privacy-consent-list li');
    var itemKeys = [
      'popup.privacyConsentItem1',
      'popup.privacyConsentItem2',
      'popup.privacyConsentItem3',
      'popup.privacyConsentItem4'
    ];
    for (var i = 0; i < items.length; i++) {
      items[i].textContent = t(itemKeys[i]);
    }

    card.querySelector('.privacy-consent-no-upload').textContent = t('popup.privacyConsentNoUpload');

    var link = card.querySelector('.privacy-consent-link');
    link.textContent = t('popup.privacyConsentReadFull');
    link.href = policyUrl;

    var btn = card.querySelector('#privacyConsentAgreeBtn');
    if (btn) btn.textContent = t('popup.privacyConsentAgree');
  }

  /**
   * Shows the privacy consent overlay once both:
   *   (a) chrome.storage confirms consent was not yet given, and
   *   (b) i18n translations are loaded (so overlay text is correct).
   * Returns a Promise that resolves when consent has been recorded.
   * Subsequent calls return the same Promise (idempotent).
   */
  function ensurePrivacyConsentReady() {
    if (_privacyConsentReady) return _privacyConsentReady;

    // Wait for storage check AND i18n init in parallel — avoids showing
    // the overlay with raw key strings before translations are loaded.
    var i18nInit = (window.i18n && typeof window.i18n.init === 'function')
      ? window.i18n.init()
      : Promise.resolve();

    _privacyConsentReady = Promise.all([
      chrome.storage.local.get(PRIVACY_CONSENT_KEY),
      i18nInit
    ]).then(function(results) {
      var st = results[0];
      if (st[PRIVACY_CONSENT_KEY]) return; // already accepted — nothing to show

      return new Promise(function(resolve) {
        function showOverlay() {
          // Don't show twice
          if (document.getElementById('privacyConsentOverlay')) return;

          var overlay = buildPrivacyOverlay();
          document.body.appendChild(overlay);
          applyPrivacyTexts(overlay);

          // Re-apply texts if the user switches language while the overlay is open.
          // i18n.onLangChange() doesn't return a subscription — unsubscribe via offLangChange().
          if (window.i18n && typeof window.i18n.onLangChange === 'function') {
            _privacyLangListener = function() { applyPrivacyTexts(overlay); };
            window.i18n.onLangChange(_privacyLangListener);
          }

          overlay.querySelector('#privacyConsentAgreeBtn').addEventListener('click', function() {
            chrome.storage.local.set({ [PRIVACY_CONSENT_KEY]: new Date().toISOString() }).catch(function() {});
            if (_privacyLangListener && window.i18n && typeof window.i18n.offLangChange === 'function') {
              window.i18n.offLangChange(_privacyLangListener);
              _privacyLangListener = null;
            }
            overlay.remove();
            resolve();
          });
        }

        if (document.body) {
          showOverlay();
        } else {
          document.addEventListener('DOMContentLoaded', showOverlay);
        }
      });
    }).catch(function(e) {
      console.warn('[Privacy consent]', e);
    });

    return _privacyConsentReady;
  }

  // Start both the storage check and i18n init immediately when the script
  // loads — the overlay appears as soon as both resolve (a few ms after DOMContentLoaded).
  ensurePrivacyConsentReady();

  // ---------------------------------------------------------------------------
  // Onboarding wizard templates
  // ---------------------------------------------------------------------------

  function tmplBlank() {
    return { name: t('popup.onboardingTemplateBlank'), actions: [] };
  }

  function tmplSmoke() {
    return {
      name: t('popup.onboardingTemplateSmoke'),
      actions: [
        { type: 'wait', delay: 1000, value: 1000, timestamp: Date.now() },
        { type: 'screenshot', subtype: 'page-screenshot', screenshotCaptureType: 'full', timestamp: Date.now() + 1 }
      ]
    };
  }

  function isRestrictedBrowserUrl(url) {
    if (!url || typeof url !== 'string') return true;
    var u = url.trim().toLowerCase();
    if (u.startsWith('chrome://') || u.startsWith('chrome-extension://') || u.startsWith('edge://') ||
        u.startsWith('about:') || u.startsWith('devtools://') || u.startsWith('view-source:') ||
        u.startsWith('moz-extension://') || u.startsWith('opera://')) return true;
    if (u.indexOf('chrome.google.com/webstore') !== -1) return true;
    return false;
  }

  async function activeTabUrlRestricted() {
    try {
      var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      var url = tabs && tabs[0] && tabs[0].url;
      return isRestrictedBrowserUrl(url);
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Onboarding wizard UI
  // ---------------------------------------------------------------------------

  function buildOnboardingOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.className = 'onboarding-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="onboarding-card">' +
        '<div class="onboarding-progress" id="onboardingProgress"></div>' +
        '<h2 class="onboarding-title" id="onboardingTitle"></h2>' +
        '<p class="onboarding-body" id="onboardingBody"></p>' +
        '<div class="onboarding-template-row">' +
          '<label for="onboardingTemplateSelect" class="onboarding-label" id="onboardingTemplateLabel"></label>' +
          '<select id="onboardingTemplateSelect" class="onboarding-select">' +
            '<option value="blank"></option>' +
            '<option value="smoke"></option>' +
          '</select>' +
        '</div>' +
        '<div class="onboarding-actions">' +
          '<button type="button" class="btn btn-gray" id="onboardingSkip"></button>' +
          '<button type="button" class="btn btn-secondary" id="onboardingOpenEditor"></button>' +
          '<button type="button" class="btn btn-primary" id="onboardingNext"></button>' +
        '</div>' +
      '</div>';
    return overlay;
  }

  var steps = [
    { titleKey: 'popup.onboardingWelcomeTitle',    bodyKey: 'popup.onboardingWelcomeBody' },
    { titleKey: 'popup.onboardingStepRecordTitle', bodyKey: 'popup.onboardingStepRecordBody' },
    { titleKey: 'popup.onboardingStepEditTitle',   bodyKey: 'popup.onboardingStepEditBody' },
    { titleKey: 'popup.onboardingStepRunTitle',    bodyKey: 'popup.onboardingStepRunBody' }
  ];

  function applyOnboardingTexts(overlay, stepIndex) {
    var step = steps[stepIndex];
    var last = stepIndex >= steps.length - 1;

    overlay.querySelector('#onboardingTitle').textContent = t(step.titleKey);
    overlay.querySelector('#onboardingBody').textContent  = t(step.bodyKey);
    overlay.querySelector('#onboardingProgress').textContent = (stepIndex + 1) + ' / ' + steps.length;
    overlay.querySelector('#onboardingSkip').textContent  = t('popup.onboardingSkip');
    overlay.querySelector('#onboardingNext').textContent  = last ? t('popup.onboardingDone') : t('popup.onboardingNext');

    var edBtn = overlay.querySelector('#onboardingOpenEditor');
    edBtn.textContent    = t('popup.onboardingOpenEditor');
    edBtn.style.display  = last ? 'inline-block' : 'none';

    overlay.querySelector('#onboardingTemplateLabel').textContent = t('popup.onboardingTemplateLabel');
    var sel = overlay.querySelector('#onboardingTemplateSelect');
    sel.options[0].text = t('popup.onboardingTemplateBlank');
    sel.options[1].text = t('popup.onboardingTemplateSmoke');
  }

  async function saveTemplateAsTest(templateFn) {
    var raw = templateFn();
    var id  = 'test_' + Date.now();
    var now = new Date().toISOString();
    var test = {
      id, name: raw.name || 'Template',
      actions:   Array.isArray(raw.actions) ? raw.actions : [],
      variables: raw.variables && typeof raw.variables === 'object' ? raw.variables : {},
      createdAt: now, updatedAt: now, lastEditedBy: 'template',
      url: typeof raw.url === 'string' ? raw.url : ''
    };
    var lastErr;
    for (var attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(function(r) { setTimeout(r, 250 * attempt); });
      var response;
      try { response = await chrome.runtime.sendMessage({ type: 'UPDATE_TEST', test }); }
      catch (e) { lastErr = e; continue; }
      if (response && response.success) return id;
      if (response && response.error === 'FREE_TIER_LIMIT') {
        var limErr = new Error('FREE_TIER_LIMIT');
        limErr.limit = response.limit;
        throw limErr;
      }
      lastErr = new Error((response && response.error) || 'UPDATE_TEST failed');
    }
    throw lastErr || new Error('UPDATE_TEST failed');
  }

  async function showOnboardingWizard() {
    var st = await chrome.storage.local.get(ONBOARDING_KEY);
    if (st[ONBOARDING_KEY]) return;

    if (document.getElementById('onboardingOverlay')) return;

    var overlay = buildOnboardingOverlay();
    document.body.appendChild(overlay);
    var stepIndex = 0;
    applyOnboardingTexts(overlay, stepIndex);

    function finish() {
      chrome.storage.local.set({ [ONBOARDING_KEY]: new Date().toISOString() }).catch(function() {});
      overlay.remove();
    }

    overlay.querySelector('#onboardingSkip').addEventListener('click', finish);

    overlay.querySelector('#onboardingNext').addEventListener('click', async function() {
      if (stepIndex >= steps.length - 1) {
        var v = overlay.querySelector('#onboardingTemplateSelect').value;
        try {
          await saveTemplateAsTest(v === 'smoke' ? tmplSmoke : tmplBlank);
          if (window.popupControllerInstance && typeof window.popupControllerInstance.loadTests === 'function') {
            await window.popupControllerInstance.loadTests();
          }
          var msg = t('popup.onboardingTemplateSaved');
          try {
            if (await activeTabUrlRestricted()) msg += '\n\n' + t('popup.onboardingRestrictedTabHint');
          } catch (_) {}
          alert(msg);
        } catch (e) {
          console.error('[Onboarding] template save', e);
          alert(e && e.message === 'FREE_TIER_LIMIT'
            ? t('popup.onboardingTemplateLimitReached', { limit: String(e.limit != null ? e.limit : '?') })
            : t('popup.onboardingTemplateSaveFailed'));
        }
        finish();
        return;
      }
      stepIndex++;
      applyOnboardingTexts(overlay, stepIndex);
    });

    overlay.querySelector('#onboardingOpenEditor').addEventListener('click', async function() {
      var edBtn = overlay.querySelector('#onboardingOpenEditor');
      var v = overlay.querySelector('#onboardingTemplateSelect').value;
      edBtn.disabled = true;
      try {
        var id = await saveTemplateAsTest(v === 'smoke' ? tmplSmoke : tmplBlank);
        if (window.popupControllerInstance && typeof window.popupControllerInstance.loadTests === 'function') {
          await window.popupControllerInstance.loadTests();
        }
        chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') + '?testId=' + encodeURIComponent(id), active: true });
        finish();
      } catch (e) {
        console.error('[Onboarding] open editor', e);
        alert(e && e.message === 'FREE_TIER_LIMIT'
          ? t('popup.onboardingTemplateLimitReached', { limit: String(e.limit != null ? e.limit : '?') })
          : t('popup.onboardingTemplateSaveFailed'));
      } finally {
        edBtn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API  (called by popup.js after ~400 ms initialisation delay)
  // ---------------------------------------------------------------------------

  window.AutoTestOnboarding = {
    maybeShow: async function() {
      try {
        // Wait for the already-started privacy consent promise (idempotent).
        await ensurePrivacyConsentReady();
        // Then show the onboarding wizard (skippable, shown once).
        await showOnboardingWizard();
      } catch (e) {
        console.warn('[Onboarding]', e);
      }
    }
  };
})();
