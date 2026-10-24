/*
 * PCAP prototype: app shell. Hash router, role switcher, reset, payment detail dialog.
 * Classic script, loaded last.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store, charts = PCAP.charts, DATA = PCAP.data;
  PCAP.views = PCAP.views || {};

  var ROUTES = [
    { id: 'guide', label: 'How to demo', mods: [] },
    { id: 'desk', label: 'Payment desk', mods: ['M2', 'M3'] },
    { id: 'register', label: 'Register', mods: ['M1'] },
    { id: 'analytics', label: 'Behaviour analytics', mods: ['M4'] },
    { id: 'monitor', label: 'Control monitor', mods: ['M5'] },
    { id: 'oversight', label: 'Obligations and Board', mods: ['M6'] },
    { id: 'synthetic', label: 'Synthetic test', mods: [] },
    { id: 'events', label: 'Event log', mods: [] }
  ];

  var timers = [];
  function addTimer(t) { timers.push(t); }
  function clearTimers() { timers.forEach(function (t) { clearInterval(t); }); timers = []; }

  function currentRoute() {
    var h = (root.location.hash || '').replace(/^#\/?/, '');
    var id = h.split('?')[0] || 'guide';
    return ROUTES.some(function (r) { return r.id === id; }) ? id : 'guide';
  }

  function go(id) {
    if (currentRoute() === id) render();
    else root.location.hash = '#/' + id;
  }

  function renderTabs() {
    var cur = currentRoute();
    document.getElementById('tabs').innerHTML = ROUTES.map(function (r) {
      var mods = r.mods.length ? ' title="' + U.esc('Modules ' + r.mods.join(' and ')) + '"' : '';
      return '<a href="#/' + r.id + '" class="tab' + (r.id === cur ? ' active' : '') + '"' + (r.id === cur ? ' aria-current="page"' : '') + mods + '>' +
        '<span>' + U.esc(r.label) + '</span>' + (r.mods.length ? '<span class="tab-mods" aria-hidden="true">' + U.esc(r.mods.join(' ')) + '</span>' : '') + '</a>';
    }).join('');
  }

  /* ------------------------------------------------------------ theme (dark by default, light for projectors) */
  var THEME_ICON = {
    sun: '<svg class="ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    moon: '<svg class="ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M13.2 10.1A5.6 5.6 0 015.9 2.8a5.6 5.6 0 107.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  };
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function paintThemeButton() {
    var btn = document.getElementById('theme-btn');
    if (!btn) return;
    var light = currentTheme() === 'light';
    btn.querySelector('.theme-ico').innerHTML = light ? THEME_ICON.moon : THEME_ICON.sun;
    btn.querySelector('.theme-label').textContent = light ? 'Dark' : 'Light';
    btn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    btn.setAttribute('title', light ? 'Switch to the dark theme' : 'Switch to the light theme (for projectors)');
  }
  function setTheme(t) {
    var html = document.documentElement;
    var fade = !(PCAP.motion && PCAP.motion.reduced());
    if (fade) html.classList.add('theme-fade');
    html.setAttribute('data-theme', t);
    try { root.localStorage.setItem('pcap-theme', t); } catch (e) { /* storage blocked: the choice lasts until reload */ }
    paintThemeButton();
    if (fade) setTimeout(function () { html.classList.remove('theme-fade'); }, 320);
  }

  function renderHeader() {
    var st = store.st();
    var sel = document.getElementById('role-select');
    sel.innerHTML = DATA.roles.map(function (r) { return '<option value="' + r.id + '"' + (r.id === st.role ? ' selected' : '') + '>' + U.esc(r.label) + '</option>'; }).join('');
    var u = store.user(store.roleUserId(st.role));
    var who = st.role === 'approver' ? 'Acts as each payment\'s assigned approver' : u ? u.name + ', ' + u.title : '';
    document.getElementById('persona').textContent = who;
    document.getElementById('bizdate').textContent = 'Business date ' + U.fmtDate(st.businessDate);
  }

  function renderBanner() {
    var st = store.st();
    var parts = [];
    if (!store.S.storageOk) parts.push('<div class="banner warn">' + U.icon('warn') + '<span>Browser storage is not available, so changes last only until you reload this page. Everything else works.</span></div>');
    if (st.businessDate !== U.localDate()) parts.push('<div class="banner info">' + U.icon('info') + '<span>Demo data was created for ' + U.esc(U.fmtDate(st.businessDate)) + '. Press <strong>Reset demo data</strong> to move it to today.</span></div>');
    document.getElementById('banner').innerHTML = parts.join('');
  }

  function render() {
    if (PCAP.motion) PCAP.motion.before();
    clearTimers();
    charts.reset();
    charts.hideTip();
    renderTabs();
    renderHeader();
    renderBanner();
    var id = currentRoute();
    document.body.setAttribute('data-route', id);
    var view = PCAP.views[id];
    var main = document.getElementById('app');
    main.onclick = null; main.oninput = null; main.onchange = null; main.onsubmit = null; main.onkeydown = null;
    if (!view) { main.innerHTML = '<div class="card"><p>Screen not found.</p></div>'; return; }
    try {
      view.render(main);
    } catch (err) {
      main.innerHTML = '<div class="card"><h2>Something went wrong on this screen</h2><pre class="err">' + U.esc(err && err.stack || String(err)) + '</pre><p>Try <strong>Reset demo data</strong>.</p></div>';
      reportError(err);
    }
    document.title = (ROUTES.filter(function (r) { return r.id === id; })[0] || {}).label + ' | PCAP Prototype';
    if (PCAP.motion) PCAP.motion.after(id);
  }

  function setRole(role, routeId) {
    store.setRole(role);
    if (routeId) go(routeId);
    else render();
  }

  function reportError(err) {
    var list = root.__pcapErrors = root.__pcapErrors || [];
    list.push(String(err && err.message || err));
    document.body.setAttribute('data-js-errors', String(list.length));
    var b = document.getElementById('error-banner');
    if (b) { b.hidden = false; b.textContent = 'JavaScript error: ' + list[list.length - 1]; }
  }

  /* ------------------------------------------------------------ payment detail dialog */
  function paymentTimeline(id) {
    var evs = store.st().events.filter(function (e) { return e.paymentId === id; });
    if (!evs.length) return '<p class="muted">No events yet.</p>';
    return '<ol class="timeline">' + evs.map(function (e) {
      return '<li class="tl-' + U.esc(e.result) + '"><div class="tl-head"><span class="tl-time">' + U.esc(U.fmtShortDateTime(e.ts)) + '</span>' +
        '<span class="tl-type">' + U.esc(e.type.replace(/_/g, ' ').toLowerCase()) + '</span>' +
        (e.module ? U.moduleChip(e.module) : '') + (e.rule ? U.ruleChip(e.rule, e.result) : '') + (e.obligations || []).map(U.obligationChip).join('') +
        '<span class="tl-actor">' + U.esc(store.userName(e.actorId)) + '</span></div><div class="tl-detail">' + U.esc(e.detail) + '</div></li>';
    }).join('') + '</ol>';
  }

  function openPayment(id) {
    var p = store.payment(id);
    if (!p) return;
    var dlg = document.getElementById('detail-dialog');
    var body = document.getElementById('detail-body');
    var i = p.instr;
    var ln = store.loan(i.loanId) || {};
    body.innerHTML =
      '<div class="dlg-head"><h2>' + U.esc(p.id) + ' <span class="muted">' + U.esc(ln.name || i.loanId) + '</span></h2>' + U.statusChip(p.status) + '</div>' +
      '<div class="kv-grid">' +
      kv('Operation', E.OPERATIONS[i.operation] ? E.OPERATIONS[i.operation].label : i.operation) +
      kv('Value date', U.fmtDate(i.valueDate)) +
      kv('Interest keyed', U.fmtUSD(i.interest)) + kv('Principal keyed', U.fmtUSD(i.principal)) +
      kv('Override', i.overrideCode || 'None') + kv('FRONT / FUND / PRINCIPAL', [i.fields.FRONT, i.fields.FUND, i.fields.PRINCIPAL].join(' / ')) +
      kv('Maker', store.userName(i.makerId)) + kv('Checker', store.userName(i.checkerId)) + kv('Approver', store.userName(i.approverId)) +
      kv('Tier at submission', p.atSubmit ? 'Tier ' + p.atSubmit.tier : '') +
      (p.releasedAt ? kv('Released', U.fmtUSD(p.releasedExternal) + ' at ' + U.fmtShortDateTime(p.releasedAt) + (p.viaOpRisk ? ' by Operational Risk' : '')) : '') +
      '</div>' +
      (p.atSubmit ? '<div class="statement mini">' + p.atSubmit.statement.map(function (s) { return '<p>' + U.emphasise(s) + '</p>'; }).join('') + '</div>' : '') +
      '<h3>Evidence trail (event log)</h3>' + paymentTimeline(id);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function kv(k, v) { return '<div class="kv"><span class="k">' + U.esc(k) + '</span><span class="v">' + U.esc(v) + '</span></div>'; }

  /* ------------------------------------------------------------ boot */
  function boot() {
    try {
      store.init();
    } catch (err) {
      reportError(err);
      store.reset();
    }
    charts.bind();
    paintThemeButton();
    document.getElementById('theme-btn').addEventListener('click', function () { setTheme(currentTheme() === 'light' ? 'dark' : 'light'); });
    document.getElementById('role-select').addEventListener('change', function (e) { setRole(e.target.value, currentRoute() === 'guide' ? 'desk' : null); });
    document.getElementById('reset-btn').addEventListener('click', function () {
      if (root.confirm('Reset all demo data? This clears payments, events and register changes made in this browser.')) {
        store.reset();
        U.toast('Demo data reset.', 'ok');
        render();
      }
    });
    document.getElementById('detail-close').addEventListener('click', function () {
      var dlg = document.getElementById('detail-dialog');
      if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-open-payment]');
      if (t) { e.preventDefault(); openPayment(t.getAttribute('data-open-payment')); }
    });
    root.addEventListener('hashchange', render);
    render();
    document.body.setAttribute('data-ready', '1');
  }

  PCAP.app = {
    ROUTES: ROUTES,
    render: render,
    go: go,
    setRole: setRole,
    addTimer: addTimer,
    openPayment: openPayment,
    paymentTimeline: paymentTimeline,
    currentRoute: currentRoute,
    reportError: reportError
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
