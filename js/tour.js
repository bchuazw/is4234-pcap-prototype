/*
 * PCAP prototype: the guided tour ("See how PCAP would have stopped it").
 *
 * Story mode. The app replays the 2020 payment end to end in the real payment desk while the viewer only
 * presses Next: it keys the payment, switches role, submits, re-keys, holds, fixes it, and then shows a
 * routine payment going through in one click for contrast.
 *
 * Robust by design: every step is a plain state change through the same store actions the desk buttons
 * call, followed by one synchronous render. Nothing waits for a timer or an animation. Back rebuilds the
 * state from fresh demo data and replays the earlier steps, so every step always looks the same.
 * Animations (the spotlight sliding, the amount being typed) are cosmetic and off under reduced motion.
 *
 * STEPS (the story) has no DOM code, so the Node tests run it against the store.
 * Classic script. Attaches to window.PCAP.tour (module.exports in Node).
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};

  var WASH_ALL = function (E) { return { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH }; };
  var NOTES = {
    checker: 'Principal set to wash.',
    approver: 'My notice says USD 7.8M of interest only. This would send the principal out.',
    oprisk: 'Principal would leave the bank on an interest-only date. Set FRONT and FUND to the wash account and resubmit.'
  };
  function cleanInstr(S) {
    var lend = { FRONT: 'LENDERS', FUND: 'LENDERS', PRINCIPAL: 'LENDERS' };
    return { loanId: 'LN-1001', operation: 'INTEREST', valueDate: S.today(), interest: 1284375, principal: 0, overrideCode: '', fields: lend,
      makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP3', makerNote: 'Quarterly interest.' };
  }

  /*
   * The story. act(S, E, c, t) changes state (S is the store, c keeps payment IDs, t.dwell(id) is the approver's
   * real time on screen). view(c) says what the screen shows. target is the part of the screen the spotlight
   * frames. Copy: plain words, one or two short sentences, no report codes.
   */
  var STEPS = [
    { id: 'key', title: 'Someone keys a payment', target: '#routing-group .routing',
      text: 'Priya means to pay USD 7.8M of interest and keep the USD 894M of principal inside the bank. For that, all three of these lines must say Stays in the bank, but she set only one.',
      view: function () { return { role: 'maker', form: { preset: 'revlon', step: 1 } }; } },
    { id: 'consequence', title: 'PCAP says what will really happen', target: '.d-lead',
      text: 'Before anything moves, PCAP works out what will really leave the bank: USD 901.7M, about 115 times what is due. So it marks the payment Stopped.',
      view: function () { return { role: 'maker', form: { preset: 'revlon', step: 2 } }; } },
    { id: 'checker', title: 'The checker sees the same warning', target: '.d-rail .action', avoid: '.dbanner, .cq-hero',
      text: 'Priya sends it anyway, as in 2020. The checker sees the same warning and PCAP suggests sending it back, but the tour passes it on, as the checker did in 2020.',
      act: function (S, E, c) { c.revlon = S.submitInstruction(E.REPLAY.instruction(), 'U-MK1').id; },
      view: function (c) { return { role: 'checker', sel: c.revlon }; } },
    { id: 'approver', title: 'Now you are the approver', target: '.rekey',
      text: 'You are the approver. PCAP hides the maker\'s numbers and asks you to type what you expect to pay.',
      act: function (S, E, c) { S.checkPayment(c.revlon, 'U-CK1', NOTES.checker); S.approverOpen(c.revlon); },
      view: function (c) { return { role: 'approver', sel: c.revlon, fill: { amount: '7,820,000', nature: 'INTEREST' } }; } },
    { id: 'mismatch', title: 'Your number does not match', target: '.d-lead',
      text: 'You typed USD 7.8M of interest, but the payment really sends USD 901.7M. After two tries PCAP shows you the real amount and stops the payment, so you cannot release it.',
      act: function (S, E, c) {
        S.approverRekey(c.revlon, 7820000, 'INTEREST');
        S.approverRekey(c.revlon, 7820000, 'INTEREST');
        S.approverReveal(c.revlon);
      },
      view: function (c) { return { role: 'approver', sel: c.revlon }; } },
    { id: 'oprisk', title: 'A separate team decides', target: '.d-rail .action', avoid: '.dbanner, .cq-hero',
      text: 'Only Operational Risk, a team outside the payment chain, can decide on a stopped payment. They see why it was held and who saw it, and releasing it would need a written risk sign-off.',
      act: function (S, E, c, t) { S.approverEscalate(c.revlon, { dwellSec: t.dwell(c.revlon), note: NOTES.approver }); },
      view: function (c) { return { role: 'oprisk', sel: c.revlon }; } },
    { id: 'fixed', title: 'Sent back and fixed', target: '.d-lead',
      text: 'Operational Risk sends it back and Priya fixes the two missing lines. Now only USD 7.8M of interest leaves, and it still gets a closer look because it uses a workaround.',
      act: function (S, E, c) { S.opRiskReject(c.revlon, 'U-OR1', NOTES.oprisk); },
      view: function (c) { return { role: 'maker', form: { edit: c.revlon, fixLegs: true, step: 2 } }; } },
    { id: 'routine', title: 'A routine payment, for contrast', target: '.d-rail .action', avoid: '.dbanner, .cq-hero',
      text: 'Most payments look like this one. It matches the loan schedule, so the approver reads one sentence and clicks Release, with no extra steps.',
      act: function (S, E, c) {
        var fixed = E.clone(S.payment(c.revlon).instr);
        fixed.fields = WASH_ALL(E);
        S.submitInstruction(fixed, 'U-MK1', c.revlon);
        c.clean = S.submitInstruction(cleanInstr(S), 'U-MK1').id;
        S.checkPayment(c.clean, 'U-CK1', '');
        S.approverOpen(c.clean);
        S.approverReveal(c.clean);
      },
      view: function (c) { return { role: 'approver', sel: c.clean }; } },
    { id: 'released', title: 'One click, and it is on record', target: '.d-head',
      text: 'Released in one click. Every step, from keying to release, was recorded for audit as it happened, so nobody has to write it up.',
      act: function (S, E, c, t) { S.approverApprove(c.clean, { dwellSec: t.dwell(c.clean) }); },
      view: function (c) { return { role: 'approver', sel: c.clean }; } },
    { id: 'end', title: 'That\'s PCAP', end: true,
      text: 'PCAP tells people in plain words what a payment will really do. Routine payments go through in one click, and anything unexpected is stopped and sent to the right person.',
      view: function (c) { return { role: 'approver', sel: c.clean }; } }
  ];

  /* Approver time on screen, from the logged reveal time (the same measure the desk uses). */
  function dwellFor(S, id) {
    var p = S.payment(id);
    var a = p && p.approval;
    if (!a || !a.revealedAt) return 0;
    return Math.max(0, Math.round((S.now().getTime() - new Date(a.revealedAt).getTime()) / 100) / 10);
  }

  /* Fresh demo data, then every act up to and including step k. Returns the payment IDs. Used by Back and by the tests. */
  function replayTo(S, E, k) {
    S.reset();
    var c = {};
    var t = { dwell: function (id) { return dwellFor(S, id); } };
    for (var i = 0; i <= k && i < STEPS.length; i++) if (STEPS[i].act) STEPS[i].act(S, E, c, t);
    S.markAuto();
    return c;
  }

  /* ================================================================== browser UI */

  var T = { on: false, i: 0, c: {}, el: null, track: 0, typing: null, lastFocus: null };
  function doc() { return root.document; }
  function reduced() { return !!(PCAP.motion && PCAP.motion.reduced && PCAP.motion.reduced()); }
  function esc(s) { return PCAP.util.esc(s); }

  function start() {
    var S = PCAP.store;
    if (T.on) return;
    if (S.hasUserData() && !root.confirm('The tour starts from fresh demo data, so it clears the payments and changes you made in this browser. Start the tour?')) return;
    T.lastFocus = doc().activeElement;
    build();
    T.on = true;
    go(0, true);
  }

  function step() { return STEPS[T.i]; }

  /* Move to step k. One step forward runs only that step's act. Anything else rebuilds from fresh demo data. */
  function go(k, fresh) {
    var S = PCAP.store, E = PCAP.engine;
    if (k < 0 || k >= STEPS.length) return;
    try {
      if (fresh || k !== T.i + 1) {
        T.c = replayTo(S, E, k);
      } else if (STEPS[k].act) {
        STEPS[k].act(S, E, T.c, { dwell: function (id) { return dwellFor(S, id); } });
        S.markAuto();
      }
      T.i = k;
      show(STEPS[k].view(T.c));
      paint();
      place(true);
      follow();
    } catch (err) {
      if (PCAP.app && PCAP.app.reportError) PCAP.app.reportError(err);
      close(true);
    }
  }

  /* Put the payment desk in the state the step describes and draw it once, synchronously. */
  function show(v) {
    var S = PCAP.store, desk = PCAP.views.desk;
    var st = S.st();
    var u = st.ui = st.ui || {};
    st.role = v.role;
    u.deskLastRole = v.role;
    u.deskView = 'queue';
    u.deskReturn = null;
    u.deskQueueOpen = null;
    u.deskQ = { text: '', tier: '' };
    u.oprRelease = null;
    if (v.form) {
      var d = v.form.preset ? desk.PRESETS[v.form.preset]() : desk.editDraft(v.form.edit, { fixLegs: !!v.form.fixLegs });
      delete d.fresh;
      u.makerDraft = d;
      u.deskFlow = { step: v.form.step };
      u.deskSel = null;
    } else {
      u.deskFlow = null;
      u.deskSel = v.sel;
    }
    S.save();
    /* replaceState does not fire hashchange, so the screen is drawn exactly once, here. */
    if (root.location.hash !== '#/desk') root.history.replaceState(null, '', '#/desk');
    PCAP.app.render();
    if (v.fill) fill(v.fill);
  }

  /* Show the approver's figure being typed. Cosmetic only: the next step does not read it. */
  function fill(f) {
    var input = doc().getElementById('rekey-input');
    var radio = doc().querySelector('input[name="rk-nature"][value="' + f.nature + '"]');
    if (radio) radio.checked = true;
    if (!input) return;
    if (T.typing) { clearInterval(T.typing); T.typing = null; }
    if (reduced()) { input.value = f.amount; return; }
    var n = 0;
    input.value = '';
    T.typing = setInterval(function () {
      n += 1;
      if (!input.isConnected || n > f.amount.length) { clearInterval(T.typing); T.typing = null; return; }
      input.value = f.amount.slice(0, n);
    }, 70);
  }

  /* ------------------------------------------------------------ overlay */

  function build() {
    var d = doc();
    var el = d.createElement('div');
    el.id = 'tour';
    el.className = 'tour';
    el.innerHTML = '<div class="tour-hole" aria-hidden="true"></div>' +
      '<section class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">' +
      '<div class="tour-top"><span class="tour-count" id="tour-count"></span><button type="button" class="tour-skip" data-tour="close">Skip tour</button></div>' +
      '<h2 class="tour-title" id="tour-title"></h2><p class="tour-text" id="tour-text"></p>' +
      '<div class="tour-foot"><ol class="tour-dots" aria-hidden="true"></ol><div class="tour-btns"></div></div></section>';
    d.body.appendChild(el);
    d.body.classList.add('touring');
    T.el = el;
    el.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey, true);
    root.addEventListener('resize', onResize);
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('hashchange', onHash);
  }

  function paint() {
    var s = step();
    var el = T.el;
    var total = STEPS.length - 1;
    el.classList.toggle('is-end', !!s.end);
    el.querySelector('#tour-count').textContent = s.end ? 'The end' : 'Step ' + (T.i + 1) + ' of ' + total;
    el.querySelector('.tour-skip').textContent = s.end ? 'Close' : 'Skip tour';
    el.querySelector('#tour-title').textContent = s.title;
    el.querySelector('#tour-text').textContent = s.text;
    el.querySelector('.tour-dots').innerHTML = STEPS.slice(0, total).map(function (x, i) {
      return '<li class="' + (i < T.i ? 'is-done' : i === T.i ? 'is-on' : '') + '"></li>';
    }).join('');
    var back = T.i > 0 ? '<button type="button" class="btn ghost" data-tour="back">Back</button>' : '';
    el.querySelector('.tour-btns').innerHTML = s.end
      ? back + '<button type="button" class="btn" data-tour="replay">Replay</button><button type="button" class="btn primary" data-tour="explore">Explore on your own</button>'
      : back + '<button type="button" class="btn primary" data-tour="next">' + (T.i === total - 1 ? 'Finish' : 'Next') + '</button>';
    var focus = el.querySelector(s.end ? '[data-tour="explore"]' : '[data-tour="next"]');
    if (focus) { try { focus.focus({ preventScroll: true }); } catch (e) { focus.focus(); } }
  }

  function target() {
    var s = step();
    if (!s || s.end || !s.target) return null;
    var t = doc().querySelector(s.target);
    return t && t.getClientRects().length ? t : null;
  }

  /* Frame the target and put the card next to it. On phones the card is a sheet at the bottom and the target sits above it. */
  function place(scroll) {
    if (!T.on || !T.el) return;
    var d = doc();
    var vw = d.documentElement.clientWidth, vh = root.innerHeight;
    var pop = T.el.querySelector('.tour-pop');
    var hole = T.el.querySelector('.tour-hole');
    var sheet = vw < 700;
    pop.classList.toggle('is-sheet', sheet);
    var el = target();
    T.el.classList.toggle('no-target', !el);
    if (!el) {
      hole.style.cssText = '';
      pop.style.left = ''; pop.style.top = '';
      return;
    }
    var tabs = d.getElementById('tabs');
    var topEdge = (tabs ? Math.max(0, tabs.getBoundingClientRect().bottom) : 0) + 10;
    var popH = pop.offsetHeight, popW = pop.offsetWidth;
    var bottomEdge = sheet ? vh - popH - 14 : vh - 10;
    if (scroll) {
      var r0 = el.getBoundingClientRect();
      var space = bottomEdge - topEdge;
      var y = root.pageYOffset + r0.top;
      var want = r0.height + 16 <= space ? y - topEdge - (space - r0.height) / 2 : y - topEdge - 8;
      root.scrollTo(0, Math.max(0, Math.round(want)));
    }
    var r = el.getBoundingClientRect();
    var pad = 8;
    var top = Math.max(r.top - pad, topEdge - 6), bottom = Math.min(r.bottom + pad, bottomEdge + 6);
    if (bottom < top + 24) bottom = top + 24;
    var left = Math.max(4, r.left - pad), right = Math.min(vw - 4, r.right + pad);
    hole.style.left = Math.round(left) + 'px';
    hole.style.top = Math.round(top) + 'px';
    hole.style.width = Math.round(right - left) + 'px';
    hole.style.height = Math.round(bottom - top) + 'px';
    if (sheet) { pop.style.left = ''; pop.style.top = ''; return; }
    /* Try beside the target, then below, above and the corners. Keep off the spotlight and off anything the step says
       the viewer must read (step.avoid, for example the consequence sentence). The first spot that is clear wins. */
    var gap = 16;
    function clampY(v) { return Math.max(12, Math.min(vh - popH - 12, v)); }
    function clampX(v) { return Math.max(12, Math.min(vw - popW - 12, v)); }
    var spots = [];
    if (vw - right >= popW + gap + 12) { spots.push([right + gap, clampY(top)]); spots.push([right + gap, clampY(bottom - popH)]); }
    if (left >= popW + gap + 12) { spots.push([left - gap - popW, clampY(top)]); spots.push([left - gap - popW, clampY(bottom - popH)]); }
    if (vh - bottom >= popH + gap + 12) spots.push([clampX(left), bottom + gap]);
    if (top - topEdge >= popH + gap) spots.push([clampX(left), top - gap - popH]);
    spots.push([vw - popW - 24, vh - popH - 24], [24, vh - popH - 24]);
    var holeBox = { left: left, top: top, right: right, bottom: bottom };
    var keep = step().avoid ? Array.prototype.map.call(d.querySelectorAll(step().avoid), function (e) { return e.getBoundingClientRect(); }) : [];
    function hit(x, y, b) { return Math.max(0, Math.min(x + popW, b.right) - Math.max(x, b.left)) * Math.max(0, Math.min(y + popH, b.bottom) - Math.max(y, b.top)); }
    var best = null;
    spots.forEach(function (sp) {
      var score = hit(sp[0], sp[1], holeBox) * 4 + keep.reduce(function (n, b) { return n + hit(sp[0], sp[1], b); }, 0);
      if (!best || score < best.score) best = { x: sp[0], y: sp[1], score: score };
    });
    var px = best.x, py = best.y;
    pop.style.left = Math.round(px) + 'px';
    pop.style.top = Math.round(py) + 'px';
  }

  /* Screens rise in for a moment after they are drawn, so keep the frame on its target for about a second. Cosmetic only. */
  function follow() {
    if (T.track) root.cancelAnimationFrame(T.track);
    var t0 = Date.now();
    var tick = function () {
      T.track = 0;
      if (!T.on) return;
      place(false);
      if (Date.now() - t0 < 1200) T.track = root.requestAnimationFrame(tick);
    };
    T.track = root.requestAnimationFrame(tick);
  }

  var scrollQueued = false;
  function onScroll() {
    if (!T.on || scrollQueued) return;
    scrollQueued = true;
    root.requestAnimationFrame(function () { scrollQueued = false; place(false); });
  }
  function onResize() { if (T.on) place(true); }
  /* Any navigation the tour did not make (the browser Back button) ends the tour. */
  function onHash() { if (T.on) close(true); }

  function onClick(e) {
    var b = e.target.closest && e.target.closest('[data-tour]');
    if (!b) return;
    var a = b.getAttribute('data-tour');
    if (a === 'next') go(T.i + 1);
    else if (a === 'back') go(T.i - 1);
    else if (a === 'close') close();
    else if (a === 'replay') go(0, true);
    else if (a === 'explore') explore();
  }

  function onKey(e) {
    if (!T.on) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.slice.call(T.el.querySelectorAll('button'));
      if (!f.length) return;
      var i = f.indexOf(doc().activeElement);
      e.preventDefault();
      var n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
      f[n].focus();
      e.stopPropagation();
      return;
    }
    if (e.key === 'ArrowRight' && !step().end) { e.preventDefault(); e.stopPropagation(); go(T.i + 1); return; }
    if (e.key === 'ArrowLeft' && T.i > 0) { e.preventDefault(); e.stopPropagation(); go(T.i - 1); return; }
    /* Nothing else reaches the screen underneath while the tour runs (no desk shortcuts). Enter and Space still press the focused button. */
    e.stopPropagation();
  }

  function teardown() {
    if (T.typing) { clearInterval(T.typing); T.typing = null; }
    if (T.track) { root.cancelAnimationFrame(T.track); T.track = 0; }
    root.removeEventListener('keydown', onKey, true);
    root.removeEventListener('resize', onResize);
    root.removeEventListener('scroll', onScroll);
    root.removeEventListener('hashchange', onHash);
    if (T.el) T.el.remove();
    T.el = null;
    T.on = false;
    doc().body.classList.remove('touring');
  }

  /* Esc or Skip: stop where you are and look around. */
  function close(quiet) {
    if (!T.on) return;
    teardown();
    if (!quiet && PCAP.util) PCAP.util.toast('Tour closed. Everything on screen is real, so look around. Home has the tour again.', 'ok');
    var m = doc().getElementById('app');
    if (m) { try { m.focus({ preventScroll: true }); } catch (e) { m.focus(); } }
  }

  /* "Explore on your own": back to Home, at the role cards. */
  function explore() {
    teardown();
    PCAP.app.go('home');
    root.setTimeout(function () {
      var t = doc().getElementById('try');
      if (t) t.scrollIntoView({ block: 'start' });
      var first = doc().querySelector('#try [data-role-card]');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }, 0);
  }

  PCAP.tour = {
    STEPS: STEPS,
    replayTo: replayTo,
    start: start,
    next: function () { if (T.on && !step().end) go(T.i + 1); },
    back: function () { if (T.on && T.i > 0) go(T.i - 1); },
    goTo: function (k) { if (T.on) go(k, true); },
    close: close,
    state: function () { return { on: T.on, i: T.i, id: T.on ? step().id : null, ids: T.c }; }
  };
  if (typeof module === 'object' && module && module.exports) module.exports = PCAP.tour;
})(typeof globalThis !== 'undefined' ? globalThis : this);
