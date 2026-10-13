/**
 * Inspection & Maintenance Tracker
 * Google Apps Script backend
 *
 * Portfolio-safe refactor:
 * - no corporate domain hard-coded
 * - no corporate logo/branding dependency
 * - configuration stored in Script Properties
 * - server-side validation
 * - write lock to reduce concurrent collisions
 * - reusable report generation helpers
 */

const DEFAULT_CONFIG = Object.freeze({
  APP_NAME: 'Inspection & Maintenance Tracker',
  SHEET_NAME: 'Respostas',
  PHOTO_FOLDER: 'inspection-photos',
  ALLOWED_DOMAIN: '',
  PHOTO_SHARING_MODE: 'PRIVATE',
  MAX_PHOTO_BYTES: '6291456', // 6 MiB
  REPORT_PREFIX: 'Report - ',
  TIMEZONE: Session.getScriptTimeZone() || 'America/Sao_Paulo'
});

const SOURCE_HEADERS = [
  'Data/Hora',
  'E-mail do Inspetor',
  'Local da Inspeção',
  'TAG',
  'Descrição da Pendência',
  'ID Foto Drive',
  'URL Foto'
];

const STATUS_VALUES = ['Pendente', 'Concluido'];


/**
 * Web app entry point.
 */
function doGet() {
  const config = getConfig_();

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(config.APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


/**
 * Returns current user information and authorization state.
 */
function obterUsuarioLogado() {
  const config = getConfig_();
  const email = Session.getActiveUser().getEmail().trim();
  const authorized = isAuthorizedEmail_(email, config.ALLOWED_DOMAIN);

  return {
    email: email || 'Não identificado',
    autorizado: authorized,
    dominioExigido: config.ALLOWED_DOMAIN || 'qualquer conta autenticada',
    appName: config.APP_NAME,
    limiteFotoBytes: Number(config.MAX_PHOTO_BYTES)
  };
}


/**
 * Searches records by TAG.
 * Kept compatible with the original data model.
 */
function buscarPendenciasPorTag(tagBusca) {
  const tag = normalizeText_(tagBusca);

  if (tag.length < 2) {
    return [];
  }

  const sheet = getSourceSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const timezone = getConfig_().TIMEZONE;

  return values
    .slice(1)
    .filter(row => normalizeText_(row[3]).toLowerCase() === tag.toLowerCase())
    .map(row => ({
      data: formatDate_(row[0], timezone),
      usuario: row[1] || '',
      local: row[2] || '',
      tag: row[3] || '',
      descricao: row[4] || '',
      fotoId: row[5] || ''
    }));
}


/**
 * Saves a new inspection finding.
 */
function salvarPendencia(formDados) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const user = obterUsuarioLogado();

    if (!user.autorizado) {
      throw new Error(
        'Acesso negado. Utilize uma conta autorizada para registrar pendências.'
      );
    }

    const payload = validatePayload_(formDados);
    const sheet = getSourceSheet_();

    let photo = {
      id: '',
      url: ''
    };

    if (payload.fotoBase64) {
      photo = savePhoto_(payload);
    }

    sheet.appendRow([
      new Date(),
      user.email,
      payload.local,
      payload.tag,
      payload.descricao,
      photo.id,
      photo.url
    ]);

    formatSourceRow_(sheet, sheet.getLastRow());

    gerarRelatorioAgrupadoPorLocal();

    return 'Pendência registrada com sucesso!';
  } finally {
    lock.releaseLock();
  }
}


/**
 * Generates one report tab per inspection location.
 *
 * Status remains stored in the report sheet and is preserved across
 * regeneration using a hidden technical source-row column.
 */
function gerarRelatorioAgrupadoPorLocal() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = getSourceSheet_();
  const values = sourceSheet.getDataRange().getValues();

  if (values.length <= 1) {
    return;
  }

  const grouped = groupByLocation_(values);

  Object.keys(grouped).forEach(location => {
    buildLocationReport_(spreadsheet, location, grouped[location]);
  });
}


/**
 * Normalizes supported status values.
 */
function normalizarStatus(status) {
  const value = normalizeText_(status).toLowerCase();

  if (value === 'concluído' || value === 'concluido') {
    return 'Concluido';
  }

  return value === 'pendente' ? 'Pendente' : 'Pendente';
}


// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

function getConfig_() {
  const properties = PropertiesService.getScriptProperties().getProperties();

  return {
    APP_NAME: properties.APP_NAME || DEFAULT_CONFIG.APP_NAME,
    SHEET_NAME: properties.SHEET_NAME || DEFAULT_CONFIG.SHEET_NAME,
    PHOTO_FOLDER: properties.PHOTO_FOLDER || DEFAULT_CONFIG.PHOTO_FOLDER,
    ALLOWED_DOMAIN: normalizeDomain_(properties.ALLOWED_DOMAIN || DEFAULT_CONFIG.ALLOWED_DOMAIN),
    PHOTO_SHARING_MODE: (properties.PHOTO_SHARING_MODE || DEFAULT_CONFIG.PHOTO_SHARING_MODE).toUpperCase(),
    MAX_PHOTO_BYTES: properties.MAX_PHOTO_BYTES || DEFAULT_CONFIG.MAX_PHOTO_BYTES,
    REPORT_PREFIX: properties.REPORT_PREFIX || DEFAULT_CONFIG.REPORT_PREFIX,
    TIMEZONE: properties.TIMEZONE || DEFAULT_CONFIG.TIMEZONE
  };
}


function normalizeDomain_(domain) {
  let value = normalizeText_(domain).toLowerCase();

  if (value && !value.startsWith('@')) {
    value = '@' + value;
  }

  return value;
}


function isAuthorizedEmail_(email, allowedDomain) {
  const normalizedEmail = normalizeText_(email).toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  if (!allowedDomain) {
    return true;
  }

  return normalizedEmail.endsWith(allowedDomain);
}


// -----------------------------------------------------------------------------
// Validation & source sheet
// -----------------------------------------------------------------------------

function validatePayload_(formDados) {
  if (!formDados || typeof formDados !== 'object') {
    throw new Error('Dados do formulário inválidos.');
  }

  const local = normalizeText_(formDados.local);
  const tag = normalizeText_(formDados.tag);
  const descricao = normalizeText_(formDados.descricao);
  const fotoBase64 = normalizeText_(formDados.fotoBase64);

  if (local.length < 2 || local.length > 120) {
    throw new Error('Informe um local válido (2 a 120 caracteres).');
  }

  if (tag.length < 1 || tag.length > 60) {
    throw new Error('Informe uma TAG válida (1 a 60 caracteres).');
  }

  if (descricao.length < 5 || descricao.length > 3000) {
    throw new Error('A descrição deve ter entre 5 e 3000 caracteres.');
  }

  if (!fotoBase64) {
    throw new Error('A foto da pendência é obrigatória.');
  }

  const header = fotoBase64.split(',')[0] || '';
  const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/);

  if (!mimeMatch) {
    throw new Error('Formato de imagem inválido.');
  }

  return {
    local,
    tag,
    descricao,
    fotoBase64
  };
}


function getSourceSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig_();

  let sheet = spreadsheet.getSheetByName(config.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(config.SHEET_NAME);
  }

  ensureSourceHeader_(sheet);

  return sheet;
}


function ensureSourceHeader_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, SOURCE_HEADERS.length);
  const current = headerRange.getValues()[0];

  const missingHeader = SOURCE_HEADERS.some(
    (header, index) => current[index] !== header
  );

  if (missingHeader) {
    headerRange.setValues([SOURCE_HEADERS]);
  }

  headerRange
    .setBackground('#173B57')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, SOURCE_HEADERS.length);
}


function formatSourceRow_(sheet, rowNumber) {
  sheet
    .getRange(rowNumber, 1, 1, SOURCE_HEADERS.length)
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet
    .getRange(rowNumber, 1)
    .setNumberFormat('dd/MM/yyyy HH:mm');
}


// -----------------------------------------------------------------------------
// Photo handling
// -----------------------------------------------------------------------------

function savePhoto_(payload) {
  const config = getConfig_();
  const split = payload.fotoBase64.split(',');

  if (split.length !== 2) {
    throw new Error('Imagem inválida ou corrompida.');
  }

  const mimeMatch = split[0].match(/data:(image\/[a-zA-Z0-9.+-]+);base64/);
  const contentType = mimeMatch ? mimeMatch[1].toLowerCase() : '';

  if (!contentType.startsWith('image/')) {
    throw new Error('Apenas arquivos de imagem são aceitos.');
  }

  const bytes = Utilities.base64Decode(split[1]);

  if (bytes.length > Number(config.MAX_PHOTO_BYTES)) {
    const maxMb = (Number(config.MAX_PHOTO_BYTES) / 1024 / 1024).toFixed(1);
    throw new Error(`A foto excede o limite de ${maxMb} MB.`);
  }

  const folder = getOrCreatePhotoFolder_(config.PHOTO_FOLDER);

  const extension = contentType === 'image/jpeg' ? 'jpg' : getSafeExtension_(contentType);
  const fileName = [
    'inspection',
    sanitizeFileName_(payload.tag),
    Date.now()
  ].join('_') + '.' + extension;

  const blob = Utilities.newBlob(bytes, contentType, fileName);
  const file = folder.createFile(blob);

  applyPhotoSharing_(file, folder, config.PHOTO_SHARING_MODE);

  return {
    id: file.getId(),
    url: file.getUrl()
  };
}


function getOrCreatePhotoFolder_(folderName) {
  const iterator = DriveApp.getFoldersByName(folderName);

  return iterator.hasNext()
    ? iterator.next()
    : DriveApp.createFolder(folderName);
}


function applyPhotoSharing_(file, folder, mode) {
  const sharingMode = mode.toUpperCase();

  const accessMap = {
    PRIVATE: DriveApp.Access.PRIVATE,
    DOMAIN: DriveApp.Access.DOMAIN,
    DOMAIN_WITH_LINK: DriveApp.Access.DOMAIN_WITH_LINK,
    ANYONE_WITH_LINK: DriveApp.Access.ANYONE_WITH_LINK
  };

  const access = accessMap[sharingMode];

  if (!access) {
    throw new Error(
      'PHOTO_SHARING_MODE inválido. Use PRIVATE, DOMAIN, DOMAIN_WITH_LINK ou ANYONE_WITH_LINK.'
    );
  }

  // A folder setting controls inherited access; file setting handles the file itself.
  // Some Workspace administrators may prohibit public link sharing.
  try {
    folder.setSharing(access, DriveApp.Permission.VIEW);
    file.setSharing(access, DriveApp.Permission.VIEW);
  } catch (error) {
    throw new Error(
      'Não foi possível configurar o compartilhamento da foto. ' +
      'Verifique a política do Google Workspace/Drive.'
    );
  }
}


function getSafeExtension_(mimeType) {
  const map = {
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp'
  };

  return map[mimeType] || 'img';
}


// -----------------------------------------------------------------------------
// Report generation
// -----------------------------------------------------------------------------

function groupByLocation_(values) {
  const grouped = {};

  for (let index = 1; index < values.length; index++) {
    const row = values[index];

    const location = normalizeText_(row[2]).toUpperCase() || 'SEM LOCAL';

    if (!grouped[location]) {
      grouped[location] = [];
    }

    grouped[location].push({
      sourceRow: index + 1,
      dataHora: row[0],
      email: row[1] || '',
      tag: row[3] || '',
      descricao: row[4] || '',
      photoId: row[5] || ''
    });
  }

  return grouped;
}


function buildLocationReport_(spreadsheet, location, items) {
  const config = getConfig_();
  const sheetName = buildUniqueSheetName_(
    spreadsheet,
    config.REPORT_PREFIX + location
  );

  let report = spreadsheet.getSheetByName(sheetName);

  const statusBySourceRow = report
    ? readExistingStatuses_(report)
    : {};

  if (!report) {
    report = spreadsheet.insertSheet(sheetName);
  } else {
    const filter = report.getFilter();
    if (filter) {
      filter.remove();
    }

    report.showColumns(1, 7);
    report.clear();
    report.clearConditionalFormatRules();
  }

  const quantity = items.length;
  const startRow = 4;

  // Header
  report.getRange('A1:F3')
    .setBackground('#EAF2F8')
    .setFontColor('#173B57');

  report.getRange('A1')
    .setValue('IM')
    .setFontSize(18)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  report.getRange('B1:F1').merge();
  report.getRange('B1')
    .setValue('INSPECTION REPORT  |  ' + location)
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  report.setRowHeight(1, 45);

  report.getRange('A2:F2').merge();
  report.getRange('A2')
    .setValue('Inspection findings and corrective-action follow-up')
    .setFontSize(10)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  report.setRowHeight(2, 25);

  const headers = [[
    'Data/Hora',
    'Inspetor (E-mail)',
    'TAG Equipamento',
    'Descrição da Pendência',
    'Foto da Falha',
    'Status'
  ]];

  report.getRange(3, 1, 1, 6)
    .setValues(headers)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  report.setRowHeight(3, 30);

  const tableData = [];
  const photoFormulas = [];
  const statusData = [];
  const sourceRows = [];

  items.forEach(item => {
    tableData.push([
      item.dataHora,
      item.email,
      item.tag,
      item.descricao
    ]);

    if (item.photoId) {
      photoFormulas.push([
        `=IMAGE("https://drive.google.com/uc?export=view&id=${item.photoId}")`
      ]);
    } else {
      photoFormulas.push(['Sem foto']);
    }

    statusData.push([
      statusBySourceRow[item.sourceRow] || 'Pendente'
    ]);

    sourceRows.push([item.sourceRow]);
  });

  if (quantity > 0) {
    report.getRange(startRow, 1, quantity, 4)
      .setValues(tableData)
      .setWrap(true)
      .setVerticalAlignment('middle');

    report.getRange(startRow, 5, quantity, 1)
      .setFormulas(photoFormulas)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    report.getRange(startRow, 6, quantity, 1)
      .setValues(statusData)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setFontWeight('bold');

    report.getRange(startRow, 7, quantity, 1)
      .setValues(sourceRows);

    report.getRange(startRow, 1, quantity, 1)
      .setNumberFormat('dd/MM/yyyy HH:mm');

    for (let row = startRow; row < startRow + quantity; row++) {
      report.setRowHeight(row, 115);
    }
  }

  applyReportFormatting_(report, quantity);
  report.hideColumns(7);
  report.setFrozenRows(3);

  if (quantity > 0) {
    report.getRange(3, 1, quantity + 1, 6).createFilter();
  }
}


function readExistingStatuses_(report) {
  const result = {};
  const lastRow = report.getLastRow();

  if (lastRow < 4) {
    return result;
  }

  const values = report.getRange(4, 6, lastRow - 3, 2).getValues();

  values.forEach(row => {
    const status = normalizarStatus(row[0]);
    const sourceRow = row[1];

    if (sourceRow && !isNaN(sourceRow)) {
      result[sourceRow] = status;
    }
  });

  return result;
}


function applyReportFormatting_(report, quantity) {
  const tableHeight = quantity + 3;

  report.getRange(1, 1, tableHeight, 6)
    .setFontFamily('Arial')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#C4D0DA',
      SpreadsheetApp.BorderStyle.SOLID
    );

  report.setColumnWidth(1, 140);
  report.setColumnWidth(2, 220);
  report.setColumnWidth(3, 150);
  report.setColumnWidth(4, 350);
  report.setColumnWidth(5, 180);
  report.setColumnWidth(6, 130);
  report.setColumnWidth(7, 90);

  if (quantity <= 0) {
    return;
  }

  const statusRange = report.getRange(4, 6, quantity, 1);

  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES, true)
    .setAllowInvalid(false)
    .setHelpText('Selecione o status atual da pendência.')
    .build();

  statusRange.setDataValidation(validation);

  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Pendente')
      .setBackground('#FFF3CD')
      .setFontColor('#856404')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Concluido')
      .setBackground('#DFF0D8')
      .setFontColor('#2E7D32')
      .setRanges([statusRange])
      .build()
  ];

  report.setConditionalFormatRules(rules);

  const backgrounds = Array.from(
    { length: quantity },
    (_, index) => {
      const background = index % 2 === 0 ? '#FFFFFF' : '#F7F9FB';
      return [background, background, background, background, background, background];
    }
  );

  report.getRange(4, 1, quantity, 6).setBackgrounds(backgrounds);
  statusRange.setFontWeight('bold');
}


// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function buildUniqueSheetName_(spreadsheet, proposedName) {
  const sanitized = normalizeSheetName_(proposedName);

  if (sanitized.length <= 31) {
    return sanitized;
  }

  const prefixLength = Math.max(1, 31 - 9);
  const hash = simpleHash_(sanitized);
  return sanitized.substring(0, prefixLength) + '-' + hash;
}


function simpleHash_(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36).substring(0, 8).padStart(8, '0');
}


function normalizeSheetName_(name) {
  const value = normalizeText_(name)
    .replace(/[\\\/\?\*\:\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return value || 'SEM LOCAL';
}


function sanitizeFileName_(value) {
  return normalizeText_(value)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60) || 'unknown-tag';
}


function normalizeText_(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}


function formatDate_(value, timezone) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);

  return Utilities.formatDate(date, timezone, 'dd/MM/yyyy HH:mm');
}
