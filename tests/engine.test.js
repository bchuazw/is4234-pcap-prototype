/*
 * PCAP engine unit tests. Run from the project folder with:  node --test
 * Synthetic data only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const DATA = require('../data/seed-data.js');

const BD = '2026-10-24';

function ctx(mutate) {
  const c = E.buildDemoContext(DATA, BD);
  if (mutate) mutate(c);
  return c;
}

function cleanInterest(over) {
  return Object.assign({
    loanId: 'LN-1001', operation: 'INTEREST', valueDate: BD,
    interest: 1284375, principal: 0, overrideCode: '',
    fields: { FRONT: E.LENDERS, FUND: E.LENDERS, PRINCIPAL: E.LENDERS },
    makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1'
  }, over || {});
}

function rollUp(over) {
  return Object.assign({
    loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: BD,
    interest: 2145000, principal: 310000000, overrideCode: 'WA-01',
    fields: { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH },
    makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1'
  }, over || {});
}

function firedRules(ev) { return ev.hits.slice().sort(); }

/* ---------------- Revlon replay ---------------- */

test('Revlon replay is held at Tier 3 with R-01, R-02 and R-04 firing', () => {
  const ev = E.evaluate(E.REPLAY.instruction(), ctx());
  assert.equal(ev.tier, 3);
  assert.equal(ev.outcome, 'HARD_STOP');
  for (const r of ['R-01', 'R-02', 'R-04']) assert.ok(ev.hits.includes(r), r + ' should fire');
  assert.equal(ev.results['R-03'].status, 'pass', 'WA-01 is a registered workaround');
  assert.deepEqual(ev.results['R-04'].missing, ['FRONT', 'FUND']);
  assert.equal(ev.gate.open, true, 'the replay approver is certified and independent');
  assert.equal(ev.consequence.externalPrincipal, 893900000);
  assert.equal(ev.consequence.externalTotal, 901720000);
  assert.equal(ev.consequence.lenders, 315);
});

test('Revlon replay: the approver screen states the principal in plain words', () => {
  const ev = E.evaluate(E.REPLAY.instruction(), ctx());
  const text = ev.statement.join(' ');
  assert.match(text, /This will send USD 893,900,000 of PRINCIPAL and USD 7,820,000 of INTEREST to 315 external lenders/);
  assert.match(text, /The loan schedule expects USD 7,820,000 of INTEREST on 11 Aug 2020 and no principal/);
  assert.match(text, /Only PRINCIPAL is set to the wash account/);
});

test('Revlon replay passes the 5.8 regression check, including the blind re-key', () => {
  const r = E.replayCheck(ctx());
  assert.equal(r.pass, true, r.detail);
  assert.equal(r.tier, 3);
  assert.equal(r.rekey.status, 'fire', 'approver expected 7.82M, so the blind re-key escalates');
  assert.ok(r.hits.includes('R-07'));
});

/* ---------------- Normal payments ---------------- */

test('a normal scheduled interest payment releases at Tier 1', () => {
  const ev = E.evaluate(cleanInterest(), ctx());
  assert.equal(ev.tier, 1);
  assert.equal(ev.outcome, 'ROUTINE');
  assert.deepEqual(ev.hits, []);
  assert.equal(ev.gate.open, true);
  assert.equal(ev.requiresRekey, false);
  assert.equal(ev.results['R-07'].status, 'na');
  assert.match(ev.statement.join(' '), /This matches the schedule\./);
});

test('a scheduled principal repayment with interest releases at Tier 1', () => {
  const ev = E.evaluate(cleanInterest({ loanId: 'LN-1002', operation: 'PRINCIPAL_AND_INTEREST', interest: 618750, principal: 12500000 }), ctx());
  assert.equal(ev.tier, 1);
  assert.deepEqual(ev.hits, []);
});

test('a correct WA-01 roll-up is Tier 2 by policy, keeps principal inside the bank, and passes a matching re-key', () => {
  const ev = E.evaluate(rollUp(), ctx());
  assert.equal(ev.tier, 2);
  assert.deepEqual(ev.hits, [], 'no rule fires, Tier 2 comes from the override floor');
  assert.equal(ev.consequence.externalTotal, 2145000);
  assert.equal(ev.consequence.internalPrincipal, 310000000);
  assert.match(ev.statement.join(' '), /USD 310,000,000 of PRINCIPAL stays inside the bank/);
  const rk = E.rekeyResult(ev, [2145000]);
  assert.equal(rk.status, 'pass');
  assert.equal(E.withRekey(ev, rk).tier, 2);
});

/* ---------------- Each rule blocks its own error ---------------- */

test('R-01 Variance: an extra zero is Tier 3, a 2% slip is Tier 2, a USD 300 slip is inside tolerance', () => {
  const c = ctx();
  const zero = E.evaluate(cleanInterest({ interest: 12843750 }), c);
  assert.deepEqual(firedRules(zero), ['R-01']);
  assert.equal(zero.results['R-01'].tier, 3);
  assert.equal(zero.tier, 3);

  const slip = E.evaluate(cleanInterest({ interest: 1310062.5 }), c);
  assert.deepEqual(firedRules(slip), ['R-01']);
  assert.equal(slip.tier, 2);

  const tiny = E.evaluate(cleanInterest({ interest: 1284675 }), c);
  assert.equal(tiny.results['R-01'].status, 'pass');
  assert.equal(tiny.tier, 1);
});

test('R-01 Variance: paying on a date with nothing due, or paying a line twice, is Tier 3', () => {
  const c = ctx();
  const wrongDay = E.evaluate(cleanInterest({ valueDate: E.addDays(BD, 1) }), c);
  assert.deepEqual(firedRules(wrongDay), ['R-01']);
  assert.equal(wrongDay.tier, 3);

  const first = E.evaluate(cleanInterest(), c);
  E.applyRelease(E.byId(c.loans, 'LN-1001'), BD, first.consequence);
  const dup = E.evaluate(cleanInterest(), c);
  assert.deepEqual(firedRules(dup), ['R-01']);
  assert.equal(dup.tier, 3);
  assert.match(dup.results['R-01'].message, /already paid/);
});

test('R-02 Unscheduled principal: principal on an interest-only date is a Tier 3 hard stop', () => {
  const ev = E.evaluate(cleanInterest({ principal: 50000000 }), ctx());
  assert.equal(ev.results['R-02'].status, 'fire');
  assert.equal(ev.results['R-02'].tier, 3);
  assert.equal(ev.tier, 3);
});

test('R-03 Unregistered workaround: unknown code, undeclared wash settings, retired entry and expired dispensation all fire', () => {
  const unknown = E.evaluate(rollUp({ overrideCode: 'OVR-PRIN-HOLD' }), ctx());
  assert.deepEqual(firedRules(unknown), ['R-03']);
  assert.equal(unknown.tier, 3);

  const undeclared = E.evaluate(rollUp({ overrideCode: '' }), ctx());
  assert.ok(undeclared.hits.includes('R-03'));
  assert.match(undeclared.results['R-03'].message, /no workaround is declared/);

  const retired = E.evaluate(rollUp({ overrideCode: 'WA-04' }), ctx());
  assert.ok(retired.hits.includes('R-03'));
  assert.match(retired.results['R-03'].message, /retired/);

  const expired = E.evaluate(rollUp(), ctx((c) => { E.byId(c.register, 'WA-01').dispensationUntil = E.addDays(BD, -1); }));
  assert.ok(expired.hits.includes('R-03'));
  assert.match(expired.results['R-03'].message, /dispensation expired/);

  const notActive = E.evaluate(rollUp(), ctx((c) => { E.byId(c.register, 'WA-01').status = 'Proposed'; }));
  assert.ok(notActive.hits.includes('R-03'));
});

test('R-04 Incomplete workaround: WA-01 with FUND missing is a Tier 3 hard stop', () => {
  const ev = E.evaluate(rollUp({ fields: { FRONT: E.WASH, FUND: E.LENDERS, PRINCIPAL: E.WASH } }), ctx());
  assert.equal(ev.results['R-04'].status, 'fire');
  assert.deepEqual(ev.results['R-04'].missing, ['FUND']);
  assert.equal(ev.tier, 3);
  assert.equal(ev.consequence.externalPrincipal, 310000000, 'the principal really leaves the bank');
});

test('R-05 Certification: no certificate, an expired certificate and a low approval limit each close the M3 gate', () => {
  const none = E.evaluate(rollUp({ approverId: 'U-AP3' }), ctx());
  assert.deepEqual(firedRules(none), ['R-05']);
  assert.equal(none.gate.open, false);
  assert.match(none.results['R-05'].message, /not certified for WA-01/);

  const lapsed = E.evaluate(rollUp({ approverId: 'U-AP2' }), ctx());
  assert.deepEqual(firedRules(lapsed), ['R-05']);
  assert.match(lapsed.results['R-05'].message, /certification expired/);

  const limit = E.evaluate(cleanInterest({ approverId: 'U-AP3' }), ctx((c) => { E.byId(c.users, 'U-AP3').approvalLimit = 1000000; }));
  assert.deepEqual(firedRules(limit), ['R-05']);
  assert.match(limit.results['R-05'].message, /approval limit/);
  assert.equal(limit.tier, 1, 'the gate blocks the approver, the payment itself is routine');
});

test('R-06 Independence: the maker\'s own Wipro manager cannot approve, and override payments need an in-house approver', () => {
  const plain = E.evaluate(cleanInterest({ approverId: 'U-SUP1' }), ctx());
  assert.deepEqual(firedRules(plain), ['R-06']);
  assert.equal(plain.gate.open, false);
  assert.match(plain.results['R-06'].message, /same team/);
  assert.match(plain.results['R-06'].message, /reporting line/);

  const override = E.evaluate(rollUp({ approverId: 'U-SUP1' }), ctx());
  assert.ok(override.hits.includes('R-06'));
  assert.match(override.results['R-06'].message, /in-house \(Citi\) approver/);

  const self = E.evaluate(cleanInterest({ checkerId: 'U-MK1' }), ctx());
  assert.ok(self.hits.includes('R-06'));
  assert.match(self.results['R-06'].message, /maker also checked/);
});

test('R-07 Active confirmation: a blind re-key mismatch is caught and a second mismatch escalates to Tier 3', () => {
  const ev = E.evaluate(rollUp(), ctx());
  const first = E.rekeyResult(ev, [21450000]);
  assert.equal(first.status, 'retry');
  const second = E.rekeyResult(ev, [21450000, 21450000]);
  assert.equal(second.status, 'fire');
  const after = E.withRekey(ev, second);
  assert.equal(after.tier, 3);
  assert.ok(after.hits.includes('R-07'));
  assert.equal(E.rekeyKind(second), 'catch');

  const slip = E.rekeyResult(ev, [2145900, 2145000]);
  assert.equal(slip.status, 'pass');
  assert.equal(slip.firstMatch, false);
  assert.equal(E.rekeyKind(slip), 'slip');
  assert.equal(E.withRekey(ev, slip).tier, 2);
});

test('R-08 Rubber-stamp score: fast looks and fast approvals score red, careful review scores green', () => {
  const bad = E.rubberStampScore({ fastLookShare: 1, mismatchRate: 0.1, fastApproveShare: 0.8 });
  assert.equal(bad.score, 79);
  assert.equal(bad.rag, 'red');
  const good = E.rubberStampScore({ fastLookShare: 0, mismatchRate: 0.01, fastApproveShare: 0 });
  assert.equal(good.rag, 'green');
  const s = E.summariseReviews([
    { tier: 2, dwellSec: 3, rekey: 'slip', decision: 'approve' },
    { tier: 2, dwellSec: 4, rekey: 'match', decision: 'approve' },
    { tier: 3, dwellSec: 30, rekey: 'catch', decision: 'escalate' },
    { tier: 1, dwellSec: 9, rekey: null, decision: 'approve' }
  ]);
  assert.equal(s.nRekeys, 3);
  assert.equal(s.nSlips, 1);
  assert.equal(s.nCatches, 1);
  assert.ok(Math.abs(s.mismatchRate - 1 / 3) < 1e-9, 'only slips count against the approver');
  assert.ok(Math.abs(s.fastLookShare - 2 / 3) < 1e-9);
  assert.equal(s.fastApproveShare, 1);
});

test('R-09 Control health: overdue reviews, expiring items, lapsed certificates, breaks and stale holds turn amber or red', () => {
  const c = ctx();
  const released = [{ id: 'P1', loanId: 'LN-1001', status: 'RELEASED', releasedDate: BD, releasedTime: '10:00', releasedExternal: 1284375, expectedAtRelease: 1284075, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }];
  const rec = E.reconcile(released, BD);
  assert.equal(rec.breaks, 1);
  const base = { businessDate: BD, nowTime: '11:00', register: c.register, users: c.users, payments: released,
    reconRuns: [{ date: BD, time: '11:00', independent: true, breaks: rec.breaks, breakTotal: rec.breakTotal, rows: rec.rows.length }],
    regressionRuns: [{ date: E.addDays(BD, -12), pass: true }] };
  const h = E.controlHealth(base);
  const byId = Object.fromEntries(h.controls.map((x) => [x.id, x]));
  assert.equal(byId['CC-01'].rag, 'red', 'a reconciliation break is red');
  assert.equal(byId['CC-02'].rag, 'amber', 'WA-02 review is overdue by 23 days');
  assert.equal(byId['CC-03'].rag, 'amber', 'WA-03 dispensation expires within 30 days');
  assert.equal(byId['CC-04'].rag, 'amber', 'Marco O. has a lapsed WA-01 certificate');
  assert.equal(byId['CC-05'].rag, 'green');
  assert.equal(byId['CC-06'].rag, 'green');
  assert.equal(h.overall, 'red');

  const notIndependent = E.controlHealth(Object.assign({}, base, { reconRuns: [{ date: BD, time: '11:00', independent: false, breaks: 0, breakTotal: 0, rows: 1 }] }));
  assert.equal(notIndependent.controls[0].rag, 'red');

  const staleHold = E.controlHealth(Object.assign({}, base, { payments: [{ id: 'P2', status: 'HELD', heldDate: E.addDays(BD, -1) }] }));
  assert.equal(staleHold.controls.find((x) => x.id === 'CC-05').rag, 'red');

  const failedReplay = E.controlHealth(Object.assign({}, base, { regressionRuns: [{ date: BD, pass: false, detail: 'Tier 1 instead of 3' }] }));
  assert.equal(failedReplay.controls.find((x) => x.id === 'CC-06').rag, 'red');

  const expired = E.controlHealth(Object.assign({}, base, { register: c.register.map((r) => (r.id === 'WA-03' ? Object.assign({}, r, { dispensationUntil: E.addDays(BD, -2) }) : r)) }));
  assert.equal(expired.controls.find((x) => x.id === 'CC-03').rag, 'red');
});

/* ---------------- Synthetic test (5.8) ---------------- */

test('synthetic test: 500 payments with 25 injected errors, run through the real engine', () => {
  const r = E.runSyntheticTest({ seed: 4234 });
  assert.equal(r.summary.n, 500);
  assert.equal(r.summary.errorCount, 25);
  assert.equal(r.summary.cleanCount, 475);
  assert.equal(r.summary.detection.tier3ClassRate, 1, 'every Tier 3 class error is stopped');
  assert.equal(r.replay.pass, true);
  for (const k of ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07']) {
    const cov = r.coverage.find((x) => x.rule === k);
    assert.ok(cov.onErrors > 0, k + ' should fire on at least one injected error');
  }
  assert.ok(r.r08.some((t) => t.rag === 'red'), 'R-08 flags the rubber-stamp team');
  assert.ok(r.coverage.find((x) => x.rule === 'R-09').reconBreaks >= 0);
});

test('synthetic test is deterministic for a fixed seed', () => {
  const a = E.runSyntheticTest({ seed: 4234 });
  const b = E.runSyntheticTest({ seed: 4234 });
  assert.equal(a.fingerprint, b.fingerprint);
  assert.deepEqual(a.summary, b.summary);
  assert.deepEqual(a.byType, b.byType);
  const c = E.runSyntheticTest({ seed: 7 });
  assert.notEqual(a.fingerprint, c.fingerprint, 'a different seed gives a different batch');
});

test('across seeds 1 to 20, every Tier 3 and gate error is stopped and nothing is missed entirely', () => {
  const a = E.runSeedSweep({ from: 1, to: 20 });
  assert.equal(a.seeds, 20);
  assert.equal(a.classes.T3.stopped, a.classes.T3.count, 'Tier 3 class always stopped');
  assert.equal(a.classes.GATE.stopped, a.classes.GATE.count, 'gate class always blocked');
  assert.equal(a.classes.T2.stopped, a.classes.T2.count, 'Tier 2 class stopped by the blind re-key');
  assert.equal(a.missed, 0, 'below-tolerance slips are found the same day by M5');
  assert.equal(a.replayFails, 0);
  assert.equal(a.falseAlarmsHeld, 0, 'no clean payment is held at Tier 3');
  assert.ok(a.falseAlarmRate < 0.05);
});

/* ---------------- Formatting ---------------- */

test('money and dates are formatted the same way everywhere', () => {
  assert.equal(E.fmtUSD(893900000), 'USD 893,900,000');
  assert.equal(E.fmtUSD(1284375.5), 'USD 1,284,375.50');
  assert.equal(E.fmtCompact(893900000), 'USD 893.9M');
  assert.equal(E.fmtDate('2020-08-11'), '11 Aug 2020');
});
