// Модуль экспорта тест-кейсов в Excel
// Использует CSV формат с разделителями табуляции для совместимости с Excel
// Копия для использования в popup (обход CSP)

class ExcelExporter {
  constructor() {
    this.settings = null;
  }

  /**
   * Инициализация с настройками
   */
  async init() {
    try {
      const result = await chrome.storage.local.get(['pluginSettings']);
      if (result.pluginSettings) {
        this.settings = result.pluginSettings;
        console.log('✅ [ExcelExport] Настройки загружены из pluginSettings:', {
          enabled: this.settings?.excelExport?.enabled,
          exportOnRecord: this.settings?.excelExport?.exportOnRecord,
          exportOnPlay: this.settings?.excelExport?.exportOnPlay,
          exportOnOptimize: this.settings?.excelExport?.exportOnOptimize
        });
      } else {
        // Fallback: проверяем старый ключ 'settings' для обратной совместимости
        const oldResult = await chrome.storage.local.get(['settings']);
        if (oldResult.settings) {
          this.settings = oldResult.settings;
          console.log('✅ [ExcelExport] Настройки загружены из settings (старый формат):', {
            enabled: this.settings?.excelExport?.enabled
          });
        } else {
          console.warn('⚠️ [ExcelExport] Настройки не найдены в storage');
        }
      }
    } catch (error) {
      console.warn('⚠️ [ExcelExport] Не удалось загрузить настройки:', error);
    }
  }

  /**
   * Проверяет, включен ли экспорт в Excel
   */
  isExportEnabled() {
    const enabled = this.settings?.excelExport?.enabled === true;
    console.log('🔍 [ExcelExport] Проверка isExportEnabled:', {
      enabled,
      settings: this.settings?.excelExport
    });
    return enabled;
  }

  /**
   * Проверяет, включен ли автоэкспорт
   */
  isAutoExportEnabled() {
    const autoEnabled = this.settings?.excelExport?.autoExportEnabled === true;
    console.log('🔍 [ExcelExport] Проверка isAutoExportEnabled:', {
      autoEnabled
    });
    return autoEnabled;
  }

  /**
   * Проверяет, нужно ли экспортировать при записи
   */
  shouldExportOnRecord() {
    const result = this.isExportEnabled() &&
                  this.isAutoExportEnabled() &&
                  (this.settings?.excelExport?.exportOnRecord !== false);
    console.log('🔍 [ExcelExport] Проверка shouldExportOnRecord:', {
      result,
      enabled: this.settings?.excelExport?.enabled,
      autoExportEnabled: this.settings?.excelExport?.autoExportEnabled,
      exportOnRecord: this.settings?.excelExport?.exportOnRecord
    });
    return result;
  }

  /**
   * Проверяет, нужно ли экспортировать при воспроизведении
   */
  shouldExportOnPlay() {
    const result = this.isExportEnabled() &&
                  this.isAutoExportEnabled() &&
                  (this.settings?.excelExport?.exportOnPlay !== false);
    console.log('🔍 [ExcelExport] Проверка shouldExportOnPlay:', {
      result,
      enabled: this.settings?.excelExport?.enabled,
      autoExportEnabled: this.settings?.excelExport?.autoExportEnabled,
      exportOnPlay: this.settings?.excelExport?.exportOnPlay
    });
    return result;
  }

  /**
   * Проверяет, нужно ли экспортировать после оптимизации
   */
  shouldExportOnOptimize() {
    const result = this.isExportEnabled() &&
                  this.isAutoExportEnabled() &&
                  (this.settings?.excelExport?.exportOnOptimize !== false);
    console.log('🔍 [ExcelExport] Проверка shouldExportOnOptimize:', {
      result,
      enabled: this.settings?.excelExport?.enabled,
      autoExportEnabled: this.settings?.excelExport?.autoExportEnabled,
      exportOnOptimize: this.settings?.excelExport?.exportOnOptimize
    });
    return result;
  }

  /**
   * Экспортирует тест в Excel файл
   * @param {Object} test - Объект теста
   * @param {string} exportReason - Причина экспорта: 'record', 'play', 'optimize'
   * @param {Object} additionalData - Дополнительные данные (авторизация, преднастройки, история прогона)
   */
  async exportTestToExcel(test, exportReason = 'record', additionalData = {}, options = {}) {
    if (!this.isExportEnabled()) {
      console.log('ℹ️ [ExcelExport] Экспорт в Excel отключен в настройках');
      return;
    }

    try {
      console.log('📊 [ExcelExport] Начинаю экспорт теста в Excel...');

      // Формируем данные для экспорта
      const testCaseData = this.prepareTestCaseData(test, exportReason, additionalData);
      const format = this.getExportFormat();
      const fileName = this.generateFileName(test, exportReason);

      if (format === 'xlsx') {
        const xlsxBlob = this.generateXLSX(testCaseData);
        await this.downloadFile(xlsxBlob, fileName, {
          ...options,
          format
        });
      } else {
        const csvContent = this.generateCSV(testCaseData);
        await this.downloadFile(csvContent, fileName, {
          ...options,
          format
        });
      }

      console.log('✅ [ExcelExport] Тест успешно экспортирован в Excel:', fileName);
    } catch (error) {
      console.error('❌ [ExcelExport] Ошибка при экспорте в Excel:', error);
    }
  }

  /**
   * Подготавливает данные тест-кейса для экспорта
   */
  prepareTestCaseData(test, exportReason, additionalData) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU');
    const timeStr = now.toLocaleTimeString('ru-RU');

    // Собираем информацию о тесте
    const testInfo = {
      name: test.name || `Test ${test.id}`,
      id: test.id,
      createdAt: test.createdAt ? new Date(test.createdAt).toLocaleString('ru-RU') : dateStr + ' ' + timeStr,
      description: test.description || '',
      exportReason: this.getExportReasonLabel(exportReason),
      exportDate: dateStr + ' ' + timeStr
    };

    // Собираем данные авторизации и преднастроек
    const authData = additionalData.authData || {};
    const preconditions = additionalData.preconditions || [];
    const runHistory = additionalData.runHistory || null;

    // Формируем шаги теста
    const steps = this.prepareTestSteps(test.actions || [], runHistory);

    return {
      testInfo,
      authData,
      preconditions,
      steps,
      runHistory
    };
  }

  /**
   * Подготавливает шаги теста для экспорта
   */
  prepareTestSteps(actions, runHistory) {
    const steps = [];
    let stepNumber = 1;

    // Создаем Map для быстрого поиска истории шагов
    const stepHistoryMap = new Map();
    if (runHistory && runHistory.steps) {
      runHistory.steps.forEach((step, index) => {
        stepHistoryMap.set(index, step);
      });
    }

    actions.forEach((action, index) => {
      // Пропускаем скрытые действия
      if (action.hidden) return;

      // Пропускаем wait действия (они будут отображены как задержки)
      if (action.type === 'wait') return;

      const stepHistory = stepHistoryMap.get(index);
      
      const step = {
        number: stepNumber++,
        fieldLabel: action.fieldLabel || '',
        actionType: this.getActionTypeLabel(action.type),
        selector: this.formatSelector(action.selector),
        value: this.getActionValue(action),
        url: action.url || '',
        expectedResult: this.getExpectedResult(action, stepHistory),
        delayBefore: stepHistory?.delayBefore ? `${stepHistory.delayBefore}мс` : '',
        delayAfter: stepHistory?.delayAfter ? `${stepHistory.delayAfter}мс` : '',
        duration: stepHistory?.duration ? `${stepHistory.duration}мс` : '',
        status: stepHistory?.success !== false ? 'Успешно' : 'Ошибка',
        error: stepHistory?.error || '',
        notes: this.getStepNotes(action, stepHistory)
      };

      steps.push(step);
    });

    return steps;
  }

  /**
   * Получает метку типа действия
   */
  getActionTypeLabel(type) {
    const labels = {
      'click': 'Клик',
      'dblclick': 'Двойной клик',
      'input': 'Ввод',
      'change': 'Изменение',
      'scroll': 'Прокрутка',
      'navigation': 'Навигация',
      'wait': 'Задержка'
    };
    return labels[type] || type;
  }

  /**
   * Форматирует селектор для отображения
   */
  formatSelector(selector) {
    if (!selector) return '';
    if (typeof selector === 'string') return selector;
    if (selector.selector) return selector.selector;
    return JSON.stringify(selector);
  }

  /**
   * Получает значение действия
   */
  getActionValue(action) {
    if (action.value) return String(action.value);
    if (action.element?.text) return action.element.text;
    if (action.element?.href) return action.element.href;
    return '';
  }

  /**
   * Получает ожидаемый результат
   */
  getExpectedResult(action, stepHistory) {
    if (stepHistory?.expectedResult) {
      return stepHistory.expectedResult;
    }

    // Генерируем ожидаемый результат на основе типа действия
    switch (action.type) {
      case 'click':
        return 'Элемент должен быть кликнут';
      case 'input':
        return `Поле "${action.fieldLabel || 'поле'}" должно содержать значение "${this.getActionValue(action)}"`;
      case 'change':
        return `Значение поля "${action.fieldLabel || 'поле'}" должно измениться на "${this.getActionValue(action)}"`;
      case 'navigation':
        return `Переход на страницу: ${action.url || action.value}`;
      default:
        return 'Действие выполнено успешно';
    }
  }

  /**
   * Получает примечания к шагу
   */
  getStepNotes(action, stepHistory) {
    const notes = [];

    if (action.isDropdownSelection) {
      notes.push('Выбор из выпадающего списка');
    }


    if (stepHistory?.error) {
      notes.push(`Ошибка: ${stepHistory.error}`);
    }

    if (stepHistory?.usedSelector && stepHistory.usedSelector !== this.formatSelector(action.selector)) {
      notes.push(`Использован альтернативный селектор: ${stepHistory.usedSelector}`);
    }

    return notes.join('; ');
  }

  /**
   * Получает метку причины экспорта
   */
  getExportReasonLabel(reason) {
    const labels = {
      'record': 'Запись теста',
      'play': 'Воспроизведение теста',
      'optimize': 'Оптимизация теста'
    };
    return labels[reason] || reason;
  }

  /**
   * Возвращает выбранный формат файла (xls | csv | xlsx)
   */
  getExportFormat() {
    const format = (this.settings?.excelExport?.format || 'xls').toLowerCase();
    if (format === 'xlsx') return 'xlsx';
    if (format === 'csv') return 'csv';
    return 'xls';
  }

  /**
   * Возвращает разделитель значений
   */
  getDelimiter() {
    const raw = this.settings?.excelExport?.delimiter;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      const trimmed = raw.trim();
      if (trimmed === '\\t') {
        return '\t';
      }
      return trimmed;
    }
    return ';';
  }

  /**
   * Генерирует CSV содержимое
   */
  generateCSV(data) {
    const delimiter = this.getDelimiter();
    const joinRow = (values) => values.map(value => this.escapeCSV(value, delimiter)).join(delimiter);
    const lines = [];

    // Лист 1: Информация о тесте
    lines.push('=== ИНФОРМАЦИЯ О ТЕСТЕ ===');
    lines.push('');

    lines.push(joinRow(['Название теста', data.testInfo.name]));
    lines.push(joinRow(['ID теста', data.testInfo.id]));
    lines.push(joinRow(['Дата создания', data.testInfo.createdAt]));
    lines.push(joinRow(['Причина экспорта', data.testInfo.exportReason]));
    lines.push(joinRow(['Дата экспорта', data.testInfo.exportDate]));
    if (data.testInfo.description) {
      lines.push(joinRow(['Описание', data.testInfo.description]));
    }
    lines.push('');

    lines.push('=== ДАННЫЕ АВТОРИЗАЦИИ ===');
    lines.push('');

    if (Object.keys(data.authData).length > 0) {
      Object.entries(data.authData).forEach(([key, value]) => {
        lines.push(joinRow([key, String(value)]));
      });
    } else {
      lines.push('Данные авторизации не указаны');
    }
    lines.push('');

    lines.push('=== ПРЕДНАСТРОЙКИ ===');
    lines.push('');

    if (data.preconditions.length > 0) {
      data.preconditions.forEach((precondition, index) => {
        lines.push(joinRow([`Преднастройка ${index + 1}`, String(precondition)]));
      });
    } else {
      lines.push('Преднастройки не указаны');
    }
    lines.push('');
    lines.push('');

    // Лист 2: Шаги теста
    lines.push('=== ШАГИ ТЕСТА ===');
    lines.push('');

    lines.push(joinRow([
      '№',
      'Заголовок поля',
      'Тип действия',
      'Селектор',
      'Значение',
      'URL страницы',
      'Ожидаемый результат',
      'Задержка до (мс)',
      'Задержка после (мс)',
      'Длительность (мс)',
      'Статус',
      'Ошибка',
      'Примечания'
    ]));

    data.steps.forEach(step => {
      lines.push(joinRow([
        step.number,
        step.fieldLabel,
        step.actionType,
        step.selector,
        step.value,
        step.url,
        step.expectedResult,
        step.delayBefore,
        step.delayAfter,
        step.duration,
        step.status,
        step.error,
        step.notes
      ]));
    });

    return lines.join('\n');
  }

  /**
   * Экранирует значение для CSV
   */
  escapeCSV(value, delimiter = ';') {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Если содержит разделитель, перенос строки или кавычки, оборачиваем в кавычки
    if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Генерирует настоящий XLSX-файл
   */
  generateXLSX(data) {
    const rows = this.buildWorksheetRows(data);
    const sheetXml = this.buildWorksheetXML(rows);
    const builder = new SimpleZipBuilder();
    const created = new Date().toISOString();

    builder.addFile('[Content_Types].xml', this.buildContentTypesXML());
    builder.addFile('_rels/.rels', this.buildRootRelsXML());
    builder.addFile('docProps/app.xml', this.buildAppPropsXML());
    builder.addFile('docProps/core.xml', this.buildCorePropsXML(created));
    builder.addFile('xl/workbook.xml', this.buildWorkbookXML());
    builder.addFile('xl/_rels/workbook.xml.rels', this.buildWorkbookRelsXML());
    builder.addFile('xl/styles.xml', this.buildStylesXML());
    builder.addFile('xl/worksheets/sheet1.xml', sheetXml);

    return builder.buildBlob('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  buildWorksheetRows(data) {
    const rows = [];
    rows.push(['=== ИНФОРМАЦИЯ О ТЕСТЕ ===']);
    rows.push([]);
    rows.push(['Название теста', data.testInfo.name]);
    rows.push(['ID теста', data.testInfo.id]);
    rows.push(['Дата создания', data.testInfo.createdAt]);
    rows.push(['Причина экспорта', data.testInfo.exportReason]);
    rows.push(['Дата экспорта', data.testInfo.exportDate]);
    if (data.testInfo.description) {
      rows.push(['Описание', data.testInfo.description]);
    }
    rows.push([]);
    rows.push(['=== ДАННЫЕ АВТОРИЗАЦИИ ===']);
    rows.push([]);
    if (Object.keys(data.authData).length > 0) {
      Object.entries(data.authData).forEach(([key, value]) => {
        rows.push([key, String(value)]);
      });
    } else {
      rows.push(['Данные авторизации не указаны']);
    }
    rows.push([]);
    rows.push(['=== ПРЕДНАСТРОЙКИ ===']);
    rows.push([]);
    if (data.preconditions.length > 0) {
      data.preconditions.forEach((precondition, index) => {
        rows.push([`Преднастройка ${index + 1}`, String(precondition)]);
      });
    } else {
      rows.push(['Преднастройки не указаны']);
    }
    rows.push([]);
    rows.push(['=== ШАГИ ТЕСТА ===']);
    rows.push([]);
    rows.push([
      '№',
      'Заголовок поля',
      'Тип действия',
      'Селектор',
      'Значение',
      'URL страницы',
      'Ожидаемый результат',
      'Задержка до (мс)',
      'Задержка после (мс)',
      'Длительность (мс)',
      'Статус',
      'Ошибка',
      'Примечания'
    ]);

    data.steps.forEach(step => {
      rows.push([
        step.number,
        step.fieldLabel,
        step.actionType,
        step.selector,
        step.value,
        step.url,
        step.expectedResult,
        step.delayBefore,
        step.delayAfter,
        step.duration,
        step.status,
        step.error,
        step.notes
      ]);
    });

    return rows;
  }

  buildWorksheetXML(rows) {
    const escape = (value) => this.escapeXML(value);
    const buildRow = (cells, rowIndex) => {
      if (!cells || cells.length === 0 || cells.every(cell => cell === undefined || cell === null || cell === '')) {
        return `<row r="${rowIndex}"/>`;
      }
      const cellXml = cells.map((cellValue, cellIndex) => {
        if (cellValue === undefined || cellValue === null || cellValue === '') {
          return '';
        }
        const cellRef = `${this.columnIndexToName(cellIndex + 1)}${rowIndex}`;
        const text = escape(String(cellValue));
        return `<c r="${cellRef}" t="inlineStr"><is><t>${text}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex}">${cellXml}</row>`;
    };

    const sheetData = rows.map((row, index) => buildRow(row, index + 1)).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
  }

  columnIndexToName(index) {
    let name = '';
    while (index > 0) {
      const remainder = (index - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      index = Math.floor((index - 1) / 26);
    }
    return name;
  }

  escapeXML(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  buildContentTypesXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  buildRootRelsXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  buildAppPropsXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>AutoTest Recorder</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant>
        <vt:lpstr>Листы</vt:lpstr>
      </vt:variant>
      <vt:variant>
        <vt:i4>1</vt:i4>
      </vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>TestCase</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`;
  }

  buildCorePropsXML(createdAt) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>AutoTest Recorder</dc:creator>
  <cp:lastModifiedBy>AutoTest Recorder</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`;
  }

  buildWorkbookXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="TestCase" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
  }

  buildWorkbookRelsXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  buildStylesXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font>
      <sz val="11"/>
      <color theme="1"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="1">
    <fill>
      <patternFill patternType="none"/>
    </fill>
  </fills>
  <borders count="1">
    <border/>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
  }

  /**
   * Генерирует имя файла
   */
  generateFileName(test, exportReason) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '_');
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const testName = (test.name || `Test_${test.id}`).replace(/[^a-zA-Z0-9_]/g, '_');
    const reasonLabel = exportReason === 'record' ? 'Record' : exportReason === 'play' ? 'Play' : 'Optimize';
    const format = this.getExportFormat();
    const extension = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'xls';
    
    return `TestCase_${testName}_${reasonLabel}_${dateStr}_${timeStr}.${extension}`;
  }

  /**
   * Скачивает файл
   */
  async downloadFile(content, fileName, options = {}) {
    const { promptForLocation = false, format = 'xls' } = options;
    let blob;
    let mimeType;

    if (format === 'xlsx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (content instanceof Blob) {
        blob = content;
      } else if (content instanceof Uint8Array) {
        blob = new Blob([content], { type: mimeType });
      } else if (content instanceof ArrayBuffer) {
        blob = new Blob([new Uint8Array(content)], { type: mimeType });
      } else {
        blob = new Blob([content], { type: mimeType });
      }
    } else {
      mimeType = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel';
      const BOM = '\uFEFF';
      const textContent = typeof content === 'string' ? content : '';
      blob = new Blob([BOM + textContent], { type: mimeType });
    }
    
    // Логируем информацию о файле перед скачиванием
    console.log('📥 [ExcelExport] Начинаю скачивание файла:', fileName);
    console.log('📥 [ExcelExport] Размер файла:', (blob.size / 1024).toFixed(2), 'KB');
    
    // Пробуем использовать Chrome Downloads API (если доступен)
    if (chrome.runtime && chrome.runtime.sendMessage) {
      try {
        // Конвертируем Blob в base64 для передачи в background
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        const base64data = await base64Promise;
        
        // Отправляем запрос на скачивание через background script
        await chrome.runtime.sendMessage({
          type: 'DOWNLOAD_FILE',
          fileName: fileName,
          data: base64data,
          mimeType: mimeType,
          saveAs: promptForLocation === true
        });
        
        console.log(`✅ [ExcelExport] Файл ${fileName} отправлен на скачивание через Chrome Downloads API`);
        if (promptForLocation) {
          console.log('📁 [ExcelExport] Будет открыт диалог выбора места сохранения файла');
        } else {
          console.log('📁 [ExcelExport] Файл будет автоматически сохранен в папку Загрузки');
        }
        return;
      } catch (error) {
        console.warn('⚠️ [ExcelExport] Ошибка при использовании Chrome Downloads API, использую fallback:', error);
      }
    }
    
    // Fallback: используем обычный способ через link.click()
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    
    // Небольшая задержка перед удалением элемента
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    
    // Получаем путь сохранения из настроек
    const savePath = this.settings?.excelExport?.exportPath || 'папка Загрузки (Downloads)';
    console.log(`✅ [ExcelExport] Файл ${fileName} успешно экспортирован`);
    console.log(`📁 [ExcelExport] Файл должен быть сохранен в: ${savePath}`);
    console.log(`💡 [ExcelExport] Если файл не найден:`);
    console.log(`   1. Проверьте папку Загрузки (Downloads) в настройках браузера`);
    console.log(`   2. Проверьте настройки автоматических загрузок в браузере`);
    console.log(`   3. Файл может быть заблокирован - проверьте панель загрузок браузера (Ctrl+J)`);
  }
}

class SimpleZipBuilder {
  constructor() {
    this.files = [];
    this.encoder = new TextEncoder();
  }

  addFile(path, content) {
    let data;
    if (content instanceof Uint8Array) {
      data = content;
    } else if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content);
    } else if (typeof content === 'string') {
      data = this.encoder.encode(content);
    } else {
      data = this.encoder.encode(String(content ?? ''));
    }
    const crc32 = SimpleZipBuilder.crc32(data);
    this.files.push({ path, data, crc32 });
  }

  buildUint8Array() {
    const encoder = this.encoder;
    const localParts = [];
    const records = [];
    let offset = 0;

    this.files.forEach(file => {
      const nameBytes = encoder.encode(file.path);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(localHeader.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, file.crc32, true);
      view.setUint32(18, file.data.length, true);
      view.setUint32(22, file.data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader);
      localParts.push(file.data);

      records.push({
        nameBytes,
        file,
        offset
      });

      offset += localHeader.length + file.data.length;
    });

    const centralParts = [];
    let centralSize = 0;
    records.forEach(record => {
      const nameBytes = record.nameBytes;
      const header = new Uint8Array(46 + nameBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      view.setUint32(16, record.file.crc32, true);
      view.setUint32(20, record.file.data.length, true);
      view.setUint32(24, record.file.data.length, true);
      view.setUint16(28, nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, record.offset, true);
      header.set(nameBytes, 46);
      centralParts.push(header);
      centralSize += header.length;
    });

    const centralOffset = offset;
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, records.length, true);
    eocdView.setUint16(10, records.length, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, centralOffset, true);
    eocdView.setUint16(20, 0, true);

    const totalSize = offset + centralSize + eocd.length;
    const result = new Uint8Array(totalSize);
    let cursor = 0;
    [...localParts, ...centralParts, eocd].forEach(part => {
      result.set(part, cursor);
      cursor += part.length;
    });

    return result;
  }

  buildBlob(mimeType) {
    return new Blob([this.buildUint8Array()], { type: mimeType });
  }

  static crc32(data) {
    const table = SimpleZipBuilder.getCrcTable();
    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  static getCrcTable() {
    if (!SimpleZipBuilder.crcTable) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
      }
      SimpleZipBuilder.crcTable = table;
    }
    return SimpleZipBuilder.crcTable;
  }
}

// Экспортируем класс
if (typeof window !== 'undefined') {
  window.ExcelExporter = ExcelExporter;
}

