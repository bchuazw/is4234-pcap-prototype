/*
 * PCAP report-alignment tests (2 Nov 2026): the prototype matches report sections 5.4 and 5.5 and the review fixes.
 * Stopped payments cannot move forward, Operational Risk assesses but cannot release, only the Head of Loan Ops
 * releases, concentrated reviewer pairs, the 24-hour escalation, and no browser pop-ups anywhere.
 * Runs in Node with in-memory state. Synthetic data only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../js/engine.js');

const ROOT = path.join(__dirname, '..');

function filesUnder(dir, ext) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...filesUnder(full, ext));
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

function freshStore() {
  for (const f of ['../js/util.js', '../js/store.js', '../js/tour.js']) delete require.cache[require.resolve(f)];
  globalThis.PCAP = { engine: E, data: require('../data/seed-data.js'), plain: require('../js/plain.js') };
  require('../js/util.js');
  require('../js/store.js');
  const S = globalThis.PCAP.store;
  S.reset();
  return S;
}
const LEND = { FRONT: E.LENDERS, FUND: E.LENDERS, PRINCIPAL: E.LENDERS };
const WASH = { FRONT: E.WASH, FUND: E.WASH, PRINCIPAL: E.WASH };
function rollUp(S, over) {
  return Object.assign({ loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: S.today(), interest: 2145000, principal: 310000000, overrideCode: 'WA-01', fields: Object.assign({}, WASH), makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }, over || {});
}
const REASON = 'The agent notice has the new rate. Please check it.';

test('a stopped payment has no forward path: an incomplete or unregistered workaround is blocked at the maker, and nobody can send it on', () => {
  const S = freshStore();
  const n = S.st().payments.length;
  assert.throws(() => S.submitInstruction(rollUp(S, { fields: { FRONT: E.WASH, FUND: E.LENDERS, PRINCIPAL: E.WASH } }), 'U-MK1'), /cannot go to the checker/, 'R-04 incomplete workaround');
  assert.throws(() => S.submitInstruction(rollUp(S, { overrideCode: 'OVR-PRIN-HOLD' }), 'U-MK1'), /cannot go to the checker/, 'R-03 unregistered workaround');
  assert.equal(S.st().payments.length, n, 'nothing reached the checker');
  assert.throws(() => S.referInstruction(rollUp(S), 'U-MK1', REASON), /Only a stopped payment/, 'a payment that is not stopped goes to the checker, not to Operational Risk');

  /* A payment that becomes stopped after it was sent (WA-01 retired meanwhile) cannot go on to the approver either. */
  const p = S.submitInstruction(rollUp(S), 'U-MK1');
  S.retireWorkaround('WA-01', 'U-HLO');
  assert.equal(S.currentEval(p).tier, 3);
  assert.throws(() => S.checkPayment(p.id, 'U-CK1', 'Looks fine to me, sending it on.'), /cannot go to the approver/);
  assert.equal(S.payment(p.id).status, 'SUBMITTED');
  assert.throws(() => S.refer(p.id, 'U-CK1', 'short'), /15 characters/);
  S.refer(p.id, 'U-CK1', 'WA-01 was retired after the maker keyed this. Please assess.');
  assert.equal(S.payment(p.id).status, 'HELD');
  assert.equal(S.payment(p.id).referral.stage, 'checker');
  assert.ok(!S.st().events.some((e) => e.paymentId === p.id && e.type === 'CHECKED'), 'never marked checked');
});

test('Operational Risk cannot release: it returns a real error or records a risk acceptance, and only the Head of Loan Ops releases', () => {
  const S = freshStore();
  assert.equal(typeof S.opRiskRelease, 'undefined', 'there is no Operational Risk release action at all');
  const p = S.referInstruction({ loanId: 'LN-1009', operation: 'INTEREST', valueDate: S.today(), interest: 1365000, principal: 0, overrideCode: '', fields: LEND, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }, 'U-MK1', REASON);
  assert.equal(S.currentEval(p).tier, 3, '8.3% off a USD 1.26M line is a hard stop under the 5% rule');
  S.opRiskAccept(p.id, 'U-OR1', E.ACCEPT_CATEGORIES[0], 'False alarm. The rate reset and the schedule line is out of date.', 60, { ownerId: 'U-HLO' });
  const q = S.payment(p.id);
  assert.equal(q.status, 'ACCEPTED');
  assert.equal(q.releasedExternal, undefined, 'recording the acceptance released nothing');
  assert.ok(!S.st().events.some((e) => e.paymentId === p.id && (e.type === 'RELEASED' || e.type === 'OWNER_RELEASED')));
  assert.deepEqual(S.waitingFor('owner').map((x) => x.id), [p.id]);
  assert.deepEqual(S.waitingFor('oprisk').map((x) => x.id), []);

  for (const who of ['U-OR1', 'U-AP1', 'U-MK1', 'U-IA1']) {
    assert.throws(() => S.ownerRelease(p.id, who), /not the Head of Loan Ops/, who + ' cannot release it');
    assert.equal(S.payment(p.id).status, 'ACCEPTED');
  }
  const blocked = S.st().events.filter((e) => e.paymentId === p.id && e.type === 'BLOCKED_ATTEMPT' && e.data && e.data.releaser);
  assert.ok(blocked.length >= 4, 'each refused release attempt is logged');

  S.ownerRelease(p.id, 'U-HLO', { decideSec: 30 });
  const r = S.payment(p.id);
  assert.equal(r.status, 'RELEASED');
  assert.equal(r.releasedBy, 'U-HLO');
  assert.equal(r.viaAcceptance, true);
  assert.equal(r.opRisk.acceptance.status, 'released');
  assert.equal(r.opRisk.acceptance.release.by, 'U-HLO');
  const evs = S.st().events.filter((e) => e.paymentId === p.id);
  const checks = evs.filter((e) => e.type === 'RELEASE_CHECK');
  assert.deepEqual(checks.map((e) => e.rule + ':' + e.result), ['R-05:pass', 'R-06:pass'], 'authority and independence of the releaser recorded');
  assert.ok(evs.some((e) => e.type === 'RULE_RESULT' && e.data && e.data.atRelease && e.rule === 'R-01' && e.result === 'fire'), 'rules re-run and logged at release');
  const rel = evs.find((e) => e.type === 'OWNER_RELEASED');
  assert.match(rel.detail, /Released by Dana F\. \(Head of Loan Ops, first line\) as a fresh decision/);
  assert.deepEqual(rel.obligations, ['O1', 'O2']);
});

test('the screens offer no forward path for a stopped payment and no release button for Operational Risk', () => {
  const desk = fs.readFileSync(path.join(ROOT, 'js', 'views', 'desk.js'), 'utf8');
  assert.ok(!/anyway/i.test(desk), 'no "send it on anyway" path on the payment desk');
  assert.ok(!/opr-release|opRiskRelease|Sign off and release/.test(desk), 'Operational Risk has no release button');
  const checker = desk.slice(desk.indexOf('function checkerPanel('), desk.indexOf('function kbdHint('));
  const stopped = checker.slice(checker.indexOf('if (m.tier === 3)'), checker.indexOf('return \'<section class="card action" aria-label="Your check">'));
  assert.ok(stopped.length > 50 && !/data-action="check"/.test(stopped), 'the stopped checker panel can only return or refer');
  assert.match(stopped, /data-action="return-open"/);
  assert.match(stopped, /referBlock\(/);
  const owner = desk.slice(desk.indexOf('function ownerPanel('), desk.indexOf('function countText('));
  assert.match(owner, /data-action="owner-release"/, 'the release button is on the Head of Loan Ops panel only');
  assert.ok(desk.split('data-action="owner-release"').length === 2, 'one release button for a stopped payment, nowhere else');
});

test('the Head of Loan Ops can decline, and an acceptance from yesterday cannot be used today', () => {
  const S = freshStore();
  const mk = () => S.referInstruction({ loanId: 'LN-1009', operation: 'INTEREST', valueDate: S.today(), interest: 1365000, principal: 0, overrideCode: '', fields: LEND, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }, 'U-MK1', REASON);
  const a = mk();
  S.opRiskAccept(a.id, 'U-OR1', E.ACCEPT_CATEGORIES[0], 'False alarm. The rate reset and the schedule line is out of date.');
  assert.throws(() => S.ownerDecline(a.id, 'U-HLO', 'no'), /15 characters/);
  S.ownerDecline(a.id, 'U-HLO', 'Wait for the corrected schedule line before paying.');
  assert.equal(S.payment(a.id).status, 'RETURNED');
  assert.equal(S.payment(a.id).returnStage, 'owner');
  assert.equal(S.payment(a.id).opRisk.acceptance.status, 'declined');
  assert.ok(S.st().events.some((e) => e.paymentId === a.id && e.type === 'OWNER_DECLINED'));

  const S2 = freshStore();
  const b = S2.referInstruction({ loanId: 'LN-1009', operation: 'INTEREST', valueDate: S2.today(), interest: 1365000, principal: 0, overrideCode: '', fields: LEND, makerId: 'U-MK1', checkerId: 'U-CK1', approverId: 'U-AP1' }, 'U-MK1', REASON);
  S2.opRiskAccept(b.id, 'U-OR1', E.ACCEPT_CATEGORIES[0], 'False alarm. The rate reset and the schedule line is out of date.');
  S2.S.fakeDate = E.addDays(S2.today(), 1);
  try {
    assert.throws(() => S2.ownerRelease(b.id, 'U-HLO'), /ended on/, 'the acceptance expired with the business day');
  } finally { S2.S.fakeDate = null; }
  assert.equal(S2.payment(b.id).status, 'ACCEPTED');
});

test('R-08 concentrated reviewer pairs: 60% of one maker\'s payments in a team, at least 10, counted apart from the score', () => {
  const rows = (team, role, maker, counts) => Object.keys(counts).flatMap((rev) => Array.from({ length: counts[rev] }, () => ({ team, role, reviewerId: rev, makerId: maker })));
  const a = E.reviewerPairs(rows('T1', 'approver', 'M1', { A: 6, B: 2, C: 2 }));
  assert.equal(a.count, 1, '6 of 10 is 60%: flagged');
  assert.deepEqual(a.pairs[0], { team: 'T1', role: 'approver', reviewerId: 'A', makerId: 'M1', reviews: 6, makerReviews: 10, share: 0.6 });
  assert.deepEqual(a.byTeam, { T1: 1 });
  assert.equal(E.reviewerPairs(rows('T1', 'approver', 'M1', { A: 6, B: 3 })).count, 0, 'only 9 reviews of that maker: too few to judge');
  assert.equal(E.reviewerPairs(rows('T1', 'approver', 'M1', { A: 5, B: 3, C: 2 })).count, 0, '50% is not concentrated');
  const mixed = E.reviewerPairs(rows('T1', 'approver', 'M1', { A: 4, B: 3, C: 3 }).concat(rows('T1', 'checker', 'M1', { K: 10 })));
  assert.equal(mixed.count, 1, 'checkers and approvers are counted separately');
  assert.equal(mixed.pairs[0].role, 'checker');
  /* The pair signal is not part of the 40/30/30 score. */
  const reviews = [{ tier: 2, dwellSec: 20, rekey: 'match', decision: 'approve', makerId: 'M1' }];
  assert.deepEqual(E.summariseReviews(reviews), E.summariseReviews(reviews.map((r) => Object.assign({}, r, { makerId: 'M2' }))));
  assert.match(E.RULES['R-08'].logic, /concentrated reviewer pairs/);

  /* The demo shows one flagged pair, in a team big enough to report. */
  const S = freshStore();
  const p = S.reviewerPairs();
  assert.ok(p.count >= 1, 'at least one flagged pair in the demo');
  const team = p.pairs[0].team;
  const size = S.st().ctx.users.filter((u) => u.team === team && u.roles.includes('approver')).length;
  assert.ok(E.teamReportable(size), team + ' has ' + size + ' approvers, so its count can be shown');
  assert.equal(p.pairs[0].role, 'approver');
  assert.ok(p.pairs[0].share >= 0.6 && p.pairs[0].makerReviews >= 10);
  /* Names stay behind the logged named view. */
  const analytics = fs.readFileSync(path.join(ROOT, 'js', 'views', 'analytics.js'), 'utf8');
  const tileSrc = analytics.slice(analytics.indexOf('function pairsTile('), analytics.indexOf('function pairsTable('));
  assert.ok(!/userName/.test(tileSrc), 'the team-level tile never names a person');
  assert.throws(() => S.logIndividualView('U-OR1', 'short'), /15 characters/, 'the named view needs a logged reason');
  assert.throws(() => S.logIndividualView('U-AP1', 'Reviewing the pairs before coaching.'), /Only Operational Risk/);
});

test('24-hour escalation: a failed control shows how long it has been open, and over 24 hours it is escalated to Operational Risk', () => {
  const DATA = require('../data/seed-data.js');
  const BD = '2026-10-24';
  const c = E.buildDemoContext(DATA, BD);
  const base = { businessDate: BD, nowTime: '11:00', register: c.register, users: c.users, payments: [], reconRuns: [], regressionRuns: [{ date: E.addDays(BD, -3), pass: true }] };
  const h = E.controlHealth(base);
  const cc02 = h.controls.find((x) => x.id === 'CC-02');
  assert.equal(cc02.failed, true, 'a review overdue for 23 days has failed (R-09: failed or overdue)');
  assert.equal(cc02.since, E.addDays(BD, -23) + ' 00:00');
  assert.ok(cc02.openHours > 24 * 23);
  assert.equal(cc02.escalated, true);
  assert.deepEqual(h.escalated, ['CC-02']);
  assert.equal(h.controls.find((x) => x.id === 'CC-03').failed, false, 'a dispensation that ends soon has not failed yet');
  /* A failure younger than 24 hours goes to its owner only. */
  const failedToday = E.controlHealth(Object.assign({}, base, { regressionRuns: [{ date: BD, pass: false, detail: 'Tier 1 instead of 3' }] })).controls.find((x) => x.id === 'CC-06');
  assert.equal(failedToday.failed, true);
  assert.equal(failedToday.openHours, 11);
  assert.equal(failedToday.escalated, false);
  const late = E.controlHealth(Object.assign({}, base, { nowTime: '18:30', payments: [{ id: 'P1', status: 'RELEASED', releasedDate: BD, releasedTime: '10:00', releasedExternal: 1, expectedAtRelease: 1 }] })).controls.find((x) => x.id === 'CC-01');
  assert.equal(late.rag, 'red');
  assert.equal(late.since, BD + ' 18:00');
  assert.equal(late.openHours, 0.5);
  assert.equal(late.escalated, false);
  const yesterday = E.controlHealth(Object.assign({}, base, { payments: [{ id: 'P2', status: 'HELD', heldDate: E.addDays(BD, -2) }] })).controls.find((x) => x.id === 'CC-05');
  assert.equal(yesterday.escalated, true, 'a stopped payment left undecided for more than a day escalates');
  assert.match(E.RULES['R-09'].action, /escalated to Operational Risk if it is still open after 24 hours/);

  /* The demo shows one escalated failure, logged once, as the app's own step. */
  const S = freshStore();
  const live = S.controlHealth();
  assert.deepEqual(live.escalated, ['CC-02']);
  const evs = () => S.st().events.filter((e) => e.type === 'CONTROL_ESCALATED');
  assert.equal(evs().length, 1);
  assert.equal(evs()[0].module, 'M5');
  assert.equal(evs()[0].rule, 'R-09');
  assert.match(evs()[0].detail, /Sent to its owner, Dana F\., and escalated to Operational Risk/);
  S.controlHealth(); S.controlHealth();
  assert.equal(evs().length, 1, 'logged once, not on every look');
  assert.equal(S.hasUserData(), false, 'the escalation is the app\'s own step');
  assert.ok(S.todoCounts('oprisk').items.some((i) => i.route === 'monitor' && /escalated to you/.test(i.text)));
});

test('the expected amount is independent: the off-cycle 2020 line was added and approved outside the maker\'s team, and the screen says so', () => {
  const DATA = require('../data/seed-data.js');
  const c = E.buildDemoContext(DATA, '2026-11-02');
  const team = (id) => E.byId(c.users, id).team;
  const replay = E.expectedFor(E.byId(c.loans, 'LN-REV16'), '2020-08-11').source;
  assert.equal(replay.offCycle, true);
  assert.equal(replay.addedBy, 'U-AGY1');
  assert.equal(replay.approvedBy, 'U-HLO');
  assert.equal(replay.addedOn, '2020-08-06');
  const maker = team('U-MK1');
  assert.notEqual(team(replay.addedBy), maker, 'added outside the maker\'s team');
  assert.notEqual(team(replay.approvedBy), maker, 'approved outside the maker\'s team');
  assert.notEqual(replay.addedBy, replay.approvedBy, 'added and approved by different people');
  const roll = E.expectedFor(E.byId(c.loans, 'LN-1004'), '2026-11-02').source;
  assert.equal(roll.offCycle, true, 'today\'s roll-up interest line is off-cycle too');
  assert.equal(E.expectedFor(E.byId(c.loans, 'LN-1001'), '2026-11-02').source.offCycle, false, 'a quarterly line comes from the loan agreement');
  const desk = fs.readFileSync(path.join(ROOT, 'js', 'views', 'desk.js'), 'utf8');
  assert.match(desk, /Where that comes from/);
  assert.match(desk, /outside the maker\\'s team/);
});

test('wording matches the court record and the run: before release, a documented three-field workaround, no unsupported claims', () => {
  const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.match(src('js/views/home.js'), /None of their screens showed, before release, what it would really do\./);
  const all = filesUnder(path.join(ROOT, 'js'), '.js').concat(filesUnder(path.join(ROOT, 'data'), '.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/undocumented|informal workaround|unofficial|tacit/i.test(all), 'no label calls the workaround undocumented, informal, unofficial or tacit');
  const about = src('js/views/about.js');
  assert.match(about, /manual three-field workaround/);
  assert.ok(!/half an hour/.test(about), 'the unsupported review-time claim is gone');
  assert.ok(!/cannot be recalled/.test(about), 'the unsupported recall claim is gone');
  assert.match(about, /About 0\.56 in 2020/, 'the exposure fact stays');
  assert.ok(!/refused to return/.test(about));
  assert.match(about, /lenders did not return/);
  /* Run figures are computed from the engine, not typed in. */
  for (const old of ['15 holds', '82%', '409', '41.1 s', '7.2 s', '13.2 s', '1,138', 'f5f23476', 'scored 75']) assert.ok(about.indexOf(old) < 0, 'no hard-coded ' + old);
  assert.match(about, /PCAP\.views\.value\.run\(\)/);
  /* Test results and About say what the synthetic test does and does not show, and what protects a Tier 1 payment. */
  assert.match(src('js/views/synthetic.js'), /not evidence that PCAP works on real payments/);
  assert.match(src('js/views/synthetic.js'), /About 1 in 10 planted mistakes are tiny slips meant to get through/);
  assert.match(about, /For a Tier 1 payment the approver reads one sentence and clicks once, so the automated checks, R-01 against the loan schedule and R-02 against unscheduled principal, are what protect those payments/);
  assert.match(about, /Off-cycle schedule lines, such as the 2020 roll-up interest, must be created and approved outside the maker/);
});

test('the 50-seed figures the About page and README quote equal a fresh run of seeds 1 to 50', () => {
  const a = E.runSeedSweep({ from: 1, to: 50 });
  const ref = E.REFERENCE_SWEEP;
  for (const k of ['seeds', 'errors', 'stopped', 'rateMin', 'rateMedian', 'rateMax', 'foundAfter', 'missed', 'clean', 'falseAlarms', 'falseAlarmsHeld', 'replayFails']) assert.equal(a[k], ref[k], k);
  for (const c of ['T3', 'GATE', 'T2', 'BELOW']) {
    assert.equal(a.classes[c].count, ref.classes[c].count, c + ' count');
    assert.equal(a.classes[c].stopped, ref.classes[c].stopped, c + ' stopped');
    assert.equal(a.classes[c].foundAfter, ref.classes[c].foundAfter, c + ' found after');
  }
});

test('every script parses, including the screens the Node tests do not load', () => {
  const files = filesUnder(path.join(ROOT, 'js'), '.js').concat(filesUnder(path.join(ROOT, 'data'), '.js'));
  for (const f of files) {
    assert.doesNotThrow(() => new Function(fs.readFileSync(f, 'utf8')), path.relative(ROOT, f) + ' has a syntax error');
  }
});

test('no native confirm, prompt or alert is left anywhere: every question uses the in-page dialog', () => {
  const files = filesUnder(path.join(ROOT, 'js'), '.js').concat(filesUnder(path.join(ROOT, 'data'), '.js'), [path.join(ROOT, 'index.html')]);
  const bare = /(^|[^.\w$])(confirm|prompt|alert)\s*\(/m;
  const named = /\b(window|root|self|globalThis|top|parent|document)\s*\.\s*(confirm|prompt|alert)\s*\(/;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!bare.test(src), path.relative(ROOT, f) + ' calls a native pop-up: ' + (bare.exec(src) || [''])[0]);
    assert.ok(!named.test(src), path.relative(ROOT, f) + ' calls a native pop-up: ' + (named.exec(src) || [''])[0]);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/dialog.js') > 0 && html.indexOf('js/dialog.js') < html.indexOf('js/views/'), 'the dialog loads before the screens');
  const dlg = fs.readFileSync(path.join(ROOT, 'js', 'dialog.js'), 'utf8');
  assert.match(dlg, /Escape/, 'Esc cancels');
  assert.match(dlg, /'Enter'/, 'Enter confirms');
  assert.match(dlg, /showModal/, 'focus moves into a modal dialog');
});
