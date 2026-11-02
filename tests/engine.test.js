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

test('Revlon replay passes the 5.8 regression check: stopped when keyed, with the blind re-key as a backstop', () => {
  const r = E.replayCheck(ctx());
  assert.equal(r.pass, true, r.detail);
  assert.equal(r.tier, 3);
  assert.deepEqual(r.hits.slice().sort(), ['R-01', 'R-02', 'R-04'], 'the rules that stop it when it is keyed');
  assert.equal(r.rekey.status, 'fire', 'had it reached an approver who expected 7.82M, the blind re-key would stop it too');
  assert.ok(r.backstop.hits.includes('R-07'));
  assert.equal(r.backstop.tier, 3);
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

test('a correct scheduled principal payment is Tier 2: no rule fails, but principal leaving the bank always gets the re-key', () => {
  const c = ctx();
  const ev = E.evaluate(cleanInterest({ loanId: 'LN-1002', operation: 'PRINCIPAL_AND_INTEREST', interest: 618750, principal: 12500000 }), c);
  assert.equal(ev.tier, 2, 'the USD 12.5M instalment no longer goes through in one click');
  assert.deepEqual(ev.hits, [], 'nothing is wrong with it, so it is not a false alarm');
  assert.equal(ev.results['R-02'].status, 'pass');
  assert.equal(ev.results['R-02'].floor, 2);
  assert.equal(ev.requiresRekey, true);
  assert.equal(ev.results['R-07'].status, 'pending');
  assert.match(ev.tierReasons.join(' '), /Principal leaves the bank \(USD 12,500,000, as scheduled\), so at least Tier 2/);
  assert.equal(E.rekeyResult(ev, [{ amount: 13118750, nature: 'PRINCIPAL_AND_INTEREST' }]).status, 'pass');
  /* Tier 2 needs an in-house approver: Wipro's manager is refused even for another team's maker. */
  const wipro = E.evaluate(cleanInterest({ loanId: 'LN-1002', operation: 'PRINCIPAL_AND_INTEREST', interest: 618750, principal: 12500000, makerId: 'U-AP9', checkerId: 'U-AP7', approverId: 'U-SUP1' }), c);
  assert.equal(wipro.gate.open, false);
  assert.match(wipro.results['R-06'].message, /Tier 2 or 3 need an in-house \(Citi\) approver/);
  /* Unscheduled principal is still a Tier 3 hard stop. */
  assert.equal(E.evaluate(cleanInterest({ principal: 12500000 }), c).tier, 3);
  /* Routine interest keeps the one-click path, and a Wipro approver is not refused for being outsourced there. */
  const t1 = E.evaluate(cleanInterest({ makerId: 'U-AP9', checkerId: 'U-AP7', approverId: 'U-SUP1' }), c);
  assert.equal(t1.tier, 1);
  assert.doesNotMatch(t1.results['R-06'].message, /in-house/);
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

test('R-01 Variance: above 5% on an expected payment above USD 1m is Tier 3, smaller payments keep the 10% line (report Table 6)', () => {
  const c = ctx();
  /* LN-1001 expects USD 1,284,375 today, so the 5% line applies. */
  const six = E.evaluate(cleanInterest({ interest: 1284375 * 1.06 }), c);
  assert.deepEqual(firedRules(six), ['R-01']);
  assert.equal(six.results['R-01'].tier, 3, '6% off a USD 1.28M payment is a hard stop');
  assert.equal(six.tier, 3);
  const four = E.evaluate(cleanInterest({ interest: 1284375 * 1.049 }), c);
  assert.equal(four.results['R-01'].tier, 2, '4.9% off is beyond tolerance but under 5%');
  assert.equal(four.tier, 2);
  /* LN-1008 expects USD 845,000 (yesterday), below USD 1m: 6% is Tier 2, only above 10% is Tier 3. */
  const y = E.addDays(BD, -1);
  const small = E.evaluate(cleanInterest({ loanId: 'LN-1008', valueDate: y, interest: 845000 * 1.06 }), c);
  assert.equal(small.results['R-01'].tier, 2);
  assert.equal(E.evaluate(cleanInterest({ loanId: 'LN-1008', valueDate: y, interest: 845000 * 1.11 }), c).results['R-01'].tier, 3);
  /* The line sits strictly above USD 1m: exactly USD 1m keeps the 10% line. */
  assert.equal(E.varianceTier(1000000, 60000), 2);
  assert.equal(E.varianceTier(1000001, 60000), 3);
  assert.equal(E.varianceTier(20000000, 1200000), 3, '6% of USD 20M is a hard stop although it is under USD 5M');
  assert.equal(E.varianceTier(20000000, 20000), 1, 'inside the 0.1% tolerance');
  assert.match(E.RULES['R-01'].action, /above 5% on an expected payment above USD 1 million/);
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

test('R-07 Active confirmation also checks the payment type: the right amount called interest only still fails when principal leaves', () => {
  const c = ctx();
  const roll = E.evaluate(rollUp(), c);
  assert.equal(E.natureOf(roll.consequence), 'INTEREST', 'a correct roll-up only sends interest');
  assert.equal(E.rekeyResult(roll, [{ amount: 2145000, nature: 'INTEREST' }]).status, 'pass');

  const pi = E.evaluate(cleanInterest({ loanId: 'LN-1002', operation: 'PRINCIPAL_AND_INTEREST', interest: 618750, principal: 12500000 }), c);
  const said = { amount: 13118750, nature: 'INTEREST' };
  const first = E.rekeyResult(pi, [said]);
  assert.equal(first.status, 'retry', 'same total, wrong type');
  assert.equal(first.checks[0].amountMatch, true);
  assert.equal(first.checks[0].natureMatch, false);
  assert.match(first.message, /payment type/);
  assert.equal(E.rekeyResult(pi, [said, said]).status, 'fire');
  assert.equal(E.rekeyResult(pi, [said, { amount: 13118750, nature: 'PRINCIPAL_AND_INTEREST' }]).status, 'pass');

  const replay = E.replayCheck(c);
  assert.match(replay.rekey.message, /USD 7,820,000 \(interest only\) but this instruction would send USD 901,720,000 \(principal and interest\)/);
});

test('a risk acceptance on a stopped payment: reason, first-line owner, one payment, expires the same day', () => {
  const c = ctx();
  const ev = E.evaluate(E.REPLAY.instruction(), c);
  const base = { paymentId: 'PAY-1', ev, category: E.ACCEPT_CATEGORIES[1], reason: 'Lender consent received for an early repayment.', ownerId: 'U-HLO', recordedById: 'U-OR1', users: c.users, businessDate: BD, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' };
  const ok = E.riskAcceptance(base);
  assert.equal(ok.ok, true, ok.problems.join(' '));
  assert.equal(ok.record.ownerId, 'U-HLO');
  assert.equal(ok.record.recordedById, 'U-OR1');
  assert.equal(ok.record.expires, BD, 'no standing approvals: it ends with the business day');
  assert.match(ok.record.scope, /This payment only/);
  assert.deepEqual(ok.record.assessed.rules.slice().sort(), ['R-01', 'R-02', 'R-04'], 'the acceptance keeps what PCAP assessed');

  const bad = (over) => E.riskAcceptance(Object.assign({}, base, over));
  assert.equal(bad({ reason: 'ok' }).ok, false);
  assert.equal(bad({ category: 'Because I said so' }).ok, false);
  assert.match(bad({ ownerId: 'U-OR1' }).problems.join(' '), /not a first-line risk owner/, 'Operational Risk cannot own the risk it oversees');
  assert.match(bad({ ownerId: 'U-SUP1' }).problems.join(' '), /bank employee|first-line risk owner/, 'the outsourced provider cannot own the risk');
  assert.match(bad({ recordedById: 'U-AP1' }).problems.join(' '), /Only Operational Risk/);
});

test('acceptance owner rules: the Head of Loan Ops only, never Operational Risk, the provider or anyone who touched the payment', () => {
  const c = ctx();
  const ev = E.evaluate(E.REPLAY.instruction(), c);
  const base = { paymentId: 'PAY-1', ev, category: E.ACCEPT_CATEGORIES[0], reason: 'The loan schedule line is out of date.', ownerId: 'U-HLO', recordedById: 'U-OR1', users: c.users, businessDate: BD, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1', referredById: 'U-MK1' };
  const ok = E.riskAcceptance(base);
  assert.equal(ok.ok, true, ok.problems.join(' '));
  assert.equal(ok.record.status, 'awaiting-release', 'recording the acceptance releases nothing');
  assert.equal(ok.record.release, null);
  assert.match(ok.record.followUp, /Owner: Dana F\./);
  assert.match(ok.record.scope, /This payment only/);
  const bad = (over, users) => E.riskAcceptance(Object.assign({}, base, over, users ? { users } : {})).problems.join(' ');
  assert.match(bad({ ownerId: 'U-OR1' }), /not a first-line risk owner/, 'Operational Risk cannot own the risk it oversees');
  assert.match(bad({ ownerId: 'U-AP1' }), /not a first-line risk owner/, 'an approver is not the risk owner');
  const wiproOwner = c.users.map((u) => (u.id === 'U-SUP1' ? Object.assign({}, u, { roles: ['owner'] }) : u));
  assert.match(bad({ ownerId: 'U-SUP1' }, wiproOwner), /bank employee/, 'the outsourced provider can never own the risk');
  assert.match(bad({ referredById: 'U-HLO' }), /took part in this payment/, 'whoever referred it cannot accept its risk');
  assert.match(bad({ approverId: 'U-HLO' }), /took part in this payment/);
  assert.match(bad({ reason: 'too short' }), /15 characters/);
});

test('the release check: only the named Head of Loan Ops, within limit, independent, with the same rules and amount as assessed, on the same day', () => {
  const c = ctx();
  const ev = E.evaluate(E.REPLAY.instruction(), c);
  const acc = Object.assign(E.riskAcceptance({ paymentId: 'PAY-1', ev, category: E.ACCEPT_CATEGORIES[1], reason: 'Approved exception for the test.', ownerId: 'U-HLO', recordedById: 'U-OR1', users: c.users, businessDate: BD, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1', referredById: 'U-MK1' }).record, { id: 'RA-0001' });
  const input = { releaserId: 'U-HLO', acceptance: acc, ev, users: c.users, businessDate: BD, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1', referredById: 'U-MK1' };
  const good = E.releaseCheck(input);
  assert.equal(good.ok, true, good.problems.join(' '));
  assert.equal(good.results['R-05'].status, 'pass');
  assert.equal(good.results['R-06'].status, 'pass');
  assert.deepEqual(good.rulesNow.slice().sort(), ['R-01', 'R-02', 'R-04'], 'the rules are re-run at release');
  const opr = E.releaseCheck(Object.assign({}, input, { releaserId: 'U-OR1' }));
  assert.equal(opr.ok, false, 'Operational Risk can never release');
  assert.match(opr.results['R-05'].message, /not the Head of Loan Ops/);
  assert.equal(E.releaseCheck(Object.assign({}, input, { releaserId: 'U-AP1' })).ok, false, 'an approver cannot release a stopped payment');
  assert.match(E.releaseCheck(Object.assign({}, input, { businessDate: E.addDays(BD, 1) })).problems.join(' '), /ended on/, 'the acceptance ends with the day');
  const lowLimit = c.users.map((u) => (u.id === 'U-HLO' ? Object.assign({}, u, { approvalLimit: 1000000 }) : u));
  assert.match(E.releaseCheck(Object.assign({}, input, { users: lowLimit })).results['R-05'].message, /release limit/);
  assert.match(E.releaseCheck(Object.assign({}, input, { referredById: 'U-HLO' })).results['R-06'].message, /took part/);
  const retired = ctx((x) => { E.byId(x.register, 'WA-01').status = 'Retired'; });
  const changed = E.releaseCheck(Object.assign({}, input, { ev: E.evaluate(E.REPLAY.instruction(), retired) }));
  assert.equal(changed.ok, false);
  assert.match(changed.problems.join(' '), /R-03 also fails/, 'a rule that fails after the assessment blocks the release');
});

test('M4 privacy: every approver team in the demo has at least 3 approvers, and smaller teams get no score', () => {
  assert.equal(E.teamReportable(2), false);
  assert.equal(E.teamReportable(3), true);
  for (const team of DATA.approverTeams) {
    const n = DATA.users.filter((u) => u.team === team && u.roles.includes('approver')).length;
    assert.ok(n >= E.DEFAULT_CONFIG.m4MinTeam, team + ' has ' + n + ' approvers');
  }
  const v = E.summariseOutsourced([
    { team: 'Wipro', kind: 'keyed', tier: 3 }, { team: 'Wipro', kind: 'keyed', tier: 1 },
    { team: 'Wipro', kind: 'checked', tier: 3 }, { team: 'Wipro', kind: 'checked', tier: 1 }, { team: 'Wipro', kind: 'returned', tier: 3 }
  ]);
  assert.deepEqual(v, [{ team: 'Wipro', keyed: 2, keyedTier3: 1, checked: 2, sentOnTier3: 1, returned: 1 }]);
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
