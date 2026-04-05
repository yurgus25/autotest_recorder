/**
 * Data-driven test runs: CSV / table rows merged into scenario variables ({var:name}).
 * @module editor-data-driven
 */
(function() {
  'use strict';

  var TestEditor = window._TestEditorClass;
  if (!TestEditor) {
    console.error('[editor-data-driven.js] TestEditor not found.');
    return;
  }

  /** Max rows per run (roadmap: higher limits for Premium). */
  TestEditor.DATA_DRIVEN_MAX_ROWS = 50;

  function escapeCsvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * UTF-8 CSV с BOM для Excel; колонки данных из строк сценария + результат прогона.
   */
  TestEditor.buildDataDrivenReportCsv = function(summary) {
    if (!summary || !Array.isArray(summary.results)) {
      return '\uFEFF';
    }
    var rowKeys = {};
    summary.results.forEach(function(r) {
      if (r.row && typeof r.row === 'object') {
        Object.keys(r.row).forEach(function(k) {
          rowKeys[k] = true;
        });
      }
    });
    var rk = Object.keys(rowKeys).sort();
    var headers = ['test_id', 'test_name', 'row_index', 'result', 'error', 'duration_ms', 'steps_completed', 'steps_total'].concat(rk);
    var lines = [headers.map(escapeCsvCell).join(',')];
    summary.results.forEach(function(r) {
      var row = r.row || {};
      var cells = [
        summary.testId,
        summary.testName || '',
        r.rowIndex,
        r.success ? 'PASS' : 'FAIL',
        r.error || '',
        r.durationMs != null ? r.durationMs : '',
        r.stepsCompleted != null ? r.stepsCompleted : '',
        r.stepsTotal != null ? r.stepsTotal : ''
      ].concat(rk.map(function(k) {
        return row[k] != null ? row[k] : '';
      }));
      lines.push(cells.map(escapeCsvCell).join(','));
    });
    return '\uFEFF' + lines.join('\n');
  };

  /**
   * Parse CSV text; first row = headers. Returns { headers, rows } where rows are plain objects.
   */
  TestEditor.parseDataDrivenCsv = function(text) {
    if (!text || typeof text !== 'string') {
      return { headers: [], rows: [] };
    }
    var lines = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (cur.trim() !== '') lines.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    if (cur.trim() !== '') lines.push(cur);

    function splitLine(line) {
      var cells = [];
      var cell = '';
      var q = false;
      for (var j = 0; j < line.length; j++) {
        var ch = line[j];
        if (ch === '"') {
          if (q && line[j + 1] === '"') {
            cell += '"';
            j++;
          } else {
            q = !q;
          }
        } else if (ch === ',' && !q) {
          cells.push(cell.trim());
          cell = '';
        } else {
          cell += ch;
        }
      }
      cells.push(cell.trim());
      return cells;
    }

    if (lines.length === 0) return { headers: [], rows: [] };
    var headers = splitLine(lines[0]).map(function(h) {
      return String(h || '').replace(/^\uFEFF/, '').trim();
    }).filter(Boolean);
    if (headers.length === 0) return { headers: [], rows: [] };

    var rows = [];
    for (var r = 1; r < lines.length; r++) {
      var vals = splitLine(lines[r]);
      if (vals.every(function(v) { return v === ''; })) continue;
      var obj = {};
      for (var k = 0; k < headers.length; k++) {
        obj[headers[k]] = vals[k] !== undefined ? vals[k] : '';
      }
      rows.push(obj);
    }
    return { headers: headers, rows: rows };
  };

  TestEditor.prototype.initDataDrivenModal = function() {
    var self = this;
    var btn = document.getElementById('dataDrivenRun');
    var modal = document.getElementById('dataDrivenModal');
    if (!btn || !modal) return;

    var ta = document.getElementById('dataDrivenCsvInput');
    var preview = document.getElementById('dataDrivenPreview');
    var rowCountEl = document.getElementById('dataDrivenRowCount');
    var closeBtn = document.getElementById('closeDataDrivenModal');
    var parseBtn = document.getElementById('dataDrivenParseBtn');
    var runOpt = document.getElementById('dataDrivenRunOptimizedBtn');
    var runFull = document.getElementById('dataDrivenRunFullBtn');

    function close() {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    function open() {
      modal.style.display = 'flex';
      modal.classList.add('active');
      if (typeof self.updateDataDrivenExportUi === 'function') {
        self.updateDataDrivenExportUi();
      }
      if (ta) ta.focus();
    }

    btn.addEventListener('click', function() {
      if (!self.test) {
        alert(self.t('editorUI.testNotLoaded'));
        return;
      }
      open();
    });

    var exportHeader = document.getElementById('dataDrivenExportReportBtn');
    var exportModal = document.getElementById('dataDrivenExportReportModalBtn');
    function bindExport(el) {
      if (!el) return;
      el.addEventListener('click', function() {
        if (typeof self.exportLastDataDrivenReportCsv === 'function') {
          self.exportLastDataDrivenReportCsv();
        }
      });
    }
    bindExport(exportHeader);
    bindExport(exportModal);
    if (typeof self.updateDataDrivenExportUi === 'function') {
      self.updateDataDrivenExportUi();
    }
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) close();
    });

    function renderPreview(parsed) {
      if (!preview || !rowCountEl) return;
      var max = TestEditor.DATA_DRIVEN_MAX_ROWS;
      var shown = parsed.rows.slice(0, Math.min(5, parsed.rows.length));
      rowCountEl.textContent = self.t('editorUI.dataDrivenRowCount', {
        count: parsed.rows.length,
        max: max
      });
      if (parsed.headers.length === 0) {
        preview.innerHTML = '<p class="hint">' + self.t('editorUI.dataDrivenNoData') + '</p>';
        return;
      }
      var html = '<table class="data-driven-preview-table"><thead><tr>';
      parsed.headers.forEach(function(h) {
        html += '<th>' + String(h).replace(/</g, '&lt;') + '</th>';
      });
      html += '</tr></thead><tbody>';
      shown.forEach(function(row) {
        html += '<tr>';
        parsed.headers.forEach(function(h) {
          var v = row[h] != null ? String(row[h]) : '';
          html += '<td>' + v.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      if (parsed.rows.length > shown.length) {
        html += '<p class="hint">…</p>';
      }
      preview.innerHTML = html;
    }

    var lastParsed = { headers: [], rows: [] };

    function parseAndPreview() {
      var parsed = TestEditor.parseDataDrivenCsv(ta ? ta.value : '');
      lastParsed = parsed;
      renderPreview(parsed);
      return parsed;
    }

    if (parseBtn) parseBtn.addEventListener('click', parseAndPreview);

    function runWithMode(mode) {
      var parsed = lastParsed.rows.length ? lastParsed : parseAndPreview();
      if (!parsed.headers.length || !parsed.rows.length) {
        alert(self.t('editorUI.dataDrivenNoData'));
        return;
      }
      if (parsed.rows.length > TestEditor.DATA_DRIVEN_MAX_ROWS) {
        alert(self.t('editorUI.dataDrivenTooManyRows', { max: TestEditor.DATA_DRIVEN_MAX_ROWS }));
        return;
      }
      close();
      self.playTestDataDriven(mode, parsed.rows);
    }

    if (runOpt) runOpt.addEventListener('click', function() {
      var m = self.hasOptimizationAvailable && self.hasOptimizationAvailable() ? 'optimized' : 'full';
      runWithMode(m);
    });
    if (runFull) runFull.addEventListener('click', function() { runWithMode('full'); });
  };

  /**
   * Run the same scenario for each row; variables match CSV column names → use {var:col} in steps.
   */
  TestEditor.prototype.playTestDataDriven = async function(mode, rows) {
    if (!this.test || !rows || !rows.length) return;

    var missingVars = this.checkRequiredVariables(mode === 'debug' ? 'optimized' : mode);
    if (missingVars.length > 0) {
      var ok = await this.showMissingVariablesDialog(missingVars);
      if (!ok) return;
    }

    var debugMode = mode === 'debug';
    var actualMode = debugMode ? 'optimized' : mode;

    var response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'PLAY_TEST',
        testId: this.test.id,
        test: this.test,
        mode: actualMode,
        debugMode: debugMode,
        dataDrivenStart: true,
        dataDrivenRows: rows
      });
    } catch (sendError) {
      console.error('[Editor] PLAY_TEST data-driven:', sendError);
      alert(this.t('editorUI.requestError', { error: sendError.message || String(sendError) }));
      return;
    }

    if (response && response.success) {
      alert(this.t('editorUI.dataDrivenStarted', { count: rows.length }));
    } else if (response && response.error === 'NO_STEPS_TO_PLAY') {
      this.showToast(this.t('popup.noStepsToPlay'), 'warning');
    } else {
      var hint = typeof window !== 'undefined' && window.i18n && typeof window.i18n.playbackUserMessage === 'function'
        ? window.i18n.playbackUserMessage(response && response.error)
        : (this.t('editorUI.playbackError') + ': ' + ((response && response.error) || this.t('common.unknownError')));
      alert(hint);
    }
  };

  TestEditor.prototype.updateDataDrivenExportUi = function() {
    var self = this;
    var rep = this.lastDataDrivenReport;
    var has = rep && Array.isArray(rep.results) && rep.results.length > 0;
    var match = has && this.test && String(rep.testId) === String(this.test.id);
    var tipOk = self.t('editorUI.dataDrivenExportReportTitle');
    var tipNo = self.t('editorUI.dataDrivenExportReportDisabled');
    ['dataDrivenExportReportBtn', 'dataDrivenExportReportModalBtn'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = !match;
      el.title = match ? tipOk : tipNo;
    });
  };

  TestEditor.prototype.exportLastDataDrivenReportCsv = async function() {
    var rep = this.lastDataDrivenReport;
    if (!rep || !Array.isArray(rep.results) || !rep.results.length) {
      alert(this.t('editorUI.dataDrivenExportNoReport'));
      return;
    }
    if (!this.test || String(rep.testId) !== String(this.test.id)) {
      alert(this.t('editorUI.dataDrivenExportNoReport'));
      return;
    }
    var csv = TestEditor.buildDataDrivenReportCsv(rep);
    var base64;
    try {
      base64 = btoa(unescape(encodeURIComponent(csv)));
    } catch (e) {
      console.error('[Editor] data-driven CSV encode', e);
      alert(this.t('editorUI.dataDrivenExportError'));
      return;
    }
    var safe = String(this.test.name || 'test').replace(/[^a-zа-яё0-9]/gi, '_').substring(0, 40);
    var dateStr = new Date().toISOString().split('T')[0];
    var fileName = 'data-driven-report_' + safe + '_' + dateStr + '.csv';
    try {
      var response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_FILE',
        fileName: fileName,
        data: base64,
        mimeType: 'text/csv;charset=utf-8',
        saveAs: true
      });
      if (response && response.success) {
        this.showToast(this.t('editorUI.dataDrivenExportDone', { file: fileName }), 'success');
      } else {
        alert(this.t('editorUI.dataDrivenExportError') + (response && response.error ? ': ' + response.error : ''));
      }
    } catch (err) {
      console.error('[Editor] DOWNLOAD_FILE', err);
      alert(this.t('editorUI.dataDrivenExportError'));
    }
  };
})();
