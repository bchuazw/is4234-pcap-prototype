/*
 * PCAP prototype: Payment desk (M2 Consequence Engine, M3 Authority Gate, M1 register checks).
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

  var revealPerf = {};   /* approver: when the consequence was revealed (M4 time on screen) */
  var oprPerf = {};      /* Operational Risk: when the hold was opened (decide time) */
  var noteDrafts = {};   /* unsent notes, kept across re-renders */
  var focusAfter = null; /* selector to focus after the next render */

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
  var ROUTE_LABEL = { LENDERS: 'Lenders', WASH: 'Wash account 9910' };
  var TIER_TEXT = {
    1: { title: 'Tier 1: routine.', text: 'The approver reads what the payment will do, then releases it.', icon: 'check', short: 'Routine' },
    2: { title: 'Tier 2: extra confirmation.', text: 'The approver re-keys the amount blind, then confirms what the payment will do.', icon: 'warn', short: 'Extra confirmation' },
    3: { title: 'Tier 3: hard stop.', text: 'Only Operational Risk can release this payment.', icon: 'stop', short: 'Hard stop' }
  };

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
    { id: 'rollup', title: 'Correct WA-01 roll-up', text: 'Interest only, all three legs on the wash account.' },
    { id: 'blank', title: 'Blank form', text: 'Start from an empty instruction.' }
  ];

  function blankDraft() { var d = PRESETS.blank(); delete d.fresh; return d; }
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
  function tierText(t, withLabel) {
    return '<span class="tt tt' + t + '">Tier ' + t + (withLabel ? ': ' + esc(TIER_TEXT[t].short.toLowerCase()) : '') + '</span>';
  }

  /* ------------------------------------------------------------ checks: short plain labels */

  function checkLabel(k, r, m) {
    var s = r.status, msg = String(r.message || ''), ap = name(m.approverId), x;
    switch (k) {
      case 'R-03':
        if (s === 'na') return 'No workaround used';
        if (s === 'pass') return ((x = /^(\S+) is an active register entry/.exec(msg)) ? x[1] : 'The workaround') + ' is registered and active';
        if ((x = /^Override "([^"]+)" is not in the M1 register/.exec(msg))) return 'Workaround "' + x[1] + '" is not in the register';
        if ((x = /(\S+) is retired/.exec(msg))) return x[1] + ' is retired';
        if ((x = /(\S+) is only proposed/.exec(msg))) return x[1] + ' is not approved by its owner yet';
        if ((x = /(\S+) dispensation expired/.exec(msg))) return x[1] + ' dispensation has expired';
        if ((x = /(\S+) is not approved for this operation/.exec(msg))) return x[1] + ' is not approved for this operation';
        if (/^Wash-account settings are used/.test(msg)) return 'Wash account used with no workaround declared';
        if (/^The workaround operation is used/.test(msg)) return 'Workaround operation used with no register entry';
        return trimDot(msg);
      case 'R-04':
        if (s === 'na') return 'No workaround fields to check';
        if (s === 'pass') return 'Workaround fields complete';
        if ((x = /Not set: (.+?)\.?$/.exec(msg))) return 'Workaround fields incomplete: ' + x[1] + ' not set';
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
        if (s === 'pass') return ap + (/in-house/.test(msg) ? ' is independent and in-house' : ' is independent of the maker and checker');
        if (/No approver assigned/.test(msg)) return 'No approver assigned';
        if (/The approver is the maker/.test(msg)) return 'The approver is also the maker';
        if (/The approver is the checker/.test(msg)) return 'The approver is also the checker';
        if (/The maker also checked/.test(msg)) return 'The maker also checked the payment';
        if ((x = /same team as the (.+?) \(/.exec(msg))) return ap + ' sits in the same team as the ' + x[1];
        if (/reporting line/.test(msg)) return ap + ' is in their reporting line';
        if (/in-house/.test(msg)) return 'Override payments need an in-house approver';
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
        if (s === 'na') return /Tier 1/.test(msg) ? 'No blind re-key needed at Tier 1' : 'No blind re-key recorded';
        if (s === 'pending') return 'The approver will re-key the amount blind';
        if (s === 'retry') return 'First blind re-key did not match';
        if (s === 'pass') return /second/.test(msg) ? 'Blind re-key matched on the second try' : 'Blind re-key matched';
        if (s === 'fire') return 'Blind re-key did not match twice';
        return trimDot(msg);
    }
    return trimDot(msg);
  }

  var GROUPS = [
    { title: 'Register', mod: 'M1', rules: ['R-03', 'R-04'] },
    { title: 'Authority', mod: 'M3', rules: ['R-05', 'R-06'] },
    { title: 'Consequence', mod: 'M2', rules: ['R-01', 'R-02', 'R-07'] }
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
      '<span class="chk-id">' + esc(l.ids || l.k) + '</span>' + ico('chev', 'chk-chev') + '</summary>' +
      '<div class="chk-more"><p>' + esc(l.r.message) + '</p><p class="chk-rule">' + esc(more) + '</p></div></details></li>';
  }

  function checksCard(m) {
    var c = checkLines(m);
    var summary = (c.fail ? c.fail + ' failed' : 'None failed') + ', ' + c.pass + ' passed' + (c.wait ? ', ' + c.wait + ' to come' : '');
    return '<section class="card checks" aria-labelledby="checks-title"><div class="sec-head"><h3 id="checks-title">Checks</h3><span class="sec-meta">' + esc(summary) + '</span></div>' +
      c.groups.map(function (G) {
        return '<div class="chk-group"><h4 class="chk-gtitle">' + esc(G.g.title) + ' <span class="chk-mod">' + G.g.mod + '</span></h4><ul class="chk-list">' +
          G.lines.map(checkLine).join('') + '</ul></div>';
      }).join('') + '<p class="chk-foot">Select a check to see the full rule result.</p></section>';
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
    if (opts.rekey && opts.rekey.length) rows.push([opts.rekeyLabel || 'Your blind re-key', opts.rekey.map(fullAmt).join(' then '), 'is-rekey']);
    rows.push(['Interest to lenders', fullAmt(m.interest), '']);
    rows.push(['Principal to lenders', fullAmt(m.principal), m.principal > 0 ? 'strong' : '']);
    if (m.kept > 0 || m.principalKeyed > 0) rows.push(['Principal kept in the bank', fullAmt(m.kept), '']);
    rows.push(['Total leaving the bank', fullAmt(m.total), 'total']);
    rows.push(['Loan schedule expects, ' + U.fmtDate(m.date), fullAmt(m.expected), '']);
    rows.push(['Difference', (v.diff > 0 ? '+' : '') + fullAmt(v.diff), Math.abs(v.diff) < 0.005 ? 'ok' : v.fire ? 'bad' : '']);
    return '<div class="cq-figs"><h4>Full figures</h4><table class="figs"><tbody>' + rows.map(function (r) {
      return '<tr' + (r[2] ? ' class="' + r[2] + '"' : '') + '><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function consequenceCard(m, opts) {
    opts = opts || {};
    var subs = [];
    if (m.kept > 0) subs.push(keptSentence(m));
    if (m.partialWash && m.principalKeyed > 0) {
      subs.push('Only ' + esc(listAnd(m.washSet)) + (m.washSet.length === 1 ? ' is' : ' are') + ' routed to the wash account. The workaround needs FRONT, FUND and PRINCIPAL there, so the principal still goes to the lenders.');
    }
    return '<section class="card cq cq-t' + m.tier + '" aria-labelledby="cq-title">' +
      '<h3 class="eyebrow" id="cq-title">' + esc(opts.eyebrow || 'What this payment will do') + '</h3>' +
      '<p class="cq-hero">' + heroSentence(m) + '</p>' +
      subs.map(function (x) { return '<p class="cq-sub">' + x + '</p>'; }).join('') +
      barsHtml(m) + figuresHtml(m, opts) + '</section>';
  }

  function decisionBanner(m) {
    var t = TIER_TEXT[m.tier] || TIER_TEXT[1];
    var gate = m.gate && !m.gate.open
      ? '<p class="db-gate">' + U.icon('lock') + '<span>M3 gate closed: ' + esc(name(m.approverId)) + ' cannot approve this payment, so it has to be reassigned.</span></p>' : '';
    return '<div class="dbanner t' + m.tier + '" role="status">' + U.icon(t.icon) + '<div class="db-body"><p><strong>' + esc(t.title) + '</strong> ' + esc(t.text) + '</p>' + gate + '</div></div>';
  }

  /* ------------------------------------------------------------ instruction and people */

  function kv(k, v, cls) { return '<div><dt>' + esc(k) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</dd></div>'; }

  function routingView(fields) {
    return '<div class="rt"><p class="rt-title">Settlement routing</p><ul class="rt-list">' + E.OVERRIDE_FIELDS.map(function (f) {
      var v = fields[f];
      return '<li><span class="rt-leg">' + f + '</span>' + ico('to', 'rt-arrow') + '<span class="rt-to' + (v === E.WASH ? ' is-wash' : '') + '">' + esc(ROUTE_LABEL[v] || v) + '</span></li>';
    }).join('') + '</ul></div>';
  }

  function instructionCard(instr, opts) {
    opts = opts || {};
    var ln = loanOf(instr.loanId);
    var amt = function (v) { return opts.hideAmounts ? '<span class="muted">Hidden until your blind re-key</span>' : esc(fullAmt(v)); };
    return '<section class="card instr" aria-labelledby="instr-title"><div class="sec-head"><h3 id="instr-title">Instruction</h3>' +
      (opts.edit ? '<button type="button" class="btn link small" data-action="flow-step" data-step="1">Edit instruction</button>' : '<span class="sec-meta">As keyed in the core loan system</span>') + '</div>' +
      '<dl class="kv2">' +
      kv('Loan', esc(ln.id + ' ' + ln.name)) +
      kv('Operation', esc(opLabel(instr.operation))) +
      kv('Value date', esc(U.fmtDate(instr.valueDate))) +
      kv('Override code', esc(instr.overrideCode || 'None')) +
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
    var rekeys = a && a.attempts.length ? 'Blind re-key ' + a.attempts.map(fullAmt).join(' then ') : '';
    var items = personRow('Maker', p.makerId, '', p.instr.makerNote) +
      personRow('Checker', p.checkerId, '', opts.hideCheckerNote ? '' : p.checkerNote) +
      personRow('Approver', p.approverId, opts.hideRekeys ? '' : rekeys, a && a.note) +
      (opr && p.opRisk ? personRow('Op Risk', p.opRisk.by, p.opRisk.decision === 'release' ? 'Released (' + p.opRisk.category + ')' : 'Rejected', p.opRisk.reason) : '') +
      (p.heldAt && p.status === 'HELD' ? '<li><span class="ppl-role">Held</span><span class="ppl-name">' + esc(U.fmtDateTime(p.heldAt)) + '</span></li>' : '');
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
      { label: 'Op Risk review', state: t3 ? 'upcoming' : 'skipped', meta: t3 ? 'Needed at Tier 3' : 'Only at Tier 3' },
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
        steps[idx].meta = name(ret.actorId) + ', ' + (p.returnStage === 'gate' ? 'blocked at the M3 gate ' : 'returned ') + when(ret.ts);
        for (var k = idx + 1; k < 4; k++) steps[k].state = 'skipped';
      }
    }
    if (p.status === 'RETURNED') steps[4] = { label: 'Back with maker', state: 'now-ret', meta: 'Waiting for ' + name(p.makerId) };
    if (p.status === 'CANCELLED' || p.status === 'REJECTED') steps[4] = { label: 'Stopped', state: 'stopped', meta: 'Cancelled' + (canc ? ' ' + when(canc.ts) : '') };
    return steps;
  }

  var STEP_ICON = { done: 'check', released: 'check', skipped: 'dash', returned: 'undo', 'now-ret': 'undo', stopped: 'x' };
  var STEP_SR = { done: 'Done', released: 'Done', current: 'Current step', upcoming: 'Not started', skipped: 'Skipped', returned: 'Returned', 'now-ret': 'Current step', stopped: 'Stopped' };

  function stepperHtml(steps) {
    return '<ol class="stepper" aria-label="Payment lifecycle">' + steps.map(function (s, i) {
      var icon = STEP_ICON[s.state] ? ico(STEP_ICON[s.state]) : '<span>' + (i + 1) + '</span>';
      var cur = s.state === 'current' || s.state === 'now-ret';
      return '<li class="stp is-' + s.state + '"' + (cur ? ' aria-current="step"' : '') + '><span class="stp-dot">' + icon + '</span>' +
        '<span class="stp-text"><span class="stp-label">' + srOnly(STEP_SR[s.state] + ': ') + esc(s.label) + '</span><span class="stp-meta">' + esc(s.meta || '') + '</span></span></li>';
    }).join('') + '</ol>';
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
      stepperHtml(lifecycle(p, m)) + nextBanner(p, role) + '</section>';
  }

  /* Main column cards plus a right rail. Narrow screens stack them with the rail after the first card. */
  function grid(first, rail, rest) {
    return '<div class="d-grid" style="--rows:' + (1 + rest.length) + '">' + first + '<aside class="d-rail">' + rail + '</aside>' + rest.join('') + '</div>';
  }

  /* ------------------------------------------------------------ role panels (right rail) */

  function noteField(key, id, label, placeholder, rows) {
    var k = key + ':' + id;
    return '<div class="field"><label class="flabel" for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" rows="' + (rows || 3) + '" data-note="' + esc(k) + '" placeholder="' + esc(placeholder) + '">' + esc(noteDrafts[k] || '') + '</textarea></div>';
  }

  function returnPanel(p, stage) {
    var def = stage === 'approver' ? 'Amounts do not match my source.' : 'Please correct the instruction.';
    var k = p.id + ':return-reason';
    if (noteDrafts[k] == null) noteDrafts[k] = def;
    return '<section class="card action" aria-label="Return to maker"><h3>Return ' + esc(p.id) + ' to the maker</h3>' +
      '<p class="hint">The maker sees your reason and can fix and resubmit the payment.</p>' +
      noteField(p.id, 'return-reason', 'Reason', '') +
      '<div class="act-buttons"><button type="button" class="btn primary" data-action="return" data-id="' + p.id + '" data-stage="' + stage + '">Return to maker</button>' +
      '<button type="button" class="btn ghost" data-action="return-cancel">Cancel</button></div></section>';
  }

  function checkerPanel(p) {
    if (ui().deskReturn === p.id) return returnPanel(p, 'checker');
    return '<section class="card action" aria-label="Your check"><h3>Your check</h3>' +
      '<p class="hint">Compare the instruction with its source. You see the same consequence the approver will see.</p>' +
      noteField(p.id, 'checker-note', 'Note to the approver', 'e.g. Principal set to wash. Interest only to lenders.') +
      '<p class="hint with-icon">' + U.icon('eye') + '<span>The approver sees this note only after their blind re-key, so it cannot anchor their check.</span></p>' +
      '<div class="act-buttons"><button type="button" class="btn primary" data-action="check" data-id="' + p.id + '">Mark checked, send to approver</button>' +
      '<button type="button" class="btn" data-action="return-open" data-id="' + p.id + '">Return to maker</button></div></section>';
  }

  function approverPanel(p, m) {
    if (ui().deskReturn === p.id) return returnPanel(p, 'approver');
    var ap = userOf(p.approverId);
    var who = '<p class="act-who">' + ico('user') + '<span>Acting as <strong>' + esc(ap ? ap.name : '') + '</strong>, the assigned approver (' + esc(ap ? ap.employer + ', ' + ap.team : '') + ').</span></p>';
    var ret = '<button type="button" class="btn" data-action="return-open" data-id="' + p.id + '">Return to maker</button>';
    var body;
    if (m.tier === 3) {
      body = '<div class="inline-alert bad">' + U.icon('stop') + '<p><strong>You cannot release this payment.</strong> Send it to Operational Risk with a note, or return it to the maker.</p></div>' +
        noteField(p.id, 'approver-note', 'Note to Operational Risk', 'e.g. Notice says USD 7.82M interest only. This would send principal out.') +
        '<div class="act-buttons"><button type="button" class="btn danger" data-action="escalate" data-id="' + p.id + '">Send to Operational Risk</button>' + ret + '</div>';
    } else if (m.tier === 2) {
      body = '<label class="confirm"><input type="checkbox" id="confirm-box"><span><strong>I confirm</strong> what this payment will do. ' + heroSentence(m) + (m.kept > 0 ? ' ' + keptSentence(m) : '') + '</span></label>' +
        '<div class="act-buttons"><button type="button" class="btn primary" data-action="approve" data-id="' + p.id + '">Approve and release</button>' + ret + '</div>';
    } else {
      body = '<p class="hint">Tier 1 needs no re-key. Read what the payment will do, then release it.</p>' +
        '<div class="act-buttons"><button type="button" class="btn primary" data-action="approve" data-id="' + p.id + '">Approve and release</button>' + ret + '</div>';
    }
    return '<section class="card action" aria-label="Your decision"><h3>Your decision</h3>' + who + body +
      '<p class="dwell">' + ico('clock') + '<span>Time on this screen <strong id="dwell" data-id="' + p.id + '">0 s</strong>. Measured for M4 and reported at team level.</span></p></section>';
  }

  function opRiskPanel(p, m) {
    var mins = Math.max(0, Math.round((Date.now() - new Date(p.heldAt)) / 60000));
    var failed = checkLines(m).failed;
    var k = p.id + ':opr-reason';
    return '<section class="card action opr" aria-label="Second-line decision"><h3>Second-line decision</h3>' +
      '<p class="hint">' + esc(name(p.approverId)) + ' (approver) sent it here ' + (mins < 1 ? 'less than a minute' : mins + ' min') + ' ago. Only you can release it, and only with a recorded reason.</p>' +
      (failed.length ? '<div class="why"><p class="why-title">Why it was held</p><ul>' + failed.map(function (l) {
        return '<li>' + U.icon('x') + '<span>' + esc(l.label) + '</span><span class="chk-id">' + esc(l.k) + '</span></li>';
      }).join('') + '</ul></div>' : '') +
      '<div class="field"><label class="flabel" for="opr-reason">Reason (required, at least 15 characters)</label><textarea id="opr-reason" rows="4" data-note="' + esc(k) + '" placeholder="e.g. Principal would leave the bank on an interest-only date. Returned for FRONT and FUND.">' + esc(noteDrafts[k] || '') + '</textarea></div>' +
      '<div class="act-buttons"><button type="button" class="btn primary" data-action="opr-reject" data-id="' + p.id + '">Reject and return to maker</button></div>' +
      '<fieldset class="release-type"><legend>To release it instead, record why</legend>' +
      '<label class="radio"><input type="radio" name="opr-category" value="False alarm, payment is correct"><span>False alarm: the payment is correct</span></label>' +
      '<label class="radio"><input type="radio" name="opr-category" value="Approved business exception"><span>Approved business exception</span></label></fieldset>' +
      '<div class="act-buttons"><button type="button" class="btn danger-outline" data-action="opr-release" data-id="' + p.id + '">Release with reason</button></div>' +
      '<p class="hint">Every decision is logged with your reason, the time and the obligation it serves. M4 also tracks second-line releases.</p></section>';
  }

  function makerReturnedPanel(p) {
    var stage = { checker: 'the checker', approver: 'the approver', gate: 'the approver, blocked at the M3 gate', oprisk: 'Operational Risk' }[p.returnStage] || 'a reviewer';
    return '<section class="card action" aria-label="Returned to you"><h3>Returned to you</h3>' +
      '<p class="hint">' + esc(name(p.returnedBy)) + ' (' + esc(stage) + ') returned it on ' + esc(U.fmtDateTime(p.returnedAt)) + '.</p>' +
      (p.returnReason ? '<blockquote class="reason">' + esc(p.returnReason) + '</blockquote>' : '') +
      '<div class="act-buttons"><button type="button" class="btn primary" data-action="edit" data-id="' + p.id + '">Edit and resubmit</button>' +
      '<button type="button" class="btn ghost" data-action="cancel" data-id="' + p.id + '">Cancel payment</button></div></section>';
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
    var text = 'You (' + name(m.approverId) + ') can approve this payment: ' + (cert ? 'certified for ' + cert[1] + ', ' : '') + 'within your approval limit, and independent of the maker and checker.';
    return '<div class="gate-line">' + U.icon('unlock') + '<p><strong>M3 gate open.</strong> ' + esc(text) + '</p><span class="chk-id">R-05, R-06</span></div>';
  }

  function gateClosedCard(p, ev) {
    var fails = ['R-05', 'R-06'].filter(function (k) { return ev.results[k].status === 'fire'; });
    return '<section class="card gate-closed" aria-label="M3 gate closed"><div class="gc-head">' + U.icon('lock') + '<h3>M3 gate closed. ' + esc(name(p.approverId)) + ' cannot approve this payment.</h3></div>' +
      '<ul class="gc-list">' + fails.map(function (k) { return '<li><span>' + esc(ev.results[k].message) + '</span><span class="chk-id">' + k + '</span></li>'; }).join('') + '</ul>' +
      '<p class="hint">This attempt is logged as a blocked attempt (evidence for obligation rows 1, 3 and 5). Return it so the maker can route it to a certified, independent, in-house approver.</p>' +
      '<div class="act-buttons row"><button type="button" class="btn primary" data-action="return-gate" data-id="' + p.id + '">Return to maker for reassignment</button></div></section>';
  }

  function rekeyCard(p, ev) {
    var a = p.approval || { attempts: [] };
    var retry = a.rekey === 'retry';
    var used = a.attempts.length;
    var dots = [0, 1].map(function (i) { return '<span class="rk-dot' + (i < used ? ' is-miss' : '') + '"></span>'; }).join('');
    return '<section class="card rekey" aria-labelledby="rk-title">' +
      '<p class="eyebrow">Step 1 of 2: blind re-key <span class="chk-id">R-07</span></p>' +
      '<h3 class="rk-title" id="rk-title">Type the total amount this payment will send</h3>' +
      '<p class="rk-help">Use your own source, not the instruction. The maker\'s figures, the checker\'s note and PCAP\'s statement stay hidden until you are done, so they cannot anchor your check.</p>' +
      (retry ? '<div class="inline-alert warn" role="alert">' + U.icon('warn') + '<p><strong>That does not match what this instruction will send.</strong> Check your source and try once more. A second mismatch sends the payment to Operational Risk.</p></div>' : '') +
      '<div class="rk-form"><label class="flabel" for="rekey-input">Total leaving the bank</label><div class="rk-row">' +
      '<div class="money big"><span class="money-cur" aria-hidden="true">USD</span><input id="rekey-input" inputmode="decimal" autocomplete="off" placeholder="e.g. 7,820,000 or 7.82m" aria-describedby="rk-attempts"></div>' +
      '<button type="button" class="btn primary" data-action="rekey" data-id="' + p.id + '">Check amount</button></div></div>' +
      '<p class="rk-attempts" id="rk-attempts"><span class="rk-dots" aria-hidden="true">' + dots + '</span>Attempt ' + (used + 1) + ' of 2</p>' +
      '<details class="source"' + (retry ? ' open' : '') + '><summary>' + ico('doc') + ' Your source: agent notice to lenders (synthetic)</summary><p>' + esc(noticeText(ev)) + '</p></details>' +
      '</section>';
  }

  function rekeyResultLine(p) {
    var a = p.approval || { attempts: [] };
    if (a.rekey === 'pass') {
      return '<div class="inline-alert ok">' + U.icon('check') + '<p><strong>Step 1 done.</strong> Your blind re-key of ' + esc(fullAmt(a.attempts[a.attempts.length - 1])) + ' matches what PCAP computed' + (a.rekeyKind === 'slip' ? ' on the second attempt. Your first figure is logged as a slip.' : '.') + '</p></div>';
    }
    return '<div class="inline-alert bad">' + U.icon('stop') + '<p><strong>Your figure (' + esc(fullAmt(a.attempts[a.attempts.length - 1])) + ') did not match twice.</strong> R-07 made this payment a Tier 3 hard stop.</p></div>';
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
        if (!revealPerf[p.id]) revealPerf[p.id] = performance.now();
        var a = p.approval || { attempts: [] };
        body = gateLine(m) + (ev0.tier >= 2 || a.attempts.length ? rekeyResultLine(p) : '') + decisionBanner(m) +
          grid(consequenceCard(m, { rekey: a.attempts, eyebrow: ev0.tier >= 2 || a.attempts.length ? 'Step 2 of 2: what this payment will do' : null }), approverPanel(p, m),
            [checksCard(m), instructionCard(p.instr), peopleCard(p, { hideRekeys: true })]);
      }
    } else {
      m = modelFor(p);
      hidden = amountsHidden(p, role, m.tier);
      var a2 = p.approval && p.approval.version === p.version ? p.approval : null;
      var rekeyFigs = { rekey: a2 ? a2.attempts : null, rekeyLabel: 'Approver\'s blind re-key' };
      if (hidden) {
        body = '<div class="d-focus"><div class="inline-alert info">' + U.icon('eye') + '<p><strong>Amounts hidden.</strong> As the approver you re-key this payment blind, so its figures stay hidden until you have done that.</p></div>' + instructionCard(p.instr, { hideAmounts: true }) + '</div>';
      } else if (role === 'checker' && p.status === 'SUBMITTED') {
        body = decisionBanner(m) + grid(consequenceCard(m), checkerPanel(p), [checksCard(m), instructionCard(p.instr), peopleCard(p)]);
      } else if (role === 'oprisk' && p.status === 'HELD') {
        if (!oprPerf[p.id]) oprPerf[p.id] = performance.now();
        body = decisionBanner(m) + grid(consequenceCard(m, rekeyFigs), opRiskPanel(p, m), [checksCard(m), peopleCard(p, { title: 'Who saw it' }), instructionCard(p.instr)]);
      } else if (role === 'maker' && p.status === 'RETURNED') {
        body = decisionBanner(m) + grid(consequenceCard(m, rekeyFigs), makerReturnedPanel(p), [checksCard(m), instructionCard(p.instr), peopleCard(p)]);
      } else {
        body = decisionBanner(m) + grid(consequenceCard(m, rekeyFigs), peopleCard(p), [checksCard(m), instructionCard(p.instr)]);
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
      checker: 'Payments appear here when the maker submits them.',
      approver: 'Payments appear here after the checker sends them on.',
      oprisk: 'Tier 3 hard stops appear here after the approver sends them.',
      owner: 'As Head of Loan Ops you own the M1 register. Payments are read-only here.'
    }[role] || '';
    return '<section class="card empty-state">' + ico('inbox', 'es-icon') + '<h2>' + (role === 'owner' ? 'Payments are read-only for you' : 'Nothing is waiting for you') + '</h2><p>' + esc(hint) + ' Select any payment in the queue to see it.</p>' +
      (role === 'owner' ? '<div class="es-actions"><a class="btn" href="#/register">Open the register</a></div>' : '') + '</section>';
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
    list.push(['__other', 'Other code not in the register']);
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
    return '<span class="tt tt' + ev.tier + '">Tier ' + ev.tier + '</span><span>Live PCAP check: ' + (n ? n + ' check' + (n === 1 ? '' : 's') + ' failed' : 'no checks failed') + '. Review it next.</span>';
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

  function routeControl(f, value) {
    var id = 'leg-' + f;
    return '<div class="route-row"><span class="route-leg" id="' + id + '">' + f + '</span><div class="seg opts" role="radiogroup" aria-labelledby="' + id + '">' +
      ['LENDERS', 'WASH'].map(function (v) {
        return '<label class="seg-opt' + (v === 'WASH' ? ' is-wash' : '') + '"><input type="radio" name="field-' + f + '" value="' + v + '"' + (value === v ? ' checked' : '') + '><span>' + esc(ROUTE_LABEL[v]) + '</span></label>';
      }).join('') + '</div></div>';
  }

  function flowStep1(d, editing) {
    var loans = st().ctx.loans;
    var notes = '';
    if (editing && editing.returnReason) notes += '<div class="inline-alert warn">' + ico('undo') + '<p><strong>Returned by ' + esc(name(editing.returnedBy)) + '.</strong> ' + esc(editing.returnReason) + '</p></div>';
    if (d.preset === 'revlon' && d.loanId === E.REPLAY.loan.id) notes += '<div class="inline-alert info">' + ico('flask') + '<p><strong>Demo scenario.</strong> A synthetic replay of 11 Aug 2020. About USD 7.8M of interest was meant to go out, but only PRINCIPAL is routed to the wash account.</p></div>';
    var dh = dateHint(d), ih = moneyHint(d.interest), ph = moneyHint(d.principal);
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
      '<fieldset class="fgroup"><legend class="fgroup-title">Settlement routing</legend><p class="fgroup-note">Where each leg of the payment settles. The WA-01 workaround only keeps principal in the bank when all three legs go to the wash account.</p>' +
      '<div class="routing">' + E.OVERRIDE_FIELDS.map(function (f) { return routeControl(f, d.fields[f]); }).join('') + '</div>' +
      '<div class="fgrid"><div class="field span2"><label class="flabel" for="f-override">Override (workaround) code</label><select id="f-override" name="overrideCode" data-rerender="1">' + overrideOptions(d.operation, d.overrideCode) + '</select></div>' +
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
      '<div><dt>Tier</dt><dd>' + tierText(m.tier, true) + '</dd></div>' +
      '<div><dt>Checks</dt><dd>' + (c.fail ? '<span class="bad-text"><b>' + c.fail + '</b> failed</span>' : 'None failed') + '</dd></div>' +
      '<div><dt>Next</dt><dd>' + esc(name(instr.checkerId)) + ' checks it</dd></div></dl>' +
      '<div class="act-buttons"><button type="button" class="btn primary" data-action="submit">' + (editing ? 'Resubmit to checker' : 'Submit to checker') + '</button>' +
      '<button type="button" class="btn ghost" data-action="flow-step" data-step="1">' + ico('back') + ' Back to instruction</button></div>' +
      '<p class="hint">PCAP does not stop you submitting. It holds the payment at the release point' + (m.tier === 3 ? ', and only Operational Risk can release a Tier 3 payment.' : '.') + '</p></section>';
    return decisionBanner(m) + grid(consequenceCard(m), rail, [checksCard(m), instructionCard(instr, { edit: true })]);
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

  function queueRow(p, role, selId) {
    var f = facts(p);
    var hidden = amountsHidden(p, role, f.tier);
    var on = p.id === selId;
    return '<li><button type="button" class="q-row' + (on ? ' is-active' : '') + '" data-action="select" data-id="' + p.id + '"' + (on ? ' aria-current="true"' : '') + '>' +
      '<span class="q-line"><span class="q-id">' + esc(p.id) + '</span>' + (hidden ? '<span class="q-amt is-hidden">Amount hidden</span>' : '<span class="q-amt">' + esc(shortAmt(f.total)) + '</span>') + '</span>' +
      '<span class="q-line"><span class="q-sub">' + tierText(f.tier) + '<span class="q-loan">' + esc(loanOf(p.loanId).name) + '</span></span>' + statusChip(p.status, true) + '</span>' +
      '</button></li>';
  }

  function queueGroup(title, list, role, selId, empty, limit) {
    var items = limit ? list.slice(0, limit) : list;
    return '<section class="q-group"><h3 class="q-title"><span>' + esc(title) + '</span><span class="q-count">' + list.length + '</span></h3>' +
      (items.length ? '<ul class="q-list">' + items.map(function (p) { return queueRow(p, role, selId); }).join('') + '</ul>' : '<p class="q-empty">' + esc(empty) + '</p>') +
      (limit && list.length > limit ? '<button type="button" class="btn link small q-more" data-action="view" data-view="history">See all ' + list.length + ' in History</button>' : '') + '</section>';
  }

  function queueOpenNow(hasDetail) {
    var u = ui();
    return u.deskQueueOpen != null ? !!u.deskQueueOpen : !hasDetail;
  }

  function queueHtml(role, g, selId, hasDetail) {
    var open = queueOpenNow(hasDetail);
    var waitEmpty = { maker: 'Nothing returned to you.', checker: 'Nothing to check.', approver: 'Nothing to approve.', oprisk: 'No Tier 3 holds.' }[role] || '';
    return '<aside class="card queue' + (open ? '' : ' is-collapsed') + '" aria-label="Work queue">' +
      '<div class="q-head">' + (role === 'maker' ? '<button type="button" class="btn primary block" data-action="new">' + ico('plus') + ' New payment</button>' : '') +
      '<button type="button" class="q-toggle" data-action="toggle-queue" aria-expanded="' + open + '" aria-controls="q-body"><span class="q-toggle-title">Work queue</span>' +
      '<span class="q-toggle-meta">' + (role === 'owner' ? g.progress.length + ' in progress' : g.waiting.length + ' waiting for you') + '</span>' + ico('chev', 'q-chev') + '</button></div>' +
      '<div class="q-body" id="q-body">' +
      (role !== 'owner' ? queueGroup('Waiting for you', g.waiting, role, selId, waitEmpty) : '') +
      queueGroup('In progress', g.progress, role, selId, 'Nothing in progress.') +
      queueGroup('Done', g.done, role, selId, 'Nothing released yet.', 5) +
      '</div></aside>';
  }

  /* ------------------------------------------------------------ history */

  var HIST_STATUS = [['', 'All statuses'], ['wait', 'Waiting for checker or approver'], ['HELD', 'Held for Op Risk'], ['RETURNED', 'Returned to maker'], ['RELEASED', 'Released'], ['CANCELLED', 'Cancelled']];
  var HIST_TIER = [['', 'All tiers'], ['1', 'Tier 1'], ['2', 'Tier 2'], ['3', 'Tier 3']];

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
        '<td data-label="Tier">' + tierText(x.f.tier) + '</td>' +
        '<td data-label="Status">' + statusChip(p.status) + '</td>' +
        '<td data-label="Amount" class="num">' + (hidden ? '<span class="muted">Hidden</span>' : esc(shortAmt(x.f.total))) + '</td>' +
        '<td data-label="People" class="small">' + esc([p.makerId, p.checkerId, p.approverId].map(name).join(', ')) + '</td></tr>';
    }).join('');
    return '<section class="card history" aria-labelledby="hist-title"><div class="hist-head"><h2 id="hist-title">All payments</h2>' +
      '<div class="hist-filters"><label>Status <select data-hist="status">' + options(HIST_STATUS, f.status) + '</select></label>' +
      '<label>Tier <select data-hist="tier">' + options(HIST_TIER, f.tier) + '</select></label></div>' +
      '<span class="sec-meta">' + rows.length + ' of ' + all.length + ' payments</span></div>' +
      (rows.length ? '<div class="table-wrap"><table class="table hist"><thead><tr><th scope="col">Payment</th><th scope="col">Value date</th><th scope="col">Tier</th><th scope="col">Status</th><th scope="col" class="num">Amount out</th><th scope="col">Maker, checker, approver</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<p class="empty">No payments match these filters.</p>') +
      '<p class="hint">Select a payment to open it on the work queue. Amount out is what left the bank for released payments and what would leave for the others.</p></section>';
  }

  /* ------------------------------------------------------------ desk header */

  function whoLine(role) {
    if (role === 'approver') return ico('user') + '<span><strong>Assigned approver</strong>, Citi, in-house. You act as whoever the maker assigned.</span>';
    var u = userOf(store.roleUserId(role));
    if (!u) return '';
    return ico('user') + '<span><strong>' + esc(u.name) + '</strong>, ' + esc(u.title) + ', ' + esc(u.employer) + (role === 'owner' ? '. Payments are read-only for you.' : '') + '</span>';
  }

  function deskTop(role) {
    var counts = {};
    st().payments.forEach(function (p) { var w = waitsFor(p); if (w) counts[w] = (counts[w] || 0) + 1; });
    var segs = ROLES.map(function (r) {
      var on = r.id === role;
      return '<button type="button" class="seg-btn' + (on ? ' is-on' : '') + '" data-action="role" data-role="' + r.id + '" aria-pressed="' + on + '">' + esc(r.label) +
        (counts[r.id] ? '<span class="seg-count">' + srOnly(', ') + counts[r.id] + srOnly(' waiting') + '</span>' : '') + '</button>';
    }).join('');
    return '<div class="desk-top"><div class="desk-title"><h1>Payment desk</h1><p class="lede">Each payment goes from maker to checker to approver. PCAP shows what it will really do and holds anything critical for Operational Risk.</p></div>' +
      '<div class="acting"><div class="acting-row"><span class="acting-label" id="acting-label">Acting as</span><div class="seg" role="group" aria-labelledby="acting-label">' + segs + '</div></div>' +
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
    /* A demo scenario loaded from the How to demo screen opens the new payment flow. */
    if (u.makerDraft && u.makerDraft.fresh) {
      delete u.makerDraft.fresh;
      if (role === 'maker') { u.deskFlow = { step: 1 }; u.deskView = 'queue'; }
    }
    if (role !== 'maker') u.deskFlow = null;
    var view = u.deskView === 'history' ? 'history' : 'queue';
    var html = deskTop(role) + viewTabs(view);
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
    startDwellTimer();
    if (focusAfter) {
      var t = el.querySelector(focusAfter);
      focusAfter = null;
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
  }

  function startDwellTimer() {
    var span = document.getElementById('dwell');
    if (!span) return;
    var id = span.getAttribute('data-id');
    var tick = function () {
      var s = document.getElementById('dwell');
      if (s && revealPerf[id]) s.textContent = Math.floor((performance.now() - revealPerf[id]) / 1000) + ' s';
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
    if (line) fillFromLine(d, line, ln);
  }

  function oprDecide(id, kind) {
    var reason = (document.getElementById('opr-reason') || {}).value || '';
    var secs = oprPerf[id] ? (performance.now() - oprPerf[id]) / 1000 : null;
    if (reason.trim().length < 15) {
      U.toast('Record a reason of at least 15 characters.', 'bad');
      var ta = document.getElementById('opr-reason');
      if (ta) ta.focus();
      return;
    }
    if (kind === 'release') {
      var cat = document.querySelector('input[name="opr-category"]:checked');
      if (!cat) { U.toast('Choose why you are releasing it: false alarm or business exception.', 'bad'); return; }
      if (!window.confirm('Release ' + id + '? ' + fullAmt(store.currentEval(store.payment(id)).consequence.externalTotal) + ' will leave the bank.')) return;
      store.opRiskRelease(id, store.roleUserId('oprisk'), cat.value, reason, secs);
      U.toast(id + ' released by Operational Risk. The reason is logged.', 'warn');
    } else {
      store.opRiskReject(id, store.roleUserId('oprisk'), reason, secs);
      U.toast(id + ' rejected and returned to the maker.', 'ok');
    }
    delete noteDrafts[id + ':opr-reason'];
    PCAP.app.render();
    scrollToDetail();
  }

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
    'new': function () {
      var u = ui();
      if (draft().editingId) u.makerDraft = blankDraft();
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
      var d = PRESETS[btn.getAttribute('data-preset')]();
      delete d.fresh;
      ui().makerDraft = d;
      ui().deskFlow = { step: 1 };
      store.save();
      PCAP.app.render();
    },
    'use-line': function (btn) {
      var form = document.getElementById('maker-form');
      var d = form ? readForm(form) : draft();
      var ln = store.loan(d.loanId);
      var line = ln && ln.schedule.filter(function (l) { return l.date === btn.getAttribute('data-date'); })[0];
      if (!line) return;
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
      u.makerDraft = blankDraft();
      u.deskFlow = null;
      u.deskSel = p.id;
      var t = p.atSubmit.tier;
      U.toast(p.id + (editing ? ' resubmitted' : ' submitted') + ' to the checker. PCAP put it at Tier ' + t + '.', t === 3 ? 'bad' : t === 2 ? 'warn' : 'ok');
      store.save();
      PCAP.app.render();
      scrollToDetail();
    },
    check: function (btn, id) {
      var note = (document.getElementById('checker-note') || {}).value || '';
      store.checkPayment(id, store.payment(id).checkerId, note.trim());
      delete noteDrafts[id + ':checker-note'];
      U.toast(id + ' checked and sent to the approver.', 'ok');
      PCAP.app.render();
      scrollToDetail();
    },
    'return-open': function (btn, id) {
      ui().deskReturn = id;
      focusAfter = '#return-reason';
      PCAP.app.render();
    },
    'return-cancel': function () {
      ui().deskReturn = null;
      PCAP.app.render();
    },
    'return': function (btn, id) {
      var stage = btn.getAttribute('data-stage');
      var p = store.payment(id);
      var reason = ((document.getElementById('return-reason') || {}).value || '').trim();
      if (!reason) { U.toast('Write a reason for the maker first.', 'bad'); return; }
      store.returnToMaker(id, stage === 'checker' ? p.checkerId : p.approverId, reason, stage);
      ui().deskReturn = null;
      delete noteDrafts[id + ':return-reason'];
      U.toast(id + ' returned to the maker.', 'warn');
      PCAP.app.render();
      scrollToDetail();
    },
    'return-gate': function (btn, id) {
      var p = store.payment(id);
      var ev = store.currentEval(p);
      var reason = 'M3 gate: ' + (ev.results['R-05'].status === 'fire' ? ev.results['R-05'].message : ev.results['R-06'].message) + ' Please reassign.';
      store.returnToMaker(id, p.approverId, reason, 'gate');
      U.toast(id + ' returned to the maker for reassignment.', 'warn');
      PCAP.app.render();
      scrollToDetail();
    },
    rekey: function (btn, id) {
      var input = document.getElementById('rekey-input');
      var amt = U.parseAmount(input ? input.value : '');
      if (isNaN(amt)) {
        U.toast('Type the amount as a number, for example 7,820,000 or 7.82m.', 'bad');
        if (input) input.focus();
        return;
      }
      var rk = store.approverRekey(id, amt);
      if (rk.status === 'retry') { U.toast('Your figure does not match. One more attempt.', 'warn'); focusAfter = '#rekey-input'; }
      else if (rk.status === 'pass') U.toast('Blind re-key matched.', 'ok');
      else U.toast('Second mismatch. ' + id + ' is now a Tier 3 hard stop.', 'bad');
      PCAP.app.render();
      if (rk.status !== 'retry') scrollToDetail();
    },
    approve: function (btn, id) {
      var ev = store.currentEval(store.payment(id));
      var box = document.getElementById('confirm-box');
      if (ev.tier === 2 && (!box || !box.checked)) { U.toast('Tick the Tier 2 confirmation first.', 'bad'); if (box) box.focus(); return; }
      var dwell = revealPerf[id] ? (performance.now() - revealPerf[id]) / 1000 : 0;
      store.approverApprove(id, { dwellSec: dwell, confirmed: !!(box && box.checked) });
      U.toast(id + ' released at Tier ' + ev.tier + '. ' + shortAmt(ev.consequence.externalTotal) + ' left the bank.', 'ok');
      PCAP.app.render();
      scrollToDetail();
    },
    escalate: function (btn, id) {
      var dwell = revealPerf[id] ? (performance.now() - revealPerf[id]) / 1000 : 0;
      var note = (document.getElementById('approver-note') || {}).value || '';
      store.approverEscalate(id, { dwellSec: dwell, note: note.trim() });
      delete noteDrafts[id + ':approver-note'];
      U.toast(id + ' held at Tier 3 and sent to Operational Risk.', 'bad');
      PCAP.app.render();
      scrollToDetail();
    },
    'opr-reject': function (btn, id) { oprDecide(id, 'reject'); },
    'opr-release': function (btn, id) { oprDecide(id, 'release'); },
    edit: function (btn, id) {
      var i = store.payment(id).instr;
      var known = st().ctx.register.some(function (r) { return r.id === i.overrideCode; });
      ui().makerDraft = {
        loanId: i.loanId, operation: i.operation, valueDate: i.valueDate, valueDateText: null, valueDateBad: false,
        interest: plain(i.interest), principal: plain(i.principal),
        overrideCode: !i.overrideCode ? '' : known ? i.overrideCode : '__other', overrideOther: known ? '' : i.overrideCode,
        fields: E.clone(i.fields), checkerId: i.checkerId, approverId: i.approverId, makerNote: i.makerNote || '', editingId: id, preset: null
      };
      ui().deskFlow = { step: 1 };
      store.save();
      PCAP.app.render();
      scrollToDetail();
    },
    cancel: function (btn, id) {
      if (!window.confirm('Cancel ' + id + '? It will not be sent.')) return;
      store.cancelPayment(id, store.roleUserId('maker'));
      U.toast(id + ' cancelled.', 'ok');
      PCAP.app.render();
    }
  };

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
    el.oninput = function (e) {
      var t = e.target;
      if (t.form && t.form.id === 'maker-form') { readForm(t.form); refreshFlowHints(); return; }
      var k = t.getAttribute && t.getAttribute('data-note');
      if (k) noteDrafts[k] = t.value;
    };
    el.onchange = function (e) {
      var t = e.target;
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

  views.desk = { render: render, PRESETS: PRESETS, parseDate: parseDate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
