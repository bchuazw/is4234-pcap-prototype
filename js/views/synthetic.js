/*
 * PCAP prototype: synthetic test from report section 5.8.
 * Generates a seeded batch (default 500 payments, about 5% injected errors), runs every payment
 * through the real engine and reports detection, false alarms and estimated added time.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store, C = PCAP.charts;
  var views = PCAP.views = PCAP.views || {};
  var last = null;
  var sweep = null;
  var params = { seed: 4234, n: 500, errorPct: 5, stalePct: 1 };

  function sweepCard() {
    var head = '<div class="card"><div class="card-head"><h2>Robustness across seeds</h2><span class="muted small">One seed is one draw of errors. This pools seeds 1 to 50 with the settings above.</span></div>';
    if (!sweep) {
      return head + '<p>The default seed 4234 was fixed before any results were known. To see how much the headline numbers depend on the draw, run the same test for 50 seeds.</p>' +
        '<div class="form-actions"><button class="btn" type="button" data-act="sweep">' + U.icon('play') + ' Run seeds 1 to 50</button></div></div>';
    }
    var a = sweep, c = a.classes;
    function row(k, v) { return '<tr><th>' + U.esc(k) + '</th><td>' + U.esc(v) + '</td></tr>'; }
    return head + '<table class="table"><tbody>' +
      row('Stopped before release, pooled', a.stopped + ' of ' + a.errors + ' (' + pct(a.ratePooled) + '). Per seed: lowest ' + pct(a.rateMin) + ', median ' + pct(a.rateMedian) + ', highest ' + pct(a.rateMax) + '.') +
      row('Tier 3 errors stopped', c.T3.stopped + ' of ' + c.T3.count) +
      row('M3 gate errors stopped', c.GATE.stopped + ' of ' + c.GATE.count) +
      row('Tier 2 errors stopped', c.T2.stopped + ' of ' + c.T2.count) +
      row('Below-tolerance slips', c.BELOW.stopped + ' of ' + c.BELOW.count + ' stopped before release (they were already Tier 2), ' + c.BELOW.foundAfter + ' found the same day by M5') +
      row('Missed entirely', String(a.missed)) +
      row('False alarms on clean payments', a.falseAlarms + ' of ' + a.clean + ' (' + pct(a.falseAlarmRate) + '), ' + a.falseAlarmsHeld + ' held at Tier 3') +
      row('Revlon replay failures', a.replayFails + ' of ' + a.seeds) +
      '</tbody></table><p class="muted small">The spread in the overall rate comes almost entirely from how many below-tolerance slips a seed happens to draw.</p>' +
      '<div class="form-actions"><button class="btn small" type="button" data-act="sweep">Run again</button></div></div>';
  }

  function st() { return store.st(); }

  function run() {
    last = E.runSyntheticTest({ seed: params.seed, n: params.n, errorRate: params.errorPct / 100, staleRate: params.stalePct / 100 });
    return last;
  }

  function pct(x) { return x == null ? 'n/a' : U.fmtPctPlain(x, 1); }

  function metChip(t) {
    var val = t.id === 'time' ? (t.value == null ? 'n/a' : U.fmtSec(t.value)) : pct(t.value);
    return '<div class="target"><div class="tg-label">' + U.esc(t.label) + '</div><div class="tg-value">' + U.esc(val) + '</div><div class="tg-foot"><span class="small muted">Target ' + U.esc(t.target) + '</span>' + (t.met ? U.ragChip('green', 'Met') : U.ragChip('red', 'Not met')) + '</div></div>';
  }

  function tierCells(t) { return '<td class="num">' + t[1] + '</td><td class="num">' + t[2] + '</td><td class="num">' + t[3] + '</td><td class="num">' + t.gate + '</td>'; }

  function measured() {
    var live = st().m4.current.filter(function (s) { return s.live && s.tier >= 2; });
    return { n: live.length, median: E.median(live.map(function (s) { return s.dwellSec; })) };
  }

  function render(el) {
    if (!last) run();
    var r = last, s = r.summary;
    var classes = { T3: 'Tier 3', GATE: 'M3 gate', T2: 'Tier 2', BELOW: 'Below tolerance' };
    var meas = measured();

    var controls = '<form class="card synth-controls" id="synth-form"><div class="form-grid four">' +
      '<label><span>Seed</span><input name="seed" value="' + U.esc(params.seed) + '"></label>' +
      '<label><span>Payments</span><input name="n" type="number" min="50" max="5000" step="50" value="' + params.n + '"></label>' +
      '<label><span>Injected errors (%)</span><input name="errorPct" type="number" min="1" max="20" step="1" value="' + params.errorPct + '"></label>' +
      '<label><span>Stale schedule lines on clean payments (%)</span><input name="stalePct" type="number" min="0" max="10" step="0.5" value="' + params.stalePct + '"></label>' +
      '</div><div class="form-actions"><button class="btn primary" type="submit">' + U.icon('play') + ' Run synthetic test</button><button class="btn" type="button" data-act="download">' + U.icon('download') + ' Download results (JSON)</button>' +
      '<span class="muted small">Run ' + U.esc(String(r.summary.seed)) + ' fingerprint <span class="mono">' + U.esc(r.fingerprint) + '</span>. The same seed always gives the same batch and the same numbers.</span></div></form>';

    var targets = '<div class="card"><div class="card-head"><h2>Results against the 5.8 targets</h2><span class="muted small">' + s.n + ' synthetic payments, ' + s.errorCount + ' injected errors, ' + s.cleanCount + ' clean (' + s.staleCount + ' read a stale schedule line), business days ' + U.esc(U.fmtDate(r.window.from)) + ' to ' + U.esc(U.fmtDate(r.window.to)) + '</span></div>' +
      '<div class="targets">' + s.targets.map(metChip).join('') + '</div>' +
      '<div class="tiles">' +
      tile('Stopped before release', s.detection.stoppedBeforeRelease + ' of ' + s.errorCount, pct(s.detection.rateBeforeRelease) + ' of injected errors') +
      tile('Found the same day by M5 reconciliation', String(s.detection.foundAfterRelease), 'released, then caught as a reconciliation break') +
      tile('Missed entirely', String(s.detection.missed), 'not stopped and not found by M5', s.detection.missed ? 'red' : 'green') +
      tile('False alarms on clean payments', s.falseAlarms.count + ' of ' + s.cleanCount, pct(s.falseAlarms.rate) + ', all rules' + (s.falseAlarms.heldAtTier3 ? ', ' + s.falseAlarms.heldAtTier3 + ' held at Tier 3' : ', none held at Tier 3')) +
      tile('Median added approver time, Tiers 2 and 3', U.fmtSec(s.time.medianTier23Sec), 'Tier 1 ' + U.fmtSec(s.time.medianTier1Sec) + '. Mean over all payments ' + U.fmtSec(s.time.meanAllSec) + '. Model estimate.') +
      tile('Median Tier 3 hold with Operational Risk', s.time.medianHoldMin == null ? 'n/a' : s.time.medianHoldMin + ' min', 'second-line review time, model estimate') +
      '</div>' +
      '<p class="muted small">Clean override payments routed to Tier 2 by policy, with no rule firing: ' + s.policyTier2Clean + '. These are not counted as false alarms but they do add time. Measured in this browser so far: ' + (meas.n ? meas.n + ' Tier 2 or 3 reviews, median ' + U.fmtSec(meas.median) + ' on the consequence screen.' : 'no Tier 2 or 3 reviews yet.') + '</p></div>';

    var replay = r.replay;
    var replayCard = '<div class="card replay ' + (replay.pass ? 'pass' : 'fail') + '"><div class="card-head"><h2>Revlon replay as a test case</h2>' + (replay.pass ? U.ragChip('green', 'Pass') : U.ragChip('red', 'Fail')) + '</div>' +
      '<p>' + U.esc(E.REPLAY.passRule) + '</p>' +
      '<div class="replay-row"><div>' + U.tierBadge(replay.tier, { big: true }) + '</div><div>Rules fired: ' + replay.hits.map(function (h) { return U.ruleChip(h, 'fire'); }).join(' ') + '<div class="small muted">' + U.esc(replay.detail) + '. Blind re-key of USD 7,820,000: ' + U.esc(replay.rekey) + '.</div></div></div>' +
      '<div class="statement st-tier-3"><div class="st-label">' + U.moduleChip('M2') + ' What the approver sees</div>' + replay.statement.map(function (x, i) { return '<p class="' + (i === 0 ? 'st-lead' : '') + '">' + U.emphasise(x) + '</p>'; }).join('') + '</div></div>';

    var byType = '<div class="card"><div class="card-head"><h2>Detection by error type</h2><span class="muted small">Every payment ran through the real rules in js/engine.js</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Injected error</th><th>Class</th><th class="num">Count</th><th class="num">Stopped before release</th><th class="num">Found by M5</th><th class="num">Missed</th><th>Rules that fired</th><th class="num">T1</th><th class="num">T2</th><th class="num">T3</th><th class="num">Gate</th></tr></thead><tbody>' +
      r.byType.map(function (t) {
        return '<tr><td>' + U.esc(t.label) + '</td><td>' + U.esc(classes[t.cls]) + '</td><td class="num">' + t.count + '</td><td class="num">' + t.stopped + '</td><td class="num">' + t.foundAfter + '</td><td class="num">' + (t.missed ? '<strong class="bad-text">' + t.missed + '</strong>' : '0') + '</td><td>' +
          Object.keys(t.rules).sort().map(function (k) { return k === 'GATE' ? '<span class="chip gate gate-closed small">gate x' + t.rules[k] + '</span>' : U.ruleChip(k, 'fire') + '<span class="small muted">x' + t.rules[k] + '</span>'; }).join(' ') + '</td>' + tierCells(t.tiers) + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted small">T1, T2 and T3 are the final tiers after the blind re-key. Gate means the M3 gate blocked the approver. "Amount slip under USD 500" sits inside the R-01 tolerance by design, so it is released at Tier 1 unless the payment was already Tier 2, and the same-day reconciliation finds it.</p></div>';

    var classItems = r.byClass.filter(function (c) { return c.count; }).map(function (c) {
      return { label: c.label, value: c.rate == null ? 0 : Math.round(c.rate * 100), display: c.stopped + ' of ' + c.count + ' (' + pct(c.rate) + ')', tip: c.label + ': ' + c.stopped + ' of ' + c.count + ' stopped before release. ' + c.note };
    });
    var classCard = '<div class="card"><div class="card-head"><h2>Stopped before release, by class</h2><span class="muted small">Percent of each class</span></div>' + C.hbars({ items: classItems, max: 100, ariaLabel: 'Share stopped before release by error class', labelWidth: 150 }) +
      '<table class="table"><thead><tr><th>Payments</th><th class="num">Tier 1</th><th class="num">Tier 2</th><th class="num">Tier 3</th><th class="num">Gate</th></tr></thead><tbody>' +
      '<tr><td>Clean (' + s.cleanCount + ')</td>' + tierCells(s.tiers.clean) + '</tr><tr><td>With an injected error (' + s.errorCount + ')</td>' + tierCells(s.tiers.error) + '</tr></tbody></table></div>';

    var cov = '<div class="card"><div class="card-head"><h2>Rule coverage</h2><span class="muted small">Each rule has at least one test case</span></div><table class="table"><thead><tr><th>Rule</th><th>Fired on errors</th><th>Fired on clean payments</th><th>Test cases</th></tr></thead><tbody>' +
      r.coverage.map(function (c) {
        var onErr = c.rule === 'R-08' ? (c.teamsFlagged.length ? c.teamsFlagged.join(', ') : 'no team flagged') : c.rule === 'R-09' ? c.reconBreaks + ' reconciliation breaks (' + c.rag + ')' : String(c.onErrors);
        var onClean = c.rule === 'R-08' || c.rule === 'R-09' ? (c.rule === 'R-09' ? String(c.onClean) : 'n/a') : String(c.onClean);
        return '<tr><td>' + U.ruleChip(c.rule) + ' ' + U.esc(c.name) + '</td><td>' + U.esc(onErr) + '</td><td>' + U.esc(onClean) + '</td><td class="small">' + U.esc(c.targetedBy.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var fa = '<div class="card"><div class="card-head"><h2>False alarms</h2><span class="muted small">Clean payments where a rule fired</span></div>' +
      (r.falseAlarmRecords.length ? '<table class="table"><thead><tr><th>Payment</th><th>Why</th><th>Rules</th><th>Final tier</th><th>Outcome</th></tr></thead><tbody>' +
        r.falseAlarmRecords.map(function (x) { return '<tr><td class="mono">' + U.esc(x.id) + '</td><td>' + (x.stale ? 'Stale schedule line' : 'Other') + '</td><td>' + x.fired.map(function (k) { return U.ruleChip(k, 'fire'); }).join(' ') + '</td><td>' + U.tierBadge(x.finalTier, { noLabel: true }) + '</td><td class="small">' + U.esc(x.outcome === 'RELEASED' ? 'Released after the blind re-key matched' : x.outcome) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">None.</p>') +
      '<p class="muted small">PCAP is only as good as the loan schedules it reads, so every stale schedule line shows up as a variance. That is limitation one in report 5.9.</p></div>';

    var r08 = '<div class="card"><div class="card-head"><h2>R-08 on the simulated approvers</h2><span class="muted small">Citi Approvers TPA is given rubber-stamp behaviour</span></div><table class="table"><thead><tr><th>Team</th><th class="num">Tier 2 and 3 reviews</th><th class="num">Fast looks</th><th class="num">Slips</th><th class="num">Fast Tier 2 approvals</th><th class="num">Score</th></tr></thead><tbody>' +
      r.r08.map(function (t) { return '<tr><td>' + U.esc(t.team) + '</td><td class="num">' + t.nTier23 + '</td><td class="num">' + U.fmtPctPlain(t.fastLookShare, 0) + '</td><td class="num">' + t.nSlips + '</td><td class="num">' + U.fmtPctPlain(t.fastApproveShare, 0) + '</td><td class="num">' + t.score + ' ' + U.ragChip(t.rag) + '</td></tr>'; }).join('') + '</tbody></table></div>';

    var errs = '<div class="card"><details><summary><h2>All ' + r.errorRecords.length + ' injected errors</h2><span class="muted small">Open to see each one</span></summary><div class="table-wrap"><table class="table"><thead><tr><th>Payment</th><th>Error</th><th>Detail</th><th>Rules</th><th>Final tier</th><th>Outcome</th></tr></thead><tbody>' +
      r.errorRecords.map(function (x) {
        var t = E.ERROR_TYPES.filter(function (y) { return y.id === x.error; })[0];
        var out = { GATE_BLOCK: 'Blocked at M3 gate', HELD_REJECTED: 'Held, rejected by Op Risk', HELD_RELEASED: 'Held, released by Op Risk', RELEASED: Math.abs(x.reconBreak) >= 0.01 ? 'Released, M5 break ' + E.fmtUSD(x.reconBreak) : 'Released' }[x.outcome];
        return '<tr><td class="mono">' + U.esc(x.id) + '</td><td>' + U.esc(t ? t.label : x.error) + '</td><td class="small">' + U.esc(x.variant || '') + '</td><td>' + x.fired.map(function (k) { return U.ruleChip(k, 'fire'); }).join(' ') + (x.gateOpen ? '' : ' <span class="chip gate gate-closed small">gate</span>') + '</td><td>' + (x.gateOpen ? U.tierBadge(x.finalTier, { noLabel: true }) : '') + '</td><td class="small">' + U.esc(out) + '</td></tr>';
      }).join('') + '</tbody></table></div></details></div>';

    var assumptions = '<div class="card notes"><h2>Assumptions behind these numbers</h2><ul>' + r.assumptions.map(function (a) { return '<li>' + U.esc(a) + '</li>'; }).join('') +
      '<li>Approver time model (seconds): normal teams read Tier 1 in 5 to 15, Tier 2 and 3 in 10 to 30, re-key in 15 to 40, confirm in 3 to 8, retry in 20 to 40. The rubber-stamp team reads in 1 to 6.</li>' +
      '<li>Synthetic tests only show that PCAP catches errors we imagined. The next real error may look different. A timed walk-through with volunteer approvers is still needed for added time.</li></ul></div>';

    el.innerHTML = '<div class="page-head"><h1>Synthetic test (report 5.8)</h1><p class="lede">A seeded batch of synthetic payments with injected errors, run through the same engine as the payment desk. The numbers are shown as they come out, whether or not they meet the targets.</p></div>' +
      controls + targets + sweepCard() + '<div class="grid-2">' + replayCard + classCard + '</div>' + byType + '<div class="grid-2">' + cov + fa + '</div>' + '<div class="grid-2">' + r08 + assumptions + '</div>' + errs;

    el.onsubmit = function (e) {
      if (e.target.id !== 'synth-form') return;
      e.preventDefault();
      var f = e.target.elements;
      var seedRaw = f.seed.value.trim();
      params.seed = /^\d+$/.test(seedRaw) ? +seedRaw : (seedRaw || 4234);
      params.n = Math.max(50, Math.min(5000, Math.round(+f.n.value || 500)));
      params.errorPct = Math.max(1, Math.min(20, +f.errorPct.value || 5));
      params.stalePct = Math.max(0, Math.min(10, +f.stalePct.value));
      var t0 = performance.now();
      sweep = null;
      var res = run();
      store.recordSyntheticRun(res, store.roleUserId(st().role));
      U.toast('Ran ' + res.summary.n + ' payments in ' + Math.round(performance.now() - t0) + ' ms.', 'ok');
      PCAP.app.render();
    };
    el.onclick = function (e) {
      var sw = e.target.closest('[data-act="sweep"]');
      if (sw) {
        if (sw.disabled) return;
        /* A few seeds per task, so the page keeps painting and the button shows progress. */
        var t1 = performance.now();
        var run = E.createSeedSweep({ from: 1, to: 50, n: params.n, errorRate: params.errorPct / 100, staleRate: params.stalePct / 100 });
        sw.disabled = true;
        var chunk = function () {
          var t2 = performance.now();
          while (!run.done() && performance.now() - t2 < 40) run.step();
          if (!run.done()) {
            sw.textContent = 'Running seed ' + run.seed() + ' of ' + run.to;
            setTimeout(chunk, 0);
            return;
          }
          sweep = run.finish();
          U.toast('Ran ' + sweep.seeds + ' seeds in ' + Math.round(performance.now() - t1) + ' ms.', 'ok');
          PCAP.app.render();
        };
        setTimeout(chunk, 0);
        return;
      }
      var b = e.target.closest('[data-act="download"]');
      if (!b) return;
      var out = { notice: 'Synthetic test results from the PCAP prototype. Synthetic data only.', params: params, fingerprint: last.fingerprint, summary: last.summary, byType: last.byType, byClass: last.byClass, coverage: last.coverage, r08: last.r08, replay: last.replay, errorRecords: last.errorRecords, falseAlarmRecords: last.falseAlarmRecords, assumptions: last.assumptions, seedSweep: sweep };
      U.download('pcap-synthetic-test-seed-' + params.seed + '.json', JSON.stringify(out, null, 2), 'application/json');
    };
  }

  function tile(label, value, sub, rag) { return PCAP.views.register.tile(label, value, sub, rag); }

  views.synthetic = { render: render, run: run };
})(typeof globalThis !== 'undefined' ? globalThis : this);
