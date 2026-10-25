/*
 * PCAP prototype: "How to demo" screen. What PCAP is, the 5 minute path, module map, rules and tiers.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  var STEPS = [
    { n: 1, role: 'maker', route: 'desk', preset: 'revlon', title: 'Maker keys the Revlon replay',
      text: 'The New payment form opens with the Revlon replay. Under Settlement routing only PRINCIPAL is on the wash account. Click Review payment: Tier 3, and PCAP says it will send USD 901.7M to 315 lenders, including USD 893.9M of principal, 115 times what the schedule expects. R-04, R-02 and R-01 fail. Submit it anyway, as happened in 2020.' },
    { n: 2, role: 'checker', route: 'desk', title: 'Checker marks it checked',
      text: 'Click Switch to Checker. The checker sees the same consequence card and checks. Add a note such as "Principal set to wash" and click Mark checked. The approver will not see this note until after the blind re-key.' },
    { n: 3, role: 'approver', route: 'desk', title: 'Approver re-keys blind, then reads the consequence',
      text: 'Click Switch to Approver. The amounts are hidden. Open your source (the agent notice), type 7,820,000 and click Check amount. It does not match, so type it again. R-07 escalates, the consequence card appears, and the payment is a Tier 3 hard stop. Send it to Operational Risk.' },
    { n: 4, role: 'oprisk', route: 'desk', title: 'Operational Risk decides, with a reason',
      text: 'Click Switch to Op Risk. Only the second line can release a Tier 3 payment. Write a reason and click Reject and return to maker (or release it with a reason, which M5 then catches as a reconciliation break). Every step is now in the event log.' },
    { n: 5, role: 'maker', route: 'desk', title: 'Optional: the maker fixes it',
      text: 'The returned payment waits for the maker. Click Edit and resubmit, set FRONT and FUND to the wash account, review and resubmit. Now it is Tier 2: only USD 7.8M of interest leaves and the principal stays in the bank. Check it, re-key 7,820,000, confirm and release.' },
    { n: 6, role: 'maker', route: 'desk', preset: 'clean', title: 'Contrast: a clean payment at Tier 1',
      text: 'The form opens with a clean interest payment. Review, submit, check and approve. Tier 1 needs no re-key. The approver\'s real time on the consequence screen is measured for M4.' },
    { n: 7, role: 'owner', route: 'register', title: 'M1 register',
      text: 'WA-02 review is overdue and WA-03\'s dispensation is about to expire. As Head of Loan Ops, mark WA-02 reviewed or add a new workaround.' },
    { n: 8, role: 'oprisk', route: 'analytics', title: 'M4 behaviour analytics',
      text: 'Team-level rubber-stamp scores (R-08). Citi Approvers TPA has drifted into red: fast looks and fast approvals after Tier 2 warnings.' },
    { n: 9, role: 'oprisk', route: 'monitor', title: 'M5 control monitor',
      text: 'Run the same-day reconciliation as Operational Risk. Red, amber and green status for reconciliation, register reviews, dispensations, certifications, holds and the replay regression test (R-09).' },
    { n: 10, role: 'oprisk', route: 'oversight', title: 'M6 obligations and Board view',
      text: 'Each obligation row maps to its control, rules and live evidence counts from the event log. Export the evidence pack as JSON and CSV.' },
    { n: 11, role: 'oprisk', route: 'synthetic', title: 'Synthetic test (report 5.8)',
      text: 'Run 500 seeded synthetic payments with 25 injected errors through the real engine. See detection by error type and tier, false alarms, added time and the Revlon replay result.' }
  ];

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
      '<p>It only lets certified, independent, in-house approvers release override payments, makes them re-key the amount blind, and holds anything critical for Operational Risk.</p>' +
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
            return '<a class="mod-card" href="#/' + screens[m] + '">' + U.moduleChip(m) + '<span>' + U.esc(mm.name) + '</span></a>';
          }).join('') + '</div>';
      }).join('') + '</div>' +
      '<p class="flow">' + ['Instruction', 'M1 register check', 'M3 authority gate', 'M2 consequence engine', 'Tiered approval and blind re-key', 'Release or hard stop', 'Events to M4, M5, M6'].map(function (x) { return '<span>' + U.esc(x) + '</span>'; }).join(U.icon('arrow')) + '</p></div>' +

      '<div class="card"><div class="card-head"><h2>Control rules R-01 to R-09</h2><span class="muted small">Rule IDs, names and thresholds follow Table 6 of the report</span></div><div class="table-wrap"><table class="table rules"><thead><tr><th>Rule</th><th>Module</th><th>Logic</th><th>Action</th><th>Obligations</th><th>Where to see it</th></tr></thead><tbody>' +
      rules.map(function (r) {
        return '<tr><td><strong>' + U.esc(r.id) + '</strong> ' + U.esc(r.name) + '</td><td>' + U.moduleChip(r.module) + '</td><td>' + U.esc(r.logic) + '</td><td>' + U.esc(r.action) + '</td><td>' + r.obligations.map(U.obligationChip).join(' ') + '</td><td>' + U.esc(r.screen) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-head"><h2>Tiers</h2></div><div class="tier-grid">' +
      [1, 2, 3].map(function (t) { return '<div class="tier-card">' + U.tierBadge(t, { big: true }) + '<p>' + U.esc(E.TIERS[t].action) + '</p></div>'; }).join('') +
      '</div><p class="muted small">Any payment using a valid registered override is at least Tier 2. R-05 and R-06 failures close the M3 gate for that approver whatever the tier.</p></div>' +

      '<div class="card notes"><h2>Good to know</h2><ul>' +
      '<li>Before you record or present, press <strong>Reset demo data</strong> so the queue is at its starting point. If a screen ever looks wrong, Reset fixes it.</li>' +
      '<li>No login. On the payment desk, use <strong>Acting as</strong> to switch between Maker, Checker, Approver and Op Risk. On other screens use the <strong>Acting as</strong> menu at the top, which also has Head of Loan Ops. When a payment waits for another role, the desk shows a <strong>Switch to ...</strong> button.</li>' +
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
