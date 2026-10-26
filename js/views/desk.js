/*
 * PCAP prototype: Payments, the payment desk (M2 Consequence Engine, M3 Authority Gate, M1 register checks).
 *
 * Queue plus detail layout. The left column is the work queue for the role acting now
 * (waiting for you, in progress, done). The main area shows the selected payment: where it
 * is in its lifecycle, what it will really do (the M2 consequence card), the checks
 * (M1 register, M3 authority, M2 consequence) and the action for the role acting now.
 * Makers create payments in a focused two-step flow: Instruction, then Review.
 *
 * All rule logic stays in js/engine.js and every action goes through js/store.js,
 * so each step writes the same tagged events as before.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  /* Approver time on the consequence screen (M4) counts from the logged reveal time, so it survives a reload. */
  function dwellSec(p) {
    var a = p && p.approval && p.approval.version === p.version ? p.approval : null;
    if (!a || !a.revealedAt) return 0;
    return Math.max(0, (store.now().getTime() - new Date(a.revealedAt).getTime()) / 1000);
  }
  var oprPerf = {};      /* Operational Risk: when the hold was opened (decide time) */
  var noteDrafts = {};   /* unsent notes, kept across re-renders */
  var focusAfter = null; /* selector to focus after the next render */
  var scrollAfter = null; /* selector to bring into view after the next render */
  var renderedAt = 0;    /* when the detail was last drawn: a keyboard release within 600 ms is ignored (no double-Enter releases) */
  var lastFocusKey = ''; /* the payment state the default focus was last set for, so focus is never stolen while you work */
  var ENTER_GUARD_MS = 600;
  var NOTE_MIN = 10;     /* a checker who sends on a Tier 3 payment says why, in at least this many characters */

  var ROLES = [
    { id: 'maker', label: 'Maker', noun: 'the maker' },
    { id: 'checker', label: 'Checker', noun: 'the checker' },
    { id: 'approver', label: 'Approver', noun: 'the approver' },
    { id: 'oprisk', label: 'Op Risk', noun: 'Operational Risk' }
  ];
  var WAITS = { SUBMITTED: 'checker', CHECKED: 'approver', HELD: 'oprisk', RETURNED: 'maker' };
  var FINAL = { RELEASED: true, CANCELLED: true, REJECTED: true };
  var STATUS = {
    SUBMITTED: { label: 'Waiting for checker', short: 'At checker', cls: 'wait' },
    CHECKED: { label: 'Waiting for approver', short: 'At approver', cls: 'wait' },
    HELD: { label: 'Held for Operational Risk', short: 'At Op Risk', cls: 'hold' },
    RETURNED: { label: 'Returned to maker', short: 'Returned', cls: 'ret' },
    RELEASED: { label: 'Released', short: 'Released', cls: 'done' },
    CANCELLED: { label: 'Cancelled', short: 'Cancelled', cls: 'off' },
    REJECTED: { label: 'Rejected', short: 'Rejected', cls: 'off' }
  };
  var ROUTE_LABEL = { LENDERS: 'Out to lenders', WASH: 'Stays in the bank' };
  /* Plain names lead. The tier number is secondary (PCAP.plain). */
  var TIER_TEXT = {
    1: { title: 'Routine.', text: 'Nothing unusual. The approver reads what the payment will do, then releases it.', icon: 'check' },
    2: { title: 'Needs a closer look.', text: 'The approver types the amount from their own source, then confirms what the payment will do.', icon: 'warn' },
    3: { title: 'Stopped.', text: 'Only Operational Risk can release this payment.', icon: 'stop' }
  };
  function tierName(t, short) { var x = PCAP.plain.tier(t); return short ? x.short : x.label; }
  /* A report code as a small tag. Hidden unless "Show report codes" is on. */
  function code(text, cls) { return '<span class="code-tag code-pill' + (cls ? ' ' + cls : '') + '">' + U.esc(text) + '</span>'; }

  /* Icons used only on this screen. 16px, currentColor. */
  var ICO = {
    plus: '<path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    chev: '<path d="M4.5 6.2L8 9.7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    back: '<path d="M12.5 8h-9M7 4.5L3.5 8 7 11.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    undo: '<path d="M6 3.8L3 6.8l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.4 6.8h6.1a3.1 3.1 0 010 6.2H7.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    list: '<path d="M6 4.5h7M6 8h7M6 11.5h7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.2" cy="4.5" r="1" fill="currentColor"/><circle cx="3.2" cy="8" r="1" fill="currentColor"/><circle cx="3.2" cy="11.5" r="1" fill="currentColor"/>',
    user: '<circle cx="8" cy="5.4" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 13.6c.7-2.4 2.7-3.7 5-3.7s4.3 1.3 5 3.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    flask: '<path d="M6.2 2h3.6M6.8 2v4.2L3.4 12.4a1.1 1.1 0 001 1.6h7.2a1.1 1.1 0 001-1.6L9.2 6.2V2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M4.9 10h6.2" stroke="currentColor" stroke-width="1.5"/>',
    inbox: '<path d="M2.4 9.4l1.9-5.1c.2-.5.6-.8 1.1-.8h5.2c.5 0 .9.3 1.1.8l1.9 5.1v3.2a1 1 0 01-1 1H3.4a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.6 9.4H6l.8 1.5h2.4l.8-1.5h3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    doc: '<path d="M4 1.8h5.2L12 4.6v9.6H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 7.5h4M6 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    to: '<path d="M2.5 8h10M9.5 5l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function ico(name, cls) {
    if (!ICO[name]) return U.icon(name, cls);
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' + ICO[name] + '</svg>';
  }

  /* ------------------------------------------------------------ small helpers */

  function st() { return store.st(); }
  function ui() {
    var s = st();
    s.ui = s.ui || {};
    return s.ui;
  }
  function esc(x) { return U.esc(x); }
  function b(x) { return '<b>' + esc(x) + '</b>'; }
  function plain(n) { return E.fmtUSD(n).replace(/^USD /, ''); }
  function shortAmt(n) { return E.fmtCompact(n); }
  function fullAmt(n) { return E.fmtUSD(n); }
  function opShort(op) { return (E.OPERATIONS[op] || {}).short || op; }
  function opLabel(op) { return (E.OPERATIONS[op] || {}).label || op; }
  function loanOf(id) { return store.loan(id) || { id: id, name: id, lenders: 0, schedule: [], principalOutstanding: 0 }; }
  function userOf(id) { return store.user(id) || null; }
  function name(id) { return store.userName(id); }
  function when(iso) { return U.fmtShortDateTime(iso); }
  function listAnd(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function trimDot(s) { return String(s || '').replace(/\.\s*$/, ''); }
  function extend(t, s) { for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; return t; }
  function roleInfo(id) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i];
    return { id: id, label: id, noun: id };
  }
  function srOnly(text) { return '<span class="sr-only">' + esc(text) + '</span>'; }
  /* Blind re-key attempts as text, with what the approver said the payment is. */
  function rekeyLabels(a, asWords) {
    if (!a || !a.attempts || !a.attempts.length) return null;
    return a.attempts.map(function (amt, i) {
      var n = (a.natures || [])[i];
      if (!n) return fullAmt(amt);
      return fullAmt(amt) + (asWords ? ' as ' + E.natureLabel(n).toLowerCase() : ' (' + E.natureLabel(n).toLowerCase() + ')');
    });
  }
  function rekeyAmounts(a) { return a && a.attempts && a.attempts.length ? a.attempts.map(fullAmt) : null; }
  /* The payment types given, once if they were all the same. */
  function rekeyTypes(a) {
    var n = a && a.natures ? a.natures.filter(Boolean).map(function (x) { return E.natureLabel(x); }) : [];
    if (!n.length) return null;
    return n.every(function (x) { return x === n[0]; }) ? [n[0]] : n;
  }
  function readOnlyRole(role) { return role === 'owner' || role === 'audit' || role === 'board' || role === 'vendor'; }

  /* ------------------------------------------------------------ demo scenarios and the maker draft */

  function lenders() { return { FRONT: E.LENDERS, FUND: E.LENDERS, PRINCIPAL: E.LENDERS }; }
  function washAll() { return { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH }; }
  /* "fresh" asks the desk to open the new payment flow on its next render (used by the demo guide). */
  function preset(o) { return extend({ overrideOther: '', editingId: null, valueDateText: null, valueDateBad: false, preset: null, fresh: true }, o); }

  var PRESETS = {
    revlon: function () {
      var i = E.REPLAY.instruction();
      return preset({ loanId: i.loanId, operation: i.operation, valueDate: i.valueDate, interest: plain(i.interest), principal: plain(i.principal), overrideCode: 'WA-01', fields: E.clone(i.fields), checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: i.makerNote, preset: 'revlon' });
    },
    clean: function () {
      return preset({ loanId: 'LN-1001', operation: 'INTEREST', valueDate: store.today(), interest: '1,284,375', principal: '0', overrideCode: '', fields: lenders(), checkerId: 'U-CK1', approverId: 'U-AP3', makerNote: 'Quarterly interest.', preset: 'clean' });
    },
    rollup: function () {
      return preset({ loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: store.today(), interest: '2,145,000', principal: '310,000,000', overrideCode: 'WA-01', fields: washAll(), checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: 'Roll-up. Interest to lenders, principal to wash (WA-01).', preset: 'rollup' });
    },
    blank: function () {
      return preset({ loanId: 'LN-1002', operation: 'PRINCIPAL_AND_INTEREST', valueDate: store.today(), interest: '', principal: '', overrideCode: '', fields: lenders(), checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: '' });
    }
  };
  var SCENARIOS = [
    { id: 'revlon', title: 'Revlon replay, 11 Aug 2020', text: 'Synthetic rebuild of the 2020 payment error.' },
    { id: 'clean', title: 'Clean interest payment', text: 'Scheduled quarterly interest, no workaround.' },
    { id: 'rollup', title: 'Correct WA-01 roll-up', text: 'Interest only, all three parts stay in the bank.' },
    { id: 'blank', title: 'Blank form', text: 'Start from an empty instruction.' }
  ];

  function blankDraft() { var d = PRESETS.blank(); delete d.fresh; return d; }

  /* Operation that fits a schedule line: principal due means principal with interest. A workaround is never chosen for the maker. */
  function opForLine(op, line) {
    if (op === 'INTEREST_VIA_WASH') return op;
    return (line.principal || 0) - (line.paidPrincipal || 0) > 0 ? 'PRINCIPAL_AND_INTEREST' : 'INTEREST';
  }
  function nextLine(ln) {
    return ln.schedule.slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; })
      .filter(function (l) { return (l.paidInterest || 0) < (l.interest || 0) || (l.paidPrincipal || 0) < (l.principal || 0); })[0] || null;
  }
  /* "New payment" opens ready to check: the next unpaid line of the loan, and the checker and approver you used last time. */
  function newDraft() {
    var d = blankDraft();
    var def = ui().makerDefaults || {};
    if (def.checkerId && store.user(def.checkerId)) d.checkerId = def.checkerId;
    if (def.approverId && store.user(def.approverId)) d.approverId = def.approverId;
    var ln = store.loan(d.loanId);
    var line = ln && nextLine(ln);
    if (line) { d.operation = opForLine(d.operation, line); fillFromLine(d, line, ln); }
    return d;
  }
  function draft() {
    var u = ui();
    if (!u.makerDraft) u.makerDraft = blankDraft();
    if (!u.makerDraft.fields) u.makerDraft.fields = lenders();
    return u.makerDraft;
  }

  function draftToInstr(d) {
    return {
      loanId: d.loanId, operation: d.operation, valueDate: d.valueDate,
      interest: U.parseAmount(d.interest === '' ? '0' : d.interest),
      principal: U.parseAmount(d.principal === '' ? '0' : d.principal),
      overrideCode: d.overrideCode === '__other' ? String(d.overrideOther || '').trim().toUpperCase() : d.overrideCode,
      fields: E.clone(d.fields),
      makerId: store.roleUserId('maker'), checkerId: d.checkerId, approverId: d.approverId,
      makerNote: d.makerNote || ''
    };
  }

  /* Dates are typed and shown as "11 Aug 2020". Also accepts 2020-08-11 and 11/08/2020 (day first). */
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function isoOf(y, m, d) {
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function parseDate(s) {
    var t = String(s || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
    var x;
    if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return isoOf(+x[1], +x[2], +x[3]);
    if ((x = /^(\d{1,2})[ \-\/.]?([A-Za-z]{3,9})\.?[ \-\/.]?(\d{4})$/.exec(t))) return MON[x[2].slice(0, 3).toLowerCase()] ? isoOf(+x[3], MON[x[2].slice(0, 3).toLowerCase()], +x[1]) : null;
    if ((x = /^([A-Za-z]{3,9})\.? (\d{1,2}) (\d{4})$/.exec(t))) return MON[x[1].slice(0, 3).toLowerCase()] ? isoOf(+x[3], MON[x[1].slice(0, 3).toLowerCase()], +x[2]) : null;
    if ((x = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(t))) return isoOf(+x[3], +x[2], +x[1]);
    return null;
  }
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function weekday(iso) { var p = iso.split('-'); return WEEKDAYS[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()]; }

  /* ------------------------------------------------------------ payment facts */

  function isFinal(p) { return !!FINAL[p.status]; }
  function waitsFor(p) { return WAITS[p.status] || null; }
  function snapOf(p) { return p.status === 'RELEASED' ? (p.atRelease || p.atSubmit) : (p.atHold || p.atSubmit); }
  function rekeyDone(p) {
    var a = p.approval;
    return !!(a && a.version === p.version && (a.rekey === 'pass' || a.rekey === 'fire'));
  }
  /* Tier and outgoing amount for lists. Final payments use their snapshot, not a fresh evaluation. */
  function facts(p) {
    if (isFinal(p)) {
      var s = snapOf(p) || {};
      return { tier: s.tier || 1, total: p.status === 'RELEASED' ? p.releasedExternal : (s.external || 0) };
    }
    var ev = store.currentEval(p);
    return { tier: ev.tier, total: ev.consequence.externalTotal };
  }
  /* The approver re-keys blind, so amounts stay hidden from that role until the re-key is done. */
  function amountsHidden(p, role, tier) {
    return role === 'approver' && (p.status === 'SUBMITTED' || p.status === 'CHECKED') && tier >= 2 && !rekeyDone(p);
  }
  function firstWaiting(role) {
    var list = st().payments;
    for (var i = 0; i < list.length; i++) if (waitsFor(list[i]) === role) return list[i];
    return null;
  }

  function paymentEvents(id) { return st().events.filter(function (e) { return e.paymentId === id; }); }
  /* Events since the payment was last submitted or resubmitted. */
  function roundEvents(p) {
    var evs = paymentEvents(p.id);
    var start = 0;
    for (var i = 0; i < evs.length; i++) if (evs[i].type === 'SUBMITTED' || evs[i].type === 'RESUBMITTED') start = i;
    return evs.slice(start);
  }

  /* One view model for the consequence card and the checks, from a live evaluation or a snapshot. */
  function liveModel(ev, instr) {
    var c = ev.consequence, x = ev.expected;
    return {
      tier: ev.tier, results: ev.results, gate: ev.gate, approverId: instr.approverId,
      total: c.externalTotal, interest: c.externalInterest, principal: c.externalPrincipal, kept: c.internalPrincipal,
      lenders: c.lenders, washSet: c.washSet, partialWash: c.partialWash, principalKeyed: E.num(instr.principal),
      expected: x.remainingTotal, date: x.date, scheduled: x.scheduled, alreadyPaid: x.alreadyPaid
    };
  }
  function eventResults(p, tier) {
    var res = {};
    roundEvents(p).forEach(function (e) {
      if (!e.rule || !E.RULES[e.rule] || ['RULE_RESULT', 'BLOCKED_ATTEMPT', 'GATE_CHECK', 'REKEY'].indexOf(e.type) < 0) return;
      res[e.rule] = { status: e.result, message: String(e.detail || '').replace(/^(Approval blocked at the M3 gate|M3 gate open)\. /, '') };
    });
    ['R-03', 'R-04'].forEach(function (k) { if (!res[k]) res[k] = { status: 'na', message: 'No override used.' }; });
    ['R-01', 'R-02', 'R-05', 'R-06'].forEach(function (k) { if (!res[k]) res[k] = { status: 'na', message: 'Not recorded for this payment.' }; });
    if (!res['R-07']) res['R-07'] = { status: 'na', message: tier >= 2 ? 'No blind re-key recorded.' : 'Not needed at Tier 1.' };
    return res;
  }
  function snapModel(p, s) {
    var ln = loanOf(p.instr.loanId);
    var c = E.computeConsequence(p.instr, ln);
    var res = eventResults(p, s.tier);
    var r01 = res['R-01'].message;
    return {
      tier: s.tier, results: res, approverId: p.instr.approverId,
      gate: { open: res['R-05'].status !== 'fire' && res['R-06'].status !== 'fire', failures: ['R-05', 'R-06'].filter(function (k) { return res[k].status === 'fire'; }) },
      total: s.external || 0, principal: s.externalPrincipal || 0, interest: E.round2((s.external || 0) - (s.externalPrincipal || 0)), kept: s.internalPrincipal || 0,
      lenders: ln.lenders, washSet: c.washSet, partialWash: c.partialWash, principalKeyed: E.num(p.instr.principal),
      expected: s.expected || 0, date: p.instr.valueDate, scheduled: !/^Nothing is due on/.test(r01), alreadyPaid: /already paid/.test(r01)
    };
  }
  function modelFor(p) {
    if (isFinal(p) && snapOf(p)) return snapModel(p, snapOf(p));
    return liveModel(store.currentEval(p), p.instr);
  }

  /* ------------------------------------------------------------ chips */

  function statusChip(status, shortForm) {
    var s = STATUS[status] || { label: status, short: status, cls: 'off' };
    return '<span class="sc sc-' + s.cls + '">' + esc(shortForm ? s.short : s.label) + '</span>';
  }
  /* Plain tier name, with the tier number small and secondary. */
  function tierText(t, full) {
    return '<span class="tt tt' + t + '">' + esc(tierName(t, !full)) + '<span class="tier-n">Tier ' + t + '</span></span>';
  }

  /* ------------------------------------------------------------ checks: short plain labels */

  function checkLabel(k, r, m) {
    var s = r.status, msg = String(r.message || ''), ap = name(m.approverId), x;
    switch (k) {
      case 'R-03':
        if (s === 'na') return 'No workaround used';
        if (s === 'pass') return ((x = /^(\S+) is an active register entry/.exec(msg)) ? x[1] : 'The workaround') + ' is registered and active';
        if ((x = /^Override "([^"]+)" is not in the M1 register/.exec(msg))) return 'Workaround "' + x[1] + '" is not on the workaround list';
        if ((x = /(\S+) is retired/.exec(msg))) return x[1] + ' is retired';
        if ((x = /(\S+) is only proposed/.exec(msg))) return x[1] + ' is not approved by its owner yet';
        if ((x = /(\S+) dispensation expired/.exec(msg))) return x[1] + ' dispensation has expired';
        if ((x = /(\S+) is not approved for this operation/.exec(msg))) return x[1] + ' is not approved for this operation';
        if (/^Wash-account settings are used/.test(msg)) return 'Money kept in the bank with no workaround named';
        if (/^The workaround operation is used/.test(msg)) return 'Workaround used that is not on the list';
        return trimDot(msg);
      case 'R-04':
        if (s === 'na') return 'No workaround fields to check';
        if (s === 'pass') return 'Workaround set up in full';
        if ((x = /Not set: (.+?)\.?$/.exec(msg))) return 'Workaround half done: ' + x[1] + ' not set to stay in the bank';
        return trimDot(msg);
      case 'R-05':
        if (s === 'na') return 'Certification not recorded';
        if (s === 'pass') return ap + ' is ' + ((x = /current (\S+) certification/.exec(msg)) ? 'certified for ' + x[1] + ' and ' : '') + 'within the approval limit';
        if (/No approver assigned/.test(msg)) return 'No approver assigned';
        if (/certification expired/.test(msg)) return ap + '\'s certification has expired';
        if ((x = /is not certified for (\S+?)\./.exec(msg))) return ap + ' is not certified for ' + x[1];
        if (/approval limit/.test(msg)) return ap + '\'s approval limit is too low for this payment';
        if (/does not hold the approver role/.test(msg)) return ap + ' does not hold the approver role';
        return trimDot(msg);
      case 'R-06':
        if (s === 'na') return 'Independence not recorded';
        if (s === 'pass') return ap + (/in-house/.test(msg) ? ' is independent and works for the bank' : ' is independent of the maker and checker');
        if (/No approver assigned/.test(msg)) return 'No approver assigned';
        if (/The approver is the maker/.test(msg)) return 'The approver is also the maker';
        if (/The approver is the checker/.test(msg)) return 'The approver is also the checker';
        if (/The maker also checked/.test(msg)) return 'The maker also checked the payment';
        if ((x = /same team as the (.+?) \(/.exec(msg))) return ap + ' sits in the same team as the ' + x[1];
        if (/reporting line/.test(msg)) return ap + ' is in their reporting line';
        if (/in-house/.test(msg)) return 'Workaround payments need an approver who works for the bank';
        return trimDot(msg);
      case 'R-01':
        if (s === 'na') return 'Variance not recorded';
        if (s === 'pass') return /inside the/.test(msg) ? 'Within tolerance of the loan schedule' : /^Nothing leaves/.test(msg) ? 'Nothing leaves and nothing is due' : 'Matches the loan schedule';
        if (/already paid/.test(msg)) return 'This schedule line is already paid';
        if (/^Nothing is due on/.test(msg)) return 'Nothing is due on this value date';
        if ((x = /is (USD [\d,.]+) (more|less) than/.exec(msg))) return shortAmt(U.parseAmount(x[1])) + ' ' + x[2] + ' than the loan schedule expects';
        return trimDot(msg);
      case 'R-02':
        if (s === 'na') return 'Principal check not recorded';
        if (s === 'pass') return /^No principal/.test(msg) ? 'No principal leaves the bank' : 'Principal matches what is due';
        if ((x = /^(USD [\d,.]+) of principal would leave the bank, but no principal is due/.exec(msg))) return shortAmt(U.parseAmount(x[1])) + ' of principal leaves, but none is due';
        if (/but only/.test(msg)) return 'More principal leaves than is due';
        return trimDot(msg);
      case 'R-07':
        if (s === 'na') return /Tier 1/.test(msg) ? 'No typed check needed for a routine payment' : 'No typed check recorded';
        if (s === 'pending') return 'The approver will type the amount and payment type without seeing them';
        if (s === 'retry') return 'The approver\'s first figure did not match';
        if (s === 'pass') return /second/.test(msg) ? 'The approver\'s figure matched on the second try' : 'The approver\'s figure matched';
        if (s === 'fire') return 'The approver\'s figure did not match, twice';
        return trimDot(msg);
    }
    return trimDot(msg);
  }

  var GROUPS = [
    { title: 'Workaround', mod: 'M1', rules: ['R-03', 'R-04'] },
    { title: 'Who can approve', mod: 'M3', rules: ['R-05', 'R-06'] },
    { title: 'Amount and schedule', mod: 'M2', rules: ['R-01', 'R-02', 'R-07'] }
  ];
  var RANK = { fire: 0, retry: 1, pending: 2, pass: 3, na: 4 };
  var CHK_ICON = { fire: 'x', pass: 'check', pending: 'clock', retry: 'warn', na: 'dash' };
  var CHK_SR = { fire: 'Failed. ', pass: 'Passed. ', pending: 'Waiting. ', retry: 'Needs a retry. ', na: 'Not applicable. ' };

  function checkLines(m) {
    var res = m.results || {};
    var out = { groups: [], fail: 0, pass: 0, wait: 0, failed: [] };
    out.groups = GROUPS.map(function (g, gi) {
      var lines = g.rules.map(function (k, i) { return { k: k, r: res[k] || { status: 'na', message: '' }, i: i }; });
      if (g.mod === 'M1' && lines.every(function (l) { return l.r.status === 'na'; })) {
        lines = [{ k: 'R-03', ids: 'R-03, R-04', i: 0, label: 'No workaround used',
          r: { status: 'na', message: 'No override code, wash-account setting or workaround operation is used, so there is nothing to match against the register.' } }];
      }
      lines.forEach(function (l) {
        l.label = l.label || checkLabel(l.k, l.r, m);
        if (l.r.status === 'fire') { out.fail++; out.failed.push(l); } else if (l.r.status === 'pass') out.pass++; else if (l.r.status !== 'na') out.wait++;
      });
      lines.sort(function (a, c) { return (RANK[a.r.status] - RANK[c.r.status]) || (a.i - c.i); });
      return { g: g, gi: gi, lines: lines, fails: lines.filter(function (l) { return l.r.status === 'fire'; }).length };
    });
    /* Failed checks first: groups with failures lead, then the usual Register, Authority, Consequence order. */
    out.groups.sort(function (a, c) { return (c.fails - a.fails) || (a.gi - c.gi); });
    return out;
  }

  function checkLine(l) {
    var rule = E.RULES[l.k];
    var more = l.ids ? 'R-03 Unregistered workaround and R-04 Incomplete workaround (M1 register).' : l.k + ' ' + rule.name + ' (' + rule.module + '). ' + rule.action;
    return '<li><details class="chk is-' + l.r.status + '"><summary>' +
      '<span class="chk-icon">' + U.icon(CHK_ICON[l.r.status] || 'dash') + '</span>' +
      '<span class="chk-label">' + srOnly(CHK_SR[l.r.status] || '') + esc(l.label) + '</span>' +
      '<span class="chk-id code-tag">' + esc(l.ids || l.k) + '</span>' + ico('chev', 'chk-chev') + '</summary>' +
      '<div class="chk-more"><p>' + U.say(l.r.message) + '</p><p class="chk-rule code-tag">' + esc(more) + '</p></div></details></li>';
  }

  /* Failed checks are always shown. Checks that passed fold away behind one line, so a routine payment is one short card. */
  function checksCard(m, opts) {
    opts = opts || {};
    var c = checkLines(m);
    var summary = (c.fail ? c.fail + ' failed' : 'None failed') + ', ' + c.pass + ' passed' + (c.wait ? ', ' + c.wait + ' to come' : '');
    var restCount = 0;
    var rest = c.groups.map(function (G) {
      var lines = G.lines.filter(function (l) { return l.r.status !== 'fire'; });
      restCount += lines.length;
      if (!lines.length) return '';
      return '<div class="chk-group"><h4 class="chk-gtitle">' + esc(G.g.title) + ' <span class="chk-mod code-tag">' + G.g.mod + '</span></h4><ul class="chk-list">' + lines.map(checkLine).join('') + '</ul></div>';
    }).join('');
    var failed = c.failed.length ? '<ul class="chk-list chk-failed">' + c.failed.map(checkLine).join('') + '</ul>' : '';
    var lead = c.failed.length ? '' : '<p class="chk-ok">' + U.icon('check') + '<span>PCAP checked the workaround list, who can approve and the loan schedule. Nothing failed.</span></p>';
    return '<section class="card checks" aria-labelledby="checks-title"><div class="sec-head"><h3 id="checks-title">Checks</h3><span class="sec-meta">' + esc(summary) + '</span></div>' +
      failed + lead +
      (rest ? '<details class="chk-rest"' + (opts.open ? ' open' : '') + '><summary>' + esc(c.failed.length ? 'Show the other ' + restCount + ' checks' : 'Show all ' + restCount + ' checks') + ico('chev', 'fold-chev') + '</summary>' +
        rest + '<p class="chk-foot">Select a check to see the full rule result.</p></details>' : '') + '</section>';
  }

  /* ------------------------------------------------------------ the consequence card */

  function heroSentence(m) {
    if (m.total <= 0) return 'Nothing will leave the bank.';
    var to = ' to ' + b(m.lenders) + ' lender' + (m.lenders === 1 ? '' : 's');
    if (m.principal > 0 && m.interest > 0) return 'This payment will send ' + b(shortAmt(m.total)) + to + ', including ' + b(shortAmt(m.principal)) + ' of principal.';
    if (m.principal > 0) return 'This payment will send ' + b(shortAmt(m.total)) + ' of principal' + to + '.';
    return 'This payment will send ' + b(shortAmt(m.total)) + ' of interest' + to + '.';
  }
  function keptSentence(m) { return m.kept > 0 ? b(shortAmt(m.kept)) + ' of principal stays inside the bank, in the wash account.' : ''; }

  function variance(m) {
    var r = m.results && m.results['R-01'];
    var diff = E.round2(m.total - m.expected);
    var cfg = E.DEFAULT_CONFIG;
    var fire = !!(r && r.status === 'fire');
    var crit = fire && (m.expected <= 0 || Math.abs(diff) > cfg.tier3Abs || Math.abs(diff) / m.expected > cfg.tier3Pct);
    return { diff: diff, fire: fire, tone: !fire ? 'good' : crit ? 'crit' : 'warn' };
  }
  function ratioText(x) { return x >= 10 ? String(Math.round(x)) : (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }

  function barsHtml(m) {
    var v = variance(m);
    var max = Math.max(m.total, m.expected);
    function width(x) { return max <= 0 || x <= 0 ? 0 : Math.max(0.8, (x / max) * 100); }
    var date = U.fmtDate(m.date);
    var verdict;
    if (!m.scheduled) verdict = 'Nothing is due on ' + date + '.';
    else if (m.alreadyPaid) verdict = 'The schedule line for ' + date + ' is already paid.';
    else if (Math.abs(v.diff) < 0.005) verdict = 'Matches the loan schedule for ' + date + '.';
    else if (m.expected > 0 && m.total / m.expected >= 2) verdict = ratioText(m.total / m.expected) + ' times what the loan schedule expects for ' + date + '.';
    else verdict = shortAmt(Math.abs(v.diff)) + (v.diff > 0 ? ' more' : ' less') + ' than the loan schedule expects' + (v.fire ? '.' : ', inside the tolerance.');
    function row(label, value, tone, tip) {
      return '<div class="cb-row" data-tip="' + esc(tip) + '"><span class="cb-label">' + esc(label) + '</span>' +
        '<span class="cb-track"><span class="cb-fill ' + tone + '" style="width:' + width(value).toFixed(2) + '%"></span></span>' +
        '<span class="cb-val">' + esc(shortAmt(value)) + '</span></div>';
    }
    return '<div class="cb" role="img" aria-label="' + esc('Loan schedule expects ' + shortAmt(m.expected) + '. This payment sends ' + shortAmt(m.total) + '. ' + verdict) + '">' +
      row('Loan schedule expects', m.expected, 'neutral', 'Loan schedule expects ' + fullAmt(m.expected) + ' on ' + date) +
      row('This payment sends', m.total, v.tone, 'This payment sends ' + fullAmt(m.total)) + '</div>' +
      '<p class="cb-verdict is-' + v.tone + '">' + U.icon(v.tone === 'good' ? 'check' : v.tone === 'warn' ? 'warn' : 'stop') + '<span>' + esc(verdict) + '</span></p>';
  }

  function figuresHtml(m, opts) {
    var v = variance(m);
    var rows = [];
    if (opts.rekey && opts.rekey.length) rows.push([opts.rekeyLabel || 'Your typed figure', opts.rekey.join(' then '), 'is-rekey']);
    if (opts.rekeyTypes && opts.rekeyTypes.length) rows.push(['Payment type given', opts.rekeyTypes.join(' then '), 'is-rekey']);
    rows.push(['Interest to lenders', fullAmt(m.interest), '']);
    rows.push(['Principal to lenders', fullAmt(m.principal), m.principal > 0 ? 'strong' : '']);
    if (m.kept > 0 || m.principalKeyed > 0) rows.push(['Principal kept in the bank', fullAmt(m.kept), '']);
    rows.push(['Total leaving the bank', fullAmt(m.total), 'total']);
    rows.push(['Loan schedule expects, ' + U.fmtDate(m.date), fullAmt(m.expected), '']);
    rows.push(['Difference', (v.diff > 0 ? '+' : '') + fullAmt(v.diff), Math.abs(v.diff) < 0.005 ? 'ok' : v.fire ? 'bad' : '']);
    /* Open at Tier 3, where the numbers are the decision. Folded otherwise: the sentence and the bars say it. */
    var open = opts.figsOpen != null ? opts.figsOpen : m.tier === 3;
    return '<details class="cq-figs"' + (open ? ' open' : '') + '><summary><h4>Full figures</h4><span class="cq-figs-meta">' + esc(fullAmt(m.total) + ' out, ' + fullAmt(m.expected) + ' expected') + '</span>' + ico('chev', 'fold-chev') + '</summary><table class="figs"><tbody>' + rows.map(function (r) {
      return '<tr' + (r[2] ? ' class="' + r[2] + '"' : '') + '><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table></details>';
  }

  function consequenceCard(m, opts) {
    opts = opts || {};
    var subs = [];
    if (m.kept > 0) subs.push(keptSentence(m));
    if (m.partialWash && m.principalKeyed > 0) {
      subs.push('Only ' + esc(listAnd(m.washSet)) + (m.washSet.length === 1 ? ' is' : ' are') + ' set to stay in the bank. The workaround needs FRONT, FUND and PRINCIPAL all set that way, so the principal still goes to the lenders.');
    }
    return '<section class="card cq cq-t' + m.tier + '" aria-labelledby="cq-title">' +
      '<h3 class="eyebrow" id="cq-title">' + esc(opts.eyebrow || 'What this payment will do') + '</h3>' +
      '<p class="cq-hero">' + heroSentence(m) + '</p>' +
      subs.map(function (x) { return '<p class="cq-sub">' + x + '</p>'; }).join('') +
      barsHtml(m) + figuresHtml(m, opts) + '</section>';
  }

  function decisionBanner(m, p) {
    var t = TIER_TEXT[m.tier] || TIER_TEXT[1];
    var released = !!(p && p.status === 'RELEASED');
    var gate = m.gate && !m.gate.open
      ? '<p class="db-gate">' + U.icon('lock') + '<span>' + esc(name(m.approverId)) + ' is not allowed to approve this payment, so it has to go to another approver. ' + code('M3') + '</span></p>' : '';
    var title = released ? 'Released.' : t.title;
    var text = released ? 'PCAP had marked it ' + tierName(m.tier).toLowerCase() + '.' : t.text;
    if (released && p.viaOpRisk && p.opRisk && p.opRisk.acceptance) text = 'Released by Operational Risk under risk sign-off ' + p.opRisk.acceptance.id + ', owned by ' + name(p.opRisk.acceptance.ownerId) + '.';
    return '<div class="dbanner t' + m.tier + '" role="status">' + U.icon(released ? 'check' : t.icon) + '<div class="db-body"><p><span class="db-tag">Tier ' + m.tier + '</span> <strong>' + U.term('tier' + m.tier, title, 'on-banner') + '</strong> ' + esc(text) + '</p>' + gate + '</div></div>';
  }

  /* A card that folds away: the summary line says what is inside, so most people never need to open it. */
  function fold(cls, title, meta, body, open) {
    return '<details class="card fold ' + cls + '"' + (open ? ' open' : '') + '><summary class="fold-sum"><h3>' + esc(title) + '</h3><span class="fold-meta">' + esc(meta) + '</span>' + ico('chev', 'fold-chev') + '</summary>' +
      '<div class="fold-body">' + body + '</div></details>';
  }

  /* ------------------------------------------------------------ instruction and people */

  function kv(k, v, cls) { return '<div><dt>' + esc(k) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</dd></div>'; }

  function routingView(fields) {
    return '<div class="rt"><p class="rt-title">Where each part goes</p><ul class="rt-list">' + E.OVERRIDE_FIELDS.map(function (f) {
      var v = fields[f];
      return '<li><span class="rt-leg">' + f + '</span>' + ico('to', 'rt-arrow') + '<span class="rt-to' + (v === E.WASH ? ' is-wash' : '') + '">' + esc(ROUTE_LABEL[v] || v) + '</span></li>';
    }).join('') + '</ul></div>';
  }

  function instructionCard(instr, opts) {
    opts = opts || {};
    var ln = loanOf(instr.loanId);
    var amt = function (v) { return opts.hideAmounts ? '<span class="muted">Hidden until you type your figure</span>' : esc(fullAmt(v)); };
    if (opts.fold) {
      var wash = E.OVERRIDE_FIELDS.filter(function (f) { return instr.fields[f] === E.WASH; });
      var meta = ln.id + ', ' + opShort(instr.operation).toLowerCase() + ', ' + (wash.length ? listAnd(wash) + ' stay' + (wash.length === 1 ? 's' : '') + ' in the bank' : 'all parts to the lenders');
      return fold('instr', 'Instruction', meta, '<p class="sec-meta">As keyed in the core loan system</p><dl class="kv2">' +
        kv('Loan', esc(ln.id + ' ' + ln.name)) + kv('Operation', esc(opLabel(instr.operation))) + kv('Value date', esc(U.fmtDate(instr.valueDate))) +
        kv('Workaround code', esc(instr.overrideCode || 'None')) + kv('Interest', amt(instr.interest), 'num') + kv('Principal', amt(instr.principal), 'num') +
        '</dl>' + routingView(instr.fields), opts.open);
    }
    return '<section class="card instr" aria-labelledby="instr-title"><div class="sec-head"><h3 id="instr-title">Instruction</h3>' +
      (opts.edit ? '<button type="button" class="btn link small" data-action="flow-step" data-step="1">Edit instruction</button>' : '<span class="sec-meta">As keyed in the core loan system</span>') + '</div>' +
      '<dl class="kv2">' +
      kv('Loan', esc(ln.id + ' ' + ln.name)) +
      kv('Operation', esc(opLabel(instr.operation))) +
      kv('Value date', esc(U.fmtDate(instr.valueDate))) +
      kv('Workaround code', esc(instr.overrideCode || 'None')) +
      kv('Interest', amt(instr.interest), 'num') +
      kv('Principal', amt(instr.principal), 'num') +
      '</dl>' + routingView(instr.fields) + '</section>';
  }

  function personRow(role, id, extra, note) {
    var u = userOf(id);
    var org = u ? u.employer + ', ' + (u.inHouse ? 'in-house' : 'outsourced') : '';
    return '<li><span class="ppl-role">' + esc(role) + '</span><span class="ppl-name">' + esc(u ? u.name : (id ? name(id) : 'Not assigned')) + '</span>' +
      '<span class="ppl-org">' + esc([org, extra].filter(Boolean).join('. ')) + '</span>' +
      (note ? '<q class="ppl-note">' + esc(note) + '</q>' : '') + '</li>';
  }

  function peopleCard(p, opts) {
    opts = opts || {};
    var a = p.approval && p.approval.version === p.version ? p.approval : null;
    var evs = roundEvents(p);
    var opr = null;
    evs.forEach(function (e) { if (e.type === 'OPRISK_REJECTED' || e.type === 'OPRISK_RELEASED') opr = e; });
    var rl = rekeyLabels(a);
    var rekeys = rl ? 'Typed ' + rl.join(' then ') : '';
    var acc = p.opRisk && p.opRisk.acceptance;
    var items = personRow('Maker', p.makerId, '', p.instr.makerNote) +
      personRow('Checker', p.checkerId, '', opts.hideCheckerNote ? '' : p.checkerNote) +
      personRow('Approver', p.approverId, opts.hideRekeys ? '' : rekeys, a && a.note) +
      (opr && p.opRisk ? personRow('Op Risk', p.opRisk.by, p.opRisk.decision === 'release' ? 'Released under risk sign-off ' + (acc ? acc.id : '') + ' (' + p.opRisk.category + ')' : 'Rejected', p.opRisk.reason) : '') +
      (acc ? personRow('Risk owner', acc.ownerId, 'Accepted the risk for this payment only, until ' + U.fmtDate(acc.expires), PCAP.plain && !U.codesOn() ? PCAP.plain.plainText(acc.followUp) : acc.followUp) : '') +
      (p.heldAt && p.status === 'HELD' ? '<li><span class="ppl-role">Held</span><span class="ppl-name">' + esc(U.fmtDateTime(p.heldAt)) + '</span></li>' : '');
    if (opts.fold) {
      var notes = [p.instr.makerNote, opts.hideCheckerNote ? '' : p.checkerNote, a && a.note].filter(Boolean).length;
      var meta = [name(p.makerId), name(p.checkerId), name(p.approverId)].join(', ') + (notes ? '. ' + notes + ' note' + (notes === 1 ? '' : 's') : '');
      return fold('people', opts.title || 'People and notes', meta, '<ul class="ppl">' + items + '</ul>', opts.open);
    }
    return '<section class="card people" aria-label="' + esc(opts.title || 'People and notes') + '"><div class="sec-head"><h3>' + esc(opts.title || 'People and notes') + '</h3></div><ul class="ppl">' + items + '</ul></section>';
  }

  /* ------------------------------------------------------------ lifecycle stepper */

  function lifecycle(p, m) {
    var evs = roundEvents(p);
    function last(type) { for (var i = evs.length - 1; i >= 0; i--) if (evs[i].type === type) return evs[i]; return null; }
    var sub = evs[0] || null, chk = last('CHECKED'), rel = last('RELEASED'), held = last('HELD');
    var oRel = last('OPRISK_RELEASED'), oRej = last('OPRISK_REJECTED'), ret = last('RETURNED'), canc = last('CANCELLED');
    var t3 = m.tier === 3 || !!held;
    var steps = [
      { label: 'Instruction', state: 'done', meta: name(p.makerId) + (sub ? ', ' + (sub.type === 'RESUBMITTED' ? 'resubmitted ' : '') + when(sub.ts) : '') },
      { label: 'Checker review', state: 'upcoming', meta: name(p.checkerId) },
      { label: 'Approver confirmation', state: 'upcoming', meta: name(p.approverId) },
      { label: 'Op Risk review', state: t3 ? 'upcoming' : 'skipped', meta: t3 ? 'Needed, PCAP stopped it' : 'Only if stopped' },
      { label: 'Release', state: 'upcoming', meta: 'Not released yet' }
    ];
    if (chk) { steps[1].state = 'done'; steps[1].meta = name(chk.actorId) + ', ' + when(chk.ts); }
    if (rel) { steps[2].state = 'done'; steps[2].meta = name(rel.actorId) + ', approved ' + when(rel.ts); }
    if (held) { steps[2].state = 'done'; steps[2].meta = name(held.actorId) + ', sent on ' + when(held.ts); }
    if (oRel) { steps[3].state = 'done'; steps[3].meta = name(oRel.actorId) + ', released ' + when(oRel.ts); }
    if (oRej) { steps[3].state = 'returned'; steps[3].meta = name(oRej.actorId) + ', rejected ' + when(oRej.ts); }
    if (p.status === 'SUBMITTED') { steps[1].state = 'current'; steps[1].meta = 'Waiting for ' + name(p.checkerId); }
    if (p.status === 'CHECKED') { steps[2].state = 'current'; steps[2].meta = 'Waiting for ' + name(p.approverId); }
    if (p.status === 'HELD') { steps[3].state = 'current'; steps[3].meta = 'Waiting for Operational Risk'; }
    if (p.status === 'RELEASED') steps[4] = { label: 'Released', state: 'released', meta: when((oRel || rel || {}).ts || p.releasedAt) };
    if ((p.status === 'RETURNED' || p.status === 'CANCELLED') && ret) {
      var idx = { checker: 1, approver: 2, gate: 2 }[p.returnStage];
      if (idx) {
        steps[idx].state = 'returned';
        steps[idx].meta = name(ret.actorId) + ', ' + (p.returnStage === 'gate' ? 'not allowed to approve, ' : 'returned ') + when(ret.ts);
        for (var k = idx + 1; k < 4; k++) steps[k].state = 'skipped';
      }
    }
    if (p.status === 'RETURNED') steps[4] = { label: 'Back with maker', state: 'now-ret', meta: 'Waiting for ' + name(p.makerId) };
    if (p.status === 'CANCELLED' || p.status === 'REJECTED') steps[4] = { label: 'Stopped', state: 'stopped', meta: 'Cancelled' + (canc ? ' ' + when(canc.ts) : '') };
    return steps;
  }

  var STEP_ICON = { done: 'check', released: 'check', skipped: 'dash', returned: 'undo', 'now-ret': 'undo', stopped: 'x' };
  var STEP_SR = { done: 'Done', released: 'Done', current: 'Current step', upcoming: 'Not started', skipped: 'Skipped', returned: 'Returned', 'now-ret': 'Current step', stopped: 'Stopped' };

  /* The lifecycle drawn as a clearance track: it fills as the payment moves from maker to release. */
  function stepperHtml(steps, p) {
    var done = steps.filter(function (s) { return s.state === 'done' || s.state === 'released'; }).length;
    var state = p.status === 'RELEASED' ? ['is-cleared', 'Released'] : p.status === 'HELD' ? ['is-held', 'Stopped, with Op Risk'] :
      p.status === 'RETURNED' ? ['is-ret', 'Back with the maker'] : (p.status === 'CANCELLED' || p.status === 'REJECTED') ? ['', 'Cancelled'] : ['', 'In progress'];
    return '<div class="track-head" aria-hidden="true"><span>Where it is</span><span class="track-state ' + state[0] + '">' + esc(state[1]) + ' · ' + done + ' of ' + steps.length + '</span></div>' +
      '<ol class="stepper ' + state[0] + '" aria-label="Payment lifecycle">' + steps.map(function (s, i) {
      var icon = STEP_ICON[s.state] ? ico(STEP_ICON[s.state]) : '<span>' + (i + 1) + '</span>';
      var cur = s.state === 'current' || s.state === 'now-ret';
      return '<li class="stp is-' + s.state + '"' + (cur ? ' aria-current="step"' : '') + '><span class="stp-dot">' + icon + '</span>' +
        '<span class="stp-text"><span class="stp-label">' + srOnly(STEP_SR[s.state] + ': ') + esc(s.label) + '</span><span class="stp-meta">' + esc(s.meta || '') + '</span></span></li>';
    }).join('') + '</ol>' + stepNow(steps);
  }
  /* Phones show the track as dots only, plus this one line for where the payment is now. */
  function stepNow(steps) {
    var now = steps.filter(function (s) { return s.state === 'current' || s.state === 'now-ret' || s.state === 'released' || s.state === 'stopped'; })[0];
    if (!now) return '';
    return '<p class="stp-now" aria-hidden="true"><strong>' + esc(now.label) + '</strong> ' + esc(now.meta || '') + '</p>';
  }

  /* Who acts next, as a call to action under the stepper. Empty when it is the current role's turn. */
  function nextBanner(p, role) {
    var w = waitsFor(p);
    if (w) {
      if (w === role) return '';
      var r = roleInfo(w);
      var who = w === 'checker' ? name(p.checkerId) : w === 'approver' ? name(p.approverId) : w === 'maker' ? name(p.makerId) : name(store.roleUserId('oprisk'));
      var text = w === 'maker'
        ? 'Back with the maker (' + who + '). Switch to Maker to fix and resubmit it.'
        : 'Waiting for ' + r.noun + ' (' + who + '). Switch to ' + r.label + ' to continue.';
      return '<div class="next-step">' + ico('clock') + '<p>' + esc(text) + '</p><button type="button" class="btn primary small" data-action="role" data-role="' + w + '">Switch to ' + esc(r.label) + ' ' + U.icon('arrow') + '</button></div>';
    }
    if (p.status === 'RELEASED') {
      var by = p.viaOpRisk && p.opRisk ? 'Operational Risk (' + name(p.opRisk.by) + ')' : name(p.releasedBy);
      var a = p.approval;
      var dwell = !p.viaOpRisk && a && a.decision === 'approve' && a.dwellSec != null ? ' ' + name(p.approverId) + ' spent ' + U.fmtSec(a.dwellSec) + ' on the consequence screen.' : '';
      return '<div class="next-step is-done">' + U.icon('check') + '<p>Released by ' + esc(by) + ' on ' + esc(U.fmtDateTime(p.releasedAt)) + '. ' + b(shortAmt(p.releasedExternal)) + ' left the bank.' + esc(dwell) + '</p></div>';
    }
    if (p.status === 'CANCELLED' || p.status === 'REJECTED') return '<div class="next-step is-off">' + U.icon('dash') + '<p>Cancelled by the maker. Nothing left the bank.</p></div>';
    return '';
  }

  function detailHead(p, m, role, hidden) {
    var ln = loanOf(p.loanId);
    var sub = [ln.name, opShort(p.instr.operation), 'Value date ' + U.fmtDate(p.instr.valueDate)].map(function (x) { return '<span class="nowrap">' + esc(x) + '</span>'; }).join('<span class="sep" aria-hidden="true">·</span>');
    return '<section class="card d-head" aria-label="' + esc(p.id) + '">' +
      '<div class="d-title"><div class="d-title-main"><h2>' + esc(p.id) + ' ' + statusChip(p.status) + '</h2><p class="d-sub">' + sub + '</p></div>' +
      (hidden ? '' : '<button type="button" class="btn ghost small" data-open-payment="' + esc(p.id) + '">' + ico('list') + ' Evidence trail</button>') + '</div>' +
      stepperHtml(lifecycle(p, m), p) + nextBanner(p, role) + '</section>';
  }

  /* Main column cards plus a right rail. Narrow screens stack them with the rail after the first card. */
  /* lead: the banner and alerts that belong above the first card, kept in the main column so the decision panel starts level with them. */
  function grid(lead, first, rail, rest) {
    return '<div class="d-grid" style="--rows:' + (1 + rest.length) + '"><div class="d-lead">' + lead + first + '</div><aside class="d-rail">' + rail + '</aside>' + rest.join('') + '</div>';
  }

  /* ------------------------------------------------------------ role panels (right rail) */

  function noteField(key, id, label, placeholder, rows) {
    var k = key + ':' + id;
    return '<div class="field"><label class="flabel" for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" rows="' + (rows || 3) + '" data-note="' + esc(k) + '" placeholder="' + esc(placeholder) + '">' + esc(noteDrafts[k] || '') + '</textarea></div>';
  }

  /* A message under a field that says what is wrong and how to fix it. Filled in by the action that checks it. */
  function fieldError(id) { return '<p class="ferr" id="' + id + '" role="alert" hidden></p>'; }
  function showError(id, text, focusSel) {
    var e = document.getElementById(id);
    if (e) { e.textContent = text; e.hidden = false; }
    else U.toast(text, 'bad');
    var f = focusSel && document.querySelector(focusSel);
    if (f) { try { f.focus({ preventScroll: false }); } catch (x) { f.focus(); } }
  }
  function failedText(m) {
    var f = checkLines(m).failed;
    return f.length ? 'PCAP checks failed: ' + f.map(function (l) { return l.label + ' (' + l.k + ')'; }).join('. ') + '. Please fix and resubmit.' : '';
  }

  function returnPanel(p, stage, m) {
    var fromChecks = m && m.tier === 3 ? failedText(m) : '';
    var def = fromChecks || (stage === 'approver' ? 'Amounts do not match my source.' : 'Please correct the instruction.');
    var k = p.id + ':return-reason';
    if (noteDrafts[k] == null) noteDrafts[k] = def;
    return '<section class="card action" aria-label="Return to maker"><h3>Return ' + esc(p.id) + ' to the maker</h3>' +
      '<p class="hint">The maker sees your reason and can fix and resubmit the payment.' + (fromChecks ? ' PCAP has filled in what failed. Edit it if you need to.' : '') + '</p>' +
      noteField(p.id, 'return-reason', 'Reason', '') + fieldError('return-err') +
      '<div class="act-buttons"><button type="button" class="btn primary" data-primary data-action="return" data-id="' + p.id + '" data-stage="' + stage + '">Return to maker</button>' +
      '<button type="button" class="btn ghost" data-action="return-cancel">Cancel</button></div></section>';
  }

  function checkerPanel(p, m) {
    if (ui().deskReturn === p.id) return returnPanel(p, 'checker', m);
    var c = checkLines(m);
    if (m.tier === 3) {
      /* The 2020 pattern: the outsourced checker passed on what the consequence card now shows as a hard stop. Returning is the easy path. */
      return '<section class="card action is-t3" aria-label="Your check"><h3>Your check</h3>' +
        '<div class="inline-alert bad">' + U.icon('stop') + '<p><strong>PCAP stopped this payment: ' + c.fail + ' check' + (c.fail === 1 ? '' : 's') + ' failed.</strong> Return it so the maker can fix it. Only send it on if you are sure, and say why.</p></div>' +
        '<div class="act-buttons"><button type="button" class="btn primary" data-primary data-action="return-open" data-id="' + p.id + '">Return to maker</button></div>' +
        '<div class="send-on">' + noteField(p.id, 'checker-note', 'Why send it on? (a note to the approver, needed for a stopped payment)', 'e.g. Principal set to wash. Interest only to lenders.') + fieldError('check-err') +
        '<p class="hint with-icon">' + U.icon('eye') + '<span>The approver sees this note only after typing their own figure. Sending on a stopped payment is counted for the provider as a whole in the monthly review, never by name.</span></p>' +
        '<div class="act-buttons"><button type="button" class="btn danger-outline" data-action="check" data-id="' + p.id + '">Send to approver anyway</button></div></div></section>';
    }
    return '<section class="card action" aria-label="Your check"><h3>Your check</h3>' +
      '<p class="hint">' + (c.fail ? 'PCAP flagged ' + c.fail + ' check' + (c.fail === 1 ? '' : 's') + ' (left). Compare the instruction with its source before you send it on.' : 'PCAP found nothing unusual. Compare the instruction with its source, then send it on.') + '</p>' +
      noteField(p.id, 'checker-note', 'Note to the approver (optional)', 'e.g. Principal set to wash. Interest only to lenders.', 2) +
      '<p class="hint with-icon">' + U.icon('eye') + '<span>The approver sees this note only after typing their own figure, so it cannot sway their check.</span></p>' +
      '<div class="act-buttons"><button type="button" class="btn primary" data-primary data-action="check" data-id="' + p.id + '">Mark checked, send to approver</button>' +
      '<button type="button" class="btn" data-action="return-open" data-id="' + p.id + '">Return to maker</button></div>' + kbdHint('checker') + '</section>';
  }

  function kbdHint(role) {
    var main = role === 'approver' ? '<kbd>Enter</kbd> releases' : role === 'checker' ? '<kbd>Enter</kbd> sends it on' : '<kbd>Ctrl</kbd>+<kbd>Enter</kbd> does the main action';
    return '<p class="kbd-hint">' + main + '. <kbd>J</kbd> and <kbd>K</kbd> move through your queue.</p>';
  }

  /* Authority check, folded into the decision panel (it used to be a full-width row above the card). */
  function gateMini(m) {
    var r05 = m.results['R-05'] || {};
    var cert = /current (\S+) certification/.exec(r05.message || '');
    return '<p class="act-who">' + U.icon('unlock') + '<span><strong>' + U.term('gate', 'You can approve this.') + '</strong> ' + esc(name(m.approverId)) + ': ' + (cert ? 'certified for ' + esc(cert[1]) + ', ' : '') +
      'within your limit, independent of the maker and checker. ' + code('R-05, R-06', 'chk-id') + '</span></p>';
  }

  function approverPanel(p, m) {
    if (ui().deskReturn === p.id) return returnPanel(p, 'approver', m);
    var ret = '<button type="button" class="btn" data-action="return-open" data-id="' + p.id + '">Return to maker</button>';
    var to = shortAmt(m.total) + ' to ' + m.lenders + ' lender' + (m.lenders === 1 ? '' : 's');
    var body;
    if (m.tier === 3) {
      body = '<div class="inline-alert bad">' + U.icon('stop') + '<p><strong>You cannot release this payment.</strong> Send it to Operational Risk with a note, or return it to the maker.</p></div>' +
        noteField(p.id, 'approver-note', 'Note to Operational Risk (optional)', 'e.g. Notice says USD 7.82M interest only. This would send principal out.') +
        '<div class="act-buttons"><button type="button" class="btn danger" data-primary data-action="escalate" data-id="' + p.id + '">Send to Operational Risk</button>' + ret + '</div>';
    } else if (m.tier === 2) {
      body = '<label class="confirm"><input type="checkbox" id="confirm-box"><span><strong>I confirm</strong> what this payment will do. ' + heroSentence(m) + (m.kept > 0 ? ' ' + keptSentence(m) : '') + '</span></label>' + fieldError('confirm-err') +
        '<div class="act-buttons"><button type="button" class="btn primary" data-primary data-action="approve" data-id="' + p.id + '">Release ' + esc(to) + '</button>' + ret + '</div>';
    } else {
      /* Tier 1: routine. One sentence, one button, nothing else asked. The button names what will leave the bank. */
      body = '<p class="act-lead">' + U.icon('check') + '<span><strong>Routine.</strong> PCAP found nothing unusual. Read what it will do, then release it.</span></p>' +
        '<div class="act-buttons"><button type="button" class="btn primary big" data-primary data-action="approve" data-id="' + p.id + '">Release ' + esc(to) + '</button>' + ret + '</div>' +
        '<p class="hint">PCAP checked the amount against the loan schedule, the workaround register and your authority. It does not check the lenders\' account details.</p>' + kbdHint('approver');
    }
    return '<section class="card action" aria-label="Your decision"><h3>Your decision</h3>' + gateMini(m) + body +
      '<p class="dwell">' + ico('clock') + '<span>Time on this screen is recorded for team-level approval habits. It is never a pass mark. ' + code('M4') + '</span></p></section>';
  }

  function opRiskPanel(p, m) {
    var mins = Math.max(0, Math.round((Date.now() - new Date(p.heldAt)) / 60000));
    var failed = checkLines(m).failed;
    var k = p.id + ':opr-reason';
    var min = E.DEFAULT_CONFIG.reasonMinChars;
    var have = (noteDrafts[k] || '').trim().length;
    var openRelease = ui().oprRelease === p.id;
    return '<section class="card action opr" aria-label="Your decision"><h3>Your decision</h3>' +
      '<p class="hint">' + esc(name(p.approverId)) + ' (approver) sent it here ' + (mins < 1 ? 'less than a minute' : mins + ' min') + ' ago. Send it back, or release it with a written ' + U.term('acceptance', 'risk sign-off') + '.</p>' +
      (failed.length ? '<div class="why"><p class="why-title">Why it was held</p><ul>' + failed.map(function (l) {
        return '<li>' + U.icon('x') + '<span>' + esc(l.label) + '</span>' + U.term(l.k, l.k, 'chk-id code-tag') + '</li>';
      }).join('') + '</ul></div>' : '') +
      '<div class="field"><label class="flabel" for="opr-reason">Your reason (needed for either decision)</label><textarea id="opr-reason" rows="3" data-note="' + esc(k) + '" data-min="' + min + '" aria-describedby="opr-count" placeholder="e.g. Principal would leave the bank on an interest-only date. Returned for FRONT and FUND.">' + esc(noteDrafts[k] || '') + '</textarea>' +
      '<p class="fcount' + (have >= min ? ' is-ok' : '') + '" id="opr-count">' + esc(countText(have, min)) + '</p></div>' + fieldError('opr-err') +
      '<div class="act-buttons"><button type="button" class="btn primary" data-primary data-action="opr-reject" data-id="' + p.id + '">Reject and return to maker</button></div>' +
      '<details class="release-path"' + (openRelease ? ' open' : '') + '><summary>Release it instead (needs a written risk sign-off)' + ico('chev', 'fold-chev') + '</summary>' +
      '<fieldset class="release-type"><legend>Why release it?</legend>' +
      '<p class="hint">Releasing it means the bank accepts the risk PCAP found above. Say why, and name the manager who owns that risk. Internal Audit reviews every sign-off. ' + code('L5 risk acceptance') + '</p>' +
      '<label class="radio"><input type="radio" name="opr-category" value="' + esc(E.ACCEPT_CATEGORIES[0]) + '"><span>False alarm: the payment is correct and the loan schedule is out of date</span></label>' +
      '<label class="radio"><input type="radio" name="opr-category" value="' + esc(E.ACCEPT_CATEGORIES[1]) + '"><span>Approved business exception</span></label>' +
      '<div class="field"><label class="flabel" for="opr-owner">Manager who owns the risk</label><select id="opr-owner">' +
      st().ctx.users.filter(function (u) { return u.inHouse && (u.roles || []).indexOf('owner') >= 0; }).map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name + ' (' + u.title.split(',')[0] + ')') + '</option>'; }).join('') + '</select></div>' +
      '<p class="hint">Scope: this payment only. Expires at the end of today, ' + esc(U.fmtDate(store.today())) + ', so it cannot be reused for another payment.</p></fieldset>' +
      '<div class="act-buttons"><button type="button" class="btn danger-outline" data-action="opr-release" data-id="' + p.id + '">Sign off and release</button></div></details>' +
      '<p class="hint">Every decision is recorded with your reason and the time. Releases also go to the Board.</p></section>';
  }
  function countText(have, min) { return have >= min ? have + ' characters. Enough to record.' : have + ' of at least ' + min + ' characters.'; }

  function makerReturnedPanel(p) {
    var stage = { checker: 'the checker', approver: 'the approver', gate: 'the approver, who is not allowed to approve it', oprisk: 'Operational Risk' }[p.returnStage] || 'a reviewer';
    return '<section class="card action" aria-label="Returned to you"><h3>Returned to you</h3>' +
      '<p class="hint">' + esc(name(p.returnedBy)) + ' (' + esc(stage) + ') returned it on ' + esc(U.fmtDateTime(p.returnedAt)) + '.</p>' +
      (p.returnReason ? '<blockquote class="reason">' + U.say(p.returnReason) + '</blockquote>' : '') +
      '<div class="act-buttons"><button type="button" class="btn primary" data-primary data-action="edit" data-id="' + p.id + '">Edit and resubmit</button>' +
      '<button type="button" class="btn ghost" data-action="cancel" data-id="' + p.id + '">Cancel payment</button></div></section>';
  }

  /* On narrow screens the decision panel sits below the consequence card, so its main button is mirrored in a bar that stays at
     the bottom of the screen. A button that needs inputs from the panel (a confirmation, a reason) only scrolls you to them. */
  function actBar(p, m, role) {
    var t = tierName(m.tier, true) + ', ' + shortAmt(m.total);
    function bar(text, btn) { return '<div class="act-bar t' + m.tier + '" role="region" aria-label="Main action"><span class="ab-text">' + esc(text) + '</span>' + btn + '</div>'; }
    function go(label, cls) { return '<button type="button" class="btn ' + (cls || 'primary') + '" data-action="to-panel">' + esc(label) + ' ' + U.icon('arrow') + '</button>'; }
    var back = '<button type="button" class="btn ghost" data-action="return-open" data-id="' + p.id + '">Return</button>';
    if (ui().deskReturn === p.id) return bar('Returning ' + p.id + ' to the maker', go('Write the reason'));
    if (role === 'approver' && p.status === 'CHECKED') {
      if (m.tier === 1) return bar(t + ' to ' + m.lenders + ' lenders', back + '<button type="button" class="btn primary" data-action="approve" data-id="' + p.id + '">Release</button>');
      if (m.tier === 2) return bar(t + '. Tick the confirmation first', go('Confirm and release'));
      return bar(t + '. You cannot release it', go('Send to Op Risk', 'danger'));
    }
    if (role === 'checker' && p.status === 'SUBMITTED') {
      if (m.tier === 3) return bar(t + ' by PCAP', go('Return or send on'));
      return bar(t + (checkLines(m).fail ? '. Flagged' : '. Nothing unusual'), back + '<button type="button" class="btn primary" data-action="check" data-id="' + p.id + '">Mark checked</button>');
    }
    if (role === 'oprisk' && p.status === 'HELD') return bar(t + '. Waiting for your decision', go('Decide', 'danger'));
    if (role === 'maker' && p.status === 'RETURNED') return bar('Returned to you', '<button type="button" class="btn primary" data-action="edit" data-id="' + p.id + '">Edit and resubmit</button>');
    return '';
  }

  /* ------------------------------------------------------------ approver: gate, blind re-key, reveal */

  function noticeText(ev) {
    var x = ev.expected;
    if (!x.scheduled) return 'No agent notice found for ' + U.fmtDate(x.date) + '. Nothing is due on that date.';
    if (x.alreadyPaid) return 'The notice for ' + U.fmtDate(x.date) + ' has already been paid in full.';
    var parts = [];
    if (x.remainingInterest > 0) parts.push(fullAmt(x.remainingInterest) + ' of interest');
    if (x.remainingPrincipal > 0) parts.push(fullAmt(x.remainingPrincipal) + ' of principal');
    return 'Notice sent to lenders: ' + parts.join(' and ') + ' due on ' + U.fmtDate(x.date) + '.' + (x.note ? ' ' + x.note : '');
  }

  function gateLine(m) {
    var r05 = m.results['R-05'] || {};
    var cert = /current (\S+) certification/.exec(r05.message || '');
    var text = 'You (' + name(m.approverId) + ') are ' + (cert ? 'certified for ' + cert[1] + ', ' : '') + 'within your approval limit and independent of the maker and checker.';
    return '<div class="gate-line">' + U.icon('unlock') + '<p><strong>' + U.term('gate', 'You can approve this payment.') + '</strong> ' + esc(text) + '</p>' + code('R-05, R-06', 'chk-id') + '</div>';
  }

  function gateClosedCard(p, ev) {
    var fails = ['R-05', 'R-06'].filter(function (k) { return ev.results[k].status === 'fire'; });
    return '<section class="card gate-closed" aria-label="Not allowed to approve"><div class="gc-head">' + U.icon('lock') + '<h3>' + esc(name(p.approverId)) + ' is not allowed to approve this payment. ' + code('M3') + '</h3></div>' +
      '<ul class="gc-list">' + fails.map(function (k) { return '<li><span>' + U.say(ev.results[k].message) + '</span><span class="chk-id code-tag">' + k + '</span></li>'; }).join('') + '</ul>' +
      '<p class="hint">This attempt is recorded. Return it so the maker can pick an approver who is certified, independent and works for the bank. ' + code('O1, O3, O5') + '</p>' +
      '<div class="act-buttons row"><button type="button" class="btn primary" data-primary data-action="return-gate" data-id="' + p.id + '">Return to maker for reassignment</button></div></section>';
  }

  function rekeyCard(p, ev) {
    var a = p.approval || { attempts: [] };
    var retry = a.rekey === 'retry';
    var used = a.attempts.length;
    var dots = [0, 1].map(function (i) { return '<span class="rk-dot' + (i < used ? ' is-miss' : '') + '"></span>'; }).join('');
    /* Your own earlier answer for the payment type is kept for the second try. Nothing from the maker or checker is ever filled in. */
    var lastNature = retry && a.natures ? a.natures[a.natures.length - 1] : null;
    return '<section class="card rekey" aria-labelledby="rk-title">' +
      '<p class="eyebrow">Step 1 of 2: ' + U.term('rekey', 'your own figure') + ' ' + code('R-07', 'chk-id') + '</p>' +
      '<h3 class="rk-title" id="rk-title">Type the total amount this payment will send</h3>' +
      '<p class="rk-why">' + U.icon('warn') + '<span>PCAP wants a closer look at this one because ' + esc(closerReason(ev)) + '.</span></p>' +
      '<p class="rk-help">Use your own source (below), not the instruction, and say what kind of payment it is. The maker\'s numbers and the checker\'s note stay hidden until you are done, so you check rather than copy.</p>' +
      (retry ? '<div class="inline-alert warn" role="alert">' + U.icon('warn') + '<p><strong>That does not match what this instruction will send.</strong> Check your source and try once more. A second mismatch sends the payment to Operational Risk.</p></div>' : '') +
      '<div class="rk-form"><label class="flabel" for="rekey-input">Total leaving the bank</label>' +
      '<div class="money big"><span class="money-cur" aria-hidden="true">USD</span><input id="rekey-input" inputmode="decimal" autocomplete="off" placeholder="e.g. 7,820,000 or 7.82m" aria-describedby="rk-attempts rk-amt-err"></div>' + fieldError('rk-amt-err') +
      '<fieldset class="release-type rk-nature"><legend>What does your source say this payment is?</legend><div class="rk-natures">' +
      Object.keys(E.NATURES).map(function (k) { return '<label class="radio"><input type="radio" name="rk-nature" value="' + k + '"' + (k === lastNature ? ' checked' : '') + '><span>' + esc(E.NATURES[k].label) + '</span></label>'; }).join('') +
      '</div></fieldset>' + fieldError('rk-type-err') +
      '<div class="rk-row"><button type="button" class="btn primary" data-primary data-action="rekey" data-id="' + p.id + '">Check amount</button>' +
      '<p class="rk-attempts" id="rk-attempts"><span class="rk-dots" aria-hidden="true">' + dots + '</span>Attempt ' + (used + 1) + ' of 2. <kbd>Enter</kbd> checks.</p></div></div>' +
      '<details class="source"' + (retry ? ' open' : '') + '><summary>' + ico('doc') + ' Your source: agent notice to lenders (synthetic)</summary><p>' + esc(noticeText(ev)) + '</p></details>' +
      '</section>';
  }

  /* Why the approver is asked for their own figure, without giving away any number. */
  function closerReason(ev) {
    if (ev.tier === 3) return 'something about it is badly off';
    var r = ev.results || {};
    if (r['R-01'] && r['R-01'].status === 'fire') return 'the amount is not what the loan schedule expects';
    if (ev.override && ev.override.used) return 'it uses a workaround';
    return 'something about it is unusual';
  }

  function rekeyResultLine(p) {
    var a = p.approval || { attempts: [] };
    if (a.rekey === 'pass') {
      return '<div class="inline-alert ok">' + U.icon('check') + '<p><strong>Step 1 done.</strong> Your figure, ' + esc(rekeyLabels(a, true).pop()) + ', matches what PCAP worked out' + (a.rekeyKind === 'slip' ? ' on the second try. Your first figure is recorded as a slip.' : '.') + '</p></div>';
    }
    return '<div class="inline-alert bad">' + U.icon('stop') + '<p><strong>Your figure, ' + esc(rekeyLabels(a, true).pop()) + ', did not match, twice.</strong> So PCAP has stopped this payment. ' + code('R-07') + '</p></div>';
  }

  /* ------------------------------------------------------------ the detail for one payment */

  function detailHtml(p, role) {
    var m, hidden = false, body;
    if (role === 'approver' && p.status === 'CHECKED') {
      /* Opening the payment runs the M3 gate for the assigned approver (logged once per version). */
      var ev0 = store.approverOpen(p.id);
      m = liveModel(ev0, p.instr);
      if (!ev0.gate.open) {
        hidden = ev0.tier >= 2;
        body = '<div class="d-focus">' + gateClosedCard(p, ev0) + instructionCard(p.instr, { hideAmounts: hidden }) + '</div>';
      } else if (ev0.tier >= 2 && !rekeyDone(p)) {
        hidden = true;
        body = '<div class="d-focus">' + gateLine(m) + rekeyCard(p, ev0) + instructionCard(p.instr, { hideAmounts: true }) + '</div>';
      } else {
        /* Statement revealed: Tier 1 straight away, Tier 2 and 3 after the blind re-key. */
        store.approverReveal(p.id);
        m = liveModel(store.currentEval(p), p.instr);
        var a = p.approval || { attempts: [] };
        var hasNotes = !!(p.checkerNote || p.instr.makerNote);
        body = grid((ev0.tier >= 2 || a.attempts.length ? rekeyResultLine(p) : '') + decisionBanner(m),
          consequenceCard(m, { rekey: rekeyAmounts(a), rekeyTypes: rekeyTypes(a), eyebrow: ev0.tier >= 2 || a.attempts.length ? 'Step 2 of 2: what this payment will do' : null }), approverPanel(p, m),
            [checksCard(m), peopleCard(p, { hideRekeys: true, fold: true, open: ev0.tier >= 2 && hasNotes }), instructionCard(p.instr, { fold: true })]) + actBar(p, m, role);
      }
    } else {
      m = modelFor(p);
      hidden = amountsHidden(p, role, m.tier);
      var a2 = p.approval && p.approval.version === p.version ? p.approval : null;
      var rekeyFigs = { rekey: rekeyAmounts(a2), rekeyTypes: rekeyTypes(a2), rekeyLabel: 'Approver\'s typed figure' };
      if (hidden) {
        body = '<div class="d-focus"><div class="inline-alert info">' + U.icon('eye') + '<p><strong>Amounts hidden.</strong> As the approver you type your own figure first, so the payment\'s numbers stay hidden until then.</p></div>' + instructionCard(p.instr, { hideAmounts: true }) + '</div>';
      } else if (role === 'checker' && p.status === 'SUBMITTED') {
        /* The checker compares the instruction with its source, so the instruction stays open for them. */
        body = grid(decisionBanner(m), consequenceCard(m), checkerPanel(p, m), [checksCard(m), instructionCard(p.instr, { fold: true, open: true }), peopleCard(p, { fold: true })]) + actBar(p, m, role);
      } else if (role === 'oprisk' && p.status === 'HELD') {
        if (!oprPerf[p.id]) oprPerf[p.id] = performance.now();
        body = grid(decisionBanner(m), consequenceCard(m, rekeyFigs), opRiskPanel(p, m), [peopleCard(p, { title: 'Who saw it', fold: true, open: true }), checksCard(m), instructionCard(p.instr, { fold: true })]) + actBar(p, m, role);
      } else if (role === 'maker' && p.status === 'RETURNED') {
        body = grid(decisionBanner(m), consequenceCard(m, rekeyFigs), makerReturnedPanel(p), [checksCard(m), instructionCard(p.instr, { fold: true }), peopleCard(p, { fold: true })]) + actBar(p, m, role);
      } else {
        body = grid(decisionBanner(m, p), consequenceCard(m, rekeyFigs), peopleCard(p), [checksCard(m), instructionCard(p.instr, { fold: true })]);
      }
    }
    return detailHead(p, m, role, hidden) + body;
  }

  function emptyDetail(role) {
    if (role === 'maker') {
      return '<section class="card empty-state">' + ico('inbox', 'es-icon') + '<h2>Start a new payment</h2>' +
        '<p>Key an instruction, check what PCAP says it will really do, then send it to the checker.</p>' +
        '<div class="es-actions"><button type="button" class="btn primary" data-action="new">' + ico('plus') + ' New payment</button>' + demoMenu('left') + '</div></section>';
    }
    var hint = {
      checker: 'You are all caught up. Payments appear here when the maker submits them.',
      approver: 'You are all caught up. Payments appear here after the checker sends them on.',
      oprisk: 'No stopped payments are waiting. They appear here when an approver sends one.',
      owner: 'As Head of Loan Ops you own the workarounds and the risk when a stopped payment is released. Payments are read-only here.',
      audit: 'As Internal Audit (third line) you review payments and evidence but never act on them.',
      board: 'The Board reads results only. Payments are read-only here.',
      vendor: 'As Wipro\'s service manager you see your team\'s results at provider level. Payments are read-only here.'
    }[role] || '';
    var links = {
      owner: '<a class="btn primary" href="#/register">Open the workarounds</a>',
      audit: '<a class="btn primary" href="#/oversight">Review sign-offs and download evidence</a>',
      board: '<a class="btn primary" href="#/oversight">Open the Board view</a>',
      vendor: '<a class="btn primary" href="#/analytics">Open the provider view</a>',
      oprisk: '<a class="btn" href="#/monitor">Open the daily checks</a>'
    }[role] || '';
    /* Nothing to do here? Offer practice work, so trying a role never ends on an empty screen. */
    if (role === 'checker' || role === 'approver' || role === 'oprisk') links = '<button type="button" class="btn primary" data-action="practice">Give me practice payments</button>' + links;
    return '<section class="card empty-state">' + ico('inbox', 'es-icon') + '<h2>' + (readOnlyRole(role) ? 'Payments are read-only for you' : 'Nothing is waiting for you') + '</h2><p>' + esc(hint) + ' Select any payment in the queue to see it.</p>' +
      (links ? '<div class="es-actions">' + links + '</div>' : '') + '</section>';
  }

  /* ------------------------------------------------------------ new payment flow */

  function demoMenu(align) {
    return '<details class="menu' + (align === 'left' ? ' menu-left' : '') + '"><summary class="btn ghost small">' + ico('flask') + ' Load demo scenario ' + ico('chev') + '</summary>' +
      '<div class="menu-pop"><p class="menu-note">Demo data only. It replaces what is in the form.</p>' +
      SCENARIOS.map(function (s) {
        return '<button type="button" class="menu-item" data-action="preset" data-preset="' + s.id + '"><strong>' + esc(s.title) + '</strong><span>' + esc(s.text) + '</span></button>';
      }).join('') + '</div></details>';
  }

  function options(list, current) {
    return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === current ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function usersWith(role) { return st().ctx.users.filter(function (u) { return (u.roles || []).indexOf(role) >= 0; }); }

  function overrideOptions(op, current) {
    var list = [['', 'None']];
    st().ctx.register.filter(function (r) { return (r.appliesTo || []).indexOf(op) >= 0; }).forEach(function (r) {
      list.push([r.id, r.id + ' ' + r.title + ' (' + r.status + ')']);
    });
    list.push(['__other', 'Other code (not on the workaround list)']);
    return options(list, current);
  }

  function moneyHint(raw) {
    if (String(raw || '').trim() === '') return { text: 'Empty counts as zero.', bad: false };
    var v = U.parseAmount(raw);
    if (isNaN(v) || v < 0) return { text: 'Type a number, for example 7,820,000 or 7.82m.', bad: true };
    return { text: 'Reads as ' + shortAmt(v) + '.', bad: false };
  }
  function dateHint(d) {
    if (d.valueDateBad) return { text: 'Type a date like 11 Aug 2020.', bad: true };
    if (!d.valueDate) return { text: '', bad: false };
    return { text: weekday(d.valueDate) + (d.valueDate === store.today() ? ', today' : '') + '.', bad: false };
  }
  function hintP(id, h) { return '<p class="fhint' + (h.bad ? ' is-bad' : '') + '" id="' + id + '">' + esc(h.text) + '</p>'; }

  function liveHint(d) {
    var instr = draftToInstr(d);
    if (d.valueDateBad || !instr.valueDate || isNaN(instr.interest) || isNaN(instr.principal)) return '<span class="muted">Fix the highlighted fields to see the PCAP check.</span>';
    var ev = store.evaluateInstr(instr);
    var n = ev.hits.length;
    return tierText(ev.tier, true) + '<span>PCAP check so far: ' + (n ? n + ' check' + (n === 1 ? '' : 's') + ' failed' : 'nothing failed') + '. Review it next.</span>';
  }

  function scheduleHelper(d) {
    var ln = store.loan(d.loanId);
    if (!ln) return '';
    var lines = ln.schedule.slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; });
    return '<div class="sched"><p class="sched-title"><span>Loan schedule, what PCAP compares against</span><span class="muted">' + ln.lenders + ' lenders</span></p>' +
      '<table class="sched-table"><thead><tr><th scope="col">Date</th><th scope="col" class="num">Interest due</th><th scope="col" class="num">Principal due</th><th scope="col"><span class="sr-only">Use</span></th></tr></thead><tbody>' +
      lines.map(function (l) {
        var paid = (l.paidInterest || 0) + (l.paidPrincipal || 0) > 0 && (l.paidInterest || 0) >= (l.interest || 0) && (l.paidPrincipal || 0) >= (l.principal || 0);
        return '<tr' + (l.date === d.valueDate ? ' class="is-match"' : '') + '><td>' + esc(U.fmtDate(l.date)) + (l.note ? '<span class="sched-note">' + esc(l.note) + '</span>' : '') + '</td>' +
          '<td class="num">' + esc(shortAmt(l.interest)) + '</td><td class="num">' + esc(shortAmt(l.principal)) + '</td>' +
          '<td class="num">' + (paid ? '<span class="muted small">Paid</span>' : '<button type="button" class="btn link small" data-action="use-line" data-date="' + l.date + '">Use this line</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* Legs a registered workaround needs on the wash account that are not set yet (what R-04 will fail on). */
  function missingLegs(d) {
    var reg = d.overrideCode && d.overrideCode !== '__other' ? E.byId(st().ctx.register, d.overrideCode) : null;
    if (!reg || reg.requiredValue !== 'WASH') return [];
    return (reg.requiredFields || []).filter(function (f) { return E.OVERRIDE_FIELDS.indexOf(f) >= 0 && d.fields[f] !== E.WASH; });
  }

  function routeControl(f, value, missing) {
    var id = 'leg-' + f;
    return '<div class="route-row' + (missing ? ' is-missing' : '') + '"><span class="route-leg" id="' + id + '">' + f + (missing ? '<span class="route-need">must stay in the bank</span>' : '') + '</span><div class="seg opts" role="radiogroup" aria-labelledby="' + id + '">' +
      ['LENDERS', 'WASH'].map(function (v) {
        return '<label class="seg-opt' + (v === 'WASH' ? ' is-wash' : '') + '"><input type="radio" name="field-' + f + '" value="' + v + '"' + (value === v ? ' checked' : '') + '><span>' + esc(ROUTE_LABEL[v]) + '</span></label>';
      }).join('') + '</div></div>';
  }

  function flowStep1(d, editing) {
    var loans = st().ctx.loans;
    var notes = '';
    if (editing && editing.returnReason) notes += '<div class="inline-alert warn">' + ico('undo') + '<p><strong>Returned by ' + esc(name(editing.returnedBy)) + '.</strong> ' + esc(editing.returnReason) + '</p></div>';
    if (d.preset === 'revlon' && d.loanId === E.REPLAY.loan.id) notes += '<div class="inline-alert info">' + ico('flask') + '<p><strong>Demo scenario.</strong> A made-up replay of 11 Aug 2020. About USD 7.8M of interest was meant to go out, but only PRINCIPAL is set to stay in the bank.</p></div>';
    var dh = dateHint(d), ih = moneyHint(d.interest), ph = moneyHint(d.principal);
    var miss = missingLegs(d);
    var dateVal = d.valueDateBad && d.valueDateText != null ? d.valueDateText : (d.valueDate ? U.fmtDate(d.valueDate) : '');
    return '<form class="card wiz-form" id="maker-form" autocomplete="off" novalidate>' +
      (notes ? '<div class="wiz-notes">' + notes + '</div>' : '') +
      '<fieldset class="fgroup"><legend class="fgroup-title">Payment</legend><div class="fgrid">' +
      '<div class="field span2"><label class="flabel" for="f-loan">Loan</label><select id="f-loan" name="loanId" data-rerender="1">' + options(loans.map(function (l) { return [l.id, l.id + '  ' + l.name]; }), d.loanId) + '</select></div>' +
      '<div class="field span2"><label class="flabel" for="f-op">Operation</label><select id="f-op" name="operation" data-rerender="1">' + options(Object.keys(E.OPERATIONS).map(function (k) { return [k, E.OPERATIONS[k].label]; }), d.operation) + '</select></div>' +
      '</div></fieldset>' +
      '<fieldset class="fgroup"><legend class="fgroup-title">Value date and amounts</legend><div class="fgrid three">' +
      '<div class="field"><label class="flabel" for="f-date">Value date</label><input id="f-date" name="valueDateText" value="' + esc(dateVal) + '" placeholder="e.g. 24 Oct 2026" aria-describedby="hint-date"' + (dh.bad ? ' aria-invalid="true"' : '') + '>' + hintP('hint-date', dh) + '</div>' +
      '<div class="field"><label class="flabel" for="f-interest">Interest</label><div class="money"><span class="money-cur" aria-hidden="true">USD</span><input id="f-interest" name="interest" inputmode="decimal" value="' + esc(d.interest) + '" placeholder="0" aria-describedby="hint-interest"></div>' + hintP('hint-interest', ih) + '</div>' +
      '<div class="field"><label class="flabel" for="f-principal">Principal</label><div class="money"><span class="money-cur" aria-hidden="true">USD</span><input id="f-principal" name="principal" inputmode="decimal" value="' + esc(d.principal) + '" placeholder="0" aria-describedby="hint-principal"></div>' + hintP('hint-principal', ph) + '</div>' +
      '</div>' + scheduleHelper(d) + '</fieldset>' +
      '<fieldset class="fgroup" id="routing-group"><legend class="fgroup-title">Where each part goes</legend><p class="fgroup-note">For an interest-only payment, all three ' + U.term('legs', 'parts') + ' must stay in the bank (in the ' + U.term('wash', 'wash account') + '). Then only the interest goes to the lenders.</p>' +
      (miss.length ? '<div class="inline-alert warn route-fix">' + U.icon('warn') + '<p><strong>' + esc(d.overrideCode) + ' needs ' + esc(listAnd(miss)) + ' set to Stays in the bank.</strong> Set ' + (miss.length === 1 ? 'it' : 'them') + ' below, or PCAP will stop the payment. ' + code('R-04') + '</p></div>' : '') +
      '<div class="routing">' + E.OVERRIDE_FIELDS.map(function (f) { return routeControl(f, d.fields[f], miss.indexOf(f) >= 0); }).join('') + '</div>' +
      '<div class="fgrid"><div class="field span2"><label class="flabel" for="f-override">Workaround code</label><select id="f-override" name="overrideCode" data-rerender="1">' + overrideOptions(d.operation, d.overrideCode) + '</select></div>' +
      (d.overrideCode === '__other' ? '<div class="field"><label class="flabel" for="f-other">Other override code</label><input id="f-other" name="overrideOther" value="' + esc(d.overrideOther) + '" placeholder="e.g. OVR-PRIN-HOLD"></div>' : '') +
      '</div></fieldset>' +
      '<fieldset class="fgroup"><legend class="fgroup-title">Approval chain</legend><div class="fgrid">' +
      '<div class="field"><label class="flabel" for="f-checker">Checker</label><select id="f-checker" name="checkerId">' + options(usersWith('checker').map(function (u) { return [u.id, u.name + ' (' + u.employer + ', ' + u.team + ')']; }), d.checkerId) + '</select></div>' +
      '<div class="field"><label class="flabel" for="f-approver">Approver</label><select id="f-approver" name="approverId">' + options(usersWith('approver').map(function (u) { return [u.id, u.name + ' (' + u.employer + ', ' + u.team + ')']; }), d.approverId) + '</select></div>' +
      '<div class="field span2"><label class="flabel" for="f-note">Note to the checker</label><textarea id="f-note" name="makerNote" rows="2" placeholder="e.g. Interest only. Principal to wash.">' + esc(d.makerNote) + '</textarea></div>' +
      '</div></fieldset>' +
      '<div class="wiz-foot"><button type="button" class="btn ghost" data-action="flow-close">Cancel</button>' +
      '<p class="wiz-live" id="wiz-live" aria-live="polite">' + liveHint(d) + '</p>' +
      '<button type="submit" class="btn primary">Review payment ' + U.icon('arrow') + '</button></div>' +
      '</form>';
  }

  function flowStep2(d, editing) {
    var instr = draftToInstr(d);
    var ev = store.evaluateInstr(instr);
    var m = liveModel(ev, instr);
    var c = checkLines(m);
    var rail = '<section class="card action submit-card" aria-label="Submit"><h3>Ready to submit?</h3>' +
      '<dl class="sum">' +
      '<div><dt>Sends</dt><dd>' + b(shortAmt(m.total)) + ' to ' + m.lenders + ' lenders</dd></div>' +
      '<div><dt>PCAP check</dt><dd>' + tierText(m.tier, true) + '</dd></div>' +
      '<div><dt>Checks</dt><dd>' + (c.fail ? '<span class="bad-text"><b>' + c.fail + '</b> failed</span>' : 'None failed') + '</dd></div>' +
      '<div><dt>Next</dt><dd>' + esc(name(instr.checkerId)) + ' checks it</dd></div></dl>' +
      '<div class="act-buttons"><button type="button" class="btn primary" data-action="submit">' + (editing ? 'Resubmit to checker' : 'Submit to checker') + '</button>' +
      '<button type="button" class="btn ghost" data-action="flow-step" data-step="1">' + ico('back') + ' Back to instruction</button></div>' +
      '<p class="hint">PCAP does not stop you submitting. It holds the payment before it can leave the bank' + (m.tier === 3 ? ', and only Operational Risk can release a stopped payment.' : '.') + '</p></section>';
    return grid(decisionBanner(m), consequenceCard(m), rail, [checksCard(m), instructionCard(instr, { edit: true })]);
  }

  function flowHtml() {
    var d = draft();
    var step = (ui().deskFlow || {}).step === 2 ? 2 : 1;
    var editing = d.editingId ? store.payment(d.editingId) : null;
    var steps = [['Instruction', 1], ['Review', 2]].map(function (s) {
      var on = s[1] === step;
      return '<li><button type="button" class="wiz-step' + (on ? ' is-on' : s[1] < step ? ' is-done' : '') + '" data-action="flow-step" data-step="' + s[1] + '"' + (on ? ' aria-current="step"' : '') + '>' +
        '<span class="wiz-num">' + (s[1] < step ? ico('check') : s[1]) + '</span>' + esc(s[0]) + '</button></li>';
    }).join('');
    return '<section class="card wiz-head" aria-label="New payment"><div class="wiz-top"><div><h2>' + esc(editing ? 'Fix ' + editing.id + ' and resubmit' : 'New payment') + '</h2>' +
      '<p class="d-sub">Keyed as in the core loan system (simulated). PCAP checks it before you submit.</p></div>' +
      '<div class="wiz-tools">' + (editing ? '' : demoMenu()) + '<button type="button" class="btn ghost small" data-action="flow-close">' + U.icon('x') + ' Close</button></div></div>' +
      '<ol class="wiz-steps">' + steps + '</ol></section>' +
      (step === 1 ? flowStep1(d, editing) : flowStep2(d, editing));
  }

  /* ------------------------------------------------------------ queue */

  function queueGroups(role) {
    var g = { waiting: [], progress: [], done: [] };
    st().payments.forEach(function (p) {
      if (waitsFor(p) === role) g.waiting.push(p);
      else if (isFinal(p)) g.done.push(p);
      else g.progress.push(p);
    });
    return g;
  }

  /* Queue search and tier filter. Matching is in place, so typing never re-draws the screen. */
  function qFilter() { var u = ui(); u.deskQ = u.deskQ || { text: '', tier: '' }; return u.deskQ; }
  function searchText(p, f, hidden) {
    var ln = loanOf(p.loanId);
    return [p.id, p.loanId, ln.name, hidden ? '' : shortAmt(f.total), hidden ? '' : String(Math.round(f.total)), 'tier ' + f.tier, (STATUS[p.status] || {}).label || ''].join(' ').toLowerCase();
  }
  function qMatch(q, tier, text) {
    if (q.tier && String(tier) !== q.tier) return false;
    var words = String(q.text || '').toLowerCase().replace(/,/g, '').split(/\s+/).filter(Boolean);
    return words.every(function (w) { return text.replace(/,/g, '').indexOf(w) >= 0; });
  }

  function queueRow(p, role, selId) {
    var f = facts(p);
    var hidden = amountsHidden(p, role, f.tier);
    var on = p.id === selId;
    var txt = searchText(p, f, hidden);
    var show = qMatch(qFilter(), f.tier, txt);
    return '<li' + (show ? '' : ' hidden') + ' data-q="' + esc(txt) + '" data-tier="' + f.tier + '"><button type="button" class="q-row' + (on ? ' is-active' : '') + '" data-action="select" data-id="' + p.id + '" data-tier="' + f.tier + '"' + (on ? ' aria-current="true"' : '') + '>' +
      '<span class="q-line"><span class="q-id">' + esc(p.id) + '</span>' + (hidden ? '<span class="q-amt is-hidden">Amount hidden</span>' : '<span class="q-amt">' + esc(shortAmt(f.total)) + '</span>') + '</span>' +
      '<span class="q-line"><span class="q-sub">' + tierText(f.tier) + '<span class="q-loan">' + esc(loanOf(p.loanId).name) + '</span></span>' + statusChip(p.status, true) + '</span>' +
      '</button></li>';
  }

  function queueGroup(title, list, role, selId, empty, limit) {
    var items = limit ? list.slice(0, limit) : list;
    return '<section class="q-group"><h3 class="q-title"><span>' + esc(title) + '</span><span class="q-count">' + list.length + '</span></h3>' +
      (items.length ? '<ul class="q-list">' + items.map(function (p) { return queueRow(p, role, selId); }).join('') + '</ul><p class="q-empty q-nomatch" hidden>No match. Clear the search to see all.</p>' : '<p class="q-empty">' + esc(empty) + '</p>') +
      (limit && list.length > limit ? '<button type="button" class="btn link small q-more" data-action="view" data-view="history">See all ' + list.length + ' in History</button>' : '') + '</section>';
  }

  function queueOpenNow(hasDetail) {
    var u = ui();
    return u.deskQueueOpen != null ? !!u.deskQueueOpen : !hasDetail;
  }

  function queueTools(g) {
    var q = qFilter();
    var waitTiers = { 1: 0, 2: 0, 3: 0 };
    g.waiting.forEach(function (p) { waitTiers[facts(p).tier] += 1; });
    var chips = [['', 'All'], ['1', tierName(1, true)], ['2', tierName(2, true)], ['3', tierName(3, true)]].map(function (t) {
      var on = q.tier === t[0];
      var n = t[0] ? waitTiers[t[0]] : 0;
      return '<button type="button" class="q-chip' + (on ? ' is-on' : '') + '" data-action="q-tier" data-tier="' + t[0] + '" aria-pressed="' + on + '">' + esc(t[1]) + (n ? ' <span class="q-chip-n">' + n + '</span>' : '') + '</button>';
    }).join('');
    return '<div class="q-tools"><label class="sr-only" for="q-search">Search the queue</label>' +
      '<input type="search" id="q-search" class="q-search" value="' + esc(q.text) + '" placeholder="Search ID, loan or amount" autocomplete="off">' +
      '<div class="q-chips" role="group" aria-label="Filter by what PCAP found">' + chips + '</div></div>';
  }

  function queueHtml(role, g, selId, hasDetail) {
    var open = queueOpenNow(hasDetail);
    var waitEmpty = { maker: 'Nothing returned to you.', checker: 'Nothing to check. You are all caught up.', approver: 'Nothing to approve. You are all caught up.', oprisk: 'No stopped payments waiting.' }[role] || '';
    return '<aside class="card queue' + (open ? '' : ' is-collapsed') + '" aria-label="Work queue">' +
      '<div class="q-head">' + (role === 'maker' ? '<button type="button" class="btn primary block" data-action="new">' + ico('plus') + ' New payment</button>' : '') +
      '<button type="button" class="q-toggle" data-action="toggle-queue" aria-expanded="' + open + '" aria-controls="q-body"><span class="q-toggle-title">Work queue</span>' +
      '<span class="q-toggle-meta">' + (readOnlyRole(role) ? g.progress.length + ' in progress' : g.waiting.length + ' waiting for you') + '</span>' + ico('chev', 'q-chev') + '</button></div>' +
      '<div class="q-body" id="q-body">' + queueTools(g) +
      (!readOnlyRole(role) ? queueGroup('Waiting for you', g.waiting, role, selId, waitEmpty) : '') +
      queueGroup('In progress', g.progress, role, selId, 'Nothing in progress.') +
      queueGroup('Done', g.done, role, selId, 'Nothing released yet.', 5) +
      '<p class="kbd-hint q-keys"><kbd>/</kbd> search. <kbd>J</kbd> and <kbd>K</kbd> next and previous.</p>' +
      '</div></aside>';
  }

  /* Apply the queue filter to the rows already on screen. */
  function applyQueueFilter() {
    var q = qFilter();
    Array.prototype.forEach.call(document.querySelectorAll('.queue .q-group'), function (grp) {
      var rows = grp.querySelectorAll('li[data-q]');
      var shown = 0;
      Array.prototype.forEach.call(rows, function (li) {
        var ok = qMatch(q, li.getAttribute('data-tier'), li.getAttribute('data-q'));
        li.hidden = !ok;
        if (ok) shown += 1;
      });
      var nm = grp.querySelector('.q-nomatch');
      if (nm) nm.hidden = !(rows.length && !shown);
    });
  }

  /* ------------------------------------------------------------ history */

  var HIST_STATUS = [['', 'All statuses'], ['wait', 'Waiting for checker or approver'], ['HELD', 'Held for Op Risk'], ['RETURNED', 'Returned to maker'], ['RELEASED', 'Released'], ['CANCELLED', 'Cancelled']];
  var HIST_TIER = [['', 'Anything'], ['1', 'Routine (Tier 1)'], ['2', 'Needs a closer look (Tier 2)'], ['3', 'Stopped (Tier 3)']];

  function historyHtml(role) {
    var u = ui();
    var f = u.deskHist = u.deskHist || { status: '', tier: '' };
    var all = st().payments;
    var rows = all.map(function (p) { return { p: p, f: facts(p) }; }).filter(function (x) {
      if (f.status === 'wait' && !(x.p.status === 'SUBMITTED' || x.p.status === 'CHECKED')) return false;
      if (f.status && f.status !== 'wait' && x.p.status !== f.status) return false;
      if (f.tier && String(x.f.tier) !== f.tier) return false;
      return true;
    });
    var body = rows.map(function (x) {
      var p = x.p;
      var hidden = amountsHidden(p, role, x.f.tier);
      return '<tr data-action="select" data-id="' + p.id + '">' +
        '<td data-label="Payment"><button type="button" class="link-btn" data-action="select" data-id="' + p.id + '">' + esc(p.id) + '</button><span class="hist-loan">' + esc(p.loanId + ' ' + loanOf(p.loanId).name) + '</span></td>' +
        '<td data-label="Value date">' + esc(U.fmtDate(p.instr.valueDate)) + '</td>' +
        '<td data-label="Tier">' + tierText(x.f.tier, true) + '</td>' +
        '<td data-label="Status">' + statusChip(p.status) + '</td>' +
        '<td data-label="Amount" class="num">' + (hidden ? '<span class="muted">Hidden</span>' : esc(shortAmt(x.f.total))) + '</td>' +
        '<td data-label="People" class="small">' + esc([p.makerId, p.checkerId, p.approverId].map(name).join(', ')) + '</td></tr>';
    }).join('');
    return '<section class="card history" aria-labelledby="hist-title"><div class="hist-head"><h2 id="hist-title">All payments</h2>' +
      '<div class="hist-filters"><label>Status <select data-hist="status">' + options(HIST_STATUS, f.status) + '</select></label>' +
      '<label>PCAP found <select data-hist="tier">' + options(HIST_TIER, f.tier) + '</select></label></div>' +
      '<span class="sec-meta">' + rows.length + ' of ' + all.length + ' payments</span></div>' +
      (rows.length ? '<div class="table-wrap"><table class="table hist"><thead><tr><th scope="col">Payment</th><th scope="col">Value date</th><th scope="col">PCAP found</th><th scope="col">Status</th><th scope="col" class="num">Amount out</th><th scope="col">Maker, checker, approver</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<p class="empty">No payments match these filters.</p>') +
      '<p class="hint">Select a payment to open it on the work queue. Amount out is what left the bank for released payments and what would leave for the others.</p></section>';
  }

  /* ------------------------------------------------------------ desk header */

  function whoLine(role) {
    if (role === 'approver') return ico('user') + '<span><strong>Assigned approver</strong>. You act as whoever the maker named as approver on each payment.</span>';
    var u = userOf(store.roleUserId(role));
    if (!u) return '';
    return ico('user') + '<span><strong>' + esc(u.name) + '</strong>, ' + esc(u.title) + ', ' + esc(u.employer) + (readOnlyRole(role) ? '. Payments are read-only for you.' : '') + '</span>';
  }

  function deskTop(role) {
    var counts = {};
    st().payments.forEach(function (p) { var w = waitsFor(p); if (w) counts[w] = (counts[w] || 0) + 1; });
    var segs = ROLES.map(function (r) {
      var on = r.id === role;
      return '<button type="button" class="seg-btn' + (on ? ' is-on' : '') + '" data-action="role" data-role="' + r.id + '" aria-pressed="' + on + '">' + esc(r.label) +
        (counts[r.id] ? '<span class="seg-count">' + srOnly(', ') + counts[r.id] + srOnly(' waiting') + '</span>' : '') + '</button>';
    }).join('');
    var waiting = store.waitingFor(role).length;
    return '<div class="desk-top"><div class="desk-title"><h1>Payments ' + code('M2 M3', 'h-code') + '</h1>' + PCAP.views.nowLine('desk', role, { n: waiting, form: role === 'maker' && ui().deskFlow ? ui().deskFlow.step || 1 : 0 }) + '</div>' +
      '<div class="acting"><div class="acting-row"><span class="acting-label" id="acting-label">You are</span><div class="seg" role="group" aria-labelledby="acting-label">' + segs + '</div></div>' +
      '<p class="acting-who">' + whoLine(role) + '</p></div></div>';
  }

  function viewTabs(view) {
    return '<div class="dtabs" role="group" aria-label="Desk views">' +
      '<button type="button" class="dtab' + (view === 'queue' ? ' is-on' : '') + '" aria-pressed="' + (view === 'queue') + '" data-action="view" data-view="queue">Work queue</button>' +
      '<button type="button" class="dtab' + (view === 'history' ? ' is-on' : '') + '" aria-pressed="' + (view === 'history') + '" data-action="view" data-view="history">History <span class="dtab-count">' + st().payments.length + '</span></button></div>';
  }

  /* ------------------------------------------------------------ render */

  /* When the role changes, land on that role's first waiting payment unless the current one waits for it. */
  function syncSelection(role) {
    var u = ui();
    if (u.deskSel && !store.payment(u.deskSel)) u.deskSel = null;
    if (u.deskLastRole !== role) {
      u.deskLastRole = role;
      u.deskReturn = null;
      u.deskQueueOpen = null;
      u.deskFlow = null;
      var cur = u.deskSel ? store.payment(u.deskSel) : null;
      if (!(cur && waitsFor(cur) === role)) {
        var first = firstWaiting(role);
        if (first) u.deskSel = first.id;
      }
    }
    if (!u.deskSel) {
      var f = firstWaiting(role);
      if (f) u.deskSel = f.id;
    }
  }

  function render(el) {
    var role = st().role;
    var u = ui();
    syncSelection(role);
    /* A demo scenario loaded from Home, the tour or the About page opens the new payment flow. */
    if (u.makerDraft && u.makerDraft.fresh) {
      delete u.makerDraft.fresh;
      if (role === 'maker') { u.deskFlow = { step: 1 }; u.deskView = 'queue'; }
    }
    if (role !== 'maker') u.deskFlow = null;
    var view = u.deskView === 'history' ? 'history' : 'queue';
    var html = deskTop(role) + '<div class="desk-bar">' + viewTabs(view) + (PCAP.views.value ? PCAP.views.value.strip(role) : '') + '</div>';
    if (view === 'history') {
      html += historyHtml(role);
    } else {
      var flowOpen = role === 'maker' && !!u.deskFlow;
      var sel = u.deskSel ? store.payment(u.deskSel) : null;
      var detail = flowOpen ? flowHtml() : sel ? detailHtml(sel, role) : emptyDetail(role);
      html += '<div class="desk-body">' + queueHtml(role, queueGroups(role), flowOpen || !sel ? null : sel.id, flowOpen || !!sel) +
        '<div class="detail" id="desk-detail">' + detail + '</div></div>';
    }
    el.innerHTML = '<div class="desk">' + html + '</div>';
    bind(el);
    applyQueueFilter();
    watchBar(el);
    renderedAt = performance.now();
    if (focusAfter) {
      var t = el.querySelector(focusAfter);
      focusAfter = null;
      if (t) { focusEl(t); if (t.id === 'q-search') { try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) { /* not a text field */ } } }
      lastFocusKey = focusKey(role);
    } else {
      defaultFocus(el, role);
    }
    if (scrollAfter) {
      var s = el.querySelector(scrollAfter);
      scrollAfter = null;
      if (s) s.scrollIntoView({ block: 'center' });
    }
  }

  function focusEl(t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
  function finePointer() { try { return root.matchMedia('(pointer: fine)').matches; } catch (e) { return true; } }
  function barShown() { var b = document.querySelector('.act-bar'); return !!(b && b.offsetParent !== null && getComputedStyle(b).display !== 'none'); }

  /* The state the default focus belongs to. Focus moves only when this changes, never while someone is working. */
  function focusKey(role) {
    var u = ui();
    var p = u.deskSel ? store.payment(u.deskSel) : null;
    if (!p || u.deskView === 'history' || (role === 'maker' && u.deskFlow)) return '';
    var a = p.approval && p.approval.version === p.version ? p.approval : null;
    return [role, p.id, p.status, p.version, a ? a.attempts.length : 0, u.deskReturn || ''].join('|');
  }

  /* Sensible default focus: the one thing this role does next on this payment. Text boxes only get focus with a mouse,
     so a phone keyboard never pops up by itself. */
  function defaultFocus(el, role) {
    var key = focusKey(role);
    if (!key || key === lastFocusKey) return;
    lastFocusKey = key;
    var p = store.payment(ui().deskSel);
    if (!p || waitsFor(p) !== role) return;
    var active = document.activeElement;
    if (active && active !== document.body && active.closest && (active.closest('.app-header') || active.id === 'q-search')) return;
    var detail = el.querySelector('#desk-detail');
    if (!detail) return;
    var fine = finePointer();
    var pick = null;
    if (detail.querySelector('#return-reason')) pick = fine ? '#return-reason' : null;
    else if (detail.querySelector('#rekey-input')) pick = fine ? '#rekey-input' : null;
    else if (detail.querySelector('#confirm-box')) pick = '#confirm-box';
    else if (detail.querySelector('#opr-reason')) pick = fine ? '#opr-reason' : null;
    else if (detail.querySelector('#approver-note')) pick = fine ? '#approver-note' : null;
    else if (role === 'checker' && detail.querySelector('.action.is-t3')) pick = '.d-rail [data-primary]';
    else if (role === 'checker' && checkLinesFor(p).fail) pick = fine ? '#checker-note' : null;
    else {
      var prim = detail.querySelector('.d-rail [data-primary]');
      var r = prim && prim.getBoundingClientRect();
      pick = (r && r.top >= 0 && r.bottom <= root.innerHeight) || !barShown() ? '.d-rail [data-primary]' : '.act-bar .btn:last-child';
    }
    var t = pick && detail.querySelector(pick);
    if (t) focusEl(t);
  }
  function checkLinesFor(p) { return checkLines(modelFor(p)); }

  /* Hide the bottom bar while the decision panel itself is on screen, so the same button is never shown twice. */
  var barObs = null;
  function watchBar(el) {
    if (barObs) { barObs.disconnect(); barObs = null; }
    var bar = el.querySelector('.act-bar');
    var panel = el.querySelector('.d-rail .action');
    if (!bar || !panel || typeof IntersectionObserver === 'undefined') return;
    barObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { bar.classList.toggle('is-near', en.isIntersecting); });
    }, { threshold: 0.35 });
    barObs.observe(panel);
  }

  function startDwellTimer() {
    var span = document.getElementById('dwell');
    if (!span) return;
    var id = span.getAttribute('data-id');
    var tick = function () {
      var s = document.getElementById('dwell');
      var p = store.payment(id);
      if (s && p) s.textContent = Math.floor(dwellSec(p)) + ' s';
    };
    tick();
    PCAP.app.addTimer(setInterval(tick, 500));
  }

  /* Bring the top of the detail into view after an action, below the sticky tabs. */
  function scrollToDetail() {
    var d = document.getElementById('desk-detail') || document.querySelector('.desk');
    if (!d) return;
    var top = d.getBoundingClientRect().top;
    if (top < 56 || top > window.innerHeight * 0.5) window.scrollTo(0, Math.max(0, window.pageYOffset + top - 64));
  }

  /* ------------------------------------------------------------ events */

  function readForm(form) {
    var d = draft();
    var f = form.elements;
    ['loanId', 'operation', 'interest', 'principal', 'overrideCode', 'checkerId', 'approverId', 'makerNote'].forEach(function (k) {
      if (f[k]) d[k] = f[k].value;
    });
    if (f.overrideOther) d.overrideOther = f.overrideOther.value;
    if (f.valueDateText) {
      d.valueDateText = f.valueDateText.value;
      var iso = parseDate(d.valueDateText);
      d.valueDateBad = !iso;
      if (iso) d.valueDate = iso;
    }
    E.OVERRIDE_FIELDS.forEach(function (k) {
      var x = form.querySelector('input[name="field-' + k + '"]:checked');
      if (x) d.fields[k] = x.value;
    });
    return d;
  }

  function refreshFlowHints() {
    var d = draft();
    var set = function (id, h) { var e = document.getElementById(id); if (e) { e.textContent = h.text; e.className = 'fhint' + (h.bad ? ' is-bad' : ''); } };
    set('hint-date', dateHint(d));
    set('hint-interest', moneyHint(d.interest));
    set('hint-principal', moneyHint(d.principal));
    var dt = document.getElementById('f-date');
    if (dt) { if (d.valueDateBad) dt.setAttribute('aria-invalid', 'true'); else dt.removeAttribute('aria-invalid'); }
    var live = document.getElementById('wiz-live');
    if (live) live.innerHTML = liveHint(d);
    /* Keep the "needs the wash account" markers in step with the legs as the maker sets them. */
    var miss = missingLegs(d);
    E.OVERRIDE_FIELDS.forEach(function (f) {
      var leg = document.getElementById('leg-' + f);
      var row = leg && leg.closest('.route-row');
      if (!row) return;
      var need = miss.indexOf(f) >= 0;
      row.classList.toggle('is-missing', need);
      var tag = leg.querySelector('.route-need');
      if (need && !tag) leg.insertAdjacentHTML('beforeend', '<span class="route-need">needs the wash account</span>');
      if (!need && tag) tag.remove();
    });
    var fix = document.querySelector('.route-fix');
    if (fix && !miss.length) { fix.className = 'inline-alert ok route-fix'; fix.innerHTML = U.icon('check') + '<p><strong>All three legs are on the wash account.</strong> The principal stays inside the bank.</p>'; }
  }

  function validateDraft(d) {
    var instr = draftToInstr(d);
    if (d.valueDateBad || !instr.valueDate) return 'Type the value date like 11 Aug 2020.';
    if (isNaN(instr.interest) || isNaN(instr.principal) || instr.interest < 0 || instr.principal < 0) return 'Amounts must be numbers of zero or more.';
    if (instr.interest + instr.principal <= 0) return 'Enter an interest or principal amount.';
    return null;
  }

  function goReview() {
    var form = document.getElementById('maker-form');
    if (form) readForm(form);
    var err = validateDraft(draft());
    if (err) { U.toast(err, 'bad'); refreshFlowHints(); return; }
    ui().deskFlow = { step: 2 };
    store.save();
    PCAP.app.render();
    scrollToDetail();
  }

  function fillFromLine(d, line, ln) {
    d.valueDate = line.date;
    d.valueDateText = null;
    d.valueDateBad = false;
    d.interest = plain(Math.max(0, line.interest - (line.paidInterest || 0)));
    d.principal = d.operation === 'INTEREST_VIA_WASH' ? plain(ln.principalOutstanding) : plain(Math.max(0, line.principal - (line.paidPrincipal || 0)));
  }

  /* Same as before: picking a loan fills the next unpaid schedule line. */
  function fillFromSchedule(d) {
    var ln = store.loan(d.loanId);
    if (!ln) return;
    var line = ln.schedule.slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; })
      .filter(function (l) { return (l.paidInterest || 0) < (l.interest || 0) || (l.paidPrincipal || 0) < (l.principal || 0); })[0];
    if (line) { d.operation = opForLine(d.operation, line); fillFromLine(d, line, ln); }
  }

  /* After a decision, open the next payment waiting for the same role (respecting the queue filter). Tier 2 and 3 payments
     still need their re-key, confirmation or reason, so moving on never skips a control. */
  function advance(role, doneId) {
    var q = qFilter();
    var next = store.waitingFor(role).filter(function (p) {
      if (p.id === doneId) return false;
      var f = facts(p);
      return qMatch(q, f.tier, searchText(p, f, amountsHidden(p, role, f.tier)));
    })[0];
    if (next) {
      var u = ui();
      u.deskSel = next.id;
      u.deskReturn = null;
      return next;
    }
    return null;
  }
  function nextNote(next) {
    if (!next) return ' Nothing else is waiting for you.';
    var t = facts(next).tier;
    return ' Next: ' + next.id + ' (' + tierName(t).toLowerCase() + ').';
  }

  function oprDecide(id, kind) {
    var reason = (document.getElementById('opr-reason') || {}).value || '';
    var secs = oprPerf[id] ? (performance.now() - oprPerf[id]) / 1000 : null;
    var min = E.DEFAULT_CONFIG.reasonMinChars;
    if (reason.trim().length < min) {
      showError('opr-err', 'Write your reason above first: at least ' + min + ' characters (you have ' + reason.trim().length + '). It is logged with your decision.', '#opr-reason');
      return;
    }
    var next = null;
    if (kind === 'release') {
      var cat = document.querySelector('input[name="opr-category"]:checked');
      if (!cat) { showError('opr-err', 'Choose why you are releasing it: false alarm or approved business exception.', 'input[name="opr-category"]'); return; }
      var ownerSel = document.getElementById('opr-owner');
      if (!window.confirm('Release ' + id + '? ' + fullAmt(store.currentEval(store.payment(id)).consequence.externalTotal) + ' will leave the bank under a recorded risk acceptance. This cannot be undone.')) return;
      try {
        store.opRiskRelease(id, store.roleUserId('oprisk'), cat.value, reason, secs, { ownerId: ownerSel ? ownerSel.value : null });
      } catch (err) { showError('opr-err', String(err && err.message || err)); return; }
      next = advance('oprisk', id);
      U.toast(id + ' released under risk sign-off ' + store.payment(id).opRisk.acceptance.id + '. Internal Audit will review it.' + nextNote(next), 'warn');
    } else {
      store.opRiskReject(id, store.roleUserId('oprisk'), reason, secs);
      next = advance('oprisk', id);
      U.toast(id + ' rejected and returned to the maker.' + nextNote(next), 'ok');
    }
    delete noteDrafts[id + ':opr-reason'];
    ui().oprRelease = null;
    PCAP.app.render();
    scrollToDetail();
  }

  /* A keyboard press that lands right after the screen changed is ignored, so a held or double Enter cannot release a second payment. */
  function tooSoon(e) { return !!(e && e.detail === 0 && performance.now() - renderedAt < ENTER_GUARD_MS); }

  var ACTIONS = {
    role: function (btn) {
      PCAP.app.setRole(btn.getAttribute('data-role'));
      scrollToDetail();
    },
    view: function (btn) {
      ui().deskView = btn.getAttribute('data-view');
      store.save();
      PCAP.app.render();
    },
    select: function (btn, id) {
      var u = ui();
      u.deskSel = id;
      u.deskView = 'queue';
      u.deskReturn = null;
      u.deskQueueOpen = null;
      u.deskFlow = null;
      store.save();
      focusAfter = '.q-row[data-id="' + id + '"]';
      PCAP.app.render();
      scrollToDetail();
    },
    'toggle-queue': function () {
      var u = ui();
      u.deskQueueOpen = !document.querySelector('.queue:not(.is-collapsed)');
      PCAP.app.render();
    },
    'q-tier': function (btn) {
      var q = qFilter();
      q.tier = btn.getAttribute('data-tier') || '';
      store.save();
      Array.prototype.forEach.call(document.querySelectorAll('.q-chip'), function (c) {
        var on = (c.getAttribute('data-tier') || '') === q.tier;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', String(on));
      });
      applyQueueFilter();
    },
    'to-panel': function () {
      var panel = document.querySelector('.d-rail .action');
      if (!panel) return;
      panel.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -64);
      var t = panel.querySelector('#confirm-box, #return-reason, #opr-reason, #approver-note, #checker-note, [data-primary]');
      if (t) focusEl(t);
    },
    'new': function () {
      var u = ui();
      if (draft().editingId || !draft().interest && !draft().principal) u.makerDraft = newDraft();
      u.deskFlow = { step: 1 };
      u.deskView = 'queue';
      store.save();
      PCAP.app.render();
      scrollToDetail();
    },
    'flow-close': function () {
      ui().deskFlow = null;
      store.save();
      PCAP.app.render();
    },
    'flow-step': function (btn) {
      if (+btn.getAttribute('data-step') === 2) { goReview(); return; }
      ui().deskFlow = { step: 1 };
      store.save();
      PCAP.app.render();
      scrollToDetail();
    },
    preset: function (btn) {
      var before = E.clone(draft());
      var d = PRESETS[btn.getAttribute('data-preset')]();
      delete d.fresh;
      ui().makerDraft = d;
      ui().deskFlow = { step: 1 };
      store.save();
      PCAP.app.render();
      /* Loading a scenario replaces what was typed. Offer to put it back. */
      if (before && (before.interest || before.principal || before.makerNote) && !before.editingId) {
        U.toast('Form replaced with the demo scenario.', 'ok', { action: 'Undo', onAction: function () {
          ui().makerDraft = before;
          ui().deskFlow = { step: 1 };
          store.save();
          PCAP.app.render();
          U.toast('Your earlier form is back.', 'ok');
        } });
      }
    },
    'use-line': function (btn) {
      var form = document.getElementById('maker-form');
      var d = form ? readForm(form) : draft();
      var ln = store.loan(d.loanId);
      var line = ln && ln.schedule.filter(function (l) { return l.date === btn.getAttribute('data-date'); })[0];
      if (!line) return;
      d.operation = opForLine(d.operation, line);
      fillFromLine(d, line, ln);
      store.save();
      PCAP.app.render();
    },
    submit: function () {
      var d = draft();
      var err = validateDraft(d);
      if (err) { U.toast(err, 'bad'); ui().deskFlow = { step: 1 }; PCAP.app.render(); return; }
      var editing = d.editingId;
      var p = store.submitInstruction(draftToInstr(d), store.roleUserId('maker'), editing);
      var u = ui();
      /* Remember who checks and approves, so the next payment starts with them. */
      u.makerDefaults = { checkerId: d.checkerId, approverId: d.approverId };
      u.makerDraft = blankDraft();
      u.deskFlow = null;
      u.deskSel = p.id;
      var t = p.atSubmit.tier;
      U.toast(p.id + (editing ? ' sent again' : ' sent') + ' to the checker. PCAP marked it ' + tierName(t).toLowerCase() + '.', t === 3 ? 'bad' : t === 2 ? 'warn' : 'ok');
      store.save();
      PCAP.app.render();
      scrollToDetail();
    },
    check: function (btn, id, e) {
      if (tooSoon(e)) return;
      var p = store.payment(id);
      var note = ((document.getElementById('checker-note') || {}).value || '').trim();
      if (store.currentEval(p).tier === 3 && note.length < NOTE_MIN) {
        showError('check-err', 'PCAP shows a hard stop. To send it on anyway, say why in the note (at least ' + NOTE_MIN + ' characters), or return it to the maker.', '#checker-note');
        return;
      }
      store.checkPayment(id, p.checkerId, note);
      delete noteDrafts[id + ':checker-note'];
      var next = advance('checker', id);
      U.toast(id + ' checked and sent to the approver.' + nextNote(next), 'ok');
      PCAP.app.render();
      scrollToDetail();
    },
    'return-open': function (btn, id) {
      ui().deskReturn = id;
      focusAfter = '#return-reason';
      PCAP.app.render();
      var r = document.getElementById('return-reason');
      if (r && (barShown() || !finePointer())) r.scrollIntoView({ block: 'center' });
    },
    'return-cancel': function () {
      ui().deskReturn = null;
      PCAP.app.render();
    },
    'return': function (btn, id) {
      var stage = btn.getAttribute('data-stage');
      var p = store.payment(id);
      var reason = ((document.getElementById('return-reason') || {}).value || '').trim();
      if (!reason) { showError('return-err', 'Write a reason so the maker knows what to fix.', '#return-reason'); return; }
      store.returnToMaker(id, stage === 'checker' ? p.checkerId : p.approverId, reason, stage);
      ui().deskReturn = null;
      delete noteDrafts[id + ':return-reason'];
      var next = advance(stage === 'checker' ? 'checker' : 'approver', id);
      U.toast(id + ' returned to the maker.' + nextNote(next), 'warn');
      PCAP.app.render();
      scrollToDetail();
    },
    'return-gate': function (btn, id) {
      var p = store.payment(id);
      var ev = store.currentEval(p);
      var reason = 'M3 gate: ' + (ev.results['R-05'].status === 'fire' ? ev.results['R-05'].message : ev.results['R-06'].message) + ' Please reassign.';
      store.returnToMaker(id, p.approverId, reason, 'gate');
      var next = advance('approver', id);
      U.toast(id + ' returned to the maker for reassignment.' + nextNote(next), 'warn');
      PCAP.app.render();
      scrollToDetail();
    },
    rekey: function (btn, id) {
      var input = document.getElementById('rekey-input');
      var amt = U.parseAmount(input ? input.value : '');
      if (isNaN(amt)) {
        showError('rk-amt-err', 'Type the amount from your source as a number, for example 7,820,000 or 7.82m.', '#rekey-input');
        return;
      }
      var nat = document.querySelector('input[name="rk-nature"]:checked');
      if (!nat) {
        showError('rk-type-err', 'Pick what your source says the payment is: interest only, principal and interest, or principal only.', 'input[name="rk-nature"]');
        return;
      }
      var rk = store.approverRekey(id, amt, nat.value);
      if (rk.status === 'retry') { U.toast('Your amount or payment type does not match. One more attempt.', 'warn'); focusAfter = '#rekey-input'; }
      else if (rk.status === 'pass') U.toast('Blind re-key matched.', 'ok');
      else U.toast('Second mismatch. PCAP stopped ' + id + '.', 'bad');
      PCAP.app.render();
      if (rk.status !== 'retry') scrollToDetail();
    },
    approve: function (btn, id, e) {
      if (tooSoon(e)) return;
      var ev = store.currentEval(store.payment(id));
      var box = document.getElementById('confirm-box');
      if (ev.tier === 2 && (!box || !box.checked)) {
        showError('confirm-err', 'Tick "I confirm" first. It says what will leave the bank.', '#confirm-box');
        if (box) box.closest('.confirm').scrollIntoView({ block: 'center' });
        return;
      }
      var dwell = dwellSec(store.payment(id));
      store.approverApprove(id, { dwellSec: dwell, confirmed: !!(box && box.checked) });
      var next = advance('approver', id);
      U.toast(id + ' released. ' + shortAmt(ev.consequence.externalTotal) + ' left the bank.' + nextNote(next), 'ok');
      PCAP.app.render();
      scrollToDetail();
    },
    escalate: function (btn, id, e) {
      if (tooSoon(e)) return;
      var dwell = dwellSec(store.payment(id));
      var note = (document.getElementById('approver-note') || {}).value || '';
      store.approverEscalate(id, { dwellSec: dwell, note: note.trim() });
      delete noteDrafts[id + ':approver-note'];
      var next = advance('approver', id);
      U.toast(id + ' stopped and sent to Operational Risk.' + nextNote(next), 'bad');
      PCAP.app.render();
      scrollToDetail();
    },
    'opr-reject': function (btn, id) { oprDecide(id, 'reject'); },
    'opr-release': function (btn, id) { oprDecide(id, 'release'); },
    edit: function (btn, id) {
      ui().makerDraft = editDraft(id);
      ui().deskFlow = { step: 1 };
      store.save();
      /* If a workaround leg is what failed, open the form at the routing so the fix is the first thing you see. */
      var toRouting = missingLegs(ui().makerDraft).length > 0;
      if (toRouting) scrollAfter = '#routing-group';
      PCAP.app.render();
      if (!toRouting) scrollToDetail();
    },
    practice: function () { PCAP.views.home.tryRole(st().role); },
    cancel: function (btn, id) {
      if (!window.confirm('Cancel ' + id + '? It will not be sent, and this cannot be undone.')) return;
      store.cancelPayment(id, store.roleUserId('maker'));
      U.toast(id + ' cancelled.', 'ok');
      PCAP.app.render();
    }
  };

  /* Desk shortcuts. J and K move through the queue, slash searches it, Ctrl+Enter does the main action of your panel.
     Single letters are ignored while typing. None of them releases a payment on its own. */
  function onKey(e) {
    if (PCAP.app.currentRoute() !== 'desk') return;
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === 'Enter' && e.repeat) { e.preventDefault(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      var prim = document.querySelector('#desk-detail .d-rail [data-primary], #desk-detail .d-focus [data-primary]');
      if (prim) { e.preventDefault(); prim.click(); }
      return;
    }
    if (typing) {
      if (e.key === 'Escape' && t.id === 'q-search') { t.value = ''; qFilter().text = ''; applyQueueFilter(); t.blur(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') {
      var s = document.getElementById('q-search');
      if (s) {
        e.preventDefault();
        var q = document.querySelector('.queue.is-collapsed');
        if (q) { ui().deskQueueOpen = true; PCAP.app.render(); s = document.getElementById('q-search'); }
        focusEl(s);
      }
      return;
    }
    if (e.key === 'j' || e.key === 'k') {
      /* The queue may be folded away on a phone: J and K still walk the rows the filter shows. */
      var rows = Array.prototype.slice.call(document.querySelectorAll('.queue li:not([hidden]) > .q-row'));
      if (!rows.length) return;
      var cur = ui().deskSel;
      var i = -1;
      rows.forEach(function (r, k) { if (r.getAttribute('data-id') === cur) i = k; });
      var n = e.key === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      if (n === i) return;
      e.preventDefault();
      ACTIONS.select(rows[n], rows[n].getAttribute('data-id'));
      return;
    }
    if (e.key === '?') {
      U.toast('Desk keys: J and K move through the queue. / searches it. Enter presses the focused button. Ctrl+Enter does the main action of your panel.', 'ok');
    }
  }

  function bind(el) {
    el.onclick = function (e) {
      var t = e.target;
      Array.prototype.forEach.call(el.querySelectorAll('details.menu[open]'), function (mnu) { if (!mnu.contains(t)) mnu.removeAttribute('open'); });
      var btn = t.closest && t.closest('[data-action]');
      if (!btn || btn.disabled || !el.contains(btn)) return;
      var act = ACTIONS[btn.getAttribute('data-action')];
      if (!act) return;
      e.preventDefault();
      try {
        act(btn, btn.getAttribute('data-id'), e);
      } catch (err) {
        U.toast(err.message || String(err), 'bad');
      }
    };
    /* Remember whether Operational Risk opened the release path, so a re-draw keeps it open. */
    if (!el.__deskToggle) {
      el.__deskToggle = true;
      el.addEventListener('toggle', function (e) {
        var d = e.target;
        if (d && d.classList && d.classList.contains('release-path')) ui().oprRelease = d.open ? ui().deskSel : null;
      }, true);
    }
    el.oninput = function (e) {
      var t = e.target;
      if (t.id === 'q-search') { qFilter().text = t.value; applyQueueFilter(); store.save(); return; }
      if (t.form && t.form.id === 'maker-form') { readForm(t.form); refreshFlowHints(); return; }
      var k = t.getAttribute && t.getAttribute('data-note');
      if (k) noteDrafts[k] = t.value;
      clearErrors(t);
      if (t.id === 'opr-reason') {
        var c = document.getElementById('opr-count'), min = +t.getAttribute('data-min') || 15, have = t.value.trim().length;
        if (c) { c.textContent = countText(have, min); c.classList.toggle('is-ok', have >= min); }
      }
    };
    el.onchange = function (e) {
      var t = e.target;
      if (t.name === 'rk-nature' || t.id === 'confirm-box' || t.name === 'opr-category') clearErrors(t);
      if (t.form && t.form.id === 'maker-form') {
        var d = readForm(t.form);
        if (t.name === 'operation') {
          if (d.operation === 'INTEREST_VIA_WASH' && !d.overrideCode) d.overrideCode = 'WA-01';
          if (d.operation !== 'INTEREST_VIA_WASH' && d.overrideCode === 'WA-01') d.overrideCode = '';
        }
        if (t.name === 'loanId') { fillFromSchedule(d); d.preset = null; }
        if (t.name === 'valueDateText' && !d.valueDateBad) { d.valueDateText = null; t.value = U.fmtDate(d.valueDate); }
        store.save();
        if (t.getAttribute('data-rerender')) PCAP.app.render();
        else refreshFlowHints();
        return;
      }
      var h = t.getAttribute && t.getAttribute('data-hist');
      if (h) {
        ui().deskHist = ui().deskHist || {};
        ui().deskHist[h] = t.value;
        store.save();
        PCAP.app.render();
      }
    };
    el.onsubmit = function (e) {
      if (e.target.id !== 'maker-form') return;
      e.preventDefault();
      goReview();
    };
    el.onkeydown = function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'rekey-input') {
        e.preventDefault();
        var btn = el.querySelector('[data-action="rekey"]');
        if (btn) btn.click();
      }
      if (e.key === 'Escape') {
        Array.prototype.forEach.call(el.querySelectorAll('details.menu[open]'), function (mnu) { mnu.removeAttribute('open'); });
      }
    };
  }

  /* Once the person starts fixing a field, the message about it goes away. */
  function clearErrors(t) {
    var box = t.closest && t.closest('.action, .rekey');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.ferr:not([hidden])'), function (x) { x.hidden = true; });
  }

  /* The maker's form, filled from a payment to fix and resubmit. fixLegs sets every workaround leg to stay in the bank (used by the tour). */
  function editDraft(id, opts) {
    var i = store.payment(id).instr;
    var known = st().ctx.register.some(function (r) { return r.id === i.overrideCode; });
    var d = {
      loanId: i.loanId, operation: i.operation, valueDate: i.valueDate, valueDateText: null, valueDateBad: false,
      interest: plain(i.interest), principal: plain(i.principal),
      overrideCode: !i.overrideCode ? '' : known ? i.overrideCode : '__other', overrideOther: known ? '' : i.overrideCode,
      fields: E.clone(i.fields), checkerId: i.checkerId, approverId: i.approverId, makerNote: i.makerNote || '', editingId: id, preset: null
    };
    if (opts && opts.fixLegs) d.fields = washAll();
    return d;
  }

  views.desk = { render: render, onKey: onKey, PRESETS: PRESETS, parseDate: parseDate, editDraft: editDraft, tierText: tierText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
