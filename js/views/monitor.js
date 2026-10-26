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
    var role = st().role;
    var isAudit = !store.canRunControls(role); /* Internal Audit, the Board and the provider read results, they do not run controls */
    var involved = E.involvedIn(pays.map(function (p) { return { releasedDate: p.releasedDate, makerId: p.makerId, checkerId: p.checkerId, approverId: p.approverId }; }), actor, today);
    var actions = {
      'CC-01': '<button class="btn small primary" data-act="recon"' + (isAudit ? ' disabled title="Read only: Operational Risk runs this control"' : '') + '>Run same-day reconciliation</button>',
      'CC-02': '<a class="btn small" href="#/register">Open workarounds</a>',
      'CC-03': '<a class="btn small" href="#/register">Open workarounds</a>',
      'CC-04': '<button class="btn small" data-act="scroll-cert">See certificates</button>',
      'CC-05': '<button class="btn small" data-act="queue">Open stopped payments</button>',
      'CC-06': '<button class="btn small primary" data-act="regression"' + (isAudit ? ' disabled title="Read only: Operational Risk runs this control"' : '') + '>Re-run the 2020 payment test</button>'
    };
    var overallText = { green: 'Every safety check ran and passed.', amber: 'Some checks need attention. Their owners can see it.', red: 'At least one check failed or did not run. Its owner needs to act, and Operational Risk follows it up.' };

    var cards = '<div class="cc-grid">' + defs.map(function (d) {
      var h = byId[d.id] || { rag: 'green', message: '' };
      return '<div class="cc-card rag-border-' + h.rag + '"><div class="cc-head"><span class="cc-id code-tag">' + U.esc(d.id) + '</span>' + U.ragChip(h.rag) + '</div>' +
        '<div class="cc-name">' + U.esc(d.name) + '</div>' +
        '<div class="cc-msg">' + U.say(h.message) + '</div>' +
        '<div class="cc-foot"><span class="small muted">Owner ' + U.esc(store.userName(d.ownerId)) + ', ' + U.esc(d.frequency.charAt(0).toLowerCase() + d.frequency.slice(1)) + '</span>' + (actions[d.id] || '') + '</div></div>';
    }).join('') + '</div>';

    var rec = E.reconcile(pays.map(function (p) { return { id: p.id, loanId: p.loanId, status: p.status, releasedDate: p.releasedDate, releasedExternal: p.releasedExternal, expectedAtRelease: p.expectedAtRelease, releasedBy: p.releasedBy }; }), today);
    var runs = st().reconRuns.slice(-5).reverse();
    var recon = '<div class="card"><div class="card-head"><h2>Today: what left the bank against what was due</h2><span class="muted small">Same-day reconciliation, ' + U.esc(U.fmtDate(today)) + '</span></div>' +
      (isAudit ? '<div class="banner info">' + U.icon('info') + '<span>' + (role === 'audit' ? 'As Internal Audit you review these results but do not run the checks, or you would be auditing your own work.' : 'You read these results but do not run the checks.') + ' Operational Risk runs them.</span></div>' : '') +
      (involved && !isAudit ? '<div class="banner warn">' + U.icon('warn') + '<span>You (' + U.esc(store.userName(actor)) + ') took part in a payment released today, so a run by you will be logged as not independent. Switch role to Operational Risk.</span></div>' : '') +
      (rec.rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Payment</th><th>Loan</th><th>Released by</th><th class="num">Left the bank</th><th class="num">Schedule expected</th><th class="num">Difference</th><th>Status</th></tr></thead><tbody>' +
        rec.rows.map(function (r) {
          return '<tr><td><a href="#" data-open-payment="' + r.id + '">' + r.id + '</a></td><td>' + U.esc(r.loanId) + '</td><td>' + U.esc(store.userName(r.releasedBy)) + '</td><td class="num">' + U.esc(U.fmtUSD(r.released)) + '</td><td class="num">' + U.esc(U.fmtUSD(r.expected)) + '</td><td class="num' + (r.isBreak ? ' bad-text' : '') + '">' + (r.diff > 0 ? '+' : '') + U.esc(U.fmtUSD(r.diff)) + '</td><td>' + (r.isBreak ? U.ragChip('red', 'Break') : U.ragChip('green', 'Matched')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nothing released today yet.</p>') +
      '<details class="more"><summary>Recent runs (' + runs.length + ')<svg class="ico fold-chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 6.2L8 9.7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>' +
      (runs.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th>Run by</th><th>Independent</th><th class="num">Payments</th><th class="num">Breaks</th></tr></thead><tbody>' +
        runs.map(function (r) { return '<tr><td>' + U.esc(U.fmtDate(r.date)) + '</td><td>' + U.esc(r.time) + '</td><td>' + U.esc(store.userName(r.by)) + '</td><td>' + (r.independent ? U.ragChip('green', 'Yes') : U.ragChip('red', 'No')) + '</td><td class="num">' + r.rows + '</td><td class="num">' + (r.breaks ? '<strong>' + r.breaks + '</strong> (' + U.esc(U.fmtUSD(r.breakTotal)) + ')' : '0') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">No runs yet.</p>') + '</details>' +
      '<p class="muted small">At Citibank the error only surfaced at the cash-break review the next morning. Here the reconciliation runs the same day, by someone independent of the maker, against the expected amount.</p></div>';

    var approvers = st().ctx.users.filter(function (u) { return (u.roles || []).indexOf('approver') >= 0; });
    var certs = U.fold('Approver certificates and limits', 'Who is certified for which workaround, and how much each approver may release', '<div class="table-wrap"><table class="table"><thead><tr><th>Approver</th><th>Employer and team</th><th class="num">Approval limit</th><th>Certified for</th><th>Valid until</th><th>Status</th></tr></thead><tbody>' +
      approvers.map(function (u) {
        var c = (u.certs || [])[0];
        var status;
        if (!c) status = '<span class="chip status">None held</span>';
        else if (c.validUntil < today) status = U.ragChip('red', 'Lapsed ' + E.daysBetween(c.validUntil, today) + ' days ago');
        else if (E.daysBetween(today, c.validUntil) <= 30) status = U.ragChip('amber', 'Expires in ' + E.daysBetween(today, c.validUntil) + ' days');
        else status = U.ragChip('green', 'Current');
        return '<tr><td>' + U.esc(u.name) + '<div class="small muted">' + U.esc(u.title) + '</div></td><td>' + U.esc(u.employer + ', ' + u.team) + '</td><td class="num">' + U.esc(U.fmtCompact(u.approvalLimit)) + '</td><td>' + (c ? U.esc(c.type) : '') + '</td><td>' + (c ? U.esc(U.fmtDate(c.validUntil)) : '') + '</td><td>' + status + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="muted small">PCAP will not let anyone without a current certificate approve a workaround payment, so a lapsed certificate is amber here. It turns red only if such an approval ever happens. ' + U.codeTag('M3, R-05') + '</p>', { id: 'cert-table' });

    var reg = st().regressionRuns.slice(-5).reverse();
    var tests = U.fold('2020 payment test log', 'Each run puts the 2020 payment through the live rules and checks PCAP still stops it', '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Run by</th><th>Result</th><th>Detail</th></tr></thead><tbody>' +
      reg.map(function (r) { return '<tr><td>' + U.esc(U.fmtDate(r.date)) + '</td><td>' + U.esc(store.userName(r.by)) + '</td><td>' + (r.pass ? U.ragChip('green', 'Pass') : U.ragChip('red', 'Fail')) + '</td><td class="small">' + U.esc(r.detail) + (r.hits ? '<span class="code-tag">. Rules: ' + U.esc(r.hits.join(', ')) + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>');

    var mineNotGreen = defs.filter(function (d) { return d.ownerId === actor && (byId[d.id] || {}).rag !== 'green'; }).length;
    el.innerHTML = '<div class="page-head"><h1>Daily checks ' + U.moduleChip('M5') + '</h1>' + PCAP.views.nowLine('monitor', role, { n: mineNotGreen }) + '</div>' +
      '<div class="overall rag-border-' + health.overall + '"><div><strong>All checks together</strong> ' + U.ragChip(health.overall, health.overall === 'green' ? 'Green' : health.overall === 'amber' ? 'Amber' : 'Red') + ' ' + U.ruleChip('R-09') + '</div><p>' + U.esc(overallText[health.overall]) + '</p></div>' +
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
        U.toast('2020 payment test ' + (r.pass ? 'passed: PCAP still stops it.' : 'failed.'), r.pass ? 'ok' : 'bad');
        PCAP.app.render();
      } else if (act === 'queue') {
        PCAP.app.setRole('oprisk', 'desk');
      } else if (act === 'scroll-cert') {
        var t = document.getElementById('cert-table');
        if (t) { t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }
    };
  }

  views.monitor = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
