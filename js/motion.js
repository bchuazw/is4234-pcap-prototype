/*
 * PCAP prototype: motion. Purposeful transitions for the "Control Tower" theme.
 *
 * Every screen re-renders its whole view with innerHTML, so this module remembers what was on
 * screen before and only animates what changed: a new screen, a payment moving on, a strip
 * changing queue section, a re-key result. Nothing here changes data or events.
 * Everything is skipped under prefers-reduced-motion (and the CSS switches its animations off too).
 * Classic script. Attaches to window.PCAP.motion.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};
  var EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var M = { rate: 1 };          /* playback rate for count-ups (the headless checks slow it down to capture frames) */
  var mem = { route: null, desk: null, steps: {}, approval: {}, strips: null, tab: null };
  var counters = [];
  var raf = null;

  function reduced() { return !!(mq && mq.matches); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function delay(el, ms) { el.style.setProperty('--d', Math.round(ms) + 'ms'); }
  function add(el, cls, ms) { if (!el) return; if (ms != null) delay(el, ms); el.classList.add(cls); }
  function stagger(list, cls, start, step, cap) {
    list.forEach(function (el, i) { add(el, cls, start + Math.min(i, cap == null ? 10 : cap) * step); });
  }

  /* ------------------------------------------------------------ count-up numbers */
  function countUp(el, wait, dur) {
    if (!el || el.getAttribute('data-counted')) return;
    var text = el.textContent;
    var m = /(\d[\d,]*(?:\.\d+)?)/.exec(text);
    if (!m) return;
    var raw = m[1], target = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(target) || target === 0) return;
    var dec = (raw.split('.')[1] || '').length, commas = raw.indexOf(',') >= 0;
    var pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    function fmt(v) {
      var s = v.toFixed(dec);
      if (commas) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
      return pre + s + post;
    }
    el.setAttribute('data-counted', '1');
    /* Hold the final width so the sentence around a number does not reflow while it counts. */
    var inline = root.getComputedStyle(el).display === 'inline';
    if (inline) { el.style.display = 'inline-block'; el.style.minWidth = el.getBoundingClientRect().width + 'px'; }
    el.textContent = fmt(0);
    counters.push({ el: el, final: text, fmt: fmt, target: target, wait: wait || 0, dur: dur || 700, t0: null, inline: inline });
    if (!raf) raf = root.requestAnimationFrame(loop);
  }
  function settle(c) {
    c.el.textContent = c.final;
    if (c.inline) { c.el.style.display = ''; c.el.style.minWidth = ''; }
  }
  function loop(now) {
    raf = null;
    counters = counters.filter(function (c) {
      if (!c.el.isConnected) return false;
      if (c.t0 == null) c.t0 = now;
      var t = ((now - c.t0) * M.rate - c.wait) / c.dur;
      if (t < 0) return true;
      if (t >= 1) { settle(c); return false; }
      c.el.textContent = c.fmt(c.target * (1 - Math.pow(1 - t, 3)));
      return true;
    });
    if (counters.length) raf = root.requestAnimationFrame(loop);
  }
  /* Jump every running count-up to its final value (used before screenshots). */
  function finish() {
    counters.forEach(settle);
    counters = [];
    if (document.getAnimations) {
      document.getAnimations().forEach(function (a) {
        try { var it = a.effect && a.effect.getComputedTiming().iterations; if (it !== Infinity) a.finish(); } catch (e) { /* ignore */ }
      });
    }
  }

  /* ------------------------------------------------------------ tab indicator */
  function tabRect(nav) {
    var a = nav && nav.querySelector('.tab.active');
    return a ? { x: a.offsetLeft, w: a.offsetWidth } : null;
  }
  function placeTab(animateFrom) {
    var nav = document.getElementById('tabs');
    if (!nav) return;
    var r = tabRect(nav);
    if (!r) return;
    var ind = nav.querySelector('.tab-ind');
    if (!ind) {
      ind = document.createElement('span');
      ind.className = 'tab-ind';
      ind.setAttribute('aria-hidden', 'true');
      nav.appendChild(ind);
      nav.classList.add('has-ind');
    }
    /* On narrow screens the tab bar scrolls sideways: keep the active tab in view. */
    if (r.x < nav.scrollLeft || r.x + r.w > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, r.x - 24);
    var x = r.x + 10, w = Math.max(0, r.w - 20);
    ind.style.width = w + 'px';
    ind.style.transform = 'translateX(' + x + 'px)';
    if (animateFrom && !reduced() && ind.animate && (animateFrom.x !== r.x || animateFrom.w !== r.w)) {
      ind.animate([
        { transform: 'translateX(' + (animateFrom.x + 10) + 'px)', width: Math.max(0, animateFrom.w - 20) + 'px' },
        { transform: 'translateX(' + x + 'px)', width: w + 'px' }
      ], { duration: 360, easing: EASE });
    }
  }

  /* ------------------------------------------------------------ queue strips (FLIP) */
  function stripSnapshot() {
    var q = $('.queue');
    if (!q || q.classList.contains('is-collapsed')) return null;
    var qr = q.getBoundingClientRect();
    var out = {};
    $$('.q-row[data-id]', q).forEach(function (row) {
      var g = row.closest('.q-group');
      var t = g && g.querySelector('.q-title span');
      out[row.getAttribute('data-id')] = { top: row.getBoundingClientRect().top - qr.top + q.scrollTop, group: t ? t.textContent : '' };
    });
    return out;
  }
  function stripsMove(prev) {
    var q = $('.queue');
    if (!prev || !q || q.classList.contains('is-collapsed')) return;
    var qr = q.getBoundingClientRect();
    var any = Object.keys(prev).length > 0;
    $$('.q-row[data-id]', q).forEach(function (row) {
      var id = row.getAttribute('data-id');
      var old = prev[id];
      if (!old) { if (any) add(row, 'm-rise', 60); return; }
      var g = row.closest('.q-group');
      var t = g && g.querySelector('.q-title span');
      var top = row.getBoundingClientRect().top - qr.top + q.scrollTop;
      var dy = old.top - top;
      if (Math.abs(dy) > 2 && row.animate) {
        row.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 440, easing: EASE });
      }
      if (t && old.group !== t.textContent) row.classList.add('m-moved');
    });
  }

  /* ------------------------------------------------------------ desk */
  function deskState() {
    var store = PCAP.store, s = store.st(), u = s.ui || {};
    var view = u.deskView === 'history' ? 'history' : 'queue';
    if (view === 'history') return { sig: s.role + '|history' };
    if (s.role === 'maker' && u.deskFlow) {
      var d = u.makerDraft || {};
      return { sig: 'flow|' + u.deskFlow.step + '|' + (d.editingId || '') + '|' + (d.preset || ''), flow: u.deskFlow.step };
    }
    var p = u.deskSel ? store.payment(u.deskSel) : null;
    if (!p) return { sig: s.role + '|empty' };
    var a = p.approval && p.approval.version === p.version ? p.approval : null;
    return {
      sig: s.role + '|' + p.id + '|' + p.status + '|' + p.version,
      pid: p.id, akey: p.id + ':' + p.version,
      attempts: a ? a.attempts.length : 0, rekey: a ? a.rekey : null
    };
  }

  function stepper(detail, pid, animate) {
    var steps = $$('.stepper .stp', detail);
    if (!steps.length || !pid) return;
    var states = steps.map(function (s) { var m = /\bis-([a-z-]+)/.exec(s.className); return m ? m[1] : ''; });
    var prev = mem.steps[pid];
    mem.steps[pid] = states;
    if (!animate) return;
    var t = 140;
    states.forEach(function (st, i) {
      var was = prev ? prev[i] : 'upcoming';
      if (prev && was === st) return;
      if (st === 'done' || st === 'returned' || st === 'released' || st === 'stopped') {
        add(steps[i], 'm-pop', t);
        if (st === 'done' || st === 'returned') add(steps[i], 'm-fill', t);
        t += 170;
      } else if (st === 'current' || st === 'now-ret') {
        add(steps[i], 'm-current', t + 60);
        t += 120;
      }
    });
  }

  function consequence(detail, base) {
    var cq = $('.cq', detail);
    if (!cq) return;
    $$('.cq-hero b', cq).forEach(function (b) { countUp(b, base + 120, 750); });
    $$('.cb-val', cq).forEach(function (v, i) { countUp(v, base + 180 + i * 120, 650); });
    $$('.cb-fill', cq).forEach(function (f, i) { add(f, 'm-grow-x', base + 180 + i * 120); });
    add($('.cb-verdict', cq), 'm-rise', base + 820);
  }

  function checks(detail, base) {
    var items = $$('.chk-list > li', detail);
    var fails = items.filter(function (li) { return li.querySelector('.chk.is-fire'); });
    var rest = items.filter(function (li) { return fails.indexOf(li) < 0; });
    fails.concat(rest).forEach(function (li, i) { add(li, 'm-rise', base + i * 55); });
  }

  function desk(main, entering) {
    var detail = $('#desk-detail', main);
    var now = deskState();
    var before = mem.desk;
    mem.desk = now;
    var changed = !before || before.sig !== now.sig;
    var prevA = now.akey ? mem.approval[now.akey] : null;
    if (now.akey) mem.approval[now.akey] = { attempts: now.attempts, rekey: now.rekey };
    var rekeyMoved = !!(prevA && now.attempts > prevA.attempts);
    /* A first re-key mismatch is not a new screen: only the amount box shakes. */
    var retryOnly = rekeyMoved && now.rekey === 'retry' && !changed;
    if (!detail) { if (changed && !entering) stagger($$('.history', main), 'm-rise', 0, 0); return; }
    if (retryOnly) {
      var money = $('.money.big', detail);
      if (money) { money.classList.add('is-miss', 'm-shake'); }
      add($('.rekey .inline-alert', detail), 'm-rise', 0);
      return;
    }
    if (!changed && !rekeyMoved) { stepper(detail, now.pid, false); return; }

    var base = entering ? 140 : 0;
    var parts = $$('#desk-detail > :not(.d-grid):not(.d-focus), #desk-detail .d-grid > :not(.d-rail), #desk-detail .d-rail > *, #desk-detail .d-focus > *', main)
      .filter(function (el) { return !el.classList.contains('dbanner') || !el.classList.contains('t3'); });
    stagger(parts, 'm-rise', base, 45, 8);
    var t3 = $('.dbanner.t3', detail);
    if (t3) add(t3, 'm-barrier', base + 90);
    stepper(detail, now.pid, true);
    consequence(detail, base + 120);
    checks(detail, base + 260);
    if (rekeyMoved && now.rekey === 'pass') add($('.inline-alert.ok', detail), 'm-glow-ok', 0);
    if (rekeyMoved && now.rekey === 'fire') {
      var bad = $('.inline-alert.bad', detail);
      if (bad) { bad.classList.remove('m-rise'); bad.classList.add('m-shake'); }
    }
  }

  /* ------------------------------------------------------------ other screens */
  function readouts(main, base) {
    $$('.kri-value, .tile-value, .tg-value', main).forEach(function (el, i) { countUp(el, base + 120 + Math.min(i, 8) * 40, 800); });
    $$('svg.chart, svg.spark', main).forEach(function (svg) { svg.classList.add('m-draw'); });
  }

  /* ------------------------------------------------------------ hooks called by js/app.js */
  function before() {
    var nav = document.getElementById('tabs');
    mem.tab = tabRect(nav);
    mem.strips = mem.route === 'desk' ? stripSnapshot() : null;
  }

  function after(route) {
    var main = document.getElementById('app');
    var entering = mem.route !== route;
    var prevTab = mem.tab;
    mem.route = route;
    placeTab(entering ? prevTab : null);
    if (reduced() || !main) {
      if (route === 'desk') { mem.desk = deskState(); }
      return;
    }
    try {
      if (entering) {
        var blocks = route === 'desk'
          ? $$('.desk > *:not(.desk-body), .desk-body > .queue', main)
          : $$('#app > *, #app > .tiles > .tile, #app > .cc-grid > .cc-card, #app > .grid-2 > *', main)
            .filter(function (el) { return !el.classList.contains('tiles') && !el.classList.contains('cc-grid') && !el.classList.contains('grid-2'); });
        stagger(blocks, 'm-rise', 0, 45, 9);
        if (route !== 'desk') readouts(main, 0);
      }
      if (route === 'desk') {
        desk(main, entering);
        if (!entering) stripsMove(mem.strips);
      } else {
        mem.desk = null;
      }
    } catch (err) {
      /* Motion must never break a screen. */
      if (root.console) root.console.warn('motion skipped:', err);
    }
  }

  /* Fonts change tab widths after the first paint, so keep the indicator in place. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeTab(null); });
  root.addEventListener('resize', function () { placeTab(null); });

  M.before = before;
  M.after = after;
  M.finish = finish;
  M.reduced = reduced;
  M.countUp = countUp;
  PCAP.motion = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
