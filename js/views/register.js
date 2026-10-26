/*
 * PCAP prototype: M1 Workaround and Legacy Constraint Register.
 * List, add, review (owner attestation), approve, retire, plus override-usage mining.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store;
  var views = PCAP.views = PCAP.views || {};

  function st() { return store.st(); }

  function ageText(since) {
    if (!since) return 'n/a';
    var days = E.daysBetween(since, store.today());
    if (days < 60) return days + ' days';
    var years = days / 365.25;
    return years < 1 ? Math.round(days / 30.4) + ' months' : (Math.round(years * 10) / 10) + ' years';
  }

  function reviewCell(r) {
    if (r.status !== 'Active') return '<span class="muted">n/a</span>';
    if (!r.nextReview) return '<span class="muted">none set</span>';
    var d = E.daysBetween(store.today(), r.nextReview);
    var txt = U.fmtDate(r.nextReview);
    if (d < 0) return U.esc(txt) + '<br>' + U.ragChip(-d > 30 ? 'red' : 'amber', 'Overdue ' + (-d) + ' days');
    if (d <= 30) return U.esc(txt) + '<br>' + U.ragChip('amber', 'Due in ' + d + ' days');
    return U.esc(txt) + '<br>' + U.ragChip('green', 'On time');
  }

  function dispensationCell(r) {
    if (r.status !== 'Active' || !r.dispensationUntil) return '<span class="muted">n/a</span>';
    var d = E.daysBetween(store.today(), r.dispensationUntil);
    var txt = U.fmtDate(r.dispensationUntil);
    if (d < 0) return U.esc(txt) + '<br>' + U.ragChip('red', 'Expired');
    if (d <= 30) return U.esc(txt) + '<br>' + U.ragChip('amber', 'Expires in ' + d + ' days');
    return U.esc(txt) + '<br>' + U.ragChip('green', 'In date');
  }

  function statusCell(r) {
    var cls = r.status === 'Active' ? 'st-done' : r.status === 'Proposed' ? 'st-wait' : 'st-rej';
    return '<span class="chip status ' + cls + '">' + U.esc(r.status) + '</span>';
  }

  function usageMining() {
    var evs = st().events.filter(function (e) { return e.type === 'OVERRIDE_USE'; });
    var byCode = {};
    evs.forEach(function (e) {
      var code = (e.data && e.data.code) || 'undeclared';
      var b = byCode[code] = byCode[code] || { code: code, uses: 0, mapped: 0, unmapped: 0 };
      b.uses += 1;
      if (e.data && e.data.mapped) b.mapped += 1; else b.unmapped += 1;
    });
    var releasedUnregistered = st().payments.filter(function (p) { return p.status === 'RELEASED' && p.overrideUsedAtRelease && !p.overrideValidAtRelease; }).length;
    var total = evs.length, mapped = evs.filter(function (e) { return e.data && e.data.mapped; }).length;
    return { rows: Object.keys(byCode).sort().map(function (k) { return byCode[k]; }), total: total, mapped: mapped, share: total ? mapped / total : null, releasedUnregistered: releasedUnregistered };
  }

  function render(el) {
    var reg = st().ctx.register;
    var role = st().role;
    var isOwner = role === 'owner';
    var active = reg.filter(function (r) { return r.status === 'Active'; });
    var overdue = active.filter(function (r) { return r.nextReview && r.nextReview < store.today(); });
    var expiring = active.filter(function (r) { return r.dispensationUntil && E.daysBetween(store.today(), r.dispensationUntil) <= 30; });
    var mining = usageMining();
    var users = st().ctx.users;

    var tiles = '<div class="tiles">' +
      tile('Active workarounds', String(active.length), reg.filter(function (r) { return r.status === 'Proposed'; }).length + ' proposed, ' + reg.filter(function (r) { return r.status === 'Retired'; }).length + ' retired') +
      tile('Reviews overdue', String(overdue.length), overdue.map(function (r) { return r.id; }).join(', ') || 'None', overdue.length ? 'amber' : 'green') +
      tile('Allowed-until date ending soon', String(expiring.length), expiring.map(function (r) { return r.id; }).join(', ') || 'None within 30 days', expiring.length ? 'amber' : 'green') +
      tile('Workaround uses that were on the list', mining.share == null ? 'n/a' : U.fmtPctPlain(mining.share, 0), mining.mapped + ' of ' + mining.total + ' uses seen at payment time', mining.share == null || mining.share === 1 ? 'green' : 'amber') +
      '</div>';

    /* The owner's to-do list: each item says what is due and has the one button that deals with it, so nobody hunts through the table. */
    var proposed = reg.filter(function (r) { return r.status === 'Proposed'; });
    var todo = [];
    overdue.forEach(function (r) {
      todo.push('<li><span class="nd-what"><strong>' + U.esc(r.id) + ' review is ' + E.daysBetween(r.nextReview, store.today()) + ' days overdue.</strong> ' + U.esc(r.title) + '.</span>' +
        '<button class="btn small primary" data-act="review" data-id="' + r.id + '"' + (isOwner ? '' : ' disabled title="Owner only"') + '>Mark reviewed</button></li>');
    });
    proposed.forEach(function (r) {
      todo.push('<li><span class="nd-what"><strong>' + U.esc(r.id) + ' is proposed and waiting for you.</strong> Until you approve it, PCAP stops any payment that uses it.</span>' +
        '<button class="btn small primary" data-act="approve" data-id="' + r.id + '"' + (isOwner ? '' : ' disabled title="Owner only"') + '>Approve</button></li>');
    });
    expiring.forEach(function (r) {
      var d = E.daysBetween(store.today(), r.dispensationUntil);
      todo.push('<li><span class="nd-what"><strong>' + U.esc(r.id) + ' ' + U.term('dispensation', 'dispensation') + (d < 0 ? ' expired ' + (-d) + ' days ago.' : ' ends in ' + d + ' days.') + '</strong> Renew it through change control with a refresh date, or retire the workaround. After it ends, PCAP stops every payment that uses it.</span>' +
        '<button class="btn small" data-act="goto" data-id="' + r.id + '">See ' + U.esc(r.id) + '</button></li>');
    });
    var uid = store.roleUserId('owner');
    var owned = store.riskAcceptances().filter(function (x) { return x.acceptance.ownerId === uid; });
    var needs = '<div class="card needs" id="owner-todo"><div class="card-head"><h2>' + (isOwner ? 'Needs you' : 'Needs the owner') + '</h2><span class="muted small">' + (todo.length ? todo.length + ' item' + (todo.length === 1 ? '' : 's') : 'Nothing due') + '</span></div>' +
      (todo.length ? '<ul class="needs-list">' + todo.join('') + '</ul>' : '<p class="empty">Nothing is due. Every active workaround is reviewed and in date.</p>') +
      '<h3 id="owner-acceptances">Risk sign-offs you own (stopped payments released anyway)</h3>' +
      (owned.length ? '<ul class="needs-list">' + owned.map(function (x) {
        var a = x.acceptance;
        return '<li><span class="nd-what"><strong>' + U.esc(a.id) + ' for ' + U.esc(a.paymentId) + '</strong>, recorded by ' + U.esc(store.userName(a.recordedById)) + ': ' + U.esc(a.category) + '. This payment only, ends ' + U.esc(U.fmtDate(a.expires)) + '. Follow-up: ' + U.say(String(a.followUp || '').replace(/\.\s*$/, '')) + '. ' +
          (a.review ? 'Internal Audit: ' + (a.review.outcome === 'finding' ? 'finding raised.' : 'no issue.') : 'Internal Audit has not reviewed it yet.') + '</span>' +
          '<a href="#" class="btn small" data-open-payment="' + U.esc(a.paymentId) + '">Evidence</a></li>';
      }).join('') + '</ul>' : '<p class="empty">None. When Operational Risk releases a stopped payment, it names you as the manager who owns the risk and it shows here.</p>') + '</div>';

    var tableBody = '<p class="muted small">' + (isOwner ? 'You are the owner: you can review, approve and retire entries.' : 'Only the Head of Loan Ops can review, approve or retire entries. Pick that role in the You are menu.') + '</p>' +
      '<div class="table-wrap"><table class="table reg"><thead><tr><th>ID</th><th>Workaround and why it exists</th><th>Must be set</th><th>Owner</th><th>In use for</th><th>Next review</th><th>Allowed until</th><th>Status</th><th></th></tr></thead><tbody>' +
      reg.map(function (r) {
        var owner = E.byId(users, r.ownerId);
        var acts = '';
        if (r.status === 'Active') acts += '<button class="btn small" data-act="review" data-id="' + r.id + '"' + (isOwner ? '' : ' disabled title="Owner only"') + '>Mark reviewed</button>';
        if (r.status === 'Proposed') acts += '<button class="btn small primary" data-act="approve" data-id="' + r.id + '"' + (isOwner ? '' : ' disabled title="Owner only"') + '>Approve</button>';
        if (r.status !== 'Retired') acts += '<button class="btn small ghost" data-act="retire" data-id="' + r.id + '"' + (isOwner ? '' : ' disabled title="Owner only"') + '>Retire</button>';
        return '<tr id="reg-' + r.id + '" class="' + (r.status === 'Retired' ? 'retired' : '') + '"><td><strong>' + U.esc(r.id) + '</strong>' + (r.onDesk ? '<div class="small muted">used on payment desk</div>' : '') + '</td>' +
          '<td><div class="reg-title">' + U.esc(r.title) + '</div><div class="small muted">Constraint: ' + U.esc(r.constraint) + '</div><div class="small">Workaround: ' + U.esc(r.workaround) + '</div>' + (r.refreshPlan ? '<div class="small muted">Refresh plan: ' + U.esc(r.refreshPlan) + '</div>' : '') + '</td>' +
          '<td>' + (r.requiredFields || []).map(function (f) { return '<span class="chip field">' + U.esc(f) + '</span>'; }).join(' ') + '<div class="small muted">set to ' + U.esc(r.requiredValue === 'WASH' ? 'wash account' : r.requiredValue) + '</div></td>' +
          '<td>' + U.esc(owner ? owner.name : 'Unassigned') + '<div class="small muted">' + U.esc(owner ? owner.title : '') + '</div></td>' +
          '<td>' + U.esc(ageText(r.inUseSince)) + '<div class="small muted">since ' + U.esc(U.fmtDate(r.inUseSince)) + '</div></td>' +
          '<td>' + reviewCell(r) + '</td><td>' + dispensationCell(r) + '</td><td>' + statusCell(r) + '</td><td class="actions">' + acts + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted small">Before a payment leaves, PCAP checks this list. A workaround that is not here, or is only half set up, stops the payment. ' + U.codeTag('R-03, R-04') + '</p>';
    var table = U.fold('The workaround list', reg.length + ' entries, ' + active.length + ' active. Who owns each, when it is next reviewed and when it must end.', tableBody, { id: 'reg-table' });

    var ops = Object.keys(E.OPERATIONS).map(function (k) { return '<option value="' + k + '">' + U.esc(E.OPERATIONS[k].label) + '</option>'; }).join('');
    var add = '<div class="card"><details class="add-form"' + (st().ui && st().ui.registerAddOpen ? ' open' : '') + '><summary><h2>Add a workaround</h2><span class="muted small">' + (isOwner ? 'Added as Active because you are the owner.' : 'Added as Proposed until the owner approves it. Until then PCAP stops any payment that uses it.') + '</span></summary>' +
      '<form id="wa-form" class="form-grid">' +
      '<label class="span2"><span>Title</span><input name="title" required placeholder="e.g. Partial principal hold for exiting lenders"></label>' +
      '<label class="span2"><span>Legacy constraint</span><input name="constraint" required placeholder="What the core system cannot do"></label>' +
      '<label class="span2"><span>Workaround</span><input name="workaround" required placeholder="What staff do instead"></label>' +
      '<fieldset class="span2"><legend>Required fields (must be set to the wash account)</legend>' + E.OVERRIDE_FIELDS.map(function (f) { return '<label class="check"><input type="checkbox" name="rf" value="' + f + '" checked> ' + f + '</label>'; }).join('') + '</fieldset>' +
      '<label><span>Applies to operation</span><select name="appliesTo"><option value="">None (another process)</option>' + ops + '</select></label>' +
      '<label><span>Owner</span><select name="ownerId">' + users.filter(function (u) { return u.inHouse && (u.roles || []).indexOf('board') < 0; }).map(function (u) { return '<option value="' + u.id + '"' + (u.id === 'U-HLO' ? ' selected' : '') + '>' + U.esc(u.name + ', ' + u.title) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Review every (days)</span><input name="reviewDays" type="number" min="30" max="365" value="180"></label>' +
      '<label><span>Dispensation until</span><input name="dispensationUntil" type="date" value="' + E.addDays(store.today(), 365) + '"></label>' +
      '<label class="span2"><span>Refresh plan</span><input name="refreshPlan" placeholder="How and when the core system will remove the need"></label>' +
      '<div class="form-actions span2"><button class="btn primary" type="submit">Add to register</button></div></form></details></div>';

    var mine = U.fold('Workaround use seen at payment time', 'Every workaround code PCAP saw, matched to this list', (
      mining.rows.length ? '<table class="table"><thead><tr><th>Workaround code</th><th class="num">Uses</th><th class="num">On the list</th><th class="num">Not on the list</th></tr></thead><tbody>' +
        mining.rows.map(function (r) { return '<tr><td class="mono">' + U.esc(r.code) + '</td><td class="num">' + r.uses + '</td><td class="num">' + r.mapped + '</td><td class="num">' + (r.unmapped ? '<strong>' + r.unmapped + '</strong>' : '0') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">No overrides used yet.</p>') +
      '<p class="small">Payments released with a workaround not on the list (target zero): <strong>' + mining.releasedUnregistered + '</strong></p>');

    var ownerTodo = overdue.length + proposed.length + expiring.length;
    el.innerHTML = '<div class="page-head"><h1>Workarounds ' + U.moduleChip('M1') + '</h1>' + PCAP.views.nowLine('register', role, { n: ownerTodo }) + '</div>' +
      (PCAP.views.value && isOwner ? PCAP.views.value.strip('owner') : '') + needs + tiles + table + add + mine;

    el.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (b && !b.disabled) {
        var id = b.getAttribute('data-id');
        var actor = store.roleUserId(st().role);
        var act = b.getAttribute('data-act');
        if (act === 'goto') { var tb = document.getElementById('reg-table'); if (tb) tb.open = true; var row = document.getElementById('reg-' + id); if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('is-flash'); setTimeout(function () { row.classList.remove('is-flash'); }, 1600); } return; }
        if (act === 'review') { store.reviewWorkaround(id, actor); U.toast(id + ' reviewed. Owner attestation logged.', 'ok'); }
        if (act === 'approve') { store.approveWorkaround(id, actor); U.toast(id + ' approved and active.', 'ok'); }
        if (act === 'retire') {
          if (!window.confirm('Retire ' + id + '? Payments that use it will be blocked by R-03.')) return;
          store.retireWorkaround(id, actor);
          U.toast(id + ' retired.', 'ok');
        }
        PCAP.app.render();
        return;
      }
      var sum = e.target.closest('summary');
      if (sum) { st().ui = st().ui || {}; st().ui.registerAddOpen = !sum.parentNode.open; }
    };
    el.onsubmit = function (e) {
      if (e.target.id !== 'wa-form') return;
      e.preventDefault();
      var f = e.target.elements;
      var rf = Array.prototype.slice.call(e.target.querySelectorAll('input[name="rf"]:checked')).map(function (x) { return x.value; });
      if (!rf.length) { U.toast('Pick at least one required field.', 'bad'); return; }
      var entry = store.addWorkaround({
        title: f.title.value.trim(), constraint: f.constraint.value.trim(), workaround: f.workaround.value.trim(),
        requiredFields: rf, requiredValue: 'WASH', appliesTo: f.appliesTo.value ? [f.appliesTo.value] : [],
        ownerId: f.ownerId.value, reviewDays: +f.reviewDays.value || 180, dispensationUntil: f.dispensationUntil.value, refreshPlan: f.refreshPlan.value.trim()
      }, store.roleUserId(st().role));
      U.toast(entry.id + ' added as ' + entry.status + '.', 'ok');
      PCAP.app.render();
    };
  }

  function tile(label, value, sub, rag) {
    return '<div class="tile">' + (rag ? '<div class="tile-rag">' + U.ragChip(rag) + '</div>' : '') + '<div class="tile-label">' + U.esc(label) + '</div><div class="tile-value">' + U.esc(value) + '</div><div class="tile-sub">' + U.esc(sub) + '</div></div>';
  }

  views.register = { render: render, tile: tile };
})(typeof globalThis !== 'undefined' ? globalThis : this);
