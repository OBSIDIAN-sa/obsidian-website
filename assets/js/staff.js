/* OBSIDIAN DESIGN — staff console. Talks to /api/staff/*. Every customer-supplied string is written with
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

  /* ------------------------------------------------------------ console */
  function consoleView() {
    app.textContent = '';
    var c = h('div', 'console');
    var bar = h('header', 'bar');
    var logo = h('img'); logo.src = '../assets/img/logo-160.png'; logo.alt = ''; logo.width = 36; logo.height = 36;
    var title = h('div', 'bar__title');
    add(title, h('b', null, 'مساعد الفريق'), h('span', null, me.name + (me.role === 'admin' ? ' · مدير' : '')));
    var out = h('button', 'btn btn--sm btn--quiet', 'خروج'); out.type = 'button';
    out.addEventListener('click', function () { api('POST', 'logout', {}).then(function () { me = null; gate(false); }); });
    add(bar, logo, title, out);

    ui.log = h('div', 'log'); ui.log.setAttribute('role', 'log'); ui.log.setAttribute('aria-live', 'polite'); ui.log.tabIndex = 0;

    var chips = h('nav', 'chips'); chips.setAttribute('aria-label', 'اختصارات');
    var list = [
      ['الملخص', showSummary], ['طلبات جديدة', function () { showLeads('status=new', 'الطلبات الجديدة') }],
      ['الطلبات المفتوحة', function () { showLeads('status=open', 'الطلبات المفتوحة') }], ['طلباتي', function () { showLeads('mine=1', 'الطلبات المسندة لك') }],
      ['مواعيد اليوم', function () { showAppts('today', 'مواعيد اليوم') }], ['مواعيد الأسبوع', function () { showAppts('week', 'مواعيد الأسبوع') }],
      ['إضافة طلب', addLeadForm], ['الموظفون', showUsers], ['كلمة المرور', passwordForm],
    ];
    list.forEach(function (it) {
      var b = h('button', 'chip', it[0]); b.type = 'button';
      b.addEventListener('click', function () { if (!busy) { echo(it[0]); it[1](); } });
      chips.appendChild(b);
    });

    var ask = h('form', 'ask'); ask.noValidate = true;
    ui.input = h('input'); ui.input.type = 'text'; ui.input.maxLength = 500; ui.input.autocomplete = 'off';
    ui.input.placeholder = 'اسأل، أو ابحث باسم أو جوال أو رقم طلب…';
    ui.input.setAttribute('aria-label', ui.input.placeholder);
    var send = h('button'); send.type = 'submit'; send.setAttribute('aria-label', 'إرسال');
    send.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="square"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
    add(ask, ui.input, send);
    ask.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = ui.input.value.trim();
      if (!v || busy) return;
      ui.input.value = '';
      echo(v);
      onText(v);
    });

    add(app, add(c, bar, ui.log, chips, ask));
    app.setAttribute('aria-busy', 'false');
    say('هلا ' + me.name.split(' ')[0] + '. هذا وضع اليوم:');
    showSummary();
    ui.input.focus();
  }

  function scroll(node) { if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start' }); else ui.log.scrollTop = ui.log.scrollHeight; }
  function say(text) { var m = h('div', 'msg msg--bot', text); ui.log.appendChild(m); ui.log.scrollTop = ui.log.scrollHeight; return m; }
  function echo(text) { ui.log.appendChild(h('div', 'msg msg--user', text)); ui.log.scrollTop = ui.log.scrollHeight; }
  function wide(node) { var m = h('div', 'msg msg--wide'); m.appendChild(node); ui.log.appendChild(m); scroll(m); return m; }
  function typing(on) {
    busy = on;
    if (ui.typing) { ui.typing.remove(); ui.typing = null; }
    if (on) { ui.typing = add(h('div', 'typing'), h('i'), h('i'), h('i')); ui.log.appendChild(ui.typing); ui.log.scrollTop = ui.log.scrollHeight; }
  }
  function load(method, path, payload) {
    typing(true);
    return api(method, path, payload).then(function (res) { typing(false); return res; }, function (e) { typing(false); throw e; });
  }
  function oops(res) { say(errText(res && res.error)); }

  /* ------------------------------------------------------------ summary */
  function showSummary() {
    load('GET', 'summary').then(function (res) {
      if (!res.ok) return oops(res);
      var s = res.summary;
      var grid = h('div', 'stats');
      function stat(n, label, act) {
        var b = h('button', 'stat'); b.type = 'button';
        add(b, h('b', null, String(n)), h('span', null, label));
        b.addEventListener('click', function () { if (!busy) { echo(label); act(); } });
        grid.appendChild(b);
      }
      stat(s.counts.new, 'طلبات جديدة', function () { showLeads('status=new', 'الطلبات الجديدة'); });
      stat(s.total - s.counts.won - s.counts.closed, 'طلبات مفتوحة', function () { showLeads('status=open', 'الطلبات المفتوحة'); });
      stat(s.today_appointments, 'مواعيد اليوم', function () { showAppts('today', 'مواعيد اليوم'); });
      stat(s.upcoming_appointments, 'مواعيد قادمة', function () { showAppts('upcoming', 'المواعيد القادمة'); });
      stat(s.pending_appointments, 'بانتظار التأكيد', function () { showAppts('upcoming', 'المواعيد القادمة'); });
      stat(s.week, 'طلبات آخر 7 أيام', function () { showLeads('', 'آخر الطلبات'); });
      wide(grid);
    }).catch(function () {});
  }

  /* ------------------------------------------------------------ leads */
  function showLeads(query, title) {
    return load('GET', 'leads' + (query ? '?' + query : '')).then(function (res) {
      if (!res.ok) return oops(res);
      if (!res.leads.length) { say(title + ': لا يوجد.'); return 0; }
      say(title + ' (' + res.leads.length + '):');
      var box = h('div', 'cards');
      res.leads.forEach(function (l) { box.appendChild(leadCard(l, false)); });
      wide(box);
      return res.leads.length;
    }).catch(function () { return 0; });
  }

  function leadCard(l, full) {
    var card = h('article', 'card');
    var top = h('div', 'card__top');
    var badge = h('span', 'badge', LEAD_STATUS[l.status] || l.status); badge.dataset.s = l.status;
    add(top, h('span', 'card__id', '#' + l.id), h('span', 'card__name', l.name), h('span', 'card__meta', l.type || 'بدون نوع'), badge);
    card.appendChild(top);
    card.appendChild(h('p', 'card__meta', fmtDate(l.created_at) + (l.source === 'staff' ? ' · أضافه الفريق' : ' · من الموقع') + (l.assigned_name ? ' · مسند إلى ' + l.assigned_name : '')));
    card.appendChild(phoneRow(l.phone, 'مرحباً ' + l.name + '، معك أوبسيديان ديزاين بخصوص طلبك.'));
    if (l.note) card.appendChild(h('p', 'card__note', l.note));

    var row = h('div', 'card__row');
    var st = select(LEAD_STATUS, l.status); st.setAttribute('aria-label', 'حالة الطلب #' + l.id);
    st.addEventListener('change', function () {
      api('PATCH', 'leads/' + l.id, { status: st.value }).then(function (res) {
        if (!res.ok) { st.value = l.status; return oops(res); }
        l.status = st.value; badge.textContent = LEAD_STATUS[st.value]; badge.dataset.s = st.value;
      }).catch(function () {});
    });
    row.appendChild(st);
    if (!full) {
      var more = h('button', 'btn btn--sm', 'التفاصيل والملاحظات'); more.type = 'button';
      more.addEventListener('click', function () { if (!busy) openLead(l.id); });
      row.appendChild(more);
    }
    card.appendChild(row);
    if (!full) return card;

    // assignment
    var opts = { '': 'غير مسند' };
    users.filter(function (u) { return u.active; }).forEach(function (u) { opts[u.id] = u.name; });
    var as = select(opts, l.assigned_to == null ? '' : String(l.assigned_to)); as.setAttribute('aria-label', 'إسناد الطلب');
    as.addEventListener('change', function () {
      api('PATCH', 'leads/' + l.id, { assigned_to: as.value === '' ? null : +as.value }).then(function (res) { if (!res.ok) oops(res); }).catch(function () {});
    });
    row.appendChild(as);

    if (l.appointments && l.appointments.length) {
      var sa = h('div', 'card__sub'); sa.appendChild(h('h3', null, 'المواعيد'));
      l.appointments.forEach(function (a) { sa.appendChild(h('p', 'card__note', fmtDay(a.date) + ' — ' + fmtTime(a.time) + ' · ' + (APPT_STATUS[a.status] || a.status))); });
      card.appendChild(sa);
    }
    var sn = h('div', 'card__sub'); sn.appendChild(h('h3', null, 'الملاحظات'));
    var ul = h('ul', 'notes');
    function renderNotes(notes) {
      ul.textContent = '';
      if (!notes.length) ul.appendChild(h('li', 'card__meta', 'لا توجد ملاحظات بعد.'));
      notes.forEach(function (n) { var li = h('li', null, n.body); li.appendChild(h('small', null, (n.staff_name || '—') + ' · ' + fmtDate(n.created_at))); ul.appendChild(li); });
    }
    renderNotes(l.notes || []);
    var nf = h('form', 'card__row'); nf.noValidate = true;
    var ni = input('text', { maxLength: 800, placeholder: 'اكتب ملاحظة…' }); ni.setAttribute('aria-label', 'ملاحظة جديدة');
    var nb = h('button', 'btn btn--sm', 'حفظ'); nb.type = 'submit';
    nf.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = ni.value.trim(); if (!v) return;
      nb.disabled = true;
      api('POST', 'leads/' + l.id + '/notes', { body: v }).then(function (res) {
        nb.disabled = false;
        if (!res.ok) return oops(res);
        ni.value = ''; renderNotes(res.lead.notes);
      }).catch(function () { nb.disabled = false; });
    });
    add(nf, ni, nb);
    add(sn, ul, nf);
    card.appendChild(sn);
    return card;
  }

  function openLead(id) {
    return load('GET', 'leads/' + id).then(function (res) {
      if (!res.ok) { say('ما لقيت طلب بالرقم #' + id + '.'); return; }
      wide(leadCard(res.lead, true));
    }).catch(function () {});
  }

  function addLeadForm() {
    var f = h('form', 'card formcard'); f.noValidate = true;
    var name = input('text', { required: true });
    var phone = input('tel', { dir: 'ltr', inputMode: 'tel', required: true });
    var typeOpts = { '': 'اختر نوع المشروع' }; TYPES.forEach(function (x) { typeOpts[x] = x; });
    var type = select(typeOpts, '');
    var note = input('textarea', { maxLength: 600 });
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn', 'حفظ الطلب'); btn.type = 'submit';
    add(f, h('h2', null, 'طلب جديد (عميل حضر أو اتصل)'), field('الاسم', name), field('رقم الجوال', phone), field('نوع المشروع', type), field('ملاحظات', note), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = ''; btn.disabled = true;
      api('POST', 'leads', { name: name.value.trim(), phone: phone.value.trim(), type: type.value, note: note.value.trim() }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); return; }
        f.parentNode.remove();
        say('تم حفظ الطلب #' + res.lead.id + '.');
        wide(leadCard(res.lead, true));
      }).catch(function () { btn.disabled = false; });
    });
    wide(f); name.focus();
  }

  /* ------------------------------------------------------------ appointments */
  function showAppts(range, title) {
    load('GET', 'appointments?range=' + range).then(function (res) {
      if (!res.ok) return oops(res);
      if (!res.appointments.length) return say(title + ': لا يوجد.');
      say(title + ' (' + res.appointments.length + '):');
      var box = h('div', 'cards');
      var lastDay = '';
      res.appointments.forEach(function (a) {
        if (a.date !== lastDay) { lastDay = a.date; box.appendChild(h('p', 'day', (a.date === res.today ? 'اليوم — ' : '') + fmtDay(a.date))); }
        box.appendChild(apptCard(a));
      });
      wide(box);
    }).catch(function () {});
  }
  function apptCard(a) {
    var card = h('article', 'card');
    var top = h('div', 'card__top');
    var badge = h('span', 'badge', APPT_STATUS[a.status] || a.status); badge.dataset.s = a.status;
    add(top, h('span', 'card__id', fmtTime(a.time)), h('span', 'card__name', a.name), h('span', 'card__meta', a.lead_type || ''), badge);
    card.appendChild(top);
    card.appendChild(phoneRow(a.phone, 'مرحباً ' + a.name + '، نأكد موعد زيارتك لمعرض أوبسيديان ديزاين يوم ' + fmtDay(a.date) + ' الساعة ' + fmtTime(a.time) + '. ننتظرك.'));
    var row = h('div', 'card__row');
    var st = select(APPT_STATUS, a.status); st.setAttribute('aria-label', 'حالة الموعد');
    st.addEventListener('change', function () {
      api('PATCH', 'appointments/' + a.id, { status: st.value }).then(function (res) {
        if (!res.ok) { st.value = a.status; return oops(res); }
        a.status = st.value; badge.textContent = APPT_STATUS[st.value]; badge.dataset.s = st.value;
      }).catch(function () {});
    });
    row.appendChild(st);
    if (a.lead_id) {
      var b = h('button', 'btn btn--sm', 'الطلب #' + a.lead_id); b.type = 'button';
      b.addEventListener('click', function () { if (!busy) openLead(a.lead_id); });
      row.appendChild(b);
    }
    card.appendChild(row);
    return card;
  }

  /* ------------------------------------------------------------ users & password */
  function loadUsers() { return api('GET', 'users').then(function (res) { if (res.ok) users = res.users; return users; }); }
  function showUsers() {
    typing(true);
    loadUsers().then(function () {
      typing(false);
      var box = h('div', 'cards');
      users.forEach(function (u) {
        var card = h('article', 'card');
        var top = h('div', 'card__top');
        var badge = h('span', 'badge', u.active ? 'فعّال' : 'موقوف'); badge.dataset.s = u.active ? 'confirmed' : 'closed';
        add(top, h('span', 'card__name', u.name), h('span', 'card__meta ltr', u.username), h('span', 'card__meta', u.role === 'admin' ? 'مدير' : 'موظف'), badge);
        card.appendChild(top);
        if (me.role === 'admin' && u.id !== me.id) {
          var row = h('div', 'card__row');
          var tog = h('button', 'btn btn--sm', u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'); tog.type = 'button';
          tog.addEventListener('click', function () {
            api('PATCH', 'users/' + u.id, { active: !u.active }).then(function (res) { if (!res.ok) return oops(res); echo(tog.textContent + ': ' + u.name); showUsers(); }).catch(function () {});
          });
          var np = input('password', { placeholder: 'كلمة مرور جديدة', dir: 'ltr', autocomplete: 'new-password' }); np.setAttribute('aria-label', 'كلمة مرور جديدة لـ ' + u.name);
          var set = h('button', 'btn btn--sm', 'تغيير'); set.type = 'button';
          set.addEventListener('click', function () {
            api('PATCH', 'users/' + u.id, { password: np.value }).then(function (res) { if (!res.ok) return oops(res); np.value = ''; say('تم تغيير كلمة مرور ' + u.name + '.'); }).catch(function () {});
          });
          card.appendChild(add(row, tog, np, set));
        }
        box.appendChild(card);
      });
      wide(box);
      if (me.role === 'admin') addUserForm();
    }).catch(function () { typing(false); });
  }
  function addUserForm() {
    var f = h('form', 'card formcard'); f.noValidate = true;
    var name = input('text', { required: true });
    var user = input('text', { dir: 'ltr', autocapitalize: 'none', spellcheck: false, autocomplete: 'off', required: true });
    var pass = input('password', { dir: 'ltr', autocomplete: 'new-password', required: true });
    var role = select({ staff: 'موظف', admin: 'مدير' }, 'staff');
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn', 'إضافة'); btn.type = 'submit';
    add(f, h('h2', null, 'إضافة موظف'), field('الاسم', name), field('اسم المستخدم', user, 'أحرف إنجليزية صغيرة وأرقام.'), field('كلمة المرور', pass, '8 أحرف على الأقل. يقدر يغيّرها بعد الدخول.'), field('الصلاحية', role, 'المدير يضيف ويوقف الموظفين.'), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = ''; btn.disabled = true;
      api('POST', 'users', { name: name.value.trim(), username: user.value.trim(), password: pass.value, role: role.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = errText(res.error); return; }
        say('تمت إضافة ' + name.value.trim() + '.');
        showUsers();
      }).catch(function () { btn.disabled = false; });
    });
    wide(f);
  }
  function passwordForm() {
    var f = h('form', 'card formcard'); f.noValidate = true;
    var cur = input('password', { dir: 'ltr', autocomplete: 'current-password', required: true });
    var nw = input('password', { dir: 'ltr', autocomplete: 'new-password', required: true });
    var err = h('p', 'err'); err.setAttribute('role', 'alert');
    var btn = h('button', 'btn', 'تغيير كلمة المرور'); btn.type = 'submit';
    add(f, h('h2', null, 'تغيير كلمة المرور'), field('كلمة المرور الحالية', cur), field('كلمة المرور الجديدة', nw, '8 أحرف على الأقل.'), err, btn);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = ''; btn.disabled = true;
      api('POST', 'password', { password: cur.value, new_password: nw.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = res.error === 'credentials' ? 'كلمة المرور الحالية غير صحيحة.' : errText(res.error); return; }
        f.parentNode.remove(); say('تم تغيير كلمة المرور.');
      }).catch(function () { btn.disabled = false; });
    });
    wide(f); cur.focus();
  }

  /* ------------------------------------------------------------ free text: search first, then ask */
  function toLatinDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x6f0; });
  }
  function onText(text) {
    var q = toLatinDigits(text).replace(/^(بحث|ابحث|دور|search)\s*(عن)?\s*/i, '').trim();
    var digits = q.replace(/\D/g, '');
    var idOnly = /^(#|طلب\s*#?|رقم\s*#?)\s*\d{1,6}$/.test(q) || /^\d{1,3}$/.test(q);
    if (idOnly) return openLead(+digits);
    var looksLikeSearch = digits.length >= 4 || (q !== text) || (q.split(/\s+/).length <= 2 && !/[؟?]|^(كم|وش|ايش|إيش|متى|مين|من|هل|ليش|كيف|اعطني|عطني|لخص)/.test(q));
    if (!looksLikeSearch) return ask(text);
    showLeads('q=' + encodeURIComponent(q), 'نتائج البحث عن «' + q + '»').then(function (n) { if (!n && digits.length < 4) ask(text); });
  }
  function ask(question) {
    load('POST', 'ask', { question: question }).then(function (res) {
      if (res.ok && res.reply) return say(res.reply);
      say('المساعد الذكي غير متاح الآن (ممكن خلص حد اليوم). استخدم الاختصارات تحت أو ابحث باسم العميل أو جواله.');
    }).catch(function () {});
  }

  /* ------------------------------------------------------------ boot */
  function boot() {
    api('GET', 'me').then(function (res) {
      if (!res.ok) { app.textContent = ''; app.appendChild(h('p', 'gate', errText(res.error))); app.setAttribute('aria-busy', 'false'); return; }
      if (!res.user) return gate(!!res.needs_setup);
      me = res.user;
      loadUsers().then(consoleView, consoleView);
    }).catch(function () { app.textContent = ''; app.appendChild(h('p', 'gate', 'تعذر الاتصال. حدّث الصفحة.')); });
  }
  boot();
})();
