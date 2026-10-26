/*
 * PCAP prototype: what PCAP costs and gives each user, shown from the app's own data.
 *
 * Counted figures come from the tagged event log. Estimates come from the synthetic test model
 * (seed 4234, the run in report 5.8) or from a stated assumption, and are always marked "est."
 * Used by Payments, Workarounds, Approval habits and Board and audit.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  var SEED = 4234;
  var synCache = null;
  /* The synthetic month behind every estimate. 12 ms to run, so it is computed once per page load. */
  function estimate() {
    if (!synCache) synCache = E.valueEstimate(E.runSyntheticTest({ seed: SEED }).summary);
    return synCache;
  }
  function week() { return store.weekSummary(); }

  function pct(x) { return x == null ? 'n/a' : Math.round(x * 100) + '%'; }
  function secs(x) { return x == null ? 'n/a' : Math.round(x) + ' s'; }
  function pl(n, one, many) { return n === 1 ? one : many; }
  function est() { return U.term('estimate', 'est.', 'wk-est'); }

  /* One compact item: a number and a short label, with the longer explanation as its tooltip. */
  function item(value, label, opts) {
    opts = opts || {};
    return '<span class="wk' + (opts.tone ? ' is-' + opts.tone : '') + '"' + (opts.long ? ' title="' + U.esc(opts.long) + '"' : '') + '><b class="wk-v">' + U.esc(value) + '</b> ' +
      '<span class="wk-l">' + U.esc(label) + '</span>' + (opts.est ? ' ' + est() : '') + '</span>';
  }

  var WHO = {
    maker: 'as the maker', checker: 'as the checker', approver: 'as an approver', oprisk: 'as Operational Risk',
    owner: 'as the risk owner', audit: 'as Internal Audit', board: 'for the Board', vendor: 'for Wipro, at provider level'
  };

  function items(role) {
    var w = week(), x = estimate();
    var todo = store.todoCounts(role);
    function todoOn(route) { return todo.items.filter(function (i) { return i.route === route; }).reduce(function (s, i) { return s + i.count; }, 0); }
    var approverReleased = w.releasedByTier[1] + w.releasedByTier[2];
    switch (role) {
      case 'maker':
        return [
          item(String(w.keyed), 'keyed'),
          item(String(w.returned + w.heldRejected), 'sent back to you'),
          item('1', 'review screen per payment, about 5 s', { est: true, long: 'All PCAP adds for a maker: one review screen before you submit. About 5 seconds (estimate).' })
        ];
      case 'checker':
        return [
          item(String(w.checked), 'checked'),
          item(String(w.checkerReturns), 'returned'),
          item(String(w.sentOnTier3), pl(w.sentOnTier3, 'stopped payment sent on', 'stopped payments sent on'), { tone: w.sentOnTier3 ? 'warn' : '', long: 'Checks that sent on a payment PCAP had stopped. Counted for the provider, never by name.' }),
          item('0 s', 'extra unless PCAP stops a payment', { long: 'PCAP asks a checker for nothing extra on most payments. Only when it stops a payment does it ask for a note to send it on.' })
        ];
      case 'approver':
        return [
          item(String(approverReleased), 'released, ' + w.releasedByTier[1] + ' routine with no extra step'),
          item(secs(w.medianDwellTier1), 'median on a routine payment', { long: 'Median time approvers spent on a routine payment this week, measured on this screen.' }),
          item(secs(x.tier23MedianSec), 'added when it needs a closer look', { est: true, long: 'Median approver time added by typing your own figure and confirming, from the synthetic test model.' }),
          item(String(w.holds), pl(w.holds, 'stopped payment sent to Op Risk', 'stopped payments sent to Op Risk'))
        ];
      case 'oprisk':
        return [
          item(String(w.heldRejected + w.heldReleased), pl(w.heldRejected + w.heldReleased, 'stopped payment decided', 'stopped payments decided') + ' (' + w.heldRejected + ' ' + pl(w.heldRejected, 'real error', 'real errors') + ')'),
          item(U.fmtCompact(w.keptBack), 'kept from leaving', { long: 'Money that would have left the bank in error, kept back by holds you confirmed as real errors this week.' }),
          item(w.medianMinutesHeld == null ? 'n/a' : Math.round(w.medianMinutesHeld) + ' min', 'median wait for your decision'),
          item(String(todoOn('monitor')), 'of your daily checks not green', { tone: todoOn('monitor') ? 'warn' : '' })
        ];
      case 'owner': {
        var uid = store.roleUserId('owner');
        var mine = store.riskAcceptances().filter(function (r) { return r.acceptance.ownerId === uid && r.acceptance.expires >= store.today(); }).length;
        return [
          item(String(todoOn('register')), pl(todoOn('register'), 'workaround item needs you', 'workaround items need you'), { tone: todoOn('register') ? 'warn' : '' }),
          item(String(mine), pl(mine, 'risk sign-off you own today', 'risk sign-offs you own today')),
          item(String(w.attestations), 'reviews you signed')
        ];
      }
      case 'audit':
        return [
          item(String(w.events), 'steps recorded, ' + w.paymentsCovered + ' payments', { long: 'Steps PCAP recorded this week, each tagged to its rule and the regulation it serves, covering every payment touched.' }),
          item(String(todoOn('oversight')), pl(todoOn('oversight'), 'sign-off to review', 'sign-offs to review'), { tone: todoOn('oversight') ? 'warn' : '' }),
          item(x.auditManualHoursPerQuarter + ' h', 'of hand sampling a quarter replaced', { est: true, long: 'Assumption: without PCAP, Internal Audit tests about ' + x.assumptions.auditSamplePerQuarter + ' payments a quarter by hand at about ' + x.assumptions.auditMinPerSample + ' minutes each.' })
        ];
      case 'board':
        return [
          item(String(w.heldRejected), pl(w.heldRejected, 'real error held, ', 'real errors held, ') + U.fmtCompact(w.keptBack) + ' kept back'),
          item(pct(x.tier1Share), 'of payments need no extra step', { est: true, long: 'Share of routine payments in the synthetic month (seed ' + SEED + ').' }),
          item(x.approverHoursPerMonth + ' h', 'approver time added a month', { est: true, long: 'Approver time PCAP adds at ' + x.n + ' payments a month, from the synthetic test model.' })
        ];
      case 'vendor':
        return [
          item(String(w.keyed + w.resubmitted), 'keyed by Wipro makers'),
          item(String(w.checked), 'checked by Wipro checkers'),
          item(String(w.sentOnTier3), pl(w.sentOnTier3, 'stopped payment sent on', 'stopped payments sent on'), { tone: w.sentOnTier3 ? 'warn' : '' }),
          item(String(w.checkerReturns), 'returned by a checker')
        ];
    }
    return [];
  }

  /* "This week" strip for the role acting now: one compact line. */
  function strip(role) {
    var list = items(role);
    if (!list.length) return '';
    return '<section class="week" aria-label="This week ' + U.esc(WHO[role] || '') + '">' +
      '<span class="week-tag" title="' + U.esc('This week ' + (WHO[role] || '') + '. Counted from the event log. Items marked est. are estimates.') + '">This week</span>' +
      '<span class="week-items">' + list.join('') + '</span></section>';
  }

  /* What needs this role, per screen, including the Board's red KRIs and the provider's hard stops sent on. */
  function todo(role) {
    var t = store.todoCounts(role);
    var items = t.items.slice();
    if (role === 'board' && views.oversight && views.oversight.kris) {
      var red = views.oversight.kris().filter(function (k) { return k.rag === 'red'; }).length;
      if (red) items.push({ route: 'oversight', count: red, text: red + ' Board number' + (red === 1 ? '' : 's') + ' red' });
    }
    if (role === 'vendor') {
      var n = week().sentOnTier3;
      if (n) items.push({ route: 'analytics', count: n, text: n + ' check' + (n === 1 ? '' : 's') + ' sent on a stopped payment this week' });
    }
    return { role: role, items: items, total: items.reduce(function (s, x) { return s + x.count; }, 0) };
  }

  /* The Board's cost and value card: what PCAP costs each group and what it buys. */
  function boardCard() {
    var x = estimate(), w = week();
    function tile(value, label, sub, isEst) {
      return '<div class="vt"><div class="vt-value">' + U.esc(value) + (isEst ? ' ' + est() : '') + '</div><div class="vt-label">' + U.esc(label) + '</div><div class="vt-sub">' + sub + '</div></div>';
    }
    return '<div class="value-card" id="value"><h3>What PCAP costs and what it buys</h3><div class="vt-grid">' +
      tile(pct(x.tier1Share), 'of payments need no extra step', U.esc(x.tier1 + ' of ' + x.n + ' in the synthetic month are routine. ' + pct(x.cleanShare) + ' are correct, but ' + x.policyTier2Clean + ' correct payments use a workaround and get a closer look by policy.'), true) +
      tile(Math.round(x.meanSec) + ' s', 'approver time added per payment, on average', U.esc('Median ' + Math.round(x.tier1MedianSec) + ' s on a routine payment (reading one sentence) and ' + Math.round(x.tier23MedianSec) + ' s when it needs a closer look. About ' + x.approverHoursPerMonth + ' approver hours a month in all.'), true) +
      tile(x.stoppedBeforeRelease + ' of ' + x.errors, 'planted mistakes stopped before release', U.esc('The other ' + x.foundSameDay + ' were found the same day by the reconciliation, none missed (synthetic test). On Payments this week: ' + w.heldRejected + ' real errors stopped, ' + U.fmtCompact(w.keptBack) + ' kept from leaving.'), false) +
      tile('Every payment', 'has its audit evidence collected automatically', U.esc(w.events + ' steps recorded this week, covering ' + w.paymentsCovered + ' payments. Without PCAP, Internal Audit samples about ' + x.assumptions.auditSamplePerQuarter + ' payments a quarter by hand, about ' + x.auditManualHoursPerQuarter + ' hours (assumption), which covers ' + pct(x.auditManualCoverage) + ' of payments.'), false) +
      '</div><p class="muted small">Costs to each group: approvers about ' + x.approverHoursPerMonth + ' h a month, Operational Risk about ' + x.opRiskHoursPerMonth + ' h a month for ' + x.tier3 + ' stopped payments, makers one review screen per payment, checkers a note only on a stopped payment. ' +
      'Marked ' + est() + ' are estimates from the synthetic test model (seed ' + SEED + ') or a stated assumption, not a timed walk-through with real staff. Counted figures come from the event log.</p></div>';
  }

  views.value = { estimate: estimate, week: week, strip: strip, todo: todo, boardCard: boardCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
