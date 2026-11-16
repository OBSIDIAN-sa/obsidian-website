/* OBSIDIAN DESIGN — staff dashboard. Talks to /api/staff/*. Every customer-supplied string is written with
   textContent, never as HTML. */
(function () {
  'use strict';
  var API = '/api/staff/';
  var app = document.getElementById('app');
  var me = null;
  var users = [];
  var ui = {};
  var busy = false;

  var LEAD_STATUS = { new: 'جديد', contacted: 'تم التواصل', appointment: 'موعد', quoted: 'عرض سعر', won: 'تعاقد', closed: 'مغلق' };
  var APPT_STATUS = { pending: 'بانتظار التأكيد', confirmed: 'مؤكد', done: 'تمت الزيارة', cancelled: 'ملغي', noshow: 'لم يحضر' };
  var TYPES = ['مطبخ', 'خزائن وغرف ملابس', 'حلول داخلية', 'أكثر من واحد', 'أعمال خشب أو رخام أخرى'];
  var ERR = {
    credentials: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
    device_pending: 'هذا الجهاز ينتظر اعتماد رئيس الإدارة. بعد ما يعتمده، سجّل دخولك مرة ثانية.',
    device_rejected: 'هذا الجهاز مرفوض من رئيس الإدارة. تواصل معه.',
    amount: 'اكتب مبلغ صحيح.',
    days: 'عدد الأيام غير صحيح.',
    kind: 'النوع غير صحيح.',
    percent: 'النسبة لازم تكون بين 0 و100.',
    source: 'اشرح مصدر العمولة.',
    file: 'اختر ملف.',
    too_large: 'الملف أكبر من 4 ميجابايت.',
    time: 'وقت الانصراف لازم يكون بعد وقت الحضور.',
    decided: 'هذا الطلب تم البت فيه من قبل.',
    slow_down: 'محاولات كثيرة. جرّب بعد ربع ساعة.',
    setup_key: 'مفتاح الإعداد غير صحيح.',
    already_set_up: 'تم الإعداد من قبل. سجّل دخولك.',
    username: 'اسم المستخدم: من 3 إلى 30 حرفاً إنجليزياً صغيراً أو أرقام.',
    username_taken: 'اسم المستخدم مستخدم من قبل.',
    name: 'اكتب الاسم.',
    phone: 'رقم الجوال غير صحيح. مثال: 05XXXXXXXX',
    password: 'كلمة المرور 8 أحرف على الأقل.',
    admin_only: 'هذا الإجراء للمدير فقط.',
    slot_taken: 'هذا الوقت محجوز لعميل آخر.',
    self: 'ما تقدر تسحب الصلاحية من حسابك أنت.',
    chief_only: 'هذا الإجراء لرئيس الإدارة فقط.',
    location_required: 'لازم تسمح للصفحة تعرف موقعك عشان ينسجل الحضور.',
    location_weak: 'إشارة الموقع ضعيفة. شغّل الـ GPS وجرّب مرة ثانية.',
    place: 'الإحداثيات غير صحيحة.',
    radius: 'المسافة المسموحة لازم تكون بين 30 و2000 متر.',
    role: 'الصلاحية غير صحيحة.',
    read_only: 'صلاحيتك للاطلاع فقط.',
    has_attendance: 'هذا الموظف له حضور مسجّل في هذا اليوم. احذف سجل الحضور أول.',
    date: 'التاريخ غير صحيح.',
    login_required: 'انتهت الجلسة. سجّل دخولك من جديد.',
    not_configured: 'قاعدة البيانات غير مربوطة بعد.',
    staff: 'الموظف غير موجود أو حسابه موقوف.',
    title: 'اكتب عنوان المهمة.',
    body: 'اكتب النص.',
    customer_exists: 'هذا الرقم مسجّل لعميل من قبل.',
  };
  var errText = function (code) { return ERR[code] || 'صار خطأ. جرّب مرة ثانية.'; };

  /* ------------------------------------------------------------ helpers */
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function api(method, path, payload) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (payload) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(payload); }
    return fetch(API + path, opt)
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'server' }; }); })
      .then(function (res) {
        if (!res.ok && res.error === 'login_required' && me) { me = null; gate(false, errText('login_required')); throw new Error('login'); }
        return res;
      });
  }
  function field(label, input, hint) {
    var f = h('div', 'field');
    var id = 'f' + Math.random().toString(36).slice(2, 8);
    var l = h('label', null, label);
    l.htmlFor = id; input.id = id;
    add(f, l, input, hint ? h('p', 'hint', hint) : null);
    return f;
  }
  function input(type, attrs) {
    var i = h(type === 'textarea' ? 'textarea' : 'input', 'input');
    if (type !== 'textarea') i.type = type;
    for (var k in attrs || {}) i[k] = attrs[k];
    return i;
  }
  function select(options, value) {
    var s = h('select', 'input');
    Object.keys(options).forEach(function (k) { var o = h('option', null, options[k]); o.value = k; s.appendChild(o); });
    if (value != null) s.value = value;
    return s;
  }
  function fmtDate(iso) {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso)); }
    catch (e) { return iso.slice(0, 10); }
  }
  function fmtDay(dateStr) {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(dateStr + 'T00:00:00Z')); }
    catch (e) { return dateStr; }
  }
  function fmtTime(hhmm) { var x = +hhmm.slice(0, 2); return ((x + 11) % 12 + 1) + ':' + hhmm.slice(3) + ' ' + (x < 12 ? 'ص' : 'م'); }
  function wa(phone, text) { return 'https://wa.me/966' + String(phone).slice(1) + (text ? '?text=' + encodeURIComponent(text) : ''); }
  function link(label, href) { var a = h('a', null, label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function phoneRow(phone, waText) {
    var row = h('div', 'card__row');
    var tel = h('a', 'ltr', phone); tel.href = 'tel:' + phone;
    return add(row, tel, link('واتساب', wa(phone, waText)));
  }

  /* ------------------------------------------------------------ sign in / setup */
  function gate(setup, message) {
    app.textContent = '';
    var wrap = h('div', 'gate');
    var card = h('form', 'gate__card');
    card.noValidate = true;
    var logo = h('img', 'gate__logo'); logo.src = '../assets/img/logo-160.png'; logo.alt = ''; logo.width = 64; logo.height = 64;
    var err = h('p', 'err', message || ''); err.setAttribute('role', 'alert');
    var user = input('text', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false, dir: 'ltr', required: true });
    var pass = input('password', { autocomplete: setup ? 'new-password' : 'current-password', dir: 'ltr', required: true });
    var name = setup ? input('text', { autocomplete: 'name', required: true }) : null;
    var key = setup ? input('password', { autocomplete: 'off', dir: 'ltr', required: true }) : null;
    var btn = h('button', 'btn', setup ? 'إنشاء حساب المدير' : 'دخول'); btn.type = 'submit';
    add(card, logo, h('h1', 'gate__title', 'بوابة فريق أوبسيديان'),
      h('p', 'gate__sub', setup ? 'أول مرة: أنشئ حساب المدير.' : 'سجّل دخولك للمتابعة.'),
      setup ? field('مفتاح الإعداد', key, 'المفتاح اللي تم ضبطه في Cloudflare باسم SETUP_KEY.') : null,
      setup ? field('الاسم', name) : null,
      field('اسم المستخدم', user, setup ? 'أحرف إنجليزية صغيرة وأرقام، مثل: ali' : null),
      field('كلمة المرور', pass, setup ? '8 أحرف على الأقل.' : null),
      err, btn);
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = '';
      btn.disabled = true;
      var payload = { username: user.value.trim(), password: pass.value };
      if (setup) { payload.name = name.value.trim(); payload.key = key.value; }
      api('POST', setup ? 'setup' : 'login', payload).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); return; }
        boot();
      }).catch(function () { btn.disabled = false; err.textContent = errText(); });
    });
    add(app, add(wrap, card));
    app.setAttribute('aria-busy', 'false');
    (setup ? key : user).focus();
  }

  /* ------------------------------------------------------------ dashboard shell */
  var seq = 0;            // every navigation gets a number; late answers from an older page are dropped
  var PAGES = {};
  var NAV_ALL = [['home', 'الرئيسية'], ['leads', 'الطلبات'], ['customers', 'العملاء'], ['tasks', 'المهام'], ['appts', 'المواعيد'], ['att', 'الحضور'], ['team', 'الفريق']];
  var NAV = [];
  var TASK_STATUS = { todo: 'لم تبدأ', doing: 'جارية', done: 'منجزة' };
  var NOTE_KIND = { general: 'ملاحظة', task: 'مهمة جديدة', vip: 'عميل مميز' };
  var JOBS = { chief: 'رئيس الإدارة', management: 'إدارة', showroom_manager: 'مدير معرض', accountant: 'محاسب مالي', designer: 'مصمم', employee: 'موظف' };
  function jobOf(u) { return u.job && JOBS[u.job] ? u.job : (u.role === 'admin' ? 'chief' : 'employee'); }
  function jobName(u) { return JOBS[jobOf(u)]; }
  var ROLES = { staff: 'موظف: يشوف ما يخصه', viewer: 'إداري: يشوف بدون تعديل وبدون أرقام العملاء', finance: 'محاسب: أرقام المعرض وتقرير حضور الكل', admin: 'مدير: يشوف كل شي' };
  var ROLE_SHORT = { staff: 'موظف', viewer: 'إداري', finance: 'محاسب', admin: 'مدير' };
  // the viewer permission reads only: no adding or changing customers, requests or appointments
  function canEdit() { return !!me && me.role !== 'viewer'; }
  // a customer's number with call and WhatsApp links; plain text when the number arrives masked
  function contact(phone, text) {
    var ph = h('span', 'phones');
    if (/•/.test(phone)) return add(ph, h('span', 'ltr', phone));
    var tel = h('a', 'ltr', phone); tel.href = 'tel:' + phone;
    return add(ph, tel, link('واتساب', wa(phone, text)));
  }
  // the permission each title usually goes with; picked for you when the title changes, and you can change it
  function roleFor(job) { return job === 'chief' || job === 'management' ? 'admin' : job === 'accountant' ? 'finance' : 'staff'; }
  // title and permission side by side: the permission follows the title until it is changed by hand, and is fixed for the head of management
  function linkRole(job, role) {
    var sync = function () { role.disabled = job.value === 'chief'; if (role.disabled) role.value = 'admin'; };
    job.addEventListener('change', function () { role.value = roleFor(job.value); sync(); });
    sync();
  }
  function isChief(u) { return jobOf(u) === 'chief'; }
  function isAdmin() { return me && me.role === 'admin'; }
  // deleting, managing members, the activity log, the attendance place and marking others belong to the head of management alone
  function iAmChief() { return !!me && isChief(me); }
  var ICON = {
    home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
    leads: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
    appts: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    att: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5 6-5s6 2 6 5M17 11a2.5 2.5 0 1 0 0-5M17 15c2.5.3 4 2 4 5',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c0-4 3-6 7-6s7 2 7 6',
    customers: 'M4 5h16v14H4zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 16c0-2 1.2-3 3-3s3 1 3 3M14 9h4M14 13h4',
    tasks: 'M4 6l2 2 3-3M4 13l2 2 3-3M4 20l2 2 3-3M12 7h8M12 14h8M12 21h8',
  };
  function icon(name) {
    var s = h('span', 'ico');
    s.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25"><path d="' + ICON[name] + '"/></svg>';
    return s;
  }
  function noop() {}
  function live(t) { return t === seq; }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function logout() { api('POST', 'logout', {}).then(function () { me = null; location.hash = ''; gate(false); }).catch(noop); }
  function toast(text) {
    ui.toast.textContent = text; ui.toast.classList.add('is-on');
    clearTimeout(ui.tt); ui.tt = setTimeout(function () { ui.toast.classList.remove('is-on'); }, 3500);
  }
  function oops(res) { toast(errText(res && res.error)); }
  function setTitle(text) { ui.title.textContent = text; document.title = text + ' · فريق أوبسيديان'; }
  function empty(text) { return h('p', 'empty', text); }
  // Delete control: the first press asks, the second deletes
  function delBtn(label, cls, run) {
    var b = h('button', cls, label); b.type = 'button';
    var armed = false, timer;
    b.addEventListener('click', function () {
      if (!armed) { armed = true; b.textContent = 'تأكيد الحذف؟'; b.dataset.armed = '1'; timer = setTimeout(function () { armed = false; b.textContent = label; delete b.dataset.armed; }, 5000); return; }
      clearTimeout(timer); b.disabled = true; run();
    });
    return b;
  }
  // A list row with its own delete control beside it (head of management only)
  function rowLine(row, btn) { var w = h('div', 'rowline'); add(w, row, btn || h('span', 'rowline__gap')); return w; }
  function del(path, done, after) { api('DELETE', path).then(function (r) { if (!r.ok) return oops(r); toast(done); after(); }).catch(noop); }
  function hlink(cls, text, href) { var a = h('a', cls, text); a.href = href; return a; }
  function panel(title, moreLabel, moreHref) {
    var p = h('section', 'panel');
    var head = h('div', 'panel__head');
    add(head, h('h2', null, title), moreLabel ? hlink('panel__more', moreLabel, moreHref) : null);
    p.appendChild(head);
    return p;
  }
  function tabs(items, active, base) {
    var n = h('nav', 'tabs'); n.setAttribute('aria-label', 'تصفية');
    items.forEach(function (it) {
      var a = hlink('tab', it[1], '#' + base + '/' + it[0]);
      if (it[0] === active) a.setAttribute('aria-current', 'page');
      n.appendChild(a);
    });
    return n;
  }
  // GET for the current page: shows a loading line, drops the answer if the user already moved on
  function fetchPage(t, paths) {
    var l = h('p', 'loading', 'جارٍ التحميل…'); ui.body.appendChild(l);
    return Promise.all(paths.map(function (p) { return api('GET', p); })).then(function (all) {
      if (!live(t)) throw new Error('stale');
      l.remove();
      if (!all[0].ok) { ui.body.appendChild(empty(errText(all[0].error))); throw new Error('failed'); }
      return all;
    });
  }

  function shell() {
    app.textContent = '';
    var s = h('div', 'shell');

    var side = h('aside', 'side');
    var brand = h('div', 'side__brand');
    var logo = h('img'); logo.src = '../assets/img/logo-160.png'; logo.alt = ''; logo.width = 40; logo.height = 40;
    var bt = h('div'); add(bt, h('b', null, 'أوبسيديان ديزاين'), h('span', null, 'بوابة الفريق'));
    add(brand, logo, bt);
    var nav = h('nav', 'nav'); nav.setAttribute('aria-label', 'الأقسام');
    ui.nav = {};
    NAV = NAV_ALL.filter(function (it) { return it[0] !== 'team' || isAdmin(); });
    document.body.dataset.role = me.role;
    NAV.forEach(function (it) {
      var a = hlink('nav__item', null, '#' + it[0]);
      add(a, icon(it[0]), h('span', null, it[1]));
      ui.nav[it[0]] = a; nav.appendChild(a);
    });
    var foot = h('div', 'side__foot');
    var who = h('div', 'side__who'); add(who, h('b', null, me.name), h('span', null, jobName(me)));
    var out = h('button', 'btn btn--sm', 'خروج'); out.type = 'button'; out.addEventListener('click', logout);
    add(foot, who, out);
    add(side, brand, nav, foot);

    var main = h('div', 'main');
    var top = h('header', 'top');
    ui.title = h('h1', 'top__title');
    var sf = h('form', 'search'); sf.noValidate = true; sf.setAttribute('role', 'search');
    var si = h('input'); si.type = 'search'; si.maxLength = 80; si.autocomplete = 'off';
    si.placeholder = 'بحث: اسم، جوال، أو رقم طلب';
    si.setAttribute('aria-label', si.placeholder);
    var sb = h('button', null, 'بحث'); sb.type = 'submit';
    sf.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = toLatinDigits(si.value).trim(); if (!q) return;
      si.value = '';
      if (/^#\s*\d{1,6}$/.test(q) || /^\d{1,3}$/.test(q)) return go('#lead/' + q.replace(/\D/g, ''));
      go('#leads/q/' + encodeURIComponent(q));
    });
    add(sf, si, sb);
    var acc = hlink('top__me', null, '#account'); add(acc, icon('account'), h('span', null, me.name.split(' ')[0]));
    add(top, ui.title, sf, acc);
    ui.body = h('div', 'body');
    ui.toast = h('div', 'toast'); ui.toast.setAttribute('role', 'status');
    add(main, top, ui.body);

    add(app, add(s, side, main), ui.toast);
    app.setAttribute('aria-busy', 'false');
    route();
  }

  function route() {
    if (!me || !ui.body) return;
    var hash = location.hash || '#home';
    var parts = hash.replace(/^#/, '').split('/');
    var page = PAGES[parts[0]] ? parts[0] : 'home';
    var t = ++seq;
    if (page === 'team' && !isAdmin()) page = 'home';
    var section = page === 'lead' ? 'leads' : page === 'customer' ? 'customers' : page === 'member' ? 'team' : page;
    NAV.forEach(function (it) {
      if (it[0] === section) ui.nav[it[0]].setAttribute('aria-current', 'page'); else ui.nav[it[0]].removeAttribute('aria-current');
    });
    ui.from = ui.here; ui.here = hash;
    ui.body.textContent = '';
    window.scrollTo(0, 0);
    PAGES[page](parts.slice(1), t);
  }
  window.addEventListener('hashchange', route);

  /* ------------------------------------------------------------ home */
  PAGES.home = function (_, t) {
    setTitle('الرئيسية');
    fetchPage(t, ['summary', 'attendance', 'appointments?range=today', 'leads?status=new', 'announcements', 'tasks']).then(function (all) {
      var s = all[0].summary, att = all[1], ap = all[2], nl = all[3], an = all[4], tk = all[5];
      ui.body.appendChild(h('p', 'hello', 'هلا ' + me.name.split(' ')[0] + (att.ok ? ' — ' + fmtDay(att.today) : '')));

      var grid = h('div', 'stats' + (s.member ? ' stats--4' : ''));
      function stat(n, label, href, tone) { var a = hlink('stat', null, href); a.dataset.tone = tone; add(a, h('b', null, String(n)), h('span', null, label)); grid.appendChild(a); }
      if (s.member) {
        stat(s.my_tasks, 'مهامي المفتوحة', '#tasks/mine', 'amber');
        stat(s.my_leads, 'طلبات مسندة لي', '#leads/mine', 'blue');
        stat(s.new_leads, 'طلبات جديدة', '#leads/new', 'green');
        stat(s.today_appointments, 'مواعيد اليوم', '#appts/today', 'purple');
      } else {
        stat(s.counts.new, 'طلبات جديدة', '#leads/new', 'green');
        stat(s.total - s.counts.won - s.counts.closed, 'طلبات مفتوحة', '#leads/open', 'blue');
        stat(s.today_appointments, 'مواعيد اليوم', '#appts/today', 'purple');
        stat(s.upcoming_appointments, 'مواعيد قادمة', '#appts/upcoming', 'teal');
        stat(s.pending_appointments, 'بانتظار التأكيد', '#appts/upcoming', 'amber');
        stat(s.week, 'طلبات آخر 7 أيام', '#leads/all', 'rose');
      }
      ui.body.appendChild(grid);
      if (iAmChief()) api('GET', 'inbox').then(function (ib) {
        if (!live(t) || !ib.ok || !(ib.requests + ib.devices)) return;
        var w = h('section', 'panel panel--alert');
        add(w, h('h2', null, 'ينتظر قرارك'), add(h('div', 'quick'),
          ib.requests ? hlink('btn btn--sm btn--solid', 'طلبات الموظفين: ' + ib.requests, '#team/requests') : null,
          ib.devices ? hlink('btn btn--sm btn--solid', 'أجهزة تنتظر الاعتماد: ' + ib.devices, '#team/devices') : null));
        ui.body.insertBefore(w, grid.nextSibling);
      }).catch(noop);
      ui.body.appendChild(notesPanel(an.ok ? an.announcements : []));

      var cols = h('div', 'cols cols--home');
      var a1 = h('div', 'col'), a2 = h('div', 'col');

      var pt = panel('مهامي', 'كل المهام', '#tasks/mine');
      if (tk.ok && tk.tasks.length) { var rt = h('div', 'rows'); tk.tasks.slice(0, 5).forEach(function (x) { rt.appendChild(taskRow(x, tk.today, function () { go('#home'); }, false)); }); pt.appendChild(rt); }
      else pt.appendChild(empty('ما عندك مهام مفتوحة.'));

      var pa = panel('مواعيد اليوم', 'كل المواعيد', '#appts/week');
      if (ap.ok && ap.appointments.length) { var ra = h('div', 'rows'); ap.appointments.forEach(function (a) { ra.appendChild(apptRow(a)); }); pa.appendChild(ra); }
      else pa.appendChild(empty('لا توجد مواعيد اليوم.'));

      var pl = panel('طلبات جديدة تنتظر التواصل', 'كل الطلبات', '#leads/open');
      if (nl.ok && nl.leads.length) { var rl = h('div', 'rows'); nl.leads.slice(0, 6).forEach(function (l) { rl.appendChild(leadRow(l)); }); pl.appendChild(rl); }
      else pl.appendChild(empty('لا توجد طلبات جديدة.'));
      add(a1, pt, pa, pl);

      if (att.ok) a2.appendChild(punchPanel(att, function () { go('#home'); }));
      var quick = panel('إجراءات سريعة');
      var qr = h('div', 'quick');
      add(qr, canEdit() ? hlink('btn btn--sm', 'طلب جديد', '#leads/add') : null, canEdit() ? hlink('btn btn--sm', 'عميل جديد', '#customers/add') : null, hlink('btn btn--sm', 'مهمة جديدة', '#tasks/mine'), hlink('btn btn--sm', 'طلب للإدارة', '#account/requests'), hlink('btn btn--sm', 'ملفي', '#account/money'),
        iAmChief() || me.role === 'finance' ? hlink('btn btn--sm', 'الرواتب والمستحقات', '#payroll') : null);
      a2.appendChild(add(quick, qr));
      if (isAdmin()) a2.appendChild(askPanel());
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  // Team notes: anyone writes one and everyone sees it. The manager can mark a note as a new task or a special customer.
  function notesPanel(list) {
    var p = panel('ملاحظات الفريق');
    p.classList.add('panel--notes');
    if (!list.length) p.appendChild(empty('ما فيه ملاحظات. اكتب ملاحظة تطلع لكل الفريق.'));
    else {
      var box = h('div', 'memos');
      list.forEach(function (n) {
        var m = h('article', 'memo'); m.dataset.kind = n.kind; if (n.author_role === 'admin') m.dataset.from = 'admin';
        var head = h('div', 'memo__head');
        add(head, h('span', 'tag', n.kind !== 'general' ? NOTE_KIND[n.kind] : n.author_role === 'admin' ? 'من الإدارة' : 'ملاحظة'), h('span', 'row__meta', (n.author || '') + ' · ' + fmtDate(n.created_at)));
        if (iAmChief() || n.created_by === me.id) {
          head.appendChild(delBtn('حذف', 'link', function () { del('announcements/' + n.id, 'تم حذف الملاحظة.', function () { go('#home'); }); }));
        }
        add(m, head, h('p', 'memo__body', n.body));
        box.appendChild(m);
      });
      p.appendChild(box);
    }
    var f = h('form', 'inline inline--wrap'); f.noValidate = true;
    var kind = select(NOTE_KIND, 'general'); kind.setAttribute('aria-label', 'نوع الملاحظة');
    var txt = input('text', { maxLength: 600, placeholder: 'اكتب ملاحظة عن عميل أو موضوع، يشوفها الكل…' }); txt.setAttribute('aria-label', 'نص الملاحظة');
    var b = h('button', 'btn btn--sm btn--solid', 'نشر'); b.type = 'submit';
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = txt.value.trim(); if (!v || b.disabled) return;
      b.disabled = true;
      api('POST', 'announcements', { kind: kind.value, body: v }).then(function (r) { b.disabled = false; if (!r.ok) return oops(r); toast('تم نشر الملاحظة.'); go('#home'); }).catch(function () { b.disabled = false; });
    });
    if (canEdit()) p.appendChild(add(f, isAdmin() ? kind : null, txt, b));
    return p;
  }

  function askPanel() {
    var p = panel('اسأل المساعد');
    p.appendChild(h('p', 'panel__hint', 'سؤال عن الطلبات والمواعيد، مثل: كم طلب مطبخ هذا الأسبوع؟'));
    var f = h('form', 'inline'); f.noValidate = true;
    var q = input('text', { maxLength: 500, autocomplete: 'off', placeholder: 'اكتب سؤالك…' }); q.setAttribute('aria-label', 'سؤال للمساعد');
    var b = h('button', 'btn btn--sm', 'اسأل'); b.type = 'submit';
    var ans = h('p', 'answer'); ans.setAttribute('aria-live', 'polite');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = q.value.trim(); if (!v || b.disabled) return;
      b.disabled = true; ans.textContent = 'لحظة…';
      api('POST', 'ask', { question: v }).then(function (res) {
        b.disabled = false;
        ans.textContent = res.ok && res.reply ? res.reply : 'المساعد غير متاح الآن (ممكن خلص حد اليوم). استخدم البحث فوق أو صفحة الطلبات.';
      }).catch(function () { b.disabled = false; ans.textContent = ''; });
    });
    add(f, q, b);
    return add(p, f, ans);
  }

  /* ------------------------------------------------------------ leads */
  function leadRow(l) {
    var a = hlink('row row--lead', null, '#lead/' + l.id);
    var badge = h('span', 'badge', LEAD_STATUS[l.status] || l.status); badge.dataset.s = l.status;
    add(a, h('span', 'row__id', '#' + l.id), h('span', 'row__name', l.name), h('span', 'row__type', l.type || 'بدون نوع'),
      h('span', 'row__meta', fmtDate(l.created_at) + (l.assigned_name ? ' · ' + l.assigned_name : '')), badge);
    return a;
  }

  PAGES.leads = function (args, t) {
    var tab = args[0] || 'new';
    var q = '';
    if (tab === 'q') { try { q = decodeURIComponent(args.slice(1).join('/')); } catch (e) { q = ''; } }
    setTitle('الطلبات');
    var bar = h('div', 'toolbar');
    var addBtn = canEdit() ? hlink('btn btn--sm btn--solid', 'إضافة طلب', '#leads/add') : null;
    if (!canEdit() && tab === 'add') tab = 'new';
    add(bar, tabs([['new', 'جديدة'], ['open', 'مفتوحة'], ['mine', 'طلباتي'], ['all', 'الكل']], tab, 'leads'), addBtn);
    ui.body.appendChild(bar);
    if (tab === 'add') return ui.body.appendChild(leadForm());
    var path = { new: 'leads?status=new', open: 'leads?status=open', mine: 'leads?mine=1', all: 'leads' }[tab];
    if (tab === 'q') path = 'leads?q=' + encodeURIComponent(q);
    if (!path) path = 'leads?status=new';
    fetchPage(t, [path]).then(function (all) {
      var leads = all[0].leads;
      var title = tab === 'q' ? 'نتائج البحث عن «' + q + '»' : { new: 'الطلبات الجديدة', open: 'الطلبات المفتوحة', mine: 'الطلبات المسندة لك', all: 'كل الطلبات' }[tab] || 'الطلبات الجديدة';
      var p = panel(title + ' (' + leads.length + ')');
      if (!leads.length) p.appendChild(empty(tab === 'q' ? 'ما فيه طلب يطابق البحث.' : 'لا يوجد.'));
      else {
        var head = h('div', 'row row--lead row--head'); head.setAttribute('aria-hidden', 'true');
        add(head, h('span', null, 'الرقم'), h('span', null, 'العميل'), h('span', null, 'النوع'), h('span', null, 'التاريخ والمسؤول'), h('span', null, 'الحالة'));
        var rows = h('div', 'rows');
        var chief = iAmChief();
        rows.appendChild(chief ? rowLine(head) : head);
        leads.forEach(function (l) {
          rows.appendChild(chief ? rowLine(leadRow(l), delBtn('حذف', 'link', function () { del('leads/' + l.id, 'تم حذف الطلب #' + l.id + '.', route); })) : leadRow(l));
        });
        p.appendChild(rows);
        p.appendChild(exportBar(title, ['الرقم', 'العميل', 'الجوال', 'نوع المشروع', 'الحالة', 'المسؤول', 'التاريخ'], function () { return leads.map(function (l) { return [l.id, l.name, l.phone || '', l.type || '', LEAD_STATUS[l.status] || l.status, l.assigned_name || '', l.created_at.slice(0, 10)]; }); }));
      }
      ui.body.appendChild(p);
    }).catch(noop);
  };

  function leadForm() {
    var p = panel('طلب جديد (عميل حضر أو اتصل)');
    var f = h('form', 'form'); f.noValidate = true;
    var name = input('text', { required: true });
    var phone = input('tel', { dir: 'ltr', inputMode: 'tel', required: true });
    var typeOpts = { '': 'اختر نوع المشروع' }; TYPES.forEach(function (x) { typeOpts[x] = x; });
    var type = select(typeOpts, '');
    var note = input('textarea', { maxLength: 600 });
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--solid', 'حفظ الطلب'); btn.type = 'submit';
    var two = h('div', 'form__two'); add(two, field('الاسم', name), field('رقم الجوال', phone));
    add(f, two, field('نوع المشروع', type), field('ملاحظات', note), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      api('POST', 'leads', { name: name.value.trim(), phone: phone.value.trim(), type: type.value, note: note.value.trim() }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); return; }
        toast('تم حفظ الطلب #' + res.lead.id + '.');
        go('#lead/' + res.lead.id);
      }).catch(function () { btn.disabled = false; });
    });
    p.appendChild(f);
    setTimeout(function () { name.focus(); }, 0);
    return p;
  }

  PAGES.lead = function (args, t) {
    var id = +args[0] || 0;
    setTitle('الطلب #' + id);
    var back = ui.from && /^#(leads|appts|home)/.test(ui.from) ? ui.from : '#leads/open';
    ui.body.appendChild(hlink('back', 'رجوع', back));
    var l0 = h('p', 'loading', 'جارٍ التحميل…'); ui.body.appendChild(l0);
    api('GET', 'leads/' + id).then(function (res) {
      if (!live(t)) return;
      l0.remove();
      if (!res.ok) return ui.body.appendChild(empty('ما لقيت طلب بالرقم #' + id + '.'));
      var l = res.lead;
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');

      var p = h('section', 'panel');
      var top = h('div', 'lead__top');
      var badge = h('span', 'badge', LEAD_STATUS[l.status] || l.status); badge.dataset.s = l.status;
      add(top, h('h2', 'lead__name', l.name), badge);
      var facts = h('dl', 'facts');
      function fact(k, v) { var d = h('div'); add(d, h('dt', null, k), typeof v === 'string' ? h('dd', null, v) : add(h('dd'), v)); facts.appendChild(d); }
      var ph = contact(l.phone, 'مرحباً ' + l.name + '، معك أوبسيديان ديزاين بخصوص طلبك.');
      fact('الجوال', ph);
      fact('نوع المشروع', l.type || 'بدون نوع');
      fact('تاريخ الطلب', fmtDate(l.created_at));
      fact('المصدر', l.source === 'staff' ? 'أضافه الفريق' : 'من الموقع');
      add(p, top, facts);
      if (l.note) { p.appendChild(h('h3', 'sub', 'ملاحظة العميل')); p.appendChild(h('p', 'note', l.note)); }

      var ctl = h('div', 'form__two');
      var st = select(LEAD_STATUS, l.status); st.disabled = !canEdit();
      st.addEventListener('change', function () {
        api('PATCH', 'leads/' + l.id, { status: st.value }).then(function (r) {
          if (!r.ok) { st.value = l.status; return oops(r); }
          l.status = st.value; badge.textContent = LEAD_STATUS[st.value]; badge.dataset.s = st.value; toast('تم تحديث الحالة.');
        }).catch(noop);
      });
      var opts = { '': 'غير مسند' };
      users.filter(function (u) { return u.active || u.id === l.assigned_to; }).forEach(function (u) { opts[u.id] = u.name; });
      var as = select(opts, l.assigned_to == null ? '' : String(l.assigned_to));
      as.addEventListener('change', function () {
        api('PATCH', 'leads/' + l.id, { assigned_to: as.value === '' ? null : +as.value }).then(function (r) { if (!r.ok) return oops(r); toast('تم تحديث المسؤول.'); }).catch(noop);
      });
      if (!canEdit()) { var w0 = h('div', 'field'); add(w0, h('label', null, 'المسؤول'), h('p', 'who', l.assigned_name || 'غير مسند')); add(ctl, field('الحالة', st), w0); }
      else if (isAdmin()) add(ctl, field('الحالة', st), field('المسؤول', as));
      else {
        var mineNow = l.assigned_to === me.id;
        var take = h('button', 'btn btn--sm', 'استلام الطلب'); take.type = 'button';
        take.addEventListener('click', function () {
          api('PATCH', 'leads/' + l.id, { assigned_to: me.id }).then(function (r) { if (!r.ok) return oops(r); toast('الطلب صار مسند لك.'); go('#lead/' + l.id); }).catch(noop);
        });
        var who = h('div', 'field'); add(who, h('label', null, 'المسؤول'), h('p', 'who', l.assigned_name || 'غير مسند'), mineNow ? null : take);
        add(ctl, field('الحالة', st), who);
      }
      p.appendChild(ctl);
      var reg = h('button', 'btn btn--sm', 'تسجيل في العملاء'); reg.type = 'button';
      reg.addEventListener('click', function () {
        api('POST', 'customers', { name: l.name, phone: l.phone, type: l.type || '', lead_id: l.id }).then(function (r) {
          if (r.ok) { toast('تم تسجيل العميل.'); return go('#customer/' + r.id); }
          if (r.error === 'customer_exists' && r.id) return go('#customer/' + r.id);
          oops(r);
        }).catch(noop);
      });
      if (canEdit()) p.appendChild(add(h('div', 'quick'), reg));
      a1.appendChild(p);

      var pa = panel('مواعيد العميل');
      if (l.appointments && l.appointments.length) {
        var ra = h('div', 'rows');
        l.appointments.forEach(function (a) {
          var r = h('div', 'row row--plain'); var b = h('span', 'badge', APPT_STATUS[a.status] || a.status); b.dataset.s = a.status;
          add(r, h('span', 'row__name', fmtDay(a.date)), h('span', 'row__id', fmtTime(a.time)), b,
            iAmChief() ? delBtn('حذف', 'link', function () { del('appointments/' + a.id, 'تم حذف الموعد.', function () { go('#lead/' + l.id); }); }) : null); ra.appendChild(r);
        });
        pa.appendChild(ra);
      } else pa.appendChild(empty('لا يوجد موعد محجوز.'));
      a1.appendChild(pa);

      var pn = panel('ملاحظات الفريق');
      var ul = h('ul', 'notes');
      function renderNotes(notes) {
        ul.textContent = '';
        if (!notes.length) ul.appendChild(h('li', 'empty', 'لا توجد ملاحظات بعد.'));
        notes.forEach(function (n) {
          var li = h('li', null, n.body); var sm = h('small', null, (n.staff_name || '—') + ' · ' + fmtDate(n.created_at));
          if (iAmChief() || n.staff_id === me.id) sm.appendChild(delBtn('حذف', 'link', function () { del('leads/' + l.id + '/notes/' + n.id, 'تم حذف الملاحظة.', function () { go('#lead/' + l.id); }); }));
          li.appendChild(sm); ul.appendChild(li);
        });
      }
      renderNotes(l.notes || []);
      var nf = h('form', 'form'); nf.noValidate = true;
      var ni = input('textarea', { maxLength: 800, placeholder: 'اكتب ملاحظة…' }); ni.setAttribute('aria-label', 'ملاحظة جديدة');
      var nb = h('button', 'btn btn--sm', 'حفظ الملاحظة'); nb.type = 'submit';
      nf.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = ni.value.trim(); if (!v || nb.disabled) return;
        nb.disabled = true;
        api('POST', 'leads/' + l.id + '/notes', { body: v }).then(function (r) {
          nb.disabled = false;
          if (!r.ok) return oops(r);
          ni.value = ''; renderNotes(r.lead.notes);
        }).catch(function () { nb.disabled = false; });
      });
      add(nf, ni, nb);
      add(pn, ul, nf);
      if (canEdit()) a2.appendChild(pn);
      else a2.appendChild(add(panel('للاطلاع فقط'), h('p', 'panel__hint', 'صلاحيتك تعرض الطلب بدون رقم العميل كامل وبدون الملاحظات، وما تقدر تعدل عليه.')));
      if (iAmChief()) {
        var pd = panel('حذف الطلب');
        a2.appendChild(add(pd, h('p', 'panel__hint', 'ينحذف الطلب عند الجميع، مع ملاحظاته ومواعيده.'),
          delBtn('حذف الطلب', 'btn btn--sm btn--danger', function () { del('leads/' + l.id, 'تم حذف الطلب.', function () { go('#leads/open'); }); })));
      }
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  /* ------------------------------------------------------------ customers */
  function star(c) { return c.vip ? h('span', 'star', '★ مميز') : null; }
  function customerRow(c) {
    var a = hlink('row row--cust', null, '#customer/' + c.id);
    var name = h('span', 'row__name', c.name);
    var tel = h('span', 'row__id ltr', c.phone);
    var sb = h('span', 'badge', STAGES[c.stage] || STAGES.new); sb.dataset.s = { new: 'new', contract: 'pending', design: 'appointment', manufacturing: 'contacted', installation: 'contacted', delivery: 'won', done: 'closed' }[c.stage] || 'new';
    add(a, add(h('span', 'row__who'), name, star(c)), tel, h('span', 'row__type', c.city || '—'), h('span', 'row__type', c.type || '—'), sb);
    return a;
  }
  function customerForm(c, onSaved) {
    var f = h('form', 'form'); f.noValidate = true;
    c = c || {};
    var name = input('text', { required: true, value: c.name || '' });
    var phone = input('tel', { dir: 'ltr', inputMode: 'tel', required: true, value: c.phone || '' });
    var city = input('text', { value: c.city || '', maxLength: 60 });
    var typeOpts = { '': 'بدون تحديد' }; TYPES.forEach(function (x) { typeOpts[x] = x; });
    if (c.type && !typeOpts[c.type]) typeOpts[c.type] = c.type;
    var type = select(typeOpts, c.type || '');
    var address = input('text', { value: c.address || '', maxLength: 200 });
    var note = input('textarea', { maxLength: 800 }); note.value = c.note || '';
    var vip = h('input'); vip.type = 'checkbox'; vip.checked = !!c.vip;
    var vl = h('label', 'check'); add(vl, vip, h('span', null, 'عميل مميز'));
    var stage = select(STAGES, STAGES[c.stage] ? c.stage : 'new');
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--solid', c.id ? 'حفظ التعديلات' : 'تسجيل العميل'); btn.type = 'submit';
    var r1 = h('div', 'form__two'); add(r1, field('الاسم', name), field('رقم الجوال', phone));
    var r2 = h('div', 'form__two'); add(r2, field('المدينة أو الحي', city), field('نوع المشروع', type));
    add(f, r1, r2, field('مرحلة العميل', stage), field('العنوان', address), field('ملاحظات', note), vl, err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      var payload = { name: name.value.trim(), phone: phone.value.trim(), city: city.value.trim(), type: type.value, address: address.value.trim(), note: note.value.trim(), vip: vip.checked, stage: stage.value };
      api(c.id ? 'PATCH' : 'POST', c.id ? 'customers/' + c.id : 'customers', payload).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); if (res.error === 'customer_exists' && res.id) err.appendChild(hlink('err__link', ' فتح ملفه', '#customer/' + res.id)); return; }
        onSaved(res);
      }).catch(function () { btn.disabled = false; });
    });
    return f;
  }

  PAGES.customers = function (args, t) {
    var tab = args[0] || 'all';
    var q = '';
    if (tab === 'q') { try { q = decodeURIComponent(args.slice(1).join('/')); } catch (e) { q = ''; } }
    setTitle('العملاء');
    var bar = h('div', 'toolbar');
    if (!canEdit() && tab === 'add') tab = 'all';
    add(bar, tabs([['all', 'كل العملاء'], ['vip', 'المميزون']], tab, 'customers'), canEdit() ? hlink('btn btn--sm btn--solid', 'عميل جديد', '#customers/add') : null);
    ui.body.appendChild(bar);
    if (tab === 'add') {
      var pf = panel('تسجيل عميل جديد');
      pf.appendChild(customerForm(null, function (res) { toast('تم تسجيل العميل.'); go('#customer/' + res.id); }));
      return ui.body.appendChild(pf);
    }
    var sf = h('form', 'inline'); sf.noValidate = true;
    var si = input('search', { maxLength: 60, placeholder: 'ابحث في العملاء بالاسم أو الجوال', value: q }); si.setAttribute('aria-label', si.placeholder);
    var sb = h('button', 'btn btn--sm', 'بحث'); sb.type = 'submit';
    sf.addEventListener('submit', function (e) { e.preventDefault(); var v = toLatinDigits(si.value).trim(); go(v ? '#customers/q/' + encodeURIComponent(v) : '#customers/all'); });
    ui.body.appendChild(add(sf, si, sb));
    var stageKey = tab === 'stage' && STAGES[args[1]] ? args[1] : '';
    var so = { '': 'كل المراحل' }; Object.keys(STAGES).forEach(function (k) { so[k] = STAGES[k]; });
    var ss = select(so, stageKey); ss.setAttribute('aria-label', 'مرحلة العميل');
    ss.addEventListener('change', function () { go(ss.value ? '#customers/stage/' + ss.value : '#customers/all'); });
    ui.body.appendChild(add(h('div', 'monthpick'), h('span', null, 'المرحلة'), ss));
    fetchPage(t, ['customers' + (tab === 'vip' ? '?vip=1' : tab === 'q' ? '?q=' + encodeURIComponent(q) : stageKey ? '?stage=' + stageKey : '')]).then(function (all) {
      var list = all[0].customers;
      var p = panel((tab === 'q' ? 'نتائج البحث عن «' + q + '»' : tab === 'vip' ? 'العملاء المميزون' : stageKey ? 'عملاء مرحلة ' + STAGES[stageKey] : 'كل العملاء') + ' (' + list.length + ')');
      if (!list.length) p.appendChild(empty(tab === 'q' ? 'ما فيه عميل يطابق البحث.' : 'لا يوجد عملاء مسجلين بعد.'));
      else {
        var head = h('div', 'row row--cust row--head'); head.setAttribute('aria-hidden', 'true');
        add(head, h('span', null, 'العميل'), h('span', null, 'الجوال'), h('span', null, 'المدينة'), h('span', null, 'النوع'), h('span', null, 'المرحلة'));
        var rows = h('div', 'rows');
        var chief = iAmChief();
        rows.appendChild(chief ? rowLine(head) : head);
        list.forEach(function (c) {
          rows.appendChild(chief ? rowLine(customerRow(c), delBtn('حذف', 'link', function () { del('customers/' + c.id, 'تم حذف العميل.', route); })) : customerRow(c));
        });
        p.appendChild(rows);
        p.appendChild(exportBar('العملاء', ['الاسم', 'الجوال', 'المدينة', 'نوع المشروع', 'المرحلة', 'مميز', 'تاريخ التسجيل'], function () { return list.map(function (c) { return [c.name, c.phone, c.city || '', c.type || '', STAGES[c.stage] || STAGES.new, c.vip ? 'نعم' : '', c.created_at.slice(0, 10)]; }); }));
      }
      ui.body.appendChild(p);
    }).catch(noop);
  };

  PAGES.customer = function (args, t) {
    var id = +args[0] || 0;
    setTitle('ملف العميل');
    ui.body.appendChild(hlink('back', 'رجوع', ui.from && /^#customers/.test(ui.from) ? ui.from : '#customers/all'));
    var l0 = h('p', 'loading', 'جارٍ التحميل…'); ui.body.appendChild(l0);
    api('GET', 'customers/' + id).then(function (res) {
      if (!live(t)) return;
      l0.remove();
      if (!res.ok) return ui.body.appendChild(empty('ما لقيت هذا العميل.'));
      var c = res.customer;
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = h('section', 'panel');
      var sbg = h('span', 'badge', 'المرحلة: ' + (STAGES[c.stage] || STAGES.new)); sbg.dataset.s = 'contacted';
      var top = h('div', 'lead__top'); add(top, h('h2', 'lead__name', c.name), sbg, star(c));
      var ph = contact(c.phone, 'مرحباً ' + c.name + '، معك أوبسيديان ديزاين.');
      add(p, top, ph, h('p', 'row__meta', 'سجّله ' + (c.creator_name || '—') + ' · ' + fmtDate(c.created_at)),
        canEdit() ? customerForm(c, function () { toast('تم حفظ بيانات العميل.'); go('#customer/' + c.id); })
          : h('p', 'panel__hint', 'المدينة: ' + (c.city || '—') + ' · نوع المشروع: ' + (c.type || '—') + '. صلاحيتك للاطلاع فقط.'));
      a1.appendChild(p);

      var pl = panel('طلبات العميل');
      if (res.leads.length) {
        var rl = h('div', 'rows');
        res.leads.forEach(function (l) {
          var r = hlink('row row--plain', null, '#lead/' + l.id); var b = h('span', 'badge', LEAD_STATUS[l.status] || l.status); b.dataset.s = l.status;
          add(r, h('span', 'row__name', '#' + l.id + ' · ' + (l.type || 'بدون نوع')), h('span', 'row__meta', fmtDate(l.created_at)), b); rl.appendChild(r);
        });
        pl.appendChild(rl);
      } else pl.appendChild(empty('ما له طلبات مسجلة بهذا الرقم.'));
      var pn = panel('ملاحظات الفريق على العميل');
      var ul = h('ul', 'notes');
      var cnotes = res.notes || [];
      if (!cnotes.length) ul.appendChild(h('li', 'empty', 'لا توجد ملاحظات بعد.'));
      cnotes.forEach(function (n) {
        var li = h('li', null, n.body); var sm = h('small', null, (n.staff_name || '—') + ' · ' + fmtDate(n.created_at));
        if (iAmChief() || n.staff_id === me.id) sm.appendChild(delBtn('حذف', 'link', function () { del('customers/' + c.id + '/notes/' + n.id, 'تم حذف الملاحظة.', function () { go('#customer/' + c.id); }); }));
        li.appendChild(sm); ul.appendChild(li);
      });
      var nf = h('form', 'form'); nf.noValidate = true;
      var ni = input('textarea', { maxLength: 800, placeholder: 'اكتب ملاحظة على العميل، يشوفها الكل…' }); ni.setAttribute('aria-label', 'ملاحظة جديدة على العميل');
      var nb = h('button', 'btn btn--sm', 'حفظ الملاحظة'); nb.type = 'submit';
      nf.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = ni.value.trim(); if (!v || nb.disabled) return;
        nb.disabled = true;
        api('POST', 'customers/' + c.id + '/notes', { body: v }).then(function (r) { nb.disabled = false; if (!r.ok) return oops(r); toast('تم حفظ الملاحظة.'); go('#customer/' + c.id); }).catch(function () { nb.disabled = false; });
      });
      if (canEdit()) a2.appendChild(add(pn, ul, add(nf, ni, nb)));
      a2.appendChild(pl);
      var pa = panel('مواعيد العميل');
      if (res.appointments.length) {
        var ra = h('div', 'rows');
        res.appointments.forEach(function (a) {
          var r = h('div', 'row row--plain'); var b = h('span', 'badge', APPT_STATUS[a.status] || a.status); b.dataset.s = a.status;
          add(r, h('span', 'row__name', fmtDay(a.date)), h('span', 'row__id', fmtTime(a.time)), b,
            iAmChief() ? delBtn('حذف', 'link', function () { del('appointments/' + a.id, 'تم حذف الموعد.', function () { go('#customer/' + c.id); }); }) : null); ra.appendChild(r);
        });
        pa.appendChild(ra);
      } else pa.appendChild(empty('لا يوجد موعد مسجل.'));
      a2.appendChild(pa);
      if (iAmChief()) {
        var pd = panel('حذف العميل');
        a2.appendChild(add(pd, h('p', 'panel__hint', 'يحذف ملف العميل وملاحظاته عند الجميع. طلباته ومواعيده تبقى.'),
          delBtn('حذف العميل', 'btn btn--sm btn--danger', function () { del('customers/' + c.id, 'تم حذف العميل.', function () { go('#customers/all'); }); })));
      }
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  /* ------------------------------------------------------------ tasks */
  function taskRow(x, today, after, showOwner) {
    var r = h('div', 'row row--task'); r.dataset.s = x.status;
    var st = select(TASK_STATUS, x.status); st.setAttribute('aria-label', 'حالة المهمة: ' + x.title); st.dataset.s = x.status;
    st.disabled = !isAdmin() && x.assigned_to !== me.id;
    st.addEventListener('change', function () {
      api('PATCH', 'tasks/' + x.id, { status: st.value }).then(function (res) { if (!res.ok) { st.value = x.status; return oops(res); } toast(st.value === 'done' ? 'تم إنجاز المهمة.' : 'تم تحديث المهمة.'); after(); }).catch(noop);
    });
    var who = h('div', 'row__who');
    add(who, h('span', 'row__name', x.title), x.note ? h('span', 'row__type', x.note) : null,
      h('span', 'row__meta', (showOwner ? 'على: ' + (x.assigned_name || '—') + ' · ' : '') + (x.created_by !== x.assigned_to ? 'من: ' + (x.creator_name || '—') : 'مهمة شخصية')));
    var due = h('span', 'due', x.due ? fmtDay(x.due) : 'بدون موعد');
    if (x.due && x.status !== 'done' && x.due < today) { due.dataset.late = '1'; due.textContent = 'متأخرة · ' + fmtDay(x.due); }
    else if (x.due && x.due === today && x.status !== 'done') { due.dataset.today = '1'; due.textContent = 'اليوم'; }
    var act = h('div', 'row__act'); act.appendChild(st);
    if (iAmChief() || x.created_by === me.id) {
      act.appendChild(delBtn('حذف', 'link', function () { del('tasks/' + x.id, 'تم حذف المهمة.', after); }));
    }
    return add(r, who, due, act);
  }

  PAGES.tasks = function (args, t) {
    var admin = isAdmin();
    var seeAll = admin || me.role === 'viewer';
    var tab = args[0] === 'done' || (seeAll && args[0] === 'all') ? args[0] : 'mine';
    setTitle('المهام');
    var items = [['mine', 'مهامي']]; if (seeAll) items.push(['all', 'مهام الفريق']); items.push(['done', 'المنجزة']);
    ui.body.appendChild(add(h('div', 'toolbar'), tabs(items, tab, 'tasks')));
    var again = function () { go('#tasks/' + tab); };
    fetchPage(t, ['tasks' + (tab === 'done' ? '?done=1' + (admin ? '&all=1' : '') : tab === 'all' ? '?all=1' : '')]).then(function (all) {
      var res = all[0];
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = panel(({ mine: 'مهامي المفتوحة', all: 'مهام الفريق المفتوحة', done: 'المهام المنجزة' })[tab] + ' (' + res.tasks.length + ')');
      if (!res.tasks.length) p.appendChild(empty('لا يوجد.'));
      else { var rows = h('div', 'rows'); res.tasks.forEach(function (x) { rows.appendChild(taskRow(x, res.today, again, seeAll && tab !== 'mine')); }); p.appendChild(rows);
        p.appendChild(exportBar('المهام', ['المهمة', 'التفاصيل', 'على', 'من', 'موعد الإنجاز', 'الحالة'], function () { return res.tasks.map(function (x) { return [x.title, x.note || '', x.assigned_name || '', x.creator_name || '', x.due || '', TASK_STATUS[x.status] || x.status]; }); })); }
      a1.appendChild(p);

      var pf = panel('مهمة جديدة');
      var f = h('form', 'form'); f.noValidate = true;
      var title = input('text', { maxLength: 160, required: true });
      var note = input('textarea', { maxLength: 600 });
      var due = input('date', {});
      var opts = {}; users.filter(function (u) { return u.active; }).forEach(function (u) { opts[u.id] = u.id === me.id ? u.name + ' (أنا)' : u.name; });
      var to = select(opts, String(me.id));
      var err = h('p', 'err'); err.setAttribute('role', 'alert');
      var btn = h('button', 'btn btn--solid', 'إضافة المهمة'); btn.type = 'submit';
      add(f, field('المهمة', title), field('تفاصيل', note), field('موعد الإنجاز', due), admin ? field('على مين', to) : null, err, btn);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (btn.disabled) return;
        err.textContent = ''; btn.disabled = true;
        api('POST', 'tasks', { title: title.value.trim(), note: note.value.trim(), due: due.value, assigned_to: admin ? +to.value : me.id }).then(function (r) {
          btn.disabled = false;
          if (!r.ok) { err.textContent = errText(r.error); return; }
          toast('تمت إضافة المهمة.'); again();
        }).catch(function () { btn.disabled = false; });
      });
      a2.appendChild(add(pf, f));
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  /* ------------------------------------------------------------ appointments */
  function apptRow(a) {
    var r = h('div', 'row row--appt');
    var who = h('div', 'row__who');
    add(who, h('span', 'row__name', a.name), a.lead_type ? h('span', 'row__type', a.lead_type) : null);
    var ph = contact(a.phone, 'مرحباً ' + a.name + '، نأكد موعد زيارتك لمعرض أوبسيديان ديزاين يوم ' + fmtDay(a.date) + ' الساعة ' + fmtTime(a.time) + '. ننتظرك.');
    var st = select(APPT_STATUS, a.status); st.setAttribute('aria-label', 'حالة موعد ' + a.name); st.dataset.s = a.status; st.disabled = !canEdit();
    st.addEventListener('change', function () {
      api('PATCH', 'appointments/' + a.id, { status: st.value }).then(function (res) {
        if (!res.ok) { st.value = a.status; return oops(res); }
        a.status = st.value; st.dataset.s = st.value; toast('تم تحديث الموعد.');
      }).catch(noop);
    });
    var act = h('div', 'row__act');
    add(act, st, a.lead_id ? hlink('btn btn--sm', 'الطلب #' + a.lead_id, '#lead/' + a.lead_id) : null,
      iAmChief() ? delBtn('حذف', 'link', function () { del('appointments/' + a.id, 'تم حذف الموعد.', function () { route(); }); }) : null);
    return add(r, h('span', 'row__time', fmtTime(a.time)), who, ph, act);
  }

  PAGES.appts = function (args, t) {
    var names = { today: 'مواعيد اليوم', week: 'مواعيد الأسبوع', upcoming: 'المواعيد القادمة', past: 'المواعيد السابقة' };
    var tab = names[args[0]] ? args[0] : 'today';
    setTitle('المواعيد');
    ui.body.appendChild(add(h('div', 'toolbar'), tabs([['today', 'اليوم'], ['week', 'الأسبوع'], ['upcoming', 'القادمة'], ['past', 'السابقة']], tab, 'appts')));
    fetchPage(t, ['appointments?range=' + tab]).then(function (all) {
      var res = all[0];
      if (!res.appointments.length) { var p0 = panel(names[tab] + ' (0)'); p0.appendChild(empty('لا يوجد.')); return ui.body.appendChild(p0); }
      var days = {}; var order = [];
      res.appointments.forEach(function (a) { if (!days[a.date]) { days[a.date] = []; order.push(a.date); } days[a.date].push(a); });
      order.forEach(function (d) {
        var p = panel((d === res.today ? 'اليوم — ' : '') + fmtDay(d) + ' (' + days[d].length + ')');
        var rows = h('div', 'rows'); days[d].forEach(function (a) { rows.appendChild(apptRow(a)); });
        ui.body.appendChild(add(p, rows));
      });
    }).catch(noop);
  };

  /* ------------------------------------------------------------ attendance */
  function fmtClock(iso) {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso)); }
    catch (e) { return iso.slice(11, 16); }
  }
  function fmtDur(min) { var hrs = Math.floor(min / 60), m = min % 60; return hrs + ':' + (m < 10 ? '0' : '') + m + ' ساعة'; }
  function monthStart(today) { return today.slice(0, 8) + '01'; }
  // Reads the device's position. Used when check-in is tied to the showroom.
  function whereAmI() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject('none');
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) }); },
        function (err) { reject(err && err.code === 1 ? 'denied' : 'failed'); },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  function geoError(code) {
    toast(code === 'denied' ? 'الموقع مرفوض. اسمح للصفحة بالموقع من إعدادات المتصفح، بعدها سجّل.' : code === 'none' ? 'هذا المتصفح ما يدعم تحديد الموقع.' : 'ما قدرنا نحدد موقعك. شغّل الـ GPS وجرّب مرة ثانية.');
  }
  function punch(kind, staffId, after) {
    var self = !staffId || staffId === me.id;
    var send = function (pos) {
      var payload = staffId ? { staff_id: staffId } : {};
      if (pos) { payload.lat = pos.lat; payload.lng = pos.lng; payload.accuracy = pos.accuracy; }
      api('POST', 'attendance/' + kind, payload).then(function (res) {
        if (!res.ok) return toast(res.error === 'already_in' ? 'الحضور مسجّل من قبل، وما انسجل انصراف بعده.' : res.error === 'not_in' ? 'ما فيه حضور مسجّل اليوم عشان ينسجل له انصراف.'
          : res.error === 'too_far' ? 'أنت بعيد عن المعرض (حوالي ' + (res.distance >= 1000 ? (res.distance / 1000).toFixed(1) + ' كم' : res.distance + ' متر') + '). التسجيل من داخل المعرض فقط.' : errText(res.error));
        toast(kind === 'in' ? 'تم تسجيل الحضور.' : 'تم تسجيل الانصراف.');
        after();
      }).catch(noop);
    };
    if (self && ui.geo) { toast('جارٍ تحديد موقعك…'); whereAmI().then(send, geoError); }
    else send(null);
  }
  function recordLine(r) {
    return fmtClock(r.in_at) + ' ← ' + (r.out_at ? fmtClock(r.out_at) + ' (' + fmtDur(r.minutes) + ')' : 'لم يُسجّل انصراف') + (r.by_admin ? ' · سجّله المدير' : '');
  }
  function state(rows, absent) {
    var open = rows.filter(function (r) { return !r.out_at; })[0];
    var b = h('span', 'badge', open ? 'حاضر' : rows.length ? 'منصرف' : absent); b.dataset.s = open ? 'new' : 'closed';
    return { open: open, badge: b };
  }
  // My own check-in / check-out for today. `t` is the answer of GET attendance (today, own records)
  function punchPanel(t, after) {
    var p = h('section', 'panel punch');
    ui.geo = !!t.location_required;
    var s = state(t.records, 'لم يُسجّل حضور');
    var head = h('div', 'panel__head'); add(head, h('h2', null, 'حضوري اليوم'), s.badge);
    p.appendChild(head);
    if (t.records.length) { var ul = h('ul', 'times'); t.records.slice().reverse().forEach(function (r) { ul.appendChild(h('li', null, recordLine(r))); }); p.appendChild(ul); }
    else p.appendChild(empty('ما سجّلت حضورك اليوم.'));
    var btn = h('button', 'btn btn--solid', s.open ? 'تسجيل انصراف' : 'تسجيل حضور'); btn.type = 'button';
    btn.addEventListener('click', function () { if (btn.disabled) return; btn.disabled = true; punch(s.open ? 'out' : 'in', null, after); setTimeout(function () { btn.disabled = false; }, 4000); });
    p.appendChild(btn);
    if (t.location_required) p.appendChild(h('p', 'panel__hint', 'التسجيل مربوط بموقع المعرض. اسمح للصفحة بالموقع لما تطلب.'));
    return p;
  }
  function tally(rows, today) {
    var days = {}, total = 0, missing = 0;
    rows.forEach(function (r) { (days[r.date] = days[r.date] || []).push(r); total += r.minutes; if (!r.out_at && r.date !== today) missing++; });
    return { days: days, keys: Object.keys(days).sort().reverse(), total: total, missing: missing };
  }
  function dayRows(tl, again) {
    var rows = h('div', 'rows');
    tl.keys.forEach(function (d) {
      var mins = tl.days[d].reduce(function (a, r) { return a + r.minutes; }, 0);
      var r = h('div', 'row row--day');
      var times = h('span', 'row__meta');
      tl.days[d].slice().reverse().forEach(function (x, i) {
        var one = h('span', 'rec', (i ? '، ' : '') + fmtClock(x.in_at) + ' – ' + (x.out_at ? fmtClock(x.out_at) : '؟'));
        if (again) one.appendChild(delBtn('حذف', 'link', function () { del('attendance/' + x.id, 'تم حذف سجل الحضور.', again); }));
        times.appendChild(one);
      });
      add(r, h('span', 'row__name', fmtDay(d)), times, h('span', 'row__id', fmtDur(mins)));
      rows.appendChild(r);
    });
    return rows;
  }
  function miniStats(list) {
    var g = h('div', 'stats stats--3');
    list.forEach(function (it) { var d = h('div', 'stat'); add(d, h('b', null, String(it[0])), h('span', null, it[1])); g.appendChild(d); });
    return g;
  }

  PAGES.att = function (args, t) {
    var admin = me.role === 'admin' || me.role === 'finance';
    var chief = iAmChief();
    var tab = (admin && args[0] === 'report') || (chief && (args[0] === 'roll' || args[0] === 'place')) ? args[0] : 'me';
    setTitle('الحضور والانصراف');
    if (admin) ui.body.appendChild(add(h('div', 'toolbar'), tabs(chief ? [['me', 'حضوري'], ['roll', 'التحضير'], ['report', 'تقرير الشهر'], ['place', 'موقع الحضور']] : [['me', 'حضوري'], ['report', 'تقرير الشهر']], tab, 'att')));
    if (tab === 'place') return placePage(t);

    if (tab === 'roll') {
      var day = /^\d{4}-\d{2}-\d{2}$/.test(args[1] || '') ? args[1] : '';
      return fetchPage(t, ['attendance?all=1' + (day ? '&from=' + day + '&to=' + day : '')]).then(function (all) {
        var res = all[0];
        ui.geo = !!res.location_required;
        var isToday = res.from === res.today;
        var again = function () { go('#att/roll' + (isToday ? '' : '/' + res.from)); };
        var di = input('date', { value: res.from, max: res.today }); di.setAttribute('aria-label', 'اليوم');
        di.addEventListener('change', function () { if (/^\d{4}-\d{2}-\d{2}$/.test(di.value) && di.value <= res.today) go('#att/roll' + (di.value === res.today ? '' : '/' + di.value)); });
        var bar = h('div', 'toolbar'); bar.appendChild(add(h('div', 'monthpick'), h('span', null, 'اليوم'), di));
        ui.body.appendChild(bar);
        var p = panel((isToday ? 'تحضير اليوم — ' : 'تحضير ') + fmtDay(res.from));
        p.appendChild(h('p', 'panel__hint', isToday ? 'سجّل الموظف حاضر أو غائب. الحضور ينسجل بوقت الضغط.' : 'يوم سابق: تقدر تسجل الغياب أو تلغيه. الحضور ينسجل في نفس اليوم فقط.'));
        var rows = h('div', 'rows');
        res.staff.forEach(function (s) {
          var mine = res.records.filter(function (r) { return r.staff_id === s.id; });
          var ab = res.absences.filter(function (x) { return x.staff_id === s.id; })[0];
          var st = state(mine, ab ? 'غائب' : 'لم يُسجّل');
          if (ab && !mine.length) st.badge.dataset.s = 'cancelled';
          var r = h('div', 'row row--roll');
          var meta = h('span', 'row__meta');
          if (!mine.length) meta.textContent = ab ? (ab.note || 'غياب مسجّل') : '—';
          mine.slice().reverse().forEach(function (x) { var one = h('span', 'rec', recordLine(x)); one.appendChild(delBtn('حذف', 'link', function () { del('attendance/' + x.id, 'تم حذف سجل الحضور.', again); })); meta.appendChild(one); });
          var act = h('div', 'row__act');
          if (isToday) {
            var btn = h('button', 'btn btn--sm', st.open ? 'انصراف' : 'حاضر'); btn.type = 'button';
            btn.addEventListener('click', function () { if (btn.disabled) return; btn.disabled = true; punch(st.open ? 'out' : 'in', s.id, again); setTimeout(function () { btn.disabled = false; }, 4000); });
            act.appendChild(btn);
          }
          if (ab) act.appendChild(delBtn('إلغاء الغياب', 'btn btn--sm', function () { del('attendance/absent/' + ab.id, 'تم إلغاء الغياب.', again); }));
          else if (!mine.length) {
            var ab2 = h('button', 'btn btn--sm btn--danger', 'غائب'); ab2.type = 'button';
            ab2.addEventListener('click', function () {
              if (ab2.disabled) return; ab2.disabled = true;
              api('POST', 'attendance/absent', { staff_id: s.id, date: res.from }).then(function (x) { ab2.disabled = false; if (!x.ok) return oops(x); toast('تم تسجيل ' + s.name + ' غائب.'); again(); }).catch(function () { ab2.disabled = false; });
            });
            act.appendChild(ab2);
          }
          add(r, h('span', 'row__name', s.name), meta, st.badge, act);
          rows.appendChild(r);
        });
        ui.body.appendChild(add(p, rows));
      }).catch(noop);
    }

    fetchPage(t, ['attendance']).then(function (all) {
      var today = all[0];
      var ym = tab === 'report' && /^\d{4}-\d{2}$/.test(args[1] || '') && args[1] <= today.today.slice(0, 7) ? args[1] : today.today.slice(0, 7);
      var last = ym + '-' + String(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
      var to = last > today.today ? today.today : last;
      var path = 'attendance?' + (tab === 'report' ? 'all=1&' : '') + 'from=' + ym + '-01&to=' + to;
      return fetchPage(t, [path]).then(function (m) {
        var res = m[0];
        if (tab === 'report') {
          var bar = h('div', 'toolbar');
          var mi = input('month', { value: ym, max: today.today.slice(0, 7) }); mi.setAttribute('aria-label', 'الشهر');
          mi.addEventListener('change', function () { if (/^\d{4}-\d{2}$/.test(mi.value)) go('#att/report/' + mi.value); });
          var pall = h('button', 'btn btn--sm btn--solid', 'طباعة كشوف كل الموظفين'); pall.type = 'button';
          pall.addEventListener('click', function () { printSheets(res.staff, res, ym, to); });
          var mf = h('div', 'monthpick'); add(mf, h('span', null, 'الشهر'), mi);
          ui.body.appendChild(add(bar, mf, pall));
          ui.body.appendChild(exportBar('تقرير الحضور ' + ym, ['الموظف', 'التاريخ', 'الحضور', 'الانصراف', 'الساعات', 'ملاحظات'], function () {
            var out = [];
            res.staff.forEach(function (s) {
              res.records.filter(function (r) { return r.staff_id === s.id; }).slice().reverse().forEach(function (r) { out.push([s.name, r.date, fmtClock(r.in_at), r.out_at ? fmtClock(r.out_at) : '', Math.round(r.minutes / 6) / 10, r.by_admin ? 'سجّله المدير' : '']); });
              res.absences.filter(function (x) { return x.staff_id === s.id; }).forEach(function (x) { out.push([s.name, x.date, '', '', 0, 'غائب' + (x.note ? ' - ' + x.note : '')]); });
            });
            return out;
          }));
          ui.body.appendChild(h('p', 'hello', 'من ' + fmtDay(res.from) + ' إلى ' + fmtDay(res.to) + ' — كل موظف يطلع في صفحة لحاله عند الطباعة.'));
          res.staff.forEach(function (s) {
            var tl = tally(res.records.filter(function (r) { return r.staff_id === s.id; }), res.today);
            var abs = res.absences.filter(function (x) { return x.staff_id === s.id; });
            var one = h('button', 'btn btn--sm', 'طباعة كشف ' + s.name); one.type = 'button';
            one.addEventListener('click', function () { printSheets([s], res, ym, to); });
            var d = h('details', 'panel fold');
            var sum = h('summary');
            add(sum, h('span', 'row__name', s.name), h('span', 'row__meta', 'أيام الحضور: ' + tl.keys.length + ' · أيام الغياب: ' + abs.length + (tl.missing ? ' · بدون انصراف: ' + tl.missing : '')), h('span', 'badge', fmtDur(tl.total)));
            d.appendChild(sum);
            d.appendChild(tl.keys.length ? dayRows(tl, chief ? function () { go('#att/report/' + ym); } : null) : empty('لا يوجد حضور مسجّل هذا الشهر.'));
            if (abs.length) d.appendChild(h('p', 'panel__hint absline', 'أيام الغياب: ' + abs.map(function (x) { return fmtDay(x.date); }).reverse().join('، ')));
            d.appendChild(add(h('div', 'quick fold__act'), one));
            ui.body.appendChild(d);
          });
          return;
        }
        var tl = tally(res.records, res.today);
        var cols = h('div', 'cols');
        var a1 = h('div', 'col'), a2 = h('div', 'col');
        var pm = panel('هذا الشهر');
        pm.appendChild(miniStats([[tl.keys.length, 'أيام الحضور'], [fmtDur(tl.total).replace(' ساعة', ''), 'مجموع الساعات'], [res.absences.length, 'أيام الغياب']]));
        pm.appendChild(tl.keys.length ? dayRows(tl) : empty('لا يوجد حضور مسجّل هذا الشهر.'));
        a1.appendChild(pm);
        a2.appendChild(punchPanel(today, function () { go('#att/me'); }));
        a2.appendChild(correctionPanel(today.today));
        ui.body.appendChild(add(cols, a1, a2));
      });
    }).catch(noop);
  };

  // Where check-in is allowed: the showroom's point and how far from it still counts
  function placePage(t) {
    fetchPage(t, ['attendance/place']).then(function (all) {
      var pl = all[0].place;
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = panel('موقع تسجيل الحضور');
      var badge = h('span', 'badge', pl ? 'مفعّل' : 'غير مفعّل'); badge.dataset.s = pl ? 'new' : 'closed';
      p.querySelector('.panel__head').appendChild(badge);
      p.appendChild(h('p', 'panel__hint', pl ? 'الموظف ما يقدر يسجل حضور أو انصراف إلا وهو داخل المسافة المسموحة من هذي النقطة.' : 'ما فيه موقع محدد، والحضور ينسجل من أي مكان. حدد موقع المعرض عشان ينربط التسجيل فيه.'));
      var f = h('form', 'form'); f.noValidate = true;
      var lat = input('text', { dir: 'ltr', inputMode: 'decimal', value: pl ? String(pl.lat) : '' });
      var lng = input('text', { dir: 'ltr', inputMode: 'decimal', value: pl ? String(pl.lng) : '' });
      var rad = input('number', { dir: 'ltr', min: 30, max: 2000, step: 10, value: pl ? String(pl.radius) : '150' });
      var err = h('p', 'err'); err.setAttribute('role', 'alert');
      var here = h('button', 'btn btn--sm', 'استخدم موقعي الحالي'); here.type = 'button';
      var note = h('p', 'panel__hint');
      here.addEventListener('click', function () {
        note.textContent = 'جارٍ تحديد موقعك…';
        whereAmI().then(function (pos) { lat.value = pos.lat.toFixed(6); lng.value = pos.lng.toFixed(6); note.textContent = 'تم. دقة القراءة حوالي ' + pos.accuracy + ' متر. اضغط حفظ.'; }, function (c) { note.textContent = ''; geoError(c); });
      });
      var map = hlink('panel__more', 'افتح النقطة في خرائط قوقل', '#'); map.target = '_blank'; map.rel = 'noopener';
      map.addEventListener('click', function (e) { if (!lat.value || !lng.value) { e.preventDefault(); return; } map.href = 'https://www.google.com/maps?q=' + encodeURIComponent(toLatinDigits(lat.value).trim() + ',' + toLatinDigits(lng.value).trim()); });
      var two = h('div', 'form__two'); add(two, field('خط العرض', lat), field('خط الطول', lng));
      var btn = h('button', 'btn btn--solid', 'حفظ الموقع'); btn.type = 'submit';
      add(f, add(h('div', 'quick'), here), note, two, field('المسافة المسموحة (متر)', rad, 'كم متر حول النقطة ينحسب داخل المعرض. 150 مناسبة لأغلب المباني.'), map, err, btn);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (btn.disabled) return;
        err.textContent = ''; btn.disabled = true;
        api('PUT', 'attendance/place', { lat: +toLatinDigits(lat.value).trim(), lng: +toLatinDigits(lng.value).trim(), radius: +toLatinDigits(rad.value) }).then(function (r) {
          btn.disabled = false;
          if (!r.ok) { err.textContent = errText(r.error); return; }
          toast('تم حفظ موقع الحضور.'); go('#att/place');
        }).catch(function () { btn.disabled = false; });
      });
      a1.appendChild(add(p, f));
      var p2 = panel('كيف يشتغل');
      var ul = h('ul', 'bullets');
      ['أنت في المعرض؟ اضغط "استخدم موقعي الحالي" ثم حفظ.', 'أو انسخ الإحداثيات من خرائط قوقل والصقها في الخانتين.', 'الموظف يضغط تسجيل حضور، والصفحة تطلب موقعه وترفض لو كان بعيد.', 'تحضير المدير لموظف ثاني من "تحضير اليوم" ما ينطبق عليه شرط الموقع.'].forEach(function (x) { ul.appendChild(h('li', null, x)); });
      p2.appendChild(ul);
      if (pl) p2.appendChild(delBtn('إلغاء ربط الموقع', 'btn btn--sm btn--danger', function () {
        api('PUT', 'attendance/place', { clear: true }).then(function (r) { if (!r.ok) return oops(r); toast('تم إلغاء ربط الموقع.'); go('#att/place'); }).catch(noop);
      }));
      a2.appendChild(p2);
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  }

  // Printable monthly sheet: one page per member, every day of the month listed
  function printSheets(staff, res, ym, to) {
    var old = document.getElementById('print'); if (old) old.remove();
    var root = h('div', 'print'); root.id = 'print';
    var monthName;
    try { monthName = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-01T00:00:00Z')); } catch (e) { monthName = ym; }
    var wd = function (d) { try { return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')); } catch (e) { return ''; } };
    var lastDay = +to.slice(8, 10);
    staff.forEach(function (s) {
      var tl = tally(res.records.filter(function (r) { return r.staff_id === s.id; }), res.today);
      var absent = {}; (res.absences || []).forEach(function (x) { if (x.staff_id === s.id) absent[x.date] = x; });
      var absCount = Object.keys(absent).length;
      var sheet = h('section', 'sheet');
      var head = h('header', 'sheet__head');
      var logo = h('img'); logo.src = '../assets/img/logo-160.png'; logo.alt = ''; logo.width = 56; logo.height = 56;
      var ht = h('div'); add(ht, h('h1', null, 'كشف الحضور والانصراف الشهري'), h('p', null, 'أوبسيديان ديزاين — سيهات'));
      add(head, logo, ht);
      var info = h('dl', 'sheet__info');
      [['اسم الموظف', s.name], ['التصنيف', jobName(s)], ['الشهر', monthName], ['الفترة', ym + '-01 إلى ' + to]].forEach(function (x) { var d = h('div'); add(d, h('dt', null, x[0]), h('dd', null, x[1])); info.appendChild(d); });
      var table = h('table', 'sheet__table');
      var thead = h('thead'), trh = h('tr');
      ['التاريخ', 'اليوم', 'الحضور', 'الانصراف', 'الساعات', 'ملاحظات'].forEach(function (x) { trh.appendChild(h('th', null, x)); });
      thead.appendChild(trh); table.appendChild(thead);
      var tb = h('tbody');
      for (var i = 1; i <= lastDay; i++) {
        var d = ym + '-' + (i < 10 ? '0' : '') + i;
        var rows = (tl.days[d] || []).slice().reverse();
        var tr = h('tr');
        var mins = rows.reduce(function (a, r) { return a + r.minutes; }, 0);
        var noOut = rows.some(function (r) { return !r.out_at; });
        var notes = [];
        if (!rows.length) notes.push(absent[d] ? 'غائب' + (absent[d].note ? ' (' + absent[d].note + ')' : '') : new Date(d + 'T00:00:00Z').getUTCDay() === 5 ? 'جمعة' : 'لا يوجد تسجيل');
        if (rows.length > 1) notes.push(rows.length + ' فترات');
        if (noOut) notes.push('بدون انصراف');
        if (rows.some(function (r) { return r.by_admin; })) notes.push('سجّله المدير');
        add(tr, h('td', 'num', d), h('td', null, wd(d)),
          h('td', 'num', rows.length ? fmtClock(rows[0].in_at) : '—'),
          h('td', 'num', rows.length && rows[rows.length - 1].out_at ? fmtClock(rows[rows.length - 1].out_at) : '—'),
          h('td', 'num', rows.length ? fmtDur(mins).replace(' ساعة', '') : '—'), h('td', null, notes.join('، ')));
        tb.appendChild(tr);
      }
      table.appendChild(tb);
      var total = h('p', 'sheet__total', 'أيام الحضور: ' + tl.keys.length + ' — أيام الغياب: ' + absCount + ' — مجموع الساعات: ' + fmtDur(tl.total) + (tl.missing ? ' — مرات بدون انصراف: ' + tl.missing : ''));
      var sign = h('div', 'sheet__sign');
      ['توقيع الموظف', 'توقيع المدير', 'الختم'].forEach(function (x) { sign.appendChild(h('div', null, x)); });
      add(sheet, head, info, table, total, sign, h('p', 'sheet__foot', 'صدر من نظام أوبسيديان ديزاين بتاريخ ' + res.today));
      root.appendChild(sheet);
    });
    document.body.appendChild(root);
    setTimeout(function () { window.print(); }, 150);
  }

  /* ------------------------------------------------------------ team & account */
  function loadUsers() { return api('GET', 'users').then(function (res) { if (res.ok) users = res.users; return users; }); }

  PAGES.team = function (args, t) {
    var admin = me.role === 'admin';
    var tab = { activity: 1, requests: 1, devices: 1 }[args[0]] ? args[0] : 'members';
    setTitle('الفريق');
    var chief = iAmChief();
    if (!chief) tab = 'members';
    if (chief) ui.body.appendChild(add(h('div', 'toolbar'), tabs([['members', 'الأعضاء'], ['requests', 'طلبات الموظفين'], ['devices', 'الأجهزة'], ['activity', 'سجل النشاط']], tab, 'team')));
    if (chief && tab === 'members') ui.body.appendChild(add(h('div', 'quick'), hlink('btn btn--sm', 'الرواتب والمستحقات', '#payroll')));
    if (tab === 'activity') return activityPage(args[1], t);
    if (tab === 'requests') return requestsInbox(t);
    if (tab === 'devices') return devicesPage(t);
    var l0 = h('p', 'loading', 'جارٍ التحميل…'); ui.body.appendChild(l0);
    loadUsers().then(function () {
      if (!live(t)) return;
      l0.remove();
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = panel('أعضاء الفريق (' + users.length + ')');
      p.appendChild(h('p', 'panel__hint', chief ? 'افتح أي موظف عشان تعدل بياناته أو صلاحيته أو مسماه. الإيقاف يمنع الدخول ويحفظ السجل، والحذف يشيل الحساب نهائياً مع حضوره ومهامه.' : 'إدارة الحسابات عند رئيس الإدارة فقط.'));
      users.forEach(function (u) {
        var locked = !chief;
        var d = h('details', 'fold member');
        var sum = h('summary');
        var badge = h('span', 'badge', u.active ? 'فعّال' : 'موقوف'); badge.dataset.s = u.active ? 'confirmed' : 'closed';
        add(sum, h('span', 'row__name', u.name), h('span', 'row__meta', jobName(u) + ' · الصلاحية: ' + (ROLE_SHORT[u.role] || ROLE_SHORT.staff) + ' · ' + u.username), badge);
        d.appendChild(sum);
        if (locked) d.appendChild(empty('التعديل على الحسابات عند رئيس الإدارة فقط.'));
        else {
          var f = h('form', 'form'); f.noValidate = true;
          var name = input('text', { value: u.name, required: true });
          var uname = input('text', { value: u.username, dir: 'ltr', autocapitalize: 'none', spellcheck: false, autocomplete: 'off', required: true });
          var jobs = {}; Object.keys(JOBS).forEach(function (k) { if (k !== 'chief' || isChief(me)) jobs[k] = JOBS[k]; });
          var job = select(jobs, jobOf(u));
          var role = select(ROLES, ROLES[u.role] ? u.role : 'staff');
          linkRole(job, role);
          var pass = input('password', { dir: 'ltr', autocomplete: 'new-password', placeholder: 'اتركها فاضية إذا ما تبغى تغيّرها' });
          var err = h('p', 'err'); err.setAttribute('role', 'alert');
          var save = h('button', 'btn btn--sm btn--solid', 'حفظ التعديلات'); save.type = 'submit';
          var r1 = h('div', 'form__two'); add(r1, field('الاسم', name), field('اسم المستخدم', uname));
          var r2 = h('div', 'form__two'); add(r2, field('المسمى الوظيفي', job), field('الصلاحية', role, 'الصلاحية هي اللي تحدد وش يشوف. المسمى اسم فقط.'));
          add(f, r1, r2, field('كلمة مرور جديدة', pass), err);
          var acts = h('div', 'quick'); acts.appendChild(save);
          acts.appendChild(hlink('btn btn--sm', 'ملفه', '#member/' + u.id + '/money'));
          acts.appendChild(hlink('btn btn--sm', 'نشاطه', '#team/activity/' + u.id));
          if (u.id !== me.id) {
            var tog = h('button', 'btn btn--sm', u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'); tog.type = 'button';
            tog.addEventListener('click', function () {
              api('PATCH', 'users/' + u.id, { active: !u.active }).then(function (res) { if (!res.ok) return oops(res); toast(u.active ? 'تم إيقاف حساب ' + u.name + '.' : 'تم تفعيل حساب ' + u.name + '.'); go('#team'); }).catch(noop);
            });
            add(acts, tog, delBtn('حذف الموظف', 'btn btn--sm btn--danger', function () { del('users/' + u.id, 'تم حذف ' + u.name + '.', function () { go('#team'); }); }));
          }
          f.appendChild(acts);
          f.addEventListener('submit', function (e) {
            e.preventDefault();
            if (save.disabled) return;
            err.textContent = '';
            var payload = {};
            if (name.value.trim() !== u.name) payload.name = name.value.trim();
            if (uname.value.trim().toLowerCase() !== u.username) payload.username = uname.value.trim();
            if (job.value !== jobOf(u) || !u.job) payload.job = job.value;
            if (role.value !== u.role && job.value !== 'chief') payload.role = role.value;
            if (pass.value) payload.password = pass.value;
            save.disabled = true;
            api('PATCH', 'users/' + u.id, payload).then(function (res) {
              save.disabled = false;
              if (!res.ok) { err.textContent = errText(res.error); return; }
              toast('تم حفظ بيانات ' + (payload.name || u.name) + '.');
              if (u.id === me.id) return location.reload();
              go('#team');
            }).catch(function () { save.disabled = false; });
          });
          d.appendChild(f);
        }
        p.appendChild(d);
      });
      a1.appendChild(p);
      if (chief) a2.appendChild(userForm());
      ui.body.appendChild(chief ? add(cols, a1, a2) : a1);
    }).catch(noop);
  };

  // What each member did on the system: sign-ins, attendance, and every add, change and delete
  function activityPage(who, t) {
    var sid = /^\d+$/.test(who || '') ? who : '';
    fetchPage(t, ['activity' + (sid ? '?staff=' + sid : '')]).then(function (all) {
      var res = all[0];
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var opts = { '': 'كل الموظفين' }; users.forEach(function (u) { opts[u.id] = u.name; });
      var pick = select(opts, sid); pick.setAttribute('aria-label', 'الموظف');
      pick.addEventListener('change', function () { go('#team/activity' + (pick.value ? '/' + pick.value : '')); });
      var bar = h('div', 'monthpick'); add(bar, h('span', null, 'الموظف'), pick);
      var p = panel('آخر النشاط (' + res.activity.length + ')');
      p.appendChild(bar);
      if (!res.activity.length) p.appendChild(empty('لا يوجد نشاط مسجّل بعد. التسجيل يبدأ من الآن.'));
      else {
        var rows = h('div', 'rows');
        res.activity.forEach(function (x) {
          var r = h('div', 'row row--act');
          add(r, h('span', 'row__name', x.staff_name || '—'), h('span', 'act', x.action), h('span', 'row__meta', fmtDate(x.created_at)),
            iAmChief() ? delBtn('حذف', 'link', function () { del('activity/' + x.id, 'تم حذف السطر.', route); }) : h('span'));
          rows.appendChild(r);
        });
        p.appendChild(rows);
        p.appendChild(exportBar('سجل النشاط', ['الوقت', 'الموظف', 'الإجراء'], function () { return res.activity.map(function (x) { return [fmtDate(x.created_at), x.staff_name || '', x.action]; }); }));
      }
      a1.appendChild(p);
      var p2 = panel('آخر ظهور لكل موظف');
      var rows2 = h('div', 'rows');
      users.forEach(function (u) {
        var l = res.last.filter(function (y) { return y.staff_id === u.id; })[0];
        var r = hlink('row row--plain', null, '#team/activity/' + u.id);
        add(r, h('span', 'row__name', u.name), h('span', 'row__meta', l ? fmtDate(l.at) : 'لا يوجد'), h('span', 'badge', l ? String(l.n) : '0'));
        rows2.appendChild(r);
      });
      a2.appendChild(add(p2, rows2, h('p', 'panel__hint', 'الرقم هو عدد الإجراءات المسجلة.')));
      if (isChief(me) && res.activity.length) {
        var p3 = panel('مسح السجل');
        a2.appendChild(add(p3, h('p', 'panel__hint', 'يمسح سجل النشاط كله عند الجميع.'), delBtn('مسح سجل النشاط كله', 'btn btn--sm btn--danger', function () { del('activity', 'تم مسح السجل.', function () { go('#team/activity'); }); })));
      }
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  }

  function userForm() {
    var p = panel('إضافة موظف');
    var f = h('form', 'form'); f.noValidate = true;
    var name = input('text', { required: true });
    var user = input('text', { dir: 'ltr', autocapitalize: 'none', spellcheck: false, autocomplete: 'off', required: true });
    var pass = input('password', { dir: 'ltr', autocomplete: 'new-password', required: true });
    var role = select(ROLES, 'staff');
    var jobsNew = {}; Object.keys(JOBS).forEach(function (k) { if (k !== 'chief' || isChief(me)) jobsNew[k] = JOBS[k]; });
    var job = select(jobsNew, 'employee');
    linkRole(job, role);
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--solid', 'إضافة'); btn.type = 'submit';
    add(f, field('الاسم', name), field('اسم المستخدم', user, 'أحرف إنجليزية صغيرة وأرقام.'), field('كلمة المرور', pass, '8 أحرف على الأقل. يقدر يغيّرها بعد الدخول.'), field('المسمى الوظيفي', job), field('الصلاحية', role, 'الصلاحية هي اللي تحدد وش يشوف. المسمى اسم فقط.'), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      api('POST', 'users', { name: name.value.trim(), username: user.value.trim(), password: pass.value, role: role.value, job: job.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); return; }
        toast('تمت إضافة ' + name.value.trim() + '.');
        go('#team');
      }).catch(function () { btn.disabled = false; });
    });
    return add(p, f);
  }

  function accountMain() {
    var cols = h('div', 'cols');
    var a1 = h('div', 'col'), a2 = h('div', 'col');
    var p = panel('تغيير كلمة المرور');
    var f = h('form', 'form'); f.noValidate = true;
    var cur = input('password', { dir: 'ltr', autocomplete: 'current-password', required: true });
    var nw = input('password', { dir: 'ltr', autocomplete: 'new-password', required: true });
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--solid', 'تغيير كلمة المرور'); btn.type = 'submit';
    add(f, field('كلمة المرور الحالية', cur), field('كلمة المرور الجديدة', nw, '8 أحرف على الأقل.'), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      api('POST', 'password', { password: cur.value, new_password: nw.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = res.error === 'credentials' ? 'كلمة المرور الحالية غير صحيحة.' : errText(res.error); return; }
        cur.value = ''; nw.value = ''; toast('تم تغيير كلمة المرور.');
      }).catch(function () { btn.disabled = false; });
    });
    a1.appendChild(add(p, f));

    var pi = panel('بيانات الحساب');
    var facts = h('dl', 'facts');
    [['الاسم', me.name], ['اسم المستخدم', me.username || '—'], ['المسمى الوظيفي', jobName(me)], ['الصلاحية', ROLE_SHORT[me.role] || 'موظف']].forEach(function (x) {
      var d = h('div'); add(d, h('dt', null, x[0]), h('dd', null, x[1])); facts.appendChild(d);
    });
    var out = h('button', 'btn', 'تسجيل الخروج'); out.type = 'button'; out.addEventListener('click', logout);
    a2.appendChild(add(pi, facts, out));
    ui.body.appendChild(add(cols, a1, a2));
  };

  function toLatinDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x6f0; });
  }

  /* ------------------------------------------------------------ exports: Excel and PDF */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  // a zip with stored (uncompressed) files — all an .xlsx needs
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var u16 = function (n) { return [n & 255, (n >>> 8) & 255]; }, u32 = function (n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; };
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var head = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array([0x50, 0x4b, 3, 4].concat(head)), name, data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2].concat(u16(20), head, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += 30 + name.length + data.length;
    });
    var size = central.reduce(function (a, x) { return a + x.length; }, 0);
    var end = new Uint8Array([0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(size), u32(offset), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function xmlEsc(v) { return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); }
  function downloadXlsx(title, cols, rows) {
    var cell = function (v) { return typeof v === 'number' && isFinite(v) ? '<c><v>' + v + '</v></c>' : '<c t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>'; };
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><cols>' +
      cols.map(function (_, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="22" customWidth="1"/>'; }).join('') + '</cols><sheetData>' +
      [cols].concat(rows).map(function (r) { return '<row>' + r.map(cell).join('') + '</row>'; }).join('') + '</sheetData></worksheet>';
    var blob = zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEsc(title.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/worksheets/sheet1.xml', sheet],
    ]);
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = title + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  // the same table as a printable page; the browser's print window saves it as PDF
  function printTable(title, cols, rows) {
    var old = document.getElementById('print'); if (old) old.remove();
    var root = h('div', 'print'); root.id = 'print';
    var sheet = h('section', 'sheet');
    var head = h('header', 'sheet__head');
    var logo = h('img'); logo.src = '../assets/img/logo-160.png'; logo.alt = ''; logo.width = 56; logo.height = 56;
    add(head, logo, add(h('div'), h('h1', null, title), h('p', null, 'أوبسيديان ديزاين — سيهات')));
    var table = h('table', 'sheet__table'), trh = h('tr');
    cols.forEach(function (x) { trh.appendChild(h('th', null, x)); });
    table.appendChild(add(h('thead'), trh));
    var tb = h('tbody');
    rows.forEach(function (r) { var tr = h('tr'); r.forEach(function (v) { tr.appendChild(h('td', typeof v === 'number' ? 'num' : null, v == null ? '' : String(v))); }); tb.appendChild(tr); });
    table.appendChild(tb);
    add(sheet, head, table, h('p', 'sheet__foot', 'عدد السطور: ' + rows.length + ' — صدر من نظام أوبسيديان ديزاين بتاريخ ' + new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })));
    document.body.appendChild(add(root, sheet));
    setTimeout(function () { window.print(); }, 150);
  }
  // two buttons for any report: rows() is called when pressed, so it exports what is on screen
  function exportBar(title, cols, rows) {
    var w = h('div', 'quick export');
    var x = h('button', 'btn btn--sm', 'تصدير Excel'); x.type = 'button';
    x.addEventListener('click', function () { var r = rows(); if (!r.length) return toast('ما فيه بيانات للتصدير.'); downloadXlsx(title, cols, r); });
    var p = h('button', 'btn btn--sm', 'تصدير PDF'); p.type = 'button';
    p.addEventListener('click', function () { var r = rows(); if (!r.length) return toast('ما فيه بيانات للتصدير.'); printTable(title, cols, r); });
    return add(w, x, p);
  }

  /* ------------------------------------------------------------ a member's file: pay, leave, commissions, documents */
  var MONEY = { due: 'مستحق للموظف', debt: 'مديونية أو سلفة عليه', settle: 'سداد مديونية', salary: 'راتب مصروف' };
  var REQ_KIND = { general: 'طلب عام', correction: 'تصحيح تحضير', leave: 'إجازة' };
  var REQ_STATUS = { pending: 'قيد الدراسة', approved: 'مقبول', rejected: 'مرفوض' };
  var STAGES = { new: 'جديد', contract: 'توقيع العقد', design: 'التصاميم', manufacturing: 'التصنيع', installation: 'التركيب', delivery: 'التسليم', done: 'منتهي' };
  function sar(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ر.س'; }
  function simpleForm(fields, label, send, done) {
    var f = h('form', 'form'); f.noValidate = true;
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--sm btn--solid', label); btn.type = 'submit';
    fields.forEach(function (x) { f.appendChild(x); });
    add(f, err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      Promise.resolve(send()).then(function (res) {
        btn.disabled = false;
        if (!res || !res.ok) { err.textContent = errText(res && res.error); return; }
        done(res);
      }).catch(function () { btn.disabled = false; });
    });
    return f;
  }
  function two(a, b) { return add(h('div', 'form__two'), a, b); }
  function reqBadge(r) { var b = h('span', 'badge', REQ_STATUS[r.status] || r.status); b.dataset.s = r.status === 'approved' ? 'won' : r.status === 'rejected' ? 'cancelled' : 'pending'; return b; }

  // base = '#account' for my own file, '#member/ID' when the head of management or the accountant opens someone's
  function memberFile(sid, tab, base, t) {
    var own = sid === me.id, chief = iAmChief(), fin = me.role === 'finance';
    var again = function () { go(base + '/' + tab); };
    fetchPage(t, ['hr/' + sid]).then(function (all) {
      var d = all[0], s = d.staff, T = d.totals;
      if (!own) ui.body.appendChild(h('p', 'hello', s.name + ' — ' + (JOBS[s.job] || 'موظف')));
      var cols = h('div', 'cols'), a1 = h('div', 'col'), a2 = h('div', 'col');

      if (tab === 'money') {
        var p = panel('المستحقات والمديونيات والرواتب');
        p.appendChild(miniStats([[sar(s.salary), 'الراتب الشهري'], [sar(T.dues), 'مستحقات له'], [sar(T.debts), 'مديونيات عليه']]));
        p.appendChild(h('p', 'panel__hint', 'رواتب مصروفة مسجلة: ' + sar(T.salaries_paid) + ' · الصافي له بعد المديونيات: ' + sar(T.dues - T.debts)));
        if (!d.money.length) p.appendChild(empty('لا توجد حركات مسجلة.'));
        else {
          var rows = h('div', 'rows');
          d.money.forEach(function (m) {
            var r = h('div', 'row row--money'); var b = h('span', 'badge', MONEY[m.kind] || m.kind); b.dataset.s = m.kind === 'debt' ? 'cancelled' : m.kind === 'due' ? 'new' : m.kind === 'salary' ? 'confirmed' : 'won';
            add(r, h('span', 'row__id', sar(m.amount)), b, h('span', 'row__meta', fmtDay(m.date) + (m.note ? ' · ' + m.note : '') + (m.by_name ? ' · سجّلها ' + m.by_name : '')),
              chief ? delBtn('حذف', 'link', function () { del('hr/money/' + m.id, 'تم حذف الحركة.', again); }) : h('span'));
            rows.appendChild(r);
          });
          p.appendChild(rows);
        }
        p.appendChild(exportBar('الحركات المالية - ' + s.name, ['التاريخ', 'النوع', 'المبلغ', 'البيان', 'سجّلها'], function () { return d.money.map(function (m) { return [m.date, MONEY[m.kind] || m.kind, m.amount, m.note || '', m.by_name || '']; }); }));
        a1.appendChild(p);
        if (chief || fin) {
          var kind = select(MONEY, 'due'), amount = input('number', { dir: 'ltr', min: 0, step: '0.01', inputMode: 'decimal' }), date = input('date', { value: d.today }), note = input('text', { maxLength: 200 });
          a2.appendChild(add(panel('تسجيل حركة مالية'), simpleForm([field('النوع', kind), two(field('المبلغ (ر.س)', amount), field('التاريخ', date)), field('البيان', note)], 'تسجيل',
            function () { return api('POST', 'hr/' + sid + '/money', { kind: kind.value, amount: amount.value, date: date.value, note: note.value.trim() }); }, function () { toast('تم تسجيل الحركة.'); again(); })));
        }
        if (chief) {
          var sal = input('number', { dir: 'ltr', min: 0, step: '0.01', inputMode: 'decimal', value: String(s.salary || '') });
          a2.appendChild(add(panel('الراتب الشهري'), simpleForm([field('الراتب (ر.س)', sal)], 'حفظ الراتب', function () { return api('PATCH', 'hr/' + sid, { salary: sal.value || 0 }); }, function () { toast('تم حفظ الراتب.'); again(); })));
        }
      }

      if (tab === 'leave') {
        var pl = panel('رصيد الإجازات لسنة ' + d.year);
        pl.appendChild(miniStats([[s.leave_days, 'الرصيد السنوي (يوم)'], [T.leave_used, 'المستخدم'], [T.leave_left, 'المتبقي']]));
        if (!d.leaves.length) pl.appendChild(empty('لا توجد إجازات مسجلة.'));
        else {
          var lr = h('div', 'rows');
          d.leaves.forEach(function (x) {
            var r = h('div', 'row row--money');
            add(r, h('span', 'row__id', x.days + ' يوم'), h('span', 'row__name', fmtDay(x.date_from) + (x.date_to !== x.date_from ? ' إلى ' + fmtDay(x.date_to) : '')), h('span', 'row__meta', x.note || ''),
              chief ? delBtn('حذف', 'link', function () { del('hr/leaves/' + x.id, 'تم حذف الإجازة.', again); }) : h('span'));
            lr.appendChild(r);
          });
          pl.appendChild(lr);
        }
        pl.appendChild(exportBar('الإجازات - ' + s.name, ['من', 'إلى', 'الأيام', 'البيان'], function () { return d.leaves.map(function (x) { return [x.date_from, x.date_to, x.days, x.note || '']; }); }));
        a1.appendChild(pl);
        var f1 = input('date', {}), f2 = input('date', {}), dn = input('number', { dir: 'ltr', min: 0.5, step: '0.5', value: '1' }), ln = input('text', { maxLength: 200 });
        if (chief) {
          a2.appendChild(add(panel('تسجيل إجازة'), simpleForm([two(field('من', f1), field('إلى', f2)), field('عدد الأيام', dn), field('البيان', ln)], 'تسجيل الإجازة',
            function () { return api('POST', 'hr/' + sid + '/leaves', { date_from: f1.value, date_to: f2.value || f1.value, days: dn.value, note: ln.value.trim() }); }, function () { toast('تم تسجيل الإجازة.'); again(); })));
          var ent = input('number', { dir: 'ltr', min: 0, step: '0.5', value: String(s.leave_days) });
          a2.appendChild(add(panel('الرصيد السنوي'), simpleForm([field('عدد أيام الإجازة في السنة', ent)], 'حفظ الرصيد', function () { return api('PATCH', 'hr/' + sid, { leave_days: ent.value }); }, function () { toast('تم حفظ الرصيد.'); again(); })));
        } else if (own) {
          a2.appendChild(add(panel('طلب إجازة'), h('p', 'panel__hint', 'الطلب يروح لرئيس الإدارة، وينخصم من الرصيد بعد القبول.'), simpleForm([two(field('من', f1), field('إلى', f2)), field('عدد الأيام', dn), field('السبب', ln)], 'إرسال الطلب',
            function () { return api('POST', 'requests', { kind: 'leave', date: f1.value, date_to: f2.value || f1.value, days: dn.value, body: ln.value.trim() || 'طلب إجازة' }); }, function () { toast('تم إرسال طلب الإجازة.'); go('#account/requests'); })));
        }
      }

      if (tab === 'commissions') {
        var pc = panel('العمولات (' + d.commissions.length + ')');
        pc.appendChild(miniStats([[sar(T.commissions), 'مجموع العمولات'], [d.commissions.length, 'عدد العمولات'], [d.commissions.length ? sar(T.commissions / d.commissions.length) : '0', 'متوسط العمولة']]));
        if (!d.commissions.length) pc.appendChild(empty('لا توجد عمولات مسجلة.'));
        else {
          var cr = h('div', 'rows');
          d.commissions.forEach(function (x) {
            var r = h('div', 'row row--money');
            add(r, h('span', 'row__id', sar(x.amount)), h('span', 'row__name', x.source), h('span', 'row__meta', fmtDay(x.date) + (x.percent != null ? ' · النسبة ' + x.percent + '%' : '') + (x.base != null ? ' · من ' + sar(x.base) : '')),
              chief || own ? delBtn('حذف', 'link', function () { del('commissions/' + x.id, 'تم حذف العمولة.', again); }) : h('span'));
            cr.appendChild(r);
          });
          pc.appendChild(cr);
        }
        pc.appendChild(exportBar('العمولات - ' + s.name, ['التاريخ', 'المصدر', 'قيمة الصفقة', 'النسبة %', 'العمولة'], function () { return d.commissions.map(function (x) { return [x.date, x.source, x.base == null ? '' : x.base, x.percent == null ? '' : x.percent, x.amount]; }); }));
        a1.appendChild(pc);
        if (own || chief) {
          var src = input('textarea', { maxLength: 300, placeholder: 'مثال: مطبخ العميل فلان، عقد رقم كذا' }), base = input('number', { dir: 'ltr', min: 0, step: '0.01', inputMode: 'decimal' }), pct = input('number', { dir: 'ltr', min: 0, max: 100, step: '0.1', inputMode: 'decimal' }),
            amt = input('number', { dir: 'ltr', min: 0, step: '0.01', inputMode: 'decimal' }), cd = input('date', { value: d.today });
          var calc = function () { if (base.value && pct.value) amt.value = String(Math.round(base.value * pct.value) / 100); };
          base.addEventListener('input', calc); pct.addEventListener('input', calc);
          a2.appendChild(add(panel('تسجيل عمولة'), simpleForm([field('مصدر العمولة وشرحها', src), two(field('قيمة الصفقة (ر.س)', base), field('النسبة %', pct)), two(field('مبلغ العمولة (ر.س)', amt, 'ينحسب تلقائي من القيمة والنسبة، وتقدر تكتبه.'), field('التاريخ', cd))], 'تسجيل العمولة',
            function () { return api('POST', 'commissions' + (own ? '' : '/' + sid), { source: src.value.trim(), base: base.value, percent: pct.value, amount: amt.value, date: cd.value }); }, function () { toast('تم تسجيل العمولة.'); again(); })));
        }
      }

      if (tab === 'docs') {
        var pd = panel('المستندات (' + (d.docs ? d.docs.length : 0) + ')');
        if (!d.docs) pd.appendChild(empty('المستندات يشوفها صاحبها ورئيس الإدارة فقط.'));
        else if (!d.docs.length) pd.appendChild(empty('لا توجد مستندات. ارفع صورة الجواز أو الإقامة أو أي ملف.'));
        else {
          var dr = h('div', 'rows');
          d.docs.forEach(function (x) {
            var r = h('div', 'row row--money');
            var open = hlink('btn btn--sm', 'فتح', '/api/staff/docs/' + x.id + '/file'); open.target = '_blank'; open.rel = 'noopener';
            add(r, open, h('span', 'row__name', x.name), h('span', 'row__meta', (x.size > 1048576 ? (x.size / 1048576).toFixed(1) + ' م.ب' : Math.max(1, Math.round(x.size / 1024)) + ' ك.ب') + ' · ' + fmtDate(x.created_at) + (x.by_name ? ' · رفعه ' + x.by_name : '')),
              chief || x.uploaded_by === me.id ? delBtn('حذف', 'link', function () { del('docs/' + x.id, 'تم حذف المستند.', again); }) : h('span'));
            dr.appendChild(r);
          });
          pd.appendChild(dr);
        }
        a1.appendChild(pd);
        if (own || chief) {
          var dname = input('text', { maxLength: 120, placeholder: 'مثال: الجواز، الإقامة، العقد' });
          var file = h('input', 'input'); file.type = 'file'; file.accept = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx';
          a2.appendChild(add(panel('رفع مستند'), h('p', 'panel__hint', 'صورة أو ملف حتى 4 ميجابايت. الصور تتصغر تلقائي.'), simpleForm([field('اسم المستند', dname), field('الملف', file)], 'رفع',
            function () {
              var fl = file.files && file.files[0];
              if (!fl) return { ok: false, error: 'file' };
              return readFile(fl).then(function (x) {
                if (x.size > 4 * 1024 * 1024) return { ok: false, error: 'too_large' };
                return api('POST', 'docs', { staff_id: sid, name: dname.value.trim() || fl.name, mime: x.mime, data: x.data });
              });
            }, function () { toast('تم رفع المستند.'); again(); })));
        }
      }
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  }
  // a file as base64; photos are scaled down first so a phone picture stays small
  function readFile(file) {
    var asData = function (blob, mime) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { var s = String(r.result); resolve({ data: s.slice(s.indexOf(',') + 1), mime: mime, size: blob.size }); };
        r.onerror = reject; r.readAsDataURL(blob);
      });
    };
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) return asData(file, file.type || 'application/octet-stream');
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { resolve(b ? asData(b, 'image/jpeg') : asData(file, file.type)); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(asData(file, file.type || 'application/octet-stream')); };
      img.src = url;
    });
  }

  // one request card; `decide` adds the approve / reject controls for the head of management
  function requestRow(r, again, decide) {
    var card = h('article', 'memo'); card.dataset.kind = r.status === 'pending' ? 'vip' : r.status === 'approved' ? 'ok' : 'no';
    var head = h('div', 'memo__head');
    add(head, h('span', 'tag', REQ_KIND[r.kind] || r.kind), reqBadge(r), h('span', 'row__meta', (decide && r.name ? r.name + ' · ' : '') + fmtDate(r.created_at)));
    if (iAmChief() || (r.staff_id === me.id && r.status === 'pending')) head.appendChild(delBtn(iAmChief() ? 'حذف' : 'سحب الطلب', 'link', function () { del('requests/' + r.id, 'تم حذف الطلب.', again); }));
    card.appendChild(head);
    if (r.kind === 'correction') card.appendChild(h('p', 'row__meta', 'اليوم: ' + fmtDay(r.date) + (r.in_time ? ' · الحضور ' + r.in_time : '') + (r.out_time ? ' · الانصراف ' + r.out_time : '')));
    if (r.kind === 'leave') card.appendChild(h('p', 'row__meta', 'من ' + fmtDay(r.date) + ' إلى ' + fmtDay(r.date_to) + ' · ' + r.days + ' يوم'));
    card.appendChild(h('p', 'memo__body', r.body));
    if (r.reply) card.appendChild(h('p', 'row__meta', 'رد الإدارة: ' + r.reply));
    if (decide && r.status === 'pending') {
      var reply = input('text', { maxLength: 400, placeholder: 'رد اختياري يوصل للموظف' }); reply.setAttribute('aria-label', 'الرد على الطلب');
      var ok = h('button', 'btn btn--sm btn--solid', 'قبول'); ok.type = 'button';
      var no = h('button', 'btn btn--sm btn--danger', 'رفض'); no.type = 'button';
      var act = function (status) { return function () { ok.disabled = no.disabled = true; api('PATCH', 'requests/' + r.id, { status: status, reply: reply.value.trim() }).then(function (x) { if (!x.ok) { ok.disabled = no.disabled = false; return oops(x); } toast(status === 'approved' ? 'تم قبول الطلب.' : 'تم رفض الطلب.'); again(); }).catch(noop); }; };
      ok.addEventListener('click', act('approved')); no.addEventListener('click', act('rejected'));
      card.appendChild(add(h('div', 'inline inline--wrap'), reply, ok, no));
    }
    return card;
  }
  function myRequests(t) {
    fetchPage(t, ['requests']).then(function (all) {
      var list = all[0].requests, again = function () { go('#account/requests'); };
      var cols = h('div', 'cols'), a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = panel('طلباتي للإدارة (' + list.length + ')');
      if (!list.length) p.appendChild(empty('ما رفعت أي طلب.'));
      else { var box = h('div', 'memos'); list.forEach(function (r) { box.appendChild(requestRow(r, again, false)); }); p.appendChild(box); }
      a1.appendChild(p);
      var txt = input('textarea', { maxLength: 1000, placeholder: 'اكتب طلبك للإدارة…' });
      a2.appendChild(add(panel('طلب جديد للإدارة'), h('p', 'panel__hint', 'الطلب يشوفه رئيس الإدارة فقط، ويبقى قيد الدراسة لين يقبله أو يرفضه.'), simpleForm([field('الطلب', txt)], 'إرسال الطلب',
        function () { return api('POST', 'requests', { kind: 'general', body: txt.value.trim() }); }, function () { toast('تم إرسال الطلب.'); again(); })));
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  }
  // on the attendance page: ask for a day's record to be corrected
  function correctionPanel(today) {
    var p = panel('طلب تصحيح التحضير');
    p.appendChild(h('p', 'panel__hint', 'غياب أو تأخير له سبب؟ اكتب اليوم والسبب، ورئيس الإدارة يوافق أو يرفض.'));
    var day = input('date', { value: today, max: today }), tin = input('time', {}), tout = input('time', {}), why = input('textarea', { maxLength: 1000, placeholder: 'السبب…' });
    return add(p, simpleForm([field('اليوم', day), two(field('وقت الحضور الصحيح', tin, 'اختياري'), field('وقت الانصراف الصحيح', tout, 'اختياري')), field('السبب', why)], 'إرسال طلب التصحيح',
      function () { return api('POST', 'requests', { kind: 'correction', date: day.value, in_time: tin.value, out_time: tout.value, body: why.value.trim() }); }, function () { toast('تم إرسال طلب التصحيح.'); go('#account/requests'); }));
  }

  var FILE_TABS = [['money', 'المالية'], ['leave', 'الإجازات'], ['commissions', 'العمولات'], ['docs', 'المستندات']];
  PAGES.account = function (args, t) {
    var names = { me: 1, money: 1, leave: 1, commissions: 1, docs: 1, requests: 1 };
    var tab = names[args[0]] ? args[0] : 'me';
    setTitle('ملفي');
    ui.body.appendChild(add(h('div', 'toolbar'), tabs([['me', 'حسابي']].concat(FILE_TABS, [['requests', 'طلباتي للإدارة']]), tab, 'account')));
    if (tab === 'me') return accountMain();
    if (tab === 'requests') return myRequests(t);
    memberFile(me.id, tab, '#account', t);
  };
  // someone else's file: the head of management sees all of it, the accountant everything but the documents
  PAGES.member = function (args, t) {
    var sid = +args[0] || 0;
    if (!(iAmChief() || me.role === 'finance') || !sid) return go('#home');
    var tab = { money: 1, leave: 1, commissions: 1, docs: 1 }[args[1]] ? args[1] : 'money';
    setTitle('ملف الموظف');
    ui.body.appendChild(hlink('back', 'رجوع', iAmChief() ? '#team' : '#payroll'));
    ui.body.appendChild(add(h('div', 'toolbar'), tabs(iAmChief() ? FILE_TABS : FILE_TABS.slice(0, 3), tab, 'member/' + sid)));
    memberFile(sid, tab, '#member/' + sid, t);
  };
  // the whole team's pay, balances, leave and commissions in one table
  PAGES.payroll = function (args, t) {
    if (!(iAmChief() || me.role === 'finance')) return go('#home');
    var tab = args[0] === 'commissions' ? 'commissions' : 'all';
    setTitle('الرواتب والمستحقات');
    ui.body.appendChild(add(h('div', 'toolbar'), tabs([['all', 'الرواتب والأرصدة'], ['commissions', 'كل العمولات']], tab, 'payroll')));
    if (tab === 'commissions') return fetchPage(t, ['commissions']).then(function (all) {
      var list = all[0].commissions;
      var p = panel('عمولات الموظفين (' + list.length + ')');
      if (!list.length) p.appendChild(empty('لا توجد عمولات مسجلة.'));
      else { var rows = h('div', 'rows'); list.forEach(function (x) { var r = hlink('row row--money', null, '#member/' + x.staff_id + '/commissions'); add(r, h('span', 'row__id', sar(x.amount)), h('span', 'row__name', x.name || '—'), h('span', 'row__meta', fmtDay(x.date) + ' · ' + x.source + (x.percent != null ? ' · ' + x.percent + '%' : '')), h('span')); rows.appendChild(r); }); p.appendChild(rows); }
      p.appendChild(exportBar('عمولات الموظفين', ['التاريخ', 'الموظف', 'المصدر', 'قيمة الصفقة', 'النسبة %', 'العمولة'], function () { return list.map(function (x) { return [x.date, x.name || '', x.source, x.base == null ? '' : x.base, x.percent == null ? '' : x.percent, x.amount]; }); }));
      ui.body.appendChild(p);
    }).catch(noop);
    fetchPage(t, ['hr']).then(function (all) {
      var list = all[0].staff;
      var p = panel('رواتب وأرصدة الموظفين — ' + all[0].year);
      var rows = h('div', 'rows');
      var head = h('div', 'row row--pay row--head'); head.setAttribute('aria-hidden', 'true');
      add(head, h('span', null, 'الموظف'), h('span', null, 'الراتب'), h('span', null, 'مستحقات'), h('span', null, 'مديونيات'), h('span', null, 'عمولات'), h('span', null, 'رصيد الإجازة'));
      rows.appendChild(head);
      list.forEach(function (x) {
        var r = hlink('row row--pay', null, '#member/' + x.id + '/money');
        add(r, add(h('span', 'row__who'), h('span', 'row__name', x.name), h('span', 'row__type', JOBS[x.job] || 'موظف')), h('span', 'row__id', sar(x.salary)), h('span', 'pay', 'له ' + sar(x.dues)), h('span', 'pay pay--debt', 'عليه ' + sar(x.debts)), h('span', 'pay', sar(x.commissions)), h('span', 'pay', x.leave_left + ' من ' + x.leave_days + ' يوم'));
        rows.appendChild(r);
      });
      p.appendChild(rows);
      p.appendChild(exportBar('رواتب وأرصدة الموظفين', ['الموظف', 'المسمى', 'الراتب الشهري', 'مستحقات له', 'مديونيات عليه', 'رواتب مصروفة', 'العمولات', 'رصيد الإجازة السنوي', 'المستخدم', 'المتبقي'],
        function () { return list.map(function (x) { return [x.name, JOBS[x.job] || 'موظف', x.salary, x.dues, x.debts, x.salaries_paid, x.commissions, x.leave_days, x.leave_used, x.leave_left]; }); }));
      ui.body.appendChild(p);
    }).catch(noop);
  };
  // head of management: every member's requests, waiting ones first
  function requestsInbox(t) {
    fetchPage(t, ['requests?all=1']).then(function (all) {
      var list = all[0].requests, again = function () { go('#team/requests'); };
      var wait = list.filter(function (r) { return r.status === 'pending'; });
      var p = panel('طلبات الموظفين — ' + wait.length + ' قيد الدراسة من ' + list.length);
      if (!list.length) p.appendChild(empty('لا توجد طلبات.'));
      else { var box = h('div', 'memos'); list.forEach(function (r) { box.appendChild(requestRow(r, again, true)); }); p.appendChild(box); }
      p.appendChild(exportBar('طلبات الموظفين', ['التاريخ', 'الموظف', 'النوع', 'الطلب', 'اليوم', 'الحالة', 'الرد'], function () { return list.map(function (r) { return [r.created_at.slice(0, 10), r.name || '', REQ_KIND[r.kind] || r.kind, r.body, r.date || '', REQ_STATUS[r.status] || r.status, r.reply || '']; }); }));
      ui.body.appendChild(p);
    }).catch(noop);
  }
  // head of management: which devices may sign in
  function devicesPage(t) {
    fetchPage(t, ['devices']).then(function (all) {
      var list = all[0].devices, again = function () { go('#team/devices'); };
      var p = panel('الأجهزة (' + list.length + ')');
      p.appendChild(h('p', 'panel__hint', 'أي جهاز جديد يحاول يدخل يطلع هنا "ينتظر الاعتماد"، وما يدخل لين تعتمده. الرفض أو الحذف يطلّع الجهاز فوراً.'));
      if (!list.length) p.appendChild(empty('لا توجد أجهزة مسجلة بعد.'));
      else {
        var rows = h('div', 'rows');
        var ST = { pending: 'ينتظر الاعتماد', approved: 'معتمد', rejected: 'مرفوض' };
        list.forEach(function (x) {
          var r = h('div', 'row row--roll'); var b = h('span', 'badge', ST[x.status] || x.status); b.dataset.s = x.status === 'approved' ? 'won' : x.status === 'rejected' ? 'cancelled' : 'pending';
          var set = function (status, done) { return function () { api('PATCH', 'devices/' + x.id, { status: status }).then(function (res) { if (!res.ok) return oops(res); toast(done); again(); }).catch(noop); }; };
          var act = h('div', 'row__act');
          if (x.status !== 'approved') { var ok = h('button', 'btn btn--sm btn--solid', 'اعتماد'); ok.type = 'button'; ok.addEventListener('click', set('approved', 'تم اعتماد الجهاز.')); act.appendChild(ok); }
          if (x.status !== 'rejected') { var no = h('button', 'btn btn--sm', 'رفض'); no.type = 'button'; no.addEventListener('click', set('rejected', 'تم رفض الجهاز.')); act.appendChild(no); }
          act.appendChild(delBtn('حذف', 'link', function () { del('devices/' + x.id, 'تم حذف الجهاز.', again); }));
          add(r, h('span', 'row__name', x.name || '—'), h('span', 'row__meta', (x.label || 'جهاز') + ' · أول محاولة ' + fmtDate(x.created_at) + (x.last_seen ? ' · آخر دخول ' + fmtDate(x.last_seen) : '')), b, act);
          rows.appendChild(r);
        });
        p.appendChild(rows);
      }
      ui.body.appendChild(p);
    }).catch(noop);
  }

  /* ------------------------------------------------------------ boot */
  function boot() {
    api('GET', 'me').then(function (res) {
      if (!res.ok) { app.textContent = ''; app.appendChild(h('p', 'gate', errText(res.error))); app.setAttribute('aria-busy', 'false'); return; }
      if (!res.user) return gate(!!res.needs_setup);
      me = res.user;
      loadUsers().then(shell, shell);
    }).catch(function () { app.textContent = ''; app.appendChild(h('p', 'gate', 'تعذر الاتصال. حدّث الصفحة.')); });
  }
  boot();
})();
