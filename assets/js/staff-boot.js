/* OBSIDIAN DESIGN — staff page loader. Picks the Arabic or the English edition of the staff script.
   The choice is kept in this browser; the English file is generated from the Arabic one by tools/make-staff-en.py. */
(function () {
  var en = false;
  try { en = localStorage.getItem('obs_lang') === 'en'; } catch (e) {}
  if (en) { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; }
  var s = document.createElement('script');
  s.src = '../assets/js/' + (en ? 'staff.en.js' : 'staff.js') + '?v=19';
  document.body.appendChild(s);
})();
