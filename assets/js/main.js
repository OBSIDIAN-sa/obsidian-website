/* OBSIDIAN DESIGN — Phase 1 behaviour.
   Classic script (no modules) so the page works from file:// with no server.
   Animation writes transform/opacity only; layout is read only on resize or inside rAF before writes. */
(function () {
  'use strict';

  var I18N = window.I18N, WA = window.WA;
  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lang = root.lang === 'en' ? 'en' : 'ar';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var t = function (k) { return I18N[lang][k]; };

  /* ---------------------------------------------------------------- i18n */
  var langHooks = [];
  function applyLang(next, announce) {
    lang = next;
    root.lang = next;
    root.dir = next === 'ar' ? 'rtl' : 'ltr';
    var d = I18N[next];

    $$('[data-i18n]').forEach(function (el) { var v = d[el.dataset.i18n]; if (typeof v === 'string') el.textContent = v; });
    $$('[data-i18n-alt]').forEach(function (el) { el.alt = d[el.dataset.i18nAlt]; });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', d[el.dataset.i18nAria]); });
    $$('[data-i18n-content]').forEach(function (el) { el.setAttribute('content', d[el.dataset.i18nContent]); });
    $$('[data-i18n-list]').forEach(function (ul) {
      var items = d[ul.dataset.i18nList];
      $$('li', ul).forEach(function (li, i) { li.textContent = items[i]; });
    });
    document.title = d.meta_title;

    // The toggle names the *other* language, in that language
    var toggleLabel = $('[data-lang-toggle] span');
    toggleLabel.setAttribute('lang', next === 'ar' ? 'en' : 'ar');

    try { localStorage.setItem('obsidian-lang', next); } catch (e) {}
    if (announce) $('[data-lang-live]').textContent = d.lang_name;
    langHooks.forEach(function (fn) { fn(); });
    root.classList.remove('i18n-pending');
  }

  $('[data-lang-toggle]').addEventListener('click', function () {
    applyLang(lang === 'ar' ? 'en' : 'ar', true);
  });

  /* ------------------------------------------------------ hero rotator */
  (function rotator() {
    var el = $('[data-rotator]');
    if (!el) return;
    var timer = null, idx = 0;

    function word(text) {
      var s = document.createElement('span');
      s.className = 'hero__word';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = text;
      return s;
    }
    function step() {
      if (document.hidden) return;
      var words = t('hero_words');
      var cur = $('.hero__word:not(.is-out)', el);
      idx = (idx + 1) % words.length;
      var nw = word(words[idx]);
      nw.classList.add('is-in-start');
      el.appendChild(nw);
      cur.classList.add('is-out');
      // Let the outgoing word lead; the new one follows a beat later
      setTimeout(function () {
        nw.classList.remove('is-in-start');
        nw.classList.add('is-in');
      }, 140);
      setTimeout(function () { if (cur.parentNode) cur.parentNode.removeChild(cur); }, 1000);
    }
    function render() {
      clearInterval(timer);
      var words = t('hero_words');
      el.textContent = '';
      var sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = words.join(lang === 'ar' ? '، ' : ', ');
      el.appendChild(sr);
      if (reduceMQ.matches) {
        // Still frame: all three words, separated like the marquee
        var all = word(words.join(' · '));
        el.appendChild(all);
        return;
      }
      idx = 0;
      el.appendChild(word(words[0]));
      timer = setInterval(step, 2500);
    }
    render();
    langHooks.push(render);
    reduceMQ.addEventListener('change', render);
  })();

  /* ------------------------------------------------------------ marquee */
  (function marquee() {
    var wrap = $('[data-marquee]');
    if (!wrap) return;
    var track = $('[data-marquee-track]', wrap);
    var first = $('[data-marquee-group]', wrap);
    var groupW = 0, offset = 0, dirScroll = 1, boost = 0, lastY = window.scrollY;
    var visible = false, raf = 0, lastT = 0;
    var BASE = 38;   // px/s at rest
    var GAIN = 2.2;  // how much scroll velocity feeds in

    function fill(group) {
      group.textContent = '';
      t('marquee').forEach(function (txt) {
        var item = document.createElement('span');
        item.className = 'marquee__item';
        item.textContent = txt;
        var dot = document.createElement('span');
        dot.className = 'marquee__dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = '·';
        group.appendChild(item);
        group.appendChild(dot);
      });
    }
    function build() {
      fill(first);
      $$('[data-marquee-clone]', track).forEach(function (n) { n.remove(); });
      track.style.transform = '';
      if (reduceMQ.matches) { wrap.classList.add('is-static'); stop(); return; }
      wrap.classList.remove('is-static');
      groupW = first.getBoundingClientRect().width;       // layout read: build/resize only
      var need = Math.ceil((window.innerWidth * 2) / Math.max(groupW, 1)) + 1;
      for (var i = 0; i < need; i++) {
        var c = first.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        c.setAttribute('data-marquee-clone', '');
        track.appendChild(c);
      }
      if (visible) start();
    }
    function frame(now) {
      var dt = Math.min((now - (lastT || now)) / 1000, 0.05);
      lastT = now;
      boost *= Math.pow(0.04, dt);                  // velocity bleeds off over ~1s
      var speed = BASE + boost;
      offset += speed * dt * dirScroll;
      var x = ((offset % groupW) + groupW) % groupW;
      // LTR text travels left; RTL text travels right, so each script reads from its start
      var sign = root.dir === 'rtl' ? 1 : -1;
      track.style.transform = 'translate3d(' + (sign * x).toFixed(2) + 'px,0,0)';
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !reduceMQ.matches && groupW) { lastT = 0; raf = requestAnimationFrame(frame); } }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    window.addEventListener('scroll', function () {
      var y = window.scrollY, dy = y - lastY;
      lastY = y;
      if (dy !== 0) dirScroll = dy > 0 ? 1 : -1;
      boost = Math.min(boost + Math.abs(dy) * GAIN, 900);
    }, { passive: true });

    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }).observe(wrap);

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 200); });
    langHooks.push(build);
    reduceMQ.addEventListener('change', build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    build();
  })();

  /* ---------------------------------------------------- entry reveals */
  (function reveals() {
    var els = $$('[data-reveal]');
    // Stagger siblings: each reveal gets its index among revealing siblings
    els.forEach(function (el) {
      var sibs = $$(':scope > [data-reveal]', el.parentNode);
      el.style.setProperty('--i', sibs.indexOf(el));
    });
    if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------------ header state */
  (function header() {
    var h = $('[data-header]'), hero = $('.hero');
    if (!h || !hero) return;
    new IntersectionObserver(function (entries) {
      h.classList.toggle('is-solid', !entries[0].isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px' }).observe(hero);
  })();

  /* --------------------------------------------------- scroll progress */
  // Tracks the reader's own scroll, so it stays on under reduced motion (nothing moves by itself)
  (function progress() {
    var bar = $('[data-progress]');
    if (!bar) return;
    var ticking = false;
    function update() {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    function request() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    if ('ResizeObserver' in window) new ResizeObserver(request).observe(document.body); // FAQ panels, late images
    request();
  })();

  /* ---------------------------------------------------------- parallax */
  (function parallax() {
    var frames = $$('[data-parallax-frame]');
    if (!frames.length) return;
    var active = new Set(), ticking = false;
    var AMOUNT = 0.1; // share of frame height travelled from edge to edge of the viewport

    function update() {
      ticking = false;
      if (reduceMQ.matches) return;
      var vh = window.innerHeight;
      // Reads first, then writes: no interleaving
      var reads = [];
      active.forEach(function (f) { reads.push([f, f.getBoundingClientRect()]); });
      reads.forEach(function (r) {
        var rect = r[1];
        var p = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2); // -1 … 1
        r[0].firstElementChild.style.transform = 'translate3d(0,' + (-p * rect.height * AMOUNT).toFixed(1) + 'px,0)';
      });
    }
    function request() { if (!ticking && active.size) { ticking = true; requestAnimationFrame(update); } }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.isIntersecting ? active.add(e.target) : active.delete(e.target); });
      request();
    });
    frames.forEach(function (f) { io.observe(f); });
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    reduceMQ.addEventListener('change', function () {
      frames.forEach(function (f) { f.firstElementChild.style.transform = ''; });
      request();
    });
  })();

  /* -------------------------------------------------------------- film */
  (function film() {
    var root_ = $('[data-film]');
    if (!root_) return;
    var framesEls = $$('[data-film-frame]', root_);
    var lines = $$('[data-film-line]', root_);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = lines.indexOf(e.target);
        framesEls.forEach(function (f, j) { f.classList.toggle('is-active', j === i); });
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    lines.forEach(function (l) { io.observe(l); });
  })();

  /* --------------------------------------------------------- accordion */
  (function accordion() {
    $$('[data-accordion] .faq__q').forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'false');
      panel.hidden = true; // hidden only once JS can open it again
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        panel.hidden = open;
      });
    });
  })();

  /* -------------------------------------------------------------- form */
  (function form() {
    var f = $('[data-form]');
    if (!f) return;
    var success = $('[data-form-success]', f);
    var typeSel = $('[data-type-select]', f);

    function toLatinDigits(s) {
      return s.replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x0660; })
              .replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x06F0; });
    }
    function phoneDigits(v) { return toLatinDigits(v).replace(/\D/g, ''); }
    function validPhone(v) { return /^(?:00966|966|0)?5\d{8}$/.test(phoneDigits(v)); }

    function setError(input, key) {
      var field = input.closest('.field');
      var err = document.getElementById(input.getAttribute('aria-describedby'));
      if (key) {
        field.setAttribute('data-invalid', '');
        input.setAttribute('aria-invalid', 'true');
        err.dataset.key = key;
        err.textContent = t(key);
      } else {
        field.removeAttribute('data-invalid');
        input.removeAttribute('aria-invalid');
        delete err.dataset.key;
        err.textContent = '';
      }
    }
    function check(input) {
      var v = input.value.trim();
      if (!v) return 'f_err_required';
      if (input.name === 'phone' && !validPhone(v)) return 'f_err_phone';
      return null;
    }

    var required = $$('[required]', f);
    required.forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.hasAttribute('aria-invalid')) setError(input, check(input));
      });
      input.addEventListener('blur', function () {
        if (input.value.trim()) setError(input, check(input));
      });
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      success.textContent = '';
      var firstBad = null;
      required.forEach(function (input) {
        var key = check(input);
        setError(input, key);
        if (key && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }

      var typeIdx = typeSel.value;
      var msg = WA.template
        .replace('{name}', f.elements.name.value.trim())
        .replace('{phone}', toLatinDigits(f.elements.phone.value.trim()))
        .replace('{type}', typeIdx === '' ? '—' : I18N.ar.f_type_opts[+typeIdx])
        .replace('{note}', f.elements.note.value.trim() || '—');
      var url = 'https://wa.me/' + WA.number + '?text=' + encodeURIComponent(msg);

      var w = window.open(url, '_blank');
      if (w) { try { w.opener = null; } catch (err) {} } else { window.location.href = url; }

      f.reset();
      success.textContent = t('f_success');
    });

    langHooks.push(function () {
      $$('option', typeSel).forEach(function (o) {
        if (o.value !== '') o.textContent = t('f_type_opts')[+o.value];
      });
      $$('.field__err[data-key]', f).forEach(function (err) { err.textContent = t(err.dataset.key); });
      if (success.textContent) success.textContent = t('f_success');
    });
  })();

  applyLang(lang, false);
})();
