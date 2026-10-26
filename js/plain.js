/*
 * PCAP prototype: plain words for every screen (zero-learning pass, 25 Oct 2026).
 *
 * The screens explain themselves in plain English. Report codes (M1 to M6, R-01 to R-09, Tier 1 to 3)
 * are secondary: shown as small tags only when "Show report codes" is on, and always on the About page.
 * This file holds the words only: tab names, tier names, role names, the role cards on Home and the
 * one line at the top of each screen. No DOM, so it also loads in Node for the tests.
 * Classic script in the browser (window.PCAP.plain), CommonJS in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else { root.PCAP = root.PCAP || {}; root.PCAP.plain = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Tabs in plain words. "codes" are the report's module codes, shown as tags only when codes are on. */
  var ROUTES = [
    { id: 'home', label: 'Home', codes: [] },
    { id: 'desk', label: 'Payments', codes: ['M2', 'M3'] },
    { id: 'register', label: 'Workarounds', codes: ['M1'] },
    { id: 'analytics', label: 'Approval habits', codes: ['M4'] },
    { id: 'monitor', label: 'Daily checks', codes: ['M5'] },
    { id: 'oversight', label: 'Board and audit', codes: ['M6'] },
    { id: 'synthetic', label: 'Test results', codes: [] },
    { id: 'events', label: 'Activity log', codes: [] }
  ];
  /* Pages that are not tabs: reached from Home and the footer. */
  var PAGES = { about: { id: 'about', label: 'About this prototype', codes: [] } };
  /* Old links keep working. */
  var ALIASES = { guide: 'home' };

  /* Tiers: the plain name leads, the tier number is secondary. */
  var TIERS = {
    1: { n: 1, label: 'Routine', short: 'Routine', code: 'Tier 1',
      what: 'Matches the loan schedule. The approver reads one sentence and releases it.' },
    2: { n: 2, label: 'Needs a closer look', short: 'Closer look', code: 'Tier 2',
      what: 'Something is a little off, or a workaround is used. The approver types the amount from their own source, then confirms.' },
    3: { n: 3, label: 'Stopped', short: 'Stopped', code: 'Tier 3',
      what: 'The approver cannot release it. Only Operational Risk, a separate team, can decide.' }
  };
  function tier(n) { return TIERS[n] || TIERS[1]; }

  /* Who you are, in plain words. */
  var ROLES = {
    maker: { name: 'Maker', who: 'keys payments', short: 'Maker' },
    checker: { name: 'Checker', who: 'checks the maker\'s work', short: 'Checker' },
    approver: { name: 'Approver', who: 'releases payments', short: 'Approver' },
    oprisk: { name: 'Operational Risk', who: 'decides on stopped payments', short: 'Op Risk' },
    owner: { name: 'Head of Loan Ops', who: 'owns the workarounds', short: 'Head of Loan Ops' },
    audit: { name: 'Internal Audit', who: 'checks the evidence', short: 'Internal Audit' },
    board: { name: 'Board Risk Committee', who: 'reads the results', short: 'Board' },
    vendor: { name: 'Wipro service manager', who: 'sees the provider\'s results', short: 'Wipro' }
  };
  function roleName(id) { return (ROLES[id] || { name: id }).name; }

  /* "Try it yourself" on Home: four plain cards. */
  var CARDS = [
    { role: 'maker', title: 'I key payments', line: 'Fill in a payment. PCAP tells you what it will really do before you send it on.' },
    { role: 'approver', title: 'I approve payments', line: 'Read what each payment will really do, then release it or stop it.' },
    { role: 'oprisk', title: 'I review risks', line: 'Decide on the payments PCAP stopped, and check the daily safety checks ran.' },
    { role: 'audit', title: 'I oversee and audit', line: 'Review risk sign-offs and download the evidence for every payment.' }
  ];

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /*
   * The one line at the top of each screen: what the screen is for, then what to do now, for this role.
   * c = { n: things waiting for or needing this role on this screen, red: red items (Board), teams: teams to follow up }
   */
  function intro(route, role, c) {
    c = c || {};
    var n = +c.n || 0;
    var readOnly = role === 'owner' || role === 'audit' || role === 'board' || role === 'vendor';
    switch (route) {
      case 'desk':
        if (role === 'maker') {
          if (c.form === 2) return 'Payments you key go to a checker, then an approver. Read what PCAP says this one will really do, then send it to the checker or go back and fix it.';
          if (c.form) return 'Payments you key go to a checker, then an approver. Fill in the form and press Review payment to see what it will really do before you send it.';
          return n
            ? 'Payments you key go to a checker, then an approver. ' + plural(n, 'payment came', 'payments came') + ' back to you: open it, fix what PCAP marked and send it again.'
            : 'Payments you key go to a checker, then an approver. Press New payment and PCAP shows what it will really do before you send it.';
        }
        if (role === 'checker') return n
          ? 'Check each payment before it goes to an approver. ' + plural(n, 'payment is', 'payments are') + ' waiting. The first is open: compare it with its source, then send it on or back.'
          : 'Check each payment before it goes to an approver. Nothing is waiting now. Payments appear here when a maker sends one.';
        if (role === 'approver') return n
          ? 'Release payments once you know what they will really do. ' + plural(n, 'payment is', 'payments are') + ' waiting. The first is open: read what it will do, then release it or stop it.'
          : 'Release payments once you know what they will really do. Nothing is waiting now. Payments appear here after a checker sends them on.';
        if (role === 'oprisk') return n
          ? 'Only you can decide on a payment PCAP stopped. ' + plural(n, 'payment is', 'payments are') + ' waiting: read why it was held, then send it back or release it with a written sign-off.'
          : 'Only you can decide on a payment PCAP stopped. None are waiting now. They appear here when an approver sends one.';
        return 'Every payment and where it is now. You can look, but you cannot act on payments in this role.';
      case 'register':
        if (role === 'owner') return n
          ? 'The manual workarounds staff use when the core system cannot do something. ' + plural(n, 'item needs', 'items need') + ' you: use the button next to each one.'
          : 'The manual workarounds staff use when the core system cannot do something. Nothing needs you now. Every workaround is reviewed and in date.';
        return 'The manual workarounds staff use when the core system cannot do something. A payment that uses one not listed here is stopped. Only the Head of Loan Ops can change this list.';
      case 'analytics':
        if (role === 'vendor') return 'How your makers and checkers did this week, as a team. Nobody is named, and you do not see the bank\'s approvers.';
        if (role === 'oprisk') return c.teams
          ? 'Shows whether approver teams read before they release or just click through. Follow up ' + c.teams + ' in the monthly report.'
          : 'Shows whether approver teams read before they release or just click through. No team needs a follow-up this week.';
        return 'Shows whether approver teams read before they release or just click through. Team level only, so nobody is named.';
      case 'monitor':
        if (role === 'oprisk') return n
          ? 'Shows whether the safety checks around payments ran today. ' + plural(n, 'of your checks is', 'of your checks are') + ' not green: run or fix it with the button on its card.'
          : 'Shows whether the safety checks around payments ran today. All of your checks are green.';
        if (role === 'owner') return 'Shows whether the safety checks around payments ran today. Yours are the workaround and approver certificate checks.';
        return 'Shows whether the safety checks around payments ran today. Red means a check failed or did not run. ' + (readOnly ? 'You can read these, not run them.' : 'Operational Risk runs them.');
      case 'oversight':
        if (role === 'audit') return n
          ? 'Everything PCAP recorded, ready for audit. ' + plural(n, 'risk sign-off waits', 'risk sign-offs wait') + ' for your review: mark each one, then download the evidence.'
          : 'Everything PCAP recorded, ready for audit. Nothing waits for your review. Download the evidence to test every payment.';
        if (role === 'board') return c.red
          ? 'The few numbers the Board watches, worst first. ' + plural(c.red, 'is', 'are') + ' red: ask the owner what is being done.'
          : 'The few numbers the Board watches, worst first. None is red this week.';
        return 'The numbers the Board watches and the evidence for audit, all built from what PCAP recorded.';
      case 'synthetic':
        return 'We ran 500 made-up payments with 25 planted mistakes through PCAP. Here is what it caught and what it missed.';
      case 'events':
        return 'Everything PCAP recorded, newest first. Search for a payment to see who did what and when.';
      case 'about':
        return 'For markers: how the prototype maps to our report and the course. Report codes are always shown on this page.';
    }
    return '';
  }

  /* What each recorded step was, in plain words (Activity log and the evidence trail). */
  var EVENTS = {
    SUBMITTED: 'Sent to the checker', RESUBMITTED: 'Fixed and sent again', RULE_RESULT: 'PCAP check', OVERRIDE_USE: 'Workaround used',
    CHECKED: 'Checked', GATE_CHECK: 'Approver allowed', BLOCKED_ATTEMPT: 'Approver not allowed', REKEY: 'Approver typed a figure',
    ESCALATED: 'Stopped after two misses', STATEMENT_SHOWN: 'Shown to the approver', HELD: 'Stopped, sent to Op Risk',
    BEHAVIOUR_SIGNAL: 'Approval habit noted', RELEASED: 'Released', RETURNED: 'Sent back to the maker', CANCELLED: 'Cancelled',
    OPRISK_REJECTED: 'Op Risk rejected it', OPRISK_RELEASED: 'Op Risk released it', RISK_ACCEPTED: 'Risk signed off',
    ACCEPTANCE_REVIEWED: 'Audit reviewed a sign-off', REGISTER_ADDED: 'Workaround added', REGISTER_APPROVED: 'Workaround approved',
    REGISTER_RETIRED: 'Workaround retired', REGISTER_REVIEWED: 'Workaround reviewed', RECON_RUN: 'Reconciliation run',
    CONTROL_TEST: '2020 payment test run', SYNTHETIC_TEST: 'Test results run', EVIDENCE_EXPORTED: 'Evidence downloaded',
    M4_INDIVIDUAL_VIEW: 'Named view opened'
  };
  function eventName(type) { return EVENTS[type] || String(type || '').replace(/_/g, ' ').toLowerCase(); }

  /*
   * Recorded evidence text (the activity log, control messages, sign-off follow-ups) keeps the report's codes, because
   * that is what an auditor tests. On screen, with report codes off, it is shown in plain words. The stored text never changes.
   */
  var SHORT = { 1: 'routine', 2: 'closer look', 3: 'stopped' };
  var PLAIN_RULES = [
    [/Approval blocked at the M3 gate\.\s*/g, 'Approver not allowed. '],
    [/M3 gate open\.\s*/g, 'Approver allowed. '],
    [/\bM3 gate: /g, 'Not allowed to approve: '],
    [/The M3 gate blocks their override approvals\./g, 'PCAP will not let them approve workaround payments.'],
    [/Revlon replay regression test/g, '2020 payment test'],
    [/(R-0\d(, | and )?)+ fired, held at Tier 3/g, 'PCAP stopped it'],
    [/\bTier 3 hard stop\b\.?/g, 'Stopped.'],
    [/PCAP pre-check: Tier ([123])\./g, function (m, n) { return 'PCAP check: ' + TIERS[n].label.toLowerCase() + '.'; }],
    [/Payment escalated to Tier 3\./g, 'PCAP stopped the payment.'],
    [/Escalated to Tier 3\./g, 'PCAP stopped the payment.'],
    [/(\d+) Tier 3 holds? waiting/g, function (m, n) { return n + ' stopped payment' + (n === '1' ? '' : 's') + ' waiting'; }],
    [/\s(at|to) Tier ([123])\b/g, function (m, w, n) { return ' (' + SHORT[n] + ')'; }],
    [/\s*\((R-0\d(, | and )?)+\)/g, ''],
    [/\s*Rules( fired)?: (R-0\d(, | and )?)+\.?/g, ''],
    [/\b[Rr]isk acceptance\b/g, function (m) { return m.charAt(0) === 'R' ? 'Risk sign-off' : 'risk sign-off'; }],
    [/\bthe M1 register\b/g, 'the workaround list'],
    [/\bM1 register\b/g, 'workaround list'],
    [/\(Operational Risk, second line\)/g, '(Operational Risk)'],
    [/\bblind re-key\b/g, 'typed check'],
    [/\bTier ([123])\b/g, function (m, n) { return TIERS[n].label.toLowerCase(); }]
  ];
  function plainText(text) {
    var s = String(text == null ? '' : text);
    PLAIN_RULES.forEach(function (r) { s = s.replace(r[0], r[1]); });
    return s.replace(/\s+\./g, '.').replace(/\.\.(?=\s|$)/g, '.');
  }

  /* Copy rules for every plain-language string: no em or en dashes, no semicolons, and no report codes. */
  var DASH_RE = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');
  var CODE_RE = /\b(M[1-6]|R-0[1-9]|RC[1-5]|O[1-7]|KRI|Tier [123])\b/;
  function copyProblems(text, opts) {
    opts = opts || {};
    var s = String(text || '');
    var out = [];
    if (DASH_RE.test(s)) out.push('dash');
    if (/;/.test(s)) out.push('semicolon');
    if (!opts.codesOk && CODE_RE.test(s)) out.push('code ' + CODE_RE.exec(s)[0]);
    return out;
  }
  function sentences(text) { return String(text || '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).length; }

  return {
    ROUTES: ROUTES, PAGES: PAGES, ALIASES: ALIASES, TIERS: TIERS, ROLES: ROLES, CARDS: CARDS,
    tier: tier, roleName: roleName, intro: intro, EVENTS: EVENTS, eventName: eventName, plainText: plainText, copyProblems: copyProblems, sentences: sentences, CODE_RE: CODE_RE
  };
});
