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
    if (announce) {
      $('[data-lang-live]').textContent = d.lang_name;
      // Keep the address in step with the language, so a shared link opens in the same one
      try { history.replaceState(null, '', (next === 'en' ? '?lang=en' : location.pathname) + location.hash); } catch (e) {}
      var canon = $('link[rel=canonical]');
      if (canon) canon.href = canon.getAttribute('data-base') + (next === 'en' ? '?lang=en' : '');
    }
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
    var timer = null, swap = null, idx = 0;
    var OUT = 450; // matches .hero__word.is-out in CSS

    function word(text) {
      var s = document.createElement('span');
      s.className = 'hero__word';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = text;
      return s;
    }
    // Strictly sequential: the old word fully leaves before the new one enters,
    // so the two are never on screen together. One moving thing at a time.
    function step() {
      if (document.hidden) return;
      var words = t('hero_words');
      var cur = $('.hero__word', el);
      idx = (idx + 1) % words.length;
      cur.classList.add('is-out');
      swap = setTimeout(function () {
        var nw = word(words[idx]);
        nw.classList.add('is-in-start');
        if (cur.parentNode) cur.parentNode.removeChild(cur);
        el.appendChild(nw);
        void nw.offsetWidth; // commit the start state so the entry transitions
        nw.classList.remove('is-in-start');
        nw.classList.add('is-in');
      }, OUT);
    }
    function render() {
      clearInterval(timer);
      clearTimeout(swap);
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

  /* ------------------------------------------------------- intro curtain */
  // First visit only (the head script decides and adds .intro). The bronze hairline follows real readiness:
  // fonts and the hero photo. The curtain shows at least 600ms so it never flashes, and starts to lift no
  // later than 1050ms after navigation, so it is gone by 1.5s even on a slow phone. Any key, tap or wheel skips it.
  (function intro() {
    var el = $('[data-intro]');
    if (!el || !root.classList.contains('intro')) return;
    var bar = $('[data-intro-bar]', el);
    var MIN = 600, FADE = 450, LIFT_BY = 1500 - FADE;
    var shownAt = performance.now(), done = false, ready = 0;
    if (shownAt >= LIFT_BY) { // slow connection: the visitor has waited enough, hard-skip with no fade
      root.classList.remove('intro');
      document.dispatchEvent(new Event('obsidian:intro-done'));
      return;
    }

    function lift() {
      if (done) return;
      done = true;
      bar.style.transform = 'scaleX(1)';
      el.classList.add('is-out');
      document.dispatchEvent(new Event('obsidian:intro-done'));
      setTimeout(function () { root.classList.remove('intro'); }, FADE);
      ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (t) { removeEventListener(t, lift, true); });
    }
    function step() {
      ready++;
      bar.style.transform = 'scaleX(' + (0.08 + 0.92 * ready / 2).toFixed(3) + ')';
      if (ready === 2) setTimeout(lift, Math.max(0, shownAt + MIN - performance.now()));
    }
    var hero = $('.hero__media img');
    if (!hero || (hero.complete && hero.naturalWidth)) step();
    else { hero.addEventListener('load', step, { once: true }); hero.addEventListener('error', step, { once: true }); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(step); else step();
    setTimeout(lift, Math.max(0, LIFT_BY - performance.now()));
    ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (t) { addEventListener(t, lift, { capture: true, passive: true }); });
    // The head script's 1.5s failsafe may have lifted it already
    document.addEventListener('obsidian:intro-done', function () { if (!done) { done = true; el.classList.add('is-out'); } }, { once: true });
  })();

  /* --------------------------------------------------------- logo swing */
  // The official mark, untouched, swings once from the top of the ring and settles (CSS keyframes, transform only).
  // It starts when the intro curtain lifts, or straight away on a repeat visit. A mouse touching it sets it
  // moving again, gently. Nothing under reduced motion.
  (function logoSwing() {
    var logo = $('.hero__logo');
    if (!logo) return;
    var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
    var busy = false;
    function play(cls) {
      if (busy || reduceMQ.matches) return;
      busy = true;
      logo.classList.remove('is-swing', 'is-nudge');
      void logo.offsetWidth; // restart cleanly
      logo.classList.add(cls);
    }
    logo.addEventListener('animationend', function () { busy = false; logo.classList.remove('is-swing', 'is-nudge'); });
    logo.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && fineMQ.matches) play('is-nudge'); });
    function start() { setTimeout(function () { play('is-swing'); }, 250); }
    if (root.classList.contains('intro')) document.addEventListener('obsidian:intro-done', start, { once: true });
    else start();
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

  /* ------------------------------------------------------- easter egg */
  // Typing OBSIDIAN (desktop pointer only, outside form fields) shows the mark for a moment.
  // Matches physical keys (KeyO…) so it works on an Arabic layout too. Wordless, click-through, never takes focus.
  (function egg() {
    var WORD = 'OBSIDIAN', HOLD = 2400;
    var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
    var typed = '', el = null, timer = 0, showing = false;

    function build() {
      el = document.createElement('div');
      el.className = 'egg';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="egg__mark"><picture><source type="image/webp" srcset="assets/img/logo-320.webp 1x, assets/img/logo-640.webp 2x">' +
        '<img src="assets/img/logo-320.png" width="320" height="326" alt=""></picture></div><span class="egg__rule"></span>';
      document.body.appendChild(el);
    }
    function hide() {
      if (!showing) return;
      showing = false;
      clearTimeout(timer);
      el.classList.remove('is-on');
      removeEventListener('pointerdown', hide);
      removeEventListener('wheel', hide);
    }
    function show() {
      if (!el) build();
      showing = true;
      void el.offsetWidth; // commit the start state so a freshly built overlay still transitions
      el.classList.add('is-on');
      timer = setTimeout(hide, HOLD);
      addEventListener('pointerdown', hide, { passive: true });
      addEventListener('wheel', hide, { passive: true });
    }

    document.addEventListener('keydown', function (e) {
      if (showing) { hide(); return; }
      if (!fineMQ.matches || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      var tgt = e.target;
      if (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) { typed = ''; return; }
      var m = /^Key([A-Z])$/.exec(e.code || '');
      if (!m) { typed = ''; return; }
      typed = (typed + m[1]).slice(-WORD.length);
      if (typed === WORD) { typed = ''; show(); }
    });
  })();

  /* ------------------------------------------------------ custom cursor */
  // A bronze dot exactly at the pointer (no lag, so aiming stays exact) and a hairline ring that follows it.
  // Mouse only: built for a fine hovering pointer, switched on by a real mouse move, and handed back to the
  // native cursor on any key press, touch or pen, over form fields, in forced colours and under reduced motion.
  (function cursor() {
    var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
    var forcedMQ = window.matchMedia('(forced-colors: active)');
    if (!fineMQ.matches) return;
    var LINK = 'a[href], button, label, select, summary, [role="button"]';
    var NATIVE = 'input, textarea, select';
    var el, dot, ring, principle = $('.principle');
    var x = 0, y = 0, rx = 0, ry = 0, on = false, raf = 0, lastT = 0, hit = false, inLight = false, seam = 0;

    function build() {
      el = document.createElement('div');
      el.className = 'cursor';
      el.setAttribute('aria-hidden', 'true');
      ring = document.createElement('span'); ring.className = 'cursor__ring';
      dot = document.createElement('span'); dot.className = 'cursor__dot';
      el.appendChild(ring); el.appendChild(dot);
      document.body.appendChild(el);
      measure();
    }
    function measure() { // the light section's ink→bone ramp length (--seam), read on build and resize only
      if (!principle) return;
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;block-size:var(--seam)';
      principle.appendChild(probe); seam = probe.offsetHeight; probe.remove();
    }
    function allowed() { return fineMQ.matches && !reduceMQ.matches && !forcedMQ.matches; }
    function off() { if (on) { on = false; root.classList.remove('has-cursor'); cancelAnimationFrame(raf); raf = 0; } }
    function state(t) {
      if (!t || !t.closest) return;
      var native = !!t.closest(NATIVE);
      el.classList.toggle('is-native', native);
      el.classList.toggle('is-link', !native && !!t.closest(LINK));
      inLight = !!(principle && principle.contains(t));
    }
    function kick() { if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } }
    function frame(now) {
      raf = 0;
      var dt = Math.min((now - (lastT || now)) / 1000, 0.05); lastT = now;
      // Reads first
      if (hit) { hit = false; state(document.elementFromPoint(x, y)); }
      var light = false;
      if (inLight) { var r = principle.getBoundingClientRect(); light = y > r.top + seam * 0.6 && y < r.bottom - seam * 0.6; }
      // Then writes
      el.classList.toggle('is-light', light);
      var k = 1 - Math.pow(0.0004, dt); // ~150ms to close most of the gap: soft, never sluggish
      rx += (x - rx) * k; ry += (y - ry) * k;
      dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
      if (Math.abs(x - rx) > 0.1 || Math.abs(y - ry) > 0.1) raf = requestAnimationFrame(frame);
    }

    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !allowed()) { off(); return; }
      if (!el) build();
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; rx = x; ry = y; root.classList.add('has-cursor'); state(e.target); }
      el.classList.remove('is-away');
      kick();
    }, { passive: true });
    addEventListener('pointerover', function (e) { if (on && e.pointerType === 'mouse') state(e.target); }, { passive: true });
    addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') off(); else if (on) el.classList.add('is-down'); }, { passive: true });
    addEventListener('pointerup', function () { if (el) el.classList.remove('is-down'); }, { passive: true });
    document.addEventListener('mouseout', function (e) { if (on && !e.relatedTarget) el.classList.add('is-away'); });
    // Content moves under a still mouse when the page scrolls: re-read what is under it
    addEventListener('scroll', function () { if (on) { hit = true; kick(); } }, { passive: true });
    // Keyboard users get the native cursor (and their focus ring) at once
    addEventListener('keydown', function (e) { if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) off(); });
    addEventListener('resize', function () { if (el) measure(); });
    reduceMQ.addEventListener('change', function () { if (!allowed()) off(); });
  })();

  /* --------------------------------------------------- magnetic buttons */
  // Primary buttons (.btn) lean toward a nearby mouse — at most 8px across, 5px up/down — and settle back on
  // the long ease when it leaves. Only buttons on screen are watched; the rect is read in the event,
  // the transform written in rAF. Mouse only; never under reduced motion; focus never moves them.
  (function magnetic() {
    var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
    var btns = $$('.btn');
    if (!btns.length || !fineMQ.matches || !('IntersectionObserver' in window)) return;
    var ZONE = 28, PULL = 0.3, MAX_X = 8, MAX_Y = 5;
    var seen = new Set(), pending = new Map(), pull = new Map(), raf = 0;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else { seen.delete(e.target); release(e.target); } });
    });
    btns.forEach(function (b) { io.observe(b); });

    function write() {
      raf = 0;
      pending.forEach(function (v, b) {
        b.classList.toggle('is-magnet', !!v);
        b.style.transform = v ? 'translate3d(' + v[0].toFixed(2) + 'px,' + v[1].toFixed(2) + 'px,0)' : '';
      });
      pending.clear();
    }
    function set(b, v) { pull.set(b, v); pending.set(b, v); if (!raf) raf = requestAnimationFrame(write); }
    function release(b) { if (pull.get(b)) set(b, null); }

    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || reduceMQ.matches) return;
      seen.forEach(function (b) {
        var r = b.getBoundingClientRect(), p = pull.get(b) || [0, 0]; // strip the current pull, so the zone doesn't chase the button
        var left = r.left - p[0], top = r.top - p[1];
        var inside = e.clientX > left - ZONE && e.clientX < left + r.width + ZONE && e.clientY > top - ZONE && e.clientY < top + r.height + ZONE;
        if (!inside) { release(b); return; }
        var dx = (e.clientX - (left + r.width / 2)) * PULL, dy = (e.clientY - (top + r.height / 2)) * PULL;
        set(b, [Math.max(-MAX_X, Math.min(MAX_X, dx)), Math.max(-MAX_Y, Math.min(MAX_Y, dy))]);
      });
    }, { passive: true });
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) btns.forEach(release); });
    addEventListener('scroll', function () { btns.forEach(release); }, { passive: true });
    reduceMQ.addEventListener('change', function () { btns.forEach(release); });
  })();

  /* --------------------------------------------------------- phone menu */
  (function menu() {
    var btn = $('[data-menu-toggle]'), list = $('[data-menu]');
    if (!btn || !list) return;
    var wideMQ = window.matchMedia('(min-width: 760px)');
    var behind = [$('main'), $('.site-footer')];
    function set(open, restoreFocus) {
      btn.setAttribute('aria-expanded', String(open));
      if (open) list.setAttribute('data-open', ''); else list.removeAttribute('data-open');
      root.classList.toggle('menu-open', open);
      behind.forEach(function (el) { if (el) el.inert = open; }); // nothing behind the panel is reachable
      if (open) { var first = $('a', list); if (first) first.focus(); }
      else if (restoreFocus) btn.focus();
    }
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true', true); });
    list.addEventListener('click', function (e) { if (e.target.closest('a') && !wideMQ.matches) set(false, false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') set(false, true);
    });
    wideMQ.addEventListener('change', function () { if (wideMQ.matches) set(false, false); });
  })();

  /* ------------------------------------------- image placeholder + fade */
  // Lazy images sit on an onyx ground and fade in once decoded, instead of popping out of black.
  // Only with JS (the CSS hides them under .js), and instant under reduced motion.
  (function images() {
    $$('img[loading="lazy"]').forEach(function (img) {
      function done() { img.classList.add('is-loaded'); }
      if (img.complete && img.naturalWidth) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true }); // never leave a hole
      }
    });
  })();

  applyLang(lang, false);
})();
