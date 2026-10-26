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
    var head = '<div class="card"><div class="card-head"><h2>Does it hold for other random draws?</h2><span class="muted small">One seed is one random draw of mistakes. This pools seeds 1 to 50.</span></div>';
    if (!sweep) {
      return head + '<p>The default seed 4234 was fixed before any results were known. To see how much the headline numbers depend on the draw, run the same test for 50 seeds.</p>' +
        '<div class="form-actions"><button class="btn" type="button" data-act="sweep">' + U.icon('play') + ' Run seeds 1 to 50</button></div></div>';
    }
    var a = sweep, c = a.classes;
    function row(k, v) { return '<tr><th>' + U.esc(k) + '</th><td>' + U.esc(v) + '</td></tr>'; }
    return head + '<table class="table"><tbody>' +
      row('Stopped before release, pooled', a.stopped + ' of ' + a.errors + ' (' + pct(a.ratePooled) + '). Per seed: lowest ' + pct(a.rateMin) + ', median ' + pct(a.rateMedian) + ', highest ' + pct(a.rateMax) + '.') +
      row('Big mistakes stopped (Tier 3)', c.T3.stopped + ' of ' + c.T3.count) +
      row('Wrong approver blocked', c.GATE.stopped + ' of ' + c.GATE.count) +
      row('Smaller mistakes stopped (Tier 2)', c.T2.stopped + ' of ' + c.T2.count) +
      row('Tiny slips under USD 500', c.BELOW.stopped + ' of ' + c.BELOW.count + ' stopped before release (they already needed a closer look), ' + c.BELOW.foundAfter + ' found the same day by the reconciliation') +
      row('Missed entirely', String(a.missed)) +
      row('False alarms on correct payments', a.falseAlarms + ' of ' + a.clean + ' (' + pct(a.falseAlarmRate) + '), ' + a.falseAlarmsHeld + ' stopped') +
      row('Revlon replay failures', a.replayFails + ' of ' + a.seeds) +
      '</tbody></table><p class="muted small">The spread in the overall rate comes almost entirely from how many tiny slips a seed happens to draw.</p>' +
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
    var plainLabel = { tier3: 'Big mistakes stopped', overall: 'All planted mistakes stopped before release', fp: 'False alarms on correct payments', time: 'Approver time added when a payment needs a closer look (estimate)' }[t.id] || t.label;
    return '<div class="target"><div class="tg-label">' + U.esc(plainLabel) + '</div><div class="tg-value">' + U.esc(val) + '</div><div class="tg-foot"><span class="small muted">Target ' + U.esc(t.target) + '</span>' + (t.met ? U.ragChip('green', 'Met') : U.ragChip('red', 'Not met')) + '</div></div>';
  }

  function tierCells(t) { return '<td class="num">' + t[1] + '</td><td class="num">' + t[2] + '</td><td class="num">' + t[3] + '</td><td class="num">' + t.gate + '</td>'; }

  function measured() {
    var live = st().m4.current.filter(function (s) { return s.live && s.tier >= 2; });
    return { n: live.length, median: E.median(live.map(function (s) { return s.dwellSec; })) };
  }

  function render(el) {
    if (!last) run();
    var r = last, s = r.summary;
    var classes = { T3: 'Big (Tier 3)', GATE: 'Wrong approver', T2: 'Smaller (Tier 2)', BELOW: 'Tiny slip' };
    var meas = measured();

    var controls = '<form class="card synth-controls" id="synth-form"><div class="form-grid four">' +
      '<label><span>Seed</span><input name="seed" value="' + U.esc(params.seed) + '"></label>' +
      '<label><span>Payments</span><input name="n" type="number" min="50" max="5000" step="50" value="' + params.n + '"></label>' +
      '<label><span>Injected errors (%)</span><input name="errorPct" type="number" min="1" max="20" step="1" value="' + params.errorPct + '"></label>' +
      '<label><span>Stale schedule lines on clean payments (%)</span><input name="stalePct" type="number" min="0" max="10" step="0.5" value="' + params.stalePct + '"></label>' +
      '</div><div class="form-actions"><button class="btn primary" type="submit">' + U.icon('play') + ' Run synthetic test</button><button class="btn" type="button" data-act="download">' + U.icon('download') + ' Download results (JSON)</button>' +
      '<span class="muted small">Run ' + U.esc(String(r.summary.seed)) + ' fingerprint <span class="mono">' + U.esc(r.fingerprint) + '</span>. The same seed always gives the same batch and the same numbers.</span></div></form>';

    var targets = '<div class="card"><div class="card-head"><h2>Did PCAP meet our targets? ' + U.codeTag('report 5.8') + '</h2><span class="muted small">' + s.n + ' made-up payments, ' + s.errorCount + ' with a planted mistake, ' + s.cleanCount + ' correct (' + s.staleCount + ' read an out-of-date schedule line), business days ' + U.esc(U.fmtDate(r.window.from)) + ' to ' + U.esc(U.fmtDate(r.window.to)) + '</span></div>' +
      '<div class="targets">' + s.targets.map(metChip).join('') + '</div>' +
      '<div class="tiles">' +
      tile('Stopped before release', s.detection.stoppedBeforeRelease + ' of ' + s.errorCount, pct(s.detection.rateBeforeRelease) + ' of planted mistakes') +
      tile('Found later the same day', String(s.detection.foundAfterRelease), 'released, then caught by the same-day reconciliation') +
      tile('Missed entirely', String(s.detection.missed), 'not stopped and not found the same day', s.detection.missed ? 'red' : 'green') +
      tile('False alarms', s.falseAlarms.count + ' of ' + s.cleanCount, pct(s.falseAlarms.rate) + (s.falseAlarms.heldAtTier3 ? ', ' + s.falseAlarms.heldAtTier3 + ' stopped' : ', none stopped')) +
      tile('Approver time added', U.fmtSec(s.time.medianTier23Sec), 'when a payment needs a closer look. Routine ' + U.fmtSec(s.time.medianTier1Sec) + '. Average over all ' + U.fmtSec(s.time.meanAllSec) + '. Model estimate.') +
      tile('Wait for Op Risk', s.time.medianHoldMin == null ? 'n/a' : s.time.medianHoldMin + ' min', 'on a stopped payment, median, model estimate') +
      '</div>' +
      '<p class="muted small">Correct workaround payments that get a closer look by policy, with no rule firing: ' + s.policyTier2Clean + '. These are not counted as false alarms but they do add time. Measured in this browser so far: ' + (meas.n ? meas.n + ' closer-look reviews, median ' + U.fmtSec(meas.median) + ' on screen.' : 'none yet.') + '</p></div>';

    var replay = r.replay;
    var replayCard = '<div class="card replay ' + (replay.pass ? 'pass' : 'fail') + '"><div class="card-head"><h2>The 2020 payment as a test</h2>' + (replay.pass ? U.ragChip('green', 'Pass') : U.ragChip('red', 'Fail')) + '</div>' +
      '<p>Passes only if PCAP stops the 2020 payment and shows the approver the principal that would leave. <span class="code-tag">' + U.esc(E.REPLAY.passRule) + '</span></p>' +
      '<div class="replay-row"><div>' + U.tierBadge(replay.tier, { big: true }) + '</div><div><span class="code-tag">Rules fired: ' + replay.hits.map(function (h) { return U.ruleChip(h, 'fire'); }).join(' ') + '</span><div class="small muted">The approver types USD 7,820,000 of interest: ' + U.esc({ fire: 'it does not match, twice, so PCAP stops it', pass: 'it matches', retry: 'it does not match' }[replay.rekey] || replay.rekey) + '.</div></div></div>' +
      '<div class="statement st-tier-3"><div class="st-label">' + U.moduleChip('M2') + ' What the approver sees</div>' + replay.statement.map(function (x, i) { return '<p class="' + (i === 0 ? 'st-lead' : '') + '">' + U.emphasise(x) + '</p>'; }).join('') + '</div></div>';

    var byType = U.fold('Each kind of mistake', 'What PCAP did with each kind of planted mistake, through the same rules as Payments', '<div class="table-wrap"><table class="table"><thead><tr><th>Planted mistake</th><th>Size</th><th class="num">Count</th><th class="num">Stopped before release</th><th class="num">Found same day</th><th class="num">Missed</th><th class="code-col">Rules that fired</th><th class="num">Routine</th><th class="num">Closer look</th><th class="num">Stopped</th><th class="num">Wrong approver</th></tr></thead><tbody>' +
      r.byType.map(function (t) {
        return '<tr><td>' + U.esc(t.label) + '</td><td>' + U.esc(classes[t.cls]) + '</td><td class="num">' + t.count + '</td><td class="num">' + t.stopped + '</td><td class="num">' + t.foundAfter + '</td><td class="num">' + (t.missed ? '<strong class="bad-text">' + t.missed + '</strong>' : '0') + '</td><td class="code-col">' +
          Object.keys(t.rules).sort().map(function (k) { return k === 'GATE' ? '<span class="chip gate gate-closed small">gate x' + t.rules[k] + '</span>' : U.ruleChip(k, 'fire') + '<span class="small muted">x' + t.rules[k] + '</span>'; }).join(' ') + '</td>' + tierCells(t.tiers) + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted small">Routine, Closer look and Stopped are what PCAP decided after the approver typed their own figure. Wrong approver means PCAP blocked someone not allowed to approve. A slip under USD 500 is inside the tolerance by design, so it goes through as routine and the same-day reconciliation finds it. ' + U.codeTag('T1, T2, T3, M3 gate, R-01') + '</p>');

    var classItems = r.byClass.filter(function (c) { return c.count; }).map(function (c) {
      var lab = classes[c.cls] || c.label;
      return { label: lab, value: c.rate == null ? 0 : Math.round(c.rate * 100), display: c.stopped + ' of ' + c.count, tip: lab + ': ' + c.stopped + ' of ' + c.count + ' stopped before release.' };
    });
    var classCard = '<div class="card"><div class="card-head"><h2>Stopped before release, by size of mistake</h2><span class="muted small">Percent of each kind</span></div>' + C.hbars({ items: classItems, max: 100, ariaLabel: 'Share stopped before release by size of mistake', labelWidth: 150 }) +
      '<table class="table"><thead><tr><th>Payments</th><th class="num">Routine</th><th class="num">Closer look</th><th class="num">Stopped</th><th class="num">Wrong approver</th></tr></thead><tbody>' +
      '<tr><td>Correct (' + s.cleanCount + ')</td>' + tierCells(s.tiers.clean) + '</tr><tr><td>With a planted mistake (' + s.errorCount + ')</td>' + tierCells(s.tiers.error) + '</tr></tbody></table></div>';

    var cov = '<div class="card code-tag"><div class="card-head"><h2>Rule coverage</h2><span class="muted small">Each rule has at least one test case</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Rule</th><th>Fired on errors</th><th>Fired on clean payments</th><th>Test cases</th></tr></thead><tbody>' +
      r.coverage.map(function (c) {
        var onErr = c.rule === 'R-08' ? (c.teamsFlagged.length ? c.teamsFlagged.join(', ') : 'no team flagged') : c.rule === 'R-09' ? c.reconBreaks + ' reconciliation breaks (' + c.rag + ')' : String(c.onErrors);
        var onClean = c.rule === 'R-08' || c.rule === 'R-09' ? (c.rule === 'R-09' ? String(c.onClean) : 'n/a') : String(c.onClean);
        return '<tr><td>' + U.ruleChip(c.rule) + ' ' + U.esc(c.name) + '</td><td>' + U.esc(onErr) + '</td><td>' + U.esc(onClean) + '</td><td class="small">' + U.esc(c.targetedBy.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    var fa = '<div class="card"><div class="card-head"><h2>False alarms</h2><span class="muted small">Correct payments where PCAP raised a flag</span></div>' +
      (r.falseAlarmRecords.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Payment</th><th>Why</th><th class="code-col">Rules</th><th>PCAP found</th><th>Outcome</th></tr></thead><tbody>' +
        r.falseAlarmRecords.map(function (x) { return '<tr><td class="mono">' + U.esc(x.id) + '</td><td>' + (x.stale ? 'Out-of-date schedule line' : 'Other') + '</td><td class="code-col">' + x.fired.map(function (k) { return U.ruleChip(k, 'fire'); }).join(' ') + '</td><td>' + U.tierBadge(x.finalTier, { noLabel: true }) + '</td><td class="small">' + U.esc(x.outcome === 'RELEASED' ? 'Released after the approver\'s figure matched' : x.outcome) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">None.</p>') +
      '<p class="muted small">PCAP is only as good as the loan schedules it reads, so an out-of-date schedule line shows up as a difference. ' + U.codeTag('report 5.9, limitation one') + '</p></div>';

    var r08 = U.fold('Rubber-stamp score on the made-up approvers', 'One made-up team (Citi Approvers TPA) is given careless habits', '<div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th class="num">Closer-look reviews</th><th class="num">Quick looks</th><th class="num">Wrong first figures</th><th class="num">Quick approvals after a warning</th><th class="num">Score</th></tr></thead><tbody>' +
      r.r08.map(function (t) { return '<tr><td>' + U.esc(t.team) + '</td><td class="num">' + t.nTier23 + '</td><td class="num">' + U.fmtPctPlain(t.fastLookShare, 0) + '</td><td class="num">' + t.nSlips + '</td><td class="num">' + U.fmtPctPlain(t.fastApproveShare, 0) + '</td><td class="num">' + t.score + ' ' + U.ragChip(t.rag) + '</td></tr>'; }).join('') + '</tbody></table></div>');

    var errs = '<div class="card"><details><summary><h2>All ' + r.errorRecords.length + ' planted mistakes</h2><span class="muted small">Open to see each one</span></summary><div class="table-wrap"><table class="table"><thead><tr><th>Payment</th><th>Mistake</th><th>Detail</th><th class="code-col">Rules</th><th>PCAP found</th><th>Outcome</th></tr></thead><tbody>' +
      r.errorRecords.map(function (x) {
        var t = E.ERROR_TYPES.filter(function (y) { return y.id === x.error; })[0];
        var out = { GATE_BLOCK: 'Wrong approver blocked', HELD_REJECTED: 'Stopped, rejected by Op Risk', HELD_RELEASED: 'Stopped, released by Op Risk', RELEASED: Math.abs(x.reconBreak) >= 0.01 ? 'Released, found same day: ' + E.fmtUSD(x.reconBreak) : 'Released' }[x.outcome];
        return '<tr><td class="mono">' + U.esc(x.id) + '</td><td>' + U.esc(t ? t.label : x.error) + '</td><td class="small">' + U.esc(x.variant || '') + '</td><td class="code-col">' + x.fired.map(function (k) { return U.ruleChip(k, 'fire'); }).join(' ') + (x.gateOpen ? '' : ' <span class="chip gate gate-closed small">gate</span>') + '</td><td>' + (x.gateOpen ? U.tierBadge(x.finalTier, { noLabel: true }) : '') + '</td><td class="small">' + U.esc(out) + '</td></tr>';
      }).join('') + '</tbody></table></div></details></div>';

    var assumptions = U.fold('Assumptions behind these numbers', 'How the made-up payments and approver times were generated', '<ul class="lines-list">' + r.assumptions.map(function (a) { return '<li>' + U.esc(a) + '</li>'; }).join('') +
      '<li>Approver time model (seconds): normal teams read a routine payment in 5 to 15, a closer-look payment in 10 to 30, type their own figure in 15 to 40, confirm in 3 to 8, retry in 20 to 40. The careless team reads in 1 to 6.</li>' +
      '<li>Made-up tests only show that PCAP catches mistakes we imagined. The next real one may look different. A timed walk-through with volunteer approvers is still needed for added time.</li></ul>');

    el.innerHTML = '<div class="page-head"><h1>Test results ' + U.codeTag('report 5.8') + '</h1>' + PCAP.views.nowLine('synthetic', st().role) + '</div>' +
      targets + '<div class="grid-2">' + replayCard + classCard + '</div>' + fa + byType + sweepCard() + cov + r08 + assumptions + errs +
      U.fold('Run it again with other settings', 'Seed ' + params.seed + ', ' + params.n + ' payments, ' + params.errorPct + '% planted mistakes', controls.replace('<form class="card synth-controls"', '<form class="synth-controls"'));

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
