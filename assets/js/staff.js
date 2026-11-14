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
    self: 'ما تقدر توقف حسابك أنت.',
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
  function isAdmin() { return me && me.role === 'admin'; }
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
    var who = h('div', 'side__who'); add(who, h('b', null, me.name), h('span', null, me.role === 'admin' ? 'مدير' : 'موظف'));
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
    var section = page === 'lead' ? 'leads' : page === 'customer' ? 'customers' : page;
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
      add(qr, hlink('btn btn--sm', 'طلب جديد', '#leads/add'), hlink('btn btn--sm', 'عميل جديد', '#customers/add'), hlink('btn btn--sm', 'مهمة جديدة', '#tasks/mine'));
      a2.appendChild(add(quick, qr));
      if (isAdmin()) a2.appendChild(askPanel());
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  // Manager notes for the whole team; the manager writes and removes them
  function notesPanel(list) {
    var p = panel('ملاحظات الإدارة');
    p.classList.add('panel--notes');
    if (!list.length) p.appendChild(empty(isAdmin() ? 'ما فيه ملاحظات. اكتب ملاحظة تطلع لكل الموظفين.' : 'لا توجد ملاحظات من الإدارة.'));
    else {
      var box = h('div', 'memos');
      list.forEach(function (n) {
        var m = h('article', 'memo'); m.dataset.kind = n.kind;
        var head = h('div', 'memo__head');
        add(head, h('span', 'tag', NOTE_KIND[n.kind] || NOTE_KIND.general), h('span', 'row__meta', (n.author || '') + ' · ' + fmtDate(n.created_at)));
        if (isAdmin()) {
          var del = h('button', 'link', 'حذف'); del.type = 'button';
          del.addEventListener('click', function () { api('DELETE', 'announcements/' + n.id).then(function (r) { if (!r.ok) return oops(r); toast('تم حذف الملاحظة.'); go('#home'); }).catch(noop); });
          head.appendChild(del);
        }
        add(m, head, h('p', 'memo__body', n.body));
        box.appendChild(m);
      });
      p.appendChild(box);
    }
    if (isAdmin()) {
      var f = h('form', 'inline inline--wrap'); f.noValidate = true;
      var kind = select(NOTE_KIND, 'general'); kind.setAttribute('aria-label', 'نوع الملاحظة');
      var txt = input('text', { maxLength: 600, placeholder: 'اكتب ملاحظة لكل الموظفين…' }); txt.setAttribute('aria-label', 'نص الملاحظة');
      var b = h('button', 'btn btn--sm btn--solid', 'نشر'); b.type = 'submit';
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = txt.value.trim(); if (!v || b.disabled) return;
        b.disabled = true;
        api('POST', 'announcements', { kind: kind.value, body: v }).then(function (r) { b.disabled = false; if (!r.ok) return oops(r); toast('تم نشر الملاحظة.'); go('#home'); }).catch(function () { b.disabled = false; });
      });
      p.appendChild(add(f, kind, txt, b));
    }
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
    var addBtn = hlink('btn btn--sm btn--solid', 'إضافة طلب', '#leads/add');
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
        var rows = h('div', 'rows'); rows.appendChild(head);
        leads.forEach(function (l) { rows.appendChild(leadRow(l)); });
        p.appendChild(rows);
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
      var ph = h('span', 'phones'); var tel = h('a', 'ltr', l.phone); tel.href = 'tel:' + l.phone;
      add(ph, tel, link('واتساب', wa(l.phone, 'مرحباً ' + l.name + '، معك أوبسيديان ديزاين بخصوص طلبك.')));
      fact('الجوال', ph);
      fact('نوع المشروع', l.type || 'بدون نوع');
      fact('تاريخ الطلب', fmtDate(l.created_at));
      fact('المصدر', l.source === 'staff' ? 'أضافه الفريق' : 'من الموقع');
      add(p, top, facts);
      if (l.note) { p.appendChild(h('h3', 'sub', 'ملاحظة العميل')); p.appendChild(h('p', 'note', l.note)); }

      var ctl = h('div', 'form__two');
      var st = select(LEAD_STATUS, l.status);
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
      if (isAdmin()) add(ctl, field('الحالة', st), field('المسؤول', as));
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
      p.appendChild(add(h('div', 'quick'), reg));
      a1.appendChild(p);

      var pa = panel('مواعيد العميل');
      if (l.appointments && l.appointments.length) {
        var ra = h('div', 'rows');
        l.appointments.forEach(function (a) {
          var r = h('div', 'row row--plain'); var b = h('span', 'badge', APPT_STATUS[a.status] || a.status); b.dataset.s = a.status;
          add(r, h('span', 'row__name', fmtDay(a.date)), h('span', 'row__id', fmtTime(a.time)), b); ra.appendChild(r);
        });
        pa.appendChild(ra);
      } else pa.appendChild(empty('لا يوجد موعد محجوز.'));
      a1.appendChild(pa);

      var pn = panel('ملاحظات الفريق');
      var ul = h('ul', 'notes');
      function renderNotes(notes) {
        ul.textContent = '';
        if (!notes.length) ul.appendChild(h('li', 'empty', 'لا توجد ملاحظات بعد.'));
        notes.forEach(function (n) { var li = h('li', null, n.body); li.appendChild(h('small', null, (n.staff_name || '—') + ' · ' + fmtDate(n.created_at))); ul.appendChild(li); });
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
      a2.appendChild(pn);
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  /* ------------------------------------------------------------ customers */
  function star(c) { return c.vip ? h('span', 'star', '★ مميز') : null; }
  function customerRow(c) {
    var a = hlink('row row--cust', null, '#customer/' + c.id);
    var name = h('span', 'row__name', c.name);
    var tel = h('span', 'row__id ltr', c.phone);
    add(a, add(h('span', 'row__who'), name), tel, h('span', 'row__type', c.city || '—'), h('span', 'row__type', c.type || '—'), star(c) || h('span'));
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
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--solid', c.id ? 'حفظ التعديلات' : 'تسجيل العميل'); btn.type = 'submit';
    var r1 = h('div', 'form__two'); add(r1, field('الاسم', name), field('رقم الجوال', phone));
    var r2 = h('div', 'form__two'); add(r2, field('المدينة أو الحي', city), field('نوع المشروع', type));
    add(f, r1, r2, field('العنوان', address), field('ملاحظات', note), vl, err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      var payload = { name: name.value.trim(), phone: phone.value.trim(), city: city.value.trim(), type: type.value, address: address.value.trim(), note: note.value.trim(), vip: vip.checked };
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
    add(bar, tabs([['all', 'كل العملاء'], ['vip', 'المميزون']], tab, 'customers'), hlink('btn btn--sm btn--solid', 'عميل جديد', '#customers/add'));
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
    fetchPage(t, ['customers' + (tab === 'vip' ? '?vip=1' : tab === 'q' ? '?q=' + encodeURIComponent(q) : '')]).then(function (all) {
      var list = all[0].customers;
      var p = panel((tab === 'q' ? 'نتائج البحث عن «' + q + '»' : tab === 'vip' ? 'العملاء المميزون' : 'كل العملاء') + ' (' + list.length + ')');
      if (!list.length) p.appendChild(empty(tab === 'q' ? 'ما فيه عميل يطابق البحث.' : 'لا يوجد عملاء مسجلين بعد.'));
      else {
        var head = h('div', 'row row--cust row--head'); head.setAttribute('aria-hidden', 'true');
        add(head, h('span', null, 'العميل'), h('span', null, 'الجوال'), h('span', null, 'المدينة'), h('span', null, 'النوع'), h('span'));
        var rows = h('div', 'rows'); rows.appendChild(head);
        list.forEach(function (c) { rows.appendChild(customerRow(c)); });
        p.appendChild(rows);
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
      var top = h('div', 'lead__top'); add(top, h('h2', 'lead__name', c.name), star(c));
      var ph = h('span', 'phones'); var tel = h('a', 'ltr', c.phone); tel.href = 'tel:' + c.phone;
      add(ph, tel, link('واتساب', wa(c.phone, 'مرحباً ' + c.name + '، معك أوبسيديان ديزاين.')));
      add(p, top, ph, h('p', 'row__meta', 'سجّله ' + (c.creator_name || '—') + ' · ' + fmtDate(c.created_at)),
        customerForm(c, function () { toast('تم حفظ بيانات العميل.'); go('#customer/' + c.id); }));
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
      a2.appendChild(pl);
      var pa = panel('مواعيد العميل');
      if (res.appointments.length) {
        var ra = h('div', 'rows');
        res.appointments.forEach(function (a) {
          var r = h('div', 'row row--plain'); var b = h('span', 'badge', APPT_STATUS[a.status] || a.status); b.dataset.s = a.status;
          add(r, h('span', 'row__name', fmtDay(a.date)), h('span', 'row__id', fmtTime(a.time)), b); ra.appendChild(r);
        });
        pa.appendChild(ra);
      } else pa.appendChild(empty('لا يوجد موعد مسجل.'));
      a2.appendChild(pa);
      if (isAdmin()) {
        var pd = panel('حذف العميل');
        var del = h('button', 'btn btn--sm btn--danger', 'حذف'); del.type = 'button';
        var sure = false;
        del.addEventListener('click', function () {
          if (!sure) { sure = true; del.textContent = 'اضغط مرة ثانية للتأكيد'; return; }
          api('DELETE', 'customers/' + c.id).then(function (r) { if (!r.ok) return oops(r); toast('تم حذف العميل.'); go('#customers/all'); }).catch(noop);
        });
        a2.appendChild(add(pd, h('p', 'panel__hint', 'يحذف ملف العميل فقط. طلباته ومواعيده تبقى.'), del));
      }
      ui.body.appendChild(add(cols, a1, a2));
    }).catch(noop);
  };

  /* ------------------------------------------------------------ tasks */
  function taskRow(x, today, after, showOwner) {
    var r = h('div', 'row row--task'); r.dataset.s = x.status;
    var st = select(TASK_STATUS, x.status); st.setAttribute('aria-label', 'حالة المهمة: ' + x.title); st.dataset.s = x.status;
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
    if (isAdmin() || x.created_by === me.id) {
      var del = h('button', 'link', 'حذف'); del.type = 'button';
      del.addEventListener('click', function () { api('DELETE', 'tasks/' + x.id).then(function (res) { if (!res.ok) return oops(res); toast('تم حذف المهمة.'); after(); }).catch(noop); });
      act.appendChild(del);
    }
    return add(r, who, due, act);
  }

  PAGES.tasks = function (args, t) {
    var admin = isAdmin();
    var tab = args[0] === 'done' || (admin && args[0] === 'all') ? args[0] : 'mine';
    setTitle('المهام');
    var items = [['mine', 'مهامي']]; if (admin) items.push(['all', 'مهام الفريق']); items.push(['done', 'المنجزة']);
    ui.body.appendChild(add(h('div', 'toolbar'), tabs(items, tab, 'tasks')));
    var again = function () { go('#tasks/' + tab); };
    fetchPage(t, ['tasks' + (tab === 'done' ? '?done=1' + (admin ? '&all=1' : '') : tab === 'all' ? '?all=1' : '')]).then(function (all) {
      var res = all[0];
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = panel(({ mine: 'مهامي المفتوحة', all: 'مهام الفريق المفتوحة', done: 'المهام المنجزة' })[tab] + ' (' + res.tasks.length + ')');
      if (!res.tasks.length) p.appendChild(empty('لا يوجد.'));
      else { var rows = h('div', 'rows'); res.tasks.forEach(function (x) { rows.appendChild(taskRow(x, res.today, again, admin && tab !== 'mine')); }); p.appendChild(rows); }
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
    var ph = h('span', 'phones'); var tel = h('a', 'ltr', a.phone); tel.href = 'tel:' + a.phone;
    add(ph, tel, link('واتساب', wa(a.phone, 'مرحباً ' + a.name + '، نأكد موعد زيارتك لمعرض أوبسيديان ديزاين يوم ' + fmtDay(a.date) + ' الساعة ' + fmtTime(a.time) + '. ننتظرك.')));
    var st = select(APPT_STATUS, a.status); st.setAttribute('aria-label', 'حالة موعد ' + a.name); st.dataset.s = a.status;
    st.addEventListener('change', function () {
      api('PATCH', 'appointments/' + a.id, { status: st.value }).then(function (res) {
        if (!res.ok) { st.value = a.status; return oops(res); }
        a.status = st.value; st.dataset.s = st.value; toast('تم تحديث الموعد.');
      }).catch(noop);
    });
    var act = h('div', 'row__act');
    add(act, st, a.lead_id ? hlink('btn btn--sm', 'الطلب #' + a.lead_id, '#lead/' + a.lead_id) : null);
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
  function punch(kind, staffId, after) {
    api('POST', 'attendance/' + kind, staffId ? { staff_id: staffId } : {}).then(function (res) {
      if (!res.ok) return toast(res.error === 'already_in' ? 'الحضور مسجّل من قبل، وما انسجل انصراف بعده.' : res.error === 'not_in' ? 'ما فيه حضور مسجّل اليوم عشان ينسجل له انصراف.' : errText(res.error));
      toast(kind === 'in' ? 'تم تسجيل الحضور.' : 'تم تسجيل الانصراف.');
      after();
    }).catch(noop);
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
    var s = state(t.records, 'لم يُسجّل حضور');
    var head = h('div', 'panel__head'); add(head, h('h2', null, 'حضوري اليوم'), s.badge);
    p.appendChild(head);
    if (t.records.length) { var ul = h('ul', 'times'); t.records.slice().reverse().forEach(function (r) { ul.appendChild(h('li', null, recordLine(r))); }); p.appendChild(ul); }
    else p.appendChild(empty('ما سجّلت حضورك اليوم.'));
    var btn = h('button', 'btn btn--solid', s.open ? 'تسجيل انصراف' : 'تسجيل حضور'); btn.type = 'button';
    btn.addEventListener('click', function () { if (btn.disabled) return; btn.disabled = true; punch(s.open ? 'out' : 'in', null, after); setTimeout(function () { btn.disabled = false; }, 4000); });
    p.appendChild(btn);
    return p;
  }
  function tally(rows, today) {
    var days = {}, total = 0, missing = 0;
    rows.forEach(function (r) { (days[r.date] = days[r.date] || []).push(r); total += r.minutes; if (!r.out_at && r.date !== today) missing++; });
    return { days: days, keys: Object.keys(days).sort().reverse(), total: total, missing: missing };
  }
  function dayRows(tl) {
    var rows = h('div', 'rows');
    tl.keys.forEach(function (d) {
      var mins = tl.days[d].reduce(function (a, r) { return a + r.minutes; }, 0);
      var r = h('div', 'row row--day');
      add(r, h('span', 'row__name', fmtDay(d)),
        h('span', 'row__meta', tl.days[d].slice().reverse().map(function (x) { return fmtClock(x.in_at) + ' – ' + (x.out_at ? fmtClock(x.out_at) : '؟'); }).join('، ')),
        h('span', 'row__id', fmtDur(mins)));
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
    var admin = me.role === 'admin';
    var tab = admin && (args[0] === 'roll' || args[0] === 'report') ? args[0] : 'me';
    setTitle('الحضور والانصراف');
    if (admin) ui.body.appendChild(add(h('div', 'toolbar'), tabs([['me', 'حضوري'], ['roll', 'تحضير اليوم'], ['report', 'تقرير الشهر']], tab, 'att')));

    if (tab === 'roll') return fetchPage(t, ['attendance?all=1']).then(function (all) {
      var res = all[0];
      var p = panel('تحضير اليوم — ' + fmtDay(res.today));
      var rows = h('div', 'rows');
      res.staff.forEach(function (s) {
        var mine = res.records.filter(function (r) { return r.staff_id === s.id; });
        var st = state(mine, 'غائب');
        var r = h('div', 'row row--roll');
        var btn = h('button', 'btn btn--sm', st.open ? 'تسجيل انصراف' : 'تسجيل حضور'); btn.type = 'button';
        btn.addEventListener('click', function () { if (btn.disabled) return; btn.disabled = true; punch(st.open ? 'out' : 'in', s.id, function () { go('#att/roll'); }); setTimeout(function () { btn.disabled = false; }, 4000); });
        add(r, h('span', 'row__name', s.name), h('span', 'row__meta', mine.length ? mine.slice().reverse().map(recordLine).join('، ') : '—'), st.badge, btn);
        rows.appendChild(r);
      });
      ui.body.appendChild(add(p, rows));
    }).catch(noop);

    fetchPage(t, ['attendance']).then(function (all) {
      var today = all[0];
      var path = 'attendance?' + (tab === 'report' ? 'all=1&' : '') + 'from=' + monthStart(today.today) + '&to=' + today.today;
      return fetchPage(t, [path]).then(function (m) {
        var res = m[0];
        if (tab === 'report') {
          ui.body.appendChild(h('p', 'hello', 'من ' + fmtDay(res.from) + ' إلى ' + fmtDay(res.to)));
          res.staff.forEach(function (s) {
            var tl = tally(res.records.filter(function (r) { return r.staff_id === s.id; }), res.today);
            var d = h('details', 'panel fold');
            var sum = h('summary');
            add(sum, h('span', 'row__name', s.name), h('span', 'row__meta', 'أيام الحضور: ' + tl.keys.length + (tl.missing ? ' · بدون انصراف: ' + tl.missing : '')), h('span', 'badge', fmtDur(tl.total)));
            d.appendChild(sum);
            d.appendChild(tl.keys.length ? dayRows(tl) : empty('لا يوجد حضور مسجّل هذا الشهر.'));
            ui.body.appendChild(d);
          });
          return;
        }
        var tl = tally(res.records, res.today);
        var cols = h('div', 'cols');
        var a1 = h('div', 'col'), a2 = h('div', 'col');
        var pm = panel('هذا الشهر');
        pm.appendChild(miniStats([[tl.keys.length, 'أيام الحضور'], [fmtDur(tl.total).replace(' ساعة', ''), 'مجموع الساعات'], [tl.missing, 'مرات بدون انصراف']]));
        pm.appendChild(tl.keys.length ? dayRows(tl) : empty('لا يوجد حضور مسجّل هذا الشهر.'));
        a1.appendChild(pm);
        a2.appendChild(punchPanel(today, function () { go('#att/me'); }));
        ui.body.appendChild(add(cols, a1, a2));
      });
    }).catch(noop);
  };

  /* ------------------------------------------------------------ team & account */
  function loadUsers() { return api('GET', 'users').then(function (res) { if (res.ok) users = res.users; return users; }); }

  PAGES.team = function (_, t) {
    var admin = me.role === 'admin';
    setTitle('الفريق');
    var l0 = h('p', 'loading', 'جارٍ التحميل…'); ui.body.appendChild(l0);
    loadUsers().then(function () {
      if (!live(t)) return;
      l0.remove();
      var cols = h('div', 'cols');
      var a1 = h('div', 'col'), a2 = h('div', 'col');
      var p = panel('أعضاء الفريق (' + users.length + ')');
      var rows = h('div', 'rows');
      users.forEach(function (u) {
        var r = h('div', 'row row--user');
        var badge = h('span', 'badge', u.active ? 'فعّال' : 'موقوف'); badge.dataset.s = u.active ? 'confirmed' : 'closed';
        var who = h('div', 'row__who'); add(who, h('span', 'row__name', u.name), h('span', 'row__type ltr', u.username));
        add(r, who, h('span', 'row__meta', u.role === 'admin' ? 'مدير' : 'موظف'), badge);
        if (admin && u.id !== me.id) {
          var act = h('div', 'row__act');
          var tog = h('button', 'btn btn--sm', u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'); tog.type = 'button';
          tog.addEventListener('click', function () {
            api('PATCH', 'users/' + u.id, { active: !u.active }).then(function (res) { if (!res.ok) return oops(res); toast(u.active ? 'تم إيقاف حساب ' + u.name + '.' : 'تم تفعيل حساب ' + u.name + '.'); go('#team'); }).catch(noop);
          });
          var np = input('password', { placeholder: 'كلمة مرور جديدة', dir: 'ltr', autocomplete: 'new-password' }); np.setAttribute('aria-label', 'كلمة مرور جديدة لـ ' + u.name);
          var set = h('button', 'btn btn--sm', 'تغيير'); set.type = 'button';
          set.addEventListener('click', function () {
            api('PATCH', 'users/' + u.id, { password: np.value }).then(function (res) { if (!res.ok) return oops(res); np.value = ''; toast('تم تغيير كلمة مرور ' + u.name + '.'); }).catch(noop);
          });
          r.appendChild(add(act, np, set, tog));
        }
        rows.appendChild(r);
      });
      a1.appendChild(add(p, rows));
      if (admin) a2.appendChild(userForm());
      ui.body.appendChild(admin ? add(cols, a1, a2) : a1);
    }).catch(noop);
  };

  function userForm() {
    var p = panel('إضافة موظف');
    var f = h('form', 'form'); f.noValidate = true;
    var name = input('text', { required: true });
    var user = input('text', { dir: 'ltr', autocapitalize: 'none', spellcheck: false, autocomplete: 'off', required: true });
    var pass = input('password', { dir: 'ltr', autocomplete: 'new-password', required: true });
    var role = select({ staff: 'موظف', admin: 'مدير' }, 'staff');
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn btn--solid', 'إضافة'); btn.type = 'submit';
    add(f, field('الاسم', name), field('اسم المستخدم', user, 'أحرف إنجليزية صغيرة وأرقام.'), field('كلمة المرور', pass, '8 أحرف على الأقل. يقدر يغيّرها بعد الدخول.'), field('الصلاحية', role, 'المدير يضيف ويوقف الموظفين.'), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.textContent = ''; btn.disabled = true;
      api('POST', 'users', { name: name.value.trim(), username: user.value.trim(), password: pass.value, role: role.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); return; }
        toast('تمت إضافة ' + name.value.trim() + '.');
        go('#team');
      }).catch(function () { btn.disabled = false; });
    });
    return add(p, f);
  }

  PAGES.account = function () {
    setTitle('حسابي');
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
    [['الاسم', me.name], ['اسم المستخدم', me.username || '—'], ['الصلاحية', me.role === 'admin' ? 'مدير' : 'موظف']].forEach(function (x) {
      var d = h('div'); add(d, h('dt', null, x[0]), h('dd', null, x[1])); facts.appendChild(d);
    });
    var out = h('button', 'btn', 'تسجيل الخروج'); out.type = 'button'; out.addEventListener('click', logout);
    a2.appendChild(add(pi, facts, out));
    ui.body.appendChild(add(cols, a1, a2));
  };

  function toLatinDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x6f0; });
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
