// XenograftMaster - Google Apps Script Backend
// Deploy as Web App: Execute as Me, Access: Anyone with Google Account
// After deploy, copy the web app URL to js/api.js APPS_SCRIPT_URL

const SHEET_ID = ''; // Set your Google Spreadsheet ID here

const SHEETS = {
  STUDIES: 'studies',
  GROUPS: 'groups',
  ANIMALS: 'animals',
  MEASUREMENTS: 'measurements',
  NECROPSY: 'necropsy',
  CODES: 'codes',
  SUBSTANCES: 'substances',
  COMPETITORS: 'competitors'
};

function getSpreadsheet() {
  if (!SHEET_ID) throw new Error('SHEET_ID가 설정되지 않았습니다. Code.gs에서 SHEET_ID를 설정해주세요.');
  return SpreadsheetApp.openById(SHEET_ID);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function initSheets() {
  const ss = getSpreadsheet();
  getOrCreateSheet(ss, SHEETS.STUDIES, [
    'studyId','studyNumber','year','classification','modelName','strain','cro','projectName',
    'protocolLink','reportLink','dataSource','competitorDrug','competitorSource','createdAt','updatedAt'
  ]);
  getOrCreateSheet(ss, SHEETS.GROUPS, [
    'groupId','studyId','groupNumber','substanceName','groupRole','animalCount',
    'implantationDate','separationDate','day1Date','necropsyDate','measurementDays',
    'dosingSchedule','isControl','sameAsGroup1'
  ]);
  getOrCreateSheet(ss, SHEETS.ANIMALS, [
    'animalId','studyId','groupId','subjectId','randomId','animalNumber','studyAnimalId','sex'
  ]);
  getOrCreateSheet(ss, SHEETS.MEASUREMENTS, ['measurementId','studyId','animalId','day','tumorVolume','bodyWeight','date']);
  getOrCreateSheet(ss, SHEETS.NECROPSY, ['necropsyId','studyId','animalId','tumorWeight','date']);
  getOrCreateSheet(ss, SHEETS.CODES, ['codeType','codeValue','codeLabel','sortOrder']);
  getOrCreateSheet(ss, SHEETS.SUBSTANCES, ['substanceId','substanceName','type','target','moa','note']);
  getOrCreateSheet(ss, SHEETS.COMPETITORS, ['competitorId','companyName','substanceName','indication','source','note']);
  return { success: true };
}

// ---- Utility ----
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] === '' ? null : row[i]; });
    return obj;
  });
}

function findRowIndex(sheet, idField, idValue) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = headers.indexOf(idField);
  if (col === -1) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(idValue)) return i + 1;
  }
  return -1;
}

function objectToRow(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.map(h => obj[h] !== undefined && obj[h] !== null ? obj[h] : '');
}

function upsertRow(sheet, idField, obj) {
  const rowIdx = findRowIndex(sheet, idField, obj[idField]);
  const row = objectToRow(sheet, obj);
  if (rowIdx === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  }
}

function deleteRowsWhere(sheet, field, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = headers.indexOf(field);
  if (col === -1) return;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][col]) === String(value)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Studies ----
function getStudies(filters) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.STUDIES);
  if (!sheet) return [];
  let studies = sheetToObjects(sheet);
  if (filters.classification) studies = studies.filter(s => s.classification === filters.classification);
  if (filters.dataSource) studies = studies.filter(s => s.dataSource === filters.dataSource);
  if (filters.year) studies = studies.filter(s => String(s.year) === String(filters.year));
  if (filters.modelName) studies = studies.filter(s => s.modelName && s.modelName.toLowerCase().includes(filters.modelName.toLowerCase()));
  if (filters.cro) studies = studies.filter(s => s.cro && s.cro.toLowerCase().includes(filters.cro.toLowerCase()));
  return studies;
}

function saveStudy(data) {
  const ss = getSpreadsheet();
  initSheets();
  const sheet = ss.getSheetByName(SHEETS.STUDIES);
  data.updatedAt = new Date().toISOString();
  if (!data.createdAt) data.createdAt = data.updatedAt;
  upsertRow(sheet, 'studyId', data);
  return { success: true, studyId: data.studyId };
}

function deleteStudy(studyId) {
  const ss = getSpreadsheet();
  const studySheet = ss.getSheetByName(SHEETS.STUDIES);
  const groupSheet = ss.getSheetByName(SHEETS.GROUPS);
  const animalSheet = ss.getSheetByName(SHEETS.ANIMALS);
  const measureSheet = ss.getSheetByName(SHEETS.MEASUREMENTS);
  const necropsySheet = ss.getSheetByName(SHEETS.NECROPSY);

  if (studySheet) deleteRowsWhere(studySheet, 'studyId', studyId);
  if (groupSheet) deleteRowsWhere(groupSheet, 'studyId', studyId);
  if (animalSheet) deleteRowsWhere(animalSheet, 'studyId', studyId);
  if (measureSheet) deleteRowsWhere(measureSheet, 'studyId', studyId);
  if (necropsySheet) deleteRowsWhere(necropsySheet, 'studyId', studyId);
  return { success: true };
}

// ---- Groups ----
function saveGroups(studyId, groups) {
  const ss = getSpreadsheet();
  initSheets();
  const sheet = ss.getSheetByName(SHEETS.GROUPS);
  groups.forEach(g => {
    g.studyId = studyId;
    if (Array.isArray(g.measurementDays)) g.measurementDays = JSON.stringify(g.measurementDays);
    upsertRow(sheet, 'groupId', g);
  });
  return { success: true };
}

function deleteGroup(groupId) {
  const ss = getSpreadsheet();
  const groupSheet = ss.getSheetByName(SHEETS.GROUPS);
  const animalSheet = ss.getSheetByName(SHEETS.ANIMALS);
  const measureSheet = ss.getSheetByName(SHEETS.MEASUREMENTS);
  if (groupSheet) deleteRowsWhere(groupSheet, 'groupId', groupId);
  if (animalSheet) deleteRowsWhere(animalSheet, 'groupId', groupId);
  if (measureSheet) {
    // delete measurements for animals in this group
    const animals = sheetToObjects(animalSheet || ss.getSheetByName(SHEETS.ANIMALS));
    const animalIds = animals.filter(a => a.groupId === groupId).map(a => a.animalId);
    animalIds.forEach(aid => deleteRowsWhere(measureSheet, 'animalId', aid));
  }
  return { success: true };
}

// ---- Animals ----
function saveAnimals(studyId, animals) {
  const ss = getSpreadsheet();
  initSheets();
  const sheet = ss.getSheetByName(SHEETS.ANIMALS);
  animals.forEach(a => {
    a.studyId = studyId;
    upsertRow(sheet, 'animalId', a);
  });
  return { success: true };
}

// ---- Measurements ----
function bulkSaveMeasurements(studyId, measurements) {
  const ss = getSpreadsheet();
  initSheets();
  const sheet = ss.getSheetByName(SHEETS.MEASUREMENTS);
  measurements.forEach(m => {
    m.studyId = studyId;
    upsertRow(sheet, 'measurementId', m);
  });
  return { success: true };
}

function bulkSaveNecropsy(studyId, records) {
  const ss = getSpreadsheet();
  initSheets();
  const sheet = ss.getSheetByName(SHEETS.NECROPSY);
  records.forEach(r => {
    r.studyId = studyId;
    upsertRow(sheet, 'necropsyId', r);
  });
  return { success: true };
}

// ---- Full study data for analysis ----
function getStudyData(studyId) {
  const ss = getSpreadsheet();
  const studySheet = ss.getSheetByName(SHEETS.STUDIES);
  const groupSheet = ss.getSheetByName(SHEETS.GROUPS);
  const animalSheet = ss.getSheetByName(SHEETS.ANIMALS);
  const measureSheet = ss.getSheetByName(SHEETS.MEASUREMENTS);
  const necropsySheet = ss.getSheetByName(SHEETS.NECROPSY);

  const studies = studySheet ? sheetToObjects(studySheet) : [];
  const study = studies.find(s => s.studyId === studyId);
  if (!study) return null;

  const allGroups = groupSheet ? sheetToObjects(groupSheet) : [];
  const groups = allGroups.filter(g => g.studyId === studyId).map(g => {
    if (typeof g.measurementDays === 'string') {
      try { g.measurementDays = JSON.parse(g.measurementDays); } catch(e) { g.measurementDays = []; }
    }
    return g;
  });

  const allAnimals = animalSheet ? sheetToObjects(animalSheet) : [];
  const animals = allAnimals.filter(a => a.studyId === studyId);

  const allMeasurements = measureSheet ? sheetToObjects(measureSheet) : [];
  const measurements = allMeasurements.filter(m => m.studyId === studyId);

  const allNecropsy = necropsySheet ? sheetToObjects(necropsySheet) : [];
  const necropsy = allNecropsy.filter(n => n.studyId === studyId);

  return { study, groups, animals, measurements, necropsy };
}

// ---- Substances ----
function getSubstances() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SUBSTANCES);
  return sheet ? sheetToObjects(sheet) : [];
}
function saveSubstance(data) {
  const ss = getSpreadsheet();
  initSheets();
  upsertRow(ss.getSheetByName(SHEETS.SUBSTANCES), 'substanceId', data);
  return { success: true };
}
function deleteSubstance(substanceId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SUBSTANCES);
  if (sheet) deleteRowsWhere(sheet, 'substanceId', substanceId);
  return { success: true };
}

// ---- Competitors ----
function getCompetitors() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.COMPETITORS);
  return sheet ? sheetToObjects(sheet) : [];
}
function saveCompetitor(data) {
  const ss = getSpreadsheet();
  initSheets();
  upsertRow(ss.getSheetByName(SHEETS.COMPETITORS), 'competitorId', data);
  return { success: true };
}
function deleteCompetitor(competitorId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.COMPETITORS);
  if (sheet) deleteRowsWhere(sheet, 'competitorId', competitorId);
  return { success: true };
}

// ---- Codes (lookup values) ----
function getCodes(codeType) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.CODES);
  if (!sheet) return [];
  const all = sheetToObjects(sheet);
  return codeType ? all.filter(c => c.codeType === codeType) : all;
}

function saveCode(data) {
  const ss = getSpreadsheet();
  initSheets();
  const sheet = ss.getSheetByName(SHEETS.CODES);
  upsertRow(sheet, 'codeValue', data);
  return { success: true };
}

function deleteCode(codeType, codeValue) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.CODES);
  if (!sheet) return { success: true };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const typeCol = headers.indexOf('codeType');
  const valCol = headers.indexOf('codeValue');
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][typeCol]) === String(codeType) && String(data[i][valCol]) === String(codeValue)) {
      sheet.deleteRow(i + 1);
    }
  }
  return { success: true };
}

// ---- Export All ----
function exportAll() {
  const ss = getSpreadsheet();
  const result = {};
  Object.values(SHEETS).forEach(name => {
    const sheet = ss.getSheetByName(name);
    result[name] = sheet ? sheetToObjects(sheet) : [];
  });
  return result;
}

// ---- HTTP Handlers ----
function doGet(e) {
  try {
    const p = e.parameter;

    // Handle POST-via-GET (payload param) to avoid CORS preflight
    if (p.payload) {
      const body = JSON.parse(decodeURIComponent(p.payload));
      return handlePost(body.action, body.data);
    }

    let result;
    switch (p.action) {
      case 'init':           result = initSheets(); break;
      case 'getStudies':     result = getStudies(p); break;
      case 'getStudyData':   result = getStudyData(p.studyId); break;
      case 'getCodes':       result = getCodes(p.codeType); break;
      case 'getSubstances':  result = getSubstances(); break;
      case 'getCompetitors': result = getCompetitors(); break;
      case 'exportAll':      result = exportAll(); break;
      default: result = { error: 'Unknown action: ' + p.action };
    }
    return jsonResponse(result);
  } catch(err) {
    return jsonResponse({ error: err.message, stack: err.stack });
  }
}

function handlePost(action, data) {
  let result;
  switch (action) {
    case 'saveStudy':            result = saveStudy(data); break;
    case 'deleteStudy':          result = deleteStudy(data.studyId); break;
    case 'saveGroups':           result = saveGroups(data.studyId, data.groups); break;
    case 'deleteGroup':          result = deleteGroup(data.groupId); break;
    case 'saveAnimals':          result = saveAnimals(data.studyId, data.animals); break;
    case 'bulkSaveMeasurements': result = bulkSaveMeasurements(data.studyId, data.measurements); break;
    case 'bulkSaveNecropsy':     result = bulkSaveNecropsy(data.studyId, data.records); break;
    case 'saveCode':             result = saveCode(data); break;
    case 'deleteCode':           result = deleteCode(data.codeType, data.codeValue); break;
    case 'saveSubstance':        result = saveSubstance(data); break;
    case 'deleteSubstance':      result = deleteSubstance(data.substanceId); break;
    case 'saveCompetitor':       result = saveCompetitor(data); break;
    case 'deleteCompetitor':     result = deleteCompetitor(data.competitorId); break;
    case 'importAll':            result = importAll(data); break;
    default: result = { error: 'Unknown action: ' + action };
  }
  return jsonResponse(result);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return handlePost(body.action, body.data);
  } catch(err) {
    return jsonResponse({ error: err.message, stack: err.stack });
  }
}

function importAll(snapshot) {
  const ss = getSpreadsheet();
  initSheets();
  Object.entries(snapshot).forEach(([sheetName, rows]) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || !rows.length) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    rows.forEach(obj => {
      const row = headers.map(h => obj[h] !== undefined && obj[h] !== null ? obj[h] : '');
      sheet.appendRow(row);
    });
  });
  return { success: true };
}
