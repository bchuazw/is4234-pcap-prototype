/*
 * PCAP prototype: application state, persistence and actions.
 *
 * Every control step writes an event tagged with module, rule and obligation,
 * which feeds M4, M5 and M6. State is kept in localStorage when it is available
 * (wrapped in try/catch) and in memory otherwise.
 * Classic script. Attaches to window.PCAP.store.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};
  var E = PCAP.engine;
  var U = PCAP.util;
  var DATA = PCAP.data;

  var VERSION = 5;
  var KEY = 'pcap-prototype-state';

  /* Browser storage only. Outside a browser (Node tests) state stays in memory. */
  var storage = (function () {
    if (typeof window === 'undefined') return null;
    try {
      var ls = root.localStorage;
      var k = '__pcap_probe__';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return ls;
    } catch (e) {
      return null;
    }
  })();

  var S = {
    state: null,
    storageOk: !!storage,
    fakeNow: null,
    fakeDate: null,
    seeding: false
  };

  /* ------------------------------------------------------------ clock */

  function now() { return S.fakeNow ? new Date(S.fakeNow.getTime()) : new Date(); }
  function nowISO() { return now().toISOString(); }
  function today() { return S.fakeDate || (S.state ? S.state.businessDate : U.localDate()); }
  function nowHHMM() { return U.localTime(now()); }
  function setClock(dateStr, hhmm) {
    var p = dateStr.split('-'), t = hhmm.split(':');
    S.fakeNow = new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0);
    S.fakeDate = dateStr;
  }
  function setClockDate(d, dateStr) { S.fakeNow = new Date(d.getTime()); S.fakeDate = dateStr; }
  function clearClock() { S.fakeNow = null; S.fakeDate = null; }

  /* ------------------------------------------------------------ persistence */

  function save() {
    if (!storage || !S.state) return false;
    try {
      storage.setItem(KEY, JSON.stringify(S.state));
      S.storageOk = true;
      return true;
    } catch (e) {
      S.storageOk = false;
      return false;
    }
  }
  function loadSaved() {
    if (!storage) return null;
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || st.version !== VERSION) return null;
      return st;
    } catch (e) {
      return null;
    }
  }
  function clearSaved() {
    if (!storage) return;
    try { storage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ lookups */

  function st() { return S.state; }
  function user(id) { return E.byId(S.state.ctx.users, id); }
  function userName(id) {
    if (id === 'PCAP') return 'PCAP (system)';
    var u = user(id);
    return u ? u.name : (id || '');
  }
  function loan(id) { return E.byId(S.state.ctx.loans, id); }
  function payment(id) { return E.byId(S.state.payments, id); }
  function roleDef(id) { return E.byId(DATA.roles, id); }
  function roleUserId(role) {
    var r = roleDef(role || S.state.role);
    return r ? r.userId : null;
  }
  function ctx() {
    return { businessDate: today(), loans: S.state.ctx.loans, users: S.state.ctx.users, register: S.state.ctx.register };
  }

  function nextPayId() {
    S.state.seq.pay += 1;
    return 'PAY-' + ('0000' + S.state.seq.pay).slice(-4);
  }

  /* ------------------------------------------------------------ events */

  function roleOf(actorId) {
    if (actorId === 'PCAP') return 'system';
    var u = user(actorId);
    if (!u) return '';
    return (u.roles || [])[0] || '';
  }

  function logEvent(e) {
    S.state.seq.ev += 1;
    var ev = {
      id: 'EV-' + ('00000' + S.state.seq.ev).slice(-5),
      ts: nowISO(),
      businessDate: today(),
      type: e.type,
      paymentId: e.paymentId || null,
      module: e.module || null,
      rule: e.rule || null,
      obligations: e.obligations || (e.rule && E.RULES[e.rule] ? E.RULES[e.rule].obligations.slice() : []),
      result: e.result || 'info',
      actorId: e.actorId || 'PCAP',
      actorRole: roleOf(e.actorId || 'PCAP'),
      /* Names such as "Dana F." end in a full stop, so collapse any doubled stop. */
      detail: String(e.detail || '').replace(/\.\.(?=\s|$)/g, '.'),
      data: e.data || null,
      seeded: !!S.seeding
    };
    S.state.events.push(ev);
    if (S.state.events.length > 6000) S.state.events.splice(0, S.state.events.length - 6000);
    return ev;
  }

  /* ------------------------------------------------------------ evaluation */

  function evaluateInstr(instr) { return E.evaluate(instr, ctx()); }

  /* The approver's blind re-key attempts: amounts plus what the approver said the payment is. */
  function rekeyAttempts(a) {
    if (!a) return [];
    return a.attempts.map(function (amt, i) { return { amount: amt, nature: (a.natures || [])[i] || null }; });
  }

  /* Fresh evaluation of a stored payment, with the approver's re-key applied. */
  function currentEval(p) {
    var ev = evaluateInstr(p.instr);
    if (p.approval && p.approval.version === p.version && p.approval.attempts.length) {
      ev = E.withRekey(ev, E.rekeyResult(ev, rekeyAttempts(p.approval)));
    }
    return ev;
  }

  function snapEval(ev) {
    return {
      tier: ev.tier, hits: ev.hits.slice(), gateOpen: ev.gate.open, gateFailures: ev.gate.failures.slice(),
      statement: ev.statement.slice(), external: ev.consequence.externalTotal, externalPrincipal: ev.consequence.externalPrincipal,
      internalPrincipal: ev.consequence.internalPrincipal, expected: ev.expected.remainingTotal, overrideUsed: ev.override.used,
      overrideValid: ev.override.valid, overrideCode: ev.override.code, tierReasons: ev.tierReasons.slice()
    };
  }

  /* ------------------------------------------------------------ payment actions */

  function submitInstruction(instr, actorId, editingId) {
    var ev = evaluateInstr(instr);
    var p;
    var clean = E.clone(instr);
    if (editingId) {
      p = payment(editingId);
      if (!p) throw new Error('Payment ' + editingId + ' not found.');
      p.version += 1;
      p.instr = clean;
      p.approval = null;
      p.checkerNote = '';
      p.returnReason = null;
    } else {
      p = { id: nextPayId(), createdAt: nowISO(), createdDate: today(), version: 1, instr: clean };
      S.state.payments.unshift(p);
    }
    p.status = 'SUBMITTED';
    p.loanId = instr.loanId;
    p.makerId = instr.makerId;
    p.checkerId = instr.checkerId;
    p.approverId = instr.approverId;
    p.submittedAt = nowISO();
    p.atSubmit = snapEval(ev);
    p.overrideUsed = ev.override.used;
    p.overrideValid = ev.override.valid;

    logEvent({
      type: editingId ? 'RESUBMITTED' : 'SUBMITTED', paymentId: p.id, module: 'M2', obligations: ['O2'], actorId: actorId,
      result: ev.tier === 3 ? 'fire' : 'info',
      detail: (editingId ? 'Resubmitted' : 'Submitted') + ' to the checker. PCAP pre-check: Tier ' + ev.tier + '. ' + ev.statement[0],
      data: { tier: ev.tier, hits: ev.hits, external: ev.consequence.externalTotal, expected: ev.expected.remainingTotal }
    });
    E.RULE_ORDER.forEach(function (k) {
      if (k === 'R-07') return;
      var r = ev.results[k];
      if (!r || r.status === 'na') return;
      logEvent({
        type: (k === 'R-05' || k === 'R-06') && r.status === 'fire' ? 'BLOCKED_ATTEMPT' : 'RULE_RESULT',
        paymentId: p.id, module: E.RULES[k].module, rule: k, result: r.status, actorId: 'PCAP', detail: r.message
      });
    });
    if (ev.override.used) {
      logEvent({
        type: 'OVERRIDE_USE', paymentId: p.id, module: 'M1', obligations: ['O4'], actorId: 'PCAP', result: ev.override.valid ? 'pass' : 'fire',
        detail: 'Override usage mined: ' + (ev.override.code || 'undeclared') + (ev.override.valid ? ' mapped to an active register entry.' : ' not mapped to an active register entry.'),
        data: { code: ev.override.code, mapped: ev.override.valid }
      });
    }
    save();
    return p;
  }

  function checkPayment(id, actorId, note) {
    var p = payment(id);
    if (!p || p.status !== 'SUBMITTED') throw new Error('Payment is not waiting for a checker.');
    p.status = 'CHECKED';
    p.checkedAt = nowISO();
    p.checkerNote = note || '';
    logEvent({
      type: 'CHECKED', paymentId: id, module: 'M3', obligations: ['O2', 'O5'], actorId: actorId, result: 'info',
      detail: 'Checked by ' + userName(actorId) + '. Approval chain: maker ' + userName(p.makerId) + ' (' + (user(p.makerId) || {}).employer + '), checker ' + userName(p.checkerId) + ' (' + (user(p.checkerId) || {}).employer + '), approver ' + userName(p.approverId) + ' (' + (user(p.approverId) || {}).employer + ').',
      data: { makerEmployer: (user(p.makerId) || {}).employer, checkerEmployer: (user(p.checkerId) || {}).employer, approverEmployer: (user(p.approverId) || {}).employer }
    });
    save();
    return p;
  }

  function returnToMaker(id, actorId, reason, stage) {
    var p = payment(id);
    if (!p) throw new Error('Payment not found.');
    p.status = 'RETURNED';
    p.returnedAt = nowISO();
    p.returnReason = reason || '';
    p.returnedBy = actorId;
    p.returnStage = stage || '';
    logEvent({
      type: 'RETURNED', paymentId: id, module: stage === 'gate' ? 'M3' : 'M2', obligations: stage === 'gate' ? ['O1', 'O5'] : ['O2'],
      actorId: actorId, result: 'info', detail: 'Returned to the maker by ' + userName(actorId) + (reason ? '. Reason: ' + reason : '.'),
      data: { stage: stage || '' }
    });
    save();
    return p;
  }

  function cancelPayment(id, actorId) {
    var p = payment(id);
    if (!p) return null;
    p.status = 'CANCELLED';
    logEvent({ type: 'CANCELLED', paymentId: id, module: 'M2', obligations: [], actorId: actorId, detail: 'Cancelled by ' + userName(actorId) + '.' });
    save();
    return p;
  }

  /* Approver opens the payment: M3 gate is checked for the assigned approver and logged once per version. */
  function approverOpen(id) {
    var p = payment(id);
    var ev = evaluateInstr(p.instr);
    if (!p.approval || p.approval.version !== p.version) {
      p.approval = { version: p.version, openedAt: nowISO(), attempts: [], natures: [], rekey: null, rekeyKind: null, revealedAt: null, gateOpen: ev.gate.open };
      ['R-05', 'R-06'].forEach(function (k) {
        var r = ev.results[k];
        logEvent({
          type: r.status === 'fire' ? 'BLOCKED_ATTEMPT' : 'GATE_CHECK', paymentId: id, module: 'M3', rule: k, result: r.status,
          actorId: p.approverId, detail: (r.status === 'fire' ? 'Approval blocked at the M3 gate. ' : 'M3 gate open. ') + r.message
        });
      });
      save();
    }
    return currentEval(p);
  }

  /* nature: what the approver says the payment is (INTEREST, PRINCIPAL_AND_INTEREST or PRINCIPAL), from their own source. */
  function approverRekey(id, amount, nature) {
    var p = payment(id);
    var ev = evaluateInstr(p.instr);
    p.approval.natures = p.approval.natures || [];
    while (p.approval.natures.length < p.approval.attempts.length) p.approval.natures.push(null);
    p.approval.attempts.push(amount);
    p.approval.natures.push(nature || null);
    var rk = E.rekeyResult(ev, rekeyAttempts(p.approval));
    p.approval.rekey = rk.status;
    p.approval.rekeyKind = E.rekeyKind(rk);
    var said = E.fmtUSD(amount) + (nature ? ', ' + E.natureLabel(nature).toLowerCase() : '');
    var last = rk.checks[rk.checks.length - 1];
    var detail;
    if (rk.status === 'retry') detail = 'Blind re-key attempt 1 (' + said + ') did not match ' + (last.amountMatch ? 'the payment type' : last.natureMatch ? 'the computed amount' : 'the computed amount or payment type') + '. Approver asked to re-check.';
    else if (rk.status === 'pass') detail = 'Blind re-key (' + said + ') matched what PCAP computed' + (rk.firstMatch ? ' on the first attempt.' : ' on the second attempt (first attempt logged as a slip).');
    else detail = rk.message;
    logEvent({
      type: 'REKEY', paymentId: id, module: 'M2', rule: 'R-07', result: rk.status === 'retry' ? 'retry' : rk.status,
      actorId: p.approverId, detail: detail,
      data: { attempt: p.approval.attempts.length, amount: amount, nature: nature || null, computed: ev.consequence.externalTotal, computedNature: rk.computedNature, kind: p.approval.rekeyKind }
    });
    if (rk.status === 'fire') {
      logEvent({ type: 'ESCALATED', paymentId: id, module: 'M2', rule: 'R-07', result: 'fire', actorId: 'PCAP', detail: 'Second re-key mismatch. Payment escalated to Tier 3.' });
    }
    save();
    return rk;
  }

  function approverReveal(id) {
    var p = payment(id);
    if (!p.approval || p.approval.revealedAt) return;
    p.approval.revealedAt = nowISO();
    var ev = currentEval(p);
    logEvent({
      type: 'STATEMENT_SHOWN', paymentId: id, module: 'M2', obligations: ['O2'], actorId: p.approverId, result: 'info',
      detail: 'Consequence statement shown to the approver at Tier ' + ev.tier + ': ' + ev.statement[0],
      data: { tier: ev.tier, external: ev.consequence.externalTotal, principalOut: ev.consequence.externalPrincipal }
    });
    save();
  }

  function addM4Sample(p, ev, decision, dwellSec) {
    var ap = user(p.approverId);
    var team = ap ? ap.team : 'unknown';
    var kind = p.approval ? p.approval.rekeyKind : null;
    var flags = [];
    if (ev.tier >= 2 && dwellSec < E.DEFAULT_CONFIG.fastLookSec) flags.push('fast look');
    if (ev.tier === 2 && decision === 'approve' && dwellSec < E.DEFAULT_CONFIG.fastApproveSec) flags.push('approved within 5 s of the Tier 2 warning');
    S.state.m4.current.push({
      ts: nowISO(), team: team, approverId: p.approverId, paymentId: p.id, tier: ev.tier,
      initialTier: p.atSubmit ? p.atSubmit.tier : ev.tier,
      dwellSec: Math.round(dwellSec * 10) / 10, rekey: kind, decision: decision, live: !S.seeding
    });
    logEvent({
      type: 'BEHAVIOUR_SIGNAL', paymentId: p.id, module: 'M4', rule: 'R-08', actorId: 'PCAP', result: 'info',
      detail: 'Approval behaviour captured for ' + team + ' (reported at team level): ' + U.fmtSec(dwellSec) + ' on the consequence screen at Tier ' + ev.tier + (kind ? ', blind re-key ' + kind : '') + (flags.length ? ', ' + flags.join(' and ') : '') + '.',
      data: { team: team, tier: ev.tier, dwellSec: Math.round(dwellSec * 10) / 10, rekey: kind, decision: decision, flags: flags }
    });
  }

  function doRelease(p, ev, actorId, viaOpRisk) {
    var expected = ev.expected.remainingTotal;
    E.applyRelease(loan(p.instr.loanId), p.instr.valueDate, ev.consequence);
    var ap = user(p.approverId);
    var certCurrent = true;
    if (ev.override.used && ev.override.valid && ap) {
      var type = (E.byId(S.state.ctx.register, ev.override.entryId) || {}).certType || ev.override.entryId;
      var c = (ap.certs || []).filter(function (x) { return x.type === type; })[0];
      certCurrent = !!(c && c.validUntil >= today());
    }
    p.status = 'RELEASED';
    p.releasedAt = nowISO();
    p.releasedDate = today();
    p.releasedTime = nowHHMM();
    p.releasedBy = actorId;
    p.releasedExternal = ev.consequence.externalTotal;
    p.releasedPrincipal = ev.consequence.externalPrincipal;
    p.expectedAtRelease = expected;
    p.releasedTier = ev.tier;
    p.releasedHits = ev.hits.slice();
    p.viaOpRisk = !!viaOpRisk;
    p.overrideValidAtRelease = ev.override.valid;
    p.overrideUsedAtRelease = ev.override.used;
    p.certCurrentAtRelease = certCurrent;
    p.atRelease = snapEval(ev);
  }

  function approverApprove(id, info) {
    var p = payment(id);
    var ev = currentEval(p);
    if (!ev.gate.open) throw new Error('The M3 gate is closed for this approver.');
    if (ev.tier === 3) throw new Error('Tier 3 hard stop. Only Operational Risk can release this payment.');
    if (ev.tier === 2 && (!p.approval || p.approval.rekey !== 'pass')) throw new Error('Tier 2 needs a matching blind re-key first.');
    if (ev.tier === 2 && !info.confirmed) throw new Error('Tick the confirmation first.');
    var dwell = Math.max(0, +info.dwellSec || 0);
    doRelease(p, ev, p.approverId, false);
    p.approval.decision = 'approve';
    p.approval.decidedAt = nowISO();
    p.approval.dwellSec = dwell;
    var fast = ev.tier === 2 && dwell < E.DEFAULT_CONFIG.fastApproveSec;
    logEvent({
      type: 'RELEASED', paymentId: id, module: 'M2', obligations: ['O2'], actorId: p.approverId, result: 'pass',
      detail: 'Approved and released at Tier ' + ev.tier + ' after ' + U.fmtSec(dwell) + ' on the consequence screen' + (ev.tier === 2 ? ', with explicit confirmation' : '') + '. ' + E.fmtUSD(ev.consequence.externalTotal) + ' left the bank.',
      data: { tier: ev.tier, dwellSec: dwell, rekey: p.approval.rekeyKind, fastAfterWarning: fast, external: ev.consequence.externalTotal, expected: ev.expected.remainingTotal }
    });
    addM4Sample(p, ev, 'approve', dwell);
    save();
    return p;
  }

  function approverEscalate(id, info) {
    var p = payment(id);
    var ev = currentEval(p);
    if (ev.tier !== 3) throw new Error('Only Tier 3 payments go to Operational Risk.');
    if (!ev.gate.open) throw new Error('The M3 gate is closed. Return the payment to the maker for reassignment first.');
    var dwell = Math.max(0, +info.dwellSec || 0);
    p.status = 'HELD';
    p.heldAt = nowISO();
    p.heldDate = today();
    p.holdReasons = ev.tierReasons.slice();
    p.atHold = snapEval(ev);
    p.approval.decision = 'escalate';
    p.approval.decidedAt = nowISO();
    p.approval.dwellSec = dwell;
    p.approval.note = info.note || '';
    logEvent({
      type: 'HELD', paymentId: id, module: 'M2', obligations: ['O2'], actorId: p.approverId, result: 'fire',
      rule: ev.hits.indexOf('R-01') >= 0 ? 'R-01' : ev.hits[0] || null,
      detail: 'Tier 3 hard stop. Sent to Operational Risk by ' + userName(p.approverId) + ' after ' + U.fmtSec(dwell) + ' on the consequence screen. Rules: ' + ev.hits.join(', ') + '.' + (info.note ? ' Approver note: ' + info.note : ''),
      data: { tier: 3, hits: ev.hits, dwellSec: dwell, external: ev.consequence.externalTotal, expected: ev.expected.remainingTotal }
    });
    addM4Sample(p, ev, 'escalate', dwell);
    save();
    return p;
  }

  /* Releasing a Tier 3 hold is a documented risk acceptance (L5 slide 41): the first-line owner (Head of Loan Ops by
     default) owns the risk, Operational Risk challenges and records it, and Internal Audit reviews it. */
  function opRiskRelease(id, actorId, category, reason, decideSec, opts) {
    opts = opts || {};
    var p = payment(id);
    if (!p || p.status !== 'HELD') throw new Error('Payment is not on hold.');
    if (!reason || reason.trim().length < 15) throw new Error('Record a reason of at least 15 characters.');
    var ev = currentEval(p);
    var acc = E.riskAcceptance({
      paymentId: id, ev: ev, category: category, reason: reason, ownerId: opts.ownerId || 'U-HLO', recordedById: actorId,
      users: S.state.ctx.users, businessDate: today(), makerId: p.makerId, checkerId: p.checkerId, approverId: p.approverId
    });
    if (!acc.ok) throw new Error(acc.problems.join(' '));
    S.state.seq.ra = (S.state.seq.ra || 0) + 1;
    var rec = acc.record;
    rec.id = 'RA-' + ('000' + S.state.seq.ra).slice(-4);
    rec.at = nowISO();
    var minutes = Math.round((now() - new Date(p.heldAt)) / 6000) / 10;
    logEvent({
      type: 'RISK_ACCEPTED', paymentId: id, module: 'M2', obligations: ['O1', 'O2'], actorId: actorId, result: 'info',
      detail: 'Risk acceptance ' + rec.id + ' recorded by ' + userName(actorId) + ' (Operational Risk, second line). Risk owner: ' + userName(rec.ownerId) + ' (first line). ' + category + '. Reason: ' + rec.reason + ' Assessed by PCAP at Tier ' + ev.tier + (ev.hits.length ? ' (' + ev.hits.join(', ') + ')' : '') + '. Scope: this payment only. Expires ' + E.fmtDate(rec.expires) + '. Follow-up: ' + rec.followUp + '.',
      data: { acceptance: rec.id, ownerId: rec.ownerId, category: category, expires: rec.expires, assessed: rec.assessed }
    });
    doRelease(p, ev, actorId, true);
    p.opRisk = { decision: 'release', category: category, reason: rec.reason, at: nowISO(), by: actorId, minutesHeld: minutes, decideSec: decideSec || null, acceptance: rec };
    logEvent({
      type: 'OPRISK_RELEASED', paymentId: id, module: 'M2', obligations: ['O2'], actorId: actorId, result: 'info',
      detail: 'Released by Operational Risk under risk acceptance ' + rec.id + ' (' + category + ') after ' + minutes + ' min on hold. Reason: ' + rec.reason + ' ' + E.fmtUSD(ev.consequence.externalTotal) + ' left the bank.',
      data: { category: category, acceptance: rec.id, minutesHeld: minutes, external: ev.consequence.externalTotal, expected: ev.expected.remainingTotal, hits: ev.hits }
    });
    save();
    return p;
  }

  /* Every Tier 3 release with its risk acceptance, newest first, for the Board and Internal Audit. */
  function riskAcceptances() {
    return S.state.payments.filter(function (p) { return p.opRisk && p.opRisk.acceptance; })
      .map(function (p) { return { payment: p, acceptance: p.opRisk.acceptance }; })
      .sort(function (a, b) { return a.acceptance.at < b.acceptance.at ? 1 : -1; });
  }

  function opRiskReject(id, actorId, reason, decideSec) {
    var p = payment(id);
    if (!p || p.status !== 'HELD') throw new Error('Payment is not on hold.');
    if (!reason || reason.trim().length < 15) throw new Error('Record a reason of at least 15 characters.');
    var minutes = Math.round((now() - new Date(p.heldAt)) / 6000) / 10;
    p.opRisk = { decision: 'reject', category: 'Confirmed error', reason: reason.trim(), at: nowISO(), by: actorId, minutesHeld: minutes, decideSec: decideSec || null };
    p.status = 'RETURNED';
    p.returnedAt = nowISO();
    p.returnReason = 'Operational Risk: ' + reason.trim();
    p.returnedBy = actorId;
    p.returnStage = 'oprisk';
    logEvent({
      type: 'OPRISK_REJECTED', paymentId: id, module: 'M2', obligations: ['O2'], actorId: actorId, result: 'pass',
      detail: 'Hold confirmed as a real error and returned to the maker after ' + minutes + ' min. Reason: ' + reason.trim(),
      data: { minutesHeld: minutes }
    });
    save();
    return p;
  }

  /* ------------------------------------------------------------ M1 register actions */

  function nextWaId() {
    var max = 0;
    S.state.ctx.register.forEach(function (r) { var m = /^WA-(\d+)$/.exec(r.id); if (m) max = Math.max(max, +m[1]); });
    return 'WA-' + ('0' + (max + 1)).slice(-2);
  }

  function addWorkaround(entry, actorId) {
    var isOwner = roleOf(actorId) === 'owner';
    var e = {
      id: nextWaId(), title: entry.title, constraint: entry.constraint || '', workaround: entry.workaround || '',
      requiredFields: entry.requiredFields || [], requiredValue: entry.requiredValue || 'WASH', appliesTo: entry.appliesTo || [],
      certType: null, ownerId: entry.ownerId || 'U-HLO', inUseSince: today(), lastReview: today(),
      nextReview: E.addDays(today(), +entry.reviewDays || 180), dispensationUntil: entry.dispensationUntil || E.addDays(today(), 365),
      retiredOn: null, refreshPlan: entry.refreshPlan || '', status: isOwner ? 'Active' : 'Proposed', onDesk: (entry.appliesTo || []).length > 0,
      addedBy: actorId
    };
    e.certType = e.id;
    S.state.ctx.register.push(e);
    logEvent({
      type: 'REGISTER_ADDED', module: 'M1', obligations: ['O4', 'O6'], actorId: actorId, result: 'info',
      detail: e.id + ' "' + e.title + '" added by ' + userName(actorId) + ' as ' + e.status + '. Owner ' + userName(e.ownerId) + '. Dispensation until ' + E.fmtDate(e.dispensationUntil) + '.',
      data: { entry: e.id }
    });
    save();
    return e;
  }

  function reviewWorkaround(id, actorId) {
    var e = E.byId(S.state.ctx.register, id);
    e.lastReview = today();
    e.nextReview = E.addDays(today(), 180);
    logEvent({
      type: 'REGISTER_REVIEWED', module: 'M1', obligations: ['O4', 'O5'], actorId: actorId, result: 'pass',
      detail: 'Owner attestation: ' + id + ' reviewed by ' + userName(actorId) + '. Next review ' + E.fmtDate(e.nextReview) + '.', data: { entry: id }
    });
    save();
    return e;
  }

  function approveWorkaround(id, actorId) {
    var e = E.byId(S.state.ctx.register, id);
    e.status = 'Active';
    logEvent({ type: 'REGISTER_APPROVED', module: 'M1', obligations: ['O4', 'O5'], actorId: actorId, result: 'pass', detail: id + ' approved by its owner ' + userName(actorId) + ' and now active.', data: { entry: id } });
    save();
    return e;
  }

  function retireWorkaround(id, actorId) {
    var e = E.byId(S.state.ctx.register, id);
    e.status = 'Retired';
    e.retiredOn = today();
    logEvent({ type: 'REGISTER_RETIRED', module: 'M1', obligations: ['O4', 'O6'], actorId: actorId, result: 'info', detail: id + ' retired by ' + userName(actorId) + '. Any further use is blocked by R-03.', data: { entry: id } });
    save();
    return e;
  }

  /* ------------------------------------------------------------ M5 actions */

  function healthPayments() {
    return S.state.payments.map(function (p) {
      return {
        id: p.id, loanId: p.loanId, status: p.status, releasedDate: p.releasedDate, releasedTime: p.releasedTime,
        releasedExternal: p.releasedExternal, expectedAtRelease: p.expectedAtRelease, heldDate: p.heldDate,
        makerId: p.makerId, checkerId: p.checkerId, approverId: p.approverId, releasedBy: p.releasedBy
      };
    });
  }

  function healthInput() {
    return {
      businessDate: today(), nowTime: nowHHMM(), register: S.state.ctx.register, users: S.state.ctx.users,
      payments: healthPayments(), reconRuns: S.state.reconRuns, regressionRuns: S.state.regressionRuns,
      approvals: S.state.payments.filter(function (p) { return p.status === 'RELEASED' && p.overrideUsedAtRelease && !p.viaOpRisk; })
        .map(function (p) { return { override: true, certCurrent: p.certCurrentAtRelease !== false }; })
    };
  }

  function controlHealth() { return E.controlHealth(healthInput()); }

  /* Internal Audit (third line) reviews controls but does not run them, or it would be auditing its own work. */
  function assertNotAudit(actorId) {
    if (roleOf(actorId) === 'audit') throw new Error('Internal Audit (third line) reviews controls but does not run them.');
  }

  function runReconciliation(actorId) {
    assertNotAudit(actorId);
    var pays = healthPayments();
    var rec = E.reconcile(pays, today());
    var independent = !E.involvedIn(pays, actorId, today());
    var run = { date: today(), time: nowHHMM(), at: nowISO(), by: actorId, independent: independent, breaks: rec.breaks, breakTotal: rec.breakTotal, rows: rec.rows.length, detail: rec.rows };
    S.state.reconRuns.push(run);
    var escapes = rec.rows.filter(function (r) {
      if (!r.isBreak) return false;
      var p = payment(r.id);
      return p && (!p.releasedHits || !p.releasedHits.length) && !p.viaOpRisk;
    });
    logEvent({
      type: 'RECON_RUN', module: 'M5', rule: 'R-09', obligations: ['O7', 'O2'], actorId: actorId,
      result: (!independent || rec.breaks) ? 'fire' : 'pass',
      detail: 'Same-day reconciliation by ' + userName(actorId) + (independent ? ' (independent of the payments)' : ' (NOT independent: involved in a payment today)') + ': ' + rec.rows.length + ' released payment' + (rec.rows.length === 1 ? '' : 's') + ', ' + rec.breaks + ' break' + (rec.breaks === 1 ? '' : 's') + (rec.breaks ? ' totalling ' + E.fmtUSD(rec.breakTotal) : '') + '.',
      data: { rows: rec.rows.length, breaks: rec.breaks, breakTotal: rec.breakTotal, independent: independent, escapes: escapes.map(function (r) { return r.id; }) }
    });
    save();
    return run;
  }

  function freshReplayContext() {
    var c = { businessDate: today(), loans: E.clone(S.state.ctx.loans), users: S.state.ctx.users, register: S.state.ctx.register };
    c.loans = c.loans.filter(function (l) { return l.id !== E.REPLAY.loan.id; });
    c.loans.push(E.clone(E.REPLAY.loan));
    return c;
  }

  function runRegressionTest(actorId) {
    assertNotAudit(actorId);
    var r = E.replayCheck(freshReplayContext(), { makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' });
    var run = { date: today(), at: nowISO(), by: actorId, pass: r.pass, detail: r.detail, tier: r.tier, hits: r.hits };
    S.state.regressionRuns.push(run);
    logEvent({
      type: 'CONTROL_TEST', module: 'M5', rule: 'R-09', obligations: ['O7'], actorId: actorId, result: r.pass ? 'pass' : 'fire',
      detail: 'Revlon replay regression test ' + (r.pass ? 'passed' : 'FAILED') + ': ' + r.detail + '. Rules fired: ' + r.hits.join(', ') + '.',
      data: { pass: r.pass, tier: r.tier, hits: r.hits }
    });
    save();
    return run;
  }

  /* ------------------------------------------------------------ M4, M6, synthetic test */

  function logIndividualView(actorId, reason) {
    logEvent({ type: 'M4_INDIVIDUAL_VIEW', module: 'M4', rule: 'R-08', obligations: ['O5'], actorId: actorId, result: 'info',
      detail: 'Individual view of Tier 2 and 3 approvals opened by ' + userName(actorId) + '. Reason: ' + reason });
    save();
  }

  function logExport(actorId, counts) {
    logEvent({ type: 'EVIDENCE_EXPORTED', module: 'M6', obligations: [], actorId: actorId, result: 'info',
      detail: 'Evidence pack exported by ' + userName(actorId) + ': ' + counts.events + ' tagged events.', data: counts });
    save();
  }

  function recordSyntheticRun(result, actorId) {
    var s = result.summary;
    S.state.synthetic = { at: nowISO(), seed: s.seed, n: s.n, fingerprint: result.fingerprint, summary: s, replayPass: result.replay.pass };
    logEvent({
      type: 'SYNTHETIC_TEST', module: 'M5', obligations: ['O7'], actorId: actorId, result: result.replay.pass ? 'pass' : 'fire',
      detail: 'Synthetic test (seed ' + s.seed + ', ' + s.n + ' payments, ' + s.errorCount + ' injected errors): ' + s.detection.stoppedBeforeRelease + ' of ' + s.errorCount + ' stopped before release, ' + s.detection.foundAfterRelease + ' found same day by M5, ' + s.falseAlarms.count + ' false alarms. Replay ' + (result.replay.pass ? 'passed' : 'failed') + '. Fingerprint ' + result.fingerprint + '.',
      data: { seed: s.seed, fingerprint: result.fingerprint }
    });
    save();
  }

  /* ------------------------------------------------------------ seeding */

  function mondayOf(dateStr) {
    var p = dateStr.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dow = (d.getUTCDay() + 6) % 7;
    return E.addDays(dateStr, -dow);
  }

  /* Synthetic M4 history: 7 past weeks of team aggregates plus this week's samples. */
  function seedM4(bd) {
    var rng = E.createRng('pcap-m4-history');
    var teams = DATA.approverTeams;
    var members = { 'Citi Approvers DE': ['U-AP1', 'U-AP3', 'U-AP5'], 'Citi Approvers NY': ['U-AP2', 'U-AP6', 'U-AP7'], 'Citi Approvers TPA': ['U-AP4', 'U-AP8', 'U-AP9'] };
    var monday = mondayOf(bd);
    var weeks = [], current = [];
    for (var w = -7; w <= 0; w++) {
      var start = E.addDays(monday, 7 * w);
      teams.forEach(function (team) {
        /* Share of rubber-stamp reviews: Team TPA drifts from careful to rubber-stamping over 8 weeks. */
        var drift = [0.04, 0.08, 0.14, 0.22, 0.32, 0.45, 0.58, 0.70];
        var rubber = team === 'Citi Approvers TPA' ? drift[w + 7] : team === 'Citi Approvers NY' ? 0.05 : 0.03;
        var n = rng.int(70, 90);
        var samples = [];
        for (var i = 0; i < n; i++) {
          var r = rng.next();
          var tier = r < 0.55 ? 1 : r < 0.92 ? 2 : 3;
          var isRubber = rng.chance(rubber);
          var dwell = isRubber ? rng.float(1, 6) : tier === 1 ? rng.float(5, 15) : rng.float(10, 34);
          var rekey = null;
          if (tier >= 2) {
            var x = rng.next();
            rekey = tier === 3 && x < 0.55 ? 'catch' : x < (isRubber ? 0.14 : 0.03) ? 'slip' : 'match';
          }
          samples.push({
            ts: null, week: start, team: team, approverId: rng.pick(members[team]), paymentId: null, tier: tier, initialTier: tier,
            dwellSec: Math.round(dwell * 10) / 10, rekey: rekey, decision: tier === 3 ? 'escalate' : 'approve', live: false
          });
        }
        if (w < 0) {
          var s = E.summariseReviews(samples);
          weeks.push({ week: start, team: team, n: s.n, nTier23: s.nTier23, score: s.score, rag: s.rag, fastLookShare: s.fastLookShare, mismatchRate: s.mismatchRate, catchRate: s.catchRate, fastApproveShare: s.fastApproveShare, medianDwellTier23Sec: s.medianDwellTier23Sec });
        } else {
          current = current.concat(samples);
        }
      });
    }
    return { weekStart: monday, weeks: weeks, current: current };
  }

  /* Synthetic weekly KRI history for the Board view (7 past weeks). */
  function seedKri() {
    return {
      tier3Holds: [3, 2, 4, 1, 3, 2, 5],
      holdsRealShare: [0.67, 0.5, 0.75, 1, 0.67, 0.5, 0.8],
      unregisteredReleases: [0, 0, 0, 0, 0, 0, 0],
      escapes: [0, 0, 1, 0, 0, 0, 0],
      lateRecons: [0, 0, 1, 0, 0, 0, 0],
      lapsedCerts: [0, 0, 0, 0, 1, 1, 1],
      overdueReviews: [0, 0, 0, 0, 0, 1, 1],
      legacyAttention: [0, 0, 0, 1, 1, 1, 2]
    };
  }

  /* Times spread over the last few hours of the business day, never in the future. */
  function todaySlots(k) {
    var real = new Date();
    var midnight = new Date(real.getFullYear(), real.getMonth(), real.getDate(), 0, 5, 0);
    var end = new Date(real.getTime() - 8 * 60000);
    var start = new Date(Math.max(midnight.getTime(), real.getTime() - 200 * 60000));
    if (end <= start) end = new Date(start.getTime() + 60000 * k);
    var out = [];
    for (var i = 0; i < k; i++) out.push(new Date(start.getTime() + (end - start) * (i / Math.max(1, k - 1))));
    return out;
  }

  function seedFlows() {
    var bd = S.state.businessDate;
    var y = E.addDays(bd, -1);
    var base = { FRONT: E.LENDERS, FUND: E.LENDERS, PRINCIPAL: E.LENDERS };
    var wash = { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH };

    /* Older evidence: register reviews and the last regression test. */
    setClock(E.addDays(bd, -96), '10:15');
    logEvent({ type: 'REGISTER_REVIEWED', module: 'M1', obligations: ['O4', 'O5'], actorId: 'U-HLO', result: 'pass', detail: 'Owner attestation: WA-01 reviewed by Dana F. Next review ' + E.fmtDate(E.addDays(bd, 88)) + '.', data: { entry: 'WA-01' } });
    setClock(E.addDays(bd, -40), '16:20');
    logEvent({ type: 'REGISTER_REVIEWED', module: 'M1', obligations: ['O4', 'O5'], actorId: 'U-HLO', result: 'pass', detail: 'Owner attestation: WA-03 reviewed by Dana F. Next review ' + E.fmtDate(E.addDays(bd, 50)) + '.', data: { entry: 'WA-03' } });
    setClock(E.addDays(bd, -12), '09:30');
    var rr = E.replayCheck(freshReplayContext(), { makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' });
    S.state.regressionRuns.push({ date: E.addDays(bd, -12), at: nowISO(), by: 'U-TEC', pass: rr.pass, detail: rr.detail, tier: rr.tier, hits: rr.hits });
    logEvent({ type: 'CONTROL_TEST', module: 'M5', rule: 'R-09', obligations: ['O7'], actorId: 'U-TEC', result: rr.pass ? 'pass' : 'fire', detail: 'Revlon replay regression test ' + (rr.pass ? 'passed' : 'FAILED') + ': ' + rr.detail + '. Rules fired: ' + rr.hits.join(', ') + '.', data: { pass: rr.pass } });

    /* Yesterday: an extra zero held at Tier 3 and rejected, then the corrected payment released. */
    S.state.seq.pay = 997;
    setClock(y, '14:02');
    var p1 = submitInstruction({ loanId: 'LN-1008', operation: 'INTEREST', valueDate: y, interest: 8450000, principal: 0, overrideCode: '', fields: base, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: 'Quarterly interest.' }, 'U-MK1');
    setClock(y, '14:09'); checkPayment(p1.id, 'U-CK1', 'Amounts match the instruction.');
    setClock(y, '14:15'); approverOpen(p1.id);
    setClock(y, '14:16'); approverRekey(p1.id, 845000, 'INTEREST'); approverRekey(p1.id, 845000, 'INTEREST'); approverReveal(p1.id);
    setClock(y, '14:17'); approverEscalate(p1.id, { dwellSec: 41, note: 'Notice to lenders says USD 845,000. Instruction would send ten times that.' });
    setClock(y, '14:41'); opRiskReject(p1.id, 'U-OR1', 'Extra zero confirmed with the maker. Returned for correction.', 95);
    setClock(y, '14:58'); cancelPayment(p1.id, 'U-MK1');
    setClock(y, '15:05');
    var p2 = submitInstruction({ loanId: 'LN-1008', operation: 'INTEREST', valueDate: y, interest: 845000, principal: 0, overrideCode: '', fields: base, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: 'Corrected amount, replaces ' + p1.id + '.' }, 'U-MK1');
    setClock(y, '15:11'); checkPayment(p2.id, 'U-CK1', '');
    setClock(y, '15:19'); approverOpen(p2.id); approverReveal(p2.id);
    setClock(y, '15:19'); approverApprove(p2.id, { dwellSec: 12.4 });
    setClock(y, '17:30'); runReconciliation('U-OR1');

    /* Today: two routine releases and a WA-01 roll-up first blocked at the M3 gate, then released. */
    S.state.seq.pay = 1000;
    var t = todaySlots(14);
    function at(i) { setClockDate(t[i], bd); }
    at(0);
    var a = submitInstruction({ loanId: 'LN-1005', operation: 'INTEREST', valueDate: bd, interest: 1012500, principal: 0, overrideCode: '', fields: base, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP3', makerNote: 'Quarterly interest.' }, 'U-MK1');
    at(1); checkPayment(a.id, 'U-CK1', '');
    at(2); approverOpen(a.id); approverReveal(a.id); approverApprove(a.id, { dwellSec: 9.1 });
    at(3);
    var b = submitInstruction({ loanId: 'LN-1006', operation: 'INTEREST', valueDate: bd, interest: 3150000, principal: 0, overrideCode: '', fields: base, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: 'Quarterly interest.' }, 'U-MK1');
    at(4); checkPayment(b.id, 'U-CK1', '');
    at(5); approverOpen(b.id); approverReveal(b.id); approverApprove(b.id, { dwellSec: 14.6 });
    at(6);
    var c = submitInstruction({ loanId: 'LN-1007', operation: 'INTEREST_VIA_WASH', valueDate: bd, interest: 980000, principal: 140000000, overrideCode: 'WA-01', fields: wash, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP2', makerNote: 'Roll-up. Interest to lenders, principal to wash (WA-01).' }, 'U-MK1');
    at(7); checkPayment(c.id, 'U-CK1', 'FRONT, FUND and PRINCIPAL all set to wash.');
    at(8); approverOpen(c.id);
    at(9); returnToMaker(c.id, 'U-AP2', 'M3 gate: my WA-01 certification has lapsed. Please reassign.', 'gate');
    at(10);
    var c2 = E.clone(c.instr); c2.approverId = 'U-AP1';
    submitInstruction(c2, 'U-MK1', c.id);
    at(11); checkPayment(c.id, 'U-CK1', 'Reassigned to a certified approver.');
    at(12); approverOpen(c.id); approverRekey(c.id, 980000, 'INTEREST'); approverReveal(c.id);
    at(13); approverApprove(c.id, { dwellSec: 23.2, confirmed: true });
  }

  function seed() {
    var real = new Date();
    var bd = U.localDate(real);
    S.state = {
      version: VERSION,
      createdAt: real.toISOString(),
      businessDate: bd,
      role: 'maker',
      ctx: E.buildDemoContext(DATA, bd),
      payments: [],
      events: [],
      reconRuns: [],
      regressionRuns: [],
      m4: seedM4(bd),
      kri: seedKri(),
      seq: { pay: 1000, ev: 0, ra: 0 },
      synthetic: null,
      ui: { deskSelected: {}, makerDraft: null }
    };
    S.seeding = true;
    try {
      seedFlows();
    } finally {
      S.seeding = false;
      clearClock();
    }
    save();
  }

  function init() {
    var saved = loadSaved();
    if (saved) S.state = saved;
    else seed();
    return S.state;
  }

  function reset() {
    clearSaved();
    seed();
    return S.state;
  }

  function setRole(role) {
    S.state.role = role;
    save();
  }

  PCAP.store = {
    S: S,
    VERSION: VERSION,
    init: init,
    reset: reset,
    save: save,
    st: st,
    today: today,
    now: now,
    nowHHMM: nowHHMM,
    user: user,
    userName: userName,
    loan: loan,
    payment: payment,
    roleDef: roleDef,
    roleUserId: roleUserId,
    ctx: ctx,
    setRole: setRole,
    logEvent: logEvent,
    evaluateInstr: evaluateInstr,
    currentEval: currentEval,
    submitInstruction: submitInstruction,
    checkPayment: checkPayment,
    returnToMaker: returnToMaker,
    cancelPayment: cancelPayment,
    approverOpen: approverOpen,
    approverRekey: approverRekey,
    approverReveal: approverReveal,
    approverApprove: approverApprove,
    approverEscalate: approverEscalate,
    opRiskRelease: opRiskRelease,
    opRiskReject: opRiskReject,
    riskAcceptances: riskAcceptances,
    rekeyAttempts: rekeyAttempts,
    addWorkaround: addWorkaround,
    reviewWorkaround: reviewWorkaround,
    approveWorkaround: approveWorkaround,
    retireWorkaround: retireWorkaround,
    healthInput: healthInput,
    controlHealth: controlHealth,
    runReconciliation: runReconciliation,
    runRegressionTest: runRegressionTest,
    logIndividualView: logIndividualView,
    logExport: logExport,
    recordSyntheticRun: recordSyntheticRun,
    mondayOf: mondayOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
