/*
 * PCAP zero-learning tests (26 Oct 2026): plain words on every screen, the guided tour that replays the 2020 payment,
 * "Try it yourself" practice payments, asking before clearing someone's own data, and recorded text shown in plain words.
 * Runs in Node with in-memory state. Synthetic data only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const P = require('../js/plain.js');

function freshStore() {
  for (const f of ['../js/util.js', '../js/store.js', '../js/tour.js']) delete require.cache[require.resolve(f)];
  globalThis.PCAP = { engine: E, data: require('../data/seed-data.js'), plain: P };
  require('../js/util.js');
  require('../js/store.js');
  const tour = require('../js/tour.js');
  const S = globalThis.PCAP.store;
  S.reset();
  return { S, tour };
}
const ROLES = ['maker', 'checker', 'approver', 'oprisk', 'owner', 'audit', 'board', 'vendor'];
const ROUTES = ['desk', 'register', 'analytics', 'monitor', 'oversight', 'synthetic', 'events', 'about'];

test('every screen has one plain line for every role: no report codes, no dashes, no semicolons, three sentences at most', () => {
  for (const route of ROUTES) {
    for (const role of ROLES) {
      for (const c of [{}, { n: 1 }, { n: 3, red: 2, teams: 'Team TPA' }, { form: 1 }, { form: 2 }]) {
        const line = P.intro(route, role, c);
        assert.ok(line.length > 20, route + ' ' + role + ' has a line');
        assert.deepEqual(P.copyProblems(line, { codesOk: route === 'about' }), [], route + ' ' + role + ': ' + line);
        assert.ok(P.sentences(line) <= 3, route + ' ' + role + ' is short: ' + line);
      }
    }
  }
  assert.match(P.intro('desk', 'approver', { n: 2 }), /2 payments are waiting/);
  assert.match(P.intro('desk', 'oprisk', { n: 1 }), /1 payment is waiting/);
  assert.match(P.intro('desk', 'maker', { form: 1 }), /Review payment/);
});

test('tabs, tiers and roles use plain words, and the old How to demo link opens Home', () => {
  assert.deepEqual(P.ROUTES.map((r) => r.label), ['Home', 'Payments', 'Workarounds', 'Approval habits', 'Daily checks', 'Board and audit', 'Test results', 'Activity log']);
  P.ROUTES.forEach((r) => assert.deepEqual(P.copyProblems(r.label), []));
  assert.equal(P.ALIASES.guide, 'home');
  assert.equal(P.PAGES.about.label, 'About this prototype');
  assert.deepEqual([1, 2, 3].map((t) => P.tier(t).label), ['Routine', 'Needs a closer look', 'Stopped']);
  assert.deepEqual([1, 2, 3].map((t) => P.tier(t).code), ['Tier 1', 'Tier 2', 'Tier 3']);
  assert.deepEqual(P.CARDS.map((c) => c.title), ['I key payments', 'I approve payments', 'I review risks', 'I oversee and audit']);
  P.CARDS.forEach((c) => { assert.deepEqual(P.copyProblems(c.line), []); assert.equal(P.sentences(c.line) <= 2, true); });
  ROLES.forEach((r) => assert.ok(P.roleName(r) && !P.CODE_RE.test(P.roleName(r))));
});

test('the tour tells the 2020 story in short plain steps and ends on That\'s PCAP', () => {
  const { tour } = freshStore();
  const steps = tour.STEPS;
  assert.ok(steps.length >= 9 && steps.length <= 11, 'about 8 to 10 steps plus the end card');
  assert.equal(steps[steps.length - 1].id, 'end');
  assert.equal(steps[steps.length - 1].title, 'That\'s PCAP');
  for (const s of steps) {
    assert.deepEqual(P.copyProblems(s.title), [], s.id + ' title');
    assert.deepEqual(P.copyProblems(s.text), [], s.id + ' text');
    assert.ok(P.sentences(s.text) <= 2, s.id + ' has one or two sentences: ' + s.text);
    if (!s.end) assert.ok(typeof s.target === 'string' && s.target.length > 1, s.id + ' has a spotlight target');
  }
  const blocked = steps.find((s) => s.id === 'blocked');
  assert.match(blocked.text, /2020/, 'the tour says where 2020 went wrong');
  assert.match(blocked.text, /cannot go to the checker/);
  assert.match(steps.find((s) => s.id === 'oprisk').text, /cannot release money/);
  assert.match(steps.find((s) => s.id === 'oprisk').text, /Head of Loan Ops decides on release/, 'one sentence on the false-alarm path');
  assert.match(steps.find((s) => s.id === 'rekey').text, /own notice/);
  assert.ok(steps.some((s) => s.id === 'routine'), 'the routine one-click contrast is in the tour');
  assert.ok(!steps.some((s) => /passes it on|checker passes/i.test(s.text)), 'no step sends a stopped payment on');
});

test('the tour runs the real controls end to end: stopped when keyed, never sent on, returned by Op Risk, fixed, re-keyed blind, only interest released, and a routine payment in one click', () => {
  const { S, tour } = freshStore();
  const ids = tour.replayTo(S, E, tour.STEPS.length - 1);
  const replay = S.payment(ids.revlon), clean = S.payment(ids.clean);
  const evs = S.st().events.filter((e) => e.paymentId === ids.revlon);
  const firstRound = evs.slice(0, evs.findIndex((e) => e.type === 'RESUBMITTED'));
  assert.deepEqual(firstRound.filter((e) => e.type === 'RULE_RESULT' && e.result === 'fire').map((e) => e.rule).sort(), ['R-01', 'R-02', 'R-04']);
  assert.ok(!firstRound.some((e) => e.type === 'CHECKED' || e.type === 'REKEY' || e.type === 'GATE_CHECK'), 'the stopped payment never reached the checker or the approver');
  const held = firstRound.find((e) => e.type === 'HELD');
  assert.ok(held && held.data.stage === 'maker', 'referred to Operational Risk by the maker, with a reason');
  assert.ok(firstRound.some((e) => e.type === 'OPRISK_REJECTED'), 'Operational Risk returned it as a real error');
  assert.ok(!evs.some((e) => e.type === 'RISK_ACCEPTED' || e.type === 'OWNER_RELEASED'), 'no risk sign-off for a real error');
  const second = evs.slice(evs.findIndex((e) => e.type === 'RESUBMITTED'));
  assert.equal(second[0].data.tier, 2, 'fixed: only interest leaves, still a closer look because it uses a workaround');
  assert.ok(second.some((e) => e.type === 'REKEY' && e.result === 'pass' && e.data.nature === 'INTEREST'), 'the approver typed their own figure and it matched');
  assert.equal(replay.status, 'RELEASED');
  assert.equal(replay.releasedTier, 2);
  assert.equal(replay.releasedExternal, 7820000, 'only USD 7.82M of interest left the bank');
  assert.equal(replay.releasedPrincipal, 0, 'the principal stayed in the bank');
  assert.equal(clean.status, 'RELEASED');
  assert.equal(clean.releasedTier, 1, 'routine');
  assert.equal(clean.approval.attempts.length, 0, 'no re-key asked for a routine payment');
  assert.equal(S.hasUserData(), false, 'what the tour did does not count as the person\'s own data');
  const views = tour.STEPS.map((s) => s.view(ids));
  views.forEach((v) => assert.ok(['maker', 'checker', 'approver', 'oprisk'].includes(v.role) && (v.form || v.sel)));
  assert.equal(tour.STEPS.filter((s) => !s.end).length, 10, 'ten steps and the end card');
});

test('Back rebuilds any step the same way every time', () => {
  const { S, tour } = freshStore();
  const shape = () => S.st().payments.map((p) => [p.id, p.status, p.version, (p.approval || {}).rekey || null].join(':')).join(' ');
  for (let k = 0; k < tour.STEPS.length; k++) {
    tour.replayTo(S, E, k);
    const a = shape();
    tour.replayTo(S, E, k);
    assert.equal(shape(), a, 'step ' + k + ' rebuilds the same');
  }
});

test('a reset asks first only when the person has data of their own', () => {
  const { S } = freshStore();
  assert.equal(S.hasUserData(), false, 'fresh demo data');
  S.reviewWorkaround('WA-02', 'U-HLO');
  assert.equal(S.hasUserData(), true, 'a register review is the person\'s own');
  S.reset();
  assert.equal(S.hasUserData(), false);
  const p = S.referInstruction(E.REPLAY.instruction(), 'U-MK1', 'Set up as WA-01 for the roll-up. Please check it.');
  assert.ok(p && S.hasUserData(), 'a payment the person keyed is their own');
  S.markAuto();
  assert.equal(S.hasUserData(), false, 'unless the app made it (tour or practice)');
});

test('Try it yourself: practice work waits for every role, marked as demo data', () => {
  const { S } = freshStore();
  const ids = S.practice();
  assert.equal(S.hasUserData(), false);
  assert.equal(S.waitingFor('checker').length, 1);
  assert.equal(S.currentEval(S.waitingFor('checker')[0]).tier, 2, 'the scheduled instalment sends principal out, so it needs a closer look');
  const forApprover = S.waitingFor('approver');
  assert.equal(forApprover.length, 2);
  assert.deepEqual(forApprover.map((p) => S.currentEval(p).tier).sort(), [1, 2], 'one routine, one closer look');
  assert.equal(S.st().payments.filter((p) => p.status === 'CHECKED')[0].id, ids.routine, 'the routine one opens first');
  const held = S.waitingFor('oprisk');
  assert.equal(held.length, 1);
  assert.equal(held[0].id, ids.stopped);
  assert.equal(S.currentEval(held[0]).tier, 3);
  const owner = S.waitingFor('owner');
  assert.deepEqual(owner.map((p) => p.id), [ids.toRelease], 'a signed-off false alarm waits for the Head of Loan Ops');
  assert.equal(S.currentEval(owner[0]).tier, 3);
  assert.equal(S.todoCounts('audit').items.find((i) => i.route === 'oversight').count, 2, 'Internal Audit reviews every risk sign-off, released or not');
  S.riskAcceptances().forEach((x) => assert.equal(x.acceptance.ownerId, 'U-HLO', 'owned by the Head of Loan Ops'));
  assert.equal(S.payment(ids.signedOff).status, 'RELEASED');
  assert.equal(S.payment(ids.signedOff).releasedBy, 'U-HLO', 'released by the Head of Loan Ops, not Operational Risk');
  assert.ok(S.st().events.filter((e) => [ids.signedOff, ids.toRelease, ids.stopped, ids.routine, ids.closerLook, ids.toCheck].includes(e.paymentId)).every((e) => e.seeded), 'practice steps are tagged as demo data');
});

test('recorded evidence keeps its codes but reads in plain words on screen', () => {
  const { S, tour } = freshStore();
  tour.replayTo(S, E, 8);
  S.practice();
  S.runReconciliation('U-OR1');
  S.runRegressionTest('U-OR1');
  const texts = S.st().events.map((e) => e.detail)
    .concat(S.controlHealth().controls.map((c) => c.message))
    .concat(S.riskAcceptances().map((x) => x.acceptance.followUp));
  assert.ok(texts.some((t) => P.CODE_RE.test(t)), 'the stored evidence still has the report codes');
  for (const t of texts) {
    const plain = P.plainText(t);
    assert.ok(!P.CODE_RE.test(plain), 'no code left in: ' + plain);
    assert.deepEqual(P.copyProblems(plain).filter((x) => x === 'dash'), []);
  }
  assert.equal(P.plainText('Tier 3 hard stop. Sent to Operational Risk by Lena B. Rules: R-01, R-02.'), 'Stopped. Sent to Operational Risk by Lena B.');
  assert.equal(P.plainText('M3 gate open. Lena B. is independent.'), 'Approver allowed. Lena B. is independent.');
  assert.equal(P.eventName('HELD'), 'Stopped, referred to Op Risk');
  assert.equal(P.eventName('OWNER_RELEASED'), 'Released by the Head of Loan Ops');
  Object.keys(P.EVENTS).forEach((k) => assert.ok(!P.CODE_RE.test(P.EVENTS[k]), k));
});
