/**
 * Google Apps Script: keeps a copy of every "Register your interest" lead in a Google Sheet.
 * The site still opens WhatsApp as before; this is the safety net for leads who never press Send there.
 *
 * Setup (once, from the Google account that should own the leads):
 *   1. Open the leads sheet → Extensions → Apps Script. Replace the editor contents with this file. Save.
 *   2. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy, allow access.
 *   3. Copy the web app URL (ends in /exec) into window.LEADS.endpoint in assets/js/i18n.js.
 */
var HEADERS = ['التاريخ', 'الاسم', 'الجوال', 'نوع المشروع', 'ملاحظات', 'لغة الصفحة'];

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  var p = (e && e.parameter) || {};
  // Cap length, and never let a visitor's text run as a spreadsheet formula
  var clip = function (v) { var s = String(v || '').slice(0, 500); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  // A leading ' stops Sheets reading a phone number as a formula or dropping its 0
  sheet.appendRow([new Date(), clip(p.name), "'" + String(p.phone || '').slice(0, 40), clip(p.type), clip(p.note), clip(p.lang)]);
  return ContentService.createTextOutput('ok');
}
