/*
 * PCAP prototype: M4 Approval Behaviour Analytics (R-08 rubber-stamp score).
 * Team level by default. Individual view only for Tier 2 and 3 payments, with a logged reason.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store, C = PCAP.charts, DATA = PCAP.data;
  var views = PCAP.views = PCAP.views || {};
  var individualOpen = false;

  function st() { return store.st(); }
  function weekLabel(d) { var p = E.fmtDate(d).split(' '); return p[0] + ' ' + p[1]; }

  function currentSamples() {
    var m4 = st().m4;
    return m4.current.filter(function (s) {
      if (s.week) return s.week === m4.weekStart;
      return s.ts && U.localDate(new Date(s.ts)) >= m4.weekStart;
    });
  }

  function teamSummaries() {
    var cur = currentSamples();
    return DATA.approverTeams.map(function (team) {
      var s = E.summariseReviews(cur.filter(function (x) { return x.team === team; }));
      s.team = team;
      return s;
    });
  }

  function opRiskDesk() {
    var decided = st().payments.filter(function (p) { return p.opRisk; });
    var released = decided.filter(function (p) { return p.opRisk.decision === 'release'; }).length;
    var mins = E.median(decided.map(function (p) { return p.opRisk.minutesHeld; }));
    var secs = E.median(decided.map(function (p) { return p.opRisk.decideSec; }).filter(function (x) { return x != null; }));
    return { n: decided.length, released: released, rejected: decided.length - released, medianMinutes: mins, medianDecideSec: secs };
  }

  function render(el) {
    var m4 = st().m4;
    var teams = teamSummaries();
    var cur = currentSamples();
    var all = E.summariseReviews(cur);
    var worst = teams.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var weeks = [];
    m4.weeks.forEach(function (w) { if (weeks.indexOf(w.week) < 0) weeks.push(w.week); });
    weeks.sort();
    var labels = weeks.map(weekLabel).concat(['This week']);
    var series = DATA.approverTeams.map(function (team, i) {
      var vals = weeks.map(function (w) { var r = m4.weeks.filter(function (x) { return x.week === w && x.team === team; })[0]; return r ? r.score : null; });
      vals.push(teams[i].score);
      return { name: team.replace('Citi Approvers ', 'Team '), values: vals, color: C.SERIES[i] };
    });

    var t23 = cur.filter(function (s) { return s.tier >= 2; });
    var edges = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
    var bins = edges.map(function (lo, i) {
      var hi = edges[i + 1];
      var n = t23.filter(function (s) { return s.dwellSec >= lo && (hi == null || s.dwellSec < hi); }).length;
      var lab = hi == null ? lo + '+' : String(lo);
      return { label: lab, value: n, tip: (hi == null ? lo + ' s or more' : lo + ' to ' + hi + ' s') + ': ' + n + ' Tier 2 or 3 reviews' };
    });

    var live = st().m4.current.filter(function (s) { return s.live; }).slice(-8).reverse();
    var desk = opRiskDesk();
    var isOpRisk = st().role === 'oprisk';

    var html = '<div class="page-head"><h1>' + U.moduleChip('M4') + ' Approval Behaviour Analytics</h1><p class="lede">How approvals happen, not just that they happened. Signals are combined into the R-08 rubber-stamp score per team, scored weekly and reported to Operational Risk in the monthly control report. M4 never blocks a payment and never treats time on screen as a pass mark.</p></div>' +
      '<div class="banner privacy">' + U.icon('shield') + '<span><strong>Privacy by design.</strong> Team level by default. Named individuals only for Tier 2 and 3 payments, by Operational Risk, with a reason that is logged. Purpose is payment control, not productivity. Staff are told, and the Data Protection Officer is consulted before launch (PDPA purpose and notification).</span></div>' +
      '<div class="tiles">' +
      tile('Median time on the consequence screen (Tier 2 and 3)', all.medianDwellTier23Sec == null ? 'n/a' : U.fmtSec(all.medianDwellTier23Sec), all.nTier23 + ' reviews this week, all teams') +
      tile('Re-key slip rate', U.fmtPctPlain(all.mismatchRate), all.nSlips + ' slips and ' + all.nCatches + ' catches in ' + all.nRekeys + ' blind re-keys') +
      tile('Tier 2 approvals within 5 s of the warning', U.fmtPctPlain(all.fastApproveShare), all.nTier2Approvals + ' Tier 2 approvals') +
      tile('Highest R-08 score', worst ? String(worst.score) : 'n/a', worst ? worst.team : '', worst ? worst.rag : null) +
      '</div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h2>R-08 rubber-stamp score by team</h2><span class="muted small">Scored weekly, 0 to 100. Amber at 25, red at 50.</span></div>' +
      C.legend(series.map(function (s) { return { name: s.name, color: s.color }; }), 'line') +
      C.lineChart({ labels: labels, series: series, yMax: 100, yTicks: [0, 25, 50, 75, 100], bands: [{ from: 25, to: 50, color: C.STATUS.warning, label: 'Amber 25' }, { from: 50, to: 100, color: C.STATUS.critical, label: 'Red 50' }], ariaLabel: 'R-08 score by team over eight weeks' }) +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>Time on the consequence screen</h2><span class="muted small">Tier 2 and 3 reviews this week, all teams</span></div>' +
      C.columns({ bins: bins, marker: { index: 4, label: 'Fast look: under 8 s' }, ariaLabel: 'Histogram of seconds spent on the consequence screen' }) +
      '<p class="muted small">Seconds on the screen. A long look can still be a careless one, so this is one signal among three, never a pass mark.</p></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>This week by team</h2><span class="muted small">Table view of the chart above</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th class="num">Tier 2 and 3 reviews</th><th class="num">Median time (Tier 2 and 3)</th><th class="num">Fast looks</th><th class="num">Re-key slips</th><th class="num">Re-key catches</th><th class="num">Fast Tier 2 approvals</th><th class="num">R-08 score</th><th>Status</th></tr></thead><tbody>' +
      teams.map(function (t) {
        return '<tr><td>' + U.esc(t.team) + '</td><td class="num">' + t.nTier23 + '</td><td class="num">' + U.esc(t.medianDwellTier23Sec == null ? 'n/a' : U.fmtSec(t.medianDwellTier23Sec)) + '</td><td class="num">' + U.fmtPctPlain(t.fastLookShare, 0) + '</td><td class="num">' + U.fmtPctPlain(t.mismatchRate, 0) + '</td><td class="num">' + U.fmtPctPlain(t.catchRate, 0) + '</td><td class="num">' + U.fmtPctPlain(t.fastApproveShare, 0) + '</td><td class="num"><strong>' + t.score + '</strong> <span class="small muted">(' + t.parts.fastLook + ' + ' + t.parts.mismatch + ' + ' + t.parts.fastApprove + ')</span></td><td>' + U.ragChip(t.rag) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted small">Score = 40 x share of fast looks + 30 x (slip rate / 20%, capped at 1) + 30 x share of fast Tier 2 approvals. A catch (both re-keys disagree with the payment, so it is escalated) is the control working and does not count against the approver. Seeded history is synthetic. Approvals you make in this browser are added to this week.</p></div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h2>Measured in this browser</h2><span class="muted small">Real time on screen from the payment desk</span></div>' +
      (live.length ? '<table class="table"><thead><tr><th>Payment</th><th>Team</th><th>Tier</th><th class="num">Time on screen</th><th>Re-key</th><th>Decision</th></tr></thead><tbody>' +
        live.map(function (s) {
          var flags = [];
          if (s.tier >= 2 && s.dwellSec < E.DEFAULT_CONFIG.fastLookSec) flags.push('fast look');
          if (s.tier === 2 && s.decision === 'approve' && s.dwellSec < E.DEFAULT_CONFIG.fastApproveSec) flags.push('fast approval');
          return '<tr><td><a href="#" data-open-payment="' + U.esc(s.paymentId) + '">' + U.esc(s.paymentId) + '</a></td><td>' + U.esc(s.team.replace('Citi Approvers ', '')) + '</td><td>' + U.tierBadge(s.tier, { noLabel: true }) + '</td><td class="num">' + U.esc(U.fmtSec(s.dwellSec)) + (flags.length ? '<div class="small warn-text">' + U.esc(flags.join(', ')) + '</div>' : '') + '</td><td>' + U.esc(s.rekey || 'not needed') + '</td><td>' + U.esc(s.decision) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="empty">No approvals made in this browser yet. Approve or escalate a payment on the payment desk and it appears here.</p>') + '</div>' +
      '<div class="card"><div class="card-head"><h2>Second-line decisions</h2><span class="muted small">Watching the watchers</span></div>' +
      '<div class="kv-grid one">' +
      kv('Tier 3 holds decided', String(desk.n)) + kv('Released with a reason', String(desk.released)) + kv('Rejected as real errors', String(desk.rejected)) +
      kv('Median minutes on hold', desk.medianMinutes == null ? 'n/a' : String(desk.medianMinutes)) + kv('Median seconds to decide (measured)', desk.medianDecideSec == null ? 'n/a' : String(Math.round(desk.medianDecideSec))) +
      '</div><p class="muted small">Second-line releases are tracked too, so the hard stop does not simply move the rubber stamp to Operational Risk.</p></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>Individual view</h2><span class="muted small">Restricted: Tier 2 and 3 payments only</span></div>' +
      (individualOpen && isOpRisk ? individualTable(cur) : '<p>Named figures are hidden by default. ' + (isOpRisk ? 'Open them only for a control reason. The reason is written to the event log.' : 'Only Operational Risk can open this view.') + '</p>' +
        '<button class="btn" data-act="individual"' + (isOpRisk ? '' : ' disabled') + '>' + U.icon('eye') + ' Open individual view (Tier 2 and 3 only)</button>') +
      '</div>';

    el.innerHTML = html;
    el.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (b.getAttribute('data-act') === 'individual') {
        var reason = window.prompt('Why do you need named figures? This is logged.', 'Team TPA is red on R-08 this week. Reviewing Tier 2 and 3 approvals before coaching.');
        if (!reason || reason.trim().length < 10) { U.toast('A reason of at least 10 characters is needed.', 'bad'); return; }
        store.logIndividualView(store.roleUserId('oprisk'), reason.trim());
        individualOpen = true;
        PCAP.app.render();
      } else if (b.getAttribute('data-act') === 'close-individual') {
        individualOpen = false;
        PCAP.app.render();
      }
    };
  }

  function individualTable(cur) {
    var t23 = cur.filter(function (s) { return s.tier >= 2; });
    var by = {};
    t23.forEach(function (s) { (by[s.approverId] = by[s.approverId] || []).push(s); });
    var rows = Object.keys(by).map(function (id) {
      var s = E.summariseReviews(by[id]);
      var u = store.user(id) || { name: id, team: '' };
      return { name: u.name, team: u.team, s: s };
    }).sort(function (a, b) { return b.s.score - a.s.score; });
    return '<table class="table"><thead><tr><th>Approver</th><th>Team</th><th class="num">Tier 2 and 3 reviews</th><th class="num">Median time</th><th class="num">Fast looks</th><th class="num">Slips</th><th class="num">Score</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + U.esc(r.name) + '</td><td>' + U.esc(r.team) + '</td><td class="num">' + r.s.nTier23 + '</td><td class="num">' + U.esc(U.fmtSec(r.s.medianDwellTier23Sec)) + '</td><td class="num">' + U.fmtPctPlain(r.s.fastLookShare, 0) + '</td><td class="num">' + r.s.nSlips + '</td><td class="num">' + r.s.score + ' ' + U.ragChip(r.s.rag) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="muted small">Use for coaching and control review, not automatic discipline. Opening this view was logged in M6.</p><button class="btn small" data-act="close-individual">Close individual view</button>';
  }

  function tile(label, value, sub, rag) { return PCAP.views.register.tile(label, value, sub, rag); }
  function kv(k, v) { return '<div class="kv"><span class="k">' + U.esc(k) + '</span><span class="v">' + U.esc(v) + '</span></div>'; }

  views.analytics = { render: render, teamSummaries: teamSummaries, currentSamples: currentSamples };
})(typeof globalThis !== 'undefined' ? globalThis : this);
