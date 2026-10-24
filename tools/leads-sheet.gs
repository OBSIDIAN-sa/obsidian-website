/**
 * Google Apps Script: receives the "Register your interest" form. Every lead is saved to this Google Sheet
 * and emailed to Obsidian. The site posts here directly and shows its own success message; WhatsApp stays
 * on the page as the second way in.
 *
 * Setup (once, from the Google account that should own the leads):
 *   1. Create a Google Sheet → Extensions → Apps Script. Replace the editor contents with this file. Save.
 *   2. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy, allow access.
 *   3. Copy the web app URL (ends in /exec) into window.LEADS.endpoint in assets/js/i18n.js.
 * After editing this script later: Deploy → Manage deployments → edit → Version: New version (the URL stays).
 */
var NOTIFY = 'obsidian.design.2026@gmail.com';
var HEADERS = ['التاريخ', 'الاسم', 'الجوال', 'نوع المشروع', 'ملاحظات', 'لغة الصفحة'];

function doPost(e) {
  var p = (e && e.parameter) || {};
  // Hidden field people never see; a bot that fills it gets an "ok" and nothing is stored
  if (p.website) return reply({ ok: true });
  var name = text(p.name, 120), phone = String(p.phone || '').replace(/[^\d+ ]/g, '').slice(0, 20);
  if (!name || phone.replace(/\D/g, '').length < 9) return reply({ ok: false, error: 'missing' });
  var type = text(p.type, 60), note = text(p.note, 1000), lang = p.lang === 'en' ? 'en' : 'ar';

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    // Cells starting with = + - @ would run as formulas; a leading ' keeps them as text (and keeps the phone's 0)
    sheet.appendRow([new Date(), safe(name), "'" + phone, safe(type), safe(note), lang]);
  } finally {
    lock.releaseLock();
  }

  MailApp.sendEmail({
    to: NOTIFY,
    subject: 'طلب جديد من الموقع: ' + name,
    body: [
      'وصل طلب جديد من نموذج "سجّل اهتمامك" في موقع أوبسيديان.',
      '',
      'الاسم: ' + name,
      'الجوال: ' + phone,
      'نوع المشروع: ' + (type || '—'),
      'ملاحظات: ' + (note || '—'),
      '',
      'واتساب العميل: https://wa.me/' + waNumber(phone),
      'كل الطلبات: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    ].join('\n'),
  });
  return reply({ ok: true });
}

function text(v, max) { return String(v || '').trim().slice(0, max); }
function safe(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function waNumber(phone) {
  var d = phone.replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.indexOf('0') === 0) d = '966' + d.slice(1);
  if (d.indexOf('5') === 0 && d.length === 9) d = '966' + d;
  return d;
}
function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
