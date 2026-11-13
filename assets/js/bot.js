/* OBSIDIAN DESIGN — site assistant.
   Buttons run the fixed jobs (register a request, book a visit, common questions); free text goes to /api/chat.
   Facts come from CONTENT.md. No prices, no lead times, no payment terms — here or from the AI. */
(function () {
  'use strict';
  var root = document.documentElement;
  var API = '/api/';
  var WA_NUMBER = (window.WA && window.WA.number) || '966579385265';
  var MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Obsidian+Design+Saihat&query_place_id=ChIJSXX3sh7_ST4R4oD0fokqZiQ';

  var T = {
    ar: {
      launch: 'اسأل أوبسيديان',
      name: 'أوبسيديان ديزاين',
      sub: 'مساعد المعرض',
      close: 'إغلاق المحادثة',
      placeholder: 'اكتب سؤالك…',
      send: 'إرسال',
      hello: 'حيّاك الله في أوبسيديان ديزاين.\nأقدر أجاوب على أسئلتك، أسجّل طلبك، أو أحجز لك زيارة للمعرض.',
      menu_faq: 'أسئلة شائعة',
      menu_lead: 'سجّل طلب',
      menu_book: 'احجز زيارة للمعرض',
      menu_wa: 'واتساب',
      menu_back: 'القائمة الرئيسية',
      cancel: 'إلغاء',
      skip: 'تخطي',
      faq_intro: 'اختر السؤال:',
      faq: [
        ['كيف تبدأ العملية؟', 'تتواصل معنا، نحدد موعد زيارة للموقع، نرفع المقاسات ونشوف الكهرباء والسباكة والفتحات. بعدها نرسم تصميماً كاملاً ونراجعه معك حتى تعتمده — وما يُقص أي لوح قبل الاعتماد.'],
        ['كم الأسعار؟', null],
        ['وش الضمان؟', 'الضمان: 10 سنوات على الخشب، 22 سنة على مفصلات بلوم، و5 سنوات على الإكسسوارات.'],
        ['الخامات والعلامات', 'من العلامات التي نعمل معها:\nالألواح والأخشاب: EGGER · CLEAF · SAVIOLA · SMART WOOD\nالمفصلات والإكسسوارات: BLUM · HÄFELE · TALLSEN · NUOMI\nالأجهزة: TEKA من المصدر المعتمد عبداللطيف جميل للإلكترونيات.\nوعلامات أخرى كثيرة نعرضها لك عند زيارتك للمعرض.'],
        ['الموقع وأوقات الدوام', null],
        ['مساحتي غير قياسية', 'هذي حالتنا الطبيعية. ما نشتغل بمقاسات جاهزة أصلاً، فالمساحة الصعبة تُرسم وتُصنّع على وضعها بالضبط بدل ما نجبرها على قطعة جاهزة.'],
        ['كيف تصنعون القطع؟', 'نستخدم في التصنيع أحدث وأفضل الأجهزة الخاصة بقص الخشب، فكل لوح يُقص بدقة عالية حسب المخطط المعتمد، ثم يُجمّع ويُراجع قطعة قطعة قبل التركيب.'],
        ['وش خدماتكم؟', 'نفصّل المطابخ، الخزائن وغرف الملابس، والحلول الداخلية: وحدات تلفزيون، مكتبات، ألواح جدارية ووحدات مداخل. ما عندنا قطعة جاهزة — كل شي يُرسم ويُصنّع على مقاس مساحتك.'],
      ],
      price: 'السعر يعتمد على المقاسات والخامات والتصميم، فما نعطي رقم قبل ما نرفع المقاسات ونعرف طلبك. سجّل طلبك أو احجز زيارة للمعرض ونجهّز لك عرض على مساحتك.',
      where: 'المعرض في سيهات، المنطقة الشرقية: شارع الخليج، حي النسيم.\nالدوام: من الأحد إلى الخميس 9 ص – 12 م و4 – 10 م. السبت 4 – 10 م. الجمعة مغلق.',
      map: 'الموقع على خرائط قوقل',
      wa_msg: 'تقدر تكلّمنا مباشرة على الواتساب:',
      wa_open: 'فتح واتساب',
      ask_name: 'تمام. وش الاسم الكريم؟',
      privacy: 'بياناتك نستخدمها للتواصل معك بخصوص طلبك فقط.',
      bad_name: 'اكتب اسمك لو سمحت.',
      ask_phone: 'ورقم الجوال؟',
      bad_phone: 'الرقم غير صحيح. اكتبه بهذا الشكل: 05XXXXXXXX',
      ask_type: 'وش نوع المشروع؟',
      types: ['مطبخ', 'خزائن وغرف ملابس', 'حلول داخلية', 'أكثر من واحد'],
      pick: 'اختر من الخيارات لو سمحت.',
      ask_note: 'عندك تفاصيل تبي تضيفها؟ اكتبها، أو اضغط تخطي.',
      sending: 'جارٍ الإرسال…',
      lead_ok: 'وصلنا طلبك يا {name}. بنتواصل معك قريباً.',
      lead_next: 'تبي تحجز زيارة للمعرض بعد؟',
      send_fail: 'ما وصل الطلب. جرّب مرة ثانية أو راسلنا على واتساب.',
      slow: 'وصلتنا طلبات كثيرة من عندك. جرّب بعد شوي أو راسلنا على واتساب.',
      book_as: 'بنحجز باسم {name} — {phone}.',
      book_change: 'تغيير الاسم أو الرقم',
      book_loading: 'أشوف المواعيد المتاحة…',
      book_none: 'ما فيه مواعيد متاحة حالياً. راسلنا على واتساب ونرتب لك موعد.',
      ask_day: 'أي يوم يناسبك؟',
      more_days: 'أيام أكثر',
      ask_time: 'وأي وقت يوم {day}؟',
      other_day: 'يوم ثاني',
      confirm_q: 'نأكد الحجز؟\n{day} — الساعة {time}\nالاسم: {name}\nالجوال: {phone}',
      confirm: 'تأكيد',
      book_ok: 'تم حجز موعدك: {day} — الساعة {time}.\nبنأكد عليك على الواتساب قبل الموعد. ننتظرك في المعرض.',
      slot_taken: 'هذا الوقت انحجز قبل شوي. اختر وقت ثاني.',
      already_booked: 'عندك موعد محجوز بهذا الرقم. لو تبي تغيّره راسلنا على واتساب.',
      time: 'المدة تعتمد على التصميم وحجم العمل، والفريق يعطيك الجدول بعد اعتماد التصميم. سجّل طلبك أو احجز زيارة ونوضح لك كل شي.',
      thinking_fail: 'ما قدرت أجاوب على هذا السؤال الآن. تقدر تختار من القائمة أو تكلّمنا على الواتساب.',
      am: 'ص', pm: 'م',
      locale: 'ar-SA-u-ca-gregory-nu-latn',
    },
    en: {
      launch: 'Ask Obsidian',
      name: 'Obsidian Design',
      sub: 'Showroom assistant',
      close: 'Close chat',
      placeholder: 'Type your question…',
      send: 'Send',
      hello: 'Welcome to Obsidian Design.\nI can answer your questions, register your request, or book you a showroom visit.',
      menu_faq: 'Common questions',
      menu_lead: 'Register a request',
      menu_book: 'Book a showroom visit',
      menu_wa: 'WhatsApp',
      menu_back: 'Main menu',
      cancel: 'Cancel',
      skip: 'Skip',
      faq_intro: 'Choose a question:',
      faq: [
        ['How does the process start?', 'You get in touch, we book a site visit, take the measurements and check the electrics, plumbing and openings. Then we draw a full design and review it with you until you approve it — and no board is cut before that.'],
        ['What are your prices?', null],
        ['What is the warranty?', 'Warranty: 10 years on the timber, 22 years on Blum hinges, and 5 years on the accessories.'],
        ['Materials and brands', 'Brands we work with:\nPanels & timber: EGGER · CLEAF · SAVIOLA · SMART WOOD\nHinges & accessories: BLUM · HÄFELE · TALLSEN · NUOMI\nAppliances: TEKA, from the authorised source Abdul Latif Jameel Electronics.\nAnd many more we\'ll show you when you visit the showroom.'],
        ['Location and opening hours', null],
        ['My space is non-standard', 'That\'s our normal case. We don\'t work to stock sizes at all, so a difficult space gets drawn and built exactly as it is, instead of being forced into a ready-made unit.'],
        ['How are the pieces made?', 'Our manufacturing uses the latest and best wood-cutting machinery, so every panel is cut with high precision to the approved drawing, then assembled and checked piece by piece before installation.'],
        ['What do you make?', 'Bespoke kitchens, wardrobes and dressing rooms, and interior solutions: media units, libraries, wall panelling and entrance units. Nothing is off the shelf — everything is drawn and built to your space.'],
      ],
      price: 'The price depends on the measurements, the materials and the design, so we don\'t give a figure before we measure and understand what you need. Register your request or book a showroom visit and we\'ll prepare an offer for your space.',
      where: 'The showroom is in Saihat, Eastern Province: Al Khaleej Street, Al Naseem District.\nHours: Sunday to Thursday 9 AM – 12 PM and 4 – 10 PM. Saturday 4 – 10 PM. Closed on Friday.',
      map: 'Find us on Google Maps',
      wa_msg: 'You can message us directly on WhatsApp:',
      wa_open: 'Open WhatsApp',
      ask_name: 'Certainly. May I have your name?',
      privacy: 'We use your details only to contact you about your request.',
      bad_name: 'Please type your name.',
      ask_phone: 'And your mobile number?',
      bad_phone: 'That number doesn\'t look right. Please write it like this: 05XXXXXXXX',
      ask_type: 'What kind of project is it?',
      types: ['Kitchen', 'Wardrobes & Dressing Rooms', 'Interior Solutions', 'More than one'],
      pick: 'Please choose one of the options.',
      ask_note: 'Any details you\'d like to add? Type them, or press Skip.',
      sending: 'Sending…',
      lead_ok: 'We\'ve got your request, {name}. We\'ll be in touch shortly.',
      lead_next: 'Would you like to book a showroom visit as well?',
      send_fail: 'That didn\'t go through. Try again, or message us on WhatsApp.',
      slow: 'We\'ve received several requests from you. Please try again later or message us on WhatsApp.',
      book_as: 'Booking for {name} — {phone}.',
      book_change: 'Change name or number',
      book_loading: 'Checking available times…',
      book_none: 'There are no times available right now. Message us on WhatsApp and we\'ll arrange a visit.',
      ask_day: 'Which day suits you?',
      more_days: 'More days',
      ask_time: 'And what time on {day}?',
      other_day: 'Another day',
      confirm_q: 'Shall we confirm?\n{day} — {time}\nName: {name}\nMobile: {phone}',
      confirm: 'Confirm',
      book_ok: 'Your visit is booked: {day} — {time}.\nWe\'ll confirm with you on WhatsApp before the visit. We look forward to seeing you.',
      slot_taken: 'That time has just been taken. Please choose another.',
      already_booked: 'There\'s already a visit booked with this number. To change it, message us on WhatsApp.',
      time: 'The timeline depends on the design and the size of the work; the team gives you the schedule once the design is approved. Register your request or book a visit and we\'ll walk you through it.',
      thinking_fail: 'I couldn\'t answer that just now. You can choose from the menu or message us on WhatsApp.',
      am: 'AM', pm: 'PM',
      locale: 'en-GB',
    },
  };
  // Arabic type names are what staff read, whatever language the visitor used
  var TYPES_AR = T.ar.types;

  var lang = root.lang === 'en' ? 'en' : 'ar';
  var t = function (k) { return T[lang][k]; };
  var fill = function (s, o) { return s.replace(/\{(\w+)\}/g, function (m, k) { return o[k] == null ? '' : o[k]; }); };

  var el = {};       // DOM
  var built = false;
  var busy = false;
  var flow = null;   // { name: 'lead' | 'book', step: '...' }
  var data = {};     // name, phone, typeIdx, note, date, time
  var days = [];     // from /api/days
  var history = [];  // for the AI: [{role, content}]
  var chipActs = [];

  /* ------------------------------------------------------------ utils */
  function toLatinDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x6f0; });
  }
  function normPhone(raw) {
    var p = toLatinDigits(raw || '').replace(/[^\d+]/g, '');
    if (p.charAt(0) === '+') p = p.slice(1);
    if (p.indexOf('00') === 0) p = p.slice(2);
    if (p.indexOf('966') === 0) p = '0' + p.slice(3);
    if (/^5\d{8}$/.test(p)) p = '0' + p;
    return /^05\d{8}$/.test(p) ? p : null;
  }
  function dayLabel(dateStr) {
    try {
      return new Intl.DateTimeFormat(t('locale'), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(dateStr + 'T00:00:00Z'));
    } catch (e) { return dateStr; }
  }
  function timeLabel(hhmm) {
    var h = +hhmm.slice(0, 2);
    return ((h + 11) % 12 + 1) + ':' + hhmm.slice(3) + ' ' + (h < 12 ? t('am') : t('pm'));
  }
  function waLink(text) {
    return 'https://wa.me/' + WA_NUMBER + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function post(path, payload) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'server' }; }); });
  }
  // Staff still get the email they're used to (same FormSubmit alias as the site form). Best effort.
  function notifyEmail(subject, fields) {
    var endpoint = window.LEADS && window.LEADS.endpoint;
    if (!endpoint) return;
    fields._subject = subject;
    fields._template = 'table';
    fields._captcha = 'false';
    try {
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(fields) }).catch(function () {});
    } catch (e) {}
  }

  /* ------------------------------------------------------------ DOM */
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(path, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.25');
    s.setAttribute('stroke-linecap', 'square');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    s.appendChild(p);
    return s;
  }

  function buildLauncher() {
    el.launch = h('button', 'bot-launch');
    el.launch.type = 'button';
    el.launch.setAttribute('aria-haspopup', 'dialog');
    el.launch.setAttribute('aria-expanded', 'false');
    el.launch.appendChild(svg('M4 5h16v11H9l-5 4V5Z', 22));
    el.launchLabel = h('span', null, t('launch'));
    el.launch.appendChild(el.launchLabel);
    el.launch.addEventListener('click', open);
    document.body.appendChild(el.launch);
  }

  function buildPanel() {
    built = true;
    el.panel = h('section', 'bot');
    el.panel.setAttribute('role', 'dialog');
    el.panel.setAttribute('aria-modal', 'false');

    var head = h('header', 'bot__head');
    var logo = h('img', 'bot__logo');
    logo.src = 'assets/img/logo-160.png'; logo.alt = ''; logo.width = 36; logo.height = 36;
    var title = h('div', 'bot__title');
    el.name = h('span', 'bot__name');
    el.sub = h('span', 'bot__sub');
    title.appendChild(el.name); title.appendChild(el.sub);
    el.close = h('button', 'bot__close');
    el.close.type = 'button';
    el.close.appendChild(svg('M6 6l12 12M18 6L6 18', 20));
    el.close.addEventListener('click', close);
    head.appendChild(logo); head.appendChild(title); head.appendChild(el.close);

    el.log = h('div', 'bot__log');
    el.log.setAttribute('role', 'log');
    el.log.setAttribute('aria-live', 'polite');
    el.log.tabIndex = 0;

    el.chips = h('div', 'bot__chips');

    el.form = h('form', 'bot__form');
    el.form.noValidate = true;
    el.input = h('input', 'bot__input');
    el.input.type = 'text'; el.input.autocomplete = 'off'; el.input.maxLength = 500; el.input.enterKeyHint = 'send';
    el.send = h('button', 'bot__send');
    el.send.type = 'submit';
    el.send.appendChild(svg('M4 12h15M13 6l6 6-6 6', 20));
    el.form.appendChild(el.input); el.form.appendChild(el.send);
    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = el.input.value.trim();
      if (!v || busy) return;
      el.input.value = '';
      onText(v);
    });

    el.panel.appendChild(head); el.panel.appendChild(el.log); el.panel.appendChild(el.chips); el.panel.appendChild(el.form);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('bot-open')) close(); });
    document.body.appendChild(el.panel);
    labels();
    say(t('hello'));
    mainMenu();
  }

  function labels() {
    if (el.launchLabel) el.launchLabel.textContent = t('launch');
    if (el.launch) el.launch.setAttribute('aria-label', t('launch'));
    if (!built) return;
    el.panel.setAttribute('aria-label', t('name') + ' — ' + t('sub'));
    el.panel.lang = lang; el.panel.dir = lang === 'ar' ? 'rtl' : 'ltr';
    el.name.textContent = t('name');
    el.sub.textContent = t('sub');
    el.close.setAttribute('aria-label', t('close'));
    el.input.placeholder = t('placeholder');
    el.input.setAttribute('aria-label', t('placeholder'));
    el.send.setAttribute('aria-label', t('send'));
  }

  function open() {
    if (!built) buildPanel();
    root.classList.add('bot-open');
    el.launch.setAttribute('aria-expanded', 'true');
    // phones: don't pop the keyboard over the menu
    if (window.matchMedia('(min-width: 760px)').matches) el.input.focus(); else el.close.focus();
  }
  function close() {
    root.classList.remove('bot-open');
    el.launch.setAttribute('aria-expanded', 'false');
    el.launch.focus();
  }

  function scroll() { el.log.scrollTop = el.log.scrollHeight; }
  function say(text, links) {
    var m = h('div', 'bot__msg bot__msg--bot', text);
    (links || []).forEach(function (l) {
      m.appendChild(document.createTextNode('\n'));
      var a = h('a', null, l.label);
      a.href = l.href; a.target = '_blank'; a.rel = 'noopener';
      m.appendChild(a);
    });
    el.log.appendChild(m);
    scroll();
  }
  function note(text) { el.log.appendChild(h('div', 'bot__msg bot__msg--note', text)); scroll(); }
  function echo(text) { el.log.appendChild(h('div', 'bot__msg bot__msg--user', text)); scroll(); }
  function typing(on) {
    busy = on;
    el.send.disabled = on;
    if (el.typingEl) { el.typingEl.remove(); el.typingEl = null; }
    if (on) {
      el.typingEl = h('div', 'bot__typing');
      el.typingEl.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 3; i++) el.typingEl.appendChild(h('i'));
      el.log.appendChild(el.typingEl);
      scroll();
    }
  }
  // chips: [{ label, act: fn | href: url, quiet: bool, ltr: bool }]
  function chips(list) {
    el.chips.textContent = '';
    chipActs = list || [];
    chipActs.forEach(function (c) {
      var b;
      if (c.href) { b = h('a', 'bot__chip', c.label); b.href = c.href; b.target = '_blank'; b.rel = 'noopener'; }
      else {
        b = h('button', 'bot__chip', c.label);
        b.type = 'button';
        b.addEventListener('click', function () { if (busy) return; if (!c.silent) echo(c.label); c.act(); });
      }
      if (c.quiet) b.className += ' bot__chip--quiet';
      if (c.ltr) b.dir = 'ltr';
      el.chips.appendChild(b);
    });
    // the pressed button is gone: keep keyboard focus inside the panel
    if (root.classList.contains('bot-open') && !el.panel.contains(document.activeElement)) (list && list.length && !window.matchMedia('(min-width: 760px)').matches ? el.log : el.input).focus({ preventScroll: true });
    scroll();
  }

  /* ------------------------------------------------------------ menus */
  function mainMenu() {
    flow = null;
    chips([
      { label: t('menu_book'), act: startBook },
      { label: t('menu_lead'), act: startLead },
      { label: t('menu_faq'), act: faqMenu },
      { label: t('menu_wa'), href: waLink() },
    ]);
  }
  function backChip() { return { label: t('menu_back'), act: mainMenu, quiet: true, silent: true }; }
  function cancelChip() { return { label: t('cancel'), act: mainMenu, quiet: true }; }

  function faqMenu() {
    flow = null;
    say(t('faq_intro'));
    var list = t('faq').map(function (q, i) { return { label: q[0], act: function () { answerFaq(i); } }; });
    list.push(backChip());
    chips(list);
  }
  function answerFaq(i) {
    if (i === 1) return answerPrice();
    if (i === 4) return answerWhere();
    say(t('faq')[i][1]);
    afterAnswer();
  }
  function answerPrice() { say(t('price')); afterAnswer('lead'); }
  function answerWhere() { say(t('where'), [{ label: t('map'), href: MAP_URL }]); afterAnswer('book'); }
  function answerHuman() { say(t('wa_msg')); chips([{ label: t('wa_open'), href: waLink() }, backChip()]); }
  function afterAnswer(action) {
    var list = [];
    if (action === 'whatsapp') list.push({ label: t('wa_open'), href: waLink() });
    list.push({ label: t('menu_book'), act: startBook });
    list.push({ label: t('menu_lead'), act: startLead });
    if (action === 'lead') list.reverse();
    list.push({ label: t('menu_faq'), act: faqMenu });
    if (action !== 'whatsapp') list.push({ label: t('menu_wa'), href: waLink() });
    chips(list);
  }

  /* ------------------------------------------------------------ contact steps (shared) */
  function askName() { flow.step = 'name'; say(t('ask_name')); if (!data.told) { note(t('privacy')); data.told = true; } chips([cancelChip()]); }
  function askPhone() { flow.step = 'phone'; say(t('ask_phone')); chips([cancelChip()]); }
  function afterContact() { if (flow.name === 'lead') askType(); else loadDays(); }

  /* ------------------------------------------------------------ lead */
  function startLead() {
    flow = { name: 'lead' };
    if (data.name && data.phone) askType(); else askName();
  }
  function askType() {
    flow.step = 'type';
    say(t('ask_type'));
    var list = t('types').map(function (label, i) { return { label: label, act: function () { data.typeIdx = i; askNote(); } }; });
    list.push(cancelChip());
    chips(list);
  }
  function askNote() {
    flow.step = 'note';
    say(t('ask_note'));
    chips([{ label: t('skip'), act: function () { data.note = ''; sendLead(); } }, cancelChip()]);
  }
  function sendLead() {
    flow.step = 'sending';
    chips([]);
    typing(true);
    var type = TYPES_AR[data.typeIdx] || '';
    post('leads', { name: data.name, phone: data.phone, type: type, note: data.note || '', lang: lang }).then(function (res) {
      typing(false);
      if (!res.ok) {
        say(res.error === 'slow_down' ? t('slow') : t('send_fail'));
        return chips([{ label: t('wa_open'), href: waLink() }, backChip()]);
      }
      notifyEmail('طلب جديد من المساعد: ' + data.name, {
        'الاسم': data.name, 'الجوال': data.phone, 'نوع المشروع': type || '—', 'ملاحظات': data.note || '—',
        'واتساب العميل': 'https://wa.me/966' + data.phone.slice(1), 'رقم الطلب': '#' + res.id, 'المصدر': 'مساعد الموقع',
      });
      data.note = '';
      flow = null;
      say(fill(t('lead_ok'), data) + '\n' + t('lead_next'));
      chips([{ label: t('menu_book'), act: startBook }, backChip()]);
    }).catch(function () {
      typing(false);
      say(t('send_fail'));
      chips([{ label: t('wa_open'), href: waLink() }, backChip()]);
    });
  }

  /* ------------------------------------------------------------ booking */
  function startBook() {
    flow = { name: 'book' };
    if (data.name && data.phone) {
      say(fill(t('book_as'), data));
      loadDays(true);
    } else askName();
  }
  function loadDays(offerChange) {
    flow.step = 'loading';
    chips([]);
    typing(true);
    fetch(API + 'days').then(function (r) { return r.json(); }).then(function (res) {
      typing(false);
      days = (res && res.days) || [];
      if (!days.length) { flow = null; say(t('book_none')); return chips([{ label: t('wa_open'), href: waLink() }, backChip()]); }
      askDay(0, offerChange);
    }).catch(function () {
      typing(false); flow = null;
      say(t('book_none'));
      chips([{ label: t('wa_open'), href: waLink() }, backChip()]);
    });
  }
  function askDay(from, offerChange) {
    flow.step = 'day';
    if (!from) say(t('ask_day'));
    var list = days.slice(from, from + 6).map(function (d) {
      return { label: dayLabel(d.date), act: function () { data.date = d.date; askTime(d); } };
    });
    if (days.length > from + 6) list.push({ label: t('more_days'), act: function () { askDay(from + 6); }, quiet: true, silent: true });
    if (offerChange) list.push({ label: t('book_change'), act: function () { data.name = data.phone = null; askName(); }, quiet: true });
    list.push(cancelChip());
    chips(list);
  }
  function askTime(d) {
    flow.step = 'time';
    say(fill(t('ask_time'), { day: dayLabel(d.date) }));
    var list = d.slots.map(function (s) { return { label: timeLabel(s), ltr: lang === 'en', act: function () { data.time = s; confirmBook(); } }; });
    list.push({ label: t('other_day'), act: function () { askDay(0); }, quiet: true });
    list.push(cancelChip());
    chips(list);
  }
  function confirmBook() {
    flow.step = 'confirm';
    say(fill(t('confirm_q'), { day: dayLabel(data.date), time: timeLabel(data.time), name: data.name, phone: data.phone }));
    chips([{ label: t('confirm'), act: sendBook }, { label: t('other_day'), act: function () { askDay(0); }, quiet: true }, cancelChip()]);
  }
  function sendBook() {
    flow.step = 'sending';
    chips([]);
    typing(true);
    var type = TYPES_AR[data.typeIdx] || '';
    post('appointments', { name: data.name, phone: data.phone, date: data.date, time: data.time, type: type, lang: lang }).then(function (res) {
      typing(false);
      if (!res.ok) {
        if (res.error === 'slot_taken') { say(t('slot_taken')); return loadDays(); }
        flow = null;
        say(res.error === 'already_booked' ? t('already_booked') : res.error === 'slow_down' ? t('slow') : t('send_fail'));
        return chips([{ label: t('wa_open'), href: waLink() }, backChip()]);
      }
      notifyEmail('حجز زيارة للمعرض: ' + data.name, {
        'الاسم': data.name, 'الجوال': data.phone, 'التاريخ': data.date, 'الوقت': data.time,
        'واتساب العميل': 'https://wa.me/966' + data.phone.slice(1), 'المصدر': 'مساعد الموقع',
      });
      flow = null;
      say(fill(t('book_ok'), { day: dayLabel(data.date), time: timeLabel(data.time) }));
      chips([{ label: t('map'), href: MAP_URL }, backChip()]);
    }).catch(function () {
      typing(false); flow = null;
      say(t('send_fail'));
      chips([{ label: t('wa_open'), href: waLink() }, backChip()]);
    });
  }

  /* ------------------------------------------------------------ free text */
  var INTENT = {
    book: /(حجز|احجز|أحجز|موعد|ازوركم|أزوركم|زيارة المعرض|book|appointment|schedule a visit)/i,
    lead: /(سجل طلب|سجّل طلب|اسجل|أسجل|طلب جديد|عرض سعر|تسعيرة|تسعيره|quote|quotation|register)/i,
    human: /(موظف|اكلم احد|أكلم أحد|خدمة العملاء|رقمكم|رقم التواصل|واتساب|واتس|whats\s?app|human|agent|call you|phone number)/i,
    price: /(سعر|اسعار|أسعار|بكم|كم يكلف|كم تكلف|التكلفة|التكلفه|تكلفة|كم المتر|price|cost|how much|budget)/i,
    time: /(كم ياخذ|كم يأخذ|كم تاخذ|كم تأخذ|كم المدة|مدة التنفيذ|مدة التصنيع|مدة التركيب|متى يجهز|متى يخلص|كم يوم|كم اسبوع|كم أسبوع|كم شهر|how long|lead time|timeline|delivery time)/i,
    where: /(وين موقع|موقعكم|العنوان|لوكيشن|الدوام|دوامكم|متى تفتح|متى تقفل|ساعات العمل|location|address|opening hours|where are you|when are you open)/i,
  };
  // If the AI can't answer, a keyword still finds the right canned answer
  var FALLBACK = [
    [/(ضمان|warranty|guarantee)/i, 2], [/(خام|علام|ماركة|ماركات|خشب|بلوم|brand|material|timber|blum|egger)/i, 3],
    [/(زاوي|غير قياس|ضيق|awkward|corner|non-standard)/i, 5], [/(تصنع|تصنيع|مكائن|أجهزة القص|made|manufactur|machine)/i, 6],
    [/(خدمات|تسوون|مطبخ|مطابخ|خزان|دولاب|تلفزيون|kitchen|wardrobe|service|media unit)/i, 7], [/(كيف|تبد|خطوات|العملية|process|start|steps|how do)/i, 0],
  ];

  function onText(text) {
    echo(text);
    if (flow) return onFlowText(text);
    if (INTENT.time.test(text)) { say(t('time')); return afterAnswer('lead'); }
    if (INTENT.price.test(text)) return answerPrice();
    if (INTENT.book.test(text)) return startBook();
    if (INTENT.lead.test(text)) return startLead();
    if (INTENT.human.test(text)) return answerHuman();
    if (INTENT.where.test(text)) return answerWhere();
    askAI(text);
  }

  function onFlowText(text) {
    var step = flow.step;
    if (step === 'name') {
      var name = text.replace(/\s+/g, ' ').slice(0, 80);
      if (name.length < 2 || /^\d+$/.test(name)) return say(t('bad_name'));
      data.name = name;
      return askPhone();
    }
    if (step === 'phone') {
      var phone = normPhone(text);
      if (!phone) return say(t('bad_phone'));
      data.phone = phone;
      return afterContact();
    }
    if (step === 'note') { data.note = text.slice(0, 600); return sendLead(); }
    // steps answered with a button: accept the button's text if they typed it, otherwise ask again
    var want = text.replace(/\s+/g, ' ').toLowerCase();
    for (var i = 0; i < chipActs.length; i++) {
      if (chipActs[i].act && chipActs[i].label.toLowerCase() === want) return chipActs[i].act();
    }
    say(t('pick'));
  }

  function askAI(text) {
    history.push({ role: 'user', content: text });
    chips([]);
    typing(true);
    post('chat', { messages: history.slice(-8), lang: lang }).then(function (res) {
      typing(false);
      if (res && res.ok && res.reply) {
        history.push({ role: 'assistant', content: res.reply });
        say(res.reply);
        return afterAnswer(res.action);
      }
      history.pop();
      localAnswer(text, res && res.intent);
    }).catch(function () {
      typing(false);
      history.pop();
      localAnswer(text);
    });
  }
  function localAnswer(text, intent) {
    if (intent === 'price') return answerPrice();
    for (var i = 0; i < FALLBACK.length; i++) {
      if (FALLBACK[i][0].test(text)) return answerFaq(FALLBACK[i][1]);
    }
    say(t('thinking_fail'));
    afterAnswer('whatsapp');
  }

  /* ------------------------------------------------------------ language follows the page */
  new MutationObserver(function () {
    var next = root.lang === 'en' ? 'en' : 'ar';
    if (next === lang) return;
    lang = next;
    labels();
    if (built && !flow) mainMenu(); // buttons switch language; the conversation so far stays as it was said
  }).observe(root, { attributes: true, attributeFilter: ['lang'] });

  buildLauncher();
  // Any element with data-bot-open (e.g. a link in the page) opens the assistant
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-bot-open]');
    if (trigger) { e.preventDefault(); open(); }
  });
})();
