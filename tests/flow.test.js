/*
 * PCAP flow tests: drive the same store actions the payment desk buttons call,
 * and check that every step is logged with its module, rule and obligation tags.
 * Runs in Node with in-memory state (no browser storage). Synthetic data only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function freshStore() {
  for (const f of ['../js/util.js', '../js/store.js']) delete require.cache[require.resolve(f)];
  globalThis.PCAP = { engine: require('../js/engine.js'), data: require('../data/seed-data.js') };
  require('../js/util.js');
  require('../js/store.js');
  const S = globalThis.PCAP.store;
  S.reset();
  return S;
}

function eventsFor(S, id) { return S.st().events.filter((e) => e.paymentId === id); }

test('seeded demo state replays real flows: releases, a rejected hold and a blocked approver', () => {
  const S = freshStore();
  const st = S.st();
  assert.equal(S.S.storageOk, false, 'Node has no browser storage, so state stays in memory');
  const byId = Object.fromEntries(st.payments.map((p) => [p.id, p]));
  assert.equal(byId['PAY-0998'].status, 'CANCELLED');
  assert.equal(byId['PAY-0999'].status, 'RELEASED');
  assert.equal(byId['PAY-1003'].status, 'RELEASED');
  const blocked = eventsFor(S, 'PAY-1003').filter((e) => e.type === 'BLOCKED_ATTEMPT' && e.rule === 'R-05');
  assert.ok(blocked.length >= 1, 'Marco O. was blocked by R-05 before reassignment');
  assert.ok(st.events.every((e) => e.module || e.type === 'CANCELLED'), 'every event names its module');
  assert.equal(S.controlHealth().controls.length, 6);
});

test('Revlon replay through the desk: Tier 3, blind re-key escalates, Op Risk rejects, all steps tagged', () => {
  const S = freshStore();
  const E = globalThis.PCAP.engine;
  const p = S.submitInstruction(E.REPLAY.instruction(), 'U-MK1');
  assert.equal(p.atSubmit.tier, 3);
  const fired = eventsFor(S, p.id).filter((e) => e.type === 'RULE_RESULT' && e.result === 'fire').map((e) => e.rule).sort();
  assert.deepEqual(fired, ['R-01', 'R-02', 'R-04']);

  S.checkPayment(p.id, 'U-CK1', 'Principal set to wash.');
  const ev = S.approverOpen(p.id);
  assert.equal(ev.gate.open, true);
  assert.equal(S.approverRekey(p.id, 7820000).status, 'retry');
  assert.equal(S.approverRekey(p.id, 7820000).status, 'fire');
  S.approverReveal(p.id);
  assert.throws(() => S.approverApprove(p.id, { dwellSec: 20, confirmed: true }), /Tier 3 hard stop/);
  S.approverEscalate(p.id, { dwellSec: 21, note: 'Notice says interest only.' });
  assert.equal(S.payment(p.id).status, 'HELD');
  assert.throws(() => S.opRiskReject(p.id, 'U-OR1', 'too short'), /15 characters/);
  S.opRiskReject(p.id, 'U-OR1', 'Principal would leave the bank on an interest-only date.');
  assert.equal(S.payment(p.id).status, 'RETURNED');

  const evs = eventsFor(S, p.id);
  const types = evs.map((e) => e.type);
  for (const t of ['SUBMITTED', 'RULE_RESULT', 'OVERRIDE_USE', 'CHECKED', 'GATE_CHECK', 'REKEY', 'ESCALATED', 'STATEMENT_SHOWN', 'HELD', 'BEHAVIOUR_SIGNAL', 'OPRISK_REJECTED']) {
    assert.ok(types.includes(t), 'logged ' + t);
  }
  const rekeys = evs.filter((e) => e.type === 'REKEY');
  assert.ok(rekeys.every((e) => e.module === 'M2' && e.rule === 'R-07' && e.obligations.includes('O2')));
  const shown = evs.find((e) => e.type === 'STATEMENT_SHOWN');
  assert.match(shown.detail, /USD 893,900,000 of PRINCIPAL/, 'evidence that the approver saw the principal');
  const behaviour = evs.find((e) => e.type === 'BEHAVIOUR_SIGNAL');
  assert.equal(behaviour.module, 'M4');
  assert.deepEqual(behaviour.obligations, ['O2', 'O5']);
});

test('if Operational Risk releases the replay anyway, the M5 same-day reconciliation shows the break', () => {
  const S = freshStore();
  const E = globalThis.PCAP.engine;
  const p = S.submitInstruction(E.REPLAY.instruction(), 'U-MK1');
  S.checkPayment(p.id, 'U-CK1', '');
  S.approverOpen(p.id);
  S.approverRekey(p.id, 7820000);
  S.approverRekey(p.id, 7820000);
  S.approverEscalate(p.id, { dwellSec: 30, note: '' });
  S.opRiskRelease(p.id, 'U-OR1', 'Approved business exception', 'Released to show what the reconciliation does next.');
  assert.equal(S.payment(p.id).releasedExternal, 901720000);
  const run = S.runReconciliation('U-OR1');
  assert.equal(run.independent, true);
  assert.equal(run.breaks, 1);
  assert.equal(run.breakTotal, 893900000);
  const cc01 = S.controlHealth().controls.find((c) => c.id === 'CC-01');
  assert.equal(cc01.rag, 'red');
});

test('the maker running the reconciliation is flagged as not independent', () => {
  const S = freshStore();
  const run = S.runReconciliation('U-MK1');
  assert.equal(run.independent, false, 'the maker took part in payments released today');
  assert.equal(S.controlHealth().controls.find((c) => c.id === 'CC-01').rag, 'red');
});

test('a clean payment releases at Tier 1, a WA-01 roll-up needs a matching re-key and confirmation', () => {
  const S = freshStore();
  const E = globalThis.PCAP.engine;
  const bd = S.today();
  const lenders = { FRONT: E.LENDERS, FUND: E.LENDERS, PRINCIPAL: E.LENDERS };
  const clean = S.submitInstruction({ loanId: 'LN-1001', operation: 'INTEREST', valueDate: bd, interest: 1284375, principal: 0, overrideCode: '', fields: lenders, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP3' }, 'U-MK1');
  assert.equal(clean.atSubmit.tier, 1);
  S.checkPayment(clean.id, 'U-CK1', '');
  S.approverOpen(clean.id);
  S.approverApprove(clean.id, { dwellSec: 9 });
  assert.equal(S.payment(clean.id).status, 'RELEASED');

  const wash = { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH };
  const roll = S.submitInstruction({ loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: bd, interest: 2145000, principal: 310000000, overrideCode: 'WA-01', fields: wash, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }, 'U-MK1');
  assert.equal(roll.atSubmit.tier, 2);
  S.checkPayment(roll.id, 'U-CK1', '');
  S.approverOpen(roll.id);
  assert.throws(() => S.approverApprove(roll.id, { dwellSec: 30, confirmed: true }), /re-key/);
  S.approverRekey(roll.id, 2145000);
  assert.throws(() => S.approverApprove(roll.id, { dwellSec: 30, confirmed: false }), /confirmation/);
  S.approverApprove(roll.id, { dwellSec: 30, confirmed: true });
  const done = S.payment(roll.id);
  assert.equal(done.status, 'RELEASED');
  assert.equal(done.releasedExternal, 2145000, 'only interest left the bank');
});

test('retiring WA-01 in the M1 register makes the next roll-up hit R-03', () => {
  const S = freshStore();
  const E = globalThis.PCAP.engine;
  S.retireWorkaround('WA-01', 'U-HLO');
  const ev = S.evaluateInstr({ loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: S.today(), interest: 2145000, principal: 310000000, overrideCode: 'WA-01', fields: { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH }, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' });
  assert.ok(ev.hits.includes('R-03'));
  assert.equal(ev.tier, 3);
  const ret = S.st().events.find((e) => e.type === 'REGISTER_RETIRED');
  assert.equal(ret.module, 'M1');
  assert.deepEqual(ret.obligations, ['O4', 'O6']);
});

test('an Op Risk release logs a risk acceptance for Internal Audit, and Internal Audit cannot run the controls it audits', () => {
  const S = freshStore();
  const E = globalThis.PCAP.engine;
  const p = S.submitInstruction(E.REPLAY.instruction(), 'U-MK1');
  S.checkPayment(p.id, 'U-CK1', '');
  S.approverOpen(p.id);
  assert.equal(S.approverRekey(p.id, 7820000, 'INTEREST').status, 'retry');
  assert.equal(S.approverRekey(p.id, 7820000, 'INTEREST').status, 'fire');
  S.approverEscalate(p.id, { dwellSec: 30, note: '' });
  assert.throws(() => S.opRiskRelease(p.id, 'U-OR1', 'Approved business exception', 'Released with the maker as owner.', null, { ownerId: 'U-MK1' }), /first-line risk owner/);
  assert.equal(S.payment(p.id).status, 'HELD', 'a failed acceptance leaves the hold in place');

  S.opRiskRelease(p.id, 'U-OR1', 'Approved business exception', 'Released to show the acceptance record.', 12, { ownerId: 'U-HLO' });
  const acc = S.payment(p.id).opRisk.acceptance;
  assert.equal(acc.id, 'RA-0001');
  assert.equal(acc.expires, S.today());
  const ev = S.st().events.find((e) => e.type === 'RISK_ACCEPTED' && e.paymentId === p.id);
  assert.ok(ev, 'risk acceptance logged');
  assert.deepEqual(ev.obligations, ['O1', 'O2']);
  assert.match(ev.detail, /Risk owner: Dana F\. \(first line\)/);
  assert.equal(S.riskAcceptances().length, 1);
  const rk = S.st().events.filter((e) => e.type === 'REKEY' && e.paymentId === p.id);
  assert.ok(rk.every((e) => e.data.nature === 'INTEREST' && e.data.computedNature === 'PRINCIPAL_AND_INTEREST'), 're-key events keep the stated and computed payment type');

  assert.throws(() => S.runReconciliation('U-IA1'), /Internal Audit/);
  assert.throws(() => S.runRegressionTest('U-IA1'), /Internal Audit/);
  const ret = S.st().events.find((e) => e.type === 'RETURNED');
  assert.ok(ret && ret.data && 'stage' in ret.data, 'returns record the stage, for the outsourced provider view');
});
