/* OBSIDIAN DESIGN — Phase 2 motion that isn't needed for the first screen: custom cursor, magnetic buttons,
   scroll-scrubbed film. main.js loads it after the window's load event, so it never competes with the
   hero or delays the first paint. If it never loads, the page loses nothing: native cursor, still buttons,
   and main.js's frame-by-line film. Same rules as main.js: transform/opacity only, reads before writes. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

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

  /* -------------------------------------------------------------- film */
  // Scroll-scrubbed: the reader's scroll position *is* the film's playhead. Each frame pushes in slowly
  // (1.06 → 1) while its line is read, and dissolves into the next over the last stretch before the next
  // line takes the centre — exactly in step with the scroll, forwards and backwards, stopping when it stops.
  // The line that has been read fades with its frame, like a subtitle, so it never sits over the next photo.
  // One rect read per frame (reads before writes), transform/opacity only, two layers promoted at a time.
  // Under reduced motion (and where the gate below says no), main.js keeps the original: each line swaps the frame.
  // Line heights change with the language: the ResizeObserver re-measures.
  (function film() {
    var root_ = $('[data-film]');
    if (!root_) return;
    var framesEls = $$('[data-film-frame]', root_);
    var lines = $$('[data-film-line]', root_);
    var imgs = framesEls.map(function (f) { return $('img', f); });
    // Gate: tools/perf-film.mjs measured no dropped frames at 375 and 768 (CPU ×4 and ×6) or 1440, so it scrubs
    // at every width. Should a real phone disagree, narrow this (e.g. '(min-width: 760px)') and phones keep the swap.
    var scrubMQ = window.matchMedia('all');
    var N = framesEls.length, FADE = 0.3, PUSH = 0.06;
    var bounds = [], active = false, raf = 0, scrub = false, lastKey = '';

    function measure() { // line blocks relative to the film's top: layout read on resize only
      var top = root_.getBoundingClientRect().top;
      bounds = lines.map(function (l) { var r = l.getBoundingClientRect(); return [r.top - top, r.bottom - top]; });
    }
    function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); } // smoothstep
    function frame() {
      raf = 0;
      if (!scrub) return;
      var c = window.innerHeight / 2 - root_.getBoundingClientRect().top; // read
      // Playhead: i while line i's block covers the viewport centre, fraction by how far through it is
      var p = 0;
      if (c >= bounds[0][0]) {
        p = N - 1;
        for (var i = 0; i < N; i++) {
          if (c < bounds[i][1]) { p = i + Math.max(0, (c - bounds[i][0]) / (bounds[i][1] - bounds[i][0])); break; }
        }
      }
      p = Math.min(p, N);
      var base = Math.min(Math.floor(p), N - 1), f = p - base;
      var mix = base < N - 1 ? ease((f - (1 - FADE)) / FADE) : 0; // next frame's share
      var key = base + ':' + mix.toFixed(3) + ':' + p.toFixed(3);
      if (key === lastKey) return;
      lastKey = key;
      framesEls.forEach(function (el, j) { // writes
        var o = j === base ? 1 : (j === base + 1 ? mix : 0);
        var live = o > 0;
        // push-in runs from when a frame starts to appear until it has fully handed over
        var s = 1 + PUSH * (1 - Math.max(0, Math.min(1, (p - (j - FADE)) / (1 + FADE))));
        el.style.opacity = live ? o.toFixed(3) : '0';
        el.style.willChange = live ? 'opacity, transform' : '';
        el.style.transform = live ? 'scale(' + s.toFixed(4) + ')' : '';
        lines[j].style.opacity = j < base ? '0' : (j === base ? (1 - mix).toFixed(3) : '');
      });
    }
    function request() { if (active && scrub && !raf) raf = requestAnimationFrame(frame); }
    function mode() {
      var next = !reduceMQ.matches && scrubMQ.matches;
      if (next === scrub) { if (scrub) { measure(); lastKey = ''; request(); } return; }
      scrub = next;
      root_.classList.toggle('is-scrub', scrub);
      if (scrub) { measure(); lastKey = ''; request(); }
      else {
        framesEls.forEach(function (el) { el.style.opacity = el.style.willChange = el.style.transform = ''; });
        lines.forEach(function (l) { l.style.opacity = ''; });
        // restore the classic state for wherever the reader is
        var mid = window.innerHeight / 2, k = 0;
        lines.forEach(function (l, i) { if (l.getBoundingClientRect().top < mid) k = i; });
        framesEls.forEach(function (el, j) { el.classList.toggle('is-active', j === k); });
      }
    }

    // Only work while the film is on screen; start fetching and decoding every frame a screen before it
    new IntersectionObserver(function (entries) {
      active = entries[0].isIntersecting;
      if (active) { measure(); lastKey = ''; request(); }
    }).observe(root_);
    var warm = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      warm.disconnect();
      imgs.forEach(function (img) {
        img.loading = 'eager';
        if (img.decode) img.decode().catch(function () {});
      });
    }, { rootMargin: '150% 0px' });
    warm.observe(root_);

    window.addEventListener('scroll', request, { passive: true });
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(mode, 150); });
    reduceMQ.addEventListener('change', mode);
    if (scrubMQ.addEventListener) scrubMQ.addEventListener('change', mode);
    if ('ResizeObserver' in window) new ResizeObserver(function () { if (scrub) { measure(); lastKey = ''; request(); } }).observe(root_);
    mode();
  })();
})();
