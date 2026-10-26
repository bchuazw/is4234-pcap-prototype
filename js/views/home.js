/*
 * PCAP prototype: Home. What PCAP does in one sentence, how it works in three steps, the 2020 case in one
 * glance, and two ways in: the guided tour or "Try it yourself" with practice payments for a chosen role.
 * Replaces the old "How to demo" page. Its marker material now lives on the About page (js/views/about.js).
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var U = PCAP.util, store = PCAP.store, P = PCAP.plain;
  var views = PCAP.views = PCAP.views || {};

  /* 24px line icons, currentColor. */
  function svg(body, cls) {
    return '<svg class="' + (cls || 'hico') + '" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  var ICON = {
    key: svg('<rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 10h1.5M9.5 10H11M13 10h1.5M16.5 10H18M6 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    scale: svg('<path d="M12 4v16M7 20h10M5 7h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 7l-3 6a3 3 0 006 0zM19 7l-3 6a3 3 0 006 0z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    ok: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 12.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    stop: svg('<path d="M8 2.8h8l5.2 5.2v8L16 21.2H8L2.8 16V8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    maker: svg('<path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.6"/>'),
    approver: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    oprisk: svg('<path d="M12 3l8 3v5.5c0 4.6-3.3 8.3-8 9.5-4.7-1.2-8-4.9-8-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8v5M12 16v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    audit: svg('<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 10.5h5M10.5 8v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    arrow: svg('<path d="M4 12h15M14 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 'how-arrow')
  };

  /* The 2020 case as two bars on one scale: what was due against what left. */
  function caseCard() {
    var meant = 7.82, sent = 893.9;
    var w = Math.max(0.9, (meant / sent) * 100);
    return '<figure class="case" role="img" aria-label="The case: Citibank meant to pay USD 7.8M of interest and actually sent USD 894M of principal, about 115 times as much. Three people approved it.">' +
      '<figcaption class="case-label">The case: Citibank, 11 Aug 2020</figcaption>' +
      '<div class="case-row is-meant"><div class="case-top"><span class="case-k">Meant to pay</span><span class="case-v">USD 7.8M</span><span class="case-what">of interest</span></div>' +
      '<div class="case-bar"><span style="width:' + w.toFixed(2) + '%"></span></div></div>' +
      '<div class="case-row is-sent"><div class="case-top"><span class="case-k">Actually sent</span><span class="case-v">USD 894M</span><span class="case-what">of principal</span></div>' +
      '<div class="case-bar"><span style="width:100%"></span></div></div>' +
      '<p class="case-x">About 115 times what was due.</p>' +
      '<p class="case-who"><strong>Three people approved it.</strong> None of their screens showed what it would really do.</p>' +
      '</figure>';
  }

  function howCard() {
    return '<section class="card how" aria-labelledby="how-title"><h2 id="how-title">How it works</h2><ol class="how-steps">' +
      '<li class="how-step"><span class="how-n">1</span>' + ICON.key + '<div><h3>Someone keys a payment</h3><p>In the bank\'s own system, as they do today.</p></div></li>' +
      '<li class="how-sep" aria-hidden="true">' + ICON.arrow + '</li>' +
      '<li class="how-step"><span class="how-n">2</span>' + ICON.scale + '<div><h3>PCAP works out what will really leave</h3><p>It compares that with what the loan schedule says is due, and says it in one sentence.</p></div></li>' +
      '<li class="how-sep" aria-hidden="true">' + ICON.arrow + '</li>' +
      '<li class="how-step how-split"><span class="how-n">3</span><div class="how-outs">' +
      '<div class="how-out is-ok">' + ICON.ok + '<div><h3>Routine goes through</h3><p>The approver reads it and clicks Release. One click.</p></div></div>' +
      '<div class="how-out is-bad">' + ICON.stop + '<div><h3>Unusual is stopped</h3><p>It goes to the right person, with the reason in plain words.</p></div></div>' +
      '</div></li></ol></section>';
  }

  function tryCard() {
    return '<section class="card try" id="try" aria-labelledby="try-title" tabindex="-1"><div class="try-head"><h2 id="try-title">Try it yourself</h2>' +
      '<p>Pick what you do. PCAP puts practice payments in your queue, so there is something to do straight away.</p></div>' +
      '<div class="role-cards">' + P.CARDS.map(function (c) {
        return '<button type="button" class="role-card" data-role-card="' + c.role + '">' + ICON[c.role] +
          '<span class="rc-title">' + U.esc(c.title) + '</span><span class="rc-line">' + U.esc(c.line) + '</span>' +
          '<span class="rc-go">Start as ' + U.esc(P.roleName(c.role)) + ' ' + U.icon('arrow') + '</span></button>';
      }).join('') + '</div></section>';
  }

  function render(el) {
    el.innerHTML = '<div class="home">' +
      '<section class="card home-hero" aria-labelledby="home-title">' +
      '<div class="hh-text"><p class="hero-eyebrow">Payment Control Assurance Platform</p>' +
      '<h1 id="home-title">Know what a payment will really do, <em>before it leaves the bank.</em></h1>' +
      '<p class="hh-lead">PCAP checks every payment before it leaves the bank and tells the approver, in plain words, what it will really do. Routine payments go through in one click. Anything unexpected is stopped and sent to the right person.</p>' +
      '<div class="hero-actions"><button type="button" class="btn primary big" data-home="tour">' + U.icon('play') + ' See how PCAP would have stopped it</button>' +
      '<button type="button" class="btn big" data-home="try">Try it yourself</button></div>' +
      '<p class="hh-note">The tour takes about two minutes. You only press Next.</p></div>' +
      caseCard() + '</section>' +
      howCard() + tryCard() +
      '<p class="home-markers"><a href="#/about">For markers: how this maps to our report ' + U.icon('arrow') + '</a></p>' +
      '</div>';

    el.onclick = function (e) {
      var b = e.target.closest('[data-home], [data-role-card]');
      if (!b) return;
      e.preventDefault();
      if (b.getAttribute('data-home') === 'tour') { PCAP.tour.start(); return; }
      if (b.getAttribute('data-home') === 'try') {
        var t = document.getElementById('try');
        if (t) { t.scrollIntoView({ block: 'start', behavior: PCAP.motion && PCAP.motion.reduced() ? 'auto' : 'smooth' }); t.focus({ preventScroll: true }); }
        return;
      }
      tryRole(b.getAttribute('data-role-card'));
    };
  }

  /* Start as a role with practice work waiting. Fresh demo data first, after asking if the person has their own changes. */
  function tryRole(role) {
    var fresh = !store.hasUserData() || root.confirm('Start again with fresh practice payments? This clears the payments and changes you made in this browser.');
    if (fresh) {
      store.reset();
      store.practice();
    }
    var st = store.st();
    st.ui = st.ui || {};
    st.ui.deskLastRole = null;
    st.ui.deskSel = null;
    st.ui.deskView = 'queue';
    if (role === 'maker' && fresh) {
      /* The maker starts in the form, filled in with the 2020 payment: press Review and see what PCAP says. */
      var d = PCAP.views.desk.PRESETS.revlon();
      st.ui.makerDraft = d;
    }
    store.save();
    var home = (store.roleDef(role) || {}).home || 'desk';
    PCAP.app.setRole(role, home);
    root.scrollTo(0, 0);
    if (fresh) U.toast('Practice payments are ready. Everything is made-up demo data.', 'ok');
  }

  views.home = { render: render, tryRole: tryRole };
})(typeof globalThis !== 'undefined' ? globalThis : this);
