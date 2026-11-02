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

  /* Approvers per team, so a team score is only shown when it cannot point at one person. */
  function teamSize(team) {
    return st().ctx.users.filter(function (u) { return u.team === team && (u.roles || []).indexOf('approver') >= 0; }).length;
  }

  function teamSummaries() {
    var cur = currentSamples();
    return DATA.approverTeams.map(function (team) {
      var s = E.summariseReviews(cur.filter(function (x) { return x.team === team; }));
      s.team = team;
      s.size = teamSize(team);
      s.reportable = E.teamReportable(s.size);
      return s;
    });
  }

  /* The outsourced provider (Wipro), at provider level, from the event log. The bank monitors the service, the provider manages its own staff. */
  function outsourcedTeams() {
    var s = st();
    var tierAt = {};
    var rows = [];
    s.events.forEach(function (e) {
      if (!e.paymentId) return;
      var actor = store.user(e.actorId);
      var outsourced = actor && !actor.inHouse;
      if (e.type === 'SUBMITTED' || e.type === 'RESUBMITTED') {
        tierAt[e.paymentId] = e.data ? e.data.tier : null;
        if (outsourced) rows.push({ team: actor.employer, kind: 'keyed', tier: tierAt[e.paymentId] });
      } else if (e.type === 'CHECKED' && outsourced) {
        rows.push({ team: actor.employer, kind: 'checked', tier: tierAt[e.paymentId] });
      } else if (e.type === 'RETURNED' && outsourced && e.data && e.data.stage === 'checker') {
        rows.push({ team: actor.employer, kind: 'returned', tier: tierAt[e.paymentId] });
      } else if (e.type === 'HELD' && outsourced) {
        rows.push({ team: actor.employer, kind: 'referred', tier: 3 });
      }
    });
    return E.summariseOutsourced(rows);
  }

  function opRiskDesk() {
    var decided = [];
    st().payments.forEach(function (p) { (p.opRiskHistory || []).concat(p.opRisk ? [p.opRisk] : []).forEach(function (o) { decided.push(o); }); });
    var accepted = decided.filter(function (o) { return o.decision === 'accept'; });
    var released = accepted.filter(function (o) { return o.acceptance && o.acceptance.release && !o.acceptance.release.declined; }).length;
    var mins = E.median(decided.map(function (o) { return o.minutesHeld; }));
    var secs = E.median(decided.map(function (o) { return o.decideSec; }).filter(function (x) { return x != null; }));
    return { n: decided.length, accepted: accepted.length, released: released, rejected: decided.length - accepted.length, medianMinutes: mins, medianDecideSec: secs };
  }

  function render(el) {
    var m4 = st().m4;
    var teams = teamSummaries();
    var cur = currentSamples();
    var all = E.summariseReviews(cur);
    var worst = teams.filter(function (t) { return t.reportable; }).sort(function (a, b) { return b.score - a.score; })[0];
    var vendor = outsourcedTeams();
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
      return { label: lab, value: n, tip: (hi == null ? lo + ' s or more' : lo + ' to ' + hi + ' s') + ': ' + n + ' reviews of payments that needed a closer look' };
    });

    var live = st().m4.current.filter(function (s) { return s.live; }).slice(-8).reverse();
    var desk = opRiskDesk();
    var isOpRisk = st().role === 'oprisk';

    var flaggedTeams = teams.filter(function (t) { return t.reportable && t.rag !== 'green'; }).map(function (t) { return t.team.replace('Citi Approvers ', 'Team '); });
    var pairs = store.reviewerPairs();
    var html = '<div class="page-head"><h1>Approval habits ' + U.moduleChip('M4') + '</h1>' + PCAP.views.nowLine('analytics', st().role, { teams: flaggedTeams.join(' and ') }) + '</div>' +
      '<div class="banner privacy">' + U.icon('shield') + '<div><strong>Team level only.</strong> A team needs at least ' + E.DEFAULT_CONFIG.m4MinTeam + ' approvers to get a score, so a score never points at one person. It never blocks a payment.' +
      '<details class="more"><summary>More about privacy</summary><p class="small">Only three signals, all from approvals of payments that needed a closer look, nothing else about the person. Named people only by Operational Risk, with a reason that is logged. The purpose is payment control, not productivity, and the score never decides discipline on its own. Staff are told, and the Data Protection Officer is consulted before launch (PDPA purpose and notification).</p></details></div></div>' +
      '<div class="tiles">' + followTile(teams) + pairsTile(pairs, teams) +
      tile('Median time reading a payment that needed a closer look', all.medianDwellTier23Sec == null ? 'n/a' : U.fmtSec(all.medianDwellTier23Sec), all.nTier23 + ' reviews this week, all teams') +
      tile('Wrong first figure', U.fmtPctPlain(all.mismatchRate), all.nSlips + ' wrong first figures and ' + all.nCatches + ' mistakes caught in ' + all.nRekeys + ' typed checks') +
      tile('Approved within 5 s of a warning', U.fmtPctPlain(all.fastApproveShare), 'of ' + all.nTier2Approvals + ' approvals after a closer-look warning') +
      '</div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h2>Rubber-stamp score by team ' + U.ruleChip('R-08') + '</h2><span class="muted small">Weekly, 0 to 100. Amber from 25, red from 50.</span></div>' +
      C.legend(series.map(function (s) { return { name: s.name, color: s.color }; }), 'line') +
      C.lineChart({ labels: labels, series: series, yMax: 100, yTicks: [0, 25, 50, 75, 100], bands: [{ from: 25, to: 50, color: C.STATUS.warning, label: 'Amber 25' }, { from: 50, to: 100, color: C.STATUS.critical, label: 'Red 50' }], ariaLabel: 'R-08 score by team over eight weeks' }) +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>How long approvers looked</h2><span class="muted small">Payments that needed a closer look, this week, all teams</span></div>' +
      C.columns({ bins: bins, marker: { index: 4, label: 'Fast look: under 8 s' }, ariaLabel: 'Histogram of seconds spent on the consequence screen' }) +
      '<p class="muted small">Seconds on the screen. A long look can still be a careless one, so this is one signal among three, never a pass mark.</p></div>' +
      '</div>' +
      U.fold('This week by team, as a table', 'The numbers behind the score chart', '<div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th class="num">Closer-look reviews</th><th class="num">Median time</th><th class="num">Quick looks</th><th class="num">Wrong first figures</th><th class="num">Mistakes caught</th><th class="num">Quick approvals after a warning</th><th class="num">Score</th><th>Status</th><th class="num">Reviewer pairs to sample</th></tr></thead><tbody>' +
      teams.map(function (t) {
        if (!t.reportable) return '<tr><td>' + U.esc(t.team) + '</td><td colspan="9" class="muted small">Only ' + t.size + ' approver' + (t.size === 1 ? '' : 's') + ', so no team figure is shown (it would point at one person).</td></tr>';
        var np = pairs.byTeam[t.team] || 0;
        return '<tr><td>' + U.esc(t.team) + ' <span class="small muted">(' + t.size + ' approvers)</span></td><td class="num">' + t.nTier23 + '</td><td class="num">' + U.esc(t.medianDwellTier23Sec == null ? 'n/a' : U.fmtSec(t.medianDwellTier23Sec)) + '</td><td class="num">' + U.fmtPctPlain(t.fastLookShare, 0) + '</td><td class="num">' + U.fmtPctPlain(t.mismatchRate, 0) + '</td><td class="num">' + U.fmtPctPlain(t.catchRate, 0) + '</td><td class="num">' + U.fmtPctPlain(t.fastApproveShare, 0) + '</td><td class="num"><strong>' + t.score + '</strong> <span class="small muted">(' + t.parts.fastLook + ' + ' + t.parts.mismatch + ' + ' + t.parts.fastApprove + ')</span></td><td>' + U.ragChip(t.rag) + '</td><td class="num">' + (np ? '<strong class="warn-text">' + np + '</strong>' : '0') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted small">Score = 40 x share of quick looks (under 8 s) + 30 x (wrong first figures / 20%, capped at 1) + 30 x share of approvals within 5 s of a warning. A caught mistake (both figures disagree with the payment, so it is stopped) is the check working and does not count against the approver. Reviewer pairs to sample are counted apart from the score: one approver handled at least ' + Math.round(E.DEFAULT_CONFIG.pairShare * 100) + '% of one maker\'s payments this week, once that maker has at least ' + E.DEFAULT_CONFIG.pairMinReviews + '. Earlier weeks are made up. Approvals you make in this browser are added to this week.</p>', { id: 'team-table' }) +
      '<div class="grid-2">' +
      U.fold('Measured in this browser', 'Real time on screen for the approvals made here', (
      live.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Payment</th><th>Team</th><th>PCAP found</th><th class="num">Time on screen</th><th>Typed check</th><th>Decision</th></tr></thead><tbody>' +
        live.map(function (s) {
          var flags = [];
          if (s.tier >= 2 && s.dwellSec < E.DEFAULT_CONFIG.fastLookSec) flags.push('fast look');
          if (s.tier === 2 && s.decision === 'approve' && s.dwellSec < E.DEFAULT_CONFIG.fastApproveSec) flags.push('fast approval');
          return '<tr><td><a href="#" data-open-payment="' + U.esc(s.paymentId) + '">' + U.esc(s.paymentId) + '</a></td><td>' + U.esc(s.team.replace('Citi Approvers ', '')) + '</td><td>' + U.tierBadge(s.tier, { noLabel: true }) + '</td><td class="num">' + U.esc(U.fmtSec(s.dwellSec)) + (flags.length ? '<div class="small warn-text">' + U.esc(flags.join(', ')) + '</div>' : '') + '</td><td>' + U.esc(s.rekey || 'not needed') + '</td><td>' + U.esc(s.decision) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No approvals made in this browser yet. Release or stop a payment on Payments and it appears here.</p>')) +
      U.fold('Operational Risk decisions', 'Watching the watchers: how stopped payments were assessed', '<div class="kv-grid one">' +
      kv('Stopped payments assessed', String(desk.n)) + kv('Returned as real errors', String(desk.rejected)) + kv('Risk signed off', String(desk.accepted)) +
      kv('Then released by the Head of Loan Ops', String(desk.released)) +
      kv('Median minutes stopped', desk.medianMinutes == null ? 'n/a' : String(desk.medianMinutes)) + kv('Median seconds to decide (measured)', desk.medianDecideSec == null ? 'n/a' : String(Math.round(desk.medianDecideSec))) +
      '</div><p class="muted small">Operational Risk assesses stopped payments but cannot release one, and it owns this screen, so it cannot be the only check on its own sign-offs. These figures also go to the Board, and Internal Audit reviews every risk sign-off on Board and audit.</p>') +
      '</div>' +
      '<div class="card" id="provider-card"><div class="card-head"><h2>Outsourced provider: makers and checkers</h2><span class="muted small">The service as a whole, never by person ' + U.codeTag('MAS Notice 658, Outsourcing Guidelines 3.1.1') + '</span></div>' +
      (vendor.length ? providerTable(vendor) : '<p class="empty">No outsourced keying or checks yet.</p>') + checkerPairsLine(pairs) +
      '<p class="muted small">The work is outsourced, the accountability is not. In 2020 the outsourced checker passed the payment on. Here a stopped payment cannot be passed on: the provider\'s staff return it or refer it to Operational Risk, and both are counted for the provider as a whole in the monthly provider review. The bank watches the service and the provider manages its own staff, so nothing here names a person. In this demo one maker and one checker do most of the work.</p></div>' +
      '<div class="card"><div class="card-head"><h2>Named view</h2><span class="muted small">Restricted: only payments that needed a closer look or were stopped</span></div>' +
      (individualOpen && isOpRisk ? individualTable(cur, pairs) : '<p>Names are hidden by default, for the scores and for the reviewer pairs. ' + (isOpRisk ? 'Open them only for a control reason. Your reason is written to the activity log.' : 'Only Operational Risk can open this view.') + '</p>' +
        '<button class="btn" data-act="individual"' + (isOpRisk ? '' : ' disabled') + '>' + U.icon('eye') + ' Open the named view (logged)</button>') +
      '</div>';

    if (st().role === 'vendor') html = vendorView(vendor);
    else if (PCAP.views.value && isOpRisk) html = html.replace('<div class="banner privacy">', PCAP.views.value.strip('oprisk') + '<div class="banner privacy">');
    el.innerHTML = html;
    el.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (b.getAttribute('data-act') === 'individual') {
        PCAP.dialog.reason({ title: 'Open the named view?', text: 'Names are hidden by default. Say why you need them. Your reason is written to the activity log.',
          label: 'Your reason', value: 'Team TPA is red on the rubber-stamp score this week. Reviewing its closer-look approvals before coaching.',
          min: E.DEFAULT_CONFIG.reasonMinChars, ok: 'Open the named view' }).then(function (reason) {
          if (reason == null) return;
          try { store.logIndividualView(store.roleUserId('oprisk'), reason); } catch (err) { U.toast(String(err && err.message || err), 'bad'); return; }
          individualOpen = true;
          PCAP.app.render();
        });
      } else if (b.getAttribute('data-act') === 'close-individual') {
        individualOpen = false;
        PCAP.app.render();
      }
    };
  }

  /* R-08 concentrated reviewer pairs: a count per team, never names, unless the named view is opened with a logged reason. */
  function pairsTile(pairs, teams) {
    var shown = teams.filter(function (t) { return t.reportable && pairs.byTeam[t.team]; });
    var n = shown.reduce(function (s, t) { return s + pairs.byTeam[t.team]; }, 0);
    var sub = n
      ? shown.map(function (t) { return t.team.replace('Citi Approvers ', 'Team ') + ': ' + pairs.byTeam[t.team]; }).join(', ') + '. One approver handled ' + Math.round(E.DEFAULT_CONFIG.pairShare * 100) + '% or more of one maker\'s payments this week. Sample them. Not part of the score.'
      : 'No approver handled ' + Math.round(E.DEFAULT_CONFIG.pairShare * 100) + '% or more of one maker\'s payments this week.';
    return tile('Reviewer pairs to sample', String(n), sub, n ? 'amber' : 'green').replace('<div class="tile">', '<div class="tile" id="r08-pairs">');
  }

  function pairsTable(pairs) {
    var list = pairs.pairs.filter(function (p) { return p.role === 'approver'; });
    if (!list.length) return '<p class="muted small">No concentrated reviewer pairs this week.</p>';
    return '<h3>Reviewer pairs to sample</h3><div class="table-wrap"><table class="table"><thead><tr><th>Approver</th><th>Team</th><th>Maker</th><th class="num">Reviews</th><th class="num">Share of the maker\'s payments</th></tr></thead><tbody>' +
      list.map(function (p) { return '<tr><td>' + U.esc(store.userName(p.reviewerId)) + '</td><td>' + U.esc(p.team) + '</td><td>' + U.esc(store.userName(p.makerId)) + '</td><td class="num">' + p.reviews + ' of ' + p.makerReviews + '</td><td class="num">' + U.fmtPctPlain(p.share, 0) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="muted small">A pair is a signal for second-line sampling, not proof of a problem. It can mean familiarity or one person covering a desk.</p>';
  }

  function individualTable(cur, pairs) {
    var t23 = cur.filter(function (s) { return s.tier >= 2; });
    var by = {};
    t23.forEach(function (s) { (by[s.approverId] = by[s.approverId] || []).push(s); });
    var rows = Object.keys(by).map(function (id) {
      var s = E.summariseReviews(by[id]);
      var u = store.user(id) || { name: id, team: '' };
      return { name: u.name, team: u.team, s: s };
    }).sort(function (a, b) { return b.s.score - a.s.score; });
    return '<div class="table-wrap"><table class="table"><thead><tr><th>Approver</th><th>Team</th><th class="num">Closer-look reviews</th><th class="num">Median time</th><th class="num">Quick looks</th><th class="num">Wrong first figures</th><th class="num">Score</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + U.esc(r.name) + '</td><td>' + U.esc(r.team) + '</td><td class="num">' + r.s.nTier23 + '</td><td class="num">' + U.esc(U.fmtSec(r.s.medianDwellTier23Sec)) + '</td><td class="num">' + U.fmtPctPlain(r.s.fastLookShare, 0) + '</td><td class="num">' + r.s.nSlips + '</td><td class="num">' + r.s.score + ' ' + U.ragChip(r.s.rag) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (pairs ? pairsTable(pairs) : '') + '<p class="muted small">Use for coaching and control review, not automatic discipline. Opening this view was recorded in the activity log.</p><button class="btn small" data-act="close-individual">Close the named view</button>';
  }

  /* Which teams Operational Risk should follow up this week: the answer, not just the top score. */
  function followTile(teams) {
    var rep = teams.filter(function (t) { return t.reportable; }).sort(function (a, b) { return b.score - a.score; });
    var flagged = rep.filter(function (t) { return t.rag !== 'green'; });
    var html = !flagged.length
      ? tile('Teams needing follow-up', 'None', rep[0] ? 'Highest score ' + rep[0].score + ' (' + rep[0].team + '), green' : '', 'green')
      : tile('Teams needing follow-up', flagged.map(function (t) { return t.team.replace('Citi Approvers ', 'Team '); }).join(', '),
        flagged.map(function (t) { return t.team + ': score ' + t.score + ', ' + t.rag; }).join('. ') + '. Review in the monthly report.', flagged[0].rag);
    return html.replace('<div class="tile">', '<div class="tile" id="r08-followup">');
  }

  /* Wipro's service manager sees the provider's own results only: never Citi's approver teams or anyone by name. */
  function vendorView(vendor) {
    var V = PCAP.views.value;
    return '<div class="page-head"><h1>Outsourced provider view</h1>' + PCAP.views.nowLine('analytics', 'vendor') + '</div>' +
      (V ? V.strip('vendor') : '') + providerCard(vendor, store.reviewerPairs()) +
      '<div class="banner privacy">' + U.icon('shield') + '<span><strong>Provider level only.</strong> You see your own team\'s results as a whole. You do not see Citi\'s approver analytics, and nothing here names a person. Citi monitors the service, and Wipro manages its own staff.</span></div>' +
      '<div class="card"><div class="card-head"><h2>What PCAP asks of your staff</h2></div><ul class="lines-list">' +
      '<li>Makers: one review screen before each payment is submitted. PCAP fills in the next unpaid line of the loan schedule and remembers the checker and approver.</li>' +
      '<li>Checkers: nothing extra on most payments. A payment PCAP stops never reaches them, and one that becomes stopped can only be returned or referred to Operational Risk with a reason.</li>' +
      '<li>What your team gets back: a plain sentence that says what each payment will really do before anyone signs, and a record that shows the check was done.</li></ul></div>';
  }
  /* Concentrated checker pairs at the provider, as a count only. */
  function checkerPairsLine(pairs) {
    var n = pairs.pairs.filter(function (p) { return p.role === 'checker'; }).length;
    return '<p class="small">Concentrated checker pairs this week (one checker on ' + Math.round(E.DEFAULT_CONFIG.pairShare * 100) + '% or more of one maker\'s payments, at least ' + E.DEFAULT_CONFIG.pairMinReviews + '): <strong>' + n + '</strong>. Counted for the provider, never by name.</p>';
  }

  function providerTable(vendor) {
    return '<div class="table-wrap"><table class="table"><thead><tr><th>Provider</th><th class="num">Payments keyed</th><th class="num">Stopped when keyed</th><th class="num">Checks done</th><th class="num">Returned by the checker</th><th class="num">Stopped payments referred to Op Risk</th></tr></thead><tbody>' +
      vendor.map(function (v) { return '<tr><td>' + U.esc(v.team) + '</td><td class="num">' + v.keyed + '</td><td class="num">' + v.keyedTier3 + '</td><td class="num">' + v.checked + '</td><td class="num">' + v.returned + '</td><td class="num">' + v.referred + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function providerCard(vendor, pairs) {
    return '<div class="card" id="provider-card"><div class="card-head"><h2>Outsourced provider: makers and checkers</h2><span class="muted small">Monitoring the outsourced service at provider level</span></div>' +
      (vendor.length ? providerTable(vendor) : '<p class="empty">No outsourced keying or checks yet.</p>') + checkerPairsLine(pairs) +
      '<p class="muted small">All time in this browser. A stopped payment cannot be passed on, so your staff return it or refer it to Operational Risk. Both are counted for the provider as a whole in the monthly provider review.</p></div>';
  }

  function tile(label, value, sub, rag) { return PCAP.views.register.tile(label, value, sub, rag); }
  function kv(k, v) { return '<div class="kv"><span class="k">' + U.esc(k) + '</span><span class="v">' + U.esc(v) + '</span></div>'; }

  views.analytics = { render: render, teamSummaries: teamSummaries, currentSamples: currentSamples, outsourcedTeams: outsourcedTeams };
})(typeof globalThis !== 'undefined' ? globalThis : this);
