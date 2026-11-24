// Ledger backend — paste into Extensions > Apps Script, then Deploy > Web app
// Execute as: Me · Who has access: Anyone
const TOKEN = 'change-me-to-a-long-random-string';
const CHUNK = 40000;

function doGet(e) {
  if ((e.parameter.token || '') !== TOKEN) return out({error: 'bad token'});
  const sh = sheet('_data');
  const vals = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const txt = vals.map(r => r[0]).join('');
  return ContentService.createTextOutput(txt || '{}').setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  if (p.token !== TOKEN) return out({ok: false, error: 'bad token'});
  const data = JSON.stringify(p.state);
  const sh = sheet('_data');
  sh.clearContents();
  const rows = [];
  for (let i = 0; i < data.length; i += CHUNK) rows.push([data.slice(i, i + CHUNK)]);
  sh.getRange(1, 1, rows.length, 1).setValues(rows);
  write('Accounts', p.accounts);
  write('Transactions', p.txns);
  return out({ok: true});
}

function write(name, rows) {
  const sh = sheet(name);
  sh.clearContents();
  if (rows && rows.length) sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
}
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
