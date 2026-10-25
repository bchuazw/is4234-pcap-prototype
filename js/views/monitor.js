/*
 * PCAP prototype: M5 Compensating Control Monitor (R-09 control health).
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  function st() { return store.st(); }

  function render(el) {
    var health = store.controlHealth();
    var byId = {};
    health.controls.forEach(function (c) { byId[c.id] = c; });
    var defs = st().ctx.controls;
    var actor = store.roleUserId(st().role);
    var pays = st().payments;
    var today = store.today();
    var isAudit = st().role === 'audit';
    var involved = E.involvedIn(pays.map(function (p) { return { releasedDate: p.releasedDate, makerId: p.makerId, checkerId: p.checkerId, approverId: p.approverId }; }), actor, today);
    var actions = {
      'CC-01': '<button class="btn small primary" data-act="recon"' + (isAudit ? ' disabled title="Internal Audit reviews controls but does not run them"' : '') + '>Run same-day reconciliation</button>',
      'CC-02': '<a class="btn small" href="#/register">Open register</a>',
      'CC-03': '<a class="btn small" href="#/register">Open register</a>',
      'CC-04': '<button class="btn small" data-act="scroll-cert">See certifications</button>',
      'CC-05': '<button class="btn small" data-act="queue">Open hard-stop queue</button>',
      'CC-06': '<button class="btn small primary" data-act="regression"' + (isAudit ? ' disabled title="Internal Audit reviews controls but does not run them"' : '') + '>Run replay regression test</button>'
    };
    var overallText = { green: 'All compensating controls ran and passed.', amber: 'Some controls need attention. Owners have been alerted.', red: 'At least one control failed or did not run. Escalate to the owner and the second line.' };

    var cards = '<div class="cc-grid">' + defs.map(function (d) {
      var h = byId[d.id] || { rag: 'green', message: '' };
      return '<div class="cc-card rag-border-' + h.rag + '"><div class="cc-head"><span class="cc-id">' + U.esc(d.id) + '</span>' + U.ragChip(h.rag) + '</div>' +
        '<div class="cc-name">' + U.esc(d.name) + '</div>' +
        '<div class="cc-msg">' + U.esc(h.message) + '</div>' +
        '<div class="cc-foot"><span class="small muted">Owner ' + U.esc(store.userName(d.ownerId)) + ', ' + U.esc(d.frequency.charAt(0).toLowerCase() + d.frequency.slice(1)) + '</span>' + (actions[d.id] || '') + '</div></div>';
    }).join('') + '</div>';

    var rec = E.reconcile(pays.map(function (p) { return { id: p.id, loanId: p.loanId, status: p.status, releasedDate: p.releasedDate, releasedExternal: p.releasedExternal, expectedAtRelease: p.expectedAtRelease, releasedBy: p.releasedBy }; }), today);
    var runs = st().reconRuns.slice(-5).reverse();
    var recon = '<div class="card"><div class="card-head"><h2>Same-day reconciliation: released vs expected</h2><span class="muted small">Business date ' + U.esc(U.fmtDate(today)) + '</span></div>' +
      (isAudit ? '<div class="banner info">' + U.icon('info') + '<span>As Internal Audit (third line) you review these results but do not run the controls, or you would be auditing your own work. Switch role to Operational Risk to run them.</span></div>' : '') +
      (involved && !isAudit ? '<div class="banner warn">' + U.icon('warn') + '<span>You (' + U.esc(store.userName(actor)) + ') took part in a payment released today, so a run by you will be logged as not independent. Switch role to Operational Risk.</span></div>' : '') +
      (rec.rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Payment</th><th>Loan</th><th>Released by</th><th class="num">Left the bank</th><th class="num">Schedule expected</th><th class="num">Difference</th><th>Status</th></tr></thead><tbody>' +
        rec.rows.map(function (r) {
          return '<tr><td><a href="#" data-open-payment="' + r.id + '">' + r.id + '</a></td><td>' + U.esc(r.loanId) + '</td><td>' + U.esc(store.userName(r.releasedBy)) + '</td><td class="num">' + U.esc(U.fmtUSD(r.released)) + '</td><td class="num">' + U.esc(U.fmtUSD(r.expected)) + '</td><td class="num' + (r.isBreak ? ' bad-text' : '') + '">' + (r.diff > 0 ? '+' : '') + U.esc(U.fmtUSD(r.diff)) + '</td><td>' + (r.isBreak ? U.ragChip('red', 'Break') : U.ragChip('green', 'Matched')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nothing released today yet.</p>') +
      '<h3>Recent runs</h3>' +
      (runs.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th>Run by</th><th>Independent</th><th class="num">Payments</th><th class="num">Breaks</th></tr></thead><tbody>' +
        runs.map(function (r) { return '<tr><td>' + U.esc(U.fmtDate(r.date)) + '</td><td>' + U.esc(r.time) + '</td><td>' + U.esc(store.userName(r.by)) + '</td><td>' + (r.independent ? U.ragChip('green', 'Yes') : U.ragChip('red', 'No')) + '</td><td class="num">' + r.rows + '</td><td class="num">' + (r.breaks ? '<strong>' + r.breaks + '</strong> (' + U.esc(U.fmtUSD(r.breakTotal)) + ')' : '0') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">No runs yet.</p>') +
      '<p class="muted small">At Citibank the error only surfaced at the cash-break review the next morning. Here the reconciliation runs the same day, by someone independent of the maker, against the expected amount.</p></div>';

    var approvers = st().ctx.users.filter(function (u) { return (u.roles || []).indexOf('approver') >= 0; });
    var certs = '<div class="card" id="cert-table"><div class="card-head"><h2>Approver certifications and entitlements</h2><span class="muted small">Certification per override type, approval limit by consequence</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Approver</th><th>Employer and team</th><th class="num">Approval limit</th><th>Certification</th><th>Valid until</th><th>Status</th></tr></thead><tbody>' +
      approvers.map(function (u) {
        var c = (u.certs || [])[0];
        var status;
        if (!c) status = '<span class="chip status">None held</span>';
        else if (c.validUntil < today) status = U.ragChip('red', 'Lapsed ' + E.daysBetween(c.validUntil, today) + ' days ago');
        else if (E.daysBetween(today, c.validUntil) <= 30) status = U.ragChip('amber', 'Expires in ' + E.daysBetween(today, c.validUntil) + ' days');
        else status = U.ragChip('green', 'Current');
        return '<tr><td>' + U.esc(u.name) + '<div class="small muted">' + U.esc(u.title) + '</div></td><td>' + U.esc(u.employer + ', ' + u.team) + '</td><td class="num">' + U.esc(U.fmtCompact(u.approvalLimit)) + '</td><td>' + (c ? U.esc(c.type) : '') + '</td><td>' + (c ? U.esc(U.fmtDate(c.validUntil)) : '') + '</td><td>' + status + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="muted small">The M3 gate (R-05) blocks override approvals by anyone without a current certification, so a lapsed certificate is amber here. It turns red only if an override approval ever happens without one.</p></div>';

    var reg = st().regressionRuns.slice(-5).reverse();
    var tests = '<div class="card"><div class="card-head"><h2>Replay regression test log</h2><span class="muted small">Re-runs the Revlon replay through the live rules</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Run by</th><th>Result</th><th>Detail</th></tr></thead><tbody>' +
      reg.map(function (r) { return '<tr><td>' + U.esc(U.fmtDate(r.date)) + '</td><td>' + U.esc(store.userName(r.by)) + '</td><td>' + (r.pass ? U.ragChip('green', 'Pass') : U.ragChip('red', 'Fail')) + '</td><td class="small">' + U.esc(r.detail) + (r.hits ? '. Rules: ' + U.esc(r.hits.join(', ')) : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';

    el.innerHTML = '<div class="page-head"><h1>' + U.moduleChip('M5') + ' Compensating Control Monitor</h1><p class="lede">Checks that the controls around the payment actually ran, every day, with an owner and a test. R-09 turns each one red, amber or green and feeds the Board KRIs in M6.</p>' +
      '<p class="lede">A compensating control brings a risk back to an acceptable level when the main control cannot be fixed, here the core system that cannot pay interest only. These are the controls report 3.3.3 says were missing: the expected-amount reconciliation (R-01 and CC-01), the unscheduled principal hold (R-02), the governed workaround (M1, CC-02 and CC-03) and the certified in-house approver (M3, CC-04).</p></div>' +
      '<div class="overall rag-border-' + health.overall + '"><div>' + U.ruleChip('R-09') + ' <strong>Control health</strong> ' + U.ragChip(health.overall, health.overall === 'green' ? 'Green' : health.overall === 'amber' ? 'Amber' : 'Red') + '</div><p>' + U.esc(overallText[health.overall]) + '</p></div>' +
      cards + recon + certs + tests;

    el.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (b.disabled) return;
      if (act === 'recon') {
        var run = store.runReconciliation(actor);
        U.toast('Reconciliation run: ' + run.rows + ' payments, ' + run.breaks + ' breaks' + (run.independent ? '.' : '. Not independent.'), run.breaks || !run.independent ? 'bad' : 'ok');
        PCAP.app.render();
      } else if (act === 'regression') {
        var r = store.runRegressionTest(actor);
        U.toast('Replay regression test ' + (r.pass ? 'passed.' : 'failed.'), r.pass ? 'ok' : 'bad');
        PCAP.app.render();
      } else if (act === 'queue') {
        PCAP.app.setRole('oprisk', 'desk');
      } else if (act === 'scroll-cert') {
        var t = document.getElementById('cert-table');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  }

  views.monitor = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
