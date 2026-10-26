/*
 * PCAP prototype: event log. Every control event, tagged with module, rule and obligation.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};
  var filter = { module: '', rule: '', obligation: '', result: '', q: '' };

  function st() { return store.st(); }

  function matches(e) {
    if (filter.module && e.module !== filter.module) return false;
    if (filter.rule && e.rule !== filter.rule) return false;
    if (filter.obligation && (e.obligations || []).indexOf(filter.obligation) < 0) return false;
    if (filter.result && e.result !== filter.result) return false;
    if (filter.q) {
      var q = filter.q.toLowerCase();
      var hay = [e.id, e.paymentId, e.type, e.detail, store.userName(e.actorId)].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function sel(name, opts) {
    return '<label' + (name.code ? ' class="code-col"' : '') + '><span>' + U.esc(name.label) + '</span><select name="' + name.key + '"><option value="">All</option>' +
      opts.map(function (o) { return '<option value="' + U.esc(o[0]) + '"' + (filter[name.key] === o[0] ? ' selected' : '') + '>' + U.esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }

  function rows() {
    var all = st().events.filter(matches).slice().reverse();
    var shown = all.slice(0, 250);
    return { total: all.length, html: shown.map(function (e) {
      return '<tr class="ev-' + U.esc(e.result) + '"><td class="nowrap small">' + U.esc(U.fmtShortDateTime(e.ts)) + '</td><td class="mono small">' + U.esc(e.id) + '</td><td class="small">' + U.esc(PCAP.plain.eventName(e.type)) + '</td><td>' + (e.paymentId ? '<a href="#" data-open-payment="' + U.esc(e.paymentId) + '">' + U.esc(e.paymentId) + '</a>' : '') + '</td><td class="code-col">' + (e.module ? U.moduleChip(e.module) : '') + '</td><td class="code-col">' + (e.rule ? U.ruleChip(e.rule, e.result) : '') + '</td><td class="code-col">' + (e.obligations || []).map(U.obligationChip).join(' ') + '</td><td class="small">' + U.esc(store.userName(e.actorId)) + '</td><td class="small">' + U.say(e.detail) + (e.seeded ? ' <span class="chip tiny">demo data</span>' : '') + '</td></tr>';
    }).join('') };
  }

  function render(el) {
    var obls = st().ctx.obligations.map(function (o) { return [o.id, o.id + ' ' + o.topic]; });
    var r = rows();
    el.innerHTML = '<div class="page-head"><h1>Activity log</h1>' + PCAP.views.nowLine('events', st().role) + '</div>' +
      '<form class="card filters" id="ev-filter"><div class="form-grid five">' +
      '<label><span>Search</span><input name="q" value="' + U.esc(filter.q) + '" placeholder="Payment ID, person or words"></label>' +
      sel({ key: 'result', label: 'Result' }, [['pass', 'Passed'], ['fire', 'Stopped or blocked'], ['retry', 'Asked to try again'], ['info', 'Information']]) +
      sel({ key: 'module', label: 'Module', code: true }, Object.keys(E.MODULES).map(function (m) { return [m, m + ' ' + E.MODULES[m].short]; })) +
      sel({ key: 'rule', label: 'Rule', code: true }, Object.keys(E.RULES).map(function (k) { return [k, k + ' ' + E.RULES[k].name]; })) +
      sel({ key: 'obligation', label: 'Obligation row', code: true }, obls) +
      '</div></form>' +
      '<div class="card"><div class="card-head"><h2><span id="ev-count">' + r.total + '</span> recorded steps</h2><span class="muted small">Newest first, up to 250 shown. Download everything from Board and audit. In a live bank, approvers would not see this screen.</span></div>' +
      '<div class="table-wrap"><table class="table events"><thead><tr><th>Time</th><th>ID</th><th>What happened</th><th>Payment</th><th class="code-col">Module</th><th class="code-col">Rule</th><th class="code-col">Obligations</th><th>Who</th><th>Detail</th></tr></thead><tbody id="ev-rows">' + r.html + '</tbody></table></div></div>';

    function update() {
      var f = document.getElementById('ev-filter').elements;
      Object.keys(filter).forEach(function (k) { if (f[k]) filter[k] = f[k].value; });
      var x = rows();
      document.getElementById('ev-rows').innerHTML = x.html;
      document.getElementById('ev-count').textContent = String(x.total);
    }
    el.onchange = function (e) { if (e.target.form && e.target.form.id === 'ev-filter') update(); };
    el.oninput = function (e) { if (e.target.name === 'q') update(); };
    el.onsubmit = function (e) { e.preventDefault(); };
  }

  views.events = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
