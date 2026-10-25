/*
 * PCAP cost and value tests (usability and value review, 25 Oct 2026): the "This week" counts, the Board estimates,
 * what needs each role, Internal Audit's review of a risk acceptance, and the read-only roles.
 * Runs in Node with in-memory state. Synthetic data only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

function freshStore() {
  for (const f of ['../js/util.js', '../js/store.js']) delete require.cache[require.resolve(f)];
  globalThis.PCAP = { engine: E, data: require('../data/seed-data.js') };
  require('../js/util.js');
  require('../js/store.js');
  const S = globalThis.PCAP.store;
  S.reset();
  return S;
}

function replayToHold(S) {
  const p = S.submitInstruction(E.REPLAY.instruction(), 'U-MK1');
  S.checkPayment(p.id, 'U-CK1', 'Principal set to wash.');
  S.approverOpen(p.id);
  S.approverRekey(p.id, 7820000, 'INTEREST');
  S.approverRekey(p.id, 7820000, 'INTEREST');
  S.approverReveal(p.id);
  S.approverEscalate(p.id, { dwellSec: 30, note: '' });
  return p;
}

test('Board estimates come from the synthetic month and the synthetic numbers are unchanged', () => {
  const run = E.runSyntheticTest({ seed: 4234 });
  assert.equal(run.fingerprint, 'f5f23476', 'the 5.8 results did not move');
  const v = E.valueEstimate(run.summary);
  assert.equal(v.n, 500);
  assert.equal(v.tier1, 409, 'Tier 1 payments get no extra step');
  assert.equal(v.tier2 + v.tier3, 86);
  assert.equal(Math.round(v.tier1Share * 1000) / 10, 81.8, 'about 82% of payments are Tier 1, not 95%: override payments are Tier 2 by policy');
  assert.equal(v.cleanShare, 0.95);
  assert.equal(v.policyTier2Clean, 64);
  assert.equal(v.meanSec, 13.2);
  assert.equal(v.tier1MedianSec, 7.2);
  assert.equal(v.tier23MedianSec, 41.1);
  assert.equal(v.approverHoursPerMonth, 1.8);
  assert.equal(v.opRiskHoursPerMonth, 2.9);
  assert.equal(v.stoppedBeforeRelease, 22);
  assert.equal(v.foundSameDay, 3);
  assert.equal(v.auditManualHoursPerQuarter, 8.3, '25 payments at 20 minutes each, an assumption');
  const v2 = E.valueEstimate(run.summary, { auditSamplePerQuarter: 50 });
  assert.equal(v2.auditManualHoursPerQuarter, 16.7, 'assumptions can be changed in one place');
});

test('the weekly summary counts work from the event log, keeps earlier context, and values the money held back', () => {
  const ev = (o) => Object.assign({ businessDate: '2026-10-21', data: null, result: 'info' }, o);
  const events = [
    ev({ type: 'SUBMITTED', paymentId: 'P1', businessDate: '2026-10-16', data: { tier: 3 } }),
    ev({ type: 'CHECKED', paymentId: 'P1' }),
    ev({ type: 'HELD', paymentId: 'P1', data: { tier: 3, external: 8450000, expected: 845000 } }),
    ev({ type: 'OPRISK_REJECTED', paymentId: 'P1', data: { minutesHeld: 24 } }),
    ev({ type: 'SUBMITTED', paymentId: 'P2', data: { tier: 1 } }),
    ev({ type: 'CHECKED', paymentId: 'P2' }),
    ev({ type: 'RELEASED', paymentId: 'P2', data: { tier: 1, dwellSec: 9 } }),
    ev({ type: 'SUBMITTED', paymentId: 'P3', data: { tier: 2 } }),
    ev({ type: 'RETURNED', paymentId: 'P3', data: { stage: 'checker' } }),
    ev({ type: 'RELEASED', paymentId: 'P4', data: { tier: 2, dwellSec: 30 } }),
    ev({ type: 'RELEASED', paymentId: 'P5', businessDate: '2026-10-10', data: { tier: 1, dwellSec: 3 } })
  ];
  const w = E.weekSummary(events, '2026-10-19');
  assert.equal(w.keyed, 2, 'P1 was keyed last week, so only P2 and P3 count');
  assert.equal(w.checked, 2);
  assert.equal(w.sentOnTier3, 1, 'P1 was Tier 3 when keyed last week, and its check this week sent it on');
  assert.equal(w.checkerReturns, 1);
  assert.equal(w.returned, 1);
  assert.equal(w.released, 2);
  assert.deepEqual(w.releasedByTier, { 1: 1, 2: 1, 3: 0 });
  assert.equal(w.heldRejected, 1);
  assert.equal(w.keptBack, 7605000, 'USD 8.45M out against USD 845,000 expected');
  assert.equal(w.medianDwellTier1, 9, 'last week\'s release is not counted');
  assert.equal(w.medianDwellTier23, 30);
  assert.equal(w.medianMinutesHeld, 24);
  assert.equal(w.paymentsCovered, 4);
});

test('each role sees only what it has to act on: waiting payments, register items, holds and acceptances to review', () => {
  const S = freshStore();
  assert.equal(S.todoCounts('approver').total, 0, 'the seeded payments are all done');
  const owner = S.todoCounts('owner');
  assert.equal(owner.items.find((i) => i.route === 'register').count, 2, 'WA-02 review overdue and WA-03 dispensation ending');
  assert.equal(owner.items.find((i) => i.route === 'monitor').count, 1, 'a lapsed certification (CC-04) the owner must deal with');
  const p = replayToHold(S);
  assert.deepEqual(S.waitingFor('oprisk').map((x) => x.id), [p.id]);
  assert.equal(S.todoCounts('oprisk').items.find((i) => i.route === 'desk').count, 1);
  assert.equal(S.todoCounts('audit').total, 0, 'nothing released yet, nothing to review');
  S.opRiskRelease(p.id, 'U-OR1', 'Approved business exception', 'Released to show the acceptance review.', 10, { ownerId: 'U-HLO' });
  assert.equal(S.todoCounts('oprisk').items.filter((i) => i.route === 'desk').length, 0);
  assert.equal(S.todoCounts('audit').items.find((i) => i.route === 'oversight').count, 1, 'Internal Audit now has one acceptance to review');
  const w = S.weekSummary();
  assert.equal(w.acceptances, 1);
  assert.equal(w.heldReleased, 1);
});

test('Internal Audit records its review of a risk acceptance once, and a finding needs a reason', () => {
  const S = freshStore();
  const p = replayToHold(S);
  S.opRiskRelease(p.id, 'U-OR1', 'Approved business exception', 'Released to show the acceptance review.', 10, { ownerId: 'U-HLO' });
  assert.throws(() => S.auditReviewAcceptance(p.id, 'U-OR1', 'no-issue'), /Only Internal Audit/, 'the second line cannot review its own release');
  assert.throws(() => S.auditReviewAcceptance(p.id, 'U-IA1', 'finding', 'too short'), /at least 15 characters/);
  const acc = S.auditReviewAcceptance(p.id, 'U-IA1', 'finding', 'Reason does not say who confirmed the exception.');
  assert.equal(acc.review.outcome, 'finding');
  assert.throws(() => S.auditReviewAcceptance(p.id, 'U-IA1', 'no-issue'), /already reviewed/);
  const ev = S.st().events.find((e) => e.type === 'ACCEPTANCE_REVIEWED');
  assert.equal(ev.module, 'M6');
  assert.deepEqual(ev.obligations, ['O1', 'O2']);
  assert.equal(ev.result, 'fire');
  assert.equal(S.todoCounts('audit').total, 0);
});

test('the Board and Wipro\'s service manager are read-only: each has a home screen and neither can run a control', () => {
  const S = freshStore();
  const roles = globalThis.PCAP.data.roles;
  assert.equal(roles.find((r) => r.id === 'board').home, 'oversight');
  assert.equal(roles.find((r) => r.id === 'vendor').home, 'analytics');
  assert.equal(roles.find((r) => r.id === 'owner').home, 'register');
  assert.throws(() => S.runReconciliation('U-BRC'), /Board Risk Committee/);
  assert.throws(() => S.runRegressionTest('U-WSM'), /outsourced provider/);
  assert.equal(S.canRunControls('oprisk'), true);
  assert.equal(S.canRunControls('board'), false);
  const p = replayToHold(S);
  S.opRiskRelease(p.id, 'U-OR1', 'Approved business exception', 'Released to show the acceptance review.', 10, { ownerId: 'U-HLO' });
  assert.throws(() => S.auditReviewAcceptance(p.id, 'U-BRC', 'no-issue'), /Only Internal Audit/);
});

test('the Tier 1 fast path removes no control: Tier 2 still needs the re-key and the confirmation, Tier 3 still needs Operational Risk', () => {
  const S = freshStore();
  const bd = S.today();
  const lend = { FRONT: E.LENDERS, FUND: E.LENDERS, PRINCIPAL: E.LENDERS };
  const wash = { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH };
  const t1 = S.submitInstruction({ loanId: 'LN-1001', operation: 'INTEREST', valueDate: bd, interest: 1284375, principal: 0, overrideCode: '', fields: lend, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP3' }, 'U-MK1');
  const t2 = S.submitInstruction({ loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: bd, interest: 2145000, principal: 310000000, overrideCode: 'WA-01', fields: wash, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }, 'U-MK1');
  [t1, t2].forEach((p) => S.checkPayment(p.id, 'U-CK1', ''));
  assert.deepEqual(S.waitingFor('approver').map((p) => p.id), [t2.id, t1.id], 'the queue lists the newest first');
  S.approverOpen(t1.id);
  S.approverApprove(t1.id, { dwellSec: 6 });
  assert.equal(S.payment(t1.id).status, 'RELEASED', 'Tier 1: one action, no re-key, no confirmation');
  S.approverOpen(t2.id);
  assert.throws(() => S.approverApprove(t2.id, { dwellSec: 40, confirmed: true }), /re-key/);
  S.approverRekey(t2.id, 2145000, 'INTEREST');
  assert.throws(() => S.approverApprove(t2.id, { dwellSec: 40, confirmed: false }), /confirmation/);
  const rv = replayToHold(S);
  assert.throws(() => S.approverApprove(rv.id, { dwellSec: 40, confirmed: true }), /Tier 3|Operational Risk/);
});
