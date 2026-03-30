/**
 * Analysis Settings - настройки анализа заполнения полей
 * Вынесено в отдельный файл из-за CSP (inline scripts блокируются в Chrome extensions)
 */
(function() {
  'use strict';

  const storage = {
    async get(key) {
      try {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? null;
      } catch (error) {
        console.error('Storage get error:', error);
        return null;
      }
    },
    async set(key, value) {
      try {
        await chrome.storage.local.set({ [key]: value });
        return true;
      } catch (error) {
        console.error('Storage set error:', error);
        return false;
      }
    }
  };

  async function loadSettings() {
    const s = (await storage.get('autotest_analysis_settings_fill')) || {};
    document.getElementById('fillMode').value = s.fillMode || 'smart';
    document.getElementById('fillProfile').value = s.profile || 'valid-user';
    document.getElementById('fillTarget').value = s.fillTarget || 'all';
    document.getElementById('contextAware').checked = s.contextAware !== false;
    document.getElementById('overwriteFilled').checked = s.overwriteFilled || false;
    await loadRules();
  }

  async function saveSettings() {
    await storage.set('autotest_analysis_settings_fill', {
      fillMode: document.getElementById('fillMode').value,
      profile: document.getElementById('fillProfile').value,
      fillTarget: document.getElementById('fillTarget').value,
      contextAware: document.getElementById('contextAware').checked,
      overwriteFilled: document.getElementById('overwriteFilled').checked
    });
    alert('✅ Настройки сохранены');
  }

  async function resetSettings() {
    if (!confirm('Сбросить?')) return;
    await chrome.storage.local.remove('autotest_analysis_settings_fill');
    await loadSettings();
    alert('✅ Сброшено');
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function loadRules() {
    const rules = (await storage.get('globalFieldRules')) || {};
    const c = document.getElementById('rulesList');
    if (!c) return;
    c.innerHTML = '';
    const e = Object.entries(rules).filter(([k]) => !k.startsWith('_'));
    if (e.length === 0) {
      c.innerHTML = '<p style="color:#94a3b8;text-align:center;">Нет правил. Нажмите "Добавить Правило"</p>';
      return;
    }
    e.forEach(([sel, val]) => {
      const d = document.createElement('div');
      d.className = 'rule-item';
      d.innerHTML = `<input type="text" value="${escHtml(sel)}" placeholder="Селектор"><input type="text" value="${escHtml(val)}" placeholder="Значение"><button class="btn btn-secondary btn-small remove-rule-btn" data-selector="${escHtml(sel)}">🗑️</button>`;
      c.appendChild(d);
    });
    c.querySelectorAll('.remove-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        removeRule(btn.getAttribute('data-selector'));
      });
    });
  }

  async function addRule() {
    const selectorInput = document.getElementById('newRuleSelector');
    const valueInput = document.getElementById('newRuleValue');
    if (!selectorInput || !valueInput) {
      alert('⚠️ Ошибка: поля ввода не найдены');
      return;
    }
    const selector = selectorInput.value.trim();
    const value = valueInput.value.trim();
    if (!selector || !value) {
      alert('⚠️ Заполните селектор и значение');
      return;
    }
    const r = (await storage.get('globalFieldRules')) || {};
    r[selector] = value;
    await storage.set('globalFieldRules', r);
    selectorInput.value = '';
    valueInput.value = '';
    await loadRules();
    alert('✅ Правило добавлено');
  }

  async function removeRule(s) {
    if (!confirm(`Удалить "${s}"?`)) return;
    const r = (await storage.get('globalFieldRules')) || {};
    delete r[s];
    await storage.set('globalFieldRules', r);
    await loadRules();
  }

  async function saveRules() {
    const items = document.querySelectorAll('.rule-item');
    const r = {};
    items.forEach(item => {
      const inputs = item.querySelectorAll('input[type="text"]');
      const sel = inputs[0]?.value?.trim();
      const val = inputs[1]?.value?.trim();
      if (sel && val) r[sel] = val;
    });
    await storage.set('globalFieldRules', r);
  }

  async function exportRules() {
    await saveRules();
    const data = { rules: (await storage.get('globalFieldRules')) || {}, exported: new Date().toISOString(), version: '0.9.5.1' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rules-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    alert('✅ Экспортировано');
  }

  function importRules() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.rules) {
          await storage.set('globalFieldRules', data.rules);
          await loadRules();
          alert('✅ Импортировано');
        } else {
          alert('❌ Неверный формат');
        }
      } catch (err) {
        alert('❌ Ошибка: ' + err.message);
      }
      input.value = '';
    };
    input.click();
  }

  function init() {
    const resetBtn = document.getElementById('resetSettingsBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetSettings);

    const exportBtn = document.getElementById('exportRulesBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportRules);

    const importBtn = document.getElementById('importRulesBtn');
    if (importBtn) importBtn.addEventListener('click', importRules);

    const addBtn = document.getElementById('addRuleBtn');
    if (addBtn) addBtn.addEventListener('click', () => addRule());

    const saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);

    const closeBtn = document.getElementById('closeWindowBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => window.close());

    document.addEventListener('input', (e) => {
      if (e.target.closest('.rule-item')) saveRules();
    });

    const useSelectorCheckbox = document.getElementById('useSelectorFromCollected');
    const collectedPageGroup = document.getElementById('collectedPageGroup');
    const collectedSelectorGroup = document.getElementById('collectedSelectorGroup');
    const pageSelect = document.getElementById('collectedPageSelect');
    const selectorSelect = document.getElementById('collectedSelectorSelect');
    const selectorInput = document.getElementById('newRuleSelector');

    if (useSelectorCheckbox) {
      const loadPagesIntoSelect = async () => {
        try {
          const stored = await chrome.storage.local.get(['collectedSelectors']);
          const collectedSelectors = stored.collectedSelectors || {};
          const urls = Object.keys(collectedSelectors);
          if (pageSelect) {
            if (urls.length === 0) {
              pageSelect.innerHTML = '<option value="" disabled>Нет собранных селекторов. Запустите шаг «Анализ → Получить селекторы»</option>';
            } else {
              pageSelect.innerHTML = '<option value="">-- Выберите страницу --</option>' +
                urls.map(url => `<option value="${escHtml(url)}">${escHtml(url.length > 60 ? url.substring(0, 57) + '...' : url)}</option>`).join('');
            }
          }
        } catch (error) {
          console.error('Error loading collected selectors:', error);
          if (pageSelect) pageSelect.innerHTML = '<option value="" disabled>Ошибка загрузки</option>';
        }
      };
      useSelectorCheckbox.addEventListener('change', async () => {
        const isChecked = useSelectorCheckbox.checked;
        if (collectedPageGroup) collectedPageGroup.style.display = isChecked ? 'block' : 'none';
        if (!isChecked) {
          if (collectedSelectorGroup) collectedSelectorGroup.style.display = 'none';
          return;
        }
        await loadPagesIntoSelect();
      });
      if (useSelectorCheckbox.checked) {
        if (collectedPageGroup) collectedPageGroup.style.display = 'block';
        loadPagesIntoSelect();
      }
    }

    if (pageSelect) {
      pageSelect.addEventListener('change', async () => {
        const selectedUrl = pageSelect.value;
        if (!selectedUrl) {
          if (collectedSelectorGroup) collectedSelectorGroup.style.display = 'none';
          return;
        }
        try {
          const stored = await chrome.storage.local.get(['collectedSelectors']);
          const collectedSelectors = stored.collectedSelectors || {};
          const selectors = collectedSelectors[selectedUrl] || [];
          if (selectors.length === 0) {
            alert('⚠️ Нет селекторов для этой страницы');
            return;
          }
          if (selectorSelect) {
            selectorSelect.innerHTML = '<option value="">-- Выберите селектор --</option>' +
              selectors.map(item => {
                const selector = typeof item === 'string' ? item : (item.selector || item);
                const label = typeof item === 'object' ? (item.label || '') : '';
                const type = typeof item === 'object' ? (item.type || '') : '';
                const displayText = `${selector}${label ? ` (${label})` : ''}${type ? ` [${type}]` : ''}`;
                return `<option value="${escHtml(selector)}">${escHtml(displayText)}</option>`;
              }).join('');
          }
          if (collectedSelectorGroup) collectedSelectorGroup.style.display = 'block';
        } catch (error) {
          console.error('Error loading selectors for page:', error);
          alert('❌ Ошибка загрузки селекторов: ' + error.message);
        }
      });
    }

    if (selectorSelect && selectorInput) {
      selectorSelect.addEventListener('change', () => {
        const sel = selectorSelect.value;
        if (sel) selectorInput.value = sel;
      });
    }

    loadSettings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
