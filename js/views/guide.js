/*
 * PCAP prototype: "How to demo" screen. What PCAP is, the 5 minute path, module map, the link to the
 * report and the course, feasibility, rules and tiers.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  var STEPS = [
    { n: 1, role: 'maker', route: 'desk', preset: 'revlon', title: 'Maker keys the Revlon replay',
      text: 'The New payment form opens with the Revlon replay. Under Settlement routing only PRINCIPAL is on the wash account. Click Review payment: Tier 3, and PCAP says it will send USD 901.7M to 315 lenders, including USD 893.9M of principal, 115 times what the schedule expects. R-04, R-02 and R-01 fail. Submit it anyway, as happened in 2020.' },
    { n: 2, role: 'checker', route: 'desk', title: 'Checker sends it on anyway',
      text: 'Click Switch to Checker. The checker sees the same consequence card and the failed checks, and PCAP offers Return to maker first. To show what happened in 2020, write a note such as "Principal set to wash" and click Send to approver anyway (a note is needed only at Tier 3). The approver will not see this note until after the blind re-key.' },
    { n: 3, role: 'approver', route: 'desk', title: 'Approver re-keys blind, then reads the consequence',
      text: 'Click Switch to Approver. The amounts are hidden. Open your source (the agent notice), type 7,820,000, pick Interest only and click Check amount. It does not match, so do it again. R-07 escalates, the consequence card appears, and the payment is a Tier 3 hard stop. Send it to Operational Risk.' },
    { n: 4, role: 'oprisk', route: 'desk', title: 'Operational Risk decides, with a reason',
      text: 'Click Switch to Op Risk. Only the second line can release a Tier 3 payment, and only by recording a risk acceptance with a reason, the first-line risk owner and an expiry (open Release it instead to see it). Write a reason and click Reject and return to maker. (If you release it instead, M5 catches it as a reconciliation break.) Every step is now in the event log.' },
    { n: 5, role: 'maker', route: 'desk', title: 'Optional: the maker fixes it',
      text: 'The returned payment waits for the maker. Click Edit and resubmit: the form opens at Settlement routing and marks FRONT and FUND as needing the wash account. Set them, review and resubmit. Now it is Tier 2: only USD 7.8M of interest leaves and the principal stays in the bank. Check it, re-key 7,820,000 as Interest only, tick I confirm and release.' },
    { n: 6, role: 'maker', route: 'desk', preset: 'clean', title: 'Contrast: a clean payment at Tier 1',
      text: 'The form opens with a clean interest payment. Review, submit, check and approve. Tier 1 needs no re-key: the approver reads one sentence and presses Release (or Enter), and the next waiting payment opens by itself. The This week strip shows what PCAP added and caught.' },
    { n: 7, role: 'owner', route: 'register', title: 'M1 register',
      text: 'WA-02 review is overdue and WA-03\'s dispensation is about to expire. As Head of Loan Ops, mark WA-02 reviewed or add a new workaround.' },
    { n: 8, role: 'oprisk', route: 'analytics', title: 'M4 behaviour analytics',
      text: 'Team-level rubber-stamp scores (R-08). Citi Approvers TPA has drifted into red: fast looks and fast approvals after Tier 2 warnings. Below, the outsourced provider card shows a check that sent on a Tier 3 payment.' },
    { n: 9, role: 'oprisk', route: 'monitor', title: 'M5 control monitor',
      text: 'Run the same-day reconciliation as Operational Risk. Red, amber and green status for reconciliation, register reviews, dispensations, certifications, holds and the replay regression test (R-09).' },
    { n: 10, role: 'audit', route: 'oversight', title: 'M6 obligations, Board view and audit evidence',
      text: 'Acting as Internal Audit (third line, read only). Each obligation row maps to its control, rules and live evidence counts from the event log. Check the risk acceptance log, then export the evidence pack as JSON and CSV.' },
    { n: 11, role: 'oprisk', route: 'synthetic', title: 'Synthetic test (report 5.8)',
      text: 'Run 500 seeded synthetic payments with 25 injected errors through the real engine. See detection by error type and tier, false alarms, added time and the Revlon replay result.' }
  ];

  /* Report root causes per module (report 5.1). */
  var MOD_RC = { M1: 'RC2, RC4', M2: 'RC1', M3: 'RC3', M4: 'RC1, RC5', M5: 'RC4', M6: 'RC1 to RC5' };

  var ROOT_CAUSES = [
    ['RC1', 'Approvals evidenced authorisation, not comprehension', 'M2 states what will leave the bank. R-07 blind re-key of the amount and the payment type. M4 watches how approvals happen.', 'desk'],
    ['RC2', 'Legacy system limit handled by an undocumented workaround', 'M1 register with owner, required fields and dispensation. R-03 blocks unregistered overrides, R-04 incomplete ones.', 'register'],
    ['RC3', 'Authority without competency or independence', 'M3 gate: R-05 certification and an approval limit checked against the computed amount, R-06 independent, in-house approver.', 'desk'],
    ['RC4', 'No compensating controls, slow remediation', 'M5 checks the compensating controls run every day (R-09). M1 dispensations and refresh plans put a date on the workaround.', 'monitor'],
    ['RC5', 'Monitoring saw that steps ran, not how people approved', 'M4 R-08 team scores and the outsourced provider card. M6 KRIs and an evidence pack tied to obligations.', 'analytics']
  ];
  var RECS = [
    ['R1', 'Hard stop on unscheduled principal or variance beyond tolerance', 'R-01 and R-02, Tier 3 ground stop', 'desk'],
    ['R2', 'Workaround register, unregistered overrides blocked', 'M1 register, R-03 and R-04', 'register'],
    ['R3', 'Consequence-based entitlements, in-house certified approver', 'R-05 limit against the computed amount, R-06 in-house rule', 'desk'],
    ['R4', 'Competency certification per override type', 'R-05 certification, CC-04 certification currency', 'monitor'],
    ['R5', 'Behavioural MI to the second line and the Board Risk Committee', 'M4 R-08, M6 Board KRIs', 'analytics'],
    ['R6', 'Board-overseen legacy remediation roadmap', 'M1 refresh plans and dispensations, M6 legacy KRI', 'oversight'],
    ['R7', 'Regulators test operating effectiveness', 'Outside PCAP. It is a regulatory recommendation, and the evidence pack is what a supervisor would test', 'oversight']
  ];

  /* What the screens show from IS4234 (lecture in brackets). */
  var COURSE = [
    ['Delegation of authority and segregation of duties (L3, MAS Internal Controls 2.3 and 2.4)', 'M3 gate: certification, an approval limit set by consequence, and independence from the maker and checker. Segregation guards against intent, not an error all three share, so R-07 adds a blind re-key.', 'desk', 'Payment desk'],
    ['Risk tolerance levels (L2 GRC technology, "what actions each level of risk will trigger")', 'Tier 1, 2 and 3 thresholds in R-01, and what each tier makes people do.', 'guide', 'Tiers, below'],
    ['Documented risk acceptance (L5 slide 41)', 'Releasing a Tier 3 hold records the reason, the first-line risk owner, the scope and an expiry. Register dispensations are acceptances with an end date.', 'desk', 'Payment desk (Op Risk), Register'],
    ['L5 risk model: Risk = AV x EF x ARO x CD', 'WA-01 before and after PCAP. PCAP lowers control deficiency, not what is at stake.', 'register', 'Register'],
    ['Compensating controls (report 3.3.3)', 'Schedule check, unscheduled principal hold, governed workaround, certified in-house approver and a same-day reconciliation, each with an owner and a test.', 'monitor', 'Control monitor'],
    ['Outsourcing accountability (L9, MAS Notice 658, Outsourcing Guidelines 3.1.1)', 'The work is outsourced, the accountability is not: override releases need a Citi approver, every register entry has a Citi owner, and the provider\'s checks are monitored.', 'analytics', 'Payment desk, Behaviour analytics'],
    ['Evidence for audit and COSO monitoring (L3)', 'Every step is an event tagged to its module, rule and obligation. Internal Audit can test every payment instead of a sample.', 'events', 'Event log, Obligations and Board'],
    ['RegTech and the compliance register (L1, L2)', 'Compliance technology the bank uses on its own payments. The obligation map is the compliance register, tied to live evidence.', 'oversight', 'Obligations and Board'],
    ['Data quality (L6: accuracy, timeliness, completeness)', 'PCAP is only as good as the loan schedule it reads. A stale line shows up as a false alarm, and a release for one sends a fix to the data owner.', 'synthetic', 'Synthetic test'],
    ['Monitoring staff within the PDPA (L2 agency theory, L4, L6 Amazon France)', 'Behaviour-based control, kept proportionate: team level, at least 3 approvers per team, three signals only, purpose stated, staff told, DPO consulted.', 'analytics', 'Behaviour analytics']
  ];

  var LINES = [
    { head: 'First line: owns the risk', items: ['Maker and checker at Wipro, the outsourced provider (tasks only, never accountable)', 'Citi approver (certified, independent, in-house)', 'Head of Loan Operations: owns M1 to M3, the register and the risk of a Tier 3 release'] },
    { head: 'Second line: oversees and challenges', items: ['Operational Risk: Tier 3 holds and risk acceptances, M4 and M5', 'Compliance: M6 obligation map', 'Reports to the Board Risk Committee'] },
    { head: 'Third line: independent assurance', items: ['Internal Audit: read only, reviews every risk acceptance', 'Pulls the evidence pack and tests every payment', 'Does not run the controls it audits'] }
  ];

  var FEAS = [
    ['In-house approvers', 'A blind re-key and a confirmation at Tier 2 and 3 only. Tier 1 keeps today\'s flow.', 'Median 41 s added at Tiers 2 and 3 in the synthetic model. The Revlon review itself took under half an hour.', 'A timed walk-through with real approvers'],
    ['Approvers and the Data Protection Officer', 'M4 monitoring of how they approve.', 'Team level, at least 3 approvers per team, three signals, never automatic discipline, staff told (PDPA purpose and notification).', 'DPO review and staff consultation before launch'],
    ['Wipro, the outsourced provider', 'Certification, monitoring and audit terms in the contract. Override releases move to a Citi approver.', 'Wipro keeps the tasks. MAS expects the bank to keep oversight of outsourced work (Guidelines on Outsourcing (Banks) 3.1.1, Notice 658).', 'Cost of the contract change'],
    ['Operational Risk', 'Reviewing Tier 3 holds the same day.', '15 holds in 500 payments (3%) in the synthetic run, about 10 minutes each in the model.', 'Staffing and the daily cut-off'],
    ['Technology and the core system', 'A hold point between the core loan system and payment release, and read access to loan schedules.', 'PCAP is an overlay. It does not change how the core system calculates, so it can run while the core is replaced.', 'Whether the core system and payment gateway can hold a payment for PCAP. This is the main readiness question'],
    ['Board and senior management', 'Paying for the build and owning the risk acceptances.', 'About USD 894M of principal left the bank in 2020, lenders refused to return about USD 504M, and penalties for wider control failures reached USD 535.6M.', 'A build and running cost estimate'],
    ['MAS, the regulator', 'Nothing new. PCAP is evidence for rules that already exist.', 'Most obligation rows are MAS Internal Controls, Outsourcing, Notice 658 and TRM. R7 is a separate recommendation to regulators.', 'None for PCAP itself']
  ];

  /* Who uses PCAP every day, what it does for them and what it costs them (usability and value review, 25 Oct 2026). */
  var USERS = [
    ['Maker (Wipro)', 'Says in plain words what the payment will do before the checker sees it. Fills in the next unpaid schedule line and remembers the checker and approver. Marks any workaround leg still missing.', 'One review screen per payment, about 5 s (estimate)'],
    ['Checker (Wipro)', 'The same sentence and failed checks the approver will see. A return reason is filled in from the failed checks.', 'Nothing extra at Tier 1 and 2. A short note to send on a hard stop'],
    ['Approver (Citi)', 'Routine payments are one sentence and one button, and the next one opens by itself. A blind re-key only when something is off.', 'About 7 s at Tier 1 and 41 s at Tiers 2 and 3, 13 s on average (model estimate)'],
    ['Operational Risk', 'Only hard stops reach them, with why each was held and who saw it. A release is one short risk acceptance form.', 'About 10 minutes per hold, 17 holds a month in the synthetic test (estimate)'],
    ['Head of Loan Ops', 'A list of what is due on the register with the button next to it, and the risk acceptances they own.', 'A few attestations a month'],
    ['Internal Audit', 'Every payment\'s evidence collected as it happens. Every risk acceptance listed with a one-click review.', 'Reviewing each acceptance. Replaces about 8 hours of hand sampling a quarter (assumption)'],
    ['Board Risk Committee', 'KRIs with red first, and what PCAP costs and buys, from the bank\'s own data.', 'Reading one page a quarter'],
    ['Wipro service manager', 'Provider-level results for the monthly service review, with nobody named.', 'Nothing extra']
  ];
  function usersCard() {
    return '<div class="card"><div class="card-head"><h2>Who uses it, and what it costs them</h2><span class="muted small">Friction only where the risk is real</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Who</th><th>What PCAP does for them</th><th>What it costs them</th></tr></thead><tbody>' +
      USERS.map(function (r) { return '<tr><td><strong>' + U.esc(r[0]) + '</strong></td><td>' + U.esc(r[1]) + '</td><td class="small">' + U.esc(r[2]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="muted small">Yang Lu (L1 slide 13, L3, L4 slide 17): a control that slows people down or adds work for the vendor meets resistance and gets worked around, which is how the 2020 workaround happened. Each role\'s This week strip shows these numbers from the app\'s own data. Estimates come from the synthetic test model and are marked as such.</p></div>';
  }

  function linkCell(route, label) { return '<a href="#/' + route + '">' + U.esc(label) + '</a>'; }

  function reportCard() {
    var screenName = { desk: 'Payment desk', register: 'Register', monitor: 'Control monitor', analytics: 'Behaviour analytics', oversight: 'Obligations and Board' };
    return '<div class="card"><div class="card-head"><h2>How it answers the report</h2><span class="muted small">Root causes RC1 to RC5 and recommendations R1 to R7 from the report. R-01 to R-09 are PCAP\'s rules.</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Root cause</th><th>What went wrong in 2020</th><th>What PCAP does about it</th><th>See it on</th></tr></thead><tbody>' +
      ROOT_CAUSES.map(function (r) { return '<tr><td><strong>' + r[0] + '</strong></td><td>' + U.esc(r[1]) + '</td><td>' + U.esc(r[2]) + '</td><td>' + linkCell(r[3], screenName[r[3]]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Recommendation</th><th>In the report</th><th>Where PCAP shows it</th><th>See it on</th></tr></thead><tbody>' +
      RECS.map(function (r) { return '<tr><td><strong>' + r[0] + '</strong></td><td>' + U.esc(r[1]) + '</td><td>' + U.esc(r[2]) + '</td><td>' + linkCell(r[3], screenName[r[3]]) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  function courseCard() {
    return '<div class="card"><div class="card-head"><h2>What this shows from IS4234</h2><span class="muted small">Course ideas mapped to the screens</span></div>' +
      '<h3>Three lines of defence: who does what (L2, L3)</h3>' +
      '<div class="mod-grid lines-grid">' + LINES.map(function (l) {
        return '<div class="mod-col"><div class="mod-col-head">' + U.esc(l.head) + '</div><ul class="lines-list">' + l.items.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div>';
      }).join('') + '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Course idea</th><th>Where PCAP shows it</th><th>Screen</th></tr></thead><tbody>' +
      COURSE.map(function (r) { return '<tr><td><strong>' + U.esc(r[0]) + '</strong></td><td>' + U.esc(r[1]) + '</td><td>' + linkCell(r[2], r[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  function feasibilityCard() {
    return '<div class="card"><div class="card-head"><h2>Feasibility and who has to agree</h2><span class="muted small">Feasible in every dimension, for every stakeholder (L3)</span></div>' +
      '<p><strong>Regulatory frame.</strong> PCAP is designed for a bank supervised by MAS, the report\'s benchmark: Internal Controls, the Guidelines on Outsourcing (Banks) and Notice 658, TRM and the PDPA. Citibank is a US bank, so the court record and the OCC and Federal Reserve orders are the evidence of what failed, not the rules PCAP is built on. Rows O6 and O7 also cite the OCC order, because it sets the remediation and sustained-effectiveness tests.</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Who</th><th>What they have to accept</th><th>Why it is workable</th><th>Still open</th></tr></thead><tbody>' +
      FEAS.map(function (r) { return '<tr><td><strong>' + U.esc(r[0]) + '</strong></td><td>' + U.esc(r[1]) + '</td><td>' + U.esc(r[2]) + '</td><td class="small">' + U.esc(r[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<p class="muted small">The root cause in 2020 was an honest error, not fraud, so an internal tool that management wants to use is the right kind of answer (Week 7, FTX tutorial). The design is tiered and risk-based: only Tier 2 and 3 payments get extra steps.</p></div>';
  }

  function render(el) {
    var groups = [
      { g: 'Prevent', mods: ['M2', 'M3'], text: 'Stops a wrong payment before release.' },
      { g: 'Detect', mods: ['M4', 'M5'], text: 'Finds weak approvals and failed controls.' },
      { g: 'Govern', mods: ['M1', 'M6'], text: 'Makes workarounds and obligations visible and owned.' }
    ];
    var screens = { M1: 'register', M2: 'desk', M3: 'desk', M4: 'analytics', M5: 'monitor', M6: 'oversight' };
    var rules = Object.keys(E.RULES).map(function (k) { return E.RULES[k]; });

    el.innerHTML =
      '<div class="hero card">' +
      '<div class="hero-text"><p class="hero-eyebrow">Control tower for payment release</p><h1>Approved, and <em>now understood</em></h1>' +
      '<p><strong>PCAP</strong> is an overlay on the core payment system, not a replacement. Before a payment is released it states in plain words how much money will leave the bank, where it goes and whether it is interest or principal, and it checks that against the loan schedule.</p>' +
      '<p>It only lets certified, independent, in-house approvers release override payments, makes them re-key the amount and payment type blind, and holds anything critical for Operational Risk.</p>' +
      '<p>It then watches how approvals happen, whether compensating controls ran, and maps every control event to the obligation it evidences.</p>' +
      '<div class="hero-actions"><button class="btn primary" data-step="1">' + U.icon('play') + ' Start the demo with the Revlon replay</button><a class="btn" href="#/synthetic">See the synthetic test</a></div></div>' +
      '<div class="hero-case"><div class="hc-label">Incident replay: the case, 11 Aug 2020</div>' +
      '<p>Citibank meant to pay about <strong>USD 7.8M of interest</strong> on Revlon\'s term loan. The core system had no interest-only function, so staff used a workaround that needed <span class="mono">FRONT</span>, <span class="mono">FUND</span> and <span class="mono">PRINCIPAL</span> set to an internal wash account. Only <span class="mono">PRINCIPAL</span> was set.</p>' +
      '<p>About <strong>USD 894M of principal</strong> went to lenders after a maker and checker at the outsourced provider and an approver at Citi all approved it.</p>' +
      '<p class="muted small">Everything in this prototype is synthetic. The replay is a simplified rebuild for testing.</p></div></div>' +

      '<div class="card"><div class="card-head"><h2>Five minute demo path</h2><span class="muted small">Each button switches role and opens the right screen</span></div>' +
      '<ol class="steps">' + STEPS.map(function (s) {
        return '<li><div class="step-n">' + (s.n < 10 ? '0' : '') + s.n + '</div><div class="step-body"><div class="step-title">' + U.esc(s.title) + '</div><p>' + U.esc(s.text) + '</p></div>' +
          '<button class="btn small" data-step="' + s.n + '">Go ' + U.icon('arrow') + '</button></li>';
      }).join('') + '</ol></div>' +

      '<div class="card"><div class="card-head"><h2>Six modules</h2><span class="muted small">Prevent, Detect, Govern</span></div><div class="mod-grid">' +
      groups.map(function (g) {
        return '<div class="mod-col mod-' + g.g.toLowerCase() + '"><div class="mod-col-head">' + g.g + '</div><p class="muted small">' + g.text + '</p>' +
          g.mods.map(function (m) {
            var mm = E.MODULES[m];
            return '<a class="mod-card" href="#/' + screens[m] + '">' + U.moduleChip(m) + '<span>' + U.esc(mm.name) + '</span><span class="mod-rc" title="Report root causes">' + MOD_RC[m] + '</span></a>';
          }).join('') + '</div>';
      }).join('') + '</div>' +
      '<p class="flow">' + ['Instruction', 'M1 register check', 'M3 authority gate', 'M2 consequence engine', 'Tiered approval and blind re-key', 'Release or hard stop', 'Events to M4, M5, M6'].map(function (x) { return '<span>' + U.esc(x) + '</span>'; }).join(U.icon('arrow')) + '</p></div>' +

      usersCard() + reportCard() + courseCard() + feasibilityCard() +

      '<div class="card"><div class="card-head"><h2>Control rules R-01 to R-09</h2><span class="muted small">Rule IDs, names and thresholds follow Table 6 of the report</span></div><div class="table-wrap"><table class="table rules"><thead><tr><th>Rule</th><th>Module</th><th>Logic</th><th>Action</th><th>Obligations</th><th>Where to see it</th></tr></thead><tbody>' +
      rules.map(function (r) {
        return '<tr><td><strong>' + U.esc(r.id) + '</strong> ' + U.esc(r.name) + '</td><td>' + U.moduleChip(r.module) + '</td><td>' + U.esc(r.logic) + '</td><td>' + U.esc(r.action) + '</td><td>' + r.obligations.map(U.obligationChip).join(' ') + '</td><td>' + U.esc(r.screen) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-head"><h2>Tiers</h2></div><div class="tier-grid">' +
      [1, 2, 3].map(function (t) { return '<div class="tier-card">' + U.tierBadge(t, { big: true }) + '<p>' + U.esc(E.TIERS[t].action) + '</p></div>'; }).join('') +
      '</div><p class="muted small">Any payment using a valid registered override is at least Tier 2. R-05 and R-06 failures close the M3 gate for that approver whatever the tier.</p></div>' +

      '<div class="card notes"><h2>Good to know</h2><ul>' +
      '<li>Before you record or present, press <strong>Reset demo data</strong> so the queue is at its starting point. If a screen ever looks wrong, Reset fixes it.</li>' +
      '<li>No login. On the payment desk, use <strong>Acting as</strong> to switch between Maker, Checker, Approver and Op Risk. The <strong>Acting as</strong> menu at the top also has Head of Loan Ops (first-line risk owner), Internal Audit (third line), the Board Risk Committee and Wipro\'s service manager (both read only). Each opens on its own screen, and a number on a tab shows what needs that role. When a payment waits for another role, the desk shows a <strong>Switch to ...</strong> button.</li>' +
      '<li>Words with a dotted underline, such as ' + U.term('wash', 'wash account') + ' or ' + U.term('tier3', 'Tier 3') + ', explain themselves. Point at them, tab to them or tap them.</li>' +
      '<li>On the payment desk, <kbd>J</kbd> and <kbd>K</kbd> move through the queue, <kbd>/</kbd> searches it, <kbd>Enter</kbd> presses the focused button and <kbd>Ctrl</kbd>+<kbd>Enter</kbd> does the main action of your panel.</li>' +
      '<li>The <strong>Light</strong> button in the header is for projectors. The choice is remembered in this browser.</li>' +
      '<li>The evidence pack and the synthetic test results download as files (JSON and CSV) to your usual downloads folder.</li>' +
      '<li>All data is synthetic and stays in this browser (localStorage). <strong>Reset demo data</strong> restores the starting point.</li>' +
      '<li>The prototype is not connected to any core banking system. The Flexcube-style screen is a simulation.</li>' +
      '<li>Rule logic lives in one file, <span class="mono">js/engine.js</span>, which also runs the Node unit tests.</li></ul></div>';

    el.onclick = function (e) {
      var b = e.target.closest('[data-step]');
      if (!b) return;
      var s = STEPS.filter(function (x) { return x.n === +b.getAttribute('data-step'); })[0];
      if (!s) return;
      var st = store.st();
      if (s.preset) {
        st.ui = st.ui || {};
        st.ui.makerDraft = PCAP.views.desk.PRESETS[s.preset]();
      }
      PCAP.app.setRole(s.role, s.route);
      window.scrollTo(0, 0);
    };
  }

  views.guide = { render: render, STEPS: STEPS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
