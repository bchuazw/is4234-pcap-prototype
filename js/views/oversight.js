/*
 * PCAP prototype: M6 Obligation Map and Oversight Dashboard.
 * Obligation to control to evidence table with live counts, Board KRIs, evidence pack export.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store, C = PCAP.charts, DATA = PCAP.data;
  var views = PCAP.views = PCAP.views || {};

  function st() { return store.st(); }

  function weekEvents() {
    var ws = st().m4.weekStart;
    return st().events.filter(function (e) { return e.businessDate >= ws; });
  }

  /* ------------------------------------------------------------ KRIs */
  function kris() {
    var s = st();
    var health = store.controlHealth();
    var wk = weekEvents();
    var teams = PCAP.views.analytics.teamSummaries();
    var cur = E.summariseReviews(PCAP.views.analytics.currentSamples());
    var unreg = s.payments.filter(function (p) { return p.status === 'RELEASED' && p.overrideUsedAtRelease && !p.overrideValidAtRelease; }).length;
    var escapes = {};
    s.events.filter(function (e) { return e.type === 'RECON_RUN' && e.data && e.data.escapes; }).forEach(function (e) { e.data.escapes.forEach(function (id) { escapes[id] = 1; }); });
    var holds = wk.filter(function (e) { return e.type === 'HELD'; }).length;
    var rej = wk.filter(function (e) { return e.type === 'OPRISK_REJECTED'; }).length;
    var rel = wk.filter(function (e) { return e.type === 'OPRISK_RELEASED'; }).length;
    var realShare = rej + rel ? rej / (rej + rel) : null;
    var lapsed = health.controls.filter(function (c) { return c.id === 'CC-04'; })[0].lapsed || 0;
    var late = s.reconRuns.filter(function (r) { return r.time > E.DEFAULT_CONFIG.reconCutoff && E.daysBetween(r.date, store.today()) <= 30; }).length;
    var worst = teams.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var m4w = s.m4.weeks;
    var weeks = [];
    m4w.forEach(function (w) { if (weeks.indexOf(w.week) < 0) weeks.push(w.week); });
    weeks.sort();
    var slipHist = weeks.map(function (w) { var r = m4w.filter(function (x) { return x.week === w; }); return E.mean(r.map(function (x) { return x.mismatchRate; })); });
    var worstHist = weeks.map(function (w) { return Math.max.apply(null, m4w.filter(function (x) { return x.week === w; }).map(function (x) { return x.score; })); });
    var k = s.kri;
    function rag3(v, g, a) { return v == null ? 'green' : v <= g ? 'green' : v <= a ? 'amber' : 'red'; }
    return [
      { label: 'Releases on an unregistered workaround', value: String(unreg), target: 'Target 0', rag: unreg ? 'red' : 'green', hist: k.unregisteredReleases.concat([unreg]) },
      { label: 'Escapes: errors found after release', value: String(Object.keys(escapes).length), target: 'Target 0, each root-caused', rag: Object.keys(escapes).length ? 'red' : 'green', hist: k.escapes.concat([Object.keys(escapes).length]) },
      { label: 'Tier 3 holds this week', value: String(holds), target: 'Watch for spikes', rag: rag3(holds, 5, 10), hist: k.tier3Holds.concat([holds]) },
      { label: 'Share of holds that were real errors', value: realShare == null ? 'n/a' : U.fmtPctPlain(realShare, 0), target: 'Green at 50% or more', rag: realShare == null ? 'green' : realShare >= 0.5 ? 'green' : realShare >= 0.25 ? 'amber' : 'red', hist: k.holdsRealShare.concat([realShare == null ? k.holdsRealShare[k.holdsRealShare.length - 1] : realShare]), pct: true },
      { label: 'Re-key slip rate, all teams', value: U.fmtPctPlain(cur.mismatchRate), target: 'Green under 5%', rag: cur.mismatchRate < 0.05 ? 'green' : cur.mismatchRate <= 0.10 ? 'amber' : 'red', hist: slipHist.concat([cur.mismatchRate]), pct: true },
      { label: 'Highest team R-08 score', value: worst ? String(worst.score) : 'n/a', target: worst ? worst.team : '', rag: worst ? worst.rag : 'green', hist: worstHist.concat([worst ? worst.score : 0]) },
      { label: 'Lapsed approver certifications', value: String(lapsed), target: 'Target 0', rag: lapsed === 0 ? 'green' : lapsed <= 2 ? 'amber' : 'red', hist: k.lapsedCerts.concat([lapsed]) },
      { label: 'Late reconciliations, last 30 days', value: String(late), target: 'Target 0', rag: late === 0 ? 'green' : late === 1 ? 'amber' : 'red', hist: k.lateRecons.concat([late]) }
    ];
  }

  /* ------------------------------------------------------------ obligation rows */
  function obligationRows() {
    var s = st();
    var ev = s.events;
    var health = store.controlHealth();
    var hc = {};
    health.controls.forEach(function (c) { hc[c.id] = c; });
    function count(fn) { return ev.filter(fn).length; }
    var released = s.payments.filter(function (p) { return p.status === 'RELEASED'; });
    var overrideRel = released.filter(function (p) { return p.overrideUsedAtRelease; });
    var inHouse = overrideRel.filter(function (p) { var u = store.user(p.viaOpRisk ? p.approverId : p.releasedBy); return u && u.inHouse; }).length;
    var certOk = overrideRel.filter(function (p) { return p.certCurrentAtRelease !== false; }).length;
    var uses = ev.filter(function (e) { return e.type === 'OVERRIDE_USE'; });
    var mapped = uses.filter(function (e) { return e.data && e.data.mapped; }).length;
    var unregRel = overrideRel.filter(function (p) { return !p.overrideValidAtRelease; }).length;
    var reviews180 = count(function (e) { return e.type === 'REGISTER_REVIEWED' && E.daysBetween(e.businessDate, store.today()) <= 180; });
    var reg = s.ctx.register.filter(function (r) { return r.status === 'Active'; });
    var expired = reg.filter(function (r) { return r.dispensationUntil && r.dispensationUntil < store.today(); }).length;
    var expiring = reg.filter(function (r) { return r.dispensationUntil && r.dispensationUntil >= store.today() && E.daysBetween(store.today(), r.dispensationUntil) <= 30; }).length;
    var rekeys = ev.filter(function (e) { return e.type === 'REKEY' && (e.result === 'pass' || e.result === 'fire'); });
    var slips = rekeys.filter(function (e) { return e.data && e.data.kind === 'slip'; }).length;
    var lastTest = s.regressionRuns[s.regressionRuns.length - 1];
    var tests = count(function (e) { return e.type === 'CONTROL_TEST' || e.type === 'RECON_RUN' || e.type === 'SYNTHETIC_TEST'; });
    var overdueTests = health.controls.filter(function (c) { return c.rag !== 'green'; }).length;
    var releasedNoGate = released.filter(function (p) { return !p.viaOpRisk && !ev.some(function (e) { return e.paymentId === p.id && e.rule === 'R-05' && (e.type === 'GATE_CHECK'); }); }).length;

    var live = {
      O1: { text: count(function (e) { return e.type === 'GATE_CHECK' && e.rule === 'R-05'; }) + ' entitlement checks passed, ' + count(function (e) { return e.type === 'BLOCKED_ATTEMPT' && e.rule === 'R-05'; }) + ' blocked attempts on R-05. Releases without a gate check: ' + releasedNoGate + '.', rag: releasedNoGate ? 'red' : 'green' },
      O2: { text: rekeys.length + ' blind re-keys (' + slips + ' slips), ' + count(function (e) { return e.type === 'STATEMENT_SHOWN'; }) + ' consequence statements shown, ' + count(function (e) { return e.type === 'HELD'; }) + ' Tier 3 hard stops.', rag: rekeys.length && slips / rekeys.length > 0.1 ? 'amber' : 'green' },
      O3: { text: (hc['CC-04'].lapsed || 0) + ' lapsed and ' + (hc['CC-04'].expiring || 0) + ' expiring certifications. Override releases by a certified approver: ' + certOk + ' of ' + overrideRel.length + '.', rag: certOk < overrideRel.length ? 'red' : hc['CC-04'].rag },
      O4: { text: (uses.length ? Math.round((100 * mapped) / uses.length) : 100) + '% of override use mapped to a register entry (' + mapped + ' of ' + uses.length + '). Released on an unregistered override: ' + unregRel + '.', rag: unregRel ? 'red' : mapped < uses.length ? 'amber' : 'green' },
      O5: { text: 'Override releases with an in-house approver: ' + inHouse + ' of ' + overrideRel.length + '. Owner attestations in 180 days: ' + reviews180 + '. Every register entry has a named owner.', rag: inHouse < overrideRel.length ? 'red' : hc['CC-02'].rag },
      O6: { text: reg.length + ' open dispensations, ' + expired + ' expired, ' + expiring + ' expiring within 30 days.', rag: expired ? 'red' : expiring ? 'amber' : 'green' },
      O7: { text: 'R-09 control health ' + health.overall + '. ' + tests + ' control tests and runs logged. Last replay test ' + (lastTest ? (lastTest.pass ? 'passed' : 'failed') + ' on ' + U.fmtDate(lastTest.date) : 'never run') + '. Controls not green: ' + overdueTests + '.', rag: health.overall }
    };
    return s.ctx.obligations.map(function (o) { return { o: o, live: live[o.id] }; });
  }

  /* ------------------------------------------------------------ evidence pack */
  function buildPack() {
    var s = st();
    var users = s.ctx.users;
    var events = s.events.map(function (e) {
      var u = E.byId(users, e.actorId);
      return {
        event_id: e.id, timestamp: e.ts, business_date: e.businessDate, type: e.type, payment_id: e.paymentId, module: e.module,
        rule: e.rule, obligations: e.obligations, result: e.result, actor_id: e.actorId, actor_name: e.actorId === 'PCAP' ? 'PCAP (system)' : u ? u.name : e.actorId,
        actor_role: e.actorRole, actor_employer: u ? u.employer : (e.actorId === 'PCAP' ? 'system' : ''), detail: e.detail, seeded: e.seeded
      };
    });
    var pack = {
      title: 'PCAP evidence pack (prototype)',
      notice: DATA.notice,
      generated_at: new Date().toISOString(),
      business_date: s.businessDate,
      generated_by: store.userName(store.roleUserId(s.role)),
      obligations: obligationRows().map(function (r) { return { id: r.o.id, source: r.o.source, topic: r.o.topic, risk: r.o.risk, control: r.o.control, modules: r.o.modules, rules: r.o.rules, evidence_it_works: r.o.evidence, live_evidence: r.live.text, status: r.live.rag }; }),
      rules: Object.keys(E.RULES).map(function (k) { var r = E.RULES[k]; return { id: r.id, name: r.name, module: r.module, logic: r.logic, action: r.action, obligations: r.obligations }; }),
      control_health: store.controlHealth(),
      kris: kris().map(function (k) { return { kri: k.label, value: k.value, target: k.target, status: k.rag }; }),
      payments: s.payments.map(function (p) { return { id: p.id, loan: p.loanId, status: p.status, tier_at_submit: p.atSubmit ? p.atSubmit.tier : null, rules_at_submit: p.atSubmit ? p.atSubmit.hits : [], released_external: p.releasedExternal || null, expected_at_release: p.expectedAtRelease || null, released_by: p.releasedBy ? store.userName(p.releasedBy) : null, via_operational_risk: !!p.viaOpRisk }; }),
      events: events
    };
    var cols = ['event_id', 'timestamp', 'business_date', 'type', 'payment_id', 'module', 'rule', 'obligations', 'result', 'actor_id', 'actor_name', 'actor_role', 'actor_employer', 'detail', 'seeded'];
    var csv = cols.join(',') + '\n' + events.map(function (e) {
      return cols.map(function (c) { return U.csvCell(c === 'obligations' ? (e.obligations || []).join('|') : e[c]); }).join(',');
    }).join('\n') + '\n';
    return { json: JSON.stringify(pack, null, 2), csv: csv, count: events.length };
  }

  /* ------------------------------------------------------------ render */
  function render(el) {
    var s = st();
    var k = kris();
    var rows = obligationRows();
    var health = store.controlHealth();
    var byModule = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].map(function (m) {
      var n = s.events.filter(function (e) { return e.module === m; }).length;
      return { label: m + ' ' + E.MODULES[m].short, value: n, display: String(n), tip: m + ' ' + E.MODULES[m].name + ': ' + n + ' events' };
    });
    var byRule = Object.keys(E.RULES).map(function (r) {
      var n = s.events.filter(function (e) { return e.rule === r; }).length;
      var f = s.events.filter(function (e) { return e.rule === r && e.result === 'fire'; }).length;
      return { label: r + ' ' + E.RULES[r].name, value: n, display: n + (f ? ' (' + f + ' fired)' : ''), tip: r + ' ' + E.RULES[r].name + ': ' + n + ' events, ' + f + ' fired or blocked' };
    });

    el.innerHTML = '<div class="page-head"><h1>' + U.moduleChip('M6') + ' Obligation Map and Oversight Dashboard</h1><p class="lede">Every rule result, confirmation, hold and release is stamped with the time, the person and the obligation it serves. That turns "three people approved it" into evidence of what they approved and whether the controls around them worked.</p></div>' +
      '<div class="card"><div class="card-head"><h2>Board Risk Committee view</h2><span class="muted small">Key risk indicators, last 8 weeks. Thresholds reviewed quarterly.</span></div>' +
      '<div class="kri-grid">' + k.map(function (x) {
        return '<div class="kri"><div class="kri-top"><span class="kri-label">' + U.esc(x.label) + '</span>' + U.ragChip(x.rag) + '</div><div class="kri-value">' + U.esc(x.value) + '</div><div class="kri-foot"><span class="small muted">' + U.esc(x.target) + '</span>' + C.sparkline(x.hist) + '</div></div>';
      }).join('') + '</div>' +
      '<p class="muted small">Overall control health (R-09): ' + U.ragChip(health.overall) + '. Earlier weeks are synthetic history. This week is live from the event log.</p></div>' +

      '<div class="card"><div class="card-head"><h2>Obligation, control and evidence map</h2><span class="muted small">Rows from Table 4 of the report. Live evidence is counted from the event log.</span></div><div class="table-wrap"><table class="table obl-table"><thead><tr><th>Row</th><th>Obligation (source)</th><th>Risk</th><th>Control</th><th>Rules</th><th>Evidence it works</th><th>Live evidence now</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var o = r.o;
        return '<tr><td>' + U.obligationChip(o.id) + '</td><td><strong>' + U.esc(o.source) + '</strong><div class="small muted">' + U.esc(o.topic) + '</div></td><td>' + U.esc(o.risk) + '</td><td>' + U.esc(o.control) + '<div>' + o.modules.map(function (m) { return U.moduleChip(m); }).join(' ') + '</div></td><td>' + o.rules.map(function (x) { return U.ruleChip(x); }).join(' ') + '</td><td>' + U.esc(o.evidence) + '</td><td class="small">' + U.esc(r.live.text) + '</td><td>' + U.ragChip(r.live.rag) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted small">Table 4 does not name M4. The prototype maps M4\'s R-08 to rows O2 (re-key mismatch rate) and O5 (monitoring of outsourced staff).</p></div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h2>Evidence events by module</h2><span class="muted small">' + s.events.length + ' events in the log</span></div>' + C.hbars({ items: byModule, ariaLabel: 'Events by module', labelWidth: 190 }) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Evidence events by rule</h2><span class="muted small">Passes and fires both count as evidence</span></div>' + C.hbars({ items: byRule, ariaLabel: 'Events by rule', labelWidth: 210 }) + '</div>' +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="card export"><div class="card-head"><h2>Audit evidence pack</h2></div>' +
      '<p>One file for Internal Audit or a regulator: the obligation map with live status, rule definitions, control health, KRIs, a payment summary and every tagged event. Internal Audit can test every payment instead of a sample.</p>' +
      '<div class="form-actions"><button class="btn primary" data-act="export">' + U.icon('download') + ' Export evidence pack</button>' +
      '<button class="btn small" data-act="export-json">JSON only</button><button class="btn small" data-act="export-csv">CSV only</button></div>' +
      '<p class="muted small">Downloads pcap-evidence-pack-' + s.businessDate + '.json and .csv. The export itself is logged.</p><pre id="export-preview" class="preview" hidden></pre></div>' +
      '<div class="card"><div class="card-head"><h2>Reporting cadence</h2></div><table class="table"><tbody>' +
      '<tr><th>Daily</th><td>Hold list, same-day reconciliation, hard-stop queue cleared, control health (M2, M5)</td></tr>' +
      '<tr><th>Monthly</th><td>Second-line control report: team rubber-stamp scores and re-key slip rates (M4), replay regression test, certification currency, register reviews due (M1, M5)</td></tr>' +
      '<tr><th>Quarterly</th><td>Board KRI pack, threshold review against the false-alarm KRI, dispensation renewals (M6)</td></tr>' +
      '<tr><th>On request</th><td>Evidence pack for Internal Audit and regulators</td></tr></tbody></table></div>' +
      '</div>';

    el.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      var pack = buildPack();
      store.logExport(store.roleUserId(s.role), { events: pack.count, format: act });
      pack = buildPack();
      var base = 'pcap-evidence-pack-' + s.businessDate;
      var ok = true;
      if (act === 'export' || act === 'export-json') ok = U.download(base + '.json', pack.json, 'application/json') && ok;
      if (act === 'export' || act === 'export-csv') {
        if (act === 'export') setTimeout(function () { U.download(base + '.csv', pack.csv, 'text/csv'); }, 400);
        else ok = U.download(base + '.csv', pack.csv, 'text/csv') && ok;
      }
      var pre = document.getElementById('export-preview');
      if (pre) { pre.hidden = false; pre.textContent = pack.csv.split('\n').slice(0, 6).join('\n') + '\n...'; }
      U.toast(ok ? 'Evidence pack exported: ' + pack.count + ' events.' : 'Download blocked by the browser. The preview below shows the first rows.', ok ? 'ok' : 'warn');
    };
  }

  views.oversight = { render: render, buildPack: buildPack, kris: kris, obligationRows: obligationRows };
})(typeof globalThis !== 'undefined' ? globalThis : this);
