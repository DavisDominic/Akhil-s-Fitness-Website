/**
 * Akhil’s Fitness Coaching: lead backup to Google Sheets.
 *
 * Setup (5 minutes, in Akhil's Google account):
 *  1. Create a Google Sheet called "Akhil’s Fitness Coaching Leads".
 *  2. Extensions > Apps Script. Paste this file over the default code and save.
 *  3. Project Settings > Script properties > Add property:  SECRET = <a long random string>
 *     (the same value goes into the site as SHEET_WEBHOOK_SECRET).
 *  4. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy and authorise.
 *  5. Copy the Web app URL. That is SHEET_WEBHOOK_URL for the site.
 *
 * The site sends one POST per lead. A repeated POST for the same lead id is ignored, so retries never duplicate rows.
 * If you change HEADERS after the sheet already has rows, delete the "Leads" tab and let it recreate itself
 * (the header row is written once, on the tab's first ever row) — otherwise old and new columns won't line up.
 */
const SHEET_NAME = 'Leads';
const HEADERS = ['id', 'createdAt', 'type', 'name', 'whatsapp', 'society', 'occupation', 'goal', 'regularTrainingTime', 'source', 'sourceSociety', 'status', 'trialWhen'];

function doPost(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    const body = JSON.parse(e.postData.contents);
    if (!secret || body.secret !== secret) return out_({ ok: false, error: 'unauthorized' });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
      if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
      const last = sh.getLastRow();
      const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().flat() : [];
      if (ids.indexOf(body.row.id) !== -1) return out_({ ok: true, duplicate: true });
      sh.appendRow(HEADERS.map(function (h) { return safe_(body.row[h]); }));
    } finally {
      lock.releaseLock();
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

// Stops spreadsheet formula injection: a value like "=IMPORTXML(...)" is stored as plain text.
function safe_(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
