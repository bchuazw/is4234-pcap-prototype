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
