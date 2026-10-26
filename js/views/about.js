/*
 * PCAP prototype: About this prototype (for markers). How the prototype maps to the report and the course,
 * feasibility, the rules and tiers, the risk model, cadence, synthetic test notes, limitations and the manual
 * demo path. Moved here from the old "How to demo" page and from the screens, so the screens stay plain.
 * Report codes are always shown on this page.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  var STEPS = [
    { n: 1, role: 'maker', route: 'desk', preset: 'revlon', title: 'Maker keys the Revlon replay',
      text: 'The New payment form opens with the Revlon replay. Under Where each part goes, only PRINCIPAL is set to Stays in the bank (the wash account). Click Review payment: Stopped (Tier 3), and PCAP says it will send USD 901.7M to 315 lenders, including USD 893.9M of principal, 115 times what the schedule expects. R-04, R-02 and R-01 fail. Submit it anyway, as happened in 2020.' },
    { n: 2, role: 'checker', route: 'desk', title: 'Checker sends it on anyway',
      text: 'Click Switch to Checker. The checker sees the same consequence card and the failed checks, and PCAP offers Return to maker first. To show what happened in 2020, write a note such as "Principal set to wash" and click Send to approver anyway (a note is needed only at Tier 3). The approver will not see this note until after typing their own figure (the blind re-key).' },
    { n: 3, role: 'approver', route: 'desk', title: 'Approver re-keys blind, then reads the consequence',
      text: 'Click Switch to Approver. The amounts are hidden. Open your source (the agent notice), type 7,820,000, pick Interest only and click Check amount. It does not match, so do it again. R-07 escalates, the consequence card appears, and the payment is Stopped (Tier 3). Send it to Operational Risk.' },
    { n: 4, role: 'oprisk', route: 'desk', title: 'Operational Risk decides, with a reason',
      text: 'Click Switch to Op Risk. Only the second line can release a Tier 3 payment, and only by recording a risk acceptance with a reason, the first-line risk owner and an expiry (open Release it instead to see it). Write a reason and click Reject and return to maker. (If you release it instead with Sign off and release, M5 catches it as a reconciliation break.) Every step is now in the Activity log.' },
    { n: 5, role: 'maker', route: 'desk', title: 'Optional: the maker fixes it',
      text: 'The returned payment waits for the maker. Click Edit and resubmit: the form opens at Where each part goes and marks FRONT and FUND as must stay in the bank. Set them, review and resubmit. Now it is Tier 2: only USD 7.8M of interest leaves and the principal stays in the bank. Check it, re-key 7,820,000 as Interest only, tick I confirm and release.' },
    { n: 6, role: 'maker', route: 'desk', preset: 'clean', title: 'Contrast: a clean payment at Tier 1',
      text: 'The form opens with a clean interest payment. Review, submit, check and approve. Tier 1 needs no re-key: the approver reads one sentence and presses Release (or Enter), and the next waiting payment opens by itself. The This week strip shows what PCAP added and caught.' },
    { n: 7, role: 'owner', route: 'register', title: 'M1 register (Workarounds)',
      text: 'WA-02 review is overdue and WA-03\'s dispensation is about to expire. As Head of Loan Ops, mark WA-02 reviewed or add a new workaround.' },
    { n: 8, role: 'oprisk', route: 'analytics', title: 'M4 behaviour analytics (Approval habits)',
      text: 'Team-level rubber-stamp scores (R-08). Citi Approvers TPA has drifted into red: fast looks and fast approvals after Tier 2 warnings. Below, the outsourced provider card shows a check that sent on a Tier 3 payment.' },
    { n: 9, role: 'oprisk', route: 'monitor', title: 'M5 control monitor (Daily checks)',
      text: 'Run the same-day reconciliation as Operational Risk. Red, amber and green status for reconciliation, register reviews, dispensations, certifications, holds and the replay regression test (R-09).' },
    { n: 10, role: 'audit', route: 'oversight', title: 'M6 obligations, Board view and audit evidence (Board and audit)',
      text: 'As Internal Audit (third line, read only). Each obligation row maps to its control, rules and live evidence counts from the event log. Check the risk acceptance log, then download the evidence pack as JSON and CSV.' },
    { n: 11, role: 'oprisk', route: 'synthetic', title: 'Synthetic test, report 5.8 (Test results)',
      text: 'Run 500 seeded synthetic payments with 25 injected errors through the real engine. See detection by error type and tier, false alarms, added time and the Revlon replay result.' }
  ];


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
    ['Delegation of authority and segregation of duties (L3, MAS Internal Controls 2.3 and 2.4)', 'M3 gate: certification, an approval limit set by consequence, and independence from the maker and checker. Segregation guards against intent, not an error all three share, so R-07 adds a blind re-key.', 'desk', 'Payments'],
    ['Risk tolerance levels (L2 GRC technology, "what actions each level of risk will trigger")', 'Tier 1, 2 and 3 thresholds in R-01, and what each tier makes people do.', 'about', 'Tiers, below'],
    ['Documented risk acceptance (L5 slide 41)', 'Releasing a Tier 3 hold records the reason, the first-line risk owner, the scope and an expiry. Register dispensations are acceptances with an end date.', 'desk', 'Payments (Op Risk), Workarounds'],
    ['L5 risk model: Risk = AV x EF x ARO x CD', 'WA-01 before and after PCAP. PCAP lowers control deficiency, not what is at stake.', 'register', 'Workarounds'],
    ['Compensating controls (report 3.3.3)', 'Schedule check, unscheduled principal hold, governed workaround, certified in-house approver and a same-day reconciliation, each with an owner and a test.', 'monitor', 'Daily checks'],
    ['Outsourcing accountability (L9, MAS Notice 658, Outsourcing Guidelines 3.1.1)', 'The work is outsourced, the accountability is not: override releases need a Citi approver, every register entry has a Citi owner, and the provider\'s checks are monitored.', 'analytics', 'Payments, Approval habits'],
    ['Evidence for audit and COSO monitoring (L3)', 'Every step is an event tagged to its module, rule and obligation. Internal Audit can test every payment instead of a sample.', 'events', 'Activity log, Board and audit'],
    ['RegTech and the compliance register (L1, L2)', 'Compliance technology the bank uses on its own payments. The obligation map is the compliance register, tied to live evidence.', 'oversight', 'Board and audit'],
    ['Data quality (L6: accuracy, timeliness, completeness)', 'PCAP is only as good as the loan schedule it reads. A stale line shows up as a false alarm, and a release for one sends a fix to the data owner.', 'synthetic', 'Test results'],
    ['Monitoring staff within the PDPA (L2 agency theory, L4, L6 Amazon France)', 'Behaviour-based control, kept proportionate: team level, at least 3 approvers per team, three signals only, purpose stated, staff told, DPO consulted.', 'analytics', 'Approval habits']
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

  var MOD_SCREEN = { M1: ['register', 'Workarounds'], M2: ['desk', 'Payments'], M3: ['desk', 'Payments'], M4: ['analytics', 'Approval habits'], M5: ['monitor', 'Daily checks'], M6: ['oversight', 'Board and audit'] };
  var SCREEN_NAME = { desk: 'Payments', register: 'Workarounds', monitor: 'Daily checks', analytics: 'Approval habits', oversight: 'Board and audit', events: 'Activity log', synthetic: 'Test results', about: 'Tiers, below' };
  /* Report root causes per module (report 5.1). */
  var MOD_RC = { M1: 'RC2, RC4', M2: 'RC1', M3: 'RC3', M4: 'RC1, RC5', M5: 'RC4', M6: 'RC1 to RC5' };

  function esc(x) { return U.esc(x); }
  function linkCell(route, label) { return '<a href="#/' + route + '">' + esc(label) + '</a>'; }
  function table(head, rows) {
    return '<div class="table-wrap"><table class="table"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  var CHEV = '<svg class="ico fold-chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4.5 6.2L8 9.7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function sec(id, title, meta, body, open) {
    return '<details class="card fold about-sec" id="about-' + id + '"' + (open ? ' open' : '') + '><summary class="fold-sum"><h2>' + esc(title) + '</h2><span class="fold-meta">' + esc(meta) + '</span>' + CHEV + '</summary>' +
      '<div class="fold-body">' + body + '</div></details>';
  }

  function reportBody() {
    return '<p>Root causes RC1 to RC5 and recommendations R1 to R7 are from the report. R-01 to R-09 are PCAP\'s rules and M1 to M6 its modules.</p>' +
      table(['Root cause', 'What went wrong in 2020', 'What PCAP does about it', 'See it on'], ROOT_CAUSES.map(function (r) {
        return '<tr><td><strong>' + r[0] + '</strong></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + linkCell(r[3], SCREEN_NAME[r[3]]) + '</td></tr>';
      })) +
      table(['Recommendation', 'In the report', 'Where PCAP shows it', 'See it on'], RECS.map(function (r) {
        return '<tr><td><strong>' + r[0] + '</strong></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + linkCell(r[3], SCREEN_NAME[r[3]]) + '</td></tr>';
      }));
  }

  function courseBody() {
    return '<h3>Three lines of defence: who does what (L2, L3)</h3>' +
      '<div class="mod-grid lines-grid">' + LINES.map(function (l) {
        return '<div class="mod-col"><div class="mod-col-head">' + esc(l.head) + '</div><ul class="lines-list">' + l.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }).join('') + '</div>' +
      table(['Course idea', 'Where PCAP shows it', 'Screen'], COURSE.map(function (r) {
        return '<tr><td><strong>' + esc(r[0]) + '</strong></td><td>' + esc(r[1]) + '</td><td>' + linkCell(r[2], r[3]) + '</td></tr>';
      })) +
      '<p class="muted small">Compensating controls (report 3.3.3): a compensating control brings a risk back to an acceptable level when the main control cannot be fixed, here a core system that cannot pay interest only. The Daily checks screen tracks the ones the report says were missing: the expected-amount reconciliation (R-01 and CC-01), the unscheduled principal hold (R-02), the governed workaround (M1, CC-02 and CC-03) and the certified in-house approver (M3, CC-04).</p>';
  }

  function feasibilityBody() {
    return '<p><strong>Regulatory frame.</strong> PCAP is designed for a bank supervised by MAS, the report\'s benchmark: Internal Controls, the Guidelines on Outsourcing (Banks) and Notice 658, TRM and the PDPA. Citibank is a US bank, so the court record and the OCC and Federal Reserve orders are the evidence of what failed, not the rules PCAP is built on. Rows O6 and O7 also cite the OCC order, because it sets the remediation and sustained-effectiveness tests.</p>' +
      table(['Who', 'What they have to accept', 'Why it is workable', 'Still open'], FEAS.map(function (r) {
        return '<tr><td><strong>' + esc(r[0]) + '</strong></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td class="small">' + esc(r[3]) + '</td></tr>';
      })) +
      '<p class="muted small">The root cause in 2020 was an honest error, not fraud, so an internal tool that management wants to use is the right kind of answer (Week 7, FTX tutorial). The design is tiered and risk-based: only Tier 2 and 3 payments get extra steps.</p>';
  }

  function usersBody() {
    return table(['Who', 'What PCAP does for them', 'What it costs them'], USERS.map(function (r) {
      return '<tr><td><strong>' + esc(r[0]) + '</strong></td><td>' + esc(r[1]) + '</td><td class="small">' + esc(r[2]) + '</td></tr>';
    })) + '<p class="muted small">Yang Lu (L1 slide 13, L3, L4 slide 17): a control that slows people down or adds work for the vendor meets resistance and gets worked around, which is how the 2020 workaround happened. Each role\'s This week strip shows these numbers from the app\'s own data. Estimates come from the synthetic test model and are marked as such.</p>';
  }

  function modulesBody() {
    var groups = [
      { g: 'Prevent', mods: ['M2', 'M3'], text: 'Stops a wrong payment before release.' },
      { g: 'Detect', mods: ['M4', 'M5'], text: 'Finds weak approvals and failed controls.' },
      { g: 'Govern', mods: ['M1', 'M6'], text: 'Makes workarounds and obligations visible and owned.' }
    ];
    return '<div class="mod-grid">' + groups.map(function (g) {
      return '<div class="mod-col mod-' + g.g.toLowerCase() + '"><div class="mod-col-head">' + g.g + '</div><p class="muted small">' + g.text + '</p>' +
        g.mods.map(function (m) {
          var mm = E.MODULES[m];
          return '<a class="mod-card" href="#/' + MOD_SCREEN[m][0] + '">' + U.moduleChip(m) + '<span>' + esc(mm.name) + '<span class="mod-screen">On screen: ' + esc(MOD_SCREEN[m][1]) + '</span></span><span class="mod-rc" title="Report root causes">' + MOD_RC[m] + '</span></a>';
        }).join('') + '</div>';
    }).join('') + '</div>' +
      '<p class="flow">' + ['Instruction', 'M1 register check', 'M3 authority gate', 'M2 consequence engine', 'Tiered approval and blind re-key', 'Release or hard stop', 'Events to M4, M5, M6'].map(function (x) { return '<span>' + esc(x) + '</span>'; }).join(U.icon('arrow')) + '</p>' +
      '<p class="muted small">The screens use plain names. Module and rule codes show as small tags when <strong>Show report codes</strong> is on in the header, and always on this page.</p>';
  }

  /* The engine names screens the old way. Show today's tab names. */
  function screenNow(t) {
    return String(t).replace('Payment desk', 'Payments').replace('M1 register', 'Workarounds (M1)').replace('M4 analytics', 'Approval habits (M4)').replace('M5 control monitor', 'Daily checks (M5)');
  }

  function rulesBody() {
    var rules = Object.keys(E.RULES).map(function (k) { return E.RULES[k]; });
    return '<p class="muted small">Rule IDs, names and thresholds follow Table 6 of the report.</p><div class="table-wrap"><table class="table rules"><thead><tr><th>Rule</th><th>Module</th><th>Logic</th><th>Action</th><th>Obligations</th><th>Where to see it</th></tr></thead><tbody>' +
      rules.map(function (r) {
        return '<tr><td><strong>' + esc(r.id) + '</strong> ' + esc(r.name) + '</td><td>' + U.moduleChip(r.module) + '</td><td>' + esc(r.logic) + '</td><td>' + esc(r.action) + '</td><td>' + r.obligations.map(U.obligationChip).join(' ') + '</td><td>' + esc(screenNow(r.screen)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function tiersBody() {
    return '<div class="tier-grid">' + [1, 2, 3].map(function (t) {
      return '<div class="tier-card">' + U.tierBadge(t, { big: true }) + '<p>' + esc(E.TIERS[t].action) + '</p><p class="muted small">On screen: "' + esc(PCAP.plain.tier(t).label) + '". ' + esc(PCAP.plain.tier(t).what) + '</p></div>';
    }).join('') + '</div><p class="muted small">Any payment using a valid registered override is at least Tier 2. R-05 and R-06 failures close the M3 gate for that approver whatever the tier. The thresholds are the bank\'s risk tolerance levels: what each level of risk makes people do (L2).</p>';
  }

  /* WA-01 in the L5 risk model (report 3.3.2). Moved here from the Workarounds screen. */
  function riskBody() {
    var rows = [
      ['Asset value (AV)', 'Up to the whole principal on each use: USD 893.9M in the Revlon replay, USD 310M on LN-1004 today', 'Same. PCAP does not change what is at stake'],
      ['Exposure factor (EF)', 'Up to 1.0, a completed wire cannot be recalled. About 0.56 in 2020, when about USD 504M was not returned', 'Same once money has left the bank'],
      ['Annual rate of occurrence (ARO)', 'Low: rare, but every roll-up uses this path', 'Same'],
      ['Control deficiency (CD)', 'Near 1.0: three fields set by hand, and the approvals checked that they were set, not what they did', 'Low: R-04 holds a missing field, R-02 holds unscheduled principal, R-01 checks the schedule, R-07 re-key, M5 same-day reconciliation']
    ];
    return '<p>Each active register entry is a documented risk acceptance (L5): the legacy constraint is assessed, the first-line owner accepts what is left, and the dispensation is the date the acceptance expires (MAS TRM 7.3.2 to 7.3.3). In 2020 the wash-account workaround had none of this, so the risk was carried without anyone deciding to accept it (report 3.3.2).</p>' +
      table(['Factor', 'Without PCAP (2020)', 'With PCAP'], rows.map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>'; })) +
      '<p class="muted small">Risk = AV x EF x ARO x CD. Impact (AV x EF) stays the same. PCAP lowers likelihood (ARO x CD) by cutting control deficiency, which is where a control can help at this asset value. The owner accepts the risk that is left until the WA-01 dispensation date, and the core upgrade (refresh plan) is what removes it. Synthetic test: every injected missing FRONT or FUND was held by R-04.</p>';
  }

  function cadenceBody() {
    return '<table class="table"><tbody>' +
      '<tr><th>Daily</th><td>Hold list, same-day reconciliation, hard-stop queue cleared, control health (M2, M5)</td></tr>' +
      '<tr><th>Monthly</th><td>Second-line control report: team rubber-stamp scores and re-key slip rates (M4), replay regression test, certification currency, register reviews due (M1, M5)</td></tr>' +
      '<tr><th>Quarterly</th><td>Board KRI pack, threshold review against the false-alarm KRI, dispensation renewals and the legacy roadmap (M1, M6). Internal Audit reviews every risk acceptance and the M4 individual-view log</td></tr>' +
      '<tr><th>On request</th><td>Evidence pack for Internal Audit and regulators</td></tr></tbody></table>' +
      '<p class="muted small">Report 5.5. R-08 is scored per team per week and goes into the monthly second-line report.</p>';
  }

  function syntheticBody() {
    var items = [
      'Seed 4234, 500 payments, 25 injected errors (5%), 475 clean payments of which 5 read a stale schedule line, business days 1 to 30 Sep 2026. The seed was fixed before any results were known. Run fingerprint f5f23476.',
      'Why 88% and not 90% stopped before release: the three misses are slips of under USD 500, inside the R-01 tolerance by design, released at Tier 1. M5\'s same-day reconciliation found all three, so nothing was missed entirely. Tightening the tolerance would catch them but raise false alarms.',
      'False alarms: all 5 were R-01 on a stale schedule line, all at Tier 2, all released after the approver\'s blind re-key matched. None was held at Tier 3. Another 64 clean override payments went to Tier 2 by policy without any rule firing, which adds time but is not counted as a false alarm.',
      'Added time (model estimate): median approver time added is 7.2 s at Tier 1 and 41.1 s at Tiers 2 and 3, mean 13.2 s over all payments. Tier 3 holds then wait a median 10.2 min for Operational Risk. These are assumptions, not a timed walk-through.',
      'About 82% of payments are Tier 1, not 95%. Override payments are Tier 2 by policy, so about one clean payment in seven still gets the re-key. Lowering that is a control decision for the team.',
      'R-08: the simulated rubber-stamp team (Citi Approvers TPA) scored 75 (red). The other two teams scored 5 and 7 (green).',
      'Across seeds 1 to 50: 1,138 of 1,250 injected errors stopped before release (91.0% pooled), every Tier 3, gate and Tier 2 error stopped, none missed, false alarms 1.0%, and the Revlon replay passed every time.'
    ];
    return '<ul class="lines-list">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p><a href="#/synthetic">Open Test results</a> to run it yourself.</p>';
  }

  function limitsBody() {
    var items = [
      'Synthetic data only. Every person, loan and amount is invented. Results show that PCAP catches the errors we imagined, not that it would catch the next real one.',
      'Not connected to Flexcube or any bank system. The Flexcube-style screen is a simulation and the consequence engine models only the FRONT, FUND and PRINCIPAL wash-account rule.',
      'Browser-only storage. State lives in one browser. There is no server, no shared data between users and no audit-grade storage.',
      'No login or access control. Anyone can switch roles. In production, approvers would not see the event log or the agent notice inside PCAP.',
      'Added time is modelled, not measured with volunteer approvers. The app does measure real time on the consequence screen for the approvals you make.',
      'It does not check beneficiary account details, payment dates in the reconciliation (it compares amounts), or a payment made against the wrong schedule line when the amount is similar.',
      'M4 privacy is a design note (team level by default, at least 3 approvers per team, logged individual view), not a legal review under the PDPA.',
      'The risk owner does not sign in the app. Operational Risk records the acceptance and names the Head of Loan Ops as owner in one step. A live system would have the owner confirm it as a second key.',
      'The agent notice is generated from the loan schedule in the demo, so it is not a truly independent source.',
      'Open feasibility questions: whether the core system and payment gateway can hold a payment for PCAP, the cost of the Wipro contract change, a build and running cost estimate, and a timed walk-through with real approvers.',
      'The cost and value figures are estimates from the synthetic test model or a stated assumption, marked "est." on screen.'
    ];
    return '<ul class="lines-list">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  function demoBody() {
    return '<p>The guided tour on Home covers steps 1 to 5 by itself. To drive the demo by hand instead (for the video), each button switches role and opens the right screen.</p>' +
      '<ol class="steps">' + STEPS.map(function (s) {
        return '<li><div class="step-n">' + (s.n < 10 ? '0' : '') + s.n + '</div><div class="step-body"><div class="step-title">' + esc(s.title) + '</div><p>' + esc(s.text) + '</p></div>' +
          '<button type="button" class="btn small" data-step="' + s.n + '">Go ' + U.icon('arrow') + '</button></li>';
      }).join('') + '</ol>';
  }

  function goodBody() {
    return '<ul class="lines-list">' +
      '<li>Before you record or present, press <strong>Reset demo data</strong> so the queue is at its starting point. The tour and Try it yourself start from fresh data by themselves, and ask first if you have changes of your own.</li>' +
      '<li>No login. On Payments, the <strong>You are</strong> buttons switch between Maker, Checker, Approver and Op Risk. The <strong>You are</strong> menu in the header also has Head of Loan Ops, Internal Audit, the Board Risk Committee and Wipro\'s service manager. Each opens on its own screen, and a number on a tab shows what needs that role.</li>' +
      '<li>Words with a dotted underline explain themselves. Point at them, tab to them or tap them.</li>' +
      '<li>On Payments, <kbd>J</kbd> and <kbd>K</kbd> move through the queue, <kbd>/</kbd> searches it, <kbd>Enter</kbd> presses the focused button and <kbd>Ctrl</kbd>+<kbd>Enter</kbd> does the main action of your panel.</li>' +
      '<li>The <strong>Light</strong> button is for projectors and <strong>Show report codes</strong> adds the report\'s codes as small tags. Both choices are remembered in this browser.</li>' +
      '<li>The evidence pack and the test results download as files (JSON and CSV).</li>' +
      '<li>All data is synthetic and stays in this browser. Rule logic lives in one file, <span class="mono">js/engine.js</span>, which also runs the Node unit tests.</li></ul>';
  }

  function principleBody() {
    return '<p>Brian\'s feedback on the last version: "when i look at the dashboard and the how to demo guide, i am confused. i dont know what im looking at, what is happening, and what i need to do, or what this platform does. if the platform requires teaching and learning, it deters people from using it."</p>' +
      '<p>Yang Lu made the same point in L1 (slide 13): governance that creates unnecessary work for employees or the vendor is resented and meets resistance (Yang 2026a). A control people have to learn gets worked around, and a workaround is how the 2020 payment went out.</p>' +
      '<p>So the screens explain themselves: plain names, one line at the top of each screen saying what it is for and what to do, the 2020 case on Home, and a tour that runs the replay in the real app. This page holds the detail for markers.</p>';
  }

  function render(el) {
    el.innerHTML = '<div class="page-head"><h1>About this prototype</h1>' + PCAP.views.nowLine('about', store.st().role) +
      '<div class="about-tools"><button type="button" class="btn small" data-about="open">Open all</button><button type="button" class="btn small" data-about="close">Close all</button>' +
      '<button type="button" class="btn small" data-about="tour">' + U.icon('play') + ' Take the tour</button><a class="btn small ghost" href="#/home">Back to Home</a></div></div>' +
      sec('report', 'How it answers the report', 'Root causes RC1 to RC5 and recommendations R1 to R7, mapped to screens', reportBody(), true) +
      sec('course', 'What this shows from IS4234', 'Three lines of defence and the lecture ideas, mapped to screens', courseBody()) +
      sec('feasibility', 'Feasibility and who has to agree', 'Each stakeholder, what they accept, and what is still open', feasibilityBody()) +
      sec('users', 'Who uses it, and what it costs them', 'Friction only where the risk is real', usersBody()) +
      sec('modules', 'Six modules, M1 to M6', 'Prevent, Detect, Govern, and which screen shows each', modulesBody()) +
      sec('rules', 'Control rules R-01 to R-09', 'Logic, action, obligation rows and screen for each rule', rulesBody()) +
      sec('tiers', 'Tiers 1 to 3', 'Routine, Needs a closer look, Stopped', tiersBody()) +
      sec('risk', 'WA-01 in the L5 risk model', 'Risk = AV x EF x ARO x CD (report 3.3.2)', riskBody()) +
      sec('cadence', 'Reporting cadence', 'Daily, monthly, quarterly and on request (report 5.5)', cadenceBody()) +
      sec('synthetic', 'Synthetic test notes', 'Seed, results against 5.8, why 88%, false alarms, added time', syntheticBody()) +
      sec('limits', 'Limitations', 'What the prototype does not show', limitsBody()) +
      sec('demo', 'Manual demo path (for the video)', 'Eleven steps with a Go button each', demoBody()) +
      sec('good', 'Good to know', 'Reset, roles, keys, theme, report codes, downloads', goodBody()) +
      sec('principle', 'Design principle: zero learning', 'Why the screens explain themselves', principleBody());

    el.onclick = function (e) {
      var a = e.target.closest('[data-about]');
      if (a) {
        var act = a.getAttribute('data-about');
        if (act === 'tour') { PCAP.tour.start(); return; }
        Array.prototype.forEach.call(el.querySelectorAll('details.about-sec'), function (d) { d.open = act === 'open'; });
        return;
      }
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
      root.scrollTo(0, 0);
    };
  }

  views.about = { render: render, STEPS: STEPS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
